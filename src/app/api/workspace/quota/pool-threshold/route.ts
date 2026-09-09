export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { requireWorkspaceMembership, writeAuditLog } from "@/lib/security";
import { getPoolLowThreshold, resolvePoolLowThreshold } from "@/constants/workspace-plans";

/**
 * GET /api/workspace/quota/pool-threshold?workspaceId=xxx
 * 查询企业池低余额预警阈值：返回空间级覆盖值、套餐默认值与最终生效值。
 * 任意空间成员可读取（仅 ENTERPRISE 空间有效）。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) {
      return NextResponse.json({ error: "缺少 workspaceId" }, { status: 400 });
    }

    const isMember = await requireWorkspaceMembership(auth.user.id, workspaceId);
    if (!isMember) {
      return NextResponse.json({ error: "越权警告：您非该工作空间成员" }, { status: 403 });
    }

    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { plan: true, type: true },
    });
    if (!ws) return NextResponse.json({ error: "空间不存在" }, { status: 404 });
    if (ws.type !== "ENTERPRISE") {
      return NextResponse.json({ error: "仅企业空间存在企业池阈值" }, { status: 400 });
    }

    const quota = await prisma.workspacequota.findUnique({
      where: { workspaceId },
      select: { poolLowThreshold: true },
    });
    const planDefault = getPoolLowThreshold(ws.plan);
    const quotaThreshold = quota?.poolLowThreshold != null ? Number(quota.poolLowThreshold) : null;

    return NextResponse.json({
      poolLowThreshold: quotaThreshold,
      planDefault,
      effectiveThreshold: resolvePoolLowThreshold(ws.plan, quota?.poolLowThreshold ?? null),
      plan: ws.plan,
    });
  } catch (error) {
    console.error("查询企业池阈值失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * PATCH /api/workspace/quota/pool-threshold
 * 空间所有者/管理员更新本企业池低余额预警阈值。
 * body: { workspaceId, threshold }，threshold 为非负整数，传 null 则重置为套餐默认。
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, threshold } = body;
    if (!workspaceId) {
      return NextResponse.json({ error: "缺少 workspaceId" }, { status: 400 });
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
      return NextResponse.json({ error: "越权警告：仅空间所有者或管理员可设置阈值" }, { status: 403 });
    }
    if (ws?.type !== "ENTERPRISE") {
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
      "workspace:pool_threshold_update",
      { workspaceId, threshold: value, resetToPlanDefault: value === null },
      workspaceId,
      null,
      request
    ).catch((e) => console.warn("[审计] 企业池阈值更新日志写入失败:", e));

    return NextResponse.json({
      success: true,
      poolLowThreshold: value,
      effectiveThreshold: resolvePoolLowThreshold(ws.plan, value),
      message: value === null ? "已重置为套餐默认阈值" : `已更新企业池预警阈值为 ${value}`,
    });
  } catch (error) {
    console.error("更新企业池阈值失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
