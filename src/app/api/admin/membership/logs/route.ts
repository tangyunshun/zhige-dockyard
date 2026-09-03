import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/admin/membership/logs
 * 获取会员变更日志列表
 */
export async function GET(request: NextRequest) {
  try {
    // 验证用户身份
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json(
        { message: authResult.error || "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    // 如果是管理员（统一角色判断，兼容 SUPER_ADMIN 等全部合法值）
    if (!isAdminRole(authResult.user!.role || "")) {
      return NextResponse.json({ message: "权限不足" }, { status: 403 });
    }

    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const userId = searchParams.get("userId");
    const changeType = searchParams.get("changeType");

    const skip = (page - 1) * limit;

    const where: any = {};

    if (userId) {
      where.userId = userId;
    }

    if (changeType) {
      where.changeType = changeType;
    }

    // 获取日志列表
    const [logs, total] = await Promise.all([
      prisma.membershipchangelog.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          user_membershipchangelog_userIdTouser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          user_membershipchangelog_operatorIdTouser: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          membershiplevel: {
            select: {
              name: true,
              nameZh: true,
              icon: true,
              color: true,
            },
          },
        },
      }),
      prisma.membershipchangelog.count({ where }),
    ]);

    // 将 BigInt 转换为 Number 以便 JSON 序列化并进行字段重命名
    const serializedLogs = logs.map(log => {
      const {
        user_membershipchangelog_userIdTouser,
        user_membershipchangelog_operatorIdTouser,
        membershiplevel,
        ...rest
      } = log;
      return {
        ...rest,
        user: user_membershipchangelog_userIdTouser,
        operator: user_membershipchangelog_operatorIdTouser,
        level: membershiplevel,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        logs: serializedLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get membership logs error:", error);
    return NextResponse.json(
      { message: "获取会员变更日志失败" },
      { status: 500 },
    );
  }
}
