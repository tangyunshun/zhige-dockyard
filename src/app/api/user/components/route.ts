import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { ensureDefaultComponents } from "@/lib/workspaceInit";
import { getLogicalWorkspaceRolesBatch } from "@/lib/security";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CategoryMeta {
  key: string;
  name: string;
  color: string;
  range: string;
  sortOrder: number;
}

function toUserComponentView(
  c: any,
  contractLifecycle: string | null = null,
  catMeta?: CategoryMeta,
  workspaceMeta?: {
    workspaceId: string;
    workspaceName: string;
    workspaceType: string;
    workspaceTaskCount: number;
    enabledInWorkspace: boolean;
  },
) {
  const chineseCategory = catMeta?.name || c.category || "未分类";
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    // category 字段直接返回数据库 component_category 表的中文名称，杜绝前端出现英文枚举代号
    category: chineseCategory,
    categoryKey: c.category,
    categoryName: chineseCategory,
    categoryColor: catMeta?.color || "#3182ce",
    categoryRange: catMeta?.range || "",
    icon: c.icon || "Box",
    contract: c.contract || "参数 ➜ 输出",
    status: c.isPublished ? "PUBLISHED" : "DRAFT",
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    usageCount: c.usageCount,
    isPremium: c.isPremium,
    estimatedModelTokens: c.estimatedModelTokens,
    // 所属工作空间信息（按空间独立配置展示）
    workspaceId: workspaceMeta?.workspaceId || null,
    workspaceName: workspaceMeta?.workspaceName || null,
    workspaceType: workspaceMeta?.workspaceType || null,
    workspaceTaskCount: workspaceMeta?.workspaceTaskCount ?? 0,
    enabledInWorkspace: workspaceMeta?.enabledInWorkspace ?? true,
    // 合同就绪状态（数据库唯一真源）：前端据此如实展示可执行性，禁止硬编码完成态
    activeContractLifecycle: contractLifecycle,
    hasActiveContract: Boolean(c.activeContractId),
    contractReady: contractLifecycle === "PUBLISHED",
    hasPublishedContract: contractLifecycle === "PUBLISHED",
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const userId = auth.user.id;

    // 1. 查询当前用户拥有的或参与的所有工作空间（与 /api/user/workspaces 口径完全一致）
    const [rawWorkspaces, myMemberRecords, categoryRows, publishedComponents] = await Promise.all([
      prisma.workspace.findMany({
        where: {
          OR: [
            { ownerId: userId },
            { workspacemember: { some: { userId } } },
          ],
        },
        select: {
          id: true,
          name: true,
          type: true,
          ownerId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [{ type: "asc" }, { createdAt: "desc" }],
      }),
      prisma.workspacemember.findMany({
        where: { userId },
        select: { workspaceId: true, role: true },
      }),
      prisma.componentcategory.findMany({
        orderBy: { sortOrder: "asc" },
      }),
      prisma.componentcatalog.findMany({
        where: { isPublished: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      }),
    ]);

    // 过滤他人私密个人空间
    const validWorkspaces = rawWorkspaces.filter(
      (ws) => ws.type !== "PERSONAL" || ws.ownerId === userId,
    );
    const wsIds = validWorkspaces.map((w) => w.id);

    // 确保各空间默认装配组件已自愈初始化（与空间中枢一致）
    await Promise.all(
      wsIds.map((wsId) => ensureDefaultComponents(wsId, userId).catch(() => {})),
    );

    // 2. 构建数据库分类中文字典 (key -> { name, color, range, sortOrder })
    const categoryMap = new Map<string, CategoryMeta>();
    categoryRows.forEach((cat) => {
      categoryMap.set(cat.key.trim().toUpperCase(), {
        key: cat.key,
        name: cat.name,
        color: cat.color || "#3182ce",
        range: cat.range || "",
        sortOrder: cat.sortOrder || 0,
      });
    });

    // 3. 批量读取激活合同生命周期、各空间组件绑定记录、各空间真实任务执行次数与逻辑角色
    const activeIds = publishedComponents
      .map((c) => c.activeContractId)
      .filter((x): x is string => Boolean(x));

    const [contractRows, usages, taskGroups, logicalRoleMap] = await Promise.all([
      activeIds.length
        ? prisma.componentcontract.findMany({
            where: { id: { in: activeIds } },
            select: { id: true, lifecycle: true },
          })
        : Promise.resolve([]),
      wsIds.length > 0
        ? prisma.componentusage.findMany({
            where: { workspaceId: { in: wsIds } },
            select: { workspaceId: true, componentId: true, metadata: true },
          })
        : Promise.resolve([]),
      wsIds.length > 0
        ? prisma.componenttask
            .groupBy({
              by: ["workspaceId", "type"],
              where: { workspaceId: { in: wsIds } },
              _count: { id: true },
            })
            .catch(() => [])
        : Promise.resolve([]),
      wsIds.length > 0 ? getLogicalWorkspaceRolesBatch(userId, wsIds) : Promise.resolve(new Map()),
    ]);

    const lifecycleMap = new Map(contractRows.map((r) => [r.id, r.lifecycle as string]));
    const publishedMap = new Map(publishedComponents.map((c) => [c.id.trim().toUpperCase(), c]));
    const memberRoleMap = new Map(myMemberRecords.map((m) => [m.workspaceId, m.role]));

    // 统计每个空间下各组件的真实任务执行次数
    const wsCompTaskCountMap = new Map<string, number>();
    (taskGroups as any[]).forEach((g) => {
      if (g.workspaceId && g.type) {
        const key = `${g.workspaceId}::${String(g.type).trim().toUpperCase()}`;
        wsCompTaskCountMap.set(key, Number(g._count?.id || 0));
      }
    });

    // 解析每个工作空间已配置（装配）的组件集合（与 /api/studio?action=bound 100% 同源）
    const wsBoundMap = new Map<string, Map<string, boolean>>();
    usages.forEach((u) => {
      if (!u.workspaceId || !u.metadata) return;
      const compId = u.componentId.trim().toUpperCase();
      if (!publishedMap.has(compId)) return;
      let enabled = true;
      let hasEnabledMark = false;
      try {
        const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : (u.metadata as any);
        if (meta && typeof meta.enabled === "boolean") {
          enabled = meta.enabled;
          hasEnabledMark = true;
        }
      } catch {
        hasEnabledMark = true;
      }
      if (hasEnabledMark && enabled) {
        const map = wsBoundMap.get(u.workspaceId) || new Map<string, boolean>();
        map.set(compId, enabled);
        wsBoundMap.set(u.workspaceId, map);
      }
    });

    // 4. 组装按工作空间分开显示的组件列表
    const workspaceGroups = validWorkspaces.map((ws) => {
      const isOwner = ws.ownerId === userId;
      const role = isOwner
        ? "OWNER"
        : (logicalRoleMap.get(ws.id) || memberRoleMap.get(ws.id) || "MEMBER");
      const boundMap = wsBoundMap.get(ws.id) || new Map<string, boolean>();
      const boundIds = Array.from(boundMap.keys());

      const wsComponents = boundIds
        .map((id) => publishedMap.get(id))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((c) => {
          const catMeta = categoryMap.get((c.category || "").trim().toUpperCase());
          const lifecycle = c.activeContractId ? (lifecycleMap.get(c.activeContractId) ?? null) : null;
          const wsTaskCount =
            wsCompTaskCountMap.get(`${ws.id}::${c.id.trim().toUpperCase()}`) || 0;
          return toUserComponentView(c, lifecycle, catMeta, {
            workspaceId: ws.id,
            workspaceName: ws.name,
            workspaceType: ws.type,
            workspaceTaskCount: wsTaskCount,
            enabledInWorkspace: boundMap.get(c.id.trim().toUpperCase()) ?? true,
          });
        });

      return {
        id: ws.id,
        name: ws.name,
        type: ws.type,
        role,
        isOwner,
        status: ws.status || "ACTIVE",
        componentCount: wsComponents.length,
        totalUsageCount: wsComponents.reduce((sum, item) => sum + (item.usageCount || 0), 0),
        totalWorkspaceTasks: wsComponents.reduce((sum, item) => sum + (item.workspaceTaskCount || 0), 0),
        components: wsComponents,
      };
    });

    // 默认扁平列表（默认取第一个工作空间或跨空间去重已装配组件，保障向后兼容）
    const defaultList =
      workspaceGroups.length > 0
        ? workspaceGroups[0].components
        : publishedComponents.slice(0, 20).map((c) => {
            const catMeta = categoryMap.get((c.category || "").trim().toUpperCase());
            const lifecycle = c.activeContractId ? (lifecycleMap.get(c.activeContractId) ?? null) : null;
            return toUserComponentView(c, lifecycle, catMeta);
          });

    return NextResponse.json({
      success: true,
      data: defaultList,
      workspaces: workspaceGroups,
      categories: Array.from(categoryMap.values()),
    });
  } catch (error) {
    console.warn("Get user components error:", error);
    return NextResponse.json({ error: "获取组件失败" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  void req;
  return NextResponse.json(
    { error: "组件目录由平台后台统一管理，请在“平台后台 > 组件管理”中维护" },
    { status: 403 },
  );
}

export async function DELETE(req: NextRequest) {
  void req;
  return NextResponse.json(
    { error: "组件目录由平台后台统一管理，请在“平台后台 > 组件管理”中维护" },
    { status: 403 },
  );
}
