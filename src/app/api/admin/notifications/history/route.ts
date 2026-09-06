import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

// 获取系统通知与消息推送历史流水
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: auth.user.id },
    });

    if (!adminUser || !isAdminRole(adminUser.role)) {
      return NextResponse.json({ error: "权限不足，仅管理员可查看推送历史" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search")?.trim() || "";
    const type = searchParams.get("type")?.trim() || "";
    const isReadParam = searchParams.get("isRead");
    const userSearch = searchParams.get("userSearch")?.trim() || "";

    const skip = (page - 1) * limit;
    const where: any = {};

    // 标题或正文关键字模糊匹配
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { content: { contains: search } },
      ];
    }

    // 消息类型
    if (type) {
      where.type = type;
    }

    // 已读/未读状态
    if (isReadParam === "true") {
      where.isRead = true;
    } else if (isReadParam === "false") {
      where.isRead = false;
    }

    // 接收用户模糊搜索
    if (userSearch) {
      where.user = {
        OR: [
          { name: { contains: userSearch } },
          { email: { contains: userSearch } },
        ],
      };
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // 自动出清策略：针对已阅读且超过3个月（90天）的陈旧历史通知执行系统自动出清
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90);

    try {
      await prisma.notification.deleteMany({
        where: {
          isRead: true,
          createdAt: { lt: threeMonthsAgo },
        },
      });
    } catch (cleanupErr) {
      console.error("Auto cleanup expired read notifications error:", cleanupErr);
    }

    const [records, total, todayCount, unreadCount, readCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              role: true,
            },
          },
        },
      }),
      prisma.notification.count({ where }),
      // 今日推送总数
      prisma.notification.count({
        where: {
          createdAt: { gte: todayStart },
        },
      }),
      // 全平台未读通知存量
      prisma.notification.count({
        where: { isRead: false },
      }),
      // 全平台已读通知总量
      prisma.notification.count({
        where: { isRead: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        records,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        stats: {
          total,
          todayCount,
          unreadCount,
          readCount,
        },
      },
    });
  } catch (error) {
    console.error("Get notification history error:", error);
    return NextResponse.json(
      { error: "获取推送历史记录失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

// 系统通知不支持管理员任意撤回（系统消息一经发出即具有公信力与事实记录属性，仅允许接收方用户在消息中心自行清理已读通知，或由系统3个月自动出清）
export async function DELETE() {
  return NextResponse.json(
    {
      error: "系统通知不支持撤回或删除",
      message: "通知一经发出具有事实流水属性，管理端不支持任意撤回；用户可在个人信箱中自主清理，超期3个月（90天）的已读通知将由系统自动安全出清。",
    },
    { status: 403 }
  );
}
