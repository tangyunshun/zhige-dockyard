/**
 * 会员等级体系配置
 * 
 * 定义不同会员等级的权限和限制
 */

export type MembershipLevel = 'FREE' | 'BRONZE' | 'SILVER' | 'GOLD' | 'DIAMOND' | 'CROWN';

export interface MembershipConfig {
  level: MembershipLevel;
  name: string;
  nameZh: string;
  icon: string;
  color: string;
  // 团队规模限制
  maxTeamSize: number; // -1 表示无限制
  // 企业空间数量限制
  maxEnterpriseWorkspaces: number;
  // 组件数量限制
  maxComponents: number;
  // 存储空间限制 (MB)
  maxStorage: number;
  // 每月 API 调用次数
  maxApiCalls: number;
  // 功能特性
  features: string[];
  // 价格（月付/年付）
  priceMonthly?: number;
  priceYearly?: number;
}

/**
 * 会员等级配置表
 */
export const MEMBERSHIP_CONFIGS: Record<MembershipLevel, MembershipConfig> = {
  FREE: {
    level: 'FREE',
    name: 'Free',
    nameZh: '免费版',
    icon: '👤',
    color: '#94a3b8',
    maxTeamSize: 5,
    maxEnterpriseWorkspaces: 1,
    maxComponents: 100,
    maxStorage: 1024, // 1GB
    maxApiCalls: 1000,
    features: [
      '基础组件库访问',
      '标准技术支持',
      '社区论坛支持',
      '1 个企业空间',
    ],
    priceMonthly: 0,
    priceYearly: 0,
  },
  BRONZE: {
    level: 'BRONZE',
    name: 'Bronze',
    nameZh: '青铜会员',
    icon: '🥉',
    color: '#cd7f32',
    maxTeamSize: 20,
    maxEnterpriseWorkspaces: 2,
    maxComponents: 300,
    maxStorage: 5120, // 5GB
    maxApiCalls: 5000,
    features: [
      '基础组件库访问',
      '优先技术支持',
      '2 个企业空间',
      '数据分析基础版',
    ],
    priceMonthly: 99,
    priceYearly: 990,
  },
  SILVER: {
    level: 'SILVER',
    name: 'Silver',
    nameZh: '白银会员',
    icon: '🥈',
    color: '#c0c0c0',
    maxTeamSize: 50,
    maxEnterpriseWorkspaces: 3,
    maxComponents: 500,
    maxStorage: 10240, // 10GB
    maxApiCalls: 10000,
    features: [
      '全量组件库访问',
      '优先技术支持',
      '3 个企业空间',
      '数据分析报表',
      '自定义主题',
    ],
    priceMonthly: 199,
    priceYearly: 1990,
  },
  GOLD: {
    level: 'GOLD',
    name: 'Gold',
    nameZh: '黄金会员',
    icon: '🥇',
    color: '#ffd700',
    maxTeamSize: 100,
    maxEnterpriseWorkspaces: 5,
    maxComponents: 1000,
    maxStorage: 51200, // 50GB
    maxApiCalls: 50000,
    features: [
      '全量组件库访问',
      '专属技术支持',
      '5 个企业空间',
      '高级数据分析',
      '完全自定义主题',
      'API 访问权限',
      '团队协作工具',
    ],
    priceMonthly: 399,
    priceYearly: 3990,
  },
  DIAMOND: {
    level: 'DIAMOND',
    name: 'Diamond',
    nameZh: '钻石会员',
    icon: '💎',
    color: '#b9f2ff',
    maxTeamSize: 200,
    maxEnterpriseWorkspaces: 5,
    maxComponents: 5000,
    maxStorage: 102400, // 100GB
    maxApiCalls: 100000,
    features: [
      '全量 + 专属组件库',
      '7×24 专属技术支持',
      '5 个企业空间',
      '高级数据分析 + 导出',
      '完全自定义主题',
      '完整 API 权限',
      '高级团队协作工具',
      '专属客户经理',
    ],
    priceMonthly: 699,
    priceYearly: 6990,
  },
  CROWN: {
    level: 'CROWN',
    name: 'Crown',
    nameZh: '皇冠会员',
    icon: '👑',
    color: '#f59e0b',
    maxTeamSize: -1, // 无限制
    maxEnterpriseWorkspaces: -1, // 无限制
    maxComponents: -1, // 无限制
    maxStorage: -1, // 无限制
    maxApiCalls: -1, // 无限制
    features: [
      '所有功能权限',
      '无限企业空间',
      '无限团队成员',
      '无限组件数量',
      '无限存储空间',
      '7×24 专属技术支持',
      'SLA 服务保障',
      '私有化部署支持',
      '定制开发服务',
      '专属客户经理',
    ],
    priceMonthly: 1999,
    priceYearly: 19990,
  },
};

/**
 * 获取会员等级配置
 */
export function getMembershipConfig(level: MembershipLevel): MembershipConfig {
  return MEMBERSHIP_CONFIGS[level] || MEMBERSHIP_CONFIGS.FREE;
}

/**
 * 获取团队规模选项
 */
export const TEAM_SIZE_OPTIONS = [
  { value: '1-5', label: '1-5 人（初创团队）', minLevel: 'FREE' },
  { value: '6-20', label: '6-20 人（小型团队）', minLevel: 'BRONZE' },
  { value: '21-50', label: '21-50 人（中型团队）', minLevel: 'SILVER' },
  { value: '51-100', label: '51-100 人（大型团队）', minLevel: 'GOLD' },
  { value: '101-200', label: '101-200 人（超大型团队）', minLevel: 'DIAMOND' },
  { value: '200+', label: '200 人以上（企业级）', minLevel: 'CROWN' },
] as const;

/**
 * 根据会员等级获取可用的团队规模选项
 */
export function getAvailableTeamSizeOptions(level: MembershipLevel) {
  const config = getMembershipConfig(level);
  return TEAM_SIZE_OPTIONS.filter((option) => {
    const minLevel = option.minLevel as MembershipLevel;
    const minLevelIndex = ['FREE', 'BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'CROWN'].indexOf(minLevel);
    const userLevelIndex = ['FREE', 'BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'CROWN'].indexOf(level);
    return userLevelIndex >= minLevelIndex;
  });
}

/**
 * 格式化团队规模显示
 */
export function formatTeamSize(teamSize: string): string {
  const option = TEAM_SIZE_OPTIONS.find((opt) => opt.value === teamSize);
  return option ? option.label : teamSize;
}

/**
 * 检查团队规模是否超出会员等级限制
 */
export function isTeamSizeExceeded(teamSize: string, level: MembershipLevel): boolean {
  const config = getMembershipConfig(level);
  const maxTeamSize = config.maxTeamSize;
  
  if (maxTeamSize === -1) return false; // 无限制
  
  // 解析团队规模
  const sizeRange = teamSize.split('-');
  const maxSize = parseInt(sizeRange[sizeRange.length - 1]) || 0;
  
  return maxSize > maxTeamSize;
}

/**
 * 获取会员等级顺序索引
 */
export function getMembershipLevelIndex(level: MembershipLevel): number {
  return ['FREE', 'BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'CROWN'].indexOf(level);
}

/**
 * 检查会员等级是否满足要求
 */
export function hasMembershipLevel(currentLevel: MembershipLevel, requiredLevel: MembershipLevel): boolean {
  return getMembershipLevelIndex(currentLevel) >= getMembershipLevelIndex(requiredLevel);
}
