import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client';
import { ROLES, type AdminAuditLog, type AdminAuditLogListResponse } from '@spaceport/shared';
import { z } from 'zod';
import { HttpError } from '../../lib/errors';
import { optionalQueryString, pageParams, pageQuery, pageSizeQuery } from '../../lib/query';
import { requireUser } from '../../plugins/auth';
import { prisma } from '../../prisma';

const usersQuerySchema = z.object({
  page: pageQuery,
  pageSize: pageSizeQuery(20, 50),
});

const auditLogQuerySchema = z.object({
  page: pageQuery,
  pageSize: pageSizeQuery(20, 50),
  action: optionalQueryString,
  actorId: optionalQueryString,
});

const roleChangeSchema = z.object({
  role: z.enum(ROLES, { error: '用户组不合法' }),
});

type AuditLogRow = Prisma.AdminAuditLogGetPayload<Record<string, never>>;

function serializeAuditLog(log: AuditLogRow): AdminAuditLog {
  let detail: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(log.detail);
    if (typeof parsed === 'object' && parsed !== null) detail = parsed as Record<string, unknown>;
  } catch {
    detail = {};
  }
  const result: AdminAuditLog = {
    id: log.id,
    actorId: log.actorId,
    actorNickname: log.actorNickname,
    action: log.action,
    targetType: log.targetType,
    targetId: log.targetId,
    detail,
    createdAt: log.createdAt.toISOString(),
  };
  return result;
}

export function adminUsersRoutes(app: FastifyInstance) {
  app.get('/api/admin/users', { preHandler: [app.requireAdmin] }, async (request) => {
    const query = usersQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 20,
      maxPageSize: 50,
    });

    const [total, users] = await Promise.all([
      prisma.user.count(),
      prisma.user.findMany({
        include: { _count: { select: { submissions: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    const items = users.map((user) => ({
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      role: user.role,
      createdAt: user.createdAt.toISOString(),
      submissionCount: user._count.submissions,
    }));

    return { items, total, page, pageSize };
  });

  // 调整单个用户的所属用户组：仅站长可操作，即时生效并记录审计日志
  app.patch<{ Params: { id: string } }>(
    '/api/admin/users/:id/role',
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const actor = requireUser(request);
      const body = roleChangeSchema.parse(request.body ?? {});
      const targetId = request.params.id;

      if (targetId === actor.sub) {
        throw new HttpError(400, 'BAD_REQUEST', '不能修改自己的用户组');
      }

      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, nickname: true, role: true },
      });
      if (!target) {
        throw new HttpError(404, 'NOT_FOUND', '用户不存在');
      }
      if (target.role === body.role) {
        throw new HttpError(400, 'BAD_REQUEST', '该用户已在目标用户组中');
      }

      const updated = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: targetId },
          data: { role: body.role },
          select: { id: true, nickname: true, role: true },
        });
        await tx.adminAuditLog.create({
          data: {
            actorId: actor.sub,
            actorNickname: actor.nickname ?? '',
            action: 'USER_ROLE_CHANGE',
            targetType: 'USER',
            targetId,
            detail: JSON.stringify({
              from: target.role,
              to: body.role,
              userNickname: target.nickname,
            }),
          },
        });
        return user;
      });

      return { item: updated };
    },
  );

  // 审计日志：用户组调整、投稿审核、举报处理等敏感操作记录
  app.get('/api/admin/audit-logs', { preHandler: [app.requireAdmin] }, async (request) => {
    const query = auditLogQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 20,
      maxPageSize: 50,
    });

    const where = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
    };

    const [total, logs] = await Promise.all([
      prisma.adminAuditLog.count({ where }),
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    const response: AdminAuditLogListResponse = {
      items: logs.map(serializeAuditLog),
      total,
      page,
      pageSize,
    };
    return response;
  });
}
