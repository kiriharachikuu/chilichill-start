import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Flag, RefreshCw, ShieldCheck, X } from 'lucide-react';
import {
  REPORT_STATUSES,
  REPORT_STATUS_LABELS,
  PENALTY_TYPE_LABELS,
  type CommentReport,
  type CommentReportListResponse,
  type ReportResolveResponse,
  type ReportStatus,
} from '@spaceport/shared';
import { ApiError, api } from '../../lib/api';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Card from '../../components/Card';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import Pagination from '../../components/Pagination';
import SectionHeading from '../../components/SectionHeading';
import { useToast } from '../../components/Toast';
import { formatDateTime } from '../../lib/format';

const STATUS_TABS: { key: ReportStatus | 'ALL'; label: string }[] = [
  { key: 'PENDING', label: '待处理' },
  { key: 'RESOLVED', label: '已处理' },
  { key: 'DISMISSED', label: '已驳回' },
  { key: 'ALL', label: '全部' },
];

const STATUS_TONES: Record<ReportStatus, 'amber' | 'coral' | 'mint'> = {
  PENDING: 'amber',
  RESOLVED: 'coral',
  DISMISSED: 'mint',
};

const PAGE_SIZE = 20;

// 评论举报管理：处理 = 删除被举报评论；驳回 = 保留评论并关闭举报
export default function AdminReportsPage() {
  const toast = useToast();
  const [status, setStatus] = useState<ReportStatus | 'ALL'>('PENDING');
  const [reports, setReports] = useState<CommentReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [resolving, setResolving] = useState<CommentReport | null>(null);

  // 竞态防护：seq 丢弃乱序完成的过期响应（快速切换状态页签时后发先至）；
  // alive 避免卸载后的异步回调继续 setState
  const fetchSeqRef = useRef(0);
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const fetchReports = useCallback(
    async (targetPage: number, targetStatus: ReportStatus | 'ALL') => {
      const seq = (fetchSeqRef.current += 1);
      setLoading(true);
      setFailed(false);
      try {
        const query = new URLSearchParams({ page: String(targetPage), pageSize: String(PAGE_SIZE) });
        if (targetStatus !== 'ALL') query.set('status', targetStatus);
        const res = await api.get<CommentReportListResponse>(`/api/admin/comment-reports?${query.toString()}`);
        if (!aliveRef.current || seq !== fetchSeqRef.current) return;
        setReports(res.items);
        setTotal(res.total);
        setPage(res.page);
      } catch {
        if (!aliveRef.current || seq !== fetchSeqRef.current) return;
        setFailed(true);
      } finally {
        if (aliveRef.current && seq === fetchSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void fetchReports(page, status);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeStatus = (next: ReportStatus | 'ALL') => {
    setStatus(next);
    void fetchReports(1, next);
  };

  const confirmResolve = async () => {
    if (!resolving) return;
    setActingId(resolving.id);
    try {
      const result = await api.post<ReportResolveResponse>(
        `/api/admin/comment-reports/${resolving.id}/resolve`,
      );
      // 处罚详情联动展示：核实后系统按阶梯规则自动处罚（警告/禁言/封号）
      toast.success(
        result.penalty
          ? `已删除被举报评论，并触发处罚：${PENALTY_TYPE_LABELS[result.penalty.type]}${
              result.penalty.durationDays ? ` ${result.penalty.durationDays} 天` : ''
            }（用户 #${result.penalty.userUid ?? '—'}）`
          : '已删除被举报评论，未触发新处罚',
      );
      setResolving(null);
      void fetchReports(page, status);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '处理失败，请稍后再试');
    } finally {
      setActingId(null);
    }
  };

  const dismissReport = async (report: CommentReport) => {
    setActingId(report.id);
    try {
      await api.post(`/api/admin/comment-reports/${report.id}/dismiss`);
      toast.success('已驳回该举报');
      void fetchReports(page, status);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '处理失败，请稍后再试');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeading
        eyebrow="Reports"
        title="举报管理"
        description="处理粉丝对评论的举报：确认违规可删除评论，误报可驳回"
        action={
          <Button
            variant="ghost"
            size="sm"
            icon={<RefreshCw className="h-3.5 w-3.5" />}
            onClick={() => void fetchReports(page, status)}
          >
            刷新
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => changeStatus(tab.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                status === tab.key
                  ? 'bg-amber text-ink'
                  : 'border border-white/10 text-muted hover:border-white/25 hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted">
            共 <span className="font-mono font-bold text-ink">{total}</span> 条
          </span>
        </div>

        {loading && reports.length === 0 ? (
          <div className="px-4 py-12 text-center text-xs text-muted">加载中…</div>
        ) : failed && reports.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="加载失败"
            description="请检查网络后点击「刷新」重试"
          />
        ) : reports.length === 0 ? (
          <EmptyState
            icon={Flag}
            title="暂无举报记录"
            description={status === 'PENDING' ? '待处理队列为空，社区环境良好' : '当前筛选条件下没有举报记录'}
          />
        ) : (
          <ul className="divide-y divide-white/8">
            {reports.map((report) => (
              <li key={report.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATUS_TONES[report.status]}>{REPORT_STATUS_LABELS[report.status]}</Badge>
                      <span className="text-xs text-muted/70">{formatDateTime(report.createdAt)}</span>
                    </div>
                    <p className="mt-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm leading-relaxed text-ink">
                      {report.commentContent}
                    </p>
                    <div className="mt-2 space-y-0.5 text-xs text-muted">
                      <p>
                        被举报人：
                        <span className="text-ink">{report.commentUserNickname ?? '未知用户'}</span>
                        <span className="ml-3">举报人：</span>
                        <span className="text-ink">
                          {report.reporter?.nickname ?? '未知用户'}
                        </span>
                      </p>
                      <p>
                        举报原因：<span className="text-ink">{report.reason}</span>
                      </p>
                      {report.handledAt ? (
                        <p className="text-muted/70">
                          处理人：{report.handledBy?.nickname ?? '—'} · {formatDateTime(report.handledAt)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  {report.status === 'PENDING' ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={actingId === report.id}
                        icon={<Check className="h-3.5 w-3.5" />}
                        onClick={() => setResolving(report)}
                      >
                        删除评论
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={actingId === report.id}
                        icon={<X className="h-3.5 w-3.5" />}
                        onClick={() => void dismissReport(report)}
                      >
                        驳回
                      </Button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {total > PAGE_SIZE ? (
          <div className="border-t border-white/10 px-4 py-3">
            <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={(next) => void fetchReports(next, status)} />
          </div>
        ) : null}
      </Card>

      <ConfirmDialog
        open={Boolean(resolving)}
        title="确定删除该评论吗？"
        description="删除后不可恢复。"
        confirmText="删除评论"
        danger
        busy={actingId === resolving?.id}
        onConfirm={() => void confirmResolve()}
        onClose={() => setResolving(null)}
      >
        {resolving ? (
          <div className="rounded-xl border border-coral/30 bg-coral/[0.08] px-4 py-3">
            <p className="break-words text-sm leading-relaxed text-ink">{resolving.commentContent}</p>
            <p className="mt-1.5 text-xs text-muted">
              被举报人：{resolving.commentUserNickname ?? '未知用户'} · 举报原因：{resolving.reason}
            </p>
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
