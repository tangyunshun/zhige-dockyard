import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";
import type { workspacemember_role } from "@prisma/client";

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
    // 1. 严格校验岗位装配记录维护权限点（无权直接阻断）
    const permCheck = await requirePlatformPermission(request, "post:update");
    if (!permCheck.authorized) {
      return permCheck.errorResponse || NextResponse.json({ error: "无权限维护岗位装配记录" }, { status: 403 });
    }
    // 2. 验证管理员权限
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

      // 3.1 查找该 workspace 下同名/含名的 workspacepost，收集可删除的岗位 id
      const deletablePostIds: string[] = [];
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
          deletablePostIds.push(wp.id);
        }
      }

      // 3.2 单事务原子执行：岗位记录 + 成员关联 + 组件授权一并删除，成员角色安全重置同事务提交。
      // 避免此前「岗位已删、成员重置报错」导致的半完成状态（表现为提示删除失败，但数据实际已删）。
      const codeUpper = targetPostCode ? targetPostCode.toUpperCase() : "";
      // workspacemember.role 是受限枚举（OWNER/ADMIN/MEMBER）；岗位代号（如 FRONTEND_ENGINEER）
      // 不是合法角色值，直接传入会触发 Prisma 枚举校验报错并导致整个删除失败。
      // 历史上仅 ADMIN/MEMBER 曾被当作角色值使用，因此仅对合法角色值做安全重置，其余代号跳过。
      const LEGACY_MEMBER_ROLES = new Set(["ADMIN", "MEMBER"]);
      const shouldResetMembers =
        Boolean(codeUpper) &&
        codeUpper !== "OWNER" &&
        codeUpper !== "CREATOR" &&
        LEGACY_MEMBER_ROLES.has(codeUpper);

      if (deletablePostIds.length > 0 || shouldResetMembers) {
        await prisma.$transaction(async (tx) => {
          if (deletablePostIds.length > 0) {
            await tx.postmember.deleteMany({ where: { postId: { in: deletablePostIds } } });
            await tx.componentpermission.deleteMany({ where: { postId: { in: deletablePostIds } } });
            await tx.workspacepost.deleteMany({ where: { id: { in: deletablePostIds } } });
            deletedWorkspacePostsCount += deletablePostIds.length;
          }
          if (shouldResetMembers) {
            const updateResult = await tx.workspacemember.updateMany({
              where: {
                workspaceId,
                // 历史兼容：岗位代号曾被直接当作空间成员角色使用，此处仅做类型收窄，保持原查询语义不变
                role: codeUpper as unknown as workspacemember_role,
              },
              data: {
                role: "MEMBER",
              },
            });
            resetMembersCount += updateResult.count;
          }
        });
      }

      processedWorkspaces.add(workspaceId);
    }

    await writeAuditLog(auth.user?.id || null, "post:usage_remove", { items: items.length, deletedWorkspacePostsCount, resetMembersCount, workspacesCount: processedWorkspaces.size }, null, null, request);

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
