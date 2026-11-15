import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { env } from '../src/env';
import { resetRateLimits } from '../src/lib/rate-limit';
import { prisma } from '../src/prisma';
import { setMailTransport, type MailMessage } from '../src/services/mail/mailer';
import { renderPasswordResetEmail } from '../src/services/mail/password-reset-template';

// 密码重置全链路集成测试：发码 → 冷却/防探测 → 校验 → 改密 → 新旧密码登录
// 邮件用内存传输捕获，避免依赖真实 Resend；所有请求走 fastify.inject。

const TEST_EMAILS = [
  'reset-a@test.dev',
  'reset-b@test.dev',
  'reset-c@test.dev',
  'reset-d@test.dev',
  'reset-e@test.dev',
  'reset-f@test.dev',
];

const OLD_PASSWORD = 'OldPass123!';
const NEW_PASSWORD = 'NewPass456!';

let app: FastifyInstance;
let mails: MailMessage[] = [];
let failuresLeft = 0;

function extractCode(mail: MailMessage): string {
  const matched = mail.text.match(/验证码是：(\d{6})/);
  if (!matched) {
    throw new Error('邮件纯文本中未找到验证码');
  }
  return matched[1];
}

function sendReset(email: string, ip = '10.1.0.1') {
  return app.inject({
    method: 'POST',
    url: '/api/auth/forgot-password',
    payload: { email },
    remoteAddress: ip,
  });
}

function resetPassword(email: string, code: string, password: string = NEW_PASSWORD) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/reset-password',
    payload: { email, code, password },
  });
}

function login(email: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
}

async function createUser(email: string, password: string) {
  return prisma.user.create({
    data: {
      email,
      nickname: `乘客-${email.split('@')[0]}`,
      passwordHash: await bcrypt.hash(password, 10),
      uid: 910001 + TEST_EMAILS.indexOf(email),
    },
  });
}

beforeAll(async () => {
  setMailTransport({
    name: 'memory',
    async send(message) {
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        throw new Error('Resend connection refused');
      }
      mails.push(message);
      return { messageId: `test-${mails.length}` };
    },
  });

  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  setMailTransport(null);
  await app.close();
  await prisma.passwordResetCode.deleteMany({ where: { email: { in: TEST_EMAILS } } });
  await prisma.user.deleteMany({ where: { email: { in: TEST_EMAILS } } });
});

beforeEach(async () => {
  mails = [];
  failuresLeft = 0;
  resetRateLimits();
  await prisma.passwordResetCode.deleteMany({ where: { email: { in: TEST_EMAILS } } });
  await prisma.user.deleteMany({ where: { email: { in: TEST_EMAILS } } });
});

describe('发送密码重置验证码', () => {
  it('已注册邮箱发送成功并投递邮件，数据库只存摘要', async () => {
    await createUser(TEST_EMAILS[0], OLD_PASSWORD);

    const response = await sendReset(TEST_EMAILS[0]);
    expect(response.statusCode).toBe(200);

    const body = response.json<{ expiresInSeconds: number; retryAfterSeconds: number; devCode?: string }>();
    expect(body.expiresInSeconds).toBe(env.emailCode.ttlMinutes * 60);
    expect(body.retryAfterSeconds).toBe(env.emailCode.cooldownSeconds);
    expect(body.devCode).toMatch(/^\d{6}$/);

    expect(mails).toHaveLength(1);
    expect(mails[0].subject).toContain('密码重置');
    expect(extractCode(mails[0])).toBe(body.devCode);

    const record = await prisma.passwordResetCode.findUnique({ where: { email: TEST_EMAILS[0] } });
    expect(record).not.toBeNull();
    expect(record?.codeHash).not.toBe(body.devCode);
    expect(record?.codeHash).toHaveLength(64);
    expect(record?.consumedAt).toBeNull();
  });

  it('未注册邮箱返回相同成功响应，不发邮件不落库（防探测）', async () => {
    const response = await sendReset(TEST_EMAILS[1]);
    expect(response.statusCode).toBe(200);

    const body = response.json<{ expiresInSeconds: number; retryAfterSeconds: number; devCode?: string }>();
    expect(body.expiresInSeconds).toBe(env.emailCode.ttlMinutes * 60);
    expect(body.retryAfterSeconds).toBe(env.emailCode.cooldownSeconds);

    expect(mails).toHaveLength(0);
    expect(await prisma.passwordResetCode.findUnique({ where: { email: TEST_EMAILS[1] } })).toBeNull();
  });

  it('同一邮箱冷却期内重复发送被拒绝', async () => {
    await createUser(TEST_EMAILS[2], OLD_PASSWORD);
    expect((await sendReset(TEST_EMAILS[2])).statusCode).toBe(200);

    const second = await sendReset(TEST_EMAILS[2]);
    expect(second.statusCode).toBe(429);
    expect(second.json<{ error: { code: string } }>().error.code).toBe('CODE_COOLDOWN');
    expect(mails).toHaveLength(1);
  });

  it('按 IP 限制短时间内的批量发送', async () => {
    for (let index = 0; index < env.emailCode.ipHourlyLimit; index += 1) {
      const response = await sendReset(TEST_EMAILS[3], '10.1.0.9');
      expect(response.statusCode).toBe(200);
    }

    const blocked = await sendReset(TEST_EMAILS[3], '10.1.0.9');
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json<{ error: { code: string } }>().error.code).toBe('CODE_IP_LIMIT');
  });

  it('投递失败返回 502', async () => {
    await createUser(TEST_EMAILS[4], OLD_PASSWORD);
    failuresLeft = env.mail.maxRetries + 1;

    const response = await sendReset(TEST_EMAILS[4]);
    expect(response.statusCode).toBe(502);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('MAIL_SEND_FAILED');
  });
});

describe('重置密码', () => {
  it('正确验证码完成重置：旧密码失效，新密码可登录，验证码一次性消费', async () => {
    await createUser(TEST_EMAILS[0], OLD_PASSWORD);
    await sendReset(TEST_EMAILS[0]);
    const code = extractCode(mails[0]);

    const response = await resetPassword(TEST_EMAILS[0], code);
    expect(response.statusCode).toBe(204);

    // 验证码已消费，重放同一验证码被拒绝
    const replay = await resetPassword(TEST_EMAILS[0], code);
    expect(replay.statusCode).toBe(400);
    expect(replay.json<{ error: { code: string } }>().error.code).toBe('CODE_USED');

    // 旧密码登录失败，新密码登录成功
    expect((await login(TEST_EMAILS[0], OLD_PASSWORD)).statusCode).toBe(401);
    const relogin = await login(TEST_EMAILS[0], NEW_PASSWORD);
    expect(relogin.statusCode).toBe(200);
  });

  it('未获取验证码时不能重置', async () => {
    await createUser(TEST_EMAILS[1], OLD_PASSWORD);

    const response = await resetPassword(TEST_EMAILS[1], '123456');
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('CODE_NOT_FOUND');
  });

  it('验证码过期后不能重置', async () => {
    await createUser(TEST_EMAILS[2], OLD_PASSWORD);
    await sendReset(TEST_EMAILS[2]);
    const code = extractCode(mails[0]);
    await prisma.passwordResetCode.update({
      where: { email: TEST_EMAILS[2] },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await resetPassword(TEST_EMAILS[2], code);
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('CODE_EXPIRED');
  });

  it('错误验证码累计到上限后锁定', async () => {
    await createUser(TEST_EMAILS[3], OLD_PASSWORD);
    await sendReset(TEST_EMAILS[3]);
    const correctCode = extractCode(mails[0]);
    const wrongCode = correctCode === '000000' ? '111111' : '000000';

    for (let attempt = 1; attempt < env.emailCode.maxAttempts; attempt += 1) {
      const response = await resetPassword(TEST_EMAILS[3], wrongCode);
      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('CODE_INVALID');
    }

    const locked = await resetPassword(TEST_EMAILS[3], wrongCode);
    expect(locked.statusCode).toBe(429);
    expect(locked.json<{ error: { code: string } }>().error.code).toBe('CODE_ATTEMPTS_EXCEEDED');

    // 锁定后即使输入正确验证码也无法通过，必须重新获取
    const afterLock = await resetPassword(TEST_EMAILS[3], correctCode);
    expect(afterLock.statusCode).toBe(429);

    // 旧密码仍然有效（未被改动）
    expect((await login(TEST_EMAILS[3], OLD_PASSWORD)).statusCode).toBe(200);
  });

  it('重置成功不影响注册验证码（两表独立）', async () => {
    await createUser(TEST_EMAILS[5], OLD_PASSWORD);

    // 同时存在注册验证码与重置验证码
    await app.inject({
      method: 'POST',
      url: '/api/auth/email-code',
      payload: { email: `reg-${TEST_EMAILS[5]}` },
    });
    await sendReset(TEST_EMAILS[5]);
    expect(mails).toHaveLength(2);

    const code = extractCode(mails[1]);
    const response = await resetPassword(TEST_EMAILS[5], code);
    expect(response.statusCode).toBe(204);

    // 重置消费不应触碰注册验证码记录
    const registration = await prisma.emailVerificationCode.findUnique({
      where: { email: `reg-${TEST_EMAILS[5]}` },
    });
    expect(registration?.consumedAt).toBeNull();
  });

  it('格式不合法的请求被直接拒绝', async () => {
    const badCode = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { email: TEST_EMAILS[4], code: '12345', password: NEW_PASSWORD },
    });
    expect(badCode.statusCode).toBe(400);
    expect(badCode.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');

    const badPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      payload: { email: TEST_EMAILS[4], code: '123456', password: 'short' },
    });
    expect(badPassword.statusCode).toBe(400);
    expect(badPassword.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('密码重置邮件模板', () => {
  it('包含品牌、验证码、有效期与安全提示', () => {
    const rendered = renderPasswordResetEmail({ to: 'fan@test.dev', code: '271828', expiresMinutes: 10 });

    expect(rendered.subject).toContain('密码重置');
    expect(rendered.subject).toContain('271828');
    expect(rendered.html).toContain('厚嘴唇空间站');
    expect(rendered.html).toContain('271828');
    expect(rendered.html).toContain('10 分钟内有效');
    expect(rendered.html).toContain('安全提示');
    expect(rendered.html).toContain('如非你本人操作');
    expect(rendered.html).not.toContain('<img');

    expect(rendered.text).toContain('271828');
    expect(rendered.text).toContain('密码不会被修改');
    expect(rendered.text).not.toContain('<');
  });
});
