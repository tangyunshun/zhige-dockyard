/**
 * 会员等级模型
 * 说明：会员等级数据（名称/价格/描述/特性/配额）全部保存在数据库 membershiplevel 表，
 * 由 /api/membership/levels 统一提供，代码中不再硬编码任何等级数据。
 * 本文件仅保留 TypeScript 类型定义。
 */

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
