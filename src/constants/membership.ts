export interface MembershipLevel {
  id: string;
  name: string;
  displayName: string;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  features: { text: string; included: boolean }[];
  popular?: boolean;
  buttonText?: string;
}

export const MEMBERSHIP_LEVELS: MembershipLevel[] = [
  {
    id: "FREE",
    name: "FREE",
    displayName: "社区尝鲜版",
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: "个人沙盒、基础组件、有限算力",
    features: [
      { text: "1 个个人空间", included: true },
      { text: "基础组件访问", included: true },
      { text: "每月 1000 Token 配额", included: true },
      { text: "社区技术支持", included: true },
      { text: "企业空间创建", included: false },
      { text: "团队协作功能", included: false },
      { text: "高级组件解锁", included: false },
      { text: "私有化部署", included: false },
    ],
    buttonText: "免费注册",
  },
  {
    id: "BRONZE",
    name: "BRONZE",
    displayName: "青铜会员",
    monthlyPrice: 99,
    yearlyPrice: 79,
    description: "基础企业功能、标准组件访问",
    features: [
      { text: "3 个企业空间", included: true },
      { text: "标准组件访问", included: true },
      { text: "每月 10000 Token 配额", included: true },
      { text: "邮件技术支持", included: true },
      { text: "团队协作功能", included: false },
      { text: "岗位权限配置", included: false },
      { text: "私有化部署", included: false },
      { text: "专属服务", included: false },
    ],
    buttonText: "立即升级",
  },
  {
    id: "SILVER",
    name: "SILVER",
    displayName: "岗位专业版",
    monthlyPrice: 299,
    yearlyPrice: 239,
    description: "3个企业空间、解锁高阶组件、团队协同",
    features: [
      { text: "3 个企业空间", included: true },
      { text: "全部 53 个组件", included: true },
      { text: "每月 100000 Token 配额", included: true },
      { text: "优先技术支持", included: true },
      { text: "团队协作功能", included: true },
      { text: "岗位权限配置", included: true },
      { text: "私有化部署", included: false },
      { text: "专属服务", included: false },
    ],
    popular: true,
    buttonText: "立即升级",
  },
  {
    id: "GOLD",
    name: "GOLD",
    displayName: "黄金会员",
    monthlyPrice: 999,
    yearlyPrice: 799,
    description: "无限企业空间、高级支持、专属资源",
    features: [
      { text: "无限企业空间", included: true },
      { text: "全部 53 个组件", included: true },
      { text: "每月 500000 Token 配额", included: true },
      { text: "专属客户经理", included: true },
      { text: "团队协作功能", included: true },
      { text: "高级权限配置", included: true },
      { text: "私有化部署", included: false },
      { text: "专属服务", included: true },
    ],
    buttonText: "立即升级",
  },
  {
    id: "DIAMOND",
    name: "DIAMOND",
    displayName: "钻石会员",
    monthlyPrice: 2999,
    yearlyPrice: 2399,
    description: "私有化部署准备、高级安全功能",
    features: [
      { text: "无限企业空间", included: true },
      { text: "全部 53 个组件", included: true },
      { text: "无限 Token 配额", included: true },
      { text: "7x24 专属支持", included: true },
      { text: "团队协作功能", included: true },
      { text: "高级权限配置", included: true },
      { text: "私有化部署准备", included: true },
      { text: "源码级二开支持", included: true },
    ],
    buttonText: "立即升级",
  },
  {
    id: "CROWN",
    name: "CROWN",
    displayName: "私有化尊享版",
    monthlyPrice: 12500,
    yearlyPrice: 12500,
    description: "物理隔离部署、源码级二开支持、专属服务",
    features: [
      { text: "无限企业空间", included: true },
      { text: "全部 53 个组件", included: true },
      { text: "无限 Token 配额", included: true },
      { text: "7x24 专属支持", included: true },
      { text: "私有化部署", included: true },
      { text: "源码级二开支持", included: true },
      { text: "专属服务", included: true },
      { text: "定制化开发", included: true },
    ],
    buttonText: "联系售前专家",
  },
];

export const getMembershipById = (id: string): MembershipLevel | undefined => {
  return MEMBERSHIP_LEVELS.find((level) => level.id === id);
};

export const getMembershipByName = (name: string): MembershipLevel | undefined => {
  return MEMBERSHIP_LEVELS.find((level) => level.name.toUpperCase() === name.toUpperCase());
};

export const getDisplayPrice = (level: MembershipLevel, isYearly: boolean): string => {
  const price = isYearly ? level.yearlyPrice : level.monthlyPrice;
  if (price === 0) return "免费";
  return `¥${price}`;
};