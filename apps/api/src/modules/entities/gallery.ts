import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { gallerySubmissionPayloadSchema, type GallerySubmissionPayload } from '@spaceport/shared';
import { HttpError } from '../../lib/errors';
import { serializeGalleryImage, type GalleryImageRow } from '../../lib/serialize';
import { registerEntity, type EntityApplyContext, type EntityHandler } from './registry';

function parsePayload(payload: unknown): GallerySubmissionPayload {
  const result = gallerySubmissionPayloadSchema.safeParse(payload);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join('；') || '参数校验失败';
    throw new HttpError(400, 'VALIDATION_ERROR', message);
  }
  return result.data;
}

const galleryInclude = {
  uploader: { select: { uid: true, nickname: true, avatarUrl: true } },
  _count: { select: { likes: true, comments: true } },
} satisfies Prisma.GalleryImageInclude;

async function loadTarget(
  client: PrismaClient | Prisma.TransactionClient,
  id: string,
): Promise<GalleryImageRow | null> {
  return client.galleryImage.findUnique({ where: { id }, include: galleryInclude });
}

async function loadTargets(
  client: PrismaClient | Prisma.TransactionClient,
  ids: string[],
): Promise<Map<string, GalleryImageRow>> {
  const rows = await client.galleryImage.findMany({
    where: { id: { in: [...new Set(ids)] } },
    include: galleryInclude,
  });
  return new Map(rows.map((row) => [row.id, row] as const));
}

async function apply(
  tx: Prisma.TransactionClient,
  ctx: EntityApplyContext,
  payload: unknown,
): Promise<{ targetId: string }> {
  if (ctx.mode === 'UPDATE') {
    throw new HttpError(400, 'VALIDATION_ERROR', '画廊作品暂不支持修改投稿，请直接发布新作品');
  }

  const data = payload as GallerySubmissionPayload;
  const created = await tx.galleryImage.create({
    data: {
      imageUrl: data.imageUrl,
      title: data.title,
      mediaType: data.mediaType,
      imageWidth: data.imageWidth ?? null,
      imageHeight: data.imageHeight ?? null,
      description: data.description || null,
      tags: JSON.stringify(data.tags ?? []),
      published: true,
      uploaderId: ctx.submitterId,
    },
  });

  return { targetId: created.id };
}

function serializeTarget(target: unknown): unknown {
  return serializeGalleryImage(target as GalleryImageRow);
}

registerEntity({
  entityType: 'GALLERY',
  label: '画廊作品',
  parsePayload,
  loadTarget,
  loadTargets,
  apply,
  serializeTarget,
});
