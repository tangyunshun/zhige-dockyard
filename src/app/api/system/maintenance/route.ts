import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";
import { setMaintenanceMode, isMaintenanceMode, getMaintenanceMessage } from "@/lib/maintenance";

/**
 * 系统维护模式API（PRD G-02：持久化到 DB，重启后仍生效）
 */

/**
 * 获取系统维护状态
 */
export async function GET() {
  const inMaintenance = await isMaintenanceMode();
  const message = await getMaintenanceMessage();
  return NextResponse.json({
    maintenanceMode: inMaintenance,
    maintenanceMessage: message,
    currentTime: new Date().toISOString(),
  });
}

/**
 * 设置系统维护状态（仅管理员）
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const adminId = auth.user.id;
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    }

    const { enabled, message } = await request.json();
    const target = enabled ?? true;

    await setMaintenanceMode(target);
    if (message) {
      await prisma.systemconfig.upsert({
        where: { key: "maintenance_message" },
        create: { key: "maintenance_message", value: message },
        update: { value: message },
      });
    }

    console.log(`[系统维护] 管理员 ${adminId} 设置维护模式: ${target}`);

    // G-02：开启维护时，全局清空非管理员用户的会话（强制下线）
    if (target) {
      const result = await prisma.user.updateMany({
        where: {
          role: {
            notIn: ["ADMIN", "SUPERADMIN", "SUPER_ADMIN", "admin", "superadmin", "super_admin"],
          },
          sessionToken: { not: null },
        },
        data: {
          sessionToken: null,
          sessionExpiresAt: null,
          refreshToken: null,
          refreshTokenExpiresAt: null,
          lastForcedLogoutAt: new Date(),
        },
      });
      console.log(`[系统维护] 维护开启，已强制清除 ${result.count} 个在线普通用户的会话`);
    }

    return NextResponse.json({
      success: true,
      maintenanceMode: target,
      maintenanceMessage: message || (await getMaintenanceMessage()),
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
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    const adminId = auth.user.id;
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
    });

    if (!admin || !isAdminRole(admin.role)) {
      return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    }

    await setMaintenanceMode(false);
    console.log(`[系统维护] 管理员 ${adminId} 关闭维护模式`);

    return NextResponse.json({ success: true, message: "维护模式已关闭" });
  } catch (error) {
    console.error("关闭维护模式失败:", error);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}

/**
 * 供 check-maintenance 路由使用的同步检查
 */
export async function isInMaintenance(): Promise<{ inMaintenance: boolean; message?: string }> {
  const inMaintenance = await isMaintenanceMode();
  if (!inMaintenance) return { inMaintenance: false };
  return { inMaintenance: true, message: await getMaintenanceMessage() };
}
