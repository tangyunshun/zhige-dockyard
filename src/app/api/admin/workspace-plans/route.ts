import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdmin } from "@/lib/auth";
import { buildDynamicPlanFeatures } from "@/lib/workspace-plan-service";

function serializePlan(plan: any) {
  const maxComponents = Number(plan.maxComponents ?? 0);
  const maxMembers = Number(plan.maxMembers ?? 0);
  const maxStorage = Number(plan.maxStorage ?? 0);
  const maxApiCalls = Number(plan.maxApiCalls ?? 0);
  const rawFeatures = Array.isArray(plan.features) ? plan.features : [];

  return {
    ...plan,
    priceMonthly: Number(plan.priceMonthly || 0),
    priceYearly: Number(plan.priceYearly || 0),
    maxComponents,
    maxMembers,
    maxStorage,
    maxApiCalls,
    tokenLimit: Number(plan.tokenLimit ?? 0),
    sortOrder: Number(plan.sortOrder || 0),
    features: buildDynamicPlanFeatures({
      maxMembers,
      maxComponents,
      maxStorage,
      maxApiCalls,
      customFeatures: rawFeatures,
    }),
  };
}

/**
 * GET /api/admin/workspace-plans
 * 获取空间套餐列表（后台管理）
 */
export async function GET(request: NextRequest) {
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
      return NextResponse.json({ message: "权限不足" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const priceType = searchParams.get("priceType") || "";
    const status = searchParams.get("status") || "";

    const where: any = {};
    if (search) {
      where.OR = [
        { key: { contains: search } },
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }
    if (priceType === "free") {
      where.priceMonthly = 0;
    } else if (priceType === "paid") {
      where.priceMonthly = { gt: 0 };
    }
    if (status === "active") {
      where.isActive = true;
    } else if (status === "inactive") {
      where.isActive = false;
    }

    const plans = await prisma.workspaceplan.findMany({
      where,
      orderBy: { sortOrder: "asc" },
    });

    // 统计各套餐当前关联的真实工作空间数量
    const workspaceCounts = await prisma.workspace.groupBy({
      by: ["plan"],
      _count: { id: true },
    }).catch(() => []);
    const planCountMap = new Map(workspaceCounts.map((w) => [w.plan, w._count.id]));

    return NextResponse.json({
      success: true,
      data: plans.map((p) => ({
        ...serializePlan(p),
        workspaceCount: planCountMap.get(p.key) || 0,
      })),
    });
  } catch (error: any) {
    console.error("获取空间套餐列表失败:", error);
    return NextResponse.json(
      { message: "获取空间套餐列表失败", error: error.message },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/workspace-plans
 * 创建新的空间套餐
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
      key,
      name,
      description,
      priceMonthly,
      priceYearly,
      maxComponents,
      maxMembers,
      maxStorage,
      maxApiCalls,
      tokenLimit,
      features,
      sortOrder,
      purchasable,
      isActive,
    } = body;

    if (!key || !name) {
      return NextResponse.json(
        { message: "缺少必填字段（套餐标识或名称）" },
        { status: 400 },
      );
    }

    const upperKey = String(key).toUpperCase();
    if (!/^[A-Z][A-Z0-9_]*$/.test(upperKey)) {
      return NextResponse.json(
        { message: "套餐标识只能包含大写字母、数字和下划线，且以大写字母开头" },
        { status: 400 },
      );
    }

    const existing = await prisma.workspaceplan.findUnique({
      where: { key: upperKey },
    });
    if (existing) {
      return NextResponse.json(
        { message: `套餐标识 [${upperKey}] 已存在` },
        { status: 400 },
      );
    }

    const plan = await prisma.workspaceplan.create({
      data: {
        key: upperKey,
        name,
        description: description || "",
        priceMonthly: Number(priceMonthly || 0),
        priceYearly: Number(priceYearly || 0),
        maxComponents: Number(maxComponents ?? 0),
        maxMembers: Number(maxMembers ?? 0),
        maxStorage: Number(maxStorage ?? 0),
        maxApiCalls: Number(maxApiCalls ?? 0),
        tokenLimit: Number(tokenLimit ?? 0),
        features: Array.isArray(features) ? features : [],
        sortOrder: Number(sortOrder || 0),
        purchasable: purchasable !== false,
        isActive: isActive !== false,
      },
    });

    return NextResponse.json({
      success: true,
      data: serializePlan(plan),
      message: "创建空间套餐成功",
    });
  } catch (error: any) {
    console.error("创建空间套餐失败:", error);
    return NextResponse.json(
      { message: "创建空间套餐失败", error: error.message },
      { status: 500 },
    );
  }
}
