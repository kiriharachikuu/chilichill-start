import { useCallback, useEffect, useRef, useState } from 'react';
import { Gavel, ShieldBan, Undo2 } from 'lucide-react';
import {
  PENALTY_TYPES,
  PENALTY_TYPE_LABELS,
  PERMISSIONS,
  hasPermission,
  type PenaltyListResponse,
  type Penalty as PenaltyDto,
  type PenaltyType,
} from '@spaceport/shared';
import { ApiError, api, formatApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useAuth } from '../../lib/auth';
import Badge, { type BadgeTone } from '../../components/Badge';
import { buttonClass } from '../../components/Button';
import Card from '../../components/Card';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import Pagination from '../../components/Pagination';
import SectionHeading from '../../components/SectionHeading';
import { useToast } from '../../components/Toast';

const PAGE_SIZE = 20;

const TYPE_TABS: Array<{ value: PenaltyType | ''; label: string }> = [
  { value: '', label: '全部类型' },
  ...PENALTY_TYPES.map((type) => ({ value: type, label: PENALTY_TYPE_LABELS[type] })),
];

const STATUS_TABS: Array<{ value: '' | 'active' | 'revoked'; label: string }> = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '生效中' },
  { value: 'revoked', label: '已撤销' },
];

const TYPE_BADGE_TONE: Record<PenaltyType, BadgeTone> = {
  WARNING: 'amber',
  MUTE: 'coral',
  BAN: 'violet',
};

function durationLabel(type: PenaltyType, durationDays: number | null): string {
  if (type === 'MUTE' && durationDays) return `${durationDays} 天`;
  if (type === 'WARNING') return '无功能限制';
  return '永久';
}

export default function AdminPenaltiesPage() {
  const toast = useToast();
  const { user } = useAuth();

  const [type, setType] = useState<PenaltyType | ''>('');
  const [status, setStatus] = useState<'' | 'active' | 'revoked'>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PenaltyListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [revoking, setRevoking] = useState<PenaltyDto | null>(null);
  const [revokeReason, setRevokeReason] = useState('');
  const [revokeBusy, setRevokeBusy] = useState(false);

  const fetchSeqRef = useRef(0);

  const fetchList = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    setLoading(true);
    setFailed(false);
    try {
      const result = await api.get<PenaltyListResponse>('/api/admin/penalties', {
        type: type || undefined,
        revoked: status === '' ? undefined : status === 'revoked',
        page,
        pageSize: PAGE_SIZE,
      });
      if (seq !== fetchSeqRef.current) return;
      setData(result);
    } catch (error) {
      if (seq !== fetchSeqRef.current) return;
      console.error('[admin/penalties] 加载处罚记录失败', error);
      setFailed(true);
      setData(null);
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false);
    }
  }, [type, status, page]);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const canRevoke = hasPermission(user?.role, PERMISSIONS.REPORT_MANAGE) && user?.role === 'ADMIN';

  const submitRevoke = async () => {
    if (!revoking) return;
    if (revokeReason.trim().length < 2) {
      toast.error('请填写撤销原因（至少 2 个字）');
      return;
    }
    setRevokeBusy(true);
    try {
      await api.post(`/api/admin/penalties/${revoking.id}/revoke`, { reason: revokeReason.trim() });
      toast.success(`已撤销${PENALTY_TYPE_LABELS[revoking.type]}处罚，用户权限已自动恢复`);
      setRevoking(null);
      setRevokeReason('');
      await fetchList();
    } catch (error) {
      const message =
        error instanceof ApiError ? formatApiError(error) : '撤销失败，请稍后再试';
      toast.error(message);
    } finally {
      setRevokeBusy(false);
    }
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="space-y-5">
      <SectionHeading
        eyebrow="Penalty"
        title="处罚管理"
        description="举报核实后系统按阶梯规则自动处罚（3 次警告 → 3/7/15 天禁言 → 永久封号）。撤销误处罚会自动回退用户计数并恢复对应权限，操作留痕于审计日志。"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setType(tab.value);
                setPage(1);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                type === tab.value
                  ? 'border-ink bg-ink text-white'
                  : 'border-white/10 bg-white/[0.03] text-muted hover:border-amber hover:text-amber'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => {
                setStatus(tab.value);
                setPage(1);
              }}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                status === tab.value
                  ? 'border-ink bg-ink text-white'
                  : 'border-white/10 bg-white/[0.03] text-muted hover:border-amber hover:text-amber'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <Card>
        {loading ? (
          <ul className="divide-y divide-white/8">
            {[0, 1, 2, 3].map((index) => (
              <li key={index} className="h-20 animate-pulse bg-white/[0.02]" />
            ))}
          </ul>
        ) : failed ? (
          <EmptyState
            icon={ShieldBan}
            title="处罚记录加载失败"
            description="服务暂时不可用，请稍后重试。"
            action={
              <button type="button" onClick={() => void fetchList()} className="text-sm text-amber hover:underline">
                重新加载
              </button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Gavel}
            title="暂无处罚记录"
            description="还没有任何处罚触发记录。举报核实后将按阶梯规则自动生成。"
          />
        ) : (
          <ul className="divide-y divide-white/8">
            {items.map((item) => (
              <li key={item.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={TYPE_BADGE_TONE[item.type]}>{PENALTY_TYPE_LABELS[item.type]}</Badge>
                      {item.revokedAt ? (
                        <Badge tone="neutral">已撤销</Badge>
                      ) : (
                        <Badge tone="mint">生效中</Badge>
                      )}
                      <span className="text-sm font-bold">
                        用户 #{item.userUid ?? '—'}
                        {item.userNickname ? (
                          <span className="ml-1.5 font-normal text-muted">（{item.userNickname}）</span>
                        ) : null}
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      违规事由：<span className="text-ink/90">{item.reason}</span>
                    </p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted/80">
                      <span>处罚时长：{durationLabel(item.type, item.durationDays)}</span>
                      <span>生效：{formatDateTime(item.startedAt)}</span>
                      <span>结束：{item.type === 'BAN' ? '永久' : item.endsAt ? formatDateTime(item.endsAt) : '—'}</span>
                      <span>凭证举报：{item.evidenceReportIds.length} 条</span>
                      {item.operatorNickname ? <span>执行人：{item.operatorNickname}</span> : null}
                    </div>
                    {item.revokedAt ? (
                      <p className="text-[11px] text-muted/80">
                        撤销人：{item.revokedByNickname ?? '—'} · 撤销时间：{formatDateTime(item.revokedAt)}
                        {item.revokeReason ? ` · 原因：${item.revokeReason}` : ''}
                      </p>
                    ) : null}
                  </div>
                  {canRevoke && !item.revokedAt ? (
                    <button
                      type="button"
                      onClick={() => {
                        setRevoking(item);
                        setRevokeReason('');
                      }}
                      className={buttonClass({ variant: 'ghost', size: 'sm' })}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      撤销处罚
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {total > PAGE_SIZE ? (
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={(next) => setPage(next)} />
      ) : null}

      <ConfirmDialog
        open={Boolean(revoking)}
        title={`撤销${revoking ? PENALTY_TYPE_LABELS[revoking.type] : ''}处罚？`}
        description={
          revoking
            ? `撤销后用户 #${revoking.userUid ?? '—'} 的对应限制将自动解除，处罚计数同步回退（阶梯重新计算），并通知该用户。操作会记入审计日志。`
            : ''
        }
        confirmText="确认撤销"
        danger
        busy={revokeBusy}
        onConfirm={() => void submitRevoke()}
        onClose={() => setRevoking(null)}
      >
        <textarea
          value={revokeReason}
          onChange={(event) => setRevokeReason(event.target.value)}
          rows={3}
          maxLength={200}
          placeholder="撤销原因（必填，至少 2 个字），例如举报内容经复核不构成违规"
          className="input-base resize-none"
        />
      </ConfirmDialog>

      {canRevoke ? null : (
        <p className="flex items-center gap-1.5 text-xs text-muted/70">
          <ShieldBan className="h-3.5 w-3.5" />
          撤销处罚仅限站长（管理员）操作。
        </p>
      )}
    </div>
  );
}
