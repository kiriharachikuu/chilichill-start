import { createPrivateKey, createPublicKey, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import type { FastifyBaseLogger, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../prisma';
import { fetchQQBotGroupInfo } from '../services/qq-bot/client';
import { getStoredQQBotSettings } from '../services/qq-bot/settings';

// ===== QQ 官方 webhook 回调（https://bot.q.qq.com/wiki/develop/api-v2/）=====
// 签名算法按官方文档（sign.html / event-emit.html）：
// AppSecret 为任意字符串，对其 UTF-8 字节反复翻倍扩展至 >= 32 字节后截取前 32 字节作为
// Ed25519 种子（seed），公钥/私钥均由该 seed 派生：
// - 分发请求：验 `X-Signature-Ed25519`（hex）over `X-Signature-Timestamp + raw body`，
//   成功后回包 {"op": 12}（HTTP Callback ACK）
// - 回调验证（op 13）：私钥对 `event_ts + plain_token` 签名，hex 回传 {plain_token, signature}
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const ED25519_SEED_SIZE = 32;

// 官方 seed 构造：Go 版 strings.Repeat(seed, 2) 直至 >= 32 字节再截断。
// 空 secret 直接返回（0 字节无法扩展），由路由层提前拒绝，避免 while 无限循环
function seedFromSecret(appSecret: string): Buffer {
  let seed = Buffer.from(appSecret, 'utf8');
  if (seed.length === 0) {
    return seed;
  }
  while (seed.length < ED25519_SEED_SIZE) {
    seed = Buffer.concat([seed, seed]);
  }
  return seed.subarray(0, ED25519_SEED_SIZE);
}

function ed25519PrivateKey(appSecret: string): ReturnType<typeof createPrivateKey> {
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, seedFromSecret(appSecret)]),
    format: 'der',
    type: 'pkcs8',
  });
}

function ed25519PublicKey(appSecret: string): ReturnType<typeof createPublicKey> {
  return createPublicKey(ed25519PrivateKey(appSecret));
}

interface QQBotWebhookEnvelope {
  op?: number;
  id?: string;
  type?: string;
  timestamp?: string;
  domain?: string;
  d?: Record<string, unknown>;
}

type RequestWithRawBody = FastifyRequest & { rawBody?: Buffer };

/** 验证分发请求签名：Ed25519(secret 公钥) over `timestamp + raw body`，签名为 hex */
function verifyDispatchSignature(appSecret: string, message: Buffer, signatureHex: string): boolean {
  try {
    // Ed25519 为纯签名算法，digest 传 null
    return cryptoVerify(null, message, ed25519PublicKey(appSecret), Buffer.from(signatureHex, 'hex'));
  } catch {
    return false;
  }
}

/** 回调验证（op 13）回签：Ed25519(secret 私钥) over `event_ts + plain_token` */
function signValidationPayload(appSecret: string, message: string): string {
  return cryptoSign(null, Buffer.from(message, 'utf8'), ed25519PrivateKey(appSecret)).toString('hex');
}

/** 群事件处理：捕获/移除机器人所在群，供后台推送目标下拉选择 */
async function handleQQBotEvent(payload: QQBotWebhookEnvelope, log: FastifyBaseLogger): Promise<void> {
  const type = payload.type ?? '';
  const d = payload.d ?? {};
  const groupOpenId = typeof d.group_openid === 'string' ? d.group_openid : '';
  if (!groupOpenId) {
    return;
  }

  // 机器人被移出群：删除捕获记录
  if (type === 'GROUP_DEL_ROBOT') {
    const removed = await prisma.botBoundGroup.deleteMany({ where: { groupOpenId } });
    if (removed.count > 0) {
      log.info({ groupOpenId }, 'qq-bot 机器人已移出群，删除捕获记录');
    }
    return;
  }

  // 被拉入群 / 收到群消息：入库并刷新最近活跃时间
  if (type === 'GROUP_ADD_ROBOT' || type === 'GROUP_AT_MESSAGE_CREATE') {
    const source = type === 'GROUP_ADD_ROBOT' ? 'GROUP_ADD_ROBOT' : 'GROUP_AT_MESSAGE_CREATE';
    const existing = await prisma.botBoundGroup.findUnique({ where: { groupOpenId } });
    // 群名为 best-effort 补充：群信息接口仅白名单机器人可用，失败不影响入库
    let name = existing?.name ?? null;
    if (!name) {
      const info = await fetchQQBotGroupInfo(groupOpenId);
      if (info.ok && info.groupName) {
        name = info.groupName;
      }
    }
    await prisma.botBoundGroup.upsert({
      where: { groupOpenId },
      update: { lastSeenAt: new Date(), source },
      create: { groupOpenId, name, source },
    });
    log.info({ groupOpenId, source, name }, 'qq-bot 捕获群推送目标');
  }
}

export async function qqBotWebhookRoutes(app: FastifyInstance) {
  await app.register(async (scope) => {
    // 子作用域内改用 buffer 解析 JSON：保留原始 body 供验签（不影响其他路由的 JSON 解析）
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
      (request as RequestWithRawBody).rawBody = body as Buffer;
      try {
        done(null, JSON.parse((body as Buffer).toString('utf8') || '{}'));
      } catch (error) {
        done(error as Error, undefined);
      }
    });

    scope.post('/api/qq-bot/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = (request.body ?? {}) as QQBotWebhookEnvelope;
      const settings = await getStoredQQBotSettings();
      const appSecret = settings.appSecret.trim();

      // 平台回调验证（op 13）：返回 plain_token 与 Ed25519 签名，供平台校验 URL
      if (payload.op === 13) {
        const d = payload.d ?? {};
        const plainToken = typeof d.plain_token === 'string' ? d.plain_token : '';
        const eventTs = d.event_ts === undefined || d.event_ts === null ? '' : String(d.event_ts);
        if (!appSecret || !plainToken) {
          return reply.code(400).send({ error: '请先在后台保存 QQ 机器人 AppSecret，再配置回调地址' });
        }
        try {
          const signature = signValidationPayload(appSecret, `${eventTs}${plainToken}`);
          return reply.send({ plain_token: plainToken, signature });
        } catch (error) {
          request.log.warn({ err: error }, 'qq-bot webhook 回调验证签名失败');
          return reply.code(500).send({ error: '签名失败，请检查 AppSecret 格式' });
        }
      }

      // 分发请求：X-Signature-Ed25519 + X-Signature-Timestamp 验签。
      // 未配置 secret 先拒绝——空 secret 无法派生密钥，不能进入验签
      if (!appSecret) {
        return reply.code(401).send({ error: 'invalid signature' });
      }
      const signature = request.headers['x-signature-ed25519'];
      const timestamp = request.headers['x-signature-timestamp'];
      const rawBody = (request as RequestWithRawBody).rawBody;
      const signed =
        typeof signature === 'string' &&
        typeof timestamp === 'string' &&
        rawBody !== undefined &&
        verifyDispatchSignature(
          appSecret,
          Buffer.concat([Buffer.from(timestamp, 'utf8'), rawBody]),
          signature,
        );
      if (!signed) {
        return reply.code(401).send({ error: 'invalid signature' });
      }

      // 事件处理 best-effort：失败仅记录日志，仍返回 2xx 避免平台重试风暴
      try {
        await handleQQBotEvent(payload, request.log);
      } catch (error) {
        request.log.error({ err: error }, 'qq-bot webhook 事件处理失败');
      }
      // 官方要求分发请求回包 {"op": 12}（HTTP Callback ACK），代表已收到推送
      return reply.send({ op: 12 });
    });
  });
}
