import type { FastifyInstance } from 'fastify';
import {
  formatLocation,
  profileUpdateSchema,
  ReceivedCommentListResponse,
  ReceivedLikeListResponse,
  type SpaceResourcesResponse,
} from '@spaceport/shared';
import { z } from 'zod';
import { HttpError } from '../lib/errors';
import { pageParams, pageQuery, pageSizeQuery } from '../lib/query';
import {
  galleryUploaderSelect,
  serializeGalleryImage,
  serializeGroup,
  serializeSite,
  toPublicUploader,
  type GalleryImageRow,
} from '../lib/serialize';
import { prisma } from '../prisma';
import { requireUser } from '../plugins/auth';

const resourceQuerySchema = z.object({
  type: z.enum(['GROUP', 'SITE', 'GALLERY']),
  page: pageQuery,
  pageSize: pageSizeQuery(6, 24),
});

const receivedQuerySchema = z.object({
  page: pageQuery,
  pageSize: pageSizeQuery(10, 30),
});

// 个人空间：按 uid 公开查询用户资料与其上传且已发布的资源
export function userRoutes(app: FastifyInstance) {
  app.patch('/api/users/me', { preHandler: [app.authenticate] }, async (request) => {
    const user = requireUser(request);
    const body = profileUpdateSchema.parse(request.body ?? {});

    const updated = await prisma.user.update({
      where: { id: user.sub },
      data: {
        ...(body.nickname !== undefined ? { nickname: body.nickname } : {}),
        ...(body.avatarUrl !== undefined ? { avatarUrl: body.avatarUrl || null } : {}),
        ...(body.bannerUrl !== undefined ? { bannerUrl: body.bannerUrl || null } : {}),
        ...(body.bio !== undefined ? { bio: body.bio || null } : {}),
        ...(body.province !== undefined ? { province: body.province || null } : {}),
        ...(body.city !== undefined ? { city: body.city || null } : {}),
      },
    });

    return {
      user: {
        id: updated.id,
        uid: updated.uid,
        email: updated.email,
        nickname: updated.nickname,
        avatarUrl: updated.avatarUrl,
        bannerUrl: updated.bannerUrl,
        bio: updated.bio,
        province: updated.province,
        city: updated.city,
        role: updated.role,
      },
    };
  });

  // 收到的点赞：他人对当前用户已发布画廊作品的点赞（排除自己点的），按时间倒序分页
  app.get('/api/users/me/received-likes', { preHandler: [app.authenticate] }, async (request) => {
    const userId = requireUser(request).sub;
    const query = receivedQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 10,
      maxPageSize: 30,
    });

    const where = { image: { uploaderId: userId, published: true }, userId: { not: userId } };
    const [total, likes] = await Promise.all([
      prisma.galleryLike.count({ where }),
      prisma.galleryLike.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: { select: galleryUploaderSelect },
          image: { select: { id: true, imageUrl: true, title: true } },
        },
      }),
    ]);

    const response: ReceivedLikeListResponse = {
      items: likes.map((like) => ({
        id: like.id,
        createdAt: like.createdAt.toISOString(),
        user: toPublicUploader(like.user),
        image: like.image,
      })),
      total,
      page,
      pageSize,
    };
    return response;
  });

  // 收到的评论：他人对当前用户已发布画廊作品的评论（排除自己发的），按时间倒序分页
  app.get('/api/users/me/received-comments', { preHandler: [app.authenticate] }, async (request) => {
    const userId = requireUser(request).sub;
    const query = receivedQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 10,
      maxPageSize: 30,
    });

    const where = { image: { uploaderId: userId, published: true }, userId: { not: userId } };
    const [total, comments] = await Promise.all([
      prisma.galleryComment.count({ where }),
      prisma.galleryComment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: { select: galleryUploaderSelect },
          image: { select: { id: true, imageUrl: true, title: true } },
        },
      }),
    ]);

    const response: ReceivedCommentListResponse = {
      items: comments.map((comment) => ({
        id: comment.id,
        content: comment.content,
        createdAt: comment.createdAt.toISOString(),
        user: toPublicUploader(comment.user),
        image: comment.image,
      })),
      total,
      page,
      pageSize,
    };
    return response;
  });

  app.get<{ Params: { uid: string } }>('/api/users/uid/:uid', async (request) => {
    const uid = Number(request.params.uid);
    if (!Number.isInteger(uid) || uid <= 0) {
      throw new HttpError(400, 'INVALID_UID', 'uid 格式不正确');
    }

    const user = await prisma.user.findUnique({ where: { uid } });
    if (!user) {
      throw new HttpError(404, 'NOT_FOUND', '用户不存在');
    }

    const where = { uploaderId: user.id, published: true };
    const [groupCount, siteCount, galleryCount] = await Promise.all([
      prisma.group.count({ where }),
      prisma.site.count({ where }),
      prisma.galleryImage.count({ where }),
    ]);

    return {
      user: {
        uid: user.uid,
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        bannerUrl: user.bannerUrl,
        bio: user.bio,
        province: user.province,
        city: user.city,
        location: formatLocation(user.province, user.city) || null,
        createdAt: user.createdAt.toISOString(),
      },
      counts: { groups: groupCount, sites: siteCount, gallery: galleryCount },
    };
  });

  // 个人空间资源分页列表：type 区分内容类型，前端 Tab 内分页
  app.get<{ Params: { uid: string } }>(
    '/api/users/uid/:uid/resources',
    { preHandler: [app.optionalAuthenticate] },
    async (request) => {
      const uid = Number(request.params.uid);
      if (!Number.isInteger(uid) || uid <= 0) {
        throw new HttpError(400, 'INVALID_UID', 'uid 格式不正确');
      }
      const query = resourceQuerySchema.parse(request.query ?? {});
      const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
        pageSize: 12,
        maxPageSize: 24,
      });

      const user = await prisma.user.findUnique({ where: { uid }, select: { id: true } });
      if (!user) {
        throw new HttpError(404, 'NOT_FOUND', '用户不存在');
      }

      const uploaderSelect = { select: { uid: true, nickname: true, avatarUrl: true } };
      const where = { uploaderId: user.id, published: true };
      const common = { where, orderBy: { createdAt: 'desc' as const }, skip, take };
      const viewerId = request.user?.sub ?? null;

      if (query.type === 'GROUP') {
        const [total, groups] = await Promise.all([
          prisma.group.count({ where }),
          prisma.group.findMany({
            ...common,
            include: { tags: { include: { tag: true } }, uploader: uploaderSelect },
          }),
        ]);
        const response: SpaceResourcesResponse = {
          items: groups.map((group) => serializeGroup(group)),
          total,
          page,
          pageSize,
        };
        return response;
      }

      if (query.type === 'GALLERY') {
        const [total, images] = await Promise.all([
          prisma.galleryImage.count({ where }),
          prisma.galleryImage.findMany({
            ...common,
            include: {
              uploader: { select: galleryUploaderSelect },
              _count: { select: { likes: true, comments: true } },
              ...(viewerId
                ? { likes: { where: { userId: viewerId }, select: { userId: true } } }
                : {}),
            },
          }),
        ]);
        const response: SpaceResourcesResponse = {
          items: images.map((image) => serializeGalleryImage(image as GalleryImageRow, viewerId)),
          total,
          page,
          pageSize,
        };
        return response;
      }

      const [total, sites] = await Promise.all([
        prisma.site.count({ where }),
        prisma.site.findMany({
          ...common,
          include: { tags: { include: { tag: true } }, uploader: uploaderSelect },
        }),
      ]);
      const response: SpaceResourcesResponse = {
        items: sites.map((site) => serializeSite(site)),
        total,
        page,
        pageSize,
      };
      return response;
    },
  );
}
