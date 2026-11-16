import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { prisma } from '../src/prisma';

// 后台仪表盘 /api/admin/dashboard：
// - 审核组（MODERATOR）与管理员可访问，未登录 401、普通成员 403
// - 返回待办/内容/用户统计与最新待审核投稿、最近审计日志
// - 测试库为共享 SQLite 且文件并行执行，计数断言一律用 >=，列表用包含断言，
//   避免与其他测试文件写入的数据产生竞态

const ADMIN_EMAIL = 'dash-admin@test.dev';
const MOD_EMAIL = 'dash-mod@test.dev';
const USER_EMAIL = 'dash-user@test.dev';
const PASSWORD = 'password-123';

let app: FastifyInstance;
let adminToken: string;
let modToken: string;
let userToken: string;
let userId: string;
let pendingSubmissionId: string;
let auditLogId: string;

async function loginToken(email: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password: PASSWORD },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookie = res.cookies.find((entry) => entry.name === 'spaceport_token');
  expect(cookie).toBeDefined();
  return cookie!.value;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, MOD_EMAIL, USER_EMAIL] } } });
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  // uid 900025+ 避开正式号段
  const admin = await prisma.user.create({
    data: { email: ADMIN_EMAIL, nickname: '仪表盘管理员', passwordHash, uid: 900025, role: 'ADMIN' },
    select: { id: true },
  });
  await prisma.user.create({
    data: { email: MOD_EMAIL, nickname: '仪表盘审核员', passwordHash, uid: 900026, role: 'MODERATOR' },
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { email: USER_EMAIL, nickname: '仪表盘成员', passwordHash, uid: 900027 },
    select: { id: true },
  });
  userId = user.id;
  adminToken = await loginToken(ADMIN_EMAIL);
  modToken = await loginToken(MOD_EMAIL);
  userToken = await loginToken(USER_EMAIL);

  // 待审核投稿（今日创建）
  const pending = await prisma.submission.create({
    data: {
      entityType: 'GROUP',
      mode: 'UPDATE',
      payload: JSON.stringify({ name: '仪表盘测试群', tags: [] }),
      status: 'PENDING',
      submitterId: userId,
    },
    select: { id: true },
  });
  pendingSubmissionId = pending.id;
  // 已通过投稿
  await prisma.submission.create({
    data: {
      entityType: 'SITE',
      mode: 'CREATE',
      payload: JSON.stringify({ title: '仪表盘测试站', url: 'https://dash.test', tags: [] }),
      status: 'APPROVED',
      submitterId: userId,
    },
    select: { id: true },
  });
  // 待处理举报
  await prisma.commentReport.create({
    data: { commentContent: '举报内容', reporterId: userId, reason: '垃圾信息', status: 'PENDING' },
    select: { id: true },
  });
  // 审计日志
  const log = await prisma.adminAuditLog.create({
    data: {
      actorId: admin.id,
      actorNickname: '仪表盘管理员',
      action: 'submission.approve',
      targetType: 'Submission',
      targetId: pendingSubmissionId,
      detail: '{}',
    },
    select: { id: true },
  });
  auditLogId = log.id;
});

afterAll(async () => {
  // 按本文件构造的精确条件清理，不影响其他测试文件的数据
  await prisma.submission.deleteMany({ where: { submitterId: userId } });
  await prisma.commentReport.deleteMany({ where: { reporterId: userId } });
  await prisma.adminAuditLog.deleteMany({ where: { id: auditLogId } });
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, MOD_EMAIL, USER_EMAIL] } } });
  await app.close();
  await prisma.$disconnect();
});

function getDashboard(token?: string) {
  return app.inject({
    method: 'GET',
    url: '/api/admin/dashboard',
    headers: token ? { cookie: `spaceport_token=${token}` } : {},
  });
}

describe('后台仪表盘', () => {
  it('未登录读取返回 401', async () => {
    const res = await getDashboard();
    expect(res.statusCode).toBe(401);
  });

  it('普通成员读取返回 403', async () => {
    expect((await getDashboard(userToken)).statusCode).toBe(403);
  });

  it('审核组与管理员均可读取，统计与列表结构完整', async () => {
    for (const token of [adminToken, modToken]) {
      const res = await getDashboard(token);
      expect(res.statusCode, res.body).toBe(200);
      const body = res.json();
      const stats = body.stats;
      expect(stats.pendingSubmissions).toBeGreaterThanOrEqual(1);
      expect(stats.totalSubmissions).toBeGreaterThanOrEqual(2);
      expect(stats.todaySubmissions).toBeGreaterThanOrEqual(2);
      expect(stats.approvedSubmissions).toBeGreaterThanOrEqual(1);
      expect(stats.rejectedSubmissions).toBeGreaterThanOrEqual(0);
      expect(stats.groups).toBeGreaterThanOrEqual(0);
      expect(stats.sites).toBeGreaterThanOrEqual(0);
      expect(stats.activities).toBeGreaterThanOrEqual(0);
      expect(stats.galleryImages).toBeGreaterThanOrEqual(0);
      expect(stats.galleryLikes).toBeGreaterThanOrEqual(0);
      expect(stats.galleryComments).toBeGreaterThanOrEqual(0);
      expect(stats.users).toBeGreaterThanOrEqual(3);
      expect(stats.pendingReports).toBeGreaterThanOrEqual(1);
    }
  });

  it('最新待审核投稿按提交时间倒序，包含刚创建的投稿', async () => {
    const res = await getDashboard(adminToken);
    const { recentSubmissions } = res.json();
    expect(Array.isArray(recentSubmissions)).toBe(true);
    expect(recentSubmissions.length).toBeGreaterThan(0);
    expect(recentSubmissions.map((item: { id: string }) => item.id)).toContain(pendingSubmissionId);
    // 倒序：相邻两条，前一条提交时间不早于后一条
    for (let i = 1; i < recentSubmissions.length; i += 1) {
      expect(recentSubmissions[i - 1].createdAt >= recentSubmissions[i].createdAt).toBe(true);
    }
    const mine = recentSubmissions.find((item: { id: string }) => item.id === pendingSubmissionId);
    expect(mine).toMatchObject({
      entityType: 'GROUP',
      mode: 'UPDATE',
      status: 'PENDING',
      submitter: { nickname: '仪表盘成员' },
    });
  });

  it('最近审计日志包含刚记录的审核动作', async () => {
    const res = await getDashboard(adminToken);
    const { recentAuditLogs } = res.json();
    const mine = recentAuditLogs.find((item: { id: string }) => item.id === auditLogId);
    expect(mine).toMatchObject({
      actorNickname: '仪表盘管理员',
      action: 'submission.approve',
      targetType: 'Submission',
      targetId: pendingSubmissionId,
    });
  });
});
