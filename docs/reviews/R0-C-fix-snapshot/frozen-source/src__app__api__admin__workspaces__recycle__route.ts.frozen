export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdminRole } from "@/lib/auth";
import { recycleEnterprisePool } from "@/lib/credit-service";
import { writeAuditLog } from "@/lib/security";

/**
 * POST /api/admin/workspaces/recycle
 * 平台管理员将企业空间的共享池算力点回收至该空间所有者的个人钱包。
 * 鉴权：仅平台管理员可调用；目标自动为该空间 owner。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const admin = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const body = await request.json();
    const { workspaceId, points } = body;
    const amount = Math.floor(Number(points));
    if (!workspaceId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "参数无效：回收点数必须为大于 0 的整数" }, { status: 400 });
    }

    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, type: true, ownerId: true },
    });
    if (!ws) return NextResponse.json({ error: "空间不存在" }, { status: 404 });
    if (ws.type !== "ENTERPRISE") {
      return NextResponse.json({ error: "仅企业空间的共享池支持回收" }, { status: 400 });
    }
    if (!ws.ownerId) {
      return NextResponse.json({ error: "该空间无所有者，无法回收" }, { status: 400 });
    }

    const result = await recycleEnterprisePool({
      workspaceId,
      userId: ws.ownerId,
      points: amount,
      operatorId: auth.user.id,
    });

    // 审计留痕：平台管理员回收企业池（非阻断式，失败不影响主流程）
    await writeAuditLog(
      auth.user.id,
      "admin:workspace_pool_recycle",
      {
        workspaceId,
        workspaceName: ws.name,
        ownerId: ws.ownerId,
        points: amount,
        poolBalance: result.poolBalance,
        walletBalance: result.walletBalance,
      },
      workspaceId,
      null,
      request
    ).catch((e) => console.warn("[审计] 管理员企业池回收日志写入失败:", e));

    return NextResponse.json({
      success: true,
      message: `已成功将 ${amount.toLocaleString()} 算力点从「${ws.name || "企业空间"}」回收至所有者个人钱包`,
      recycledPoints: amount,
      ownerId: ws.ownerId,
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
    if (error?.message === "NOT_ENTERPRISE") {
      return NextResponse.json({ error: "仅企业空间的共享池支持回收" }, { status: 400 });
    }
    console.error("管理员回收算力点失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
