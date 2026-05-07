import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

/**
 * 岗位管理 API
 * GET: 获取指定工作空间的所有岗位
 * POST: 创建新岗位
 */

// GET: 获取岗位列表
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

    const adminId = authHeader.replace("Bearer ", "");
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    // 获取工作空间 ID
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    // 获取所有岗位及其成员和权限
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
      orderBy: {
        createdAt: "desc",
      },
    });

    // 格式化返回数据
    const formattedPosts = posts.map((post) => ({
      id: post.id,
      name: post.name,
      description: post.description,
      color: post.color,
      isDefault: post.isDefault,
      isSystem: post.isSystem,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      members: post.postmember.map((pm) => ({
        userId: pm.userId,
        userName: pm.user.name,
        userEmail: pm.user.email,
        userAvatar: pm.user.avatar,
        assignedAt: pm.assignedAt,
      })),
      permissions: post.componentpermission.reduce(
        (acc, perm) => {
          acc[perm.componentId] = {
            canView: perm.canView,
            canEdit: perm.canEdit,
            canDelete: perm.canDelete,
            canExecute: perm.canExecute,
          };
          return acc;
        },
        {} as Record<string, any>
      ),
    }));

    return NextResponse.json({
      success: true,
      posts: formattedPosts,
    });
  } catch (error) {
    console.error("Get posts error:", error);
    return NextResponse.json(
      { error: "获取岗位列表失败" },
      { status: 500 }
    );
  }
}

// POST: 创建新岗位
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

    const adminId = authHeader.replace("Bearer ", "");
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const body = await request.json();
    const { workspaceId, name, description, color } = body;

    // 验证必填字段
    if (!workspaceId || !name) {
      return NextResponse.json(
        { error: "缺少必填字段" },
        { status: 400 }
      );
    }

    // 检查岗位名称是否已存在
    const existingPost = await prisma.workspacepost.findFirst({
      where: {
        workspaceId,
        name,
      },
    });

    if (existingPost) {
      return NextResponse.json(
        { error: "岗位名称已存在" },
        { status: 400 }
      );
    }

    // 创建岗位
    const post = await prisma.workspacepost.create({
      data: {
        workspaceId,
        name,
        description: description || null,
        color: color || "#64748b",
        isDefault: false,
        isSystem: false,
        createdBy: adminId,
      },
    });

    console.log(
      `[创建岗位] 管理员 ${adminId} 在工作空间 ${workspaceId} 创建了岗位 ${post.id}`
    );

    return NextResponse.json({
      success: true,
      post: {
        id: post.id,
        name: post.name,
        description: post.description,
        color: post.color,
      },
      message: "岗位创建成功",
    });
  } catch (error) {
    console.error("Create post error:", error);
    return NextResponse.json(
      { error: "创建岗位失败" },
      { status: 500 }
    );
  }
}
