import { createPrivateKey, createPublicKey, generateKeyPairSync, sign as cryptoSign, verify as cryptoVerify } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { prisma } from '../src/prisma';
import { resetQQBotStateForTests } from '../src/services/qq-bot/client';
import { saveStoredQQBotSettings } from '../src/services/qq-bot/settings';

// QQ 机器人 webhook 回调（公开路由 POST /api/qq-bot/webhook）：
// - 回调验证（op 13）：用 AppSecret 派生 Ed25519 私钥对 event_ts + plain_token 签名回传
// - 分发请求：以 AppSecret 字节作为 Ed25519 公钥验 X-Signature-Ed25519 over timestamp + raw body
// - 群事件：GROUP_ADD_ROBOT / GROUP_AT_MESSAGE_CREATE 捕获入库，GROUP_DEL_ROBOT 删除
// - 后台列表：频道/子频道代理与已捕获群列表（仅管理员）

const ADMIN_EMAIL = 'qqbot-hook-admin@test.dev';
const USER_EMAIL = 'qqbot-hook-user@test.dev';
const PASSWORD = 'password-123';

// 用于回调验证签名的 64 位 hex AppSecret（32 字节）
const VALIDATION_SECRET = 'aa11bb22cc33dd44ee55ff6600112233aa11bb22cc33dd44ee55ff6600112233';
// 分发验签密钥：生成密钥对后把原始公钥 32 字节当 AppSecret（hex），私钥用于构造平台签名
const DISPATCH_KEY_PAIR = generateKeyPairSync('ed25519');
const DISPATCH_SECRET = Buffer.from(
  (DISPATCH_KEY_PAIR.publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(-32),
).toString('hex');
const DISPATCH_PRIVATE_KEY = DISPATCH_KEY_PAIR.privateKey;

// 模拟平台对分发请求的签名：Ed25519 over `timestamp + raw body`（纯签名算法 digest 传 null）
function signDispatch(timestamp: string, rawBody: string): string {
  return cryptoSign(null, Buffer.from(timestamp + rawBody, 'utf8'), DISPATCH_PRIVATE_KEY).toString('hex');
}

function dispatchHeaders(rawBody: string, timestamp = '1700000000') {
  return {
    'content-type': 'application/json',
    'x-signature-ed25519': signDispatch(timestamp, rawBody),
    'x-signature-timestamp': timestamp,
  };
}

let app: FastifyInstance;
let adminToken: string;
let userToken: string;

async function loginToken(email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: PASSWORD },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookie = res.cookies.find((entry) => entry.name === 'spaceport_token');
  expect(cookie).toBeDefined();
  return cookie!.value;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, USER_EMAIL] } } });
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  // uid 900035+/900036+ 避开其他用例号段
  await prisma.user.create({
    data: { email: ADMIN_EMAIL, nickname: '机器人回调管理员', passwordHash, uid: 900035, role: 'ADMIN' },
    select: { id: true },
  });
  await prisma.user.create({
    data: { email: USER_EMAIL, nickname: '机器人回调成员', passwordHash, uid: 900036 },
    select: { id: true },
  });
  adminToken = await loginToken(ADMIN_EMAIL);
  userToken = await loginToken(USER_EMAIL);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, USER_EMAIL] } } });
  await prisma.botBoundGroup.deleteMany({});
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: 'qq-bot' } });
  await prisma.botBoundGroup.deleteMany({});
  resetQQBotStateForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonRes(data: unknown, opts: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    statusText: opts.statusText ?? 'OK',
    json: async () => data,
  } as Response;
}

describe('webhook 回调验证（op 13）', () => {
  it('返回 plain_token 与 Ed25519 签名，签名可用 AppSecret 派生公钥验证', async () => {
    await saveStoredQQBotSettings({
      appId: '102000001',
      appSecret: VALIDATION_SECRET,
      groupOpenId: null,
      channelId: null,
      enabled: false,
    });

    const payload = JSON.stringify({
      op: 13,
      type: 'URL_VALIDATION',
      d: { plain_token: 'pt-1', event_ts: 1700000000 },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/qq-bot/webhook',
      payload,
      headers: { 'content-type': 'application/json' },
    });

    expect(res.statusCode, res.body).toBe(200);
    const body = res.json() as { plain_token: string; signature: string };
    expect(body.plain_token).toBe('pt-1');

    // 用 AppSecret 派生私钥对应的公钥独立验证签名
    const privateKey = createPrivateKey({
      key: Buffer.concat([
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        Buffer.from(VALIDATION_SECRET, 'hex'),
      ]),
      format: 'der',
      type: 'pkcs8',
    });
    const publicKey = createPublicKey(privateKey);
    expect(
      cryptoVerify(null, Buffer.from('1700000000pt-1', 'utf8'), publicKey, Buffer.from(body.signature, 'hex')),
    ).toBe(true);
  });

  it('未配置 AppSecret 时返回 400', async () => {
    const payload = JSON.stringify({ op: 13, type: 'URL_VALIDATION', d: { plain_token: 'pt-1', event_ts: 1 } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/qq-bot/webhook',
      payload,
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('webhook 分发请求验签', () => {
  it('签名无效返回 401且不入库', async () => {
    await saveStoredQQBotSettings({
      appId: '102000001',
      appSecret: DISPATCH_SECRET,
      groupOpenId: null,
      channelId: null,
      enabled: false,
    });
    const rawBody = JSON.stringify({ type: 'GROUP_ADD_ROBOT', d: { group_openid: 'G-1' } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/qq-bot/webhook',
      payload: rawBody,
      headers: {
        'content-type': 'application/json',
        'x-signature-ed25519': '00'.repeat(64),
        'x-signature-timestamp': '1700000000',
      },
    });
    expect(res.statusCode).toBe(401);
    expect(await prisma.botBoundGroup.count()).toBe(0);
  });

  it('未配置 AppSecret 时返回 401', async () => {
    const rawBody = JSON.stringify({ type: 'GROUP_ADD_ROBOT', d: { group_openid: 'G-1' } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/qq-bot/webhook',
      payload: rawBody,
      headers: dispatchHeaders(rawBody),
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('webhook 群事件处理', () => {
  async function saveDispatchSecret() {
    await saveStoredQQBotSettings({
      appId: '102000001',
      appSecret: DISPATCH_SECRET,
      groupOpenId: null,
      channelId: null,
      enabled: false,
    });
  }

  function dispatchEvent(event: Record<string, unknown>) {
    const rawBody = JSON.stringify(event);
    return app.inject({
      method: 'POST',
      url: '/api/qq-bot/webhook',
      payload: rawBody,
      headers: dispatchHeaders(rawBody),
    });
  }

  it('GROUP_ADD_ROBOT 捕获入库；群信息接口失败时群名为空（best-effort）', async () => {
    await saveDispatchSecret();
    // 群信息接口仅白名单机器人可用：让 fetch 抛错模拟失败
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const res = await dispatchEvent({
      id: 'evt-1',
      type: 'GROUP_ADD_ROBOT',
      d: { group_openid: 'G-ADD-1', op_member_openid: 'U-1', timestamp: '2026-01-01' },
    });

    expect(res.statusCode, res.body).toBe(200);
    const rows = await prisma.botBoundGroup.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ groupOpenId: 'G-ADD-1', name: null, source: 'GROUP_ADD_ROBOT' });
  });

  it('群信息接口成功时补全群名', async () => {
    await saveDispatchSecret();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ access_token: 'tok-1', expires_in: '7200' }))
      .mockResolvedValueOnce(jsonRes({ group_openid: 'G-ADD-2', group_name: '粉丝一群' }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await dispatchEvent({
      type: 'GROUP_ADD_ROBOT',
      d: { group_openid: 'G-ADD-2', op_member_openid: 'U-1', timestamp: '2026-01-01' },
    });

    expect(res.statusCode, res.body).toBe(200);
    expect(fetchMock.mock.calls[1]![0]).toBe('https://api.bot.qq.com/v2/groups/G-ADD-2/info');
    const row = await prisma.botBoundGroup.findUnique({ where: { groupOpenId: 'G-ADD-2' } });
    expect(row).toMatchObject({ groupOpenId: 'G-ADD-2', name: '粉丝一群', source: 'GROUP_ADD_ROBOT' });
  });

  it('GROUP_AT_MESSAGE_CREATE 更新已有记录来源与活跃时间，不重复入库', async () => {
    await saveDispatchSecret();
    await prisma.botBoundGroup.create({
      data: { groupOpenId: 'G-MSG-1', name: '老群', source: 'GROUP_ADD_ROBOT' },
    });
    vi.stubGlobal('fetch', vi.fn());

    const before = await prisma.botBoundGroup.findUnique({ where: { groupOpenId: 'G-MSG-1' } });
    const res = await dispatchEvent({
      type: 'GROUP_AT_MESSAGE_CREATE',
      d: { id: 'msgid-1', group_openid: 'G-MSG-1', content: 'hello' },
    });

    expect(res.statusCode, res.body).toBe(200);
    const rows = await prisma.botBoundGroup.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ groupOpenId: 'G-MSG-1', name: '老群', source: 'GROUP_AT_MESSAGE_CREATE' });
    expect(rows[0]!.lastSeenAt.getTime()).toBeGreaterThan(before!.lastSeenAt.getTime());
    expect(vi.mocked(fetch).mock.calls).toHaveLength(0);
  });

  it('GROUP_DEL_ROBOT 删除捕获记录，未知事件忽略', async () => {
    await saveDispatchSecret();
    await prisma.botBoundGroup.create({
      data: { groupOpenId: 'G-DEL-1', name: '要移除的群' },
    });

    const del = await dispatchEvent({
      type: 'GROUP_DEL_ROBOT',
      d: { group_openid: 'G-DEL-1', op_member_openid: 'U-1', timestamp: '2026-01-01' },
    });
    expect(del.statusCode, del.body).toBe(200);
    expect(await prisma.botBoundGroup.count({ where: { groupOpenId: 'G-DEL-1' } })).toBe(0);

    const unknown = await dispatchEvent({ type: 'C2C_ADD_ROBOT', d: { user_openid: 'U-2' } });
    expect(unknown.statusCode, unknown.body).toBe(200);
    expect(await prisma.botBoundGroup.count()).toBe(0);
  });
});

describe('后台推送目标列表', () => {
  it('已捕获群列表仅管理员可读，按最近活跃倒序', async () => {
    const base = new Date('2026-01-01T00:00:00Z');
    await prisma.botBoundGroup.create({
      data: { groupOpenId: 'G-OLD', name: '旧群', lastSeenAt: base },
    });
    await prisma.botBoundGroup.create({
      data: { groupOpenId: 'G-NEW', name: '新群', lastSeenAt: new Date(base.getTime() + 60_000) },
    });

    const unauthorized = await app.inject({ method: 'GET', url: '/api/admin/settings/qq-bot/groups' });
    expect(unauthorized.statusCode).toBe(401);

    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/qq-bot/groups',
      headers: { cookie: `spaceport_token=${userToken}` },
    });
    expect(forbidden.statusCode).toBe(403);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/qq-bot/groups',
      headers: { cookie: `spaceport_token=${adminToken}` },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().items).toHaveLength(2);
    expect(res.json().items.map((item: { groupOpenId: string }) => item.groupOpenId)).toEqual(['G-NEW', 'G-OLD']);
  });

  it('频道列表走开放平台 /users/@me/guilds，未配置时返回失败原因', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const empty = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/qq-bot/guilds',
      headers: { cookie: `spaceport_token=${adminToken}` },
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().ok).toBe(false);
    expect(empty.json().error).toContain('AppID');
    expect(fetchMock).not.toHaveBeenCalled();

    await saveStoredQQBotSettings({
      appId: '102000001',
      appSecret: 'secret-abc',
      groupOpenId: null,
      channelId: null,
      enabled: false,
    });
    const guildsMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ access_token: 'tok-1', expires_in: '7200' }))
      .mockResolvedValueOnce(jsonRes([{ id: 'G1', name: '官方频道', member_count: 10 }]));
    vi.stubGlobal('fetch', guildsMock);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/qq-bot/guilds',
      headers: { cookie: `spaceport_token=${adminToken}` },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ ok: true, guilds: [{ id: 'G1', name: '官方频道' }] });
    expect(guildsMock.mock.calls[1]![0]).toBe('https://api.bot.qq.com/users/@me/guilds?limit=100');
  });

  it('子频道列表过滤非文字子频道（仅保留 type 0）', async () => {
    await saveStoredQQBotSettings({
      appId: '102000001',
      appSecret: 'secret-abc',
      groupOpenId: null,
      channelId: null,
      enabled: false,
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ access_token: 'tok-1', expires_in: '7200' }))
      .mockResolvedValueOnce(
        jsonRes([
          { id: 'C-1', name: '文字子频道', type: 0 },
          { id: 'C-2', name: '语音子频道', type: 1 },
          { id: 'C-3', name: '子频道分类', type: 2 },
        ]),
      );
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/settings/qq-bot/guilds/G1/channels',
      headers: { cookie: `spaceport_token=${adminToken}` },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toEqual({ ok: true, channels: [{ id: 'C-1', name: '文字子频道' }] });
    expect(fetchMock.mock.calls[1]![0]).toBe('https://api.bot.qq.com/channels/G1/channels');
  });
});
