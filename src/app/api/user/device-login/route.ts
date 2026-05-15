import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * 设备登录处理API
 * 处理新设备登录时的设备数限制检查和挤线逻辑
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, deviceInfo } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "缺少用户ID" }, { status: 400 });
    }

    // 获取用户的设备限制
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { deviceLimit: true },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 获取当前用户的所有设备
    const devices = await prisma.userdevice.findMany({
      where: { userId },
      orderBy: { lastActiveAt: "asc" }, // 按活跃时间排序，最老的在前
    });

    const maxDevices = user.deviceLimit || 3; // 默认最多3台设备

    // 如果已达设备数限制，踢掉最老的设备
    if (devices.length >= maxDevices) {
      const oldestDevice = devices[0];
      
      // 删除最老的设备记录
      await prisma.userdevice.delete({
        where: { id: oldestDevice.id },
      });

      console.log(`[设备超限] 用户 ${userId} 设备数超过限制(${maxDevices}台)，已踢掉最老设备 ${oldestDevice.id}`);
    }

    // 创建新设备记录
    const deviceId = "dev_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    const userAgent = request.headers.get("user-agent") || "unknown";

    // 解析设备信息
    let deviceType: "web" | "mobile" | "tablet" = "web";
    let browser = "unknown";
    let os = "unknown";

    if (userAgent.includes("Mobile")) {
      deviceType = "mobile";
    } else if (userAgent.includes("Tablet")) {
      deviceType = "tablet";
    }

    if (userAgent.includes("Chrome")) {
      browser = "Chrome";
    } else if (userAgent.includes("Safari")) {
      browser = "Safari";
    } else if (userAgent.includes("Firefox")) {
      browser = "Firefox";
    } else if (userAgent.includes("Edge")) {
      browser = "Edge";
    }

    if (userAgent.includes("Windows")) {
      os = "Windows";
    } else if (userAgent.includes("Mac")) {
      os = "Mac";
    } else if (userAgent.includes("Linux")) {
      os = "Linux";
    } else if (userAgent.includes("iPhone") || userAgent.includes("iPad")) {
      os = "iOS";
    } else if (userAgent.includes("Android")) {
      os = "Android";
    }

    await prisma.userdevice.create({
      data: {
        id: deviceId,
        userId,
        deviceName: deviceInfo?.deviceName || `${browser} on ${os}`,
        deviceType,
        browser,
        os,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
        isCurrent: true,
      },
    });

    console.log(`[设备登录] 用户 ${userId} 在新设备登录: ${browser} on ${os}`);

    return NextResponse.json({
      success: true,
      deviceId,
      message: "设备登录成功",
    });
  } catch (error) {
    console.error("Device login error:", error);
    return NextResponse.json(
      { error: "设备登录处理失败" },
      { status: 500 }
    );
  }
}