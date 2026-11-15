import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { env } from '../src/env';
import { prisma } from '../src/prisma';
import { consumeRegistrationCode, resetEmailCodeRateLimits } from '../src/services/email-verification';
import { setMailTransport, type MailMessage } from '../src/services/mail/mailer';
import { renderVerificationEmail } from '../src/services/mail/verification-template';

// 注册邮箱验证码全链路集成测试：签发 → 邮件渲染 → 冷却/配额 → 校验 → 注册
// 邮件用内存传输捕获，避免依赖真实 Resend；所有请求走 fastify.inject。

const TEST_EMAILS = [
  'code-a@test.dev',
  'code-b@test.dev',
  'code-c@test.dev',
  'code-d@test.dev',
  'code-e@test.dev',
  'code-f@test.dev',
];

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

function sendCode(email: string, ip = '10.0.0.1') {
  return app.inject({
    method: 'POST',
    url: '/api/auth/email-code',
    payload: { email },
    remoteAddress: ip,
  });
}

function register(email: string, code: string, overrides: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email,
      code,
      password: 'Passw0rd!',
      nickname: '测试乘客',
      ...overrides,
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
  await prisma.emailVerificationCode.deleteMany({ where: { email: { in: TEST_EMAILS } } });
  await prisma.user.deleteMany({ where: { email: { in: TEST_EMAILS } } });
});

beforeEach(async () => {
  mails = [];
  failuresLeft = 0;
  resetEmailCodeRateLimits();
  await prisma.emailVerificationCode.deleteMany({ where: { email: { in: TEST_EMAILS } } });
  await prisma.user.deleteMany({ where: { email: { in: TEST_EMAILS } } });
});

describe('发送注册验证码', () => {
  it('发送成功并同时投递 HTML 与纯文本模板', async () => {
    const response = await sendCode(TEST_EMAILS[0]);
    expect(response.statusCode).toBe(200);

    const body = response.json<{ expiresInSeconds: number; retryAfterSeconds: number; devCode?: string }>();
    expect(body.expiresInSeconds).toBe(env.emailCode.ttlMinutes * 60);
    expect(body.retryAfterSeconds).toBe(env.emailCode.cooldownSeconds);
    // 测试环境未配置 Resend，devCode 会随响应返回，方便前端联调
    expect(body.devCode).toMatch(/^\d{6}$/);

    expect(mails).toHaveLength(1);
    const mail = mails[0];
    const code = extractCode(mail);
    expect(code).toBe(body.devCode);
    expect(mail.subject).toContain('厚嘴唇空间站');
    expect(mail.subject).toContain(code);
    expect(mail.html).toContain(code);
    expect(mail.text).toContain(code);

    // 数据库只保存摘要，不落明文
    const record = await prisma.emailVerificationCode.findUnique({ where: { email: TEST_EMAILS[0] } });
    expect(record).not.toBeNull();
    expect(record?.codeHash).not.toBe(code);
    expect(record?.codeHash).toHaveLength(64);
    expect(record?.sendCount).toBe(1);
    expect(record?.consumedAt).toBeNull();
  });

  it('同一邮箱冷却期内重复发送被拒绝', async () => {
    expect((await sendCode(TEST_EMAILS[1])).statusCode).toBe(200);

    const second = await sendCode(TEST_EMAILS[1]);
    expect(second.statusCode).toBe(429);
    const body = second.json<{ error: { code: string; message: string } }>();
    expect(body.error.code).toBe('CODE_COOLDOWN');
    expect(body.error.message).toContain('秒后再试');
    expect(mails).toHaveLength(1);
  });

  it('已注册邮箱不再发送验证码', async () => {
    await prisma.user.create({
      data: { email: TEST_EMAILS[2], nickname: '已注册', passwordHash: 'test-only', uid: 900101 },
    });

    const response = await sendCode(TEST_EMAILS[2]);
    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('EMAIL_TAKEN');
    expect(mails).toHaveLength(0);
  });

  it('小时配额达到上限后拒绝继续发送', async () => {
    const email = TEST_EMAILS[3];
    for (let index = 0; index < env.emailCode.hourlyLimit; index += 1) {
      const response = await sendCode(email, '10.0.0.3');
      expect(response.statusCode).toBe(200);
      // 把冷却时间回拨，仅测试小时配额
      await prisma.emailVerificationCode.update({
        where: { email },
        data: { lastSentAt: new Date(Date.now() - 120_000) },
      });
    }

    const blocked = await sendCode(email, '10.0.0.3');
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json<{ error: { code: string } }>().error.code).toBe('CODE_HOURLY_LIMIT');
  });

  it('按 IP 限制短时间内的批量发送', async () => {
    for (let index = 0; index < env.emailCode.ipHourlyLimit; index += 1) {
      const response = await sendCode(`ip-${index}@test.dev`, '10.0.0.9');
      expect(response.statusCode).toBe(200);
    }

    const blocked = await sendCode('ip-over@test.dev', '10.0.0.9');
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json<{ error: { code: string } }>().error.code).toBe('CODE_IP_LIMIT');

    await prisma.emailVerificationCode.deleteMany({ where: { email: { startsWith: 'ip-' } } });
  });
});

describe('邮件服务异常与重试', () => {
  it('首次投递失败后自动重试成功', async () => {
    failuresLeft = 1;

    const response = await sendCode(TEST_EMAILS[0]);
    expect(response.statusCode).toBe(200);
    expect(mails).toHaveLength(1);
  });

  it('重试耗尽后返回 502 且保留冷却记录', async () => {
    failuresLeft = env.mail.maxRetries + 1;

    const response = await sendCode(TEST_EMAILS[1]);
    expect(response.statusCode).toBe(502);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('MAIL_SEND_FAILED');

    const record = await prisma.emailVerificationCode.findUnique({ where: { email: TEST_EMAILS[1] } });
    expect(record).not.toBeNull();

    const retry = await sendCode(TEST_EMAILS[1]);
    expect(retry.statusCode).toBe(429);
    expect(retry.json<{ error: { code: string } }>().error.code).toBe('CODE_COOLDOWN');
  });
});

describe('注册验证码校验', () => {
  it('正确验证码完成注册并一次性消费', async () => {
    const email = TEST_EMAILS[0];
    await sendCode(email);
    const code = extractCode(mails[0]);

    const response = await register(email, code);
    expect(response.statusCode).toBe(201);
    expect(response.json<{ user: { email: string } }>().user.email).toBe(email);
    expect(String(response.headers['set-cookie'])).toContain('spaceport_token=');

    const record = await prisma.emailVerificationCode.findUnique({ where: { email } });
    expect(record?.consumedAt).not.toBeNull();

    await expect(consumeRegistrationCode(email, code)).rejects.toMatchObject({ code: 'CODE_USED' });
  });

  it('未获取验证码时不能注册', async () => {
    const response = await register(TEST_EMAILS[2], '123456');
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('CODE_NOT_FOUND');
  });

  it('验证码过期后不能注册', async () => {
    const email = TEST_EMAILS[3];
    await sendCode(email);
    const code = extractCode(mails[0]);
    await prisma.emailVerificationCode.update({
      where: { email },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await register(email, code);
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: { code: string } }>().error.code).toBe('CODE_EXPIRED');
  });

  it('错误验证码累计到上限后锁定', async () => {
    const email = TEST_EMAILS[4];
    await sendCode(email);
    const correctCode = extractCode(mails[0]);
    const wrongCode = correctCode === '000000' ? '111111' : '000000';

    for (let attempt = 1; attempt < env.emailCode.maxAttempts; attempt += 1) {
      const response = await register(email, wrongCode);
      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: { code: string } }>().error.code).toBe('CODE_INVALID');
    }

    const locked = await register(email, wrongCode);
    expect(locked.statusCode).toBe(429);
    expect(locked.json<{ error: { code: string } }>().error.code).toBe('CODE_ATTEMPTS_EXCEEDED');

    // 锁定后即使输入正确验证码也无法通过，必须重新获取
    const afterLock = await register(email, correctCode);
    expect(afterLock.statusCode).toBe(429);
    expect(afterLock.json<{ error: { code: string } }>().error.code).toBe('CODE_ATTEMPTS_EXCEEDED');
  });

  it('验证码格式不合法时后端直接拒绝', async () => {
    const email = TEST_EMAILS[5];
    await sendCode(email);

    const response = await register(email, '12345');
    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: { code: string; message: string } }>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('6 位数字验证码');
  });
});

describe('验证码邮件模板', () => {
  it('包含品牌、验证码、有效期、安全提示与响应式样式', () => {
    const rendered = renderVerificationEmail({ to: 'fan@test.dev', code: '314159', expiresMinutes: 10 });

    expect(rendered.subject).toContain('314159');
    expect(rendered.html).toContain('<!DOCTYPE html>');
    expect(rendered.html).toContain('lang="zh-CN"');
    expect(rendered.html).toContain('厚嘴唇空间站');
    expect(rendered.html).toContain('314159');
    expect(rendered.html).toContain('10 分钟内有效');
    expect(rendered.html).toContain('安全提示');
    expect(rendered.html).toContain('@media only screen and (max-width: 480px)');
    expect(rendered.html).toContain('class="container"');
    expect(rendered.html).not.toContain('<img');

    expect(rendered.text).toContain('314159');
    expect(rendered.text).toContain('验证码 10 分钟内有效');
    expect(rendered.text).toContain('请勿转发');
    expect(rendered.text).not.toContain('<');
  });
});
