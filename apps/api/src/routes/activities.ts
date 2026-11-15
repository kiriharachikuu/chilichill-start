import type { FastifyInstance } from 'fastify';
import type { ActivityListResponse } from '@spaceport/shared';
import { z } from 'zod';
import { HttpError } from '../lib/errors';
import { pageParams, pageQuery, pageSizeQuery } from '../lib/query';
import { serializeActivity } from '../lib/serialize';
import { prisma } from '../prisma';

const activityQuerySchema = z.object({
  page: pageQuery,
  pageSize: pageSizeQuery(6, 24),
});

export function publicActivitiesRoutes(app: FastifyInstance) {
  app.get('/api/activities', async (request) => {
    const query = activityQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 6,
      maxPageSize: 24,
    });

    const [total, activities] = await Promise.all([
      prisma.activity.count({ where: { published: true } }),
      prisma.activity.findMany({
        where: { published: true },
        // sortOrder 小值靠前（后台可置顶），其余按开始时间倒序（历届活动最新在前）
        orderBy: [{ sortOrder: 'asc' }, { startDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
    ]);

    const response: ActivityListResponse = {
      items: activities.map((item) => serializeActivity(item)),
      total,
      page,
      pageSize,
    };

    return response;
  });

  app.get<{ Params: { id: string } }>('/api/activities/:id', async (request) => {
    const activity = await prisma.activity.findFirst({
      where: { id: request.params.id, published: true },
    });

    if (!activity) {
      throw new HttpError(404, 'NOT_FOUND', '活动不存在');
    }

    return serializeActivity(activity, true);
  });
}
