import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 独立于 dev.db 的测试库路径（临时目录，由 global-setup 重建）
export const testDbDir = join(tmpdir(), 'spaceport-api-tests');
export const testDbFile = join(testDbDir, 'test.db');
// SQLite URL 必须使用正斜杠（Prisma on Windows）
export const testDatabaseUrl = `file:${testDbFile.replace(/\\/g, '/')}`;
