import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Clock3,
  ExternalLink,
  Eye,
  Globe2,
  Heart,
  Images,
  Inbox,
  KeyRound,
  MessageSquare,
  Pencil,
  RefreshCw,
  ShieldAlert,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import {
  ENTITY_TYPE_LABELS,
  GALLERY_MEDIA_TYPE_LABELS,
  GROUP_TYPE_LABELS,
  formatLocation,
  ReceivedCommentListResponse,
  ReceivedLikeListResponse,
  type Group,
  type MetaResponse,
  type OAuthAuthorizedAppListResponse,
  type Paginated,
  type Site,
  type Submission,
  type SubmissionStatus,
} from '@spaceport/shared';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { EMPTY_META, loadMeta } from '../lib/meta';
import {
  galleryFormFromPayload,
  groupFormFromGroup,
  groupFormFromPayload,
  isGroupEntity,
  isSiteEntity,
  siteFormFromSite,
  siteFormFromPayload,
  submissionSummary,
  validateGalleryForm,
  validateGroupForm,
  validateSiteForm,
  type FieldErrors,
  type GalleryFormState,
  type GroupFormState,
  type SiteFormState,
} from '../lib/submissionForms';
import Badge from '../components/Badge';
import Button, { buttonClass } from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import GroupFields from '../components/forms/GroupFields';
import GalleryFields from '../components/forms/GalleryFields';
import SiteFields from '../components/forms/SiteFields';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import ProfileEditor from '../components/ProfileEditor';
import SectionHeading from '../components/SectionHeading';
import StatusBadge from '../components/StatusBadge';
import PenaltyStatusModule from '../components/PenaltyStatusModule';
import { useToast } from '../components/Toast';

const SUBMISSION_PAGE_SIZE = 10;
const RECEIVED_PAGE_SIZE = 10;
const SUBMISSION_TABS: { key: 'ALL' | SubmissionStatus; label: string }[] = [
  { key: 'ALL', label: '全部' },
  { key: 'PENDING', label: '待审核' },
  { key: 'APPROVED', label: '已通过' },
  { key: 'REJECTED', label: '已驳回' },
];

type ModuleKey = 'PROFILE' | 'OAUTH_APPS' | 'SUBMISSIONS' | 'INTERACTIONS' | 'PENALTY';

const MODULES: { key: ModuleKey; label: string; icon: LucideIcon; description: string }[] = [
  {
    key: 'INTERACTIONS',
    label: '点赞与评论',
    icon: Heart,
    description: '其他粉丝对你发布的画廊作品的点赞与评论都会汇总在这里。',
  },
  {
    key: 'PROFILE',
    label: '通行证资料',
    icon: UserRound,
    description: '维护你在空间站的昵称、头像、坐标和自我介绍。',
  },
  {
    key: 'OAUTH_APPS',
    label: '授权应用',
    icon: KeyRound,
    description: '这些外部网站已通过空间站通行证授权登录，可查看授权状态与最近授权时间。',
  },
  {
    key: 'SUBMISSIONS',
    label: '审核进度',
    icon: Inbox,
    description: '追踪每一条信号的审核进度，被驳回的投稿可修改后重新发送。',
  },
  {
    key: 'PENALTY',
    label: '处罚与通知',
    icon: ShieldAlert,
    description: '查看你的处罚状态（警告/禁言/封号）与系统通知，举报核实后系统会按阶梯规则自动处罚并在此告知。',
  },
];

interface SubmissionDetail {
  item: Submission;
  target: Group | Site | null;
}

function EntityIcon({ type }: { type: Submission['entityType'] }) {
  if (type === 'GROUP') {
    return <UsersRound className="h-4 w-4 text-amber" />;
  }
  if (type === 'GALLERY') {
    return <Images className="h-4 w-4 text-aurora" />;
  }
  return <Globe2 className="h-4 w-4 text-mint" />;
}

function UserAvatar({ nickname, avatarUrl, size = 'h-9 w-9' }: { nickname: string | null; avatarUrl: string | null; size?: string }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={nickname ?? '用户头像'} className={`${size} shrink-0 rounded-full border border-white/10 object-cover`} />;
  }
  return (
    <span className={`${size} flex shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xs font-medium text-muted`}>
      {(nickname ?? '友').slice(0, 1)}
    </span>
  );
}

interface DrawerProps {
  submission: Submission | null;
  meta: MetaResponse;
  onClose: () => void;
  onDone: () => void;
}

function SubmissionDrawer({ submission, meta, onClose, onDone }: DrawerProps) {
  const toast = useToast();
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [groupForm, setGroupForm] = useState<GroupFormState | null>(null);
  const [siteForm, setSiteForm] = useState<SiteFormState | null>(null);
  const [galleryForm, setGalleryForm] = useState<GalleryFormState | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!submission) {
      setDetail(null);
      setGroupForm(null);
      setSiteForm(null);
      setGalleryForm(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setServerError('');
    setErrors({});
    api
      .get<SubmissionDetail>(`/api/submissions/${submission.id}`)
      .then((result) => {
        if (!alive) return;
        setDetail(result);
        const useTarget = result.item.status === 'APPROVED' ? result.target : null;
        if (result.item.entityType === 'GALLERY') {
          // 画廊作品只支持新增：表单始终来自投稿 payload，驳回后可改图重新提交
          setGalleryForm(galleryFormFromPayload(result.item.payload));
        } else if (result.item.entityType === 'GROUP') {
          setGroupForm(
            useTarget && isGroupEntity(useTarget)
              ? groupFormFromGroup(useTarget)
              : groupFormFromPayload(result.item.payload),
          );
        } else {
          setSiteForm(
            useTarget && isSiteEntity(useTarget)
              ? siteFormFromSite(useTarget)
              : siteFormFromPayload(result.item.payload),
          );
        }
      })
      .catch(() => {
        if (!alive) return;
        setServerError('投稿详情读取失败，请稍后重试');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [submission?.id]);

  const current = detail?.item ?? submission;
  // 画廊作品不支持修改投稿（UPDATE 会被后端拒绝）：已通过的画廊只读，被驳回的可以改后重新提交
  const editable =
    current?.status === 'REJECTED' ||
    (current?.status === 'APPROVED' && current?.entityType !== 'GALLERY');
  const readOnly = !editable;

  const handleSubmit = async () => {
    if (!current) return;
    setServerError('');
    let payload: Record<string, unknown> | undefined;
    let errors: FieldErrors = {};

    if (current.entityType === 'GALLERY' && galleryForm) {
      const result = validateGalleryForm(galleryForm);
      setErrors(result.errors);
      errors = result.errors;
      payload = result.payload as Record<string, unknown> | undefined;
    } else if (current.entityType === 'GROUP' && groupForm) {
      const result = validateGroupForm(groupForm);
      setErrors(result.errors);
      errors = result.errors;
      payload = result.payload;
    } else if (current.entityType === 'SITE' && siteForm) {
      const result = validateSiteForm(siteForm);
      setErrors(result.errors);
      errors = result.errors;
      payload = result.payload;
    }
    if (!payload) {
      // 错误文案可能不在视口内，用 toast 保证有可见反馈
      toast.error(Object.values(errors)[0] ?? '表单还有未完成的必填项，请检查标红提示');
      return;
    }

    setSubmitting(true);
    try {
      if (current.status === 'REJECTED') {
        await api.post<{ item: Submission }>(`/api/submissions/${current.id}/resubmit`, { payload });
        toast.success('修改已重新发送，等待运营团队审核');
      } else {
        const targetId = current.targetId ?? detail?.target?.id;
        if (!targetId) {
          throw new ApiError(400, '缺少目标内容，请刷新后重试');
        }
        await api.post<{ item: Submission }>('/api/submissions', {
          entityType: current.entityType,
          mode: 'UPDATE',
          targetId,
          payload,
        });
        toast.success('修改申请已发送，原内容在审核通过前保持展示');
      }
      onDone();
      onClose();
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : '操作失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  const payload = current?.payload ?? {};
  const tagPool = [...meta.tags.group, ...meta.tags.sites];
  const tagMap = new Map(tagPool.map((tag) => [tag.id, tag.name]));

  return (
    <Modal
      open={Boolean(submission)}
      onClose={onClose}
      variant="drawer"
      size="lg"
      eyebrow="Submission Detail"
      title={current ? submissionSummary(current.payload) : '投稿详情'}
      description={current ? `${ENTITY_TYPE_LABELS[current.entityType]} · ${formatDateTime(current.createdAt)}` : undefined}
      footer={
        editable ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={submitting}>
              取消
            </Button>
            <Button loading={submitting} onClick={() => void handleSubmit()}>
              {current?.status === 'REJECTED' ? '重新提交' : '申请修改'}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              关闭
            </Button>
          </div>
        )
      }
    >
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]" />
          ))}
        </div>
      ) : current ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={current.status} />
            <Badge tone={current.mode === 'UPDATE' ? 'aurora' : 'neutral'}>
              {current.mode === 'UPDATE' ? '修改申请' : '新建投稿'}
            </Badge>
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Clock3 className="h-3.5 w-3.5" /> {formatDateTime(current.createdAt)}
            </span>
          </div>

          {current.reviewNote ? (
            <div className="rounded-xl border border-coral/30 bg-coral/[0.08] px-4 py-3">
              <p className="text-xs font-medium text-coral">运营团队留言</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink/85">{current.reviewNote}</p>
            </div>
          ) : null}

          {readOnly ? (
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted/70">提交内容</p>
              {current.entityType === 'GROUP' ? (
                <>
                  <InfoRow label="群名" value={String(payload.name ?? '—')} />
                  <InfoRow label="群号" value={String(payload.groupNumber ?? '—')} />
                  <InfoRow
                    label="群类型"
                    value={GROUP_TYPE_LABELS[payload.type as keyof typeof GROUP_TYPE_LABELS] ?? '—'}
                  />
                  {payload.type === 'COLLEGE' ? (
                    <InfoRow label="学校" value={String(payload.school ?? '—')} />
                  ) : null}
                  <InfoRow
                    label="城市 / 大区"
                    value={
                      formatLocation(
                        payload.province as string | null,
                        payload.city as string | null,
                      ) || '线上 / 待定'
                    }
                  />
                  <InfoRow label="简介" value={String(payload.description ?? '—')} />
                  <InfoRow
                    label="标签"
                    value={
                      Array.isArray(payload.tags) && payload.tags.length
                        ? (payload.tags as string[]).map((id) => tagMap.get(id) ?? `#${id}`).join('、')
                        : '—'
                    }
                  />
                </>
              ) : current.entityType === 'GALLERY' ? (
                <>
                  {typeof payload.imageUrl === 'string' && payload.imageUrl ? (
                    <div className="overflow-hidden rounded-xl border border-white/10 bg-space-900/60">
                      <img
                        src={payload.imageUrl}
                        alt={String(payload.title || '画廊作品')}
                        className="max-h-64 w-full object-contain"
                      />
                    </div>
                  ) : null}
                  <InfoRow label="标题" value={String(payload.title ?? '—')} />
                  <InfoRow
                    label="作品类型"
                    value={
                      GALLERY_MEDIA_TYPE_LABELS[payload.mediaType as keyof typeof GALLERY_MEDIA_TYPE_LABELS] ??
                      '—'
                    }
                  />
                  <InfoRow label="简介" value={String(payload.description ?? '—')} />
                  <InfoRow
                    label="标签"
                    value={
                      Array.isArray(payload.tags) && payload.tags.length
                        ? (payload.tags as string[]).join('、')
                        : '—'
                    }
                  />
                </>
              ) : (
                <>
                  <InfoRow label="标题" value={String(payload.title ?? '—')} />
                  <InfoRow label="链接" value={String(payload.url ?? '—')} />
                  <InfoRow label="简介" value={String(payload.description ?? '—')} />
                  <InfoRow
                    label="标签"
                    value={
                      Array.isArray(payload.tags) && payload.tags.length
                        ? (payload.tags as string[]).map((id) => tagMap.get(id) ?? `#${id}`).join('、')
                        : '—'
                    }
                  />
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber/25 bg-amber/[0.06] px-4 py-3 text-xs leading-relaxed text-amber/90">
                {current.status === 'REJECTED'
                  ? '根据运营团队留言调整内容后重新提交，会生成一条新的待审核信号。'
                  : '这里是修改申请：审核通过后才会覆盖线上内容，原内容继续展示。'}
              </div>

              {current.entityType === 'GROUP' && groupForm ? (
                <GroupFields value={groupForm} onChange={setGroupForm} meta={meta} errors={errors} />
              ) : null}
              {current.entityType === 'GALLERY' && galleryForm ? (
                <GalleryFields
                  value={galleryForm}
                  onChange={(patch) => setGalleryForm((prev) => (prev ? { ...prev, ...patch } : prev))}
                  errors={errors}
                />
              ) : null}
              {current.entityType === 'SITE' && siteForm ? (
                <SiteFields value={siteForm} onChange={setSiteForm} meta={meta} errors={errors} />
              ) : null}

              {serverError ? (
                <div className="rounded-xl border border-coral/35 bg-coral/10 px-4 py-3 text-xs text-coral">
                  {serverError}
                </div>
              ) : null}
            </div>
          )}

          {readOnly && serverError ? (
            <div className="rounded-xl border border-coral/35 bg-coral/10 px-4 py-3 text-xs text-coral">
              {serverError}
            </div>
          ) : null}
        </div>
      ) : (
        <EmptyState compact title="详情未能加载" description="请稍后重试。" />
      )}
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
      <span className="text-xs text-muted">{label}</span>
      <span className="max-w-[70%] break-all text-right text-ink/90">{value}</span>
    </div>
  );
}

// ─── 模块一：审核进度 ──────────────────────────────────────────────────────

function SubmissionsModule() {
  const [status, setStatus] = useState<'ALL' | SubmissionStatus>('ALL');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<Submission> | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [meta, setMeta] = useState<MetaResponse>(EMPTY_META);
  const [active, setActive] = useState<Submission | null>(null);

  useEffect(() => {
    loadMeta().then(setMeta);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    api
      .get<Paginated<Submission>>('/api/submissions/mine', {
        status: status === 'ALL' ? undefined : status,
        page,
        pageSize: SUBMISSION_PAGE_SIZE,
      })
      .then((result) => {
        if (alive) setData(result);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setData(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [status, page, reloadKey]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-1.5">
        {SUBMISSION_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              setStatus(tab.key);
              setPage(1);
            }}
            className={`rounded-xl px-4 py-2 text-sm transition ${
              status === tab.key ? 'bg-amber/15 font-medium text-amber' : 'text-muted hover:bg-white/[0.04] hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
        {failed ? (
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted transition hover:text-amber"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 重试
          </button>
        ) : (
          <Link
            to="/submit"
            className={buttonClass({ variant: 'primary', size: 'sm', className: 'ml-auto' })}
          >
            继续投稿
          </Link>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
          ))}
        </div>
      ) : failed ? (
        <EmptyState
          title="我的轨道暂时静默"
          description="没能读取你的投稿记录，请稍后重试。"
          icon={RefreshCw}
          action={
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
              重新接收
            </Button>
          }
        />
      ) : data && data.items.length ? (
        <>
          <div className="space-y-3">
            {data.items.map((item) => {
              const summary = submissionSummary(item.payload);
              return (
                <Card key={item.id} hover={false} className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {item.entityType === 'GALLERY' &&
                    typeof item.payload.imageUrl === 'string' &&
                    item.payload.imageUrl ? (
                      <img
                        src={item.payload.imageUrl}
                        alt={summary}
                        loading="lazy"
                        className="mt-0.5 h-9 w-9 shrink-0 rounded-xl border border-white/10 object-cover"
                      />
                    ) : (
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                        <EntityIcon type={item.entityType} />
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{summary}</span>
                        <Badge tone={item.mode === 'UPDATE' ? 'aurora' : 'neutral'}>
                          {item.mode === 'UPDATE' ? '修改' : '新建'}
                        </Badge>
                        <Badge tone="neutral">{ENTITY_TYPE_LABELS[item.entityType]}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted">{formatDateTime(item.createdAt)}</p>
                      {item.reviewNote && item.status === 'REJECTED' ? (
                        <p className="mt-1.5 line-clamp-1 text-xs text-coral">驳回原因：{item.reviewNote}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    <StatusBadge status={item.status} />
                    {item.status === 'REJECTED' ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => setActive(item)}
                      >
                        修改并重新提交
                      </Button>
                    ) : item.status === 'APPROVED' && item.entityType !== 'GALLERY' ? (
                      // 画廊作品不支持修改投稿，已通过后仅可查看
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => setActive(item)}
                      >
                        申请修改
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<Eye className="h-3.5 w-3.5" />}
                        onClick={() => setActive(item)}
                      >
                        查看详情
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
          <Pagination
            page={page}
            total={data.total}
            pageSize={SUBMISSION_PAGE_SIZE}
            onChange={(nextPage) => setPage(nextPage)}
          />
        </>
      ) : (
        <EmptyState
          title="还没有投递过信号"
          description="把一个想分享的群或站点送入轨道，运营团队审核后就会出现在公开舱段。"
          icon={Inbox}
          action={
            <Link to="/submit" className={buttonClass({ variant: 'primary', size: 'sm' })}>
              发送第一条投稿
            </Link>
          }
        />
      )}

      <SubmissionDrawer
        submission={active}
        meta={meta}
        onClose={() => setActive(null)}
        onDone={() => setReloadKey((key) => key + 1)}
      />
    </section>
  );
}

// ─── 模块二：收到的点赞与评论 ──────────────────────────────────────────────

type ReceivedTab = 'LIKES' | 'COMMENTS';

function ReceivedModule() {
  const [tab, setTab] = useState<ReceivedTab>('LIKES');

  // 点赞列表
  const [likeData, setLikeData] = useState<ReceivedLikeListResponse | null>(null);
  const [likePage, setLikePage] = useState(1);
  const [likeLoading, setLikeLoading] = useState(true);
  const [likeFailed, setLikeFailed] = useState(false);
  const [likeReloadKey, setLikeReloadKey] = useState(0);

  // 评论列表
  const [commentData, setCommentData] = useState<ReceivedCommentListResponse | null>(null);
  const [commentPage, setCommentPage] = useState(1);
  const [commentLoading, setCommentLoading] = useState(true);
  const [commentFailed, setCommentFailed] = useState(false);
  const [commentReloadKey, setCommentReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLikeLoading(true);
    setLikeFailed(false);
    api
      .get<ReceivedLikeListResponse>('/api/users/me/received-likes', {
        page: likePage,
        pageSize: RECEIVED_PAGE_SIZE,
      })
      .then((result) => {
        if (alive) setLikeData(result);
      })
      .catch(() => {
        if (!alive) return;
        setLikeFailed(true);
        setLikeData(null);
      })
      .finally(() => {
        if (alive) setLikeLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [likePage, likeReloadKey]);

  useEffect(() => {
    let alive = true;
    setCommentLoading(true);
    setCommentFailed(false);
    api
      .get<ReceivedCommentListResponse>('/api/users/me/received-comments', {
        page: commentPage,
        pageSize: RECEIVED_PAGE_SIZE,
      })
      .then((result) => {
        if (alive) setCommentData(result);
      })
      .catch(() => {
        if (!alive) return;
        setCommentFailed(true);
        setCommentData(null);
      })
      .finally(() => {
        if (alive) setCommentLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [commentPage, commentReloadKey]);

  const switchTab = (next: ReceivedTab) => {
    setTab(next);
    setLikePage(1);
    setCommentPage(1);
  };

  const likes = likeData?.items ?? [];
  const comments = commentData?.items ?? [];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-1.5">
        <button
          type="button"
          onClick={() => switchTab('LIKES')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm transition ${
            tab === 'LIKES' ? 'bg-amber/15 font-medium text-amber' : 'text-muted hover:bg-white/[0.04] hover:text-ink'
          }`}
        >
          <Heart className="h-3.5 w-3.5" /> 收到的点赞
          {likeData ? <span className="font-mono text-xs opacity-80">{likeData.total}</span> : null}
        </button>
        <button
          type="button"
          onClick={() => switchTab('COMMENTS')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm transition ${
            tab === 'COMMENTS' ? 'bg-amber/15 font-medium text-amber' : 'text-muted hover:bg-white/[0.04] hover:text-ink'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" /> 收到的评论
          {commentData ? <span className="font-mono text-xs opacity-80">{commentData.total}</span> : null}
        </button>
      </div>

      {tab === 'LIKES' ? (
        likeLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
            ))}
          </div>
        ) : likeFailed ? (
          <EmptyState
            title="暂时收不到信号"
            description="没能读取收到的点赞，请稍后重试。"
            icon={RefreshCw}
            action={
              <Button variant="secondary" size="sm" onClick={() => setLikeReloadKey((key) => key + 1)}>
                重试
              </Button>
            }
          />
        ) : likes.length ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {likes.map((item) => (
                <Link key={item.id} to="/gallery" className="block">
                  <Card className="flex items-center gap-3">
                    {item.image.imageUrl ? (
                      <img
                        src={item.image.imageUrl}
                        alt={item.image.title ?? '画廊作品'}
                        loading="lazy"
                        className="h-14 w-14 shrink-0 rounded-xl border border-white/10 object-cover"
                      />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                        <Images className="h-5 w-5 text-aurora" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm text-ink">
                        <Heart className="h-3.5 w-3.5 shrink-0 fill-coral text-coral" />
                        <span className="font-medium">{item.user?.nickname ?? '匿名粉丝'}</span>
                        <span className="text-muted">赞了你的作品</span>
                      </p>
                      <p className="mt-1 truncate text-xs text-muted">
                        {item.image.title || '未命名作品'}
                      </p>
                      <p className="mt-1 text-[11px] text-muted/70">{formatDateTime(item.createdAt)}</p>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
            <Pagination
              page={likeData!.page}
              total={likeData!.total}
              pageSize={RECEIVED_PAGE_SIZE}
              onChange={(nextPage) => setLikePage(nextPage)}
            />
          </>
        ) : (
          <EmptyState
            title="还没有收到点赞"
            description="去画廊发布你的作品，收获粉丝的喜欢吧。"
            icon={Heart}
            action={
              <Link to="/gallery" className={buttonClass({ variant: 'primary', size: 'sm' })}>
                去画廊逛逛
              </Link>
            }
          />
        )
      ) : commentLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
          ))}
        </div>
      ) : commentFailed ? (
        <EmptyState
          title="暂时收不到信号"
          description="没能读取收到的评论，请稍后重试。"
          icon={RefreshCw}
          action={
            <Button variant="secondary" size="sm" onClick={() => setCommentReloadKey((key) => key + 1)}>
              重试
            </Button>
          }
        />
      ) : comments.length ? (
        <>
          <div className="space-y-3">
            {comments.map((item) => (
              <Link key={item.id} to="/gallery" className="block">
                <Card className="flex items-start gap-3">
                  <UserAvatar nickname={item.user?.nickname ?? null} avatarUrl={item.user?.avatarUrl ?? null} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
                      <span className="font-medium text-ink">{item.user?.nickname ?? '匿名粉丝'}</span>
                      <span className="text-muted">评论了你的作品</span>
                      <span className="max-w-[16rem] truncate text-amber">{item.image?.title || '未命名作品'}</span>
                    </p>
                    <p className="mt-1.5 break-all text-sm leading-relaxed text-ink/85">{item.content}</p>
                    <p className="mt-1.5 text-[11px] text-muted/70">{formatDateTime(item.createdAt)}</p>
                  </div>
                  {item.image?.imageUrl ? (
                    <img
                      src={item.image.imageUrl}
                      alt={item.image.title ?? '画廊作品'}
                      loading="lazy"
                      className="h-14 w-14 shrink-0 rounded-xl border border-white/10 object-cover"
                    />
                  ) : null}
                </Card>
              </Link>
            ))}
          </div>
          <Pagination
            page={commentData!.page}
            total={commentData!.total}
            pageSize={RECEIVED_PAGE_SIZE}
            onChange={(nextPage) => setCommentPage(nextPage)}
          />
        </>
      ) : (
        <EmptyState
          title="还没有收到评论"
          description="去画廊发布你的作品，等待粉丝的回响吧。"
          icon={MessageSquare}
          action={
            <Link to="/gallery" className={buttonClass({ variant: 'primary', size: 'sm' })}>
              去画廊逛逛
            </Link>
          }
        />
      )}
    </section>
  );
}

// ─── 模块：通行证授权应用 ──────────────────────────────────────────────────

function AuthorizedAppsModule() {
  const [data, setData] = useState<OAuthAuthorizedAppListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    api
      .get<OAuthAuthorizedAppListResponse>('/api/users/me/oauth-apps')
      .then((result) => {
        if (alive) setData(result);
      })
      .catch(() => {
        if (!alive) return;
        setFailed(true);
        setData(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const apps = data?.items ?? [];

  if (loading) {
    return (
      <section className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
        ))}
      </section>
    );
  }

  if (failed) {
    return (
      <EmptyState
        title="暂时读不到授权记录"
        description="没能读取你的授权应用列表，请稍后重试。"
        icon={RefreshCw}
        action={
          <Button variant="secondary" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
            重试
          </Button>
        }
      />
    );
  }

  if (!apps.length) {
    return (
      <EmptyState
        title="还没有授权过任何应用"
        description="当你在外部网站使用空间站通行证登录并确认授权后，授权记录会出现在这里。"
        icon={KeyRound}
      />
    );
  }

  return (
    <section className="space-y-3">
      {apps.map((app) => {
        const statusBadge =
          app.status !== 'ACTIVE'
            ? { tone: 'coral' as const, label: '应用已禁用' }
            : app.active
              ? { tone: 'mint' as const, label: '授权有效' }
              : { tone: 'neutral' as const, label: '授权已过期' };
        return (
          <Card key={app.id} hover={false} className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {app.logoUrl ? (
                <img
                  src={app.logoUrl}
                  alt={`${app.name} 图标`}
                  loading="lazy"
                  className="h-11 w-11 shrink-0 rounded-xl border border-white/10 object-cover"
                />
              ) : (
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                  <KeyRound className="h-5 w-5 text-violet" />
                </span>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">{app.name}</span>
                  <Badge tone={statusBadge.tone}>{statusBadge.label}</Badge>
                </div>
                {app.description ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{app.description}</p>
                ) : null}
                <p className="mt-1.5 text-[11px] text-muted/70">
                  最近授权 {formatDateTime(app.authorizedAt)}
                </p>
              </div>
            </div>
            {app.homepageUrl ? (
              <a
                href={app.homepageUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex shrink-0 items-center gap-1.5 text-xs text-amber transition hover:text-ink"
              >
                <ExternalLink className="h-3.5 w-3.5" /> 访问应用
              </a>
            ) : null}
          </Card>
        );
      })}
    </section>
  );
}

// ─── 页面：独立模块 ─────────────────────────────────────────────────────────

export default function MePage() {
  const { user, loading: authLoading } = useAuth();
  // 进入页面默认展示「点赞与评论」模块
  const [activeModule, setActiveModule] = useState<ModuleKey>('INTERACTIONS');
  // 访问过的模块保持挂载（仅隐藏），切换回来时不丢失编辑中的草稿与列表状态
  const [visited, setVisited] = useState<Record<ModuleKey, boolean>>({
    PROFILE: false,
    OAUTH_APPS: false,
    SUBMISSIONS: false,
    INTERACTIONS: true,
    PENALTY: false,
  });

  if (authLoading) {
    return <div className="h-64 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />;
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent('/me')}`} replace />;
  }

  const openModule = (key: ModuleKey) => {
    setActiveModule(key);
    setVisited((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <SectionHeading
        eyebrow="My Orbit"
        title="个人中心"
        description="管理通行证资料与授权应用、追踪投稿审核进度，查看你收到的点赞与评论。"
      />

      <nav
        aria-label="个人中心模块"
        className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-1.5"
      >
        {MODULES.map((module) => {
          const Icon = module.icon;
          const isActive = activeModule === module.key;
          return (
            <button
              key={module.key}
              type="button"
              onClick={() => openModule(module.key)}
              aria-current={isActive ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm transition ${
                isActive ? 'bg-amber/15 font-medium text-amber' : 'text-muted hover:bg-white/[0.04] hover:text-ink'
              }`}
            >
              <Icon className="h-4 w-4" /> {module.label}
            </button>
          );
        })}
      </nav>

      <p className="-mt-2 text-sm text-muted">{MODULES.find((m) => m.key === activeModule)?.description}</p>

      <div className={activeModule === 'PROFILE' ? '' : 'hidden'}>
        <ProfileEditor />
      </div>

      {visited.OAUTH_APPS ? (
        <div className={activeModule === 'OAUTH_APPS' ? '' : 'hidden'}>
          <AuthorizedAppsModule />
        </div>
      ) : null}

      {visited.SUBMISSIONS ? (
        <div className={activeModule === 'SUBMISSIONS' ? '' : 'hidden'}>
          <SubmissionsModule />
        </div>
      ) : null}

      {visited.INTERACTIONS ? (
        <div className={activeModule === 'INTERACTIONS' ? '' : 'hidden'}>
          <ReceivedModule />
        </div>
      ) : null}

      {visited.PENALTY ? (
        <div className={activeModule === 'PENALTY' ? '' : 'hidden'}>
          <PenaltyStatusModule />
        </div>
      ) : null}
    </div>
  );
}
