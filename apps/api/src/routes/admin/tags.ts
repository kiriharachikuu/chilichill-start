import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { TAG_SCOPES } from '@spaceport/shared';
import { z } from 'zod';
import { HttpError, isUniqueViolation } from '../../lib/errors';
import { toTag } from '../../lib/serialize';
import { prisma } from '../../prisma';

const tagCreateSchema = z.object({
  name: z.string().trim().min(1, '标签名不能为空').max(20, '标签名最多 20 个字'),
  slug: z.string().trim().min(1, '标签标识不能为空').max(40, '标签标识最多 40 个字符').optional(),
  scope: z.enum(TAG_SCOPES),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, '颜色格式应为 #RRGGBB')
    .optional(),
  kind: z.string().trim().max(20, '标签分类最多 20 个字符').optional().nullable(),
  sortOrder: z.coerce.number().int().optional(),
});

const tagUpdateSchema = tagCreateSchema.partial();

function randomSlug() {
  return `t-${randomBytes(4).toString('hex')}`;
}

export function adminTagsRoutes(app: FastifyInstance) {
  app.get('/api/admin/tags', { preHandler: [app.requireAdmin] }, async () => {
    const tags = await prisma.tag.findMany({
      include: { _count: { select: { groups: true, sites: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return {
      items: tags.map((tag) => ({
        ...toTag(tag),
        groupCount: tag._count.groups,
        siteCount: tag._count.sites,
      })),
    };
  });

  app.post('/api/admin/tags', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const body = tagCreateSchema.parse(request.body ?? {});
    const slug = body.slug ?? randomSlug();

    const conflict = await prisma.tag.findUnique({ where: { slug } });
    if (conflict) {
      throw new HttpError(409, 'TAG_CONFLICT', '该标签标识已存在');
    }

    try {
      const tag = await prisma.tag.create({
        data: {
          name: body.name,
          slug,
          scope: body.scope,
          color: body.color,
          kind: body.kind ?? null,
          sortOrder: body.sortOrder ?? 0,
        },
      });
      return reply.status(201).send({ item: toTag(tag) });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(409, 'TAG_CONFLICT', '该标签标识已存在');
      }
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>(
    '/api/admin/tags/:id',
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const body = tagUpdateSchema.parse(request.body ?? {});
      const id = request.params.id;

      const existing = await prisma.tag.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '标签不存在');
      }

      if (body.slug) {
        const conflict = await prisma.tag.findFirst({ where: { slug: body.slug, id: { not: id } } });
        if (conflict) {
          throw new HttpError(409, 'TAG_CONFLICT', '该标签标识已存在');
        }
      }

      try {
        const tag = await prisma.tag.update({
          where: { id },
          data: {
            name: body.name,
            slug: body.slug,
            scope: body.scope,
            color: body.color,
            kind: body.kind,
            sortOrder: body.sortOrder,
          },
        });
        return { item: toTag(tag) };
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new HttpError(409, 'TAG_CONFLICT', '该标签标识已存在');
        }
        throw error;
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/tags/:id',
    { preHandler: [app.requireAdmin] },
    async (request, reply) => {
      const id = request.params.id;
      const existing = await prisma.tag.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '标签不存在');
      }

      await prisma.tag.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
}
