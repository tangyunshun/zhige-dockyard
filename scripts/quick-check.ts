import prisma from '../src/lib/prisma';

async function checkData() {
  try {
    console.log('=== 检查数据库 ===\n');

    const userCount = await prisma.user.count();
    console.log(`用户数：${userCount}`);

    if (userCount > 0) {
      const users = await prisma.user.findMany({
        take: 3,
        select: {
          id: true,
          email: true,
          name: true,
          membershipLevel: true,
        },
      });
      console.log('前 3 个用户:', users);
    }

    const workspaceCount = await prisma.workspace.count();
    console.log(`\n工作空间数：${workspaceCount}`);

    const componentCount = await prisma.componenttask.count();
    console.log(`组件数：${componentCount}`);

    const membershipCount = await prisma.membershiplevel.count();
    console.log(`会员等级数：${membershipCount}`);

  } catch (error) {
    console.error('错误:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
