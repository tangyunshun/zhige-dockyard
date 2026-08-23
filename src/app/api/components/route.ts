import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/components
 * 公开组件列表：一律从 component_catalog / component_category 表读取，禁止硬编码。
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const type = searchParams.get("type");
    const search = searchParams.get("search") || "";
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") || "100")));

    const where: any = { isPublished: true };
    const categoryKey = category || type;
    if (categoryKey) {
      where.category = categoryKey;
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [components, categories] = await Promise.all([
      prisma.componentcatalog.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        take: limit,
      }),
      prisma.componentcategory.findMany({
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    const categoryNameMap = new Map(categories.map((c) => [c.key, c.name]));
    const mappedComponents = components.map((c) => ({
      ...c,
      type: c.category,
      category: categoryNameMap.get(c.category) || c.category,
    }));

    return NextResponse.json({
      success: true,
      data: {
        components: mappedComponents,
        types: categories.map((c) => c.key),
        categories: categories.map((c) => ({
          key: c.key,
          name: c.name,
          color: c.color,
          range: c.range,
          sortOrder: c.sortOrder,
        })),
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
