﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - 获取用户的工作空间列表
export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get("Authorization")?.replace("Bearer ", "");

    if (!userId) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }

    // 获取用户的工作空间列表
    const workspaces = await prisma.workspace.findMany({
      where: {
        ownerId: userId,
      },
      include: {
        workspacemember: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json({
      success: true,
      data: workspaces,
    });
  } catch (error) {
    console.warn("Get user workspaces error:", error);
    return NextResponse.json(
      { error: "获取用户工作空间列表失败" },
      { status: 500 }
    );
  }
}

// PUT - 更新用户工作空间
export async function PUT(req: NextRequest) {
  try {
    const userId = req.headers.get("Authorization")?.replace("Bearer ", "");

    if (!userId) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("id");
    const { name, description } = await req.json();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "缺少工作空间 ID" },
        { status: 400 }
      );
    }

    // 验证用户是否有权限更新该工作空间
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "工作空间不存在" },
        { status: 404 }
      );
    }

    if (workspace.ownerId !== userId) {
      return NextResponse.json(
        { error: "无权更新该工作空间" },
        { status: 403 }
      );
    }

    // 更新工作空间
    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: name || workspace.name,
        description: description !== undefined ? description : workspace.description,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedWorkspace,
      message: "工作空间已更新",
    });
  } catch (error) {
    console.error("Update workspace error:", error);
    return NextResponse.json(
      { error: "更新工作空间失败" },
      { status: 500 }
    );
  }
}

// DELETE - 删除用户工作空间（级联清理关联数据，避免外键约束报错）
export async function DELETE(req: NextRequest) {
  try {
    const userId = req.headers.get("Authorization")?.replace("Bearer ", "");

    if (!userId) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "缺少工作空间 ID" },
        { status: 400 }
      );
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "工作空间不存在" },
        { status: 404 }
      );
    }

    if (workspace.ownerId !== userId) {
      return NextResponse.json(
        { error: "无权删除该工作空间" },
        { status: 403 }
      );
    }

    // 级联清理关联数据（componentusage / conversation 仅建立普通索引，不会随 workspace 级联删除）
    await prisma.workspacequota.deleteMany({ where: { workspaceId } });
    await prisma.workspacemember.deleteMany({ where: { workspaceId } });
    await prisma.componentusage.deleteMany({ where: { workspaceId } });
    await prisma.conversation.deleteMany({ where: { workspaceId } });
    await prisma.workspacepost.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });

    return NextResponse.json({
      success: true,
      message: "工作空间已删除",
    });
  } catch (error) {
    console.error("Delete workspace error:", error);
    return NextResponse.json(
      { error: "删除工作空间失败" },
      { status: 500 }
    );
  }
}
