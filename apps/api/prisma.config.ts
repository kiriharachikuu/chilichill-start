import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// v6 中 SQLite 相对路径以 schema.prisma 所在目录为基准；
// v7 移除了 schema 内的 url 定义，这里显式解析为绝对路径，保证 dev.db 位置不变。
function resolveDatabaseUrl(url: string | undefined): string {
  const raw = url ?? 'file:./dev.db';
  if (!raw.startsWith('file:')) return raw;
  const filePath = raw.slice('file:'.length);
  if (path.isAbsolute(filePath)) return raw;
  const schemaDir = path.resolve(import.meta.dirname, 'prisma');
  return `file:${path.join(schemaDir, filePath).replace(/\\/g, '/')}`;
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: resolveDatabaseUrl(process.env.DATABASE_URL),
  },
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
});
