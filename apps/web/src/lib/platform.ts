import type { GroupPlatform } from '@spaceport/shared';

// 平台品牌色与短标：徽标、CTA、二维码弹窗文案共用这一份元数据
export const PLATFORM_BRAND: Record<GroupPlatform, { label: string; short: string; color: string }> = {
  QQ: { label: 'QQ 群', short: 'QQ', color: '#12B7F5' },
  WEIBO: { label: '微博群', short: '微博', color: '#E6162D' },
  XIUDONG: { label: '秀动群', short: '秀动', color: '#FF7A00' },
  XIAOHONGSHU: { label: '小红书群', short: '小红书', color: '#FF2442' },
};

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
