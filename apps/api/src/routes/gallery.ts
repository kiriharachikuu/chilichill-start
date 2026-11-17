import type { FastifyInstance } from 'fastify';
import {
  commentReportSchema,
  galleryCommentSchema,
  type GalleryCommentListResponse,
  type GalleryLikeState,
  type GalleryListResponse,
} from '@spaceport/shared';
import { z } from 'zod';
import { HttpError, isUniqueViolation } from '../lib/errors';
import { pageParams, pageQuery, pageSizeQuery } from '../lib/query';
import {
  galleryUploaderSelect,
  serializeGalleryComment,
  serializeGalleryImage,
} from '../lib/serialize';
import { requireUser } from '../plugins/auth';
import { notifyCommentReportInBackground } from '../services/qq-bot/notify';
import { prisma } from '../prisma';

const galleryQuerySchema = z.object({
  page: pageQuery,
  pageSize: pageSizeQuery(12, 24),
});

const commentQuerySchema = z.object({
  page: pageQuery,
  pageSize: pageSizeQuery(10, 30),
});

async function requirePublishedImage(id: string) {
  const image = await prisma.galleryImage.findFirst({
    where: { id, published: true },
    select: { id: true },
  });
  if (!image) {
    throw new HttpError(404, 'NOT_FOUND', '作品不存在或未发布');
  }
  return image;
}

export function publicGalleryRoutes(app: FastifyInstance) {
  // 瀑布流列表：按创建时间倒序分页；登录用户附带 liked 状态
  app.get('/api/gallery', { preHandler: [app.optionalAuthenticate] }, async (request) => {
    const query = galleryQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 12,
      maxPageSize: 24,
    });
    const viewerId = request.user?.sub ?? null;

    const [total, images] = await Promise.all([
      prisma.galleryImage.count({ where: { published: true } }),
      prisma.galleryImage.findMany({
        where: { published: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          uploader: { select: galleryUploaderSelect },
          _count: { select: { likes: true, comments: true } },
          ...(viewerId
            ? { likes: { where: { userId: viewerId }, select: { userId: true } } }
            : {}),
        },
      }),
    ]);

    const response: GalleryListResponse = {
      items: images.map((image) => serializeGalleryImage(image, viewerId)),
      total,
      page,
      pageSize,
      hasMore: skip + take < total,
    };
    return response;
  });

  app.get<{ Params: { id: string } }>(
    '/api/gallery/:id',
    { preHandler: [app.optionalAuthenticate] },
    async (request) => {
      const viewerId = request.user?.sub ?? null;
      const image = await prisma.galleryImage.findFirst({
        where: { id: request.params.id, published: true },
        include: {
          uploader: { select: galleryUploaderSelect },
          _count: { select: { likes: true, comments: true } },
          ...(viewerId
            ? { likes: { where: { userId: viewerId }, select: { userId: true } } }
            : {}),
        },
      });

      if (!image) {
        throw new HttpError(404, 'NOT_FOUND', '作品不存在或未发布');
      }

      return { item: serializeGalleryImage(image, viewerId) };
    },
  );

  // 点赞 toggle：已赞则取消，未赞则新增；返回最新状态
  app.post<{ Params: { id: string } }>(
    '/api/gallery/:id/like',
    { preHandler: [app.authenticate] },
    async (request) => {
      const userId = requireUser(request).sub;
      const imageId = request.params.id;
      await requirePublishedImage(imageId);

      const existing = await prisma.galleryLike.findUnique({
        where: { imageId_userId: { imageId, userId } },
        select: { id: true },
      });

      if (existing) {
        await prisma.galleryLike.delete({ where: { id: existing.id } });
      } else {
        try {
          await prisma.galleryLike.create({ data: { imageId, userId } });
        } catch (error) {
          // 并发双击可能触发唯一约束冲突，视为已点赞即可
          if (!isUniqueViolation(error)) {
            throw error;
          }
        }
      }

      const likeCount = await prisma.galleryLike.count({ where: { imageId } });
      const state: GalleryLikeState = { imageId, liked: !existing, likeCount };
      return state;
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/gallery/:id/comments',
    { preHandler: [app.optionalAuthenticate] },
    async (request) => {
      await requirePublishedImage(request.params.id);
      const query = commentQuerySchema.parse(request.query ?? {});
      const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
        pageSize: 10,
        maxPageSize: 30,
      });

      const [total, comments] = await Promise.all([
        prisma.galleryComment.count({ where: { imageId: request.params.id } }),
        prisma.galleryComment.findMany({
          where: { imageId: request.params.id },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: { user: { select: galleryUploaderSelect } },
        }),
      ]);

      const response: GalleryCommentListResponse = {
        items: comments.map((comment) => serializeGalleryComment(comment)),
        total,
        page,
        pageSize,
        hasMore: skip + take < total,
      };
      return response;
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/gallery/:id/comments',
    { preHandler: [app.authenticate] },
    async (request) => {
      const userId = requireUser(request).sub;
      const imageId = request.params.id;
      await requirePublishedImage(imageId);
      const body = galleryCommentSchema.parse(request.body ?? {});

      const comment = await prisma.galleryComment.create({
        data: { imageId, userId, content: body.content },
        include: { user: { select: galleryUploaderSelect } },
      });

      const commentCount = await prisma.galleryComment.count({ where: { imageId } });
      return { item: serializeGalleryComment(comment), commentCount };
    },
  );

  // 删除自己的评论：即时生效且不可恢复；管理员可删除任意评论
  app.delete<{ Params: { commentId: string } }>(
    '/api/gallery/comments/:commentId',
    { preHandler: [app.authenticate] },
    async (request) => {
      const userId = requireUser(request).sub;
      const comment = await prisma.galleryComment.findUnique({
        where: { id: request.params.commentId },
        select: { id: true, userId: true, imageId: true },
      });
      if (!comment) {
        throw new HttpError(404, 'NOT_FOUND', '评论不存在或已删除');
      }
      if (comment.userId !== userId && request.user?.role !== 'ADMIN') {
        throw new HttpError(403, 'FORBIDDEN', '只能删除自己发布的评论');
      }

      // 评论删除的同时把关联举报标记为已处理（评论已删除，无需再人工跟进）
      await prisma.$transaction([
        prisma.galleryComment.delete({ where: { id: comment.id } }),
        prisma.commentReport.updateMany({
          where: { commentId: comment.id, status: 'PENDING' },
          data: { status: 'RESOLVED', handledAt: new Date() },
        }),
      ]);

      const commentCount = await prisma.galleryComment.count({ where: { imageId: comment.imageId } });
      return { commentCount };
    },
  );

  // 举报他人评论：必填原因，进入人工审核队列；同一用户对同一评论只能举报一次
  app.post<{ Params: { commentId: string } }>(
    '/api/gallery/comments/:commentId/report',
    { preHandler: [app.authenticate] },
    async (request) => {
      const userId = requireUser(request).sub;
      const body = commentReportSchema.parse(request.body ?? {});

      const comment = await prisma.galleryComment.findUnique({
        where: { id: request.params.commentId },
        include: { user: { select: { nickname: true } } },
      });
      if (!comment) {
        throw new HttpError(404, 'NOT_FOUND', '评论不存在或已删除');
      }
      if (comment.userId === userId) {
        throw new HttpError(400, 'BAD_REQUEST', '不能举报自己发布的评论');
      }

      try {
        const report = await prisma.commentReport.create({
          data: {
            commentId: comment.id,
            commentContent: comment.content,
            commentUserId: comment.userId,
            commentUserNickname: comment.user?.nickname ?? null,
            reporterId: userId,
            reason: body.reason,
          },
        });
        // 推送审核提醒（best-effort，不阻塞响应）
        notifyCommentReportInBackground(
          {
            reporterNickname: request.user?.nickname ?? '未知用户',
            commentContent: comment.content,
            commentUserNickname: comment.user?.nickname ?? null,
            reason: body.reason,
          },
          request.log,
        );
        return { item: { id: report.id, status: report.status } };
      } catch (error) {
        // 唯一约束：同一用户对同一评论重复举报
        if (isUniqueViolation(error)) {
          throw new HttpError(409, 'CONFLICT', '您已举报过该评论，请耐心等待处理');
        }
        throw error;
      }
    },
  );
}
