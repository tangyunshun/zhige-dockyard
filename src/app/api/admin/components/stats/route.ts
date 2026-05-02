import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    // 获取全局统计数据（不受筛选影响）
    const [total, published, stages, totalUsage] = await Promise.all([
      prisma.componenttask.count(),
      prisma.componenttask.count({
        where: {
          isPublished: true,
        },
      }),
      prisma.componenttask.groupBy({
        by: ["type"],
      }),
      prisma.componenttask.aggregate({
        _sum: {
          usageCount: true,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        total,
        published,
        stages: stages.length,
        totalUsage: totalUsage._sum.usageCount || 0,
      },
    });
  } catch (error) {
    console.error("Get stats error:", error);
    return NextResponse.json(
      {
        error: "获取统计数据失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
