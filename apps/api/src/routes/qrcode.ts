import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../prisma';

const uploadsRoot = resolve(fileURLToPath(new URL('../../public', import.meta.url)), 'uploads');

// 仅允许公网 http(s) 图片源：二维码 URL 来自用户投稿（经审核落库），代理转发前做基础 SSRF 防护
function isPublicHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return false;
    if (host === '0.0.0.0' || host === '[::1]' || host === '::1') return false;
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
    return true;
  } catch {
    return false;
  }
}

interface ResolvedImage {
  buffer: Buffer;
  contentType: string;
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
  if (!isPublicHttpUrl(qrcodeUrl)) return null;
  const response = await fetch(qrcodeUrl);
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
