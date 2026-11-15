import type { RegistrationSettings } from '@spaceport/shared';
import { prisma } from '../prisma';

export const REGISTRATION_SETTING_KEY = 'registration';

// 无数据库配置时的默认值：需要邮箱验证码（与历史行为一致）
const DEFAULT_SETTINGS: RegistrationSettings = { emailCodeRequired: true };

function parseStoredSettings(value: string | null): RegistrationSettings {
  if (!value) {
    return DEFAULT_SETTINGS;
  }
  try {
    const parsed = JSON.parse(value) as Partial<RegistrationSettings>;
    return typeof parsed.emailCodeRequired === 'boolean'
      ? { emailCodeRequired: parsed.emailCodeRequired }
      : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// 内存缓存：保存设置后立即更新，保证后台改动即时生效
let cachedSettings: RegistrationSettings | null = null;

export function invalidateRegistrationSettingsCache(): void {
  cachedSettings = null;
}

export async function getStoredRegistrationSettings(): Promise<RegistrationSettings> {
  if (cachedSettings) {
    return cachedSettings;
  }
  const setting = await prisma.systemSetting.findUnique({
    where: { key: REGISTRATION_SETTING_KEY },
    select: { value: true },
  });
  cachedSettings = parseStoredSettings(setting?.value ?? null);
  return cachedSettings;
}

export async function saveStoredRegistrationSettings(
  settings: RegistrationSettings,
): Promise<RegistrationSettings> {
  const value = JSON.stringify(settings);
  await prisma.systemSetting.upsert({
    where: { key: REGISTRATION_SETTING_KEY },
    update: { value },
    create: { key: REGISTRATION_SETTING_KEY, value },
  });
  cachedSettings = settings;
  return settings;
}
