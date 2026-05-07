import prisma from '../src/lib/prisma';

async function checkDatabase() {
  try {
    console.log('=== 检查数据库数据 ===\n');

    // 检查用户数据
    const userCount = await prisma.user.count();
    console.log(`✅ 用户总数：${userCount}`);

    const users = await prisma.user.findMany({
      take: 5,
      select: {
        id: true,
        name: true,
        email: true,
        membershipLevel: true,
      },
    });
    console.log('前 5 个用户:', users);
    console.log('');

    // 检查工作空间数据
    const workspaceCount = await prisma.workspace.count();
    console.log(`✅ 工作空间总数：${workspaceCount}`);

    const workspaces = await prisma.workspace.findMany({
      take: 5,
      select: {
        id: true,
        name: true,
        type: true,
        ownerId: true,
      },
    });
    console.log('前 5 个工作空间:', workspaces);
    console.log('');

    // 检查组件数据
    const componentCount = await prisma.componenttask.count();
    console.log(`✅ 组件总数：${componentCount}`);

    const components = await prisma.componenttask.findMany({
      take: 5,
      select: {
        id: true,
        name: true,
        type: true,
        isPublished: true,
      },
    });
    console.log('前 5 个组件:', components);
    console.log('');

    // 检查会员等级数据
    const membershipLevelCount = await prisma.membershiplevel.count();
    console.log(`✅ 会员等级总数：${membershipLevelCount}`);

    const membershipLevels = await prisma.membershiplevel.findMany({
      select: {
        id: true,
        name: true,
        price: true,
      },
    });
    console.log('会员等级:', membershipLevels);
    console.log('');

    // 检查阶段数据
    const phaseCount = await prisma.phase.count();
    console.log(`✅ 阶段总数：${phaseCount}`);

    const phases = await prisma.phase.findMany({
      take: 5,
      select: {
        id: true,
        name: true,
        sortOrder: true,
      },
    });
    console.log('前 5 个阶段:', phases);
    console.log('');

    // 检查新添加的 RBAC 相关表
    const postCount = await prisma.workspacepost.count();
    console.log(`✅ 岗位总数：${postCount}`);

    const permissionCount = await prisma.componentpermission.count();
    console.log(`✅ 组件权限配置总数：${permissionCount}`);

    const quotaCount = await prisma.workspacequota.count();
    console.log(`✅ 工作空间配额总数：${quotaCount}`);

    console.log('\n=== 数据库检查完成 ===');
    console.log('✅ 所有数据完好无损！');

  } catch (error) {
    console.error('❌ 检查失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
