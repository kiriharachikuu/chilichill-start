import { testDatabaseUrl } from './db-path';

// setupFiles 先于测试模块执行：在 env.ts / prisma.ts 读取环境变量前切到测试库
// （env.ts 的 dotenv/config 不会覆盖已存在的环境变量）
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl;
// 集成测试使用内存传输，不继承本地发信凭据或依赖外部服务。
process.env.RESEND_API_KEY = '';
process.env.MAIL_FROM = '';
// 测试中邮件重试不等待真实退避时间
process.env.MAIL_RETRY_DELAY_MS = '0';
