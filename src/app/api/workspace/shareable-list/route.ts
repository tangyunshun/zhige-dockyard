import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);
    
    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const userId = authResult.user!.id;

    // 获取用户可分享的企业空间列表
    const workspaces = await prisma.workspace.findMany({
      where: {
        type: "ENTERPRISE",
        OR: [
          { ownerId: userId },
          {
            workspacemember: {
              some: {
                userId,
                role: "ADMIN",
              },
            },
          },
        ],
      },
      include: {
        workspacemember: {
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
        },
        _count: {
          select: {
            workspacemember: true,
          },
        },
      },
    });

    // 获取该用户所管理的所有企业空间已生成的邀请码列表
    const workspaceIds = workspaces.map(ws => ws.id);

    // 物理清理过期超一月（30天）的废弃邀请记录
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    await prisma.workspaceinvitation.deleteMany({
      where: {
        workspaceId: { in: workspaceIds },
        expiresAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    const invitations = await prisma.workspaceinvitation.findMany({
      where: {
        workspaceId: { in: workspaceIds },
      },
      include: {
        workspace: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    // 查询这些企业空间的加入协作成员操作日志
    const joinLogs = await prisma.operationlog.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        action: "JOIN_WORKSPACE",
      },
    });

    // 内存中以 invitationCode 作为 Key 累加计数
    const codeCounts: Record<string, number> = {};
    joinLogs.forEach((log) => {
      const details = log.details as any;
      if (details && typeof details === "object" && details.invitationCode) {
        const code = details.invitationCode;
        codeCounts[code] = (codeCounts[code] || 0) + 1;
      }
    });

    // 将 joinedCount 动态绑定到邀请对象中返回前端
    const invitationsWithCount = invitations.map((inv) => ({
      ...inv,
      joinedCount: codeCounts[inv.code] || 0,
    }));

    return NextResponse.json({
      success: true,
      data: workspaces,
      invitations: invitationsWithCount,
    });
  } catch (error) {
    console.error("Get shareable workspaces error:", error);
    return NextResponse.json({ error: "获取可分享空间列表失败" }, { status: 500 });
  }
}
