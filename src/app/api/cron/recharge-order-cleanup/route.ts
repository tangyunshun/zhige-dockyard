import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredRechargeOrders } from "@/lib/recharge-order-cleanup";

/**
 * POST /api/cron/recharge-order-cleanup
 *
 * 每日定时任务：自动删除创建时间超过 3 年的对公充值工单（数据保留策略）。
 * 与 src/instrumentation.ts 的进程内调度互为冗余。
 *
 * 安全：若配置了 CRON_SECRET，则要求请求头 x-cron-key 与之匹配；未配置时（开发环境）放行。
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const key = request.headers.get("x-cron-key");
    if (key !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const res = await cleanupExpiredRechargeOrders();
    return NextResponse.json({ success: true, deletedCount: res.deletedCount, cutoff: res.cutoff });
  } catch (error) {
    console.error("Cron recharge order cleanup error:", error);
    return NextResponse.json(
      { error: "超期工单清理执行失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
