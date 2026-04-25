import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * GET /api/admin/membership/users
 * 获取会员用户列表
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
    const membershipLevel = searchParams.get("membershipLevel");

    const skip = (page - 1) * limit;

    const where: any = {};

    if (membershipLevel) {
      where.membershipLevel = membershipLevel;
    }

    // 获取用户列表
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          createdAt: "desc",
        },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          membershipLevel: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    // 获取所有会员等级配置
    const levels = await prisma.membershipLevel.findMany({
      select: {
        name: true,
        nameZh: true,
        icon: true,
        color: true,
      },
    });

    const levelMap = levels.reduce((acc, level) => {
      acc[level.name] = level;
      return acc;
    }, {} as Record<string, any>);

    return NextResponse.json({
      success: true,
      data: {
        users: users.map((user) => ({
          ...user,
          membershipConfig: levelMap[user.membershipLevel] || null,
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Get membership users error:", error);
    return NextResponse.json(
      { message: "获取会员用户失败" },
      { status: 500 }
    );
  }
}
