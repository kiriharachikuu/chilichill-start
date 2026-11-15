import type { FastifyInstance } from 'fastify';
import { REGION_CODES, REGION_NAME, TAG_SCOPES } from '@spaceport/shared';
import { z } from 'zod';
import { HttpError, isUniqueViolation } from '../../lib/errors';
import { optionalQueryString } from '../../lib/query';
import { toTag } from '../../lib/serialize';
import { prisma } from '../../prisma';

const cityRuleCreateSchema = z.object({
  city: z.string().trim().min(1, '城市不能为空').max(30, '城市名称最多 30 个字'),
  regionCode: z.enum(REGION_CODES, { error: '大区编码无效' }),
  province: z.string().trim().max(30, '省份名称最多 30 个字').optional().nullable(),
});

const cityRuleUpdateSchema = cityRuleCreateSchema.partial();

const autoTagRuleCreateSchema = z.object({
  keyword: z.string().trim().min(1, '关键词不能为空').max(20, '关键词最多 20 个字'),
  tagId: z.string().trim().min(1, '请选择标签'),
  scope: z.enum(TAG_SCOPES).optional(),
  priority: z.coerce.number().int().optional(),
});

const autoTagRuleUpdateSchema = autoTagRuleCreateSchema.partial();

const cityRuleQuerySchema = z.object({ q: optionalQueryString });

export function adminRulesRoutes(app: FastifyInstance) {
  app.get('/api/admin/city-rules', { preHandler: [app.requireAdmin] }, async (request) => {
    const query = cityRuleQuerySchema.parse(request.query ?? {});
    const q = query.q;

    const items = await prisma.cityRegionRule.findMany({
      where: q
        ? {
            OR: [
              { city: { contains: q } },
              { province: { contains: q } },
              { regionName: { contains: q } },
            ],
          }
        : undefined,
      orderBy: [{ regionCode: 'asc' }, { sortOrder: 'asc' }, { city: 'asc' }],
    });

    return { items };
  });

  app.post('/api/admin/city-rules', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const body = cityRuleCreateSchema.parse(request.body ?? {});
    const city = body.city;
    const regionName = REGION_NAME[body.regionCode];

    const conflict = await prisma.cityRegionRule.findUnique({ where: { city } });
    if (conflict) {
      throw new HttpError(409, 'CITY_RULE_CONFLICT', '该城市已存在映射');
    }

    try {
      const item = await prisma.cityRegionRule.create({
        data: {
          city,
          regionCode: body.regionCode,
          regionName,
          province: body.province ?? null,
        },
      });
      return reply.status(201).send({ item });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new HttpError(409, 'CITY_RULE_CONFLICT', '该城市已存在映射');
      }
      throw error;
    }
  });

  app.patch<{ Params: { id: string } }>(
    '/api/admin/city-rules/:id',
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const body = cityRuleUpdateSchema.parse(request.body ?? {});
      const id = request.params.id;

      const existing = await prisma.cityRegionRule.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '城市映射不存在');
      }

      if (body.city && body.city !== existing.city) {
        const conflict = await prisma.cityRegionRule.findUnique({ where: { city: body.city } });
        if (conflict) {
          throw new HttpError(409, 'CITY_RULE_CONFLICT', '该城市已存在映射');
        }
      }

      const regionCode = body.regionCode ?? existing.regionCode;
      const regionName = body.regionCode ? REGION_NAME[body.regionCode] : existing.regionName;

      try {
        const item = await prisma.cityRegionRule.update({
          where: { id },
          data: {
            city: body.city,
            regionCode,
            regionName,
            province: body.province,
          },
        });
        return { item };
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new HttpError(409, 'CITY_RULE_CONFLICT', '该城市已存在映射');
        }
        throw error;
      }
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/city-rules/:id',
    { preHandler: [app.requireAdmin] },
    async (request, reply) => {
      const id = request.params.id;
      const existing = await prisma.cityRegionRule.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '城市映射不存在');
      }

      await prisma.cityRegionRule.delete({ where: { id } });
      return reply.status(204).send();
    },
  );

  app.get('/api/admin/auto-tag-rules', { preHandler: [app.requireAdmin] }, async () => {
    const rules = await prisma.autoTagRule.findMany({
      include: { tag: true },
      orderBy: [{ priority: 'desc' }, { keyword: 'asc' }],
    });

    return {
      items: rules.map((rule) => ({
        id: rule.id,
        keyword: rule.keyword,
        tagId: rule.tagId,
        scope: rule.scope,
        priority: rule.priority,
        tag: toTag(rule.tag),
      })),
    };
  });

  app.post('/api/admin/auto-tag-rules', { preHandler: [app.requireAdmin] }, async (request, reply) => {
    const body = autoTagRuleCreateSchema.parse(request.body ?? {});

    const tag = await prisma.tag.findUnique({ where: { id: body.tagId } });
    if (!tag) {
      throw new HttpError(400, 'INVALID_TAG', '标签不存在');
    }

    const rule = await prisma.autoTagRule.create({
      data: {
        keyword: body.keyword,
        tagId: body.tagId,
        scope: body.scope ?? 'GROUP',
        priority: body.priority ?? 0,
      },
    });

    return reply.status(201).send({ item: { ...rule, tag: toTag(tag) } });
  });

  app.patch<{ Params: { id: string } }>(
    '/api/admin/auto-tag-rules/:id',
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const body = autoTagRuleUpdateSchema.parse(request.body ?? {});
      const id = request.params.id;

      const existing = await prisma.autoTagRule.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '自动打标规则不存在');
      }

      if (body.tagId) {
        const tag = await prisma.tag.findUnique({ where: { id: body.tagId } });
        if (!tag) {
          throw new HttpError(400, 'INVALID_TAG', '标签不存在');
        }
      }

      const rule = await prisma.autoTagRule.update({
        where: { id },
        data: {
          keyword: body.keyword,
          tagId: body.tagId,
          scope: body.scope,
          priority: body.priority,
        },
        include: { tag: true },
      });

      return { item: { ...rule, tag: toTag(rule.tag) } };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/auto-tag-rules/:id',
    { preHandler: [app.requireAdmin] },
    async (request, reply) => {
      const id = request.params.id;
      const existing = await prisma.autoTagRule.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '自动打标规则不存在');
      }

      await prisma.autoTagRule.delete({ where: { id } });
      return reply.status(204).send();
    },
  );
}
