import { Suspense } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { buttonClass } from '../components/Button';
import EmptyState from '../components/EmptyState';

export default function ProtectedAdminRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="h-64 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />;
  }

  if (!user) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  if (user.role !== 'ADMIN' && user.role !== 'MODERATOR') {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="权限不足 · 无法进入控制舱"
        description="这里只对站长与审核组成员开放。你可以继续浏览群舱与站点，或使用相应账号登录。"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Link to="/" className={buttonClass({ variant: 'primary', size: 'sm' })}>
              返回首页
            </Link>
            <Link to="/login" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
              切换账号
            </Link>
          </div>
        }
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-2 rounded-xl border border-mint/20 bg-mint/[0.06] px-4 py-2.5 text-xs text-mint">
        <ShieldCheck className="h-4 w-4" />
        {user.role === 'ADMIN'
          ? '已通过站长权限校验，当前处于控制舱'
          : '已通过审核组权限校验，当前仅开放审核相关功能'}
      </div>
      {/* 后台路由按需加载（React.lazy），加载期间展示骨架占位 */}
      <Suspense
        fallback={<div className="h-64 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />}
      >
        <Outlet />
      </Suspense>
    </div>
  );
}
