export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { verifyNotify } from "@/lib/payment/alipay";
import { fulfillPaidOrder } from "@/lib/payment/fulfill";

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

    const { outTradeNo, tradeStatus, totalAmount } = verified;
    if (tradeStatus !== "TRADE_SUCCESS" && tradeStatus !== "TRADE_FINISHED") {
      console.log(`[alipay-notify] 订单 ${outTradeNo} 状态 ${tradeStatus}，无需入账`);
      return new NextResponse("success");
    }

    // 金额核对（元 → 分）：以订单本地金额为权威，fulfill 服务内部做一致性校验
    const gatewayAmountCents = totalAmount ? Math.round(Number(totalAmount) * 100) : null;

    const fulfillment = await fulfillPaidOrder({
      orderNo: outTradeNo || "",
      paymentMethod: "ALIPAY",
      paymentMode: "REAL",
      remark: "支付宝入账（电脑网站支付，通知验签通过）",
      gatewayAmountCents,
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
