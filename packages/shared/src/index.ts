import { z } from 'zod';

export const GROUP_TYPES = ['GENERAL', 'REGION', 'COLLEGE', 'OTHER'] as const;
export type GroupType = (typeof GROUP_TYPES)[number];
export const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  GENERAL: '综合粉丝群',
  REGION: '地区粉丝群',
  COLLEGE: '院校粉丝群',
  OTHER: '其他类型',
};

// 粉丝群所属平台：QQ 群可凭群号自动抓取头像，其余平台仅上传二维码与头像
export const GROUP_PLATFORMS = ['QQ', 'WEIBO', 'XIUDONG', 'XIAOHONGSHU'] as const;
export type GroupPlatform = (typeof GROUP_PLATFORMS)[number];
export const GROUP_PLATFORM_LABELS: Record<GroupPlatform, string> = {
  QQ: 'QQ 群',
  WEIBO: '微博粉丝群',
  XIUDONG: '秀动粉丝群',
  XIAOHONGSHU: '小红书粉丝群',
};

// QQ 群官方头像接口，{number} 为群号，640 为尺寸档位
export function qqGroupAvatarUrl(groupNumber: string): string {
  return `https://p.qlogo.cn/gh/${groupNumber}/${groupNumber}/640/`;
}

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
  platform: GroupPlatform;
  // 仅 QQ 群有群号；微博 / 秀动 / 小红书粉丝群只提供二维码与头像
  groupNumber: string | null;
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
  bannerUrl: string | null;
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
    gallery: number;
  };
}

export type SpaceResourceType = 'GROUP' | 'SITE' | 'GALLERY';
export type SpaceResourceItem = Group | Site | GalleryImage;
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

// ===== 后台仪表盘（/api/admin/dashboard）=====
export interface AdminDashboardStats {
  pendingSubmissions: number;
  totalSubmissions: number;
  // 今日 0 点起的新增投稿数（服务器本地时区）
  todaySubmissions: number;
  approvedSubmissions: number;
  rejectedSubmissions: number;
  groups: number;
  sites: number;
  activities: number;
  galleryImages: number;
  galleryLikes: number;
  galleryComments: number;
  users: number;
  pendingReports: number;
}

// 后台敏感操作审计条目（仪表盘「最近动态」展示用）
export interface AdminAuditLogItem {
  id: string;
  actorNickname: string;
  action: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
}

export interface AdminDashboardResponse {
  stats: AdminDashboardStats;
  // 待审核队列里最新的几条投稿（点击进审核台处理）
  recentSubmissions: Submission[];
  recentAuditLogs: AdminAuditLogItem[];
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
  regions: { code: string; name: string; cityCount: number; groupCount: number }[];
  cities: { city: string; regionCode: string; regionName: string; province: string | null }[];
  tags: { group: Tag[]; sites: Tag[] };
  stats: {
    groups: number;
    sites: number;
    galleryImages: number;
    pendingSubmissions: number;
    // 最近一次内容更新时间（群舱/站点/画廊取最大 updatedAt），用于首页「最近更新」展示
    latestContentAt: string | null;
  };
  modules: NavModule[];
  registration: { emailCodeRequired: boolean };
  // 站点信息（备案号/联系邮箱/赞助支持），About 页从 meta 读取，后台「站点信息」可改
  about: SiteSettings;
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
    platform: z.enum(GROUP_PLATFORMS),
    // 群号仅 QQ 群必填；其余平台粉丝群没有群号，留空即可
    groupNumber: z
      .string()
      .trim()
      .regex(/^\d{5,12}$/, '群号需为 5-12 位数字')
      .optional()
      .or(z.literal('')),
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
      .max(2000, '加入链接过长，最多 2000 个字符')
      .optional()
      .or(z.literal(''))
      .nullable(),
    qrcodeUrl: z.string().trim().max(300).optional().nullable(),
    avatarUrl: z.string().trim().max(300).optional().nullable(),
    tags: tagIds,
  })
  .superRefine((v, ctx) => {
    if (v.platform === 'QQ') {
      if (!v.groupNumber || !/^\d{5,12}$/.test(v.groupNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['groupNumber'],
          message: 'QQ 群需填写 5-12 位数字群号',
        });
      }
    } else if (v.groupNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['groupNumber'],
        message: '该平台粉丝群无需填写群号',
      });
    }
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

// 个人资料修改：昵称、头像、空间头图、自我介绍、地区（省→市，复用城市选择器数据）
export const profileUpdateSchema = z.object({
  nickname: z.string().trim().min(1, '昵称不能为空').max(20, '昵称最多 20 个字').optional(),
  avatarUrl: z.string().trim().max(300).optional().nullable(),
  bannerUrl: z.string().trim().max(300).optional().nullable(),
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

// “收到的互动”：他人对当前用户发布的画廊作品产生的点赞与评论
export interface ReceivedInteractionImage {
  id: string;
  imageUrl: string;
  title: string | null;
}

export interface ReceivedLikeItem {
  id: string;
  createdAt: string;
  user: PublicUploader | null;
  image: ReceivedInteractionImage;
}

export interface ReceivedLikeListResponse extends Paginated<ReceivedLikeItem> {}

export interface ReceivedCommentItem {
  id: string;
  content: string;
  createdAt: string;
  user: PublicUploader | null;
  image: ReceivedInteractionImage | null;
}

export interface ReceivedCommentListResponse extends Paginated<ReceivedCommentItem> {}

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

// ─── 权限配置表：权限 → 角色映射 ──────────────────────────────────────────────
// 后端审核接口与前端后台入口可见性共用；新增权限时在 ROLE_PERMISSIONS 补上映射即可。
export const PERMISSIONS = {
  REVIEW_VIEW: 'review:view', // 查看审核台（待审核列表 / 已审核记录 / 筛选查询）
  REVIEW_DECIDE: 'review:decide', // 同意 / 驳回他人投稿
  REVIEW_SELF: 'review:self', // 审核自己提交的投稿（仅管理员）
  REVIEW_BATCH: 'review:batch', // 批量审核
  REPORT_MANAGE: 'report:manage', // 评论举报管理
  PENALTY_MANAGE: 'penalty:manage', // 处罚管理（处罚记录查询；撤销仅限管理员）
  CONTENT_MANAGE: 'content:manage', // 内容 / 活动 / 画廊 / 标签 / 分类规则管理
  USER_MANAGE: 'user:manage', // 用户管理
  SYSTEM_MANAGE: 'system:manage', // 系统设置
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  USER: [],
  MODERATOR: [
    PERMISSIONS.REVIEW_VIEW,
    PERMISSIONS.REVIEW_DECIDE,
    PERMISSIONS.REVIEW_BATCH,
    PERMISSIONS.REPORT_MANAGE,
    PERMISSIONS.PENALTY_MANAGE,
  ],
  ADMIN: Object.values(PERMISSIONS),
};

/** 判断角色是否持有指定权限；未知角色一律视为无权限 */
export function hasPermission(role: Role | string | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  const grants = ROLE_PERMISSIONS[role as Role];
  return Array.isArray(grants) && grants.includes(permission);
}

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

// 举报核实后的自动处罚响应：penalty 为本次核实触发的处罚（未触发时为 null）
export interface ReportResolveResponse {
  item: CommentReport;
  penalty: AppliedPenaltySummary | null;
}

export interface AppliedPenaltySummary {
  id: string;
  userId: string;
  userUid: number | null;
  userNickname: string | null;
  type: PenaltyType;
  durationDays: number | null;
  startedAt: string;
  endsAt: string | null;
  reason: string;
}

// ─── 举报处罚（警告 / 禁言 / 封号） ────────────────────────────────────────────
// 阶梯规则：前 3 次核实举报仅警告；警告满 3 次后按 3/7/15 天阶梯禁言；禁言满 3 次永久封号。
// 撤销处罚会同步回退有效计数，阶梯始终按「有效处罚记录」实时重算。
export const PENALTY_TYPES = ['WARNING', 'MUTE', 'BAN'] as const;
export type PenaltyType = (typeof PENALTY_TYPES)[number];
export const PENALTY_TYPE_LABELS: Record<PenaltyType, string> = {
  WARNING: '警告',
  MUTE: '禁言',
  BAN: '永久封号',
};

export const WARNING_LIMIT = 3;
export const MUTE_LIMIT = 3;
export const MUTE_DURATION_DAYS = [3, 7, 15] as const;

export interface DerivedPenalty {
  type: PenaltyType;
  /** 禁言天数；警告与封号为 null */
  durationDays: number | null;
}

/**
 * 根据用户当前有效处罚计数（有效警告数 / 有效禁言数）推导下一次核实举报触发的处罚：
 * - warningCount < 3 → 警告（第 1~3 次核实举报）
 * - 警告满 3 次后取阶梯天数：已禁言 0 次→3 天、1 次→7 天、2 次→15 天
 * - 禁言满 3 次 → 永久封号
 */
export function derivePenalty(warningCount: number, muteCount: number): DerivedPenalty {
  if (warningCount < WARNING_LIMIT) {
    return { type: 'WARNING', durationDays: null };
  }
  if (muteCount < MUTE_LIMIT) {
    return { type: 'MUTE', durationDays: MUTE_DURATION_DAYS[muteCount] };
  }
  return { type: 'BAN', durationDays: null };
}

export interface Penalty {
  id: string;
  userId: string;
  userUid: number | null;
  userNickname: string | null;
  type: PenaltyType;
  durationDays: number | null;
  startedAt: string;
  endsAt: string | null;
  reason: string;
  evidenceReportIds: string[];
  operatorId: string | null;
  operatorNickname: string | null;
  revokedAt: string | null;
  revokedByNickname: string | null;
  revokeReason: string | null;
  createdAt: string;
}

export interface PenaltyListResponse extends Paginated<Penalty> {}

// 小黑屋公示条目：仅暴露 uid、处罚类型、时长、起止时间与违规事由（不含邮箱等隐私字段）
export interface PublicPenalty {
  id: string;
  userUid: number | null;
  type: PenaltyType;
  durationDays: number | null;
  startedAt: string;
  endsAt: string | null;
  reason: string;
}

export interface PublicPenaltyListResponse extends Paginated<PublicPenalty> {}

// 用户处罚状态（实时）：累计有效警告/禁言次数、当前生效禁言与剩余时长、封号状态
export interface PenaltyStatus {
  warningCount: number;
  muteCount: number;
  banned: boolean;
  bannedAt: string | null;
  activeMute: {
    id: string;
    startedAt: string;
    endsAt: string;
    remainingSeconds: number;
  } | null;
}

// 随 /api/auth/* 返回的处罚状态摘要：前端据此禁用评论框、展示封禁/禁言提示
export interface UserPenaltyState {
  banned: boolean;
  /** 当前生效禁言的结束时间；无生效禁言为 null */
  mutedUntil: string | null;
  warningCount: number;
  muteCount: number;
}

export const penaltyRevokeSchema = z.object({
  reason: z.string().trim().min(2, '撤销原因至少 2 个字').max(200, '撤销原因最多 200 个字'),
});
export type PenaltyRevokeInput = z.infer<typeof penaltyRevokeSchema>;

// ─── 站内系统通知（处罚触发 / 撤销等） ────────────────────────────────────────
export const NOTIFICATION_TYPES = ['PENALTY', 'PENALTY_REVOKED'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  PENALTY: '处罚通知',
  PENALTY_REVOKED: '处罚撤销通知',
};

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  content: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse extends Paginated<NotificationItem> {}

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

// 邮件发送设置（后台可改，数据库优先、环境变量兜底）
export interface MailSettings {
  apiKey: string; // 读取时脱敏：已配置时为 MAIL_SECRET_KEEP
  from: string;
  fromName: string;
  replyTo: string | null;
}

export const MAIL_SECRET_KEEP = '__KEEP__';

export const mailSettingsSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(1, 'Resend API Key 不能为空')
    .max(200, 'Resend API Key 过长')
    .or(z.literal(MAIL_SECRET_KEEP)),
  from: z.string().trim().email('发件地址必须是纯邮箱地址').max(200, '发件地址过长'),
  fromName: z.string().trim().min(1, '发件人名称不能为空').max(60, '发件人名称过长'),
  replyTo: z
    .string()
    .trim()
    .email('回复地址必须是纯邮箱地址')
    .max(200, '回复地址过长')
    .optional()
    .or(z.literal(''))
    .nullable()
    .transform((value) => (value ? value : null)),
});
export type MailSettingsInput = z.infer<typeof mailSettingsSchema>;

// 注册设置（后台可改）
export interface RegistrationSettings {
  emailCodeRequired: boolean;
}

export const registrationSettingsSchema = z.object({
  emailCodeRequired: z.boolean({ error: '请选择注册是否需要邮箱验证码' }),
});

// 站点信息设置（About 页展示内容：备案号、联系邮箱、赞助支持，后台可改；均为可选，留空不展示）
export interface SiteSettings {
  icpNumber: string | null;
  contactEmail: string | null;
  sponsorNote: string | null;
  sponsorImages: string[];
}

export const SITE_SETTINGS_EMPTY: SiteSettings = {
  icpNumber: null,
  contactEmail: null,
  sponsorNote: null,
  sponsorImages: [],
};

const optionalTextField = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}最多 ${max} 个字`)
    .optional()
    .or(z.literal(''))
    .nullable()
    .transform((value) => (value ? value : null));

export const siteSettingsSchema = z.object({
  icpNumber: optionalTextField(60, '备案号'),
  contactEmail: z
    .string()
    .trim()
    .max(200, '联系邮箱过长')
    .optional()
    .or(z.literal(''))
    .nullable()
    .transform((value) => (value ? value : null))
    .refine((value) => !value || /^\S+@\S+\.\S+$/.test(value), { message: '联系邮箱格式不正确' }),
  sponsorNote: optionalTextField(200, '赞助说明'),
  // 赞助图片：最多 10 张（赞赏码、收款截图等），元素去空格后过滤空串
  sponsorImages: z
    .array(z.string().trim().max(1000, '赞助图片地址过长'))
    .max(10, '最多上传 10 张赞助图片')
    .optional()
    .nullable()
    .transform((value) => (value ?? []).filter((url) => url.length > 0)),
});

// QQ 机器人推送分类型开关（旧存储数据缺省视为全开，保持既有行为）
export interface QQBotNotifySettings {
  submission: boolean; // 投稿提醒（新增/修改投稿）
  report: boolean; // 评论举报提醒
  dailyReport: boolean; // 每日数据日报
}

// QQ 机器人提醒设置（投稿/举报等审核事件通过 QQ 官方机器人推送提醒；AppSecret 读取时脱敏）
export interface QQBotSettings {
  appId: string;
  appSecret: string; // 读取时脱敏：已配置时为 QQ_BOT_SECRET_KEEP
  groupOpenId: string | null; // QQ 群聊的 openid（群场景推送目标）
  channelId: string | null; // 频道文字子频道 ID（频道场景推送目标）
  enabled: boolean;
  notify: QQBotNotifySettings;
  dailyReportTime: string; // 每日日报发送时间 HH:mm（Asia/Shanghai）
}

export const QQ_BOT_SECRET_KEEP = '__KEEP__';
export const QQ_BOT_DEFAULT_DAILY_REPORT_TIME = '10:00';
export const QQ_BOT_DEFAULT_NOTIFY: QQBotNotifySettings = {
  submission: true,
  report: true,
  dailyReport: true,
};

// HH:mm 格式（小时 00-23，分钟 00-59）
export const QQ_BOT_DAILY_REPORT_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// 测试推送类型：general 为基础连通性测试，其余发送对应类型的真实文案（日报为当前真实统计数据）
export type QQBotTestType = 'general' | 'submission' | 'report' | 'daily';

export const qqBotSettingsSchema = z.object({
  appId: z.string().trim().min(1, 'AppID 不能为空').max(64, 'AppID 过长'),
  appSecret: z
    .string()
    .trim()
    .min(1, 'AppSecret 不能为空')
    .max(200, 'AppSecret 过长')
    .or(z.literal(QQ_BOT_SECRET_KEEP)),
  groupOpenId: optionalTextField(64, '群 OpenID'),
  channelId: optionalTextField(64, '子频道 ID'),
  enabled: z.boolean({ error: '请选择是否启用 QQ 机器人提醒' }),
  notify: z
    .object({
      submission: z.boolean(),
      report: z.boolean(),
      dailyReport: z.boolean(),
    })
    .default(QQ_BOT_DEFAULT_NOTIFY),
  dailyReportTime: z
    .string()
    .regex(QQ_BOT_DAILY_REPORT_TIME_PATTERN, '日报时间格式应为 HH:mm')
    .default(QQ_BOT_DEFAULT_DAILY_REPORT_TIME),
});

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

// ===== OAuth2 通行证站外授权登录 =====

export const OAUTH_APP_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type OAuthAppStatus = (typeof OAUTH_APP_STATUSES)[number];
export const OAUTH_APP_STATUS_LABELS: Record<OAuthAppStatus, string> = {
  ACTIVE: '已启用',
  DISABLED: '已禁用',
};

// 授权码 10 分钟有效（OAuth2 常见做法）；访问令牌 7 天有效，到期第三方需引导重新授权
export const OAUTH_CODE_TTL_SECONDS = 600;
export const OAUTH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

// 授权范围固定为基础信息（id/uid/昵称/头像），预留在协议层面可扩展
export const OAUTH_SCOPE_BASIC = 'basic';
export const OAUTH_SCOPES = [OAUTH_SCOPE_BASIC] as const;

// 回调地址：必须是 http(s) 绝对地址且不含 fragment（fragment 无法送达服务端）
export const oauthRedirectUriSchema = z
  .string()
  .trim()
  .min(1, '回调地址不能为空')
  .max(500, '回调地址过长')
  .refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === 'https:' || url.protocol === 'http:') && !url.hash;
    } catch {
      return false;
    }
  }, '回调地址必须是 http(s) 绝对地址且不含 # 片段');

// 后台接入应用创建/编辑入参
export const oauthAppInputSchema = z.object({
  name: z.string().trim().min(1, '应用名称不能为空').max(40, '应用名称最多 40 个字'),
  description: optionalTextField(200, '应用描述'),
  logoUrl: optionalTextField(500, '应用图标地址'),
  homepageUrl: optionalTextField(500, '应用主页地址'),
  redirectUris: z
    .array(oauthRedirectUriSchema)
    .min(1, '至少配置一个回调地址')
    .max(10, '回调地址最多 10 个'),
  status: z.enum(OAUTH_APP_STATUSES).default('ACTIVE'),
});
export type OAuthAppInput = z.infer<typeof oauthAppInputSchema>;

// 授权确认入参（授权页提交）
export const oauthAuthorizeConfirmSchema = z.object({
  clientId: z.string().trim().min(1, '缺少 client_id'),
  redirectUri: oauthRedirectUriSchema,
  state: z.string().min(1, '缺少 state').max(200, 'state 过长'),
  scope: z.enum(OAUTH_SCOPES).default(OAUTH_SCOPE_BASIC),
  approve: z.boolean({ error: '请选择是否授权' }),
});

// 站外访问令牌可获取的用户基础信息
export interface OAuthBasicUser {
  id: string;
  uid: number | null;
  nickname: string;
  avatarUrl: string | null;
}

// 当前用户已授权的接入应用（按应用去重，取最近一次授权时间）
export interface OAuthAuthorizedApp {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  homepageUrl: string | null;
  status: OAuthAppStatus;
  authorizedAt: string;
  // 是否存在未过期且未吊销的访问令牌
  active: boolean;
}

export interface OAuthAuthorizedAppListResponse {
  items: OAuthAuthorizedApp[];
}
