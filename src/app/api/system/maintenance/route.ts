﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

/**
 * 系统维护模式API
 * 用于查询和设置系统维护状态
 */

// 缓存维护模式状态（实际应该用Redis或数据库）
let maintenanceMode = false;
let maintenanceStart: Date | null = null;
let maintenanceEnd: Date | null = null;
let maintenanceMessage = "系统正在维护中，请稍后再试";

/**
 * 获取系统维护状态
 */
export async function GET() {
  return NextResponse.json({
    maintenanceMode,
    maintenanceStart,
    maintenanceEnd,
    maintenanceMessage,
    currentTime: new Date().toISOString(),
  });
}

/**
 * 设置系统维护状态（仅管理员）
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const adminId = authHeader.replace("Bearer ", "");
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    }

    const { enabled, start, end, message } = await request.json();

    maintenanceMode = enabled ?? true;
    maintenanceStart = start ? new Date(start) : null;
    maintenanceEnd = end ? new Date(end) : null;
    maintenanceMessage = message || "系统正在维护中，请稍后再试";

    console.log(
      `[系统维护] 管理员 ${adminId} 设置维护模式: ${maintenanceMode}, 结束时间: ${maintenanceEnd}`
    );

    return NextResponse.json({
      success: true,
      maintenanceMode,
      maintenanceStart,
      maintenanceEnd,
      maintenanceMessage,
    });
  } catch (error) {
    console.error("设置维护模式失败:", error);
    return NextResponse.json({ error: "设置失败" }, { status: 500 });
  }
}

/**
 * 关闭维护模式（仅管理员）
 */
export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    const adminId = authHeader.replace("Bearer ", "");
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    }

    maintenanceMode = false;
    maintenanceStart = null;
    maintenanceEnd = null;

    console.log(`[系统维护] 管理员 ${adminId} 关闭维护模式`);

    return NextResponse.json({
      success: true,
      message: "维护模式已关闭",
    });
  } catch (error) {
    console.error("关闭维护模式失败:", error);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}

/**
 * 检查当前是否处于维护模式
 */
export function isInMaintenance(): { inMaintenance: boolean; message?: string } {
  if (!maintenanceMode) {
    return { inMaintenance: false };
  }

  // 检查是否在维护时间段内
  const now = new Date();
  if (maintenanceStart && now < maintenanceStart) {
    return { inMaintenance: false };
  }
  if (maintenanceEnd && now > maintenanceEnd) {
    return { inMaintenance: false };
  }

  return {
    inMaintenance: true,
    message: maintenanceMessage,
  };
}