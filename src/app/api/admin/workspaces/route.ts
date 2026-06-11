﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const type = searchParams.get("type") || "";
    const componentCount = searchParams.get("componentCount") || "";

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.name = { contains: search };
    }

    if (type) {
      where.type = type;
    }

    // 先获取所有工作空间（用于统计，不受筛选影响）
    const allWorkspaces = await prisma.workspace.findMany({
      include: {
        workspacemember: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
        _count: {
          select: { workspacemember: true },
        },
      },
    });

    // 统计所有工作空间的组件数量
    const allWorkspacesWithComponentCount = await Promise.all(
      allWorkspaces.map(async (workspace) => {
        const members = await prisma.workspacemember.findMany({
          where: { workspaceId: workspace.id },
          select: { userId: true },
        });
        const memberIds = members.map((m) => m.userId);
        const componentCountValue = await prisma.componenttask.count({
          where: { userId: { in: memberIds } },
        });
        return {
          ...workspace,
          componentCount: componentCountValue,
          members: workspace.workspacemember,
        };
      }),
    );

    // 再获取筛选后的工作空间（用于列表显示）
    const [workspaces, total] = await Promise.all([
      prisma.workspace.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          workspacemember: {
            include: {
              user: {
                select: { name: true, email: true },
              },
            },
          },
          _count: {
            select: { workspacemember: true },
          },
        },
      }),
      prisma.workspace.count({ where }),
    ]);

    // 统计筛选后的工作空间的组件数量
    const workspacesWithComponentCount = await Promise.all(
      workspaces.map(async (workspace) => {
        const members = await prisma.workspacemember.findMany({
          where: { workspaceId: workspace.id },
          select: { userId: true },
        });
        const memberIds = members.map((m) => m.userId);
        const componentCountValue = await prisma.componenttask.count({
          where: { userId: { in: memberIds } },
        });
        return {
          ...workspace,
          componentCount: componentCountValue,
          members: workspace.members,
        };
      }),
    );

    // 根据组件数量筛选
    let filteredWorkspaces = workspacesWithComponentCount;
    if (componentCount) {
      filteredWorkspaces = workspacesWithComponentCount.filter((ws) => {
        const count = ws.componentCount;
        if (componentCount === "0") return count === 0;
        if (componentCount === "1-10") return count >= 1 && count <= 10;
        if (componentCount === "11-50") return count >= 11 && count <= 50;
        if (componentCount === "51-100") return count >= 51 && count <= 100;
        if (componentCount === "100+") return count > 100;
        return true;
      });
    }

    // 计算统计数据（基于所有工作空间，不受筛选影响）
    const totalComponentCount = allWorkspacesWithComponentCount.reduce(
      (sum, ws) => sum + ws.componentCount,
      0,
    );

    // 待审核空间：这里暂时用 DISABLED 状态作为待审核（实际应该有 PENDING 状态）
    const pendingCount = allWorkspacesWithComponentCount.filter(
      (ws) => ws.status === "DISABLED",
    ).length;

    // 总成员数（基于所有工作空间，不受筛选影响）
    const totalMembers = allWorkspacesWithComponentCount.reduce(
      (sum, ws) => sum + ws._count.members,
      0,
    );

    return NextResponse.json({
      success: true,
      data: {
        workspaces: filteredWorkspaces,
        total: allWorkspacesWithComponentCount.length, // 显示所有工作空间总数，不受筛选影响
        page,
        totalPages: Math.ceil(filteredWorkspaces.length / limit),
        stats: {
          totalComponentCount,
          pendingCount,
          totalMembers,
        },
      },
    });
  } catch (error) {
    console.error("Get workspaces error:", error);
    return NextResponse.json(
      {
        error: "获取工作空间列表失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    // 检查工作空间是否存在
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 个人空间不能删除
    if (workspace.type === "PERSONAL") {
      return NextResponse.json({ error: "个人空间不能删除" }, { status: 400 });
    }

    // 企业空间必须先禁用才能删除
    if (workspace.type === "ENTERPRISE" && workspace.status !== "DISABLED") {
      return NextResponse.json(
        { error: "企业空间必须先禁用才能删除" },
        { status: 400 },
      );
    }

    // 删除工作空间 (级联删除相关数据)
    await prisma.workspace.delete({
      where: { id: workspaceId },
    });

    return NextResponse.json({
      success: true,
      message: "工作空间已删除",
    });
  } catch (error) {
    console.error("Delete workspace error:", error);
    return NextResponse.json(
      {
        error: "删除工作空间失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
