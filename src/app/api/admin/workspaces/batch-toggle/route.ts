import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
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

    // 批量更新状态
    await prisma.workspace.updateMany({
      where: {
        id: { in: workspaceIds },
        type: "ENTERPRISE", // 只处理企业空间
      },
      data: {
        status: status as "ACTIVE" | "DISABLED",
      },
    });

    return NextResponse.json({
      success: true,
      message: `已批量${status === "ACTIVE" ? "启用" : "禁用"} ${workspaceIds.length} 个工作空间`,
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
