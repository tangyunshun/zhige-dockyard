import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

/**
 * GET /api/admin/stages
 * 获取所有阶段信息
 */
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
    const status = searchParams.get("status") || ""; // "active" | "inactive"
    const componentCount = searchParams.get("componentCount") || ""; // "0" | "gt0"
    const createDateStart = searchParams.get("createDateStart") || "";
    const createDateEnd = searchParams.get("createDateEnd") || "";

    const skip = (page - 1) * limit;
    
    // 获取所有阶段配置
    const allRecords = await prisma.componenttask.findMany({
      orderBy: { sortOrder: "asc" },
    });

    // 过滤出阶段记录
    let stageRecords = allRecords.filter(
      (record) => record.config?.isStageConfig === true,
    );

    // 搜索过滤
    if (search) {
      stageRecords = stageRecords.filter((record) =>
        record.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    // 状态过滤
    if (status) {
      const isActive = status === "active";
      stageRecords = stageRecords.filter((record) => record.isPublished === isActive);
    }

    // 创建日期过滤
    if (createDateStart || createDateEnd) {
      stageRecords = stageRecords.filter((record) => {
        const recordDate = new Date(record.createdAt);
        if (createDateStart && recordDate < new Date(createDateStart)) {
          return false;
        }
        if (createDateEnd) {
          const endDate = new Date(createDateEnd);
          endDate.setHours(23, 59, 59, 999);
          if (recordDate > endDate) {
            return false;
          }
        }
        return true;
      });
    }

    // 统计每个阶段的组件数量
    const nonStageRecords = allRecords.filter(
      (record) => record.config?.isStageConfig !== true,
    );
    
    const typeCountMap = new Map<string, number>();
    nonStageRecords.forEach((record) => {
      const currentCount = typeCountMap.get(record.type) || 0;
      typeCountMap.set(record.type, currentCount + 1);
    });

    // 构建阶段列表
    let filteredStages = stageRecords.map((record) => ({
      id: record.id,
      name: record.name,
      description: record.description || "",
      sortOrder: record.sortOrder,
      isActive: record.isPublished,
      componentCount: typeCountMap.get(record.type) || 0,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));

    // 组件数量过滤
    if (componentCount) {
      if (componentCount === "0") {
        filteredStages = filteredStages.filter((s) => s.componentCount === 0);
      } else if (componentCount === "gt0") {
        filteredStages = filteredStages.filter((s) => s.componentCount > 0);
      }
    }

    // 分页
    const total = filteredStages.length;
    const stages = filteredStages.slice(skip, skip + limit);

    return NextResponse.json({
      success: true,
      data: {
        stages,
        total,
        page,
        limit,
      },
    });
  } catch (error) {
    console.error("Get stages error:", error);
    return NextResponse.json(
      { error: "获取阶段列表失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

// POST - 创建阶段
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
    const { name, description, sortOrder, isPublished } = body;

    if (!name) {
      return NextResponse.json({ error: "缺少阶段名称" }, { status: 400 });
    }

    // 创建阶段配置
    const stage = await prisma.componenttask.create({
      data: {
        name,
        description,
        type: name, // 阶段类型与名称相同
        config: {
          isStageConfig: true,
        },
        sortOrder: sortOrder || 0,
        isPublished: isPublished ?? true,
        userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: stage,
      message: "创建阶段成功",
    });
  } catch (error) {
    console.error("Create stage error:", error);
    return NextResponse.json(
      { error: "创建阶段失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

// PUT - 更新阶段
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
    const stageId = searchParams.get("id");

    if (!stageId) {
      return NextResponse.json({ error: "缺少阶段 ID" }, { status: 400 });
    }

    const body = await request.json();
    const { name, description, sortOrder, isPublished } = body;

    const stage = await prisma.componenttask.update({
      where: { id: stageId },
      data: {
        name: name || undefined,
        description: description !== undefined ? description : undefined,
        type: name || undefined, // 如果名称改变，类型也改变
        sortOrder: sortOrder !== undefined ? sortOrder : undefined,
        isPublished: isPublished !== undefined ? isPublished : undefined,
      },
    });

    return NextResponse.json({
      success: true,
      data: stage,
      message: "更新阶段成功",
    });
  } catch (error) {
    console.error("Update stage error:", error);
    return NextResponse.json(
      { error: "更新阶段失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

// DELETE - 删除阶段
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
    const stageId = searchParams.get("id");

    if (!stageId) {
      return NextResponse.json({ error: "缺少阶段 ID" }, { status: 400 });
    }

    await prisma.componenttask.delete({
      where: { id: stageId },
    });

    return NextResponse.json({
      success: true,
      message: "删除阶段成功",
    });
  } catch (error) {
    console.error("Delete stage error:", error);
    return NextResponse.json(
      { error: "删除阶段失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
