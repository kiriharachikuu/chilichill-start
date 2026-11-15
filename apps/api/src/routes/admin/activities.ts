import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client';
import { activityPayloadSchema, type ActivityPayload } from '@spaceport/shared';
import { z } from 'zod';
import { HttpError } from '../../lib/errors';
import { optionalQueryString, pageParams, pageQuery, pageSizeQuery } from '../../lib/query';
import { serializeActivity } from '../../lib/serialize';
import { prisma } from '../../prisma';

const adminActivityQuerySchema = z.object({
  q: optionalQueryString,
  page: pageQuery,
  pageSize: pageSizeQuery(20, 50),
});

function parseOptionalDate(value: string | null | undefined, label: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'INVALID_FIELD', `${label}格式不正确`);
  }
  return date;
}

function buildActivityData(body: Partial<ActivityPayload>): Prisma.ActivityUncheckedUpdateInput {
  const data: Prisma.ActivityUncheckedUpdateInput = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.coverUrl !== undefined) data.coverUrl = body.coverUrl || null;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.linkUrl !== undefined) data.linkUrl = body.linkUrl || null;
  if (body.contentHtml !== undefined) data.contentHtml = body.contentHtml || null;
  if (body.startDate !== undefined) data.startDate = parseOptionalDate(body.startDate, '开始时间');
  if (body.endDate !== undefined) data.endDate = parseOptionalDate(body.endDate, '结束时间');
  if (body.published !== undefined) data.published = body.published;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
  return data;
}

export function adminActivitiesRoutes(app: FastifyInstance) {
  app.get('/api/admin/activities', { preHandler: [app.requireAdmin] }, async (request) => {
    const query = adminActivityQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 20,
      maxPageSize: 50,
    });

    const where: Prisma.ActivityWhereInput = query.q
      ? {
          OR: [
            { title: { contains: query.q } },
            { description: { contains: query.q } },
          ],
        }
      : {};

    const [total, activities] = await Promise.all([
      prisma.activity.count({ where }),
      prisma.activity.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { startDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
    ]);

    const response: {
      items: (ReturnType<typeof serializeActivity> & { hasContentHtml: boolean })[];
      total: number;
      page: number;
      pageSize: number;
    } = {
      items: activities.map((item) => ({
        ...serializeActivity(item),
        hasContentHtml: Boolean(item.contentHtml),
      })),
      total,
      page,
      pageSize,
    };

    return response;
  });

  app.get<{ Params: { id: string } }>(
    '/api/admin/activities/:id',
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const activity = await prisma.activity.findUnique({
        where: { id: request.params.id },
      });
      if (!activity) {
        throw new HttpError(404, 'NOT_FOUND', '活动不存在');
      }
      // 编辑表单需要读回 contentHtml
      return { item: serializeActivity(activity, true) };
    },
  );

  app.post('/api/admin/activities', { preHandler: [app.requireAdmin] }, async (request) => {
    const body = activityPayloadSchema.parse(request.body ?? {});
    // zod 已保证 title 必填，此处可安全按创建输入写入
    const activity = await prisma.activity.create({
      data: buildActivityData(body) as Prisma.ActivityUncheckedCreateInput,
    });

    return { item: serializeActivity(activity, true) };
  });

  app.patch<{ Params: { id: string } }>(
    '/api/admin/activities/:id',
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const body = activityPayloadSchema.partial().parse(request.body ?? {});
      const id = request.params.id;

      const existing = await prisma.activity.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '活动不存在');
      }

      const activity = await prisma.activity.update({
        where: { id },
        data: buildActivityData(body),
      });

      return { item: serializeActivity(activity, true) };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/activities/:id',
    { preHandler: [app.requireAdmin] },
    async (request, reply) => {
      const id = request.params.id;

      const existing = await prisma.activity.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '活动不存在');
      }

      await prisma.activity.delete({ where: { id } });

      return reply.status(204).send();
    },
  );
}
