import { REGIONS, type MetaResponse } from '@spaceport/shared';
import { api } from './api';

export const EMPTY_META: MetaResponse = {
  regions: REGIONS.map((region) => ({ code: region.code, name: region.name, cityCount: 0 })),
  cities: [],
  tags: { group: [], sites: [] },
  stats: { groups: 0, sites: 0, galleryImages: 0, pendingSubmissions: 0 },
  modules: [],
  registration: { emailCodeRequired: true },
};

function normalizeMeta(data: Partial<MetaResponse> | null | undefined): MetaResponse {
  if (!data) return EMPTY_META;
  return {
    regions: data.regions?.length ? data.regions : EMPTY_META.regions,
    cities: data.cities ?? [],
    tags: {
      group: data.tags?.group ?? [],
      sites: data.tags?.sites ?? [],
    },
    stats: { ...EMPTY_META.stats, ...data.stats },
    modules: data.modules ?? [],
    registration: data.registration ?? EMPTY_META.registration,
  };
}

let cache: MetaResponse | null = null;
let inflight: Promise<MetaResponse> | null = null;

export async function loadMeta(): Promise<MetaResponse> {
  if (cache) return cache;
  if (!inflight) {
    inflight = api
      .get<MetaResponse>('/api/meta')
      .then((data) => {
        cache = normalizeMeta(data);
        return cache;
      })
      .catch(() => EMPTY_META)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function readCachedMeta(): MetaResponse | null {
  return cache;
}

export function clearMetaCache(): void {
  cache = null;
  inflight = null;
}
