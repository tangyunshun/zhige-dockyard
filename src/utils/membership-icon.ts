import { Crown, Gem, Award, Star, ShieldCheck, type LucideIcon } from "lucide-react";

/**
 * 会员等级与商务图标的映射关系。
 * 统一使用标准线性商务图标（lucide），不使用 emoji 表情符号，
 * 保证会员等级在价格方案、套餐与计费中心、账户状态条等各处视觉一致。
 */
const MEMBERSHIP_LEVEL_ICONS: Record<string, LucideIcon> = {
  CROWN: Crown,
  DIAMOND: Gem,
  GOLD: Award,
  SILVER: Star,
  BRONZE: Star,
  FREE: ShieldCheck,
};

/** 按会员等级标识获取对应的商务图标组件，未知等级回退为盾牌图标 */
export function getMembershipLevelIcon(levelName?: string | null): LucideIcon {
  if (!levelName) return ShieldCheck;
  return MEMBERSHIP_LEVEL_ICONS[String(levelName).toUpperCase()] || ShieldCheck;
}
