import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { assertWorkspaceWritable } from "@/lib/workspace-readonly-guard";
import { getInvitePolicy, checkInviteEligibility } from "@/lib/invitation-policy";

export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;

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

    // 归档 / 停用空间禁止写入（硬只读）
    await assertWorkspaceWritable(invitation.workspaceId);

    // 0. 个人空间不支持成员协作，任何邀请加入一律拒绝
    if (invitation.workspace.type !== "ENTERPRISE") {
      return NextResponse.json({ error: "个人空间不支持成员邀请与加入" }, { status: 400 });
    }

    // 0.1 已作废的邀请码直接拒绝（不依赖过期时间间接失效）
    if (invitation.status === "REVOKED") {
      return NextResponse.json({ error: "邀请码已作废" }, { status: 400 });
    }

    // 0.2 邀请策略强制执行（与预检 verify 同源，防止绕过预检直调 join）：
    //     邮箱域名白名单 + 平台管理员开关
    const policy = await getInvitePolicy();
    const joiner = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, role: true },
    });
    const eligibility = checkInviteEligibility(joiner, policy);
    if (!eligibility.ok) {
      return NextResponse.json({ error: eligibility.error }, { status: 403 });
    }

    // 0.3 每码使用次数上限（按 JOIN_WORKSPACE 日志计数；0=不限）
    if (policy.maxUsesPerCode > 0) {
      const joinedCount = await prisma.operationlog.count({
        where: {
          action: "JOIN_WORKSPACE",
          workspaceId: invitation.workspaceId,
          details: { path: ["invitationCode"], equals: invitation.code },
        },
      });
      if (joinedCount >= policy.maxUsesPerCode) {
        return NextResponse.json(
          { error: `该邀请码的使用次数已达上限（${policy.maxUsesPerCode} 人），请联系空间所有者重新生成` },
          { status: 403 }
        );
      }
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

    // 席位上限 = 空间套餐自带席位 + 已增购席位（套餐维度，而非所有者会员等级）
    const wsPlan = await prisma.workspaceplan.findUnique({
      where: { key: invitation.workspace.plan || "STANDARD" },
    });
    const planSeats = wsPlan ? Number(wsPlan.maxMembers) : 0;
    const extraSeats = Number(invitation.workspace.extraSeats || 0);
    const maxTeamSize = planSeats + extraSeats > 0 ? planSeats + extraSeats : 5;

    if (currentMemberCount >= maxTeamSize) {
      return NextResponse.json(
        { error: `该协作空间的席位已满（上限 ${maxTeamSize} 人，含增购 ${extraSeats} 个），无法加入。请联系空间所有者增购席位或升级套餐。` },
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

    // P3：加入后用户空间列表/中枢将发生变化，立即失效只读缓存
    const { clearServerCache } = await import("@/lib/serverCache");
    clearServerCache();

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
