import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get("authorization")?.replace("Bearer ", "");
    if (!userId) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const body = await request.json();
    const { invitationCode } = body;

    if (!invitationCode) {
      return NextResponse.json({ error: "缺少邀请码" }, { status: 400 });
    }

    // 查找邀请码
    const invitation = await prisma.workspaceInvitation.findUnique({
      where: { code: invitationCode },
      include: {
        workspace: {
          include: {
            members: true,
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
    if (invitation.email) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user?.email || user.email !== invitation.email) {
        return NextResponse.json(
          { error: "该邀请码不适用于当前用户" },
          { status: 403 },
        );
      }
    }

    // 检查用户是否已经是成员
    const isMember = invitation.workspace.members.some(
      (m) => m.userId === userId,
    );
    if (isMember) {
      return NextResponse.json(
        { error: "您已是该空间成员" },
        { status: 400 },
      );
    }

    // 添加用户到空间
    await prisma.workspaceMember.create({
      data: {
        userId,
        workspaceId: invitation.workspaceId,
        role: invitation.role,
      },
    });

    // 更新邀请码状态
    await prisma.workspaceInvitation.update({
      where: { id: invitation.id },
      data: {
        status: "USED",
        usedAt: new Date(),
        usedBy: userId,
      },
    });

    // 记录操作日志
    await prisma.operationLog.create({
      data: {
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
      message: "已成功加入空间",
      workspace: {
        id: invitation.workspace.id,
        name: invitation.workspace.name,
        type: invitation.workspace.type,
        role: invitation.role,
      },
    });
  } catch (error) {
    console.error("加入空间失败:", error);
    return NextResponse.json({ error: "加入空间失败" }, { status: 500 });
  }
}
