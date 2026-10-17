import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdmin } from "@/lib/auth";
import { buildDynamicPlanFeatures } from "@/lib/workspace-plan-service";
import { requirePlatformPermission } from "@/lib/security";

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
  const authCheck = await requirePlatformPermission(request, "workspace_plan:update", "workspace_plan:publish");
  if (!authCheck.authorized) {
    // requirePlatformPermission 契约：失败时返回 errorResponse
    return authCheck.errorResponse || NextResponse.json({ message: "权限不足" }, { status: 403 });
  }

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
      trialGift,
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
        trialGift:
          trialGift !== undefined ? (trialGift as any) : existing.trialGift,
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
  // 空间套餐删除为高危动作，仅限超级管理员
  const authCheck = await requirePlatformPermission(request, "workspace_plan:update", "workspace_plan:status_update");
  if (!authCheck.authorized) {
    // requirePlatformPermission 契约：失败时返回 errorResponse
    return authCheck.errorResponse || NextResponse.json({ message: "权限不足" }, { status: 403 });
  }
  // requirePlatformPermission 契约：没有 isSuperAdmin 字段，改为从 user.role 归一化判断（保持"仅超管可删"不变）
  const operatorRole = String(authCheck.user?.role || "").toUpperCase().trim();
  if (!["SUPER_ADMIN", "SUPERADMIN", "SUPER_ADMIN_ROLE", "SUPER"].includes(operatorRole)) {
    return NextResponse.json({ message: "空间套餐删除仅限超级管理员操作" }, { status: 403 });
  }

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

    // 仍被空间绑定的套餐禁止删除：workspace.plan 为普通字符串、无外键级联，
    // 删除后这些空间的套餐引用会变成孤儿并静默回落为默认套餐，导致展示与实际配额不一致
    const boundCount = await prisma.workspace.count({ where: { plan: key } });
    if (boundCount > 0) {
      return NextResponse.json(
        {
          message: `该套餐仍被 ${boundCount} 个空间使用，无法删除。请先将这些空间迁移到其他套餐，再执行删除。`,
        },
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
