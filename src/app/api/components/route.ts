import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/components
 * 获取组件列表
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const category = searchParams.get("category");
    const limit = parseInt(searchParams.get("limit") || "100");

    const where: any = {
      isPublished: true,  // 只获取已发布的组件
    };

    if (type) {
      where.type = type;
    }

    const components = await prisma.componenttask.findMany({
      where,
      orderBy: [
        { sortOrder: "desc" },  // 按排序权重降序
        { createdAt: "desc" },   // 按创建时间降序
      ],
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        icon: true,
        tags: true,
        config: true,
        usageCount: true,
        createdAt: true,
      },
    });

    // 映射并注入分类信息
    let mappedComponents = components.map((c) => ({
      ...c,
      category: (c.config as any)?.category || "",
    }));

    // 如果指定了分类，在内存中进行过滤
    if (category) {
      mappedComponents = mappedComponents.filter((c) => c.category === category);
    }

    // 截取 limit 数量
    const limitedComponents = mappedComponents.slice(0, limit);

    // 获取所有组件类型
    const types = await prisma.componenttask.findMany({
      where: {
        isPublished: true,
      },
      select: {
        type: true,
      },
      distinct: ["type"],
      orderBy: {
        createdAt: "asc",
      },
    });

    // 获取所有已发布的组件配置，用于汇总所有分类列表
    const allPublished = await prisma.componenttask.findMany({
      where: {
        isPublished: true,
      },
      select: {
        config: true,
      },
    });

    const categories = Array.from(
      new Set(
        allPublished
          .map((c) => (c.config as any)?.category as string)
          .filter(Boolean)
      )
    );

    return NextResponse.json({
      success: true,
      data: {
        components: limitedComponents,
        types: types.map((t) => t.type),
        categories: categories,
      },
    });
  } catch (error) {
    console.error("Get components error:", error);
    return NextResponse.json(
      { error: "获取组件列表失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
