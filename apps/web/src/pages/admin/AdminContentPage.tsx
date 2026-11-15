import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Globe2,
  Layers,
  RefreshCw,
  Trash2,
  UsersRound,
} from 'lucide-react';
import type { Group, Paginated, Site } from '@spaceport/shared';
import { ApiError, api } from '../../lib/api';
import { useDebouncedValue } from '../../lib/hooks';
import { formatDateTime } from '../../lib/format';
import { clearMetaCache } from '../../lib/meta';
import Badge from '../../components/Badge';
import Button, { buttonClass } from '../../components/Button';
import Card from '../../components/Card';
import EmptyState from '../../components/EmptyState';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import SearchInput from '../../components/SearchInput';
import TagChip from '../../components/TagChip';
import { useToast } from '../../components/Toast';

type ContentTab = 'GROUP' | 'SITE';
type StatusFilter = 'ALL' | 'PUBLISHED' | 'HIDDEN';
type ContentItem = Group | Site;

const PAGE_SIZE = 10;

const TABS: { key: ContentTab; label: string; icon: typeof UsersRound }[] = [
  { key: 'GROUP', label: '群舱', icon: UsersRound },
  { key: 'SITE', label: '站点', icon: Globe2 },
];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'ALL', label: '全部状态' },
  { key: 'PUBLISHED', label: '已上线' },
  { key: 'HIDDEN', label: '已下线' },
];

function isGroup(item: ContentItem): item is Group {
  return 'groupNumber' in item;
}

function itemTitle(item: ContentItem): string {
  return isGroup(item) ? item.name : item.title;
}

function itemSubtitle(item: ContentItem): string {
  return isGroup(item)
    ? `${item.groupNumber} · ${item.city ?? item.regionName ?? '线上 / 待定'}`
    : item.url;
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

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    const endpoint = tab === 'GROUP' ? '/api/admin/groups' : '/api/admin/sites';

    api
      .get<Paginated<Group> | Paginated<Site>>(endpoint, {
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
      const endpoint = isGroup(item) ? '/api/admin/groups' : '/api/admin/sites';
      const result = await api.patch<{ item: ContentItem }>(`${endpoint}/${item.id}`, {
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
      const endpoint = isGroup(deleting) ? '/api/admin/groups' : '/api/admin/sites';
      await api.delete<void>(`${endpoint}/${deleting.id}`);
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <Layers className="h-5 w-5 text-aurora" /> 内容管理
          </h2>
          <p className="mt-1 text-xs text-muted">
            管理已发布的群舱与站点，可随时上线、下线或彻底移除。
          </p>
        </div>
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
            placeholder={tab === 'GROUP' ? '搜索群名、群号或简介…' : '搜索站点标题、链接或简介…'}
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
              return (
                <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                    {group ? (
                      <UsersRound className="h-4 w-4 text-amber" />
                    ) : (
                      <Globe2 className="h-4 w-4 text-mint" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">{itemTitle(item)}</span>
                      <Badge tone={group ? 'amber' : 'mint'}>{group ? 'Q群' : '网站'}</Badge>
                      <Badge tone={item.published ? 'mint' : 'coral'}>
                        {item.published ? '已上线' : '已下线'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {itemSubtitle(item)} · 更新于 {formatDateTime(item.updatedAt)}
                    </p>
                    {item.tags.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {item.tags.slice(0, 4).map((tag) => (
                          <TagChip key={tag.id} tag={tag} muted />
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {group ? (
                      <Link
                        to={`/groups/${item.id}`}
                        className={buttonClass({ variant: 'ghost', size: 'sm' })}
                      >
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
          title={items.length ? '当前页没有符合状态的内容' : '这个舱段还没有内容'}
          description={
            items.length
              ? '切换状态筛选或翻到其他页继续查看。'
              : '审核通过的新投稿会自动出现在这里。'
          }
          icon={tab === 'GROUP' ? UsersRound : Globe2}
        />
      )}

      <Modal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        size="sm"
        eyebrow="Confirm Removal"
        title="彻底移除这条内容？"
        description="删除后无法恢复，相关投稿记录也会一并清理。若只是暂时隐藏，请使用「下线」。"
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
          <div className="rounded-xl border border-coral/30 bg-coral/[0.08] px-4 py-3">
            <p className="text-sm font-medium text-ink">{itemTitle(deleting)}</p>
            <p className="mt-1 break-all text-xs text-muted">{itemSubtitle(deleting)}</p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
