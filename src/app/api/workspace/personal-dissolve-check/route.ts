import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: authResult.error || "未登录或登录已失效" }, { status: 401 });
    }

    const userId = authResult.user.id;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少个人工作空间 ID" }, { status: 400 });
    }

    // 1. 查询个人工作空间
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        type: true,
        ownerId: true,
        createdAt: true,
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "个人工作空间不存在" }, { status: 404 });
    }

    if (workspace.ownerId !== userId) {
      return NextResponse.json({ error: "只有该个人空间的所有者才可以进行注销检测" }, { status: 403 });
    }

    // 2. 盘点个人组件资产 (与权威 getBoundComponentCount 口径完全对齐)
    const usages = await prisma.componentusage.findMany({
      where: { workspaceId },
      select: { id: true, componentId: true, metadata: true, usedAt: true },
    });

    const boundUsageMap = new Map<string, any>();
    usages.forEach((u: any) => {
      if (!u.metadata) return;
      try {
        const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : (u.metadata as any);
        if (meta && typeof meta.enabled === "boolean" && meta.enabled === true) {
          boundUsageMap.set(u.componentId, u);
        }
      } catch {}
    });

    const boundComponentIds = Array.from(boundUsageMap.keys());
    let formattedAssets: any[] = [];

    if (boundComponentIds.length > 0) {
      const [catalogs, categories] = await Promise.all([
        prisma.componentcatalog.findMany({
          where: { id: { in: boundComponentIds }, isPublished: true },
          select: { id: true, name: true, category: true, icon: true },
        }),
        prisma.componentcategory.findMany({
          select: { key: true, name: true },
        }),
      ]);

      const categoryMap = new Map(categories.map((c: any) => [c.key, c.name]));

      formattedAssets = catalogs.map((cat: any) => {
        const usage = boundUsageMap.get(cat.id);
        const categoryName = categoryMap.get(cat.category) || cat.category || "通用组件";
        return {
          id: usage?.id || cat.id,
          componentId: cat.id,
          name: cat.name,
          category: categoryName,
          icon: cat.icon || null,
          usedAt: usage?.usedAt || new Date(),
        };
      });
    }

    // 3. 盘点该个人空间下的效能任务 (componenttask 表)
    const tasks = await prisma.componenttask.findMany({
      where: { tenantId: workspaceId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        type: true,
        createdAt: true,
      },
    });

    const formattedTasks = tasks.map((task: any) => ({
      id: task.id,
      title: task.name || task.type || "未命名任务",
      status: task.status,
      createdAt: task.createdAt,
    }));

    const activeTaskCount = formattedTasks.filter(
      (t: any) => t.status === "IN_PROGRESS" || t.status === "PENDING"
    ).length;

    const assetCount = formattedAssets.length;
    const totalTaskCount = formattedTasks.length;

    // 个人解散硬标准：未绑定任何已发布且启用的个人组件资产，且无运行中任务
    const canDissolve = assetCount === 0 && activeTaskCount === 0;

    return NextResponse.json({
      success: true,
      canDissolve,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        type: workspace.type,
      },
      summary: {
        assetCount,
        activeTaskCount,
        totalTaskCount,
      },
      details: {
        assets: formattedAssets,
        tasks: formattedTasks,
      },
      checkTimestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Personal dissolve check error:", error);
    return NextResponse.json(
      { error: "无法完成个人空间注销合规检测，请稍后重试", details: error?.message },
      { status: 500 }
    );
  }
}
