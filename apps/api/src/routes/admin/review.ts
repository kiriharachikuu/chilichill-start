import type { FastifyInstance } from 'fastify';
import { ENTITY_TYPES, SUBMISSION_STATUSES, PERMISSIONS, hasPermission } from '@spaceport/shared';
import { z } from 'zod';
import { recordAudit } from '../../lib/audit';
import { HttpError } from '../../lib/errors';
import { optionalEnumQuery, pageParams, pageQuery, pageSizeQuery } from '../../lib/query';
import { serializeSubmission } from '../../lib/serialize';
import { loadTargetFor, loadTargetsFor } from '../../lib/target';
import { getEntity } from '../../modules/entities';
import type { AuthUser } from '../../plugins/auth';
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

const BATCH_LIMIT = 20;

const batchSchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1, '请先选择要审核的投稿').max(BATCH_LIMIT, `单次最多批量处理 ${BATCH_LIMIT} 条投稿`),
    action: z.enum(['approve', 'reject']),
    reviewNote: z.string().trim().max(200, '驳回原因最多 200 个字').optional(),
  })
  .refine(
    (data) => data.action !== 'reject' || (data.reviewNote ?? '').length >= 2,
    { path: ['reviewNote'], message: '批量驳回需填写驳回原因（至少 2 个字）' },
  );

const submitterSelect = { select: { id: true, nickname: true, email: true } } as const;

interface BatchResult {
  succeeded: { id: string; targetId: string | null }[];
  failed: { id: string; error: string }[];
}

/**
 * 通过单条投稿（认领 → 落库 → 审计），单条接口与批量接口共用。
 * 返回内容落库后的 targetId；内部异常会向上抛出（批量场景逐条捕获）。
 */
async function approveOne(
  id: string,
  user: AuthUser,
  payloadOverride?: Record<string, unknown>,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    const submission = await tx.submission.findUnique({ where: { id } });
    if (!submission) {
      throw new HttpError(404, 'NOT_FOUND', '投稿不存在');
    }
    const isSelfReview = submission.submitterId === user.sub;
    // 自审限制：仅持有 review:self 权限（管理员）可审核自己提交的投稿
    if (isSelfReview && !hasPermission(user.role, PERMISSIONS.REVIEW_SELF)) {
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
    const rawPayload = payloadOverride ?? JSON.parse(submission.payload);
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
          selfReview: isSelfReview,
        },
      },
      tx,
    );

    return applied.targetId;
  });
}

/** 驳回单条投稿（认领 → 审计 → 清理文件），单条接口与批量接口共用 */
async function rejectOne(id: string, user: AuthUser, reviewNote: string, log: FastifyInstance['log']): Promise<void> {
  const submission = await prisma.submission.findUnique({ where: { id } });
  if (!submission) {
    throw new HttpError(404, 'NOT_FOUND', '投稿不存在');
  }
  const isSelfReview = submission.submitterId === user.sub;
  // 自审限制：仅持有 review:self 权限（管理员）可审核自己提交的投稿
  if (isSelfReview && !hasPermission(user.role, PERMISSIONS.REVIEW_SELF)) {
    throw new HttpError(403, 'SELF_REVIEW_FORBIDDEN', '不能审核自己提交的投稿');
  }

  const claimed = await prisma.submission.updateMany({
    where: { id, status: 'PENDING' },
    data: {
      status: 'REJECTED',
      reviewerId: user.sub,
      reviewedAt: new Date(),
      reviewNote,
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
    detail: { entityType: submission.entityType, mode: submission.mode, reviewNote, selfReview: isSelfReview },
  });

  // CREATE 投稿被驳回视为垃圾信号：清理其上传文件（best-effort，不影响驳回结果）
  await cleanupRejectedSubmissionFiles(submission, log);
}

async function loadSubmissionDetail(id: string) {
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: { submitter: submitterSelect },
  });
  if (!submission) {
    throw new HttpError(404, 'NOT_FOUND', '投稿不存在');
  }
  const target = await loadTargetFor(submission.entityType, submission.targetId);
  return { item: serializeSubmission(submission, target, submission.submitter), target };
}

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

      const targetId = await approveOne(id, user, body.payloadOverride);
      const detail = await loadSubmissionDetail(id);
      return { ...detail, targetId };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/submissions/:id/reject',
    { preHandler: [app.requireReviewer] },
    async (request) => {
      const user = requireUser(request);
      const body = rejectSchema.parse(request.body ?? {});
      const id = request.params.id;

      await rejectOne(id, user, body.reviewNote, request.log);
      const detail = await loadSubmissionDetail(id);
      return { item: detail.item };
    },
  );

  // 批量审核：逐条复用单条逻辑，失败不中断其余条目，返回逐条结果供前端反馈
  app.post('/api/admin/submissions/batch', { preHandler: [app.requireReviewer] }, async (request) => {
    const user = requireUser(request);
    const body = batchSchema.parse(request.body ?? {});
    // 去重：同一条投稿在单次请求里只处理一次，避免重复认领产生 409 噪音
    const ids = [...new Set(body.ids)];

    const result: BatchResult = { succeeded: [], failed: [] };
    for (const id of ids) {
      try {
        if (body.action === 'approve') {
          const targetId = await approveOne(id, user);
          result.succeeded.push({ id, targetId });
        } else {
          await rejectOne(id, user, body.reviewNote ?? '', request.log);
          result.succeeded.push({ id, targetId: null });
        }
      } catch (error) {
        result.failed.push({
          id,
          error: error instanceof HttpError ? error.message : '操作失败，请稍后再试',
        });
      }
    }

    return result;
  });
}
