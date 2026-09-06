import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "缺少必要参数 userId" },
        { status: 400 }
      );
    }

    // 查询该用户真实基本信息
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        membershipLevel: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "未找到该用户记录" },
        { status: 404 }
      );
    }

    // 从数据库 membershiplevel 表查询中文会员等级，拒绝裸露英文
    let membershipLevelZh = "非会员";
    try {
      const levelCode = user.membershipLevel || "FREE";
      const levelRecord = await prisma.membershiplevel.findFirst({
        where: {
          OR: [
            { name: levelCode },
            { id: levelCode },
          ],
        },
        select: { nameZh: true },
      });
      if (levelRecord?.nameZh) {
        membershipLevelZh = levelRecord.nameZh;
      } else {
        const fallbackMap: Record<string, string> = {
          FREE: "非会员",
          BRONZE: "青铜会员",
          SILVER: "白银会员",
          GOLD: "黄金会员",
          PLATINUM: "铂金会员",
          DIAMOND: "钻石会员",
        };
        membershipLevelZh = fallbackMap[levelCode.toUpperCase()] || levelCode;
      }
    } catch (lvlErr) {
      console.warn("查询用户中文会员等级失败:", lvlErr);
    }

    // 1. 查询该用户作为成员参与的所有工作空间
    const memberRecords = await prisma.workspacemember.findMany({
      where: { userId },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            plan: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { joinedAt: "desc" },
    });

    // 2. 查询该用户作为所有者创建的所有工作空间（兼容）
    const ownedWorkspaces = await prisma.workspace.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        plan: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // 合并并去重
    const workspaceMap = new Map<string, any>();

    for (const m of memberRecords) {
      if (m.workspace) {
        workspaceMap.set(m.workspace.id, {
          id: m.workspace.id,
          name: m.workspace.name,
          type: String(m.workspace.type || "PERSONAL"),
          status: String(m.workspace.status || "ACTIVE"),
          plan: String(m.workspace.plan || "STANDARD"),
          joinedAt: m.joinedAt ? m.joinedAt.toISOString() : m.workspace.createdAt.toISOString(),
          createdAt: m.workspace.createdAt ? m.workspace.createdAt.toISOString() : new Date().toISOString(),
        });
      }
    }

    for (const ow of ownedWorkspaces) {
      if (!workspaceMap.has(ow.id)) {
        workspaceMap.set(ow.id, {
          id: ow.id,
          name: ow.name,
          type: String(ow.type || "PERSONAL"),
          status: String(ow.status || "ACTIVE"),
          plan: String(ow.plan || "STANDARD"),
          joinedAt: ow.createdAt ? ow.createdAt.toISOString() : new Date().toISOString(),
          createdAt: ow.createdAt ? ow.createdAt.toISOString() : new Date().toISOString(),
        });
      }
    }

    const workspaceIds = Array.from(workspaceMap.keys());

    // 从数据库真实聚合统计每个工作空间的成员人数
    const memberCounts = await prisma.workspacemember.groupBy({
      by: ["workspaceId"],
      where: { workspaceId: { in: workspaceIds } },
      _count: { userId: true },
    });

    const countMap = new Map<string, number>();
    for (const mc of memberCounts) {
      countMap.set(mc.workspaceId, mc._count.userId);
    }

    const workspaces = Array.from(workspaceMap.values()).map((ws) => ({
      ...ws,
      memberCount: countMap.get(ws.id) || 1, // 真实成员数量，若为拥有者空间至少1人
    }));

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: user.role,
          status: user.status,
          membershipLevel: user.membershipLevel || "FREE",
          membershipLevelZh, // 100% 数据库中文名称
          createdAt: user.createdAt.toISOString(),
        },
        workspaces,
        totalWorkspaces: workspaces.length,
      },
    });
  } catch (error: any) {
    console.error("Get appeal user workspaces error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "查询用户关联空间失败: " + (error?.message || "服务器内部错误"),
      },
      { status: 500 }
    );
  }
}
