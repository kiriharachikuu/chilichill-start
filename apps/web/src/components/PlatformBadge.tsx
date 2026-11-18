import type { GroupPlatform } from '@spaceport/shared';
import { PLATFORM_BRAND } from '../lib/platform';

interface PlatformBadgeProps {
  platform: string;
  className?: string;
}

// 平台徽标：品牌图标 + 短标，卡片与详情页通用
export default function PlatformBadge({ platform, className = '' }: PlatformBadgeProps) {
  const key = (platform in PLATFORM_BRAND ? platform : 'QQ') as GroupPlatform;
  const brand = PLATFORM_BRAND[key];
  return (
    <span
      className={`inline-flex items-center gap-1.5 border border-white/12 bg-white/[0.04] px-2 py-0.5 text-[11px] font-bold ${className}`}
      style={{ color: brand.color }}
    >
      <img src={brand.icon} alt="" className="h-3.5 w-3.5 rounded-[4px]" aria-hidden="true" />
      {brand.label}
    </span>
  );
}
