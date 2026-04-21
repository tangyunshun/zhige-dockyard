import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { getToken } from "next-auth/jwt";

const prisma = new PrismaClient();

// 获取用户的通知设置
export async function GET(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = token.id as string;

    // 获取用户通知设置
    const notifications = await prisma.userNotification.findFirst({
      where: { userId },
    });

    // 如果没有设置，返回默认值
    if (!notifications) {
      return NextResponse.json({
        notifications: {
          emailNotifications: true,
          systemMessages: true,
          projectUpdates: true,
          commentMentions: true,
          frequency: "REALTIME", // REALTIME | DAILY | WEEKLY
        },
      });
    }

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error("获取通知设置失败:", error);
    return NextResponse.json(
      { error: "获取失败，请稍后重试" },
      { status: 500 }
    );
  }
}

// 保存用户的通知设置
export async function POST(req: NextRequest) {
  try {
    const token = await getToken({ req });
    if (!token?.id) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = token.id as string;
    const {
      emailNotifications,
      systemMessages,
      projectUpdates,
      commentMentions,
      frequency,
    } = await req.json();

    // 验证 frequency 选项
    const validFrequencies = ["REALTIME", "DAILY", "WEEKLY"];
    if (frequency && !validFrequencies.includes(frequency)) {
      return NextResponse.json(
        { error: "无效的通知频率选项" },
        { status: 400 }
      );
    }

    // 更新或创建通知设置
    const existingNotification = await prisma.userNotification.findFirst({
      where: { userId },
    });

    let notifications;
    if (existingNotification) {
      notifications = await prisma.userNotification.update({
        where: { id: existingNotification.id },
        data: {
          emailNotifications: emailNotifications ?? true,
          systemMessages: systemMessages ?? true,
          projectUpdates: projectUpdates ?? true,
          commentMentions: commentMentions ?? true,
          frequency: frequency || "REALTIME",
        },
      });
    } else {
      notifications = await prisma.userNotification.create({
        data: {
          userId,
          emailNotifications: emailNotifications ?? true,
          systemMessages: systemMessages ?? true,
          projectUpdates: projectUpdates ?? true,
          commentMentions: commentMentions ?? true,
          frequency: frequency || "REALTIME",
        },
      });
    }

    return NextResponse.json({
      success: true,
      notifications,
      message: "通知设置已保存",
    });
  } catch (error) {
    console.error("保存通知设置失败:", error);
    return NextResponse.json(
      { error: "保存失败，请稍后重试" },
      { status: 500 }
    );
  }
}
