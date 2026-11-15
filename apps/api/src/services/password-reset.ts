import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { FastifyBaseLogger } from 'fastify';
import { env } from '../env';
import { HttpError } from '../lib/errors';
import { enforceRateLimit } from '../lib/rate-limit';
import { prisma } from '../prisma';
import { deliverMail, deliverMailInBackground } from './mail/mailer';
import { isMailConfigured } from './mail/settings';
import { renderPasswordResetEmail } from './mail/password-reset-template';

const HOUR_MS = 60 * 60 * 1000;
const CODE_LENGTH = 6;

export interface SendPasswordResetResult {
  expiresInSeconds: number;
  retryAfterSeconds: number;
  /** 仅在开发/测试且未配置邮件服务（后台与环境变量均无 API Key）时返回，方便不接邮件服务也能联调 */
  devCode?: string;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain || !local) {
    return '***';
  }
  const head = local.slice(0, Math.min(2, local.length));
  return `${head}***@${domain}`;
}

// 与注册验证码共用 JWT_SECRET 派生，但盐不同：同一验证码在两张表中的摘要互不相通
function hashCode(code: string): string {
  return createHash('sha256').update(`${code}:${env.jwtSecret}:password-reset-code`).digest('hex');
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

/**
 * 发送密码重置验证码：IP 限流 + 同邮箱冷却与小时配额后落库并投递邮件。
 * 邮箱不存在时同样返回成功（响应结构与存在时一致），但不投递邮件，
 * 避免通过该接口探测站内注册邮箱（注册验证码接口本就会返回 409，双重防护）。
 * 验证码只存 SHA-256 摘要；后台发送失败记日志，测试环境同步返回 502；均保留冷却记录。
 */
export async function sendPasswordResetCode(
  email: string,
  ip: string | null | undefined,
  log: FastifyBaseLogger,
): Promise<SendPasswordResetResult> {
  const normalized = email.toLowerCase();

  // 生产环境邮件未配置时直接拒绝，避免重置验证码静默落日志导致用户无法重置密码
  if (env.isProd && !(await isMailConfigured())) {
    throw new HttpError(502, 'MAIL_SEND_FAILED', '邮件服务未配置，请联系管理员在后台完成邮件设置');
  }

  enforceRateLimit({
    key: `pwreset:ip:${ip || 'unknown'}`,
    limit: env.emailCode.ipHourlyLimit,
    windowMs: HOUR_MS,
    code: 'CODE_IP_LIMIT',
    message: '当前网络请求过于频繁，请稍后再试',
  });

  const user = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true } });

  const genericResult: SendPasswordResetResult = {
    expiresInSeconds: env.emailCode.ttlMinutes * 60,
    retryAfterSeconds: env.emailCode.cooldownSeconds,
  };

  if (!user) {
    // 邮箱未注册：返回与成功一致的响应，不创建记录、不发邮件
    return genericResult;
  }

  const now = new Date();
  const record = await prisma.passwordResetCode.findUnique({ where: { email: normalized } });

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
  const windowExpired = !record || now.getTime() - record.sendWindowStart.getTime() >= HOUR_MS;
  const windowStart = windowExpired ? now : record.sendWindowStart;

  await prisma.passwordResetCode.upsert({
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

  const rendered = renderPasswordResetEmail({
    to: normalized,
    code,
    expiresMinutes: env.emailCode.ttlMinutes,
  });

  // 测试环境同步等待投递结果以便断言 502 失败路径；生产/开发环境后台投递不阻塞响应
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
          event: 'password_reset.send_failed',
          email: maskEmail(normalized),
          transport: delivery.transport,
          attempts: delivery.attempts,
          durationMs: delivery.durationMs,
          error: delivery.error,
        },
        '密码重置验证码邮件发送失败',
      );
      throw new HttpError(502, 'MAIL_SEND_FAILED', '验证码邮件发送失败，请稍后重试');
    }

    log.info(
      {
        event: 'password_reset.sent',
        email: maskEmail(normalized),
        transport: delivery.transport,
        attempts: delivery.attempts,
        durationMs: delivery.durationMs,
        messageId: delivery.messageId,
        expiresAt: expiresAt.toISOString(),
      },
      '密码重置验证码邮件已发送',
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
      'password_reset',
    );
  }

  return {
    expiresInSeconds: env.emailCode.ttlMinutes * 60,
    retryAfterSeconds: env.emailCode.cooldownSeconds,
    devCode: env.isDev && !(await isMailConfigured()) ? code : undefined,
  };
}

/**
 * 校验重置验证码并更新密码。验证码一次性使用（条件更新防并发重复消费），
 * 错误次数、过期、已使用等判定与注册验证码一致。
 */
export async function resetPassword(
  email: string,
  code: string,
  newPassword: string,
  log: FastifyBaseLogger,
): Promise<void> {
  const normalized = email.toLowerCase();
  const record = await prisma.passwordResetCode.findUnique({ where: { email: normalized } });

  if (!record) {
    throw new HttpError(400, 'CODE_NOT_FOUND', '请先获取密码重置验证码');
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
    const updated = await prisma.passwordResetCode.update({
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

  // 条件更新防止并发请求重复消费同一验证码
  const consumed = await prisma.passwordResetCode.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) {
    throw new HttpError(400, 'CODE_USED', '该验证码已使用，请重新获取');
  }

  const user = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true } });
  if (!user) {
    // 理论上不可达（发码时已确认用户存在），防御性兜底
    throw new HttpError(400, 'CODE_NOT_FOUND', '请先获取密码重置验证码');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  log.info(
    { event: 'password_reset.completed', userId: user.id },
    '密码重置完成',
  );
}
