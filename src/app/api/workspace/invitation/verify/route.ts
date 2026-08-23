import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "缺少邀请码" }, { status: 400 });
    }

    const invitation = await prisma.workspaceinvitation.findUnique({
      where: { code },
      include: {
        workspace: {
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
          },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: "邀请码不存在" }, { status: 404 });
    }

    // 检查邀请码状态
    // 1. 检查有效期
    if (invitation.expiresAt && new Date() > invitation.expiresAt) {
      return NextResponse.json({ error: "邀请码已过期" }, { status: 400 });
    }

    // 2. 验证邮箱（身份可选：已登录时用合法 JWT 校验出的真实 userId，未登录时为 null）
    const authResult = await validateUser(request.headers.get("Authorization"), request);
    const userId = authResult.valid && authResult.user ? authResult.user.id : null;
    if (invitation.email && userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });
      if (user?.email !== invitation.email) {
        return NextResponse.json(
          { error: "邀请码指定的邮箱与当前用户不匹配" },
          { status: 403 },
        );
      }
    }

    // 检查工作空间当前的总协同人数配额 (安全配额卡关)
    const currentMemberCount = await prisma.workspacemember.count({
      where: { workspaceId: invitation.workspaceId }
    });

    const spaceOwner = await prisma.user.findUnique({
      where: { id: invitation.workspace.ownerId }
    });

    const levelName = spaceOwner?.membershipLevel || "FREE";
    const levelInfo = await prisma.membershiplevel.findUnique({
      where: { name: levelName }
    });

    const maxTeamSize = levelInfo ? Number(levelInfo.maxTeamSize) : 5;

    if (currentMemberCount >= maxTeamSize) {
      return NextResponse.json(
        { error: `该协作空间的团队协同配额已满（上限 ${maxTeamSize} 人），无法加入。请联系空间所有者升级套餐。` },
        { status: 403 }
      );
    }

    // 检查用户是否已是成员
    if (userId) {
      const isMember = invitation.workspace.workspacemember.some(
        (m) => m.userId === userId,
      );
      if (isMember) {
        return NextResponse.json(
          { error: "您已经是该工作空间的成员" },
          { status: 400 },
        );
      }
    }

    return NextResponse.json({
      valid: true,
      invitation: {
        code: invitation.code,
        workspace: {
          id: invitation.workspace.id,
          name: invitation.workspace.name,
          type: invitation.workspace.type,
          logo: invitation.workspace.logo,
          memberCount: invitation.workspace.workspacemember.length,
        },
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        createdBy: invitation.createdBy,
      },
    });
  } catch (error) {
    console.warn("验证邀请码错误:", error);
    return NextResponse.json(
      { error: "验证邀请码失败" },
      { status: 500 },
    );
  }
}
