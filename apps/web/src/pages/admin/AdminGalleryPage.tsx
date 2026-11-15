import { useState } from 'react';
import { Heart, Images, MessageSquare, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { GalleryImage } from '@spaceport/shared';
import { ApiError, api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { clearMetaCache } from '../../lib/meta';
import { useAdminList } from '../../lib/useAdminList';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Card from '../../components/Card';
import EmptyState from '../../components/EmptyState';
import { Field, Input, Select } from '../../components/Field';
import ImageUploader from '../../components/ImageUploader';
import Modal from '../../components/Modal';
import { useToast } from '../../components/Toast';

interface GalleryFormState {
  title: string;
  imageUrl: string | null;
  published: 'true' | 'false';
}

type Editor = { mode: 'create' } | { mode: 'edit'; image: GalleryImage };

type FormErrors = Partial<Record<keyof GalleryFormState, string>>;

function emptyForm(): GalleryFormState {
  return { title: '', imageUrl: null, published: 'true' };
}

export default function AdminGalleryPage() {
  const toast = useToast();
  const [total, setTotal] = useState(0);
  const { items, loading, failed, reload } = useAdminList<GalleryImage>((client) =>
    client
      .get<{ items: GalleryImage[]; total: number }>('/api/admin/gallery', {
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
  const [form, setForm] = useState<GalleryFormState>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<GalleryImage | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const openCreate = () => {
    setEditor({ mode: 'create' });
    setForm(emptyForm());
    setErrors({});
    setServerError('');
  };

  const openEdit = (image: GalleryImage) => {
    setEditor({ mode: 'edit', image });
    setErrors({});
    setServerError('');
    setForm({
      title: image.title ?? '',
      imageUrl: image.imageUrl,
      published: image.published ? 'true' : 'false',
    });
  };

  const closeEditor = () => {
    if (saving) return;
    setEditor(null);
    setServerError('');
  };

  const validate = (): boolean => {
    const next: FormErrors = {};
    if (!form.imageUrl) next.imageUrl = '请上传作品图片';
    if (form.title.trim().length > 40) next.title = '标题最多 40 个字';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!editor || !validate()) return;
    setServerError('');
    setSaving(true);
    const body = {
      imageUrl: form.imageUrl ?? '',
      title: form.title.trim() || null,
      published: form.published === 'true',
    };
    try {
      if (editor.mode === 'create') {
        await api.post<{ item: GalleryImage }>('/api/admin/gallery', body);
        toast.success('作品已上传');
        clearMetaCache();
      } else {
        await api.patch<{ item: GalleryImage }>(`/api/admin/gallery/${editor.image.id}`, body);
        toast.success('作品已更新');
      }
      setEditor(null);
      reload();
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : '保存失败，请稍后再试');
    } finally {
      setSaving(false);
    }
  };

  const togglePublished = async (image: GalleryImage) => {
    setTogglingId(image.id);
    try {
      await api.patch(`/api/admin/gallery/${image.id}`, { published: !image.published });
      toast.success(image.published ? '作品已下架' : '作品已上架');
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
      await api.delete<void>(`/api/admin/gallery/${deleting.id}`);
      toast.success('作品已删除');
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
            <Images className="h-5 w-5 text-amber" /> 画廊管理
          </h2>
          <p className="mt-1 text-xs text-muted">
            维护粉丝画廊作品：共 {total} 件。上传后前台按时间倒序瀑布流展示。
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
            上传作品
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
          title="画廊列表读取失败"
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
          <div className="hidden grid-cols-[6rem_minmax(0,1.8fr)_8rem_6.5rem_7.5rem] gap-3 border-b border-white/8 px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] text-muted/70 lg:grid">
            <span>作品</span>
            <span>标题</span>
            <span>互动</span>
            <span>状态</span>
            <span className="text-right">操作</span>
          </div>
          <div className="divide-y divide-white/8">
            {items.map((image) => (
              <div
                key={image.id}
                className="grid gap-3 px-4 py-3 lg:grid-cols-[6rem_minmax(0,1.8fr)_8rem_6.5rem_7.5rem] lg:items-center"
              >
                <div className="aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-space-900/60 lg:w-24">
                  <img
                    src={image.imageUrl}
                    alt={image.title || '画廊作品'}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {image.title || '未命名作品'}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {image.uploader ? `${image.uploader.nickname} · ` : ''}
                    {formatDateTime(image.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5" /> {image.likeCount}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" /> {image.commentCount}
                  </span>
                </div>
                <div>
                  <Badge tone={image.published ? 'amber' : 'neutral'}>
                    {image.published ? '已上架' : '已下架'}
                  </Badge>
                </div>
                <div className="flex items-center gap-1.5 lg:justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={togglingId === image.id}
                    onClick={() => void togglePublished(image)}
                  >
                    {image.published ? '下架' : '上架'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Pencil className="h-3.5 w-3.5" />}
                    onClick={() => openEdit(image)}
                    aria-label="编辑作品"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => setDeleting(image)}
                    aria-label="删除作品"
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <EmptyState
          title="画廊还没有作品"
          description="上传第一件作品，让前台画廊亮起来。"
          icon={Images}
          action={
            <Button variant="secondary" size="sm" onClick={openCreate}>
              上传作品
            </Button>
          }
        />
      )}

      <Modal
        open={Boolean(editor)}
        onClose={closeEditor}
        size="lg"
        eyebrow={editor?.mode === 'edit' ? 'Edit Artwork' : 'New Artwork'}
        title={editor?.mode === 'edit' ? '编辑作品' : '上传作品'}
        description="作品会展示在前台画廊瀑布流中，粉丝可点赞与评论。"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={closeEditor} disabled={saving}>
              取消
            </Button>
            <Button loading={saving} onClick={() => void submit()}>
              {editor?.mode === 'edit' ? '保存修改' : '上传作品'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="作品图片" required error={errors.imageUrl} hint="建议竖版或方形构图，瀑布流效果更佳">
            <ImageUploader
              value={form.imageUrl}
              onChange={(url) => setForm((prev) => ({ ...prev, imageUrl: url }))}
              label="作品图片"
            />
          </Field>

          <Field label="作品标题" error={errors.title}>
            <Input
              value={form.title}
              maxLength={40}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="例如：舞台上的辣椒星光"
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
        title="删除这件作品？"
        description="作品与其点赞、评论记录会一并移除，此操作不可恢复。"
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
              <img src={deleting.imageUrl} alt="" className="h-full w-full object-cover" />
            </div>
            <p className="min-w-0 truncate text-sm font-medium text-ink">
              {deleting.title || '未命名作品'}
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
