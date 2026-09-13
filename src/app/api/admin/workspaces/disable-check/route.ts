import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 1. 验证管理员权限
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const currentUserId = auth.user.id;
    const currentUser = await prisma.user.findUnique({
      where: { id: currentUserId },
      select: { id: true, role: true },
    });

    if (!currentUser || !isAdminRole(currentUser.role)) {
      return NextResponse.json({ error: "权限不足，仅管理员可执行合规检测" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间ID" }, { status: 400 });
    }

    // 2. 查询工作空间基础信息
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json({ error: "目标工作空间不存在" }, { status: 404 });
    }

    // 独立查询工作空间所有者（Owner）信息，确保对齐 Prisma 模式结构
    const owner = await prisma.user.findUnique({
      where: { id: workspace.ownerId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        avatar: true,
      },
    });

    // 3. 特殊安全保护检查：超级管理员与系统管理员自身的工作空间受保护不可停用
    if (
      owner?.role === "SUPER_ADMIN" ||
      owner?.role === "ADMIN" ||
      workspace.ownerId === currentUserId
    ) {
      return NextResponse.json({
        success: true,
        canDisable: false,
        isProtected: true,
        blockReason: "超级管理员与系统管理员的工作空间受系统安全保护，不可停用管控",
        memberCount: 0,
        members: [],
        componentCount: 0,
        components: [],
      });
    }

    // 4. 盘点协同团队成员（排除 Owner 本人）
    const otherMembers = await prisma.workspacemember.findMany({
      where: {
        workspaceId,
        userId: { not: workspace.ownerId },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            avatar: true,
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    const formattedMembers = otherMembers.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt,
      name: m.user?.name || "未知成员",
      email: m.user?.email || null,
      phone: m.user?.phone || null,
      avatar: m.user?.avatar || null,
    }));

    // 5. 盘点装配组件资产 (以 componentusage 绑定且 enabled 为准)
    const usages = await prisma.componentusage.findMany({
      where: { workspaceId },
      select: { id: true, componentId: true, metadata: true, usedAt: true },
    });

    const boundUsageMap = new Map<string, any>();
    usages.forEach((u: any) => {
      if (!u.metadata) return;
      try {
        const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : u.metadata;
        if (meta && meta.enabled === true) {
          boundUsageMap.set(u.componentId, u);
        }
      } catch {}
    });

    const boundComponentIds = Array.from(boundUsageMap.keys());
    let formattedComponents: Array<{
      id: string;
      name: string;
      category: string;
      icon: string | null;
    }> = [];

    if (boundComponentIds.length > 0) {
      const [catalogs, categories] = await Promise.all([
        prisma.componentcatalog.findMany({
          where: { id: { in: boundComponentIds } },
          select: { id: true, name: true, category: true, icon: true },
        }),
        prisma.componentcategory.findMany({
          select: { key: true, name: true },
        }),
      ]);

      const categoryMap = new Map(categories.map((c: any) => [c.key, c.name]));

      formattedComponents = catalogs.map((cat: any) => ({
        id: cat.id,
        name: cat.name || "未命名组件",
        category: categoryMap.get(cat.category) || cat.category || "通用算力",
        icon: cat.icon || null,
      }));
    }

    // 补充检测：空间内是否有运行中的 componenttask
    if (formattedComponents.length === 0) {
      const allMemberIds = [workspace.ownerId, ...otherMembers.map((m) => m.userId)];
      const tasks = await prisma.componenttask.findMany({
        where: { userId: { in: allMemberIds } },
        select: { id: true, name: true, type: true, icon: true },
        take: 20,
      });

      if (tasks.length > 0) {
        const typeIds = Array.from(new Set(tasks.map((t) => t.type).filter(Boolean)));
        const catList = typeIds.length
          ? await prisma.componentcatalog.findMany({
              where: { id: { in: typeIds } },
              select: { id: true, name: true, category: true, icon: true },
            })
          : [];
        const catMap = new Map(catList.map((c) => [c.id, c]));

        formattedComponents = tasks.map((t) => {
          const catalog = catMap.get(t.type);
          return {
            id: t.id,
            name: catalog?.name || t.name,
            category: catalog?.category || "运行组件",
            icon: catalog?.icon || t.icon || null,
          };
        });
      }
    }

    const memberCount = formattedMembers.length;
    const componentCount = formattedComponents.length;

    // 核心前置判定逻辑：空间内不得有协同成员，也不得有装配组件
    const canDisable = memberCount === 0 && componentCount === 0;

    let blockReason: string | null = null;
    if (!canDisable) {
      const reasons: string[] = [];
      if (memberCount > 0) {
        reasons.push(`空间内仍有 ${memberCount} 位协同成员`);
      }
      if (componentCount > 0) {
        reasons.push(`空间内仍装配有 ${componentCount} 个组件资产`);
      }
      blockReason = `检测到${reasons.join("且")}。为保障数据资产与成员权益，系统已自动阻断停用操作。请先在工作空间内移出协同成员并卸载装配组件后再执行停用管控。`;
    }

    return NextResponse.json({
      success: true,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        type: workspace.type,
        status: workspace.status,
        owner,
      },
      canDisable,
      memberCount,
      members: formattedMembers,
      componentCount,
      components: formattedComponents,
      blockReason,
    });
  } catch (error) {
    console.error("Workspace disable pre-check error:", error);
    return NextResponse.json(
      {
        error: "执行工作空间停用合规检测失败",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
