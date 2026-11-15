import path from 'node:path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from './generated/prisma/client';
import { env } from './env';

// Prisma 7 使用驱动适配器直连数据库；better-sqlite3 的相对路径以进程 CWD 为基准，
// 这里统一按 v6 语义（相对于 prisma/ 目录）解析为绝对路径，避免 dev.db 位置漂移。
function resolveDatabaseUrl(url: string): string {
  if (!url.startsWith('file:')) return url;
  const filePath = url.slice('file:'.length);
  if (path.isAbsolute(filePath)) return url;
  const schemaDir = path.resolve(import.meta.dirname, '..', 'prisma');
  return `file:${path.join(schemaDir, filePath).replace(/\\/g, '/')}`;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: resolveDatabaseUrl(env.databaseUrl) }),
    // 测试环境静默（并发用例会主动触发唯一约束冲突，避免日志噪音）
    log: env.nodeEnv === 'test' ? [] : env.isDev ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.isDev) {
  globalForPrisma.prisma = prisma;
}
