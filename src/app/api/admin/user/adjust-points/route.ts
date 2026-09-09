import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";

// POST: 管理员人工调整用户个人空间算力点（赠送/扣除），需要 user:update 权限
// 与算力财务模块闭环：同步更新 workspacequota，并写入 pointledger 流水（MANUAL_ADJUST）
export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "user:update");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const adminId = authResult.user!.id;

    const body = await request.json();
    const { userId, points, reason } = body;

    if (!userId) {
      return NextResponse.json({ error: "缺少用户 ID" }, { status: 400 });
    }
    const amount = Number(points);
    if (!Number.isFinite(amount) || amount === 0) {
      return NextResponse.json({ error: "调整数量必须为非零数字" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!target) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 个人空间配额（算力点权威余额来源）
    const personalWs = await prisma.workspace.findFirst({
      where: { ownerId: userId, type: "PERSONAL" },
    });
    if (!personalWs) {
      return NextResponse.json({ error: "该用户尚未初始化个人空间" }, { status: 400 });
    }
    const quota = await prisma.workspacequota.findUnique({
      where: { workspaceId: personalWs.id },
    });
    if (!quota) {
      return NextResponse.json({ error: "未找到空间配额" }, { status: 400 });
    }

    const current = Number(quota.tokenBalance);
    if (current === -1) {
      return NextResponse.json({ error: "该用户为无限额度，无需调整" }, { status: 400 });
    }
    if (amount < 0 && current + amount < 0) {
      return NextResponse.json(
        { error: `算力点不足，当前余额 ${current}` },
        { status: 400 },
      );
    }

    const newBalance = current + amount;
    const detail = reason || "后台人工调整算力点";

    await prisma.$transaction(async (tx) => {
      await tx.workspacequota.update({
        where: { workspaceId: personalWs.id },
        data: { tokenBalance: BigInt(newBalance), updatedAt: new Date() },
      });
      await tx.pointledger.create({
        data: {
          id: crypto.randomUUID(),
          direction: amount >= 0 ? "IN" : "OUT",
          type: "MANUAL_ADJUST",
          scope: "WORKSPACE",
          userId,
          userEmail: target.email,
          workspaceId: personalWs.id,
          workspaceType: "PERSONAL",
          operatorId: adminId,
          points: BigInt(Math.abs(amount)),
          balanceAfter: newBalance,
          title: detail,
          createdAt: new Date(),
        },
      });
    });

    await writeAuditLog(
      adminId,
      "user:adjust_points",
      { targetUserId: userId, points: amount, reason: reason || null },
      null,
      null,
      request,
    );

    return NextResponse.json({
      success: true,
      balance: newBalance,
      message: `已${amount >= 0 ? "赠送" : "扣除"} ${Math.abs(amount)} 算力点`,
    });
  } catch (error) {
    console.error("Adjust points API error:", error);
    return NextResponse.json(
      { error: "调整算力点失败", details: error instanceof Error ? error.message : error },
      { status: 500 },
    );
  }
}
