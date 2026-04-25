import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "缺少邀请码" }, { status: 400 });
    }

    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { code },
      include: {
        workspace: {
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
          },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: "邀请码不存在" }, { status: 404 });
    }

    // 检查邀请码状态
    if (invitation.status === "USED") {
      return NextResponse.json(
        { error: "该邀请码已被使用" },
        { status: 400 },
      );
    }

    if (invitation.status === "EXPIRED") {
      return NextResponse.json(
        { error: "该邀请码已过期" },
        { status: 400 },
      );
    }

    // 检查是否过期
    if (invitation.expiresAt && new Date() > invitation.expiresAt) {
      await prisma.workspaceInvitation.update({
        where: { id: invitation.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        { error: "该邀请码已过期" },
        { status: 400 },
      );
    }

    // 检查是否指定了邮箱
    const userId = request.headers.get("authorization")?.replace("Bearer ", "");
    if (invitation.email && userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });
      if (user?.email !== invitation.email) {
        return NextResponse.json(
          { error: "该邀请码不适用于当前用户" },
          { status: 403 },
        );
      }
    }

    // 检查用户是否已经是成员
    if (userId) {
      const isMember = invitation.workspace.members.some(
        (m) => m.userId === userId,
      );
      if (isMember) {
        return NextResponse.json(
          { error: "您已是该空间成员" },
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
          memberCount: invitation.workspace.members.length,
        },
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        createdBy: invitation.createdBy,
      },
    });
  } catch (error) {
    console.error("验证邀请码失败:", error);
    return NextResponse.json(
      { error: "验证邀请码失败" },
      { status: 500 },
    );
  }
}
