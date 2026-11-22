import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { resetRateLimits } from '../src/lib/rate-limit';
import { prisma } from '../src/prisma';

// OAuth2 授权码流程端到端回归：
// 管理后台创建应用 → 用户授权确认 → 授权码换令牌（form-urlencoded）→ userinfo 取基础信息
// 以及安全边界：回调白名单、code 一次性/过期、密钥校验、应用禁用与封号实时生效。

const ADMIN_EMAIL = 'oauth-admin@test.dev';
const USER_EMAIL = 'oauth-user@test.dev';
const BANNED_EMAIL = 'oauth-banned@test.dev';
const PASSWORD = 'correct-password-123';
const CALLBACK = 'https://third-party.test/auth/callback?site=app1';

let app: FastifyInstance;
let userId: string;
let adminId: string;
let adminToken: string;
let userCookie: string;
let clientId: string;
let clientSecret: string;

function login(email: string, password: string) {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
}

async function exchangeToken(payload: {
  client_id: string;
  client_secret: string;
  code: string;
  redirect_uri: string;
}) {
  return app.inject({
    method: 'POST',
    url: '/api/oauth/token',
    payload: new URLSearchParams({ grant_type: 'authorization_code', ...payload }).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
}

/** 走完整授权确认拿回调地址（含 code） */
async function authorizeAndConfirm(options?: { redirectUri?: string; approve?: boolean; state?: string }) {
  const redirectUri = options?.redirectUri ?? CALLBACK;
  const state = options?.state ?? 'st-123456';
  const confirm = await app.inject({
    method: 'POST',
    url: '/api/oauth/authorize/confirm',
    headers: { cookie: `spaceport_token=${userCookie}` },
    payload: { clientId, redirectUri, state, approve: options?.approve ?? true },
  });
  expect(confirm.statusCode, confirm.body).toBe(200);
  const { redirectUrl } = confirm.json() as { redirectUrl: string };
  return { redirectUrl, state };
}

function extractCode(redirectUrl: string): string {
  const code = new URL(redirectUrl).searchParams.get('code');
  expect(code, `回调地址应包含 code：${redirectUrl}`).toBeTruthy();
  return code as string;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  resetRateLimits();

  await prisma.user.deleteMany({
    where: { email: { in: [ADMIN_EMAIL, USER_EMAIL, BANNED_EMAIL] } },
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const admin = await prisma.user.create({
    data: { email: ADMIN_EMAIL, nickname: 'OAuth管理员', passwordHash, uid: 900101, role: 'ADMIN' },
  });
  adminId = admin.id;
  const user = await prisma.user.create({
    data: { email: USER_EMAIL, nickname: 'OAuth用户', passwordHash, uid: 900102 },
  });
  userId = user.id;
  await prisma.user.create({
    data: { email: BANNED_EMAIL, nickname: 'OAuth封禁用户', passwordHash, uid: 900103 },
  });

  const adminRes = await login(ADMIN_EMAIL, PASSWORD);
  adminToken = adminRes.cookies.find((entry) => entry.name === 'spaceport_token')?.value ?? '';
  expect(adminToken).toBeTruthy();

  const userRes = await login(USER_EMAIL, PASSWORD);
  userCookie = userRes.cookies.find((entry) => entry.name === 'spaceport_token')?.value ?? '';
  expect(userCookie).toBeTruthy();

  // 通过管理后台 API 创建接入应用（同时覆盖后台 CRUD）
  const created = await app.inject({
    method: 'POST',
    url: '/api/admin/oauth-apps',
    headers: { cookie: `spaceport_token=${adminToken}` },
    payload: {
      name: '第三方测试站',
      description: 'OAuth 回归测试应用',
      redirectUris: [CALLBACK],
      status: 'ACTIVE',
    },
  });
  expect(created.statusCode, created.body).toBe(201);
  const createdBody = created.json() as { item: { clientId: string; id: string }; clientSecret: string };
  clientId = createdBody.item.clientId;
  clientSecret = createdBody.clientSecret;
  expect(clientId).toMatch(/^sp_[0-9a-f]{24}$/);
  expect(clientSecret.length).toBe(64);
});

afterAll(async () => {
  resetRateLimits();
  await prisma.oAuthApp.deleteMany({});
  // 审计日志引用管理员用户，先清理再删用户
  await prisma.adminAuditLog.deleteMany({ where: { actorId: adminId } });
  await prisma.user.deleteMany({
    where: { email: { in: [ADMIN_EMAIL, USER_EMAIL, BANNED_EMAIL] } },
  });
  await app.close();
  await prisma.$disconnect();
});

describe('GET /api/oauth/authorize', () => {
  it('合法请求返回应用信息', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/oauth/authorize',
      query: { client_id: clientId, redirect_uri: CALLBACK, state: 'abc' },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json()).toMatchObject({ app: { clientId, name: '第三方测试站' }, state: 'abc' });
  });

  it('client_id 不存在返回 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/oauth/authorize',
      query: { client_id: 'sp_nonexistent', redirect_uri: CALLBACK, state: 'abc' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'INVALID_CLIENT' } });
  });

  it('redirect_uri 不在白名单返回 400 INVALID_REDIRECT_URI', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/oauth/authorize',
      query: { client_id: clientId, redirect_uri: 'https://evil.test/callback', state: 'abc' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'INVALID_REDIRECT_URI' } });
  });

  it('缺少 state 返回 400', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/oauth/authorize',
      query: { client_id: clientId, redirect_uri: CALLBACK },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('完整授权码流程', () => {
  it('确认授权 → 换令牌 → userinfo 返回基础信息', async () => {
    const { redirectUrl, state } = await authorizeAndConfirm();
    const url = new URL(redirectUrl);
    expect(url.origin + url.pathname).toBe('https://third-party.test/auth/callback');
    expect(url.searchParams.get('state')).toBe(state);
    const code = extractCode(redirectUrl);

    const tokenRes = await exchangeToken({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: CALLBACK,
    });
    expect(tokenRes.statusCode, tokenRes.body).toBe(200);
    const tokenBody = tokenRes.json() as {
      access_token: string;
      token_type: string;
      expires_in: number;
      user: { id: string; uid: number; nickname: string; avatarUrl: string | null };
    };
    expect(tokenBody.token_type).toBe('Bearer');
    expect(tokenBody.expires_in).toBeGreaterThan(0);
    expect(tokenBody.user).toEqual({
      id: userId,
      uid: 900102,
      nickname: 'OAuth用户',
      avatarUrl: null,
    });

    const userinfoRes = await app.inject({
      method: 'GET',
      url: '/api/oauth/userinfo',
      headers: { authorization: `Bearer ${tokenBody.access_token}` },
    });
    expect(userinfoRes.statusCode, userinfoRes.body).toBe(200);
    expect(userinfoRes.json()).toMatchObject({
      user: { id: userId, nickname: 'OAuth用户', avatarUrl: null },
    });
  });

  it('拒绝授权回传 error=access_denied 与 state', async () => {
    const { redirectUrl, state } = await authorizeAndConfirm({ approve: false, state: 'deny-state' });
    const url = new URL(redirectUrl);
    expect(url.searchParams.get('error')).toBe('access_denied');
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('code')).toBeNull();
  });
});

describe('安全边界', () => {
  it('授权码一次性消费：重放返回 400 INVALID_GRANT', async () => {
    const { redirectUrl } = await authorizeAndConfirm();
    const code = extractCode(redirectUrl);

    const first = await exchangeToken({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: CALLBACK,
    });
    expect(first.statusCode, first.body).toBe(200);

    const replay = await exchangeToken({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: CALLBACK,
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json()).toMatchObject({ error: { code: 'INVALID_GRANT' } });
  });

  it('过期的授权码返回 400 INVALID_GRANT', async () => {
    const { redirectUrl } = await authorizeAndConfirm();
    const code = extractCode(redirectUrl);

    await prisma.oAuthAuthorizationCode.updateMany({
      where: {},
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await exchangeToken({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: CALLBACK,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'INVALID_GRANT' } });
  });

  it('client_secret 错误返回 401 INVALID_CLIENT', async () => {
    const { redirectUrl } = await authorizeAndConfirm();
    const code = extractCode(redirectUrl);

    const res = await exchangeToken({
      client_id: clientId,
      client_secret: '0'.repeat(64),
      code,
      redirect_uri: CALLBACK,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'INVALID_CLIENT' } });
  });

  it('令牌交换的 redirect_uri 与授权时不一致返回 400', async () => {
    const { redirectUrl } = await authorizeAndConfirm();
    const code = extractCode(redirectUrl);

    const other = await app.inject({
      method: 'POST',
      url: '/api/admin/oauth-apps',
      headers: { cookie: `spaceport_token=${adminToken}` },
      payload: { name: '另一测试站', redirectUris: ['https://another.test/cb'], status: 'ACTIVE' },
    });
    expect(other.statusCode, other.body).toBe(201);

    const res = await exchangeToken({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: 'https://another.test/cb',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'INVALID_GRANT' } });
  });

  it('应用禁用后：authorize 400，存量令牌 userinfo 401', async () => {
    // 先拿一个有效令牌
    const { redirectUrl } = await authorizeAndConfirm();
    const tokenRes = await exchangeToken({
      client_id: clientId,
      client_secret: clientSecret,
      code: extractCode(redirectUrl),
      redirect_uri: CALLBACK,
    });
    const accessToken = (tokenRes.json() as { access_token: string }).access_token;

    // 禁用应用
    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/oauth-apps',
      headers: { cookie: `spaceport_token=${adminToken}` },
    });
    const appRow = (list.json() as { items: Array<{ id: string; clientId: string }> }).items.find(
      (item) => item.clientId === clientId,
    );
    expect(appRow).toBeTruthy();

    const disabled = await app.inject({
      method: 'PUT',
      url: `/api/admin/oauth-apps/${appRow!.id}`,
      headers: { cookie: `spaceport_token=${adminToken}` },
      payload: {
        name: '第三方测试站',
        redirectUris: [CALLBACK],
        status: 'DISABLED',
      },
    });
    expect(disabled.statusCode, disabled.body).toBe(200);

    const authRes = await app.inject({
      method: 'GET',
      url: '/api/oauth/authorize',
      query: { client_id: clientId, redirect_uri: CALLBACK, state: 'abc' },
    });
    expect(authRes.statusCode).toBe(400);
    expect(authRes.json()).toMatchObject({ error: { code: 'INVALID_CLIENT' } });

    const userinfoRes = await app.inject({
      method: 'GET',
      url: '/api/oauth/userinfo',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(userinfoRes.statusCode).toBe(401);
    expect(userinfoRes.json()).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
  });

  it('用户封号后：存量令牌 userinfo 401', async () => {
    const bannedLogin = await login(BANNED_EMAIL, PASSWORD);
    const bannedCookie = bannedLogin.cookies.find((entry) => entry.name === 'spaceport_token')?.value ?? '';
    expect(bannedCookie).toBeTruthy();

    const confirm = await app.inject({
      method: 'POST',
      url: '/api/oauth/authorize/confirm',
      headers: { cookie: `spaceport_token=${bannedCookie}` },
      payload: { clientId, redirectUri: CALLBACK, state: 'banned', approve: true },
    });
    // 上一用例把应用禁用了，先恢复
    expect(confirm.statusCode).toBe(400);
    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/oauth-apps',
      headers: { cookie: `spaceport_token=${adminToken}` },
    });
    const appRow = (list.json() as { items: Array<{ id: string; clientId: string }> }).items.find(
      (item) => item.clientId === clientId,
    );
    await app.inject({
      method: 'PUT',
      url: `/api/admin/oauth-apps/${appRow!.id}`,
      headers: { cookie: `spaceport_token=${adminToken}` },
      payload: { name: '第三方测试站', redirectUris: [CALLBACK], status: 'ACTIVE' },
    });

    const confirm2 = await app.inject({
      method: 'POST',
      url: '/api/oauth/authorize/confirm',
      headers: { cookie: `spaceport_token=${bannedCookie}` },
      payload: { clientId, redirectUri: CALLBACK, state: 'banned', approve: true },
    });
    expect(confirm2.statusCode, confirm2.body).toBe(200);
    const code = extractCode((confirm2.json() as { redirectUrl: string }).redirectUrl);

    const tokenRes = await exchangeToken({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: CALLBACK,
    });
    expect(tokenRes.statusCode, tokenRes.body).toBe(200);
    const accessToken = (tokenRes.json() as { access_token: string }).access_token;

    // 封号后令牌立即失效
    await prisma.user.updateMany({
      where: { email: BANNED_EMAIL },
      data: { bannedAt: new Date() },
    });

    const userinfoRes = await app.inject({
      method: 'GET',
      url: '/api/oauth/userinfo',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(userinfoRes.statusCode).toBe(401);
    expect(userinfoRes.json()).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
  });

  it('未带 Bearer 令牌调用 userinfo 返回 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/oauth/userinfo' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'INVALID_TOKEN' } });
  });
});

describe('管理后台接入应用 API', () => {
  it('非管理员访问返回 403', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/oauth-apps',
      headers: { cookie: `spaceport_token=${userCookie}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('回调地址非法（非 http/https）返回 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/oauth-apps',
      headers: { cookie: `spaceport_token=${adminToken}` },
      payload: { name: '非法应用', redirectUris: ['javascript:alert(1)'] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('重置密钥返回新明文，旧密钥立即失效', async () => {
    const list = await app.inject({
      method: 'GET',
      url: '/api/admin/oauth-apps',
      headers: { cookie: `spaceport_token=${adminToken}` },
    });
    const appRow = (list.json() as { items: Array<{ id: string; clientId: string }> }).items.find(
      (item) => item.clientId === clientId,
    );
    expect(appRow).toBeTruthy();

    const reset = await app.inject({
      method: 'POST',
      url: `/api/admin/oauth-apps/${appRow!.id}/reset-secret`,
      headers: { cookie: `spaceport_token=${adminToken}` },
    });
    expect(reset.statusCode, reset.body).toBe(200);
    const newSecret = (reset.json() as { clientSecret: string }).clientSecret;
    expect(newSecret).not.toBe(clientSecret);

    // 旧 secret 换不到令牌：签发一个新 code 后用旧 secret 交换
    const { redirectUrl } = await authorizeAndConfirm({ state: 'reset-check' });
    const code = extractCode(redirectUrl);
    const stale = await exchangeToken({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: CALLBACK,
    });
    expect(stale.statusCode).toBe(401);
    expect(stale.json()).toMatchObject({ error: { code: 'INVALID_CLIENT' } });

    clientSecret = newSecret;
  });
});
