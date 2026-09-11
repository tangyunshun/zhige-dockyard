import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { getDeletionCooldownDays } from "@/lib/account-deletion";

// GET - 获取用户信息（P0-2 修复：统一走 withAuth 状态机校验）
export const GET = withAuth(async (req, user) => {
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        status: true,
        membershipLevel: true,
        createdAt: true,
        lastLoginAt: true,
        lastLoginIp: true,
        lastLoginRegion: true,
        lastLoginDevice: true,
        passwordChangedAt: true,
        deletionRequestedAt: true,
      },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    let isPendingDeletion = false;
    let deletionDeadline: string | null = null;
    let daysRemaining: number | null = null;
    let deletionCooldownDays: number | null = null;

    // deletionRequestedAt 存的是冷静期截止日（申请时间 + 冷静期天数），直接与当前时间比较
    if (dbUser.deletionRequestedAt) {
      const deletionDeadlineDate = new Date(dbUser.deletionRequestedAt);
      const now = new Date();

      if (now < deletionDeadlineDate) {
        isPendingDeletion = true;
        deletionDeadline = deletionDeadlineDate.toISOString();
        daysRemaining = Math.ceil(
          (deletionDeadlineDate.getTime() - now.getTime()) /
            (24 * 60 * 60 * 1000),
        );
      }

      // 冷静期总天数（可配置，用于前端文案展示）
      deletionCooldownDays = await getDeletionCooldownDays();
    }

    // 附带查询用户当前个人空间的可用算力点（只读实际余额，不赠送/兜底）
    let tokenBalance = 0;
    try {
      const personalWs = await prisma.workspace.findFirst({
        where: { ownerId: user.id, type: "PERSONAL" },
        include: { workspacequota: true },
      });
      if (personalWs?.workspacequota) {
        tokenBalance = Number(personalWs.workspacequota.tokenBalance);
      }
    } catch (e) {
      console.warn("[profile] 查询算力非致命提示:", e);
    }

    // 查询会员等级中文名称与权益
    const membershipLevelCode = dbUser.membershipLevel || "FREE";
    const membershipMap: Record<string, string> = {
      FREE: "普通会员",
      BRONZE: "青铜会员",
      SILVER: "白银会员",
      GOLD: "黄金会员",
      DIAMOND: "钻石会员",
      CROWN: "皇冠会员",
      ENTERPRISE: "企业专享会员",
    };
    const membershipDisplayName = membershipMap[membershipLevelCode.toUpperCase()] || "普通会员";

    // 统计用户所属工作空间总数
    const workspaceCount = await prisma.workspacemember.count({
      where: { userId: user.id },
    }).catch(() => 0);

    // 统计生效中的 API 密钥数量
    const apiKeyCount = await prisma.apikey.count({
      where: { userId: user.id },
    }).catch(() => 0);

    // 统计用户产生的操作日志记录数
    const activityCount = await prisma.operationlog.count({
      where: { userId: user.id },
    }).catch(() => 0);

    // 查询用户参与的主要团队空间列表（前 3 个）
    const recentMemberships = await prisma.workspacemember.findMany({
      where: { userId: user.id },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            type: true,
            updatedAt: true,
          },
        },
      },
      orderBy: { joinedAt: "desc" },
      take: 3,
    }).catch(() => []);

    const roleNameMap: Record<string, string> = {
      OWNER: "所有者",
      ADMIN: "管理员",
      MEMBER: "成员",
      DEVELOPER: "开发员",
      GUEST: "访客",
    };

    const recentWorkspaces = recentMemberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      type: m.workspace.type,
      role: roleNameMap[m.role] || "成员",
    }));

    const safeJson = JSON.parse(
      JSON.stringify(
        {
          success: true,
          data: {
            ...dbUser,
            tokenBalance,
            membershipDisplayName,
            securityProfile: {
              createdAt: dbUser.createdAt,
              lastLoginAt: dbUser.lastLoginAt,
              lastLoginIp: dbUser.lastLoginIp || "127.0.0.1",
              lastLoginRegion: dbUser.lastLoginRegion || "本地网络",
              lastLoginDevice: dbUser.lastLoginDevice || "Desktop Chrome",
              passwordChangedAt: dbUser.passwordChangedAt || dbUser.createdAt,
            },
            stats: {
              workspaceCount,
              apiKeyCount,
              activityCount,
            },
            recentWorkspaces,
          },
          deletionCooldownDays,
          user: {
            isPendingDeletion,
            deletionDeadline,
            daysRemaining,
          },
        },
        (k, v) => (typeof v === "bigint" ? Number(v) : v)
      )
    );

    return NextResponse.json(safeJson);
  } catch (error) {
    console.error("Get profile error:", error);
    return NextResponse.json({ error: "获取用户信息失败" }, { status: 500 });
  }
});

// PUT - 更新用户信息（P0-2 修复：统一走 withAuth 状态机校验）
export const PUT = withAuth(async (req, user) => {
  try {
    const { name, email, phone, smsCode } = await req.json();

    // 验证昵称
    if (!name || !String(name).trim()) {
      return NextResponse.json(
        { error: "用户昵称不能为空" },
        { status: 400 },
      );
    }

    // 查询当前用户信息比对手机号
    const currentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { phone: true, email: true },
    });

    if (!currentUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const trimmedPhone = phone ? String(phone).trim() : "";
    const currentPhone = currentUser.phone ? String(currentUser.phone).trim() : "";

    // 判断是否更换或绑定新手机号
    if (trimmedPhone && trimmedPhone !== currentPhone) {
      // 1. 校验合法的 11 位中国大陆手机号码
      if (!/^1[3-9]\d{9}$/.test(trimmedPhone)) {
        return NextResponse.json(
          { error: "请输入正确的 11 位手机号码" },
          { status: 400 },
        );
      }

      // 2. 检查手机号是否已被其他账号占用
      const existingPhoneUser = await prisma.user.findFirst({
        where: {
          phone: trimmedPhone,
          id: { not: user.id },
        },
      });

      if (existingPhoneUser) {
        return NextResponse.json(
          { error: "该手机号码已被其他账号绑定，请更换其他号码" },
          { status: 400 },
        );
      }

      // 3. 更换手机号必须校验短信验证码
      if (!smsCode || String(smsCode).trim().length !== 6) {
        return NextResponse.json(
          { error: "更换手机号必须填写 6 位短信验证码" },
          { status: 400 },
        );
      }

      const { verifySmsCode, consumeSmsCode } = await import("@/lib/sms-store");
      const verifyResult = verifySmsCode(trimmedPhone, String(smsCode).trim());
      if (!verifyResult.valid) {
        return NextResponse.json(
          { error: verifyResult.error || "短信验证码错误或已过期，请重新获取" },
          { status: 400 },
        );
      }

      // 验证通过，立即消费该验证码
      consumeSmsCode(trimmedPhone);
    }

    // 检查邮箱是否已被其他用户使用
    const targetEmail = email ? String(email).trim() : currentUser.email;
    if (targetEmail && targetEmail !== currentUser.email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email: targetEmail,
          id: { not: user.id },
        },
      });

      if (existingUser) {
        return NextResponse.json({ error: "该邮箱已被使用" }, { status: 400 });
      }
    }

    // 更新用户信息
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: String(name).trim(),
        phone: trimmedPhone || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: updatedUser,
      message: trimmedPhone && trimmedPhone !== currentPhone ? "手机号码及个人资料已更新" : "个人信息已更新",
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json({ error: "更新用户信息失败" }, { status: 500 });
  }
});
