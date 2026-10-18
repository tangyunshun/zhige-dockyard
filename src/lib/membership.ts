/**
 * 会员等级配置管理
 *
 * 说明：数据库 membershiplevel 表是会员等级的权威数据源；本文件仅作为数据库不可用时的
 * 兜底配置。数据库真实等级名为 PLATINUM（铂金版），历史代码层用 DIAMOND 命名，
 * 二者等价，getMembershipConfig 内部已做 PLATINUM -> DIAMOND 归一。
 */

export type MembershipLevel =
  | 'FREE'
  | 'BRONZE'
  | 'SILVER'
  | 'GOLD'
  | 'DIAMOND'
  | 'PLATINUM'
  | 'CROWN';

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
  // 每月 API 调用次数限制
  maxApiCalls: number;
  // 并发任务数上限（同一账号/空间同时运行的任务数）；-1 表示不限制
  maxConcurrency: number;
  // 单次上传文件大小上限（字节）；-1 表示不限制
  maxSingleFileBytes: number;
  // 可分配系统模型数量上限；-1 表示不限制
  maxModelAllocations: number;
  // 自建模型（BYO）数量上限；-1 表示不限制
  maxByoModels: number;
  // 功能特性列表
  features: string[];
  // 价格（月付/年付，单位：分）
  priceMonthly?: number;
  priceYearly?: number;
}

/**
 * 会员等级详细配置（兜底用，真实数据以数据库 membershiplevel 为准）
 */
export const MEMBERSHIP_CONFIGS: Record<MembershipLevel, MembershipConfig> = {
  FREE: {
    level: 'FREE',
    name: 'Free',
    nameZh: '免费版',
    icon: '🆓',
    color: '#94a3b8',
    maxTeamSize: 5,
    maxEnterpriseWorkspaces: 1,
    maxComponents: 100,
    maxStorage: 1024, // 1GB
    maxApiCalls: 1000,
    maxConcurrency: 1,
    maxSingleFileBytes: 10 * 1024 * 1024, // 10MB
    maxModelAllocations: 2,
    maxByoModels: 2,
    features: ['基础组件库访问权限', '社区支持服务', '基础文档教程', '1 个项目工作空间'],
    priceMonthly: 0,
    priceYearly: 0,
  },
  BRONZE: {
    level: 'BRONZE',
    name: 'Bronze',
    nameZh: '青铜版',
    icon: '🥉',
    color: '#cd7f32',
    maxTeamSize: 20,
    maxEnterpriseWorkspaces: 2,
    maxComponents: 300,
    maxStorage: 5120, // 5GB
    maxApiCalls: 5000,
    maxConcurrency: 2,
    maxSingleFileBytes: 20 * 1024 * 1024, // 20MB
    maxModelAllocations: 5,
    maxByoModels: 5,
    features: ['基础组件库访问权限', '优先邮件支持', '2 个项目工作空间', '基础数据分析报告'],
    priceMonthly: 99,
    priceYearly: 990,
  },
  SILVER: {
    level: 'SILVER',
    name: 'Silver',
    nameZh: '白银版',
    icon: '🥈',
    color: '#c0c0c0',
    maxTeamSize: 50,
    maxEnterpriseWorkspaces: 3,
    maxComponents: 500,
    maxStorage: 10240, // 10GB
    maxApiCalls: 10000,
    maxConcurrency: 3,
    maxSingleFileBytes: 50 * 1024 * 1024, // 50MB
    maxModelAllocations: 10,
    maxByoModels: 10,
    features: ['高级组件库访问权限', '优先邮件支持', '3 个项目工作空间', '基础数据分析报告', '团队协作功能'],
    priceMonthly: 199,
    priceYearly: 1990,
  },
  GOLD: {
    level: 'GOLD',
    name: 'Gold',
    nameZh: '黄金版',
    icon: '🥇',
    color: '#ffd700',
    maxTeamSize: 100,
    maxEnterpriseWorkspaces: 5,
    maxComponents: 1000,
    maxStorage: 51200, // 50GB
    maxApiCalls: 50000,
    maxConcurrency: 5,
    maxSingleFileBytes: 100 * 1024 * 1024, // 100MB
    maxModelAllocations: 20,
    maxByoModels: 20,
    features: [
      '高级组件库访问权限',
      '专属客户经理',
      '5 个项目工作空间',
      '高级定制报告生成',
      '专属技术支持团队',
      'API 优先级提升',
      '自定义品牌标识',
    ],
    priceMonthly: 399,
    priceYearly: 3990,
  },
  DIAMOND: {
    level: 'DIAMOND',
    name: 'Platinum',
    nameZh: '铂金版',
    icon: '💎',
    color: '#b9f2ff',
    maxTeamSize: 200,
    maxEnterpriseWorkspaces: 5,
    maxComponents: 5000,
    maxStorage: 102400, // 100GB
    maxApiCalls: 100000,
    maxConcurrency: 8,
    maxSingleFileBytes: 200 * 1024 * 1024, // 200MB
    maxModelAllocations: 40,
    maxByoModels: 40,
    features: [
      '全部 50+ 组件库访问',
      '7*24 专属客户经理',
      '5 个项目工作空间',
      '高级定制报告 + 咨询',
      '专属技术支持团队',
      '专属 API 通道',
      '自定义品牌标识 + 域名',
      '项目优先级调度',
    ],
    priceMonthly: 699,
    priceYearly: 6990,
  },
  PLATINUM: {
    level: 'PLATINUM',
    name: 'Platinum',
    nameZh: '铂金版',
    icon: '💎',
    color: '#b9f2ff',
    maxTeamSize: 200,
    maxEnterpriseWorkspaces: 5,
    maxComponents: 5000,
    maxStorage: 102400, // 100GB
    maxApiCalls: 100000,
    maxConcurrency: 8,
    maxSingleFileBytes: 200 * 1024 * 1024, // 200MB
    maxModelAllocations: 40,
    maxByoModels: 40,
    features: [
      '全部 50+ 组件库访问',
      '7*24 专属客户经理',
      '5 个项目工作空间',
      '高级定制报告 + 咨询',
      '专属技术支持团队',
      '专属 API 通道',
      '自定义品牌标识 + 域名',
      '项目优先级调度',
    ],
    priceMonthly: 699,
    priceYearly: 6990,
  },
  CROWN: {
    level: 'CROWN',
    name: 'Crown',
    nameZh: '皇冠版',
    icon: '👑',
    color: '#f59e0b',
    maxTeamSize: -1, // 无限制
    maxEnterpriseWorkspaces: -1, // 无限制
    maxComponents: -1, // 无限制
    maxStorage: -1, // 无限制
    maxApiCalls: -1, // 无限制
    maxConcurrency: -1, // 无限制
    maxSingleFileBytes: -1, // 无限制
    maxModelAllocations: -1, // 无限制
    maxByoModels: -1, // 无限制
    features: [
      '全部组件无限使用',
      '无限项目工作空间',
      '无限存储空间',
      '无限组件调用',
      '无限 API 调用',
      '7*24 专属客户经理',
      'SLA 服务保障',
      '专属客户成功经理',
      '定期产品培训',
      '项目优先级调度',
    ],
    priceMonthly: 1999,
    priceYearly: 19990,
  },
};

/** 数据库真实等级名 PLATINUM 与历史代码层 DIAMOND 等价，统一归一 */
const LEVEL_ALIAS: Partial<Record<MembershipLevel, MembershipLevel>> = {
  PLATINUM: 'DIAMOND',
};

/**
 * 获取会员等级配置（兜底用；数据库不可用时使用，真实权限以数据库为准）
 */
export function getMembershipConfig(level: MembershipLevel): MembershipConfig {
  const normalized = LEVEL_ALIAS[level] ?? level;
  return MEMBERSHIP_CONFIGS[normalized] || MEMBERSHIP_CONFIGS.FREE;
}

/**
 * 团队规模选项
 */
export const TEAM_SIZE_OPTIONS = [
  { value: '1-5', label: '1-5 人团队', minLevel: 'FREE' },
  { value: '6-20', label: '6-20 人团队', minLevel: 'BRONZE' },
  { value: '21-50', label: '21-50 人团队', minLevel: 'SILVER' },
  { value: '51-100', label: '51-100 人团队', minLevel: 'GOLD' },
  { value: '101-200', label: '101-200 人团队', minLevel: 'PLATINUM' },
  { value: '200+', label: '200 人以上团队', minLevel: 'CROWN' },
] as const;

/**
 * 根据会员等级获取可用团队规模选项
 */
export function getAvailableTeamSizeOptions(level: MembershipLevel) {
  const config = getMembershipConfig(level);
  return TEAM_SIZE_OPTIONS.filter((option) => {
    const minLevel = option.minLevel as MembershipLevel;
    const minLevelIndex = getMembershipLevelIndex(minLevel);
    const userLevelIndex = getMembershipLevelIndex(level);
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

  // 解析团队规模范围
  const sizeRange = teamSize.split('-');
  const maxSize = parseInt(sizeRange[sizeRange.length - 1]) || 0;

  return maxSize > maxTeamSize;
}

/**
 * 获取会员等级索引
 */
export function getMembershipLevelIndex(level: MembershipLevel): number {
  return ['FREE', 'BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'PLATINUM', 'CROWN'].indexOf(level);
}

/**
 * 检查是否拥有指定会员等级或更高等级
 */
export function hasMembershipLevel(currentLevel: MembershipLevel, requiredLevel: MembershipLevel): boolean {
  return getMembershipLevelIndex(currentLevel) >= getMembershipLevelIndex(requiredLevel);
}
