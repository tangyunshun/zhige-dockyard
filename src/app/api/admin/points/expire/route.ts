export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { expireExpiredGrants } from "@/lib/credit-service";

/**
 * POST /api/admin/points/expire
 * 手动触发全局算力分桶到期清算（将已过期的赠送分桶未使用部分清零并写流水）。
 *
 * 自动调度（已接入，双重兜底）：
 *   1. 应用内：src/instrumentation.ts 在 Node server 启动时注册每日定时器（启动 60s 后首跑，之后每 24h 一次）。
 *   2. 系统级：scripts/expire-points-cron.ts（npm run cron:expire-points），由 crontab / 任务计划程序每日调用。
 * 此接口供运维在需要时手动立即执行。
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
      return NextResponse.json({ error: "越权警告：仅平台管理员可触发清算" }, { status: 403 });
    }

    const cleared = await expireExpiredGrants({});
    return NextResponse.json({
      success: true,
      message: `全局到期清算完成，共清零 ${cleared} 算力点`,
      cleared,
    });
  } catch (error) {
    console.error("到期清算失败:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
