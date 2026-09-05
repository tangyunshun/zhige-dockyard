import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 全平台官方标准岗位仅存于 platformstandardpost 数据表，运行时代码不保留任何岗位数据。
export interface StandardPostItem {
  id: string;
  name: string;
  code: string;
  description: string;
  color: string;
  icon: string | null;
  status: "ACTIVE" | "DISABLED";
  sortOrder: number;
  isWorkspaceDefault: boolean;
  isSystemReserved: boolean;
  createdAt: string;
  updatedAt: string;
}

interface StandardPostRow {
  id: string;
  name: string;
  code: string;
  description: string | null;
  color: string;
  icon: string | null;
  status: string;
  sortOrder: number;
  isWorkspaceDefault: boolean;
  isSystemReserved: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function rowToItem(row: StandardPostRow): StandardPostItem {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    description: row.description || "",
    color: row.color || "#3182ce",
    icon: row.icon || null,
    status: row.status === "DISABLED" ? "DISABLED" : "ACTIVE",
    sortOrder: row.sortOrder || 0,
    isWorkspaceDefault: row.isWorkspaceDefault || false,
    isSystemReserved: row.isSystemReserved || false,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

// 从数据库读取全平台官方标准岗位列表
export async function getStandardPostsFromDB(): Promise<StandardPostItem[]> {
  const rows = await prisma.platformstandardpost.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(rowToItem);
}

// 从数据库读取岗位名称别名表（用于空间岗位名称 -> 标准岗位名称归集匹配）
export async function getPostNameAliasMap(): Promise<Record<string, string[]>> {
  const rows = await prisma.postalias.findMany();
  const map: Record<string, string[]> = {};
  for (const r of rows) {
    if (!map[r.postName]) map[r.postName] = [];
    map[r.postName].push(r.alias);
  }
  return map;
}

// 从数据库读取岗位 code 别名表（用于空间成员角色 code -> 标准岗位 code 归集匹配）
export async function getPostCodeAliasMap(): Promise<Map<string, Set<string>>> {
  const rows = await prisma.postcodealias.findMany();
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = r.postCode.toUpperCase();
    const set = map.get(key) || new Set<string>();
    set.add(r.roleCode.toUpperCase());
    map.set(key, set);
  }
  return map;
}

// GET: 获取全平台官方标准岗位列表（附带企业空间装配引用详情：具体空间与在编人数）
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    // 标准岗位目录为全平台公共参考数据：超管后台与企业空间（OWNER/ADMIN）均需读取以完成一键装配引入，
    // 故 GET 仅需登录态即可访问；写操作（POST/PATCH/DELETE）仍严格限定平台管理员。
    // 1. 读取标准岗位（platformstandardpost 表）
    const standardPosts = await getStandardPostsFromDB();

    // 2. 读取岗位别名（postalias / postcodealias 表）
    const aliasMap = await getPostNameAliasMap();
    const codeAliasMap = await getPostCodeAliasMap();

    // 3. 查询全平台工作空间基准信息（含西安云舜科技等企业协同空间）
    const allWorkspaces = await prisma.workspace.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
      },
    });
    const workspaceMap = new Map(allWorkspaces.map((w) => [w.id, w]));

    // 4. 查询全平台空间成员岗位配置（workspacemember）
    const allWorkspaceMembers = await prisma.workspacemember.findMany({
      select: {
        workspaceId: true,
        userId: true,
        role: true,
      },
    });

    // 5. 查询数据库标准岗位代码映射
    const dbPositions = await prisma.position.findMany({
      select: { id: true, code: true, name: true },
    });
    const dbPositionMap = new Map(dbPositions.map((p) => [p.code.toUpperCase(), p.name]));

    // 6. 查询空间专属岗位配置（workspacepost，若空间进行了自定义装配）
    const allWorkspacePosts = await prisma.workspacepost.findMany({
      include: {
        workspace: {
          select: { id: true, name: true, type: true, description: true },
        },
        _count: {
          select: { postmember: true },
        },
      },
    });

    // 7. 统计全平台各企业空间对岗位的引用明细（联合 member 与 post 两大来源）
    const uniqueWorkspacesWithPosts = new Set<string>();
    const allUsageRows: Array<{
      id: string;
      postName: string;
      postCode: string;
      postColor: string;
      workspaceId: string;
      workspaceName: string;
      workspaceType: string;
      memberCount: number;
    }> = [];

    const postsWithStats = standardPosts.map((post) => {
      const postAliases = aliasMap[post.name];
      const aliasList = (postAliases && postAliases.length > 0 ? postAliases : [post.name]).map((a) =>
        a.toLowerCase()
      );
      const postCodeUpper = (post.code || "").toUpperCase();
      const matchedMap = new Map<
        string,
        { id: string; name: string; type: string; memberCount: number }
      >();

      // 7.1 从空间成员 role / position 归集引用（支持西安云舜科技等真实企业空间）
      allWorkspaceMembers.forEach((m) => {
        const ws = workspaceMap.get(m.workspaceId);
        if (!ws) return;

        const roleUpper = (m.role || "").toUpperCase();
        const roleName = (dbPositionMap.get(roleUpper) || "").toLowerCase();
        const postNameLower = post.name.toLowerCase();

        // 岗位 code 精确匹配：同 code 直连 + code 别名表（如 OWNER<->CREATOR、PROJECT_MANAGER<->PM）
        const isCodeMatch =
          roleUpper === postCodeUpper ||
          (codeAliasMap.get(postCodeUpper)?.has(roleUpper) ?? false);

        const isNameMatch =
          roleName === postNameLower ||
          aliasList.includes(roleName) ||
          roleName.includes(postNameLower) ||
          postNameLower.includes(roleName);

        if (isCodeMatch || isNameMatch) {
          uniqueWorkspacesWithPosts.add(ws.id);
          const prev = matchedMap.get(ws.id);
          matchedMap.set(ws.id, {
            id: ws.id,
            name: ws.name || "未命名空间",
            type: ws.type || "ENTERPRISE",
            memberCount: (prev?.memberCount || 0) + 1,
          });
        }
      });

      // 7.2 从空间独立创建的 workspacepost 归集引用
      allWorkspacePosts.forEach((wp) => {
        if (!wp.workspace) return;
        const wpNameLower = wp.name.trim().toLowerCase();
        const postNameLower = post.name.trim().toLowerCase();

        const isMatched =
          wpNameLower === postNameLower ||
          aliasList.includes(wpNameLower) ||
          wpNameLower.includes(postNameLower) ||
          postNameLower.includes(wpNameLower);

        if (isMatched) {
          uniqueWorkspacesWithPosts.add(wp.workspace.id);
          const prev = matchedMap.get(wp.workspace.id);
          const count = wp._count?.postmember || 1;
          matchedMap.set(wp.workspace.id, {
            id: wp.workspace.id,
            name: wp.workspace.name || "未命名空间",
            type: wp.workspace.type || "ENTERPRISE",
            memberCount: (prev?.memberCount || 0) + count,
          });
        }
      });

      const usedWorkspaces = Array.from(matchedMap.values());
      const totalAssignedMembers = usedWorkspaces.reduce((acc, curr) => acc + curr.memberCount, 0);

      // 记录到全局透视列表（供 Tab 2 极简明细表秒速消费）
      usedWorkspaces.forEach((ws) => {
        allUsageRows.push({
          id: `${post.id}_${ws.id}`,
          postName: post.name,
          postCode: post.code,
          postColor: post.color,
          workspaceId: ws.id,
          workspaceName: ws.name,
          workspaceType: ws.type,
          memberCount: ws.memberCount,
        });
      });

      return {
        ...post,
        usageCount: usedWorkspaces.length,
        totalAssignedMembers,
        usedWorkspaces,
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
        totalWorkspaces: allWorkspaces.length,
        workspacesWithPosts: uniqueWorkspacesWithPosts.size,
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
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const admin = await prisma.user.findUnique({
      where: { id: auth.user.id },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
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
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const admin = await prisma.user.findUnique({
      where: { id: auth.user.id },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
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
    return NextResponse.json({ error: "更新标准岗位失败" }, { status: 500 });
  }
}

// DELETE: 删除标准岗位
export async function DELETE(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const admin = await prisma.user.findUnique({
      where: { id: auth.user.id },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
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
