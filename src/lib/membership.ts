﻿﻿﻿﻿﻿/**
 * 会员等级配置管理
 * 
 * 定义平台会员等级及对应权益
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
  // 每月 API 调用次数限制
  maxApiCalls: number;
  // 功能特性列表
  features: string[];
  // 价格（月付/年付）
  priceMonthly?: number;
  priceYearly?: number;
}

/**
 * 会员等级详细配置
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
    features: [
      '基础组件库访问权限',
      '社区支持服务',
      '基础文档教程',
      '1 个项目工作空间',
    ],
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
    features: [
      '基础组件库访问权限',
      '优先邮件支持',
      '2 个项目工作空间',
      '基础数据分析报告',
    ],
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
    features: [
      '高级组件库访问权限',
      '优先邮件支持',
      '3 个项目工作空间',
      '基础数据分析报告',
      '团队协作功能',
    ],
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
    name: 'Diamond',
    nameZh: '钻石版',
    icon: '💎',
    color: '#b9f2ff',
    maxTeamSize: 200,
    maxEnterpriseWorkspaces: 5,
    maxComponents: 5000,
    maxStorage: 102400, // 100GB
    maxApiCalls: 100000,
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

/**
 * 获取会员等级配置
 */
export function getMembershipConfig(level: MembershipLevel): MembershipConfig {
  return MEMBERSHIP_CONFIGS[level] || MEMBERSHIP_CONFIGS.FREE;
}

/**
 * 团队规模选项
 */
export const TEAM_SIZE_OPTIONS = [
  { value: '1-5', label: '1-5 人团队', minLevel: 'FREE' },
  { value: '6-20', label: '6-20 人团队', minLevel: 'BRONZE' },
  { value: '21-50', label: '21-50 人团队', minLevel: 'SILVER' },
  { value: '51-100', label: '51-100 人团队', minLevel: 'GOLD' },
  { value: '101-200', label: '101-200 人团队', minLevel: 'DIAMOND' },
  { value: '200+', label: '200 人以上团队', minLevel: 'CROWN' },
] as const;

/**
 * 根据会员等级获取可用团队规模选项
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
  
  // 解析团队规模范围
  const sizeRange = teamSize.split('-');
  const maxSize = parseInt(sizeRange[sizeRange.length - 1]) || 0;
  
  return maxSize > maxTeamSize;
}

/**
 * 获取会员等级索引
 */
export function getMembershipLevelIndex(level: MembershipLevel): number {
  return ['FREE', 'BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'CROWN'].indexOf(level);
}

/**
 * 检查是否拥有指定会员等级或更高等级
 */
export function hasMembershipLevel(currentLevel: MembershipLevel, requiredLevel: MembershipLevel): boolean {
  return getMembershipLevelIndex(currentLevel) >= getMembershipLevelIndex(requiredLevel);
}
