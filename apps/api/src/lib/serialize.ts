import type { Prisma, PrismaClient, Submission as PrismaSubmission, Tag as PrismaTag, User as PrismaUser } from '../generated/prisma/client';
import type {
  Activity,
  EntityType,
  GalleryCommentItem,
  GalleryImage,
  Group,
  GroupType,
  PublicUploader,
  RegionCode,
  Site,
  Submission,
  SubmissionMode,
  SubmissionStatus,
  Tag,
  TagFacet,
  TagScope,
} from '@spaceport/shared';

export type GroupWithTags = Prisma.GroupGetPayload<{
  include: { tags: { include: { tag: true } } };
}>;

export type SiteWithTags = Prisma.SiteGetPayload<{
  include: { tags: { include: { tag: true } } };
}>;

export function toTag(tag: PrismaTag): Tag {
  return {
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    scope: tag.scope as TagScope,
    color: tag.color,
    kind: tag.kind,
    sortOrder: tag.sortOrder,
  };
}

/** 标签聚合计数行（groupTag/siteTag 的 groupBy 输出） */
export interface TagFacetCount {
  tagId: string;
  _count: { _all: number };
}

/** 汇总标签筛选 facet：过滤已删标签后按 计数 desc → sortOrder asc → 名称 排序 */
export async function buildTagFacets(
  client: Pick<PrismaClient, 'tag'>,
  tagCounts: TagFacetCount[],
): Promise<TagFacet[]> {
  const tags = tagCounts.length
    ? await client.tag.findMany({ where: { id: { in: tagCounts.map((item) => item.tagId) } } })
    : [];
  const tagMap = new Map(tags.map((tag) => [tag.id, tag]));

  return tagCounts
    .map((item) => {
      const tag = tagMap.get(item.tagId);
      if (!tag) {
        return null;
      }
      return {
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        color: tag.color,
        count: item._count._all,
        sortOrder: tag.sortOrder,
        sortName: tag.name,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.count - a.count || a.sortOrder - b.sortOrder || a.sortName.localeCompare(b.sortName))
    .map(({ id, name, slug, color, count }) => ({ id, name, slug, color, count }));
}

export function toPublicUploader(
  user: Pick<PrismaUser, 'uid' | 'nickname' | 'avatarUrl'> | null | undefined,
): PublicUploader | null {
  if (!user || user.uid == null) return null;
  return { uid: user.uid, nickname: user.nickname, avatarUrl: user.avatarUrl };
}

export function serializeGroup(
  group: GroupWithTags & { uploader?: Pick<PrismaUser, 'uid' | 'nickname' | 'avatarUrl'> | null },
): Group {
  const result: Group = {
    id: group.id,
    name: group.name,
    groupNumber: group.groupNumber,
    type: group.type as GroupType,
    city: group.city,
    province: group.province,
    school: group.school,
    regionCode: group.regionCode as RegionCode | null,
    regionName: group.regionName,
    description: group.description,
    purpose: group.purpose,
    joinUrl: group.joinUrl,
    qrcodeUrl: group.qrcodeUrl,
    avatarUrl: group.avatarUrl,
    tags: group.tags.map((link) => toTag(link.tag)),
    published: group.published,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };

  if ('uploader' in group) {
    result.uploader = toPublicUploader(group.uploader);
  }

  return result;
}

export function serializeSite(
  site: SiteWithTags & { uploader?: Pick<PrismaUser, 'uid' | 'nickname' | 'avatarUrl'> | null },
): Site {
  const result: Site = {
    id: site.id,
    title: site.title,
    url: site.url,
    description: site.description,
    coverUrl: site.coverUrl,
    tags: site.tags.map((link) => toTag(link.tag)),
    published: site.published,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
  };

  if ('uploader' in site) {
    result.uploader = toPublicUploader(site.uploader);
  }

  return result;
}

// 列表场景不返回 contentHtml（可能很大），详情场景传 includeContentHtml = true
export function serializeActivity(
  activity: Prisma.ActivityGetPayload<Record<string, never>>,
  includeContentHtml = false,
): Activity | Omit<Activity, 'contentHtml'> {
  const base = {
    id: activity.id,
    title: activity.title,
    coverUrl: activity.coverUrl,
    description: activity.description,
    linkUrl: activity.linkUrl,
    startDate: activity.startDate?.toISOString() ?? null,
    endDate: activity.endDate?.toISOString() ?? null,
    published: activity.published,
    sortOrder: activity.sortOrder,
    createdAt: activity.createdAt.toISOString(),
    updatedAt: activity.updatedAt.toISOString(),
  };
  return includeContentHtml ? { ...base, contentHtml: activity.contentHtml } : base;
}

export function parseSubmissionPayload(payload: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(payload);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export interface SubmissionSubmitter {
  id: string;
  nickname: string;
  email: string;
}

export function serializeSubmission(
  submission: PrismaSubmission,
  target: unknown | null = null,
  submitter?: SubmissionSubmitter | null,
): Submission {
  const result: Submission = {
    id: submission.id,
    entityType: submission.entityType as EntityType,
    mode: submission.mode as SubmissionMode,
    targetId: submission.targetId,
    payload: parseSubmissionPayload(submission.payload),
    status: submission.status as SubmissionStatus,
    reviewNote: submission.reviewNote,
    submitterId: submission.submitterId,
    reviewerId: submission.reviewerId,
    createdAt: submission.createdAt.toISOString(),
    reviewedAt: submission.reviewedAt ? submission.reviewedAt.toISOString() : null,
    target,
  };

  if (submitter) {
    result.submitter = { id: submitter.id, nickname: submitter.nickname, email: submitter.email };
  }

  return result;
}

export const galleryUploaderSelect = { uid: true, nickname: true, avatarUrl: true } as const;

// 查询时可按需 include likes（仅当前用户的点赞记录），未登录时该字段缺失
export type GalleryImageRow = Prisma.GalleryImageGetPayload<{
  include: {
    uploader: { select: { uid: true; nickname: true; avatarUrl: true } };
    _count: { select: { likes: true; comments: true } };
  };
}> & { likes?: { userId: string }[] };

export function serializeGalleryImage(image: GalleryImageRow, viewerId: string | null = null): GalleryImage {
  const liked = Boolean(viewerId && image.likes?.some((like) => like.userId === viewerId));
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(image.tags ?? '[]');
    if (Array.isArray(parsed)) tags = parsed.filter((tag): tag is string => typeof tag === 'string');
  } catch {
    tags = [];
  }
  return {
    id: image.id,
    imageUrl: image.imageUrl,
    title: image.title,
    mediaType: (image.mediaType as GalleryImage['mediaType']) ?? null,
    imageWidth: image.imageWidth,
    imageHeight: image.imageHeight,
    description: image.description,
    tags,
    likeCount: image._count.likes,
    liked,
    commentCount: image._count.comments,
    published: image.published,
    createdAt: image.createdAt.toISOString(),
    uploader: toPublicUploader(image.uploader),
  };
}

export type GalleryCommentRow = Prisma.GalleryCommentGetPayload<{
  include: { user: { select: { uid: true; nickname: true; avatarUrl: true } } };
}>;

export function serializeGalleryComment(comment: GalleryCommentRow): GalleryCommentItem {
  return {
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    userId: comment.userId,
    user: toPublicUploader(comment.user),
  };
}
