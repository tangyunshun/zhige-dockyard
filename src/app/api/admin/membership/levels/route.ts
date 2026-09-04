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
    // 分页参数：仅当显式传入 page 时才启用服务端分页（保持旧调用方兼容：不传则返回全量）
    const rawPage = searchParams.get("page");
    const paginated = rawPage !== null && rawPage !== "";
    const page = Math.max(1, parseInt(rawPage || "", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "", 10) || 10));

    // 构建查询条件
    const where: any = {};

    // 搜索条件 (符合 MySQL 标准 contains 包含语法，移除 PostgreSQL 特有的 mode: "insensitive")
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { nameZh: { contains: search } },
        { description: { contains: search } },
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

    // 获取会员等级列表（分页时使用 skip/take）
    const total = paginated
      ? await prisma.membershiplevel.count({ where })
      : 0;

    const levels = await prisma.membershiplevel.findMany({
      where,
      orderBy: {
        sortOrder: "asc",
      },
      ...(paginated
        ? {
            skip: (page - 1) * limit,
            take: limit,
          }
        : {}),
    });

    // 将 BigInt 转换为 Number 以便 JSON 序列化
    const serializedLevels = levels.map((level) => ({
      ...level,
      maxPersonalWorkspaces: Number(level.maxPersonalWorkspaces || 0),
      maxEnterpriseWorkspaces: Number(level.maxEnterpriseWorkspaces || 0),
      maxComponents: Number(level.maxComponents || 0),
      maxTeamSize: Number(level.maxTeamSize || 0),
      maxStorage: Number(level.maxStorage || 0),
      maxApiCalls: Number(level.maxApiCalls || 0),
      tokenLimit: Number(level.tokenLimit || 0),
      priceMonthly: Number(level.priceMonthly || 0),
      priceYearly: Number(level.priceYearly || 0),
      trialDays: Number(level.trialDays || 0),
      sortOrder: Number(level.sortOrder || 0),
    }));

    return NextResponse.json({
      success: true,
      data: serializedLevels,
      ...(paginated
        ? {
            pagination: {
              page,
              limit,
              total,
              totalPages: Math.max(1, Math.ceil(total / limit)),
            },
          }
        : {}),
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

/**
 * POST /api/admin/membership/levels
 * 创建新的会员等级
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json(
        { message: authResult.error || "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    if (!isAdmin(authResult.user!)) {
      return NextResponse.json({ message: "无权访问" }, { status: 403 });
    }

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
      tokenLimit,
      features,
      priceMonthly,
      priceYearly,
      tokenPackDiscount,
      trialDays,
      sortOrder,
      isActive,
      isRecommended,
      isPopular,
    } = body;

    if (!name || !nameZh) {
      return NextResponse.json({ message: "缺少必填字段（等级编码或中文名称）" }, { status: 400 });
    }

    const existing = await prisma.membershiplevel.findUnique({
      where: { id: name },
    });

    if (existing) {
      return NextResponse.json(
        { message: `会员等级编码 [${name}] 已存在` },
        { status: 400 },
      );
    }

    const level = await prisma.membershiplevel.create({
      data: {
        id: name,
        name,
        nameZh,
        icon: icon || null,
        color: color || "#94a3b8",
        description: description || null,
        maxPersonalWorkspaces: Number(maxPersonalWorkspaces || 1),
        maxEnterpriseWorkspaces: BigInt(maxEnterpriseWorkspaces || 1),
        maxComponents: BigInt(maxComponents || 100),
        maxTeamSize: BigInt(maxTeamSize || 5),
        maxStorage: BigInt(maxStorage || 1073741824),
        maxApiCalls: BigInt(maxApiCalls || 1000),
        tokenLimit: BigInt(tokenLimit || 1000),
        features: features || [],
        priceMonthly: Number(priceMonthly || 0),
        priceYearly: Number(priceYearly || 0),
        tokenPackDiscount: Number(tokenPackDiscount || 0),
        trialDays: Number(trialDays || 0),
        sortOrder: Number(sortOrder || 0),
        isActive: isActive !== false,
        isRecommended: isRecommended === true,
        isPopular: isPopular === true,
        updatedAt: new Date(),
      },
    });

    const serializedLevel = {
      ...level,
      maxPersonalWorkspaces: Number(level.maxPersonalWorkspaces || 0),
      maxEnterpriseWorkspaces: Number(level.maxEnterpriseWorkspaces || 0),
      maxComponents: Number(level.maxComponents || 0),
      maxTeamSize: Number(level.maxTeamSize || 0),
      maxStorage: Number(level.maxStorage || 0),
      maxApiCalls: Number(level.maxApiCalls || 0),
      tokenLimit: Number(level.tokenLimit || 0),
      tokenPackDiscount: Number(level.tokenPackDiscount || 0),
      priceMonthly: Number(level.priceMonthly || 0),
      priceYearly: Number(level.priceYearly || 0),
      trialDays: Number(level.trialDays || 0),
      sortOrder: Number(level.sortOrder || 0),
    };

    return NextResponse.json({
      success: true,
      data: serializedLevel,
      message: "创建会员等级成功",
    });
  } catch (error: any) {
    console.error("创建会员等级失败:", error);
    return NextResponse.json({ message: "创建会员等级失败", error: error.message }, { status: 500 });
  }
}
