import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { prisma } from '../src/prisma';

// 画廊点赞 / 评论核心功能集成测试（fastify.inject，不占真实端口）
// 鉴权为 cookie JWT：authenticate 仅验签不查库，测试直接用 app.jwt.sign 签发 token

const TEST_EMAILS = ['gallery-a@test.dev', 'gallery-b@test.dev'];
const TEST_IMAGE_URL_PREFIX = '/test/gallery/';

interface TestUser {
  id: string;
  nickname: string;
}

let app: FastifyInstance;
let userA: TestUser;
let userB: TestUser;
let imageId: string; // 主测试图（点赞 + 评论）
let hiddenImageId: string; // 未发布图
let listImageId: string; // 列表冒烟测试图

const auth = (user: TestUser) => ({
  headers: { cookie: `spaceport_token=${signToken(user)}` },
});

function signToken(user: TestUser) {
  return app.jwt.sign({ sub: user.id, role: 'USER', nickname: user.nickname });
}

async function likeCount(imageIdValue: string) {
  return prisma.galleryLike.count({ where: { imageId: imageIdValue } });
}

beforeAll(async () => {
  app = await buildApp();
  await app.ready();

  // 幂等清理：删除本轮及历史遗留的测试数据
  await prisma.galleryLike.deleteMany({ where: { image: { imageUrl: { startsWith: TEST_IMAGE_URL_PREFIX } } } });
  await prisma.galleryComment.deleteMany({ where: { image: { imageUrl: { startsWith: TEST_IMAGE_URL_PREFIX } } } });
  await prisma.galleryImage.deleteMany({ where: { imageUrl: { startsWith: TEST_IMAGE_URL_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { in: TEST_EMAILS } } });

  userA = await prisma.user.create({
    // uid 必填（非空才会被 toPublicUploader 序列化），900001+ 避开正式号段
    data: { email: 'gallery-a@test.dev', nickname: '测试甲', passwordHash: 'test-only', uid: 900001 },
    select: { id: true, nickname: true },
  });
  userB = await prisma.user.create({
    data: { email: 'gallery-b@test.dev', nickname: '测试乙', passwordHash: 'test-only', uid: 900002 },
    select: { id: true, nickname: true },
  });

  const image = await prisma.galleryImage.create({
    data: { imageUrl: `${TEST_IMAGE_URL_PREFIX}${randomUUID()}.jpg`, title: '点赞评论主图', published: true },
    select: { id: true },
  });
  imageId = image.id;

  const hidden = await prisma.galleryImage.create({
    data: { imageUrl: `${TEST_IMAGE_URL_PREFIX}${randomUUID()}.jpg`, title: '未发布图', published: false },
    select: { id: true },
  });
  hiddenImageId = hidden.id;

  const listImage = await prisma.galleryImage.create({
    data: { imageUrl: `${TEST_IMAGE_URL_PREFIX}${randomUUID()}.jpg`, title: '列表冒烟图', published: true },
    select: { id: true },
  });
  listImageId = listImage.id;
});

afterAll(async () => {
  await prisma.galleryLike.deleteMany({ where: { image: { imageUrl: { startsWith: TEST_IMAGE_URL_PREFIX } } } });
  await prisma.galleryComment.deleteMany({ where: { image: { imageUrl: { startsWith: TEST_IMAGE_URL_PREFIX } } } });
  await prisma.galleryImage.deleteMany({ where: { imageUrl: { startsWith: TEST_IMAGE_URL_PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { in: TEST_EMAILS } } });
  await app.close();
  await prisma.$disconnect();
});

describe('画廊点赞 toggle', () => {
  it('未登录点赞返回 401', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/gallery/${imageId}/like` });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
    expect(await likeCount(imageId)).toBe(0);
  });

  it('首次点赞：liked=true 且计数为 1', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/gallery/${imageId}/like`, ...auth(userA) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ imageId, liked: true, likeCount: 1 });
    expect(await likeCount(imageId)).toBe(1);
  });

  it('再次点赞（取消）：liked=false 且计数回落为 0', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/gallery/${imageId}/like`, ...auth(userA) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ imageId, liked: false, likeCount: 0 });
    expect(await likeCount(imageId)).toBe(0);
  });

  it('并发双击只产生一条点赞记录（唯一约束兜底）', async () => {
    const [first, second] = await Promise.all([
      app.inject({ method: 'POST', url: `/api/gallery/${imageId}/like`, ...auth(userA) }),
      app.inject({ method: 'POST', url: `/api/gallery/${imageId}/like`, ...auth(userA) }),
    ]);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.json().likeCount).toBe(1);
    expect(await likeCount(imageId)).toBe(1);

    // 还原：取消点赞
    await app.inject({ method: 'POST', url: `/api/gallery/${imageId}/like`, ...auth(userA) });
  });

  it('多用户点赞计数独立：各赞一次计 2，甲取消后计 1', async () => {
    await app.inject({ method: 'POST', url: `/api/gallery/${imageId}/like`, ...auth(userA) });
    await app.inject({ method: 'POST', url: `/api/gallery/${imageId}/like`, ...auth(userB) });
    expect(await likeCount(imageId)).toBe(2);

    await app.inject({ method: 'POST', url: `/api/gallery/${imageId}/like`, ...auth(userA) });
    expect(await likeCount(imageId)).toBe(1);

    // 乙的点赞状态不受甲取消影响
    const detail = await app.inject({ method: 'GET', url: `/api/gallery/${imageId}`, ...auth(userB) });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().item).toMatchObject({ liked: true, likeCount: 1 });

    // 未登录视角不含用户态，仅计数
    const anon = await app.inject({ method: 'GET', url: `/api/gallery/${imageId}` });
    expect(anon.json().item).toMatchObject({ liked: false, likeCount: 1 });

    // 还原
    await app.inject({ method: 'POST', url: `/api/gallery/${imageId}/like`, ...auth(userB) });
  });

  it('未发布作品点赞返回 404', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/gallery/${hiddenImageId}/like`, ...auth(userA) });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

describe('画廊评论', () => {
  it('未登录提交评论返回 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gallery/${imageId}/comments`,
      payload: { content: '想评论' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('空内容与超长内容返回 400', async () => {
    const empty = await app.inject({
      method: 'POST',
      url: `/api/gallery/${imageId}/comments`,
      ...auth(userA),
      payload: { content: '   ' },
    });
    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

    const tooLong = await app.inject({
      method: 'POST',
      url: `/api/gallery/${imageId}/comments`,
      ...auth(userA),
      payload: { content: '好'.repeat(201) },
    });
    expect(tooLong.statusCode).toBe(400);
  });

  it('登录提交评论成功，返回评论项与最新计数', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gallery/${imageId}/comments`,
      ...auth(userB),
      payload: { content: '太棒了，收藏了！' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.item).toMatchObject({ content: '太棒了，收藏了！' });
    expect(body.item.user).toMatchObject({ nickname: '测试乙' });
    expect(body.commentCount).toBe(1);

    const second = await app.inject({
      method: 'POST',
      url: `/api/gallery/${imageId}/comments`,
      ...auth(userA),
      payload: { content: '同好！' },
    });
    expect(second.statusCode, `第二次提交失败: ${second.body}`).toBe(200);
    expect(second.json().commentCount).toBe(2);
  });

  it('评论列表按时间倒序返回历史评论与总数', async () => {
    // 等待毫秒级时间戳错开，保证排序断言稳定
    await new Promise((resolve) => setTimeout(resolve, 15));
    const res = await app.inject({ method: 'GET', url: `/api/gallery/${imageId}/comments` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.total).toBe(2);
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ content: '同好！' });
    expect(body.items[0].user).toMatchObject({ nickname: '测试甲' });
    expect(body.items[1]).toMatchObject({ content: '太棒了，收藏了！' });
    expect(body.items[1].user).toMatchObject({ nickname: '测试乙' });
  });

  it('图片详情的 commentCount 与评论数同步', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/gallery/${imageId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().item.commentCount).toBe(2);
  });

  it('不存在的作品评论接口返回 404', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/gallery/not-exist/comments' });
    expect(list.statusCode).toBe(404);
    const create = await app.inject({
      method: 'POST',
      url: '/api/gallery/not-exist/comments',
      ...auth(userA),
      payload: { content: '占位' },
    });
    expect(create.statusCode).toBe(404);
  });

  it('未发布作品无法评论', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/gallery/${hiddenImageId}/comments`,
      ...auth(userA),
      payload: { content: '应该看不见我' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('画廊列表与点赞状态回显', () => {
  it('未登录列表返回分页数据且 liked=false', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/gallery', query: { page: '1', pageSize: '12' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(12);
    expect(body.hasMore).toBe(false);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    const target = body.items.find((item: { id: string }) => item.id === listImageId);
    expect(target).toBeTruthy();
    expect(target.liked).toBe(false);
  });

  it('登录用户列表回显自己的点赞状态', async () => {
    await app.inject({ method: 'POST', url: `/api/gallery/${listImageId}/like`, ...auth(userA) });
    const res = await app.inject({ method: 'GET', url: '/api/gallery', ...auth(userA) });
    const target = res.json().items.find((item: { id: string }) => item.id === listImageId);
    expect(target.liked).toBe(true);
    expect(target.likeCount).toBe(1);

    await app.inject({ method: 'POST', url: `/api/gallery/${listImageId}/like`, ...auth(userA) });
    const after = await app.inject({ method: 'GET', url: '/api/gallery', ...auth(userA) });
    const afterTarget = after.json().items.find((item: { id: string }) => item.id === listImageId);
    expect(afterTarget.liked).toBe(false);
  });
});
