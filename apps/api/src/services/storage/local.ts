import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorageAdapter } from './index';

const uploadsRoot = fileURLToPath(new URL('../../../public/uploads', import.meta.url));

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function resolveExtension(filename: string, mimeType: string): string {
  const ext = filename.includes('.') ? filename.split('.').pop() ?? '' : '';
  const normalized = ext.toLowerCase();
  if (normalized) {
    return normalized;
  }
  return MIME_EXTENSIONS[mimeType] ?? 'bin';
}

function datePrefix(date: Date): { year: string; month: string } {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return { year, month };
}

export function createLocalStorage(): StorageAdapter {
  return {
    async save(buffer, opts) {
      const { year, month } = datePrefix(new Date());
      const extension = resolveExtension(opts.filename, opts.mimeType);
      const key = `${year}/${month}/${randomUUID()}.${extension}`;
      const dir = join(uploadsRoot, year, month);

      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${key.split('/').pop()}`), buffer);

      return { url: `/uploads/${key}`, key };
    },
    async deleteByUrl(url) {
      if (!url.startsWith('/uploads/')) {
        throw new Error(`非本地上传地址，拒绝删除: ${url}`);
      }
      const relative = url.slice('/uploads/'.length);
      // 防路径穿越：清理入口的 URL 来自投稿 payload，不可全信
      if (!relative || relative.includes('..')) {
        throw new Error(`非法的上传地址: ${url}`);
      }
      await rm(join(uploadsRoot, relative), { force: true });
    },
  };
}
