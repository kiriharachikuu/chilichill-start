import { Fragment, useEffect, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  ClipboardCheck,
  Flag,
  KeyRound,
  Gavel,
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

type AdminNavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  permission?: Permission;
};

// 后台导航按功能视角分组：安全审核（处理违规）→ 内容运营（维护站点内容）→ 成员与系统（账号与配置）
const ADMIN_NAV_GROUPS: { title: string; items: AdminNavItem[] }[] = [
  {
    title: '总览',
    items: [{ to: '/admin', label: '仪表盘', icon: LayoutDashboard, end: true }],
  },
  {
    title: '审核与安全',
    items: [
      { to: '/admin/review', label: '审核台', icon: ClipboardCheck, permission: PERMISSIONS.REVIEW_VIEW },
      { to: '/admin/reports', label: '举报管理', icon: Flag, permission: PERMISSIONS.REPORT_MANAGE },
      { to: '/admin/penalties', label: '处罚管理', icon: Gavel, permission: PERMISSIONS.PENALTY_MANAGE },
    ],
  },
  {
    title: '内容运营',
    items: [
      { to: '/admin/content', label: '内容管理', icon: Layers, permission: PERMISSIONS.CONTENT_MANAGE },
      { to: '/admin/activities', label: '活动管理', icon: CalendarDays, permission: PERMISSIONS.CONTENT_MANAGE },
      { to: '/admin/tags', label: '标签管理', icon: Tags, permission: PERMISSIONS.CONTENT_MANAGE },
      { to: '/admin/rules', label: '分类规则', icon: Map, permission: PERMISSIONS.CONTENT_MANAGE },
    ],
  },
  {
    title: '成员与系统',
    items: [
      { to: '/admin/users', label: '用户管理', icon: Users, permission: PERMISSIONS.USER_MANAGE },
      { to: '/admin/oauth-apps', label: '接入应用', icon: KeyRound, permission: PERMISSIONS.SYSTEM_MANAGE },
      { to: '/admin/settings', label: '系统设置', icon: CloudCog, permission: PERMISSIONS.SYSTEM_MANAGE },
    ],
  },
];

export default function AdminLayout() {
  const [meta, setMeta] = useState<MetaResponse>(EMPTY_META);
  const { user } = useAuth();

  useEffect(() => {
    loadMeta().then(setMeta);
  }, []);

  // 导航可见性与权限配置表对齐：按组过滤，整组无权限时隐藏该组标题
  // （审核组只见「总览」与「审核与安全」，管理员可见全部）
  const visibleGroups = ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.permission || hasPermission(user?.role, item.permission),
    ),
  })).filter((group) => group.items.length > 0);

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
            审核与安全、内容运营、成员与系统配置，让每一条信号落到正确的轨道。
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

      {/* 移动端保持普通文档流（菜单才能在整个页面高度内吸附），桌面端才切双栏网格 */}
      <div className="lg:grid lg:grid-cols-[13rem_1fr] lg:items-start lg:gap-6">
        {/* 菜单固定不随页面滚动：移动端吸附在顶部头部（h-14）下方，桌面端吸附在视口顶部 */}
        <aside className="sticky top-14 z-20 mb-4 min-w-0 bg-space-50 py-2 lg:top-0 lg:z-auto lg:mb-0 lg:bg-transparent lg:py-4 lg:self-start">
          <nav className="custom-scrollbar flex gap-1.5 overflow-x-auto rounded-2xl border border-white/8 bg-white/[0.03] p-1.5 lg:max-h-[calc(100vh-2rem)] lg:flex-col lg:overflow-y-auto">
            {visibleGroups.map((group) => (
              <Fragment key={group.title}>
                {/* 分组标题仅桌面侧栏展示，移动端横向滚动条保持平铺 */}
                <p className="hidden px-3.5 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted/60 lg:block lg:first:pt-1.5">
                  {group.title}
                </p>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                      <Icon className="h-4 w-4 shrink-0" /> {item.label}
                    </NavLink>
                  );
                })}
              </Fragment>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
