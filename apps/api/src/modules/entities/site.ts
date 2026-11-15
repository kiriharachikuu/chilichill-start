import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { sitePayloadSchema, type SitePayload } from '@spaceport/shared';
import { HttpError } from '../../lib/errors';
import { serializeSite, type SiteWithTags } from '../../lib/serialize';
import { assertTagsValid } from '../../services/classification';
import { registerEntity, type EntityApplyContext } from './registry';

const siteInclude = {
  tags: { include: { tag: true } },
} satisfies Prisma.SiteInclude;

function parsePayload(payload: unknown): SitePayload {
  const result = sitePayloadSchema.safeParse(payload);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join('；') || '参数校验失败';
    throw new HttpError(400, 'VALIDATION_ERROR', message);
  }
  return result.data;
}

async function loadTarget(
  client: PrismaClient | Prisma.TransactionClient,
  id: string,
): Promise<SiteWithTags | null> {
  return client.site.findUnique({ where: { id }, include: siteInclude });
}

async function loadTargets(
  client: PrismaClient | Prisma.TransactionClient,
  ids: string[],
): Promise<Map<string, SiteWithTags>> {
  const rows = await client.site.findMany({
    where: { id: { in: [...new Set(ids)] } },
    include: siteInclude,
  });
  return new Map(rows.map((row) => [row.id, row] as const));
}

async function apply(
  tx: Prisma.TransactionClient,
  ctx: EntityApplyContext,
  payload: unknown,
): Promise<{ targetId: string }> {
  const data = payload as SitePayload;
  await assertTagsValid(data.tags, 'SITE', tx);

  const fields = {
    title: data.title,
    url: data.url,
    description: data.description,
    coverUrl: data.coverUrl || null,
  };

  const tagLinks = [...new Set(data.tags)].map((tagId) => ({ tagId }));

  if (ctx.mode === 'UPDATE') {
    const targetId = ctx.targetId;
    if (!targetId) {
      throw new HttpError(400, 'VALIDATION_ERROR', '修改投稿缺少目标内容');
    }

    const target = await tx.site.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new HttpError(404, 'NOT_FOUND', '目标站点不存在');
    }

    const conflict = await tx.site.findFirst({
      where: { url: data.url, id: { not: targetId } },
    });
    if (conflict) {
      throw new HttpError(409, 'SITE_CONFLICT', '该网站链接已被收录');
    }

    await tx.site.update({ where: { id: targetId }, data: fields });
    await tx.siteTag.deleteMany({ where: { siteId: targetId } });
    await tx.siteTag.createMany({ data: tagLinks.map((link) => ({ siteId: targetId, ...link })) });

    return { targetId };
  }

  const conflict = await tx.site.findUnique({ where: { url: data.url } });
  if (conflict) {
    throw new HttpError(409, 'SITE_CONFLICT', '该网站链接已被收录');
  }

  const created = await tx.site.create({
    data: {
      ...fields,
      // 首次创建时记录上传者；修改投稿不改变原上传者
      uploaderId: ctx.submitterId,
    },
  });
  await tx.siteTag.createMany({ data: tagLinks.map((link) => ({ siteId: created.id, ...link })) });

  return { targetId: created.id };
}

function serializeTarget(target: unknown): unknown {
  return serializeSite(target as SiteWithTags);
}

registerEntity({
  entityType: 'SITE',
  label: '网站',
  parsePayload,
  loadTarget,
  loadTargets,
  apply,
  serializeTarget,
});
