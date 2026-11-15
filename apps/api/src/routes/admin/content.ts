import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client';
import { GROUP_TYPES, REGION_CODES } from '@spaceport/shared';
import { z } from 'zod';
import { HttpError } from '../../lib/errors';
import { optionalEnumQuery, optionalQueryString, pageParams, pageQuery, pageSizeQuery } from '../../lib/query';
import { serializeGroup, serializeSite } from '../../lib/serialize';
import { prisma } from '../../prisma';

const tagsInclude = { tags: { include: { tag: true } } } as const;

const adminGroupQuerySchema = z.object({
  q: optionalQueryString,
  type: optionalEnumQuery(GROUP_TYPES),
  region: optionalEnumQuery(REGION_CODES),
  tag: optionalQueryString,
  page: pageQuery,
  pageSize: pageSizeQuery(20, 50),
});

const adminSiteQuerySchema = z.object({
  q: optionalQueryString,
  tag: optionalQueryString,
  page: pageQuery,
  pageSize: pageSizeQuery(20, 50),
});

const publishSchema = z.object({
  published: z.boolean().optional(),
});

function buildGroupWhere(query: z.infer<typeof adminGroupQuerySchema>): Prisma.GroupWhereInput {
  const where: Prisma.GroupWhereInput = {};

  if (query.q) {
    where.OR = [
      { name: { contains: query.q } },
      { groupNumber: { contains: query.q } },
      { description: { contains: query.q } },
    ];
  }
  if (query.type) {
    where.type = query.type;
  }
  if (query.region) {
    where.regionCode = query.region;
  }
  if (query.tag) {
    where.tags = { some: { tag: { OR: [{ id: query.tag }, { slug: query.tag }] } } };
  }

  return where;
}

function buildSiteWhere(query: z.infer<typeof adminSiteQuerySchema>): Prisma.SiteWhereInput {
  const where: Prisma.SiteWhereInput = {};

  if (query.q) {
    where.OR = [
      { title: { contains: query.q } },
      { description: { contains: query.q } },
      { url: { contains: query.q } },
    ];
  }
  if (query.tag) {
    where.tags = { some: { tag: { OR: [{ id: query.tag }, { slug: query.tag }] } } };
  }

  return where;
}

export function adminContentRoutes(app: FastifyInstance) {
  app.get('/api/admin/groups', { preHandler: [app.requireAdmin] }, async (request) => {
    const query = adminGroupQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 20,
      maxPageSize: 50,
    });
    const where = buildGroupWhere(query);

    const [total, groups] = await Promise.all([
      prisma.group.count({ where }),
      prisma.group.findMany({
        where,
        include: tagsInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return { items: groups.map(serializeGroup), total, page, pageSize };
  });

  app.get('/api/admin/sites', { preHandler: [app.requireAdmin] }, async (request) => {
    const query = adminSiteQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 20,
      maxPageSize: 50,
    });
    const where = buildSiteWhere(query);

    const [total, sites] = await Promise.all([
      prisma.site.count({ where }),
      prisma.site.findMany({
        where,
        include: tagsInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    return { items: sites.map(serializeSite), total, page, pageSize };
  });

  app.patch<{ Params: { id: string } }>(
    '/api/admin/groups/:id',
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const body = publishSchema.parse(request.body ?? {});
      const id = request.params.id;

      const existing = await prisma.group.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '群组不存在');
      }

      const group = await prisma.group.update({
        where: { id },
        data: { published: body.published },
        include: tagsInclude,
      });

      return { item: serializeGroup(group) };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/groups/:id',
    { preHandler: [app.requireAdmin] },
    async (request, reply) => {
      const id = request.params.id;

      const existing = await prisma.group.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '群组不存在');
      }

      await prisma.$transaction([
        prisma.submission.deleteMany({ where: { groupTargetId: id } }),
        prisma.group.delete({ where: { id } }),
      ]);

      return reply.status(204).send();
    },
  );

  app.patch<{ Params: { id: string } }>(
    '/api/admin/sites/:id',
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const body = publishSchema.parse(request.body ?? {});
      const id = request.params.id;

      const existing = await prisma.site.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '站点不存在');
      }

      const site = await prisma.site.update({
        where: { id },
        data: { published: body.published },
        include: tagsInclude,
      });

      return { item: serializeSite(site) };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/sites/:id',
    { preHandler: [app.requireAdmin] },
    async (request, reply) => {
      const id = request.params.id;

      const existing = await prisma.site.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '站点不存在');
      }

      await prisma.$transaction([
        prisma.submission.deleteMany({ where: { siteTargetId: id } }),
        prisma.site.delete({ where: { id } }),
      ]);

      return reply.status(204).send();
    },
  );
}
