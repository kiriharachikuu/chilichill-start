import cron, { type ScheduledTask } from 'node-cron';
import type { FastifyBaseLogger } from 'fastify';
import { QQ_BOT_DAILY_REPORT_TIME_PATTERN } from '@spaceport/shared';
import { env } from '../../env';
import { prisma } from '../../prisma';
import { broadcastQQBotMessage } from './client';
import { getStoredQQBotSettings } from './settings';

// ===== 每日数据日报调度 =====
// node-cron 按上海时区（Asia/Shanghai）在后台配置的时间触发；设置变更时重建调度。
// 多实例部署会重复发送日报，当前为单实例部署，可接受。

let dailyReportTask: ScheduledTask | null = null;

// 调度回调拿不到请求级 logger，兜底用 console（保持轻量，不做全局 fastify 依赖）
const fallbackLogger: FastifyBaseLogger = {
  level: 'info',
  info: (obj: unknown, msg?: string) => console.log('[qq-bot.daily-report]', obj ?? '', msg ?? ''),
  warn: (obj: unknown, msg?: string) => console.warn('[qq-bot.daily-report]', obj ?? '', msg ?? ''),
  error: (obj: unknown, msg?: string) => console.error('[qq-bot.daily-report]', obj ?? '', msg ?? ''),
  debug: () => {},
  trace: () => {},
  fatal: (obj: unknown, msg?: string) => console.error('[qq-bot.daily-report]', obj ?? '', msg ?? ''),
  child: () => fallbackLogger,
} as unknown as FastifyBaseLogger;

/** HH:mm → cron 表达式「分 时 * * *」 */
export function cronExprFromDailyReportTime(time: string): string {
  const [hour, minute] = time.split(':');
  return `${minute} ${hour} * * *`;
}

/**
 * 上海时区「昨天 00:00 ~ 今天 00:00」对应的 UTC 时间范围。
 * 数据库 DateTime 以 UTC 存储：上海当天零点 = 当天日期的 UTC 零点减 8 小时。
 */
export function shanghaiYesterdayRange(now = new Date()): { start: Date; end: Date } {
  const shanghai = new Date(now.getTime() + 8 * 3600_000);
  const end = new Date(Date.UTC(shanghai.getUTCFullYear(), shanghai.getUTCMonth(), shanghai.getUTCDate()) - 8 * 3600_000);
  const start = new Date(end.getTime() - 24 * 3600_000);
  return { start, end };
}

/** 昨天的展示日期（上海时区），如「11月17日」 */
export function shanghaiYesterdayLabel(now = new Date()): string {
  const { start } = shanghaiYesterdayRange(now);
  // start 是上海零点对应的 UTC 时刻（前一日 16:00Z），加回 8h 才是昨天的上海日期
  const shanghaiDate = new Date(start.getTime() + 8 * 3600_000);
  return `${shanghaiDate.getUTCMonth() + 1}月${shanghaiDate.getUTCDate()}日`;
}

export async function buildDailyReportMessage(now = new Date()): Promise<string> {
  const { start, end } = shanghaiYesterdayRange(now);
  const range = { gte: start, lt: end };

  const [newUsers, submissionsByType, newGalleryImages, newComments, newLikes, newReports, pendingSubmissions, pendingReports] =
    await Promise.all([
      prisma.user.count({ where: { createdAt: range } }),
      prisma.submission.groupBy({ by: ['entityType'], where: { createdAt: range }, _count: { _all: true } }),
      prisma.galleryImage.count({ where: { createdAt: range } }),
      prisma.galleryComment.count({ where: { createdAt: range } }),
      prisma.galleryLike.count({ where: { createdAt: range } }),
      prisma.commentReport.count({ where: { createdAt: range } }),
      prisma.submission.count({ where: { status: 'PENDING' } }),
      prisma.commentReport.count({ where: { status: 'PENDING' } }),
    ]);

  const typeLabels: Record<string, string> = { GROUP: '用户群', SITE: '网站', GALLERY: '画廊' };
  const submissionCount = submissionsByType.reduce((sum, item) => sum + item._count._all, 0);
  const submissionDetail = submissionsByType
    .map((item) => `${typeLabels[item.entityType] ?? item.entityType} ${item._count._all}`)
    .join(' / ');

  return [
    `【数据日报】${shanghaiYesterdayLabel(now)}`,
    `新增用户：${newUsers}`,
    `新增投稿：${submissionCount}${submissionDetail ? `（${submissionDetail}）` : ''}`,
    `新增画廊作品：${newGalleryImages}`,
    `新增评论：${newComments}`,
    `新增点赞：${newLikes}`,
    `新增举报：${newReports}`,
    `待审核积压：投稿 ${pendingSubmissions}，举报 ${pendingReports}`,
  ].join('\n');
}

/** 触发日报推送：按最新设置判断开关，失败仅记日志 */
export async function sendQQBotDailyReport(log: FastifyBaseLogger): Promise<void> {
  try {
    const settings = await getStoredQQBotSettings();
    if (!settings.enabled || !settings.notify.dailyReport) {
      return;
    }

    const content = await buildDailyReportMessage();
    const result = await broadcastQQBotMessage(content);
    if (result.ok) {
      log.info({ event: 'qq-bot.daily-report', sent: result.sent }, '每日数据日报已推送');
    } else {
      log.warn({ event: 'qq-bot.daily-report', error: result.error }, '每日数据日报推送失败');
    }
  } catch (error) {
    log.error({ event: 'qq-bot.daily-report', error: String(error) }, '每日数据日报推送异常');
  }
}

/** 按最新设置（重新）注册日报任务；未启用或开关关闭时停止现有任务 */
export async function rescheduleQQBotDailyReport(): Promise<void> {
  // 测试环境不注册定时任务：避免 cron 定时器拖住 vitest 进程退出
  if (env.nodeEnv === 'test') {
    stopQQBotDailyReport();
    return;
  }

  dailyReportTask?.stop();
  dailyReportTask = null;

  const settings = await getStoredQQBotSettings();
  const time = settings.dailyReportTime;
  if (!settings.enabled || !settings.notify.dailyReport || !QQ_BOT_DAILY_REPORT_TIME_PATTERN.test(time)) {
    return;
  }

  dailyReportTask = cron.schedule(
    cronExprFromDailyReportTime(time),
    () => {
      void sendQQBotDailyReport(fallbackLogger);
    },
    { timezone: 'Asia/Shanghai' },
  );
}

/** 停止调度（应用关闭 / 测试清理用） */
export function stopQQBotDailyReport(): void {
  dailyReportTask?.stop();
  dailyReportTask = null;
}
