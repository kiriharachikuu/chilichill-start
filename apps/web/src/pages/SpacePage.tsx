import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarDays, Globe2, Images, MapPin, Search, Sparkles, UsersRound } from 'lucide-react';
import {
  type GalleryImage,
  type Group,
  type Site,
  type SpaceResourceItem,
  type SpaceResponse,
  type SpaceResourcesResponse,
} from '@spaceport/shared';
import { api } from '../lib/api';
import { formatDateTime, gradientFor, initialOf } from '../lib/format';
import { useGalleryInteractions } from '../lib/useGalleryInteractions';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import GalleryCard from '../components/GalleryCard';
import GalleryDetailModal from '../components/GalleryDetailModal';
import GroupCard from '../components/GroupCard';
import MasonryGrid from '../components/MasonryGrid';
import Pagination from '../components/Pagination';
import SiteCard from '../components/SiteCard';

const PAGE_SIZE = 12;

export default function SpacePage() {
  const { uid } = useParams<{ uid: string }>();
  const { likePendingId, resolveLike, toggleLike, handleCommentCountChange, reset } =
    useGalleryInteractions();
  const [data, setData] = useState<SpaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<SpaceResourceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [selected, setSelected] = useState<GalleryImage | null>(null);
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    setData(null);
    setTab(null);
    setPage(1);
    setItems([]);
    setTotal(0);
    setSelected(null);
    reset();
    api
      .get<SpaceResponse>(`/api/users/uid/${uid ?? ''}`)
      .then((result) => {
        if (alive) setData(result);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [uid, reset]);

  // 内容类型分页签：只显示有内容的类型，后续新增音乐/画作时在此追加即可
  const counts = data?.counts ?? { groups: 0, sites: 0, gallery: 0 };
  const tabs = [
    { key: 'groups', label: '粉丝群', icon: UsersRound, count: counts.groups },
    { key: 'sites', label: '网站', icon: Globe2, count: counts.sites },
    { key: 'gallery', label: '画廊', icon: Images, count: counts.gallery },
  ].filter((item) => item.count > 0);
  const activeTab = tab && tabs.some((item) => item.key === tab) ? tab : tabs[0]?.key ?? null;

  // Tab 内分页加载资源
  useEffect(() => {
    if (!data || !activeTab) return;
    let alive = true;
    setItemsLoading(true);
    const type = activeTab === 'groups' ? 'GROUP' : activeTab === 'sites' ? 'SITE' : 'GALLERY';
    api
      .get<SpaceResourcesResponse>(
        `/api/users/uid/${uid ?? ''}/resources?type=${type}&page=${page}&pageSize=${PAGE_SIZE}`,
      )
      .then((result) => {
        if (!alive) return;
        setItems(result.items);
        setTotal(result.total);
      })
      .catch(() => {
        if (!alive) return;
        setItems([]);
        setTotal(0);
      })
      .finally(() => {
        if (alive) setItemsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [data, activeTab, page, uid]);

  const handleTabChange = (key: string) => {
    if (key === tab) return;
    // 立即清空旧类型数据并进入加载态，避免一帧内用旧类型数据渲染新类型卡片
    setTab(key);
    setPage(1);
    setItems([]);
    setTotal(0);
    setItemsLoading(true);
  };

  // 图片实际加载后上报真实尺寸，修正瀑布流占位高度
  const handleMeasure = useCallback((id: string, width: number, height: number) => {
    setMeasured((prev) => {
      const current = prev[id];
      if (current && current.width === width && current.height === height) {
        return prev;
      }
      return { ...prev, [id]: { width, height } };
    });
  }, []);

  const getAspectRatio = useCallback(
    (image: GalleryImage): number | null => {
      const actual = measured[image.id];
      if (actual) {
        return actual.width / actual.height;
      }
      if (image.imageWidth && image.imageHeight) {
        return image.imageWidth / image.imageHeight;
      }
      return null;
    },
    [measured],
  );

  const displayedGalleryImages =
    activeTab === 'gallery'
      ? (items as GalleryImage[]).map((image) => ({ ...image, ...resolveLike(image) }))
      : [];
  const selectedView = selected ? { ...selected, ...resolveLike(selected) } : null;

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-48 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-64 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
          ))}
        </div>
      </div>
    );
  }

  if (failed || !data) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <EmptyState
          title="没有找到这个空间"
          description="uid 可能不存在，或者用户已经离开星港。"
          icon={Search}
          action={
            <Link to="/groups" className="text-sm text-amber underline-offset-2 hover:underline">
              返回群舱导航
            </Link>
          }
        />
      </div>
    );
  }

  const { user } = data;
  const location = [user.province, user.city].filter(Boolean).join(' · ') || null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Card hover={false} className="overflow-hidden" padded={false}>
        <div
          className="relative h-36 w-full sm:h-48"
          style={user.bannerUrl ? undefined : { backgroundImage: gradientFor(user.nickname) }}
        >
          {user.bannerUrl ? (
            <img
              src={user.bannerUrl}
              alt="个人空间头图"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.18),transparent_55%)]" />
          )}
          {/* 底部渐变过渡，让头图与信息区衔接更自然 */}
          <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-space-950/55 to-transparent" />
        </div>
        <div className="relative px-6 pb-6 sm:px-8">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <div className="-mt-12 flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-space-200 bg-white text-3xl font-semibold text-ink shadow-lg shadow-space-950/40">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt={`${user.nickname} 的头像`} className="h-full w-full object-cover" />
              ) : (
                initialOf(user.nickname)
              )}
            </div>
            <div className="min-w-0 flex-1 pb-1 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-ink">{user.nickname}</h1>
                <span className="rounded-full border border-amber/30 bg-amber/10 px-2.5 py-0.5 font-mono text-xs text-amber">
                  UID {user.uid}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                {location ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" /> {location}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" /> 加入于 {formatDateTime(user.createdAt)}
                </span>
              </div>
            </div>
          </div>
          {user.bio ? (
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink/80">{user.bio}</p>
          ) : null}
        </div>
      </Card>

      {tabs.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-1.5">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleTabChange(item.key)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm transition ${
                  active ? 'bg-amber/15 font-medium text-amber' : 'text-muted hover:bg-white/[0.04] hover:text-ink'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
                <span
                  className={`rounded-full px-1.5 py-0.5 font-mono text-[11px] ${
                    active ? 'bg-amber/20 text-amber' : 'bg-white/8 text-muted'
                  }`}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="TA 还没有上传任何资源"
          description="通过审核的投稿会展示在这里。欢迎先去逛逛群舱和站点。"
          icon={Sparkles}
          action={
            <Link to="/groups" className="text-sm text-amber underline-offset-2 hover:underline">
              去逛逛群舱
            </Link>
          }
        />
      )}

      {itemsLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-64 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
          ))}
        </div>
      ) : activeTab === 'groups' ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(items as Group[]).map((group) => (
              <GroupCard key={group.id} group={group} />
            ))}
          </div>
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
      ) : activeTab === 'sites' ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(items as Site[]).map((site) => (
              <SiteCard key={site.id} site={site} />
            ))}
          </div>
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
      ) : activeTab === 'gallery' ? (
        <div className="space-y-4">
          <MasonryGrid
            items={displayedGalleryImages}
            getId={(image) => image.id}
            getAspectRatio={getAspectRatio}
            renderItem={(image) => (
              <GalleryCard
                image={image}
                likePending={likePendingId === image.id}
                onOpen={setSelected}
                onToggleLike={(target) => void toggleLike(target)}
                onMeasure={handleMeasure}
              />
            )}
          />
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
      ) : null}

      {tabs.length ? (
        <div className="flex items-center gap-2 text-xs text-muted/70">
          <Sparkles className="h-3.5 w-3.5" /> 以上内容由运营团队审核后收录，感谢每一位贡献者。
        </div>
      ) : null}

      <GalleryDetailModal
        image={selectedView}
        likePending={selected ? likePendingId === selected.id : false}
        onClose={() => setSelected(null)}
        onToggleLike={(target) => void toggleLike(target)}
        onCommentCountChange={handleCommentCountChange}
      />
    </div>
  );
}
