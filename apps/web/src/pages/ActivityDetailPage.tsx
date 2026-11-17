import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
  // 内嵌自定义 HTML 页的动态高度：由 iframe 内注入脚本 postMessage 上报，用于撑开 iframe、消除内部滚动条
  const [frameHeight, setFrameHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setFailed(false);
    setFrameHeight(null);
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

  // 接收内嵌页上报的内容高度（sandbox 下无法直接读取 iframe 内部 DOM）
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; height?: number } | null;
      if (data?.type === 'activity-frame-height' && typeof data.height === 'number') {
        setFrameHeight(Math.min(Math.ceil(data.height), 30000));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

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
            <Link to="/activities" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
              返回
            </Link>
          }
        />
      </div>
    );
  }

  const status = activityStatusOf(activity);
  const customHtml = activity.contentHtml?.trim() ? activity.contentHtml : null;

  if (customHtml) {
    // 注入样式与脚本：隐藏 iframe 内部滚动条，并把内容实际高度上报给外层，
    // 外层将 iframe 撑到与内容同高，整页只由站点自带的滚动条滚动（避免出现双滚动条）
    const frameSrcDoc = `${customHtml}
<style>html{scrollbar-width:none}html::-webkit-scrollbar,body::-webkit-scrollbar{display:none}</style>
<script>(function(){var post=function(){var h=Math.ceil(Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0));if(h>0){parent.postMessage({type:'activity-frame-height',height:h},'*')}};if('ResizeObserver' in window){try{new ResizeObserver(post).observe(document.documentElement)}catch(e){}}document.addEventListener('DOMContentLoaded',post);window.addEventListener('load',post);window.addEventListener('resize',post);post();setTimeout(post,300);setTimeout(post,1000)})();</script>`;
    // 站长上传的自定义活动页：iframe 高度跟随内容自动撑开，页面统一由站点滚动条滚动
    // sandbox 隔离渲染（无 allow-same-origin，无法触碰主站 DOM/Cookie）
    return (
      <div className="relative w-full">
        <iframe
          sandbox="allow-scripts allow-popups allow-forms"
          srcDoc={frameSrcDoc}
          title={activity.title}
          style={frameHeight ? { height: frameHeight } : undefined}
          className="h-[calc(100svh-3.5rem)] w-full bg-white lg:h-screen"
        />
        {/* portal 挂到 body：<main> 的入场动画会保留 transform，导致 fixed 以 main 为定位基准 */}
        {createPortal(
          <Link
            to="/activities"
            className="fixed left-3 top-16 z-40 inline-flex items-center gap-1.5 border border-ink bg-white/95 px-3 py-1.5 text-xs font-bold text-ink shadow-sm backdrop-blur transition-colors hover:bg-amber-50 lg:left-[15.125rem] lg:top-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> 返回活动页
          </Link>,
          document.body,
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-10 pt-28 sm:px-6 lg:pb-14 lg:pt-14">
      {/* portal 挂到 body：脱离带 transform 的 <main>，保证 fixed 相对视口定位 */}
      {createPortal(
        <Link
          to="/activities"
          className="fixed left-3 top-16 z-40 inline-flex items-center gap-1.5 border border-ink bg-white/95 px-3 py-1.5 text-xs font-bold text-ink shadow-sm backdrop-blur transition-colors hover:bg-amber-50 lg:left-[15.125rem] lg:top-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 返回活动页
        </Link>,
        document.body,
      )}

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
    </div>
  );
}
