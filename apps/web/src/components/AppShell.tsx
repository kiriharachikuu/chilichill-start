import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import {
  CalendarDays,
  LayoutDashboard,
  Users,
  Globe2,
  Images,
  PenSquare,
  UserCircle,
  Menu,
  X,
  ChevronRight,
  ShieldCheck,
  LogOut,
  Heart,
  Gavel,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { onUnauthorized } from '../lib/api';
import { PERMISSIONS, hasPermission, spaceHref } from '@spaceport/shared';
import { LoginDialogProvider } from './LoginModal';
import { useToast } from './Toast';

interface NavItem {
  to: string;
  label: string;
  english: string;
  icon: ReactNode;
}

const navItems: NavItem[] = [
  { to: '/', label: '首页', english: 'HOME', icon: <LayoutDashboard className="h-5 w-5" /> },
  { to: '/activities', label: '活动', english: 'EVENTS', icon: <CalendarDays className="h-5 w-5" /> },
  { to: '/gallery', label: '画廊', english: 'GALLERY', icon: <Images className="h-5 w-5" /> },
  { to: '/groups', label: '群舱', english: 'GROUPS', icon: <Users className="h-5 w-5" /> },
  { to: '/sites', label: '站点', english: 'SITES', icon: <Globe2 className="h-5 w-5" /> },
];

const authNavItems: NavItem[] = [
  { to: '/me', label: '我的', english: 'ME', icon: <UserCircle className="h-5 w-5" /> },
];

export default function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const { user, logout, refresh } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const isAuthenticated = Boolean(user);
  // 后台管理入口：审核组（MODERATOR）及以上可见，与权限配置表 review:view 对齐
  const canAccessAdmin = hasPermission(user?.role, PERMISSIONS.REVIEW_VIEW);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // 401 统一处理：任一业务接口返回 401（JWT 过期）时清理本地登录态并引导重新登录。
  // 匿名状态下的 401（如未登录点赞）不触发，由调用方自行提示；并发 401 两秒内只处理一次。
  const lastUnauthorizedAtRef = useRef(0);
  useEffect(() => {
    if (!user) return undefined;
    return onUnauthorized(() => {
      const now = Date.now();
      if (now - lastUnauthorizedAtRef.current < 2000) return;
      lastUnauthorizedAtRef.current = now;
      // /api/auth/me 返回空会话 → 本地 user 置空；admin 页面随 ProtectedAdminRoute 自动跳回登录页
      void refresh();
      toast.error('登录状态已过期，请重新登录');
      if (location.pathname !== '/login' && !loginOpen) {
        setLoginOpen(true);
      }
    });
  }, [user, location.pathname, loginOpen, refresh, toast]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileOpen]);

  return (
    <LoginDialogProvider loginOpen={loginOpen} setLoginOpen={setLoginOpen}>
      <div className="min-h-screen bg-space-50 text-ink">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[230px] flex-col border-r-2 border-ink bg-white lg:flex">
        <Link to="/" className="flex items-center gap-3 border-b border-ink px-5 py-5">
          <img src="/logo.png" alt="厚嘴唇空间站" className="h-10 w-10 shrink-0 object-contain" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-black leading-tight tracking-[-0.03em]">厚嘴唇空间站</p>
            <p className="mt-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-amber">
              Route Board
            </p>
          </div>
        </Link>

        <nav className="flex-1 px-0 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                [
                  'flex h-12 items-center justify-between border-l-4 px-5 text-[15px] font-extrabold transition-colors',
                  isActive
                    ? 'border-amber bg-amber-50 text-amber-600'
                    : 'border-transparent text-space-600 hover:bg-space-50 hover:text-ink',
                ].join(' ')
              }
            >
              <span className="flex items-center gap-3">
                {item.icon}
                {item.label}
              </span>
              <span className="font-mono text-[9px] font-bold text-space-300">{item.english}</span>
            </NavLink>
          ))}

          {isAuthenticated &&
            authNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    'flex h-12 items-center justify-between border-l-4 px-5 text-[15px] font-extrabold transition-colors',
                    isActive
                      ? 'border-amber bg-amber-50 text-amber-600'
                      : 'border-transparent text-space-600 hover:bg-space-50 hover:text-ink',
                  ].join(' ')
                }
              >
                <span className="flex items-center gap-3">
                  {item.icon}
                  {item.label}
                </span>
                <span className="font-mono text-[9px] font-bold text-space-300">{item.english}</span>
              </NavLink>
            ))}

        </nav>

        {isAuthenticated ? (
          <div className="space-y-2 px-4 pb-4">
            {canAccessAdmin && (
              <Link
                to="/admin"
                className="flex h-10 w-full items-center justify-center gap-2 border border-ink bg-white text-sm font-black text-ink transition-colors hover:bg-amber-50"
              >
                <ShieldCheck className="h-4 w-4" />
                管理后台
              </Link>
            )}
            <Link
              to="/submit"
              className="flex h-10 w-full items-center justify-center gap-2 bg-ink text-sm font-black text-white transition-colors hover:bg-amber-600"
            >
              <PenSquare className="h-4 w-4" />
              投稿
            </Link>
          </div>
        ) : null}

        <div className="border-t border-ink p-4">
          {isAuthenticated ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden border border-ink bg-white font-black">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt={`${user.nickname} 的头像`} className="h-full w-full object-cover" />
                  ) : (
                    user?.nickname?.[0] ?? '我'
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold">{user?.nickname}</p>
                  {user?.uid != null ? (
                    <Link to={spaceHref(user.uid)} className="text-[10px] text-muted underline-offset-2 hover:text-amber hover:underline">
                      我的空间 · UID {user.uid}
                    </Link>
                  ) : (
                    <p className="text-[10px] text-muted">欢迎回到航线</p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={logout}
                className="flex h-9 w-full items-center justify-center gap-2 border border-ink bg-white text-xs font-bold transition-colors hover:bg-ink hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5" />
                退出登录
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="flex h-10 w-full items-center justify-center bg-ink text-sm font-black text-white transition-colors hover:bg-amber-600"
            >
              登录 / 注册
            </button>
          )}
        </div>
      </aside>

      <div className="relative flex min-w-0 flex-col lg:min-h-screen lg:pl-[230px]">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b-2 border-ink bg-white px-4 lg:hidden">
          <img src="/logo.png" alt="厚嘴唇空间站" className="h-9 w-9 shrink-0 object-contain" />
          <Link to="/" className="min-w-0 flex-1">
            <p className="truncate text-sm font-black leading-tight">厚嘴唇空间站</p>
            <p className="font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-amber">
              Route Board
            </p>
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="打开导航菜单"
            className="flex h-9 w-9 items-center justify-center border border-ink bg-white text-ink"
          >
            <Menu className="h-5 w-5" />
          </button>
        </header>

        <main
          key={location.pathname}
          className={`min-w-0 flex-1${location.pathname === '/redirect' ? '' : ' animate-fade-up'}`}
        >
          <Outlet />
        </main>

        <footer className="mt-auto border-t border-space-200 bg-white px-5 py-6 text-xs text-muted">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1.5">
                <Heart className="h-3.5 w-3.5 text-amber" />
                厚嘴唇空间站 · ChiliChill 粉丝导航
              </span>
              <Link to="/about" className="underline-offset-2 transition-colors hover:text-amber hover:underline">
                关于本站
              </Link>
              <Link to="/terms" className="underline-offset-2 transition-colors hover:text-amber hover:underline">
                用户协议
              </Link>
              <Link to="/privacy" className="underline-offset-2 transition-colors hover:text-amber hover:underline">
                隐私政策
              </Link>
              <Link to="/blackhouse" className="underline-offset-2 transition-colors hover:text-amber hover:underline">
                小黑屋
              </Link>
            </p>
            <p>内容由粉丝投稿，本站不代表官方立场</p>
          </div>
        </footer>
      </div>

      <div
        className={`fixed inset-0 z-[70] lg:hidden ${mobileOpen ? '' : 'pointer-events-none'}`}
        aria-hidden={!mobileOpen}
      >
        <div
          className={`absolute inset-0 bg-ink/35 transition-opacity duration-300 ${
            mobileOpen ? 'opacity-100' : 'opacity-0'
          }`}
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className={`absolute inset-y-0 right-0 flex w-[84%] max-w-sm flex-col border-l-2 border-ink bg-white transition-transform duration-300 ease-out ${
            mobileOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex items-start justify-between border-b border-ink px-5 pb-4 pt-5">
            <div>
              <p className="font-mono text-[11px] italic text-amber">fan archive</p>
              <h2 className="mt-1 text-2xl font-black tracking-[-0.06em]">航线索引</h2>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="关闭导航菜单"
              className="flex h-9 w-9 items-center justify-center border border-ink bg-white text-ink"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-3">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  [
                    'flex h-14 items-center justify-between border-b border-space-200 px-5 text-lg font-black transition-colors',
                    isActive
                      ? 'border-l-4 border-amber bg-amber-50 text-amber-600'
                      : 'border-l-4 border-transparent text-space-700 hover:bg-space-50',
                  ].join(' ')
                }
              >
                <span className="flex items-center gap-3">
                  {item.icon}
                  {item.label}
                </span>
                <ChevronRight className="h-4 w-4 text-space-300" />
              </NavLink>
            ))}

            {isAuthenticated &&
              authNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    [
                      'flex h-14 items-center justify-between border-b border-space-200 px-5 text-lg font-black transition-colors',
                      isActive
                        ? 'border-l-4 border-amber bg-amber-50 text-amber-600'
                        : 'border-l-4 border-transparent text-space-700 hover:bg-space-50',
                    ].join(' ')
                  }
                >
                  <span className="flex items-center gap-3">
                    {item.icon}
                    {item.label}
                  </span>
                  <ChevronRight className="h-4 w-4 text-space-300" />
                </NavLink>
              ))}

          </nav>

          <div className="border-t-2 border-ink p-4">
            {isAuthenticated ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border border-ink font-black">
                    {user?.avatarUrl ? (
                      <img src={user.avatarUrl} alt={`${user.nickname} 的头像`} className="h-full w-full object-cover" />
                    ) : (
                      user?.nickname?.[0] ?? '我'
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{user?.nickname}</p>
                    {user?.uid != null ? (
                      <Link
                        to={spaceHref(user.uid)}
                        onClick={() => setMobileOpen(false)}
                        className="text-[10px] text-muted underline-offset-2 hover:text-amber hover:underline"
                      >
                        我的空间 · UID {user.uid}
                      </Link>
                    ) : (
                      <p className="text-[10px] text-muted">已登录</p>
                    )}
                  </div>
                </div>
                <div className={`grid gap-2 ${canAccessAdmin ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {canAccessAdmin && (
                    <Link
                      to="/admin"
                      onClick={() => setMobileOpen(false)}
                      className="flex h-11 items-center justify-center gap-1.5 border border-ink text-sm font-black transition-colors hover:bg-amber-50"
                    >
                      <ShieldCheck className="h-4 w-4" />
                      管理后台
                    </Link>
                  )}
                  <Link
                    to="/submit"
                    onClick={() => setMobileOpen(false)}
                    className="flex h-11 items-center justify-center gap-1.5 bg-ink text-sm font-black text-white transition-colors hover:bg-amber-600"
                  >
                    <PenSquare className="h-4 w-4" />
                    投稿
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="flex h-11 w-full items-center justify-center gap-2 border border-ink text-sm font-bold hover:bg-ink hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                  退出登录
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  setLoginOpen(true);
                }}
                className="flex h-11 w-full items-center justify-center bg-ink text-sm font-black text-white hover:bg-amber-600"
              >
                登录 / 注册
              </button>
            )}
          </div>
        </aside>
      </div>
      </div>
    </LoginDialogProvider>
  );
}
