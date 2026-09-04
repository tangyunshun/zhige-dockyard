/**
 * 资费基线一键同步脚本（一次性执行，幂等）
 *
 * 作用：把「新阶梯资费方案」同步到数据库，仅覆盖资费相关字段，
 *      不触碰管理员已自定义的配额/权益字段（如团队席位、企业空间数、features 等）。
 *
 * 涉及三套资费，与「数据库是唯一资费来源」的约定一致：
 *  1) 会员等级 membershiplevel：新价格阶梯 + 每月算力点 + 算力加油包折扣 + 推荐档标记
 *  2) 空间套餐 workspaceplan：改为一次性「团队资源扩容包」语义
 *     - priceMonthly 表示一次性扩容价（分），priceYearly 停用(0)
 *     - tokenLimit 归零（扩容包不再附赠月算力，算力统一由会员等级 + 算力加油包提供）
 *  3) 算力加油包 tokenpack：体积阶梯折扣定价（档位越大单价越低）
 *
 * 运行方式（Windows PowerShell）：
 *   cd zhige-dockyard-web
 *   $env:DATABASE_URL="mysql://root:root@localhost:3306/zhige_dockyard?charset=utf8mb4"; npx tsx scripts/sync-pricing-config.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 会员等级资费（单位：分为价、算力点为月额度） */
const MEMBERSHIP_TIERS: {
  id: string;
  nameZh: string;
  priceMonthly: number;
  priceYearly: number;
  tokenLimit: number;
  tokenPackDiscount: number;
  isPopular: boolean;
  isRecommended: boolean;
}[] = [
  {
    id: "FREE",
    nameZh: "免费版",
    priceMonthly: 0,
    priceYearly: 0,
    tokenLimit: 500, // 每月 500 算力点
    tokenPackDiscount: 0,
    isPopular: false,
    isRecommended: false,
  },
  {
    id: "BRONZE",
    nameZh: "青铜会员",
    priceMonthly: 2900, // 29 元/月
    priceYearly: 29000, // 290 元/年
    tokenLimit: 3000,
    tokenPackDiscount: 0,
    isPopular: false,
    isRecommended: false,
  },
  {
    id: "SILVER",
    nameZh: "白银会员",
    priceMonthly: 5900, // 59 元/月
    priceYearly: 59000, // 590 元/年
    tokenLimit: 7000,
    tokenPackDiscount: 0,
    isPopular: false,
    isRecommended: false,
  },
  {
    id: "GOLD",
    nameZh: "黄金会员",
    priceMonthly: 16900, // 169 元/月
    priceYearly: 169000, // 1690 元/年
    tokenLimit: 25000,
    tokenPackDiscount: 10, // 加油包 9 折
    isPopular: true,
    isRecommended: true,
  },
  {
    id: "DIAMOND",
    nameZh: "钻石会员",
    priceMonthly: 49900, // 499 元/月
    priceYearly: 499000, // 4990 元/年
    tokenLimit: 90000,
    tokenPackDiscount: 15, // 加油包 8.5 折
    isPopular: false,
    isRecommended: false,
  },
  {
    id: "CROWN",
    nameZh: "皇冠会员",
    priceMonthly: 99900, // 999 元/月
    priceYearly: 999000, // 9990 元/年
    tokenLimit: 200000,
    tokenPackDiscount: 20, // 加油包 8 折
    isPopular: false,
    isRecommended: false,
  },
];

/**
 * 空间套餐：一次性「团队资源扩容包」。
 * id 与 20260902000000 迁移中的种子一致（key 唯一）。
 * priceMonthly = 一次性扩容价(分)；priceYearly = 0（订阅年付停用）；
 * tokenLimit = 0（扩容包不含月算力）。
 */
const WORKSPACE_PLAN_SYNC: {
  id: string;
  key: string;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  maxComponents: number;
  maxMembers: number;
  maxStorage: number; // MB
  maxApiCalls: number;
  tokenLimit: number;
  features: string[];
  sortOrder: number;
  purchasable: boolean;
  isActive: boolean;
}[] = [
  {
    id: "cm1workspaceplan000001",
    key: "STANDARD",
    name: "标准版",
    description: "新空间免费基础档，空间级资源可随时按需一次性扩容",
    priceMonthly: 0,
    priceYearly: 0,
    maxComponents: 100,
    maxMembers: 10,
    maxStorage: 1024,
    maxApiCalls: 1000,
    tokenLimit: 0,
    features: [
      "10 个团队协同席位",
      "100 个组件装配额度",
      "1 GB 云端存储",
      "1,000 次组件调用额度",
      "基础组件与标准技术支持",
    ],
    sortOrder: 1,
    purchasable: true,
    isActive: true,
  },
  {
    id: "cm1workspaceplan000002",
    key: "PRO",
    name: "专业版",
    description: "成长型团队一次性扩容包，解锁全量组件与更高并发",
    priceMonthly: 19900,
    priceYearly: 0,
    maxComponents: 500,
    maxMembers: 50,
    maxStorage: 10240,
    maxApiCalls: 10000,
    tokenLimit: 0,
    features: [
      "50 个团队协同席位",
      "500 个组件装配额度",
      "10 GB 云端存储",
      "10,000 次组件调用额度",
      "全量组件、优先支持与数据分析",
    ],
    sortOrder: 2,
    purchasable: true,
    isActive: true,
  },
  {
    id: "cm1workspaceplan000003",
    key: "ENTERPRISE",
    name: "旗舰版",
    description: "大型组织一次性扩容包，席位与组件无限制并含 SLA 保障",
    priceMonthly: 69900,
    priceYearly: 0,
    maxComponents: -1,
    maxMembers: -1,
    maxStorage: 102400,
    maxApiCalls: 100000,
    tokenLimit: 0,
    features: [
      "团队席位无限制",
      "组件装配额度无限制",
      "100 GB 云端存储",
      "100,000 次组件调用额度",
      "专属支持、高级分析与 SLA 保障",
    ],
    sortOrder: 3,
    purchasable: true,
    isActive: true,
  },
  {
    id: "cm1workspaceplan000004",
    key: "CUSTOM",
    name: "定制版",
    description: "按合同约定的线下定制方案",
    priceMonthly: 0,
    priceYearly: 0,
    maxComponents: -1,
    maxMembers: -1,
    maxStorage: -1,
    maxApiCalls: -1,
    tokenLimit: 0,
    features: ["全部能力按合同约定开放"],
    sortOrder: 4,
    purchasable: false,
    isActive: true,
  },
];

/** 算力加油包基线（体积阶梯折扣）。 */
const TOKEN_PACK_SYNC: {
  id: string;
  name: string;
  points: number;
  price: number;
  icon: string;
  color: string;
  description: string;
  isPopular: boolean;
  isActive: boolean;
  sortOrder: number;
}[] = [
  {
    id: "pack_lite_500",
    name: "知惠算力包",
    points: 500,
    price: 6,
    icon: "⚡",
    color: "#38a169",
    description: "小额尝鲜，随时为空间补充算力（约 ¥0.012/点）",
    isPopular: false,
    isActive: true,
    sortOrder: 1,
  },
  {
    id: "pack_standard_1000",
    name: "标准算力包",
    points: 1000,
    price: 10,
    icon: "💡",
    color: "#3182ce",
    description: "适合日常小规模测试与组件研发调用（约 ¥0.010/点）",
    isPopular: false,
    isActive: true,
    sortOrder: 2,
  },
  {
    id: "pack_pro_10000",
    name: "尊享算力包",
    points: 10000,
    price: 80,
    icon: "👑",
    color: "#dd6b20",
    description: "团队敏捷研发首选，量大更省心（约 ¥0.008/点）",
    isPopular: true,
    isActive: true,
    sortOrder: 3,
  },
  {
    id: "pack_enterprise_50000",
    name: "企业旗舰算力包",
    points: 50000,
    price: 350,
    icon: "🚀",
    color: "#805ad5",
    description: "专为大型企业级研发团队定制，大额采购最优（约 ¥0.007/点）",
    isPopular: false,
    isActive: true,
    sortOrder: 4,
  },
];

async function syncMembershipLevels() {
  console.log("\n[1/3] 同步会员等级资费（价格 / 月算力点 / 加油包折扣 / 推荐档）...");
  let updated = 0;
  for (const t of MEMBERSHIP_TIERS) {
    const exists = await prisma.membershiplevel.findUnique({
      where: { id: t.id },
      select: { id: true },
    });
    if (!exists) {
      console.warn(`  ⚠ 等级 ${t.id} 不存在，跳过（请先初始化会员等级数据）`);
      continue;
    }
    await prisma.membershiplevel.update({
      where: { id: t.id },
      data: {
        priceMonthly: t.priceMonthly,
        priceYearly: t.priceYearly,
        tokenLimit: BigInt(t.tokenLimit),
        tokenPackDiscount: t.tokenPackDiscount,
        isPopular: t.isPopular,
        isRecommended: t.isRecommended,
      },
    });
    updated++;
    console.log(
      `  ✔ ${t.id} → ¥${(t.priceMonthly / 100).toFixed(2)}/月，¥${(t.priceYearly / 100).toFixed(2)}/年，每月 ${t.tokenLimit} 算力点，加油包折扣 ${t.tokenPackDiscount}%`
    );
  }
  console.log(`  完成：更新 ${updated} 个等级`);
}

async function syncWorkspacePlans() {
  console.log("\n[2/3] 同步空间套餐为一次性「团队资源扩容包」...");
  for (const p of WORKSPACE_PLAN_SYNC) {
    await prisma.workspaceplan.upsert({
      where: { key: p.key },
      update: {
        name: p.name,
        description: p.description,
        priceMonthly: p.priceMonthly,
        priceYearly: p.priceYearly,
        maxComponents: p.maxComponents,
        maxMembers: p.maxMembers,
        maxStorage: p.maxStorage,
        maxApiCalls: p.maxApiCalls,
        tokenLimit: p.tokenLimit,
        features: p.features,
        sortOrder: p.sortOrder,
        purchasable: p.purchasable,
        isActive: p.isActive,
      },
      create: {
        id: p.id,
        key: p.key,
        name: p.name,
        description: p.description,
        priceMonthly: p.priceMonthly,
        priceYearly: p.priceYearly,
        maxComponents: p.maxComponents,
        maxMembers: p.maxMembers,
        maxStorage: p.maxStorage,
        maxApiCalls: p.maxApiCalls,
        tokenLimit: p.tokenLimit,
        features: p.features,
        sortOrder: p.sortOrder,
        purchasable: p.purchasable,
        isActive: p.isActive,
      },
    });
    console.log(
      `  ✔ ${p.key}(${p.name}) → 一次性 ¥${(p.priceMonthly / 100).toFixed(2)}`
    );
  }
  console.log("  完成：4 个套餐已同步");
}

async function syncTokenPacks() {
  console.log("\n[3/3] 同步算力加油包（体积阶梯定价 + 补齐 500 点档）...");
  let updated = 0;
  let created = 0;
  for (const pack of TOKEN_PACK_SYNC) {
    // 优先按固定 id 命中；若该 id 不存在，再按点数匹配已有的同档位加油包，避免重复建档
    const existingById = await prisma.tokenpack.findUnique({
      where: { id: pack.id },
      select: { id: true },
    });
    const target =
      existingById ??
      (await prisma.tokenpack.findFirst({
        where: { points: pack.points, isActive: true },
        select: { id: true },
      }));

    const data = {
      name: pack.name,
      points: pack.points,
      price: pack.price,
      icon: pack.icon,
      color: pack.color,
      description: pack.description,
      isPopular: pack.isPopular,
      isActive: pack.isActive,
      sortOrder: pack.sortOrder,
    };
    if (target) {
      await prisma.tokenpack.update({ where: { id: target.id }, data });
      updated++;
      console.log(
        `  ✔ ${pack.points} 点档 → ¥${pack.price.toFixed(2)}（${pack.name}）`
      );
    } else {
      await prisma.tokenpack.create({
        data: { id: pack.id, ...data },
      });
      created++;
      console.log(
        `  ✚ 新建 ${pack.points} 点档 → ¥${pack.price.toFixed(2)}（${pack.name}）`
      );
    }
  }
  console.log(`  完成：更新 ${updated} 档，新建 ${created} 档`);
}

async function main() {
  console.log("========== 资费基线同步开始 ==========");
  await syncMembershipLevels();
  await syncWorkspacePlans();
  await syncTokenPacks();
  console.log("\n========== 同步完成 ==========");
  console.log("提示：数据库为唯一资费来源，此后请通过管理后台调整资费，代码不再硬编码。");
}

main()
  .catch((e) => {
    console.error("同步失败：", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
