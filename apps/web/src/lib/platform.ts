import { GROUP_PLATFORMS, type GroupPlatform } from '@spaceport/shared';

// ─── 平台图标库 ──────────────────────────────────────────────────────────────
// 粉丝群四平台（GROUP_PLATFORMS）+ 预置社媒/音乐平台，共 12 个：图标已随包发布（public/icons），
// 后续功能（站点分类、活动平台、外链识别、页脚社交入口等）可直接按 key 取用。
export const SOCIAL_PLATFORMS = [
  'BILIBILI',
  'DOUYIN',
  'WECHAT',
  'NETEASE_MUSIC',
  'KUGOU_MUSIC',
  'QQ_MUSIC',
  'TWITTER_X',
  'YOUTUBE',
] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const ALL_PLATFORMS = [...GROUP_PLATFORMS, ...SOCIAL_PLATFORMS] as const;
export type AllPlatform = (typeof ALL_PLATFORMS)[number];

// 标签元数据同构（label 展示名 / short 短标 / color 品牌色 / icon 图标路径）；
// 粉丝群平台的 label 不带「群」业务后缀，徽标文案由下方 PLATFORM_BRAND 单独覆盖
export const ALL_PLATFORM_BRAND: Record<
  AllPlatform,
  { label: string; short: string; color: string; icon: string }
> = {
  QQ: { label: 'QQ', short: 'QQ', color: '#12B7F5', icon: '/icons/qq.png' },
  WEIBO: { label: '微博', short: '微博', color: '#E6162D', icon: '/icons/weibo.png' },
  XIUDONG: { label: '秀动', short: '秀动', color: '#FF7A00', icon: '/icons/xiudong.png' },
  XIAOHONGSHU: { label: '小红书', short: '小红书', color: '#FF2442', icon: '/icons/xiaohongshu.png' },
  BILIBILI: { label: '哔哩哔哩', short: 'B站', color: '#FB7299', icon: '/icons/bilibili.png' },
  DOUYIN: { label: '抖音', short: '抖音', color: '#FE2C55', icon: '/icons/douyin.png' },
  WECHAT: { label: '微信', short: '微信', color: '#07C160', icon: '/icons/wechat.png' },
  NETEASE_MUSIC: { label: '网易云音乐', short: '网易云', color: '#C20C0C', icon: '/icons/netease-music.png' },
  KUGOU_MUSIC: { label: '酷狗音乐', short: '酷狗', color: '#4A8CF5', icon: '/icons/kugou-music.png' },
  QQ_MUSIC: { label: 'QQ音乐', short: 'QQ音乐', color: '#24D3A0', icon: '/icons/qq-music.png' },
  TWITTER_X: { label: 'Twitter / X', short: 'X', color: '#1D9BF0', icon: '/icons/twitter-x.png' },
  YOUTUBE: { label: 'YouTube', short: 'YouTube', color: '#FF0000', icon: '/icons/youtube.png' },
};

// 粉丝群平台徽标元数据：自图标库派生，label 换成带「群」的业务文案
export const PLATFORM_BRAND: Record<GroupPlatform, { label: string; short: string; color: string; icon: string }> = {
  QQ: { ...ALL_PLATFORM_BRAND.QQ, label: 'QQ 群' },
  WEIBO: { ...ALL_PLATFORM_BRAND.WEIBO, label: '微博群' },
  XIUDONG: { ...ALL_PLATFORM_BRAND.XIUDONG, label: '秀动群' },
  XIAOHONGSHU: { ...ALL_PLATFORM_BRAND.XIAOHONGSHU, label: '小红书群' },
};

// 按平台 key（粉丝群平台或预置社媒平台）取标签元数据，未知 key 返回 null
export function platformBrandOf(key: string): { label: string; short: string; color: string; icon: string } | null {
  if (key in ALL_PLATFORM_BRAND) return ALL_PLATFORM_BRAND[key as AllPlatform];
  return null;
}

export type JoinMethod =
  | { kind: 'LINK'; label: string }
  | { kind: 'QR'; label: string }
  | { kind: 'NUMBER'; label: string }
  | { kind: 'NONE' };

// 每个群有且仅有一个明确的主行动：外链 > 二维码 > 群号
export function joinMethod(group: {
  joinUrl?: string | null;
  qrcodeUrl?: string | null;
  groupNumber?: string | null;
}): JoinMethod {
  if (group.joinUrl) return { kind: 'LINK', label: '加入群舱' };
  if (group.qrcodeUrl) return { kind: 'QR', label: '扫码入群' };
  if (group.groupNumber) return { kind: 'NUMBER', label: '复制群号' };
  return { kind: 'NONE' };
}

// 卡片元信息行：如「小红书 · 扫码入群」「QQ · 群号 123456」
export function joinMetaLine(group: {
  platform: string;
  joinUrl?: string | null;
  qrcodeUrl?: string | null;
  groupNumber?: string | null;
}): string {
  const brand = PLATFORM_BRAND[(group.platform as GroupPlatform) in PLATFORM_BRAND ? (group.platform as GroupPlatform) : 'QQ'];
  const method = joinMethod(group);
  const methodText =
    method.kind === 'NUMBER' && group.groupNumber ? `群号 ${group.groupNumber}` : method.kind === 'NONE' ? '入群方式待补充' : method.label;
  return `${brand.short} · ${methodText}`;
}

// 二维码弹窗内按平台给出的扫码操作路径
export function platformScanGuide(platform: string): string {
  switch (platform) {
    case 'QQ':
      return '打开 QQ → 右上角「+」→ 扫一扫，即可识别加入。';
    case 'XIAOHONGSHU':
      return '保存图片后打开小红书 →「我」→ 右上角「☰」→ 扫一扫 → 相册选取本图。';
    case 'WEIBO':
      return '打开微博 → 首页右上角「+」→ 扫一扫，识别后申请加入。';
    case 'XIUDONG':
      return '保存图片后打开秀动 App，在首页右上角进入扫一扫识别。';
    default:
      return '保存图片后，使用对应 App 的扫一扫功能识别加入。';
  }
}
