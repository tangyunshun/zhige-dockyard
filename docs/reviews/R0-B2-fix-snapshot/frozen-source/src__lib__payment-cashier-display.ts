/**
 * [R0-B1 F4] 收银台展示契约：模拟收银台与真实扫码收银台共用的
 * 订单状态 / 商品类型展示规则（实际生产函数，页面直接导入使用）。
 *
 * 规则：
 *  - 仅明确 SUCCESS 视为完成；EXPIRED/FAILED/REFUNDED/未知分别诚实呈现，不泛称成功；
 *  - 按订单 type 区分席位 / 算力充值 / 套餐开通：席位成功不显示"算力到账"、不引导点数流水；
 *  - 未知类型用中性文案，不猜测权益；
 *  - 付款已发生但履约未确认的提示引导查询/客服核实，不提示自动重新购买。
 */

export interface CashierStatusView {
  kind: "success" | "pending" | "expired" | "failed" | "refunded" | "unknown";
  /** 状态行短文案 */
  statusLabel: string;
  /** 非完成状态的结果区主文案 */
  resultMessage: string;
  tone: "success" | "warning" | "error" | "neutral";
  /** 是否"明确成功"（仅 SUCCESS） */
  isCompleted: boolean;
}

export function resolveCashierStatusView(status?: string | null): CashierStatusView {
  switch (status) {
    case "SUCCESS":
      return {
        kind: "success",
        statusLabel: "已支付并入账",
        resultMessage: "支付成功",
        tone: "success",
        isCompleted: true,
      };
    case "PENDING":
      return { kind: "pending", statusLabel: "等待支付", resultMessage: "", tone: "warning", isCompleted: false };
    case "EXPIRED":
      return {
        kind: "expired",
        statusLabel: "已超时关闭",
        resultMessage: "订单已超时关闭，未完成支付；如已付款请凭订单号联系客服核实，请勿重复支付",
        tone: "warning",
        isCompleted: false,
      };
    case "FAILED":
      return {
        kind: "failed",
        statusLabel: "支付失败",
        resultMessage: "订单支付失败，未完成入账；如已扣款请凭订单号联系客服核实，请勿重复支付",
        tone: "error",
        isCompleted: false,
      };
    case "REFUNDED":
      return {
        kind: "refunded",
        statusLabel: "已退款",
        resultMessage: "订单已退款，对应权益未生效；如有疑问请凭订单号联系客服",
        tone: "error",
        isCompleted: false,
      };
    default:
      return {
        kind: "unknown",
        statusLabel: `状态未知（${status || "未知"}）`,
        resultMessage: "订单状态未知，请刷新页面或凭订单号联系客服核实，请勿重复支付",
        tone: "neutral",
        isCompleted: false,
      };
  }
}

export interface CashierSuccessView {
  /** 完成主文案（按商品类型区分，不泛称"算力到账"） */
  message: string;
  /** 引导入口（按商品类型对应的空间/账务入口） */
  entries: { label: string; href: string }[];
}

export function resolveCashierSuccessView(type?: string | null, seats = 0): CashierSuccessView {
  switch (type) {
    case "SEAT_ADDON":
      return {
        message: seats > 0 ? `支付成功，已为空间增购 ${seats} 个席位` : "支付成功，席位已到账",
        entries: [
          { label: "返回空间工作台", href: "/workspace-hub" },
          { label: "查看算力账单", href: "/user/billing-center" },
        ],
      };
    case "TOKEN_RECHARGE":
      return {
        message: "支付成功，算力已到账",
        entries: [
          { label: "查看点数流水", href: "/user/points" },
          { label: "查看算力账单", href: "/user/billing-center" },
        ],
      };
    case "PLAN_UPGRADE":
      return {
        message: "支付成功，企业空间已开通",
        entries: [{ label: "前往工作台", href: "/workspace-hub" }],
      };
    default:
      return {
        message: "支付成功",
        entries: [{ label: "查看账单记录", href: "/user/billing-center" }],
      };
  }
}

/** 扫码页二维码可用性：仅 PENDING 且有载体时可展示；缺载体 → 明确报错而非无限加载 */
export function isQrReady(order: { status?: string | null; codeUrl?: string | null }): boolean {
  return order.status === "PENDING" && typeof order.codeUrl === "string" && !!order.codeUrl;
}

/**
 * [R0-B2-3] 收银台「是否已完成 + 完成结果」的单一事实来源：以订单业务状态（SUCCESS）而非颜色
 * tone 决定完成分支；避免重复确认（alreadyProcessed）被中性提示误判为非完成区。页面与测试共用，
 * 保证渲染决策与展示契约同源。完成态返回按商品类型的完成文案与入口；非完成态返回空，由状态视图提供终态文案。
 */
export interface CashierCompletion {
  /** 订单是否已明确完成（SUCCESS）。完成态下一律展示完成结果 + 正确入口 */
  completed: boolean;
  /** 完成主文案（按商品类型区分，不泛称"算力到账"） */
  message: string;
  /** 引导入口（按商品类型对应的空间/账务入口） */
  entries: { label: string; href: string }[];
}

export function resolveCashierCompletion(
  type?: string | null,
  seats?: number,
  status?: string | null,
): CashierCompletion {
  const view = resolveCashierStatusView(status);
  if (!view.isCompleted) return { completed: false, message: "", entries: [] };
  const sv = resolveCashierSuccessView(type, seats ?? 0);
  return { completed: true, message: sv.message, entries: sv.entries };
}

/**
 * [R0-B2-3] 确认响应是否构成「业务上明确成功」：不能把任意 HTTP 2xx 当成功。
 * 必须 success=true 且携带完成证据之一：已处理标记、席位数、点数额或新空间 ID。
 * 2xx 但 success:false / 缺完成证据 → false，页面保留原订单状态并提示核实，不伪装完成。
 * 页面 pay() 与隔离测试共用此真实判定，测试直接以真实 mock/confirm 响应执行。
 */
export function isConfirmedSuccessResponse(res: any): boolean {
  if (!res || res.success !== true) return false;
  return (
    res.alreadyProcessed === true ||
    typeof res.seats === "number" ||
    typeof res.points === "number" ||
    (typeof res.workspaceId === "string" && res.workspaceId.length > 0)
  );
}
