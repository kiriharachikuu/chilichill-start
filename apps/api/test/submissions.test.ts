import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { prisma } from '../src/prisma';

// 投稿与审核流程回归测试：
// - 越权防护（UPDATE 他人内容、查看他人投稿）
// - GALLERY+UPDATE 前置拦截
// - 审核自审排除、approve 事务落地、reject → resubmit 链路
// 鉴权为 cookie JWT；requireReviewer 实时查库取角色，审核人必须真实存在于 DB（role='MODERATOR'）

const TEST_EMAILS = ['sub-a@test.dev', 'sub-b@test.dev', 'sub-mod@test.dev'];
const TEST_IMAGE_URL_PREFIX = '/test/submissions/';

interface TestUser {
  id: string;
  nickname: string;
  role: string;
}

let app: FastifyInstance;
let userA: TestUser;
let userB: TestUser;
let moderator: TestUser;
let userBGroupId: string; // userB 上传的群组（越权目标）
let userAGroupId: string; // userA 上传的群组（合法 UPDATE 目标）
let submissionGalleryId: string; // userA 画廊新增投稿（approve 落地链）
let submissionGroupId: string; // userA 群组新增投稿（reject → resubmit 链）
let submissionUpdateId: string; // userA 群组修改投稿（PENDING resubmit 409 用）
let submissionByModId: string; // 审核人自己的投稿（自审排除用）

const auth = (user: TestUser) => ({
  headers: { cookie: `spaceport_token=${signToken(user)}` },
});

function signToken(user: TestUser) {
  return app.jwt.sign({ sub: user.id, role: user.role, nickname: user.nickname });
}

const galleryPayload = () => ({
  imageUrl: `${TEST_IMAGE_URL_PREFIX}${randomUUID()}.jpg`,
  title: '投稿测试作品',
  mediaType: 'PAINTING',
});

const groupPayload = (overrides: Record<string, unknown> = {}) => ({
  name: '测试群组',
  groupNumber: '912345678',
  type: 'GENERAL',
  description: '这是一个测试群组简介',
  tags: ['t-test'],
  ...overrides,
});

function createSubmission(
  user: TestUser,
  entityType: 'GALLERY' | 'GROUP',
  payload: Record<string, unknown>,
  mode: 'CREATE' | 'UPDATE' = 'CREATE',
  targetId?: string,
) {
  return app.inject({
    method: 'POST',
    url: '/api/submissions',
    ...auth(user),
    payload: { entityType, mode, ...(targetId ? { targetId } : {}), payload },
  });
}

async function cleanup() {
  // 幂等清理：先删投稿/审计（外键），再删群组与画廊图，最后删用户
  const stale = await prisma.user.findMany({ where: { email: { in: TEST_EMAILS } }, select: { id: true } });
  const staleIds = stale.map((row) => row.id);
  if (staleIds.length > 0) {
    await prisma.submission.deleteMany({
      where: { OR: [{ submitterId: { in: staleIds } }, { reviewerId: { in: staleIds } }] },
    });
    await prisma.adminAuditLog.deleteMany({ where: { actorId: { in: staleIds } } });
    await prisma.group.deleteMany({ where: { uploaderId: { in: staleIds } } });
  }
  await prisma.galleryImage.deleteMany({ where: { imageUrl: { startsWith: TEST_IMAGE_URL_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { in: TEST_EMAILS } } });
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  await cleanup();

  userA = await prisma.user.create({
    // uid 必填（序列化 uploader 需要），900011+ 避开正式号段
    data: { email: 'sub-a@test.dev', nickname: '投稿甲', passwordHash: 'test-only', uid: 900011 },
    select: { id: true, nickname: true, role: true },
  });
  userB = await prisma.user.create({
    data: { email: 'sub-b@test.dev', nickname: '投稿乙', passwordHash: 'test-only', uid: 900012 },
    select: { id: true, nickname: true, role: true },
  });
  moderator = await prisma.user.create({
    data: { email: 'sub-mod@test.dev', nickname: '审核员', passwordHash: 'test-only', uid: 900013, role: 'MODERATOR' },
    select: { id: true, nickname: true, role: true },
  });

  const groupB = await prisma.group.create({
    data: { name: '乙的群', groupNumber: '911111111', type: 'GENERAL', description: '乙上传的群简介', uploaderId: userB.id },
    select: { id: true },
  });
  userBGroupId = groupB.id;

  const groupA = await prisma.group.create({
    data: { name: '甲的群', groupNumber: '922222222', type: 'GENERAL', description: '甲上传的群简介', uploaderId: userA.id },
    select: { id: true },
  });
  userAGroupId = groupA.id;
});

afterAll(async () => {
  await cleanup();
  await app.close();
  await prisma.$disconnect();
});

describe('POST /api/submissions', () => {
  it('未登录投稿返回 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      payload: { entityType: 'GALLERY', mode: 'CREATE', payload: galleryPayload() },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  it('GALLERY 修改投稿在入口被拦截 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/submissions',
      ...auth(userA),
      payload: { entityType: 'GALLERY', mode: 'UPDATE', targetId: 'whatever', payload: galleryPayload() },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('画廊新增投稿成功，进入 PENDING 待审核', async () => {
    const res = await createSubmission(userA, 'GALLERY', galleryPayload());
    expect(res.statusCode, res.body).toBe(201);
    const body = res.json();
    expect(body.item).toMatchObject({ status: 'PENDING', entityType: 'GALLERY', mode: 'CREATE', targetId: null });
    submissionGalleryId = body.item.id;
  });

  it('群组新增投稿成功', async () => {
    const res = await createSubmission(userA, 'GROUP', groupPayload());
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().item).toMatchObject({ status: 'PENDING', entityType: 'GROUP' });
    submissionGroupId = res.json().item.id;
  });

  it('群组 payload 校验失败返回 400（群号格式）', async () => {
    const res = await createSubmission(userA, 'GROUP', groupPayload({ groupNumber: 'abc' }));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('GENERAL 群缺标签被 schema 拦截 400', async () => {
    const res = await createSubmission(userA, 'GROUP', groupPayload({ tags: [] }));
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('对他人上传的群组发起修改返回 403（越权防护）', async () => {
    const res = await createSubmission(userA, 'GROUP', groupPayload(), 'UPDATE', userBGroupId);
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('修改目标不存在返回 404', async () => {
    const res = await createSubmission(userA, 'GROUP', groupPayload(), 'UPDATE', 'not-exist');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('对自己上传的群组发起修改成功且 targetId 回填', async () => {
    const res = await createSubmission(userA, 'GROUP', groupPayload(), 'UPDATE', userAGroupId);
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json().item).toMatchObject({ status: 'PENDING', mode: 'UPDATE', targetId: userAGroupId });
    submissionUpdateId = res.json().item.id;
  });
});

describe('GET /api/submissions/mine', () => {
  it('只返回本人投稿', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/submissions/mine', ...auth(userA) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(3);
    expect(body.items.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([submissionGalleryId, submissionGroupId, submissionUpdateId]),
    );
    expect(body.items.every((item: { submitterId: string }) => item.submitterId === userA.id)).toBe(true);

    const resB = await app.inject({ method: 'GET', url: '/api/submissions/mine', ...auth(userB) });
    expect(resB.statusCode).toBe(200);
    expect(resB.json().total).toBe(0);
  });

  it('status 过滤生效', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/submissions/mine',
      query: { status: 'PENDING' },
      ...auth(userA),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().total).toBe(3);

    const none = await app.inject({
      method: 'GET',
      url: '/api/submissions/mine',
      query: { status: 'APPROVED' },
      ...auth(userA),
    });
    expect(none.statusCode).toBe(200);
    expect(none.json().total).toBe(0);
  });
});

describe('GET /api/submissions/:id', () => {
  it('非本人且非管理员返回 403', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/submissions/${submissionGalleryId}`, ...auth(userB) });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('本人可查看自己的投稿', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/submissions/${submissionGalleryId}`, ...auth(userA) });
    expect(res.statusCode).toBe(200);
    expect(res.json().item).toMatchObject({ id: submissionGalleryId, status: 'PENDING' });
  });

  it('管理员可查看任意投稿', async () => {
    const adminToken = app.jwt.sign({ sub: 'admin-nonexist', role: 'ADMIN', nickname: '管理员' });
    const res = await app.inject({
      method: 'GET',
      url: `/api/submissions/${submissionGalleryId}`,
      headers: { cookie: `spaceport_token=${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.id).toBe(submissionGalleryId);
  });

  it('不存在的投稿返回 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/submissions/not-exist', ...auth(userA) });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/submissions/:id/resubmit', () => {
  it('非本人 resubmit 返回 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${submissionGalleryId}/resubmit`,
      ...auth(userB),
      payload: { payload: galleryPayload() },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('PENDING 状态 resubmit 返回 409', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${submissionUpdateId}/resubmit`,
      ...auth(userA),
      payload: { payload: groupPayload() },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'CONFLICT' } });
  });
});

describe('审核流程（requireReviewer）', () => {
  it('普通成员无权访问审核列表 403', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/submissions', ...auth(userA) });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('审核列表返回全部待审投稿', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/submissions', ...auth(moderator) });
    expect(res.statusCode, res.body).toBe(200);
    const ids = res.json().items.map((item: { id: string }) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining([submissionGalleryId, submissionGroupId, submissionUpdateId]),
    );
  });

  it('审核人不能通过自己的投稿（自审排除 403）', async () => {
    const self = await createSubmission(moderator, 'GALLERY', galleryPayload());
    expect(self.statusCode, self.body).toBe(201);
    submissionByModId = self.json().item.id;

    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/submissions/${submissionByModId}/approve`,
      ...auth(moderator),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'SELF_REVIEW_FORBIDDEN' } });
    // 自审拦截不应改变投稿状态
    expect(await prisma.submission.findUnique({ where: { id: submissionByModId } })).toMatchObject({
      status: 'PENDING',
    });
  });

  it('审核人不能驳回自己的投稿（自审排除 403）', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/submissions/${submissionByModId}/reject`,
      ...auth(moderator),
      payload: { reviewNote: '自审测试' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { code: 'SELF_REVIEW_FORBIDDEN' } });
  });

  it('approve 他人画廊投稿：落地新作品并回填 targetId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/submissions/${submissionGalleryId}/approve`,
      ...auth(moderator),
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = res.json();
    expect(body.item).toMatchObject({ status: 'APPROVED', entityType: 'GALLERY' });
    expect(typeof body.targetId).toBe('string');

    const image = await prisma.galleryImage.findUnique({ where: { id: body.targetId } });
    expect(image).toBeTruthy();
    expect(image?.imageUrl.startsWith(TEST_IMAGE_URL_PREFIX)).toBe(true);
    expect(image?.uploaderId).toBe(userA.id);
    expect(image?.published).toBe(true);

    const submission = await prisma.submission.findUnique({ where: { id: submissionGalleryId } });
    expect(submission).toMatchObject({ status: 'APPROVED', targetId: body.targetId, reviewerId: moderator.id });
  });

  it('重复 approve 已处理投稿返回 409', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/submissions/${submissionGalleryId}/approve`,
      ...auth(moderator),
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'CONFLICT' } });
  });

  it('reject 他人投稿：进入 REJECTED 且保留驳回原因', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/submissions/${submissionGroupId}/reject`,
      ...auth(moderator),
      payload: { reviewNote: '测试驳回，请修改后重投' },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().item).toMatchObject({ status: 'REJECTED' });

    const submission = await prisma.submission.findUnique({ where: { id: submissionGroupId } });
    expect(submission).toMatchObject({
      status: 'REJECTED',
      reviewNote: '测试驳回，请修改后重投',
      reviewerId: moderator.id,
    });
  });

  it('驳回原因长度校验 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/submissions/${submissionUpdateId}/reject`,
      ...auth(moderator),
      payload: { reviewNote: '短' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('驳回后可重新提交：回到 PENDING 且清空驳回信息', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/submissions/${submissionGroupId}/resubmit`,
      ...auth(userA),
      payload: { payload: groupPayload() },
    });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().item).toMatchObject({ status: 'PENDING' });

    const submission = await prisma.submission.findUnique({ where: { id: submissionGroupId } });
    expect(submission).toMatchObject({ status: 'PENDING', reviewNote: null, reviewerId: null, reviewedAt: null });
  });
});
