import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/** GET: 工作空间内部页聚合概览（组件数、成员数、配额、Top 组件） */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    const member = await prisma.workspacemember.findFirst({
      where: { userId, workspaceId },
      include: {
        workspace: {
          include: {
            workspacequota: true,
          },
        },
      },
    });

    const workspace = member?.workspace
      ?? (await prisma.workspace.findFirst({
          where: { id: workspaceId, ownerId: userId },
          include: { workspacequota: true },
        }));

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在或无权访问" }, { status: 404 });
    }

    const role =
      workspace.ownerId === userId
        ? "OWNER"
        : member?.role ?? "MEMBER";

    const [usages, memberCount, completedTasks, inProgressTasks] =
      await Promise.all([
        prisma.componentusage.findMany({
          where: { workspaceId },
          select: { componentId: true, metadata: true },
        }),
        prisma.workspacemember.count({ where: { workspaceId } }),
        prisma.componenttask.count({
          where: { tenantId: workspaceId, status: "COMPLETED" },
        }),
        prisma.componenttask.count({
          where: { tenantId: workspaceId, status: "IN_PROGRESS" },
        }),
      ]);

    const boundIdSet = new Set<string>();
    usages.forEach((u) => {
      if (!u.metadata) return;
      try {
        const meta =
          typeof u.metadata === "string" ? JSON.parse(u.metadata) : (u.metadata as any);
        if (meta && typeof meta.enabled === "boolean") {
          if (meta.enabled) boundIdSet.add(u.componentId);
        }
      } catch {
        boundIdSet.add(u.componentId);
      }
    });
    if (boundIdSet.size === 0) {
      usages.forEach((u) => boundIdSet.add(u.componentId));
    }
    const componentCount = boundIdSet.size;

    const topTasks = await prisma.componenttask.groupBy({
      by: ["type"],
      where: { tenantId: workspaceId },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 3,
    });

    const quota = workspace.workspacequota;

    return NextResponse.json({
      success: true,
      data: {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          type: workspace.type,
          description: workspace.description,
          plan: workspace.plan,
          role,
        },
        stats: {
          componentCount,
          memberCount,
          completedTasks,
          inProgressTasks,
          successRate:
            componentCount > 0
              ? Math.round((completedTasks / componentCount) * 100)
              : 0,
        },
        topComponents: topTasks.map((t) => ({
          componentId: t.type,
          callCount: t._count.id,
        })),
        quota: quota
          ? {
              tokenBalance: Number(quota.tokenBalance),
              storageUsed: Number(quota.storageUsed),
              storageLimit: Number(quota.storageLimit),
              apiCallsUsed: Number(quota.apiCallsUsed),
              apiCallsLimit: Number(quota.apiCallsLimit),
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Workspace overview error:", error);
    return NextResponse.json(
      { error: "获取工作空间概览失败" },
      { status: 500 },
    );
  }
}
