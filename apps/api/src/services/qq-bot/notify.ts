import type { FastifyBaseLogger } from 'fastify';
import { prisma } from '../../prisma';
import { broadcastQQBotMessage } from './client';
import { getStoredQQBotSettings } from './settings';

export interface SubmissionNotifyInfo {
  entityType: string;
  entityLabel: string;
  mode: string;
  payload: unknown;
  submitterId: string;
}

// 投稿 payload 的标题字段：网站/画廊用 title，用户群用 name
function titleOf(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const data = payload as Record<string, unknown>;
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (title) {
    return title;
  }
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  return name || null;
}

export function buildSubmissionNotifyMessage(info: SubmissionNotifyInfo, submitter: string): string {
  const modeText = info.mode === 'UPDATE' ? '修改' : '新增';
  const title = titleOf(info.payload);
  return [
    `收到${modeText}投稿，请前往后台审核：`,
    `内容类型：${info.entityLabel}`,
    `标题：${title ?? '（无标题）'}`,
    `投稿人：${submitter}`,
  ].join('\n');
}

/**
 * 投稿后后台推送 QQ 机器人提醒：不阻塞接口响应，失败仅记日志
 * （群主动消息受平台频控，属 best-effort 提醒，不保证送达）。
 */
export function notifySubmissionInBackground(info: SubmissionNotifyInfo, log: FastifyBaseLogger): void {
  void (async () => {
    try {
      const settings = await getStoredQQBotSettings();
      if (!settings.enabled) {
        return;
      }

      const submitter = await prisma.user.findUnique({
        where: { id: info.submitterId },
        select: { nickname: true },
      });
      const content = buildSubmissionNotifyMessage(info, submitter?.nickname ?? '未知用户');
      const result = await broadcastQQBotMessage(content);

      if (result.ok) {
        log.info({ event: 'submission.notify', sent: result.sent }, '投稿提醒已推送');
      } else {
        log.warn({ event: 'submission.notify', error: result.error }, '投稿提醒推送失败');
      }
    } catch (error) {
      log.error({ event: 'submission.notify', error: String(error) }, '投稿提醒推送异常');
    }
  })();
}
