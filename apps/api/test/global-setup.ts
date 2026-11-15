import { execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { testDbDir, testDatabaseUrl } from './db-path';

// 每轮测试前重建独立 SQLite 测试库（不影响 dev.db）；Prisma 7 的 db push 已不生成客户端，--skip-generate 被移除
export default function globalSetup() {
  rmSync(testDbDir, { recursive: true, force: true });
  mkdirSync(testDbDir, { recursive: true });
  execSync('npx prisma db push', {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
  });
}
