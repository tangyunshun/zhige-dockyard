import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdmin } from "@/lib/auth";

/**
 * GET /api/admin/membership/levels
 * 获取会员等级列表
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
    if (!isAdmin(authResult.user!)) {
      return NextResponse.json({ message: "权限不足" }, { status: 403 });
    }

    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const priceType = searchParams.get("priceType") || "";
    const status = searchParams.get("status") || "";

    // 构建查询条件
    const where: any = {};

    // 搜索条件
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { nameZh: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    // 价格类型筛选
    if (priceType === "free") {
      where.priceMonthly = 0;
    } else if (priceType === "paid") {
      where.priceMonthly = { gt: 0 };
    }

    // 状态筛选
    if (status === "active") {
      where.isActive = true;
    } else if (status === "inactive") {
      where.isActive = false;
    }

    // 获取会员等级列表
    const levels = await prisma.membershiplevel.findMany({
      where,
      orderBy: {
        sortOrder: "asc",
      },
    });

    // 将 BigInt 转换为 Number 以便 JSON 序列化
    const serializedLevels = levels.map((level) => ({
      ...level,
      maxPersonalWorkspaces: Number(level.maxPersonalWorkspaces),
      maxEnterpriseWorkspaces: Number(level.maxEnterpriseWorkspaces),
      maxComponents: Number(level.maxComponents),
      maxTeamSize: Number(level.maxTeamSize),
      maxStorage: Number(level.maxStorage),
      maxApiCalls: Number(level.maxApiCalls),
      priceMonthly: Number(level.priceMonthly),
      priceYearly: Number(level.priceYearly),
      trialDays: Number(level.trialDays),
      sortOrder: Number(level.sortOrder),
    }));

    return NextResponse.json({
      success: true,
      data: serializedLevels,
    });
  } catch (error: any) {
    console.error("获取会员等级列表失败:", error);
    return NextResponse.json(
      {
        message: "获取会员等级列表失败",
        error: error.message,
      },
      { status: 500 },
    );
  }
}
