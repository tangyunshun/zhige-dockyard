import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { getInvitePolicy, checkInviteEligibility } from "@/lib/invitation-policy";

/**
 * 加入企业空间
 * 通过邀请码或邀请 ID 加入企业空间
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await validateUser(request.headers.get("Authorization"), request);
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: authResult.error || "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = authResult.user.id;

    // 邀请加入安全策略：域名白名单 + 平台管理员开关（此时才确定加入者身份，邀请码/邀请ID 两条路径统一生效）
    const policy = await getInvitePolicy();
    const eligibility = checkInviteEligibility(authResult.user, policy);
    if (!eligibility.ok) {
      return NextResponse.json({ error: eligibility.error }, { status: 403 });
    }

    const body = await request.json();
    const { inviteCode, invitationId } = body;

    // 通过邀请码加入企业空间
    if (inviteCode) {
      // 验证邀请码格式
      if (inviteCode.length !== 6) {
        return NextResponse.json({ error: "邀请码格式错误" }, { status: 400 });
      }

      // 查找企业空间
      const workspace = await prisma.workspace.findFirst({
        where: {
          type: "ENTERPRISE",
          inviteCode: inviteCode,
        },
      });

      if (!workspace) {
        return NextResponse.json({ error: "邀请码无效" }, { status: 404 });
      }

      // 检查用户是否已是成员
      const existingMember = await prisma.workspacemember.findFirst({
        where: {
          workspaceId: workspace.id,
          userId: userId,
        },
      });

      if (existingMember) {
        return NextResponse.json({ error: "您已经是该企业空间的成员" }, { status: 400 });
      }

      // 创建成员关系
      const member = await prisma.workspacemember.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          workspaceId: workspace.id,
          role: "MEMBER",
          joinedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: "加入企业空间成功",
        // 仅回传前端所需标量字段：workspacemember 含 BigInt（tokenBalance/monthlyTokenUsed/monthlyTokenLimit），
        // 直接序列化整行会抛 "Do not know how to serialize a BigInt" 导致加入接口 500。
        member: {
          id: member.id,
          userId: member.userId,
          workspaceId: member.workspaceId,
          role: member.role,
          joinedAt: member.joinedAt,
        },
      });
    }

    // 通过邀请 ID 加入
    if (invitationId) {
      const invitation = await prisma.workspaceinvitation.findUnique({
        where: { id: invitationId },
      });

      if (!invitation) {
        return NextResponse.json({ error: "邀请不存在" }, { status: 404 });
      }

      if (invitation.email !== authResult.user!.email) {
        return NextResponse.json({ error: "该邀请不属于您" }, { status: 403 });
      }

      if (invitation.expiresAt && new Date() > invitation.expiresAt) {
        return NextResponse.json({ error: "邀请已过期" }, { status: 400 });
      }

      // 检查是否已是成员
      const existingMember = await prisma.workspacemember.findFirst({
        where: {
          workspaceId: invitation.workspaceId,
          userId,
        },
      });

      if (existingMember) {
        return NextResponse.json({ error: "您已经是该企业空间的成员" }, { status: 400 });
      }

      // 检查工作空间当前的总协同人数配额 (安全配额卡关)
      const currentMemberCount = await prisma.workspacemember.count({
        where: { workspaceId: invitation.workspaceId }
      });

      const workspace = await prisma.workspace.findUnique({
        where: { id: invitation.workspaceId }
      });

      if (!workspace) {
        return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
      }

      // 个人空间不支持成员协作
      if (workspace.type !== "ENTERPRISE") {
        return NextResponse.json({ error: "个人空间不支持成员邀请与加入" }, { status: 400 });
      }

      const spaceOwner = await prisma.user.findUnique({
        where: { id: workspace.ownerId }
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

      // 创建成员关系
      const member = await prisma.workspacemember.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          workspaceId: invitation.workspaceId,
          role: invitation.role || "MEMBER",
          joinedAt: new Date(),
        },
      });

      // 更新邀请码使用记录 (仅记录最近一次使用时间与使用者，不修改 status，保留共享多次可用)
      await prisma.workspaceinvitation.update({
        where: { id: invitationId },
        data: {
          usedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        message: "加入企业空间成功",
        // 仅回传前端所需标量字段：workspacemember 含 BigInt（tokenBalance/monthlyTokenUsed/monthlyTokenLimit），
        // 直接序列化整行会抛 "Do not know how to serialize a BigInt" 导致加入接口 500。
        member: {
          id: member.id,
          userId: member.userId,
          workspaceId: member.workspaceId,
          role: member.role,
          joinedAt: member.joinedAt,
        },
      });
    }

    return NextResponse.json({ error: "缺少邀请码或邀请 ID" }, { status: 400 });
  } catch (error) {
    console.error("Join workspace error:", error);
    return NextResponse.json({ error: "加入企业空间失败" }, { status: 500 });
  }
}
