import type { FastifyInstance } from 'fastify';
import { ENTITY_TYPES, SUBMISSION_STATUSES } from '@spaceport/shared';
import { z } from 'zod';
import { recordAudit } from '../../lib/audit';
import { HttpError } from '../../lib/errors';
import { optionalEnumQuery, pageParams, pageQuery, pageSizeQuery } from '../../lib/query';
import { serializeSubmission } from '../../lib/serialize';
import { loadTargetFor, loadTargetsFor } from '../../lib/target';
import { getEntity } from '../../modules/entities';
import { requireUser } from '../../plugins/auth';
import { prisma } from '../../prisma';
import { cleanupRejectedSubmissionFiles } from '../../services/submission-cleanup';

const reviewQuerySchema = z.object({
  status: optionalEnumQuery(SUBMISSION_STATUSES),
  entityType: optionalEnumQuery(ENTITY_TYPES),
  page: pageQuery,
  pageSize: pageSizeQuery(20, 50),
});

const approveSchema = z.object({
  payloadOverride: z.record(z.string(), z.unknown()).optional(),
});

const rejectSchema = z.object({
  reviewNote: z
    .string()
    .trim()
    .min(2, '驳回原因至少 2 个字')
    .max(200, '驳回原因最多 200 个字'),
});

const submitterSelect = { select: { id: true, nickname: true, email: true } } as const;

export function adminReviewRoutes(app: FastifyInstance) {
  app.get('/api/admin/submissions', { preHandler: [app.requireReviewer] }, async (request) => {
    const query = reviewQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 20,
      maxPageSize: 50,
    });

    const where = {
      status: query.status ?? 'PENDING',
      ...(query.entityType ? { entityType: query.entityType } : {}),
    };

    const [total, submissions] = await Promise.all([
      prisma.submission.count({ where }),
      prisma.submission.findMany({
        where,
        include: { submitter: submitterSelect },
        orderBy: { createdAt: 'asc' },
        skip,
        take,
      }),
    ]);

    const targets = await loadTargetsFor(submissions);
    const items = submissions.map((submission) =>
      serializeSubmission(submission, targets.get(submission.targetId ?? '') ?? null, submission.submitter),
    );

    return { items, total, page, pageSize };
  });

  app.get<{ Params: { id: string } }>(
    '/api/admin/submissions/:id',
    { preHandler: [app.requireReviewer] },
    async (request) => {
      const submission = await prisma.submission.findUnique({
        where: { id: request.params.id },
        include: { submitter: submitterSelect },
      });

      if (!submission) {
        throw new HttpError(404, 'NOT_FOUND', '投稿不存在');
      }

      const target = await loadTargetFor(submission.entityType, submission.targetId);
      return { item: serializeSubmission(submission, target, submission.submitter), target };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/submissions/:id/approve',
    { preHandler: [app.requireReviewer] },
    async (request) => {
      const user = requireUser(request);
      const body = approveSchema.parse(request.body ?? {});
      const id = request.params.id;

      const targetId = await prisma.$transaction(async (tx) => {
        const submission = await tx.submission.findUnique({ where: { id } });
        if (!submission) {
          throw new HttpError(404, 'NOT_FOUND', '投稿不存在');
        }
        // 自审排除：审核人不能通过自己提交的投稿
        if (submission.submitterId === user.sub) {
          throw new HttpError(403, 'SELF_REVIEW_FORBIDDEN', '不能审核自己提交的投稿');
        }

        const claimed = await tx.submission.updateMany({
          where: { id, status: 'PENDING' },
          data: { status: 'APPROVED', reviewerId: user.sub, reviewedAt: new Date() },
        });

        if (claimed.count === 0) {
          throw new HttpError(409, 'CONFLICT', '该投稿已被处理');
        }

        const handler = getEntity(submission.entityType);
        const rawPayload = body.payloadOverride ?? JSON.parse(submission.payload);
        const normalized = handler.parsePayload(rawPayload);

        const applied = await handler.apply(
          tx,
          { mode: submission.mode, targetId: submission.targetId, submitterId: submission.submitterId },
          normalized,
        );

        await tx.submission.update({
          where: { id },
          data: {
            targetId: applied.targetId,
            groupTargetId: submission.entityType === 'GROUP' ? applied.targetId : null,
            siteTargetId: submission.entityType === 'SITE' ? applied.targetId : null,
          },
        });

        await recordAudit(
          {
            actorId: user.sub,
            actorNickname: user.nickname ?? '',
            action: 'submission.approve',
            targetType: 'Submission',
            targetId: id,
            detail: {
              entityType: submission.entityType,
              mode: submission.mode,
              contentTargetId: applied.targetId,
            },
          },
          tx,
        );

        return applied.targetId;
      });

      const submission = await prisma.submission.findUnique({
        where: { id },
        include: { submitter: submitterSelect },
      });
      if (!submission) {
        throw new HttpError(404, 'NOT_FOUND', '投稿不存在');
      }

      const target = await loadTargetFor(submission.entityType, submission.targetId);
      return {
        item: serializeSubmission(submission, target, submission.submitter),
        targetId,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/submissions/:id/reject',
    { preHandler: [app.requireReviewer] },
    async (request) => {
      const user = requireUser(request);
      const body = rejectSchema.parse(request.body ?? {});
      const id = request.params.id;

      const submission = await prisma.submission.findUnique({ where: { id } });
      if (!submission) {
        throw new HttpError(404, 'NOT_FOUND', '投稿不存在');
      }
      // 自审排除：审核人不能驳回自己提交的投稿
      if (submission.submitterId === user.sub) {
        throw new HttpError(403, 'SELF_REVIEW_FORBIDDEN', '不能审核自己提交的投稿');
      }

      const claimed = await prisma.submission.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: 'REJECTED',
          reviewerId: user.sub,
          reviewedAt: new Date(),
          reviewNote: body.reviewNote,
        },
      });

      if (claimed.count === 0) {
        throw new HttpError(409, 'CONFLICT', '该投稿已被处理');
      }

      await recordAudit({
        actorId: user.sub,
        actorNickname: user.nickname ?? '',
        action: 'submission.reject',
        targetType: 'Submission',
        targetId: id,
        detail: { entityType: submission.entityType, mode: submission.mode, reviewNote: body.reviewNote },
      });

      // CREATE 投稿被驳回视为垃圾信号：清理其上传文件（best-effort，不影响驳回结果）
      await cleanupRejectedSubmissionFiles(submission, request.log);

      const updated = await prisma.submission.findUnique({
        where: { id },
        include: { submitter: submitterSelect },
      });
      if (!updated) {
        throw new HttpError(404, 'NOT_FOUND', '投稿不存在');
      }

      const target = await loadTargetFor(updated.entityType, updated.targetId);
      return { item: serializeSubmission(updated, target, updated.submitter) };
    },
  );
}
