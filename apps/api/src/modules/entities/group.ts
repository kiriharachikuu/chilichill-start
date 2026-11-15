import type { Prisma, PrismaClient } from '../../generated/prisma/client';
import { groupPayloadSchema, qqGroupAvatarUrl, type GroupPayload } from '@spaceport/shared';
import { HttpError } from '../../lib/errors';
import { serializeGroup, type GroupWithTags } from '../../lib/serialize';
import { assertTagsValid, resolveRegion } from '../../services/classification';
import { registerEntity, type EntityApplyContext, type EntityHandler } from './registry';

const groupInclude = {
  tags: { include: { tag: true } },
} satisfies Prisma.GroupInclude;

function parsePayload(payload: unknown): GroupPayload {
  const result = groupPayloadSchema.safeParse(payload);
  if (!result.success) {
    const message = result.error.issues.map((issue) => issue.message).join('；') || '参数校验失败';
    throw new HttpError(400, 'VALIDATION_ERROR', message);
  }
  return result.data;
}

async function loadTarget(
  client: PrismaClient | Prisma.TransactionClient,
  id: string,
): Promise<GroupWithTags | null> {
  return client.group.findUnique({ where: { id }, include: groupInclude });
}

async function loadTargets(
  client: PrismaClient | Prisma.TransactionClient,
  ids: string[],
): Promise<Map<string, GroupWithTags>> {
  const rows = await client.group.findMany({
    where: { id: { in: [...new Set(ids)] } },
    include: groupInclude,
  });
  return new Map(rows.map((row) => [row.id, row] as const));
}

async function apply(
  tx: Prisma.TransactionClient,
  ctx: EntityApplyContext,
  payload: unknown,
): Promise<{ targetId: string }> {
  const data = payload as GroupPayload;
  await assertTagsValid(data.tags, 'GROUP', tx);

  let regionCode: string | null = null;
  let regionName: string | null = null;

  if (data.type === 'REGION' || data.type === 'COLLEGE') {
    const region = await resolveRegion(data.province, data.city, tx);
    regionCode = region.regionCode;
    regionName = region.regionName;
  } else if (data.type === 'GENERAL' || data.type === 'OTHER') {
    if (data.tags.length === 0) {
      throw new HttpError(400, 'INVALID_TAGS', '该类型群需至少指定一个标签');
    }
    regionCode = 'OTHER';
    regionName = '待定';
  }

  const needCity = data.type === 'REGION' || data.type === 'COLLEGE';
  const fields = {
    name: data.name,
    platform: data.platform,
    // 仅 QQ 群记录群号；微博 / 秀动 / 小红书粉丝群只上传二维码与头像
    groupNumber: data.platform === 'QQ' ? data.groupNumber! : null,
    type: data.type,
    province: needCity ? data.province ?? null : null,
    city: needCity ? data.city ?? null : null,
    school: data.type === 'COLLEGE' ? data.school ?? null : null,
    regionCode,
    regionName,
    description: data.description,
    purpose: data.purpose ?? null,
    joinUrl: data.joinUrl || null,
    qrcodeUrl: data.qrcodeUrl || null,
    // QQ 群未手动上传头像时，凭群号自动抓取官方头像
    avatarUrl:
      data.platform === 'QQ' && data.groupNumber && !data.avatarUrl
        ? qqGroupAvatarUrl(data.groupNumber)
        : data.avatarUrl || null,
  };

  const tagLinks = [...new Set(data.tags)].map((tagId) => ({ tagId }));

  if (ctx.mode === 'UPDATE') {
    const targetId = ctx.targetId;
    if (!targetId) {
      throw new HttpError(400, 'VALIDATION_ERROR', '修改投稿缺少目标内容');
    }

    const target = await tx.group.findUnique({ where: { id: targetId } });
    if (!target) {
      throw new HttpError(404, 'NOT_FOUND', '目标群组不存在');
    }

    // 群号重复校验仅在填写了群号时进行（非 QQ 平台群号为空）
    if (fields.groupNumber) {
      const conflict = await tx.group.findFirst({
        where: { groupNumber: fields.groupNumber, id: { not: targetId } },
      });
      if (conflict) {
        throw new HttpError(409, 'GROUP_CONFLICT', '该群号已被收录');
      }
    }

    await tx.group.update({ where: { id: targetId }, data: fields });
    await tx.groupTag.deleteMany({ where: { groupId: targetId } });
    await tx.groupTag.createMany({ data: tagLinks.map((link) => ({ groupId: targetId, ...link })) });

    return { targetId };
  }

  if (fields.groupNumber) {
    const conflict = await tx.group.findUnique({ where: { groupNumber: fields.groupNumber } });
    if (conflict) {
      throw new HttpError(409, 'GROUP_CONFLICT', '该群号已被收录');
    }
  }

  const created = await tx.group.create({
    data: {
      ...fields,
      // 首次创建时记录上传者；修改投稿不改变原上传者
      uploaderId: ctx.submitterId,
    },
  });
  await tx.groupTag.createMany({ data: tagLinks.map((link) => ({ groupId: created.id, ...link })) });

  return { targetId: created.id };
}

function serializeTarget(target: unknown): unknown {
  return serializeGroup(target as GroupWithTags);
}

registerEntity({
  entityType: 'GROUP',
  label: 'Q群',
  parsePayload,
  loadTarget,
  loadTargets,
  apply,
  serializeTarget,
});
