import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDeletionCooldownDays } from "@/lib/account-deletion";

// GET - 获取用户信息
export async function GET(request: NextRequest) {
  try {
    const userId =
      request.headers.get("x-user-id") ||
      request.headers.get("Authorization")?.replace("Bearer ", "");

    if (!userId) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
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
        deletionRequestedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    let isPendingDeletion = false;
    let deletionDeadline: string | null = null;
    let daysRemaining: number | null = null;
    let deletionCooldownDays: number | null = null;

    // deletionRequestedAt 存的是冷静期截止日（申请时间 + 冷静期天数），直接与当前时间比较
    if (user.deletionRequestedAt) {
      const deletionDeadlineDate = new Date(user.deletionRequestedAt);
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

    return NextResponse.json({
      success: true,
      data: user,
      deletionCooldownDays,
      user: {
        isPendingDeletion,
        deletionDeadline,
        daysRemaining,
      },
    });
  } catch (error) {
    console.error("Get profile error:", error);
    return NextResponse.json({ error: "获取用户信息失败" }, { status: 500 });
  }
}

// PUT - 更新用户信息
export async function PUT(request: NextRequest) {
  try {
    const userId =
      request.headers.get("x-user-id") ||
      request.headers.get("Authorization")?.replace("Bearer ", "");

    if (!userId) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const { name, email, phone, bio } = await request.json();

    // 验证数据
    if (!name || !email || !phone) {
      return NextResponse.json(
        { error: "昵称、邮箱和手机号不能为空" },
        { status: 400 },
      );
    }

    // 检查邮箱是否已被其他用户使用
    const existingUser = await prisma.user.findFirst({
      where: {
        email,
        id: { not: userId },
      },
    });

    if (existingUser) {
      return NextResponse.json({ error: "该邮箱已被使用" }, { status: 400 });
    }

    // 更新用户信息
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        phone,
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
      message: "个人信息已更新",
    });
  } catch (error) {
    console.error("Update profile error:", error);
    return NextResponse.json({ error: "更新用户信息失败" }, { status: 500 });
  }
}
