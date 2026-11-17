import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { prisma } from '../src/prisma';

// 后台直接编辑已发布内容（PUT /api/admin/groups/:id 与 /api/admin/sites/:id）：
// - 仅管理员可编辑：未登录 401、审核组 403
// - 复用投稿实体的 UPDATE 校验逻辑：必填缺失 400、群号/链接冲突 409、目标不存在 404
// - 未传 published 时保持原上下线状态，显式传入时可同时切换
// - 每次编辑写入 AdminAuditLog（action=content.update），后台操作日志可追溯
// - 测试库为共享 SQLite 且文件并行执行，资源按 content-edit 前缀隔离，清理用精确条件

const PREFIX = 'content-edit';
const ADMIN_EMAIL = `${PREFIX}-admin@test.dev`;
const MOD_EMAIL = `${PREFIX}-mod@test.dev`;
const PASSWORD = 'password-123';

let app: FastifyInstance;
let adminToken: string;
let modToken: string;
let adminId: string;
let groupId: string;
let siteId: string;
let groupTagA: string;
let groupTagB: string;
let siteTag: string;

const groupPayload = (overrides: Record<string, unknown> = {}) => ({
  name: `${PREFIX} 编辑后群名`,
  platform: 'QQ',
  groupNumber: '900000001',
  type: 'GENERAL',
  description: `${PREFIX} 编辑后群简介，长度超过五个字`,
  tags: [groupTagA],
  ...overrides,
});

const sitePayload = (overrides: Record<string, unknown> = {}) => ({
  title: `${PREFIX} 编辑后站名`,
  url: `https://${PREFIX}.test/new`,
  description: `${PREFIX} 编辑后站点简介`,
  tags: [siteTag],
  ...overrides,
});

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

function put(url: string, token: string | undefined, payload: unknown) {
  return app.inject({
    method: 'PUT',
    url,
    headers: token ? { cookie: `spaceport_token=${token}` } : {},
    payload: payload ?? {},
  });
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, MOD_EMAIL] } } });
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  // uid 900030+ 避开正式号段与其他测试文件
  const admin = await prisma.user.create({
    data: { email: ADMIN_EMAIL, nickname: '内容编辑管理员', passwordHash, uid: 900030, role: 'ADMIN' },
    select: { id: true },
  });
  adminId = admin.id;
  await prisma.user.create({
    data: { email: MOD_EMAIL, nickname: '内容编辑审核员', passwordHash, uid: 900031, role: 'MODERATOR' },
    select: { id: true },
  });
  adminToken = await loginToken(ADMIN_EMAIL);
  modToken = await loginToken(MOD_EMAIL);

  const tagA = await prisma.tag.create({
    data: { name: `${PREFIX}闲聊`, slug: `${PREFIX}-chat`, scope: 'GROUP', kind: 'FUNCTION' },
    select: { id: true },
  });
  const tagB = await prisma.tag.create({
    data: { name: `${PREFIX}资源`, slug: `${PREFIX}-resource`, scope: 'GROUP', kind: 'FUNCTION' },
    select: { id: true },
  });
  const tagS = await prisma.tag.create({
    data: { name: `${PREFIX}周边`, slug: `${PREFIX}-goods`, scope: 'SITE', kind: 'FUNCTION' },
    select: { id: true },
  });
  groupTagA = tagA.id;
  groupTagB = tagB.id;
  siteTag = tagS.id;

  await prisma.group.deleteMany({ where: { groupNumber: { in: ['900000001', '900000002'] } } });
  const group = await prisma.group.create({
    data: {
      name: `${PREFIX} 编辑前群名`,
      platform: 'QQ',
      groupNumber: '900000001',
      type: 'GENERAL',
      regionCode: 'OTHER',
      regionName: '待定',
      description: `${PREFIX} 编辑前群简介`,
      published: true,
      tags: { create: [{ tagId: groupTagA }] },
    },
    select: { id: true },
  });
  groupId = group.id;

  // 占用另一个群号 / 链接，用于冲突断言
  await prisma.group.create({
    data: {
      name: `${PREFIX} 冲突群`,
      platform: 'QQ',
      groupNumber: '900000002',
      type: 'GENERAL',
      regionCode: 'OTHER',
      regionName: '待定',
      description: `${PREFIX} 冲突群简介`,
      tags: { create: [{ tagId: groupTagA }] },
    },
  });

  const site = await prisma.site.create({
    data: {
      title: `${PREFIX} 编辑前站名`,
      url: `https://${PREFIX}.test/old`,
      description: `${PREFIX} 编辑前站点简介`,
      published: false,
      tags: { create: [{ tagId: siteTag }] },
    },
    select: { id: true },
  });
  siteId = site.id;

  await prisma.site.create({
    data: {
      title: `${PREFIX} 冲突站`,
      url: `https://${PREFIX}.test/conflict`,
      description: `${PREFIX} 冲突站简介`,
      tags: { create: [{ tagId: siteTag }] },
    },
  });
});

afterAll(async () => {
  // GroupTag/SiteTag 随内容级联删除，其余按本文件前缀精确清理
  await prisma.group.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.site.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.tag.deleteMany({ where: { slug: { startsWith: `${PREFIX}-` } } });
  await prisma.adminAuditLog.deleteMany({ where: { actorId: adminId, action: 'content.update' } });
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, MOD_EMAIL] } } });
  await app.close();
  await prisma.$disconnect();
});

describe('PUT /api/admin/groups/:id 后台编辑已发布群组', () => {
  it('未登录返回 401，审核组返回 403', async () => {
    const anon = await put(`/api/admin/groups/${groupId}`, undefined, {});
    expect(anon.statusCode).toBe(401);

    const mod = await put(`/api/admin/groups/${groupId}`, modToken, {});
    expect(mod.statusCode).toBe(403);
  });

  it('管理员全字段编辑成功：字段更新、标签替换、published 保持不变', async () => {
    const res = await put(
      `/api/admin/groups/${groupId}`,
      adminToken,
      groupPayload({ tags: [groupTagA, groupTagB] }),
    );
    expect(res.statusCode, res.body).toBe(200);

    const { item } = JSON.parse(res.body) as {
      item: { id: string; name: string; description: string; published: boolean; tags: { id: string }[] };
    };
    expect(item.id).toBe(groupId);
    expect(item.name).toBe(`${PREFIX} 编辑后群名`);
    expect(item.description).toBe(`${PREFIX} 编辑后群简介，长度超过五个字`);
    expect(item.published).toBe(true);
    expect(item.tags.map((tag) => tag.id).sort()).toEqual([groupTagA, groupTagB].sort());
  });

  it('显式传入 published 可同时切换上下线状态', async () => {
    const res = await put(`/api/admin/groups/${groupId}`, adminToken, groupPayload({ published: false }));
    expect(res.statusCode, res.body).toBe(200);
    const { item } = JSON.parse(res.body) as { item: { published: boolean } };
    expect(item.published).toBe(false);

    const restore = await put(`/api/admin/groups/${groupId}`, adminToken, groupPayload({ published: true }));
    expect(restore.statusCode).toBe(200);
  });

  it('群号与其他群冲突时返回 409', async () => {
    const res = await put(
      `/api/admin/groups/${groupId}`,
      adminToken,
      groupPayload({ groupNumber: '900000002' }),
    );
    expect(res.statusCode).toBe(409);
  });

  it('缺少必填字段返回 400，目标不存在返回 404', async () => {
    const { name: _name, ...invalid } = groupPayload();
    const invalidRes = await put(`/api/admin/groups/${groupId}`, adminToken, invalid);
    expect(invalidRes.statusCode).toBe(400);

    const missing = await put('/api/admin/groups/not-exists-id', adminToken, groupPayload());
    expect(missing.statusCode).toBe(404);
  });
});

describe('PUT /api/admin/sites/:id 后台编辑已发布站点', () => {
  it('管理员全字段编辑成功，未传 published 保持原状态', async () => {
    const res = await put(`/api/admin/sites/${siteId}`, adminToken, sitePayload());
    expect(res.statusCode, res.body).toBe(200);
    const { item } = JSON.parse(res.body) as { item: { title: string; url: string; published: boolean } };
    expect(item.title).toBe(`${PREFIX} 编辑后站名`);
    expect(item.url).toBe(`https://${PREFIX}.test/new`);
    expect(item.published).toBe(false);
  });

  it('网站链接与其他站点冲突时返回 409', async () => {
    const res = await put(
      `/api/admin/sites/${siteId}`,
      adminToken,
      sitePayload({ url: `https://${PREFIX}.test/conflict` }),
    );
    expect(res.statusCode).toBe(409);
  });
});

describe('后台编辑审计日志', () => {
  it('每次编辑写入 content.update 操作日志', async () => {
    const logs = await prisma.adminAuditLog.findMany({
      where: { actorId: adminId, action: 'content.update', targetType: { in: ['Group', 'Site'] } },
    });
    // 群组 4 次成功编辑（含上下线切换 2 次）+ 站点 1 次成功编辑
    expect(logs.length).toBeGreaterThanOrEqual(3);
    expect(logs.every((log) => log.targetType === 'Group' || log.targetType === 'Site')).toBe(true);
  });
});
