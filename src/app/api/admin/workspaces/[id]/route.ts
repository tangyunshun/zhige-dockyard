import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // 验证管理员权限
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
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

    const members = workspace.workspacemember;
    const memberIds = members.map((m) => m.userId);

    const components = await prisma.componenttask.findMany({
      where: { userId: { in: memberIds } },
      select: {
        id: true,
        name: true,
        icon: true,
        type: true,
        usageCount: true,
      },
      orderBy: { usageCount: "desc" },
    });

    // 组件真实名称与图标以组件目录（componentcatalog）为权威来源：
    // componenttask.name 是用户侧任务名（英文标识），componenttask.type 指向 componentcatalog.id
    const catalogTypeIds = Array.from(new Set(components.map((c) => c.type).filter(Boolean)));
    const catalogList = catalogTypeIds.length
      ? await prisma.componentcatalog.findMany({
          where: { id: { in: catalogTypeIds } },
          select: { id: true, name: true, icon: true, category: true },
        })
      : [];
    const catalogMap = new Map(catalogList.map((c) => [c.id, c]));

    const componentList = components.map((c) => {
      const catalog = catalogMap.get(c.type);
      return {
        id: c.id,
        // 优先使用组件目录中的中文名称，缺失时回退到任务名
        name: catalog?.name || c.name,
        // 优先使用组件目录中的图标 key，缺失时回退到任务自身字段
        icon: catalog?.icon || c.icon || null,
        catalogId: catalog?.id || null,
        category: catalog?.category || null,
        usageCount: c.usageCount,
      };
    });

    const componentCountValue = components.length;

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
    // 验证管理员权限
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
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
