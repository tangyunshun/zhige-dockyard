import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";
import { requirePlatformPermission } from "@/lib/security";

// 获取系统通知与消息推送历史流水
export async function GET(request: NextRequest) {
  try {
    // 细粒度平台权限校验：announcement:read
    const authCheck = await requirePlatformPermission(request, "announcement:read");
    if (!authCheck.authorized) {
      return authCheck.errorResponse || NextResponse.json({ error: "权限不足，仅管理员可查看推送历史" }, { status: 403 });
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

    // 系统推送历史数据生命周期策略：系统记录合规保持 1 年（365天），超期流水系统自动滚动出清
    const oneYearAgo = new Date();
    oneYearAgo.setDate(oneYearAgo.getDate() - 365);

    try {
      await prisma.notification.deleteMany({
        where: {
          createdAt: { lt: oneYearAgo },
        },
      });
    } catch (cleanupErr) {
      console.error("Auto cleanup expired notifications (over 1 year) error:", cleanupErr);
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

// 删除系统推送历史记录（支持单条删除与多选批量删除）
export async function DELETE(request: NextRequest) {
  try {
    // 细粒度平台权限校验：announcement:delete
    const authCheck = await requirePlatformPermission(request, "announcement:delete");
    if (!authCheck.authorized) {
      return authCheck.errorResponse || NextResponse.json({ error: "权限不足，仅管理员可删除推送历史记录" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get("id");
    const idsParam = searchParams.get("ids");

    let idsToDelete: string[] = [];

    // 1. 尝试从 URL query 获取
    if (idParam) {
      idsToDelete.push(idParam.trim());
    } else if (idsParam) {
      idsToDelete = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    }

    // 2. 尝试从请求体 JSON 获取批量 IDs
    if (idsToDelete.length === 0) {
      try {
        const body = await request.json();
        if (Array.isArray(body.ids)) {
          idsToDelete = body.ids.map((s: string) => String(s).trim()).filter(Boolean);
        } else if (typeof body.id === "string" && body.id.trim()) {
          idsToDelete.push(body.id.trim());
        }
      } catch {
        // 请求体无 JSON 内容时忽略
      }
    }

    if (idsToDelete.length === 0) {
      return NextResponse.json({ error: "请提供要删除的历史记录 ID 或批量 ID 清单" }, { status: 400 });
    }

    const result = await prisma.notification.deleteMany({
      where: {
        id: { in: idsToDelete },
      },
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.count,
      message: `已成功删除 ${result.count} 条推送历史记录`,
    });
  } catch (error) {
    console.error("Delete notification history error:", error);
    return NextResponse.json(
      { error: "删除推送历史记录失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
