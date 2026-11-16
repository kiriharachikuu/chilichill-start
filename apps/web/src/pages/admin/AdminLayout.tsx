import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  ClipboardCheck,
  Flag,
  CloudCog,
  Layers,
  LayoutDashboard,
  Map,
  Tags,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { MetaResponse, Permission } from '@spaceport/shared';
import { PERMISSIONS, hasPermission } from '@spaceport/shared';
import { EMPTY_META, loadMeta } from '../../lib/meta';
import { useAuth } from '../../lib/auth';
import { buttonClass } from '../../components/Button';

const ADMIN_NAV: { to: string; label: string; icon: LucideIcon; end?: boolean; permission?: Permission }[] = [
  { to: '/admin', label: '仪表盘', icon: LayoutDashboard, end: true },
  { to: '/admin/review', label: '审核台', icon: ClipboardCheck, permission: PERMISSIONS.REVIEW_VIEW },
  { to: '/admin/reports', label: '举报管理', icon: Flag, permission: PERMISSIONS.REPORT_MANAGE },
  { to: '/admin/content', label: '内容管理', icon: Layers, permission: PERMISSIONS.CONTENT_MANAGE },
  { to: '/admin/activities', label: '活动管理', icon: CalendarDays, permission: PERMISSIONS.CONTENT_MANAGE },
  { to: '/admin/tags', label: '标签管理', icon: Tags, permission: PERMISSIONS.CONTENT_MANAGE },
  { to: '/admin/rules', label: '分类规则', icon: Map, permission: PERMISSIONS.CONTENT_MANAGE },
  { to: '/admin/users', label: '用户管理', icon: Users, permission: PERMISSIONS.USER_MANAGE },
  { to: '/admin/settings', label: '系统设置', icon: CloudCog, permission: PERMISSIONS.SYSTEM_MANAGE },
];

export default function AdminLayout() {
  const [meta, setMeta] = useState<MetaResponse>(EMPTY_META);
  const { user } = useAuth();

  useEffect(() => {
    loadMeta().then(setMeta);
  }, []);

  // 导航可见性与权限配置表对齐：审核组只见审核台与举报管理，管理员可见全部
  const visibleNav = ADMIN_NAV.filter(
    (item) => !item.permission || hasPermission(user?.role, item.permission),
  );

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm transition ${
      isActive
        ? 'border border-amber/35 bg-amber/10 font-medium text-amber'
        : 'border border-transparent text-muted hover:border-white/10 hover:bg-white/[0.04] hover:text-ink'
    }`;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-amber/80">Control Deck</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">空间站控制舱</h1>
          <p className="mt-1.5 text-xs text-muted">
            审核投稿、维护内容与分类规则，让每一条信号落到正确的轨道。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-xl border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber">
            待审核 {meta.stats.pendingSubmissions}
          </span>
          <Link to="/" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
            <ArrowLeft className="h-4 w-4" /> 返回前台
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[13rem_1fr]">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <nav className="custom-scrollbar flex gap-1.5 overflow-x-auto rounded-2xl border border-white/8 bg-white/[0.03] p-1.5 lg:flex-col lg:overflow-visible">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                  <Icon className="h-4 w-4 shrink-0" /> {item.label}
                </NavLink>
              );
            })}
          </nav>
        </aside>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
