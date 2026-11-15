import { z } from 'zod';

export const GROUP_TYPES = ['GENERAL', 'REGION', 'COLLEGE', 'OTHER'] as const;
export type GroupType = (typeof GROUP_TYPES)[number];
export const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  GENERAL: '综合粉丝群',
  REGION: '地区粉丝群',
  COLLEGE: '院校粉丝群',
  OTHER: '其他类型',
};

export const REGIONS = [
  { code: 'NORTH', name: '华北' },
  { code: 'NORTHEAST', name: '东北' },
  { code: 'EAST', name: '华东' },
  { code: 'CENTRAL', name: '华中' },
  { code: 'SOUTH', name: '华南' },
  { code: 'SOUTHWEST', name: '西南' },
  { code: 'NORTHWEST', name: '西北' },
  { code: 'GAT', name: '港澳台' },
  { code: 'OVERSEAS', name: '海外' },
  { code: 'OTHER', name: '待定' },
] as const;
export type RegionCode = (typeof REGIONS)[number]['code'];
export const REGION_NAME: Record<string, string> = Object.fromEntries(
  REGIONS.map((region) => [region.code, region.name]),
) as Record<string, string>;
export const REGION_CODES = REGIONS.map((region) => region.code) as [string, ...string[]];

// 省级行政区 → 大区：城市选择器选省后，该省下辖城市自动归属对应大区。
const PROVINCE_REGION_FULL: Record<string, RegionCode> = {
  北京市: 'NORTH',
  天津市: 'NORTH',
  河北省: 'NORTH',
  山西省: 'NORTH',
  内蒙古自治区: 'NORTH',
  辽宁省: 'NORTHEAST',
  吉林省: 'NORTHEAST',
  黑龙江省: 'NORTHEAST',
  上海市: 'EAST',
  江苏省: 'EAST',
  浙江省: 'EAST',
  安徽省: 'EAST',
  福建省: 'EAST',
  江西省: 'EAST',
  山东省: 'EAST',
  河南省: 'CENTRAL',
  湖北省: 'CENTRAL',
  湖南省: 'CENTRAL',
  广东省: 'SOUTH',
  广西壮族自治区: 'SOUTH',
  海南省: 'SOUTH',
  重庆市: 'SOUTHWEST',
  四川省: 'SOUTHWEST',
  贵州省: 'SOUTHWEST',
  云南省: 'SOUTHWEST',
  西藏自治区: 'SOUTHWEST',
  陕西省: 'NORTHWEST',
  甘肃省: 'NORTHWEST',
  青海省: 'NORTHWEST',
  宁夏回族自治区: 'NORTHWEST',
  新疆维吾尔自治区: 'NORTHWEST',
  香港特别行政区: 'GAT',
  澳门特别行政区: 'GAT',
  台湾省: 'GAT',
};

export function normalizeProvinceName(name: string): string {
  return name.replace(/特别行政区|维吾尔|壮族|回族|自治区|省|市/g, '');
}

// 同时收录全称与简称（北京市/北京、广东省/广东），存量数据可命中。
export const PROVINCE_REGIONS: Record<string, RegionCode> = {};
for (const [name, code] of Object.entries(PROVINCE_REGION_FULL)) {
  PROVINCE_REGIONS[name] = code;
  PROVINCE_REGIONS[normalizeProvinceName(name)] = code;
}

export function provinceRegionCode(province: string | null | undefined): RegionCode | null {
  if (!province) return null;
  const name = province.trim();
  return PROVINCE_REGIONS[name] ?? PROVINCE_REGIONS[normalizeProvinceName(name)] ?? null;
}

// 直辖市等区划数据中的市级占位名（如「市辖区」），展示时需拼接省名。
export const MUNICIPAL_CITY_NAMES = ['市辖区', '县'];

export function formatLocation(
  province: string | null | undefined,
  city: string | null | undefined,
): string {
  if (!city) return '';
  return province && MUNICIPAL_CITY_NAMES.includes(city) ? `${province}${city}` : city;
}

export const TAG_SCOPES = ['GROUP', 'SITE', 'BOTH'] as const;
export type TagScope = (typeof TAG_SCOPES)[number];
export const SUBMISSION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  PENDING: '待审核',
  APPROVED: '已通过',
  REJECTED: '已驳回',
};
export const ENTITY_TYPES = ['GROUP', 'SITE', 'GALLERY'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
export const ENTITY_TYPE_LABELS: Record<string, string> = { GROUP: 'Q群', SITE: '网站', GALLERY: '画廊作品' };
export const SUBMISSION_MODES = ['CREATE', 'UPDATE'] as const;
export type SubmissionMode = (typeof SUBMISSION_MODES)[number];

export interface Tag {
  id: string;
  name: string;
  slug: string;
  scope: TagScope;
  color: string;
  kind: string | null;
  sortOrder: number;
}

export interface PublicUploader {
  uid: number;
  nickname: string;
  avatarUrl: string | null;
}

export interface Group {
  id: string;
  name: string;
  groupNumber: string;
  type: GroupType;
  city: string | null;
  province: string | null;
  school: string | null;
  regionCode: RegionCode | null;
  regionName: string | null;
  description: string;
  purpose: string | null;
  joinUrl: string | null;
  qrcodeUrl: string | null;
  avatarUrl: string | null;
  tags: Tag[];
  published: boolean;
  createdAt: string;
  updatedAt: string;
  uploader?: PublicUploader | null;
}

export interface Site {
  id: string;
  title: string;
  url: string;
  description: string;
  coverUrl: string | null;
  tags: Tag[];
  published: boolean;
  createdAt: string;
  updatedAt: string;
  uploader?: PublicUploader | null;
}

// 个人空间公开资料（uid 为 6 位纯数字，用于 /space/:uid 地址）
export interface UserProfile {
  uid: number;
  nickname: string;
  avatarUrl: string | null;
  bio: string | null;
  province: string | null;
  city: string | null;
  createdAt: string;
}

export interface SpaceResponse {
  user: UserProfile;
  counts: {
    groups: number;
    sites: number;
  };
}

export type SpaceResourceType = 'GROUP' | 'SITE';
export type SpaceResourceItem = Group | Site;
export type SpaceResourcesResponse = Paginated<SpaceResourceItem>;

export interface Submission {
  id: string;
  entityType: EntityType;
  mode: SubmissionMode;
  targetId: string | null;
  payload: Record<string, unknown>;
  status: SubmissionStatus;
  reviewNote: string | null;
  submitterId: string;
  submitter?: { id: string; nickname: string; email: string } | null;
  reviewerId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  target?: unknown | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FacetItem {
  key: string;
  label: string;
  count: number;
}

export interface TagFacet {
  id: string;
  name: string;
  slug: string;
  color: string;
  count: number;
}

export interface GroupListResponse extends Paginated<Group> {
  facets: {
    regions: { code: string; name: string; count: number }[];
    types: { key: GroupType; label: string; count: number }[];
    tags: TagFacet[];
  };
}

export interface SiteListResponse extends Paginated<Site> {
  facets: { tags: TagFacet[] };
}

export interface MetaResponse {
  regions: { code: string; name: string; cityCount: number }[];
  cities: { city: string; regionCode: string; regionName: string; province: string | null }[];
  tags: { group: Tag[]; sites: Tag[] };
  stats: { groups: number; sites: number; galleryImages: number; pendingSubmissions: number };
  modules: NavModule[];
}

export interface NavModule {
  key: string;
  label: string;
  path: string;
  icon: string;
  enabled: boolean;
}

const tagIds = z.array(z.string().min(1)).max(8).default([]);

// 历届活动（后台维护，首页活动看板展示）
export interface Activity {
  id: string;
  title: string;
  coverUrl: string | null;
  description: string | null;
  linkUrl: string | null;
  contentHtml: string | null;
  startDate: string | null;
  endDate: string | null;
  published: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// 列表接口不返回 contentHtml（可能很大），详情接口才返回
export interface ActivityListResponse extends Paginated<Omit<Activity, 'contentHtml'>> {}

export type ActivityStatus = 'UPCOMING' | 'ONGOING' | 'ENDED';

/** 按起止时间推导活动状态；未配置日期返回 null（视为历届存档） */
export function activityStatusOf(
  activity: Pick<Activity, 'startDate' | 'endDate'>,
  now: Date = new Date(),
): ActivityStatus | null {
  if (!activity.startDate) return null;
  const start = new Date(activity.startDate).getTime();
  const end = activity.endDate ? new Date(activity.endDate).getTime() : null;
  if (Number.isNaN(start)) return null;
  if (now.getTime() < start) return 'UPCOMING';
  if (end !== null && !Number.isNaN(end) && now.getTime() > end) return 'ENDED';
  return 'ONGOING';
}

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  UPCOMING: '未开始',
  ONGOING: '进行中',
  ENDED: '已结束',
};

export const activityPayloadSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(60, '标题最多 60 个字'),
  coverUrl: z.string().trim().max(1000).optional().or(z.literal('')).nullable(),
  description: z.string().trim().max(200, '简介最多 200 个字').optional().or(z.literal('')).nullable(),
  linkUrl: z
    .string()
    .trim()
    .url('外链格式不正确')
    .max(300)
    .optional()
    .or(z.literal(''))
    .nullable(),
  // 后台粘贴或上传的自定义活动页 HTML（空串视为未配置）
  contentHtml: z.string().max(300_000, '自定义页面内容过大（上限 300KB）').optional().or(z.literal('')).nullable(),
  startDate: z.string().trim().max(40).optional().or(z.literal('')).nullable(),
  endDate: z.string().trim().max(40).optional().or(z.literal('')).nullable(),
  published: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type ActivityPayload = z.infer<typeof activityPayloadSchema>;

// 详情页地址：/activities/:id
export function activityHref(id: string): string {
  return `/activities/${id}`;
}

export const groupPayloadSchema = z
  .object({
    name: z.string().trim().min(2, '群名至少 2 个字').max(40),
    groupNumber: z.string().trim().regex(/^\d{5,12}$/, '群号需为 5-12 位数字'),
    type: z.enum(GROUP_TYPES),
    city: z.string().trim().max(30).optional().nullable(),
    province: z.string().trim().max(30).optional().nullable(),
    school: z.string().trim().max(40).optional().nullable(),
    description: z.string().trim().min(5, '群简介至少 5 个字').max(200),
    purpose: z.string().trim().max(120).optional().nullable(),
    joinUrl: z
      .string()
      .trim()
      .url('加入链接格式不正确')
      .max(300)
      .optional()
      .or(z.literal(''))
      .nullable(),
    qrcodeUrl: z.string().trim().max(300).optional().nullable(),
    avatarUrl: z.string().trim().max(300).optional().nullable(),
    tags: tagIds,
  })
  .superRefine((v, ctx) => {
    if ((v.type === 'REGION' || v.type === 'COLLEGE') && !v.city) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['city'],
        message: v.type === 'REGION' ? '地区粉丝群必须勾选城市' : '院校粉丝群必须勾选城市',
      });
    }
    if ((v.type === 'REGION' || v.type === 'COLLEGE') && v.city && !v.province) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['province'], message: '请选择省份' });
    }
    if ((v.type === 'GENERAL' || v.type === 'OTHER') && v.city) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['city'], message: '该类型群不需要选择城市' });
    }
    if (v.type === 'COLLEGE' && !v.school) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['school'], message: '请填写学校名称' });
    }
    if ((v.type === 'GENERAL' || v.type === 'OTHER') && v.tags.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tags'],
        message: '该类型群需至少选择一个标签',
      });
    }
  });
export type GroupPayload = z.infer<typeof groupPayloadSchema>;

export const sitePayloadSchema = z.object({
  title: z.string().trim().min(1).max(40),
  url: z.string().trim().url('网站链接格式不正确').max(300),
  description: z.string().trim().min(5, '简介至少 5 个字').max(200),
  coverUrl: z.string().trim().max(300).optional().or(z.literal('')).nullable(),
  tags: z.array(z.string().min(1)).min(1, '至少选择一个标签').max(8),
});
export type SitePayload = z.infer<typeof sitePayloadSchema>;

export const submissionCreateSchema = z
  .object({
    entityType: z.enum(ENTITY_TYPES),
    mode: z.enum(SUBMISSION_MODES).default('CREATE'),
    targetId: z.string().min(1).optional().nullable(),
    payload: z.record(z.string(), z.unknown()),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'UPDATE' && !v.targetId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetId'], message: '修改投稿必须指定目标内容' });
    }
  });
export type SubmissionCreateInput = z.infer<typeof submissionCreateSchema>;

// 个人资料修改：昵称、头像、自我介绍、地区（省→市，复用城市选择器数据）
export const profileUpdateSchema = z.object({
  nickname: z.string().trim().min(1, '昵称不能为空').max(20, '昵称最多 20 个字').optional(),
  avatarUrl: z.string().trim().max(300).optional().nullable(),
  bio: z.string().trim().max(200, '自我介绍最多 200 个字').optional().nullable(),
  province: z.string().trim().max(30).optional().nullable(),
  city: z.string().trim().max(30).optional().nullable(),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/** 个人空间地址：/space/:uid */
export function spaceHref(uid: number): string {
  return `/space/${uid}`;
}

// ─── 画廊 ───────────────────────────────────────────────────────────────────

export interface GalleryImage {
  id: string;
  imageUrl: string;
  title: string | null;
  mediaType: 'PAINTING' | 'PHOTOGRAPHY' | null;
  imageWidth: number | null;
  imageHeight: number | null;
  description: string | null;
  tags: string[];
  likeCount: number;
  liked: boolean;
  commentCount: number;
  published: boolean;
  createdAt: string;
  uploader?: PublicUploader | null;
}

export const GALLERY_MEDIA_TYPES = ['PAINTING', 'PHOTOGRAPHY'] as const;
export type GalleryMediaType = (typeof GALLERY_MEDIA_TYPES)[number];
export const GALLERY_MEDIA_TYPE_LABELS: Record<GalleryMediaType, string> = {
  PAINTING: '绘画',
  PHOTOGRAPHY: '摄影',
};

export interface GalleryListResponse extends Paginated<GalleryImage> {
  hasMore: boolean;
}

export interface GalleryCommentItem {
  id: string;
  content: string;
  createdAt: string;
  userId: string;
  user: PublicUploader | null;
}

export interface GalleryCommentListResponse extends Paginated<GalleryCommentItem> {
  hasMore: boolean;
}

// 点赞 toggle 结果
export interface GalleryLikeState {
  imageId: string;
  liked: boolean;
  likeCount: number;
}

export const galleryPayloadSchema = z.object({
  imageUrl: z.string().trim().min(1, '请上传图片').max(1000, '图片地址过长'),
  title: z.string().trim().max(40, '标题最多 40 个字').optional().or(z.literal('')).nullable(),
  published: z.boolean().optional(),
  mediaType: z.enum(GALLERY_MEDIA_TYPES).optional().nullable(),
  imageWidth: z.number().int().positive().optional().nullable(),
  imageHeight: z.number().int().positive().optional().nullable(),
  description: z.string().trim().max(200, '描述最多 200 个字').optional().or(z.literal('')).nullable(),
  tags: z.array(z.string().trim().min(1).max(12, '单个标签最多 12 个字')).max(8, '标签最多 8 个').optional(),
});
export type GalleryPayload = z.infer<typeof galleryPayloadSchema>;

// 粉丝投稿画廊作品的 payload（走待审核队列，审核通过后创建 GalleryImage）
export const gallerySubmissionPayloadSchema = z.object({
  imageUrl: z.string().trim().min(1, '请上传图片').max(1000, '图片地址过长'),
  imageWidth: z.number().int().positive().max(20000).optional().nullable(),
  imageHeight: z.number().int().positive().max(20000).optional().nullable(),
  title: z.string().trim().min(1, '标题不能为空').max(40, '标题最多 40 个字'),
  description: z.string().trim().max(200, '描述最多 200 个字').optional().or(z.literal('')),
  mediaType: z.enum(GALLERY_MEDIA_TYPES, { error: '请选择作品类型' }),
  tags: z
    .array(z.string().trim().min(1, '标签不能为空').max(12, '单个标签最多 12 个字'))
    .max(8, '标签最多 8 个')
    .default([]),
});
export type GallerySubmissionPayload = z.infer<typeof gallerySubmissionPayloadSchema>;

export const galleryCommentSchema = z.object({
  content: z.string().trim().min(1, '评论不能为空').max(200, '评论最多 200 个字'),
});
export type GalleryCommentInput = z.infer<typeof galleryCommentSchema>;

// ─── 角色与用户组 ────────────────────────────────────────────────────────────
// USER 普通成员 / MODERATOR 审核组（举报与投稿审核）/ ADMIN 站长
export const ROLES = ['USER', 'MODERATOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABELS: Record<Role, string> = {
  USER: '成员',
  MODERATOR: '审核组',
  ADMIN: '管理员',
};

// ─── 评论举报 ────────────────────────────────────────────────────────────────
export const REPORT_STATUSES = ['PENDING', 'RESOLVED', 'DISMISSED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  PENDING: '待处理',
  RESOLVED: '已处理（评论已删除）',
  DISMISSED: '已驳回',
};

export const commentReportSchema = z.object({
  reason: z.string().trim().min(2, '举报原因至少 2 个字').max(200, '举报原因最多 200 个字'),
});
export type CommentReportInput = z.infer<typeof commentReportSchema>;

export interface CommentReport {
  id: string;
  commentId: string | null;
  commentContent: string;
  commentUserId: string | null;
  commentUserNickname: string | null;
  reporterId: string;
  reporter?: { id: string; nickname: string; email: string } | null;
  reason: string;
  status: ReportStatus;
  handledAt: string | null;
  handledBy?: { id: string; nickname: string } | null;
  createdAt: string;
}

export interface CommentReportListResponse extends Paginated<CommentReport> {}

// ─── 系统设置（存储配置） ─────────────────────────────────────────────────────
export const STORAGE_MODES = ['local', 'cos', 'oss'] as const;
export type StorageMode = (typeof STORAGE_MODES)[number];
export const STORAGE_MODE_LABELS: Record<StorageMode, string> = {
  local: '本地存储',
  cos: '腾讯云 COS',
  oss: '阿里云 OSS',
};

export interface CosStorageConfig {
  secretId: string;
  secretKey: string;
  bucket: string;
  region: string;
  baseUrl: string | null;
}

export interface OssStorageConfig {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  endpoint: string | null;
  baseUrl: string | null;
}

export interface StorageSettings {
  mode: StorageMode;
  cos: CosStorageConfig | null;
  oss: OssStorageConfig | null;
}

// 保存时 secret 类字段可传该哨兵表示「保留现有值」，避免明文回传前端
export const STORAGE_SECRET_KEEP = '__KEEP__';

const secretField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label}不能为空`)
    .max(200, `${label}过长`)
    .or(z.literal(STORAGE_SECRET_KEEP));

export const storageSettingsSchema = z
  .object({
    mode: z.enum(STORAGE_MODES, { error: '请选择存储模式' }),
    cos: z
      .object({
        secretId: z.string().trim().min(1, 'SecretId 不能为空').max(200, 'SecretId 过长').or(z.literal(STORAGE_SECRET_KEEP)),
        secretKey: secretField('SecretKey'),
        bucket: z.string().trim().min(1, 'Bucket 不能为空').max(100, 'Bucket 过长'),
        region: z.string().trim().min(1, '地域不能为空').max(50, '地域过长'),
        baseUrl: z
          .string()
          .trim()
          .max(300, '访问域名过长')
          .optional()
          .or(z.literal(''))
          .nullable()
          .transform((value) => (value ? value : null)),
      })
      .optional()
      .nullable(),
    oss: z
      .object({
        accessKeyId: z.string().trim().min(1, 'AccessKeyId 不能为空').max(200, 'AccessKeyId 过长').or(z.literal(STORAGE_SECRET_KEEP)),
        accessKeySecret: secretField('AccessKeySecret'),
        bucket: z.string().trim().min(1, 'Bucket 不能为空').max(100, 'Bucket 过长'),
        region: z.string().trim().min(1, '地域不能为空').max(50, '地域过长'),
        endpoint: z
          .string()
          .trim()
          .max(300, 'Endpoint 过长')
          .optional()
          .or(z.literal(''))
          .nullable()
          .transform((value) => (value ? value : null)),
        baseUrl: z
          .string()
          .trim()
          .max(300, '访问域名过长')
          .optional()
          .or(z.literal(''))
          .nullable()
          .transform((value) => (value ? value : null)),
      })
      .optional()
      .nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === 'cos' && !value.cos) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cos'],
        message: '请填写腾讯云 COS 配置参数',
      });
    }
    if (value.mode === 'oss' && !value.oss) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['oss'],
        message: '请填写阿里云 OSS 配置参数',
      });
    }
  });
export type StorageSettingsInput = z.infer<typeof storageSettingsSchema>;

// 后台操作审计日志（用户组调整等敏感操作）
export interface AdminAuditLog {
  id: string;
  actorId: string;
  actorNickname: string;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
}

export interface AdminAuditLogListResponse extends Paginated<AdminAuditLog> {}
