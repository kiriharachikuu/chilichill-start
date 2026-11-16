import { SITE_SETTINGS_EMPTY, type SiteSettings } from '@spaceport/shared';
import { prisma } from '../prisma';

export const SITE_SETTING_KEY = 'site';

// 无数据库配置时的默认值：全部留空（About 页对应模块不展示）
const DEFAULT_SETTINGS: SiteSettings = SITE_SETTINGS_EMPTY;

function parseStoredSettings(value: string | null): SiteSettings {
  if (!value) {
    return DEFAULT_SETTINGS;
  }
  try {
    const parsed = JSON.parse(value) as Partial<SiteSettings>;
    return {
      icpNumber: typeof parsed.icpNumber === 'string' ? parsed.icpNumber : null,
      contactEmail: typeof parsed.contactEmail === 'string' ? parsed.contactEmail : null,
      sponsorNote: typeof parsed.sponsorNote === 'string' ? parsed.sponsorNote : null,
      sponsorQrcodeUrl: typeof parsed.sponsorQrcodeUrl === 'string' ? parsed.sponsorQrcodeUrl : null,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// 内存缓存：保存设置后立即更新，保证后台改动即时生效
let cachedSettings: SiteSettings | null = null;

export function invalidateSiteSettingsCache(): void {
  cachedSettings = null;
}

export async function getStoredSiteSettings(): Promise<SiteSettings> {
  if (cachedSettings) {
    return cachedSettings;
  }
  const setting = await prisma.systemSetting.findUnique({
    where: { key: SITE_SETTING_KEY },
    select: { value: true },
  });
  cachedSettings = parseStoredSettings(setting?.value ?? null);
  return cachedSettings;
}

export async function saveStoredSiteSettings(settings: SiteSettings): Promise<SiteSettings> {
  const value = JSON.stringify(settings);
  await prisma.systemSetting.upsert({
    where: { key: SITE_SETTING_KEY },
    update: { value },
    create: { key: SITE_SETTING_KEY, value },
  });
  cachedSettings = settings;
  return settings;
}
