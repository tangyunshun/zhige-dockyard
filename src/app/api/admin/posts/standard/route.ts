import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/security";
import {
  getStandardPostsFromDB,
  getPostNameAliasMap,
  getPostCodeAliasMap,
  rowToItem,
  computeStandardPostUsageStats,
  type StandardPostItem,
} from "@/lib/standard-posts";

export const dynamic = "force-dynamic";

// GET: 获取全平台官方标准岗位列表（附带企业空间装配引用详情：具体空间与在编人数）
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    // 标准岗位目录为全平台公共参考数据：超管后台与企业空间（OWNER/ADMIN）均需读取以完成一键装配引入，
    // 故 GET 仅需登录态即可访问；写操作（POST/PATCH/DELETE）仍严格限定平台管理员。
    // 1. 读取标准岗位（platformstandardpost 表）并计算真实装配统计
    //    （共享口径见 lib/standard-posts：空间侧岗位详情与后台完全一致，零硬编码零估算）
    const standardPosts = await getStandardPostsFromDB();
    const { statsByPostId, usageRows: allUsageRows, totalWorkspaces, workspacesWithPosts } =
      await computeStandardPostUsageStats(standardPosts);

    const postsWithStats = standardPosts.map((post) => {
      const stat = statsByPostId.get(post.id);
      return {
        ...post,
        usageCount: stat?.usageCount || 0,
        totalAssignedMembers: stat?.totalAssignedMembers || 0,
        usedWorkspaces: stat?.usedWorkspaces || [],
      };
    });

    // 计算全平台在编成员总数
    const totalAssignedMembersAll = postsWithStats.reduce(
      (sum, p) => sum + (p.totalAssignedMembers || 0),
      0
    );

    // 8. 读取企业空间提报岗位记录
    const { getSubmittedPostsFromDB } = await import("@/lib/workspace-post-submissions");
    const submissions = await getSubmittedPostsFromDB();

    return NextResponse.json({
      success: true,
      posts: postsWithStats,
      usages: allUsageRows,
      submissions,
      pendingSubmissionsCount: submissions.filter((s) => s.status === "PENDING").length,
      stats: {
        totalPosts: standardPosts.length,
        activePosts: standardPosts.filter((p) => p.status === "ACTIVE").length,
        disabledPosts: standardPosts.filter((p) => p.status === "DISABLED").length,
        totalWorkspaces,
        workspacesWithPosts,
        totalWorkspacePosts: allUsageRows.length,
        totalAssignedMembers: totalAssignedMembersAll,
        pendingSubmissions: submissions.filter((s) => s.status === "PENDING").length,
      },
    });
  } catch (error) {
    console.error("获取标准岗位列表失败:", error);
    return NextResponse.json({ error: "获取标准岗位列表失败" }, { status: 500 });
  }
}

// POST: 管理员新增标准岗位
export async function POST(request: NextRequest) {
  try {
    // 严格校验标准岗位创建权限（无权直接阻断）
    const authCheck = await requirePlatformPermission(request, "post:create");
    if (!authCheck.authorized) {
      // requirePlatformPermission 契约：失败时返回 errorResponse
      return authCheck.errorResponse || NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const body = await request.json();
    const { name, code, description, color, icon, status, sortOrder } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "岗位名称不能为空" }, { status: 400 });
    }

    // 查重：岗位名称不能重复（表字段唯一）
    const existing = await prisma.platformstandardpost.findUnique({
      where: { name: name.trim() },
    });
    if (existing) {
      return NextResponse.json({ error: "已存在同名的标准岗位" }, { status: 400 });
    }

    const nextSortOrder =
      typeof sortOrder === "number"
        ? sortOrder
        : (await prisma.platformstandardpost.count()) + 1;

    const row = await prisma.platformstandardpost.create({
      data: {
        id: `std_post_${Date.now()}`,
        name: name.trim(),
        code: (code && code.trim()) ? code.trim().toUpperCase() : `POST_${Date.now()}`,
        description: description ? description.trim() : "",
        color: color || "#3182ce",
        icon: icon && /^[A-Z][A-Za-z0-9]*$/.test(icon) ? icon : "UserRound",
        status: status === "DISABLED" ? "DISABLED" : "ACTIVE",
        sortOrder: nextSortOrder,
        isWorkspaceDefault: false,
        isSystemReserved: false,
      },
    });

    return NextResponse.json({
      success: true,
      post: rowToItem(row),
      message: "标准岗位添加成功",
    });
  } catch (error) {
    console.error("新增标准岗位失败:", error);
    return NextResponse.json({ error: "新增标准岗位失败" }, { status: 500 });
  }
}

// PATCH: 管理员编辑标准岗位 / 切换状态
export async function PATCH(request: NextRequest) {
  try {
    // 严格校验标准岗位更新与启停分发权限（无权直接阻断）
    const authCheck = await requirePlatformPermission(request, "post:update", "post:toggle", "post:status_update");
    if (!authCheck.authorized) {
      // requirePlatformPermission 契约：失败时返回 errorResponse
      return authCheck.errorResponse || NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, code, description, color, icon, status, sortOrder } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少岗位ID" }, { status: 400 });
    }

    const existing = await prisma.platformstandardpost.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "未找到该标准岗位" }, { status: 404 });
    }

    // 若修改了名称，检查是否与其他岗位重名
    if (name && name.trim() !== existing.name) {
      const dup = await prisma.platformstandardpost.findUnique({ where: { name: name.trim() } });
      if (dup && dup.id !== id) {
        return NextResponse.json({ error: "已存在同名岗位" }, { status: 400 });
      }
    }

    // 停用门禁：若请求停用该岗位，必须检查是否正被企业空间运用（被空间运用的岗位严禁停用）
    if (status === "DISABLED") {
      const aliasMap = await getPostNameAliasMap();
      const codeAliasMap = await getPostCodeAliasMap();
      const aliases = aliasMap[existing.name] || [];
      const targetNames = [existing.name, ...aliases];

      const matchingWorkspacePostsCount = await prisma.workspacepost.count({
        where: {
          name: { in: targetNames },
        },
      });

      let matchingMembersCount = 0;
      if (existing.code) {
        const postCodeUpper = existing.code.toUpperCase();
        const codeAliases = Array.from(codeAliasMap.get(postCodeUpper) || []);
        const targetRoles = [postCodeUpper, ...codeAliases];

        // 空间成员角色 (workspacemember.role) 在数据库中为枚举类型 workspacemember_role (OWNER | ADMIN | MEMBER)
        // 需过滤出合法的枚举成员方可执行 Prisma 查询，避免传递业务岗位代码（如 DEVOPS_ENG）触发 PrismaClientValidationError 异常
        const validEnumRoles = targetRoles.filter((r): r is "OWNER" | "ADMIN" | "MEMBER" =>
          r === "OWNER" || r === "ADMIN" || r === "MEMBER"
        );

        if (validEnumRoles.length > 0) {
          matchingMembersCount = await prisma.workspacemember.count({
            where: {
              role: { in: validEnumRoles },
            },
          });
        }
      }

      if (matchingWorkspacePostsCount > 0 || matchingMembersCount > 0) {
        return NextResponse.json(
          {
            error: `该标准岗位已被企业空间运用（存在空间岗位配置或在编成员），系统禁止停用！请先在【企业空间岗位应用一览】中解除相关空间引用后再尝试停用。`,
          },
          { status: 400 }
        );
      }
    }

    const row = await prisma.platformstandardpost.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(code !== undefined ? { code: code.trim().toUpperCase() } : {}),
        ...(description !== undefined ? { description: description.trim() } : {}),
        ...(color !== undefined ? { color } : {}),
        ...(icon !== undefined ? { icon: icon || null } : {}),
        ...(status !== undefined ? { status: status === "DISABLED" ? "DISABLED" : "ACTIVE" } : {}),
        ...(typeof sortOrder === "number" ? { sortOrder } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      post: rowToItem(row),
      message: "标准岗位更新成功",
    });
  } catch (error) {
    console.error("更新标准岗位失败:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新标准岗位失败" },
      { status: 500 }
    );
  }
}

// DELETE: 删除标准岗位
export async function DELETE(request: NextRequest) {
  try {
    // 严格校验标准岗位删除权限（高危操作，无权直接阻断）
    const authCheck = await requirePlatformPermission(request, "post:delete");
    if (!authCheck.authorized) {
      // requirePlatformPermission 契约：失败时返回 errorResponse
      return authCheck.errorResponse || NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少岗位ID" }, { status: 400 });
    }

    const targetPost = await prisma.platformstandardpost.findUnique({ where: { id } });
    if (!targetPost) {
      return NextResponse.json({ error: "未找到该标准岗位" }, { status: 404 });
    }

    // 系统保留岗位（如空间所有者）禁止删除，避免破坏新空间默认装配
    if (targetPost.isSystemReserved) {
      return NextResponse.json(
        { error: "系统保留岗位不允许删除，仅可停用" },
        { status: 403 }
      );
    }

    await prisma.platformstandardpost.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "标准岗位已删除",
    });
  } catch (error) {
    console.error("删除标准岗位失败:", error);
    return NextResponse.json({ error: "删除标准岗位失败" }, { status: 500 });
  }
}
