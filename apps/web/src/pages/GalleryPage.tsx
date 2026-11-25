import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Images, RefreshCw } from 'lucide-react';
import type { GalleryImage, GalleryListResponse } from '@spaceport/shared';
import { api } from '../lib/api';
import EmptyState from '../components/EmptyState';
import GalleryCard from '../components/GalleryCard';
import GalleryDetailModal from '../components/GalleryDetailModal';
import MasonryGrid from '../components/MasonryGrid';
import Pagination from '../components/Pagination';
import Button from '../components/Button';
import SectionHeading from '../components/SectionHeading';
import { useGalleryInteractions } from '../lib/useGalleryInteractions';
import { useToast } from '../components/Toast';

const PAGE_SIZE = 35;
const SKELETON_HEIGHTS = [240, 320, 280, 360, 260, 300, 340, 240, 280, 320, 260, 300];

export default function GalleryPage() {
  const { likePendingIds, resolveLike, toggleLike, handleCommentCountChange, commentCounts, reset } =
    useGalleryInteractions();
  const toast = useToast();

  const [images, setImages] = useState<GalleryImage[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<GalleryImage | null>(null);
  const [showTop, setShowTop] = useState(false);

  const loadingRef = useRef(false);
  const listTopRef = useRef<HTMLDivElement | null>(null);

  const fetchPage = useCallback(
    async (nextPage: number) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setInitialLoading(true);
      setFailed(false);
      try {
        const res = await api.get<GalleryListResponse>('/api/gallery', {
          page: nextPage,
          pageSize: PAGE_SIZE,
        });
        setImages(res.items);
        setTotal(res.total);
        setPage(res.page);
        reset();
      } catch {
        setFailed(true);
        // 已有数据时错误门不渲染，用 toast 保证刷新失败有可见反馈
        toast.error('画廊加载失败，请稍后再试');
      } finally {
        loadingRef.current = false;
        setInitialLoading(false);
      }
    },
    [reset, toast],
  );

  useEffect(() => {
    void fetchPage(1);
  }, [fetchPage]);

  // 翻页后回到列表顶部
  const handlePageChange = useCallback(
    (nextPage: number) => {
      void fetchPage(nextPage);
      listTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [fetchPage],
  );

  // 滚过约一屏后显示右下角返回顶部按钮；
  // footer 顶边进入按钮区域时自动抬升到 footer 上方，避免遮挡 footer 文字
  const topBtnRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const update = () => {
      setShowTop(window.scrollY > 480);
      const btn = topBtnRef.current;
      if (!btn) return;
      const footer = document.querySelector('footer');
      const footerTop = footer?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
      // 按钮底边默认距视口 24px；与 footer 重叠时抬到 footer 上方 8px
      btn.style.bottom = `${Math.max(24, window.innerHeight - footerTop + 8)}px`;
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

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

  // 评论数以本地覆盖态优先，发/删评论后卡片与弹窗即时更新
  const selectedView = selected
    ? {
        ...selected,
        ...resolveLike(selected),
        commentCount: commentCounts[selected.id] ?? selected.commentCount,
      }
    : null;
  const displayedImages = images.map((image) => ({
    ...image,
    ...resolveLike(image),
    commentCount: commentCounts[image.id] ?? image.commentCount,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
      <SectionHeading
        eyebrow="Gallery"
        title="粉丝画廊"
        description="这里收藏着粉丝们为 ChiliChill 创作的绘画与设计，欢迎喜欢与评论"
      />

      <div
        ref={listTopRef}
        className="mb-6 mt-6 flex flex-wrap items-center justify-between gap-3 scroll-mt-16"
      >
        {total > PAGE_SIZE ? (
          <Pagination
            flush
            navFirst
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
            onChange={handlePageChange}
            label="件作品"
          />
        ) : (
          <p className="text-xs text-muted">
            共 <span className="font-mono font-bold text-ink">{total}</span> 件作品
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void fetchPage(page)}
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
            <Button variant="secondary" size="sm" onClick={() => void fetchPage(1)}>
              重试
            </Button>
          }
        />
      ) : images.length === 0 ? (
        <EmptyState
          icon={Images}
          title="画廊还没有作品"
          description="运营团队正在筹备第一批展品，敬请期待"
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
                likePending={Boolean(likePendingIds[image.id])}
                onOpen={setSelected}
                onToggleLike={(target) => void toggleLike(target)}
                onMeasure={handleMeasure}
              />
            )}
          />
          <div className="mt-4 flex">
            <Pagination
              flush
              navFirst
              page={page}
              total={total}
              pageSize={PAGE_SIZE}
              onChange={handlePageChange}
              label="件作品"
            />
          </div>
        </>
      )}

      <GalleryDetailModal
        image={selectedView}
        likePending={selected ? Boolean(likePendingIds[selected.id]) : false}
        onClose={() => setSelected(null)}
        onToggleLike={(target) => void toggleLike(target)}
        onCommentCountChange={handleCommentCountChange}
      />

      <button
        type="button"
        ref={topBtnRef}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="返回顶部"
        className={`fixed right-6 z-30 flex h-11 w-11 items-center justify-center rounded-lg border border-space-200 bg-white text-ink shadow-lg shadow-space-950/10 transition hover:border-amber hover:text-amber ${
          showTop ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
        }`}
      >
        <ArrowUp className="h-5 w-5" />
      </button>
    </div>
  );
}
