import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET - 获取用户的工作空间列表
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
    const auth = await validateUser(authHeader, req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }
    const userId = auth.user.id;

    // 获取用户拥有或参与的企业空间与个人空间基础列表
    const workspaces = await prisma.workspace.findMany({
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
        description: true,
        logo: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const wsIds = workspaces.map((w) => w.id);

    // 独立批量获取空间配额记录（包含算力点余额与存储限额）
    const quotas = wsIds.length > 0
      ? await prisma.workspacequota.findMany({
          where: { workspaceId: { in: wsIds } },
        })
      : [];
    const quotaMap = new Map(quotas.map((q) => [q.workspaceId, q]));

    // 独立批量统计成员数
    const members = wsIds.length > 0
      ? await prisma.workspacemember.findMany({
          where: { workspaceId: { in: wsIds } },
          select: { workspaceId: true, userId: true },
        })
      : [];
    const memberCountMap = new Map<string, number>();
    members.forEach((m) => {
      memberCountMap.set(m.workspaceId, (memberCountMap.get(m.workspaceId) || 0) + 1);
    });

    // 独立批量统计已装配的组件数
    const components = wsIds.length > 0
      ? await prisma.componentusage.groupBy({
          by: ["workspaceId"],
          where: { workspaceId: { in: wsIds } },
          _count: { componentId: true },
        })
      : [];
    const componentCountMap = new Map<string, number>();
    components.forEach((c) => {
      if (c.workspaceId) {
        componentCountMap.set(c.workspaceId, c._count.componentId);
      }
    });

    // 组装纯净的业务对象，杜绝任何未转换的 BigInt 进入响应序列化
    const enrichedWorkspaces = workspaces.map((ws) => {
      const q = quotaMap.get(ws.id);
      const tokenBalance = q?.tokenBalance ? Number(q.tokenBalance) : 0;
      const storageUsed = q?.storageUsed ? Number(q.storageUsed) : 0;
      const storageLimit = q?.storageLimit ? Number(q.storageLimit) : 1073741824;
      const memberCount = memberCountMap.get(ws.id) || 1;
      const componentCount = componentCountMap.get(ws.id) || 5;

      return {
        id: ws.id,
        name: ws.name,
        type: ws.type,
        ownerId: ws.ownerId,
        description: ws.description,
        logo: ws.logo,
        createdAt: ws.createdAt,
        updatedAt: ws.updatedAt,
        memberCount,
        componentCount,
        tokenBalance,
        storageUsed,
        storageLimit,
        isOwner: ws.ownerId === userId,
      };
    });

    // 使用安全 replacer 进行深度 BigInt 兜底
    const safeData = JSON.parse(
      JSON.stringify(
        {
          success: true,
          data: enrichedWorkspaces,
        },
        (key, value) => (typeof value === "bigint" ? Number(value) : value)
      )
    );

    return NextResponse.json(safeData);
  } catch (error) {
    console.warn("Get user workspaces error:", error);
    return NextResponse.json(
      { error: "获取用户工作空间列表失败" },
      { status: 500 }
    );
  }
}

// PUT - 更新用户工作空间
export async function PUT(req: NextRequest) {
  try {
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }
    const userId = auth.user.id;

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("id");
    const { name, description } = await req.json();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "缺少工作空间 ID" },
        { status: 400 }
      );
    }

    // 验证用户是否有权限更新该工作空间
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "工作空间不存在" },
        { status: 404 }
      );
    }

    if (workspace.ownerId !== userId) {
      return NextResponse.json(
        { error: "无权更新该工作空间" },
        { status: 403 }
      );
    }

    // 更新工作空间
    const updatedWorkspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        name: name || workspace.name,
        description: description !== undefined ? description : workspace.description,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedWorkspace,
      message: "工作空间已更新",
    });
  } catch (error) {
    console.error("Update workspace error:", error);
    return NextResponse.json(
      { error: "更新工作空间失败" },
      { status: 500 }
    );
  }
}

// DELETE - 删除用户工作空间（级联清理关联数据，避免外键约束报错）
export async function DELETE(req: NextRequest) {
  try {
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json(
        { error: "未授权访问" },
        { status: 401 }
      );
    }
    const userId = auth.user.id;

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "缺少工作空间 ID" },
        { status: 400 }
      );
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json(
        { error: "工作空间不存在" },
        { status: 404 }
      );
    }

    if (workspace.ownerId !== userId) {
      return NextResponse.json(
        { error: "无权删除该工作空间" },
        { status: 403 }
      );
    }

    // 级联清理关联数据（componentusage / conversation 仅建立普通索引，不会随 workspace 级联删除）
    await prisma.workspacequota.deleteMany({ where: { workspaceId } });
    await prisma.workspacemember.deleteMany({ where: { workspaceId } });
    await prisma.componentusage.deleteMany({ where: { workspaceId } });
    await prisma.conversation.deleteMany({ where: { workspaceId } });
    await prisma.workspacepost.deleteMany({ where: { workspaceId } });
    await prisma.workspace.delete({ where: { id: workspaceId } });

    return NextResponse.json({
      success: true,
      message: "工作空间已删除",
    });
  } catch (error) {
    console.error("Delete workspace error:", error);
    return NextResponse.json(
      { error: "删除工作空间失败" },
      { status: 500 }
    );
  }
}
