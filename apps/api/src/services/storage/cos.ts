import { randomUUID } from 'node:crypto';
import { HttpError } from '../../lib/errors';
import { env } from '../../env';
import type { CosStorageConfig } from '@spaceport/shared';
import type { StorageAdapter } from './index';

function datePrefix(date: Date): { year: string; month: string } {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return { year, month };
}

// 共享桶隔离：所有上传对象落在配置的目录前缀下（默认 spaceport/），不污染桶内其他项目的文件
function objectPrefix(): string {
  return env.cos.keyPrefix ? `${env.cos.keyPrefix.replace(/\/+$/, '')}/` : '';
}

// 从公开 URL 还原对象 Key：无论走自定义域名还是默认域名，路径都是 /uploads/...
function keyFromUrl(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

function resolveExtension(filename: string, mimeType: string): string {
  const ext = filename.includes('.') ? filename.split('.').pop() ?? '' : '';
  if (ext) {
    return ext.toLowerCase();
  }
  const fallbacks: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  };
  return fallbacks[mimeType] ?? 'bin';
}

export function createCosStorage(config: CosStorageConfig): StorageAdapter {
  return {
    async save(buffer, opts) {
      const { secretId, secretKey, bucket, region, baseUrl } = config;
      if (!secretId || !secretKey || !bucket || !region) {
        throw new HttpError(500, 'STORAGE_NOT_CONFIGURED', '腾讯云 COS 未配置完整');
      }

      const { year, month } = datePrefix(new Date());
      const key = `${objectPrefix()}uploads/${year}/${month}/${randomUUID()}.${resolveExtension(opts.filename, opts.mimeType)}`;

      const { default: COS } = await import('cos-nodejs-sdk-v5');
      const cos = new COS({ SecretId: secretId, SecretKey: secretKey });

      await new Promise<void>((resolve, reject) => {
        cos.putObject(
          {
            Bucket: bucket,
            Region: region,
            Key: key,
            Body: buffer,
            ContentType: opts.mimeType,
          },
          (error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          },
        );
      });

      const url = baseUrl
        ? `${baseUrl.replace(/\/+$/, '')}/${key}`
        : `https://${bucket}.cos.${region}.myqcloud.com/${key}`;

      return { url, key };
    },
    async deleteByUrl(url) {
      const { secretId, secretKey, bucket, region } = config;
      if (!secretId || !secretKey || !bucket || !region) {
        throw new HttpError(500, 'STORAGE_NOT_CONFIGURED', '腾讯云 COS 未配置完整');
      }

      const { default: COS } = await import('cos-nodejs-sdk-v5');
      const cos = new COS({ SecretId: secretId, SecretKey: secretKey });

      await new Promise<void>((resolve, reject) => {
        cos.deleteObject(
          {
            Bucket: bucket,
            Region: region,
            Key: keyFromUrl(url),
          },
          (error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          },
        );
      });
    },
  };
}
