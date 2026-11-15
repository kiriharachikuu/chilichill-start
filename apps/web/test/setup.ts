import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// 每个用例结束后清理已渲染的 DOM，避免用例间互相污染
afterEach(() => {
  cleanup();
});
