import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";
import { resolveComponentCost } from "@/lib/component-cost";
// 成本底线唯一计算真源：管理后台保存、执行链路巡检、初始化脚本共用，严禁重复实现
import { computeCostFloorPoints } from "@/lib/component-cost-floor";

function normalizeTags(tags: unknown): string {
  if (Array.isArray(tags)) return tags.join(",");
  if (typeof tags === "string") return tags;
  return "";
}

function toCatalogView(c: any, categoryName?: string) {
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    type: categoryName || c.category,
    icon: c.icon,
    category: c.category,
    tags: normalizeTags(c.tags),
    sortOrder: c.sortOrder,
    isPremium: c.isPremium,
    estimatedModelTokens: c.estimatedModelTokens,
    previewData: c.previewData,
    inputMode: c.inputMode,
    accept: c.accept,
    hint: c.hint,
    contract: c.contract,
    keywords: c.keywords,
    // 深度详情（长介绍 fullDescription / usage / apiDoc 等）一并返回，
    // 使管理后台与前台集市、工作台读取的是同一段数据库内容，避免介绍不一致
    detail: c.detail,
    // 计费改版：成本底线 / 选型模型 / 预估 Token / 复杂度，供后台「成本底线」展示与防亏本校验
    costFloorPoints: c.costFloorPoints,
    costModelDeploymentId: c.costModelDeploymentId,
    estimatedInputTokens: c.estimatedInputTokens,
    estimatedOutputTokens: c.estimatedOutputTokens,
    pricingComplexity: c.pricingComplexity,
    isPublished: c.isPublished,
    usageCount: c.usageCount,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "component:read");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "20"));
    const search = searchParams.get("search") || "";
    const stage = searchParams.get("stage") || "";
    const published = searchParams.get("published") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";

    const categories = await prisma.componentcategory.findMany({
      orderBy: { sortOrder: "asc" },
    });
    const categoryNameMap = new Map(categories.map((c) => [c.key, c.name]));

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }
    if (stage) {
      where.category = stage;
    }
    if (published === "true" || published === "false") {
      where.isPublished = published === "true";
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setDate(end.getDate() + 1);
        where.createdAt.lt = end;
      }
    }

    const [total, records] = await Promise.all([
      prisma.componentcatalog.count({ where }),
      prisma.componentcatalog.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const components = records.map((c) =>
      toCatalogView(c, categoryNameMap.get(c.category)),
    );

    return NextResponse.json({
      success: true,
      data: {
        components,
        total,
        totalPages: Math.ceil(total / limit),
        page,
        limit,
        stages: categories.map((c) => c.key),
        categories,
      },
    });
  } catch (error) {
    console.error("Get components error:", error);
    return NextResponse.json(
      { error: "获取组件列表失败", details: error instanceof Error ? error.message : error },
      { status: 500 },
    );
  }
}

async function handleUpsert(request: NextRequest, isUpdate: boolean) {
  const body = await request.json();
  const { name, description, type, icon, category, tags, isPublished } = body;
  const requiredPermissions = isUpdate
    ? isPublished !== undefined
      ? // 上下架/发布：细粒度 component:status_update ∨ 原有 component:publish
        ["component:publish", "component:status_update"]
      : ["component:update"]
    : ["component:create"];

  const authResult = await requirePlatformPermission(request, ...requiredPermissions);
  if (!authResult.authorized) {
    return authResult.errorResponse!;
  }
  const userId = authResult.user!.id;

  const tagList = Array.isArray(tags)
    ? tags
    : typeof tags === "string"
      ? tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];
  const categoryKey = category || (typeof type === "string" ? type : "");
  // 是否显式携带了分类字段：上架 / 下架等局部更新只传 isPublished，不携带分类
  const categoryProvided = category !== undefined || type !== undefined;

  // 分类校验规则：
  // 1) 显式携带分类（编辑保存）时必须有效——曾发生过「空分类写库 → 组件从分类筛选中消失」的数据污染；
  // 2) 新建必须携带分类；
  // 3) 未携带分类的局部更新（如仅切换上架状态）不校验、也不覆盖数据库原分类
  if (categoryProvided && !categoryKey) {
    return NextResponse.json({ error: "缺少必填字段（领域分类）" }, { status: 400 });
  }
  if (!isUpdate && !categoryKey) {
    return NextResponse.json({ error: "缺少必填字段（领域分类）" }, { status: 400 });
  }
  if (!isUpdate && !name) {
    return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
  }

  const MAX_NAME_LENGTH = 50;
  const MAX_DESCRIPTION_LENGTH = 190;
  if (name && name.length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: `组件名称最多 ${MAX_NAME_LENGTH} 字` }, { status: 400 });
  }
  if (description && description.length > MAX_DESCRIPTION_LENGTH) {
    return NextResponse.json({ error: `功能职责描述最多 ${MAX_DESCRIPTION_LENGTH} 字` }, { status: 400 });
  }

  // 服务端强校验：算力成本必须是合法正整数（前端校验不能作为唯一防线）。
  // 新建必填；更新仅在显式携带时校验并写入，未携带则保持数据库原值，绝不重置为 0
  const costDecision = resolveComponentCost(body.estimatedModelTokens, isUpdate);
  if (!costDecision.ok) {
    return NextResponse.json({ error: costDecision.message }, { status: 400 });
  }

  // 更新场景：提前读取数据库组件（用于成本底线校验判定「未携带成本字段」时的原值，以及下架门禁）
  let current: any = null;
  if (isUpdate) {
    const { searchParams: sp } = new URL(request.url);
    const componentId = sp.get("id");
    if (!componentId) {
      return NextResponse.json({ error: "缺少组件 ID" }, { status: 400 });
    }
    current = await prisma.componentcatalog.findUnique({ where: { id: componentId } });
    if (!current) {
      return NextResponse.json({ error: "组件不存在" }, { status: 404 });
    }
  }

  // 计费改版：系统成本底线（防亏本红线）计算 + 最终售价不得低于底线校验 + 模型技术上限校验。
  // 生效口径：显式传入用传入值，否则沿用库中原值（局部更新不误判、不覆盖）。
  // 复杂度仅接受四档枚举（与后台面板下拉一致），面板外的非法值一律归空，杜绝脏数据。
  const PRICING_COMPLEXITY_VALUES = ["LIGHT", "MEDIUM", "HEAVY", "PREMIUM"];
  const pricingComplexityNormalized =
    body.pricingComplexity && PRICING_COMPLEXITY_VALUES.includes(String(body.pricingComplexity))
      ? String(body.pricingComplexity)
      : null;
  const costModelDeploymentId = body.costModelDeploymentId ?? null;
  const estimatedInputTokens = Number(body.estimatedInputTokens) || 0;
  const estimatedOutputTokens = Number(body.estimatedOutputTokens) || 0;
  const effectiveDeploymentId =
    body.costModelDeploymentId !== undefined
      ? costModelDeploymentId
      : (current as any)?.costModelDeploymentId ?? null;
  const effectiveInputTokens =
    body.estimatedInputTokens !== undefined
      ? estimatedInputTokens
      : isUpdate
        ? (current as any)?.estimatedInputTokens ?? 0
        : estimatedInputTokens || 4000;
  const effectiveOutputTokens =
    body.estimatedOutputTokens !== undefined
      ? estimatedOutputTokens
      : isUpdate
        ? (current as any)?.estimatedOutputTokens ?? 0
        : estimatedOutputTokens || 2000;
  const costFloorPoints = await computeCostFloorPoints(
    effectiveDeploymentId,
    effectiveInputTokens,
    effectiveOutputTokens,
  );
  // 最终对外售价：新建以本次值；更新未携带成本字段时以数据库原值为准，避免局部更新误判
  const effectiveFinalPrice =
    costDecision.provided || !isUpdate
      ? costDecision.value
      : (current as any)?.estimatedModelTokens ?? 0;
  if (costFloorPoints != null && effectiveFinalPrice < costFloorPoints) {
    return NextResponse.json(
      {
        error: `低于平台成本底线，禁止保存：该组件选用当前模型的预估成本底线为 ${costFloorPoints} 算力点，最终对外售价不得低于此值。`,
        code: "BELOW_COST_FLOOR",
        costFloorPoints,
      },
      { status: 400 },
    );
  }

  // 计费改版：预估 Token 不得超出所选模型的技术上限（后端兜底，防绕过前端）。
  // 口径：modeldeployment.contextLimit 为该模型上下文上限，输入/输出预估值均不得超过。
  // 未选模型或模型未登记上限时不拦截，仅记录后台警告日志。
  if (effectiveDeploymentId) {
    const deployment = await prisma.modeldeployment.findUnique({
      where: { id: effectiveDeploymentId },
      select: { contextLimit: true },
    });
    if (!deployment || !(deployment.contextLimit > 0)) {
      console.warn(
        `[component-upsert] 模型 ${effectiveDeploymentId} 未登记上下文上限，跳过预估 Token 上限校验`,
      );
    } else {
      const limit = deployment.contextLimit;
      if (effectiveInputTokens > limit || effectiveOutputTokens > limit) {
        return NextResponse.json(
          {
            error: `保存失败：预估 Token 超出了所选模型的技术上限（最大 ${limit.toLocaleString("en-US")}），请调低预估值或更换模型。`,
            code: "TOKEN_LIMIT_EXCEEDED",
            contextLimit: limit,
          },
          { status: 400 },
        );
      }
    }
  }

  const data: any = {
    name,
    description,
    // 仅在携带有效分类时写入：上架 / 下架等局部更新不携带分类，
    // 若无条件写入会把数据库原分类覆盖为空（历史上多次上下架操作曾因此清空组件分类）
    ...(categoryKey ? { category: categoryKey } : {}),
    icon,
    tags: tagList.length > 0 ? tagList : undefined,
    inputMode: body.inputMode || "text",
    accept: body.accept ?? null,
    hint: body.hint ?? null,
    contract: body.contract ?? null,
    keywords: Array.isArray(body.keywords) ? body.keywords : undefined,
    isPremium: body.isPremium ?? false,
    previewData: body.previewData ?? { inputMock: "", outputMock: "", roiText: "" },
    sortOrder: body.sortOrder ?? 0,
    isPublished: isPublished !== undefined ? isPublished : true,
    // 仅在显式提供成本时写入，避免更新非成本字段时把原成本覆盖为 0
    ...(costDecision.provided ? { estimatedModelTokens: costDecision.value } : {}),
    // 计费改版：成本底线 / 选型模型 / 预估 Token / 复杂度（显式传入才写，未传保持原值）
    ...(body.costModelDeploymentId !== undefined ? { costModelDeploymentId } : {}),
    ...(body.estimatedInputTokens !== undefined ? { estimatedInputTokens } : {}),
    ...(body.estimatedOutputTokens !== undefined ? { estimatedOutputTokens } : {}),
    ...(body.pricingComplexity !== undefined
      ? { pricingComplexity: pricingComplexityNormalized }
      : {}),
    // 成本底线快照仅在本次请求涉及选型模型或预估 Token 时重算写入，避免局部更新误覆盖
    ...(body.costModelDeploymentId !== undefined ||
    body.estimatedInputTokens !== undefined ||
    body.estimatedOutputTokens !== undefined
      ? { costFloorPoints }
      : {}),
  };

  let component;
  if (isUpdate) {
    const { searchParams } = new URL(request.url);
    const componentId = searchParams.get("id");
    if (!componentId) {
      return NextResponse.json({ error: "缺少组件 ID" }, { status: 400 });
    }
    // current 已在上方提前读取并校验存在，此处直接复用

    // 强安全门禁：若试图将已上架组件下架，必须检测是否正被空间使用
    if (isPublished === false && current.isPublished === true && !body.force) {
      const usageCount = await prisma.componentusage.count({
        where: { componentId, workspaceId: { not: null } },
      });
      if (usageCount > 0) {
        return NextResponse.json(
          {
            error: `组件【${current.name}】当前正被工作空间装配使用中！禁止直接静默下架。请通过管理中枢确认强制下架并向受影响空间派发站内信通知。`,
            needConfirmForce: true,
          },
          { status: 400 }
        );
      }
    }

    const currentConfig = (current.previewData as any) || {};
    // 深度详情 Json：仅当本次显式传入 detail 时，与数据库原值浅合并后写入，
    // 避免局部更新把 usage/apiDoc 等其它子字段清空
    const nextDetail =
      body.detail !== undefined
        ? { ...((current.detail as any) || {}), ...(body.detail as any) }
        : undefined;
    component = await prisma.componentcatalog.update({
      where: { id: componentId },
      data: {
        ...data,
        ...(nextDetail !== undefined ? { detail: nextDetail } : {}),
        previewData: data.previewData
          ? { ...currentConfig, ...(data.previewData as any) }
          : current.previewData,
      },
    });
    await writeAuditLog(
      userId,
      // 更新动作的审计 action：取本次权限数组的主要动作（上下架时为首个权限 component:publish）
      requiredPermissions[0],
      { id: componentId, name: component.name, updates: body },
      null,
      null,
      request,
    );
  } else {
    const componentId = `C-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    component = await prisma.componentcatalog.create({
      data: {
        id: componentId,
        name,
        description: description || "",
        category: categoryKey,
        icon: icon || "package",
        detail: body.detail ?? null,
        tags: tagList,
        isPremium: body.isPremium ?? false,
        estimatedModelTokens: costDecision.value,
        previewData: data.previewData,
        inputMode: body.inputMode || "text",
        accept: body.accept ?? null,
        hint: body.hint ?? null,
        contract: body.contract ?? null,
        keywords: Array.isArray(body.keywords) ? body.keywords : undefined,
        sortOrder: body.sortOrder ?? 0,
        isPublished: isPublished ?? true,
        usageCount: 0,
        // 计费改版：成本底线 / 选型模型 / 预估 Token / 复杂度
        costModelDeploymentId: costModelDeploymentId ?? null,
        estimatedInputTokens: estimatedInputTokens || 4000,
        estimatedOutputTokens: estimatedOutputTokens || 2000,
        pricingComplexity: pricingComplexityNormalized,
        costFloorPoints: costFloorPoints ?? null,
      },
    });
    await writeAuditLog(
      userId,
      // 创建动作的审计 action：明确使用 component:create
      "component:create",
      { id: component.id, name: component.name },
      null,
      null,
      request,
    );
  }

  const categoryInfo = await prisma.componentcategory.findUnique({
    where: { key: component.category },
  });
  return NextResponse.json({
    success: true,
    data: toCatalogView(component, categoryInfo?.name),
    message: isUpdate ? "更新组件成功" : "创建组件成功",
  });
}

export async function POST(request: NextRequest) {
  try {
    return await handleUpsert(request, false);
  } catch (error) {
    console.error("Create component error:", error);
    return NextResponse.json(
      { error: "创建组件失败", details: error instanceof Error ? error.message : error },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    return await handleUpsert(request, true);
  } catch (error) {
    console.error("Update component error:", error);
    return NextResponse.json(
      { error: "更新组件失败", details: error instanceof Error ? error.message : error },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    return await handleUpsert(request, true);
  } catch (error) {
    console.error("Update component error:", error);
    return NextResponse.json(
      { error: "更新组件失败", details: error instanceof Error ? error.message : error },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "component:delete");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }
    const userId = authResult.user!.id;

    const { searchParams } = new URL(request.url);
    const componentId = searchParams.get("id");
    if (!componentId) {
      return NextResponse.json({ error: "缺少组件 ID" }, { status: 400 });
    }

    const current = await prisma.componentcatalog.findUnique({
      where: { id: componentId },
      select: { id: true, name: true, isPublished: true },
    });
    if (!current) {
      return NextResponse.json({ error: "组件不存在" }, { status: 404 });
    }

    // 强安全门禁：已上架组件不可直接删除，必须下架后方可删除
    if (current.isPublished) {
      return NextResponse.json(
        {
          error: `组件【${current.name}】当前处于已上架状态，受系统保护不可直接删除！请先将其下架后再执行删除。`,
        },
        { status: 400 }
      );
    }

    await prisma.componentcatalog.delete({
      where: { id: componentId },
    });
    await writeAuditLog(
      userId,
      "component:delete",
      { id: componentId, name: current.name },
      null,
      null,
      request,
    );

    return NextResponse.json({
      success: true,
      message: "删除组件成功",
    });
  } catch (error) {
    console.error("Delete component error:", error);
    return NextResponse.json(
      { error: "删除组件失败", details: error instanceof Error ? error.message : error },
      { status: 500 },
    );
  }
}
