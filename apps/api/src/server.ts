import { buildApp } from './app';
import { env } from './env';
import { isMailConfigured } from './services/mail/settings';

async function main() {
  const app = await buildApp();

  if (!(await isMailConfigured())) {
    app.log.warn('邮件服务未配置（后台邮件设置与环境变量均无 API Key）：验证码仅输出到后端日志，可在管理后台「系统设置」的邮件发送设置中配置');
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
