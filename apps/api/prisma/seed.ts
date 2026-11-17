import 'dotenv/config';
import { createPrismaClient } from '../src/prisma';
// 基础数据（标签/城市/自动打标规则）统一定义在 base-data.ts，与 bootstrap.ts 共用
import { AUTO_TAG_RULES, CITY_GROUPS, REGION_NAME, TAGS } from './base-data';

// 生产环境禁止执行种子脚本：种子数据含公开的演示账号与弱密码，落库即接管
// （生产首次安装请改用 db:bootstrap —— 只写入标签/城市等基础数据，不含任何账号）
if (process.env.NODE_ENV === 'production') {
  console.error('[seed] NODE_ENV=production：禁止在生产环境执行种子脚本（含公开演示账号）');
  process.exit(1);
}
import bcrypt from 'bcryptjs';

const prisma = createPrismaClient();

interface UserSeed {
  id: string;
  uid: number;
  email: string;
  nickname: string;
  password: string;
  role: string;
  bio?: string;
  province?: string;
  city?: string;
}

const USERS: UserSeed[] = [
  {
    id: 'seed-admin',
    uid: 100001,
    email: 'admin@spaceport.dev',
    nickname: '运营团队',
    password: 'Admin123!',
    role: 'ADMIN',
    bio: 'ChiliChill 粉丝导航站维护者，负责收录与审核各类资源。',
  },
  {
    id: 'seed-demo',
    uid: 100002,
    email: 'demo@spaceport.dev',
    nickname: '星际旅客',
    password: 'Demo1234!',
    role: 'USER',
    bio: 'ChiliChill 五年老粉，热衷线下应援与二创交流。',
    province: '广东',
    city: '广州',
  },
];

interface GroupSeed {
  id: string;
  name: string;
  groupNumber: string;
  type: string;
  city: string | null;
  province: string | null;
  school: string | null;
  regionCode: string | null;
  regionName: string | null;
  description: string;
  purpose: string | null;
  joinUrl: string | null;
  uploaderId?: string;
  tagIds: string[];
}

const GROUPS: GroupSeed[] = [
  {
    id: 'seed-group-guangzhou',
    name: 'ChiliChill 广州小分队',
    uploaderId: 'seed-demo',
    groupNumber: '100010001',
    type: 'REGION',
    city: '广州',
    province: '广东',
    school: null,
    regionCode: 'SOUTH',
    regionName: '华南',
    description: '广州及周边线下应援与聚会',
    purpose: null,
    joinUrl: 'https://qm.qq.com/q/guangzhou',
    tagIds: ['tag-yingyuan', 'tag-huodong'],
  },
  {
    id: 'seed-group-shanghai',
    name: '上海 Chill 听歌会',
    groupNumber: '200020002',
    type: 'REGION',
    city: '上海',
    province: '上海',
    school: null,
    regionCode: 'EAST',
    regionName: '华东',
    description: '上海同好线上听歌、线下聚会的交流群',
    purpose: null,
    joinUrl: 'https://qm.qq.com/q/shanghai',
    tagIds: ['tag-xianliao'],
  },
  {
    id: 'seed-group-beijing',
    name: '北京厚嘴唇同好会',
    groupNumber: '300030003',
    type: 'REGION',
    city: '北京',
    province: '北京',
    school: null,
    regionCode: 'NORTH',
    regionName: '华北',
    description: '北京地区同好活动组织与日常交流',
    purpose: null,
    joinUrl: 'https://qm.qq.com/q/beijing',
    tagIds: ['tag-huodong'],
  },
  {
    id: 'seed-group-online-yingyuan',
    name: 'ChiliChill 线上应援企划组',
    groupNumber: '400040004',
    type: 'GENERAL',
    city: null,
    province: null,
    school: null,
    regionCode: 'OTHER',
    regionName: '待定',
    description: '专注线上应援物料、打投与企划协作',
    purpose: null,
    joinUrl: 'https://qm.qq.com/q/online-yingyuan',
    tagIds: ['tag-yingyuan', 'tag-huodong'],
  },
  {
    id: 'seed-group-online-erchuang',
    name: '二创交流 · 星轨绘室',
    groupNumber: '500050005',
    type: 'GENERAL',
    city: null,
    province: null,
    school: null,
    regionCode: 'OTHER',
    regionName: '待定',
    description: '绘画、剪辑、翻唱等二创作品交流',
    purpose: null,
    joinUrl: 'https://qm.qq.com/q/erchuang',
    tagIds: ['tag-erchuang'],
  },
  {
    id: 'seed-group-online-ziyuan',
    name: '资源补给站',
    groupNumber: '600060006',
    type: 'GENERAL',
    city: null,
    province: null,
    school: null,
    regionCode: 'OTHER',
    regionName: '待定',
    description: '音源、图包与现场资源集中分享',
    purpose: null,
    joinUrl: 'https://qm.qq.com/q/ziyuan',
    tagIds: ['tag-ziyuan'],
  },
  {
    id: 'seed-group-college-wuhan',
    name: '珞珈山 Chill 同好会',
    groupNumber: '850085008',
    type: 'COLLEGE',
    city: '武汉',
    province: '湖北',
    school: '武汉大学',
    regionCode: 'CENTRAL',
    regionName: '华中',
    description: '武汉大学及周边高校的同好日常交流与拼场观演',
    purpose: null,
    joinUrl: 'https://qm.qq.com/q/college-wuhan',
    tagIds: ['tag-xianliao', 'tag-huodong'],
  },
  {
    id: 'seed-group-college-nanjing',
    name: '金陵厚嘴唇校园群',
    groupNumber: '860086008',
    type: 'COLLEGE',
    city: '南京',
    province: '江苏',
    school: '南京大学',
    regionCode: 'EAST',
    regionName: '华东',
    description: '南京高校同好自习伴听、演出拼车与周边交换',
    purpose: null,
    joinUrl: 'https://qm.qq.com/q/college-nanjing',
    tagIds: ['tag-ziyuan', 'tag-xianliao'],
  },
  {
    id: 'seed-group-radio',
    name: '深夜电台听友群',
    groupNumber: '700070007',
    type: 'OTHER',
    city: null,
    province: null,
    school: null,
    regionCode: 'OTHER',
    regionName: '待定',
    description: '深夜电台节目听友交流与点歌',
    purpose: '深夜电台节目听友交流',
    joinUrl: 'https://qm.qq.com/q/radio',
    tagIds: ['tag-shenye'],
  },
];

interface FanGroupSeed {
  name: string;
  groupNumber: string;
  type: 'GENERAL' | 'REGION' | 'COLLEGE' | 'OTHER';
  province?: string;
  city?: string;
  school?: string;
  description: string;
  purpose?: string;
  tags: string[];
}

// 群号 → 大区映射（复用城市规则表中的省份归属）
const PROVINCE_REGION_MAP: Record<string, { code: string; name: string }> = {};
for (const group of CITY_GROUPS) {
  for (const [, province] of group.rows) {
    if (!PROVINCE_REGION_MAP[province]) {
      PROVINCE_REGION_MAP[province] = { code: group.code, name: REGION_NAME[group.code] };
    }
  }
}

// 来自《网站内容整理.md》的真实粉丝群清单（无群号条目跳过）
const FAN_GROUP_ROWS: FanGroupSeed[] = [
  // —— 综合粉丝群 ——
  { name: 'ChiliChill厚嘴唇星块', groupNumber: '907889343', type: 'GENERAL', description: '纺织厂一群，同好日常聚集地', tags: ['tag-xianliao'] },
  { name: 'ChiliChill厚嘴唇星块儿', groupNumber: '377011235', type: 'GENERAL', description: '纺织厂二群，同好日常聚集地', tags: ['tag-xianliao'] },
  { name: 'chilichill的烧酒屋', groupNumber: '253923684', type: 'GENERAL', description: '烧酒屋，一起期待新专', tags: ['tag-xianliao'] },
  { name: 'ChiliChill活动信息通知群1', groupNumber: '1093066129', type: 'GENERAL', description: '禁言通知群，只播报官方活动信息', tags: ['tag-huodong'] },
  { name: 'ChiliChill活动信息通知群2', groupNumber: '1090689756', type: 'GENERAL', description: '禁言通知群，只播报官方活动信息', tags: ['tag-huodong'] },
  { name: 'ChiliChill活动信息通知群3', groupNumber: '1092709017', type: 'GENERAL', description: '禁言通知群，只播报官方活动信息', tags: ['tag-huodong'] },
  // —— 院校粉丝群 ——
  { name: 'Chilichill北航分部', groupNumber: '1007570278', type: 'COLLEGE', province: '北京', city: '北京', school: '北京航空航天大学', description: '北京航空航天大学同好交流群', tags: ['tag-xianliao'] },
  { name: '小谷围也要听chilichill', groupNumber: '1074198545', type: 'COLLEGE', province: '广东', city: '广州', school: '广州大学城', description: '广州大学城高校同好交流群', tags: ['tag-xianliao'] },
  { name: '瓜兵勇闯七里桥', groupNumber: '796175015', type: 'COLLEGE', province: '陕西', city: '西安', school: '西北工业大学', description: '西北工业大学同好交流群', tags: ['tag-xianliao'] },
  { name: 'chilichill-北理小分队', groupNumber: '748543973', type: 'COLLEGE', province: '北京', city: '北京', school: '北京理工大学', description: '北京理工大学同好交流群', tags: ['tag-xianliao'] },
  // —— 其他类型（企划 / 兴趣 / 摊位 / 物料） ——
  { name: '2025CFT命题工作组', groupNumber: '849057985', type: 'OTHER', description: '2025 CFT 命题企划工作组，现养老中', tags: ['tag-huodong'] },
  { name: 'ChiliChill混入人类计划之广州线下观影会！', groupNumber: '1031317632', type: 'OTHER', description: '广州线下观影会企划', tags: ['tag-huodong'] },
  { name: '《方街漫游指南》成长录', groupNumber: '1023016742', type: 'OTHER', description: '广州观影会「方街漫游指南」企划记录', tags: ['tag-huodong'] },
  { name: 'ChiliChill二创创作者交流群', groupNumber: '590237401', type: 'OTHER', description: '绘画、剪辑、写作等二创创作者交流', tags: ['tag-erchuang'] },
  { name: 'CineChill厚嘴唇照相馆', groupNumber: '106131067', type: 'OTHER', description: '摄影交流群', tags: ['tag-erchuang'] },
  { name: '厚嘴唇KTV大厅', groupNumber: '757835391', type: 'OTHER', description: '演唱交流群', tags: ['tag-xianliao'] },
  { name: '厚嘴唇世界', groupNumber: '1095227929', type: 'OTHER', description: 'Minecraft 辣椒放松粉丝专服', tags: ['tag-xianliao'] },
  { name: '「饿魔食店」25bw摊位群', groupNumber: '758496398', type: 'OTHER', description: '2025 Bilibili World 摊位筹备群', tags: ['tag-huodong'] },
  { name: 'CP32 西湖烧酒 喜欢您来~', groupNumber: '742787931', type: 'OTHER', description: 'CP32（Comicup 32）摊位群', tags: ['tag-huodong'] },
  { name: 'CC物料大乱炖之画饼版（全新复活', groupNumber: '831525101', type: 'OTHER', description: '物料分享大乱炖，筹划中', tags: ['tag-ziyuan'] },
  { name: 'ChiliChill玩偶意愿组', groupNumber: '1002875797', type: 'OTHER', description: '二开玩偶意愿收集，已截团', tags: ['tag-ziyuan'] },
  { name: 'CC同人周边', groupNumber: '1073465225', type: 'OTHER', description: '三巡同人周边，少量余量在售', tags: ['tag-ziyuan'] },
  { name: 'chilichill三巡应援棒棒团（已截团版）', groupNumber: '812798686', type: 'OTHER', description: '三巡应援棒团购，已截团', tags: ['tag-yingyuan'] },
  { name: 'ChiliChill_青新宁蒙甘~', groupNumber: '543707131', type: 'OTHER', description: '青海、新疆、宁夏、内蒙古、甘肃跨省联动同好群', purpose: '覆盖西北多省的联动应援与拼场组织', tags: ['tag-xianliao'] },
  // —— 地区粉丝群（东北） ——
  { name: 'ChiliChill盛京鸡架城', groupNumber: '303448700', type: 'REGION', province: '辽宁', city: '沈阳', description: '沈阳同好聚集地', tags: [] },
  { name: '七里桥大连湾码头', groupNumber: '1029541239', type: 'REGION', province: '辽宁', city: '大连', description: '大连同好聚集地', tags: [] },
  { name: 'ChiliChill长春(CCcc)', groupNumber: '791481860', type: 'REGION', province: '吉林', city: '长春', description: '长春同好聚集地', tags: [] },
  { name: 'ChiliChill在哈尔滨有奖征集群名', groupNumber: '605882445', type: 'REGION', province: '黑龙江', city: '哈尔滨', description: '哈尔滨同好聚集地', tags: [] },
  // —— 地区粉丝群（华北） ——
  { name: 'ChiliChill厚嘴唇烤鸭店', groupNumber: '717259692', type: 'REGION', province: '北京', city: '北京', description: '北京同好聚集地', tags: [] },
  { name: '七里桥煎饼果子铺', groupNumber: '750443383', type: 'REGION', province: '天津', city: '天津', description: '天津同好聚集地', tags: [] },
  { name: 'ChiliChill摇滚庄丨备战2026', groupNumber: '954330681', type: 'REGION', province: '河北', city: '石家庄', description: '石家庄同好聚集地，备战 2026 巡演', tags: [] },
  { name: '七里桥秦皇岛|虾米音乐节', groupNumber: '954019804', type: 'REGION', province: '河北', city: '秦皇岛', description: '秦皇岛同好聚集地，虾米音乐节专场', tags: ['tag-huodong'] },
  // —— 地区粉丝群（华东） ——
  { name: '2026 chilichill上海巡演', groupNumber: '810977792', type: 'REGION', province: '上海', city: '上海', description: '2026 上海巡演专场群', tags: ['tag-huodong'] },
  { name: 'ChiliChill2026上海剧院', groupNumber: '971710104', type: 'REGION', province: '上海', city: '上海', description: '2026 上海剧院演出专场群', tags: ['tag-huodong'] },
  { name: 'ChiliChill 上海—长三角', groupNumber: '1023256301', type: 'REGION', province: '上海', city: '上海', description: '上海及长三角同好大群', tags: [] },
  { name: '七里桥上海|26REDLAND', groupNumber: '1092954399', type: 'REGION', province: '上海', city: '上海', description: '2026 RED LAND 上海专场群', tags: ['tag-huodong'] },
  { name: '西湖烧酒', groupNumber: '597569927', type: 'REGION', province: '浙江', city: '杭州', description: '杭州同好聚集地（一群）', tags: [] },
  { name: '西湖烧酒Ⅱ', groupNumber: '1065706578', type: 'REGION', province: '浙江', city: '杭州', description: '杭州同好聚集地（二群）', tags: [] },
  { name: '厚嘴唇语言加密基地(温州)', groupNumber: '1025892937', type: 'REGION', province: '浙江', city: '温州', description: '温州同好聚集地', tags: [] },
  { name: '夏踞于盘铲头城', groupNumber: '762393150', type: 'REGION', province: '江苏', city: '南京', description: '南京同好聚集地', tags: [] },
  { name: 'ChiliChill合肥备战2027之群友快去开livehouse', groupNumber: '962204282', type: 'REGION', province: '安徽', city: '合肥', description: '合肥同好聚集地', tags: [] },
  { name: 'ChiliChill泉城卡洛🌈爱鲁tv', groupNumber: '831094434', type: 'REGION', province: '山东', city: '济南', description: '济南同好聚集地', tags: [] },
  { name: 'ChiliChill啤酒喝醉', groupNumber: '928522566', type: 'REGION', province: '山东', city: '青岛', description: '青岛同好聚集地', tags: [] },
  { name: 'ChiliChill八闽茶馆', groupNumber: '597470499', type: 'REGION', province: '福建', city: '厦门', description: '厦门同好聚集地', tags: [] },
  { name: 'ChiliChill驻闽办事处', groupNumber: '346955329', type: 'REGION', province: '福建', city: '福州', description: '福州同好聚集地', tags: [] },
  { name: '南昌和潜水钟哪个沉得更深？', groupNumber: '756454778', type: 'REGION', province: '江西', city: '南昌', description: '南昌同好聚集地', tags: [] },
  // —— 地区粉丝群（华中） ——
  { name: '2026 WH 吃梨吃藕！！！', groupNumber: '583622184', type: 'REGION', province: '湖北', city: '武汉', description: '武汉同好聚集地', tags: [] },
  { name: '长沙烧酒', groupNumber: '871509539', type: 'REGION', province: '湖南', city: '长沙', description: '长沙同好聚集地', tags: [] },
  { name: 'ChiliChill河南分队(郑州巡演寄了版', groupNumber: '858979337', type: 'REGION', province: '河南', city: '郑州', description: '郑州同好聚集地，巡演专场', tags: ['tag-huodong'] },
  // —— 地区粉丝群（华南） ——
  { name: 'Chilichill秋穗出游之我们来到3.21！', groupNumber: '833104849', type: 'REGION', province: '广东', city: '广州', description: '广州 2026.3.21 巡演专场群', tags: ['tag-huodong'] },
  { name: '七里桥广州·26超级草莓音乐节', groupNumber: '1109646726', type: 'REGION', province: '广东', city: '广州', description: '2026 超级草莓音乐节广州专场群', tags: ['tag-huodong'] },
  { name: 'ChiliChill深圳交流群', groupNumber: '632170659', type: 'REGION', province: '广东', city: '深圳', description: '深圳同好聚集地', tags: [] },
  { name: '七里桥年末专场之佛佛佛佛山!', groupNumber: '827038186', type: 'REGION', province: '广东', city: '佛山', description: '佛山年末专场群', tags: ['tag-huodong'] },
  { name: 'ChiliChill的广C酸嘢铺子🌶️', groupNumber: '554399898', type: 'REGION', province: '广西', city: '南宁', description: '南宁同好聚集地', tags: [] },
  { name: '灯笼Chili清补Chill', groupNumber: '1075487753', type: 'REGION', province: '海南', city: '海口', description: '海口同好聚集地', tags: [] },
  // —— 地区粉丝群（西南） ——
  { name: 'ChiliChill山城避暑地', groupNumber: '128992831', type: 'REGION', province: '重庆', city: '重庆', description: '重庆同好聚集地', tags: [] },
  { name: 'ChiliChill不安灵魂收容所', groupNumber: '238820778', type: 'REGION', province: '四川', city: '成都', description: '成都同好聚集地', tags: [] },
  { name: '重生之厚嘴唇星人降临地球今年暂时还没在贵阳(复活赛大失败', groupNumber: '740125879', type: 'REGION', province: '贵州', city: '贵阳', description: '贵阳同好聚集地', tags: [] },
  // —— 地区粉丝群（西北） ——
  { name: 'ChiliChill辣子冰峰', groupNumber: '720668060', type: 'REGION', province: '陕西', city: '西安', description: '西安同好聚集地', tags: [] },
  { name: 'chilichill乌鲁木齐站', groupNumber: '1002318703', type: 'REGION', province: '新疆', city: '乌鲁木齐', description: '乌鲁木齐同好聚集地', tags: [] },
];

function fanGroupToSeed(row: FanGroupSeed): GroupSeed {
  const region = row.province ? PROVINCE_REGION_MAP[row.province] : undefined;
  return {
    id: `fan-group-${row.groupNumber}`,
    name: row.name,
    groupNumber: row.groupNumber,
    type: row.type,
    city: row.city ?? null,
    province: row.province ?? null,
    school: row.school ?? null,
    regionCode: region ? region.code : 'OTHER',
    regionName: region ? region.name : '待定',
    description: row.description,
    purpose: row.purpose ?? null,
    joinUrl: null,
    tagIds: row.tags,
  };
}

const FAN_GROUPS: GroupSeed[] = FAN_GROUP_ROWS.map(fanGroupToSeed);

interface SiteSeed {
  id: string;
  title: string;
  url: string;
  description: string;
  tagIds: string[];
}

const SITES: SiteSeed[] = [
  {
    id: 'seed-site-rhythm',
    title: '星轨节奏小游戏',
    url: 'https://chilichill.example.com/game/rhythm',
    description: '跟着 ChiliChill 的旋律踩点的节奏小游戏',
    tagIds: ['site-xiaoyouxi'],
  },
  {
    id: 'seed-site-lyrics',
    title: '专辑歌词拼图',
    url: 'https://chilichill.example.com/game/lyrics-puzzle',
    description: '把打乱的专辑歌词拼回原样的小游戏',
    tagIds: ['site-xiaoyouxi'],
  },
  {
    id: 'seed-site-toolkit',
    title: '巡演应援物料工具箱',
    url: 'https://chilichill.example.com/tools/fan-kit',
    description: '巡演应援海报、手幅与物料模板合集',
    tagIds: ['site-gongju'],
  },
  {
    id: 'seed-site-quiz',
    title: '你是哪种 Chill 人格测试',
    url: 'https://chilichill.example.com/quiz/persona',
    description: '十道题测出你的 ChiliChill 听歌人格',
    tagIds: ['site-quwei'],
  },
  {
    id: 'seed-site-gallery',
    title: '二创画廊导航',
    url: 'https://chilichill.example.com/gallery',
    description: '收录同人绘画、剪辑与翻唱的二创画廊导航',
    tagIds: ['site-erchuang'],
  },
];

async function seedUsers() {
  for (const user of USERS) {
    const passwordHash = bcrypt.hashSync(user.password, 10);
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        passwordHash,
        uid: user.uid,
        ...(user.bio !== undefined ? { bio: user.bio } : {}),
        ...(user.province !== undefined ? { province: user.province } : {}),
        ...(user.city !== undefined ? { city: user.city } : {}),
      },
      create: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        nickname: user.nickname,
        role: user.role,
        passwordHash,
        bio: user.bio ?? null,
        province: user.province ?? null,
        city: user.city ?? null,
      },
    });
  }
  console.log(`用户已就绪：${USERS.length} 条`);
}

async function seedCities() {
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

async function seedTags() {
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

async function seedAutoTagRules() {
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

async function seedGroups() {
  const allGroups = [...GROUPS, ...FAN_GROUPS];
  for (const group of allGroups) {
    const tagLinks = group.tagIds.map((tagId) => ({ tag: { connect: { id: tagId } } }));
    const fields = {
      name: group.name,
      groupNumber: group.groupNumber,
      type: group.type,
      city: group.city,
      province: group.province,
      school: group.school,
      regionCode: group.regionCode,
      regionName: group.regionName,
      description: group.description,
      purpose: group.purpose,
      joinUrl: group.joinUrl,
      uploaderId: group.uploaderId ?? 'seed-admin',
      published: true,
    };

    await prisma.group.upsert({
      where: { id: group.id },
      update: { ...fields, tags: { deleteMany: {}, create: tagLinks } },
      create: { id: group.id, ...fields, tags: { create: tagLinks } },
    });
  }
  console.log(`示例群已就绪：${GROUPS.length} 条 + 粉丝群导入 ${FAN_GROUPS.length} 条 = ${GROUPS.length + FAN_GROUPS.length} 条`);
}

async function seedSites() {
  for (const site of SITES) {
    const tagLinks = site.tagIds.map((tagId) => ({ tag: { connect: { id: tagId } } }));
    const fields = {
      title: site.title,
      url: site.url,
      description: site.description,
      coverUrl: null,
      uploaderId: 'seed-admin',
      published: true,
    };

    await prisma.site.upsert({
      where: { id: site.id },
      update: { ...fields, tags: { deleteMany: {}, create: tagLinks } },
      create: { id: site.id, ...fields, tags: { create: tagLinks } },
    });
  }
  console.log(`示例站点已就绪：${SITES.length} 条`);
}

interface ActivitySeed {
  id: string;
  title: string;
  coverUrl: string;
  description: string;
  startDate: string;
  endDate: string;
}

// 历届活动（日期为占位，站长可在后台调整）。封面为本地静态资源。
const ACTIVITIES: ActivitySeed[] = [
  {
    id: 'seed-activity-2026-tongzi',
    title: '2026夏铜子生日贺图',
    coverUrl: '/media/activities/2026-tongzi-birthday.jpg',
    description: '夏铜子 2026 生日贺图企划：同好共创贺图合集与置顶应援。',
    startDate: '2026-07-16T10:00:00+08:00',
    endDate: '2026-07-31T23:59:59+08:00',
  },
  {
    id: 'seed-activity-2025-tongzi',
    title: '2025夏铜子生日贺图',
    coverUrl: '/media/activities/2025-tongzi-birthday.jpg',
    description: '夏铜子 2025 生日贺图企划：粉丝共创贺图与线上展廊。',
    startDate: '2025-07-16T10:00:00+08:00',
    endDate: '2025-07-31T23:59:59+08:00',
  },
  {
    id: 'seed-activity-5th-anniversary',
    title: 'ChiliChill五周年生日会',
    coverUrl: '/media/activities/5th-anniversary.jpg',
    description: '五周年线上生日会：点歌、连麦与周年惊喜环节回顾。',
    startDate: '2024-10-14T19:00:00+08:00',
    endDate: '2024-10-14T21:30:00+08:00',
  },
  {
    id: 'seed-activity-2024-tongzi',
    title: '2024夏铜子生日会',
    coverUrl: '/media/activities/2024-tongzi-birthday.jpg',
    description: '夏铜子 2024 生日会：直播庆生、弹幕点歌与贺词墙回顾。',
    startDate: '2024-07-16T19:00:00+08:00',
    endDate: '2024-07-16T21:00:00+08:00',
  },
  {
    id: 'seed-activity-4th-anniversary',
    title: 'ChiliChill四周年生日会',
    coverUrl: '/media/activities/4th-anniversary.jpg',
    description: '四周年线上生日会：合唱、来信朗读与周年纪念周边回顾。',
    startDate: '2023-10-14T19:00:00+08:00',
    endDate: '2023-10-14T21:00:00+08:00',
  },
];

async function seedActivities() {
  for (const activity of ACTIVITIES) {
    const fields = {
      title: activity.title,
      coverUrl: activity.coverUrl,
      description: activity.description,
      linkUrl: null as string | null,
      contentHtml: null as string | null,
      startDate: new Date(activity.startDate),
      endDate: new Date(activity.endDate),
      published: true,
    };

    await prisma.activity.upsert({
      where: { id: activity.id },
      update: fields,
      create: { id: activity.id, ...fields },
    });
  }
  console.log(`历届活动已就绪：${ACTIVITIES.length} 条`);
}

interface GallerySeed {
  id: string;
  imageUrl: string;
  title: string;
  createdAt: string;
  demoLiked?: boolean;
}

// 画廊示例作品（图片为本地静态资源，站长可在后台上传替换）
const GALLERY_TITLES = [
  '舞台上的辣椒星光',
  '宇航员与小红椒',
  '黑胶火箭升空',
  '雨夜听歌的窗边',
  '列车上的巡演手记',
  '辣椒霓虹招牌',
  '纸艺空间站',
  '黄昏音乐节全景',
  '像素天台演出',
  '辣椒花束明信片',
];
const GALLERY_BASE_TIME = new Date('2026-11-14T20:00:00+08:00').getTime();
const GALLERY_DAY_MS = 24 * 60 * 60 * 1000;

// 生成 42 条示例投稿（前端单页展示 35 张，确保能看到分页效果），图片循环复用静态资源
const GALLERY_IMAGES: GallerySeed[] = Array.from({ length: 42 }, (_, index) => ({
  id: `seed-gallery-${String(index + 1).padStart(2, '0')}`,
  imageUrl: `/media/gallery/art-${String((index % GALLERY_TITLES.length) + 1).padStart(2, '0')}.jpg`,
  title: `${GALLERY_TITLES[index % GALLERY_TITLES.length]} #${index + 1}`,
  createdAt: new Date(GALLERY_BASE_TIME - index * GALLERY_DAY_MS).toISOString(),
  demoLiked: index % 4 === 0,
}));

async function seedGallery() {
  for (const item of GALLERY_IMAGES) {
    const fields = {
      imageUrl: item.imageUrl,
      title: item.title,
      uploaderId: 'seed-admin',
      published: true,
      createdAt: new Date(item.createdAt),
    };

    await prisma.galleryImage.upsert({
      where: { id: item.id },
      update: fields,
      create: { id: item.id, ...fields },
    });
  }

  // 示例点赞与评论（演示用户），便于页面效果展示
  const likedIds = GALLERY_IMAGES.filter((item) => item.demoLiked).map((item) => item.id);
  for (const imageId of likedIds) {
    await prisma.galleryLike.upsert({
      where: { imageId_userId: { imageId, userId: 'seed-demo' } },
      update: {},
      create: { imageId, userId: 'seed-demo' },
    });
  }

  const commentSeeds = [
    { id: 'seed-gallery-comment-1', imageId: 'seed-gallery-01', content: '这张的光影太绝了，直接设成壁纸！' },
    { id: 'seed-gallery-comment-2', imageId: 'seed-gallery-01', content: '舞台部分的配色好有氛围感。' },
    { id: 'seed-gallery-comment-3', imageId: 'seed-gallery-02', content: '小小的宇航员好可爱，抱走小红椒～' },
    { id: 'seed-gallery-comment-4', imageId: 'seed-gallery-03', content: '黑胶和火箭的组合太妙了。' },
  ];

  for (const comment of commentSeeds) {
    await prisma.galleryComment.upsert({
      where: { id: comment.id },
      update: { content: comment.content },
      create: {
        id: comment.id,
        imageId: comment.imageId,
        userId: 'seed-demo',
        content: comment.content,
      },
    });
  }

  console.log(`画廊作品已就绪：${GALLERY_IMAGES.length} 张`);
}

async function seedSubmissions() {
  const groupPayload = {
    name: 'ChiliChill 成都应援筹备群',
    groupNumber: '800080008',
    type: 'REGION',
    city: '成都',
    province: '四川',
    school: null,
    description: '成都同好们准备线下应援活动的筹备群',
    purpose: null,
    joinUrl: 'https://qm.qq.com/q/chengdu',
    qrcodeUrl: null,
    tags: ['tag-yingyuan', 'tag-huodong'],
  };

  const collegePayload = {
    name: '岳麓山下的听歌搭子',
    groupNumber: '870087008',
    type: 'COLLEGE',
    city: '长沙',
    province: '湖南',
    school: '湖南大学',
    description: '湖南大学同好期末周伴听与假期拼场观演',
    purpose: null,
    joinUrl: 'https://qm.qq.com/q/college-changsha',
    qrcodeUrl: null,
    tags: ['tag-xianliao'],
  };

  const sitePayload = {
    title: '星际轨迹时间轴',
    url: 'https://chilichill.example.com/timeline',
    description: '整理 ChiliChill 历年作品与演出时间线的站点',
    coverUrl: null,
    tags: ['site-ziyuan'],
  };

  await prisma.submission.upsert({
    where: { id: 'seed-sub-group-1' },
    update: {
      entityType: 'GROUP',
      mode: 'CREATE',
      targetId: null,
      payload: JSON.stringify(groupPayload),
      submitterId: 'seed-demo',
      groupTargetId: null,
      siteTargetId: null,
    },
    create: {
      id: 'seed-sub-group-1',
      entityType: 'GROUP',
      mode: 'CREATE',
      targetId: null,
      payload: JSON.stringify(groupPayload),
      status: 'PENDING',
      submitterId: 'seed-demo',
    },
  });

  await prisma.submission.upsert({
    where: { id: 'seed-sub-group-2' },
    update: {
      entityType: 'GROUP',
      mode: 'CREATE',
      targetId: null,
      payload: JSON.stringify(collegePayload),
      submitterId: 'seed-demo',
      groupTargetId: null,
      siteTargetId: null,
    },
    create: {
      id: 'seed-sub-group-2',
      entityType: 'GROUP',
      mode: 'CREATE',
      targetId: null,
      payload: JSON.stringify(collegePayload),
      status: 'PENDING',
      submitterId: 'seed-demo',
    },
  });

  await prisma.submission.upsert({
    where: { id: 'seed-sub-site-1' },
    update: {
      entityType: 'SITE',
      mode: 'CREATE',
      targetId: null,
      payload: JSON.stringify(sitePayload),
      submitterId: 'seed-demo',
      groupTargetId: null,
      siteTargetId: null,
    },
    create: {
      id: 'seed-sub-site-1',
      entityType: 'SITE',
      mode: 'CREATE',
      targetId: null,
      payload: JSON.stringify(sitePayload),
      status: 'PENDING',
      submitterId: 'seed-demo',
    },
  });

  console.log('示例投稿已就绪：3 条');
}

async function main() {
  await seedUsers();
  await seedCities();
  await seedTags();
  await seedAutoTagRules();
  await seedGroups();
  await seedSites();
  await seedActivities();
  await seedGallery();
  await seedSubmissions();

  const [users, cities, tags, rules, groups, sites, submissions] = await Promise.all([
    prisma.user.count(),
    prisma.cityRegionRule.count(),
    prisma.tag.count(),
    prisma.autoTagRule.count(),
    prisma.group.count(),
    prisma.site.count(),
    prisma.submission.count(),
  ]);

  console.log('种子数据汇总:', { users, cities, tags, rules, groups, sites, submissions });
}

main()
  .catch((error) => {
    console.error('种子数据写入失败:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
