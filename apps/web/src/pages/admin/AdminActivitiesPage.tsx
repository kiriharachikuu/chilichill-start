import { useRef, useState } from 'react';
import { CalendarDays, FileUp, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  ACTIVITY_STATUS_LABELS,
  activityStatusOf,
  type Activity,
} from '@spaceport/shared';
import { ApiError, api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { clearMetaCache } from '../../lib/meta';
import { useAdminList } from '../../lib/useAdminList';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Card from '../../components/Card';
import EmptyState from '../../components/EmptyState';
import { Field, Input, Select, Textarea } from '../../components/Field';
import ImageUploader from '../../components/ImageUploader';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';

// 列表项不含 contentHtml 本体（体积大），用 hasContentHtml 标记是否配置了自定义页
type AdminActivity = Omit<Activity, 'contentHtml'> & { hasContentHtml?: boolean };

interface ActivityFormState {
  title: string;
  coverUrl: string | null;
  description: string;
  linkUrl: string;
  contentHtml: string;
  startDate: string;
  endDate: string;
  sortOrder: string;
  published: 'true' | 'false';
}

type Editor = { mode: 'create' } | { mode: 'edit'; activity: AdminActivity };

type FormErrors = Partial<Record<keyof ActivityFormState, string>>;

function emptyForm(): ActivityFormState {
  return {
    title: '',
    coverUrl: null,
    description: '',
    linkUrl: '',
    contentHtml: '',
    startDate: '',
    endDate: '',
    sortOrder: '0',
    published: 'true',
  };
}

// ISO → datetime-local 输入值（本地时区）
function toLocalInput(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => `${n}`.padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AdminActivitiesPage() {
  const toast = useToast();
  const htmlFileRef = useRef<HTMLInputElement>(null);
  const [total, setTotal] = useState(0);
  const { items, loading, failed, reload } = useAdminList<AdminActivity>((client) =>
    client
      .get<{ items: AdminActivity[]; total: number }>('/api/admin/activities', {
        page: 1,
        pageSize: 50,
      })
      .then((result) => {
        // total 仅用于头部计数展示，在 fetcher 内随列表一并更新
        setTotal(result.total ?? 0);
        return result.items ?? [];
      }),
  );
  const [editor, setEditor] = useState<Editor | null>(null);
  const [form, setForm] = useState<ActivityFormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<AdminActivity | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const openCreate = () => {
    setEditor({ mode: 'create' });
    setForm(emptyForm());
    setErrors({});
    setServerError('');
    // 使仍在途的编辑详情请求失效，避免其返回后污染新建表单
    editReqRef.current = null;
  };

  // 编辑详情请求的身份标记：返回时若编辑器已切换/关闭/换目标，则丢弃结果，
  // 防止活动 A 的数据被填进活动 B 的表单（保存后会发生数据覆盖事故）
  const editReqRef = useRef<string | null>(null);

  const openEdit = async (activity: AdminActivity) => {
    setEditor({ mode: 'edit', activity });
    setErrors({});
    setServerError('');
    // 列表不返回 contentHtml，编辑时读取详情
    setForm(emptyForm());
    editReqRef.current = activity.id;
    try {
      const { item } = await api.get<{ item: Activity }>(`/api/admin/activities/${activity.id}`);
      if (editReqRef.current !== activity.id) return;
      setForm({
        title: item.title,
        coverUrl: item.coverUrl,
        description: item.description ?? '',
        linkUrl: item.linkUrl ?? '',
        contentHtml: item.contentHtml ?? '',
        startDate: toLocalInput(item.startDate),
        endDate: toLocalInput(item.endDate),
        sortOrder: String(item.sortOrder),
        published: item.published ? 'true' : 'false',
      });
    } catch (error) {
      if (editReqRef.current !== activity.id) return;
      setServerError(error instanceof ApiError ? error.message : '活动详情读取失败');
    }
  };

  const closeEditor = () => {
    if (saving) return;
    setEditor(null);
    setServerError('');
    editReqRef.current = null;
  };

  const handleHtmlFile = (file: File) => {
    if (file.size > 300 * 1024) {
      toast.error('HTML 文件过大（上限 300KB）');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, contentHtml: String(reader.result ?? '') }));
      toast.success('HTML 内容已读入，可在下方预览编辑');
    };
    reader.onerror = () => toast.error('文件读取失败');
    reader.readAsText(file);
    if (htmlFileRef.current) htmlFileRef.current.value = '';
  };

  const validate = (): boolean => {
    const next: FormErrors = {};
    const title = form.title.trim();
    if (title.length < 1 || title.length > 60) next.title = '标题需为 1-60 个字';
    if (form.description.trim().length > 200) next.description = '简介最多 200 个字';
    const link = form.linkUrl.trim();
    if (link && !/^https?:\/\/\S+$/.test(link)) next.linkUrl = '外链需以 http(s):// 开头';
    if (form.startDate && form.endDate) {
      if (new Date(form.endDate).getTime() < new Date(form.startDate).getTime()) {
        next.endDate = '结束时间不能早于开始时间';
      }
    }
    if (form.sortOrder.trim() && !Number.isInteger(Number(form.sortOrder))) {
      next.sortOrder = '排序需为整数';
    }
    if (form.contentHtml.length > 300_000) next.contentHtml = '自定义页面内容过大（上限 300KB）';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!editor || !validate()) return;
    setServerError('');
    setSaving(true);
    const body = {
      title: form.title.trim(),
      coverUrl: form.coverUrl || null,
      description: form.description.trim() || null,
      linkUrl: form.linkUrl.trim() || null,
      contentHtml: form.contentHtml || null,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      sortOrder: Number(form.sortOrder || 0),
      published: form.published === 'true',
    };
    try {
      if (editor.mode === 'create') {
        await api.post<{ item: Activity }>('/api/admin/activities', body);
        toast.success('活动已创建');
      } else {
        await api.patch<{ item: Activity }>(`/api/admin/activities/${editor.activity.id}`, body);
        toast.success('活动已更新');
      }
      setEditor(null);
      editReqRef.current = null;
      reload();
      clearMetaCache();
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : '保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (activity: AdminActivity) => {
    setTogglingId(activity.id);
    try {
      await api.patch(`/api/admin/activities/${activity.id}`, { published: !activity.published });
      toast.success(activity.published ? '活动已下架' : '活动已上架');
      reload();
      clearMetaCache();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '操作失败，请稍后再试');
    } finally {
      setTogglingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await api.delete<void>(`/api/admin/activities/${deleting.id}`);
      toast.success('活动已删除');
      setDeleting(null);
      reload();
      clearMetaCache();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '删除失败，请稍后再试');
    } finally {
      setDeletingBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <CalendarDays className="h-5 w-5 text-amber" /> 活动管理
          </h2>
          <p className="mt-1 text-xs text-muted">
            维护历届活动看板：共 {total} 个活动。配置外链的活动卡片直达目标页，其余进站内详情页。
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
            新建活动
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]"
            />
          ))}
        </div>
      ) : failed ? (
        <EmptyState
          title="活动列表读取失败"
          description="请确认管理员权限与后端服务状态，或稍后重试。"
          icon={RefreshCw}
          action={
            <Button variant="secondary" size="sm" onClick={reload}>
              重新加载
            </Button>
          }
        />
      ) : items.length ? (
        <Card hover={false} padded={false} className="overflow-hidden">
          <div className="hidden grid-cols-[7rem_minmax(0,1.6fr)_minmax(0,1fr)_6.5rem_7.5rem] gap-3 border-b border-white/8 px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] text-muted/70 lg:grid">
            <span>封面</span>
            <span>标题 / 简介</span>
            <span>时间</span>
            <span>状态</span>
            <span className="text-right">操作</span>
          </div>
          <div className="divide-y divide-white/8">
            {items.map((activity) => {
              const status = activityStatusOf(activity);
              return (
                <div
                  key={activity.id}
                  className="grid gap-3 px-4 py-3 lg:grid-cols-[7rem_minmax(0,1.6fr)_minmax(0,1fr)_6.5rem_7.5rem] lg:items-center"
                >
                  <div className="aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-space-900/60 lg:w-28">
                    {activity.coverUrl ? (
                      <img
                        src={activity.coverUrl}
                        alt={activity.title}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-muted/60">
                        无封面
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{activity.title}</span>
                      {activity.linkUrl ? (
                        <span className="shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-muted">
                          外链
                        </span>
                      ) : null}
                      {activity.hasContentHtml ? (
                        <span className="shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-muted">
                          自定义页
                        </span>
                      ) : null}
                    </div>
                    {activity.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-muted">{activity.description}</p>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted">
                    {activity.startDate ? formatDateTime(activity.startDate) : '未设置'}
                    {activity.endDate ? ` ~ ${formatDateTime(activity.endDate)}` : ''}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={activity.published ? 'amber' : 'neutral'}>
                      {activity.published ? '已上架' : '已下架'}
                    </Badge>
                    {status ? (
                      <span className="text-[11px] text-muted">
                        {ACTIVITY_STATUS_LABELS[status]}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1.5 lg:justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={togglingId === activity.id}
                      onClick={() => void togglePublished(activity)}
                    >
                      {activity.published ? '下架' : '上架'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Pencil className="h-3.5 w-3.5" />}
                      onClick={() => void openEdit(activity)}
                      aria-label="编辑活动"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      onClick={() => setDeleting(activity)}
                      aria-label="删除活动"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <EmptyState
          title="还没有活动"
          description="创建第一个活动，让首页活动看板亮起来。"
          icon={CalendarDays}
          action={
            <Button variant="secondary" size="sm" onClick={openCreate}>
              新建活动
            </Button>
          }
        />
      )}

      <Modal
        open={Boolean(editor)}
        onClose={closeEditor}
        size="lg"
        eyebrow={editor?.mode === 'edit' ? 'Edit Activity' : 'New Activity'}
        title={editor?.mode === 'edit' ? '编辑活动' : '新建活动'}
        description="配置外链后卡片直达目标页；未配置外链时，卡片进入站内详情页（自定义 HTML 优先，缺省展示固定模板）。"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={closeEditor} disabled={saving}>
              取消
            </Button>
            <Button loading={saving} onClick={() => void submit()}>
              {editor?.mode === 'edit' ? '保存修改' : '创建活动'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="活动标题" required error={errors.title}>
              <Input
                value={form.title}
                maxLength={60}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="例如：ChiliChill五周年生日会"
              />
            </Field>
            <Field label="排序权重" error={errors.sortOrder} hint="数值越小越靠前，0 表示按时间倒序">
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
              />
            </Field>
            <Field label="开始时间">
              <Input
                type="datetime-local"
                value={form.startDate}
                onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
              />
            </Field>
            <Field label="结束时间" error={errors.endDate}>
              <Input
                type="datetime-local"
                value={form.endDate}
                onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))}
              />
            </Field>
          </div>

          <Field label="一句话简介" error={errors.description}>
            <Input
              value={form.description}
              maxLength={200}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="卡片与详情页展示的简短介绍"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="封面图" hint="16:9 比例效果最佳">
              <ImageUploader
                value={form.coverUrl}
                onChange={(url) => setForm((prev) => ({ ...prev, coverUrl: url }))}
                label="活动封面"
              />
            </Field>
            <div className="space-y-4">
              <Field
                label="外链地址"
                error={errors.linkUrl}
                hint="配置后卡片点击直接新标签打开，例如 B 站活动页"
              >
                <Input
                  value={form.linkUrl}
                  maxLength={300}
                  onChange={(event) => setForm((prev) => ({ ...prev, linkUrl: event.target.value }))}
                  placeholder="https://…"
                />
              </Field>
              <Field label="上架状态">
                <Select
                  value={form.published}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, published: event.target.value as 'true' | 'false' }))
                  }
                >
                  <option value="true">上架（前台可见）</option>
                  <option value="false">下架（仅后台可见）</option>
                </Select>
              </Field>
            </div>
          </div>

          <Field
            label="自定义活动页 HTML"
            error={errors.contentHtml}
            hint="留空则详情页使用固定模板；支持粘贴 HTML 源码或一键读入 .html 文件，渲染时会在沙箱 iframe 中隔离展示"
          >
            <div className="space-y-2">
              <input
                ref={htmlFileRef}
                type="file"
                accept=".html,.htm,text/html"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleHtmlFile(file);
                }}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<FileUp className="h-3.5 w-3.5" />}
                  onClick={() => htmlFileRef.current?.click()}
                >
                  上传 .html 文件
                </Button>
                {form.contentHtml ? (
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, contentHtml: '' }))}
                    className="text-xs text-muted transition hover:text-coral"
                  >
                    清空自定义页
                  </button>
                ) : null}
                {form.contentHtml ? (
                  <span className="text-xs text-muted/70">{form.contentHtml.length} 字符</span>
                ) : null}
              </div>
              <Textarea
                rows={6}
                value={form.contentHtml}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, contentHtml: event.target.value }))
                }
                placeholder="<!DOCTYPE html> …"
                className="font-mono text-xs"
              />
            </div>
          </Field>

          {serverError ? (
            <div className="rounded-xl border border-coral/35 bg-coral/10 px-4 py-3 text-xs text-coral">
              {serverError}
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(deleting)}
        onClose={() => {
          if (!deletingBusy) setDeleting(null);
        }}
        size="sm"
        eyebrow="Confirm Removal"
        title="删除这个活动？"
        description="活动会从首页看板与详情页中移除，此操作不可恢复。"
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
          <div className="flex items-center gap-3 rounded-xl border border-coral/30 bg-coral/[0.08] px-4 py-3">
            <div className="h-10 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-space-900/60">
              {deleting.coverUrl ? (
                <img src={deleting.coverUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <p className="min-w-0 truncate text-sm font-medium text-ink">{deleting.title}</p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
