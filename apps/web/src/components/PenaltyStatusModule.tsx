import { useCallback, useEffect, useRef, useState } from 'react';
import { BellOff, Gavel, ShieldAlert, ShieldBan } from 'lucide-react';
import {
  NOTIFICATION_TYPE_LABELS,
  PENALTY_TYPE_LABELS,
  type NotificationItem,
  type NotificationListResponse,
  type PenaltyStatus,
  type PenaltyType,
} from '@spaceport/shared';
import { ApiError, api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import Badge, { type BadgeTone } from './Badge';
import Card from './Card';
import EmptyState from './EmptyState';
import Pagination from './Pagination';

const NOTIFICATION_PAGE_SIZE = 10;

const TYPE_BADGE_TONE: Record<PenaltyType, BadgeTone> = {
  WARNING: 'amber',
  MUTE: 'coral',
  BAN: 'violet',
};

function formatRemaining(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return `${Math.max(minutes, 1)} 分钟`;
}

/** 个人中心「处罚与通知」模块：实时处罚状态 + 系统通知列表 */
export default function PenaltyStatusModule() {
  const [status, setStatus] = useState<PenaltyStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusFailed, setStatusFailed] = useState(false);

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const statusSeqRef = useRef(0);
  const listSeqRef = useRef(0);

  const loadStatus = useCallback(async () => {
    const seq = ++statusSeqRef.current;
    setStatusLoading(true);
    setStatusFailed(false);
    try {
      const result = await api.get<PenaltyStatus>('/api/users/me/penalty-status');
      if (seq === statusSeqRef.current) setStatus(result);
    } catch (error) {
      if (seq === statusSeqRef.current) {
        console.error('[me/penalty-status] 加载处罚状态失败', error);
        setStatusFailed(true);
        setStatus(null);
      }
    } finally {
      if (seq === statusSeqRef.current) setStatusLoading(false);
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    const seq = ++listSeqRef.current;
    setLoading(true);
    setFailed(false);
    try {
      const result = await api.get<NotificationListResponse>('/api/users/me/notifications', {
        page,
        pageSize: NOTIFICATION_PAGE_SIZE,
      });
      if (seq === listSeqRef.current) {
        setItems(result.items);
        setTotal(result.total);
      }
    } catch (error) {
      if (seq === listSeqRef.current) {
        console.error('[me/notifications] 加载系统通知失败', error);
        setFailed(true);
        setItems([]);
        setTotal(0);
      }
    } finally {
      if (seq === listSeqRef.current) setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const markRead = async (notification: NotificationItem) => {
    if (notification.readAt || markingId === notification.id) return;
    setMarkingId(notification.id);
    const readAt = new Date().toISOString();
    // 乐观更新：标记失败时回滚
    setItems((prev) =>
      prev.map((item) => (item.id === notification.id ? { ...item, readAt } : item)),
    );
    try {
      await api.post(`/api/users/me/notifications/${notification.id}/read`);
    } catch (error) {
      if (error instanceof ApiError) {
        console.error('[me/notifications] 标记已读失败', error);
      }
      setItems((prev) =>
        prev.map((item) =>
          item.id === notification.id ? { ...item, readAt: null } : item,
        ),
      );
    } finally {
      setMarkingId(null);
    }
  };

  const unreadCount = items.filter((item) => !item.readAt).length;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <Gavel className="h-4 w-4 text-amber" />
            我的处罚状态
          </h3>
          {statusLoading ? (
            <span className="text-xs text-muted">加载中…</span>
          ) : statusFailed ? (
            <button type="button" onClick={() => void loadStatus()} className="text-xs text-amber hover:underline">
              加载失败，点击重试
            </button>
          ) : null}
        </div>
        {statusLoading ? (
          <div className="h-28 animate-pulse bg-white/[0.02]" />
        ) : statusFailed || !status ? (
          <p className="px-4 py-6 text-sm text-muted">暂无法获取处罚状态，请稍后重试。</p>
        ) : (
          <div className="space-y-4 p-4">
            {status.banned ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-ink bg-coral/10 px-3.5 py-3 text-sm text-ink">
                <ShieldBan className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="flex flex-wrap items-center gap-1.5">
                  通行证已被
                  <Badge tone="violet">{PENALTY_TYPE_LABELS.BAN}</Badge>
                  （{status.bannedAt ? `生效于 ${formatDateTime(status.bannedAt)}` : ''}），禁止登录及一切操作。
                </span>
              </div>
            ) : null}
            {status.activeMute ? (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber/40 bg-amber/10 px-3.5 py-3 text-sm text-amber">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  当前处于
                  <Badge tone="coral">{PENALTY_TYPE_LABELS.MUTE}</Badge>
                  期间，禁止发布内容与评论；至 {formatDateTime(status.activeMute.endsAt)} 自动解除
                  （剩余 {formatRemaining(status.activeMute.remainingSeconds)}）。
                </span>
              </div>
            ) : null}
            {!status.banned && !status.activeMute ? (
              <p className="flex items-center gap-2 text-sm text-mint">
                <ShieldAlert className="h-4 w-4" />
                当前无生效处罚，通行证状态正常。
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3 sm:max-w-md">
              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3">
                <p className="font-mono text-2xl font-bold">{status.warningCount}</p>
                <p className="mt-1 text-xs text-muted">累计有效警告次数</p>
              </div>
              <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3.5 py-3">
                <p className="font-mono text-2xl font-bold">{status.muteCount}</p>
                <p className="mt-1 text-xs text-muted">累计有效禁言次数</p>
              </div>
            </div>
            <p className="text-[11px] text-muted/70">
              处罚阶梯：累计 3 次警告后再次违规将按 3/7/15 天阶梯禁言，禁言满 3 次永久封号。
            </p>
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-bold">
            <BellOff className="h-4 w-4 text-aurora" />
            系统通知
          </h3>
          {unreadCount > 0 ? <Badge tone="coral">{unreadCount} 条未读</Badge> : null}
        </div>
        {loading ? (
          <ul className="divide-y divide-white/8">
            {[0, 1, 2].map((index) => (
              <li key={index} className="h-16 animate-pulse bg-white/[0.02]" />
            ))}
          </ul>
        ) : failed ? (
          <EmptyState
            icon={BellOff}
            title="通知加载失败"
            description="服务暂时不可用，请稍后重试。"
            action={
              <button type="button" onClick={() => void loadNotifications()} className="text-sm text-amber hover:underline">
                重新加载
              </button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState icon={BellOff} title="暂无系统通知" description="处罚触发、撤销等系统消息会出现在这里。" />
        ) : (
          <ul className="divide-y divide-white/8">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => void markRead(item)}
                  disabled={Boolean(item.readAt) || markingId === item.id}
                  title={item.readAt ? undefined : '点击标记为已读'}
                  className={`flex w-full flex-col items-start gap-1.5 px-4 py-3.5 text-left transition-colors sm:px-5 ${
                    item.readAt ? '' : 'cursor-pointer hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex w-full flex-wrap items-center gap-2">
                    {!item.readAt ? <span className="h-2 w-2 shrink-0 rounded-full bg-amber" /> : null}
                    <span className="text-sm font-bold">{item.title}</span>
                    <Badge tone={TYPE_BADGE_TONE[item.type as PenaltyType] ?? 'neutral'}>
                      {NOTIFICATION_TYPE_LABELS[item.type as keyof typeof NOTIFICATION_TYPE_LABELS] ?? '系统通知'}
                    </Badge>
                    <span className="ml-auto font-mono text-[11px] text-muted/80">{formatDateTime(item.createdAt)}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-muted">{item.content}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {total > NOTIFICATION_PAGE_SIZE ? (
        <Pagination
          page={page}
          total={total}
          pageSize={NOTIFICATION_PAGE_SIZE}
          onChange={(next) => setPage(next)}
        />
      ) : null}
    </div>
  );
}
