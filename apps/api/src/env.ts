import 'dotenv/config';
import { z } from 'zod';

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

// 密码类配置不做 trim，避免密钥首尾空格被静默吞掉
const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

const optionalBoolean = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().min(1).default('file:./dev.db'),
  JWT_SECRET: z.string().min(1).default('spaceport-dev-secret-change-me'),
  // 部署在反向代理（Nginx 等）之后才开启，否则客户端可伪造 X-Forwarded-For 绕过 IP 限流
  TRUST_PROXY: optionalBoolean,
  // 跨域白名单，逗号分隔，例如 https://a.com,https://b.com；生产未配置时拒绝所有跨域
  CORS_ORIGINS: optionalString,
  API_PORT: z.coerce.number().int().positive().default(3001),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3001'),
  COS_SECRET_ID: optionalString,
  COS_SECRET_KEY: optionalString,
  COS_BUCKET: optionalString,
  COS_REGION: optionalString,
  COS_BASE_URL: optionalString,
  // 共享存储桶隔离：上传对象统一落在该目录前缀下（如 spaceport/uploads/2026/11/...），默认 spaceport
  COS_KEY_PREFIX: optionalString,
  // Resend：密钥仅在后端读取；未配置时仅允许开发/测试使用控制台传输
  RESEND_API_KEY: optionalSecret,
  MAIL_FROM: optionalString.pipe(z.string().email('MAIL_FROM 必须是纯邮箱地址').optional()),
  MAIL_FROM_NAME: z.string().trim().min(1).default('厚嘴唇空间站'),
  MAIL_REPLY_TO: optionalString,
  MAIL_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  MAIL_RETRY_DELAY_MS: z.coerce.number().int().min(0).max(60_000).default(800),
  EMAIL_CODE_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  EMAIL_CODE_COOLDOWN_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
  EMAIL_CODE_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  EMAIL_CODE_HOURLY_LIMIT: z.coerce.number().int().min(1).max(50).default(5),
  EMAIL_CODE_IP_HOURLY_LIMIT: z.coerce.number().int().min(1).max(200).default(20),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('环境变量校验失败:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

const raw = parsed.data;

// 生产环境强制要求强随机 JWT 密钥：默认开发密钥或过短密钥直接拒绝启动，
// 防止漏配时用源码内公开值签发 token（可伪造 ADMIN 会话）。
if (raw.NODE_ENV === 'production') {
  if (raw.JWT_SECRET === 'spaceport-dev-secret-change-me') {
    throw new Error('生产环境必须通过 JWT_SECRET 配置随机密钥，不能使用内置开发默认值');
  }
  if (raw.JWT_SECRET.length < 32) {
    throw new Error('生产环境 JWT_SECRET 长度必须至少 32 位');
  }
  if (!raw.RESEND_API_KEY) {
    throw new Error('生产环境必须配置 RESEND_API_KEY 才能发送验证码邮件');
  }
}

if (raw.RESEND_API_KEY && !raw.MAIL_FROM) {
  throw new Error('启用 Resend 时必须配置 MAIL_FROM，使用 Resend 中已验证域名的发件地址');
}

const corsOrigins = raw.CORS_ORIGINS
  ? raw.CORS_ORIGINS.split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean)
  : null;
const cos = {
  secretId: raw.COS_SECRET_ID ?? null,
  secretKey: raw.COS_SECRET_KEY ?? null,
  bucket: raw.COS_BUCKET ?? null,
  region: raw.COS_REGION ?? null,
  baseUrl: raw.COS_BASE_URL ?? null,
  keyPrefix: raw.COS_KEY_PREFIX ?? 'spaceport',
};

const mail = {
  apiKey: raw.RESEND_API_KEY ?? null,
  from: raw.MAIL_FROM ?? 'no-reply@spaceport.local',
  fromName: raw.MAIL_FROM_NAME,
  replyTo: raw.MAIL_REPLY_TO ?? null,
  maxRetries: raw.MAIL_MAX_RETRIES,
  retryDelayMs: raw.MAIL_RETRY_DELAY_MS,
};

export const env = {
  nodeEnv: raw.NODE_ENV,
  isDev: raw.NODE_ENV !== 'production',
  isProd: raw.NODE_ENV === 'production',
  trustProxy: raw.TRUST_PROXY ?? false,
  corsOrigins,
  databaseUrl: raw.DATABASE_URL,
  jwtSecret: raw.JWT_SECRET,
  port: raw.API_PORT,
  publicBaseUrl: raw.PUBLIC_BASE_URL.replace(/\/+$/, ''),
  cos,
  cosEnabled: Boolean(cos.secretId && cos.secretKey && cos.bucket && cos.region),
  mail,
  // 未配置 Resend 时，开发/测试使用控制台传输；生产环境已在上方拒绝缺失配置
  mailEnabled: Boolean(mail.apiKey),
  emailCode: {
    secret: `${raw.JWT_SECRET}:email-code`,
    ttlMinutes: raw.EMAIL_CODE_TTL_MINUTES,
    cooldownSeconds: raw.EMAIL_CODE_COOLDOWN_SECONDS,
    maxAttempts: raw.EMAIL_CODE_MAX_ATTEMPTS,
    hourlyLimit: raw.EMAIL_CODE_HOURLY_LIMIT,
    ipHourlyLimit: raw.EMAIL_CODE_IP_HOURLY_LIMIT,
  },
};
