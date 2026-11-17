import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client';
import { galleryPayloadSchema, type GalleryPayload } from '@spaceport/shared';
import { z } from 'zod';
import { recordAudit } from '../../lib/audit';
import { HttpError } from '../../lib/errors';
import { optionalQueryString, pageParams, pageQuery, pageSizeQuery } from '../../lib/query';
import { galleryUploaderSelect, serializeGalleryImage } from '../../lib/serialize';
import { prisma } from '../../prisma';

const adminGalleryQuerySchema = z.object({
  q: optionalQueryString,
  page: pageQuery,
  pageSize: pageSizeQuery(20, 50),
});

// PATCH 部分更新：仅覆盖请求里实际传入的字段（undefined 判断），
// 避免把未传的可选字段误抹成 null；可空文本字段传空串时才落 null
function buildGalleryData(body: Partial<GalleryPayload>): Prisma.GalleryImageUncheckedUpdateInput {
  const data: Prisma.GalleryImageUncheckedUpdateInput = {};
  if (body.imageUrl !== undefined) data.imageUrl = body.imageUrl;
  if (body.title !== undefined) data.title = body.title || null;
  if (body.published !== undefined) data.published = body.published;
  if (body.mediaType !== undefined) data.mediaType = body.mediaType || null;
  if (body.imageWidth !== undefined) data.imageWidth = body.imageWidth ?? null;
  if (body.imageHeight !== undefined) data.imageHeight = body.imageHeight ?? null;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.tags !== undefined) data.tags = JSON.stringify(body.tags ?? []);
  return data;
}

export function adminGalleryRoutes(app: FastifyInstance) {
  app.get('/api/admin/gallery', { preHandler: [app.requireAdmin] }, async (request) => {
    const query = adminGalleryQuerySchema.parse(request.query ?? {});
    const { page, pageSize, skip, take } = pageParams(query.page, query.pageSize, {
      pageSize: 20,
      maxPageSize: 50,
    });

    const where: Prisma.GalleryImageWhereInput = query.q
      ? { OR: [{ title: { contains: query.q } }] }
      : {};

    const [total, images] = await Promise.all([
      prisma.galleryImage.count({ where }),
      prisma.galleryImage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          uploader: { select: galleryUploaderSelect },
          _count: { select: { likes: true, comments: true } },
        },
      }),
    ]);

    return {
      items: images.map((image) => serializeGalleryImage(image)),
      total,
      page,
      pageSize,
    };
  });

  app.post('/api/admin/gallery', { preHandler: [app.requireAdmin] }, async (request) => {
    const body = galleryPayloadSchema.parse(request.body ?? {});
    const image = await prisma.galleryImage.create({
      data: {
        imageUrl: body.imageUrl,
        title: body.title || null,
        published: body.published ?? true,
        mediaType: body.mediaType || null,
        imageWidth: body.imageWidth ?? null,
        imageHeight: body.imageHeight ?? null,
        description: body.description || null,
        tags: JSON.stringify(body.tags ?? []),
        uploaderId: request.user?.sub ?? null,
      },
      include: {
        uploader: { select: galleryUploaderSelect },
        _count: { select: { likes: true, comments: true } },
      },
    });

    return { item: serializeGalleryImage(image) };
  });

  app.patch<{ Params: { id: string } }>(
    '/api/admin/gallery/:id',
    { preHandler: [app.requireAdmin] },
    async (request) => {
      const body = galleryPayloadSchema.partial().parse(request.body ?? {});
      const id = request.params.id;

      const existing = await prisma.galleryImage.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '作品不存在');
      }

      const image = await prisma.galleryImage.update({
        where: { id },
        data: buildGalleryData(body),
        include: {
          uploader: { select: galleryUploaderSelect },
          _count: { select: { likes: true, comments: true } },
        },
      });

      // 编辑他人已发布内容属敏感操作，与群舱/站点编辑一并落操作日志
      await recordAudit({
        actorId: request.user?.sub ?? '',
        actorNickname: request.user?.nickname ?? '',
        action: 'content.update',
        targetType: 'GalleryImage',
        targetId: id,
        detail: { entityType: 'GALLERY', fields: Object.keys(buildGalleryData(body)) },
      });

      return { item: serializeGalleryImage(image) };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/gallery/:id',
    { preHandler: [app.requireAdmin] },
    async (request, reply) => {
      const id = request.params.id;

      const existing = await prisma.galleryImage.findUnique({ where: { id } });
      if (!existing) {
        throw new HttpError(404, 'NOT_FOUND', '作品不存在');
      }

      await prisma.galleryImage.delete({ where: { id } });

      return reply.status(204).send();
    },
  );
}
