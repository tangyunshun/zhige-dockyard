import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser, isAdminRole } from "@/lib/auth";

/**
 * GET /api/admin/membership/users
 * 获取会员用户列表
 */
export async function GET(request: NextRequest) {
  try {
    console.log("=== 获取会员用户列表 ===");

    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    console.log(
      "Auth Header:",
      authHeader ? authHeader.substring(0, 20) + "..." : "无",
    );

    const authResult = await validateUser(authHeader);
    console.log("Auth Result:", authResult);

    if (!authResult.valid) {
      console.log("认证失败:", authResult.error);
      return NextResponse.json(
        { message: authResult.error || "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    // 检查是否是管理员
    if (!isAdminRole(authResult.user!.role)) {
      console.log("用户不是管理员:", authResult.user);
      return NextResponse.json({ message: "需要管理员权限" }, { status: 403 });
    }

    // 解析查询参数
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const membershipLevel = searchParams.get("membershipLevel");

    console.log("查询参数:", { page, limit, membershipLevel });

    const skip = (page - 1) * limit;

    // 获取所有会员等级配置
    const levels = await prisma.membershipLevel.findMany({
      select: {
        name: true,
        nameZh: true,
        icon: true,
        color: true,
      },
    });

    const levelNames = levels.map((level) => level.name);
    console.log("可用的会员等级:", levelNames);

    // 只显示真正的会员等级（排除 FREE 免费版）
    const memberLevels = ["BRONZE", "SILVER", "GOLD", "DIAMOND", "CROWN"];
    const validLevels = levelNames.length > 0 
      ? levelNames.filter(level => memberLevels.includes(level))
      : memberLevels;

    const where: any = {
      // 只显示会员用户（排除免费版、空字符串和 null）
      membershipLevel: {
        in: validLevels,
      },
    };

    if (membershipLevel) {
      where.membershipLevel = membershipLevel;
    }

    console.log("查询条件:", where);

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

    console.log("查询结果:", { usersCount: users.length, total });

    const levelMap = levels.reduce(
      (acc, level) => {
        acc[level.name] = level;
        return acc;
      },
      {} as Record<string, any>,
    );

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
  } catch (error: any) {
    console.error("=== 获取会员用户失败 ===");
    console.error("错误类型:", error.constructor.name);
    console.error("错误消息:", error.message);
    console.error("错误代码:", error.code);
    console.error("错误堆栈:", error.stack);
    if (error.meta) {
      console.error("错误详情:", error.meta);
    }

    return NextResponse.json(
      {
        message: "获取会员用户失败",
        error: error.message,
        code: error.code,
      },
      { status: 500 },
    );
  }
}
