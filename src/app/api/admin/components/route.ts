import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const stage = searchParams.get("stage") || "";
    const published = searchParams.get("published") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";

    const skip = (page - 1) * limit;
    const where: any = {};

    // 模糊搜索组件名称
    if (search) {
      where.name = {
        contains: search,
      };
    }

    // 按阶段筛选
    if (stage) {
      where.type = stage;
    }

    // 按上架状态筛选
    if (published) {
      where.isPublished = published === "true";
    }

    // 按日期范围筛选（创建时间）
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        // 包含结束日期的整天
        const endDateObj = new Date(endDate);
        endDateObj.setDate(endDateObj.getDate() + 1);
        where.createdAt.lt = endDateObj;
      }
    }

    const [components, total] = await Promise.all([
      prisma.componenttask.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
              role: true,
            },
          },
        },
      }),
      prisma.componenttask.count({ where }),
    ]);

    // 获取所有阶段
    const stages = await prisma.componenttask.findMany({
      select: {
        type: true,
      },
      distinct: ["type"],
    });

    return NextResponse.json({
      success: true,
      data: {
        components,
        total,
        page,
        totalPages: Math.ceil(total / limit),
        stages: stages.map((t) => t.type),
      },
    });
  } catch (error) {
    console.error("Get components error:", error);
    return NextResponse.json(
      {
        error: "获取组件列表失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const body = await request.json();
    const {
      id,
      status,
      type,
      description,
      icon,
      category,
      tags,
      sortOrder,
      isPublished,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "缺少组件 ID" }, { status: 400 });
    }

    // 如果是下架操作，检查组件是否正在使用
    if (isPublished === false) {
      const component = await prisma.componenttask.findUnique({
        where: { id },
      });

      if (component && component.usageCount && component.usageCount > 0) {
        return NextResponse.json(
          {
            error: `该组件已被使用 ${component.usageCount} 次，存在关联数据，无法下架。请先处理相关数据后再试。`,
          },
          { status: 400 },
        );
      }
    }

    const updateData: any = {};
    if (status) updateData.status = status;
    if (type) updateData.type = type;
    if (description !== undefined) updateData.description = description;
    if (icon !== undefined) updateData.icon = icon;
    if (category !== undefined) updateData.category = category;
    if (tags !== undefined) updateData.tags = tags;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    if (isPublished !== undefined) updateData.isPublished = isPublished;

    const updated = await prisma.componenttask.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "组件信息已更新",
    });
  } catch (error) {
    console.error("Update component error:", error);
    return NextResponse.json(
      {
        error: "更新组件失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      description,
      type,
      icon,
      category,
      tags,
      config,
      isPublished = false,
      sortOrder = 0,
    } = body;

    if (!name || !type) {
      return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
    }

    const component = await prisma.componenttask.create({
      data: {
        name,
        description: description || null,
        type,
        icon: icon || null,
        category: category || null,
        tags: tags || null,
        config: config || null,
        isPublished,
        sortOrder,
        status: "published",
      },
    });

    return NextResponse.json({
      success: true,
      data: component,
      message: "组件创建成功",
    });
  } catch (error) {
    console.error("Create component error:", error);
    return NextResponse.json(
      {
        error: "创建组件失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (
      !authHeader ||
      authHeader === "Bearer null" ||
      authHeader === "Bearer "
    ) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少组件 ID" }, { status: 400 });
    }

    // 检查组件是否存在
    const component = await prisma.componenttask.findUnique({
      where: { id },
    });

    if (!component) {
      return NextResponse.json({ error: "组件不存在" }, { status: 404 });
    }

    // 检查组件是否已上架
    if (component.isPublished) {
      return NextResponse.json(
        { error: "已上架的组件不支持删除，请先下架后再删除" },
        { status: 400 },
      );
    }

    // 检查组件是否正在使用
    if (component.usageCount && component.usageCount > 0) {
      return NextResponse.json(
        {
          error: `该组件已被使用 ${component.usageCount} 次，存在关联数据，无法删除。请先处理相关数据后再试。`,
        },
        { status: 400 },
      );
    }

    await prisma.componenttask.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "组件已删除",
    });
  } catch (error) {
    console.error("Delete component error:", error);
    return NextResponse.json(
      {
        error: "删除组件失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
