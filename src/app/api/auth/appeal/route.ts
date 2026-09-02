import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { account, appealReason, contactInfo } = body;

    if (!account || !account.trim()) {
      return NextResponse.json({ error: "缺少账号信息" }, { status: 400 });
    }

    if (!appealReason || !appealReason.trim()) {
      return NextResponse.json({ error: "请填写具体的申诉原因" }, { status: 400 });
    }

    // 查找目标用户
    const targetUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: account.trim() },
          { phone: account.trim() },
          { name: account.trim() },
          { id: account.trim() },
        ],
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "未找到对应的用户账号，请检查输入" }, { status: 404 });
    }

    // 校验账号状态是否是被封禁
    if (targetUser.status !== "banned") {
      return NextResponse.json(
        { error: "该账号当前处于正常状态，无需提交解封申诉" },
        { status: 400 }
      );
    }

    // 校验是否已有 pending 状态的待审核申诉
    const existingPending = await prisma.accountappeal.findFirst({
      where: {
        userId: targetUser.id,
        status: "pending",
      },
    });

    if (existingPending) {
      return NextResponse.json(
        { error: "您已有一笔待处理的解封申诉单，管理员正在审核中，请勿重复提交。" },
        { status: 400 }
      );
    }

    // 创建申诉记录
    const appealRecord = await prisma.accountappeal.create({
      data: {
        id: `appeal-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        userId: targetUser.id,
        userAccount: targetUser.email || targetUser.name || targetUser.phone || account,
        userName: targetUser.name || "用户",
        userPhone: targetUser.phone || null,
        userEmail: targetUser.email || null,
        banReason: targetUser.banReason || "系统检测到账号存在违规行为，已被限制使用",
        appealReason: appealReason.trim(),
        contactInfo: contactInfo ? contactInfo.trim() : (targetUser.email || targetUser.phone || null),
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "申诉已成功提交！我们的安全风控团队将在 24 小时内完成审查。",
      data: appealRecord,
    });
  } catch (error) {
    console.error("提交解封申诉失败:", error);
    return NextResponse.json(
      { error: "服务器繁忙，提交申诉失败，请稍后重试" },
      { status: 500 }
    );
  }
}
