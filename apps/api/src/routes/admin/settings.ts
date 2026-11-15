import type { FastifyInstance } from 'fastify';
import {
  MAIL_SECRET_KEEP,
  STORAGE_SECRET_KEEP,
  mailSettingsSchema,
  registrationSettingsSchema,
  storageSettingsSchema,
  type RegistrationSettings,
  type StorageSettings,
} from '@spaceport/shared';
import { HttpError } from '../../lib/errors';
import {
  getStoredMailSettings,
  saveStoredMailSettings,
  type StoredMailSettings,
} from '../../services/mail/settings';
import {
  getStoredRegistrationSettings,
  saveStoredRegistrationSettings,
} from '../../services/registration-settings';
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
}
