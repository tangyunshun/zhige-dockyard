import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const status = searchParams.get("status");

    if (!workspaceId || !status) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    if (!["ACTIVE", "DISABLED"].includes(status)) {
      return NextResponse.json({ error: "无效的状态值" }, { status: 400 });
    }

    // 检查工作空间是否存在
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 只能对企业空间进行禁用/启用操作
    if (workspace.type !== "ENTERPRISE") {
      return NextResponse.json({ error: "只能对企业空间进行禁用/启用操作" }, { status: 400 });
    }

    // 更新状态
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { status: status as "ACTIVE" | "DISABLED" },
    });

    return NextResponse.json({
      success: true,
      message: `空间已${status === "ACTIVE" ? "启用" : "禁用"}`,
    });
  } catch (error) {
    console.error("Toggle workspace status error:", error);
    return NextResponse.json(
      { error: "操作失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
