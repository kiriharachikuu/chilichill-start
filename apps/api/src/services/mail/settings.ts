import { MAIL_SECRET_KEEP, type MailSettings } from '@spaceport/shared';
import { prisma } from '../../prisma';
import { env } from '../../env';

export const MAIL_SETTING_KEY = 'mail';

// 数据库里存储的完整配置（含明文 API Key）；对外输出时需脱敏
export interface StoredMailSettings {
  apiKey: string | null;
  from: string;
  fromName: string;
  replyTo: string | null;
}

// 无数据库配置时的兜底：沿用环境变量里的 Resend 配置
function fallbackFromEnv(): StoredMailSettings {
  return {
    apiKey: env.mail.apiKey,
    from: env.mail.from,
    fromName: env.mail.fromName,
    replyTo: env.mail.replyTo,
  };
}

function parseStoredSettings(value: string | null): StoredMailSettings {
  if (!value) {
    return fallbackFromEnv();
  }
  try {
    const parsed = JSON.parse(value) as Partial<StoredMailSettings>;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.from !== 'string' || typeof parsed.fromName !== 'string') {
      return fallbackFromEnv();
    }
    return {
      apiKey: typeof parsed.apiKey === 'string' && parsed.apiKey ? parsed.apiKey : null,
      from: parsed.from,
      fromName: parsed.fromName,
      replyTo: typeof parsed.replyTo === 'string' ? parsed.replyTo : null,
    };
  } catch {
    return fallbackFromEnv();
  }
}

// 内存缓存：保存设置后立即更新，保证后台改动即时生效
let cachedSettings: StoredMailSettings | null = null;

export function invalidateMailSettingsCache(): void {
  cachedSettings = null;
}

export async function getStoredMailSettings(): Promise<StoredMailSettings> {
  if (cachedSettings) {
    return cachedSettings;
  }
  const setting = await prisma.systemSetting.findUnique({
    where: { key: MAIL_SETTING_KEY },
    select: { value: true },
  });
  cachedSettings = parseStoredSettings(setting?.value ?? null);
  return cachedSettings;
}

/** 后台邮件设置与环境变量任一配置了 API Key 即视为已启用邮件服务 */
export async function isMailConfigured(): Promise<boolean> {
  return Boolean((await getStoredMailSettings()).apiKey);
}

export async function saveStoredMailSettings(settings: StoredMailSettings): Promise<MailSettings> {
  const value = JSON.stringify(settings);
  await prisma.systemSetting.upsert({
    where: { key: MAIL_SETTING_KEY },
    update: { value },
    create: { key: MAIL_SETTING_KEY, value },
  });
  cachedSettings = settings;

  // 返回脱敏后的配置：API Key 不回传明文
  return {
    apiKey: settings.apiKey ? MAIL_SECRET_KEEP : '',
    from: settings.from,
    fromName: settings.fromName,
    replyTo: settings.replyTo,
  };
}
