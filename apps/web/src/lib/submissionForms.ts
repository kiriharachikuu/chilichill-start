import {
  GALLERY_MEDIA_TYPES,
  GROUP_PLATFORMS,
  GROUP_TYPES,
  GROUP_TYPE_LABELS,
  gallerySubmissionPayloadSchema,
  groupPayloadSchema,
  sitePayloadSchema,
  type GalleryMediaType,
  type GallerySubmissionPayload,
  type Group,
  type GroupPlatform,
  type GroupType,
  type Site,
} from '@spaceport/shared';

export type FieldErrors = Record<string, string>;

export interface GroupFormState {
  name: string;
  platform: GroupPlatform;
  groupNumber: string;
  type: GroupType | '';
  province: string;
  city: string;
  school: string;
  description: string;
  purpose: string;
  joinUrl: string;
  qrcodeUrl: string;
  avatarUrl: string;
  tags: string[];
}

export interface SiteFormState {
  title: string;
  url: string;
  description: string;
  coverUrl: string;
  tags: string[];
}

export function emptyGroupForm(): GroupFormState {
  return {
    name: '',
    platform: 'QQ',
    groupNumber: '',
    type: '',
    province: '',
    city: '',
    school: '',
    description: '',
    purpose: '',
    joinUrl: '',
    qrcodeUrl: '',
    avatarUrl: '',
    tags: [],
  };
}

export function emptySiteForm(): SiteFormState {
  return { title: '', url: '', description: '', coverUrl: '', tags: [] };
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function asTagIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export function groupFormFromPayload(payload: Record<string, unknown> | null | undefined): GroupFormState {
  const data = payload ?? {};
  const type = typeof data.type === 'string' && (GROUP_TYPES as readonly string[]).includes(data.type)
    ? (data.type as GroupType)
    : '';
  const platform =
    typeof data.platform === 'string' && (GROUP_PLATFORMS as readonly string[]).includes(data.platform)
      ? (data.platform as GroupPlatform)
      : 'QQ';
  return {
    name: asString(data.name),
    platform,
    groupNumber: asString(data.groupNumber),
    type,
    province: asString(data.province),
    city: asString(data.city),
    school: asString(data.school),
    description: asString(data.description),
    purpose: asString(data.purpose),
    joinUrl: asString(data.joinUrl),
    qrcodeUrl: asString(data.qrcodeUrl),
    avatarUrl: asString(data.avatarUrl),
    tags: asTagIds(data.tags),
  };
}

export function groupFormFromGroup(group: Group): GroupFormState {
  return {
    name: group.name,
    platform: group.platform ?? 'QQ',
    groupNumber: group.groupNumber ?? '',
    type: group.type,
    province: group.province ?? '',
    city: group.city ?? '',
    school: group.school ?? '',
    description: group.description,
    purpose: group.purpose ?? '',
    joinUrl: group.joinUrl ?? '',
    qrcodeUrl: group.qrcodeUrl ?? '',
    avatarUrl: group.avatarUrl ?? '',
    tags: group.tags.map((tag) => tag.id),
  };
}

export function siteFormFromPayload(payload: Record<string, unknown> | null | undefined): SiteFormState {
  const data = payload ?? {};
  return {
    title: asString(data.title),
    url: asString(data.url),
    description: asString(data.description),
    coverUrl: asString(data.coverUrl),
    tags: asTagIds(data.tags),
  };
}

export function siteFormFromSite(site: Site): SiteFormState {
  return {
    title: site.title,
    url: site.url,
    description: site.description,
    coverUrl: site.coverUrl ?? '',
    tags: site.tags.map((tag) => tag.id),
  };
}

export function groupPayloadFromForm(form: GroupFormState): Record<string, unknown> {
  const needCity = form.type === 'REGION' || form.type === 'COLLEGE';
  return {
    name: form.name.trim(),
    platform: form.platform,
    // 非 QQ 平台粉丝群不填群号；QQ 群号由 schema 校验必填
    groupNumber: form.platform === 'QQ' ? form.groupNumber.trim() : '',
    type: form.type,
    province: needCity && form.province ? form.province : null,
    city: needCity && form.city ? form.city : null,
    school: form.type === 'COLLEGE' && form.school.trim() ? form.school.trim() : null,
    description: form.description.trim(),
    purpose: form.purpose.trim() || null,
    joinUrl: form.joinUrl.trim() || null,
    qrcodeUrl: form.qrcodeUrl.trim() || null,
    avatarUrl: form.avatarUrl.trim() || null,
    tags: form.tags,
  };
}

export function sitePayloadFromForm(form: SiteFormState): Record<string, unknown> {
  return {
    title: form.title.trim(),
    url: form.url.trim(),
    description: form.description.trim(),
    coverUrl: form.coverUrl.trim() || null,
    tags: form.tags,
  };
}

function mapIssues(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function validateGroupForm(form: GroupFormState): {
  errors: FieldErrors;
  payload?: Record<string, unknown>;
} {
  if (!form.type) {
    return { errors: { type: '请先选择群类型' } };
  }
  const result = groupPayloadSchema.safeParse(groupPayloadFromForm(form));
  if (!result.success) {
    return { errors: mapIssues(result.error.issues) };
  }
  return { errors: {}, payload: result.data as Record<string, unknown> };
}

export function validateSiteForm(form: SiteFormState): {
  errors: FieldErrors;
  payload?: Record<string, unknown>;
} {
  const result = sitePayloadSchema.safeParse(sitePayloadFromForm(form));
  if (!result.success) {
    return { errors: mapIssues(result.error.issues) };
  }
  return { errors: {}, payload: result.data as Record<string, unknown> };
}

export function groupTypeLabel(type: GroupType | ''): string {
  return type ? GROUP_TYPE_LABELS[type] : '未选择类型';
}

export function submissionSummary(payload: Record<string, unknown> | null | undefined): string {
  const data = payload ?? {};
  const name = asString(data.name) || asString(data.title);
  return name || '未命名内容';
}

export function isGroupEntity(value: unknown): value is Group {
  return Boolean(value) && typeof value === 'object' && 'groupNumber' in (value as Record<string, unknown>);
}

export function isSiteEntity(value: unknown): value is Site {
  return Boolean(value) && typeof value === 'object' && 'url' in (value as Record<string, unknown>);
}

export interface GalleryFormState {
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  title: string;
  description: string;
  tagsInput: string;
  mediaType: GalleryMediaType | '';
}

export function emptyGalleryForm(): GalleryFormState {
  return {
    imageUrl: null,
    imageWidth: null,
    imageHeight: null,
    title: '',
    description: '',
    tagsInput: '',
    mediaType: '',
  };
}

// 画廊投稿 payload → 编辑表单：画廊标签存的是名称字符串（不是标签 id），直接拼回输入框
export function galleryFormFromPayload(
  payload: Record<string, unknown> | null | undefined,
): GalleryFormState {
  const data = payload ?? {};
  return {
    imageUrl: typeof data.imageUrl === 'string' && data.imageUrl ? data.imageUrl : null,
    imageWidth: typeof data.imageWidth === 'number' ? data.imageWidth : null,
    imageHeight: typeof data.imageHeight === 'number' ? data.imageHeight : null,
    title: asString(data.title),
    description: asString(data.description),
    tagsInput: asTagIds(data.tags).join(' '),
    mediaType:
      typeof data.mediaType === 'string' && (GALLERY_MEDIA_TYPES as readonly string[]).includes(data.mediaType)
        ? (data.mediaType as GalleryMediaType)
        : '',
  };
}

// 标签：逗号/空格分隔，去重，最多 8 个
export function parseGalleryTags(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(/[,，、\s]+/)) {
    const tag = raw.trim().replace(/^#/, '');
    if (tag && !seen.has(tag)) seen.add(tag);
  }
  return Array.from(seen).slice(0, 8);
}

export function validateGalleryForm(form: GalleryFormState): {
  errors: FieldErrors;
  payload?: GallerySubmissionPayload;
} {
  const errors: FieldErrors = {};
  if (!form.imageUrl) errors.image = '请上传作品图片';
  if (!form.mediaType || !(GALLERY_MEDIA_TYPES as readonly string[]).includes(form.mediaType)) {
    errors.mediaType = '请选择作品类型';
  }
  if (errors.image || errors.mediaType) return { errors };
  const result = gallerySubmissionPayloadSchema.safeParse({
    imageUrl: form.imageUrl,
    imageWidth: form.imageWidth,
    imageHeight: form.imageHeight,
    title: form.title.trim(),
    description: form.description.trim(),
    mediaType: form.mediaType,
    tags: parseGalleryTags(form.tagsInput),
  });
  if (!result.success) {
    return { errors: mapIssues(result.error.issues) };
  }
  return { errors: {}, payload: result.data };
}
