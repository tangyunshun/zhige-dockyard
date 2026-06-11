﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

// 检查个人空间是否可以删除
export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    // 获取工作空间信息
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 检查是否是个人空间
    if (workspace.type !== "PERSONAL") {
      return NextResponse.json({ error: "该工作空间不是个人空间" }, { status: 400 });
    }

    // 检查用户是否是所有者
    if (workspace.ownerId !== userId) {
      return NextResponse.json({ error: "无权删除该工作空间" }, { status: 403 });
    }

    // 检查个人空间是否可以删除
    const issues: Array<{
      type: "error" | "warning";
      message: string;
      count?: number;
    }> = [];

    // 检查成员数量（除了 owner 之外的成员）
    const otherMembers = workspace.members.filter(m => m.userId !== userId);
    if (otherMembers.length > 0) {
      issues.push({
        type: "warning",
        message: `该个人空间还有 ${otherMembers.length} 个成员，请先移除所有成员`,
        count: otherMembers.length,
      });
    }

    // 检查是否有进行中的组件任务
    const activeTasks = await prisma.componenttask.count({
      where: {
        userId,
        status: {
          in: ["PENDING", "IN_PROGRESS"],
        },
      },
    });

    if (activeTasks > 0) {
      issues.push({
        type: "warning",
        message: `该用户还有 ${activeTasks} 个进行中的组件任务`,
        count: activeTasks,
      });
    }

    return NextResponse.json({
      canDelete: issues.filter(i => i.type === "error").length === 0,
      issues,
    });
  } catch (error) {
    console.error("Check personal workspace error:", error);
    return NextResponse.json({ error: "检查工作空间失败" }, { status: 500 });
  }
}
