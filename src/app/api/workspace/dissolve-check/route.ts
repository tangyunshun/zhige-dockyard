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
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    // 1. 查询工作空间基础信息
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        type: true,
        ownerId: true,
        status: true,
        createdAt: true,
      },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 2. 校验权限：仅所有者 (Owner) 可解散企业空间
    if (workspace.ownerId !== userId) {
      return NextResponse.json({ error: "权限不足：只有空间所有者才可以申请解散该工作空间" }, { status: 403 });
    }

    // 3. 盘点协同团队成员（排除 Owner 本人）
    const otherMembers = await prisma.workspacemember.findMany({
      where: {
        workspaceId,
        userId: { not: userId },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    // 4. 盘点授权组件资产 (使用全系统权威 getBoundComponentCount 同步逻辑)
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
        const categoryName = categoryMap.get(cat.category) || cat.category || "通用资产";
        return {
          id: usage?.id || cat.id,
          componentId: cat.id,
          name: cat.name,
          category: categoryName,
          icon: cat.icon || null,
          updatedAt: usage?.usedAt || new Date(),
        };
      });
    }

    // 5. 盘点待处理邀请函
    const pendingInvitations = await prisma.workspaceinvitation.findMany({
      where: {
        workspaceId,
        status: "PENDING",
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    const formattedMembers = otherMembers.map((m: any) => ({
      id: m.id,
      userId: m.userId,
      name: m.user?.name || "匿名成员",
      email: m.user?.email || "未绑定邮箱",
      avatar: m.user?.avatar || null,
      role: m.role,
      joinedAt: m.joinedAt,
    }));

    const memberCount = formattedMembers.length;
    const assetCount = formattedAssets.length;
    const pendingInvitationCount = pendingInvitations.length;

    // 解散硬判定规则：除 Owner 外无任何协同成员，且无已装配/授权的组件资产
    const canDissolve = memberCount === 0 && assetCount === 0;

    return NextResponse.json({
      success: true,
      canDissolve,
      workspace: {
        id: workspace.id,
        name: workspace.name,
        type: workspace.type,
      },
      summary: {
        memberCount,
        assetCount,
        pendingInvitationCount,
      },
      details: {
        members: formattedMembers,
        assets: formattedAssets,
        pendingInvitations,
      },
      checkTimestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Dissolve check error:", error);
    return NextResponse.json(
      { error: "无法完成企业空间解散合规检测，请稍后重试", details: error?.message },
      { status: 500 }
    );
  }
}
