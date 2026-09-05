import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const membershipLevels = [
  {
    name: "FREE",
    nameZh: "免费版",
    icon: "👤",
    color: "#94a3b8",
    description: "适合个人开发者和小型项目",
    maxPersonalWorkspaces: 1,
    maxEnterpriseWorkspaces: BigInt(1),
    maxComponents: BigInt(100),
    maxTeamSize: BigInt(5),
    maxStorage: BigInt(1073741824), // 1GB
    maxApiCalls: BigInt(1000),
    // 免费版标准额度：100 算力点（与新用户注册赠送的 100 点口径保持一致）
    tokenLimit: BigInt(100),
    features: [
      "基础组件库访问",
      "标准技术支持",
      "社区论坛支持",
      "1 个企业空间",
    ],
    priceMonthly: 0,
    priceYearly: 0,
    tokenPackDiscount: 0,
    trialDays: 0,
    sortOrder: 1,
    isActive: true,
    isPopular: false,
    isRecommended: false,
  },
  {
    name: "BRONZE",
    nameZh: "青铜会员",
    icon: "🥉",
    color: "#cd7f32",
    description: "适合成长型小团队",
    maxPersonalWorkspaces: 1,
    maxEnterpriseWorkspaces: BigInt(2),
    maxComponents: BigInt(300),
    maxTeamSize: BigInt(20),
    maxStorage: BigInt(5368709120), // 5GB
    maxApiCalls: BigInt(5000),
    tokenLimit: BigInt(3000), // 每月 3000 算力点
    features: [
      "基础组件库访问",
      "优先技术支持",
      "2 个企业空间",
      "数据分析基础版",
    ],
    priceMonthly: 2900, // 29 元/月
    priceYearly: 29000, // 290 元/年（年付=月付×10）
    tokenPackDiscount: 0,
    trialDays: 14,
    sortOrder: 2,
    isActive: true,
    isPopular: false,
    isRecommended: false,
  },
  {
    name: "SILVER",
    nameZh: "白银会员",
    icon: "🥈",
    color: "#c0c0c0",
    description: "适合中型团队和创业公司",
    maxPersonalWorkspaces: 1,
    maxEnterpriseWorkspaces: BigInt(3),
    maxComponents: BigInt(500),
    maxTeamSize: BigInt(50),
    maxStorage: BigInt(10737418240), // 10GB
    maxApiCalls: BigInt(10000),
    tokenLimit: BigInt(7000), // 每月 7000 算力点
    features: [
      "全量组件库访问",
      "优先技术支持",
      "3 个企业空间",
      "数据分析报表",
      "自定义主题",
    ],
    priceMonthly: 5900, // 59 元/月
    priceYearly: 59000, // 590 元/年（年付=月付×10）
    tokenPackDiscount: 0,
    trialDays: 14,
    sortOrder: 3,
    isActive: true,
    isPopular: false,
    isRecommended: false,
  },
  {
    name: "GOLD",
    nameZh: "黄金会员",
    icon: "🥇",
    color: "#ffd700",
    description: "适合大型企业和组织",
    maxPersonalWorkspaces: 1,
    maxEnterpriseWorkspaces: BigInt(5),
    maxComponents: BigInt(1000),
    maxTeamSize: BigInt(100),
    maxStorage: BigInt(53687091200), // 50GB
    maxApiCalls: BigInt(50000),
    tokenLimit: BigInt(25000), // 每月 25000 算力点
    features: [
      "全量组件库访问",
      "VIP 专属技术支持",
      "5 个企业空间",
      "高级数据分析",
      "自定义主题",
      "优先功能更新",
    ],
    priceMonthly: 16900, // 169 元/月
    priceYearly: 169000, // 1690 元/年（年付=月付×10）
    tokenPackDiscount: 10, // 购买算力加油包 9 折
    trialDays: 14,
    sortOrder: 4,
    isActive: true,
    isPopular: true,
    isRecommended: true,
  },
  {
    name: "DIAMOND",
    nameZh: "钻石会员",
    icon: "💎",
    color: "#b9f2ff",
    description: "适合超大型企业和复杂项目",
    maxPersonalWorkspaces: 1,
    maxEnterpriseWorkspaces: BigInt(10),
    maxComponents: BigInt(2000),
    maxTeamSize: BigInt(200),
    maxStorage: BigInt(107374182400), // 100GB
    maxApiCalls: BigInt(100000),
    tokenLimit: BigInt(90000), // 每月 90000 算力点
    features: [
      "所有功能无限制",
      "专属客户经理",
      "10 个企业空间",
      "企业级数据分析",
      "完整自定义",
      "专属培训课程",
    ],
    priceMonthly: 49900, // 499 元/月
    priceYearly: 499000, // 4990 元/年（年付=月付×10）
    tokenPackDiscount: 15, // 购买算力加油包 8.5 折
    trialDays: 14,
    sortOrder: 5,
    isActive: true,
    isPopular: false,
    isRecommended: false,
  },
  {
    name: "CROWN",
    nameZh: "皇冠会员",
    icon: "👑",
    color: "#f59e0b",
    description: "顶级企业定制服务",
    maxPersonalWorkspaces: 1,
    maxEnterpriseWorkspaces: BigInt(-1), // -1 表示无限制
    maxComponents: BigInt(-1),
    maxTeamSize: BigInt(-1),
    maxStorage: BigInt(536870912000), // 500GB
    maxApiCalls: BigInt(500000),
    tokenLimit: BigInt(200000), // 每月 200000 算力点
    features: [
      "所有功能无限制",
      "专属客户经理 24/7",
      "无限制企业空间",
      "企业级数据分析",
      "完整自定义",
      "专属培训课程",
      "定制化服务",
    ],
    priceMonthly: 99900, // 999 元/月
    priceYearly: 999000, // 9990 元/年（年付=月付×10）
    tokenPackDiscount: 20, // 购买算力加油包 8 折
    trialDays: 14,
    sortOrder: 6,
    isActive: true,
    isPopular: false,
    isRecommended: false,
  },
];

async function main() {
  console.log("开始初始化会员等级数据...");

  for (const level of membershipLevels) {
    const data = {
      ...level,
      id: level.name,
      updatedAt: new Date(),
    };
    await prisma.membershiplevel.upsert({
      where: { name: level.name },
      update: data,
      create: data,
    });
    console.log(`✓ 已创建/更新会员等级：${level.nameZh}`);
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
