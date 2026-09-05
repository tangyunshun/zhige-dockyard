import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { hasPermission, PermissionAction, ResourceType } from "@/constants/roles";

/**
 * 获取岗位详细信息
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await validateUser(request.headers.get("Authorization"), request);
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: authResult.error || "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = authResult.user.id;

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
    const post = await prisma.workspacepost.findUnique({
      where: { id: postId },
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
    });

    if (!post) {
      return NextResponse.json({ error: "岗位不存在" }, { status: 404 });
    }

    // 获取所有组件（唯一数据源：component_catalog 表）
    const allComponents = await prisma.componentcatalog.findMany({
      where: { isPublished: true },
      orderBy: { sortOrder: "asc" },
    });

    // 构建权限矩阵
    const permissionMatrix = allComponents.map(component => ({
      ...component,
      canView: post.componentpermission.some(
        cp => cp.componentId === component.id && cp.canView
      ),
      canEdit: post.componentpermission.some(
        cp => cp.componentId === component.id && cp.canEdit
      ),
      canDelete: post.componentpermission.some(
        cp => cp.componentId === component.id && cp.canDelete
      ),
      canExecute: post.componentpermission.some(
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
          members: post.postmember.map(m => ({
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

/**
 * 移除工作空间岗位
 * 严格门禁：
 * 1. 空间所有者（isSystem 或 name === "空间所有者"）绝对禁止移除；
 * 2. 待移除岗位若仍有勾选绑定任何组件权限（componentpermission 中 canView/canExecute 等），强力阻断，必须先清空权限勾选；
 * 3. 只有满足以上条件方可安全物理移除。
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ postId: string }> | { postId: string } }
) {
  try {
    const authResult = await validateUser(request.headers.get("Authorization"), request);
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = authResult.user.id;

    // 解析路由参数中的 postId
    const resolvedParams = await params;
    const { searchParams } = new URL(request.url);
    const postId = resolvedParams?.postId || searchParams.get("postId");
    const workspaceId = searchParams.get("workspaceId");

    if (!postId || !workspaceId) {
      return NextResponse.json({ error: "缺少岗位 ID 或工作空间 ID" }, { status: 400 });
    }

    // 验证用户在工作空间中的角色（必须为 OWNER 或 ADMIN）
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
    if (userRole !== "OWNER" && userRole !== "ADMIN") {
      return NextResponse.json({ error: "无权移除空间岗位，需要空间所有者或管理员权限" }, { status: 403 });
    }

    // 查找目标岗位
    const post = await prisma.workspacepost.findFirst({
      where: {
        id: postId,
        workspaceId,
      },
      include: {
        componentpermission: true,
      },
    });

    if (!post) {
      return NextResponse.json({ error: "岗位不存在或已被移除" }, { status: 404 });
    }

    // 门禁 1：空间所有者永久锁定，绝对禁止移除
    if (post.isSystem || post.name.trim() === "空间所有者") {
      return NextResponse.json(
        { error: "【空间所有者】为企业空间最高特权根基岗位，系统强制锁定，绝对禁止移除" },
        { status: 400 }
      );
    }

    // 门禁 2：待移除岗位下若仍绑定有组件权限，强力阻断
    const activePermsCount = post.componentpermission.filter(
      p => p.canView || p.canExecute || p.canEdit || p.canDelete
    ).length;

    if (activePermsCount > 0) {
      return NextResponse.json(
        {
          error: `该岗位当前仍绑定配置了 ${activePermsCount} 项组件使用权限。系统严格规定：只有在完全清空该岗位的所有组件权限勾选后，方可执行移除操作。请先在权限矩阵中取消该岗位的所有勾选并保存！`,
          activePermissionsCount: activePermsCount,
        },
        { status: 400 }
      );
    }

    // 校验通过，级联清理并删除岗位
    await prisma.$transaction([
      prisma.postmember.deleteMany({ where: { postId: post.id } }),
      prisma.componentpermission.deleteMany({ where: { postId: post.id } }),
      prisma.workspacepost.delete({ where: { id: post.id } }),
    ]);

    return NextResponse.json({
      success: true,
      message: `岗位【${post.name}】已安全从当前企业空间权限体系中移除`,
      deletedPostId: post.id,
    });
  } catch (error: any) {
    console.error("移除空间岗位错误:", error);
    return NextResponse.json(
      { error: "移除岗位失败", details: error?.message || String(error) },
      { status: 500 }
    );
  }
}
