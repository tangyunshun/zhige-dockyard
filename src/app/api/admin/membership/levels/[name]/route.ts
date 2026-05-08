﻿﻿﻿﻿﻿﻿﻿﻿﻿import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdmin } from "@/lib/auth";

/**
 * GET /api/admin/membership/levels
 * 获取所有会员等级信息
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

    // 如果不是管理员
    if (!isAdmin(authResult.user!)) {
      return NextResponse.json({ message: "无权访问" }, { status: 403 });
    }

    // 获取筛选参数
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const priceType = searchParams.get("priceType") || "";
    const status = searchParams.get("status") || "";

    // 构建查询条件
    const where: any = {};

    // 搜索过滤
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { nameZh: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    // 价格类型过滤
    if (priceType === "free") {
      where.priceMonthly = 0;
    } else if (priceType === "paid") {
      where.priceMonthly = { gt: 0 };
    }

    // 状态过滤
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

    // 如果不是管理员
    if (!isAdmin(authResult.user!)) {
      return NextResponse.json({ message: "无权访问" }, { status: 403 });
    }

    // 获取请求体数据
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
    const existing = await prisma.membershiplevel.findUnique({
      where: { name },
    });

    if (existing) {
      return NextResponse.json(
        { message: "会员等级已存在" },
        { status: 400 },
      );
    }

    // 创建会员等级
    const level = await prisma.membershiplevel.create({
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

    // 将 BigInt 转换为 Number 以便 JSON 序列化
    const serializedLevel = {
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
    };

    return NextResponse.json({
      success: true,
      data: serializedLevel,
      message: "创建成功",
    });
  } catch (error) {
    console.error("Create membership level error:", error);
    return NextResponse.json({ message: "创建会员等级失败" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/membership/levels/:name
 * 更新会员等级
 */
export async function PUT(request: NextRequest) {
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

    // 如果不是管理员
    if (!isAdmin(authResult.user!)) {
      return NextResponse.json({ message: "无权访问" }, { status: 403 });
    }

    // 获取 URL 中的 name 参数
    const { pathname } = new URL(request.url);
    const name = pathname.split("/").pop() || "";

    if (!name) {
      return NextResponse.json({ message: "缺少会员等级名称" }, { status: 400 });
    }

    // 获取请求体数据
    const body = await request.json();
    const {
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

    // 检查会员等级是否存在
    const existing = await prisma.membershiplevel.findUnique({
      where: { name },
    });

    if (!existing) {
      return NextResponse.json(
        { message: "会员等级不存在" },
        { status: 404 },
      );
    }

    // 更新会员等级
    const level = await prisma.membershiplevel.update({
      where: { name },
      data: {
        nameZh: nameZh !== undefined ? nameZh : existing.nameZh,
        icon: icon !== undefined ? icon : existing.icon,
        color: color !== undefined ? color : existing.color,
        description: description !== undefined ? description : existing.description,
        maxPersonalWorkspaces: maxPersonalWorkspaces !== undefined ? maxPersonalWorkspaces : Number(existing.maxPersonalWorkspaces),
        maxEnterpriseWorkspaces: maxEnterpriseWorkspaces !== undefined ? BigInt(maxEnterpriseWorkspaces) : existing.maxEnterpriseWorkspaces,
        maxComponents: maxComponents !== undefined ? BigInt(maxComponents) : existing.maxComponents,
        maxTeamSize: maxTeamSize !== undefined ? BigInt(maxTeamSize) : existing.maxTeamSize,
        maxStorage: maxStorage !== undefined ? BigInt(maxStorage) : existing.maxStorage,
        maxApiCalls: maxApiCalls !== undefined ? BigInt(maxApiCalls) : existing.maxApiCalls,
        features: features !== undefined ? features : existing.features,
        priceMonthly: priceMonthly !== undefined ? priceMonthly : Number(existing.priceMonthly),
        priceYearly: priceYearly !== undefined ? priceYearly : Number(existing.priceYearly),
        trialDays: trialDays !== undefined ? trialDays : Number(existing.trialDays),
        sortOrder: sortOrder !== undefined ? sortOrder : Number(existing.sortOrder),
        isActive: isActive !== undefined ? isActive : existing.isActive,
        isRecommended: isRecommended !== undefined ? isRecommended : existing.isRecommended,
        isPopular: isPopular !== undefined ? isPopular : existing.isPopular,
      },
    });

    // 将 BigInt 转换为 Number 以便 JSON 序列化
    const serializedLevel = {
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
    };

    return NextResponse.json({
      success: true,
      data: serializedLevel,
      message: "更新成功",
    });
  } catch (error) {
    console.error("Update membership level error:", error);
    return NextResponse.json({ message: "更新会员等级失败" }, { status: 500 });
  }
}
