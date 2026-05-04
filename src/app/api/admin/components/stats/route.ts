import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    // 查询所有记录，然后在内存中过滤掉阶段配置
    const allComponents = await prisma.componenttask.findMany();

    // 过滤掉阶段配置数据
    const filteredComponents = allComponents.filter(
      (component) => component.config?.isStageConfig !== true,
    );

    // 计算统计数据
    const total = filteredComponents.length;
    const published = filteredComponents.filter((c) => c.isPublished).length;
    const stages = Array.from(new Set(filteredComponents.map((c) => c.type))).filter(Boolean);
    const totalUsage = filteredComponents.reduce(
      (sum, c) => sum + (c.usageCount || 0),
      0,
    );

    return NextResponse.json({
      success: true,
      data: {
        total,
        published,
        stages: stages.length,
        totalUsage,
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
