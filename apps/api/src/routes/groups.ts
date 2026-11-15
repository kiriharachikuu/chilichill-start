import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../generated/prisma/client';
import { GROUP_TYPE_LABELS, GROUP_TYPES, REGIONS, REGION_CODES, type GroupType, type GroupListResponse } from '@spaceport/shared';
import { z } from 'zod';
import { HttpError } from '../lib/errors';
import { optionalEnumQuery, optionalQueryString, pageParams, pageQuery, pageSizeQuery } from '../lib/query';
import { buildTagFacets, serializeGroup } from '../lib/serialize';
import { prisma } from '../prisma';

const groupQuerySchema = z.object({
  q: optionalQueryString,
  region: optionalEnumQuery(REGION_CODES),
  type: optionalEnumQuery(GROUP_TYPES),
  tag: optionalQueryString,
  page: pageQuery,
  pageSize: pageSizeQuery(12, 24),
});

const groupInclude = {
  tags: { include: { tag: true } },
  uploader: { select: { uid: true, nickname: true, avatarUrl: true } },
} as const;

interface GroupFilters {
  q?: string;
  region?: string;
  type?: GroupType;
  tag?: string;
}

function buildWhere(filters: GroupFilters): Prisma.GroupWhereInput {
  const where: Prisma.GroupWhereInput = { published: true };

  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q } },
      { groupNumber: { contains: filters.q } },
      { description: { contains: filters.q } },
    ];
  }
  if (filters.region) {
    where.regionCode = filters.region;
  }
  if (filters.type) {
    where.type = filters.type;
  }
  if (filters.tag) {
    where.tags = { some: { tag: { OR: [{ id: filters.tag }, { slug: filters.tag }] } } };
  }

  return where;
}

export function publicGroupsRoutes(app: FastifyInstance) {
  app.get('/api/groups', async (request) => {
    const query = groupQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 12,
      maxPageSize: 24,
    });

    const mainWhere = buildWhere(query);
    const regionsWhere = buildWhere({ q: query.q, type: query.type, tag: query.tag });
    const typesWhere = buildWhere({ q: query.q, region: query.region, tag: query.tag });
    const tagsWhere = buildWhere({ q: query.q, region: query.region, type: query.type });

    const [total, groups, regionCounts, typeCounts, tagCounts] = await Promise.all([
      prisma.group.count({ where: mainWhere }),
      prisma.group.findMany({
        where: mainWhere,
        include: groupInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.group.groupBy({
        by: ['regionCode'],
        where: regionsWhere,
        _count: { _all: true },
      }),
      prisma.group.groupBy({
        by: ['type'],
        where: typesWhere,
        _count: { _all: true },
      }),
      prisma.groupTag.groupBy({
        by: ['tagId'],
        where: {
          group: tagsWhere,
          tag: { scope: { in: ['GROUP', 'BOTH'] } },
        },
        _count: { _all: true },
      }),
    ]);

    const regionMap = new Map(regionCounts.map((item) => [item.regionCode, item._count._all]));
    const typeMap = new Map(typeCounts.map((item) => [item.type, item._count._all]));

    const tagFacets = await buildTagFacets(prisma, tagCounts);

    const response: GroupListResponse = {
      items: groups.map(serializeGroup),
      total,
      page,
      pageSize,
      facets: {
        regions: REGIONS.filter((region) => (regionMap.get(region.code) ?? 0) > 0).map((region) => ({
          code: region.code,
          name: region.name,
          count: regionMap.get(region.code) ?? 0,
        })),
        types: GROUP_TYPES.map((type) => ({
          key: type,
          label: GROUP_TYPE_LABELS[type],
          count: typeMap.get(type) ?? 0,
        })),
        tags: tagFacets,
      },
    };

    return response;
  });

  app.get<{ Params: { id: string } }>('/api/groups/:id', async (request) => {
    const group = await prisma.group.findFirst({
      where: { id: request.params.id, published: true },
      include: { ...groupInclude, uploader: { select: { uid: true, nickname: true, avatarUrl: true } } },
    });

    if (!group) {
      throw new HttpError(404, 'NOT_FOUND', '群组不存在');
    }

    return serializeGroup(group);
  });
}
