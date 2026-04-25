import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * GET /api/components
 * 获取所有已上架的组件列表（公开接口）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const category = searchParams.get("category");
    const limit = parseInt(searchParams.get("limit") || "100");

    const where: any = {
      isPublished: true,  // 只获取已上架的组件
    };

    if (type) {
      where.type = type;
    }

    if (category) {
      where.category = category;
    }

    const components = await prisma.componenttask.findMany({
      where,
      orderBy: [
        { sortOrder: "desc" },  // 按排序权重降序
        { createdAt: "desc" },   // 按创建时间降序
      ],
      take: limit,
      select: {
        id: true,
        name: true,
        description: true,
        type: true,
        icon: true,
        category: true,
        tags: true,
        config: true,
        usageCount: true,
        createdAt: true,
      },
    });

    // 获取所有类型（阶段）
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

    // 获取所有分类
    const categories = await prisma.componenttask.findMany({
      where: {
        isPublished: true,
      },
      select: {
        category: true,
      },
      distinct: ["category"],
    });

    return NextResponse.json({
      success: true,
      data: {
        components,
        types: types.map((t) => t.type),
        categories: categories.map((c) => c.category).filter(Boolean),
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
