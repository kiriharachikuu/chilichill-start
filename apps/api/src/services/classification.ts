import type { Prisma, PrismaClient } from '../generated/prisma/client';
import type { Tag } from '@spaceport/shared';
import { REGION_NAME, provinceRegionCode } from '@spaceport/shared';
import { HttpError } from '../lib/errors';
import { toTag } from '../lib/serialize';
import { prisma } from '../prisma';

type DbClient = PrismaClient | Prisma.TransactionClient;

export const OTHER_REGION = { regionCode: 'OTHER', regionName: '待定' } as const;

export async function resolveRegion(
  province: string | null | undefined,
  city: string | null | undefined,
  client: DbClient = prisma,
): Promise<{ regionCode: string; regionName: string }> {
  // 省份优先：选择器按省级行政区自动归属大区。
  const provinceCode = provinceRegionCode(province);
  if (provinceCode) {
    return { regionCode: provinceCode, regionName: REGION_NAME[provinceCode] };
  }

  // 回退：存量数据的城市 → 大区规则表。
  const normalized = (city ?? '').trim().toLowerCase();
  if (!normalized) {
    return { ...OTHER_REGION };
  }

  const rules = await client.cityRegionRule.findMany();
  const hit = rules.find((rule) => rule.city.trim().toLowerCase() === normalized);

  if (!hit) {
    return { ...OTHER_REGION };
  }

  return { regionCode: hit.regionCode, regionName: hit.regionName };
}

export async function suggestTags(
  text: string,
  scope: 'GROUP' | 'SITE' = 'GROUP',
  client: DbClient = prisma,
): Promise<Tag[]> {
  const needle = text.trim().toLowerCase();
  if (!needle) {
    return [];
  }

  const allowedScopes = scope === 'SITE' ? ['SITE', 'BOTH'] : ['GROUP', 'BOTH'];
  const rules = await client.autoTagRule.findMany({
    include: { tag: true },
    orderBy: [{ priority: 'desc' }],
  });

  const seen = new Set<string>();
  const tags: Tag[] = [];

  for (const rule of rules) {
    const keyword = rule.keyword.trim().toLowerCase();
    if (!keyword || !allowedScopes.includes(rule.tag.scope)) {
      continue;
    }
    if (!needle.includes(keyword) || seen.has(rule.tag.id)) {
      continue;
    }

    seen.add(rule.tag.id);
    tags.push(toTag(rule.tag));

    if (tags.length >= 5) {
      break;
    }
  }

  return tags;
}

export async function assertTagsValid(
  tagIds: string[],
  scope: 'GROUP' | 'SITE',
  client: DbClient = prisma,
): Promise<void> {
  const uniqueIds = [...new Set(tagIds.filter((id) => id.trim().length > 0))];
  if (uniqueIds.length === 0) {
    // 传入了标签但全为空白：不能静默放行，否则未过滤的 ID 写入时会触发外键错误
    if (tagIds.length > 0) {
      throw new HttpError(400, 'INVALID_TAGS', '存在无效标签');
    }
    return;
  }

  const allowedScopes = scope === 'SITE' ? ['SITE', 'BOTH'] : ['GROUP', 'BOTH'];
  const tags = await client.tag.findMany({ where: { id: { in: uniqueIds } } });

  const invalid = tags.length !== uniqueIds.length || tags.some((tag) => !allowedScopes.includes(tag.scope));
  if (invalid) {
    throw new HttpError(400, 'INVALID_TAGS', '存在无效标签');
  }
}
