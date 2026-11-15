import { memo } from 'react';
import { MessageSquare } from 'lucide-react';
import { GALLERY_MEDIA_TYPE_LABELS, type GalleryImage } from '@spaceport/shared';
import GalleryLikeButton from './GalleryLikeButton';

interface GalleryCardProps {
  image: GalleryImage;
  likePending: boolean;
  onOpen: (image: GalleryImage) => void;
  onToggleLike: (image: GalleryImage) => void;
  // 图片实际加载完成后上报真实尺寸，用于修正瀑布流占位
  onMeasure?: (id: string, width: number, height: number) => void;
}

// 画廊卡片：瀑布流单元，图片可点击进详情弹窗，底部信息条展示标题与点赞/评论数
// 瀑布流卡片数量多，memo 避免父级无关状态更新触发全量重渲染
const GalleryCard = memo(function GalleryCard({ image, likePending, onOpen, onToggleLike, onMeasure }: GalleryCardProps) {
  const ratio = image.imageWidth && image.imageHeight ? image.imageWidth / image.imageHeight : null;

  return (
    <div>
      <button
        type="button"
        onClick={() => onOpen(image)}
        className="group relative block w-full overflow-hidden border border-space-200 bg-white transition-colors hover:border-amber"
        aria-label={image.title ? `查看作品「${image.title}」` : '查看作品详情'}
      >
        <span
          className="relative block w-full overflow-hidden bg-space-100"
          style={ratio ? { aspectRatio: `${image.imageWidth} / ${image.imageHeight}` } : { aspectRatio: '4 / 5' }}
        >
          <img
            src={image.imageUrl}
            alt={image.title || '画廊作品'}
            loading="lazy"
            onLoad={(event) => {
              const img = event.currentTarget;
              if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                onMeasure?.(image.id, img.naturalWidth, img.naturalHeight);
              }
            }}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </span>
        {image.mediaType ? (
          <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
            {GALLERY_MEDIA_TYPE_LABELS[image.mediaType]}
          </span>
        ) : null}
      </button>
      <div className="border border-t-0 border-space-200 bg-white px-2.5 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-extrabold leading-tight text-ink">
              {image.title || '未命名作品'}
            </p>
            <p className="mt-0.5 truncate text-[10px] text-muted">
              {image.uploader ? `@${image.uploader.nickname}` : '粉丝投稿'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 text-[11px] font-bold text-muted"
              aria-label={`评论 ${image.commentCount} 条`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {image.commentCount}
            </span>
            <GalleryLikeButton
              liked={image.liked}
              likeCount={image.likeCount}
              disabled={likePending}
              onClick={() => onToggleLike(image)}
            />
          </div>
        </div>
        {image.tags.length > 0 ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {image.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-space-200 px-1.5 py-0.5 text-[10px] text-muted"
              >
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
});

export default GalleryCard;
