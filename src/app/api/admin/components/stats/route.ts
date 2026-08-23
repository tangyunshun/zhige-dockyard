import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "component:read");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const [total, published, categories, usage] = await Promise.all([
      prisma.componentcatalog.count(),
      prisma.componentcatalog.count({ where: { isPublished: true } }),
      prisma.componentcategory.count(),
      prisma.componentcatalog.aggregate({
        _sum: { usageCount: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        total,
        published,
        stages: categories,
        totalUsage: Number(usage._sum.usageCount || 0),
      },
    });
  } catch (error) {
    console.error("Get component stats error:", error);
    return NextResponse.json({ error: "获取组件统计失败" }, { status: 500 });
  }
}
