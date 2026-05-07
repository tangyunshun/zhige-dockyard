import prisma from '../src/lib/prisma';

async function restoreAllData() {
  try {
    console.log('=== 开始恢复所有必要数据 ===\n');

    // 获取测试管理员
    const adminUser = await prisma.user.findFirst({
      where: { email: 'admin@zhige.com' },
    });

    if (!adminUser) {
      console.error('❌ 测试管理员不存在，请先运行 restore-data.ts');
      return;
    }

    console.log(`使用管理员账号：${adminUser.email}\n`);

    // 1. 创建会员等级
    console.log('1. 创建会员等级...');
    const levels = [
      {
        id: 'free-tier',
        name: 'FREE',
        nameZh: '免费版',
        priceMonthly: 0,
        priceYearly: 0,
        maxEnterpriseWorkspaces: 1,
        maxTeamSize: 5,
        maxStorage: BigInt(1073741824),
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
        maxStorage: BigInt(53687091200),
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
        maxStorage: BigInt(536870912000),
        maxApiCalls: BigInt(500000),
        features: JSON.stringify(['所有组件使用', '10 个企业空间', '100 人团队', '专属客服', '定制开发']),
        isActive: true,
        sortOrder: 3,
      },
    ];

    for (const levelData of levels) {
      await prisma.membershiplevel.upsert({
        where: { name: levelData.name },
        create: {
          ...levelData,
          updatedAt: new Date(),
        },
        update: {
          ...levelData,
          updatedAt: new Date(),
        },
      });
    }
    console.log(`✅ 创建/更新 3 个会员等级\n`);

    // 2. 创建工作空间
    console.log('2. 创建工作空间...');
    const now = new Date();
    const personalWorkspace = await prisma.workspace.upsert({
      where: { id: 'personal-workspace-test-001' },
      create: {
        id: 'personal-workspace-test-001',
        name: '我的个人空间',
        type: 'PERSONAL',
        ownerId: adminUser.id,
        description: '个人私密沙盒',
        createdAt: now,
        updatedAt: now,
      },
      update: {
        name: '我的个人空间',
      },
    });
    console.log(`✅ 创建/更新个人空间：${personalWorkspace.name}`);

    const enterpriseWorkspace = await prisma.workspace.upsert({
      where: { id: 'enterprise-workspace-test-001' },
      create: {
        id: 'enterprise-workspace-test-001',
        name: '测试企业空间',
        type: 'ENTERPRISE',
        ownerId: adminUser.id,
        description: '企业协作空间',
        industry: '互联网',
        contactEmail: 'contact@zhige.com',
        createdAt: now,
        updatedAt: now,
      },
      update: {
        name: '测试企业空间',
      },
    });
    console.log(`✅ 创建/更新企业空间：${enterpriseWorkspace.name}\n`);

    // 3. 添加成员关系
    await prisma.workspacemember.upsert({
      where: { id: 'workspace-member-001' },
      create: {
        id: 'workspace-member-001',
        userId: adminUser.id,
        workspaceId: enterpriseWorkspace.id,
        role: 'OWNER',
      },
      update: {
        role: 'OWNER',
      },
    });
    console.log('✅ 添加/更新企业空间成员关系\n');

    // 4. 创建测试组件
    console.log('4. 创建测试组件...');
    const componentsData = [
      { name: 'RFP 标书解析', type: 'BID_PREP', description: '自动解析招标文件结构与关键条款', icon: '📄' },
      { name: '慢 SQL 优化', type: 'DATABASE_ENG', description: '分析执行计划并提供索引优化建议', icon: '🩺' },
      { name: 'React 组件生成', type: 'FRONTEND_DEV', description: '基于设计稿生成 React 组件代码', icon: '⚛️' },
      { name: '单元测试生成', type: 'TEST_QA', description: '自动生成 Jest/Vitest 测试用例', icon: '🧪' },
      { name: 'Docker 镜像构建', type: 'DEVOPS', description: '生成 Dockerfile 并优化镜像体积', icon: '🐳' },
      { name: 'K8s 部署配置', type: 'DEVOPS', description: '生成 Kubernetes 部署 YAML', icon: '☸️' },
      { name: 'CI/CD 流水线', type: 'DEVOPS', description: '配置 GitHub Actions 流水线', icon: '🔄' },
      { name: 'SQL 注入检测', type: 'SECURITY', description: '扫描代码中的 SQL 注入风险', icon: '🛡️' },
      { name: 'WBS 任务分解', type: 'PROJ_MGMT', description: '自动生成 WBS 工作分解结构', icon: '📊' },
      { name: '技术文档生成', type: 'KNOWLEDGE', description: '基于代码自动生成 API 文档', icon: '📚' },
    ];

    const createdComponents = await Promise.all(
      componentsData.map((comp, index) =>
        prisma.componenttask.upsert({
          where: { id: `component-${String(index + 1).padStart(3, '0')}` },
          create: {
            id: `component-${String(index + 1).padStart(3, '0')}`,
            name: comp.name,
            type: comp.type,
            description: comp.description,
            icon: comp.icon,
            status: 'completed',
            progress: 100,
            isPublished: true,
            userId: adminUser.id,
          },
          update: {
            name: comp.name,
            status: 'completed',
            progress: 100,
          },
        })
      )
    );
    console.log(`✅ 创建/更新 ${createdComponents.length} 个测试组件\n`);

    // 5. 初始化 RBAC 岗位
    console.log('5. 初始化 RBAC 岗位...');
    const defaultPosts = [
      { name: '管理员', description: '企业空间管理员，拥有全部权限', color: '#3182ce' },
      { name: '售前专家', description: '负责商机跟进、标书制作', color: '#10b981' },
      { name: '测试经理', description: '负责测试计划、质量保证', color: '#f59e0b' },
      { name: '技术负责人', description: '负责技术架构、后端开发', color: '#8b5cf6' },
      { name: '产品经理', description: '负责需求分析、产品设计', color: '#ec4899' },
      { name: '运维工程师', description: '负责部署、监控、CI/CD', color: '#06b6d4' },
      { name: '安全专家', description: '负责安全扫描、漏洞检测', color: '#ef4444' },
    ];

    for (const [index, post] of defaultPosts.entries()) {
      await prisma.workspacepost.upsert({
        where: { id: `post-${String(index + 1).padStart(3, '0')}` },
        create: {
          id: `post-${String(index + 1).padStart(3, '0')}`,
          workspaceId: enterpriseWorkspace.id,
          name: post.name,
          description: post.description,
          color: post.color,
          isDefault: true,
          isSystem: true,
          createdBy: adminUser.id,
          updatedAt: new Date(),
        },
        update: {
          name: post.name,
          description: post.description,
        },
      });
    }
    console.log(`✅ 创建/更新 ${defaultPosts.length} 个默认岗位\n`);

    // 6. 创建配额
    console.log('6. 创建工作空间配额...');
    const freeLevel = await prisma.membershiplevel.findFirst({ where: { name: 'FREE' } });
    if (freeLevel) {
      await prisma.workspacequota.upsert({
        where: { workspaceId: enterpriseWorkspace.id },
        create: {
          id: 'workspace-quota-001',
          workspaceId: enterpriseWorkspace.id,
          membershipLevelId: freeLevel.id,
          enterpriseSlots: BigInt(1),
          usedSlots: BigInt(0),
          tokenBalance: BigInt(10000),
          storageUsed: BigInt(0),
          storageLimit: BigInt(1073741824),
          apiCallsUsed: BigInt(0),
          apiCallsLimit: BigInt(1000),
          updatedAt: new Date(),
        },
        update: {
          tokenBalance: BigInt(10000),
          updatedAt: new Date(),
        },
      });
      console.log('✅ 创建/更新企业空间配额\n');
    }

    console.log('=== 数据恢复完成 ===\n');
    console.log('登录信息:');
    console.log(`账号：admin@zhige.com`);
    console.log(`密码：123456`);
    console.log(`\n可访问的页面:`);
    console.log(`- Workspace Hub: http://localhost:3000/user/workspace-hub`);
    console.log(`- 权限矩阵：http://localhost:3000/user/workspace-hub/role-matrix?workspaceId=${enterpriseWorkspace.id}`);

  } catch (error) {
    console.error('❌ 恢复失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

restoreAllData();
