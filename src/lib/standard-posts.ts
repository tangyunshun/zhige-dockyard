import { prisma } from "@/lib/prisma";

/**
 * 全平台官方标准岗位（platformstandardpost 表）的读取与别名归集工具。
 *
 * 说明：这些函数原先定义在 app/api/admin/posts/standard/route.ts 内并导出，
 * 导致 Next.js 路由文件出现「导出非 HTTP handler」的生成类型校验错误
 * （route.ts 只允许导出 handler 与路由段配置）。故统一抽离到本 lib 模块：
 *  - 管理后台：/api/admin/posts/standard/route.ts
 *  - 工作空间：/api/workspace/posts/suggested/route.ts
 * 两处均从本模块导入。
 */

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

export function rowToItem(row: StandardPostRow): StandardPostItem {
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

/** 单个标准岗位的全平台装配统计（真实数据库归集，无任何估算） */
export interface StandardPostUsageStat {
  usageCount: number;
  totalAssignedMembers: number;
  usedWorkspaces: { id: string; name: string; type: string; memberCount: number }[];
}

/** 装配引用明细行（供后台「岗位应用一览」消费） */
export interface StandardPostUsageRow {
  id: string;
  postId: string;
  postName: string;
  postCode: string;
  postColor: string;
  workspaceId: string;
  workspaceName: string;
  workspaceType: string;
  memberCount: number;
}

/**
 * 计算一组标准岗位的全平台装配统计（与后台岗位页、空间侧岗位详情完全同一口径）：
 * 双源归集——空间成员角色（workspacemember.role 经 position/code 别名匹配）
 * + 空间专属岗位（workspacepost，按名称/别名匹配，在编数严格取 postmember 真实计数）。
 */
export async function computeStandardPostUsageStats(posts: StandardPostItem[]): Promise<{
  statsByPostId: Map<string, StandardPostUsageStat>;
  usageRows: StandardPostUsageRow[];
  totalWorkspaces: number;
  workspacesWithPosts: number;
}> {
  const [aliasMap, codeAliasMap, allWorkspaces, allWorkspaceMembers, dbPositions, allWorkspacePosts] =
    await Promise.all([
      getPostNameAliasMap(),
      getPostCodeAliasMap(),
      prisma.workspace.findMany({ select: { id: true, name: true, type: true } }),
      prisma.workspacemember.findMany({ select: { workspaceId: true, userId: true, role: true } }),
      prisma.position.findMany({ select: { id: true, code: true, name: true } }),
      prisma.workspacepost.findMany({
        include: {
          workspace: { select: { id: true, name: true, type: true } },
          _count: { select: { postmember: true } },
        },
      }),
    ]);

  const workspaceMap = new Map(allWorkspaces.map((w) => [w.id, w]));
  const dbPositionMap = new Map(dbPositions.map((p) => [p.code.toUpperCase(), p.name]));

  const statsByPostId = new Map<string, StandardPostUsageStat>();
  const usageRows: StandardPostUsageRow[] = [];
  const referencedWorkspaceIds = new Set<string>();

  for (const post of posts) {
    const postAliases = aliasMap[post.name];
    const aliasList = (postAliases && postAliases.length > 0 ? postAliases : [post.name]).map((a) =>
      a.toLowerCase()
    );
    const postCodeUpper = (post.code || "").toUpperCase();
    const matchedMap = new Map<string, { id: string; name: string; type: string; memberCount: number }>();

    // 1. 空间成员角色归集（role 经 position 名称 / code 别名匹配标准岗位）
    allWorkspaceMembers.forEach((m) => {
      const ws = workspaceMap.get(m.workspaceId);
      if (!ws) return;

      const roleUpper = (m.role || "").trim().toUpperCase();
      const roleName = (dbPositionMap.get(roleUpper) || "").trim().toLowerCase();
      const postNameLower = post.name.trim().toLowerCase();

      const isCodeMatch =
        Boolean(roleUpper) &&
        (roleUpper === postCodeUpper || (codeAliasMap.get(postCodeUpper)?.has(roleUpper) ?? false));
      const isNameMatch =
        Boolean(roleName) && (roleName === postNameLower || aliasList.includes(roleName));

      if (isCodeMatch || isNameMatch) {
        referencedWorkspaceIds.add(ws.id);
        const prev = matchedMap.get(ws.id);
        matchedMap.set(ws.id, {
          id: ws.id,
          name: ws.name || "未命名空间",
          type: ws.type || "ENTERPRISE",
          memberCount: (prev?.memberCount || 0) + 1,
        });
      }
    });

    // 2. 空间专属岗位归集（在编成员数严格取真实 postmember 计数，0 就是 0）
    allWorkspacePosts.forEach((wp) => {
      if (!wp.workspace) return;
      const wpNameLower = (wp.name || "").trim().toLowerCase();
      const postNameLower = post.name.trim().toLowerCase();
      const isMatched =
        Boolean(wpNameLower) && (wpNameLower === postNameLower || aliasList.includes(wpNameLower));

      if (isMatched) {
        referencedWorkspaceIds.add(wp.workspace.id);
        const prev = matchedMap.get(wp.workspace.id);
        const count = wp._count?.postmember ?? 0;
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

    statsByPostId.set(post.id, {
      usageCount: usedWorkspaces.length,
      totalAssignedMembers,
      usedWorkspaces,
    });

    usedWorkspaces.forEach((ws) => {
      usageRows.push({
        id: `${post.id}_${ws.id}`,
        postId: post.id,
        postName: post.name,
        postCode: post.code,
        postColor: post.color,
        workspaceId: ws.id,
        workspaceName: ws.name,
        workspaceType: ws.type,
        memberCount: ws.memberCount,
      });
    });
  }

  return {
    statsByPostId,
    usageRows,
    totalWorkspaces: allWorkspaces.length,
    workspacesWithPosts: referencedWorkspaceIds.size,
  };
}
