import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/admin/membership/orders
 * 获取会员订单列表
 */
export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json(
        { message: authResult.error || "未授权访问" },
        { status: 401 }
      );
    }

    // 检查是否是管理员
    if (
      authResult.user!.role !== "admin" &&
      authResult.user!.role !== "superadmin" &&
      authResult.user!.role !== "super_admin"
    ) {
      return NextResponse.json(
        { message: "需要管理员权限" },
        { status: 403 }
      );
    }

    // 解析查询参数
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
      prisma.membershipOrder.findMany({
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
              phone: true,
            },
          },
          level: {
            select: {
              name: true,
              nameZh: true,
              icon: true,
              color: true,
            },
          },
        },
      }),
      prisma.membershipOrder.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        orders,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get membership orders error:", error);
    return NextResponse.json(
      { message: "获取会员订单失败" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/membership/orders
 * 创建会员订单（管理员手动开通）
 */
export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json(
        { message: authResult.error || "未授权访问" },
        { status: 401 }
      );
    }

    // 检查是否是管理员
    if (
      authResult.user!.role !== "admin" &&
      authResult.user!.role !== "superadmin"
    ) {
      return NextResponse.json(
        { message: "需要管理员权限" },
        { status: 403 }
      );
    }

    // 解析请求体
    const body = await request.json();
    const {
      userId,
      levelId,
      orderType,
      paymentMethod,
      amount,
      startDate,
      endDate,
      transactionId,
      metadata,
    } = body;

    // 验证必填字段
    if (!userId || !levelId || !startDate || !endDate) {
      return NextResponse.json(
        { message: "缺少必填字段" },
        { status: 400 }
      );
    }

    // 检查用户是否存在
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { message: "用户不存在" },
        { status: 400 }
      );
    }

    // 检查会员等级是否存在
    const level = await prisma.membershipLevel.findUnique({
      where: { name: levelId },
    });

    if (!level) {
      return NextResponse.json(
        { message: "会员等级不存在" },
        { status: 400 }
      );
    }

    // 创建订单
    const order = await prisma.membershipOrder.create({
      data: {
        userId,
        levelId,
        orderType: orderType || "NEW",
        paymentMethod: paymentMethod || "BANK_TRANSFER",
        amount: amount || 0,
        currency: "CNY",
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        status: "PAID", // 管理员手动开通，直接设为已支付
        transactionId: transactionId || null,
        metadata: metadata || null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        level: {
          select: {
            name: true,
            nameZh: true,
            icon: true,
            color: true,
          },
        },
      },
    });

    // 更新用户的会员等级
    await prisma.user.update({
      where: { id: userId },
      data: {
        membershipLevel: levelId,
      },
    });

    // 创建会员变更日志
    await prisma.membershipChangeLog.create({
      data: {
        userId,
        levelId,
        operatorId: authResult.user!.id,
        changeType: "LEVEL_UP",
        newValue: {
          levelId,
          levelName: level.nameZh,
          orderId: order.id,
        },
        reason: "管理员手动开通",
      },
    });

    return NextResponse.json({
      success: true,
      data: order,
      message: "创建成功",
    });
  } catch (error) {
    console.error("Create membership order error:", error);
    return NextResponse.json(
      { message: "创建会员订单失败" },
      { status: 500 }
    );
  }
}
