import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { History, Mail, Pencil, RefreshCw, ShieldCheck, UserPlus, Users } from 'lucide-react';
import {
  PENALTY_TYPE_LABELS,
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
import CityPicker from '../../components/forms/CityPicker';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import { Field, inputClass } from '../../components/Field';
import ImageUploader from '../../components/ImageUploader';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import { useToast } from '../../components/Toast';

interface AdminUser {
  id: string;
  uid: number | null;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  bio: string | null;
  province: string | null;
  city: string | null;
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

// 资料字段中文名（审计日志展示用）
const PROFILE_FIELD_LABELS: Record<string, string> = {
  nickname: '昵称',
  avatarUrl: '头像',
  bannerUrl: '空间头图',
  bio: '自我介绍',
  province: '省份',
  city: '城市',
};

function penaltyTypeLabel(type: unknown): string {
  const key = type as keyof typeof PENALTY_TYPE_LABELS;
  return PENALTY_TYPE_LABELS[key] ?? String(type ?? '处罚');
}

// 审计日志一行摘要：兼容用户组调整、资料修改、代注册、举报处罚等 action
function describeAuditLog(log: AdminAuditLogListResponse['items'][number]): ReactNode {
  const detail = log.detail;
  if (log.action === 'USER_ROLE_CHANGE') {
    return (
      <>
        将「{String(detail.userNickname ?? log.targetId ?? '')}」的用户组由{' '}
        {roleLabel(String(detail.from ?? ''))} 调整为
        <span className="font-bold text-mint"> {roleLabel(String(detail.to ?? ''))}</span>
      </>
    );
  }
  if (log.action === 'USER_PROFILE_UPDATE') {
    const changes = detail.changes as Record<string, { from: unknown; to: unknown }> | undefined;
    const fields =
      Object.keys(changes ?? {})
        .map((key) => PROFILE_FIELD_LABELS[key] ?? key)
        .join('、') || '未知字段';
    return <>修改了「{String(detail.userNickname ?? log.targetId ?? '')}」的资料（{fields}）</>;
  }
  if (log.action === 'USER_CREATE') {
    const uidSuffix = detail.uid != null && detail.uid !== '' ? ` · UID ${detail.uid}` : '';
    return (
      <>
        代注册了新用户「{String(detail.nickname ?? '')}」
        <span className="text-muted/70">
          {String(detail.email ?? '')}
          {uidSuffix}
        </span>
      </>
    );
  }
  if (log.action === 'penalty.apply') {
    const duration =
      detail.type === 'MUTE' && detail.durationDays != null ? ` ${detail.durationDays} 天` : '';
    return (
      <>
        对 UID {String(detail.penaltyUserUid ?? detail.penaltyUserId ?? '')} 执行
        {penaltyTypeLabel(detail.type)}
        {duration}
        <span className="text-muted/70">（{String(detail.reason ?? '')}）</span>
      </>
    );
  }
  if (log.action === 'penalty.revoke') {
    return (
      <>
        撤销了对用户 {String(detail.penaltyUserId ?? '')} 的{penaltyTypeLabel(detail.penaltyType)}处罚
        <span className="text-muted/70">（{String(detail.revokeReason ?? '')}）</span>
      </>
    );
  }
  return <>{log.action}</>;
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

  // 编辑用户基本资料（弹窗表单，从列表数据回填）
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [profileForm, setProfileForm] = useState({
    nickname: '',
    avatarUrl: null as string | null,
    bannerUrl: null as string | null,
    bio: '',
    province: '',
    city: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // 代注册新用户（可指定 UID）
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    nickname: '',
    uid: '',
    role: 'USER' as Role,
  });
  const [creating, setCreating] = useState(false);

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

  // 打开编辑弹窗：从列表数据回填表单
  const openEdit = (item: AdminUser) => {
    setEditingUser(item);
    setProfileForm({
      nickname: item.nickname,
      avatarUrl: item.avatarUrl,
      bannerUrl: item.bannerUrl,
      bio: item.bio ?? '',
      province: item.province ?? '',
      city: item.city ?? '',
    });
  };

  // 保存基本资料修改：与用户自查资料同字段，保存后刷新列表与操作日志
  const saveProfile = async () => {
    if (!editingUser || savingProfile) return;
    if (!profileForm.nickname.trim()) {
      toast.error('昵称不能为空');
      return;
    }
    setSavingProfile(true);
    try {
      await api.patch(`/api/admin/users/${editingUser.id}/profile`, {
        nickname: profileForm.nickname.trim(),
        avatarUrl: profileForm.avatarUrl,
        bannerUrl: profileForm.bannerUrl,
        bio: profileForm.bio.trim(),
        province: profileForm.province || null,
        city: profileForm.city || null,
      });
      toast.success(`已更新「${editingUser.nickname}」的资料`);
      setEditingUser(null);
      setReloadKey((key) => key + 1);
      if (logsOpen) void fetchLogs(logsPage);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '保存失败，请稍后再试');
    } finally {
      setSavingProfile(false);
    }
  };

  // 代注册新用户：UID 留空自动分配，成功后回到第一页查看新成员
  const submitCreate = async () => {
    if (creating) return;
    const email = createForm.email.trim().toLowerCase();
    const uidText = createForm.uid.trim();
    if (uidText && !/^\d{6}$/.test(uidText)) {
      toast.error('UID 需为 6 位纯数字（100000-999999），留空则自动分配');
      return;
    }
    setCreating(true);
    try {
      const res = await api.post<{ item: { nickname: string; uid: number | null } }>(
        '/api/admin/users',
        {
          email,
          password: createForm.password,
          nickname: createForm.nickname.trim(),
          ...(uidText ? { uid: Number(uidText) } : {}),
          role: createForm.role,
        },
      );
      toast.success(
        `已注册新用户「${res.item.nickname}」${res.item.uid != null ? `（UID ${res.item.uid}）` : ''}`,
      );
      setCreateOpen(false);
      setCreateForm({ email: '', password: '', nickname: '', uid: '', role: 'USER' });
      setPage(1);
      setReloadKey((key) => key + 1);
      if (logsOpen) void fetchLogs(logsPage);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '注册失败，请稍后再试');
    } finally {
      setCreating(false);
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
            <>
              <Button
                size="sm"
                icon={<UserPlus className="h-3.5 w-3.5" />}
                onClick={() => setCreateOpen(true)}
              >
                注册新用户
              </Button>
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
            </>
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
                ? 'grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_8.5rem_4.5rem_8rem_4rem]'
                : 'grid-cols-[minmax(0,1.2fr)_minmax(0,1.4fr)_5.5rem_5rem_10rem]'
            }`}
          >
            <span>成员</span>
            <span>邮箱</span>
            <span>{isAdmin ? '用户组' : '角色'}</span>
            <span>投稿数</span>
            <span>加入时间</span>
            {isAdmin ? <span className="text-right">操作</span> : null}
          </div>
          <div className="divide-y divide-white/8">
            {items.map((item) => {
              const isSelf = item.id === user?.id;
              return (
                <div
                  key={item.id}
                  className={`grid gap-2 px-4 py-3 sm:items-center sm:gap-3 ${
                    isAdmin
                      ? 'sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)_8.5rem_4.5rem_8rem_4rem]'
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
                  {isAdmin ? (
                    <span className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        aria-label={`编辑 ${item.nickname} 的资料`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/12 bg-white/[0.05] text-muted transition hover:border-amber/60 hover:text-amber"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : null}
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
                  <span className="min-w-0 flex-1 text-muted">{describeAuditLog(log)}</span>
                  <span className="text-muted/70">{formatDateTime(log.createdAt)}</span>
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

      {/* 编辑用户基本资料 */}
      <Modal
        open={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
        eyebrow="USER PROFILE"
        title="编辑用户资料"
        description={
          editingUser
            ? `正在编辑「${editingUser.nickname}」${
                editingUser.uid != null ? `（UID ${editingUser.uid}）` : ''
              }，保存后立即生效并记录操作日志。`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => setEditingUser(null)}>
              取消
            </Button>
            <Button size="sm" onClick={() => void saveProfile()} loading={savingProfile}>
              保存修改
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <Field label="空间头图（选填）">
            <ImageUploader
              value={profileForm.bannerUrl}
              onChange={(url) => setProfileForm((form) => ({ ...form, bannerUrl: url }))}
              variant="banner"
              hint="展示在个人空间顶部，建议 1600×400 宽幅图片"
            />
          </Field>
          <div className="flex flex-col gap-5 sm:flex-row">
            <div className="shrink-0">
              <ImageUploader
                value={profileForm.avatarUrl}
                onChange={(url) => setProfileForm((form) => ({ ...form, avatarUrl: url }))}
                variant="square"
                label="上传头像"
                hint="建议 1:1"
              />
            </div>
            <div className="flex flex-1 flex-col gap-4">
              <Field label="昵称" htmlFor="admin-profile-nickname" required>
                <input
                  id="admin-profile-nickname"
                  className={inputClass}
                  value={profileForm.nickname}
                  maxLength={20}
                  onChange={(event) =>
                    setProfileForm((form) => ({ ...form, nickname: event.target.value }))
                  }
                />
              </Field>
              <Field label="地区（选填）">
                <CityPicker
                  value={{ province: profileForm.province, city: profileForm.city }}
                  onChange={(location) =>
                    setProfileForm((form) => ({
                      ...form,
                      province: location.province,
                      city: location.city,
                    }))
                  }
                  compact
                />
              </Field>
              <Field label="自我介绍" htmlFor="admin-profile-bio">
                <textarea
                  id="admin-profile-bio"
                  className={`${inputClass} min-h-[76px] resize-y`}
                  value={profileForm.bio}
                  maxLength={200}
                  onChange={(event) =>
                    setProfileForm((form) => ({ ...form, bio: event.target.value }))
                  }
                />
                <p className="mt-1 text-right text-[11px] text-muted/70">
                  {profileForm.bio.length}/200
                </p>
              </Field>
            </div>
          </div>
        </div>
      </Modal>

      {/* 代注册新用户 */}
      <Modal
        open={createOpen}
        onClose={() => {
          if (!creating) setCreateOpen(false);
        }}
        eyebrow="NEW MEMBER"
        title="注册新用户"
        description="由站长代为创建账号，UID 留空时自动分配，操作会记录审计日志。"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)} disabled={creating}>
              取消
            </Button>
            <Button size="sm" onClick={() => void submitCreate()} loading={creating}>
              注册用户
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="邮箱" htmlFor="admin-create-email" required>
            <input
              id="admin-create-email"
              type="email"
              autoComplete="off"
              className={inputClass}
              value={createForm.email}
              onChange={(event) => setCreateForm((form) => ({ ...form, email: event.target.value }))}
              placeholder="user@example.com"
            />
          </Field>
          <Field label="初始密码" htmlFor="admin-create-password" hint="至少 8 位，创建后请告知该成员">
            <input
              id="admin-create-password"
              type="text"
              autoComplete="new-password"
              className={inputClass}
              value={createForm.password}
              onChange={(event) =>
                setCreateForm((form) => ({ ...form, password: event.target.value }))
              }
              placeholder="至少 8 位"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="昵称" htmlFor="admin-create-nickname" required>
              <input
                id="admin-create-nickname"
                className={inputClass}
                value={createForm.nickname}
                maxLength={20}
                onChange={(event) =>
                  setCreateForm((form) => ({ ...form, nickname: event.target.value }))
                }
              />
            </Field>
            <Field label="用户组" htmlFor="admin-create-role">
              <select
                id="admin-create-role"
                className={inputClass}
                value={createForm.role}
                onChange={(event) =>
                  setCreateForm((form) => ({ ...form, role: event.target.value as Role }))
                }
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field
            label="UID（选填）"
            htmlFor="admin-create-uid"
            hint="6 位纯数字（100000-999999），留空自动分配"
          >
            <input
              id="admin-create-uid"
              inputMode="numeric"
              className={inputClass}
              value={createForm.uid}
              onChange={(event) =>
                setCreateForm((form) => ({
                  ...form,
                  uid: event.target.value.replace(/[^\d]/g, '').slice(0, 6),
                }))
              }
              placeholder="留空自动分配"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
