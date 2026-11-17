import bcrypt from 'bcryptjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { QQ_BOT_SECRET_KEEP } from '@spaceport/shared';
import { buildApp } from '../src/app';
import { prisma } from '../src/prisma';
import { broadcastQQBotMessage, resetQQBotStateForTests } from '../src/services/qq-bot/client';
import { saveStoredQQBotSettings } from '../src/services/qq-bot/settings';
import { buildSubmissionNotifyMessage } from '../src/services/qq-bot/notify';

// QQ 机器人提醒：
// - 设置路由仅管理员可用，GET 时 AppSecret 脱敏为 __KEEP__，保存时哨兵值沿用现有密钥
// - 客户端按 api-v2 协议取 token（api.bot.qq.com/app/getAppAccessToken）并发送群消息
// - 投稿提醒文案生成（标题/投稿人/新增或修改）

const ADMIN_EMAIL = 'qqbot-admin@test.dev';
const USER_EMAIL = 'qqbot-user@test.dev';
const PASSWORD = 'password-123';

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
  // uid 900025+/900026+ 避开其他用例号段
  await prisma.user.create({
    data: { email: ADMIN_EMAIL, nickname: '机器人设置管理员', passwordHash, uid: 900025, role: 'ADMIN' },
    select: { id: true },
  });
  await prisma.user.create({
    data: { email: USER_EMAIL, nickname: '机器人设置成员', passwordHash, uid: 900026 },
    select: { id: true },
  });
  adminToken = await loginToken(ADMIN_EMAIL);
  userToken = await loginToken(USER_EMAIL);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, USER_EMAIL] } } });
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: 'qq-bot' } });
  resetQQBotStateForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function getQQBot(token: string) {
  return app.inject({
    method: 'GET',
    url: '/api/admin/settings/qq-bot',
    headers: { cookie: `spaceport_token=${token}` },
  });
}

function putQQBot(payload: unknown, token: string) {
  return app.inject({
    method: 'PUT',
    url: '/api/admin/settings/qq-bot',
    headers: { cookie: `spaceport_token=${token}` },
    payload,
  });
}

function postTest(token: string) {
  return app.inject({
    method: 'POST',
    url: '/api/admin/settings/qq-bot/test',
    headers: { cookie: `spaceport_token=${token}` },
  });
}

const EMPTY_ITEM = { appId: '', appSecret: '', groupOpenId: null, channelId: null, enabled: false };

function jsonRes(data: unknown, opts: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    statusText: opts.statusText ?? 'OK',
    json: async () => data,
  } as Response;
}

describe('QQ 机器人设置路由', () => {
  it('未登录读取返回 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/settings/qq-bot' });
    expect(res.statusCode).toBe(401);
  });

  it('普通成员读取与写入返回 403', async () => {
    expect((await getQQBot(userToken)).statusCode).toBe(403);
    expect(
      (await putQQBot({ appId: '1', appSecret: 's', enabled: false }, userToken)).statusCode,
    ).toBe(403);
  });

  it('未配置时返回默认空配置', async () => {
    const res = await getQQBot(adminToken);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().item).toEqual(EMPTY_ITEM);
  });

  it('管理员保存后 AppSecret 脱敏下发，群/频道目标与开关保留', async () => {
    const put = await putQQBot(
      {
        appId: '102000001',
        appSecret: 'a'.repeat(64),
        groupOpenId: 'GROUP-OPEN-ID',
        channelId: '',
        enabled: true,
      },
      adminToken,
    );
    expect(put.statusCode, put.body).toBe(200);
    expect(put.json().item).toEqual({
      appId: '102000001',
      appSecret: QQ_BOT_SECRET_KEEP,
      groupOpenId: 'GROUP-OPEN-ID',
      channelId: null,
      enabled: true,
    });

    const get = await getQQBot(adminToken);
    expect(get.json().item).toEqual({
      appId: '102000001',
      appSecret: QQ_BOT_SECRET_KEEP,
      groupOpenId: 'GROUP-OPEN-ID',
      channelId: null,
      enabled: true,
    });
  });

  it('AppSecret 传 __KEEP__ 表示沿用现有密钥', async () => {
    await putQQBot(
      { appId: '102000001', appSecret: 'b'.repeat(64), groupOpenId: 'GID', enabled: false },
      adminToken,
    );
    const put = await putQQBot(
      { appId: '102000002', appSecret: QQ_BOT_SECRET_KEEP, groupOpenId: 'GID', enabled: false },
      adminToken,
    );
    expect(put.statusCode, put.body).toBe(200);
    expect(put.json().item.appId).toBe('102000002');

    const stored = await prisma.systemSetting.findUnique({ where: { key: 'qq-bot' } });
    const parsed = JSON.parse(stored!.value) as { appSecret: string };
    expect(parsed.appSecret).toBe('b'.repeat(64));
  });

  it('首次保存 AppSecret 不能传 __KEEP__（无现有值可沿用）', async () => {
    const res = await putQQBot(
      { appId: '102000001', appSecret: QQ_BOT_SECRET_KEEP, groupOpenId: 'GID', enabled: false },
      adminToken,
    );
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('启用提醒但未填任何推送目标返回 400', async () => {
    const res = await putQQBot(
      { appId: '102000001', appSecret: 'c'.repeat(64), enabled: true },
      adminToken,
    );
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('未配置时测试发送返回失败原因且不发起网络请求', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await postTest(adminToken);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().ok).toBe(false);
    expect(res.json().error).toContain('AppID');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('QQ 机器人客户端（api-v2）', () => {
  it('先取 access_token，再按 Authorization: QQBot 发送群消息', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ access_token: 'tok-1', expires_in: '7200' }))
      .mockResolvedValueOnce(jsonRes({ id: 'msg-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await saveStoredQQBotSettings({
      appId: '102000001',
      appSecret: 'secret-abc',
      groupOpenId: 'GID-1',
      channelId: null,
      enabled: true,
    });

    const result = await broadcastQQBotMessage('测试消息内容');

    expect(result).toEqual({ ok: true, sent: ['群 GID-1'] });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0]!;
    expect(tokenUrl).toBe('https://api.bot.qq.com/app/getAppAccessToken');
    expect(JSON.parse(String(tokenInit!.body))).toEqual({ appId: '102000001', clientSecret: 'secret-abc' });

    const [sendUrl, sendInit] = fetchMock.mock.calls[1]!;
    expect(sendUrl).toBe('https://api.bot.qq.com/v2/groups/GID-1/messages');
    expect(sendInit!.headers).toMatchObject({ Authorization: 'QQBot tok-1' });
    expect(JSON.parse(String(sendInit!.body))).toEqual({ content: '测试消息内容', msg_type: 0, msg_seq: 1 });
  });

  it('同时配置群与子频道时向两个目标都发送，任一成功即 ok', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ access_token: 'tok-1', expires_in: '7200' }))
      .mockResolvedValueOnce(jsonRes({ id: 'msg-1' }))
      .mockResolvedValueOnce(jsonRes({ id: 'msg-2' }));
    vi.stubGlobal('fetch', fetchMock);

    await saveStoredQQBotSettings({
      appId: '102000001',
      appSecret: 'secret-abc',
      groupOpenId: 'GID-1',
      channelId: 'CH-1',
      enabled: true,
    });

    const result = await broadcastQQBotMessage('测试消息内容');

    expect(result.ok).toBe(true);
    expect(result.sent).toEqual(['群 GID-1', '子频道 CH-1']);
    expect(fetchMock.mock.calls[1]![0]).toBe('https://api.bot.qq.com/v2/groups/GID-1/messages');
    expect(fetchMock.mock.calls[2]![0]).toBe('https://api.bot.qq.com/channels/CH-1/messages');
  });

  it('平台返回错误码时 ok=false 且错误信息含 code/message', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ access_token: 'tok-1', expires_in: '7200' }))
      .mockResolvedValueOnce(jsonRes({ code: 22009, message: 'msg limit exceed' }, { ok: false, status: 400 }));
    vi.stubGlobal('fetch', fetchMock);

    await saveStoredQQBotSettings({
      appId: '102000001',
      appSecret: 'secret-abc',
      groupOpenId: 'GID-1',
      channelId: null,
      enabled: true,
    });

    const result = await broadcastQQBotMessage('测试消息内容');

    expect(result.ok).toBe(false);
    expect(result.sent).toEqual([]);
    expect(result.error).toContain('22009');
    expect(result.error).toContain('msg limit exceed');
  });
});

describe('投稿提醒文案', () => {
  it('包含类型/标题/投稿人，payload 无标题字段时显示占位', () => {
    const withName = buildSubmissionNotifyMessage(
      { entityType: 'GROUP', entityLabel: 'Q群', mode: 'CREATE', payload: { name: '测试群' }, submitterId: 'u1' },
      '小明',
    );
    expect(withName).toContain('收到新增投稿');
    expect(withName).toContain('内容类型：Q群');
    expect(withName).toContain('标题：测试群');
    expect(withName).toContain('投稿人：小明');

    const withTitle = buildSubmissionNotifyMessage(
      { entityType: 'SITE', entityLabel: '网站', mode: 'CREATE', payload: { title: '个人主页' }, submitterId: 'u1' },
      '小明',
    );
    expect(withTitle).toContain('标题：个人主页');

    const withoutTitle = buildSubmissionNotifyMessage(
      { entityType: 'GALLERY', entityLabel: '画廊作品', mode: 'UPDATE', payload: {}, submitterId: 'u1' },
      '小明',
    );
    expect(withoutTitle).toContain('收到修改投稿');
    expect(withoutTitle).toContain('标题：（无标题）');
  });
});
