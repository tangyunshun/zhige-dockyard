/**
 * 注册福利配置（后台可配，systemconfig 标量键值对）。
 *
 * 独立成文件的原因：credit-service 与 notifications-store、points-notifications
 * 都需要读取该配置，若放在 credit-service 会形成循环依赖。
 * 管理员在「平台默认配置」后台页调整，无需改代码；未配置时回退历史口径。
 */
import { prisma } from "@/lib/prisma";

/** 新用户注册福利：每月赠送算力点数（后台未配置时的默认值） */
export const NEW_USER_GIFT_POINTS = 100;
/** 注册福利发放月数：注册当月起连续 3 个自然月（后台未配置时的默认值） */
export const REGISTER_GIFT_MONTHS = 3;

/** 注册福利后台配置键（systemconfig） */
export const REGISTER_GIFT_KEYS = {
  enabled: "platform.registerGift.enabled",
  points: "platform.registerGift.points",
  months: "platform.registerGift.months",
  clearOnMonthEnd: "platform.registerGift.clearOnMonthEnd",
} as const;

export interface RegisterGiftConfig {
  /** 是否启用注册福利 */
  enabled: boolean;
  /** 每月赠送点数 */
  points: number;
  /** 注册当月起连续赠送的自然月数（1–36） */
  months: number;
  /** 每笔是否当月有效月底清零；false = 发放后长期有效不清零 */
  clearOnMonthEnd: boolean;
}

/** 读取注册福利配置（未配置回退默认：开启 / 100 点 / 3 个月 / 月底清零） */
export async function loadRegisterGiftConfig(): Promise<RegisterGiftConfig> {
  const rows = await prisma.systemconfig.findMany({
    where: { key: { in: Object.values(REGISTER_GIFT_KEYS) } },
  });
  const map = new Map(rows.map((r) => [r.key, r.value]));

  const enabledRaw = map.get(REGISTER_GIFT_KEYS.enabled);
  const clearRaw = map.get(REGISTER_GIFT_KEYS.clearOnMonthEnd);
  const points = Number(map.get(REGISTER_GIFT_KEYS.points));
  const months = Number(map.get(REGISTER_GIFT_KEYS.months));

  return {
    enabled: enabledRaw == null ? true : enabledRaw === "true" || enabledRaw === "1",
    points: Number.isFinite(points) && points > 0 ? Math.floor(points) : NEW_USER_GIFT_POINTS,
    months:
      Number.isFinite(months) && months >= 1
        ? Math.min(Math.floor(months), 36)
        : REGISTER_GIFT_MONTHS,
    clearOnMonthEnd: clearRaw == null ? true : clearRaw === "true" || clearRaw === "1",
  };
}

/** 注册福利规则的统一文案（欢迎通知等处复用，保证与实际配置一致） */
export function buildRegisterGiftRuleText(config: RegisterGiftConfig): string {
  return `注册当月起连续 ${config.months} 个月每月 ${config.points} 算力点（${
    config.clearOnMonthEnd ? "当月有效、月底清零" : "长期有效不清零"
  }，仅限个人空间使用）。赠送期结束后如需更多算力，请前往充值中心自助充值。`;
}
