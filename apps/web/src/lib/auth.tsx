import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Role } from '@spaceport/shared';
import { api } from './api';

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
  register: (email: string, password: string, nickname: string, code: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<AuthUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const data = await api.get<MeResponse>('/api/auth/me');
      setUser(data.user ?? null);
      return data.user ?? null;
    } catch {
      // 后端不可用或未登录，按未登录处理
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    refresh().finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ user: AuthUser }>('/api/auth/login', { email, password });
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (email: string, password: string, nickname: string, code: string) => {
    const data = await api.post<{ user: AuthUser }>('/api/auth/register', {
      email,
      password,
      nickname,
      code,
    });
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post<void>('/api/auth/logout');
    } catch {
      // 退出失败也清空本地状态
    }
    setUser(null);
  }, []);

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
