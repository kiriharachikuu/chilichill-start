import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Globe2,
  Heart,
  Images,
  Layers,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UsersRound,
} from 'lucide-react';
import { GROUP_PLATFORM_LABELS, type GalleryImage, type Group, type Paginated, type Site } from '@spaceport/shared';
import { ApiError, api } from '../../lib/api';
import { useDebouncedValue } from '../../lib/hooks';
import { formatDateTime } from '../../lib/format';
import { clearMetaCache } from '../../lib/meta';
import Badge from '../../components/Badge';
import Button, { buttonClass } from '../../components/Button';
import Card from '../../components/Card';
import EmptyState from '../../components/EmptyState';
import { Field, Input, Select } from '../../components/Field';
import ImageUploader from '../../components/ImageUploader';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import SearchInput from '../../components/SearchInput';
import TagChip from '../../components/TagChip';
import { useToast } from '../../components/Toast';

type ContentTab = 'GROUP' | 'SITE' | 'GALLERY';
type StatusFilter = 'ALL' | 'PUBLISHED' | 'HIDDEN';
type ContentItem = Group | Site | GalleryImage;

const PAGE_SIZE = 10;

const TABS: { key: ContentTab; label: string; icon: typeof UsersRound }[] = [
  { key: 'GROUP', label: '群舱', icon: UsersRound },
  { key: 'SITE', label: '站点', icon: Globe2 },
  { key: 'GALLERY', label: '画廊', icon: Images },
];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: '全部状态' },
  { key: 'PUBLISHED', label: '已上线' },
  { key: 'HIDDEN', label: '已下线' },
];

const ENDPOINTS: Record<ContentTab, string> = {
  GROUP: '/api/admin/groups',
  SITE: '/api/admin/sites',
  GALLERY: '/api/admin/gallery',
};

function isGroup(item: ContentItem): item is Group {
  return 'groupNumber' in item;
}

function isGallery(item: ContentItem): item is GalleryImage {
  return 'imageUrl' in item;
}

function endpointFor(item: ContentItem): string {
  return isGroup(item) ? ENDPOINTS.GROUP : isGallery(item) ? ENDPOINTS.GALLERY : ENDPOINTS.SITE;
}

function itemTitle(item: ContentItem): string {
  if (isGroup(item)) return item.name;
  if (isGallery(item)) return item.title || '未命名作品';
  return item.title;
}

// 群舱/站点带 updatedAt；画廊作品只有 createdAt（上传后不跟踪更新时间）
function itemSubtitle(item: ContentItem): string {
  if (isGroup(item))
    return `${item.groupNumber ?? GROUP_PLATFORM_LABELS[item.platform ?? 'QQ']} · ${
      item.city ?? item.regionName ?? '线上 / 待定'
    }`;
  if (isGallery(item))
    return `${item.uploader ? `${item.uploader.nickname} · ` : ''}上传于 ${formatDateTime(item.createdAt)}`;
  return item.url;
}

interface GalleryEditorFormState {
  title: string;
  imageUrl: string | null;
  published: 'true' | 'false';
}

type GalleryEditor = { mode: 'create' } | { mode: 'edit'; image: GalleryImage };

type GalleryEditorErrors = Partial<Record<keyof GalleryEditorFormState, string>>;

function emptyGalleryEditorForm(): GalleryEditorFormState {
  return { title: '', imageUrl: null, published: 'true' };
}

export default function AdminContentPage() {
  const toast = useToast();
  const [tab, setTab] = useState<ContentTab>('GROUP');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<ContentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ContentItem | null>(null);

  // 画廊编辑弹窗（合并自画廊管理页）：仅画廊 tab 使用
  const [galleryEditor, setGalleryEditor] = useState<GalleryEditor | null>(null);
  const [galleryForm, setGalleryForm] = useState<GalleryEditorFormState>(emptyGalleryEditorForm);
  const [galleryErrors, setGalleryErrors] = useState<GalleryEditorErrors>({});
  const [galleryServerError, setGalleryServerError] = useState('');
  const [gallerySaving, setGallerySaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);

    api
      .get<Paginated<ContentItem>>(ENDPOINTS[tab], {
        q: debouncedSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
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
  }, [tab, debouncedSearch, page, reloadKey]);

  const visibleItems = items.filter((item) => {
    if (status === 'ALL') return true;
    return status === 'PUBLISHED' ? item.published : !item.published;
  });

  const togglePublished = async (item: ContentItem) => {
    setBusyId(item.id);
    try {
      const result = await api.patch<{ item: ContentItem }>(`${endpointFor(item)}/${item.id}`, {
        published: !item.published,
      });
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, ...result.item } : row)),
      );
      toast.success(item.published ? '已下线，内容从前台舱段隐藏' : '已上线，内容重新出现在前台');
      clearMetaCache();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '状态切换失败，请稍后再试');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusyId(deleting.id);
    try {
      await api.delete<void>(`${endpointFor(deleting)}/${deleting.id}`);
      setItems((prev) => prev.filter((row) => row.id !== deleting.id));
      setTotal((value) => Math.max(0, value - 1));
      toast.success('内容已从空间站移除');
      clearMetaCache();
      setDeleting(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '删除失败，请稍后再试');
    } finally {
      setBusyId(null);
    }
  };

  const openGalleryCreate = () => {
    setGalleryEditor({ mode: 'create' });
    setGalleryForm(emptyGalleryEditorForm());
    setGalleryErrors({});
    setGalleryServerError('');
  };

  const openGalleryEdit = (image: GalleryImage) => {
    setGalleryEditor({ mode: 'edit', image });
    setGalleryErrors({});
    setGalleryServerError('');
    setGalleryForm({
      title: image.title ?? '',
      imageUrl: image.imageUrl,
      published: image.published ? 'true' : 'false',
    });
  };

  const submitGalleryEditor = async () => {
    if (!galleryEditor) return;
    const next: GalleryEditorErrors = {};
    if (!galleryForm.imageUrl) next.imageUrl = '请上传作品图片';
    if (galleryForm.title.trim().length > 40) next.title = '标题最多 40 个字';
    setGalleryErrors(next);
    if (Object.keys(next).length > 0) return;

    setGalleryServerError('');
    setGallerySaving(true);
    const body = {
      imageUrl: galleryForm.imageUrl ?? '',
      title: galleryForm.title.trim() || null,
      published: galleryForm.published === 'true',
    };
    try {
      if (galleryEditor.mode === 'create') {
        await api.post<{ item: GalleryImage }>(ENDPOINTS.GALLERY, body);
        toast.success('作品已上传');
        clearMetaCache();
        setGalleryEditor(null);
        setReloadKey((key) => key + 1);
      } else {
        const result = await api.patch<{ item: GalleryImage }>(
          `${ENDPOINTS.GALLERY}/${galleryEditor.image.id}`,
          body,
        );
        setItems((prev) =>
          prev.map((row) => (row.id === galleryEditor.image.id ? { ...row, ...result.item } : row)),
        );
        toast.success('作品已更新');
        clearMetaCache();
        setGalleryEditor(null);
      }
    } catch (error) {
      setGalleryServerError(error instanceof ApiError ? error.message : '保存失败，请稍后再试');
    } finally {
      setGallerySaving(false);
    }
  };

  const searchPlaceholder =
    tab === 'GROUP'
      ? '搜索群名、群号或简介…'
      : tab === 'GALLERY'
        ? '搜索作品标题…'
        : '搜索站点标题、链接或简介…';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <Layers className="h-5 w-5 text-aurora" /> 内容管理
          </h2>
          <p className="mt-1 text-xs text-muted">
            管理已发布的群舱、站点与画廊作品，可随时上线、下线或彻底移除。
          </p>
        </div>
        <div className="flex items-center gap-2">
          {failed ? (
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="inline-flex items-center gap-1 text-xs text-muted transition hover:text-amber"
            >
              <RefreshCw className="h-3.5 w-3.5" /> 重试
            </button>
          ) : null}
          {tab === 'GALLERY' ? (
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openGalleryCreate}>
              上传作品
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] p-1.5">
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setTab(item.key);
                  setPage(1);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition ${
                  tab === item.key
                    ? 'bg-amber/15 font-medium text-amber'
                    : 'text-muted hover:text-ink'
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {item.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] p-1.5">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setStatus(item.key)}
              className={`rounded-lg px-3 py-1.5 text-xs transition ${
                status === item.key
                  ? 'bg-aurora/15 font-medium text-aurora'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="ml-auto w-full sm:w-72">
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder={searchPlaceholder}
          />
        </div>
      </div>

      <p className="text-[11px] text-muted/70">
        共 {total} 条内容，当前页显示 {visibleItems.length} 条
        {status !== 'ALL' ? '（状态筛选在当前页内生效）' : ''}
      </p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]"
            />
          ))}
        </div>
      ) : failed ? (
        <EmptyState
          title="内容舱段读取失败"
          description="请确认管理员权限与后端服务状态，或稍后重试。"
          icon={RefreshCw}
          action={
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
              重新加载
            </Button>
          }
        />
      ) : visibleItems.length ? (
        <>
          <Card hover={false} padded={false} className="divide-y divide-white/8 overflow-hidden">
            {visibleItems.map((item) => {
              const group = isGroup(item);
              const gallery = isGallery(item);
              return (
                <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  {gallery ? (
                    <img
                      src={item.imageUrl}
                      alt={itemTitle(item)}
                      loading="lazy"
                      className="h-9 w-9 shrink-0 rounded-xl border border-white/10 object-cover"
                    />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                      {group ? (
                        <UsersRound className="h-4 w-4 text-amber" />
                      ) : (
                        <Globe2 className="h-4 w-4 text-mint" />
                      )}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{itemTitle(item)}</span>
                      <Badge tone={group ? 'amber' : gallery ? 'aurora' : 'mint'}>
                        {group ? 'Q群' : gallery ? '画廊' : '网站'}
                      </Badge>
                      <Badge tone={item.published ? 'mint' : 'coral'}>
                        {item.published ? '已上线' : '已下线'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {itemSubtitle(item)}
                      {gallery ? '' : ` · 更新于 ${formatDateTime(item.updatedAt)}`}
                    </p>
                    {gallery ? (
                      item.tags.length ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {item.tags.slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-muted"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      ) : null
                    ) : item.tags.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {item.tags.slice(0, 4).map((tag) => (
                          <TagChip key={tag.id} tag={tag} muted />
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {gallery ? (
                    <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
                      <span className="inline-flex items-center gap-1">
                        <Heart className="h-3.5 w-3.5" /> {item.likeCount}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3.5 w-3.5" /> {item.commentCount}
                      </span>
                    </div>
                  ) : null}

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {group ? (
                      <Link
                        to={`/groups/${item.id}`}
                        className={buttonClass({ variant: 'ghost', size: 'sm' })}
                      >
                        查看
                      </Link>
                    ) : gallery ? (
                      <Link to="/gallery" className={buttonClass({ variant: 'ghost', size: 'sm' })}>
                        查看
                      </Link>
                    ) : (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonClass({ variant: 'ghost', size: 'sm' })}
                      >
                        查看
                      </a>
                    )}
                    {gallery ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId !== null && busyId !== item.id}
                        icon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => openGalleryEdit(item)}
                        aria-label="编辑作品"
                      />
                    ) : null}
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busyId === item.id}
                      disabled={busyId !== null && busyId !== item.id}
                      icon={
                        item.published ? (
                          <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                          <Eye className="h-3.5 w-3.5" />
                        )
                      }
                      onClick={() => void togglePublished(item)}
                    >
                      {item.published ? '下线' : '上线'}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busyId !== null && busyId !== item.id}
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      onClick={() => setDeleting(item)}
                      aria-label="删除内容"
                    />
                  </div>
                </div>
              );
            })}
          </Card>
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </>
      ) : (
        <EmptyState
          title={
            items.length
              ? '当前页没有符合状态的内容'
              : tab === 'GALLERY'
                ? '画廊还没有作品'
                : '这个舱段还没有内容'
          }
          description={
            items.length
              ? '切换状态筛选或翻到其他页继续查看。'
              : tab === 'GALLERY'
                ? '上传第一件作品，或等审核通过的粉丝投稿自动出现在这里。'
                : '审核通过的新投稿会自动出现在这里。'
          }
          icon={tab === 'GROUP' ? UsersRound : tab === 'GALLERY' ? Images : Globe2}
        />
      )}

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        size="sm"
        eyebrow="Confirm Removal"
        title={deleting && isGallery(deleting) ? '删除这件作品？' : '彻底移除这条内容？'}
        description={
          deleting && isGallery(deleting)
            ? '作品与其点赞、评论记录会一并移除，此操作不可恢复。若只是暂时隐藏，请使用「下线」。'
            : '删除后无法恢复，相关投稿记录也会一并清理。若只是暂时隐藏，请使用「下线」。'
        }
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              disabled={busyId !== null}
              onClick={() => setDeleting(null)}
            >
              取消
            </Button>
            <Button
              variant="danger"
              loading={busyId === deleting?.id}
              disabled={busyId !== null && busyId !== deleting?.id}
              onClick={() => void confirmDelete()}
            >
              确认删除
            </Button>
          </div>
        }
      >
        {deleting ? (
          <div className="flex items-center gap-3 rounded-xl border border-coral/30 bg-coral/[0.08] px-4 py-3">
            {isGallery(deleting) ? (
              <div className="h-10 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-space-900/60">
                <img src={deleting.imageUrl} alt="" className="h-full w-full object-cover" />
              </div>
            ) : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{itemTitle(deleting)}</p>
              <p className="mt-1 break-all text-xs text-muted">{itemSubtitle(deleting)}</p>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(galleryEditor)}
        onClose={() => {
          if (!gallerySaving) setGalleryEditor(null);
        }}
        size="lg"
        eyebrow={galleryEditor?.mode === 'edit' ? 'Edit Artwork' : 'New Artwork'}
        title={galleryEditor?.mode === 'edit' ? '编辑作品' : '上传作品'}
        description="作品会展示在前台画廊瀑布流中，粉丝可点赞与评论。"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setGalleryEditor(null)}
              disabled={gallerySaving}
            >
              取消
            </Button>
            <Button loading={gallerySaving} onClick={() => void submitGalleryEditor()}>
              {galleryEditor?.mode === 'edit' ? '保存修改' : '上传作品'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field
            label="作品图片"
            required
            error={galleryErrors.imageUrl}
            hint="建议竖版或方形构图，瀑布流效果更佳"
          >
            <ImageUploader
              value={galleryForm.imageUrl}
              onChange={(url) => setGalleryForm((prev) => ({ ...prev, imageUrl: url }))}
              label="作品图片"
            />
          </Field>

          <Field label="作品标题" error={galleryErrors.title}>
            <Input
              value={galleryForm.title}
              maxLength={40}
              onChange={(event) =>
                setGalleryForm((prev) => ({ ...prev, title: event.target.value }))
              }
              placeholder="例如：舞台上的辣椒星光"
            />
          </Field>

          <Field label="上架状态">
            <Select
              value={galleryForm.published}
              onChange={(event) =>
                setGalleryForm((prev) => ({
                  ...prev,
                  published: event.target.value as 'true' | 'false',
                }))
              }
            >
              <option value="true">上架（前台可见）</option>
              <option value="false">下架（仅后台可见）</option>
            </Select>
          </Field>

          {galleryServerError ? (
            <div className="rounded-xl border border-coral/35 bg-coral/10 px-4 py-3 text-xs text-coral">
              {galleryServerError}
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
