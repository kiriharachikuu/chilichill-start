import { useCallback, useState } from 'react';
import type { GalleryImage, GalleryLikeState } from '@spaceport/shared';
import { api, ApiError } from './api';
import { useAuth } from './auth';
import { useLoginDialog } from '../components/LoginModal';
import { useToast } from '../components/Toast';

export interface GalleryLikeStateView {
  liked: boolean;
  likeCount: number;
}

/** 画廊页与个人空间共用的点赞 / 评论数页面级状态：乐观更新，失败回滚 */
export function useGalleryInteractions() {
  const toast = useToast();
  const { user } = useAuth();
  const { openLogin } = useLoginDialog();

  const [likeStates, setLikeStates] = useState<Record<string, GalleryLikeStateView>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  // 按图片 ID 记录在途点赞，互不阻塞
  const [likePendingIds, setLikePendingIds] = useState<Record<string, boolean>>({});

  /** 数据整体刷新（换页/换人）后清空本地覆盖态 */
  const reset = useCallback(() => {
    setLikeStates({});
    setCommentCounts({});
  }, []);

  const resolveLike = useCallback(
    (image: GalleryImage): GalleryLikeStateView =>
      likeStates[image.id] ?? { liked: image.liked, likeCount: image.likeCount },
    [likeStates],
  );

  const toggleLike = useCallback(
    async (image: GalleryImage) => {
      if (!user) {
        openLogin();
        return;
      }
      if (likePendingIds[image.id]) return;
      const current = resolveLike(image);
      const next: GalleryLikeStateView = {
        liked: !current.liked,
        likeCount: current.likeCount + (current.liked ? -1 : 1),
      };
      setLikeStates((prev) => ({ ...prev, [image.id]: next }));
      setLikePendingIds((prev) => ({ ...prev, [image.id]: true }));
      try {
        const res = await api.post<GalleryLikeState>(`/api/gallery/${image.id}/like`);
        setLikeStates((prev) => ({
          ...prev,
          [image.id]: { liked: res.liked, likeCount: res.likeCount },
        }));
      } catch (error) {
        setLikeStates((prev) => ({ ...prev, [image.id]: current }));
        toast.error(error instanceof ApiError ? error.message : '操作失败，请稍后再试');
      } finally {
        setLikePendingIds((prev) => {
          const next = { ...prev };
          delete next[image.id];
          return next;
        });
      }
    },
    [likePendingIds, resolveLike, openLogin, toast, user],
  );

  const handleCommentCountChange = useCallback((imageId: string, count: number) => {
    setCommentCounts((prev) => ({ ...prev, [imageId]: count }));
  }, []);

  return {
    likePendingIds,
    resolveLike,
    toggleLike,
    handleCommentCountChange,
    commentCounts,
    reset,
  };
}
