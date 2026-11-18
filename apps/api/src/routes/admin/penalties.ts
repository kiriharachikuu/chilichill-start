import type { FastifyInstance } from 'fastify';
import { PENALTY_TYPES, penaltyRevokeSchema, type PenaltyListResponse } from '@spaceport/shared';
import { z } from 'zod';
import { recordAudit } from '../../lib/audit';
import { HttpError } from '../../lib/errors';
import { optionalEnumQuery, pageParams, pageQuery, pageSizeQuery } from '../../lib/query';
import { requireUser } from '../../plugins/auth';
import { prisma } from '../../prisma';
import { revokePenaltyById, serializePenalty } from '../../services/penalty';

const penaltyQuerySchema = z.object({
  type: optionalEnumQuery(PENALTY_TYPES),
  // 撤销状态筛选：true=已撤销 false=生效中，缺省=全部
  revoked: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  userId: z.string().trim().min(1).optional(),
  page: pageQuery,
  pageSize: pageSizeQuery(20, 50),
});

const userBriefSelect = { select: { uid: true, nickname: true } } as const;

// 处罚管理：审核组可查询处罚记录，仅站长可撤销误处罚
export function adminPenaltyRoutes(app: FastifyInstance) {
  app.get('/api/admin/penalties', { preHandler: [app.requireReviewer] }, async (request) => {
    const query = penaltyQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 20,
      maxPageSize: 50,
    });

    const where = {
      ...(query.type ? { type: query.type } : {}),
      ...(query.revoked === undefined ? {} : { revokedAt: query.revoked ? { not: null } : null }),
      ...(query.userId ? { userId: query.userId } : {}),
    };

    const [total, penalties] = await Promise.all([
      prisma.penalty.count({ where }),
      prisma.penalty.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take,
        include: { user: userBriefSelect, operator: userBriefSelect, revokedBy: userBriefSelect },
      }),
    ]);

    const response: PenaltyListResponse = {
      items: penalties.map(serializePenalty),
      total,
      page,
      pageSize,
    };
    return response;
  });

  // 撤销误处罚（仅站长）：自动回退用户计数并恢复对应权限，通知被处罚用户
  app.post<{ Params: { id: string } }>(
    '/api/admin/penalties/:id/revoke',
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const user = requireUser(request);
      const body = penaltyRevokeSchema.parse(request.body ?? {});

      const penalty = await prisma.$transaction((tx) =>
        revokePenaltyById(
          request.params.id,
          {
            operatorId: user.sub,
            operatorNickname: user.nickname ?? '',
            reason: body.reason,
          },
          tx,
        ),
      );

      return { item: penalty };
    },
  );
}
