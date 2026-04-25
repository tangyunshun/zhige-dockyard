import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
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

    // 获取用户作为管理员或所有者的企业空间
    const workspaces = await prisma.workspace.findMany({
      where: {
        type: "ENTERPRISE",
        OR: [
          { ownerId: userId },
          {
            members: {
              some: {
                userId,
                role: "ADMIN",
              },
            },
          },
        ],
      },
      include: {
        members: {
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
            members: true,
          },
        },
      },
    });

    // 获取用户已生成的邀请码
    const invitations = await prisma.workspaceInvitation.findMany({
      where: {
        createdBy: userId,
        status: "PENDING",
      },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      workspaces: workspaces.map((ws: any) => ({
        id: ws.id,
        name: ws.name,
        type: ws.type,
        memberCount: ws._count.members,
        members: ws.members.map((m: any) => ({
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          avatar: m.user.avatar,
          role: m.role,
        })),
        isOwner: ws.ownerId === userId,
      })),
      invitations: invitations.map((inv: any) => ({
        id: inv.id,
        code: inv.code,
        workspaceId: inv.workspaceId,
        workspaceName: inv.workspace.name,
        email: inv.email,
        role: inv.role,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      })),
    });
  } catch (error) {
    console.error("获取可分享空间列表失败:", error);
    return NextResponse.json(
      { error: "获取可分享空间列表失败" },
      { status: 500 },
    );
  }
}
