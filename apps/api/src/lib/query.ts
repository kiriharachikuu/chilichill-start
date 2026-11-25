import { z } from 'zod';

function emptyToUndefined(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

export const optionalQueryString = z.preprocess(emptyToUndefined, z.string().optional());

export function optionalEnumQuery<U extends string, T extends readonly [U, ...U[]]>(values: T) {
  return z.preprocess(emptyToUndefined, z.enum(values).optional());
}

// 上限防止超大页码使 skip 溢出（Infinity / 超出 SQLite int64）导致 Prisma 500
export const pageQuery = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().min(1).max(1_000_000).default(1),
);

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
