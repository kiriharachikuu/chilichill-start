import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client';
import { GROUP_TYPES, REGION_CODES, groupPayloadSchema, sitePayloadSchema, type GroupPayload, type SitePayload } from '@spaceport/shared';
import { z } from 'zod';
import { recordAudit } from '../../lib/audit';
import { HttpError } from '../../lib/errors';
import { optionalEnumQuery, optionalQueryString, pageParams, pageQuery, pageSizeQuery } from '../../lib/query';
import { serializeGroup, serializeSite } from '../../lib/serialize';
import { getEntity } from '../../modules/entities';
import { prisma } from '../../prisma';
import { requireUser } from '../../plugins/auth';

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

// 后台编辑已发布内容：完整表单字段 + 可选上下线状态（未传 published 时保持原状态）
const groupEditSchema = groupPayloadSchema.extend({ published: z.boolean().optional() });
const siteEditSchema = sitePayloadSchema.extend({ published: z.boolean().optional() });

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

  // 后台直接编辑已发布群组：复用实体 UPDATE 落库逻辑（地区归并/标签校验/群号查重），
  // 与投稿审核流走同一套数据规则，避免后台绕过校验产生脏数据
  app.put<{ Params: { id: string } }>(
    '/api/admin/groups/:id',
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const user = requireUser(request);
      const body = groupEditSchema.parse(request.body ?? {});
      const id = request.params.id;

      const existing = await prisma.group.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '群组不存在');
      }

      const handler = getEntity('GROUP');
      const normalized = handler.parsePayload(body) as GroupPayload;

      await prisma.$transaction(async (tx) => {
        await handler.apply(tx, { mode: 'UPDATE', targetId: id, submitterId: user.sub }, normalized);
        if (body.published !== undefined) {
          await tx.group.update({ where: { id }, data: { published: body.published } });
        }
        await recordAudit(
          {
            actorId: user.sub,
            actorNickname: user.nickname ?? '',
            action: 'content.update',
            targetType: 'Group',
            targetId: id,
            detail: { entityType: 'GROUP', name: normalized.name, published: body.published ?? null },
          },
          tx,
        );
      });

      const group = await prisma.group.findUnique({ where: { id }, include: tagsInclude });
      if (!group) {
        throw new HttpError(404, 'NOT_FOUND', '群组不存在');
      }
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

  // 后台直接编辑已发布站点：复用实体 UPDATE 落库逻辑（标签校验/链接查重）
  app.put<{ Params: { id: string } }>(
    '/api/admin/sites/:id',
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const user = requireUser(request);
      const body = siteEditSchema.parse(request.body ?? {});
      const id = request.params.id;

      const existing = await prisma.site.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '站点不存在');
      }

      const handler = getEntity('SITE');
      const normalized = handler.parsePayload(body) as SitePayload;

      await prisma.$transaction(async (tx) => {
        await handler.apply(tx, { mode: 'UPDATE', targetId: id, submitterId: user.sub }, normalized);
        if (body.published !== undefined) {
          await tx.site.update({ where: { id }, data: { published: body.published } });
        }
        await recordAudit(
          {
            actorId: user.sub,
            actorNickname: user.nickname ?? '',
            action: 'content.update',
            targetType: 'Site',
            targetId: id,
            detail: { entityType: 'SITE', title: normalized.title, published: body.published ?? null },
          },
          tx,
        );
      });

      const site = await prisma.site.findUnique({ where: { id }, include: tagsInclude });
      if (!site) {
        throw new HttpError(404, 'NOT_FOUND', '站点不存在');
      }
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
