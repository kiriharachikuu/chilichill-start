import { QQ_BOT_SECRET_KEEP, type QQBotSettings } from '@spaceport/shared';
import { prisma } from '../../prisma';

export const QQ_BOT_SETTING_KEY = 'qq-bot';

// 数据库里存储的完整配置（含明文 AppSecret）；对外输出时需脱敏
export interface StoredQQBotSettings {
  appId: string;
  appSecret: string;
  groupOpenId: string | null;
  channelId: string | null;
  enabled: boolean;
}

function emptySettings(): StoredQQBotSettings {
  return { appId: '', appSecret: '', groupOpenId: null, channelId: null, enabled: false };
}

function parseStoredSettings(value: string | null): StoredQQBotSettings {
  if (!value) {
    return emptySettings();
  }
  try {
    const parsed = JSON.parse(value) as Partial<StoredQQBotSettings>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.appId !== 'string') {
      return emptySettings();
    }
    return {
      appId: parsed.appId,
      appSecret: typeof parsed.appSecret === 'string' ? parsed.appSecret : '',
      groupOpenId: typeof parsed.groupOpenId === 'string' && parsed.groupOpenId ? parsed.groupOpenId : null,
      channelId: typeof parsed.channelId === 'string' && parsed.channelId ? parsed.channelId : null,
      enabled: parsed.enabled === true,
    };
  } catch {
    return emptySettings();
  }
}

// 内存缓存：保存设置后立即更新，保证后台改动即时生效
let cachedSettings: StoredQQBotSettings | null = null;

export function invalidateQQBotSettingsCache(): void {
  cachedSettings = null;
}

export async function getStoredQQBotSettings(): Promise<StoredQQBotSettings> {
  if (cachedSettings) {
    return cachedSettings;
  }
  const setting = await prisma.systemSetting.findUnique({
    where: { key: QQ_BOT_SETTING_KEY },
    select: { value: true },
  });
  cachedSettings = parseStoredSettings(setting?.value ?? null);
  return cachedSettings;
}

export async function saveStoredQQBotSettings(settings: StoredQQBotSettings): Promise<QQBotSettings> {
  const value = JSON.stringify(settings);
  await prisma.systemSetting.upsert({
    where: { key: QQ_BOT_SETTING_KEY },
    update: { value },
    create: { key: QQ_BOT_SETTING_KEY, value },
  });
  cachedSettings = settings;

  // 返回脱敏后的配置：AppSecret 不回传明文
  return {
    appId: settings.appId,
    appSecret: settings.appSecret ? QQ_BOT_SECRET_KEEP : '',
    groupOpenId: settings.groupOpenId,
    channelId: settings.channelId,
    enabled: settings.enabled,
  };
}
