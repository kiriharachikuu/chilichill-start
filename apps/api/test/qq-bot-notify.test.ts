import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { prisma } from '../src/prisma';
import { resetQQBotStateForTests } from '../src/services/qq-bot/client';
import { saveStoredQQBotSettings } from '../src/services/qq-bot/settings';
import { buildCommentReportNotifyMessage } from '../src/services/qq-bot/notify';
import {
  buildDailyReportMessage,
  cronExprFromDailyReportTime,
  rescheduleQQBotDailyReport,
  sendQQBotDailyReport,
  shanghaiYesterdayLabel,
  shanghaiYesterdayRange,
} from '../src/services/qq-bot/scheduler';

// QQ 机器人推送扩展：
// - 评论举报提醒：路由触发后台推送，受 notify.report 开关控制
// - 每日数据日报：上海时区「昨天」统计 + HH:mm → cron 表达式换算

const AUTHOR_EMAIL = 'qqbot-notify-author@test.dev';
const REPORTER_EMAIL = 'qqbot-notify-reporter@test.dev';
const DAILY_EMAIL = 'qqbot-notify-daily@test.dev';
const ALL_EMAILS = [AUTHOR_EMAIL, REPORTER_EMAIL, DAILY_EMAIL];
// 独立前缀，避免与 gallery.test.ts 的 /test/gallery/ 清理范围重叠
const IMAGE_PREFIX = '/test/qqbot-notify/';

let app: FastifyInstance;
let authorId: string;
let reporterId: string;

function jsonRes(data: unknown, opts: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return {
    ok: opts.ok ?? true,
    status: opts.status ?? 200,
    statusText: opts.statusText ?? 'OK',
    json: async () => data,
  } as Response;
}

function mockLogger(): FastifyBaseLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as FastifyBaseLogger;
}

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('waitFor 超时：后台推送未执行');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function cleanupData(): Promise<void> {
  const users = await prisma.user.findMany({ where: { email: { in: ALL_EMAILS } }, select: { id: true } });
  const ids = users.map((user) => user.id);
  await prisma.commentReport.deleteMany({ where: { reporterId: { in: ids } } });
  await prisma.galleryComment.deleteMany({ where: { image: { imageUrl: { startsWith: IMAGE_PREFIX } } } });
  await prisma.galleryLike.deleteMany({ where: { image: { imageUrl: { startsWith: IMAGE_PREFIX } } } });
  await prisma.galleryImage.deleteMany({ where: { imageUrl: { startsWith: IMAGE_PREFIX } } });
  await prisma.submission.deleteMany({ where: { submitterId: { in: ids } } });
  await prisma.user.deleteMany({ where: { email: { in: ALL_EMAILS } } });
  await prisma.systemSetting.deleteMany({ where: { key: 'qq-bot' } });
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
  await cleanupData();
  const passwordHash = await bcrypt.hash('password-123', 4);
  // uid 900041+ 避开其他用例号段
  const author = await prisma.user.create({
    data: { email: AUTHOR_EMAIL, nickname: '被举报作者', passwordHash, uid: 900042 },
    select: { id: true },
  });
  const reporter = await prisma.user.create({
    data: { email: REPORTER_EMAIL, nickname: '热心网友', passwordHash, uid: 900043 },
    select: { id: true },
  });
  authorId = author.id;
  reporterId = reporter.id;
});

afterAll(async () => {
  await cleanupData();
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await prisma.systemSetting.deleteMany({ where: { key: 'qq-bot' } });
  resetQQBotStateForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function signToken(userId: string, nickname: string): string {
  return app.jwt.sign({ sub: userId, role: 'USER', nickname });
}

function reportComment(commentId: string, token: string) {
  return app.inject({
    method: 'POST',
    url: `/api/gallery/comments/${commentId}/report`,
    headers: { cookie: `spaceport_token=${token}` },
    payload: { reason: '评论内容不当' },
  });
}

async function createTestComment(): Promise<string> {
  const image = await prisma.galleryImage.create({
    data: { imageUrl: `${IMAGE_PREFIX}${randomUUID()}.jpg`, title: '测试图' },
    select: { id: true },
  });
  const comment = await prisma.galleryComment.create({
    data: { imageId: image.id, userId: authorId, content: '这条评论包含不当内容' },
    select: { id: true },
  });
  return comment.id;
}

describe('举报提醒文案', () => {
  it('包含举报人/评论作者/评论内容/举报理由', () => {
    const message = buildCommentReportNotifyMessage({
      reporterNickname: '热心网友',
      commentContent: '这条评论包含不当内容',
      commentUserNickname: '被举报作者',
      reason: '垃圾广告',
    });
    expect(message).toContain('收到评论举报');
    expect(message).toContain('举报人：热心网友');
    expect(message).toContain('评论作者：被举报作者');
    expect(message).toContain('评论内容：这条评论包含不当内容');
    expect(message).toContain('举报理由：垃圾广告');
  });

  it('评论作者缺失时不输出作者行', () => {
    const message = buildCommentReportNotifyMessage({
      reporterNickname: '热心网友',
      commentContent: '评论内容',
      commentUserNickname: null,
      reason: '举报理由',
    });
    expect(message).not.toContain('评论作者');
    expect(message).toContain('评论内容：评论内容');
  });

  it('超过 60 字的评论截断并加省略号', () => {
    const message = buildCommentReportNotifyMessage({
      reporterNickname: '热心网友',
      commentContent: '好'.repeat(61),
      commentUserNickname: null,
      reason: '举报理由',
    });
    expect(message).toContain(`评论内容：${'好'.repeat(60)}…`);
    expect(message).not.toContain('好'.repeat(61));
  });
});

describe('评论举报推送（路由级）', () => {
  it('开关开启时举报成功并推送群消息', async () => {
    await saveStoredQQBotSettings({
      appId: '102000001',
      appSecret: 'secret-abc',
      groupOpenId: 'GID-REPORT',
      channelId: null,
      enabled: true,
      notify: { submission: true, report: true, dailyReport: true },
      dailyReportTime: '10:00',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ access_token: 'tok-1', expires_in: '7200' }))
      .mockResolvedValueOnce(jsonRes({ id: 'msg-1' }));
    vi.stubGlobal('fetch', fetchMock);

    const commentId = await createTestComment();
    const res = await reportComment(commentId, signToken(reporterId, '热心网友'));
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().item.status).toBe('PENDING');

    // 推送为后台异步任务：轮询等待 fetch 完成（先取 token 再发消息）
    await waitFor(() => fetchMock.mock.calls.length >= 2);
    const [sendUrl, sendInit] = fetchMock.mock.calls[1]!;
    expect(sendUrl).toBe('https://api.bot.qq.com/v2/groups/GID-REPORT/messages');
    const body = JSON.parse(String(sendInit!.body)) as { content: string };
    expect(body.content).toContain('收到评论举报');
    expect(body.content).toContain('举报人：热心网友');
    expect(body.content).toContain('评论内容：这条评论包含不当内容');
    expect(body.content).toContain('举报理由：评论内容不当');
  });

  it('notify.report 关闭时举报成功但不发起推送', async () => {
    await saveStoredQQBotSettings({
      appId: '102000001',
      appSecret: 'secret-abc',
      groupOpenId: 'GID-REPORT',
      channelId: null,
      enabled: true,
      notify: { submission: true, report: false, dailyReport: true },
      dailyReportTime: '10:00',
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const commentId = await createTestComment();
    const res = await reportComment(commentId, signToken(reporterId, '热心网友'));
    expect(res.statusCode, res.body).toBe(200);

    // 给后台任务留出执行窗口，确认没有网络请求
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('每日数据日报', () => {
  it('cronExprFromDailyReportTime：HH:mm 换算为 cron 表达式', () => {
    expect(cronExprFromDailyReportTime('10:00')).toBe('00 10 * * *');
    expect(cronExprFromDailyReportTime('23:59')).toBe('59 23 * * *');
    expect(cronExprFromDailyReportTime('00:07')).toBe('07 00 * * *');
  });

  it('shanghaiYesterdayRange：上海时区昨天区间对应 UTC，含月边界', () => {
    // 上海时间 2026-11-18 11:00（UTC 03:00）→ 昨天 = 上海 11 月 17 日
    const now = new Date('2026-11-18T03:00:00.000Z');
    const { start, end } = shanghaiYesterdayRange(now);
    expect(start.toISOString()).toBe('2026-11-16T16:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-17T16:00:00.000Z');
    expect(shanghaiYesterdayLabel(now)).toBe('11月17日');

    // 上海 3 月 1 日的昨天是 2 月 28 日
    const march = shanghaiYesterdayRange(new Date('2026-03-01T02:00:00.000Z'));
    expect(march.start.toISOString()).toBe('2026-02-27T16:00:00.000Z');
    expect(march.end.toISOString()).toBe('2026-02-28T16:00:00.000Z');
    expect(shanghaiYesterdayLabel(new Date('2026-03-01T02:00:00.000Z'))).toBe('2月28日');
  });

  it('测试环境下 reschedule 直接跳过且不抛错', async () => {
    await expect(rescheduleQQBotDailyReport()).resolves.toBeUndefined();
  });

  it('buildDailyReportMessage 统计昨日数据，sendQQBotDailyReport 按开关推送', async () => {
    const now = new Date();
    const { start } = shanghaiYesterdayRange(now);
    const inRange = new Date(start.getTime() + 3600_000);

    // 积压计数是全量口径：先取基线，再叠加本用例种子
    const [pendingSubmissionsBefore, pendingReportsBefore] = await Promise.all([
      prisma.submission.count({ where: { status: 'PENDING' } }),
      prisma.commentReport.count({ where: { status: 'PENDING' } }),
    ]);

    const dailyUser = await prisma.user.create({
      data: {
        email: DAILY_EMAIL,
        nickname: '日报新用户',
        passwordHash: 'test-only',
        uid: 900044,
        createdAt: inRange,
      },
      select: { id: true },
    });
    await prisma.submission.create({
      data: { entityType: 'GROUP', payload: '{}', submitterId: authorId, createdAt: inRange },
    });
    await prisma.submission.create({
      data: { entityType: 'SITE', payload: '{}', submitterId: authorId, createdAt: inRange },
    });
    // 范围外（今天）的 PENDING 投稿：不计入昨日新增，但计入积压
    await prisma.submission.create({
      data: { entityType: 'GALLERY', payload: '{}', submitterId: authorId },
    });
    const image = await prisma.galleryImage.create({
      data: { imageUrl: `${IMAGE_PREFIX}${randomUUID()}.jpg`, title: '日报图', createdAt: inRange },
      select: { id: true },
    });
    await prisma.galleryComment.create({
      data: { imageId: image.id, userId: authorId, content: '日报评论', createdAt: inRange },
    });
    await prisma.galleryLike.create({
      data: { imageId: image.id, userId: reporterId, createdAt: inRange },
    });
    await prisma.commentReport.create({
      data: { commentContent: '日报举报内容', reporterId, reason: '日报理由', createdAt: inRange },
    });

    const message = await buildDailyReportMessage(now);
    expect(message).toContain(`【数据日报】${shanghaiYesterdayLabel(now)}`);
    expect(message).toContain('新增用户：1');
    expect(message).toContain('新增投稿：2');
    expect(message).toContain('用户群 1');
    expect(message).toContain('网站 1');
    expect(message).toContain('新增画廊作品：1');
    expect(message).toContain('新增评论：1');
    expect(message).toContain('新增点赞：1');
    expect(message).toContain('新增举报：1');
    expect(message).toContain(
      `待审核积压：投稿 ${pendingSubmissionsBefore + 3}，举报 ${pendingReportsBefore + 1}`,
    );

    // 开关开启：推送日报
    await saveStoredQQBotSettings({
      appId: '102000001',
      appSecret: 'secret-abc',
      groupOpenId: 'GID-DAILY',
      channelId: null,
      enabled: true,
      notify: { submission: true, report: true, dailyReport: true },
      dailyReportTime: '10:00',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ access_token: 'tok-1', expires_in: '7200' }))
      .mockResolvedValueOnce(jsonRes({ id: 'msg-1' }));
    vi.stubGlobal('fetch', fetchMock);

    await sendQQBotDailyReport(mockLogger());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sendBody = JSON.parse(String(fetchMock.mock.calls[1]![1]!.body)) as { content: string };
    expect(sendBody.content).toContain('【数据日报】');
    expect(sendBody.content).toContain('待审核积压');

    // dailyReport 关闭：不发起请求
    await saveStoredQQBotSettings({
      appId: '102000001',
      appSecret: 'secret-abc',
      groupOpenId: 'GID-DAILY',
      channelId: null,
      enabled: true,
      notify: { submission: true, report: true, dailyReport: false },
      dailyReportTime: '10:00',
    });
    fetchMock.mockClear();
    await sendQQBotDailyReport(mockLogger());
    expect(fetchMock).not.toHaveBeenCalled();

    // 清理本用例种子，避免影响后续用例的统计口径
    await prisma.commentReport.deleteMany({ where: { reporterId: { in: [reporterId, dailyUser.id] } } });
    await prisma.galleryComment.deleteMany({ where: { imageId: image.id } });
    await prisma.galleryLike.deleteMany({ where: { imageId: image.id } });
    await prisma.galleryImage.deleteMany({ where: { id: image.id } });
    await prisma.submission.deleteMany({ where: { submitterId: { in: [authorId, dailyUser.id] } } });
    await prisma.user.deleteMany({ where: { id: dailyUser.id } });
  });
});
