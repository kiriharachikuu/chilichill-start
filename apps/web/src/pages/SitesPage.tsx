import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Globe2, RefreshCw } from 'lucide-react';
import type { SiteListResponse, TagFacet } from '@spaceport/shared';
import { api } from '../lib/api';
import { useDebouncedValue } from '../lib/hooks';
import { loadMeta, EMPTY_META } from '../lib/meta';
import { buttonClass } from '../components/Button';
import EmptyState from '../components/EmptyState';
import Pagination from '../components/Pagination';
import SearchInput from '../components/SearchInput';
import SectionHeading from '../components/SectionHeading';
import SiteCard from '../components/SiteCard';
import TagChip from '../components/TagChip';

const PAGE_SIZE = 12;

export default function SitesPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [data, setData] = useState<SiteListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [fallbackTags, setFallbackTags] = useState(EMPTY_META.tags.sites);

  const q = params.get('q') ?? '';
  const tag = params.get('tag') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);

  const update = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (debouncedSearch !== q) {
      update({ q: debouncedSearch || undefined, page: undefined });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    loadMeta().then((meta) => setFallbackTags(meta.tags.sites));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    api
      .get<SiteListResponse>('/api/sites', {
        q: q || undefined,
        tag: tag || undefined,
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
  }, [q, tag, page, reloadKey]);

  const tagFacets: TagFacet[] = useMemo(() => {
    if (data?.facets?.tags?.length) return data.facets.tags;
    return fallbackTags.map((item) => ({
      id: item.id,
      name: item.name,
      slug: item.slug,
      color: item.color,
      count: 0,
    }));
  }, [data, fallbackTags]);

  const total = data?.total ?? 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <SectionHeading
        eyebrow="Site Beacons"
        title="站点导航"
        description="粉丝自制的工具、小游戏与测试站。点击卡片会在新窗口打开，所有链接均已做安全跳转处理。"
        action={
          <Link to="/submit" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            投递新站点
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
        <span className="flex items-center gap-2 text-sm text-ink">
          <Globe2 className="h-4 w-4 text-mint" />
          共 <span className="font-semibold text-mint">{total}</span> 个站点
        </span>
        {(q || tag) && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setParams(new URLSearchParams(), { replace: true });
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-muted transition hover:border-coral/40 hover:text-coral"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 重置筛选
          </button>
        )}
        <div className="ml-auto w-full sm:w-72">
          <SearchInput value={search} onChange={setSearch} placeholder="搜索站点标题或简介…" />
        </div>
      </div>

      {tagFacets.length ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs text-muted">标签</span>
          {tagFacets.map((item) => {
            const tagValue = item.slug || item.id;
            return (
              <TagChip
                key={item.id}
                tag={item}
                count={item.count}
                selected={tag === tagValue}
                onClick={() => update({ tag: tag === tagValue ? undefined : tagValue, page: undefined })}
              />
            );
          })}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-64 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
          ))}
        </div>
      ) : failed ? (
        <EmptyState
          title="站点雷达暂时静默"
          description="没能读取站点列表，请确认后端舱段已启动，或稍后重试。"
          icon={RefreshCw}
          action={
            <button
              type="button"
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
              onClick={() => setReloadKey((key) => key + 1)}
            >
              <RefreshCw className="h-4 w-4" /> 重新扫描
            </button>
          }
        />
      ) : data && data.items.length ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((site) => (
              <SiteCard key={site.id} site={site} />
            ))}
          </div>
          <Pagination
            page={page}
            total={data.total}
            pageSize={PAGE_SIZE}
            onChange={(nextPage) => update({ page: nextPage > 1 ? String(nextPage) : undefined })}
          />
        </>
      ) : (
        <EmptyState
          title="还没有站点信标"
          description="换个标签或关键词试试，也欢迎投递你自己的作品。"
          icon={Globe2}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/submit" className={buttonClass({ variant: 'primary', size: 'sm' })}>
                投递站点
              </Link>
              {(q || tag) && (
                <button
                  type="button"
                  className={buttonClass({ variant: 'secondary', size: 'sm' })}
                  onClick={() => {
                    setSearch('');
                    setParams(new URLSearchParams(), { replace: true });
                  }}
                >
                  清除筛选
                </button>
              )}
            </div>
          }
        />
      )}
    </div>
  );
}
