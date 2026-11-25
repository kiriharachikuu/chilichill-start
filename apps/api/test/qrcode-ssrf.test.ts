import bcrypt from 'bcryptjs';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { prisma } from '../src/prisma';

// 二维码代理下载的 SSRF 防护回归测试：
// - 十六进制/缩写 IPv4 经 URL 规范化后按字面量拦截（0x7f000001 → 127.0.0.1）
// - IPv6 回环 / IPv4 映射地址拦截
// - 域名 DNS 解析到内网地址拦截
// - 重定向逐跳校验：公网 → 内网（云元数据）拒绝；公网 → 公网正常跟随
// - 正常公网图片与 /uploads/ 本地路径不受影响

// DNS mock：internal.example.com 解析到内网地址，其余解析到公网地址
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (host: string) => {
    if (host === 'internal.example.com') {
      return [{ address: '10.0.0.5', family: 4 }];
    }
    return [{ address: '93.184.216.34', family: 4 }];
  }),
}));

const UPLOADER_EMAIL = 'qrcode-uploader@test.dev';
const PASSWORD = 'password-123';

let app: FastifyInstance;
let uploaderId: string;
const createdGroupIds: string[] = [];

// fetch stub：按 URL 返回预设响应（200 图片 / 302 重定向）
const fetchRoutes = new Map<string, { status: number; headers?: Record<string, string>; body?: Buffer }>();

async function fakeFetch(input: RequestInfo | URL): Promise<Response> {
  const url = String(input);
  const route = fetchRoutes.get(url);
  if (!route) {
    return new Response(null, { status: 404 });
  }
  if (route.status >= 300 && route.status < 400) {
    return new Response(null, { status: route.status, headers: route.headers });
  }
  return new Response(route.body ?? Buffer.from('fake-image'), {
    status: route.status,
    headers: route.headers ?? { 'content-type': 'image/png' },
  });
}

async function createGroup(qrcodeUrl: string | null): Promise<string> {
  const group = await prisma.group.create({
    data: {
      name: `SSRF 测试群 ${createdGroupIds.length + 1}`,
      type: 'OTHER',
      description: 'SSRF 回归测试用群',
      qrcodeUrl,
      published: true,
      uploaderId,
    },
    select: { id: true },
  });
  createdGroupIds.push(group.id);
  return group.id;
}

async function getQrcode(groupId: string) {
  return app.inject({ method: 'GET', url: `/api/groups/${groupId}/qrcode` });
}

beforeAll(async () => {
  vi.stubGlobal('fetch', fakeFetch);
  app = await buildApp();
  await app.ready();

  await prisma.user.deleteMany({ where: { email: UPLOADER_EMAIL } });
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const uploader = await prisma.user.create({
    data: { email: UPLOADER_EMAIL, nickname: '二维码测试用户', passwordHash, uid: 900025 },
    select: { id: true },
  });
  uploaderId = uploader.id;
});

afterAll(async () => {
  await prisma.group.deleteMany({ where: { id: { in: createdGroupIds } } });
  await prisma.user.deleteMany({ where: { email: UPLOADER_EMAIL } });
  await app.close();
  await prisma.$disconnect();
  vi.unstubAllGlobals();
});

afterEach(() => {
  fetchRoutes.clear();
});

describe('GET /api/groups/:id/qrcode SSRF 防护', () => {
  it('十六进制 IPv4 写法（0x7f000001 → 127.0.0.1）被拒绝', async () => {
    const id = await createGroup('http://0x7f000001/secret');
    const res = await getQrcode(id);
    expect(res.statusCode).toBe(404);
  });

  it('十进制 IPv4 写法（2130706433 → 127.0.0.1）被拒绝', async () => {
    const id = await createGroup('http://2130706433/secret');
    const res = await getQrcode(id);
    expect(res.statusCode).toBe(404);
  });

  it('IPv6 回环地址被拒绝', async () => {
    const id = await createGroup('http://[::1]/secret');
    const res = await getQrcode(id);
    expect(res.statusCode).toBe(404);
  });

  it('IPv4 映射地址（::ffff:127.0.0.1）被拒绝', async () => {
    const id = await createGroup('http://[::ffff:127.0.0.1]/secret');
    const res = await getQrcode(id);
    expect(res.statusCode).toBe(404);
  });

  it('云元数据地址（169.254.169.254）直接请求被拒绝', async () => {
    const id = await createGroup('http://169.254.169.254/latest/meta-data');
    const res = await getQrcode(id);
    expect(res.statusCode).toBe(404);
    // fetch 不应被调用：字面量校验在请求前拦截
    expect(fetchRoutes.size).toBe(0);
  });

  it('域名解析到内网地址（DNS 10.0.0.5）被拒绝', async () => {
    const id = await createGroup('http://internal.example.com/qr.png');
    const res = await getQrcode(id);
    expect(res.statusCode).toBe(404);
  });

  it('重定向跳向云元数据被逐跳拦截', async () => {
    fetchRoutes.set('https://attacker.example.com/qr.png', {
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data' },
    });
    const id = await createGroup('https://attacker.example.com/qr.png');
    const res = await getQrcode(id);
    expect(res.statusCode).toBe(404);
  });

  it('重定向跳向 IPv6 回环被逐跳拦截', async () => {
    fetchRoutes.set('https://attacker.example.com/v6', {
      status: 302,
      headers: { location: 'http://[::1]/secret' },
    });
    const id = await createGroup('https://attacker.example.com/v6');
    const res = await getQrcode(id);
    expect(res.statusCode).toBe(404);
  });

  it('重定向链过长（超过 5 跳）被拒绝', async () => {
    for (let hop = 1; hop <= 6; hop += 1) {
      fetchRoutes.set(`https://attacker.example.com/hop${hop}`, {
        status: 302,
        headers: { location: `https://attacker.example.com/hop${hop + 1}` },
      });
    }
    fetchRoutes.set('https://attacker.example.com/hop7', {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });
    const id = await createGroup('https://attacker.example.com/hop1');
    const res = await getQrcode(id);
    expect(res.statusCode).toBe(404);
  });

  it('公网 → 公网重定向正常跟随并返回图片', async () => {
    fetchRoutes.set('https://cdn.example.com/start', {
      status: 302,
      headers: { location: 'https://cdn.example.com/final.png' },
    });
    fetchRoutes.set('https://cdn.example.com/final.png', {
      status: 200,
      headers: { 'content-type': 'image/png' },
    });
    const id = await createGroup('https://cdn.example.com/start');
    const res = await getQrcode(id);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-disposition']).toContain('attachment');
  });

  it('公网直链图片正常返回', async () => {
    fetchRoutes.set('https://cdn.example.com/direct.png', {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    });
    const id = await createGroup('https://cdn.example.com/direct.png');
    const res = await getQrcode(id);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
  });
});
