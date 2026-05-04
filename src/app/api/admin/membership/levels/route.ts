import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser, isAdmin } from "@/lib/auth";

/**
 * GET /api/admin/membership/levels
 * 获取所有会员等级列表
 */
export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json(
        { message: authResult.error || "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    // 检查是否是管理员
    if (!isAdmin(authResult.user!)) {
      return NextResponse.json({ message: "需要管理员权限" }, { status: 403 });
    }

    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const priceType = searchParams.get("priceType") || "";
    const status = searchParams.get("status") || "";

    // 构建筛选条件
    const where: any = {};

    // 搜索筛选
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { nameZh: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    // 价格筛选
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

    // 获取所有会员等级
    const levels = await prisma.membershipLevel.findMany({
      where,
      orderBy: {
        sortOrder: "asc",
      },
    });

    // 将 BigInt 转换为 Number，以便 JSON 序列化
    const serializedLevels = levels.map((level) => ({
      ...level,
      maxPersonalWorkspaces: Number(level.maxPersonalWorkspaces),
      maxEnterpriseWorkspaces: Number(level.maxEnterpriseWorkspaces),
      maxComponents: Number(level.maxComponents),
      maxTeamSize: Number(level.maxTeamSize),
      maxStorage: Number(level.maxStorage),
      maxApiCalls: Number(level.maxApiCalls),
    }));

    return NextResponse.json({
      success: true,
      data: serializedLevels,
    });
  } catch (error) {
    console.error("Get membership levels error:", error);
    return NextResponse.json({ message: "获取会员等级失败" }, { status: 500 });
  }
}

/**
 * POST /api/admin/membership/levels
 * 创建新的会员等级
 */
export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json(
        { message: authResult.error || "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    // 检查是否是管理员
    if (!isAdmin(authResult.user!)) {
      return NextResponse.json({ message: "需要管理员权限" }, { status: 403 });
    }

    // 解析请求体
    const body = await request.json();
    const {
      name,
      nameZh,
      icon,
      color,
      description,
      maxPersonalWorkspaces,
      maxEnterpriseWorkspaces,
      maxComponents,
      maxTeamSize,
      maxStorage,
      maxApiCalls,
      features,
      priceMonthly,
      priceYearly,
      trialDays,
      sortOrder,
      isActive,
      isRecommended,
      isPopular,
    } = body;

    // 验证必填字段
    if (!name || !nameZh) {
      return NextResponse.json({ message: "缺少必填字段" }, { status: 400 });
    }

    // 检查是否已存在
    const existing = await prisma.membershipLevel.findUnique({
      where: { name },
    });

    if (existing) {
      return NextResponse.json(
        { message: "该会员等级已存在" },
        { status: 400 },
      );
    }

    // 创建会员等级
    const level = await prisma.membershipLevel.create({
      data: {
        name,
        nameZh,
        icon: icon || null,
        color: color || "#94a3b8",
        description: description || null,
        maxPersonalWorkspaces: maxPersonalWorkspaces || 1,
        maxEnterpriseWorkspaces: BigInt(maxEnterpriseWorkspaces || 1),
        maxComponents: BigInt(maxComponents || 100),
        maxTeamSize: BigInt(maxTeamSize || 5),
        maxStorage: BigInt(maxStorage || 1073741824),
        maxApiCalls: BigInt(maxApiCalls || 1000),
        features: features || [],
        priceMonthly: priceMonthly || 0,
        priceYearly: priceYearly || 0,
        trialDays: trialDays || 0,
        sortOrder: sortOrder || 0,
        isActive: isActive !== false,
        isRecommended: isRecommended === true,
        isPopular: isPopular === true,
      },
    });

    return NextResponse.json({
      success: true,
      data: level,
      message: "创建成功",
    });
  } catch (error) {
    console.error("Create membership level error:", error);
    return NextResponse.json({ message: "创建会员等级失败" }, { status: 500 });
  }
}
