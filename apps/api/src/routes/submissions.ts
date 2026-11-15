import type { FastifyInstance } from 'fastify';
import { SUBMISSION_STATUSES, submissionCreateSchema } from '@spaceport/shared';
import { z } from 'zod';
import { HttpError } from '../lib/errors';
import { optionalEnumQuery, pageParams, pageQuery, pageSizeQuery } from '../lib/query';
import { serializeSubmission } from '../lib/serialize';
import { loadTargetFor, loadTargetsFor } from '../lib/target';
import { getEntity } from '../modules/entities';
import { requireUser } from '../plugins/auth';
import { prisma } from '../prisma';

const mineQuerySchema = z.object({
  status: optionalEnumQuery(SUBMISSION_STATUSES),
  page: pageQuery,
  pageSize: pageSizeQuery(20, 50),
});

const resubmitSchema = z.object({
  payload: z.record(z.string(), z.unknown()),
});

export function submissionsRoutes(app: FastifyInstance) {
  app.post('/api/submissions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = requireUser(request);
    const body = submissionCreateSchema.parse(request.body ?? {});
    const handler = getEntity(body.entityType);

    // 画廊只支持新增投稿：UPDATE 模式在这里直接拒绝，避免进入审核队列后无法落地
    if (body.entityType === 'GALLERY' && body.mode === 'UPDATE') {
      throw new HttpError(400, 'VALIDATION_ERROR', '画廊作品暂不支持修改投稿，请直接发布新作品');
    }

    const normalized = handler.parsePayload(body.payload);

    let targetId: string | null = null;
    let target: unknown | null = null;

    if (body.mode === 'UPDATE') {
      const rawTarget = await handler.loadTarget(prisma, body.targetId as string);
      if (!rawTarget) {
        throw new HttpError(404, 'NOT_FOUND', '目标内容不存在');
      }
      // 越权防护：仅允许对本人上传的内容发起修改投稿，防止篡改他人内容
      const uploaderId = (rawTarget as { uploaderId?: unknown }).uploaderId;
      if (typeof uploaderId !== 'string' || uploaderId !== user.sub) {
        throw new HttpError(403, 'FORBIDDEN', '只能对自己上传的内容发起修改');
      }
      targetId = body.targetId as string;
      target = handler.serializeTarget(rawTarget);
    }

    const submission = await prisma.submission.create({
      data: {
        entityType: body.entityType,
        mode: body.mode,
        targetId,
        payload: JSON.stringify(normalized),
        status: 'PENDING',
        submitterId: user.sub,
        groupTargetId: body.entityType === 'GROUP' ? targetId : null,
        siteTargetId: body.entityType === 'SITE' ? targetId : null,
      },
    });

    return reply.status(201).send({ item: serializeSubmission(submission, target) });
  });

  app.get('/api/submissions/mine', { preHandler: [app.authenticate] }, async (request) => {
    const user = requireUser(request);
    const query = mineQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 20,
      maxPageSize: 50,
    });

    const where = { submitterId: user.sub, ...(query.status ? { status: query.status } : {}) };

    const [total, submissions] = await Promise.all([
      prisma.submission.count({ where }),
      prisma.submission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
    ]);

    const targets = await loadTargetsFor(submissions);
    const items = submissions.map((submission) =>
      serializeSubmission(submission, targets.get(submission.targetId ?? '') ?? null),
    );

    return { items, total, page, pageSize };
  });

  app.get<{ Params: { id: string } }>(
    '/api/submissions/:id',
    { preHandler: [app.authenticate] },
    async (request) => {
      const user = requireUser(request);
      const submission = await prisma.submission.findUnique({
        where: { id: request.params.id },
        include: { submitter: { select: { id: true, nickname: true, email: true } } },
      });

      if (!submission) {
        throw new HttpError(404, 'NOT_FOUND', '投稿不存在');
      }

      if (user.role !== 'ADMIN' && submission.submitterId !== user.sub) {
        throw new HttpError(403, 'FORBIDDEN', '无权查看该投稿');
      }

      const target = await loadTargetFor(submission.entityType, submission.targetId);
      return { item: serializeSubmission(submission, target), target };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/submissions/:id/resubmit',
    { preHandler: [app.authenticate] },
    async (request) => {
      const user = requireUser(request);
      const body = resubmitSchema.parse(request.body ?? {});

      const submission = await prisma.submission.findUnique({ where: { id: request.params.id } });
      if (!submission) {
        throw new HttpError(404, 'NOT_FOUND', '投稿不存在');
      }

      if (submission.submitterId !== user.sub) {
        throw new HttpError(403, 'FORBIDDEN', '无权操作该投稿');
      }

      if (submission.status !== 'REJECTED') {
        throw new HttpError(409, 'CONFLICT', '只有已驳回的投稿可以重新提交');
      }

      // 画廊只支持新增投稿：UPDATE 模式在这里直接拒绝，避免进入审核队列后无法落地
      if (submission.entityType === 'GALLERY' && submission.mode === 'UPDATE') {
        throw new HttpError(400, 'VALIDATION_ERROR', '画廊作品暂不支持修改投稿，请直接发布新作品');
      }

      const handler = getEntity(submission.entityType);
      const normalized = handler.parsePayload(body.payload);

      if (submission.mode === 'UPDATE') {
        const rawTarget = await handler.loadTarget(prisma, submission.targetId as string);
        if (!rawTarget) {
          throw new HttpError(404, 'NOT_FOUND', '目标内容不存在');
        }
      }

      const updated = await prisma.submission.update({
        where: { id: submission.id },
        data: {
          payload: JSON.stringify(normalized),
          status: 'PENDING',
          reviewNote: null,
          reviewerId: null,
          reviewedAt: null,
        },
      });

      const target = await loadTargetFor(updated.entityType, updated.targetId);
      return { item: serializeSubmission(updated, target) };
    },
  );
}
