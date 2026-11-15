import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Clock3,
  Eye,
  Globe2,
  Inbox,
  Pencil,
  RefreshCw,
  UsersRound,
} from 'lucide-react';
import {
  ENTITY_TYPE_LABELS,
  GROUP_TYPE_LABELS,
  formatLocation,
  type Group,
  type MetaResponse,
  type Paginated,
  type Site,
  type Submission,
  type SubmissionStatus,
} from '@spaceport/shared';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { EMPTY_META, loadMeta } from '../lib/meta';
import { groupFormFromGroup, groupFormFromPayload, isGroupEntity, isSiteEntity, siteFormFromSite, siteFormFromPayload, submissionSummary, validateGroupForm, validateSiteForm, type FieldErrors, type GroupFormState, type SiteFormState } from '../lib/submissionForms';
import Badge from '../components/Badge';
import Button, { buttonClass } from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import GroupFields from '../components/forms/GroupFields';
import SiteFields from '../components/forms/SiteFields';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import ProfileEditor from '../components/ProfileEditor';
import SectionHeading from '../components/SectionHeading';
import StatusBadge from '../components/StatusBadge';
import { useToast } from '../components/Toast';

const PAGE_SIZE = 10;
const TABS: { key: 'ALL' | SubmissionStatus; label: string }[] = [
  { key: 'ALL', label: '全部' },
  { key: 'PENDING', label: '待审核' },
  { key: 'APPROVED', label: '已通过' },
  { key: 'REJECTED', label: '已驳回' },
];

interface SubmissionDetail {
  item: Submission;
  target: Group | Site | null;
}

function EntityIcon({ type }: { type: Submission['entityType'] }) {
  return type === 'GROUP' ? (
    <UsersRound className="h-4 w-4 text-amber" />
  ) : (
    <Globe2 className="h-4 w-4 text-mint" />
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
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
    api
      .get<SubmissionDetail>(`/api/submissions/${submission.id}`)
      .then((result) => {
        if (!alive) return;
        setDetail(result);
        const useTarget = result.item.status === 'APPROVED' ? result.target : null;
        if (result.item.entityType === 'GROUP') {
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
  const editable = current?.status === 'REJECTED' || current?.status === 'APPROVED';
  const readOnly = current?.status === 'PENDING';

  const handleSubmit = async () => {
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
    }
    if (!payload) return;

    setSubmitting(true);
    try {
      if (current.status === 'REJECTED') {
        await api.post<{ item: Submission }>(`/api/submissions/${current.id}/resubmit`, { payload });
        toast.success('修改已重新发送，等待站长审核');
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
              <p className="text-xs font-medium text-coral">站长留言</p>
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
                  ? '根据站长留言调整内容后重新提交，会生成一条新的待审核信号。'
                  : '这里是修改申请：审核通过后才会覆盖线上内容，原内容继续展示。'}
              </div>

              {current.entityType === 'GROUP' && groupForm ? (
                <GroupFields value={groupForm} onChange={setGroupForm} meta={meta} errors={errors} />
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

export default function MePage() {
  const { user, loading: authLoading } = useAuth();
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
    if (!user) return;
    let alive = true;
    setLoading(true);
    setFailed(false);
    api
      .get<Paginated<Submission>>('/api/submissions/mine', {
        status: status === 'ALL' ? undefined : status,
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
  }, [user, status, page, reloadKey]);

  if (authLoading) {
    return <div className="h-64 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />;
  }

  if (!user) {
    return <Navigate to={`/login?next=${encodeURIComponent('/me')}`} replace />;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <SectionHeading
        eyebrow="My Orbit"
        title="我的投稿"
        description="追踪每一条信号的审核进度。被驳回的投稿可以修改后重新发送，已通过的内容可以申请修改。"
        action={
          <Link to="/submit" className={buttonClass({ variant: 'primary', size: 'sm' })}>
            继续投稿
          </Link>
        }
      />

      <ProfileEditor />

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.03] p-1.5">
        {TABS.map((tab) => (
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
        ) : null}
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
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                      <EntityIcon type={item.entityType} />
                    </span>
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
                    ) : item.status === 'APPROVED' ? (
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
            pageSize={PAGE_SIZE}
            onChange={(nextPage) => setPage(nextPage)}
          />
        </>
      ) : (
        <EmptyState
          title="还没有投递过信号"
          description="把一个想分享的群或站点送入轨道，站长审核后就会出现在公开舱段。"
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
    </div>
  );
}
