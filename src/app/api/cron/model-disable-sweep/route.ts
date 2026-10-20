import { NextRequest, NextResponse } from "next/server";
import { processDueModelDisables } from "@/lib/model-disable-service";

/**
 * POST /api/cron/model-disable-sweep
 *
 * 定时扫描并执行「到点的定时禁用模型」计划：翻 enabled=false、把受影响空间默认替换为替代模型、
 * 精准站内信通知受影响 Owner、写审计。建议外部调度器每 5-15 分钟调用一次。
 *
 * 安全：配置了 CRON_SECRET 时要求请求头 x-cron-key 匹配；未配置（开发环境）放行。
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
    const result = await processDueModelDisables();
    return NextResponse.json({
      success: true,
      ...result,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Cron model disable sweep error:", error);
    return NextResponse.json(
      { error: "定时禁用执行失败", details: error instanceof Error ? error.message : "" },
      { status: 500 },
    );
  }
}
