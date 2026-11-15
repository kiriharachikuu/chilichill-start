import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Filter, RefreshCw, UsersRound } from 'lucide-react';
import {
  GROUP_TYPES,
  GROUP_TYPE_LABELS,
  type GroupListResponse,
  type GroupType,
  type TagFacet,
} from '@spaceport/shared';
import { api } from '../lib/api';
import { useDebouncedValue } from '../lib/hooks';
import { loadMeta, EMPTY_META } from '../lib/meta';
import { buttonClass } from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import GroupCard from '../components/GroupCard';
import Pagination from '../components/Pagination';
import SearchInput from '../components/SearchInput';
import SectionHeading from '../components/SectionHeading';
import TagChip from '../components/TagChip';

const PAGE_SIZE = 12;
const TYPE_OPTIONS: { key: GroupType; label: string }[] = GROUP_TYPES.map((key) => ({
  key,
  label: GROUP_TYPE_LABELS[key],
}));

export default function GroupsPage() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [data, setData] = useState<GroupListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [regionHints, setRegionHints] = useState(EMPTY_META.regions);

  const q = params.get('q') ?? '';
  const region = params.get('region') ?? '';
  // 旧链接兜底：?type=ONLINE 已并入「综合粉丝群」
  const type = params.get('type') === 'ONLINE' ? 'GENERAL' : params.get('type') ?? '';
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
    loadMeta().then((meta) => setRegionHints(meta.regions));
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    api
      .get<GroupListResponse>('/api/groups', {
        q: q || undefined,
        region: region || undefined,
        type: type || undefined,
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
  }, [q, region, type, tag, page, reloadKey]);

  const typeFacets = useMemo(
    () =>
      data?.facets?.types?.length
        ? data.facets.types
        : TYPE_OPTIONS.map((item) => ({ ...item, count: 0 })),
    [data],
  );
  const regionFacets = data?.facets?.regions?.length
    ? data.facets.regions
    : regionHints.map((item) => ({ code: item.code, name: item.name, count: 0 }));
  const tagFacets: TagFacet[] = data?.facets?.tags ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <SectionHeading
        eyebrow="Group Docks"
        title="群舱导航"
        description="综合群按功能标签归类，地区群按城市归属大区，院校群按学校收录。"
        action={
          <Link to="/submit" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            投递新群舱
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/8 bg-white/[0.03] px-5 py-4">
        <span className="flex items-center gap-2 text-sm text-ink">
          <UsersRound className="h-4 w-4 text-amber" />
          共 <span className="font-semibold text-amber">{total}</span> 个群舱
        </span>
        {(q || region || type || tag) && (
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
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="搜索群名、简介或城市…"
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 flex items-center gap-1.5 text-xs text-muted">
            <Filter className="h-3.5 w-3.5" /> 群类型
          </span>
          <button
            type="button"
            onClick={() => update({ type: undefined, page: undefined })}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              !type
                ? 'border-amber/50 bg-amber/15 text-amber'
                : 'border-white/10 bg-white/[0.03] text-muted hover:border-amber/40 hover:text-ink'
            }`}
          >
            全部
          </button>
          {typeFacets.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => update({ type: type === item.key ? undefined : item.key, page: undefined })}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                type === item.key
                  ? 'border-amber/50 bg-amber/15 text-amber'
                  : 'border-white/10 bg-white/[0.03] text-muted hover:border-amber/40 hover:text-ink'
              }`}
            >
              {item.label}
              {item.count ? <span className="ml-1 text-muted/80">{item.count}</span> : null}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs text-muted">大区</span>
          <button
            type="button"
            onClick={() => update({ region: undefined, page: undefined })}
            className={`rounded-full border px-3 py-1 text-xs transition ${
              !region
                ? 'border-aurora/50 bg-aurora/15 text-aurora'
                : 'border-white/10 bg-white/[0.03] text-muted hover:border-aurora/40 hover:text-ink'
            }`}
          >
            全部大区
          </button>
          {regionFacets.map((item) => (
            <button
              key={item.code}
              type="button"
              onClick={() =>
                update({ region: region === item.code ? undefined : item.code, page: undefined })
              }
              className={`rounded-full border px-3 py-1 text-xs transition ${
                region === item.code
                  ? 'border-aurora/50 bg-aurora/15 text-aurora'
                  : 'border-white/10 bg-white/[0.03] text-muted hover:border-aurora/40 hover:text-ink'
              }`}
            >
              {item.name}
              {item.count ? <span className="ml-1 text-muted/80">{item.count}</span> : null}
            </button>
          ))}
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
                  onClick={() =>
                    update({ tag: tag === tagValue ? undefined : tagValue, page: undefined })
                  }
                />
              );
            })}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-60 animate-pulse rounded-2xl border border-white/8 bg-white/[0.03]" />
          ))}
        </div>
      ) : failed ? (
        <EmptyState
          title="轨道信号暂时中断"
          description="群舱列表没能成功读取。请确认后端舱段已启动，或稍后重试。"
          icon={RefreshCw}
          action={
            <button
              type="button"
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
              onClick={() => setReloadKey((key) => key + 1)}
            >
              <RefreshCw className="h-4 w-4" /> 重新接收信号
            </button>
          }
        />
      ) : data && data.items.length ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((group) => (
              <GroupCard key={group.id} group={group} />
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
          title="这个轨道上还没有群舱"
          description="换个筛选条件试试，或者成为第一个投递信号的人。"
          icon={UsersRound}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/submit" className={buttonClass({ variant: 'primary', size: 'sm' })}>
                投递群舱
              </Link>
              {(q || region || type || tag) && (
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
