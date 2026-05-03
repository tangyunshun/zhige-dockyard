import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
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
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const workspaceId = params.id;

    // 获取工作空间详情
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
        _count: {
          select: { members: true },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 获取工作空间的所有成员 ID
    const memberIds = workspace.members.map((m) => m.userId);

    // 获取这些成员创建的所有组件（componenttask）
    const components = await prisma.componenttask.findMany({
      where: {
        userId: { in: memberIds },
      },
      orderBy: { createdAt: "desc" },
    });

    // 统计每个组件在该工作空间的使用次数
    const componentsWithUsage = await Promise.all(
      components.map(async (component) => {
        // 查询 ComponentUsage 表中该组件被该工作空间使用的次数
        const usageCount = await prisma.componentUsage.count({
          where: {
            componentId: component.id,
            workspaceId: workspaceId,
          },
        });

        return {
          id: component.id,
          name: component.name,
          icon: component.icon,
          usageCount,
        };
      }),
    );

    return NextResponse.json({
      success: true,
      data: {
        workspace: {
          ...workspace,
          components: componentsWithUsage,
        },
      },
    });
  } catch (error) {
    console.error("Get workspace detail error:", error);
    return NextResponse.json(
      {
        error: "获取工作空间详情失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
