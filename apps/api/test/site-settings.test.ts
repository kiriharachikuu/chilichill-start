import bcrypt from 'bcryptjs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { prisma } from '../src/prisma';

// 站点信息设置（About 页备案号/联系邮箱/赞助支持）：
// - GET/PUT 仅管理员可用，未登录 401、普通成员 403
// - 保存后经 /api/meta 公开下发 about 段
// - 字段留空/空串归一化为 null；联系邮箱格式非法返回 400

const ADMIN_EMAIL = 'site-admin@test.dev';
const USER_EMAIL = 'site-user@test.dev';
const PASSWORD = 'password-123';
const EMPTY_ITEM = { icpNumber: null, contactEmail: null, sponsorNote: null, sponsorQrcodeUrl: null };

let app: FastifyInstance;
let adminToken: string;
let userToken: string;

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

  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, USER_EMAIL] } } });
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  // uid 900023+/900024+ 避开正式号段
  await prisma.user.create({
    data: { email: ADMIN_EMAIL, nickname: '站点设置管理员', passwordHash, uid: 900023, role: 'ADMIN' },
    select: { id: true },
  });
  await prisma.user.create({
    data: { email: USER_EMAIL, nickname: '站点设置成员', passwordHash, uid: 900024 },
    select: { id: true },
  });
  adminToken = await loginToken(ADMIN_EMAIL);
  userToken = await loginToken(USER_EMAIL);
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [ADMIN_EMAIL, USER_EMAIL] } } });
  await app.close();
  await prisma.$disconnect();
});

function getSite(token: string) {
  return app.inject({
    method: 'GET',
    url: '/api/admin/settings/site',
    headers: { cookie: `spaceport_token=${token}` },
  });
}

function putSite(payload: unknown, token: string) {
  return app.inject({
    method: 'PUT',
    url: '/api/admin/settings/site',
    headers: { cookie: `spaceport_token=${token}` },
    payload,
  });
}

describe('站点信息设置', () => {
  it('未配置时默认值全空，meta.about 同步为空', async () => {
    const res = await getSite(adminToken);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().item).toEqual(EMPTY_ITEM);

    const meta = await app.inject({ method: 'GET', url: '/api/meta' });
    expect(meta.statusCode, meta.body).toBe(200);
    expect(meta.json().about).toEqual(EMPTY_ITEM);
  });

  it('未登录读取返回 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/settings/site' });
    expect(res.statusCode).toBe(401);
  });

  it('普通成员读取与写入返回 403', async () => {
    expect((await getSite(userToken)).statusCode).toBe(403);
    expect((await putSite({ icpNumber: '粤ICP备2026000000号' }, userToken)).statusCode).toBe(403);
  });

  it('管理员保存后 meta 公开下发，字段做 trim 归一化', async () => {
    const put = await putSite(
      {
        icpNumber: ' 粤ICP备2026000000号 ',
        contactEmail: 'admin@test.dev',
        sponsorNote: ' 服务器与域名维护需要成本，欢迎请站长喝杯奶茶 ',
        sponsorQrcodeUrl: '/uploads/sponsor-qrcode.png',
      },
      adminToken,
    );
    expect(put.statusCode, put.body).toBe(200);
    expect(put.json().item).toEqual({
      icpNumber: '粤ICP备2026000000号',
      contactEmail: 'admin@test.dev',
      sponsorNote: '服务器与域名维护需要成本，欢迎请站长喝杯奶茶',
      sponsorQrcodeUrl: '/uploads/sponsor-qrcode.png',
    });

    const meta = await app.inject({ method: 'GET', url: '/api/meta' });
    expect(meta.json().about).toEqual({
      icpNumber: '粤ICP备2026000000号',
      contactEmail: 'admin@test.dev',
      sponsorNote: '服务器与域名维护需要成本，欢迎请站长喝杯奶茶',
      sponsorQrcodeUrl: '/uploads/sponsor-qrcode.png',
    });
  });

  it('空串与未传字段归一化为 null', async () => {
    const put = await putSite({ icpNumber: '', contactEmail: '', sponsorNote: '', sponsorQrcodeUrl: '' }, adminToken);
    expect(put.statusCode, put.body).toBe(200);
    expect(put.json().item).toEqual(EMPTY_ITEM);
  });

  it('联系邮箱格式非法返回 400', async () => {
    const res = await putSite({ icpNumber: '', contactEmail: 'not-an-email' }, adminToken);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });
});
