import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdminRole } from "@/lib/auth";
import { getStandardPostsFromDB } from "@/app/api/admin/posts/standard/route";

export const dynamic = "force-dynamic";

// 校验空间管理员权限辅助函数
async function verifyWorkspaceAdmin(userId: string, workspaceId: string) {
  // 先查是否是全局管理员
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  if (user && isAdminRole(user.role)) {
    return true;
  }

  // 查空间成员角色
  const member = await prisma.workspacemember.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId,
      },
    },
    select: { role: true },
  });

  return member && (member.role === "OWNER" || member.role === "ADMIN");
}

// GET: 获取平台建议的标准岗位列表（标记当前空间是否已装配）
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    // 1. 获取平台启用的标准岗位（排除系统保留岗位，如空间所有者）
    const standardPosts = await getStandardPostsFromDB();
    const activePosts = standardPosts.filter((p) => p.status === "ACTIVE" && !p.isSystemReserved);

    // 2. 获取当前空间已存在的岗位名称
    const existingPosts = await prisma.workspacepost.findMany({
      where: { workspaceId },
      select: { id: true, name: true },
    });

    const existingNameSet = new Set(existingPosts.map((p) => p.name));

    // 3. 组合返回
    const suggestedPosts = activePosts.map((sp) => ({
      id: sp.id,
      name: sp.name,
      code: sp.code,
      description: sp.description,
      color: sp.color,
      isImported: existingNameSet.has(sp.name),
    }));

    return NextResponse.json({
      success: true,
      suggestedPosts,
      totalSuggested: activePosts.length,
      importedCount: suggestedPosts.filter((p) => p.isImported).length,
    });
  } catch (error) {
    console.error("获取平台建议岗位失败:", error);
    return NextResponse.json({ error: "获取建议岗位失败" }, { status: 500 });
  }
}

// POST: 企业空间一键批量导入平台建议岗位
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, postIds } = body;

    if (!workspaceId || !Array.isArray(postIds) || postIds.length === 0) {
      return NextResponse.json({ error: "缺少工作空间ID或待导入岗位列表" }, { status: 400 });
    }

    // 权限校验
    const hasPermission = await verifyWorkspaceAdmin(auth.user.id, workspaceId);
    if (!hasPermission) {
      return NextResponse.json({ error: "权限不足，仅空间管理员可导入岗位" }, { status: 403 });
    }

    // 1. 获取全部标准岗位
    const standardPosts = await getStandardPostsFromDB();
    const targetPosts = standardPosts.filter(
      (p) => postIds.includes(p.id) && p.status === "ACTIVE" && !p.isSystemReserved
    );

    if (targetPosts.length === 0) {
      return NextResponse.json({ error: "未找到有效的待导入标准岗位" }, { status: 400 });
    }

    // 2. 获取当前空间已存在的岗位
    const existingPosts = await prisma.workspacepost.findMany({
      where: { workspaceId },
      select: { name: true },
    });
    const existingNameSet = new Set(existingPosts.map((p) => p.name));

    // 3. 过滤出尚未导入的岗位
    const toCreatePosts = targetPosts.filter((p) => !existingNameSet.has(p.name));

    if (toCreatePosts.length === 0) {
      return NextResponse.json({
        success: true,
        message: "所选岗位在当前工作空间中已全部存在，无需重复导入",
        importedCount: 0,
      });
    }

    // 4. 获取平台所有组件目录，以便为新导入的岗位赋默认可用权限
    const components = await prisma.componentcatalog.findMany({
      select: { id: true },
    });

    const createdIds: string[] = [];

    // 5. 循环创建各岗位并初始化权限
    for (const item of toCreatePosts) {
      const newPostId = crypto.randomUUID();
      createdIds.push(newPostId);

      await prisma.workspacepost.create({
        data: {
          id: newPostId,
          workspaceId,
          name: item.name,
          description: item.description || null,
          color: item.color || "#3182ce",
          createdBy: auth.user.id,
          updatedAt: new Date(),
        },
      });

      // 批量创建组件权限记录（默认赋予查看与执行权限）
      if (components.length > 0) {
        await prisma.componentpermission.createMany({
          data: components.map((comp) => ({
            id: crypto.randomUUID(),
            postId: newPostId,
            componentId: comp.id,
            canView: true,
            canEdit: false,
            canDelete: false,
            canExecute: true,
            updatedAt: new Date(),
          })),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `成功为企业空间一键导入 ${toCreatePosts.length} 个标准岗位！`,
      importedCount: toCreatePosts.length,
      createdNames: toCreatePosts.map((p) => p.name),
    });
  } catch (error) {
    console.error("一键导入标准岗位失败:", error);
    return NextResponse.json({ error: "一键导入岗位失败" }, { status: 500 });
  }
}
