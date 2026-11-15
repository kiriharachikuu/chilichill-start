import { buildApp } from './app';
import { env } from './env';

async function main() {
  const app = await buildApp();

  if (!env.mailEnabled) {
    const message = env.isDev
      ? '未配置 SMTP_HOST：注册验证码只会打印到后端日志，并随接口返回 devCode'
      : '未配置 SMTP_HOST：生产环境无法真实发送注册验证码，请尽快配置邮件服务';
    app.log.warn(message);
  }

  try {
    await app.listen({ port: env.port, host: '0.0.0.0' });
    app.log.info(`厚嘴唇空间站 API 已启动：${env.publicBaseUrl} (port ${env.port})`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
