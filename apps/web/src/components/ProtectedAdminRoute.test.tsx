import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import ProtectedAdminRoute from './ProtectedAdminRoute';

// ProtectedAdminRoute 单测：组件只消费 useAuth 的 user / loading 两个字段，
// 因此用 vi.hoisted 保存可变的最小用户状态，vi.mock 整个 auth 模块（其余方法以 vi.fn 占位），
// 每个用例渲染前直接改写 authMock.user 即可切换登录态，无需真实 AuthProvider 与网络请求。
// 路由断言用 MemoryRouter 包裹：受保护路由是 pathless 布局路由（内部渲染 Outlet 或 Navigate），
// 另配一个 /login 探针路由读取 next 查询参数，验证重定向目标。

interface MockUser {
  id: string;
  role: string;
}

const authMock = vi.hoisted(() => ({
  user: null as { id: string; role: string } | null,
  loading: false,
}));

vi.mock('../lib/auth', () => ({
  useAuth: () => ({
    ...authMock,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

/** 构造最小可用的登录用户，组件只读取 role 字段 */
function makeUser(role: string): MockUser {
  return { id: 'u1', role };
}

/** /login 落地探针：展示重定向携带的 next 查询参数 */
function LoginProbe() {
  const [params] = useSearchParams();
  return (
    <div>
      <div>login-page</div>
      <p data-testid="login-next">{params.get('next') ?? ''}</p>
    </div>
  );
}

function renderAdminRoutes(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route element={<ProtectedAdminRoute />}>
          <Route path="admin" element={<div>admin-content</div>} />
        </Route>
        <Route path="/login" element={<LoginProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedAdminRoute', () => {
  it('未登录时重定向到 /login，且以 next 参数携带当前路径与查询串', () => {
    authMock.user = null;

    renderAdminRoutes('/admin?tab=users');

    expect(screen.getByText('login-page')).toBeInTheDocument();
    expect(screen.queryByText('admin-content')).not.toBeInTheDocument();
    // 组件内对 next 做了 encodeURIComponent，useSearchParams 读取时已解码还原
    expect(screen.getByTestId('login-next')).toHaveTextContent('/admin?tab=users');
  });

  it('已登录但角色为 USER 时显示权限不足提示，不渲染后台内容也不跳转登录页', () => {
    authMock.user = makeUser('USER');

    renderAdminRoutes('/admin');

    expect(screen.getByText('权限不足 · 无法进入控制舱')).toBeInTheDocument();
    expect(screen.getByText('返回首页')).toBeInTheDocument();
    expect(screen.queryByText('admin-content')).not.toBeInTheDocument();
    expect(screen.queryByText('login-page')).not.toBeInTheDocument();
  });

  it('ADMIN 角色通过校验，渲染受保护子路由内容与运营团队文案横幅', () => {
    authMock.user = makeUser('ADMIN');

    renderAdminRoutes('/admin');

    expect(screen.getByText('admin-content')).toBeInTheDocument();
    expect(screen.getByText('已通过运营团队权限校验，当前处于控制舱')).toBeInTheDocument();
  });

  it('MODERATOR 角色同样放行，横幅文案切换为审核组版本', () => {
    authMock.user = makeUser('MODERATOR');

    renderAdminRoutes('/admin');

    expect(screen.getByText('admin-content')).toBeInTheDocument();
    expect(screen.getByText('已通过审核组权限校验，当前仅开放审核相关功能')).toBeInTheDocument();
  });
});
