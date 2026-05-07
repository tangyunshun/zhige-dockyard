import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const search = searchParams.get("search") || "";
    const stage = searchParams.get("stage") || "";
    const published = searchParams.get("published") || "";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";

    // 获取所有组件任务
    const allComponents = await prisma.componenttask.findMany({
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
    });

    // 过滤掉阶段配置组件
    let filteredComponents = allComponents.filter(
      (component) => component.config?.isStageConfig !== true,
    );

    // 应用筛选条件
    if (search) {
      filteredComponents = filteredComponents.filter((c) =>
        c.name?.includes(search),
      );
    }

    if (stage) {
      filteredComponents = filteredComponents.filter((c) => c.type === stage);
    }

    if (published) {
      filteredComponents = filteredComponents.filter(
        (c) => c.isPublished === (published === "true"),
      );
    }

    if (startDate) {
      const startDateObj = new Date(startDate);
      filteredComponents = filteredComponents.filter(
        (c) => new Date(c.createdAt) >= startDateObj,
      );
    }

    if (endDate) {
      const endDateObj = new Date(endDate);
      endDateObj.setDate(endDateObj.getDate() + 1);
      filteredComponents = filteredComponents.filter(
        (c) => new Date(c.createdAt) < endDateObj,
      );
    }

    // 分页
    const total = filteredComponents.length;
    const skip = (page - 1) * limit;
    const components = filteredComponents.slice(skip, skip + limit);

    // 获取所有阶段类型
    const stages = Array.from(
      new Set(filteredComponents.map((c) => c.type)),
    ).filter(Boolean);

    return NextResponse.json({
      success: true,
      data: {
        components,
        total,
        page,
        limit,
        stages,
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

// POST - 创建组件
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
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, type, icon, category, tags, config, isPublished } = body;

    if (!name || !type) {
      return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
    }

    const component = await prisma.componenttask.create({
      data: {
        name,
        description,
        type,
        icon,
        category,
        tags,
        config,
        isPublished: isPublished ?? false,
        userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: component,
      message: "创建组件成功",
    });
  } catch (error) {
    console.error("Create component error:", error);
    return NextResponse.json(
      { error: "创建组件失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

// PUT - 更新组件
export async function PUT(request: NextRequest) {
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
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const componentId = searchParams.get("id");

    if (!componentId) {
      return NextResponse.json({ error: "缺少组件 ID" }, { status: 400 });
    }

    const body = await request.json();
    const { name, description, type, icon, category, tags, config, isPublished } = body;

    const component = await prisma.componenttask.update({
      where: { id: componentId },
      data: {
        name: name || undefined,
        description: description !== undefined ? description : undefined,
        type: type || undefined,
        icon: icon !== undefined ? icon : undefined,
        category: category !== undefined ? category : undefined,
        tags: tags !== undefined ? tags : undefined,
        config: config !== undefined ? config : undefined,
        isPublished: isPublished !== undefined ? isPublished : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      data: component,
      message: "更新组件成功",
    });
  } catch (error) {
    console.error("Update component error:", error);
    return NextResponse.json(
      { error: "更新组件失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

// DELETE - 删除组件
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
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const componentId = searchParams.get("id");

    if (!componentId) {
      return NextResponse.json({ error: "缺少组件 ID" }, { status: 400 });
    }

    await prisma.componenttask.delete({
      where: { id: componentId },
    });

    return NextResponse.json({
      success: true,
      message: "删除组件成功",
    });
  } catch (error) {
    console.error("Delete component error:", error);
    return NextResponse.json(
      { error: "删除组件失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
