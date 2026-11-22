import { useState } from 'react';
import { KeyRound, Pencil, Plus, RefreshCw, ShieldOff, Trash2 } from 'lucide-react';
import {
  OAUTH_APP_STATUSES,
  OAUTH_APP_STATUS_LABELS,
  type OAuthAppStatus,
} from '@spaceport/shared';
import { api } from '../../lib/api';
import { useAdminList } from '../../lib/useAdminList';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Card from '../../components/Card';
import EmptyState from '../../components/EmptyState';
import { Field, Input, Select, Textarea } from '../../components/Field';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';

interface AdminOAuthApp {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  homepageUrl: string | null;
  clientId: string;
  redirectUris: string[];
  status: OAuthAppStatus;
  createdAt: string;
  activeTokenCount: number;
}

interface AppFormState {
  name: string;
  description: string;
  logoUrl: string;
  homepageUrl: string;
  redirectUris: string; // 每行一个回调地址
  status: OAuthAppStatus;
}

type AppEditor = { mode: 'create' } | { mode: 'edit'; app: AdminOAuthApp };

// 密钥展示弹窗载荷：创建/重置后 clientSecret 明文仅此一次
interface SecretReveal {
  clientId?: string;
  clientSecret: string;
  title: string;
}

function emptyForm(): AppFormState {
  return { name: '', description: '', logoUrl: '', homepageUrl: '', redirectUris: '', status: 'ACTIVE' };
}

function formFromApp(app: AdminOAuthApp): AppFormState {
  return {
    name: app.name,
    description: app.description ?? '',
    logoUrl: app.logoUrl ?? '',
    homepageUrl: app.homepageUrl ?? '',
    redirectUris: app.redirectUris.join('\n'),
    status: app.status,
  };
}

function parseRedirectUris(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

export default function AdminOAuthAppsPage() {
  const toast = useToast();
  const { items: apps, loading, failed, reload } = useAdminList<AdminOAuthApp>((client) =>
    client.get<{ items: AdminOAuthApp[] }>('/api/admin/oauth-apps').then((result) => result.items),
  );

  const [editor, setEditor] = useState<AppEditor | null>(null);
  const [form, setForm] = useState<AppFormState>(emptyForm);
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleting, setDeleting] = useState<AdminOAuthApp | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const [resetting, setResetting] = useState<AdminOAuthApp | null>(null);
  const [resetBusy, setResetBusy] = useState(false);

  const [secretReveal, setSecretReveal] = useState<SecretReveal | null>(null);
  const [copied, setCopied] = useState(false);

  const openCreate = () => {
    setEditor({ mode: 'create' });
    setForm(emptyForm());
    setServerError('');
  };

  const openEdit = (app: AdminOAuthApp) => {
    setEditor({ mode: 'edit', app });
    setForm(formFromApp(app));
    setServerError('');
  };

  const closeEditor = () => {
    if (saving) return;
    setEditor(null);
    setServerError('');
  };

  const submit = async () => {
    if (!editor) return;
    setServerError('');
    const redirectUris = parseRedirectUris(form.redirectUris);
    if (!form.name.trim()) {
      setServerError('应用名称不能为空');
      return;
    }
    if (redirectUris.length === 0) {
      setServerError('至少配置一个回调地址（每行一个）');
      return;
    }
    for (const uri of redirectUris) {
      try {
        const url = new URL(uri);
        if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.hash) {
          setServerError(`回调地址非法：${uri}`);
          return;
        }
      } catch {
        setServerError(`回调地址非法：${uri}`);
        return;
      }
    }

    setSaving(true);
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      logoUrl: form.logoUrl.trim() || null,
      homepageUrl: form.homepageUrl.trim() || null,
      redirectUris,
      status: form.status,
    };
    try {
      if (editor.mode === 'create') {
        const result = await api.post<{ item: AdminOAuthApp; clientSecret: string }>(
          '/api/admin/oauth-apps',
          body,
        );
        setEditor(null);
        setSecretReveal({
          clientId: result.item.clientId,
          clientSecret: result.clientSecret,
          title: '应用已创建，请立即保存凭证',
        });
      } else {
        await api.put<{ item: AdminOAuthApp }>(`/api/admin/oauth-apps/${editor.app.id}`, body);
        setEditor(null);
        toast.success('接入应用已更新');
      }
      reload();
    } catch (error) {
      setServerError(error instanceof Error ? error.message : '保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await api.delete<void>(`/api/admin/oauth-apps/${deleting.id}`);
      toast.success('接入应用已删除');
      setDeleting(null);
      reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '删除失败，请稍后再试');
    } finally {
      setDeletingBusy(false);
    }
  };

  const confirmResetSecret = async () => {
    if (!resetting) return;
    setResetBusy(true);
    try {
      const result = await api.post<{ clientSecret: string }>(
        `/api/admin/oauth-apps/${resetting.id}/reset-secret`,
      );
      setResetting(null);
      setSecretReveal({
        clientId: resetting.clientId,
        clientSecret: result.clientSecret,
        title: '密钥已重置，旧密钥立即失效',
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '重置失败，请稍后再试');
    } finally {
      setResetBusy(false);
    }
  };

  const copyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error('复制失败，请手动选择复制');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <KeyRound className="h-5 w-5 text-violet" /> 接入应用
          </h2>
          <p className="mt-1 text-xs text-muted">
            管理可通过空间站通行证授权登录的外部网站，凭据用于 OAuth2 授权码流程。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {failed ? (
            <button
              type="button"
              onClick={reload}
              className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-amber"
            >
              <RefreshCw className="h-3.5 w-3.5" /> 重试
            </button>
          ) : null}
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            新建应用
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-16 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]"
            />
          ))}
        </div>
      ) : failed ? (
        <EmptyState
          title="接入应用读取失败"
          description="请确认管理员权限与后端服务状态，或稍后重试。"
          icon={RefreshCw}
          action={
            <Button variant="secondary" size="sm" onClick={reload}>
              重新加载
            </Button>
          }
        />
      ) : apps.length ? (
        <Card hover={false} padded={false} className="overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_6rem_5.5rem_6rem] gap-3 border-b border-white/8 px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] text-muted/70 lg:grid">
            <span>应用</span>
            <span>Client ID</span>
            <span>回调地址数</span>
            <span>状态</span>
            <span>活跃令牌</span>
            <span className="text-right">操作</span>
          </div>
          <div className="divide-y divide-white/8">
            {apps.map((app) => (
              <div
                key={app.id}
                className="grid gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_6rem_5.5rem_6rem] lg:items-center lg:gap-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{app.name}</span>
                  <span className="text-[11px] text-muted/60">{formatDate(app.createdAt)}</span>
                </div>
                <code className="truncate rounded-md border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[11px] text-muted">
                  {app.clientId}
                </code>
                <span className="text-xs text-muted">{app.redirectUris.length} 个</span>
                <div>
                  <Badge tone={app.status === 'ACTIVE' ? 'mint' : 'neutral'}>
                    {OAUTH_APP_STATUS_LABELS[app.status] ?? app.status}
                  </Badge>
                </div>
                <span className="text-xs text-muted">{app.activeTokenCount}</span>
                <div className="flex items-center gap-1.5 lg:justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    onClick={() => openEdit(app)}
                    aria-label="编辑应用"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<ShieldOff className="h-3.5 w-3.5" />}
                    onClick={() => setResetting(app)}
                    aria-label="重置密钥"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => setDeleting(app)}
                    aria-label="删除应用"
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          title="还没有接入应用"
          description="创建第一个应用，让合作网站使用空间站通行证授权登录。"
          icon={KeyRound}
          action={
            <Button variant="secondary" size="sm" onClick={openCreate}>
              新建应用
            </Button>
          }
        />
      )}

      {/* 创建 / 编辑弹窗 */}
      <Modal
        open={Boolean(editor)}
        onClose={closeEditor}
        size="md"
        eyebrow={editor?.mode === 'edit' ? 'Edit OAuth App' : 'New OAuth App'}
        title={editor?.mode === 'edit' ? '编辑接入应用' : '新建接入应用'}
        description="回调地址精确匹配（含协议与路径），授权后应用仅能获取昵称、头像与用户 ID 等基础信息。"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={closeEditor} disabled={saving}>
              取消
            </Button>
            <Button loading={saving} onClick={() => void submit()}>
              {editor?.mode === 'edit' ? '保存修改' : '创建应用'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="应用名称" required>
              <Input
                value={form.name}
                maxLength={40}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="例如：星愿互助站"
              />
            </Field>
            <Field label="状态">
              <Select
                value={form.status}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value as OAuthAppStatus }))
                }
              >
                {OAUTH_APP_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {OAUTH_APP_STATUS_LABELS[status]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="应用图标地址" hint="授权页展示，可留空">
              <Input
                value={form.logoUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, logoUrl: event.target.value }))}
                placeholder="https://example.com/logo.png"
              />
            </Field>
            <Field label="应用主页地址" hint="授权页展示，可留空">
              <Input
                value={form.homepageUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, homepageUrl: event.target.value }))}
                placeholder="https://example.com"
              />
            </Field>
          </div>

          <Field label="应用描述">
            <Textarea
              value={form.description}
              maxLength={200}
              rows={2}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="简要说明应用用途，会在授权页展示给用户"
            />
          </Field>

          <Field label="回调地址白名单" required hint="每行一个，授权时精确匹配">
            <Textarea
              value={form.redirectUris}
              rows={4}
              onChange={(event) => setForm((prev) => ({ ...prev, redirectUris: event.target.value }))}
              placeholder={'https://example.com/auth/callback\nhttps://example.com/callback'}
            />
          </Field>

          {serverError ? (
            <div className="rounded-xl border border-coral/35 bg-coral/10 px-4 py-3 text-xs text-coral">
              {serverError}
            </div>
          ) : null}
        </div>
      </Modal>

      {/* 密钥展示弹窗（创建成功 / 重置密钥后） */}
      <Modal
        open={Boolean(secretReveal)}
        onClose={() => {
          setSecretReveal(null);
          setCopied(false);
        }}
        size="sm"
        eyebrow="Client Credentials"
        title={secretReveal?.title ?? '凭证'}
        description="clientSecret 明文仅展示这一次，关闭后无法再次查看，请立即复制保存。"
        footer={
          <Button onClick={() => {
            setSecretReveal(null);
            setCopied(false);
          }}>
            我已保存，关闭
          </Button>
        }
      >
        {secretReveal ? (
          <div className="space-y-3">
            {secretReveal.clientId ? (
              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted/70">Client ID</p>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <code className="min-w-0 flex-1 truncate text-xs text-ink">{secretReveal.clientId}</code>
                  <Button size="sm" variant="ghost" onClick={() => void copyValue(secretReveal.clientId!)}>
                    {copied ? '已复制' : '复制'}
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="rounded-xl border border-amber/35 bg-amber/10 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-amber/80">Client Secret</p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <code className="min-w-0 flex-1 break-all text-xs text-ink">{secretReveal.clientSecret}</code>
                <Button size="sm" variant="ghost" onClick={() => void copyValue(secretReveal.clientSecret)}>
                  复制
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* 重置密钥确认 */}
      <Modal
        open={Boolean(resetting)}
        onClose={() => {
          if (!resetBusy) setResetting(null);
        }}
        size="sm"
        eyebrow="Reset Secret"
        title="重置接入密钥？"
        description="重置后旧 clientSecret 立即失效，第三方网站需用新密钥继续对接。"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={resetBusy} onClick={() => setResetting(null)}>
              取消
            </Button>
            <Button variant="danger" loading={resetBusy} onClick={() => void confirmResetSecret()}>
              确认重置
            </Button>
          </div>
        }
      >
        {resetting ? (
          <div className="rounded-xl border border-coral/30 bg-coral/[0.08] px-4 py-3">
            <p className="text-sm font-medium text-ink">{resetting.name}</p>
            <code className="mt-1 block truncate text-xs text-muted">{resetting.clientId}</code>
          </div>
        ) : null}
      </Modal>

      {/* 删除确认 */}
      <Modal
        open={Boolean(deleting)}
        onClose={() => {
          if (!deletingBusy) setDeleting(null);
        }}
        size="sm"
        eyebrow="Confirm Removal"
        title="删除这个接入应用？"
        description="应用的授权码与访问令牌会被一并清除，第三方站将无法继续授权登录，此操作不可恢复。"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={deletingBusy} onClick={() => setDeleting(null)}>
              取消
            </Button>
            <Button variant="danger" loading={deletingBusy} onClick={() => void confirmDelete()}>
              确认删除
            </Button>
          </div>
        }
      >
        {deleting ? (
          <div className="rounded-xl border border-coral/30 bg-coral/[0.08] px-4 py-3">
            <p className="text-sm font-medium text-ink">{deleting.name}</p>
            <code className="mt-1 block truncate text-xs text-muted">{deleting.clientId}</code>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
