import prisma from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

async function restoreTestData() {
  try {
    console.log('=== 开始恢复测试数据 ===\n');

    // 1. 创建测试用户
    console.log('创建测试用户...');
    const hashedPassword = await bcrypt.hash('123456', 10);
    
    const testUser = await prisma.user.create({
      data: {
        email: 'admin@zhige.com',
        name: '测试管理员',
        password: hashedPassword,
        role: 'admin',
        membershipLevel: 'PRO',
      },
    });
    console.log(`✅ 创建用户：${testUser.email} (${testUser.id})`);

    // 2. 创建会员等级
    console.log('\n创建会员等级...');
    const membershipLevels = await prisma.membershiplevel.createMany({
      data: [
        {
          id: 'free-tier',
          name: 'FREE',
          nameZh: '免费版',
          priceMonthly: 0,
          priceYearly: 0,
          maxEnterpriseWorkspaces: 1,
          maxTeamSize: 5,
          maxStorage: BigInt(1073741824), // 1GB
          maxApiCalls: BigInt(1000),
          features: JSON.stringify(['基础组件使用', '1 个企业空间', '5 人团队']),
          isActive: true,
          sortOrder: 1,
        },
        {
          id: 'pro-tier',
          name: 'PRO',
          nameZh: '专业版',
          priceMonthly: 99,
          priceYearly: 990,
          maxEnterpriseWorkspaces: 3,
          maxTeamSize: 20,
          maxStorage: BigInt(53687091200), // 50GB
          maxApiCalls: BigInt(50000),
          features: JSON.stringify(['所有组件使用', '3 个企业空间', '20 人团队', '优先支持']),
          isActive: true,
          isPopular: true,
          sortOrder: 2,
        },
        {
          id: 'enterprise-tier',
          name: 'ENTERPRISE',
          nameZh: '企业版',
          priceMonthly: 299,
          priceYearly: 2990,
          maxEnterpriseWorkspaces: 10,
          maxTeamSize: 100,
          maxStorage: BigInt(536870912000), // 500GB
          maxApiCalls: BigInt(500000),
          features: JSON.stringify(['所有组件使用', '10 个企业空间', '100 人团队', '专属客服', '定制开发']),
          isActive: true,
          sortOrder: 3,
        },
      ],
    });
    console.log(`✅ 创建 ${membershipLevels.count} 个会员等级`);

    // 3. 创建测试工作空间
    console.log('\n创建工作空间...');
    const personalWorkspace = await prisma.workspace.create({
      data: {
        name: '我的个人空间',
        type: 'PERSONAL',
        ownerId: testUser.id,
        description: '个人私密沙盒',
      },
    });
    console.log(`✅ 创建个人空间：${personalWorkspace.name}`);

    const enterpriseWorkspace = await prisma.workspace.create({
      data: {
        name: '测试企业空间',
        type: 'ENTERPRISE',
        ownerId: testUser.id,
        description: '企业协作空间',
        industry: '互联网',
        contactEmail: 'contact@zhige.com',
      },
    });
    console.log(`✅ 创建企业空间：${enterpriseWorkspace.name}`);

    // 4. 添加用户为工作空间成员
    await prisma.workspacemember.create({
      data: {
        userId: testUser.id,
        workspaceId: enterpriseWorkspace.id,
        role: 'OWNER',
      },
    });

    // 5. 创建测试组件
    console.log('\n创建测试组件...');
    const components = [
      { name: 'RFP 标书解析', type: 'BID_PREP', description: '自动解析招标文件结构与关键条款' },
      { name: '慢 SQL 优化', type: 'DATABASE_ENG', description: '分析执行计划并提供索引优化建议' },
      { name: 'React 组件生成', type: 'FRONTEND_DEV', description: '基于设计稿生成 React 组件代码' },
      { name: '单元测试生成', type: 'TEST_QA', description: '自动生成 Jest/Vitest 测试用例' },
      { name: 'Docker 镜像构建', type: 'DEVOPS', description: '生成 Dockerfile 并优化镜像体积' },
    ];

    const createdComponents = await Promise.all(
      components.map(comp =>
        prisma.componenttask.create({
          data: {
            ...comp,
            status: 'completed',
            progress: 100,
            isPublished: true,
            userId: testUser.id,
          },
        })
      )
    );
    console.log(`✅ 创建 ${createdComponents.length} 个测试组件`);

    // 6. 为企业空间初始化 RBAC 数据
    console.log('\n初始化 RBAC 数据...');
    const defaultPosts = [
      { name: '管理员', description: '企业空间管理员', color: '#3182ce', isSystem: true },
      { name: '售前专家', description: '负责商机跟进', color: '#10b981', isSystem: true },
      { name: '测试经理', description: '负责质量保证', color: '#f59e0b', isSystem: true },
    ];

    for (const post of defaultPosts) {
      const createdPost = await prisma.workspacepost.create({
        data: {
          workspaceId: enterpriseWorkspace.id,
          name: post.name,
          description: post.description,
          color: post.color,
          isDefault: true,
          isSystem: post.isSystem,
          createdBy: testUser.id,
        },
      });
      console.log(`✅ 创建岗位：${createdPost.name}`);
    }

    // 7. 创建工作空间配额
    const freeLevel = await prisma.membershiplevel.findFirst({ where: { name: 'FREE' } });
    if (freeLevel) {
      await prisma.workspacequota.create({
        data: {
          workspaceId: enterpriseWorkspace.id,
          membershipLevelId: freeLevel.id,
          enterpriseSlots: BigInt(1),
          usedSlots: BigInt(0),
          tokenBalance: BigInt(10000),
          storageUsed: BigInt(0),
          storageLimit: BigInt(1073741824),
          apiCallsUsed: BigInt(0),
          apiCallsLimit: BigInt(1000),
        },
      });
      console.log('✅ 创建工作空间配额');
    }

    console.log('\n=== 数据恢复完成 ===');
    console.log('\n登录信息:');
    console.log(`账号：admin@zhige.com`);
    console.log(`密码：123456`);
    console.log(`用户 ID: ${testUser.id}`);

  } catch (error) {
    console.error('❌ 恢复失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

restoreTestData();
