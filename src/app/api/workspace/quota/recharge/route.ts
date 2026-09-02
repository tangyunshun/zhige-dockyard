export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { requireWorkspaceMembership } from "@/lib/security";
import { checkAndResetQuotaCycle } from "@/lib/quota-cycle";
import { pointsToCents } from "@/lib/point-rate";

/**
 * POST /api/workspace/quota/recharge
 * 在线申购 / 充值算力包，真实向空间算力池向加算点数
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, points, packName } = body;

    if (!workspaceId || !points || typeof points !== "number" || points <= 0) {
      return NextResponse.json({ error: "参数无效：充值点数必须大于 0" }, { status: 400 });
    }

    // 1. 校验空间成员资格
    const isMember = await requireWorkspaceMembership(auth.user.id, workspaceId);
    if (!isMember) {
      return NextResponse.json({ error: "越权警告：您非该工作空间成员" }, { status: 403 });
    }

    // 2. 校验管理员/所有者权限
    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    const requesterMember = await prisma.workspacemember.findUnique({
      where: { userId_workspaceId: { userId: auth.user.id, workspaceId } },
    });

    const isOwner = ws?.ownerId === auth.user.id || requesterMember?.role === "OWNER";
    const isAdmin = requesterMember?.role === "ADMIN";

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "越权警告：仅空间管理员或所有者可充值算力包" }, { status: 403 });
    }

    // 3. 执行前先触发自然月重置预检
    await checkAndResetQuotaCycle(prisma, workspaceId, auth.user.id);

    // 4. 查询并向空间全局算力池累加点数
    const quota = await prisma.workspacequota.findUnique({ where: { workspaceId } });

    if (!quota) {
      return NextResponse.json({ error: "未查找到该工作空间绑定的算力配额记录" }, { status: 404 });
    }

    const addBigInt = BigInt(points);
    const updatedQuota = await prisma.workspacequota.update({
      where: { workspaceId },
      data: {
        tokenBalance: { increment: addBigInt },
        updatedAt: new Date(),
      },
    });

    // 5. 写入交易流转账单明细 (billing_record)，形成订单与财务合规全闭环
    //    修复：原逻辑 (body.price || 99) 在前端未传 price 时恒按 ¥99 入账，
    //    导致账单金额与实际充值点数不符。现优先取前端售价，缺失时按统一规则由点数折算。
    const amountCents =
      typeof body.price === "number" && body.price > 0
        ? Math.round(body.price * 100)
        : pointsToCents(points);
    const rechargeOrderNo = `TR_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const billingModel = (prisma as any).billing_record || (prisma as any).billingrecord;
    if (billingModel && typeof billingModel.create === "function") {
      await billingModel.create({
        data: {
          id: rechargeOrderNo,
          userId: auth.user.id,
          workspaceId,
          type: "TOKEN_RECHARGE",
          title: `充值 ${points.toLocaleString()} 算力点（${packName || "算力加油包"}）`,
          amount: amountCents, // 单位：分（按统一规则 10 算力点 = 0.1 元 折算）
          currency: "CNY",
          status: "SUCCESS",
          channel: body.paymentMethod || "ONLINE_PAY",
          referenceId: workspaceId,
          metadata: {
            points,
            packName,
            rechargedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        },
      }).catch((e: any) => console.warn("写入算力充值账单记录警告:", e));
    }

    const newBalanceNum = Number(updatedQuota.tokenBalance);

    return NextResponse.json({
      success: true,
      message: `恭喜！成功为您充值 ${points} 算力点（${packName || "算力加油包"}）`,
      rechargedPoints: points,
      tokenBalance: newBalanceNum,
    });
  } catch (error) {
    console.error("充值算力包失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
