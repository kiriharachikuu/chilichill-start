import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity as ActivityIcon,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Flag,
  Globe2,
  Images,
  LayoutDashboard,
  MessageCircle,
  RefreshCw,
  ScrollText,
  ThumbsUp,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import {
  ENTITY_TYPE_LABELS,
  type AdminDashboardResponse,
} from '@spaceport/shared';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Card from '../../components/Card';
import EmptyState from '../../components/EmptyState';
import StatusBadge from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';
import { submissionSummary } from '../../lib/submissionForms';

// 审计 action → 中文描述；未知 action 原样展示
const AUDIT_ACTION_LABELS: Record<string, string> = {
  'submission.approve': '通过投稿',
  'submission.reject': '驳回投稿',
  'report.resolve': '处理举报',
  'report.dismiss': '驳回举报',
  USER_ROLE_CHANGE: '调整用户角色',
};

// 审计 targetType → 中文
const AUDIT_TARGET_LABELS: Record<string, string> = {
  Submission: '投稿',
  CommentReport: '评论举报',
  User: '用户',
};

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  to?: string;
  tone?: 'amber' | 'aurora' | 'mint' | 'violet' | 'neutral';
  hint?: string;
}

const TONE_CLASSES: Record<NonNullable<StatCardProps['tone']>, { chip: string; value: string }> = {
  amber: { chip: 'border-amber/30 bg-amber/10 text-amber', value: 'text-amber' },
  aurora: { chip: 'border-aurora/30 bg-aurora/10 text-aurora', value: 'text-aurora' },
  mint: { chip: 'border-mint/30 bg-mint/10 text-mint', value: 'text-mint' },
  violet: { chip: 'border-violet/30 bg-violet/10 text-violet', value: 'text-violet' },
  neutral: { chip: 'border-white/10 bg-white/[0.04] text-muted', value: 'text-ink' },
};

function StatCard({ icon: Icon, label, value, to, tone = 'neutral', hint }: StatCardProps) {
  const toneClasses = TONE_CLASSES[tone];
  const body = (
    <>
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${toneClasses.chip}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <p className={`mt-0.5 text-xl font-semibold leading-tight ${toneClasses.value}`}>{value}</p>
        {hint ? <p className="mt-0.5 truncate text-[11px] text-muted/70">{hint}</p> : null}
      </div>
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3.5 transition hover:border-amber/40 hover:bg-white/[0.05]"
      >
        {body}
      </Link>
    );
  }
  return <div className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3.5">{body}</div>;
}

export default function AdminDashboardPage() {
  const toast = useToast();
  const [data, setData] = useState<AdminDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    api
      .get<AdminDashboardResponse>('/api/admin/dashboard')
      .then((result) => {
        if (alive) setData(result);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setData(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const stats = data?.stats;
  const recentSubmissions = data?.recentSubmissions ?? [];
  const recentAuditLogs = data?.recentAuditLogs ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <LayoutDashboard className="h-5 w-5 text-amber" /> 运行总览
          </h2>
          <p className="mt-1 text-xs text-muted">
            空间站各舱段运营数据与待办信号，一屏掌握。
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          loading={loading}
          icon={<RefreshCw className="h-3.5 w-3.5" />}
          onClick={() => setReloadKey((key) => key + 1)}
        >
          刷新
        </Button>
      </div>

      {failed ? (
        <EmptyState
          title="总览数据读取失败"
          description="请确认管理员权限与后端服务状态，或稍后重试。"
          icon={RefreshCw}
          action={
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
              重新加载
            </Button>
          }
        />
      ) : loading ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-[74px] animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
            ))}
          </div>
          <div className="h-40 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
        </div>
      ) : stats ? (
        <>
          {/* 待办信号：需要人工处理的队列 */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={ClipboardCheck}
              label="待审核投稿"
              value={stats.pendingSubmissions}
              to="/admin/review"
              tone="amber"
              hint={`累计投稿 ${stats.totalSubmissions} · 今日新增 ${stats.todaySubmissions}`}
            />
            <StatCard
              icon={Flag}
              label="待处理举报"
              value={stats.pendingReports}
              to="/admin/reports"
              tone="violet"
              hint="画廊评论人工审核队列"
            />
            <StatCard
              icon={UsersRound}
              label="注册用户"
              value={stats.users}
              to="/admin/users"
              tone="mint"
            />
            <StatCard
              icon={ThumbsUp}
              label="画廊互动"
              value={stats.galleryLikes}
              hint={`${stats.galleryComments} 条评论`}
            />
          </div>

          {/* 内容板块：已发布内容量 */}
          <Card padded={false} className="overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-white/8 px-5 py-3.5">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted/70">内容板块</p>
              <p className="text-xs text-muted">已发布内容量</p>
            </div>
            <div className="grid divide-y divide-white/8 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
              <Link to="/admin/content" className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/[0.04]">
                <UsersRound className="h-4 w-4 text-amber" />
                <div>
                  <p className="text-xs text-muted">群组</p>
                  <p className="text-lg font-semibold text-ink">{stats.groups}</p>
                </div>
              </Link>
              <Link to="/admin/content" className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/[0.04]">
                <Globe2 className="h-4 w-4 text-mint" />
                <div>
                  <p className="text-xs text-muted">站点</p>
                  <p className="text-lg font-semibold text-ink">{stats.sites}</p>
                </div>
              </Link>
              <Link to="/admin/content" className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/[0.04]">
                <Images className="h-4 w-4 text-violet" />
                <div>
                  <p className="text-xs text-muted">画廊作品</p>
                  <p className="text-lg font-semibold text-ink">{stats.galleryImages}</p>
                </div>
              </Link>
              <Link to="/admin/activities" className="flex items-center gap-3 px-5 py-4 transition hover:bg-white/[0.04]">
                <CalendarDays className="h-4 w-4 text-aurora" />
                <div>
                  <p className="text-xs text-muted">活动</p>
                  <p className="text-lg font-semibold text-ink">{stats.activities}</p>
                </div>
              </Link>
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* 最新待审核投稿 */}
            <Card padded={false} hover={false} className="flex min-w-0 flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-white/8 px-5 py-3.5">
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  <ClipboardCheck className="h-4 w-4 text-amber" /> 最新待审核投稿
                </p>
                <Link to="/admin/review" className="text-xs text-muted transition hover:text-amber">
                  进审核台 ›
                </Link>
              </div>
              {recentSubmissions.length ? (
                <div className="divide-y divide-white/8">
                  {recentSubmissions.map((item) => (
                    <Link
                      key={item.id}
                      to="/admin/review"
                      className="flex items-center gap-3 px-5 py-3 transition hover:bg-white/[0.04]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm text-ink">{submissionSummary(item.payload)}</span>
                          <Badge tone={item.mode === 'UPDATE' ? 'aurora' : 'neutral'}>
                            {item.mode === 'UPDATE' ? '修改' : '新建'}
                          </Badge>
                        </span>
                        <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                          {item.submitter?.nickname ?? '未知投稿人'} · {ENTITY_TYPE_LABELS[item.entityType]}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-muted">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatDateTime(item.createdAt)}
                      </span>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-6">
                  <EmptyState
                    compact
                    title="审核队列已清空"
                    description="目前没有待审核投稿。"
                    icon={ClipboardCheck}
                  />
                </div>
              )}
            </Card>

            {/* 最近后台动态（审计日志） */}
            <Card padded={false} hover={false} className="flex min-w-0 flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-2 border-b border-white/8 px-5 py-3.5">
                <p className="flex items-center gap-2 text-sm font-medium text-ink">
                  <ScrollText className="h-4 w-4 text-aurora" /> 最近后台动态
                </p>
              </div>
              {recentAuditLogs.length ? (
                <div className="divide-y divide-white/8">
                  {recentAuditLogs.map((log) => (
                    <div key={log.id} className="flex items-center gap-3 px-5 py-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                        <ActivityIcon className="h-3.5 w-3.5 text-aurora" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-ink">
                          {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                          {AUDIT_TARGET_LABELS[log.targetType] ? ` · ${AUDIT_TARGET_LABELS[log.targetType]}` : ''}
                        </span>
                        <span className="mt-0.5 block text-xs text-muted">操作人：{log.actorNickname || '—'}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted">{formatDateTime(log.createdAt)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-6">
                  <EmptyState compact title="暂无后台操作记录" description="后台敏感操作会在这里留痕。" icon={ScrollText} />
                </div>
              )}
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
