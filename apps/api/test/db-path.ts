import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 独立于 dev.db 的测试库路径（临时目录，由 global-setup 重建）；
// 可用 SPACEPORT_TEST_DB_DIR 指定独立目录，避免多轮测试并行时争抢 SQLite 文件锁
export const testDbDir =
  process.env.SPACEPORT_TEST_DB_DIR ?? join(tmpdir(), 'spaceport-api-tests');
export const testDbFile = join(testDbDir, 'test.db');
// SQLite URL 必须使用正斜杠（Prisma on Windows）
export const testDatabaseUrl = `file:${testDbFile.replace(/\\/g, '/')}`;
