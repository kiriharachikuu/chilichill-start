import { useCallback, useEffect, useRef, useState } from 'react';
import { Images, RefreshCw } from 'lucide-react';
import type { GalleryImage, GalleryListResponse } from '@spaceport/shared';
import { api } from '../lib/api';
import EmptyState from '../components/EmptyState';
import GalleryCard from '../components/GalleryCard';
import GalleryDetailModal from '../components/GalleryDetailModal';
import MasonryGrid from '../components/MasonryGrid';
import Button from '../components/Button';
import SectionHeading from '../components/SectionHeading';
import { useGalleryInteractions } from '../lib/useGalleryInteractions';

const PAGE_SIZE = 12;
const SKELETON_HEIGHTS = [240, 320, 280, 360, 260, 300, 340, 240, 280, 320, 260, 300];

export default function GalleryPage() {
  const { likePendingId, resolveLike, toggleLike, handleCommentCountChange, reset } =
    useGalleryInteractions();

  const [images, setImages] = useState<GalleryImage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<GalleryImage | null>(null);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const pageRef = useRef(1);

  const fetchPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      if (replace) {
        setInitialLoading(true);
      } else {
        setLoadingMore(true);
      }
      setFailed(false);
      try {
        const res = await api.get<GalleryListResponse>('/api/gallery', {
          page: nextPage,
          pageSize: PAGE_SIZE,
        });
        setImages((prev) => (replace ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        setPage(res.page);
        pageRef.current = res.page;
        setHasMore(res.hasMore);
        if (replace) {
          reset();
        }
      } catch {
        setFailed(true);
      } finally {
        loadingRef.current = false;
        setInitialLoading(false);
        setLoadingMore(false);
      }
    },
    [reset],
  );

  useEffect(() => {
    void fetchPage(1, true);
  }, [fetchPage]);

  // 无限滚动：哨兵元素进入视口附近时加载下一页
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingRef.current) {
          void fetchPage(page + 1, false);
        }
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, page, fetchPage]);

  // 图片实际加载后上报真实尺寸，修正瀑布流占位高度
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
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

  const selectedView = selected ? { ...selected, ...resolveLike(selected) } : null;
  const displayedImages = images.map((image) => ({ ...image, ...resolveLike(image) }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <SectionHeading
        eyebrow="Gallery"
        title="粉丝画廊"
        description="这里收藏着粉丝们为 ChiliChill 创作的绘画与设计，欢迎喜欢与评论"
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">
          共 <span className="font-mono font-bold text-ink">{total}</span> 件作品
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void fetchPage(1, true)}
          >
            刷新
          </Button>
        </div>
      </div>

      {initialLoading ? (
        <MasonryGrid
          items={SKELETON_HEIGHTS}
          getId={(_height, index) => `skeleton-${index}`}
          getAspectRatio={() => null}
          renderItem={(_height, index) => (
            <div aria-hidden="true">
              <div
                className="animate-pulse border border-space-200 bg-space-100"
                style={{ height: SKELETON_HEIGHTS[index] }}
              />
              <div className="border border-t-0 border-space-200 bg-white px-2.5 py-2">
                <div className="h-3 w-2/3 animate-pulse bg-space-100" />
                <div className="mt-1.5 h-3 w-1/3 animate-pulse bg-space-100" />
              </div>
            </div>
          )}
        />
      ) : failed && images.length === 0 ? (
        <EmptyState
          icon={Images}
          title="画廊加载失败"
          description="网络似乎出了点问题，稍后再试试吧"
          action={
            <Button variant="secondary" size="sm" onClick={() => void fetchPage(1, true)}>
              重试
            </Button>
          }
        />
      ) : images.length === 0 ? (
        <EmptyState
          icon={Images}
          title="画廊还没有作品"
          description="站长正在筹备第一批展品，敬请期待"
        />
      ) : (
        <>
          <MasonryGrid
            items={displayedImages}
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
          <div ref={sentinelRef} className="h-px" />
          <div className="py-6 text-center">
            {loadingMore ? (
              <p className="inline-flex items-center gap-2 text-xs text-muted">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                正在加载更多作品…
              </p>
            ) : hasMore ? (
              <button
                type="button"
                onClick={() => void fetchPage(page + 1, false)}
                className="text-xs font-bold text-muted underline-offset-4 hover:text-amber hover:underline"
              >
                加载更多
              </button>
            ) : (
              <p className="text-xs text-muted">
                已经到底啦 · 共 <span className="font-mono">{images.length}</span> 件作品
              </p>
            )}
          </div>
        </>
      )}

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
