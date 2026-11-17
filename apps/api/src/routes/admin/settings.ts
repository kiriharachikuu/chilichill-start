import type { FastifyInstance } from 'fastify';
import {
  MAIL_SECRET_KEEP,
  QQ_BOT_SECRET_KEEP,
  STORAGE_SECRET_KEEP,
  mailSettingsSchema,
  qqBotSettingsSchema,
  registrationSettingsSchema,
  siteSettingsSchema,
  storageSettingsSchema,
  type QQBotSettings,
  type RegistrationSettings,
  type SiteSettings,
  type StorageSettings,
} from '@spaceport/shared';
import { HttpError } from '../../lib/errors';
import {
  getStoredMailSettings,
  saveStoredMailSettings,
  type StoredMailSettings,
} from '../../services/mail/settings';
import { broadcastQQBotMessage, fetchQQBotGuildChannels, fetchQQBotGuilds } from '../../services/qq-bot/client';
import {
  getStoredQQBotSettings,
  saveStoredQQBotSettings,
  type StoredQQBotSettings,
} from '../../services/qq-bot/settings';
import {
  buildCommentReportNotifyMessage,
  buildSubmissionNotifyMessage,
} from '../../services/qq-bot/notify';
import {
  buildDailyReportMessage,
  rescheduleQQBotDailyReport,
} from '../../services/qq-bot/scheduler';
import { prisma } from '../../prisma';
import { z } from 'zod';
import {
  getStoredRegistrationSettings,
  saveStoredRegistrationSettings,
} from '../../services/registration-settings';
import {
  getStoredSiteSettings,
  saveStoredSiteSettings,
} from '../../services/site-settings';
import {
  getStoredStorageSettings,
  saveStoredStorageSettings,
  type StoredStorageSettings,
} from '../../services/storage';

// 对外输出时用哨兵值替换密钥明文，前端保存时原样带回表示「保留现有值」
function maskSettings(stored: StoredStorageSettings): StorageSettings {
  return {
    mode: stored.mode,
    cos: stored.cos ? { ...stored.cos, secretKey: STORAGE_SECRET_KEEP } : null,
    oss: stored.oss ? { ...stored.oss, accessKeySecret: STORAGE_SECRET_KEEP } : null,
  };
}

export function adminSettingsRoutes(app: FastifyInstance) {
  app.get('/api/admin/settings/storage', { preHandler: [app.requireAdmin] }, async () => {
    const stored = await getStoredStorageSettings();
    return { item: maskSettings(stored) };
  });

  app.put('/api/admin/settings/storage', { preHandler: [app.requireAdmin] }, async (request) => {
    const input = storageSettingsSchema.parse(request.body ?? {});

    const existing = await getStoredStorageSettings();

    // 密钥字段传 __KEEP__ 表示沿用现有值，避免明文在前后端往返
    const resolveSecret = (incoming: string | undefined, current: string, label: string): string => {
      if (incoming === STORAGE_SECRET_KEEP) {
        return current;
      }
      if (!incoming || !incoming.trim()) {
        throw new HttpError(400, 'VALIDATION_ERROR', `${label}不能为空`);
      }
      return incoming.trim();
    };

    let next: StoredStorageSettings;

    if (input.mode === 'cos') {
      const incoming = input.cos;
      if (!incoming) {
        throw new HttpError(400, 'VALIDATION_ERROR', '请填写腾讯云 COS 配置参数');
      }
      const currentCos = existing.cos ?? { secretId: '', secretKey: '', bucket: '', region: '', baseUrl: null };
      next = {
        mode: 'cos',
        cos: {
          secretId: resolveSecret(incoming.secretId, currentCos.secretId, 'SecretId'),
          secretKey: resolveSecret(incoming.secretKey, currentCos.secretKey, 'SecretKey'),
          bucket: incoming.bucket.trim(),
          region: incoming.region.trim(),
          baseUrl: incoming.baseUrl ?? null,
        },
        oss: existing.oss,
      };
    } else if (input.mode === 'oss') {
      const incoming = input.oss;
      if (!incoming) {
        throw new HttpError(400, 'VALIDATION_ERROR', '请填写阿里云 OSS 配置参数');
      }
      const currentOss = existing.oss ?? {
        accessKeyId: '',
        accessKeySecret: '',
        bucket: '',
        region: '',
        endpoint: null,
        baseUrl: null,
      };
      next = {
        mode: 'oss',
        cos: existing.cos,
        oss: {
          accessKeyId: resolveSecret(incoming.accessKeyId, currentOss.accessKeyId, 'AccessKeyId'),
          accessKeySecret: resolveSecret(incoming.accessKeySecret, currentOss.accessKeySecret, 'AccessKeySecret'),
          bucket: incoming.bucket.trim(),
          region: incoming.region.trim(),
          endpoint: incoming.endpoint ?? null,
          baseUrl: incoming.baseUrl ?? null,
        },
      };
    } else {
      next = { mode: 'local', cos: existing.cos, oss: existing.oss };
    }

    // 保存前再校验一次最终密钥完整性，避免首次切云存储时密钥为空
    if (next.mode === 'cos' && (!next.cos?.secretId || !next.cos.secretKey)) {
      throw new HttpError(400, 'VALIDATION_ERROR', '请完整填写腾讯云 COS 的密钥');
    }
    if (next.mode === 'oss' && (!next.oss?.accessKeyId || !next.oss.accessKeySecret)) {
      throw new HttpError(400, 'VALIDATION_ERROR', '请完整填写阿里云 OSS 的密钥');
    }

    const item = await saveStoredStorageSettings(next);
    return { item };
  });

  // ---- 邮件发送设置（数据库优先，环境变量兜底）----

  // 对外输出时用哨兵值替换 API Key 明文，前端保存时原样带回表示「保留现有值」
  function maskMailSettings(stored: StoredMailSettings) {
    return {
      apiKey: stored.apiKey ? MAIL_SECRET_KEEP : '',
      from: stored.from,
      fromName: stored.fromName,
      replyTo: stored.replyTo,
    };
  }

  app.get('/api/admin/settings/mail', { preHandler: [app.requireAdmin] }, async () => {
    const stored = await getStoredMailSettings();
    return { item: maskMailSettings(stored) };
  });

  app.put('/api/admin/settings/mail', { preHandler: [app.requireAdmin] }, async (request) => {
    const input = mailSettingsSchema.parse(request.body ?? {});
    const existing = await getStoredMailSettings();

    // API Key 传 __KEEP__ 表示沿用现有值，避免明文在前后端往返
    const apiKey = input.apiKey === MAIL_SECRET_KEEP ? existing.apiKey : input.apiKey;
    if (!apiKey) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Resend API Key 不能为空');
    }

    const item = await saveStoredMailSettings({
      apiKey,
      from: input.from,
      fromName: input.fromName,
      replyTo: input.replyTo,
    });
    return { item };
  });

  // ---- 注册设置（邮箱验证码开关等）----

  app.get('/api/admin/settings/registration', { preHandler: [app.requireAdmin] }, async () => {
    const item = await getStoredRegistrationSettings();
    return { item };
  });

  app.put('/api/admin/settings/registration', { preHandler: [app.requireAdmin] }, async (request) => {
    const input = registrationSettingsSchema.parse(request.body ?? {});
    const item: RegistrationSettings = await saveStoredRegistrationSettings(input);
    return { item };
  });

  // ---- 站点信息设置（About 页备案号/联系邮箱/赞助支持）----

  app.get('/api/admin/settings/site', { preHandler: [app.requireAdmin] }, async () => {
    const item = await getStoredSiteSettings();
    return { item };
  });

  app.put('/api/admin/settings/site', { preHandler: [app.requireAdmin] }, async (request) => {
    const input = siteSettingsSchema.parse(request.body ?? {});
    const item: SiteSettings = await saveStoredSiteSettings(input);
    return { item };
  });

  // ---- QQ 机器人提醒设置（用户投稿后推送审核提醒）----

  // 对外输出时用哨兵值替换 AppSecret 明文，前端保存时原样带回表示「保留现有值」
  function maskQQBotSettings(stored: StoredQQBotSettings): QQBotSettings {
    return {
      appId: stored.appId,
      appSecret: stored.appSecret ? QQ_BOT_SECRET_KEEP : '',
      groupOpenId: stored.groupOpenId,
      channelId: stored.channelId,
      enabled: stored.enabled,
      notify: stored.notify,
      dailyReportTime: stored.dailyReportTime,
    };
  }

  app.get('/api/admin/settings/qq-bot', { preHandler: [app.requireAdmin] }, async () => {
    const stored = await getStoredQQBotSettings();
    return { item: maskQQBotSettings(stored) };
  });

  app.put('/api/admin/settings/qq-bot', { preHandler: [app.requireAdmin] }, async (request) => {
    const input = qqBotSettingsSchema.parse(request.body ?? {});
    const existing = await getStoredQQBotSettings();

    // AppSecret 传 __KEEP__ 表示沿用现有值，避免明文在前后端往返。
    // QQ 的 AppSecret 为任意字符串（官方算法对其 UTF-8 字节翻倍扩展后取 32 字节作
    // Ed25519 种子），不做格式假设，仅要求非空。
    const appSecret = input.appSecret === QQ_BOT_SECRET_KEEP ? existing.appSecret : input.appSecret;
    if (!appSecret) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'AppSecret 不能为空');
    }
    if (input.enabled && !input.groupOpenId && !input.channelId) {
      throw new HttpError(400, 'VALIDATION_ERROR', '启用提醒前请填写群 OpenID 或频道子频道 ID');
    }

    const item = await saveStoredQQBotSettings({
      appId: input.appId,
      appSecret,
      groupOpenId: input.groupOpenId,
      channelId: input.channelId,
      enabled: input.enabled,
      notify: input.notify,
      dailyReportTime: input.dailyReportTime,
    });
    // 日报发送时间或开关可能变化：按最新设置重建调度
    await rescheduleQQBotDailyReport();
    return { item };
  });

  // 测试推送：用已保存的配置向所有推送目标发送指定类型的文案（any 成功即 ok）。
  // 显式测试不受 notify 开关限制，便于开启前预览；日报为当前真实统计数据，无需等到定时点。
  const qqBotTestSchema = z.object({
    type: z.enum(['general', 'submission', 'report', 'daily']).default('general'),
  });
  app.post('/api/admin/settings/qq-bot/test', { preHandler: [app.requireAdmin] }, async (request) => {
    const { type } = qqBotTestSchema.parse(request.body ?? {});
    let content: string;
    switch (type) {
      case 'submission':
        content = buildSubmissionNotifyMessage(
          { entityType: 'GROUP', entityLabel: '用户群', mode: 'CREATE', payload: { name: '示例群聊' }, submitterId: '' },
          '测试用户',
        );
        break;
      case 'report':
        content = buildCommentReportNotifyMessage({
          reporterNickname: '测试用户',
          commentContent: '这是一条测试举报的评论内容',
          commentUserNickname: '示例作者',
          reason: '测试举报理由',
        });
        break;
      case 'daily':
        content = await buildDailyReportMessage();
        break;
      default:
        content = '这是一条测试消息：QQ 机器人投稿提醒已配置成功。';
    }
    return broadcastQQBotMessage(content);
  });

  // 机器人已加入的频道列表，供后台「频道子频道 ID」下拉选择
  app.get('/api/admin/settings/qq-bot/guilds', { preHandler: [app.requireAdmin] }, async () => {
    return fetchQQBotGuilds();
  });

  // 指定频道下的文字子频道列表（type 0），与上一接口配合完成两级选择
  app.get('/api/admin/settings/qq-bot/guilds/:guildId/channels', { preHandler: [app.requireAdmin] }, async (request) => {
    const { guildId } = request.params as { guildId: string };
    return fetchQQBotGuildChannels(guildId);
  });

  // webhook 捕获的群（机器人被拉入群/收到群消息时自动记录），供「群 OpenID」下拉选择
  app.get('/api/admin/settings/qq-bot/groups', { preHandler: [app.requireAdmin] }, async () => {
    const items = await prisma.botBoundGroup.findMany({ orderBy: [{ lastSeenAt: 'desc' }] });
    return {
      items: items.map((item) => ({
        groupOpenId: item.groupOpenId,
        name: item.name,
        source: item.source,
        lastSeenAt: item.lastSeenAt,
      })),
    };
  });
}
