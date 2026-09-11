﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { workspaceIds, status } = await request.json();

    if (
      !workspaceIds ||
      !Array.isArray(workspaceIds) ||
      workspaceIds.length === 0
    ) {
      return NextResponse.json(
        { error: "缺少工作空间 ID 列表" },
        { status: 400 },
      );
    }

    if (!status || !["ACTIVE", "DISABLED"].includes(status)) {
      return NextResponse.json({ error: "无效的状态值" }, { status: 400 });
    }

    const targetStatus = status as "ACTIVE" | "DISABLED";
    const statusLabel = targetStatus === "ACTIVE" ? "启用" : "停用";

    // 1. 读取目标空间真实数据（含所有者，用于受保护校验）
    const workspaces = await prisma.workspace.findMany({
      where: { id: { in: workspaceIds } },
      select: { id: true, name: true, type: true, status: true, ownerId: true },
    });
    const ownerIds = Array.from(new Set(workspaces.map((w) => w.ownerId).filter(Boolean)));
    const owners = ownerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: ownerIds } },
          select: { id: true, role: true },
        })
      : [];
    const ownerRoleMap = new Map(owners.map((o) => [o.id, (o.role || "").toUpperCase()]));
    const PROTECTED_ROLES = ["SUPER_ADMIN", "SUPERADMIN", "ADMIN", "PLATFORM_ADMIN", "PLATFORMADMIN"];

    const skipped: { id: string; name: string; reason: string }[] = [];

    // 2. 不存在的空间
    const existingIds = new Set(workspaces.map((w) => w.id));
    for (const id of workspaceIds) {
      if (!existingIds.has(id)) {
        skipped.push({ id, name: id, reason: "工作空间不存在或已被删除" });
      }
    }

    // 3. 逐条判定可操作性：个人空间与企业空间均可批量管控，仅排除受保护空间与状态无变化的空间
    const operable = workspaces.filter((w) => {
      if (PROTECTED_ROLES.includes(ownerRoleMap.get(w.ownerId) || "") || w.ownerId === userId) {
        skipped.push({ id: w.id, name: w.name, reason: "管理员空间受系统安全保护，不可管控" });
        return false;
      }
      if (w.status === targetStatus) {
        skipped.push({ id: w.id, name: w.name, reason: `该空间已是${statusLabel}状态` });
        return false;
      }
      return true;
    });

    // 4. 只对真正可操作的空间执行批量更新
    let processedCount = 0;
    if (operable.length > 0) {
      const result = await prisma.workspace.updateMany({
        where: { id: { in: operable.map((w) => w.id) } },
        data: { status: targetStatus },
      });
      processedCount = result.count;
    }

    return NextResponse.json({
      success: true,
      processedCount,
      skippedCount: skipped.length,
      skipped,
      message: `已批量${statusLabel} ${processedCount} 个工作空间${
        skipped.length ? `， ${skipped.length} 个已跳过` : ""
      }`,
    });
  } catch (error) {
    console.error("Batch toggle workspaces error:", error);
    return NextResponse.json(
      {
        error: "批量切换工作空间状态失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
