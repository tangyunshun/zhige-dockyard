import { NextRequest, NextResponse } from "next/server";
import { validateUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// 前端 ActivityMonitor 在真实用户活动时调用，用于刷新服务端 lastActivityAt，
// 支撑 10 分钟空闲超时判定
export async function POST(request: NextRequest) {
  try {
    const authResult = await validateUser(
      request.headers.get("Authorization"),
      request,
    );
    if (!authResult.valid || !authResult.user) {
      // 空闲超时后不得续命，直接返回失效原因
      return NextResponse.json(
        { error: authResult.error || "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    await prisma.user.update({
      where: { id: authResult.user.id },
      data: { lastActivityAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Touch activity failed:", error);
    return NextResponse.json({ error: "SERVER_ERROR" }, { status: 500 });
  }
}
