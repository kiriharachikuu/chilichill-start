import 'dotenv/config';
import { createPrismaClient } from '../src/prisma';

// 管理员提权 CLI：把已注册用户提升为 ADMIN。
// 首次安装流程：网页注册账号 → 运行本脚本 → 重新登录生效。
// 用法：npm run admin:promote -- <邮箱>
const prisma = createPrismaClient();

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error('用法: npm run admin:promote -- <邮箱>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`[promote] 未找到用户 ${email}：请先在网页完成注册（或检查邮箱拼写）`);
    process.exit(1);
  }

  if (user.role === 'ADMIN') {
    console.log(`[promote] ${email} 已经是 ADMIN，无需操作`);
    return;
  }

  await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  console.log(`[promote] 已将 ${email}（${user.nickname}）提升为 ADMIN`);
  console.log('[promote] 若该用户当前已登录，退出后重新登录即可生效');
}

main()
  .catch((error) => {
    console.error('[promote] 提权失败:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
