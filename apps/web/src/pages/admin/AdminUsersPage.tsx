import { useCallback, useEffect, useState } from 'react';
import { History, Mail, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import {
  ROLES,
  ROLE_LABELS,
  type AdminAuditLogListResponse,
  type Paginated,
  type Role,
} from '@spaceport/shared';
import { ApiError, api } from '../../lib/api';
import { formatDateTime, initialOf } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Card from '../../components/Card';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import Pagination from '../../components/Pagination';
import { useToast } from '../../components/Toast';

interface AdminUser {
  id: string;
  email: string;
  nickname: string;
  role: string;
  createdAt: string;
  submissionCount: number;
}

const ROLE_TONES: Record<string, 'amber' | 'aurora' | 'neutral'> = {
  ADMIN: 'amber',
  MODERATOR: 'aurora',
  USER: 'neutral',
};

const PAGE_SIZE = 20;

function roleLabel(role: string): string {
  return ROLE_LABELS[role as Role] ?? role;
}

export default function AdminUsersPage() {
  const toast = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const [items, setItems] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [roleChange, setRoleChange] = useState<{ user: AdminUser; nextRole: Role } | null>(null);

  // 审计日志（仅站长可见）
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<AdminAuditLogListResponse['items']>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotal, setLogsTotal] = useState(0);

  const fetchLogs = useCallback(async (targetPage: number) => {
    setLogsLoading(true);
    try {
      const res = await api.get<AdminAuditLogListResponse>('/api/admin/audit-logs', {
        page: targetPage,
        pageSize: PAGE_SIZE,
      });
      setLogs(res.items);
      setLogsTotal(res.total);
      setLogsPage(res.page);
    } catch {
      setLogs([]);
      setLogsTotal(0);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    api
      .get<Paginated<AdminUser>>('/api/admin/users', { page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (!alive) return;
        setItems(result.items);
        setTotal(result.total);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setItems([]);
        setTotal(0);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [page, reloadKey]);

  // 修改用户组：二次确认，提交后即时生效并写入操作日志
  const confirmRoleChange = async () => {
    if (!roleChange) return;
    setChangingId(roleChange.user.id);
    try {
      await api.patch(`/api/admin/users/${roleChange.user.id}/role`, { role: roleChange.nextRole });
      toast.success(`已将「${roleChange.user.nickname}」调整为${roleLabel(roleChange.nextRole)}`);
      setRoleChange(null);
      setReloadKey((key) => key + 1);
      if (logsOpen) void fetchLogs(logsPage);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '调整失败，请稍后再试');
    } finally {
      setChangingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <Users className="h-5 w-5 text-amber" /> 用户管理
          </h2>
          <p className="mt-1 text-xs text-muted">
            {isAdmin
              ? '管理空间站注册成员与所属用户组，调整用户组后立即生效并记录操作日志。'
              : '查看空间站注册成员与投稿数量。'}
            共 {total} 位用户。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<History className="h-3.5 w-3.5" />}
              onClick={() => {
                const next = !logsOpen;
                setLogsOpen(next);
                if (next) void fetchLogs(1);
              }}
            >
              操作日志
            </Button>
          ) : null}
          {failed ? (
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-amber"
            >
              <RefreshCw className="h-3.5 w-3.5" /> 重试
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-16 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]"
            />
          ))}
        </div>
      ) : failed ? (
        <EmptyState
          title="用户数据读取失败"
          description="请确认管理员权限与后端服务状态，或稍后重试。"
          icon={RefreshCw}
          action={
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
              重新加载
            </Button>
          }
        />
      ) : items.length ? (
        <Card hover={false} padded={false} className="overflow-hidden">
          <div
            className={`hidden gap-3 border-b border-white/8 px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] text-muted/70 sm:grid ${
              isAdmin
                ? 'grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_8.5rem_4.5rem_8rem]'
                : 'grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_5.5rem_5rem_10rem]'
            }`}
          >
            <span>成员</span>
            <span>邮箱</span>
            <span>{isAdmin ? '用户组' : '角色'}</span>
            <span>投稿数</span>
            <span>加入时间</span>
          </div>
          <div className="divide-y divide-white/8">
            {items.map((item) => {
              const isSelf = item.id === user?.id;
              return (
                <div
                  key={item.id}
                  className={`grid gap-2 px-4 py-3 sm:items-center sm:gap-3 ${
                    isAdmin
                      ? 'sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_8.5rem_4.5rem_8rem]'
                      : 'sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_5.5rem_5rem_10rem]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/12 bg-white/[0.05] text-xs font-semibold text-amber">
                      {initialOf(item.nickname)}
                    </span>
                    <span className="truncate text-sm font-medium text-ink">
                      {item.nickname}
                      {isSelf ? <span className="ml-1.5 text-[10px] text-muted/70">（我）</span> : null}
                    </span>
                  </div>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{item.email}</span>
                  </span>
                  <span>
                    {isAdmin && !isSelf ? (
                      <select
                        value={item.role}
                        disabled={changingId === item.id}
                        onChange={(event) => {
                          const nextRole = event.target.value as Role;
                          if (nextRole === item.role) return;
                          setRoleChange({ user: item, nextRole });
                        }}
                        className="w-full rounded-lg border border-white/12 bg-white/[0.05] px-2 py-1.5 text-xs font-bold text-ink outline-none transition focus:border-amber/60 disabled:opacity-60"
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <Badge tone={ROLE_TONES[item.role] ?? 'neutral'}>
                        {item.role === 'ADMIN' ? (
                          <span className="inline-flex items-center gap-1">
                            <ShieldCheck className="h-3 w-3" /> {roleLabel(item.role)}
                          </span>
                        ) : (
                          roleLabel(item.role)
                        )}
                      </Badge>
                    )}
                  </span>
                  <span className="text-xs text-muted">{item.submissionCount} 次</span>
                  <span className="text-xs text-muted">{formatDateTime(item.createdAt)}</span>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <EmptyState
          title="还没有注册用户"
          description="当成员登录或注册后，会在这里出现。"
          icon={Users}
        />
      )}

      <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />

      {isAdmin && logsOpen ? (
        <Card hover={false} padded={false} className="overflow-hidden">
          <div className="border-b border-white/8 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <History className="h-4 w-4 text-amber" /> 操作日志
              <span className="ml-auto text-xs text-muted">
                共 <span className="font-mono font-bold text-ink">{logsTotal}</span> 条
              </span>
            </h3>
          </div>
          {logsLoading ? (
            <div className="px-4 py-10 text-center text-xs text-muted">加载中…</div>
          ) : logs.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-muted">暂无操作记录</div>
          ) : (
            <ul className="divide-y divide-white/8">
              {logs.map((log) => (
                <li key={log.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-xs">
                  <span className="font-bold text-amber">{log.actorNickname}</span>
                  <span className="text-muted">
                    将「{String(log.detail.userNickname ?? log.targetId ?? '')}」的用户组
                  </span>
                  <span className="text-muted">
                    {roleLabel(String(log.detail.from ?? ''))} →
                    <span className="font-bold text-mint"> {roleLabel(String(log.detail.to ?? ''))}</span>
                  </span>
                  <span className="ml-auto text-muted/70">{formatDateTime(log.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
          {logsTotal > PAGE_SIZE ? (
            <div className="border-t border-white/8 px-4 py-3">
              <Pagination page={logsPage} total={logsTotal} pageSize={PAGE_SIZE} onChange={(next) => void fetchLogs(next)} />
            </div>
          ) : null}
        </Card>
      ) : null}

      <ConfirmDialog
        open={Boolean(roleChange)}
        title="调整用户组"
        description={
          roleChange
            ? `确定将「${roleChange.user.nickname}」的用户组从「${roleLabel(roleChange.user.role)}」调整为「${roleLabel(roleChange.nextRole)}」吗？调整后立即生效。`
            : undefined
        }
        confirmText="确认调整"
        busy={changingId === roleChange?.user.id}
        onConfirm={() => void confirmRoleChange()}
        onClose={() => setRoleChange(null)}
      >
        {roleChange ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <p className="text-sm font-medium text-ink">{roleChange.user.nickname}</p>
            <p className="mt-1 truncate text-xs text-muted">{roleChange.user.email}</p>
            <p className="mt-2 text-xs text-muted">
              {roleLabel(roleChange.user.role)} →{' '}
              <span className="font-bold text-ink">{roleLabel(roleChange.nextRole)}</span>
            </p>
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
