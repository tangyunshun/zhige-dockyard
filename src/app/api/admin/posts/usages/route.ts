import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface DeleteUsageItem {
  workspaceId: string;
  postId?: string;
  postName?: string;
  postCode?: string;
}

/**
 * DELETE: 管理员解除/删除企业空间岗位应用（支持单个与批量）
 * 业务规则：
 * 1. 严格限定管理员角色（SUPER_ADMIN / ADMIN / PLATFORM_ADMIN）；
 * 2. 空间所有者等系统根基岗位强制保护，不可移除；
 * 3. 级联清理工作空间下的 workspacepost 记录、成员关联 (postmember) 与组件授权 (componentpermission)；
 * 4. 若空间成员 (workspacemember) 的 role 是该岗位代码或别名，安全重置为普通成员角色 (MEMBER)，彻底断开引用。
 */
export async function DELETE(request: NextRequest) {
  try {
    // 1. 验证管理员权限
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const admin = await prisma.user.findUnique({
      where: { id: auth.user.id },
      select: { role: true },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "权限不足，仅管理员可执行该操作" }, { status: 403 });
    }

    // 2. 解析请求体（支持批量 items 数组或单项字段）
    let items: DeleteUsageItem[] = [];
    const url = new URL(request.url);

    // 优先读取 body
    try {
      const body = await request.json();
      if (Array.isArray(body.items)) {
        items = body.items;
      } else if (body.workspaceId) {
        items = [
          {
            workspaceId: body.workspaceId,
            postId: body.postId,
            postName: body.postName,
            postCode: body.postCode,
          },
        ];
      }
    } catch {
      // 若无 json body，尝试从 query param 解析
      const workspaceId = url.searchParams.get("workspaceId");
      const postId = url.searchParams.get("postId");
      const postName = url.searchParams.get("postName");
      const postCode = url.searchParams.get("postCode");
      if (workspaceId) {
        items = [{ workspaceId, postId: postId || undefined, postName: postName || undefined, postCode: postCode || undefined }];
      }
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "缺少待删除的企业空间岗位应用项" }, { status: 400 });
    }

    // 读取标准岗位以补全 postName / postCode / isSystemReserved
    const allStandardPosts = await prisma.platformstandardpost.findMany({
      select: { id: true, name: true, code: true, isSystemReserved: true },
    });
    const standardPostMap = new Map(allStandardPosts.map((p) => [p.id, p]));

    let deletedWorkspacePostsCount = 0;
    let resetMembersCount = 0;
    const processedWorkspaces = new Set<string>();

    // 3. 事务处理每个应用项的物理安全解绑
    for (const item of items) {
      const { workspaceId } = item;
      if (!workspaceId) continue;

      let targetPostName = item.postName;
      let targetPostCode = item.postCode;

      if (item.postId && standardPostMap.has(item.postId)) {
        const std = standardPostMap.get(item.postId)!;
        targetPostName = targetPostName || std.name;
        targetPostCode = targetPostCode || std.code;
        if (std.isSystemReserved || std.name === "空间所有者") {
          continue; // 跳过系统根基保护岗位
        }
      }

      if (targetPostName && (targetPostName === "空间所有者" || targetPostName === "所有者")) {
        continue; // 永久锁定
      }

      // 3.1 查找并删除该 workspace 下同名的 workspacepost
      if (targetPostName) {
        const matchingWorkspacePosts = await prisma.workspacepost.findMany({
          where: {
            workspaceId,
            OR: [
              { name: targetPostName },
              { name: { contains: targetPostName } },
            ],
          },
          select: { id: true, name: true, isSystem: true },
        });

        for (const wp of matchingWorkspacePosts) {
          if (wp.isSystem || wp.name === "空间所有者") continue;

          await prisma.$transaction([
            prisma.postmember.deleteMany({ where: { postId: wp.id } }),
            prisma.componentpermission.deleteMany({ where: { postId: wp.id } }),
            prisma.workspacepost.delete({ where: { id: wp.id } }),
          ]);
          deletedWorkspacePostsCount++;
        }
      }

      // 3.2 查找并将绑定了该岗位代码作为角色的空间成员安全重置
      if (targetPostCode) {
        const codeUpper = targetPostCode.toUpperCase();
        if (codeUpper !== "OWNER" && codeUpper !== "CREATOR") {
          const updateResult = await prisma.workspacemember.updateMany({
            where: {
              workspaceId,
              role: codeUpper,
            },
            data: {
              role: "MEMBER",
            },
          });
          resetMembersCount += updateResult.count;
        }
      }

      processedWorkspaces.add(workspaceId);
    }

    return NextResponse.json({
      success: true,
      message: `企业空间岗位应用已成功移除（已解绑 ${processedWorkspaces.size} 个空间的岗位装配）`,
      details: {
        deletedWorkspacePostsCount,
        resetMembersCount,
        workspacesCount: processedWorkspaces.size,
      },
    });
  } catch (error: any) {
    console.error("删除企业空间岗位应用失败:", error);
    return NextResponse.json(
      { error: "移除企业空间岗位应用失败", details: error?.message || String(error) },
      { status: 500 }
    );
  }
}
