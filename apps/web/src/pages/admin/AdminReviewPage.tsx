import { useEffect, useMemo, useState } from 'react';
import {
  ClipboardCheck,
  Clock3,
  Globe2,
  Images,
  RefreshCw,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import {
  ENTITY_TYPES,
  ENTITY_TYPE_LABELS,
  GALLERY_MEDIA_TYPE_LABELS,
  GROUP_TYPE_LABELS,
  SUBMISSION_STATUS_LABELS,
  formatLocation,
  type EntityType,
  type GalleryImage,
  type Group,
  type MetaResponse,
  type Paginated,
  type Site,
  type Submission,
  type SubmissionStatus,
} from '@spaceport/shared';
import { ApiError, api } from '../../lib/api';
import { changedDiffRows, groupDiff, siteDiff, type DiffRow } from '../../lib/diff';
import { formatDateTime } from '../../lib/format';
import { clearMetaCache, EMPTY_META, loadMeta } from '../../lib/meta';
import {
  groupFormFromPayload,
  groupPayloadFromForm,
  isGroupEntity,
  isSiteEntity,
  siteFormFromPayload,
  sitePayloadFromForm,
  submissionSummary,
  validateGroupForm,
  validateSiteForm,
  type FieldErrors,
  type GroupFormState,
  type SiteFormState,
} from '../../lib/submissionForms';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Card from '../../components/Card';
import EmptyState from '../../components/EmptyState';
import { Field, Textarea } from '../../components/Field';
import GroupFields from '../../components/forms/GroupFields';
import SiteFields from '../../components/forms/SiteFields';
import Modal from '../../components/Modal';
import Pagination from '../../components/Pagination';
import StatusBadge from '../../components/StatusBadge';
import { useToast } from '../../components/Toast';

const PAGE_SIZE = 10;
const STATUS_FILTERS: { key: 'ALL' | SubmissionStatus; label: string }[] = [
  { key: 'PENDING', label: '待审核' },
  { key: 'APPROVED', label: '已通过' },
  { key: 'REJECTED', label: '已驳回' },
  { key: 'ALL', label: '全部' },
];

interface AdminDetail {
  item: Submission;
  target: Group | Site | GalleryImage | null;
}

function isGalleryEntity(value: unknown): value is GalleryImage {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'imageUrl' in value &&
      'likeCount' in value &&
      'commentCount' in value,
  );
}

function GalleryPreview({ payload }: { payload: Record<string, unknown> }) {
  const width = typeof payload.imageWidth === 'number' ? payload.imageWidth : null;
  const height = typeof payload.imageHeight === 'number' ? payload.imageHeight : null;
  const tags = Array.isArray(payload.tags)
    ? payload.tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
        <img
          src={String(payload.imageUrl ?? '')}
          alt={String(payload.title ?? '投稿作品')}
          className="max-h-80 w-full object-contain"
        />
      </div>
      <InfoRow
        label="作品类型"
        value={
          GALLERY_MEDIA_TYPE_LABELS[payload.mediaType as keyof typeof GALLERY_MEDIA_TYPE_LABELS] ?? '—'
        }
      />
      <InfoRow label="标题" value={String(payload.title ?? '—')} />
      <InfoRow label="描述" value={String(payload.description ?? '—')} />
      <InfoRow label="尺寸" value={width && height ? `${width} × ${height}` : '—'} />
      <InfoRow label="标签" value={tags.length ? tags.map((tag) => `#${tag}`).join('、') : '—'} />
      <InfoRow label="原图" value={<span className="break-all">{String(payload.imageUrl ?? '—')}</span>} />
    </div>
  );
}

function TagText({ ids, pool }: { ids: unknown; pool: MetaResponse['tags']['group'] }) {
  if (!Array.isArray(ids) || ids.length === 0) return <>—</>;
  const map = new Map(pool.map((tag) => [tag.id, tag.name]));
  return <>{(ids as string[]).map((id) => map.get(id) ?? `#${id}`).join('、')}</>;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
      <span className="text-xs text-muted">{label}</span>
      <span className="max-w-[70%] break-all text-right text-ink/90">{value}</span>
    </div>
  );
}

function DiffPanel({ rows }: { rows: DiffRow[] }) {
  return (
    <div className="rounded-xl border border-aurora/25 bg-aurora/[0.05] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-aurora">与线上内容的字段差异</p>
        <span className="text-[11px] text-muted">{rows.length} 处改动</span>
      </div>
      {rows.length ? (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.key}
              className="rounded-lg border border-amber/25 bg-amber/[0.08] px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-amber">{row.label}</span>
                <span className="rounded-full border border-amber/30 bg-amber/10 px-1.5 py-0.5 text-[10px] text-amber">
                  {row.before === '—' ? '新增' : '修改'}
                </span>
              </div>
              <div className="mt-1 break-all text-xs leading-relaxed">
                <span className="text-muted line-through">{row.before}</span>
                <span className="mx-1.5 text-amber">→</span>
                <span className="text-ink">{row.after}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">当前表单与线上内容一致。</p>
      )}
    </div>
  );
}

interface DrawerProps {
  submission: Submission | null;
  meta: MetaResponse;
  onClose: () => void;
  onDone: () => void;
}

function ReviewDrawer({ submission, meta, onClose, onDone }: DrawerProps) {
  const toast = useToast();
  const [detail, setDetail] = useState<AdminDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [groupForm, setGroupForm] = useState<GroupFormState | null>(null);
  const [siteForm, setSiteForm] = useState<SiteFormState | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [reviewNote, setReviewNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [serverError, setServerError] = useState('');
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null);

  useEffect(() => {
    if (!submission) {
      setDetail(null);
      setGroupForm(null);
      setSiteForm(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setServerError('');
    setErrors({});
    setReviewNote('');
    setNoteError('');
    api
      .get<AdminDetail>(`/api/admin/submissions/${submission.id}`)
      .then((result) => {
        if (!alive) return;
        setDetail(result);
        // 表单一律以投稿 payload（用户提交的新信息）初始化：
        // UPDATE 模式的线上旧数据 target 仅用于差异对比，绝不能回填表单，
        // 否则管理员看到旧信息、diff 恒为空，通过审核还会把旧数据写回（用户修改被丢弃）
        if (result.item.entityType === 'GROUP') {
          setGroupForm(groupFormFromPayload(result.item.payload));
        } else {
          setSiteForm(siteFormFromPayload(result.item.payload));
        }
      })
      .catch(() => {
        if (!alive) return;
        setServerError('审核详情读取失败，请稍后重试');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [submission?.id]);

  const current = detail?.item ?? submission;
  const pending = current?.status === 'PENDING';

  const diffRows = useMemo(() => {
    if (!detail || detail.item.mode !== 'UPDATE') return [];
    if (detail.item.entityType === 'GROUP' && isGroupEntity(detail.target) && groupForm) {
      return changedDiffRows(
        groupDiff(detail.target, groupPayloadFromForm(groupForm), meta.tags.group),
      );
    }
    if (detail.item.entityType === 'SITE' && isSiteEntity(detail.target) && siteForm) {
      return changedDiffRows(
        siteDiff(detail.target, sitePayloadFromForm(siteForm), meta.tags.sites),
      );
    }
    return [];
  }, [detail, groupForm, siteForm, meta.tags.group, meta.tags.sites]);

  const approve = async () => {
    if (!current) return;
    setServerError('');
    let payload: Record<string, unknown> | undefined;
    if (current.entityType === 'GROUP' && groupForm) {
      const result = validateGroupForm(groupForm);
      setErrors(result.errors);
      payload = result.payload;
    } else if (current.entityType === 'SITE' && siteForm) {
      const result = validateSiteForm(siteForm);
      setErrors(result.errors);
      payload = result.payload;
    } else if (current.entityType === 'GALLERY') {
      // 画廊投稿无编辑表单，直接使用提交时的 payload
      payload = undefined;
    }
    if (current.entityType !== 'GALLERY' && !payload) return;

    setActing('approve');
    try {
      await api.post<{ item: Submission; targetId: string }>(
        `/api/admin/submissions/${current.id}/approve`,
        { payloadOverride: payload },
      );
      toast.success('审核通过，内容已写入前台舱段');
      clearMetaCache();
      onDone();
      onClose();
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : '操作失败，请稍后再试');
    } finally {
      setActing(null);
    }
  };

  const reject = async () => {
    if (!current) return;
    if (reviewNote.trim().length < 2) {
      setNoteError('驳回原因至少 2 个字');
      return;
    }
    setNoteError('');
    setServerError('');
    setActing('reject');
    try {
      await api.post<{ item: Submission }>(`/api/admin/submissions/${current.id}/reject`, {
        reviewNote: reviewNote.trim(),
      });
      toast.success('已驳回投稿，投稿人可修改后重新提交');
      clearMetaCache();
      onDone();
      onClose();
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : '操作失败，请稍后再试');
    } finally {
      setActing(null);
    }
  };

  const payload = current?.payload ?? {};

  return (
    <Modal
      open={Boolean(submission)}
      onClose={onClose}
      variant="drawer"
      size="full"
      eyebrow="Review Console"
      title={current ? submissionSummary(current.payload) : '审核详情'}
      description={
        current
          ? `${ENTITY_TYPE_LABELS[current.entityType]} · ${current.mode === 'UPDATE' ? '修改申请' : '新建投稿'} · ${formatDateTime(current.createdAt)}`
          : undefined
      }
      footer={
        pending ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="danger"
              loading={acting === 'reject'}
              disabled={acting !== null}
              onClick={() => void reject()}
            >
              驳回
            </Button>
            <Button
              loading={acting === 'approve'}
              disabled={acting !== null}
              icon={<ShieldCheck className="h-4 w-4" />}
              onClick={() => void approve()}
            >
              通过并发布
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
          {Array.from({ length: 6 }).map((_, index) => (
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
            <Badge tone="neutral">{ENTITY_TYPE_LABELS[current.entityType]}</Badge>
            <span className="inline-flex items-center gap-1 text-xs text-muted">
              <Clock3 className="h-3.5 w-3.5" /> {formatDateTime(current.createdAt)}
            </span>
          </div>

          {current.submitter ? (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-muted">
              提交人：<span className="text-ink">{current.submitter.nickname}</span>
              <span className="ml-2 text-muted/70">{current.submitter.email}</span>
            </div>
          ) : null}

          {current.mode === 'UPDATE' && diffRows.length > 0 && detail?.target ? (
            <DiffPanel rows={diffRows} />
          ) : null}

          {current.reviewNote ? (
            <div className="rounded-xl border border-coral/30 bg-coral/[0.08] px-4 py-3">
              <p className="text-xs font-medium text-coral">驳回原因</p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink/85">{current.reviewNote}</p>
            </div>
          ) : null}

          {pending ? (
            <div className="space-y-5">
              {current.entityType === 'GALLERY' ? (
                <div className="rounded-xl border border-amber/25 bg-amber/[0.06] px-4 py-3 text-xs leading-relaxed text-amber/90">
                  画廊投稿不支持在线修改；确认内容合规后点击「通过并发布」即可公开展示。
                </div>
              ) : (
                <div className="rounded-xl border border-amber/25 bg-amber/[0.06] px-4 py-3 text-xs leading-relaxed text-amber/90">
                  可直接修正分类、城市、标签与链接；点击「通过并发布」时，当前表单会作为 payloadOverride 写回。
                </div>
              )}

              {current.entityType === 'GROUP' ? (
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted/70">可编辑审核表单</p>
                  {groupForm ? (
                    <GroupFields value={groupForm} onChange={setGroupForm} meta={meta} errors={errors} />
                  ) : null}
                </div>
              ) : current.entityType === 'SITE' ? (
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted/70">可编辑审核表单</p>
                  {siteForm ? (
                    <SiteFields value={siteForm} onChange={setSiteForm} meta={meta} errors={errors} />
                  ) : null}
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-muted/70">投稿内容预览</p>
                  <GalleryPreview payload={payload} />
                </div>
              )}

              <Field label="驳回原因" error={noteError} hint="驳回时必须填写，至少 2 个字，将展示给投稿人">
                <Textarea
                  value={reviewNote}
                  rows={3}
                  maxLength={200}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder="请说明需要修改的地方，方便投稿人调整后重新提交…"
                />
              </Field>
            </div>
          ) : (
            <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted/70">投稿内容快照</p>
              {current.entityType === 'GALLERY' ? (
                <GalleryPreview payload={payload} />
              ) : current.entityType === 'GROUP' ? (
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
                    label="城市"
                    value={
                      formatLocation(
                        payload.province as string | null,
                        payload.city as string | null,
                      ) || '—'
                    }
                  />
                  <InfoRow label="简介" value={String(payload.description ?? '—')} />
                  <InfoRow label="标签" value={<TagText ids={payload.tags} pool={meta.tags.group} />} />
                </>
              ) : (
                <>
                  <InfoRow label="标题" value={String(payload.title ?? '—')} />
                  <InfoRow label="链接" value={String(payload.url ?? '—')} />
                  <InfoRow label="简介" value={String(payload.description ?? '—')} />
                  <InfoRow label="标签" value={<TagText ids={payload.tags} pool={meta.tags.sites} />} />
                </>
              )}
            </div>
          )}

          {serverError ? (
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

export default function AdminReviewPage() {
  const [status, setStatus] = useState<'ALL' | SubmissionStatus>('PENDING');
  const [entityType, setEntityType] = useState<'' | EntityType>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paginated<Submission> | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [meta, setMeta] = useState<MetaResponse>(EMPTY_META);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchRejectOpen, setBatchRejectOpen] = useState(false);
  const [batchNote, setBatchNote] = useState('');
  const [batchNoteError, setBatchNoteError] = useState('');
  const [batchActing, setBatchActing] = useState<'approve' | 'reject' | null>(null);
  const toast = useToast();

  useEffect(() => {
    loadMeta().then(setMeta);
  }, []);

  // 切换筛选/翻页时清空勾选，避免跨页批量误操作
  useEffect(() => {
    setSelectedIds(new Set());
    setBatchRejectOpen(false);
  }, [status, entityType, page]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    api
      .get<Paginated<Submission>>('/api/admin/submissions', {
        status: status === 'ALL' ? undefined : status,
        entityType: entityType || undefined,
        page,
        pageSize: PAGE_SIZE,
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
  }, [status, entityType, page, reloadKey]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const allSelected = Boolean(data && data.items.length > 0 && data.items.every((item) => selectedIds.has(item.id)));

  const toggleAll = () => {
    if (!data || data.items.length === 0) return;
    setSelectedIds(allSelected ? new Set() : new Set(data.items.map((item) => item.id)));
  };

  const runBatch = async (action: 'approve' | 'reject', reviewNote?: string) => {
    if (selectedIds.size === 0) return;
    setBatchActing(action);
    try {
      const result = await api.post<{
        succeeded: { id: string; targetId: string | null }[];
        failed: { id: string; error: string }[];
      }>('/api/admin/submissions/batch', {
        ids: [...selectedIds],
        action,
        ...(action === 'reject' ? { reviewNote } : {}),
      });
      const okCount = result.succeeded.length;
      const failCount = result.failed.length;
      if (failCount === 0) {
        toast.success(`批量${action === 'approve' ? '通过' : '驳回'}完成，共处理 ${okCount} 条`);
      } else {
        toast.error(`成功 ${okCount} 条，失败 ${failCount} 条：${result.failed[0].error}`);
      }
      setSelectedIds(new Set());
      setBatchRejectOpen(false);
      setBatchNote('');
      clearMetaCache();
      setReloadKey((key) => key + 1);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '批量操作失败，请稍后再试');
    } finally {
      setBatchActing(null);
    }
  };

  const submitBatchReject = async () => {
    if (batchNote.trim().length < 2) {
      setBatchNoteError('驳回原因至少 2 个字');
      return;
    }
    setBatchNoteError('');
    await runBatch('reject', batchNote.trim());
  };

  const pendingCount = data && status === 'PENDING' ? data.total : meta.stats.pendingSubmissions;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <ClipboardCheck className="h-5 w-5 text-amber" /> 审核台
          </h2>
          <p className="mt-1 text-xs text-muted">
            待审核 {pendingCount} 条 · 审核通过后立即写入前台，驳回需填写原因。
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
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] p-1.5">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setStatus(item.key);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs transition ${
                status === item.key ? 'bg-amber/15 font-medium text-amber' : 'text-muted hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.03] p-1.5">
          <button
            type="button"
            onClick={() => {
              setEntityType('');
              setPage(1);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${
              !entityType ? 'bg-aurora/15 font-medium text-aurora' : 'text-muted hover:text-ink'
            }`}
          >
            全部类型
          </button>
          {ENTITY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setEntityType(type);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-xs transition ${
                entityType === type ? 'bg-aurora/15 font-medium text-aurora' : 'text-muted hover:text-ink'
              }`}
            >
              {ENTITY_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-xl border border-white/8 bg-white/[0.03]" />
          ))}
        </div>
      ) : failed ? (
        <EmptyState
          title="审核队列读取失败"
          description="请确认管理员权限与后端服务状态，或稍后重试。"
          icon={RefreshCw}
          action={
            <Button variant="secondary" size="sm" onClick={() => setReloadKey((key) => key + 1)}>
              重新加载
            </Button>
          }
        />
      ) : data && data.items.length ? (
        <>
          {status === 'PENDING' ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer accent-amber-600"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="全选本页待审核投稿"
                />
                全选本页（{data.items.length} 条）
              </label>
              {selectedIds.size > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">已选 {selectedIds.size} 条</span>
                  <Button
                    size="sm"
                    icon={<ShieldCheck className="h-4 w-4" />}
                    loading={batchActing === 'approve'}
                    disabled={batchActing !== null}
                    onClick={() => void runBatch('approve')}
                  >
                    批量通过
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    loading={batchActing === 'reject'}
                    disabled={batchActing !== null}
                    onClick={() => {
                      setBatchNote('');
                      setBatchNoteError('');
                      setBatchRejectOpen(true);
                    }}
                  >
                    批量驳回
                  </Button>
                  <Button size="sm" variant="ghost" disabled={batchActing !== null} onClick={() => setSelectedIds(new Set())}>
                    清除选择
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-muted">勾选投稿后可批量通过或驳回</span>
              )}
            </div>
          ) : null}
          <Card hover={false} padded={false} className="divide-y divide-white/8 overflow-hidden">
            {data.items.map((item) => (
              <div key={item.id} className="flex items-stretch transition hover:bg-white/[0.04]">
                {status === 'PENDING' ? (
                  <label className="flex cursor-pointer items-center pl-4 pr-0.5">
                    <input
                      type="checkbox"
                      className="h-4 w-4 cursor-pointer accent-amber-600"
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleSelect(item.id)}
                      aria-label={`选择投稿：${submissionSummary(item.payload)}`}
                    />
                  </label>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelected(item)}
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-3 px-4 py-3.5 text-left"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                    {item.entityType === 'GROUP' ? (
                      <UsersRound className="h-4 w-4 text-amber" />
                    ) : item.entityType === 'GALLERY' ? (
                      <Images className="h-4 w-4 text-violet" />
                    ) : (
                      <Globe2 className="h-4 w-4 text-mint" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink">
                        {submissionSummary(item.payload)}
                      </span>
                      <Badge tone={item.mode === 'UPDATE' ? 'aurora' : 'neutral'}>
                        {item.mode === 'UPDATE' ? '修改' : '新建'}
                      </Badge>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {item.submitter?.nickname ?? '未知投稿人'} · {ENTITY_TYPE_LABELS[item.entityType]} ·
                      {' '}
                      {formatDateTime(item.createdAt)}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <StatusBadge status={item.status} />
                    <span className="text-xs text-muted">查看 ›</span>
                  </span>
                </button>
              </div>
            ))}
          </Card>
          <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} />
        </>
      ) : (
        <EmptyState
          title={status === 'PENDING' ? '审核队列已清空' : '没有符合条件的投稿'}
          description={
            status === 'PENDING'
              ? '目前没有待审核信号，空间站运行平稳。'
              : '切换筛选条件查看其他状态的投稿。'
          }
          icon={ClipboardCheck}
        />
      )}

      <ReviewDrawer
        submission={selected}
        meta={meta}
        onClose={() => setSelected(null)}
        onDone={() => setReloadKey((key) => key + 1)}
      />

      <Modal
        open={batchRejectOpen}
        onClose={() => {
          if (batchActing === null) setBatchRejectOpen(false);
        }}
        eyebrow="Batch Review"
        title={`批量驳回 ${selectedIds.size} 条投稿`}
        description="驳回原因将展示给每位投稿人，投稿人可修改后重新提交。"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={batchActing !== null} onClick={() => setBatchRejectOpen(false)}>
              取消
            </Button>
            <Button
              variant="danger"
              loading={batchActing === 'reject'}
              disabled={batchActing !== null}
              onClick={() => void submitBatchReject()}
            >
              确认驳回
            </Button>
          </div>
        }
      >
        <Field label="驳回原因" error={batchNoteError} hint="至少 2 个字，最多 200 字">
          <Textarea
            value={batchNote}
            rows={4}
            maxLength={200}
            onChange={(event) => setBatchNote(event.target.value)}
            placeholder="请说明批量驳回的原因…"
          />
        </Field>
      </Modal>
    </div>
  );
}
