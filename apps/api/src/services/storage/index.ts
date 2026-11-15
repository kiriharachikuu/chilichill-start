import type { CosStorageConfig, OssStorageConfig, StorageMode, StorageSettings } from '@spaceport/shared';
import { prisma } from '../../prisma';
import { env } from '../../env';
import { createCosStorage } from './cos';
import { createOssStorage } from './oss';
import { createLocalStorage } from './local';

export interface StorageSaveOptions {
  filename: string;
  mimeType: string;
}

export interface StorageResult {
  url: string;
  key: string;
}

export interface StorageAdapter {
  save(buffer: Buffer, opts: StorageSaveOptions): Promise<StorageResult>;
  /** 按公开 URL 删除已上传文件；文件不存在不视为错误（幂等），其余失败抛异常由调用方兜底 */
  deleteByUrl(url: string): Promise<void>;
}

export const STORAGE_SETTING_KEY = 'storage';

// 数据库里存储的完整配置（含明文密钥）；对外输出时需脱敏
export interface StoredStorageSettings {
  mode: StorageMode;
  cos: CosStorageConfig | null;
  oss: OssStorageConfig | null;
}

// 无任何配置时的兜底：沿用环境变量里的 COS 配置，否则本地存储
function fallbackFromEnv(): StoredStorageSettings {
  const cos: CosStorageConfig | null =
    env.cos.secretId && env.cos.secretKey && env.cos.bucket && env.cos.region
      ? {
          secretId: env.cos.secretId,
          secretKey: env.cos.secretKey,
          bucket: env.cos.bucket,
          region: env.cos.region,
          baseUrl: env.cos.baseUrl,
        }
      : null;
  return { mode: cos ? 'cos' : 'local', cos, oss: null };
}

export function parseStoredSettings(value: string | null): StoredStorageSettings {
  if (!value) {
    return fallbackFromEnv();
  }
  try {
    const parsed = JSON.parse(value) as Partial<StoredStorageSettings>;
    if (!parsed || typeof parsed !== 'object') {
      return fallbackFromEnv();
    }
    const mode: StorageMode =
      parsed.mode === 'cos' || parsed.mode === 'oss' ? parsed.mode : 'local';
    return { mode, cos: parsed.cos ?? null, oss: parsed.oss ?? null };
  } catch {
    return fallbackFromEnv();
  }
}

function adapterFor(stored: StoredStorageSettings): StorageAdapter {
  if (stored.mode === 'cos' && stored.cos) {
    return createCosStorage(stored.cos);
  }
  if (stored.mode === 'oss' && stored.oss) {
    return createOssStorage(stored.oss);
  }
  return createLocalStorage();
}

// 内存缓存：保存设置后调用 invalidateStorageCache() 立即失效，保证切换即时生效
let cachedSettings: StoredStorageSettings | null = null;
let cachedAdapter: StorageAdapter | null = null;

export function invalidateStorageCache(): void {
  cachedSettings = null;
  cachedAdapter = null;
}

export async function getStoredStorageSettings(): Promise<StoredStorageSettings> {
  if (cachedSettings) {
    return cachedSettings;
  }
  const setting = await prisma.systemSetting.findUnique({
    where: { key: STORAGE_SETTING_KEY },
    select: { value: true },
  });
  cachedSettings = parseStoredSettings(setting?.value ?? null);
  return cachedSettings;
}

export async function getStorage(): Promise<StorageAdapter> {
  if (cachedAdapter) {
    return cachedAdapter;
  }
  const stored = await getStoredStorageSettings();
  cachedAdapter = adapterFor(stored);
  return cachedAdapter;
}

/**
 * 判断 URL 是否由当前存储模式管理的上传文件。
 * 用于驳回清理等删除操作的前置校验：外部图床、历史存储模式的残留 URL 一律不动。
 */
export async function isManagedUploadUrl(url: string): Promise<boolean> {
  if (!url) {
    return false;
  }
  const stored = await getStoredStorageSettings();
  if (stored.mode === 'local') {
    return url.startsWith('/uploads/');
  }
  if (stored.mode === 'cos' && stored.cos) {
    const { bucket, region, baseUrl } = stored.cos;
    // 与 cos.ts 的 objectPrefix() 保持一致：上传对象都落在目录前缀下的 uploads/ 内
    const prefix = env.cos.keyPrefix ? `${env.cos.keyPrefix.replace(/\/+$/, '')}/` : '';
    return (
      (baseUrl ? url.startsWith(`${baseUrl.replace(/\/+$/, '')}/${prefix}uploads/`) : false) ||
      url.startsWith(`https://${bucket}.cos.${region}.myqcloud.com/${prefix}uploads/`)
    );
  }
  if (stored.mode === 'oss' && stored.oss) {
    const { bucket, region, endpoint, baseUrl } = stored.oss;
    const host = endpoint
      ? `https://${endpoint.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`
      : `https://${bucket}.${region.startsWith('oss-') ? region : `oss-${region}`}.aliyuncs.com`;
    return (
      (baseUrl ? url.startsWith(`${baseUrl.replace(/\/+$/, '')}/uploads/`) : false) ||
      url.startsWith(`${host}/uploads/`)
    );
  }
  return false;
}

export async function saveStoredStorageSettings(settings: StoredStorageSettings): Promise<StorageSettings> {
  await prisma.systemSetting.upsert({
    where: { key: STORAGE_SETTING_KEY },
    update: { value: JSON.stringify(settings) },
    create: { key: STORAGE_SETTING_KEY, value: JSON.stringify(settings) },
  });
  invalidateStorageCache();

  // 返回脱敏后的配置
  return {
    mode: settings.mode,
    cos: settings.cos ? { ...settings.cos, secretKey: STORAGE_SECRET_KEEP } : null,
    oss: settings.oss ? { ...settings.oss, accessKeySecret: STORAGE_SECRET_KEEP } : null,
  };
}

export const STORAGE_SECRET_KEEP = '__KEEP__';
