import type { FastifyInstance } from 'fastify';
import { PENALTY_TYPES, type PublicPenaltyListResponse } from '@spaceport/shared';
import { z } from 'zod';
import { optionalEnumQuery, pageParams, pageQuery, pageSizeQuery } from '../lib/query';
import { serializePublicPenalty } from '../services/penalty';
import { prisma } from '../prisma';

const penaltyQuerySchema = z.object({
  type: optionalEnumQuery(PENALTY_TYPES),
  page: pageQuery,
  pageSize: pageSizeQuery(20, 50),
});

// 小黑屋公示页：按处罚时间倒序展示全部已生效处罚（已撤销记录不公示）
export function publicPenaltyRoutes(app: FastifyInstance) {
  app.get('/api/penalties', async (request) => {
    const query = penaltyQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 20,
      maxPageSize: 50,
    });

    const where = {
      revokedAt: null,
      ...(query.type ? { type: query.type } : {}),
    };

    const [total, penalties] = await Promise.all([
      prisma.penalty.count({ where }),
      prisma.penalty.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          type: true,
          durationDays: true,
          startedAt: true,
          endsAt: true,
          reason: true,
          user: { select: { uid: true } },
        },
      }),
    ]);

    const response: PublicPenaltyListResponse = {
      items: penalties.map(serializePublicPenalty),
      total,
      page,
      pageSize,
    };
    return response;
  });
}
