import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/security";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // 严格校验工作空间详情查阅权限（workspace:detail 或 workspace:read）
    const authCheck = await requirePlatformPermission(request, "workspace:detail", "workspace:read");
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const { id: workspaceId } = await params;
    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        workspacemember: {
          include: {
            user: {
              select: { name: true, email: true },
            },
          },
        },
        _count: {
          select: { workspacemember: true },
        },
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    const quota = await prisma.workspacequota.findUnique({
      where: { workspaceId: workspace.id },
      select: {
        tokenBalance: true,
        storageUsed: true,
        storageLimit: true,
        apiCallsUsed: true,
        apiCallsLimit: true,
      },
    });

    // 查询该工作空间在 componentusage 中装配启用的真实组件资产
    const usages = await prisma.componentusage.findMany({
      where: { workspaceId: workspace.id },
      select: { componentId: true, metadata: true },
    });

    const boundComponentIdSet = new Set<string>();
    usages.forEach((u) => {
      if (!u.componentId) return;
      let enabled = true;
      if (u.metadata) {
        try {
          const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : u.metadata;
          if (meta && meta.enabled === false) enabled = false;
        } catch {}
      }
      if (enabled) {
        boundComponentIdSet.add(u.componentId);
      }
    });

    const boundComponentIds = Array.from(boundComponentIdSet);
    let componentList: any[] = [];

    if (boundComponentIds.length > 0) {
      const [catalogs, categories] = await Promise.all([
        prisma.componentcatalog.findMany({
          where: { id: { in: boundComponentIds } },
          select: { id: true, name: true, icon: true, category: true, usageCount: true },
        }),
        prisma.componentcategory.findMany({
          select: { key: true, name: true },
        }),
      ]);
      const catMap = new Map(categories.map((c) => [c.key, c.name]));
      componentList = catalogs.map((c) => ({
        id: c.id,
        name: c.name,
        icon: c.icon || null,
        catalogId: c.id,
        category: catMap.get(c.category) || c.category || "通用算力",
        usageCount: c.usageCount || 0,
      }));
    }

    const componentCountValue = componentList.length;

    const { workspacemember, ...workspaceBase } = workspace;
    const isEnterprise = workspace.type === "ENTERPRISE";

    return NextResponse.json({
      success: true,
      data: {
        workspace: {
          ...workspaceBase,
          componentCount: componentCountValue,
          members: workspacemember.map((m) => ({
            ...m,
            monthlyTokenLimit: m.monthlyTokenLimit ? Number(m.monthlyTokenLimit) : null,
            monthlyTokenUsed: Number(m.monthlyTokenUsed || 0),
          })),
          _count: {
            workspacemember: workspace._count.workspacemember,
            members: workspace._count.workspacemember,
          },
          quota: {
            tokenBalance: quota ? Number(quota.tokenBalance) : 0,
            storageUsed: Number(quota?.storageUsed || 0),
            storageLimit: Number(
              quota?.storageLimit ||
                (isEnterprise ? 10 * 1024 * 1024 * 1024 : 1024 * 1024 * 1024),
            ),
            apiCallsUsed: Number(quota?.apiCallsUsed || 0),
            apiCallsLimit: Number(quota?.apiCallsLimit || (isEnterprise ? 50000 : 1000)),
          },
          components: componentList,
        },
      },
    });
  } catch (error) {
    console.error("Get workspace detail error:", error);
    return NextResponse.json(
      {
        error: "获取工作空间详情失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // 严格校验工作空间状态更新权限（无权直接阻断）
    const authCheck = await requirePlatformPermission(request, "workspace:status_update");
    if (!authCheck.authorized) {
      return NextResponse.json({ error: authCheck.error }, { status: authCheck.status });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");
    const status = searchParams.get("status");

    if (!workspaceId || !status) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    if (!["ACTIVE", "DISABLED"].includes(status)) {
      return NextResponse.json({ error: "无效的状态值" }, { status: 400 });
    }

    // 检查工作空间是否存在
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 只能对企业空间进行操作
    if (workspace.type !== "ENTERPRISE") {
      return NextResponse.json(
        { error: "只能对企业空间进行状态切换" },
        { status: 400 },
      );
    }

    // 更新状态
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { status: status as "ACTIVE" | "DISABLED" },
    });

    return NextResponse.json({
      success: true,
      message: `工作空间已${status === "ACTIVE" ? "启用" : "禁用"}`,
    });
  } catch (error) {
    console.error("Toggle workspace status error:", error);
    return NextResponse.json(
      {
        error: "切换工作空间状态失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
