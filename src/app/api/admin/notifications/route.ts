import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search")?.trim() || "";
    const frequency = searchParams.get("frequency")?.trim() || "";
    const emailNotifications = searchParams.get("emailNotifications");
    const systemMessages = searchParams.get("systemMessages");

    const skip = (page - 1) * limit;

    // 动态构建多维筛选条件
    const where: any = {};

    if (search) {
      where.user = {
        OR: [
          { name: { contains: search } },
          { email: { contains: search } },
        ],
      };
    }

    if (frequency) {
      where.frequency = frequency;
    }

    if (emailNotifications === "true") {
      where.emailNotifications = true;
    } else if (emailNotifications === "false") {
      where.emailNotifications = false;
    }

    if (systemMessages === "true") {
      where.systemMessages = true;
    } else if (systemMessages === "false") {
      where.systemMessages = false;
    }

    // 分页列表查询与总量
    const [notifications, total] = await Promise.all([
      prisma.usernotification.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: "desc" },
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
      prisma.usernotification.count({ where }),
    ]);

    // 全局真实指标与频率分布真实聚合统计（不受当前分页影响）
    const [
      totalUsers,
      emailEnabledCount,
      systemEnabledCount,
      projectUpdatesCount,
      commentMentionsCount,
      realtimeCount,
      hourlyCount,
      dailyCount,
      weeklyCount,
      criticalOnlyCount,
      quietHoursCount,
      totalNotificationsSent,
    ] = await Promise.all([
      prisma.usernotification.count(),
      prisma.usernotification.count({ where: { emailNotifications: true } }),
      prisma.usernotification.count({ where: { systemMessages: true } }),
      prisma.usernotification.count({ where: { projectUpdates: true } }),
      prisma.usernotification.count({ where: { commentMentions: true } }),
      prisma.usernotification.count({ where: { frequency: "REALTIME" } }),
      prisma.usernotification.count({ where: { frequency: "HOURLY" } }),
      prisma.usernotification.count({ where: { frequency: "DAILY" } }),
      prisma.usernotification.count({ where: { frequency: "WEEKLY" } }),
      prisma.usernotification.count({ where: { frequency: "CRITICAL_ONLY" } }),
      prisma.usernotification.count({ where: { frequency: "QUIET_HOURS" } }),
      prisma.notification.count(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        notifications,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
        summary: {
          totalUsers,
          emailEnabledCount,
          systemEnabledCount,
          projectUpdatesCount,
          commentMentionsCount,
          totalNotificationsSent,
          frequencyCounts: {
            REALTIME: realtimeCount,
            HOURLY: hourlyCount,
            DAILY: dailyCount,
            WEEKLY: weeklyCount,
            CRITICAL_ONLY: criticalOnlyCount,
            QUIET_HOURS: quietHoursCount,
          },
        },
      },
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    return NextResponse.json(
      {
        error: "获取通知设置失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}

// POST: 管理员发布/推送系统通知（支持全员广播或指定用户单发）
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const adminUser = await prisma.user.findUnique({
      where: { id: auth.user.id },
    });

    if (!adminUser || !isAdminRole(adminUser.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const body = await request.json();
    const { targetType = "all", targetRole, groupId, userIds, userId, title, content, type = "system" } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "通知标题不能为空" }, { status: 400 });
    }

    if (!content || !content.trim()) {
      return NextResponse.json({ error: "通知正文内容不能为空" }, { status: 400 });
    }

    let dispatchedCount = 0;

    if (targetType === "all") {
      // 1. 全员广播推送 (支持十万级用户)
      const activeUsers = await prisma.user.findMany({
        where: { status: "active" },
        select: { id: true },
      });

      if (activeUsers.length > 0) {
        const notificationsData = activeUsers.map((u) => ({
          id: crypto.randomUUID(),
          userId: u.id,
          title: title.trim(),
          content: content.trim(),
          type: type || "system",
          link: null,
          isRead: false,
        }));

        const result = await prisma.notification.createMany({
          data: notificationsData,
        });
        dispatchedCount = result.count;
      }

      return NextResponse.json({
        success: true,
        message: `系统通知已全员广播派发成功，已触达全站 ${dispatchedCount} 位活跃用户信箱`,
        data: { dispatchedCount },
      });
    } else if (targetType === "role") {
      // 2. 按受众群组批量推送：支持按群组 ID（含成员增删名单）或按角色值（兼容旧版）
      //    最终人群 = (系统角色基础人群 − 剔除名单) ∪ 追加名单
      let finalUserIds: string[] = [];
      let groupLabel = targetRole || "指定";

      if (groupId) {
        const group = await prisma.notificationgroup.findUnique({
          where: { id: groupId },
          include: { members: true },
        });
        if (!group) {
          return NextResponse.json({ error: "所选群组不存在，请刷新后重试" }, { status: 400 });
        }
        groupLabel = group.name;

        const excludeIds = group.members.filter((m) => m.action === "exclude").map((m) => m.userId);
        const includeIds = group.members.filter((m) => m.action === "include").map((m) => m.userId);

        if (group.type === "system" && group.roleKey) {
          const baseUsers = await prisma.user.findMany({
            where: {
              role: group.roleKey,
              status: "active",
              ...(excludeIds.length ? { id: { notIn: excludeIds } } : {}),
            },
            select: { id: true },
          });
          const extraUsers = includeIds.length
            ? await prisma.user.findMany({
                where: { status: "active", id: { in: includeIds }, role: { not: group.roleKey } },
                select: { id: true },
              })
            : [];
          finalUserIds = [...baseUsers.map((u) => u.id), ...extraUsers.map((u) => u.id)];
        } else {
          const incUsers = includeIds.length
            ? await prisma.user.findMany({
                where: {
                  status: "active",
                  id: { in: includeIds },
                  ...(excludeIds.length ? { NOT: { id: { in: excludeIds } } } : {}),
                },
                select: { id: true },
              })
            : [];
          finalUserIds = incUsers.map((u) => u.id);
        }
      } else {
        // 兼容旧版：直接按角色值全量推送
        const roleFilter: any = { status: "active" };
        if (targetRole && targetRole !== "all") {
          roleFilter.role = targetRole;
        }
        const roleUsers = await prisma.user.findMany({
          where: roleFilter,
          select: { id: true },
        });
        finalUserIds = roleUsers.map((u) => u.id);
      }

      finalUserIds = Array.from(new Set(finalUserIds));

      if (finalUserIds.length === 0) {
        return NextResponse.json({ error: "该群组下暂无可推送的激活用户" }, { status: 400 });
      }

      const notificationsData = finalUserIds.map((uid) => ({
        id: crypto.randomUUID(),
        userId: uid,
        title: title.trim(),
        content: content.trim(),
        type: type || "system",
        link: null,
        isRead: false,
      }));

      const result = await prisma.notification.createMany({
        data: notificationsData,
      });
      dispatchedCount = result.count;

      return NextResponse.json({
        success: true,
        message: `系统通知已成功批量送达【${groupLabel}】群组，共计 ${dispatchedCount} 位用户`,
        data: { dispatchedCount, targetRole, groupId: groupId || null },
      });
    } else {
      // 3. 定向指定用户（支持单用户或批量多用户同时指定）
      const rawIds: string[] = [];
      if (Array.isArray(userIds) && userIds.length > 0) {
        rawIds.push(...userIds);
      }
      if (userId && typeof userId === "string") {
        rawIds.push(userId);
      }

      const targetUserIds = Array.from(new Set(rawIds.map((id) => id.trim()))).filter(Boolean);

      if (targetUserIds.length === 0) {
        return NextResponse.json({ error: "请至少指定一位接收通知的目标用户" }, { status: 400 });
      }

      const targetUsers = await prisma.user.findMany({
        where: {
          OR: [
            { id: { in: targetUserIds } },
            { email: { in: targetUserIds } },
          ],
        },
        select: { id: true, name: true, email: true },
      });

      if (targetUsers.length === 0) {
        return NextResponse.json({ error: "所选的目标用户不存在或已被移除" }, { status: 404 });
      }

      const notificationsData = targetUsers.map((u) => ({
        id: crypto.randomUUID(),
        userId: u.id,
        title: title.trim(),
        content: content.trim(),
        type: type || "system",
        link: null,
        isRead: false,
      }));

      const result = await prisma.notification.createMany({
        data: notificationsData,
      });
      dispatchedCount = result.count;

      return NextResponse.json({
        success: true,
        message: targetUsers.length === 1
          ? `系统通知已成功送达指定用户【${targetUsers[0].name || targetUsers[0].email}】`
          : `系统通知已成功批量送达 ${dispatchedCount} 位指定用户信箱`,
        data: {
          dispatchedCount,
          users: targetUsers.map((u) => ({ id: u.id, name: u.name, email: u.email })),
        },
      });
    }
  } catch (error) {
    console.error("Dispatch notification error:", error);
    return NextResponse.json(
      {
        error: "推送系统通知失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}

// PATCH: 管理员协助更新调整用户的通知偏好设置
export async function PATCH(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const adminUser = await prisma.user.findUnique({
      where: { id: auth.user.id },
    });

    if (!adminUser || !isAdminRole(adminUser.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const body = await request.json();
    const { id, emailNotifications, systemMessages, projectUpdates, commentMentions, frequency } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少通知配置记录ID" }, { status: 400 });
    }

    const updated = await prisma.usernotification.update({
      where: { id },
      data: {
        ...(typeof emailNotifications === "boolean" && { emailNotifications }),
        ...(typeof systemMessages === "boolean" && { systemMessages }),
        ...(typeof projectUpdates === "boolean" && { projectUpdates }),
        ...(typeof commentMentions === "boolean" && { commentMentions }),
        ...(frequency && { frequency }),
      },
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
    });

    return NextResponse.json({
      success: true,
      message: "用户通知偏好已更新",
      data: updated,
    });
  } catch (error) {
    console.error("Update notification prefs error:", error);
    return NextResponse.json(
      {
        error: "更新通知偏好失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
