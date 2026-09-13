import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

/**
 * 账号注销前安全检测接口（真实数据库查询，替代前端写死的 setTimeout 模拟）
 * 返回各维度资产数量与待结算的充值工单，供前端如实展示，并提示可能影响退款的资产。
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

    const [
      ownedWorkspaces,
      memberWorkspaces,
      componentRows,
      activityCount,
      pendingRecharge,
      activeMembership,
    ] = await Promise.all([
      prisma.workspace.count({ where: { ownerId: userId } }),
      prisma.workspacemember.count({ where: { userId } }),
      prisma.componentusage.findMany({
        where: { userId },
        select: { componentId: true },
        distinct: ["componentId"],
      }),
      prisma.operationlog.count({ where: { userId } }),
      prisma.tokenrechargeorder.count({
        where: { applicantId: userId, status: { in: ["PENDING", "APPROVED"] } },
      }),
      prisma.membershiporder.count({ where: { userId, status: "ACTIVE" } }),
    ]);

    const componentCount = componentRows.length;

    // blocking=true 表示注销后该资产将随账号一并清除，需重点提示用户
    const checks = [
      { key: "profile", label: "个人信息", count: 1, blocking: false },
      { key: "workspaces", label: "工作空间", count: ownedWorkspaces, blocking: ownedWorkspaces > 0 },
      { key: "components", label: "组件资产", count: componentCount, blocking: false },
      { key: "activities", label: "活动记录", count: activityCount, blocking: false },
      { key: "membership", label: "会员与算力", count: activeMembership, blocking: false },
    ];

    return NextResponse.json({
      success: true,
      data: {
        checks,
        // 待结算（PENDING/APPROVED）的线下充值工单：注销前未入账，可能无法退款
        pendingRechargeOrders: pendingRecharge,
        memberWorkspaces,
        canDelete: true,
      },
    });
  } catch (error) {
    console.error("Account deletion check error:", error);
    return NextResponse.json({ error: "安全检测失败" }, { status: 500 });
  }
}
