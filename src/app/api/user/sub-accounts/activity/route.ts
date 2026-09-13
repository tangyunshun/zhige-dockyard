import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/user/sub-accounts/activity?subAccountId=xxx
 * 查看指定子账号的最近操作审计记录（仅限同租户的主账号）。
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await validateUser(request.headers.get("Authorization"), request);
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const adminId = authResult.user.id;

    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: { tenantId: true },
    });
    const tenantId = admin?.tenantId;
    if (!tenantId) {
      return NextResponse.json({ error: "只有主账号才能查看子账号活动" }, { status: 403 });
    }

    const subAccountId = new URL(request.url).searchParams.get("subAccountId");
    if (!subAccountId) {
      return NextResponse.json({ error: "缺少子账号 ID" }, { status: 400 });
    }

    const subAccount = await prisma.user.findUnique({
      where: { id: subAccountId },
      select: { id: true, name: true, tenantId: true },
    });
    if (!subAccount) {
      return NextResponse.json({ error: "子账号不存在" }, { status: 404 });
    }
    if (subAccount.tenantId !== tenantId) {
      return NextResponse.json({ error: "无权查看该子账号" }, { status: 403 });
    }

    const logs = await prisma.operationlog.findMany({
      where: { userId: subAccountId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      subAccount: { id: subAccount.id, name: subAccount.name },
      activities: logs.map((l) => ({
        id: l.id,
        action: l.action,
        resource: l.resource,
        details: l.details,
        ipAddress: l.ipAddress,
        createdAt: l.createdAt,
      })),
    });
  } catch (error) {
    console.error("获取子账号活动失败:", error);
    return NextResponse.json({ error: "获取子账号活动失败" }, { status: 500 });
  }
}
