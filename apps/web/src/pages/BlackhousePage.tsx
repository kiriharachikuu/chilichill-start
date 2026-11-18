import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gavel, RefreshCw, ShieldBan } from 'lucide-react';
import { PENALTY_TYPES, PENALTY_TYPE_LABELS, type PublicPenaltyListResponse, type PenaltyType } from '@spaceport/shared';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import Badge, { type BadgeTone } from '../components/Badge';
import EmptyState from '../components/EmptyState';
import Pagination from '../components/Pagination';
import SectionHeading from '../components/SectionHeading';

const PAGE_SIZE = 20;

const TYPE_TABS: Array<{ value: PenaltyType | ''; label: string }> = [
  { value: '', label: '全部' },
  ...PENALTY_TYPES.map((type) => ({ value: type, label: PENALTY_TYPE_LABELS[type] })),
];

const TYPE_BADGE_TONE: Record<PenaltyType, BadgeTone> = {
  WARNING: 'amber',
  MUTE: 'coral',
  BAN: 'violet',
};

/** 处罚时长展示：禁言显示具体天数，警告无限制，封号永久 */
function durationLabel(type: PenaltyType, durationDays: number | null): string {
  if (type === 'MUTE' && durationDays) return `${durationDays} 天`;
  if (type === 'WARNING') return '无功能限制';
  return '永久';
}

function penaltyEndLabel(type: PenaltyType, endsAt: string | null): string {
  if (type === 'BAN') return '永久';
  return endsAt ? formatDateTime(endsAt) : '—';
}

export default function BlackhousePage() {
  const [type, setType] = useState<PenaltyType | ''>('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PublicPenaltyListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    api
      .get<PublicPenaltyListResponse>('/api/penalties', {
        type: type || undefined,
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
  }, [type, page, reloadKey]);

  const total = data?.total ?? 0;
  const items = data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <SectionHeading
        eyebrow="Penalty Records"
        title="小黑屋"
        description="社区处罚公示：被举报内容经站方核实无误后，将按阶梯规则自动触发处罚（累计 3 次警告后按 3/7/15 天禁言，禁言满 3 次永久封号）。本页按处罚时间倒序公示全部已生效记录。"
        action={
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-amber"
          >
            <RefreshCw className="h-4 w-4" />
            刷新
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => {
              setType(tab.value);
              setPage(1);
            }}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${
              type === tab.value
                ? 'border-ink bg-ink text-white'
                : 'border-white/10 bg-white/[0.03] text-muted hover:border-amber hover:text-amber'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="h-24 animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]" />
          ))}
        </div>
      ) : failed ? (
        <EmptyState
          icon={ShieldBan}
          title="公示记录加载失败"
          description="网络异常或服务暂时不可用，请稍后重试。"
          action={
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="text-sm text-amber hover:underline"
            >
              重新加载
            </button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title="暂无处罚记录"
          description="社区风清气正，还没有任何处罚公示记录。"
        />
      ) : (
        <ul className="grid gap-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/20 sm:p-5"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Badge tone={TYPE_BADGE_TONE[item.type]}>
                  {item.type === 'BAN' ? <ShieldBan className="h-3.5 w-3.5" /> : null}
                  {PENALTY_TYPE_LABELS[item.type]}
                </Badge>
                <span className="text-sm font-bold">用户 #{item.userUid ?? '—'}</span>
                <span className="font-mono text-xs text-muted">处罚时长：{durationLabel(item.type, item.durationDays)}</span>
              </div>
              <p className="mt-2.5 text-sm text-muted">
                违规事由：
                <span className="text-ink/90">{item.reason}</span>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted/80">
                <span>生效：{formatDateTime(item.startedAt)}</span>
                <span>结束：{penaltyEndLabel(item.type, item.endsAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {total > PAGE_SIZE ? (
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onChange={(next) => setPage(next)} />
      ) : null}

      <p className="text-xs text-muted/70">
        被处罚用户如对处罚有异议，可通过申诉邮箱联系站方复核；误处罚经管理员核实后将被撤销并恢复相应权限。
        了解违规处理规则请查看
        <Link to="/terms" className="ml-1 text-amber hover:underline">
          用户协议
        </Link>
        。
      </p>
    </div>
  );
}
