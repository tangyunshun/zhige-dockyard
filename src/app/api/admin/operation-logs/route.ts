import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";

export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限包
    const authResult = await requirePlatformPermission(request, "audit:read");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const actionType = searchParams.get("action") || "";
    const userKeyword = searchParams.get("user") || "";
    const resourceType = searchParams.get("resource") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";

    const skip = (page - 1) * limit;
    const where: any = {};

    // 操作类型：精确匹配枚举值
    if (actionType) {
      where.action = actionType;
    }

    // 用户名 / 邮箱模糊搜索（不再需要手动传 ID）
    if (userKeyword) {
      where.user = {
        OR: [
          { name: { contains: userKeyword } },
          { email: { contains: userKeyword } },
        ],
      };
    }

    // 资源类型过滤
    if (resourceType) {
      where.resource = { contains: resourceType };
    }

    // 时间范围过滤
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        // 包含当天结束时刻
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [logs, total, todayCount, highRiskCount] = await Promise.all([
      prisma.operationlog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              role: true,
            },
          },
        },
      }),
      prisma.operationlog.count({ where }),
      // 今日操作数（真实聚合）
      prisma.operationlog.count({
        where: {
          ...where,
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
      // 高危操作数（删除类）
      prisma.operationlog.count({
        where: {
          ...where,
          action: { in: ["DELETE", "DELETE_USER", "DELETE_COMPONENT", "DELETE_WORKSPACE"] },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        logs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        stats: {
          total,
          today: todayCount,
          highRisk: highRiskCount,
        },
      },
    });
  } catch (error) {
    console.error("Get operation logs error:", error);
    return NextResponse.json(
      {
        error: "获取操作日志失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
