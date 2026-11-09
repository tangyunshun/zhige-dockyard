export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { verifyNotify, NOTIFY_RESPONSE } from "@/lib/payment/wechatpay";
import { fulfillPaidOrder } from "@/lib/payment/fulfill";

/**
 * POST /api/payments/notify/wechat —— 微信支付异步回调（唯一在真实微信模式下产生入账动作的地方）
 *
 * 安全链路：平台证书验签 → AES-256-GCM 解密资源 → 状态机入账（幂等）→ 规范应答。
 * - 验签失败一律 401 + code=FAIL（微信将重试/停发）；
 * - SUCCESS 才入账；其他 trade_state（CLOSED/PAYERROR 等）仅确认不处理；
 * - 金额与订单不一致直接拒绝（防篡改）；
 * - 该接口不接受任何登录态：回调方是微信支付服务器。
 */
export async function POST(request: NextRequest) {
  let rawBody = "";
  try {
    rawBody = await request.text();
    const result = await verifyNotify(
      {
        timestamp: request.headers.get("wechatpay-timestamp") || undefined,
        nonce: request.headers.get("wechatpay-nonce") || undefined,
        signature: request.headers.get("wechatpay-signature") || undefined,
        serial: request.headers.get("wechatpay-serial") || undefined,
      },
      rawBody,
    );
    if (!result.ok || !result.resource) {
      console.warn("[wxpay-notify] 验签失败:", result.error);
      return NextResponse.json({ code: "FAIL", message: result.error || "验签失败" }, { status: 401 });
    }

    const { out_trade_no, trade_state, transaction_id, amount } = result.resource;
    if (trade_state !== "SUCCESS") {
      // 非成功状态（CLOSED / NOTPAY / PAYERROR）：确认收到，不做任何入账动作
      console.log(`[wxpay-notify] 订单 ${out_trade_no} 状态 ${trade_state}，无需入账`);
      return NextResponse.json(NOTIFY_RESPONSE.success);
    }

    const fulfillment = await fulfillPaidOrder({
      orderNo: out_trade_no,
      paymentMethod: "WECHAT_PAY",
      paymentMode: "REAL",
      remark: "微信支付入账（Native 扫码，回调验签通过）",
      gatewayTransactionId: transaction_id ?? null,
      gatewayAmountCents: amount?.total ?? null,
    });

    if (!fulfillment.ok) {
      // 入账失败：返回 FAIL 让微信按策略重试（幂等保证重试安全）
      console.error(`[wxpay-notify] 订单 ${out_trade_no} 入账失败: ${fulfillment.error}`);
      return NextResponse.json({ code: "FAIL", message: fulfillment.error || "入账失败" }, { status: 500 });
    }

    console.log(`[wxpay-notify] 订单 ${out_trade_no} 入账完成（${fulfillment.status}）`);
    return NextResponse.json(NOTIFY_RESPONSE.success);
  } catch (error) {
    console.error("[wxpay-notify] 处理异常:", (error as Error)?.message);
    return NextResponse.json({ code: "FAIL", message: "处理异常" }, { status: 500 });
  }
}
