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
    const limit = parseInt(searchParams.get("limit") || "10");
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

    // 网络安全合规生命周期：保留最近 3 年（1095天）的操作审计流水，超期数据物理出清
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    await prisma.operationlog.deleteMany({
      where: { createdAt: { lt: threeYearsAgo } },
    }).catch((err) => {
      console.warn("[日志生命周期] 自动清理3年前操作日志非致命提醒:", err);
    });

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
      // 高危操作数（删除类 / 封禁类）
      prisma.operationlog.count({
        where: {
          ...where,
          action: { in: ["user:delete", "component:delete", "workspace:delete", "user:ban"] },
        },
      }),
    ]);

    // 清洗 IP 地址，杜绝 ::1
    const enrichedLogs = logs.map((log) => {
      let cleanIp = log.ipAddress || "";
      if (!cleanIp || cleanIp === "::1" || cleanIp === "127.0.0.1" || cleanIp.includes("127.0.0.1")) {
        cleanIp = "127.0.0.1 (本地局域网)";
      } else if (cleanIp.startsWith("::ffff:")) {
        const v4 = cleanIp.replace("::ffff:", "");
        cleanIp = v4 === "127.0.0.1" ? "127.0.0.1 (本地局域网)" : v4;
      }
      return {
        ...log,
        ipAddress: cleanIp,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        logs: enrichedLogs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        stats: {
          total,
          today: todayCount,
          highRisk: highRiskCount,
        },
        retentionPolicy: {
          years: 3,
          days: 1095,
          description: "根据《网络安全法》审计要求，操作日志自动保留最近 3 年，超期数据系统自动物理出清。",
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

// 删除操作日志（支持单条、批量、以及3年生命周期出清）
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "audit:read");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const body = await request.json().catch(() => ({}));
    const { id, ids, cleanExpired } = body;

    // 模式 1：出清 3 年前历史超期日志
    if (cleanExpired) {
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

      const result = await prisma.operationlog.deleteMany({
        where: { createdAt: { lt: threeYearsAgo } },
      });

      return NextResponse.json({
        success: true,
        message: `合规生命周期出清成功：已清理 3 年前历史日志共 ${result.count} 条。`,
        count: result.count,
      });
    }

    // 模式 2：批量删除
    if (Array.isArray(ids) && ids.length > 0) {
      const result = await prisma.operationlog.deleteMany({
        where: { id: { in: ids } },
      });

      return NextResponse.json({
        success: true,
        message: `成功删除选中的 ${result.count} 条操作审计日志。`,
        count: result.count,
      });
    }

    // 模式 3：单个删除
    const targetId = id || new URL(request.url).searchParams.get("id");
    if (!targetId) {
      return NextResponse.json({ error: "缺少待删除日志记录的 ID" }, { status: 400 });
    }

    await prisma.operationlog.delete({
      where: { id: targetId },
    });

    return NextResponse.json({
      success: true,
      message: "操作日志已成功删除",
    });
  } catch (error) {
    console.error("Delete operation logs error:", error);
    return NextResponse.json(
      {
        error: "删除操作日志失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 }
    );
  }
}

