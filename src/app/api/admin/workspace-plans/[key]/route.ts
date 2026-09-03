import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdmin } from "@/lib/auth";

function serializePlan(plan: any) {
  return {
    ...plan,
    priceMonthly: Number(plan.priceMonthly || 0),
    priceYearly: Number(plan.priceYearly || 0),
    maxComponents: Number(plan.maxComponents ?? 0),
    maxMembers: Number(plan.maxMembers ?? 0),
    maxStorage: Number(plan.maxStorage ?? 0),
    maxApiCalls: Number(plan.maxApiCalls ?? 0),
    tokenLimit: Number(plan.tokenLimit ?? 0),
    sortOrder: Number(plan.sortOrder || 0),
    features: Array.isArray(plan.features) ? plan.features : [],
  };
}

async function adminGuard(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const authResult = await validateUser(authHeader);
  if (!authResult.valid) {
    return {
      error: NextResponse.json(
        { message: authResult.error || "UNAUTHORIZED" },
        { status: 401 },
      ),
    };
  }
  if (!isAdmin(authResult.user!)) {
    return {
      error: NextResponse.json({ message: "权限不足" }, { status: 403 }),
    };
  }
  return { user: authResult.user };
}

function getKey(request: NextRequest, context?: any): string {
  const paramsResolved = context?.params ? context.params : null;
  const rawKey =
    paramsResolved?.key || new URL(request.url).pathname.split("/").pop() || "";
  return decodeURIComponent(rawKey).toUpperCase();
}

/**
 * PUT /api/admin/workspace-plans/:key
 * 更新空间套餐
 */
export async function PUT(request: NextRequest, context?: any) {
  const guard = await adminGuard(request);
  if (guard.error) return guard.error;

  const key = getKey(request, context);
  if (!key) {
    return NextResponse.json({ message: "缺少套餐标识" }, { status: 400 });
  }

  try {
    const existing = await prisma.workspaceplan.findUnique({ where: { key } });
    if (!existing) {
      return NextResponse.json(
        { message: `未找到标识为 [${key}] 的空间套餐` },
        { status: 404 },
      );
    }

    const body = await request.json();
    const {
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

    const plan = await prisma.workspaceplan.update({
      where: { key },
      data: {
        name: name !== undefined ? name : existing.name,
        description:
          description !== undefined ? description : existing.description,
        priceMonthly:
          priceMonthly !== undefined
            ? Number(priceMonthly)
            : Number(existing.priceMonthly),
        priceYearly:
          priceYearly !== undefined
            ? Number(priceYearly)
            : Number(existing.priceYearly),
        maxComponents:
          maxComponents !== undefined
            ? Number(maxComponents)
            : Number(existing.maxComponents),
        maxMembers:
          maxMembers !== undefined
            ? Number(maxMembers)
            : Number(existing.maxMembers),
        maxStorage:
          maxStorage !== undefined
            ? Number(maxStorage)
            : Number(existing.maxStorage),
        maxApiCalls:
          maxApiCalls !== undefined
            ? Number(maxApiCalls)
            : Number(existing.maxApiCalls),
        tokenLimit:
          tokenLimit !== undefined
            ? Number(tokenLimit)
            : Number(existing.tokenLimit),
        features:
          features !== undefined
            ? Array.isArray(features)
              ? (features as any)
              : []
            : (Array.isArray(existing.features) ? existing.features : []),
        sortOrder:
          sortOrder !== undefined
            ? Number(sortOrder)
            : Number(existing.sortOrder),
        purchasable:
          purchasable !== undefined ? purchasable === true : existing.purchasable,
        isActive:
          isActive !== undefined ? isActive === true : existing.isActive,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      data: serializePlan(plan),
      message: "更新空间套餐成功",
    });
  } catch (error: any) {
    console.error("更新空间套餐失败:", error);
    return NextResponse.json(
      { message: "更新空间套餐失败", error: error.message },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/workspace-plans/:key
 * 删除空间套餐
 */
export async function DELETE(request: NextRequest, context?: any) {
  const guard = await adminGuard(request);
  if (guard.error) return guard.error;

  const key = getKey(request, context);
  if (!key) {
    return NextResponse.json({ message: "缺少套餐标识" }, { status: 400 });
  }

  try {
    const existing = await prisma.workspaceplan.findUnique({ where: { key } });
    if (!existing) {
      return NextResponse.json(
        { message: `未找到标识为 [${key}] 的空间套餐` },
        { status: 404 },
      );
    }

    // 仅允许删除已停用的套餐（启用中的套餐由前端拦截，这里再次兜底）
    if (existing.isActive) {
      return NextResponse.json(
        { message: "启用中的套餐不可删除，请先停用" },
        { status: 400 },
      );
    }

    await prisma.workspaceplan.delete({ where: { key } });

    return NextResponse.json({
      success: true,
      message: "删除空间套餐成功",
    });
  } catch (error: any) {
    console.error("删除空间套餐失败:", error);
    return NextResponse.json(
      { message: "删除空间套餐失败", error: error.message },
      { status: 500 },
    );
  }
}
