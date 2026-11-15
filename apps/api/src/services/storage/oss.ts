import { randomUUID } from 'node:crypto';
import { HttpError } from '../../lib/errors';
import type { OssStorageConfig } from '@spaceport/shared';
import type { StorageAdapter } from './index';

function datePrefix(date: Date): { year: string; month: string } {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return { year, month };
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

// region 支持两种写法：标准地域码（cn-hangzhou）或完整 endpoint（oss-cn-hangzhou）
function resolveRegion(region: string): string {
  if (region.startsWith('oss-')) {
    return region;
  }
  return `oss-${region}`;
}

// 从公开 URL 还原对象 Key：无论走自定义域名还是默认域名，路径都是 /uploads/...
function keyFromUrl(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

export function createOssStorage(config: OssStorageConfig): StorageAdapter {
  return {
    async save(buffer, opts) {
      const { accessKeyId, accessKeySecret, bucket, region, endpoint, baseUrl } = config;
      if (!accessKeyId || !accessKeySecret || !bucket || !region) {
        throw new HttpError(500, 'STORAGE_NOT_CONFIGURED', '阿里云 OSS 未配置完整');
      }

      const { year, month } = datePrefix(new Date());
      const key = `uploads/${year}/${month}/${randomUUID()}.${resolveExtension(opts.filename, opts.mimeType)}`;

      const { default: OSS } = await import('ali-oss');
      const client = new OSS({
        region: endpoint ? `https://${endpoint.replace(/^https?:\/\//, '')}` : resolveRegion(region),
        accessKeyId,
        accessKeySecret,
        bucket,
      });

      await client.put(key, buffer, { mime: opts.mimeType });

      const url = baseUrl
        ? `${baseUrl.replace(/\/+$/, '')}/${key}`
        : `https://${bucket}.${resolveRegion(region)}.aliyuncs.com/${key}`;

      return { url, key };
    },
    async deleteByUrl(url) {
      const { accessKeyId, accessKeySecret, bucket, region, endpoint } = config;
      if (!accessKeyId || !accessKeySecret || !bucket || !region) {
        throw new HttpError(500, 'STORAGE_NOT_CONFIGURED', '阿里云 OSS 未配置完整');
      }

      const { default: OSS } = await import('ali-oss');
      const client = new OSS({
        region: endpoint ? `https://${endpoint.replace(/^https?:\/\//, '')}` : resolveRegion(region),
        accessKeyId,
        accessKeySecret,
        bucket,
      });

      await client.delete(keyFromUrl(url));
    },
  };
}
