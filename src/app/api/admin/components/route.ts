import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";

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
    estimatedTokens: c.estimatedTokens,
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
  const requiredPermission = isUpdate
    ? isPublished !== undefined
      ? "component:publish"
      : "component:update"
    : "component:create";

  const authResult = await requirePlatformPermission(request, requiredPermission);
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
    estimatedTokens: body.estimatedTokens ?? 0,
    previewData: body.previewData ?? { inputMock: "", outputMock: "", roiText: "" },
    sortOrder: body.sortOrder ?? 0,
    isPublished: isPublished !== undefined ? isPublished : true,
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
      requiredPermission,
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
        estimatedTokens: body.estimatedTokens ?? 0,
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
      requiredPermission,
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
      select: { id: true, name: true },
    });
    if (!current) {
      return NextResponse.json({ error: "组件不存在" }, { status: 404 });
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
