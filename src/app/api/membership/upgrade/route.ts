import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";

/**
 * [R0-A] 会员在线购买入口（POST）说明：
 * 保留完整身份校验，但阻断一切直接授予会员 / 配额 / 订单权益的写入，避免绕过付款。
 * 本批不新建会员支付体系；如需上线购买，应接入真实支付并改为 PENDING 订单 + 支付回调生效。
 */

/**
 * POST /api/membership/upgrade
 * 会员在线购买暂未开放：仅做身份校验，拒绝直接开通，不产生扣款或权益变更。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: auth.error || "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const targetLevel = String(body.targetLevel || "").toUpperCase();

    if (!targetLevel) {
      return NextResponse.json({ error: "缺少目标会员等级" }, { status: 400 });
    }

    // [R0-A] 会员在线购买入口暂未开放：阻断一切直接授予会员 / 配额 / 订单权益的写入，避免绕过付款。
    // 本批不新建会员支付体系；保留身份校验，但未确认收款的开通一律拒绝，
    // 不修改会员、余额、分桶、有效期，不创建成功账单或待支付订单，不调用 grantPoints。
    return NextResponse.json(
      {
        error: "MEMBERSHIP_CHECKOUT_UNAVAILABLE",
        message: "会员在线购买暂未开放，本次没有产生扣款或权益变更。",
        success: false,
      },
      { status: 403 },
    );
  } catch (error) {
    console.error("Membership upgrade error:", error);
    return NextResponse.json(
      { error: "会员升级失败", details: error instanceof Error ? error.message : error },
      { status: 500 },
    );
  }
}
