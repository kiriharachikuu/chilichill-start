import { buildApp } from './app';
import { env } from './env';

async function main() {
  const app = await buildApp();

  if (!env.mailEnabled) {
    app.log.warn('未配置 RESEND_API_KEY：验证码仅输出到后端日志，并随接口返回 devCode');
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
