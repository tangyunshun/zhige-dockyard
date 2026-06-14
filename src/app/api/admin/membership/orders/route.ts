import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdminRole } from "@/lib/auth";

/**
 * GET /api/admin/membership/orders
 * 获取会员订单列表
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

    // 如果是管理员
    if (!isAdminRole(authResult.user!.role)) {
      return NextResponse.json({ message: "权限不足" }, { status: 403 });
    }

    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status");
    const userId = searchParams.get("userId");
    const levelId = searchParams.get("levelId");

    const skip = (page - 1) * limit;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (userId) {
      where.userId = userId;
    }

    if (levelId) {
      where.levelId = levelId;
    }

    // 获取订单列表
    const [orders, total] = await Promise.all([
      prisma.membershiporder.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          membershiplevel: {
            select: {
              id: true,
              name: true,
              nameZh: true,
              icon: true,
              color: true,
            },
          },
        },
      }),
      prisma.membershiporder.count({ where }),
    ]);

    // 将 BigInt 转换为 Number 以便 JSON 序列化并进行字段重命名
    const serializedOrders = orders.map(order => {
      const { membershiplevel, ...rest } = order;
      return {
        ...rest,
        amount: Number(order.amount),
        level: membershiplevel,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        orders: serializedOrders,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error: any) {
    console.error("获取会员订单列表失败:", error);
    return NextResponse.json(
      {
        message: "获取会员订单列表失败",
        error: error.message,
      },
      { status: 500 },
    );
  }
}
