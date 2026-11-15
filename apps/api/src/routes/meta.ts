import type { FastifyInstance } from 'fastify';
import { REGIONS, type MetaResponse, type NavModule } from '@spaceport/shared';
import { toTag } from '../lib/serialize';
import { prisma } from '../prisma';
import { getStoredRegistrationSettings } from '../services/registration-settings';

const MODULES: NavModule[] = [
  { key: 'groups', label: 'Q群导航', path: '/groups', icon: 'users', enabled: true },
  { key: 'sites', label: '网站导航', path: '/sites', icon: 'compass', enabled: true },
  { key: 'gallery', label: '画廊', path: '/gallery', icon: 'image', enabled: true },
  { key: 'music', label: '音乐厅', path: '/music', icon: 'music', enabled: false },
];

export function metaRoutes(app: FastifyInstance) {
  // pendingSubmissions（待审核数）是运营敏感数据，仅 ADMIN/MODERATOR 可见，其他身份一律返回 0
  app.get('/api/meta', { preHandler: [app.optionalAuthenticate] }, async (request) => {
    const canSeePending = request.user?.role === 'ADMIN' || request.user?.role === 'MODERATOR';

    const [cityCounts, cities, groupTags, siteTags, groups, sites, galleryImages, pendingSubmissions, registrationSettings] =
      await Promise.all([
      prisma.cityRegionRule.groupBy({ by: ['regionCode'], _count: { _all: true } }),
      prisma.cityRegionRule.findMany({
        orderBy: [{ regionCode: 'asc' }, { sortOrder: 'asc' }, { city: 'asc' }],
      }),
      prisma.tag.findMany({
        where: { scope: { in: ['GROUP', 'BOTH'] } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.tag.findMany({
        where: { scope: { in: ['SITE', 'BOTH'] } },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.group.count({ where: { published: true } }),
      prisma.site.count({ where: { published: true } }),
      prisma.galleryImage.count({ where: { published: true } }),
      canSeePending
        ? prisma.submission.count({ where: { status: 'PENDING' } })
        : Promise.resolve(0),
      getStoredRegistrationSettings(),
    ]);

    const cityCountMap = new Map(cityCounts.map((item) => [item.regionCode, item._count._all]));

    const response: MetaResponse = {
      regions: REGIONS.map((region) => ({
        code: region.code,
        name: region.name,
        cityCount: cityCountMap.get(region.code) ?? 0,
      })),
      cities: cities.map((rule) => ({
        city: rule.city,
        regionCode: rule.regionCode,
        regionName: rule.regionName,
        province: rule.province,
      })),
      tags: {
        group: groupTags.map(toTag),
        sites: siteTags.map(toTag),
      },
      stats: {
        groups,
        sites,
        galleryImages,
        pendingSubmissions,
      },
      modules: MODULES,
      registration: { emailCodeRequired: registrationSettings.emailCodeRequired },
    };

    return response;
  });
}
