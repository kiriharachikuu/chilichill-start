import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, CalendarDays } from 'lucide-react';
import {
  ACTIVITY_STATUS_LABELS,
  activityStatusOf,
  type Activity,
} from '@spaceport/shared';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { buttonClass } from '../components/Button';
import EmptyState from '../components/EmptyState';

const STATUS_CLASSES = {
  ONGOING: 'border-amber bg-amber text-white',
  UPCOMING: 'border-ink bg-white text-ink',
  ENDED: 'border-space-200 bg-space-50 text-muted',
} as const;

export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setFailed(false);
    api
      .get<Activity>(`/api/activities/${id}`)
      .then((result) => {
        if (alive) setActivity(result);
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-10 sm:px-6 lg:py-14">
        <div className="h-4 w-24 animate-pulse bg-space-100" />
        <div className="h-8 w-2/3 animate-pulse bg-space-100" />
        <div className="aspect-[21/9] w-full animate-pulse bg-space-100" />
      </div>
    );
  }

  if (failed || !activity) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
        <EmptyState
          title="没有找到这场活动"
          description="活动可能已下架，或地址不够准确。"
          action={
            <Link to="/" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
              返回首页
            </Link>
          }
        />
      </div>
    );
  }

  const status = activityStatusOf(activity);
  const customHtml = activity.contentHtml?.trim() ? activity.contentHtml : null;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:py-14">
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-1.5 text-xs font-bold text-muted transition-colors hover:text-amber"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> 返回首页
      </Link>

      {customHtml ? (
        // 站长上传的自定义活动页：sandbox 隔离渲染（无 allow-same-origin，无法触碰主站 DOM/Cookie）
        <iframe
          sandbox="allow-scripts allow-popups allow-forms"
          srcDoc={customHtml}
          title={activity.title}
          className="h-[calc(100svh-9rem)] min-h-[480px] w-full border border-ink bg-white"
        />
      ) : (
        <article className="border border-ink bg-white">
          <div className="relative border-b border-space-200 bg-space-50">
            {activity.coverUrl ? (
              <img
                src={activity.coverUrl}
                alt={activity.title}
                className="max-h-[460px] min-h-56 w-full object-cover"
              />
            ) : null}
            {status ? (
              <span
                className={`absolute left-4 top-4 inline-flex items-center gap-1.5 border px-2.5 py-1 text-[11px] font-bold ${STATUS_CLASSES[status]}`}
              >
                {ACTIVITY_STATUS_LABELS[status]}
              </span>
            ) : null}
          </div>
          <div className="space-y-5 p-6 sm:p-8">
            <div>
              <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-amber">
                Activity Archive
              </p>
              <h1 className="text-2xl font-black tracking-[-0.02em] text-ink sm:text-3xl">
                {activity.title}
              </h1>
              {activity.startDate ? (
                <p className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs font-bold text-muted">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatDateTime(activity.startDate)}
                  {activity.endDate ? ` — ${formatDateTime(activity.endDate)}` : ''}
                </p>
              ) : null}
            </div>

            {activity.description ? (
              <p className="max-w-2xl text-sm leading-relaxed text-muted">{activity.description}</p>
            ) : null}

            {activity.linkUrl ? (
              <a
                href={activity.linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass({ variant: 'primary', size: 'md' })}
              >
                前往活动页 <ArrowUpRight className="h-4 w-4" />
              </a>
            ) : null}
          </div>
        </article>
      )}
    </div>
  );
}
