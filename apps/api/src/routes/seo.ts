import type { FastifyInstance } from 'fastify';
import { env } from '../env';
import { prisma } from '../prisma';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface SitemapEntry {
  loc: string;
  lastmod?: Date | null;
  priority: string;
  changefreq: string;
}

function buildXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const lastmod = entry.lastmod
        ? `<lastmod>${entry.lastmod.toISOString().slice(0, 10)}</lastmod>`
        : '';
      return [
        '  <url>',
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        lastmod,
        `    <changefreq>${entry.changefreq}</changefreq>`,
        `    <priority>${entry.priority}</priority>`,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

/**
 * 站点地图：动态读取数据库生成，收录「存在独立详情页」的内容。
 * 部署提醒：Fastify 通常仅代理 /api/* 前缀，Nginx 需为本路由加一条
 *   location = /sitemap.xml { proxy_pass http://127.0.0.1:<API_PORT>; }
 * robots.txt 中声明的地址需与实际可访问地址一致（PUBLIC_BASE_URL）。
 */
export function seoRoutes(app: FastifyInstance) {
  app.get('/sitemap.xml', async (_request, reply) => {
    const [groups, sites, activities] = await Promise.all([
      prisma.group.findMany({ where: { published: true }, select: { id: true, updatedAt: true } }),
      prisma.site.findMany({ where: { published: true }, select: { id: true, updatedAt: true } }),
      prisma.activity.findMany({ where: { published: true }, select: { id: true, updatedAt: true } }),
    ]);

    const base = env.publicBaseUrl;
    const entries: SitemapEntry[] = [
      { loc: `${base}/`, priority: '1.0', changefreq: 'daily' },
      { loc: `${base}/groups`, priority: '0.9', changefreq: 'daily' },
      { loc: `${base}/sites`, priority: '0.9', changefreq: 'weekly' },
      { loc: `${base}/activities`, priority: '0.7', changefreq: 'weekly' },
      { loc: `${base}/gallery`, priority: '0.7', changefreq: 'weekly' },
      ...groups.map((item) => ({
        loc: `${base}/groups/${item.id}`,
        lastmod: item.updatedAt,
        priority: '0.8',
        changefreq: 'weekly',
      })),
      ...sites.map((item) => ({
        loc: `${base}/sites/${item.id}`,
        lastmod: item.updatedAt,
        priority: '0.8',
        changefreq: 'weekly',
      })),
      ...activities.map((item) => ({
        loc: `${base}/activities/${item.id}`,
        lastmod: item.updatedAt,
        priority: '0.7',
        changefreq: 'weekly',
      })),
      { loc: `${base}/about`, priority: '0.5', changefreq: 'monthly' },
      { loc: `${base}/privacy`, priority: '0.3', changefreq: 'monthly' },
    ];

    reply.header('Content-Type', 'application/xml; charset=utf-8');
    reply.header('Cache-Control', 'public, max-age=0, s-maxage=3600');
    return reply.send(buildXml(entries));
  });
}
