import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flag, Heart, Loader2, MessageSquare, MessageSquareWarning, SendHorizontal, Trash2 } from 'lucide-react';
import {
  spaceHref,
  type GalleryCommentItem,
  type GalleryCommentListResponse,
  type GalleryImage,
} from '@spaceport/shared';
import { ApiError, api } from '../lib/api';
import { formatDateTime, gradientFor, initialOf } from '../lib/format';
import Button from './Button';
import ConfirmDialog from './ConfirmDialog';
import GalleryLikeButton from './GalleryLikeButton';
import Modal from './Modal';
import { useLoginDialog } from './LoginModal';
import { useAuth, isUserMuted } from '../lib/auth';
import { useToast } from './Toast';

const COMMENT_PAGE_SIZE = 10;
const MAX_COMMENT_LENGTH = 200;

interface GalleryDetailModalProps {
  image: GalleryImage | null;
  likePending: boolean;
  onClose: () => void;
  onToggleLike: (image: GalleryImage) => void;
  onCommentCountChange: (imageId: string, count: number) => void;
}

// 图片详情弹窗：大图 + 喜欢/评论操作 + 评论列表与发布
export default function GalleryDetailModal({
  image,
  likePending,
  onClose,
  onToggleLike,
  onCommentCountChange,
}: GalleryDetailModalProps) {
  const toast = useToast();
  const { user } = useAuth();
  const { openLogin } = useLoginDialog();

  const [comments, setComments] = useState<GalleryCommentItem[]>([]);
  // null 表示尚未加载，与「已加载为 0」区分，避免删光评论后回退到过期卡片值
  const [commentTotal, setCommentTotal] = useState<number | null>(null);
  const [commentPage, setCommentPage] = useState(1);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsFailed, setCommentsFailed] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingComment, setDeletingComment] = useState<GalleryCommentItem | null>(null);
  const [reportingId, setReportingId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportedIds, setReportedIds] = useState<Record<string, boolean>>({});
  // 当前评论请求的 AbortController（初次加载 / 重试 / 加载更多共用）
  const commentsAbortRef = useRef<AbortController | null>(null);

  const fetchComments = useCallback(
    async (imageId: string, page: number, append: boolean, signal?: AbortSignal) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setCommentsLoading(true);
        setCommentsFailed(false);
      }
      try {
        const res = await api.get<GalleryCommentListResponse>(
          `/api/gallery/${imageId}/comments`,
          {
            page,
            pageSize: COMMENT_PAGE_SIZE,
          },
          signal,
        );
        if (signal?.aborted) return;
        setComments((prev) => (append ? [...prev, ...res.items] : res.items));
        setCommentTotal(res.total);
        setCommentPage(res.page);
        setHasMoreComments(res.hasMore);
      } catch {
        // 请求被取消（切换/关闭图片）时静默返回，不当作失败
        if (signal?.aborted) return;
        if (!append) {
          setCommentsFailed(true);
          setComments([]);
        } else {
          toast.error('评论加载失败，请稍后再试');
        }
      } finally {
        // 已被取消的请求不清 loading，避免误清新请求的加载态
        if (!signal?.aborted) {
          setCommentsLoading(false);
          setLoadingMore(false);
        }
      }
      // toast 为稳定引用，无需加入依赖
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [],
  );

  // 打开/切换图片时重置评论状态；依赖 image.id 而非 image 对象，
  // 避免父组件重建对象（点赞、评论数变更）触发重复请求风暴。
  useEffect(() => {
    // 切换/关闭图片时取消仍在途的重试/加载更多请求
    commentsAbortRef.current?.abort();
    const imageId = image?.id;
    if (!imageId) {
      setComments([]);
      setCommentTotal(null);
      setCommentPage(1);
      setHasMoreComments(false);
      setContent('');
      setReportingId(null);
      setReportReason('');
      setDeletingComment(null);
      return;
    }
    const controller = new AbortController();
    commentsAbortRef.current = controller;
    void fetchComments(imageId, 1, false, controller.signal);
    return () => controller.abort();
  }, [image?.id, fetchComments]);

  // 重试 / 加载更多同样挂到 AbortController，防止切图时旧评论串入新图
  const retryComments = () => {
    if (!image) return;
    commentsAbortRef.current?.abort();
    const controller = new AbortController();
    commentsAbortRef.current = controller;
    void fetchComments(image.id, 1, false, controller.signal);
  };

  const loadMoreComments = () => {
    if (!image) return;
    commentsAbortRef.current?.abort();
    const controller = new AbortController();
    commentsAbortRef.current = controller;
    void fetchComments(image.id, commentPage + 1, true, controller.signal);
  };

  const submitComment = async () => {
    if (!image) return;
    if (!user) {
      openLogin();
      return;
    }
    const trimmed = content.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      const res = await api.post<{ item: GalleryCommentItem; commentCount: number }>(
        `/api/gallery/${image.id}/comments`,
        { content: trimmed },
      );
      setComments((prev) => [res.item, ...prev]);
      setCommentTotal(res.commentCount);
      onCommentCountChange(image.id, res.commentCount);
      setContent('');
      toast.success('评论已发布');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '评论发布失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  // 已加载评论数优先（含 0）；仅未加载（null）时回退到卡片上的计数
  const commentCount = commentTotal ?? image?.commentCount ?? 0;

  // 删除自己的评论：二次确认，即时生效且不可恢复
  const confirmDeleteComment = async () => {
    if (!image || !deletingComment) return;
    setDeletingId(deletingComment.id);
    try {
      const res = await api.delete<{ commentCount: number }>(
        `/api/gallery/comments/${deletingComment.id}`,
      );
      setComments((prev) => prev.filter((item) => item.id !== deletingComment.id));
      setCommentTotal(res.commentCount);
      onCommentCountChange(image.id, res.commentCount);
      toast.success('评论已删除');
      setDeletingComment(null);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '删除失败，请稍后再试');
    } finally {
      setDeletingId(null);
    }
  };

  const openReport = (comment: GalleryCommentItem) => {
    setReportingId(comment.id);
    setReportReason('');
  };

  // 举报他人评论：必填原因，提交后进入人工审核队列
  const submitReport = async (comment: GalleryCommentItem) => {
    const reason = reportReason.trim();
    if (reason.length < 2) {
      toast.error('请填写举报原因（至少 2 个字）');
      return;
    }
    setReportSubmitting(true);
    try {
      await api.post<{ item: { id: string; status: string } }>(
        `/api/gallery/comments/${comment.id}/report`,
        { reason },
      );
      setReportedIds((prev) => ({ ...prev, [comment.id]: true }));
      setReportingId(null);
      setReportReason('');
      toast.success('举报已提交，感谢您维护社区环境');
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '举报失败，请稍后再试');
    } finally {
      setReportSubmitting(false);
    }
  };

  // 上传者信息块：有账号时整块可点击跳转到 TA 的个人空间
  const uploaderBody = image ? (
    <>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden border border-white/10 text-xs font-black text-white ${gradientFor(image.uploader?.nickname ?? image.id)}`}
      >
        {image.uploader?.avatarUrl ? (
          <img
            src={image.uploader.avatarUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          initialOf(image.uploader?.nickname ?? '粉')
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-ink">
          {image.uploader?.nickname ?? '粉丝投稿'}
        </p>
        <p className="text-[10px] text-muted">作品上传者</p>
      </div>
    </>
  ) : null;

  return (
    <Modal
      open={Boolean(image)}
      onClose={onClose}
      size="xl"
      eyebrow="Artwork"
      title={image?.title || '未命名作品'}
      description={image ? `上传于 ${formatDateTime(image.createdAt)}` : undefined}
    >
      {image ? (
        <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <div className="min-w-0">
            <img
              src={image.imageUrl}
              alt={image.title || '画廊作品'}
              className="max-h-[55vh] w-full border border-white/10 bg-space-50 object-contain"
            />
            <div className="mt-3 flex items-center justify-between gap-3 border border-white/10 bg-white/[0.02] px-3 py-2.5">
              {image.uploader ? (
                <Link
                  to={spaceHref(image.uploader.uid)}
                  className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-80"
                >
                  {uploaderBody}
                </Link>
              ) : (
                <div className="flex min-w-0 items-center gap-2.5">{uploaderBody}</div>
              )}
              <GalleryLikeButton
                liked={image.liked}
                likeCount={image.likeCount}
                disabled={likePending}
                onClick={() => onToggleLike(image)}
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col border border-white/10">
            <div className="flex items-center justify-between border-b border-white/10 px-3.5 py-2.5">
              <p className="inline-flex items-center gap-1.5 text-sm font-extrabold text-ink">
                <MessageSquare className="h-4 w-4 text-amber" />
                评论
                <span className="font-mono text-xs text-muted">{commentCount}</span>
              </p>
              <Heart className="h-4 w-4 text-muted/50" />
            </div>

            <div className="custom-scrollbar max-h-[46vh] min-h-[10rem] flex-1 space-y-3 overflow-y-auto px-3.5 py-3 lg:max-h-[300px]">
              {commentsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="flex items-start gap-2.5">
                      <div className="h-8 w-8 shrink-0 animate-pulse bg-space-100" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-24 animate-pulse bg-space-100" />
                        <div className="h-3 w-full animate-pulse bg-space-100" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : commentsFailed ? (
                <div className="py-6 text-center">
                  <p className="text-xs text-muted">评论加载失败</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={retryComments}
                  >
                    重试
                  </Button>
                </div>
              ) : comments.length === 0 ? (
                <div className="py-8 text-center">
                  <MessageSquare className="mx-auto h-6 w-6 text-muted/40" />
                  <p className="mt-2 text-xs text-muted">还没有评论，来说点什么吧</p>
                </div>
              ) : (
                <>
                  {comments.map((comment) => (
                    <div key={comment.id} className="flex items-start gap-2.5">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden border border-white/10 text-[11px] font-black text-white ${gradientFor(comment.user?.nickname ?? comment.id)}`}
                      >
                        {comment.user?.avatarUrl ? (
                          <img
                            src={comment.user.avatarUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          initialOf(comment.user?.nickname ?? '粉')
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-xs font-bold text-ink">
                            {comment.user?.nickname ?? '站友'}
                          </p>
                          <span className="shrink-0 text-[10px] text-muted/70">
                            {formatDateTime(comment.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 break-words text-xs leading-relaxed text-muted">
                          {comment.content}
                        </p>
                        {user ? (
                          <div className="mt-1.5 flex items-center gap-3">
                            {comment.userId === user.id ? (
                              <button
                                type="button"
                                onClick={() => setDeletingComment(comment)}
                                disabled={deletingId === comment.id}
                                className="inline-flex items-center gap-1 text-[10px] text-muted transition-colors hover:text-coral disabled:opacity-60"
                              >
                                {deletingId === comment.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                                删除
                              </button>
                            ) : reportedIds[comment.id] ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted/60">
                                <Flag className="h-3 w-3" />
                                已举报
                              </span>
                            ) : reportingId === comment.id ? (
                              <span />
                            ) : (
                              <button
                                type="button"
                                onClick={() => openReport(comment)}
                                className="inline-flex items-center gap-1 text-[10px] text-muted transition-colors hover:text-amber"
                              >
                                <Flag className="h-3 w-3" />
                                举报
                              </button>
                            )}
                          </div>
                        ) : null}
                        {reportingId === comment.id ? (
                          <div className="mt-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5">
                            <textarea
                              value={reportReason}
                              onChange={(event) => setReportReason(event.target.value)}
                              rows={2}
                              maxLength={200}
                              placeholder="请填写举报原因（必填），例如人身攻击、广告引流等"
                              className="input-base resize-none text-xs"
                            />
                            <div className="mt-2 flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setReportingId(null);
                                  setReportReason('');
                                }}
                              >
                                取消
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={reportSubmitting || reportReason.trim().length < 2}
                                loading={reportSubmitting}
                                onClick={() => void submitReport(comment)}
                              >
                                提交举报
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {hasMoreComments ? (
                    <button
                      type="button"
                      onClick={loadMoreComments}
                      disabled={loadingMore}
                      className="mx-auto flex items-center gap-1.5 border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[11px] font-bold text-muted transition-colors hover:border-amber hover:text-amber disabled:opacity-60"
                    >
                      {loadingMore ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                      {loadingMore ? '加载中…' : '查看更多评论'}
                    </button>
                  ) : null}
                </>
              )}
            </div>

            <div className="border-t border-white/10 p-3">
              {user ? (
                isUserMuted(user) ? (
                  <div className="rounded-xl border border-amber/40 bg-amber/10 px-3 py-2.5 text-xs text-amber">
                    <MessageSquareWarning className="mr-1.5 inline h-3.5 w-3.5" />
                    您处于禁言处罚中，至 {user.penalty?.mutedUntil ? formatDateTime(user.penalty.mutedUntil) : ''} 解除，期间禁止发布评论。
                  </div>
                ) : (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitComment();
                    }}
                  >
                    <textarea
                      value={content}
                      onChange={(event) => setContent(event.target.value)}
                      rows={2}
                      maxLength={MAX_COMMENT_LENGTH}
                      disabled={submitting}
                      placeholder="写下你的评论…"
                      className="input-base resize-none"
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-muted/70">
                        {content.trim().length}/{MAX_COMMENT_LENGTH}
                      </span>
                      <Button
                        type="submit"
                        size="sm"
                        loading={submitting}
                        disabled={!content.trim()}
                        icon={<SendHorizontal className="h-3.5 w-3.5" />}
                      >
                        发布评论
                      </Button>
                    </div>
                  </form>
                )
              ) : (
                <Button variant="secondary" size="sm" onClick={openLogin}>
                  登录后即可评论
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* 删除评论的二次确认弹层，叠加在详情弹窗之上 */}
      <ConfirmDialog
        open={Boolean(deletingComment)}
        title="确定删除这条评论吗？"
        description="删除后不可恢复。"
        confirmText="删除评论"
        danger
        busy={deletingId === deletingComment?.id}
        onConfirm={() => void confirmDeleteComment()}
        onClose={() => setDeletingComment(null)}
      >
        {deletingComment ? (
          <div className="rounded-xl border border-coral/30 bg-coral/[0.08] px-4 py-3">
            <p className="text-sm font-medium text-ink">
              {deletingComment.user?.nickname ?? '站友'}
            </p>
            <p className="mt-1 break-words text-xs leading-relaxed text-muted">
              {deletingComment.content}
            </p>
          </div>
        ) : null}
      </ConfirmDialog>
    </Modal>
  );
}
