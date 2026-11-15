import { useMemo, useState } from 'react';
import { Pencil, Plus, RefreshCw, Tags, Trash2 } from 'lucide-react';
import { TAG_SCOPES, type Tag, type TagScope } from '@spaceport/shared';
import { ApiError, api } from '../../lib/api';
import { clearMetaCache } from '../../lib/meta';
import { useAdminList } from '../../lib/useAdminList';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Card from '../../components/Card';
import EmptyState from '../../components/EmptyState';
import { Field, Input, Select } from '../../components/Field';
import Modal from '../../components/Modal';
import SearchInput from '../../components/SearchInput';
import { useToast } from '../../components/Toast';

interface AdminTag extends Tag {
  groupCount: number;
  siteCount: number;
}

const SCOPE_LABELS: Record<TagScope, string> = {
  GROUP: '群标签',
  SITE: '站点标签',
  BOTH: '通用标签',
};

const COLORS = [
  '#FFB454',
  '#FF7A59',
  '#7C9BFF',
  '#5FE3C0',
  '#B48CFF',
  '#7EE0FF',
  '#FF9AC1',
  '#F4D06F',
];

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

interface TagFormState {
  name: string;
  slug: string;
  scope: TagScope;
  color: string;
  kind: string;
  sortOrder: string;
}

type TagEditor = { mode: 'create' } | { mode: 'edit'; tag: AdminTag };

type TagErrors = Partial<Record<keyof TagFormState, string>>;

function emptyForm(): TagFormState {
  return { name: '', slug: '', scope: 'GROUP', color: COLORS[0], kind: '', sortOrder: '0' };
}

function formFromTag(tag: AdminTag): TagFormState {
  return {
    name: tag.name,
    slug: tag.slug,
    scope: tag.scope,
    color: tag.color,
    kind: tag.kind ?? '',
    sortOrder: String(tag.sortOrder),
  };
}

function usageText(tag: AdminTag): string {
  return `群 ${tag.groupCount} · 站 ${tag.siteCount}`;
}

export default function AdminTagsPage() {
  const toast = useToast();
  const { items: tags, loading, failed, reload } = useAdminList<AdminTag>((client) =>
    client.get<{ items: AdminTag[] }>('/api/admin/tags').then((result) => result.items),
  );
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | TagScope>('ALL');
  const [editor, setEditor] = useState<TagEditor | null>(null);
  const [form, setForm] = useState<TagFormState>(emptyForm);
  const [errors, setErrors] = useState<TagErrors>({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<AdminTag | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const visibleTags = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return tags.filter((tag) => {
      if (scopeFilter !== 'ALL' && tag.scope !== scopeFilter) return false;
      if (!keyword) return true;
      return (
        tag.name.toLowerCase().includes(keyword) ||
        tag.slug.toLowerCase().includes(keyword) ||
        (tag.kind ?? '').toLowerCase().includes(keyword)
      );
    });
  }, [tags, search, scopeFilter]);

  const openCreate = () => {
    setEditor({ mode: 'create' });
    setForm(emptyForm());
    setErrors({});
    setServerError('');
  };

  const openEdit = (tag: AdminTag) => {
    setEditor({ mode: 'edit', tag });
    setForm(formFromTag(tag));
    setErrors({});
    setServerError('');
  };

  const closeEditor = () => {
    if (saving) return;
    setEditor(null);
    setServerError('');
  };

  const validate = (): boolean => {
    const next: TagErrors = {};
    const name = form.name.trim();
    if (name.length < 1 || name.length > 20) next.name = '标签名需为 1-20 个字';
    if (form.slug.trim().length > 40) next.slug = '标签标识最多 40 个字符';
    if (editor?.mode === 'edit' && !form.slug.trim()) next.slug = '编辑时标签标识不能为空';
    if (!COLOR_PATTERN.test(form.color.trim())) next.color = '颜色格式应为 #RRGGBB';
    if (form.kind.trim().length > 20) next.kind = '标签分类最多 20 个字符';
    if (form.sortOrder.trim() && !Number.isInteger(Number(form.sortOrder))) {
      next.sortOrder = '排序需为整数';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!editor || !validate()) return;
    setServerError('');
    setSaving(true);
    const body = {
      name: form.name.trim(),
      slug: form.slug.trim() || undefined,
      scope: form.scope,
      color: form.color.trim(),
      kind: form.kind.trim() || null,
      sortOrder: Number(form.sortOrder || 0),
    };
    try {
      if (editor.mode === 'create') {
        await api.post<{ item: Tag }>('/api/admin/tags', body);
        toast.success('新标签已进入标签池');
      } else {
        await api.patch<{ item: Tag }>(`/api/admin/tags/${editor.tag.id}`, body);
        toast.success('标签已更新');
      }
      setEditor(null);
      reload();
      clearMetaCache();
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : '保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingBusy(true);
    try {
      await api.delete<void>(`/api/admin/tags/${deleting.id}`);
      toast.success('标签已删除');
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
            <Tags className="h-5 w-5 text-violet" /> 标签管理
          </h2>
          <p className="mt-1 text-xs text-muted">
            维护群舱与站点共用的标签池，颜色与分类会同步展示在前台。
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
            新建标签
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] p-1.5">
          <button
            type="button"
            onClick={() => setScopeFilter('ALL')}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${
              scopeFilter === 'ALL' ? 'bg-violet/15 font-medium text-violet' : 'text-muted hover:text-ink'
            }`}
          >
            全部范围
          </button>
          {TAG_SCOPES.map((scope) => (
            <button
              key={scope}
              type="button"
              onClick={() => setScopeFilter(scope)}
              className={`rounded-lg px-3 py-1.5 text-xs transition ${
                scopeFilter === scope ? 'bg-violet/15 font-medium text-violet' : 'text-muted hover:text-ink'
              }`}
            >
              {SCOPE_LABELS[scope]}
            </button>
          ))}
        </div>
        <div className="ml-auto w-full sm:w-64">
          <SearchInput value={search} onChange={setSearch} placeholder="搜索标签名、标识或分类…" />
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
          title="标签池读取失败"
          description="请确认管理员权限与后端服务状态，或稍后重试。"
          icon={RefreshCw}
          action={
            <Button variant="secondary" size="sm" onClick={reload}>
              重新加载
            </Button>
          }
        />
      ) : visibleTags.length ? (
        <Card hover={false} padded={false} className="overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6.5rem_5rem_5.5rem_6rem] gap-3 border-b border-white/8 px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] text-muted/70 lg:grid">
            <span>名称</span>
            <span>标识</span>
            <span>范围</span>
            <span>分类</span>
            <span>使用数</span>
            <span className="text-right">操作</span>
          </div>
          <div className="divide-y divide-white/8">
            {visibleTags.map((tag) => (
              <div
                key={tag.id}
                className="grid gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_6.5rem_5rem_5.5rem_6rem] lg:items-center lg:gap-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="truncate text-sm font-medium text-ink">{tag.name}</span>
                  <span className="hidden text-[11px] text-muted/60 sm:inline">{tag.color}</span>
                </div>
                <code className="truncate rounded-md border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[11px] text-muted">
                  {tag.slug}
                </code>
                <div>
                  <Badge tone={tag.scope === 'GROUP' ? 'amber' : tag.scope === 'SITE' ? 'mint' : 'violet'}>
                    {SCOPE_LABELS[tag.scope] ?? tag.scope}
                  </Badge>
                </div>
                <span className="text-xs text-muted">{tag.kind || '—'}</span>
                <span className="text-xs text-muted">{usageText(tag)}</span>
                <div className="flex items-center gap-1.5 lg:justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    onClick={() => openEdit(tag)}
                    aria-label="编辑标签"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => setDeleting(tag)}
                    aria-label="删除标签"
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          title={tags.length ? '没有匹配的标签' : '标签池还是空的'}
          description={tags.length ? '换个关键词或范围筛选试试。' : '创建第一个标签，让内容有更清晰的轨道。'}
          icon={Tags}
          action={
            <Button variant="secondary" size="sm" onClick={openCreate}>
              新建标签
            </Button>
          }
        />
      )}

      <Modal
        open={Boolean(editor)}
        onClose={closeEditor}
        size="md"
        eyebrow={editor?.mode === 'edit' ? 'Edit Tag' : 'New Tag'}
        title={editor?.mode === 'edit' ? '编辑标签' : '新建标签'}
        description="标签会用于群舱与站点筛选，请保持名称简洁、颜色易辨识。"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={closeEditor} disabled={saving}>
              取消
            </Button>
            <Button loading={saving} onClick={() => void submit()}>
              {editor?.mode === 'edit' ? '保存修改' : '创建标签'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="标签名称" required error={errors.name}>
              <Input
                value={form.name}
                maxLength={20}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="例如：二创、开黑、测试站"
              />
            </Field>
            <Field
              label="标签标识"
              required={editor?.mode === 'edit'}
              error={errors.slug}
              hint={editor?.mode === 'create' ? '留空则自动生成' : '用于 URL 与筛选项'}
            >
              <Input
                value={form.slug}
                maxLength={40}
                onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))}
                placeholder="fan-art"
              />
            </Field>
            <Field label="适用范围" required>
              <Select
                value={form.scope}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, scope: event.target.value as TagScope }))
                }
              >
                {TAG_SCOPES.map((scope) => (
                  <option key={scope} value={scope}>
                    {SCOPE_LABELS[scope]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="标签分类" error={errors.kind} hint="可填功能、地区、作品等自定义分类">
              <Input
                value={form.kind}
                maxLength={20}
                onChange={(event) => setForm((prev) => ({ ...prev, kind: event.target.value }))}
                placeholder="FUNCTION / REGION"
              />
            </Field>
            <Field label="排序权重" error={errors.sortOrder} hint="数值越小越靠前">
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
              />
            </Field>
          </div>

          <Field label="标签颜色" required error={errors.color}>
            <div className="flex flex-wrap items-center gap-2">
              {COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`选择颜色 ${color}`}
                  onClick={() => setForm((prev) => ({ ...prev, color }))}
                  className={`h-8 w-8 rounded-lg border transition ${
                    form.color.toLowerCase() === color.toLowerCase()
                      ? 'scale-110 border-white/70'
                      : 'border-white/15 hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
              <input
                type="color"
                value={COLOR_PATTERN.test(form.color) ? form.color : COLORS[0]}
                onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
                className="h-8 w-10 cursor-pointer rounded-lg border border-white/15 bg-transparent"
                aria-label="自定义颜色"
              />
              <span className="text-xs text-muted">{form.color}</span>
            </div>
          </Field>

          <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
            <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-muted/70">前台预览</p>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-ink"
              style={{
                borderColor: `${form.color}44`,
                backgroundColor: `${form.color}10`,
              }}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: form.color }}
              />
              {form.name.trim() || '标签名称'}
            </span>
          </div>

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
        title="删除这个标签？"
        description="标签会从所有群舱与站点上解除关联，此操作不可恢复。"
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
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: deleting.color }}
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{deleting.name}</p>
              <p className="text-xs text-muted">
                {deleting.slug} · {usageText(deleting)}
              </p>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
