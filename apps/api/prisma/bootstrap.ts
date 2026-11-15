import 'dotenv/config';
import { createPrismaClient } from '../src/prisma';
import { AUTO_TAG_RULES, CITY_GROUPS, REGION_NAME, TAGS } from './base-data';

// 生产首次安装初始化：只写入站点运行必需的基础数据（标签体系、城市大区映射、自动打标规则）。
// 不创建任何用户、不含演示内容 —— 管理员账号请通过网页注册后用 admin:promote 提权。
// 与 seed.ts（开发环境演示数据）分离；幂等，可重复执行。
const prisma = createPrismaClient();

async function bootstrapTags() {
  for (const tag of TAGS) {
    await prisma.tag.upsert({
      where: { id: tag.id },
      update: {
        name: tag.name,
        slug: tag.slug,
        scope: tag.scope,
        color: tag.color,
        kind: tag.kind,
        sortOrder: tag.sortOrder,
      },
      create: { ...tag },
    });
  }
  console.log(`标签已就绪：${TAGS.length} 条`);
}

async function bootstrapCities() {
  let order = 0;
  for (const group of CITY_GROUPS) {
    for (const [city, province] of group.rows) {
      const regionCode = group.code;
      const regionName = REGION_NAME[regionCode];
      await prisma.cityRegionRule.upsert({
        where: { city },
        update: { regionCode, regionName, province, sortOrder: order },
        create: { city, regionCode, regionName, province, sortOrder: order },
      });
      order += 1;
    }
  }
  console.log(`城市大区映射已就绪：${order} 条`);
}

async function bootstrapAutoTagRules() {
  for (const rule of AUTO_TAG_RULES) {
    await prisma.autoTagRule.upsert({
      where: { id: rule.id },
      update: { keyword: rule.keyword, tagId: rule.tagId, scope: 'GROUP', priority: rule.priority },
      create: {
        id: rule.id,
        keyword: rule.keyword,
        tagId: rule.tagId,
        scope: 'GROUP',
        priority: rule.priority,
      },
    });
  }
  console.log(`自动打标规则已就绪：${AUTO_TAG_RULES.length} 条`);
}

async function main() {
  await bootstrapTags();
  await bootstrapCities();
  await bootstrapAutoTagRules();

  const [tags, cities, rules] = await Promise.all([
    prisma.tag.count(),
    prisma.cityRegionRule.count(),
    prisma.autoTagRule.count(),
  ]);

  console.log('基础数据初始化完成:', { tags, cities, rules });
  console.log('下一步：在网页注册你的账号，然后执行 npm run admin:promote -- <你的邮箱> 提升为管理员');
}

main()
  .catch((error) => {
    console.error('基础数据初始化失败:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
