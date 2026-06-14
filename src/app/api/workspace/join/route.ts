import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!userId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await request.json();
    const { invitationCode } = body;

    if (!invitationCode) {
      return NextResponse.json({ error: "缺少邀请码" }, { status: 400 });
    }

    // 验证邀请码
    const invitation = await prisma.workspaceinvitation.findUnique({
      where: { code: invitationCode },
      include: {
        workspace: {
          include: {
            workspacemember: true,
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
        { error: "邀请码已被使用" },
        { status: 400 },
      );
    }

    if (invitation.status === "EXPIRED") {
      return NextResponse.json(
        { error: "邀请码已过期" },
        { status: 400 },
      );
    }

    // 检查有效期
    if (invitation.expiresAt && new Date() > invitation.expiresAt) {
      await prisma.workspaceinvitation.update({
        where: { id: invitation.id },
        data: {
          status: "EXPIRED",
          updatedAt: new Date(),
        },
      });
      return NextResponse.json(
        { error: "邀请码已过期" },
        { status: 400 },
      );
    }

    // 验证邮箱
    if (invitation.email) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user?.email || user.email !== invitation.email) {
        return NextResponse.json(
          { error: "邀请码指定的邮箱与当前用户不匹配" },
          { status: 403 },
        );
      }
    }

    // 检查用户是否已是成员
    const isMember = invitation.workspace.workspacemember.some(
      (m) => m.userId === userId,
    );
    if (isMember) {
      return NextResponse.json(
        { error: "您已经是该工作空间的成员" },
        { status: 400 },
      );
    }

    // 添加成员
    await prisma.workspacemember.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        workspaceId: invitation.workspaceId,
        role: invitation.role,
      },
    });

    // 更新邀请码状态
    await prisma.workspaceinvitation.update({
      where: { id: invitation.id },
      data: {
        status: "USED",
        usedAt: new Date(),
        usedBy: userId,
        updatedAt: new Date(),
      },
    });

    // 记录操作日志
    await prisma.operationlog.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        workspaceId: invitation.workspaceId,
        action: "JOIN_WORKSPACE",
        resource: "Workspace",
        details: {
          workspaceName: invitation.workspace.name,
          invitationCode: invitation.code,
          role: invitation.role,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "加入工作空间成功",
      workspace: {
        id: invitation.workspace.id,
        name: invitation.workspace.name,
        type: invitation.workspace.type,
        role: invitation.role,
      },
    });
  } catch (error) {
    console.warn("加入工作空间错误:", error);
    return NextResponse.json({ error: "加入工作空间失败" }, { status: 500 });
  }
}
