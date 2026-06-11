﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { COMPONENTS } from "@/constants/components";
import { hasPermission, PermissionAction, ResourceType, EnterpriseRole } from "@/constants/roles";

/**
 * 获取岗位列表
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: "未找到用户" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    // 获取工作空间信息
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        workspacemember: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    const userRole = workspace.workspacemember[0]?.role || "MEMBER";
    
    // 验证权限
    if (!hasPermission(userRole as string, ResourceType.WORKSPACE, PermissionAction.VIEW)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    // 获取所有岗位
    const posts = await prisma.workspacepost.findMany({
      where: { workspaceId },
      include: {
        postmember: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
        },
        componentpermission: true,
      },
      orderBy: { createdAt: "asc" },
    });

    // 构建权限映射
    const permissions: Record<string, Record<string, any>> = {};
    
    posts.forEach(post => {
      permissions[post.id] = {};
      post.componentpermission.forEach(perm => {
        permissions[post.id][perm.componentId] = {
          canView: perm.canView,
          canEdit: perm.canEdit,
          canDelete: perm.canDelete,
          canExecute: perm.canExecute,
        };
      });
    });

    return NextResponse.json({
      success: true,
      data: {
        posts: posts.map(post => ({
          id: post.id,
          workspaceId: post.workspaceId,
          name: post.name,
          description: post.description,
          color: post.color,
          isDefault: post.isDefault,
          isSystem: post.isSystem,
          createdBy: post.createdBy,
          members: post.postmember.map(pm => ({
            id: pm.id,
            userId: pm.userId,
            postId: pm.postId,
            workspaceId: pm.workspaceId,
            assignedAt: pm.assignedAt,
            user: pm.user,
          })),
          permissionCount: post.componentpermission.length,
        })),
        components: COMPONENTS,
        permissions,
      },
    });
  } catch (error) {
    console.error("获取岗位列表错误:", error);
    return NextResponse.json(
      { error: "获取岗位列表失败", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * 创建岗位
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const authResult = await auth(userId);
    
    if (!authResult.user) {
      return NextResponse.json({ error: "未找到用户" }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, name, description, color, templatePermissions } = body;

    if (!workspaceId || !name) {
      return NextResponse.json({ error: "缺少工作空间 ID 或岗位名称" }, { status: 400 });
    }

    // 获取工作空间信息
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        workspacemember: {
          where: { userId },
          select: { role: true },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    const userRole = workspace.workspacemember[0]?.role || "MEMBER";
    
    // 验证权限
    if (userRole !== "OWNER" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    // 检查岗位名称是否已存在
    const existingPost = await prisma.workspacepost.findUnique({
      where: {
        workspaceId_name: {
          workspaceId,
          name,
        },
      },
    });

    if (existingPost) {
      return NextResponse.json({ error: "岗位名称已存在" }, { status: 400 });
    }

    // 创建岗位
    const post = await prisma.workspacepost.create({
      data: {
        workspaceId,
        name,
        description: description || null,
        color: color || "#64748b",
        createdBy: userId,
      },
    });

    // 创建默认权限
    if (templatePermissions && Object.keys(templatePermissions).length > 0) {
      const permissionsToCreate = Object.entries(templatePermissions)
        .filter(([_, value]) => value === true)
        .map(([componentId]) => ({
          postId: post.id,
          componentId,
          canView: true,
          canEdit: false,
          canDelete: false,
          canExecute: true,
        }));

      if (permissionsToCreate.length > 0) {
        await prisma.componentpermission.createMany({
          data: permissionsToCreate,
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: post.id,
        name: post.name,
        description: post.description,
        color: post.color,
      },
      message: "创建岗位成功",
    });
  } catch (error) {
    console.error("创建岗位错误:", error);
    return NextResponse.json(
      { error: "创建岗位失败", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
