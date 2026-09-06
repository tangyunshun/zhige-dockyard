import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

// 获取当前登录用户的通知偏好设置与邮箱绑定状态
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权访问，请先登录" }, { status: 401 });
    }

    const userId = auth.user.id;

    // 查询当前用户信息（用于获取真实邮箱）
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 查询或初始化用户的通知偏好记录
    let pref = await prisma.usernotification.findUnique({
      where: { userId },
    });

    if (!pref) {
      pref = await prisma.usernotification.create({
        data: {
          id: `pref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId,
          emailNotifications: Boolean(user.email), // 若无邮箱则默认关闭
          systemMessages: true,
          projectUpdates: true,
          commentMentions: false,
          frequency: "REALTIME",
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: pref.id,
        userId: pref.userId,
        emailNotifications: pref.emailNotifications,
        systemMessages: pref.systemMessages,
        projectUpdates: pref.projectUpdates,
        frequency: pref.frequency,
        updatedAt: pref.updatedAt,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          hasEmail: Boolean(user.email && user.email.trim()),
        },
      },
    });
  } catch (error) {
    console.error("Get user notification preferences error:", error);
    return NextResponse.json(
      { error: "获取通知偏好设置失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

// 保存当前登录用户的通知偏好设置
export async function PUT(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权访问，请先登录" }, { status: 401 });
    }

    const userId = auth.user.id;
    const body = await request.json();
    const { emailNotifications, systemMessages, projectUpdates, frequency } = body;

    // 允许的有效推送频率
    const validFrequencies = ["REALTIME", "HOURLY", "DAILY", "WEEKLY", "CRITICAL_ONLY", "QUIET_HOURS"];
    const targetFrequency = validFrequencies.includes(frequency) ? frequency : "REALTIME";

    // 更新或创建
    const updated = await prisma.usernotification.upsert({
      where: { userId },
      update: {
        ...(typeof emailNotifications === "boolean" && { emailNotifications }),
        ...(typeof systemMessages === "boolean" && { systemMessages }),
        ...(typeof projectUpdates === "boolean" && { projectUpdates }),
        frequency: targetFrequency,
        updatedAt: new Date(),
      },
      create: {
        id: `pref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId,
        emailNotifications: typeof emailNotifications === "boolean" ? emailNotifications : true,
        systemMessages: typeof systemMessages === "boolean" ? systemMessages : true,
        projectUpdates: typeof projectUpdates === "boolean" ? projectUpdates : true,
        commentMentions: false,
        frequency: targetFrequency,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      message: "通知偏好设置已成功保存",
      data: updated,
    });
  } catch (error) {
    console.error("Update user notification preferences error:", error);
    return NextResponse.json(
      { error: "更新通知偏好设置失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
