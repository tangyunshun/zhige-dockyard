export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdminRole } from "@/lib/auth";
import { writeAuditLog } from "@/lib/security";
import { resolvePoolLowThreshold } from "@/constants/workspace-plans";

/**
 * POST /api/admin/workspaces/pool-threshold
 * 平台管理员更新任意企业空间的共享池低余额预警阈值。
 * body: { workspaceId, threshold }，threshold 为非负整数，传 null 则重置为套餐默认。
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
    const { workspaceId, threshold } = body;
    if (!workspaceId) {
      return NextResponse.json({ error: "缺少 workspaceId" }, { status: 400 });
    }

    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, plan: true, type: true, ownerId: true, name: true },
    });
    if (!ws) return NextResponse.json({ error: "空间不存在" }, { status: 404 });
    if (ws.type !== "ENTERPRISE") {
      return NextResponse.json({ error: "仅企业空间可设置企业池阈值" }, { status: 400 });
    }

    const value = threshold === null ? null : Math.floor(Number(threshold));
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      return NextResponse.json({ error: "参数无效：阈值必须为非负整数或 null（重置为套餐默认）" }, { status: 400 });
    }

    await prisma.workspacequota.upsert({
      where: { workspaceId },
      create: {
        id: crypto.randomUUID(),
        workspaceId,
        membershipLevelId: "FREE",
        tokenBalance: 0,
        poolLowThreshold: value === null ? null : BigInt(value),
        updatedAt: new Date(),
      },
      update: {
        poolLowThreshold: value === null ? null : BigInt(value),
        updatedAt: new Date(),
      },
    });

    await writeAuditLog(
      auth.user.id,
      "admin:workspace_pool_threshold_update",
      { workspaceId, workspaceName: ws.name, ownerId: ws.ownerId, threshold: value },
      workspaceId,
      null,
      request
    ).catch((e) => console.warn("[审计] 管理员企业池阈值更新日志写入失败:", e));

    return NextResponse.json({
      success: true,
      poolLowThreshold: value,
      effectiveThreshold: resolvePoolLowThreshold(ws.plan, value),
      message:
        value === null
          ? `已将「${ws.name}」重置为套餐默认阈值`
          : `已将「${ws.name}」企业池预警阈值设为 ${value}`,
    });
  } catch (error) {
    console.error("管理员更新企业池阈值失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
