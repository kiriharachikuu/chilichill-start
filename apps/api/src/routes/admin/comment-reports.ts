import type { FastifyInstance } from 'fastify';
import { REPORT_STATUSES } from '@spaceport/shared';
import { z } from 'zod';
import { recordAudit } from '../../lib/audit';
import { HttpError } from '../../lib/errors';
import { optionalEnumQuery, pageParams, pageQuery, pageSizeQuery } from '../../lib/query';
import { requireUser } from '../../plugins/auth';
import { prisma } from '../../prisma';
import type { CommentReport, CommentReportListResponse, ReportStatus } from '@spaceport/shared';
import type { Prisma } from '../../generated/prisma/client';

const reportQuerySchema = z.object({
  status: optionalEnumQuery(REPORT_STATUSES),
  page: pageQuery,
  pageSize: pageSizeQuery(20, 50),
});

const reporterSelect = { select: { id: true, nickname: true, email: true } } as const;
const handlerSelect = { select: { id: true, nickname: true } } as const;

type ReportRow = Prisma.CommentReportGetPayload<{
  include: { reporter: typeof reporterSelect; handledBy: typeof handlerSelect };
}>;

function serializeReport(report: ReportRow): CommentReport {
  const result: CommentReport = {
    id: report.id,
    commentId: report.commentId,
    commentContent: report.commentContent,
    commentUserId: report.commentUserId,
    commentUserNickname: report.commentUserNickname,
    reporterId: report.reporterId,
    reason: report.reason,
    status: report.status as ReportStatus,
    handledAt: report.handledAt?.toISOString() ?? null,
    createdAt: report.createdAt.toISOString(),
  };
  if (report.reporter) {
    result.reporter = report.reporter;
  }
  if (report.handledBy) {
    result.handledBy = report.handledBy;
  }
  return result;
}

export function adminCommentReportRoutes(app: FastifyInstance) {
  // 举报列表：默认待处理，可按状态筛选
  app.get('/api/admin/comment-reports', { preHandler: [app.requireReviewer] }, async (request) => {
    const query = reportQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 20,
      maxPageSize: 50,
    });

    const where: Prisma.CommentReportWhereInput = query.status ? { status: query.status } : {};

    const [total, reports] = await Promise.all([
      prisma.commentReport.count({ where }),
      prisma.commentReport.findMany({
        where,
        include: { reporter: reporterSelect, handledBy: handlerSelect },
        orderBy: { createdAt: 'asc' },
        skip,
        take,
      }),
    ]);

    const response: CommentReportListResponse = {
      items: reports.map(serializeReport),
      total,
      page,
      pageSize,
    };
    return response;
  });

  // 处理举报：删除被举报评论（即时生效、不可恢复）。
  // 认领举报与删除评论包同一事务：避免“举报已处理但评论还在”的中间态
  app.post<{ Params: { id: string } }>(
    '/api/admin/comment-reports/:id/resolve',
    { preHandler: [app.requireReviewer] },
    async (request) => {
      const user = requireUser(request);

      const updated = await prisma.$transaction(async (tx) => {
        const report = await tx.commentReport.findUnique({ where: { id: request.params.id } });
        if (!report) {
          throw new HttpError(404, 'NOT_FOUND', '举报记录不存在');
        }
        if (report.status !== 'PENDING') {
          throw new HttpError(409, 'CONFLICT', '该举报已被处理');
        }

        const claimed = await tx.commentReport.updateMany({
          where: { id: report.id, status: 'PENDING' },
          data: { status: 'RESOLVED', handledAt: new Date(), handledById: user.sub },
        });
        if (claimed.count === 0) {
          throw new HttpError(409, 'CONFLICT', '该举报已被处理');
        }

        // 评论可能已被作者自行删除（commentId 置空），此时仅关闭举报
        if (report.commentId) {
          await tx.galleryComment.deleteMany({ where: { id: report.commentId } });
        }

        await recordAudit(
          {
            actorId: user.sub,
            actorNickname: user.nickname ?? '',
            action: 'report.resolve',
            targetType: 'CommentReport',
            targetId: report.id,
            detail: { commentId: report.commentId },
          },
          tx,
        );

        return tx.commentReport.findUnique({
          where: { id: report.id },
          include: { reporter: reporterSelect, handledBy: handlerSelect },
        });
      });
      if (!updated) {
        throw new HttpError(404, 'NOT_FOUND', '举报记录不存在');
      }
      return { item: serializeReport(updated) };
    },
  );

  // 驳回举报：评论保留
  app.post<{ Params: { id: string } }>(
    '/api/admin/comment-reports/:id/dismiss',
    { preHandler: [app.requireReviewer] },
    async (request) => {
      const user = requireUser(request);

      const report = await prisma.commentReport.findUnique({ where: { id: request.params.id } });
      if (!report) {
        throw new HttpError(404, 'NOT_FOUND', '举报记录不存在');
      }
      if (report.status !== 'PENDING') {
        throw new HttpError(409, 'CONFLICT', '该举报已被处理');
      }

      const claimed = await prisma.commentReport.updateMany({
        where: { id: report.id, status: 'PENDING' },
        data: { status: 'DISMISSED', handledAt: new Date(), handledById: user.sub },
      });
      if (claimed.count === 0) {
        throw new HttpError(409, 'CONFLICT', '该举报已被处理');
      }

      await recordAudit({
        actorId: user.sub,
        actorNickname: user.nickname ?? '',
        action: 'report.dismiss',
        targetType: 'CommentReport',
        targetId: report.id,
      });

      const updated = await prisma.commentReport.findUnique({
        where: { id: report.id },
        include: { reporter: reporterSelect, handledBy: handlerSelect },
      });
      if (!updated) {
        throw new HttpError(404, 'NOT_FOUND', '举报记录不存在');
      }
      return { item: serializeReport(updated) };
    },
  );
}
