/**
 * 种子脚本：插入正确的 6 个会员等级数据
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// 6 个会员等级配置
const membershipLevels = [
  {
    id: 'free-tier',
    name: 'FREE',
    nameZh: '免费版',
    icon: '👤',
    color: '#94a3b8',
    description: '基础功能，个人使用',
    maxPersonalWorkspaces: 1,
    maxEnterpriseWorkspaces: BigInt(1),
    maxComponents: BigInt(100),
    maxTeamSize: BigInt(5),
    maxStorage: BigInt(1073741824), // 1GB
    maxApiCalls: BigInt(1000),
    priceMonthly: 0,
    priceYearly: 0,
    isActive: true,
    isPopular: false,
    isRecommended: false,
    sortOrder: 1,
  },
  {
    id: 'bronze-tier',
    name: 'BRONZE',
    nameZh: '青铜会员',
    icon: '🥉',
    color: '#cd7f32',
    description: '小型团队，基础进阶',
    maxPersonalWorkspaces: 1,
    maxEnterpriseWorkspaces: BigInt(2),
    maxComponents: BigInt(300),
    maxTeamSize: BigInt(20),
    maxStorage: BigInt(5368709120), // 5GB
    maxApiCalls: BigInt(5000),
    priceMonthly: 99,
    priceYearly: 990,
    isActive: true,
    isPopular: false,
    isRecommended: false,
    sortOrder: 2,
  },
  {
    id: 'silver-tier',
    name: 'SILVER',
    nameZh: '白银会员',
    icon: '🥈',
    color: '#c0c0c0',
    description: '中型团队，功能全面',
    maxPersonalWorkspaces: 1,
    maxEnterpriseWorkspaces: BigInt(3),
    maxComponents: BigInt(500),
    maxTeamSize: BigInt(50),
    maxStorage: BigInt(10737418240), // 10GB
    maxApiCalls: BigInt(10000),
    priceMonthly: 199,
    priceYearly: 1990,
    isActive: true,
    isPopular: false,
    isRecommended: true,
    sortOrder: 3,
  },
  {
    id: 'gold-tier',
    name: 'GOLD',
    nameZh: '黄金会员',
    icon: '🥇',
    color: '#ffd700',
    description: '大型团队，高级功能',
    maxPersonalWorkspaces: 1,
    maxEnterpriseWorkspaces: BigInt(5),
    maxComponents: BigInt(1000),
    maxTeamSize: BigInt(100),
    maxStorage: BigInt(53687091200), // 50GB
    maxApiCalls: BigInt(50000),
    priceMonthly: 399,
    priceYearly: 3990,
    isActive: true,
    isPopular: true,
    isRecommended: false,
    sortOrder: 4,
  },
  {
    id: 'diamond-tier',
    name: 'DIAMOND',
    nameZh: '钻石会员',
    icon: '💎',
    color: '#b9f2ff',
    description: '企业级团队，尊享服务',
    maxPersonalWorkspaces: 1,
    maxEnterpriseWorkspaces: BigInt(5),
    maxComponents: BigInt(5000),
    maxTeamSize: BigInt(200),
    maxStorage: BigInt(107374182400), // 100GB
    maxApiCalls: BigInt(100000),
    priceMonthly: 699,
    priceYearly: 6990,
    isActive: true,
    isPopular: false,
    isRecommended: false,
    sortOrder: 5,
  },
  {
    id: 'crown-tier',
    name: 'CROWN',
    nameZh: '皇冠会员',
    icon: '👑',
    color: '#f59e0b',
    description: '无限资源，专属服务',
    maxPersonalWorkspaces: 1,
    maxEnterpriseWorkspaces: BigInt(-1), // -1 表示无限制
    maxComponents: BigInt(-1),
    maxTeamSize: BigInt(-1),
    maxStorage: BigInt(-1),
    maxApiCalls: BigInt(-1),
    priceMonthly: 1999,
    priceYearly: 19990,
    isActive: true,
    isPopular: false,
    isRecommended: false,
    sortOrder: 6,
  },
];

async function main() {
  console.log('🌱 开始插入会员等级数据...');

  try {
    for (const level of membershipLevels) {
      await prisma.membershiplevel.upsert({
        where: { id: level.id },
        update: {
          name: level.name,
          nameZh: level.nameZh,
          icon: level.icon,
          color: level.color,
          description: level.description,
          maxPersonalWorkspaces: level.maxPersonalWorkspaces,
          maxEnterpriseWorkspaces: level.maxEnterpriseWorkspaces,
          maxComponents: level.maxComponents,
          maxTeamSize: level.maxTeamSize,
          maxStorage: level.maxStorage,
          maxApiCalls: level.maxApiCalls,
          priceMonthly: level.priceMonthly,
          priceYearly: level.priceYearly,
          isActive: level.isActive,
          isPopular: level.isPopular,
          isRecommended: level.isRecommended,
          sortOrder: level.sortOrder,
          updatedAt: new Date(),
        },
        create: {
          id: level.id,
          name: level.name,
          nameZh: level.nameZh,
          icon: level.icon,
          color: level.color,
          description: level.description,
          maxPersonalWorkspaces: level.maxPersonalWorkspaces,
          maxEnterpriseWorkspaces: level.maxEnterpriseWorkspaces,
          maxComponents: level.maxComponents,
          maxTeamSize: level.maxTeamSize,
          maxStorage: level.maxStorage,
          maxApiCalls: level.maxApiCalls,
          priceMonthly: level.priceMonthly,
          priceYearly: level.priceYearly,
          isActive: level.isActive,
          isPopular: level.isPopular,
          isRecommended: level.isRecommended,
          sortOrder: level.sortOrder,
          updatedAt: new Date(),
        },
      });
      console.log(`  ✅ ${level.nameZh} (${level.name}): ${level.maxEnterpriseWorkspaces === BigInt(-1) ? '无限' : level.maxEnterpriseWorkspaces} 个企业空间，${level.priceMonthly}元/月`);
    }

    console.log('\n✅ 会员等级数据插入完成！');
  } catch (error) {
    console.error('❌ 会员等级数据插入失败:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
