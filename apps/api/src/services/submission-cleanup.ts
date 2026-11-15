import type { FastifyBaseLogger } from 'fastify';
import { prisma } from '../prisma';
import { getStorage, isManagedUploadUrl } from './storage';

// CREATE 投稿 payload 中可能携带上传文件的字段
const URL_FIELDS = ['imageUrl', 'coverUrl', 'avatarUrl', 'qrcodeUrl'] as const;

function extractPayloadUrls(payload: string): string[] {
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) {
      return [];
    }
    return URL_FIELDS.map((field) => parsed[field]).filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
  } catch {
    return [];
  }
}

/**
 * 驳回 CREATE 投稿后清理其上传的图片文件（best-effort）：
 * - 只删除当前存储模式管理的文件，外部图床与历史存储模式的 URL 一律不动；
 * - 仍被已发布内容、或其他未驳回投稿引用的文件跳过；
 * - 任一步失败只记日志，不影响驳回结果。
 */
export async function cleanupRejectedSubmissionFiles(
  submission: { id: string; mode: string; payload: string },
  log: FastifyBaseLogger,
): Promise<void> {
  if (submission.mode !== 'CREATE') {
    return;
  }

  const urls = [...new Set(extractPayloadUrls(submission.payload))];
  for (const url of urls) {
    try {
      if (!(await isManagedUploadUrl(url))) {
        continue;
      }

      const [groups, sites, images, otherSubmissions] = await Promise.all([
        prisma.group.count({ where: { OR: [{ avatarUrl: url }, { qrcodeUrl: url }] } }),
        prisma.site.count({ where: { coverUrl: url } }),
        prisma.galleryImage.count({ where: { imageUrl: url } }),
        // 其他未驳回投稿（待审核/已通过）引用同一文件时不删；
        // 已驳回的投稿视为同样判过“垃圾”，最后一个驳回时统一清理
        prisma.submission.count({
          where: { id: { not: submission.id }, status: { not: 'REJECTED' }, payload: { contains: url } },
        }),
      ]);
      if (groups + sites + images + otherSubmissions > 0) {
        continue;
      }

      const storage = await getStorage();
      await storage.deleteByUrl(url);
      log.info({ submissionId: submission.id, url }, '驳回投稿：已清理上传文件');
    } catch (error) {
      log.warn({ submissionId: submission.id, url, error: String(error) }, '驳回投稿：清理上传文件失败');
    }
  }
}
