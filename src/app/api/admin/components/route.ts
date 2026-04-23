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

    const { id, status, type, description } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "缺少组件 ID" }, { status: 400 });
    }

    const updateData: any = {};
    if (status) updateData.status = status;
    if (type) updateData.type = type;
    if (description !== undefined) updateData.description = description;

    await prisma.componenttask.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
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
