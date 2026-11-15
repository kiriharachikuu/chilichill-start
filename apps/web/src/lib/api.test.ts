import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, onUnauthorized } from './api';

// apiFetch 封装层单测：用最小响应结构 mock 全局 fetch。
// 注意 401 的统一处理不是直接跳转登录页，而是通过 onUnauthorized 广播给 AppShell，
// 且 /api/auth/* 下的 401 属于登录表单自身的业务错误，不触发全局广播。

/** jsdom 环境没有原生 fetch/Response，这里只构造 apiFetch 用到的最小响应形状 */
function mockResponse(status: number, body: unknown, statusText = ''): Response {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    text: () => Promise.resolve(text),
  } as unknown as Response;
}

/** 断言 promise 以 ApiError 形式 reject，并返回该错误供后续属性断言 */
async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  const caught = await promise.then(
    () => {
      throw new Error('预期抛出 ApiError，但 apiFetch 正常返回了');
    },
    (error: unknown) => error,
  );
  expect(caught).toBeInstanceOf(ApiError);
  return caught as ApiError;
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('2xx JSON 响应正常解包，请求默认携带 credentials 与 Accept 头', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(200, { user: { id: 'u1' } }));

    const data = await apiFetch<{ user: { id: string } }>('/api/auth/me');

    expect(data).toEqual({ user: { id: 'u1' } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ Accept: 'application/json' }),
      }),
    );
  });

  it('传入 body 时自动 JSON 序列化并设置 Content-Type', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(200, { ok: true }));

    await apiFetch<{ ok: boolean }>('/api/demo', { method: 'POST', body: { email: 'a@b.dev' } });

    expect(fetch).toHaveBeenCalledWith(
      '/api/demo',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.dev' }),
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    );
  });

  it('204 响应返回 undefined', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(204, undefined));

    const data = await apiFetch<void>('/api/demo', { method: 'DELETE' });

    expect(data).toBeUndefined();
  });

  it('非 2xx 返回 { error: { code, message, retryAfterSeconds } } 时抛出 ApiError 且属性正确', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse(403, { error: { code: 'FORBIDDEN', message: '无权限执行该操作', retryAfterSeconds: 30 } }),
    );

    const error = await expectApiError(apiFetch('/api/secret'));

    expect(error.status).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
    expect(error.message).toBe('无权限执行该操作');
    expect(error.retryAfterSeconds).toBe(30);
    expect(error.name).toBe('ApiError');
  });

  it('非 2xx 且响应体为空时，message 回退为状态文本', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(500, '', 'Internal Server Error'));

    const error = await expectApiError(apiFetch('/api/demo'));

    expect(error.status).toBe(500);
    expect(error.code).toBeUndefined();
    expect(error.message).toBe('Internal Server Error');
  });

  it('非 auth 路径的 401 会广播 onUnauthorized 监听器并抛出 ApiError', async () => {
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse(401, { error: { code: 'UNAUTHORIZED', message: '会话已过期' } }),
    );

    try {
      const error = await expectApiError(apiFetch('/api/secret'));
      expect(error.status).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      off();
    }
  });

  it('/api/auth/* 下的 401 属于业务错误，不触发全局监听器', async () => {
    const listener = vi.fn();
    const off = onUnauthorized(listener);
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse(401, { error: { code: 'BAD_CREDENTIALS', message: '邮箱或密码错误' } }),
    );

    try {
      const error = await expectApiError(apiFetch('/api/auth/login', { method: 'POST', body: {} }));
      expect(error.status).toBe(401);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      off();
    }
  });
});
