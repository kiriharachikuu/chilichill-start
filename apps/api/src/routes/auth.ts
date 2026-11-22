import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { env } from '../env';
import { HttpError, isUniqueViolation } from '../lib/errors';
import { enforceRateLimit, withQueue } from '../lib/rate-limit';
import { prisma } from '../prisma';
import { consumeRegistrationCode, sendRegistrationCode } from '../services/email-verification';
import { getStoredRegistrationSettings } from '../services/registration-settings';
import { resetPassword, sendPasswordResetCode } from '../services/password-reset';
import { getActiveMute } from '../services/penalty';
import type { UserPenaltyState } from '@spaceport/shared';

const COOKIE_NAME = 'spaceport_token';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
// 勾选「60 天内免登录」时下发 60 天持久 Cookie
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 60;

const emailSchema = z.object({
  email: z.string().trim().email('邮箱格式不正确').max(120, '邮箱过长'),
});

const registerSchema = emailSchema.extend({
  // 验证码仅在后台开关开启时必填（见 register 路由内的条件校验）
  code: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, '请输入 6 位数字验证码')
    .optional(),
  password: z.string().min(8, '密码至少 8 位').max(72, '密码最多 72 位'),
  nickname: z.string().trim().min(1, '昵称不能为空').max(20, '昵称最多 20 个字'),
  // 合规要求：注册必须显式同意用户协议与隐私政策，同意时间与版本号落库
  agreedPolicy: z.literal(true, { message: '请先阅读并同意用户协议与隐私政策' }),
});

// 隐私政策当前版本：内容有实质变更时更新（对应前端 /privacy 页 POLICY_VERSION）
export const POLICY_VERSION = 'v3.0';

const loginSchema = z.object({
  email: z.string().trim().email('邮箱格式不正确'),
  password: z.string().min(1, '请输入密码'),
  // 勾选「60 天内免登录」时下发持久 Cookie，否则为会话 Cookie（关闭浏览器即失效）
  remember: z.boolean().optional(),
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
  bannerUrl: string | null;
  bio: string | null;
  province: string | null;
  city: string | null;
  role: string;
  penalty: UserPenaltyState;
}

interface UserRow {
  id: string;
  uid: number | null;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  province: string | null;
  city: string | null;
  role: string;
  warningCount: number;
  muteCount: number;
  bannedAt: Date | null;
  createdAt: Date;
}

function toPublicUser(user: UserRow, mutedUntil: string | null = null): PublicUser {
  return {
    id: user.id,
    uid: user.uid,
    email: user.email,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl,
    bio: user.bio,
    province: user.province,
    city: user.city,
    role: user.role,
    penalty: {
      banned: Boolean(user.bannedAt),
      mutedUntil,
      warningCount: user.warningCount,
      muteCount: user.muteCount,
    },
  };
}

// 分配 6 位纯数字 uid：取当前最大 uid + 1（100001 起），冲突时重试。
// role 供管理后台代注册时指定用户组，公开注册固定为默认 USER。
export async function createUserWithUid(data: {
  email: string;
  nickname: string;
  passwordHash: string;
  policyConsentAt: Date;
  policyConsentVersion: string;
  role?: string;
}): Promise<UserRow> {
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

function issueToken(
  app: FastifyInstance,
  reply: FastifyReply,
  user: { id: string; role: string; nickname: string },
  maxAge: number | null = COOKIE_MAX_AGE,
) {
  const token = app.jwt.sign(
    { sub: user.id, role: user.role, nickname: user.nickname },
    { expiresIn: maxAge ?? COOKIE_MAX_AGE },
  );

  reply.setCookie(COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.nodeEnv === 'production',
    // maxAge 为 null 时不下发 Max-Age，生成会话 Cookie：关闭浏览器后自动退出登录
    ...(maxAge === null ? {} : { maxAge }),
  });
}

export function authRoutes(app: FastifyInstance) {
  // 发送注册邮箱验证码：同邮箱冷却 + 小时配额 + IP 限流，失败重试在邮件服务内完成
  app.post('/api/auth/email-code', async (request, reply) => {
    const body = emailSchema.parse(request.body ?? {});

    // 后台关闭注册邮箱验证码时，本接口不再发送
    if (!(await getStoredRegistrationSettings()).emailCodeRequired) {
      throw new HttpError(400, 'CODE_DISABLED', '注册邮箱验证码未开启，可直接注册');
    }

    const result = await sendRegistrationCode(body.email, request.ip, request.log);
    reply.header('Cache-Control', 'no-store');
    return reply.send(result);
  });

  app.post('/api/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body ?? {});
    const email = body.email.toLowerCase();

    // 注册防刷限流：阈值放宽（多用户共用出口 IP 不误伤），只拦脚本刷注册
    enforceRateLimit({
      key: `register:ip:${request.ip || 'unknown'}`,
      limit: 30,
      windowMs: 60_000,
      code: 'REGISTER_IP_LIMIT',
      message: '注册请求过于频繁，请稍后再试',
    });

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new HttpError(409, 'EMAIL_TAKEN', '该邮箱已注册');
    }

    // 注册邮箱验证码开关（后台可配）：开启时必填并消费验证码，关闭时跳过
    const registrationSettings = await getStoredRegistrationSettings();
    if (registrationSettings.emailCodeRequired && !body.code) {
      throw new HttpError(400, 'VALIDATION_ERROR', '请输入 6 位数字验证码');
    }

    // 高并发过载保护：bcrypt 哈希是 CPU 密集操作，超并发上限的请求排队处理，
    // 队列满/等待超时返回友好提示（带 retryAfterSeconds），而不是请求堆积到客户端超时
    const user = await withQueue(
      {
        key: 'register',
        concurrency: 4,
        maxWaiting: 100,
        waitTimeoutMs: 10_000,
        code: 'REGISTER_BUSY',
        busyMessage: '当前注册人数较多，正在排队处理，请稍候几秒后重试',
      },
      async () => {
        // 验证码校验与消费放在排队获许之后：排队超时的请求不会浪费验证码
        if (registrationSettings.emailCodeRequired && body.code) {
          await consumeRegistrationCode(email, body.code);
        }
        const passwordHash = await bcrypt.hash(body.password, 10);
        return createUserWithUid({
          email,
          nickname: body.nickname,
          passwordHash,
          policyConsentAt: new Date(),
          policyConsentVersion: POLICY_VERSION,
        });
      },
    );

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

    // 封号用户禁止登录（放在密码验证通过之后提示，避免向未授权者泄露封号状态）
    if (user.bannedAt) {
      throw new HttpError(403, 'ACCOUNT_BANNED', '该账号已被永久封禁，禁止登录');
    }

    // 勾选「60 天内免登录」→ 持久 Cookie；未勾选 → 会话 Cookie，关闭浏览器后自动登出
    issueToken(app, reply, user, body.remember ? REMEMBER_MAX_AGE : null);
    const activeMute = await getActiveMute(user.id);
    return { user: toPublicUser(user, activeMute?.endsAt ? activeMute.endsAt.toISOString() : null) };
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

    // optionalAuthenticate 不做封号拦截：封号用户仍能读取自身信息（含处罚状态），便于前端展示封禁提示
    const user = await prisma.user.findUnique({ where: { id: request.user.sub } });
    if (!user) {
      return { user: null };
    }
    const activeMute = await getActiveMute(user.id);
    return { user: toPublicUser(user, activeMute?.endsAt ? activeMute.endsAt.toISOString() : null) };
  });
}
