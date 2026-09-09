export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { requireWorkspaceMembership, writeAuditLog } from "@/lib/security";
import { addNotification } from "@/lib/notifications-store";
import { recycleEnterprisePool } from "@/lib/credit-service";
import { resolvePoolLowThreshold } from "@/constants/workspace-plans";

/**
 * POST /api/workspace/quota/recycle
 * 企业空间所有者/管理员将企业共享池的算力点余额回收至个人钱包。
 * 约束：仅 ENTERPRISE 空间、且操作为所有者或管理员时允许；无限额度空间或余额不足禁止。
 * 全程单事务记账：企业池递减 + 个人钱包递增 + 新建 WALLET 分桶（保证点数可正常花费）+ 双向流水。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, points } = body;

    const amount = Math.floor(Number(points));
    if (!workspaceId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "参数无效：回收点数必须为大于 0 的整数" }, { status: 400 });
    }

    const isMember = await requireWorkspaceMembership(auth.user.id, workspaceId);
    if (!isMember) {
      return NextResponse.json({ error: "越权警告：您非该工作空间成员" }, { status: 403 });
    }

    const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    const member = await prisma.workspacemember.findUnique({
      where: { userId_workspaceId: { userId: auth.user.id, workspaceId } },
    });
    const isOwner = ws?.ownerId === auth.user.id || member?.role === "OWNER";
    const isAdmin = member?.role === "ADMIN";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "越权警告：仅空间所有者或管理员可回收算力点" }, { status: 403 });
    }
    if (ws?.type !== "ENTERPRISE") {
      return NextResponse.json({ error: "仅企业空间的共享池支持回收至个人钱包" }, { status: 400 });
    }

    const result = await recycleEnterprisePool({
      workspaceId,
      userId: auth.user.id,
      points: amount,
      operatorId: auth.user.id,
    });

    // 审计留痕：企业池回收操作（非阻断式，失败不影响主流程）
    await writeAuditLog(
      auth.user.id,
      "workspace:pool_recycle",
      {
        workspaceId,
        workspaceName: ws?.name,
        points: amount,
        poolBalance: result.poolBalance,
        walletBalance: result.walletBalance,
        role: isOwner ? "OWNER" : "ADMIN",
      },
      workspaceId,
      null,
      request
    ).catch((e) => console.warn("[审计] 企业池回收日志写入失败:", e));

    // 取空间级阈值覆盖（NULL 时继承套餐默认），决定是否需要补充提醒
    const quotaThreshold = await prisma.workspacequota
      .findUnique({ where: { workspaceId }, select: { poolLowThreshold: true } })
      .then((q) => (q?.poolLowThreshold != null ? Number(q.poolLowThreshold) : null))
      .catch(() => null);

    // 回收后企业池余额偏低：自动提醒空间所有者及时补充
    const POOL_LOW_THRESHOLD = resolvePoolLowThreshold(ws?.plan, quotaThreshold);
    if (result.poolBalance < POOL_LOW_THRESHOLD && ws?.ownerId) {
      try {
        await addNotification(
          ws.ownerId,
          "企业池算力点余额偏低",
          `「${ws.name || "企业空间"}」的共享池算力点剩余 ${result.poolBalance.toLocaleString()} 点，已低于预警阈值 ${POOL_LOW_THRESHOLD.toLocaleString()} 点，请及时补充。`,
          "asset",
          `/workspace/${workspaceId}/billing`
        );
      } catch (notifyErr) {
        console.warn("[回收提醒] 通知空间所有者失败:", notifyErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: `已成功回收 ${amount.toLocaleString()} 算力点至您的个人钱包`,
      recycledPoints: amount,
      walletBalance: result.walletBalance,
      poolBalance: result.poolBalance,
    });
  } catch (error: any) {
    if (error?.message === "UNLIMITED") {
      return NextResponse.json({ error: "该空间为无限额度，无需回收" }, { status: 400 });
    }
    if (error?.message === "INSUFFICIENT") {
      return NextResponse.json({ error: "企业池余额不足，无法回收该数量" }, { status: 400 });
    }
    console.error("回收算力点失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
