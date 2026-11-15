export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  /** 限流类错误（如验证码冷却）附带的建议等待秒数，来自后端 error.retryAfterSeconds */
  readonly retryAfterSeconds?: number;

  constructor(status: number, message: string, code?: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue | QueryValue[]>;

export interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'headers'> {
  query?: QueryParams;
  body?: unknown;
  headers?: Record<string, string>;
  /** 单次请求超时毫秒数，默认 20s；超时视为可重试错误 */
  timeoutMs?: number;
  /** 网络异常/超时/网关类错误（408/502/503/504）自动重试次数，默认 0 */
  retries?: number;
}

interface ApiErrorPayload {
  error?: { code?: string; message?: string; retryAfterSeconds?: number };
}

const DEFAULT_TIMEOUT_MS = 20_000;
// 网关类瞬时错误：通常是上游过载或重启，稍等重试即可恢复
const RETRYABLE_STATUS = new Set([408, 502, 503, 504]);

// ===== 401 全局处理 =====
// 会话过期（JWT 失效）时由 AppShell 统一清理本地登录态并引导重新登录。
// /api/auth/* 的 401（如登录密码错误）不触发——那是调用方自己要处理的业务错误。
type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function buildUrl(path: string, query?: QueryParams): string {
  if (!query) {
    return path;
  }

  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined && item !== null) search.append(key, String(item));
      }
    } else if (value !== undefined && value !== null) {
      search.append(key, String(value));
    }
  }

  const qs = search.toString();
  if (!qs) {
    return path;
  }
  return `${path}${path.includes('?') ? '&' : '?'}${qs}`;
}

/** 把未知错误转成用户可读的中文提示 */
export function formatApiError(error: unknown, fallback = '请求失败，请稍后再试'): string {
  if (error instanceof ApiError) {
    if (error.retryAfterSeconds && error.retryAfterSeconds > 0) {
      return `${error.message}（约 ${error.retryAfterSeconds} 秒后可重试）`;
    }
    return error.message || fallback;
  }
  return fallback;
}

interface RequestOptions {
  url: string;
  path: string;
  timeoutMs: number;
  signal?: AbortSignal | null;
  init: RequestInit;
}

async function requestOnce<T>(options: RequestOptions): Promise<T> {
  const { url, path, timeoutMs, signal, init } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) onOuterAbort();
    else signal.addEventListener('abort', onOuterAbort, { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url, { credentials: 'include', ...init, signal: controller.signal });
  } catch (error) {
    // 调用方主动取消：原样抛出让调用方自行处理
    if (signal?.aborted) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(0, 'TIMEOUT', '网络连接超时，请稍后重试');
    }
    throw new ApiError(0, 'NETWORK', '网络连接失败，请检查网络后重试');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }

  if (!response.ok) {
    let message = response.statusText || '请求失败，请稍后再试';
    let code: string | undefined;
    let retryAfterSeconds: number | undefined;
    const text = await response.text();

    if (text) {
      try {
        const data = JSON.parse(text) as ApiErrorPayload;
        message = data.error?.message ?? message;
        code = data.error?.code;
        retryAfterSeconds = data.error?.retryAfterSeconds;
      } catch {
        // 非 JSON 响应直接使用状态文本
      }
    }

    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      for (const listener of unauthorizedListeners) {
        listener();
      }
    }

    throw new ApiError(response.status, message, code, retryAfterSeconds);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { query, body, headers, timeoutMs = DEFAULT_TIMEOUT_MS, retries = 0, ...rest } = options;
  const url = buildUrl(path, query);
  const isFormData = body instanceof FormData;
  // body 预先序列化：重试时复用，避免每次尝试重复构建
  const serializedBody = isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined;
  const init: RequestInit = {
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: serializedBody,
  };

  const maxAttempts = retries + 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (attempt > 0) {
      // 指数退避：600ms、1200ms、2400ms…
      await new Promise((resolve) => setTimeout(resolve, 600 * 2 ** (attempt - 1)));
    }
    try {
      return await requestOnce<T>({ url, path, timeoutMs, signal: rest.signal ?? null, init });
    } catch (error) {
      lastError = error;
      const retryable =
        (error instanceof ApiError && (error.status === 0 || RETRYABLE_STATUS.has(error.status))) ||
        (!(error instanceof ApiError) && error instanceof TypeError);
      if (!retryable || attempt === maxAttempts - 1) {
        throw error;
      }
    }
  }
  throw lastError;
}

export const api = {
  get<T>(path: string, query?: QueryParams, signal?: AbortSignal) {
    return apiFetch<T>(path, { query, signal });
  },
  post<T>(path: string, body?: unknown, options?: Omit<ApiRequestOptions, 'body'>) {
    return apiFetch<T>(path, { method: 'POST', body, ...options });
  },
  put<T>(path: string, body?: unknown) {
    return apiFetch<T>(path, { method: 'PUT', body });
  },
  patch<T>(path: string, body?: unknown) {
    return apiFetch<T>(path, { method: 'PATCH', body });
  },
  delete<T>(path: string, query?: QueryParams) {
    return apiFetch<T>(path, { method: 'DELETE', query });
  },
  postForm<T>(path: string, form: FormData) {
    return apiFetch<T>(path, { method: 'POST', body: form });
  },
};
