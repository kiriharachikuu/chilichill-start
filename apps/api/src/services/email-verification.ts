import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import { env } from '../env';
import { HttpError } from '../lib/errors';
import { prisma } from '../prisma';
import { deliverMail, deliverMailInBackground } from './mail/mailer';
import { isMailConfigured } from './mail/settings';
import { renderVerificationEmail } from './mail/verification-template';

const HOUR_MS = 60 * 60 * 1000;
const CODE_LENGTH = 6;

export interface SendEmailCodeResult {
  expiresInSeconds: number;
  retryAfterSeconds: number;
  /** 仅在开发/测试且未配置邮件服务（后台与环境变量均无 API Key）时返回，方便不接邮件服务也能联调 */
  devCode?: string;
}

// 进程内按 IP 小时限流。SQLite 单实例部署够用；多实例场景需替换为 Redis 等共享存储。
const ipHits = new Map<string, number[]>();

export function resetEmailCodeRateLimits() {
  ipHits.clear();
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || !local) {
    return '***';
  }
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}***@${domain}`;
}

function hashCode(code: string): string {
  return createHash('sha256').update(`${code}:${env.emailCode.secret}`).digest('hex');
}

function hashEquals(input: string, stored: string): boolean {
  const left = Buffer.from(hashCode(input));
  const right = Buffer.from(stored);
  return left.length === right.length && timingSafeEqual(left, right);
}

function generateCode(): string {
  return randomInt(0, 10 ** CODE_LENGTH)
    .toString()
    .padStart(CODE_LENGTH, '0');
}

function enforceIpLimit(ip: string | null | undefined) {
  const key = ip || 'unknown';
  const now = Date.now();
  const recent = (ipHits.get(key) ?? []).filter((time) => now - time < HOUR_MS);

  if (recent.length >= env.emailCode.ipHourlyLimit) {
    ipHits.set(key, recent);
    throw new HttpError(429, 'CODE_IP_LIMIT', '当前网络请求过于频繁，请稍后再试');
  }

  recent.push(now);
  ipHits.set(key, recent);

  // 简单清理，避免长期运行后 Map 无限增长
  if (ipHits.size > 10_000) {
    for (const [hitIp, times] of ipHits) {
      if (times.every((time) => now - time >= HOUR_MS)) {
        ipHits.delete(hitIp);
      }
    }
  }
}

/**
 * 发送注册验证码：校验邮箱占用、IP 限流、同邮箱冷却与小时配额后落库并投递邮件。
 * 验证码只存 SHA-256 摘要；后台发送失败记日志，测试环境同步返回 502；均保留冷却记录。
 */
export async function sendRegistrationCode(
  email: string,
  ip: string | null | undefined,
  log: FastifyBaseLogger,
): Promise<SendEmailCodeResult> {
  const normalized = email.toLowerCase();

  // 生产环境邮件未配置（后台邮件设置与环境变量均无 API Key）时直接拒绝，避免验证码静默落日志
  if (env.isProd && !(await isMailConfigured())) {
    throw new HttpError(502, 'MAIL_SEND_FAILED', '邮件服务未配置，请联系管理员在后台完成邮件设置');
  }

  const existingUser = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true } });
  if (existingUser) {
    throw new HttpError(409, 'EMAIL_TAKEN', '该邮箱已注册，请直接登录');
  }

  enforceIpLimit(ip);

  const now = new Date();
  const record = await prisma.emailVerificationCode.findUnique({ where: { email: normalized } });

  if (record) {
    const cooldownLeft = Math.ceil(
      (record.lastSentAt.getTime() + env.emailCode.cooldownSeconds * 1000 - now.getTime()) / 1000,
    );
    if (cooldownLeft > 0) {
      throw new HttpError(429, 'CODE_COOLDOWN', `发送太频繁，请 ${cooldownLeft} 秒后再试`, cooldownLeft);
    }

    const windowExpired = now.getTime() - record.sendWindowStart.getTime() >= HOUR_MS;
    if (!windowExpired && record.sendCount >= env.emailCode.hourlyLimit) {
      throw new HttpError(429, 'CODE_HOURLY_LIMIT', '该邮箱获取验证码次数过多，请 1 小时后再试');
    }
  }

  const code = generateCode();
  const expiresAt = new Date(now.getTime() + env.emailCode.ttlMinutes * 60 * 1000);
  // 小时窗口结束后重新计数，否则在同一窗口内累加
  const windowExpired = !record || now.getTime() - record.sendWindowStart.getTime() >= HOUR_MS;
  const windowStart = windowExpired ? now : record.sendWindowStart;

  await prisma.emailVerificationCode.upsert({
    where: { email: normalized },
    create: {
      email: normalized,
      codeHash: hashCode(code),
      expiresAt,
      lastSentAt: now,
      sendWindowStart: windowStart,
      sendCount: 1,
    },
    update: {
      codeHash: hashCode(code),
      expiresAt,
      lastSentAt: now,
      sendWindowStart: windowStart,
      sendCount: windowExpired ? 1 : { increment: 1 },
      failedAttempts: 0,
      consumedAt: null,
    },
  });

  const rendered = renderVerificationEmail({
    to: normalized,
    code,
    expiresMinutes: env.emailCode.ttlMinutes,
  });

  // 测试环境同步等待投递结果以便断言 502 失败路径；
  // 生产/开发环境后台投递，避免 Resend 请求超时与重试阻塞接口响应
  if (env.nodeEnv === 'test') {
    const delivery = await deliverMail({
      to: normalized,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    });

    if (!delivery.ok) {
      log.error(
        {
          event: 'email_code.send_failed',
          email: maskEmail(normalized),
          transport: delivery.transport,
          attempts: delivery.attempts,
          durationMs: delivery.durationMs,
          error: delivery.error,
        },
        '注册验证码邮件发送失败',
      );
      throw new HttpError(502, 'MAIL_SEND_FAILED', '验证码邮件发送失败，请稍后重试');
    }

    log.info(
      {
        event: 'email_code.sent',
        email: maskEmail(normalized),
        transport: delivery.transport,
        attempts: delivery.attempts,
        durationMs: delivery.durationMs,
        messageId: delivery.messageId,
        expiresAt: expiresAt.toISOString(),
      },
      '注册验证码邮件已发送',
    );
  } else {
    deliverMailInBackground(
      {
        to: normalized,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      },
      log,
      'email_code',
    );
  }

  return {
    expiresInSeconds: env.emailCode.ttlMinutes * 60,
    retryAfterSeconds: env.emailCode.cooldownSeconds,
    devCode: env.isDev && !(await isMailConfigured()) ? code : undefined,
  };
}

/**
 * 注册前校验验证码：同时核对正确性（摘要比对）与有效性（未消费、未过期、未超错误次数）。
 * 错误码区分「未获取 / 已过期 / 已使用 / 错误次数过多 / 验证码错误」，便于前端给出准确提示。
 */
export async function consumeRegistrationCode(email: string, code: string): Promise<void> {
  const normalized = email.toLowerCase();
  const record = await prisma.emailVerificationCode.findUnique({ where: { email: normalized } });

  if (!record) {
    throw new HttpError(400, 'CODE_NOT_FOUND', '请先获取邮箱验证码');
  }
  if (record.consumedAt) {
    throw new HttpError(400, 'CODE_USED', '该验证码已使用，请重新获取');
  }
  if (record.expiresAt.getTime() <= Date.now()) {
    throw new HttpError(400, 'CODE_EXPIRED', '验证码已过期，请重新获取');
  }
  if (record.failedAttempts >= env.emailCode.maxAttempts) {
    throw new HttpError(429, 'CODE_ATTEMPTS_EXCEEDED', '验证码错误次数过多，请重新获取');
  }

  if (!hashEquals(code, record.codeHash)) {
    const updated = await prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: { failedAttempts: { increment: 1 } },
      select: { failedAttempts: true },
    });
    const remaining = Math.max(0, env.emailCode.maxAttempts - updated.failedAttempts);
    if (remaining === 0) {
      throw new HttpError(429, 'CODE_ATTEMPTS_EXCEEDED', '验证码错误次数过多，请重新获取');
    }
    throw new HttpError(400, 'CODE_INVALID', `验证码不正确，还可尝试 ${remaining} 次`);
  }

  // 条件更新防止并发注册重复消费同一验证码
  const consumed = await prisma.emailVerificationCode.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) {
    throw new HttpError(400, 'CODE_USED', '该验证码已使用，请重新获取');
  }
}
