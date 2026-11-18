import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, History } from 'lucide-react';
import Badge from './Badge';
import Modal from './Modal';
import { formatDate } from '../lib/format';
import {
  COMMITS_PAGE_URL,
  fetchChangelogPage,
  parseCommitType,
  readCachedChangelog,
  type ChangelogEntry,
} from '../lib/github';

const PREVIEW_COUNT = 3;

function GithubLink({ children }: { children: ReactNode }) {
  return (
    <a
      href={COMMITS_PAGE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="text-amber underline underline-offset-2"
    >
      {children}
    </a>
  );
}

/** 时间线条目（弹窗内使用，深色主题） */
function TimelineItem({ entry }: { entry: ChangelogEntry }) {
  const type = parseCommitType(entry.title);
  return (
    <li className="relative">
      <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-amber bg-space-900" />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-bold text-ink">{formatDate(entry.date)}</span>
        <Badge tone={type.tone}>{type.label}</Badge>
        <a
          href={entry.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto font-mono text-[11px] text-muted transition hover:text-amber"
          title="在 GitHub 查看该提交"
        >
          {entry.sha.slice(0, 7)}
        </a>
      </div>
      <p className="mt-1.5 text-sm font-medium leading-relaxed text-ink">{type.title}</p>
      {entry.body.length > 0 ? (
        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted">
          {entry.body.join('\n')}
        </p>
      ) : null}
    </li>
  );
}

/**
 * 关于页「更新日志」区块：
 * 白卡内默认展示最近 3 条提交，「查看更多」打开弹窗以时间线展示全部（可分页加载）。
 * 数据来自 GitHub 提交历史，首页结果有 1 小时缓存以节省 API 配额。
 */
export default function ChangelogSection() {
  // 区块预览：优先读缓存（1 小时内有效），无缓存时自动拉取第一页
  const [preview, setPreview] = useState<ChangelogEntry[]>(() => readCachedChangelog() ?? []);
  const [previewStatus, setPreviewStatus] = useState<'loading' | 'ready' | 'error'>(() =>
    readCachedChangelog() ? 'ready' : 'loading',
  );

  const [modalOpen, setModalOpen] = useState(false);
  // 弹窗时间线：先立即用预览数据渲染，再静默刷新第一页；「加载更多」按页追加
  const [timeline, setTimeline] = useState<ChangelogEntry[]>([]);
  const [timelinePage, setTimelinePage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [timelineStatus, setTimelineStatus] = useState<
    'idle' | 'loading' | 'loadingMore' | 'ready' | 'error'
  >('idle');

  useEffect(() => {
    if (previewStatus !== 'loading') return;
    let cancelled = false;
    fetchChangelogPage(1)
      .then((result) => {
        if (cancelled) return;
        setPreview(result.entries);
        setPreviewStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setPreviewStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [previewStatus]);

  const openModal = () => {
    setModalOpen(true);
    if (timelineStatus === 'idle' || timelineStatus === 'error') {
      setTimeline(preview);
      setTimelinePage(1);
      setTimelineStatus('loading');
      fetchChangelogPage(1)
        .then((result) => {
          setTimeline(result.entries);
          setTimelinePage(1);
          setHasMore(result.hasMore);
          setTimelineStatus('ready');
          setPreview(result.entries);
          setPreviewStatus('ready');
        })
        .catch(() => {
          // 已有预览数据则继续展示旧数据，否则在弹窗内报错
          setHasMore(false);
          setTimelineStatus(preview.length > 0 ? 'ready' : 'error');
        });
    }
  };

  const loadMore = () => {
    if (timelineStatus !== 'ready' || !hasMore) return;
    const next = timelinePage + 1;
    setTimelineStatus('loadingMore');
    fetchChangelogPage(next)
      .then((result) => {
        setTimeline((prev) => {
          // 翻页间隙若有新提交导致跨页重复，按 sha 去重
          const known = new Set(prev.map((entry) => entry.sha));
          return [...prev, ...result.entries.filter((entry) => !known.has(entry.sha))];
        });
        setTimelinePage(next);
        setHasMore(result.hasMore);
        setTimelineStatus('ready');
      })
      .catch(() => setTimelineStatus('error'));
  };

  const previewEntries = preview.slice(0, PREVIEW_COUNT);

  return (
    <section className="border border-space-200 bg-white px-5 py-5">
      <h2 className="flex items-center gap-2 text-base font-black text-ink">
        <History className="h-4 w-4 text-amber" />
        更新日志
      </h2>

      <div className="mt-3 text-sm leading-relaxed text-muted">
        {previewStatus === 'error' && previewEntries.length === 0 ? (
          <p>
            暂时无法获取更新记录（可能是 GitHub 接口限流），可
            <GithubLink>前往 GitHub 查看提交历史</GithubLink>
            。
          </p>
        ) : previewEntries.length === 0 ? (
          <p className="text-xs">正在从 GitHub 获取更新记录…</p>
        ) : (
          <ul className="space-y-2.5">
            {previewEntries.map((entry) => {
              const type = parseCommitType(entry.title);
              return (
                <li key={entry.sha} className="flex items-center gap-2">
                  <span className="shrink-0 text-xs text-muted">{formatDate(entry.date)}</span>
                  <Badge tone={type.tone} className="shrink-0">
                    {type.label}
                  </Badge>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink" title={entry.title}>
                    {type.title}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={openModal}
          className="mt-3 inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-amber underline-offset-2 hover:underline"
        >
          查看更多
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        eyebrow="Changelog"
        title="更新日志"
        description="站点近期的提交记录，来自 GitHub，最新在前"
        size="lg"
      >
        {timelineStatus === 'error' && timeline.length === 0 ? (
          <p className="text-sm text-muted">
            暂时无法获取更新记录，可
            <GithubLink>前往 GitHub 查看提交历史</GithubLink>
            ，或稍后重试。
          </p>
        ) : timeline.length === 0 ? (
          <p className="text-sm text-muted">正在从 GitHub 获取更新记录…</p>
        ) : (
          <>
            <ol className="relative space-y-6 border-l border-white/10 pl-5">
              {timeline.map((entry) => (
                <TimelineItem key={entry.sha} entry={entry} />
              ))}
            </ol>
            {timelineStatus === 'error' ? (
              <p className="mt-4 text-xs text-muted">
                加载失败，请
                <button
                  type="button"
                  onClick={loadMore}
                  className="mx-1 text-amber underline underline-offset-2"
                >
                  重试
                </button>
                或稍后再来。
              </p>
            ) : hasMore ? (
              <button
                type="button"
                onClick={loadMore}
                disabled={timelineStatus === 'loadingMore'}
                className="mt-6 w-full cursor-pointer rounded-xl border border-white/10 bg-white/[0.05] py-2.5 text-xs font-bold text-muted transition hover:border-amber/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {timelineStatus === 'loadingMore' ? '正在加载…' : '加载更早的提交'}
              </button>
            ) : (
              <p className="mt-6 flex items-center justify-center gap-1 text-xs text-muted">
                <ChevronUp className="h-3.5 w-3.5" />
                已经到底啦 · 共 {timeline.length} 条提交
              </p>
            )}
          </>
        )}
      </Modal>
    </section>
  );
}
