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
}

interface ApiErrorPayload {
  error?: { code?: string; message?: string; retryAfterSeconds?: number };
}

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

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { query, body, headers, ...rest } = options;
  const isFormData = body instanceof FormData;

  const response = await fetch(buildUrl(path, query), {
    credentials: 'include',
    ...rest,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

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

export const api = {
  get<T>(path: string, query?: QueryParams, signal?: AbortSignal) {
    return apiFetch<T>(path, { query, signal });
  },
  post<T>(path: string, body?: unknown) {
    return apiFetch<T>(path, { method: 'POST', body });
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
