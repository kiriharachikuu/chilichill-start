import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../generated/prisma/client';
import type { SiteListResponse } from '@spaceport/shared';
import { z } from 'zod';
import { HttpError } from '../lib/errors';
import { optionalQueryString, pageParams, pageQuery, pageSizeQuery } from '../lib/query';
import { buildTagFacets, serializeSite } from '../lib/serialize';
import { prisma } from '../prisma';

const siteQuerySchema = z.object({
  q: optionalQueryString,
  tag: optionalQueryString,
  page: pageQuery,
  pageSize: pageSizeQuery(12, 24),
});

const siteInclude = { tags: { include: { tag: true } } } as const;

interface SiteFilters {
  q?: string;
  tag?: string;
}

function buildWhere(filters: SiteFilters): Prisma.SiteWhereInput {
  const where: Prisma.SiteWhereInput = { published: true };

  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q } },
      { description: { contains: filters.q } },
      { url: { contains: filters.q } },
    ];
  }
  if (filters.tag) {
    where.tags = { some: { tag: { OR: [{ id: filters.tag }, { slug: filters.tag }] } } };
  }

  return where;
}

export function publicSitesRoutes(app: FastifyInstance) {
  app.get('/api/sites', async (request) => {
    const query = siteQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 12,
      maxPageSize: 24,
    });

    const mainWhere = buildWhere(query);
    const tagsWhere = buildWhere({ q: query.q });

    const [total, sites, tagCounts] = await Promise.all([
      prisma.site.count({ where: mainWhere }),
      prisma.site.findMany({
        where: mainWhere,
        include: { ...siteInclude, uploader: { select: { uid: true, nickname: true, avatarUrl: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.siteTag.groupBy({
        by: ['tagId'],
        where: {
          site: tagsWhere,
          tag: { scope: { in: ['SITE', 'BOTH'] } },
        },
        _count: { _all: true },
      }),
    ]);

    const tagFacets = await buildTagFacets(prisma, tagCounts);

    const response: SiteListResponse = {
      items: sites.map(serializeSite),
      total,
      page,
      pageSize,
      facets: { tags: tagFacets },
    };

    return response;
  });

  app.get<{ Params: { id: string } }>('/api/sites/:id', async (request) => {
    const site = await prisma.site.findFirst({
      where: { id: request.params.id, published: true },
      include: { ...siteInclude, uploader: { select: { uid: true, nickname: true, avatarUrl: true } } },
    });

    if (!site) {
      throw new HttpError(404, 'NOT_FOUND', '站点不存在');
    }

    return serializeSite(site);
  });
}
