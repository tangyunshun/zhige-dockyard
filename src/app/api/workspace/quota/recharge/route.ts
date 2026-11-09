export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";

/**
 * POST /api/workspace/quota/recharge
 *
 * [R0 / 原方案 F16 · M01 止损]
 * 旧「免支付直充」旁路：历史上仅凭 order:read / system:manage / 空间 OWNER·ADMIN / 客户端 scope·金额
 * 即可凭空 grant 算力点。本轮明确退役/暂停该入口：在任何资金/权益/账单/自然月赠送等业务副作用
 * 之前返回稳定非成功码 409（LEGACY_RECHARGE_RETIRED），不签发订单号、不调 grantPoints、不写账单。
 *
 * 真实自助充值请走 /api/payments/create（线上支付链）；线下对公请走
 * /api/workspace/quota/recharge-orders（提交工单 → 审批 → 待收款）流程。
 * 注意：未隐藏后端接口，只是后端不再放行直接加点；保留真实已购余额与历史查询不受影响。
 * 管理员收款确认（CONFIRM_PAID）当前同样未开放可靠收款来源，见 admin/recharge-orders 的 M02 暂停。
 */
const LEGACY_RECHARGE_RETIRED_CODE = "LEGACY_RECHARGE_RETIRED";
const LEGACY_RECHARGE_RETIRED_MESSAGE =
  "该免支付直充入口已停用；请通过充值下单流程（/api/payments/create）或线下对公工单（/api/workspace/quota/recharge-orders）办理，管理员收款确认暂未开放。";

export async function POST(request: NextRequest) {
  // 1) 身份拒绝按原规则：未登录 401
  const auth = await validateUser(request.headers.get("Authorization"), request);
  if (!auth.valid || !auth.user) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  // 2) 退役守卫：在任何资金/权益/账单/赠送等业务副作用之前返回，零写
  return NextResponse.json(
    {
      success: false,
      code: LEGACY_RECHARGE_RETIRED_CODE,
      error: LEGACY_RECHARGE_RETIRED_MESSAGE,
      alternatives: {
        online: "/api/payments/create",
        offline: "/api/workspace/quota/recharge-orders",
      },
    },
    { status: 409 },
  );
}
