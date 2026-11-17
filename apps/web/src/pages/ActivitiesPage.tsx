import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import type { ActivityListResponse } from '@spaceport/shared';
import { api } from '../lib/api';
import { buttonClass } from '../components/Button';
import ActivityCard from '../components/ActivityCard';
import EmptyState from '../components/EmptyState';
import Pagination from '../components/Pagination';
import SectionHeading from '../components/SectionHeading';

const PAGE_SIZE = 24;

export default function ActivitiesPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const [data, setData] = useState<ActivityListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    api
      .get<ActivityListResponse>('/api/activities', { page, pageSize: PAGE_SIZE })
      .then((result) => {
        if (alive) setData(result);
      })
      .catch(() => {
        if (!alive) return;
        setData(null);
        setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [page, reloadKey]);

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <SectionHeading
        eyebrow="Blackboard"
        title="活动档案"
        description="生日会、周年庆与纪念企划的存档，点开卡片重温当时的信号。"
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border border-space-200 bg-white px-5 py-4">
        <span className="text-sm text-muted">
          共 <span className="font-bold text-ink">{total}</span> 场活动
        </span>
        <button
          type="button"
          onClick={() => setReloadKey((key) => key + 1)}
          className={buttonClass({ variant: 'ghost', size: 'sm' })}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="aspect-video animate-pulse border border-space-200 bg-space-100" />
          ))}
        </div>
      ) : failed ? (
        <EmptyState
          title="活动档案暂时失联"
          description="信号接收出现异常，请稍后重试。"
          icon={RefreshCw}
          action={
            <button type="button" onClick={() => setReloadKey((key) => key + 1)} className={buttonClass({})}>
              <RefreshCw className="h-4 w-4" /> 重新加载
            </button>
          }
        />
      ) : items.length ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((activity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))}
          </div>
          <Pagination
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
            onChange={(nextPage) => update({ page: nextPage > 1 ? String(nextPage) : undefined })}
          />
        </>
      ) : (
        <EmptyState
          title="活动档案暂时空白"
          description="还没有已上架的活动，运营团队上架后会第一时间出现在这里。"
        />
      )}
    </div>
  );
}
