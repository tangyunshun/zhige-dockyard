import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

/**
 * 获取用户设备列表
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

    const devices = await prisma.userdevice.findMany({
      where: { userId },
      orderBy: { lastActiveAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      devices,
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
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

    const { deviceId } = await request.json();

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

    // 删除设备记录
    await prisma.userdevice.delete({
      where: { id: deviceId },
    });

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
    const token = request.cookies.get("auth_token")?.value;
    if (!token) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.userId as string;

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