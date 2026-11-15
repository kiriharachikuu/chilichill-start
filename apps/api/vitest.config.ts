import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // SQLite 文件库串行执行，避免多进程写锁冲突
    // （Vitest 4 起移除 poolOptions/singleFork，fileParallelism=false 即文件级串行）
    fileParallelism: false,
  },
});
