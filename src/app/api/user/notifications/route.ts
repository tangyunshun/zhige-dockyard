import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

// 获取用户通知设置
export async function GET(req: NextRequest) {
  try {
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: auth.error || "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = auth.user.id;

    const notifications = await prisma.usernotification.findFirst({
      where: { userId },
    });

    if (!notifications) {
      return NextResponse.json({
        notifications: {
          emailNotifications: true,
          systemMessages: true,
          projectUpdates: true,
          commentMentions: true,
          frequency: "REALTIME",
        },
      });
    }

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error("获取通知设置错误:", error);
    return NextResponse.json(
      { error: "获取通知设置失败" },
      { status: 500 }
    );
  }
}

// 更新用户通知设置
export async function POST(req: NextRequest) {
  try {
    const auth = await validateUser(req.headers.get("Authorization"), req);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: auth.error || "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = auth.user.id;
    const {
      emailNotifications,
      systemMessages,
      projectUpdates,
      commentMentions,
      frequency,
    } = await req.json();

    const validFrequencies = ["REALTIME", "DAILY", "WEEKLY"];
    if (frequency && !validFrequencies.includes(frequency)) {
      return NextResponse.json(
        { error: "无效的通知频率" },
        { status: 400 }
      );
    }

    const existingNotification = await prisma.usernotification.findFirst({
      where: { userId },
    });

    let notifications;
    if (existingNotification) {
      notifications = await prisma.usernotification.update({
        where: { id: existingNotification.id },
        data: {
          emailNotifications: emailNotifications ?? true,
          systemMessages: systemMessages ?? true,
          projectUpdates: projectUpdates ?? true,
          commentMentions: commentMentions ?? true,
          frequency: frequency || "REALTIME",
          updatedAt: new Date(),
        },
      });
    } else {
      notifications = await prisma.usernotification.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          emailNotifications: emailNotifications ?? true,
          systemMessages: systemMessages ?? true,
          projectUpdates: projectUpdates ?? true,
          commentMentions: commentMentions ?? true,
          frequency: frequency || "REALTIME",
          updatedAt: new Date(),
        },
      });
    }

    return NextResponse.json({
      success: true,
      notifications,
      message: "通知设置保存成功",
    });
  } catch (error) {
    console.error("保存通知设置错误:", error);
    return NextResponse.json(
      { error: "保存通知设置失败" },
      { status: 500 }
    );
  }
}
