import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("开始初始化会员等级数据...");

  // 定义默认会员等级
  const membershipLevels = [
    {
      name: "FREE",
      nameZh: "免费版",
      icon: "🆓",
      color: "#94a3b8",
      description: "基础功能，适合个人试用",
      maxPersonalWorkspaces: 1,
      maxEnterpriseWorkspaces: 1,
      maxComponents: 10,
      maxTeamSize: 3,
      maxStorage: 1073741824, // 1GB
      maxApiCalls: 100,
      features: ["基础组件库", "个人工作空间", "基础协作功能"],
      priceMonthly: 0,
      priceYearly: 0,
      trialDays: 0,
      sortOrder: 0,
      isActive: true,
    },
    {
      name: "BRONZE",
      nameZh: "青铜版",
      icon: "🥉",
      color: "#cd7f32",
      description: "适合小型团队使用",
      maxPersonalWorkspaces: 1,
      maxEnterpriseWorkspaces: 2,
      maxComponents: 50,
      maxTeamSize: 10,
      maxStorage: 10737418240, // 10GB
      maxApiCalls: 1000,
      features: [
        "免费版所有功能",
        "2 个企业空间",
        "50 个组件",
        "10 人团队",
        "10GB 存储",
        "优先支持",
      ],
      priceMonthly: 9900, // 99 元
      priceYearly: 99000, // 990 元
      trialDays: 7,
      sortOrder: 1,
      isActive: true,
    },
    {
      name: "SILVER",
      nameZh: "白银版",
      icon: "🥈",
      color: "#c0c0c0",
      description: "适合中型团队使用",
      maxPersonalWorkspaces: 1,
      maxEnterpriseWorkspaces: 3,
      maxComponents: 200,
      maxTeamSize: 30,
      maxStorage: 53687091200, // 50GB
      maxApiCalls: 5000,
      features: [
        "青铜版所有功能",
        "3 个企业空间",
        "200 个组件",
        "30 人团队",
        "50GB 存储",
        "5000 次 API 调用",
        "高级组件库",
      ],
      priceMonthly: 29900, // 299 元
      priceYearly: 299000, // 2990 元
      trialDays: 14,
      sortOrder: 2,
      isActive: true,
    },
    {
      name: "GOLD",
      nameZh: "黄金版",
      icon: "🥇",
      color: "#ffd700",
      description: "适合大型团队使用",
      maxPersonalWorkspaces: 1,
      maxEnterpriseWorkspaces: 5,
      maxComponents: 500,
      maxTeamSize: 100,
      maxStorage: 107374182400, // 100GB
      maxApiCalls: 20000,
      features: [
        "白银版所有功能",
        "5 个企业空间",
        "500 个组件",
        "100 人团队",
        "100GB 存储",
        "20000 次 API 调用",
        "专属客户经理",
      ],
      priceMonthly: 59900, // 599 元
      priceYearly: 599000, // 5990 元
      trialDays: 30,
      sortOrder: 3,
      isActive: true,
    },
    {
      name: "DIAMOND",
      nameZh: "钻石版",
      icon: "💎",
      color: "#b9f2ff",
      description: "适合企业级用户",
      maxPersonalWorkspaces: 1,
      maxEnterpriseWorkspaces: 10,
      maxComponents: 2000,
      maxTeamSize: 500,
      maxStorage: 536870912000, // 500GB
      maxApiCalls: 100000,
      features: [
        "黄金版所有功能",
        "10 个企业空间",
        "2000 个组件",
        "500 人团队",
        "500GB 存储",
        "100000 次 API 调用",
        "定制化服务",
      ],
      priceMonthly: 129900, // 1299 元
      priceYearly: 1299000, // 12990 元
      trialDays: 30,
      sortOrder: 4,
      isActive: true,
    },
    {
      name: "CROWN",
      nameZh: "皇冠版",
      icon: "👑",
      color: "#9333ea",
      description: "顶级企业定制方案",
      maxPersonalWorkspaces: 1,
      maxEnterpriseWorkspaces: 999,
      maxComponents: 99999,
      maxTeamSize: 9999,
      maxStorage: 1099511627776, // 1TB
      maxApiCalls: 999999,
      features: [
        "钻石版所有功能",
        "无限企业空间",
        "无限组件",
        "无限团队",
        "1TB 存储",
        "无限 API 调用",
        "7x24 专属支持",
        "私有化部署",
      ],
      priceMonthly: 299900, // 2999 元
      priceYearly: 2999000, // 29990 元
      trialDays: 30,
      sortOrder: 5,
      isActive: true,
    },
  ];

  // 逐个创建或更新会员等级
  for (const level of membershipLevels) {
    await prisma.membershipLevel.upsert({
      where: { name: level.name },
      update: level,
      create: level,
    });
    console.log(`✓ 会员等级 ${level.nameZh} 已准备就绪`);
  }

  console.log("会员等级数据初始化完成！");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
