import { Heart } from 'lucide-react';

interface GalleryLikeButtonProps {
  liked: boolean;
  likeCount: number;
  disabled?: boolean;
  onClick: () => void;
}

// 喜欢/收藏按钮：画廊卡片与详情弹窗共用；已喜欢态用主色实心心形
export default function GalleryLikeButton({
  liked,
  likeCount,
  disabled = false,
  onClick,
}: GalleryLikeButtonProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onClick();
      }}
      disabled={disabled}
      aria-pressed={liked}
      aria-label={liked ? '取消喜欢' : '喜欢'}
      className={`inline-flex items-center gap-1.5 border px-2 py-1.5 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        liked
          ? 'border-amber bg-amber text-white'
          : 'border-space-200 bg-white text-muted hover:border-amber hover:text-amber'
      }`}
    >
      <Heart className={`h-3.5 w-3.5${liked ? ' fill-current' : ''}`} />
      {likeCount}
    </button>
  );
}
