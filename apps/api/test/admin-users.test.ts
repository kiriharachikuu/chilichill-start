import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { prisma } from '../src/prisma';

// 后台用户管理扩展接口：
// - PATCH /api/admin/users/:id/profile 站长修改用户基本资料（昵称/头像/空间头图/自我介绍/地区）
// - POST /api/admin/users 站长代注册新用户（可指定 6 位 UID 或留空自动分配）
// - 两者均要求 ADMIN 权限并写入审计日志（USER_PROFILE_UPDATE / USER_CREATE）
// - 测试库为共享 SQLite 且文件并行执行，自动分配 uid 的断言用范围/存在性判断，
//   避免与其他测试文件写入的数据产生竞态

const ADMIN_EMAIL = 'admin-users-admin@test.dev';
const MOD_EMAIL = 'admin-users-mod@test.dev';
const TARGET_EMAIL = 'admin-users-target@test.dev';
const NEW_EMAIL = 'admin-users-new@test.dev';
const AUTO_EMAIL = 'admin-users-auto@test.dev';
const ROLE_EMAIL = 'admin-users-role@test.dev';
const PASSWORD = 'password-123';

const ALL_EMAILS = [ADMIN_EMAIL, MOD_EMAIL, TARGET_EMAIL, NEW_EMAIL, AUTO_EMAIL, ROLE_EMAIL];

let app: FastifyInstance;
let adminToken: string;
let modToken: string;
let targetId: string;

async function loginToken(email: string, password: string = PASSWORD): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });
  expect(res.statusCode, res.body).toBe(200);
  const cookie = res.cookies.find((entry) => entry.name === 'spaceport_token');
  expect(cookie).toBeDefined();
  return cookie!.value;
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  await prisma.user.deleteMany({ where: { email: { in: ALL_EMAILS } } });
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  // uid 900301+ 避开正式号段
  await prisma.user.create({
    data: { email: ADMIN_EMAIL, nickname: '用户管理管理员', passwordHash, uid: 900301, role: 'ADMIN' },
    select: { id: true },
  });
  await prisma.user.create({
    data: { email: MOD_EMAIL, nickname: '用户管理审核员', passwordHash, uid: 900302, role: 'MODERATOR' },
    select: { id: true },
  });
  const target = await prisma.user.create({
    data: {
      email: TARGET_EMAIL,
      nickname: '待编辑成员',
      passwordHash,
      uid: 900304,
      bio: '原始简介',
    },
    select: { id: true },
  });
  targetId = target.id;
  adminToken = await loginToken(ADMIN_EMAIL);
  modToken = await loginToken(MOD_EMAIL);
});

afterAll(async () => {
  // 按本文件构造的精确条件清理，不影响其他测试文件的数据
  await prisma.adminAuditLog.deleteMany({
    where: { action: { in: ['USER_PROFILE_UPDATE', 'USER_CREATE'] }, targetType: 'USER' },
  });
  await prisma.user.deleteMany({ where: { email: { in: ALL_EMAILS } } });
  await app.close();
  await prisma.$disconnect();
});

function adminRequest(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: { cookie: `spaceport_token=${adminToken}` },
    ...(payload !== undefined ? { payload } : {}),
  });
}

function modRequest(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) {
  return app.inject({
    method,
    url,
    headers: { cookie: `spaceport_token=${modToken}` },
    ...(payload !== undefined ? { payload } : {}),
  });
}

describe('后台用户列表', () => {
  it('返回 uid 与资料字段（供编辑弹窗回填）', async () => {
    const res = await adminRequest('GET', '/api/admin/users?page=1&pageSize=50');
    expect(res.statusCode, res.body).toBe(200);
    const target = res.json().items.find((item: { id: string }) => item.id === targetId);
    expect(target).toBeDefined();
    expect(target.uid).toBe(900304);
    expect(target.bio).toBe('原始简介');
    expect(target).toHaveProperty('avatarUrl');
    expect(target).toHaveProperty('bannerUrl');
    expect(target).toHaveProperty('province');
    expect(target).toHaveProperty('city');
  });

  it('审核组访问列表返回 403', async () => {
    expect((await modRequest('GET', '/api/admin/users')).statusCode).toBe(403);
  });
});

describe('站长修改用户基本资料', () => {
  it('修改昵称/简介/地区/头像并写入审计日志', async () => {
    const res = await adminRequest('PATCH', `/api/admin/users/${targetId}/profile`, {
      nickname: '改名后的成员',
      bio: '管理员代改的自我介绍',
      province: '广东省',
      city: '深圳市',
      avatarUrl: 'https://cdn.test/avatar.png',
      bannerUrl: 'https://cdn.test/banner.png',
    });
    expect(res.statusCode, res.body).toBe(200);

    const user = await prisma.user.findUnique({ where: { id: targetId } });
    expect(user?.nickname).toBe('改名后的成员');
    expect(user?.bio).toBe('管理员代改的自我介绍');
    expect(user?.province).toBe('广东省');
    expect(user?.city).toBe('深圳市');
    expect(user?.avatarUrl).toBe('https://cdn.test/avatar.png');
    expect(user?.bannerUrl).toBe('https://cdn.test/banner.png');

    const log = await prisma.adminAuditLog.findFirst({
      where: { action: 'USER_PROFILE_UPDATE', targetId },
      orderBy: { createdAt: 'desc' },
    });
    expect(log).not.toBeNull();
    const detail = JSON.parse(log!.detail) as {
      changes: Record<string, { from: unknown; to: unknown }>;
    };
    expect(detail.changes.nickname).toEqual({ from: '待编辑成员', to: '改名后的成员' });
    expect(detail.changes.bio).toEqual({ from: '原始简介', to: '管理员代改的自我介绍' });
  });

  it('空字符串归一为 null（清空头像/简介）', async () => {
    const res = await adminRequest('PATCH', `/api/admin/users/${targetId}/profile`, {
      avatarUrl: '',
      bio: '',
    });
    expect(res.statusCode, res.body).toBe(200);
    const user = await prisma.user.findUnique({ where: { id: targetId } });
    expect(user?.avatarUrl).toBeNull();
    expect(user?.bio).toBeNull();
  });

  it('内容无变化时不写审计日志', async () => {
    const before = await prisma.adminAuditLog.count({
      where: { action: 'USER_PROFILE_UPDATE', targetId },
    });
    const res = await adminRequest('PATCH', `/api/admin/users/${targetId}/profile`, {
      nickname: '改名后的成员',
    });
    expect(res.statusCode, res.body).toBe(200);
    const after = await prisma.adminAuditLog.count({
      where: { action: 'USER_PROFILE_UPDATE', targetId },
    });
    expect(after).toBe(before);
  });

  it('未提供任何字段返回 400', async () => {
    const res = await adminRequest('PATCH', `/api/admin/users/${targetId}/profile`, {});
    expect(res.statusCode).toBe(400);
  });

  it('昵称超长返回 400', async () => {
    const res = await adminRequest('PATCH', `/api/admin/users/${targetId}/profile`, {
      nickname: 'x'.repeat(21),
    });
    expect(res.statusCode).toBe(400);
  });

  it('用户不存在返回 404', async () => {
    const res = await adminRequest('PATCH', '/api/admin/users/user-not-exist/profile', {
      nickname: '幽灵用户',
    });
    expect(res.statusCode).toBe(404);
  });

  it('审核组修改资料返回 403', async () => {
    const res = await modRequest('PATCH', `/api/admin/users/${targetId}/profile`, {
      nickname: '越权改名',
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('站长代注册新用户', () => {
  it('指定 UID 与用户组创建成功，新账号可用密码登录', async () => {
    const res = await adminRequest('POST', '/api/admin/users', {
      email: NEW_EMAIL,
      password: 'new-pass-123',
      nickname: '指定UID新用户',
      uid: 930001,
      role: 'MODERATOR',
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json();
    expect(body.item.uid).toBe(930001);
    expect(body.item.role).toBe('MODERATOR');
    expect(body.item.email).toBe(NEW_EMAIL);

    const user = await prisma.user.findUnique({ where: { uid: 930001 } });
    expect(user?.nickname).toBe('指定UID新用户');
    expect(user?.policyConsentAt).not.toBeNull();

    // 新账号可用初始密码登录
    await loginToken(NEW_EMAIL, 'new-pass-123');

    const log = await prisma.adminAuditLog.findFirst({
      where: { action: 'USER_CREATE', targetId: body.item.id },
    });
    expect(log).not.toBeNull();
    const detail = JSON.parse(log!.detail) as { uid: number; email: string; role: string };
    expect(detail.uid).toBe(930001);
    expect(detail.email).toBe(NEW_EMAIL);
    expect(detail.role).toBe('MODERATOR');
  });

  it('未指定 UID 时自动分配 6 位 uid', async () => {
    const res = await adminRequest('POST', '/api/admin/users', {
      email: AUTO_EMAIL,
      password: 'auto-pass-123',
      nickname: '自动UID用户',
    });
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json();
    expect(typeof body.item.uid).toBe('number');
    expect(body.item.uid).toBeGreaterThanOrEqual(100000);
    expect(body.item.uid).toBeLessThanOrEqual(999999);
    expect(body.item.role).toBe('USER');
  });

  it('指定已有 UID 返回 409', async () => {
    const res = await adminRequest('POST', '/api/admin/users', {
      email: 'admin-users-conflict@test.dev',
      password: 'conflict-123',
      nickname: '冲突用户',
      uid: 900304,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toBe('该 UID 已被其他用户使用');
  });

  it('指定已被使用的邮箱返回 409', async () => {
    const res = await adminRequest('POST', '/api/admin/users', {
      email: TARGET_EMAIL,
      password: 'conflict-123',
      nickname: '邮箱冲突用户',
      uid: 930002,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.message).toBe('该邮箱已注册');
  });

  it('UID 非 6 位纯数字返回 400', async () => {
    const res = await adminRequest('POST', '/api/admin/users', {
      email: 'admin-users-baduid@test.dev',
      password: 'baduid-12345',
      nickname: '非法UID用户',
      uid: 12345,
    });
    expect(res.statusCode).toBe(400);
  });

  it('密码过短返回 400', async () => {
    const res = await adminRequest('POST', '/api/admin/users', {
      email: 'admin-users-shortpw@test.dev',
      password: 'short',
      nickname: '弱密码用户',
    });
    expect(res.statusCode).toBe(400);
  });

  it('审核组代注册返回 403', async () => {
    const res = await modRequest('POST', '/api/admin/users', {
      email: 'admin-users-forbidden@test.dev',
      password: 'forbidden-123',
      nickname: '越权注册',
    });
    expect(res.statusCode).toBe(403);
  });
});
