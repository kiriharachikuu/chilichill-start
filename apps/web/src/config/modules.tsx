import {
  Globe2,
  Images,
  Music2,
  Orbit,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

export interface ModuleDef {
  key: string;
  label: string;
  path: string;
  icon: LucideIcon;
  enabled: boolean;
  blurb: string;
  tone: string;
}

export const MODULES: ModuleDef[] = [
  {
    key: 'groups',
    label: '群舱',
    path: '/groups',
    icon: UsersRound,
    enabled: true,
    blurb: '按大区与群类型找到同频的辣椒粉',
    tone: 'text-amber',
  },
  {
    key: 'sites',
    label: '站点',
    path: '/sites',
    icon: Globe2,
    enabled: true,
    blurb: '粉丝自制的小游戏、工具与测试',
    tone: 'text-mint',
  },
  {
    key: 'gallery',
    label: '画廊',
    path: '/gallery',
    icon: Images,
    enabled: false,
    blurb: '同人画作与现场影像的停靠仓段',
    tone: 'text-violet',
  },
  {
    key: 'music',
    label: '音乐厅',
    path: '/music',
    icon: Music2,
    enabled: false,
    blurb: '二创音乐与歌单信号的共鸣轨道',
    tone: 'text-aurora',
  },
];

export function moduleIcon(key: string): LucideIcon {
  const found = MODULES.find((item) => item.key === key);
  return found?.icon ?? Orbit;
}

export function moduleTone(key: string): string {
  return MODULES.find((item) => item.key === key)?.tone ?? 'text-aurora';
}

export function moduleBlurb(key: string): string {
  return MODULES.find((item) => item.key === key)?.blurb ?? '新的空间站舱段正在筹备';
}
