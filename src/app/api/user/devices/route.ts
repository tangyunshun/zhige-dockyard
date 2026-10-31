import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * 获取用户设备列表（支持每页10条分页）
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权或登录已过期" }, { status: 401 });
    }
    const userId = auth.user.id;

    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") || "10"));

    let [total, devices] = await Promise.all([
      prisma.userdevice.count({ where: { userId } }),
      prisma.userdevice.findMany({
        where: { userId },
        orderBy: [
          { isCurrent: "desc" },
          { lastActiveAt: "desc" },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // 体验增强：若无任何设备记录（如老账号或直接写库用户），自动登记当前访问终端为当前活跃设备
    if (total === 0) {
      try {
        const userAgent = request.headers.get("user-agent") || "";
        const isMobile = /mobile|iphone|android/i.test(userAgent);
        const isTablet = /ipad|tablet/i.test(userAgent);
        const deviceType = isMobile ? "mobile" : isTablet ? "tablet" : "desktop";
        const browser = /chrome/i.test(userAgent) ? "Chrome" : /firefox/i.test(userAgent) ? "Firefox" : /safari/i.test(userAgent) ? "Safari" : "Browser";
        const os = /windows/i.test(userAgent) ? "Windows" : /mac/i.test(userAgent) ? "macOS" : /linux/i.test(userAgent) ? "Linux" : "Client";
        const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";

        const newDevice = await prisma.userdevice.create({
          data: {
            id: "dev_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9),
            userId,
            deviceName: `${browser} on ${os}`,
            deviceType,
            browser,
            os,
            ipAddress: clientIp,
            isCurrent: true,
            lastActiveAt: new Date(),
          },
        });
        devices = [newDevice];
        total = 1;
      } catch (e) {
        console.warn("Auto create initial device record warning:", e);
      }
    }

    return NextResponse.json({
      success: true,
      devices,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    console.error("Get devices error:", error);
    return NextResponse.json(
      { error: "获取设备列表失败" },
      { status: 500 }
    );
  }
}

/**
 * 踢出指定设备
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权或登录已过期" }, { status: 401 });
    }
    const userId = auth.user.id;

    const body = await request.json().catch(() => ({}));
    const { deviceId, action, kickAllOthers } = body;

    // 支持一键强制下线所有其他活跃设备（B-05）
    if (action === "kick_all_others" || kickAllOthers === true) {
      const deleteResult = await prisma.userdevice.deleteMany({
        where: {
          userId,
          isCurrent: false,
        },
      });

      console.log(`[一键下线] 用户 ${userId} 踢出所有其他设备共 ${deleteResult.count} 台`);

      return NextResponse.json({
        success: true,
        message: `已成功强制下线 ${deleteResult.count} 台其他活跃设备`,
        kickedCount: deleteResult.count,
      });
    }

    if (!deviceId) {
      return NextResponse.json({ error: "缺少设备ID" }, { status: 400 });
    }

    // 检查设备是否属于当前用户
    const device = await prisma.userdevice.findUnique({
      where: { id: deviceId },
      select: { userId: true, isCurrent: true },
    });

    if (!device || device.userId !== userId) {
      return NextResponse.json({ error: "设备不存在或无权操作" }, { status: 403 });
    }

    // 删除设备记录（B-05 远程下线指定设备）
    await prisma.userdevice.delete({
      where: { id: deviceId },
    });

    // 若被下线的是当前设备，则懒失效其会话（D-04 机制：下次请求被拦截）
    // 非当前设备的记录已被后续登录的 sessionToken 覆盖，其 JWT 早已失效。
    if (device.isCurrent) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          lastForcedLogoutAt: new Date(),
          sessionToken: null,
          sessionRememberMe: false, // 登出当前设备时复位「7天内免登录」标记，防脏状态残留
          refreshToken: null,
          refreshTokenExpiresAt: null,
        },
      });
    }

    console.log(`[踢出设备] 用户 ${userId} 踢出设备 ${deviceId}`);

    return NextResponse.json({
      success: true,
      message: "设备已被踢出",
    });
  } catch (error) {
    console.error("Kick device error:", error);
    return NextResponse.json(
      { error: "踢出设备失败" },
      { status: 500 }
    );
  }
}

/**
 * 更新设备信息（标记当前设备）
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权或登录已过期" }, { status: 401 });
    }
    const userId = auth.user.id;

    const { deviceId, isCurrent } = await request.json();

    if (!deviceId) {
      return NextResponse.json({ error: "缺少设备ID" }, { status: 400 });
    }

    // 检查设备是否属于当前用户
    const device = await prisma.userdevice.findUnique({
      where: { id: deviceId },
      select: { userId: true },
    });

    if (!device || device.userId !== userId) {
      return NextResponse.json({ error: "设备不存在或无权操作" }, { status: 403 });
    }

    await prisma.userdevice.update({
      where: { id: deviceId },
      data: { isCurrent },
    });

    return NextResponse.json({
      success: true,
      message: "设备信息已更新",
    });
  } catch (error) {
    console.error("Update device error:", error);
    return NextResponse.json(
      { error: "更新设备信息失败" },
      { status: 500 }
    );
  }
}