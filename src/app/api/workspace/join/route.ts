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

    // 1. 检查有效期
    if (invitation.expiresAt && new Date() > invitation.expiresAt) {
      return NextResponse.json({ error: "邀请码已过期" }, { status: 400 });
    }

    // 2. 验证邮箱
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

    // 3. 检查当前用户协同加入的企业空间上限是否已达 5 个
    const joinedEnterpriseCount = await prisma.workspacemember.count({
      where: {
        userId,
        role: {
          not: "OWNER",
        },
        workspace: {
          type: "ENTERPRISE",
        },
      },
    });

    if (joinedEnterpriseCount >= 5) {
      return NextResponse.json(
        { error: "协同加入空间额度已达上限。每个用户最多可受邀加入 5 个企业协作空间。" },
        { status: 403 }
      );
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

    // 更新邀请码使用记录 (仅记录最近一次使用时间与使用者，不修改 status，保留共享多次可用)
    await prisma.workspaceinvitation.update({
      where: { id: invitation.id },
      data: {
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
