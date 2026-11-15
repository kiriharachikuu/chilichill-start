import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { env } from '../env';
import { HttpError, isUniqueViolation } from '../lib/errors';
import { enforceRateLimit } from '../lib/rate-limit';
import { prisma } from '../prisma';
import { consumeRegistrationCode, sendRegistrationCode } from '../services/email-verification';
import { resetPassword, sendPasswordResetCode } from '../services/password-reset';

const COOKIE_NAME = 'spaceport_token';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

const emailSchema = z.object({
  email: z.string().trim().email('邮箱格式不正确').max(120, '邮箱过长'),
});

const registerSchema = emailSchema.extend({
  code: z.string().trim().regex(/^[0-9]{6}$/, '请输入 6 位数字验证码'),
  password: z.string().min(8, '密码至少 8 位').max(72, '密码最多 72 位'),
  nickname: z.string().trim().min(1, '昵称不能为空').max(20, '昵称最多 20 个字'),
});

const loginSchema = z.object({
  email: z.string().trim().email('邮箱格式不正确'),
  password: z.string().min(1, '请输入密码'),
});

const resetPasswordSchema = z.object({
  email: z.string().trim().email('邮箱格式不正确').max(120, '邮箱过长'),
  code: z.string().trim().regex(/^[0-9]{6}$/, '请输入 6 位数字验证码'),
  password: z.string().min(8, '密码至少 8 位').max(72, '密码最多 72 位'),
});

interface PublicUser {
  id: string;
  uid: number | null;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
  province: string | null;
  city: string | null;
  role: string;
}

function toPublicUser(user: PublicUser): PublicUser {
  return {
    id: user.id,
    uid: user.uid,
    email: user.email,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    province: user.province,
    city: user.city,
    role: user.role,
  };
}

// 分配 6 位纯数字 uid：取当前最大 uid + 1（100001 起），冲突时重试。
async function createUserWithUid(data: { email: string; nickname: string; passwordHash: string }): Promise<PublicUser> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const last = await prisma.user.findFirst({ orderBy: { uid: 'desc' }, select: { uid: true } });
    const uid = (last?.uid ?? 100000) + 1;
    try {
      return await prisma.user.create({ data: { ...data, uid } });
    } catch (error) {
      // uid 唯一冲突（并发注册）→ 重新取号；邮箱冲突向上抛
      if (isUniqueViolation(error) && attempt < 2) {
        const isEmailConflict = await prisma.user.findUnique({ where: { email: data.email } });
        if (isEmailConflict) {
          throw new HttpError(409, 'EMAIL_TAKEN', '该邮箱已注册');
        }
        continue;
      }
      throw error;
    }
  }
  throw new HttpError(500, 'UID_ASSIGN_FAILED', 'uid 分配失败，请重试');
}

function issueToken(app: FastifyInstance, reply: FastifyReply, user: { id: string; role: string; nickname: string }) {
  const token = app.jwt.sign(
    { sub: user.id, role: user.role, nickname: user.nickname },
    { expiresIn: COOKIE_MAX_AGE },
  );

  reply.setCookie(COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    maxAge: COOKIE_MAX_AGE,
  });
}

export function authRoutes(app: FastifyInstance) {
  // 发送注册邮箱验证码：同邮箱冷却 + 小时配额 + IP 限流，失败重试在邮件服务内完成
  app.post('/api/auth/email-code', async (request, reply) => {
    const body = emailSchema.parse(request.body ?? {});
    const result = await sendRegistrationCode(body.email, request.ip, request.log);
    reply.header('Cache-Control', 'no-store');
    return reply.send(result);
  });

  app.post('/api/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body ?? {});
    const email = body.email.toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new HttpError(409, 'EMAIL_TAKEN', '该邮箱已注册');
    }

    // 先校验验证码再哈希密码，避免错误请求消耗 bcrypt 计算资源
    await consumeRegistrationCode(email, body.code);

    const passwordHash = await bcrypt.hash(body.password, 10);

    const user = await createUserWithUid({ email, nickname: body.nickname, passwordHash });

    issueToken(app, reply, user);
    return reply.status(201).send({ user: toPublicUser(user) });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const body = loginSchema.parse(request.body ?? {});
    const email = body.email.toLowerCase();

    // 登录防爆破：按 IP 与按邮箱双维度限流（成功登录同样计入次数）
    enforceRateLimit({
      key: `login:ip:${request.ip || 'unknown'}`,
      limit: 10,
      windowMs: 60_000,
      code: 'LOGIN_IP_LIMIT',
      message: '登录尝试过于频繁，请稍后再试',
    });
    enforceRateLimit({
      key: `login:email:${email}`,
      limit: 20,
      windowMs: 15 * 60_000,
      code: 'LOGIN_EMAIL_LIMIT',
      message: '该账号登录尝试过于频繁，请 15 分钟后再试',
    });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', '邮箱或密码不正确');
    }

    const matched = await bcrypt.compare(body.password, user.passwordHash);
    if (!matched) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', '邮箱或密码不正确');
    }

    issueToken(app, reply, user);
    return { user: toPublicUser(user) };
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: '/' });
    return reply.status(204).send();
  });

  // 发送密码重置验证码：邮箱不存在时同样返回成功（防探测），不发邮件
  app.post('/api/auth/forgot-password', async (request, reply) => {
    const body = emailSchema.parse(request.body ?? {});
    const result = await sendPasswordResetCode(body.email, request.ip, request.log);
    reply.header('Cache-Control', 'no-store');
    return reply.send(result);
  });

  // 校验验证码并设置新密码；成功后不自动登录，用户需用新密码重新登舱
  app.post('/api/auth/reset-password', async (request, reply) => {
    const body = resetPasswordSchema.parse(request.body ?? {});
    await resetPassword(body.email, body.code, body.password, request.log);
    reply.header('Cache-Control', 'no-store');
    return reply.status(204).send();
  });

  app.get('/api/auth/me', { preHandler: [app.optionalAuthenticate] }, async (request) => {
    if (!request.user) {
      return { user: null };
    }

    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    return { user: user ? toPublicUser(user) : null };
  });
}
