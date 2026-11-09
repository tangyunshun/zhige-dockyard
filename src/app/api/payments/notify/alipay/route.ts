export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { verifyNotify } from "@/lib/payment/alipay";
import { fulfillPaidOrder } from "@/lib/payment/fulfill";
import { parseYuanToCents } from "@/lib/payment/receipt";

/**
 * POST /api/payments/notify/alipay —— 支付宝异步通知（唯一在真实支付宝模式下产生入账动作的地方）
 *
 * 安全链路：RSA2 验签（支付宝公钥）→ app_id 核对 → 金额核对 → 状态机入账（幂等）。
 * - 验签失败 401；trade_status 需为 TRADE_SUCCESS / TRADE_FINISHED 才入账；
 * - 应答规范：成功输出纯文本 "success"，失败输出 "fail"（支付宝将重试）。
 */
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let form: Record<string, string> = {};
    if (contentType.includes("application/json")) {
      form = (await request.json().catch(() => ({}))) as Record<string, string>;
    } else {
      const text = await request.text();
      for (const pair of text.split("&")) {
        const idx = pair.indexOf("=");
        if (idx > 0) {
          const k = pair.slice(0, idx);
          const v = pair.slice(idx + 1);
          try {
            form[k] = decodeURIComponent(v.replace(/\+/g, " "));
          } catch {
            form[k] = v;
          }
        }
      }
    }

    const verified = await verifyNotify(form);
    if (!verified.ok) {
      console.warn("[alipay-notify] 验签失败:", verified.error);
      return new NextResponse("fail", { status: 401 });
    }

    const { outTradeNo, tradeStatus, totalAmount, tradeNo, appId } = verified;
    if (tradeStatus !== "TRADE_SUCCESS" && tradeStatus !== "TRADE_FINISHED") {
      console.log(`[alipay-notify] 订单 ${outTradeNo} 状态 ${tradeStatus}，无需入账`);
      return new NextResponse("success");
    }

    // [R1/U04] 收款事实必需字段：网关交易号 trade_no 必须存在并透传履约层用于幂等与对账。
    // 金额（元 → 分）按协议精度严格解析：10.004 这类多余精度、指数、NaN、Infinity、
    // 负数、超安全范围一律拒绝，禁止 Math.round 把非法值四舍五入成合法金额。
    const gatewayTransactionId = tradeNo ?? null;
    const gatewayAmountCents = parseYuanToCents(totalAmount);
    if (!outTradeNo || !gatewayTransactionId || gatewayAmountCents == null) {
      console.warn(
        `[alipay-notify] 收款事实不完整或金额非法（outTradeNo=${outTradeNo}, tradeNo=${gatewayTransactionId}, amount=${gatewayAmountCents}），拒绝入账`,
      );
      return new NextResponse("fail", { status: 400 });
    }

    const fulfillment = await fulfillPaidOrder({
      orderNo: outTradeNo,
      paymentMethod: "ALIPAY",
      paymentMode: "REAL",
      remark: "支付宝入账（电脑网站支付，通知验签通过）",
      gatewayTransactionId,
      gatewayAmountCents,
      merchantContext: appId ?? null,
    });

    if (!fulfillment.ok) {
      console.error(`[alipay-notify] 订单 ${outTradeNo} 入账失败: ${fulfillment.error}`);
      return new NextResponse("fail", { status: 500 });
    }

    console.log(`[alipay-notify] 订单 ${outTradeNo} 入账完成（${fulfillment.status}）`);
    return new NextResponse("success");
  } catch (error) {
    console.error("[alipay-notify] 处理异常:", (error as Error)?.message);
    return new NextResponse("fail", { status: 500 });
  }
}
