import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";

/**
 * GET /api/admin/demo-requests
 * 后台查看用户提交的演示申请列表（支持状态筛选与关键词搜索）
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(
      request,
      "user:update",
      "appeal:read",
      "appeal:manage",
      "demo:read",
      "demo:manage"
    );
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "10") || 10));
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const where: Record<string, unknown> = {};
    if (status && status !== "all") {
      where.status = status;
    }
    if (search && search.trim()) {
      const kw = search.trim();
      where.OR = [
        { name: { contains: kw } },
        { email: { contains: kw } },
        { company: { contains: kw } },
        { phone: { contains: kw } },
        { requirements: { contains: kw } },
      ];
    }

    const [requests, total] = await Promise.all([
      prisma.demorequest.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.demorequest.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      requests,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error("Get admin demo-requests list error:", error);
    return NextResponse.json(
      { error: "获取演示申请列表失败", message: error?.message || "服务器错误" },
      { status: 500 }
    );
  }
}
