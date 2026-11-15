import { z } from 'zod';

function emptyToUndefined(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

export const optionalQueryString = z.preprocess(emptyToUndefined, z.string().optional());

export function optionalEnumQuery<U extends string, T extends readonly [U, ...U[]]>(values: T) {
  return z.preprocess(emptyToUndefined, z.enum(values).optional());
}

export const pageQuery = z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1));

export function pageSizeQuery(defaultValue: number, maxPageSize: number) {
  return z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(maxPageSize).default(defaultValue),
  );
}

export function pageParams(
  page: unknown,
  pageSize: unknown,
  defaults: { pageSize: number; maxPageSize: number },
) {
  const parsedPage = Number(page);
  const parsedSize = Number(pageSize);

  const safePage = Number.isFinite(parsedPage) && parsedPage >= 1 ? Math.floor(parsedPage) : 1;
  const safeSize = Number.isFinite(parsedSize) && parsedSize >= 1
    ? Math.min(Math.floor(parsedSize), defaults.maxPageSize)
    : defaults.pageSize;

  return { page: safePage, pageSize: safeSize, skip: (safePage - 1) * safeSize, take: safeSize };
}
