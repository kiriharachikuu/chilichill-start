import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Role } from '@spaceport/shared';
import { ApiError, api, formatApiError } from './api';

export type { Role };

export interface AuthUser {
  id: string;
  uid: number | null;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
  province: string | null;
  city: string | null;
  role: Role;
}

interface MeResponse {
  user: AuthUser | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  /** code 为 null 表示注册无需邮箱验证码（后台开关关闭） */
  register: (email: string, password: string, nickname: string, code: string | null) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ===== 本地权限缓存 =====
// 后端瞬时不可用（重启/网络抖动）时 /api/auth/me 会失败，若因此把 user 清空，
// 合法管理员会被 ProtectedAdminRoute 误踢回登录页。用 localStorage 缓存最近一次
// 校验通过的用户信息兜底，刷新接口恢复后再以服务端结果为准。
const USER_CACHE_KEY = 'spaceport_user_cache';
const REFRESH_MAX_ATTEMPTS = 3;
const REFRESH_RETRY_BASE_MS = 600;

function readCachedUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (
      parsed &&
      typeof parsed.id === 'string' &&
      typeof parsed.email === 'string' &&
      typeof parsed.role === 'string'
    ) {
      return parsed as AuthUser;
    }
    return null;
  } catch (error) {
    console.warn('[auth] 读取本地权限缓存失败，已忽略', error);
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => readCachedUser());
  const [loading, setLoading] = useState(true);
  const userRef = useRef<AuthUser | null>(null);

  const applyUser = useCallback((next: AuthUser | null) => {
    userRef.current = next;
    setUser(next);
    try {
      if (next) {
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(next));
      } else {
        localStorage.removeItem(USER_CACHE_KEY);
      }
    } catch (error) {
      // 隐私模式等场景写入失败不影响主流程
      console.warn('[auth] 写入本地权限缓存失败', error);
    }
  }, []);

  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    // 未登录是正常响应（200 + user:null）→ 清空本地登录态；
    // 网络/服务端异常 → 保留当前登录态并自动重试，避免把合法权限用户误判为未登录
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= REFRESH_MAX_ATTEMPTS; attempt += 1) {
      try {
        const data = await api.get<MeResponse>('/api/auth/me');
        applyUser(data.user ?? null);
        return data.user ?? null;
      } catch (error) {
        lastError = error;
        console.warn(`[auth] 权限校验第 ${attempt}/${REFRESH_MAX_ATTEMPTS} 次失败，保留本地登录态并自动重试`, {
          message: error instanceof Error ? error.message : String(error),
          status: error instanceof ApiError ? error.status : undefined,
          timestamp: new Date().toISOString(),
        });
        if (attempt < REFRESH_MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, REFRESH_RETRY_BASE_MS * attempt));
        }
      }
    }
    console.error('[auth] 权限校验连续失败，继续使用本地缓存的登录态', formatApiError(lastError));
    return userRef.current;
  }, [applyUser]);

  useEffect(() => {
    let alive = true;
    refresh().finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.post<{ user: AuthUser }>('/api/auth/login', { email, password });
      applyUser(data.user);
      return data.user;
    },
    [applyUser],
  );

  const registerInFlightRef = useRef(new Map<string, Promise<AuthUser>>());

  const register = useCallback(
    async (email: string, password: string, nickname: string, code: string | null) => {
      const key = email.trim().toLowerCase();
      // 请求排队：同一邮箱的重复注册提交复用同一个在途请求，
      // 高并发下用户多点几次提交不会发出多份请求放大服务端压力
      const inFlight = registerInFlightRef.current.get(key);
      if (inFlight) return inFlight;

      const promise = (async () => {
        try {
          // 无需验证码时不携带 code 字段（后端对非空 code 强制 6 位数字格式）
          const data = await api.post<{ user: AuthUser }>(
            '/api/auth/register',
            code ? { email: key, password, nickname, code } : { email: key, password, nickname },
            // 注册高峰期 bcrypt 计算会在服务端排队，放宽超时并开启网络级自动重试
            { timeoutMs: 30_000, retries: 2 },
          );
          applyUser(data.user);
          return data.user;
        } catch (error) {
          // 前一次请求客户端超时但服务端实际已成功时，自动重试会撞到 EMAIL_TAKEN：
          // 用会话接口确认当前 cookie 是否就是刚注册的账号，是则视为注册成功
          if (error instanceof ApiError && error.status === 409 && error.code === 'EMAIL_TAKEN') {
            try {
              const me = await api.get<MeResponse>('/api/auth/me');
              if (me.user && me.user.email.toLowerCase() === key) {
                console.info('[auth] 注册撞到 EMAIL_TAKEN 但会话已匹配该邮箱，视为注册成功');
                applyUser(me.user);
                return me.user;
              }
            } catch (verifyError) {
              console.warn('[auth] 注册冲突后的会话确认失败', formatApiError(verifyError));
            }
          }
          throw error;
        } finally {
          registerInFlightRef.current.delete(key);
        }
      })();

      registerInFlightRef.current.set(key, promise);
      return promise;
    },
    [applyUser],
  );

  const logout = useCallback(async () => {
    try {
      await api.post<void>('/api/auth/logout');
    } catch {
      // 退出失败也清空本地状态
    }
    applyUser(null);
  }, [applyUser]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内使用');
  }
  return context;
}
