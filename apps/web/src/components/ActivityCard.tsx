import { ArrowUpRight, CalendarDays } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  ACTIVITY_STATUS_LABELS,
  activityStatusOf,
  type ActivityListResponse,
  type ActivityStatus,
} from '@spaceport/shared';
import { formatDateTime } from '../lib/format';

type ActivityListItem = ActivityListResponse['items'][number];

interface ActivityCardProps {
  activity: ActivityListItem;
}

// 状态徽标：进行中用主色蓝底白字，未开始描边，已结束置灰
const STATUS_CLASSES: Record<ActivityStatus, string> = {
  ONGOING: 'border-amber bg-amber text-white',
  UPCOMING: 'border-ink bg-white text-ink',
  ENDED: 'border-space-200 bg-space-50 text-muted',
};

export default function ActivityCard({ activity }: ActivityCardProps) {
  const status = activityStatusOf(activity);
  const external = Boolean(activity.linkUrl);

  const body = (
    <>
      <div className="relative overflow-hidden border-b border-space-200 bg-space-50">
        {activity.coverUrl ? (
          <img
            src={activity.coverUrl}
            alt={activity.title}
            loading="lazy"
            className="aspect-[16/9] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[16/9] w-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.3em] text-muted">
            No Cover
          </div>
        )}
        {status ? (
          <span
            className={`absolute left-3 top-3 inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] font-bold ${STATUS_CLASSES[status]}`}
          >
            {ACTIVITY_STATUS_LABELS[status]}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[15px] font-extrabold leading-snug text-ink">{activity.title}</h3>
          {external ? (
            <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-amber" />
          ) : null}
        </div>
        {activity.description ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted">{activity.description}</p>
        ) : null}
        {activity.startDate ? (
          <p className="mt-auto inline-flex items-center gap-1.5 pt-1.5 font-mono text-[11px] font-bold text-muted">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatDateTime(activity.startDate)} 起
          </p>
        ) : null}
      </div>
    </>
  );

  const cardClass =
    'group flex h-full flex-col border border-space-200 bg-white transition-colors hover:border-amber';

  // 外链活动直达目标页；其余进站内详情页（自定义 HTML 或固定模板）
  if (external) {
    return (
      <a
        href={activity.linkUrl ?? ''}
        target="_blank"
        rel="noopener noreferrer"
        className={cardClass}
      >
        {body}
      </a>
    );
  }

  return (
    <Link to={`/activities/${activity.id}`} className={cardClass}>
      {body}
    </Link>
  );
}
