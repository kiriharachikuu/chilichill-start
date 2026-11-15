import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { resetRateLimits } from '../src/lib/rate-limit';
import { prisma } from '../src/prisma';

// 登录 / 会话回归测试：
// - 凭据错误防枚举（不存在的邮箱与错误密码返回同一错误码）
// - me 回显、logout 清除 cookie
// - IP 维度登录限流（固定窗口 10 次/分钟）
// 注意：登录端点按 IP 计数（含失败），inject 的 IP 恒为 127.0.0.1，
// 限流用例使用 resetRateLimits() 重置后放在最后执行。

const TEST_EMAIL = 'login-test@test.dev';
const TEST_PASSWORD = 'correct-password-123';

let app: FastifyInstance;
let userId: string;

function login(email: string, password: string) {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  resetRateLimits();
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });

  // 真实 bcrypt 哈希（rounds 4：测试只验比对逻辑，不需要安全强度）
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 4);
  const user = await prisma.user.create({
    // uid 必填，900021+ 避开正式号段
    data: { email: TEST_EMAIL, nickname: '登录测试', passwordHash, uid: 900021 },
    select: { id: true },
  });
  userId = user.id;
});

afterAll(async () => {
  resetRateLimits();
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } });
  await app.close();
  await prisma.$disconnect();
});

describe('POST /api/auth/login', () => {
  it('密码错误返回 401 INVALID_CREDENTIALS', async () => {
    const res = await login(TEST_EMAIL, 'wrong-password!');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
  });

  it('不存在的邮箱返回同一错误码（防枚举）', async () => {
    const res = await login('no-such-user@test.dev', TEST_PASSWORD);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: 'INVALID_CREDENTIALS' }) }));
    // 与密码错误的响应结构一致，不泄露账号是否存在
    const wrongPassword = await login(TEST_EMAIL, 'wrong-password!');
    expect(Object.keys(res.json().error).sort()).toEqual(Object.keys(wrongPassword.json().error).sort());
  });

  it('空密码与非法邮箱格式返回 400（不消耗限流次数）', async () => {
    const empty = await login(TEST_EMAIL, '');
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const badEmail = await login('not-an-email', TEST_PASSWORD);
    expect(badEmail.statusCode).toBe(400);
  });

  it('正确凭据登录成功：回显用户并设置 httpOnly cookie', async () => {
    const res = await login(TEST_EMAIL, TEST_PASSWORD);
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({ id: userId, email: TEST_EMAIL, nickname: '登录测试', role: 'USER' });

    const cookie = res.cookies.find((entry) => entry.name === 'spaceport_token');
    expect(cookie).toBeTruthy();
    expect(cookie?.value.length).toBeGreaterThan(20);
    expect(cookie?.httpOnly).toBe(true);
  });
});

describe('GET /api/auth/me', () => {
  it('不带 cookie 返回 user:null', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: null });
  });

  it('带登录 cookie 回显当前用户', async () => {
    const loginRes = await login(TEST_EMAIL, TEST_PASSWORD);
    const token = loginRes.cookies.find((entry) => entry.name === 'spaceport_token')?.value;
    expect(token).toBeTruthy();

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `spaceport_token=${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ user: { id: userId, email: TEST_EMAIL, nickname: '登录测试' } });
  });

  it('伪造 token 返回 user:null（验签失败不抛错）', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: 'spaceport_token=forged-token-value' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ user: null });
  });
});

describe('POST /api/auth/logout', () => {
  it('登出返回 204 并清除 cookie', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(204);
    const cookie = res.cookies.find((entry) => entry.name === 'spaceport_token');
    expect(cookie).toBeTruthy();
    expect(cookie?.value).toBe('');
  });
});

describe('登录 IP 限流', () => {
  it('1 分钟内超过 10 次登录返回 429 LOGIN_IP_LIMIT', async () => {
    resetRateLimits();

    // 前 10 次（无论成败）均计入计数窗口
    for (let i = 0; i < 10; i += 1) {
      const res = await login(TEST_EMAIL, 'wrong-password!');
      expect(res.statusCode).toBe(401);
    }

    // 第 11 次被固定窗口限流拦截
    const blocked = await login(TEST_EMAIL, TEST_PASSWORD);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ error: { code: 'LOGIN_IP_LIMIT' } });
    expect(blocked.json().error.retryAfterSeconds).toBeGreaterThan(0);
  });
});
