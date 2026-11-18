import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { prisma } from '../src/prisma';
import { derivePenalty, MUTE_DURATION_DAYS, WARNING_LIMIT } from '@spaceport/shared';

// 举报处罚管理全链路：
// - 阶梯推导：警告×3 → 禁言 3/7/15 天 → 永久封号（含边界：第 3 次警告仍是警告、第 4 次禁言、第 4 次禁言升级封号）
// - 处罚限制：禁言禁止评论/投稿、封号禁止登录与鉴权请求、到期自动解除
// - 撤销：自动回退计数并恢复权限，阶梯按剩余有效记录重新推导
// - 公示：小黑屋倒序、排除已撤销、隐私字段裁剪
// - 留痕与通知：审计日志（操作人/凭证/时间）、系统通知、已读标记
// 测试库为共享 SQLite，全局计数断言一律用 >=，精确计数仅针对本文件用户过滤

const ADMIN_EMAIL = 'pen-admin@test.dev';
const MOD_EMAIL = 'pen-mod@test.dev';
const STAFF_EMAIL = 'pen-staff@test.dev';
const OFFENDER_EMAIL = 'pen-user@test.dev';
const REPORTER_EMAIL = 'pen-reporter@test.dev';
const BANNED_EMAIL = 'pen-banned@test.dev';
const PASSWORD = 'password-123';
const DAY_MS = 24 * 60 * 60 * 1000;

let app: FastifyInstance;
let adminToken: string;
let modToken: string;
let offenderToken: string;
let adminId = '';
let modId = '';
let staffId = '';
let offenderId = '';
let reporterId = '';
let offenderUid = 0;
let imageId = '';

/** 为被处罚人创建一条 PENDING 举报（commentId 为空：评论已删但快照仍在的场景同样有效） */
async function createPendingReport(target: { id: string; nickname: string }, reason: string) {
  return prisma.commentReport.create({
    data: {
      commentContent: `待核实内容：${reason}`,
      commentUserId: target.id,
      commentUserNickname: target.nickname,
      reporterId,
      reason,
      status: 'PENDING',
    },
    select: { id: true },
  });
}

/** 以审核员身份核实举报，返回响应体 */
async function resolveReport(id: string) {
  const res = await app.inject({
    method: 'POST',
    url: `/api/admin/comment-reports/${id}/resolve`,
    headers: { cookie: `spaceport_token=${modToken}` },
  });
  return res;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  const emails = [ADMIN_EMAIL, MOD_EMAIL, STAFF_EMAIL, OFFENDER_EMAIL, REPORTER_EMAIL, BANNED_EMAIL];
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  // uid 900201+ 避开正式号段与其他测试文件
  const admin = await prisma.user.create({
    data: { email: ADMIN_EMAIL, nickname: '处罚站长', passwordHash, uid: 900201, role: 'ADMIN' },
    select: { id: true },
  });
  const mod = await prisma.user.create({
    data: { email: MOD_EMAIL, nickname: '处罚审核员', passwordHash, uid: 900202, role: 'MODERATOR' },
    select: { id: true },
  });
  const staff = await prisma.user.create({
    data: { email: STAFF_EMAIL, nickname: '豁免审核员', passwordHash, uid: 900203, role: 'MODERATOR' },
    select: { id: true },
  });
  const offender = await prisma.user.create({
    data: { email: OFFENDER_EMAIL, nickname: '阶梯受罚人', passwordHash, uid: 900204 },
    select: { id: true, uid: true },
  });
  const reporter = await prisma.user.create({
    data: { email: REPORTER_EMAIL, nickname: '举报人', passwordHash, uid: 900205 },
    select: { id: true },
  });
  const banned = await prisma.user.create({
    data: {
      email: BANNED_EMAIL,
      nickname: '历史封号户',
      passwordHash,
      uid: 900206,
      bannedAt: new Date(),
    },
    select: { id: true },
  });
  adminId = admin.id;
  modId = mod.id;
  staffId = staff.id;
  offenderId = offender.id;
  offenderUid = offender.uid;
  reporterId = reporter.id;

  const image = await prisma.galleryImage.create({
    data: { imageUrl: 'https://pen.test/img.png', title: '处罚测试作品', published: true },
    select: { id: true },
  });
  imageId = image.id;

  const loginToken = async (email: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password: PASSWORD },
    });
    expect(res.statusCode, res.body).toBe(200);
    const cookie = res.cookies.find((entry) => entry.name === 'spaceport_token');
    expect(cookie).toBeDefined();
    return cookie!.value;
  };
  adminToken = await loginToken(ADMIN_EMAIL);
  modToken = await loginToken(MOD_EMAIL);
  offenderToken = await loginToken(OFFENDER_EMAIL);
  // banned 用户封号后不可登录，仅通过 DB 修改解锁后验证；staff 无需登录
});

afterAll(async () => {
  // 按外键依赖顺序精确清理本文件数据
  await prisma.galleryComment.deleteMany({ where: { imageId } });
  await prisma.commentReport.deleteMany({ where: { reporterId } });
  await prisma.penalty.deleteMany({
    where: { userId: { in: [offenderId, staffId] } },
  });
  await prisma.notification.deleteMany({
    where: { userId: { in: [offenderId, staffId, reporterId] } },
  });
  await prisma.adminAuditLog.deleteMany({ where: { actorId: { in: [adminId, modId] } } });
  await prisma.submission.deleteMany({ where: { submitterId: offenderId } });
  await prisma.galleryImage.deleteMany({ where: { id: imageId } });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [ADMIN_EMAIL, MOD_EMAIL, STAFF_EMAIL, OFFENDER_EMAIL, REPORTER_EMAIL, BANNED_EMAIL],
      },
    },
  });
  await app.close();
  await prisma.$disconnect();
});

/** 核实第 seq 条举报并断言处罚等级/计数/时间精确（1~3 警告、4~6 禁言 3/7/15 天、7 封号） */
async function resolveAndAssert(seq: number) {
  const report = await createPendingReport(
    { id: offenderId, nickname: '阶梯受罚人' },
    `举报核实-阶梯-第${seq}次`,
  );
  const res = await resolveReport(report.id);
  expect(res.statusCode, res.body).toBe(200);
  const body = res.json();
  expect(body.item.status).toBe('RESOLVED');
  expect(body.penalty).not.toBeNull();
  expect(body.penalty.userUid).toBe(offenderUid);
  expect(body.penalty.reason).toBe(`举报核实-阶梯-第${seq}次`);

  const dbUser = await prisma.user.findUnique({
    where: { id: offenderId },
    select: { warningCount: true, muteCount: true, bannedAt: true },
  });

  if (seq <= 3) {
    // 第 1~3 次核实：警告，无功能限制
    expect(body.penalty.type).toBe('WARNING');
    expect(body.penalty.durationDays).toBeNull();
    expect(body.penalty.endsAt).toBeNull();
    expect(dbUser?.warningCount).toBe(seq);
    expect(dbUser?.muteCount).toBe(0);
    expect(dbUser?.bannedAt).toBeNull();
  } else if (seq <= 6) {
    // 第 4~6 次核实：阶梯禁言 3/7/15 天
    const expectedDays = MUTE_DURATION_DAYS[seq - 4];
    expect(body.penalty.type).toBe('MUTE');
    expect(body.penalty.durationDays).toBe(expectedDays);
    const diff =
      new Date(body.penalty.endsAt).getTime() - new Date(body.penalty.startedAt).getTime();
    expect(Math.abs(diff - expectedDays * DAY_MS)).toBeLessThan(1000);
    expect(dbUser?.warningCount).toBe(3);
    expect(dbUser?.muteCount).toBe(seq - 3);
    expect(dbUser?.bannedAt).toBeNull();
  } else {
    // 第 7 次核实：累计禁言满 3 次 → 永久封号
    expect(body.penalty.type).toBe('BAN');
    expect(body.penalty.durationDays).toBeNull();
    expect(body.penalty.endsAt).toBeNull();
    expect(dbUser?.warningCount).toBe(3);
    expect(dbUser?.muteCount).toBe(3);
    expect(dbUser?.bannedAt).not.toBeNull();
  }
}

describe('处罚阶梯推导（举报核实自动触发）', () => {
  it('纯函数边界：前 3 次警告，第 4 次起按 3/7/15 天禁言，禁言满 3 次后封号', () => {
    expect(derivePenalty(0, 0)).toEqual({ type: 'WARNING', durationDays: null });
    expect(derivePenalty(WARNING_LIMIT - 1, 0)).toEqual({ type: 'WARNING', durationDays: null });
    expect(derivePenalty(WARNING_LIMIT, 0)).toEqual({ type: 'MUTE', durationDays: MUTE_DURATION_DAYS[0] });
    expect(derivePenalty(WARNING_LIMIT, 1)).toEqual({ type: 'MUTE', durationDays: MUTE_DURATION_DAYS[1] });
    expect(derivePenalty(WARNING_LIMIT, 2)).toEqual({ type: 'MUTE', durationDays: MUTE_DURATION_DAYS[2] });
    expect(derivePenalty(WARNING_LIMIT, 3)).toEqual({ type: 'BAN', durationDays: null });
  });

  it('核实前 4 条举报：警告×3 后升级首次禁言 3 天，计数与时间精确', async () => {
    for (let seq = 1; seq <= 4; seq += 1) {
      await resolveAndAssert(seq);
    }
  });

  it('首次禁言生效期间：禁止评论与投稿（403 ACCOUNT_MUTED），到期后自动解除', async () => {
    // 3 天禁言仍在生效期内
    const mutedComment = await app.inject({
      method: 'POST',
      url: `/api/gallery/${imageId}/comments`,
      headers: { cookie: `spaceport_token=${offenderToken}` },
      payload: { content: '禁言期间不应发出的评论' },
    });
    expect(mutedComment.statusCode).toBe(403);
    expect(mutedComment.json().error.code).toBe('ACCOUNT_MUTED');

    const mutedSubmission = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      headers: { cookie: `spaceport_token=${offenderToken}` },
      payload: { entityType: 'GROUP', mode: 'CREATE', payload: {} },
    });
    expect(mutedSubmission.statusCode).toBe(403);
    expect(mutedSubmission.json().error.code).toBe('ACCOUNT_MUTED');

    // /api/auth/me 不拦截封号与禁言：返回实时处罚状态供前端展示
    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `spaceport_token=${offenderToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.penalty).toMatchObject({
      banned: false,
      warningCount: 3,
      muteCount: 1,
    });
    expect(me.json().user.penalty.mutedUntil).not.toBeNull();

    // 将首次禁言的结束时间改到过去 → 到期自动解除，可正常发言
    const firstMute = await prisma.penalty.findFirstOrThrow({
      where: { userId: offenderId, type: 'MUTE', durationDays: 3 },
      orderBy: { startedAt: 'asc' },
      select: { id: true },
    });
    await prisma.penalty.update({
      where: { id: firstMute.id },
      data: { endsAt: new Date(Date.now() - 1000) },
    });

    const afterExpiry = await app.inject({
      method: 'POST',
      url: `/api/gallery/${imageId}/comments`,
      headers: { cookie: `spaceport_token=${offenderToken}` },
      payload: { content: '禁言到期解除后可正常发言' },
    });
    expect(afterExpiry.statusCode, afterExpiry.body).toBe(200);
  });

  it('继续核实第 5~7 条举报：禁言 7 天、15 天逐级升级至永久封号', async () => {
    for (let seq = 5; seq <= 7; seq += 1) {
      await resolveAndAssert(seq);
    }
  });
});

describe('封号限制与豁免规则', () => {
  it('封号用户禁止登录（密码验证通过后提示，防账号枚举）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: OFFENDER_EMAIL, password: PASSWORD },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ACCOUNT_BANNED');

    // 密码错误时仍是凭据错误提示，不泄露封号状态
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: OFFENDER_EMAIL, password: 'not-the-password' },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongPassword.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('封号用户旧 token：需鉴权接口被拦截，/api/auth/me 仍可读自身处罚状态', async () => {
    const blocked = await app.inject({
      method: 'GET',
      url: '/api/users/me/penalty-status',
      headers: { cookie: `spaceport_token=${offenderToken}` },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe('ACCOUNT_BANNED');

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `spaceport_token=${offenderToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.penalty.banned).toBe(true);
  });

  it('已封号用户被再次核实举报：不叠加新处罚', async () => {
    const report = await createPendingReport(
      { id: offenderId, nickname: '阶梯受罚人' },
      '举报核实-封号后重复',
    );
    const res = await resolveReport(report.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().penalty).toBeNull();
    const bannedCount = await prisma.penalty.count({
      where: { userId: offenderId, type: 'BAN' },
    });
    expect(bannedCount).toBe(1);
  });

  it('举报无被处罚人（评论已被删且快照缺失）：仅关闭举报不触发处罚', async () => {
    const report = await prisma.commentReport.create({
      data: {
        commentContent: '无主评论内容',
        reporterId,
        reason: '举报核实-无被处罚人',
        status: 'PENDING',
      },
      select: { id: true },
    });
    const res = await resolveReport(report.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().penalty).toBeNull();
  });

  it('审核组成员评论被核实：豁免处罚', async () => {
    const report = await createPendingReport(
      { id: staffId, nickname: '豁免审核员' },
      '举报核实-审核员豁免',
    );
    const res = await resolveReport(report.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().penalty).toBeNull();
    const staffState = await prisma.user.findUniqueOrThrow({
      where: { id: staffId },
      select: { warningCount: true, muteCount: true, bannedAt: true },
    });
    expect(staffState).toEqual({ warningCount: 0, muteCount: 0, bannedAt: null });
  });

  it('直接预置封号的用户被核实举报：同样不叠加处罚', async () => {
    const bannedUser = await prisma.user.findUniqueOrThrow({
      where: { email: BANNED_EMAIL },
      select: { id: true, nickname: true },
    });
    const report = await createPendingReport(bannedUser, '举报核实-预置封号户');
    const res = await resolveReport(report.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().penalty).toBeNull();
  });
});

describe('管理员撤销处罚与权限恢复', () => {
  let banPenaltyId = '';
  let mute15PenaltyId = '';

  it('审核员无权撤销（仅站长），未登录 401', async () => {
    const ban = await prisma.penalty.findFirstOrThrow({
      where: { userId: offenderId, type: 'BAN' },
      select: { id: true },
    });
    banPenaltyId = ban.id;

    const anonymous = await app.inject({
      method: 'POST',
      url: `/api/admin/penalties/${banPenaltyId}/revoke`,
      payload: { reason: '误处罚撤销' },
    });
    expect(anonymous.statusCode).toBe(401);

    const byMod = await app.inject({
      method: 'POST',
      url: `/api/admin/penalties/${banPenaltyId}/revoke`,
      headers: { cookie: `spaceport_token=${modToken}` },
      payload: { reason: '误处罚撤销' },
    });
    expect(byMod.statusCode).toBe(403);

    // 撤销原因少于 2 字被拒绝
    const shortReason = await app.inject({
      method: 'POST',
      url: `/api/admin/penalties/${banPenaltyId}/revoke`,
      headers: { cookie: `spaceport_token=${adminToken}` },
      payload: { reason: '误' },
    });
    expect(shortReason.statusCode).toBe(400);
  });

  it('站长撤销封号：bannedAt 清空、登录恢复、通知与审计留痕', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/penalties/${banPenaltyId}/revoke`,
      headers: { cookie: `spaceport_token=${adminToken}` },
      payload: { reason: '核实有误，撤销封号' },
    });
    expect(res.statusCode, res.body).toBe(200);
    const item = res.json().item;
    expect(item.revokedAt).not.toBeNull();
    expect(item.revokeReason).toBe('核实有误，撤销封号');
    expect(item.revokedByNickname).toBe('处罚站长');

    const state = await prisma.user.findUniqueOrThrow({
      where: { id: offenderId },
      select: { bannedAt: true, warningCount: true, muteCount: true },
    });
    expect(state).toEqual({ bannedAt: null, warningCount: 3, muteCount: 3 });

    // 解封后可重新登录
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: OFFENDER_EMAIL, password: PASSWORD },
    });
    expect(login.statusCode, login.body).toBe(200);
    expect(login.json().user.penalty.banned).toBe(false);

    const notification = await prisma.notification.findFirst({
      where: { userId: offenderId, type: 'PENALTY_REVOKED' },
      select: { title: true, content: true },
    });
    expect(notification?.title).toBe('处罚撤销通知');
    expect(notification?.content).toContain('撤销封号');

    const audit = await prisma.adminAuditLog.findFirstOrThrow({
      where: { action: 'penalty.revoke', targetId: banPenaltyId },
      select: { actorNickname: true, detail: true },
    });
    expect(audit.actorNickname).toBe('处罚站长');
    expect(audit.detail).toContain('核实有误，撤销封号');
  });

  it('撤销禁言后阶梯回退：下次核实重新推导 15 天禁言，剩余时长实时可见', async () => {
    const mute15 = await prisma.penalty.findFirstOrThrow({
      where: { userId: offenderId, type: 'MUTE', durationDays: 15 },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    mute15PenaltyId = mute15.id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/penalties/${mute15PenaltyId}/revoke`,
      headers: { cookie: `spaceport_token=${adminToken}` },
      payload: { reason: '核实有误，撤销禁言' },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().item.type).toBe('MUTE');

    // 计数从有效记录重算：muteCount 3 → 2
    const state = await prisma.user.findUniqueOrThrow({
      where: { id: offenderId },
      select: { warningCount: true, muteCount: true, bannedAt: true },
    });
    expect(state).toEqual({ bannedAt: null, warningCount: 3, muteCount: 2 });

    // 将剩余的 7 天禁言缩短到 90 秒后过期，验证剩余时长字段
    const mute7 = await prisma.penalty.findFirstOrThrow({
      where: { userId: offenderId, type: 'MUTE', durationDays: 7 },
      select: { id: true },
    });
    await prisma.penalty.update({
      where: { id: mute7.id },
      data: { endsAt: new Date(Date.now() + 90 * 1000) },
    });

    const status = await app.inject({
      method: 'GET',
      url: '/api/users/me/penalty-status',
      headers: { cookie: `spaceport_token=${offenderToken}` },
    });
    expect(status.statusCode).toBe(200);
    const body = status.json();
    expect(body.warningCount).toBe(3);
    expect(body.muteCount).toBe(2);
    expect(body.banned).toBe(false);
    expect(body.activeMute.id).toBe(mute7.id);
    expect(body.activeMute.remainingSeconds).toBeGreaterThan(0);
    expect(body.activeMute.remainingSeconds).toBeLessThanOrEqual(120);

    // 阶梯回退：撤销第 3 次禁言后再次核实 → 仍按「第 3 次禁言」推导 15 天
    const report = await createPendingReport(
      { id: offenderId, nickname: '阶梯受罚人' },
      '举报核实-撤销后阶梯回退',
    );
    const resolveRes = await resolveReport(report.id);
    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.json().penalty.type).toBe('MUTE');
    expect(resolveRes.json().penalty.durationDays).toBe(15);
  });
});

describe('小黑屋公示与管理端列表', () => {
  it('公示列表：按处罚时间倒序、排除已撤销、仅暴露 uid 等非隐私字段', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/penalties?pageSize=50' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // 受罚人 7 条阶梯处罚 - 2 条已撤销（封号、15 天禁言）+ 撤销后重新推导 1 条 = 6 条
    expect(body.total).toBeGreaterThanOrEqual(6);
    expect(body.items.length).toBeGreaterThanOrEqual(6);

    // 倒序：相邻两条，前一条生效时间不早于后一条
    for (let i = 1; i < body.items.length; i += 1) {
      expect(body.items[i - 1].startedAt >= body.items[i].startedAt).toBe(true);
    }

    // 已撤销的封号与 15 天禁言不再公示
    const revokedIds = (
      await prisma.penalty.findMany({
        where: { userId: offenderId, revokedAt: { not: null } },
        select: { id: true },
      })
    ).map((row) => row.id);
    expect(revokedIds.length).toBeGreaterThanOrEqual(2);
    for (const id of revokedIds) {
      expect(body.items.some((item: { id: string }) => item.id === id)).toBe(false);
    }

    // 隐私裁剪：只允许 uid/类型/时长/起止/事由字段
    for (const item of body.items) {
      expect(Object.keys(item).sort()).toEqual(
        ['durationDays', 'endsAt', 'id', 'reason', 'startedAt', 'type', 'userUid'].sort(),
      );
    }
    const mine = body.items.filter((item: { userUid: number }) => item.userUid === offenderUid);
    expect(mine.length).toBe(6);
    expect(mine.some((item: { type: string }) => item.type === 'BAN')).toBe(false);
    expect(mine.some((item: { type: string; durationDays: number | null }) =>
      item.type === 'MUTE' && item.durationDays === 15,
    )).toBe(true);
  });

  it('公示列表支持类型过滤', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/penalties?type=MUTE&pageSize=50' });
    expect(res.statusCode).toBe(200);
    for (const item of res.json().items) {
      expect(item.type).toBe('MUTE');
    }
  });

  it('管理端列表：审核员可读，撤销状态筛选与用户过滤正确', async () => {
    const anonymous = await app.inject({ method: 'GET', url: '/api/admin/penalties' });
    expect(anonymous.statusCode).toBe(401);
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/penalties',
      headers: { cookie: `spaceport_token=${offenderToken}` },
    });
    expect(forbidden.statusCode).toBe(403);

    const revoked = await app.inject({
      method: 'GET',
      url: '/api/admin/penalties?revoked=true&pageSize=50',
      headers: { cookie: `spaceport_token=${modToken}` },
    });
    expect(revoked.statusCode).toBe(200);
    const revokedItems = revoked.json().items;
    expect(revokedItems.length).toBeGreaterThanOrEqual(2);
    for (const item of revokedItems) {
      expect(item.revokedAt).not.toBeNull();
      expect(item.revokeReason).not.toBeNull();
    }
    expect(revokedItems.some((item: { userNickname: string | null }) =>
      item.userNickname === '阶梯受罚人',
    )).toBe(true);
  });
});

describe('系统通知与审计留痕', () => {
  it('处罚触发通知完整：类型、标题、事由、阶梯提示', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/me/notifications?pageSize=30',
      headers: { cookie: `spaceport_token=${offenderToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // 7 次阶梯处罚 + 撤销封号 + 撤销禁言 + 撤销后再禁言 = 10 条
    expect(body.total).toBe(10);

    const penaltyItems = body.items.filter((item: { type: string }) => item.type === 'PENALTY');
    const revokedItems = body.items.filter((item: { type: string }) => item.type === 'PENALTY_REVOKED');
    expect(penaltyItems.length).toBe(8);
    expect(revokedItems.length).toBe(2);

    const firstWarning = penaltyItems.find((item: { title: string }) =>
      item.title.includes('警告（第 1 次）'),
    );
    expect(firstWarning?.content).toContain('举报核实-阶梯-第1次');
    const banNotice = penaltyItems.find((item: { title: string }) => item.title.includes('永久封号'));
    expect(banNotice?.content).toContain('禁止登录');
    const muteNotice = penaltyItems.find((item: { title: string }) =>
      item.title.includes('禁言 3 天'),
    );
    expect(muteNotice?.content).toContain('禁止发布内容与评论');
  });

  it('标记通知已读：仅限本人、幂等', async () => {
    const latest = await prisma.notification.findFirstOrThrow({
      where: { userId: offenderId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, readAt: true },
    });
    expect(latest.readAt).toBeNull();

    const first = await app.inject({
      method: 'POST',
      url: `/api/users/me/notifications/${latest.id}/read`,
      headers: { cookie: `spaceport_token=${offenderToken}` },
    });
    expect(first.statusCode).toBe(200);
    expect((await prisma.notification.findUniqueOrThrow({ where: { id: latest.id } })).readAt).not.toBeNull();

    // 幂等：重复标记仍成功
    const second = await app.inject({
      method: 'POST',
      url: `/api/users/me/notifications/${latest.id}/read`,
      headers: { cookie: `spaceport_token=${offenderToken}` },
    });
    expect(second.statusCode).toBe(200);

    // 不能标记他人通知
    const foreign = await prisma.notification.create({
      data: { userId: reporterId, type: 'PENALTY', title: '他人通知', content: '占位' },
      select: { id: true },
    });
    const forbiddenRead = await app.inject({
      method: 'POST',
      url: `/api/users/me/notifications/${foreign.id}/read`,
      headers: { cookie: `spaceport_token=${offenderToken}` },
    });
    expect(forbiddenRead.statusCode).toBe(404);
  });

  it('审计日志：处罚触发与撤销均记录操作人、时间与核实凭证', async () => {
    // 本文件触发了 8 次处罚（7 次阶梯 + 撤销后再禁言），撤销 2 次
    const applies = await prisma.adminAuditLog.findMany({
      where: { action: 'penalty.apply', actorId: modId },
      select: { targetId: true, detail: true },
    });
    expect(applies.length).toBe(8);
    for (const log of applies) {
      const detail = JSON.parse(log.detail) as {
        penaltyUserUid: number;
        evidenceReportIds: string[];
        operatorId?: string;
      };
      expect(detail.penaltyUserUid).toBe(offenderUid);
      expect(Array.isArray(detail.evidenceReportIds)).toBe(true);
      expect(detail.evidenceReportIds.length).toBeGreaterThan(0);
    }

    const revokes = await prisma.adminAuditLog.count({
      where: { action: 'penalty.revoke', actorId: adminId },
    });
    expect(revokes).toBe(2);

    // 每条处罚的核实凭证都能对应到具体举报
    const firstApply = applies[0];
    const evidenceId = (JSON.parse(firstApply.detail) as { evidenceReportIds: string[] })
      .evidenceReportIds[0];
    const report = await prisma.commentReport.findUniqueOrThrow({
      where: { id: evidenceId },
      select: { status: true, reason: true, handledById: true },
    });
    expect(report.status).toBe('RESOLVED');
    expect(report.handledById).toBe(modId);
  });
});
