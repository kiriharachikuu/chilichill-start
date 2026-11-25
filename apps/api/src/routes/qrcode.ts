import { readFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../prisma';

const uploadsRoot = resolve(fileURLToPath(new URL('../../public', import.meta.url)), 'uploads');

// 手动跟随重定向的上限：防止源站无限重定向循环
const MAX_REDIRECT_HOPS = 5;

/** IPv4 私网/保留段判断（回环、私网、链路本地（含云元数据 169.254.169.254）、CGNAT、组播等） */
function isBlockedIPv4(ip: string): boolean {
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => Number.isNaN(value))) {
    return true;
  }
  const [a, b] = octets;
  return (
    a === 0 || // 0.0.0.0/8 当前网络段
    a === 10 || // 10.0.0.0/8 私网
    a === 127 || // 127.0.0.0/8 回环（含 127.1 等缩写解析结果）
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    (a === 169 && b === 254) || // 169.254.0.0/16 链路本地（云元数据）
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 私网
    (a === 192 && b === 168) || // 192.168.0.0/16 私网
    (a === 192 && b === 0) || // 192.0.0.0/24 保留
    a >= 224 // 224.0.0.0/4 组播与 240.0.0.0/4 保留段
  );
}

/** IPv6 特殊地址判断（回环、未指定、ULA、链路本地、IPv4 映射地址） */
function isBlockedIPv6(raw: string): boolean {
  const ip = raw.toLowerCase().replace(/^\[|\]$/g, '');
  if (ip === '::1' || ip === '::') {
    return true;
  }
  const firstGroup = ip.split(':')[0] ?? '';
  // fe80::/10 链路本地（fe80~febf 前缀）
  if (/^fe[89ab]/.test(firstGroup)) {
    return true;
  }
  // fc00::/7 唯一本地地址（ULA）
  if (/^f[cd]/.test(firstGroup)) {
    return true;
  }
  // ::ffff:a.b.c.d IPv4 映射地址（点分写法）：按内嵌 IPv4 复查
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (dotted) {
    return isBlockedIPv4(dotted[1]);
  }
  // ::ffff:7f00:1 IPv4 映射地址（URL 规范化后的十六进制写法）：两段 16 位还原为点分 IPv4
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
  if (hex) {
    const high = Number.parseInt(hex[1], 16);
    const low = Number.parseInt(hex[2], 16);
    return isBlockedIPv4(`${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`);
  }
  return false;
}

function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    return isBlockedIPv4(ip);
  }
  if (version === 6) {
    return isBlockedIPv6(ip);
  }
  // 非 IP 字面量：视为非法（由调用方先解析域名再复查）
  return true;
}

/**
 * 校验二维码 URL 为公网 http(s) 地址，返回解析后的 URL 对象。
 * 相比字符串黑名单匹配，这里对域名做 DNS 解析后逐一复查私网段，
 * 可拦截 0x7f000001 / 2130706433 等非常规 IPv4 写法、域名解析到内网、
 * 以及 ::ffff:127.0.0.1 等 IPv4 映射绕过。二维码 URL 来自用户投稿，
 * 服务端代理转发前必须校验。
 */
async function assertPublicHttpUrl(raw: string): Promise<URL> {
  const parsed = new URL(raw);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('仅支持 http(s) 协议');
  }
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // 字面量 IP：直接按私网段判断
  if (isIP(host) !== 0) {
    if (isBlockedIp(host)) {
      throw new Error(`IP ${host} 位于内网/保留段`);
    }
    return parsed;
  }

  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new Error(`域名 ${host} 指向本机/内部域`);
  }

  // 域名：解析全部地址逐一复查，任一命中内网段即拒绝
  const resolved = await lookup(host, { all: true });
  if (resolved.length === 0 || resolved.some(({ address }) => isBlockedIp(address))) {
    throw new Error(`域名 ${host} 解析到内网/保留地址`);
  }
  return parsed;
}

interface ResolvedImage {
  buffer: Buffer;
  contentType: string;
}

/**
 * 拉取公网图片：redirect: 'manual' 手动跟随重定向，每一跳都重新走
 * assertPublicHttpUrl 校验，防止源站先展示公网地址、审核通过后 302
 * 指向内网（云元数据、内部服务）的 SSRF 绕过。
 */
async function fetchPublicImage(target: URL): Promise<Response> {
  let current = target;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    const response = await fetch(current, { redirect: 'manual' });
    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      // 相对地址按当前 URL 解析，再复检协议/主机
      current = await assertPublicHttpUrl(new URL(location, current).toString());
      continue;
    }
    return response;
  }
  throw new Error('重定向次数过多');
}

async function resolveQrImage(qrcodeUrl: string): Promise<ResolvedImage | null> {
  // 本地存储模式：/uploads/... 直接读盘
  if (qrcodeUrl.startsWith('/uploads/')) {
    const target = resolve(uploadsRoot, qrcodeUrl.replace('/uploads/', ''));
    if (!target.startsWith(uploadsRoot + (process.platform === 'win32' ? '\\' : '/'))) return null;
    const ext = target.split('.').pop()?.toLowerCase();
    const contentType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
    return { buffer: await readFile(target), contentType };
  }
  // COS / OSS 模式：服务端拉取后以附件形式回传，避免移动端浏览器直接打开预览
  let response: Response;
  try {
    const target = await assertPublicHttpUrl(qrcodeUrl);
    response = await fetchPublicImage(target);
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type')?.split(';')[0] ?? 'image/png';
  return { buffer: Buffer.from(arrayBuffer), contentType: contentType.startsWith('image/') ? contentType : 'image/png' };
}

export function qrcodeRoutes(app: FastifyInstance) {
  // 二维码保存：统一走后端代理，带 Content-Disposition 触发下载
  app.get('/api/groups/:id/qrcode', async (request, reply) => {
    const { id } = request.params as { id: string };
    const group = await prisma.group.findFirst({ where: { id, published: true }, select: { name: true, qrcodeUrl: true } });
    if (!group?.qrcodeUrl) {
      return reply.code(404).send({ error: '二维码不存在或未开放' });
    }

    let image: ResolvedImage | null;
    try {
      image = await resolveQrImage(group.qrcodeUrl);
    } catch {
      image = null;
    }
    if (!image) {
      return reply.code(404).send({ error: '二维码暂不可下载，请直接长按图片保存' });
    }

    const asciiName = `qrcode-${id}.png`;
    const utf8Name = encodeURIComponent(`${group.name}-入群二维码.png`);
    reply
      .header('Content-Type', image.contentType)
      .header('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`)
      .header('Cache-Control', 'no-store');
    return reply.send(image.buffer);
  });
}
