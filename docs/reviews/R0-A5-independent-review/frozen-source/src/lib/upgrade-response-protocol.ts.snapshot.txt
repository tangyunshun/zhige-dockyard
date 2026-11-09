/**
 * [R0-A5 E5] 升级响应协议统一判定。
 *
 * 三个升级入口（独立升级页 / studio 弹窗 / 空间中枢弹窗）共用同一套「先验证业务成功，
 * 再处理支付地址/免费完成」的判定规则，禁止各入口手写副本漂移：
 *  1. 先验证 success === true，再处理 payUrl / free —— success:false 携带 payUrl 不得跳转收银台；
 *  2. free:true 必须携带 workspaceId，否则视为协议不完整，不得当已开通；
 *  3. success:true 但既无 payUrl 也非 free → 待处理，不写开通标记、不触发完成回调；
 *  4. HTTP 非 2xx / 网络异常由调用方转成 null 传入，同样返回 failed。
 */
export type UpgradeResponseAction =
  | { kind: "pay_redirect"; payUrl: string; notice?: string }
  | { kind: "free_success"; message: string; workspaceId: string }
  | { kind: "pending"; message: string }
  | { kind: "failed"; message: string };

export function resolveUpgradeResponse(
  result: Record<string, unknown> | null | undefined,
): UpgradeResponseAction {
  if (!result || typeof result !== "object") {
    return { kind: "failed", message: "升级响应格式异常，请稍后重试" };
  }
  const r = result as Record<string, unknown>;
  const msgOf = (fallback: string) =>
    typeof r.message === "string" && r.message ? r.message : fallback;
  // 规则 1：业务成功先于支付地址
  if (r.success !== true) {
    return { kind: "failed", message: msgOf("升级处理异常，请稍后重试") };
  }
  // 规则 2：免费完成必须有开通证据（workspaceId）
  if (r.free === true) {
    if (typeof r.workspaceId !== "string" || !r.workspaceId) {
      return { kind: "failed", message: "升级响应缺少工作空间信息，请稍后重试" };
    }
    return { kind: "free_success", message: msgOf("升级成功！"), workspaceId: r.workspaceId };
  }
  // 规则 3：合法待支付（仅 success:true 才会走到这里）
  if (typeof r.payUrl === "string" && r.payUrl) {
    return {
      kind: "pay_redirect",
      payUrl: r.payUrl,
      notice: typeof r.notice === "string" ? r.notice : undefined,
    };
  }
  return { kind: "pending", message: msgOf("升级处理中，请稍后查看") };
}
