/**
 * 操作日志「合规删除保护名单」——全站唯一权威来源。
 *
 * 命中以下关键字的审计日志属于安全/合规溯源记录（登录、密码、支付、退款、
 * 转让、注销、踢出、二次验证等），任何角色（当事人、空间所有者/管理员、
 * 平台管理员）都不得擅自删除，否则审计溯源链会断裂。
 *
 * 个人中心删除接口、工作台空间日志删除接口统一引用本模块，避免两套正则漂移。
 */
export const PROTECTED_ACTION_PATTERN =
  /password|login|logout|pay|recharge|refund|transfer|deletion|delete[-_ ]?account|kick|stepup|verify/i;

/** 判断某条操作日志是否为受保护的合规记录（不可删除）。 */
export function isProtectedActivity(action?: string | null): boolean {
  return !!action && PROTECTED_ACTION_PATTERN.test(action);
}
