export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";
import { scanAndNotifyZombies } from "@/lib/zombie-user";

/**
 * POST /api/admin/users/zombie-scan
 * 手动触发全量僵尸用户扫描，刷新 user.is_zombie 标记，并在检测到僵尸用户时
 * 向超级管理员推送系统通知。
 *
 * 自动调度（双重兜底）：
 *   1. 应用内：src/instrumentation.ts 在 Node server 启动时注册每日定时器。
 *   2. 系统级：scripts/zombie-scan-cron.ts（npm run cron:zombie-scan），由 crontab / 任务计划程序每日调用。
 * 此接口供管理员在需要时手动立即执行。
 */
function isPlatformAdmin(role?: string | null): boolean {
  const r = (role || "").toUpperCase();
  return r === "ADMIN" || r === "SUPER_ADMIN" || r === "PLATFORM_ADMIN";
}

export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }
    if (!isPlatformAdmin(auth.user.role)) {
      return NextResponse.json({ error: "越权警告：仅平台管理员可触发僵尸扫描" }, { status: 403 });
    }

    const result = await scanAndNotifyZombies();
    return NextResponse.json({
      success: true,
      message: `僵尸用户扫描完成，共识别 ${result.zombieCount} 个僵尸用户${result.notified ? `，已通知 ${result.notified} 位超级管理员` : ""}`,
      ...result,
    });
  } catch (error) {
    console.error("僵尸用户扫描失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
