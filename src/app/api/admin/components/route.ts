import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";
import { resolveComponentCost } from "@/lib/component-cost";

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

  if (!isUpdate && (!name || !categoryKey)) {
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

  const data: any = {
    name,
    description,
    category: categoryKey,
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
  };

  let component;
  if (isUpdate) {
    const { searchParams } = new URL(request.url);
    const componentId = searchParams.get("id");
    if (!componentId) {
      return NextResponse.json({ error: "缺少组件 ID" }, { status: 400 });
    }
    const current = await prisma.componentcatalog.findUnique({
      where: { id: componentId },
    });
    if (!current) {
      return NextResponse.json({ error: "组件不存在" }, { status: 404 });
    }

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
    component = await prisma.componentcatalog.update({
      where: { id: componentId },
      data: {
        ...data,
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
