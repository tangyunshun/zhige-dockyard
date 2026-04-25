import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const status = searchParams.get("status") || "";
    const type = searchParams.get("type") || "";

    const skip = (page - 1) * limit;
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
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

    // 获取所有类型（阶段）
    const types = await prisma.componenttask.findMany({
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
        types: types.map((t) => t.type),
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

export async function PATCH(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
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
      { error: "更新组件失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
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
      { error: "创建组件失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少组件 ID" }, { status: 400 });
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
      { error: "删除组件失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
