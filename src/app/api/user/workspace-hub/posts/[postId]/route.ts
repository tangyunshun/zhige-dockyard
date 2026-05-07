import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { COMPONENTS } from "@/constants/components";
import { hasPermission, PermissionAction, ResourceType } from "@/constants/roles";

/**
 * 获取岗位详细信息
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const postId = searchParams.get("postId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    if (!postId) {
      return NextResponse.json({ error: "缺少岗位 ID" }, { status: 400 });
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

    // 获取岗位信息
    const post = await prisma.workspacePost.findUnique({
      where: { id: postId },
      include: {
        members: {
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
        componentPermissions: true,
      },
    });

    if (!post) {
      return NextResponse.json({ error: "岗位不存在" }, { status: 404 });
    }

    // 获取所有组件
    const allComponents = COMPONENTS;

    // 构建权限矩阵
    const permissionMatrix = allComponents.map(component => ({
      ...component,
      canView: post.componentPermissions.some(
        cp => cp.componentId === component.id && cp.canView
      ),
      canEdit: post.componentPermissions.some(
        cp => cp.componentId === component.id && cp.canEdit
      ),
      canDelete: post.componentPermissions.some(
        cp => cp.componentId === component.id && cp.canDelete
      ),
      canExecute: post.componentPermissions.some(
        cp => cp.componentId === component.id && cp.canExecute
      ),
    }));

    return NextResponse.json({
      success: true,
      data: {
        post: {
          id: post.id,
          name: post.name,
          description: post.description,
          color: post.color,
          isDefault: post.isDefault,
          isSystem: post.isSystem,
          members: post.members.map(m => ({
            id: m.id,
            user: m.user,
            assignedAt: m.assignedAt,
          })),
        },
        permissionMatrix,
      },
    });
  } catch (error) {
    console.error("Get post details error:", error);
    return NextResponse.json({ error: "获取岗位详情失败" }, { status: 500 });
  }
}
