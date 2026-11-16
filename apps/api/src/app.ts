import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { env } from './env';
import { registerErrorHandler } from './lib/errors';
import { registerAuthPlugin } from './plugins/auth';
import { adminContentRoutes } from './routes/admin/content';
import { adminDashboardRoutes } from './routes/admin/dashboard';
import { adminReviewRoutes } from './routes/admin/review';
import { adminRulesRoutes } from './routes/admin/rules';
import { adminTagsRoutes } from './routes/admin/tags';
import { adminUsersRoutes } from './routes/admin/users';
import { adminCommentReportRoutes } from './routes/admin/comment-reports';
import { adminSettingsRoutes } from './routes/admin/settings';
import { adminActivitiesRoutes } from './routes/admin/activities';
import { adminGalleryRoutes } from './routes/admin/gallery';
import { authRoutes } from './routes/auth';
import { publicActivitiesRoutes } from './routes/activities';
import { publicGalleryRoutes } from './routes/gallery';
import { publicGroupsRoutes } from './routes/groups';
import { metaRoutes } from './routes/meta';
import { qrcodeRoutes } from './routes/qrcode';
import { publicSitesRoutes } from './routes/sites';
import { seoRoutes } from './routes/seo';
import { submissionsRoutes } from './routes/submissions';
import { tagsRoutes } from './routes/tags';
import { uploadRoutes } from './routes/uploads';
import { userRoutes } from './routes/users';
import { setMailConfigProvider } from './services/mail/mailer';
import { getStoredMailSettings } from './services/mail/settings';

const publicDir = fileURLToPath(new URL('../public', import.meta.url));
const uploadsDir = join(publicDir, 'uploads');

export async function buildApp() {
  // 邮件发送配置：后台「邮件发送设置」（数据库）优先，环境变量兜底
  setMailConfigProvider(async () => {
    const settings = await getStoredMailSettings();
    if (!settings.apiKey) {
      return null;
    }
    return {
      apiKey: settings.apiKey,
      from: settings.from,
      fromName: settings.fromName,
      replyTo: settings.replyTo,
    };
  });

  if (!existsSync(uploadsDir)) {
    mkdirSync(uploadsDir, { recursive: true });
  }

  // 测试环境（fastify.inject）关闭请求日志，避免输出噪音
  // trustProxy 仅在反向代理部署（TRUST_PROXY=true）时开启，避免直连场景伪造 X-Forwarded-For 绕过 IP 限流
  const app = Fastify({ logger: env.nodeEnv !== 'test', trustProxy: env.trustProxy });

  // 安全响应头（XSS/嗅探/缓存等基础防护）；API 以 JSON 与静态上传为主，CSP 走默认策略
  await app.register(helmet);

  // 跨域白名单：配置了 CORS_ORIGINS 时严格匹配；未配置时仅开发环境放行本机调试来源，生产拒绝跨域（同源部署无需跨域）
  await app.register(cors, {
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }
      if (env.corsOrigins) {
        return callback(null, env.corsOrigins.includes(origin));
      }
      if (env.nodeEnv === 'development' && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: env.jwtSecret,
    cookie: { cookieName: 'spaceport_token', signed: false },
  });
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  await app.register(fastifyStatic, {
    root: uploadsDir,
    prefix: '/uploads/',
  });

  registerErrorHandler(app);
  registerAuthPlugin(app);

  app.get('/api/health', async () => ({ ok: true }));

  authRoutes(app);
  uploadRoutes(app);
  userRoutes(app);
  tagsRoutes(app);
  publicGroupsRoutes(app);
  qrcodeRoutes(app);
  publicSitesRoutes(app);
  publicActivitiesRoutes(app);
  publicGalleryRoutes(app);
  metaRoutes(app);
  seoRoutes(app);
  submissionsRoutes(app);
  adminTagsRoutes(app);
  adminRulesRoutes(app);
  adminDashboardRoutes(app);
  adminReviewRoutes(app);
  adminContentRoutes(app);
  adminActivitiesRoutes(app);
  adminGalleryRoutes(app);
  adminUsersRoutes(app);
  adminCommentReportRoutes(app);
  adminSettingsRoutes(app);

  return app;
}
