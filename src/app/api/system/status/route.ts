import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isMaintenanceMode } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

/**
 * 实时系统运行状态探测 API
 * 1. 真实物理探测数据库连通性与查询往返延迟（ms）
 * 2. 真实读取系统当前是否处于停机维护模式
 * 3. 动态聚合返回真实系统健康状态，绝不硬编码假数据
 */
export async function GET() {
  try {
    const t0 = performance.now();
    let dbConnected = true;
    let latencyMs = 0;

    try {
      await prisma.$queryRaw`SELECT 1`;
      latencyMs = Math.round(performance.now() - t0);
    } catch (dbErr) {
      console.warn("系统状态探测 - 数据库连接异常:", dbErr);
      dbConnected = false;
    }

    const inMaintenance = await isMaintenanceMode();

    let status: "OPERATIONAL" | "MAINTENANCE" | "DEGRADED" = "OPERATIONAL";
    let statusText = "系统运行正常";

    if (!dbConnected) {
      status = "DEGRADED";
      statusText = "服务连接异常";
    } else if (inMaintenance) {
      status = "MAINTENANCE";
      statusText = "系统维护中";
    } else {
      status = "OPERATIONAL";
      statusText = "系统运行正常";
    }

    return NextResponse.json({
      success: true,
      status,
      statusText,
      latencyMs,
      inMaintenance,
      checkedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        success: false,
        status: "DEGRADED",
        statusText: "系统检测异常",
        error: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}
