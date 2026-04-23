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
    const search = searchParams.get("search") || "";
    const type = searchParams.get("type") || "";

    const skip = (page - 1) * limit;

    const where: any = {};

    if (search) {
      where.name = { contains: search };
    }

    if (type) {
      where.type = type;
    }

    const [workspaces, total] = await Promise.all([
      prisma.Workspace.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          members: {
            include: {
              user: {
                select: { name: true, email: true },
              },
            },
          },
          _count: {
            select: { members: true },
          },
        },
      }),
      prisma.Workspace.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        workspaces,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get workspaces error:", error);
    return NextResponse.json(
      { error: "获取工作空间列表失败", details: error instanceof Error ? error.message : error },
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
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少工作空间 ID" }, { status: 400 });
    }

    // 检查工作空间是否存在
    const workspace = await prisma.Workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return NextResponse.json({ error: "工作空间不存在" }, { status: 404 });
    }

    // 删除工作空间 (级联删除相关数据)
    await prisma.Workspace.delete({
      where: { id: workspaceId },
    });

    return NextResponse.json({
      success: true,
      message: "工作空间已删除",
    });
  } catch (error) {
    console.error("Delete workspace error:", error);
    return NextResponse.json(
      { error: "删除工作空间失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
