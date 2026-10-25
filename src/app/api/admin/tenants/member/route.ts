import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { isSuperAdminRole } from "@/lib/role-utils";

/**
 * 企业空间「成员明细」抽屉数据。围绕单个成员在某企业空间内的行为：
 *   - taskOverview：componenttask（已带 workspaceId）按状态归类 -> 真正「本空间」的任务状态
 *   - components：该成员在本空间使用的组件清单（按调用次数），可搜索/翻页
 *   - operations：该成员在本空间的操作流水（严格 userId+workspaceId），可翻页
 * task 与 components/operations 各自独立翻页。
 */

const roleLabel: Record<string, string> = {
  OWNER: "空间所有者",
  ADMIN: "管理员",
  MEMBER: "普通成员",
};

export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const me = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!me || !isSuperAdminRole(me.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = (searchParams.get("workspaceId") || "").trim();
    const userId = (searchParams.get("userId") || "").trim();
    const tab = (searchParams.get("tab") || "components").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(parseInt(searchParams.get("limit") || "8", 10), 50);
    const search = (searchParams.get("search") || "").trim();
    const skip = (page - 1) * limit;

    if (!workspaceId || !userId) {
      return NextResponse.json({ error: "缺少 workspaceId 或 userId" }, { status: 400 });
    }

    const member = await prisma.workspacemember.findFirst({
      where: { workspaceId, userId },
      include: { user: { select: { name: true, email: true, avatar: true } } },
    });
    if (!member) {
      return NextResponse.json({ error: "该成员不在此企业空间" }, { status: 404 });
    }
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true },
    });

    const profile = {
      workspaceId,
      workspaceName: ws?.name || "",
      userId,
      name: member.user?.name || null,
      email: member.user?.email,
      avatar: member.user?.avatar || null,
      role: member.role,
      roleLabel: roleLabel[member.role] || member.role,
      joinedAt: member.joinedAt,
    };

    const actionCategory = (searchParams.get("actionCategory") || "ALL").trim();
    const componentCategory = (searchParams.get("componentCategory") || "ALL").trim();

    // 任务概览（按本空间 + 本成员）。状态机：RUNNING(进行中) -> SUCCESS / FAILED
    // 兼容 workspaceId 与历史 tenantId 关联
    const taskRows = await prisma.componenttask.findMany({
      where: {
        userId,
        OR: [{ workspaceId }, { tenantId: workspaceId }],
      },
      select: { status: true },
    });
    const taskOverview = { running: 0, success: 0, failed: 0 };
    taskRows.forEach((t: any) => {
      const s = (t.status || "").toString().toLowerCase();
      if (s.includes("run") || s.includes("process") || s.includes("progress") || s.includes("pending") || s.includes("queue")) {
        taskOverview.running += 1;
      } else if (s.includes("fail") || s.includes("error")) {
        taskOverview.failed += 1;
      } else {
        taskOverview.success += 1;
      }
    });
    const taskTotal = taskOverview.running + taskOverview.success + taskOverview.failed;
    const successRate = taskTotal > 0 ? Math.round((taskOverview.success / taskTotal) * 100) : 0;

    // 使用组件（本空间 + 本成员）
    const usageRows = await prisma.componentusage.findMany({
      where: { workspaceId, userId },
      select: { componentId: true },
    });
    const byComp = new Map<string, number>();
    usageRows.forEach((u: any) => byComp.set(u.componentId, (byComp.get(u.componentId) || 0) + 1));
    const compIds = [...byComp.keys()];
    const compRows = compIds.length
      ? await prisma.componentcatalog.findMany({
          where: { id: { in: compIds } },
          select: {
            id: true,
            name: true,
            category: true,
            description: true,
            icon: true,
            detail: true,
            isPublished: true,
            usageCount: true,
            estimatedModelTokens: true,
            tags: true,
            createdAt: true,
            updatedAt: true,
          },
        })
      : [];
    const compMetaMap = new Map(compRows.map((c: any) => [c.id, c]));
    let compList = [...byComp.entries()].map(([componentId, count]) => {
      const meta = compMetaMap.get(componentId);
      return {
        componentId,
        name: meta?.name || componentId,
        category: meta?.category || "GENERAL",
        description: meta?.description || null,
        icon: meta?.icon || "Cpu",
        detail: meta?.detail || null,
        isPublished: meta?.isPublished ?? true,
        usageCount: meta?.usageCount || 0,
        estimatedModelTokens: meta?.estimatedModelTokens || 0,
        tags: meta?.tags || null,
        type: meta?.category || "tool",
        createdAt: meta?.createdAt ? meta.createdAt.toISOString() : null,
        updatedAt: meta?.updatedAt ? meta.updatedAt.toISOString() : null,
        count,
      };
    });
    if (componentCategory && componentCategory !== "ALL") {
      compList = compList.filter((c) => (c.category || "GENERAL") === componentCategory);
    }
    if (search && tab === "components") {
      const q = search.toLowerCase();
      compList = compList.filter((c) => c.name.toLowerCase().includes(q) || (c.category && c.category.toLowerCase().includes(q)));
    }
    compList.sort((a, b) => b.count - a.count);
    const compTotal = compList.length;
    const compMax = compList.length ? compList[0].count : 0;
    const compItems = compList.slice(skip, skip + limit);

    // 操作记录（本空间 + 本成员）
    const opWhere: any = { workspaceId, userId };
    if (actionCategory === "TASK") {
      opWhere.action = { in: ["COMPONENT_EXECUTE", "TASK_CREATE", "TASK_RUN"] };
    } else if (actionCategory === "WORKSPACE") {
      opWhere.action = { in: ["workspace:view_detail", "workspace:update", "workspace:create", "workspace:status_update", "UPGRADE_PERSONAL_TO_ENTERPRISE"] };
    } else if (actionCategory === "SECURITY") {
      opWhere.action = { in: ["TENANT_DISABLE", "TENANT_ENABLE", "UPDATE_MEMBER_ROLE", "workspace:delete"] };
    }
    if (search && tab === "operations") {
      const q = search.trim();
      opWhere.OR = [
        { action: { contains: q } },
        { resource: { contains: q } },
      ];
    }
    const opTotal = await prisma.operationlog.count({ where: opWhere });
    const opRows = await prisma.operationlog.findMany({
      where: opWhere,
      include: { user: { select: { name: true, email: true, avatar: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    });
    const opItems = opRows.map((o: any) => ({
      id: o.id,
      action: o.action,
      resource: o.resource || null,
      ipAddress: o.ipAddress || null,
      userName: o.user?.name || o.user?.email || null,
      userAvatar: o.user?.avatar || null,
      createdAt: o.createdAt,
      details: o.details,
    }));

    return NextResponse.json({
      success: true,
      data: {
        profile,
        taskOverview: { ...taskOverview, total: taskTotal, successRate },
        components: {
          items: compItems,
          total: compTotal,
          page,
          totalPages: Math.ceil(compTotal / limit),
          maxCount: compMax,
          totalCalls: usageRows.length,
        },
        operations: {
          items: opItems,
          total: opTotal,
          page,
          totalPages: Math.ceil(opTotal / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get tenant member detail error:", error);
    return NextResponse.json(
      {
        error: "获取成员明细失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
