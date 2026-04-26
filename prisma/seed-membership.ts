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
    features: [
      "基础组件库访问",
      "标准技术支持",
      "社区论坛支持",
      "1 个企业空间",
    ],
    priceMonthly: 0,
    priceYearly: 0,
    trialDays: 0,
    sortOrder: 1,
    isActive: true,
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
    features: [
      "基础组件库访问",
      "优先技术支持",
      "2 个企业空间",
      "数据分析基础版",
    ],
    priceMonthly: 9900, // 99 元
    priceYearly: 99000, // 990 元
    trialDays: 14,
    sortOrder: 2,
    isActive: true,
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
    features: [
      "全量组件库访问",
      "优先技术支持",
      "3 个企业空间",
      "数据分析报表",
      "自定义主题",
    ],
    priceMonthly: 19900, // 199 元
    priceYearly: 199000, // 1990 元
    trialDays: 14,
    sortOrder: 3,
    isActive: true,
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
    features: [
      "全量组件库访问",
      "VIP 专属技术支持",
      "5 个企业空间",
      "高级数据分析",
      "自定义主题",
      "优先功能更新",
    ],
    priceMonthly: 39900, // 399 元
    priceYearly: 399000, // 3990 元
    trialDays: 14,
    sortOrder: 4,
    isActive: true,
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
    features: [
      "所有功能无限制",
      "专属客户经理",
      "10 个企业空间",
      "企业级数据分析",
      "完整自定义",
      "专属培训课程",
    ],
    priceMonthly: 69900, // 699 元
    priceYearly: 699000, // 6990 元
    trialDays: 14,
    sortOrder: 5,
    isActive: true,
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
    features: [
      "所有功能无限制",
      "专属客户经理 24/7",
      "无限制企业空间",
      "企业级数据分析",
      "完整自定义",
      "专属培训课程",
      "定制化服务",
    ],
    priceMonthly: 129900, // 1299 元
    priceYearly: 1299000, // 12990 元
    trialDays: 14,
    sortOrder: 6,
    isActive: true,
  },
];

async function main() {
  console.log("开始初始化会员等级数据...");

  for (const level of membershipLevels) {
    await prisma.membershipLevel.upsert({
      where: { name: level.name },
      update: level,
      create: level,
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
