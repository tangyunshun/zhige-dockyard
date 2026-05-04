import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

/**
 * GET /api/admin/documents
 * 获取系统文档列表
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
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const published = searchParams.get("published") || "";

    const skip = (page - 1) * limit;
    const where: any = {};

    // 模糊搜索文档标题
    if (search) {
      where.title = {
        contains: search,
      };
    }

    // 按分类筛选
    if (category) {
      where.category = category;
    }

    // 按发布状态筛选
    if (published) {
      where.isPublished = published === "true";
    }

    const [documents, total] = await Promise.all([
      prisma.systemdocument.findMany({
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
            },
          },
        },
      }),
      prisma.systemdocument.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        documents,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get documents error:", error);
    console.error("Error details:", JSON.stringify(error, null, 2));
    return NextResponse.json(
      {
        error: "获取文档列表失败",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/documents
 * 创建新文档
 */
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
      title,
      content,
      category,
      tags,
      isPublished,
      sortOrder,
    } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: "文档标题不能为空" }, { status: 400 });
    }

    if (!category) {
      return NextResponse.json({ error: "文档分类不能为空" }, { status: 400 });
    }

    const document = await prisma.systemdocument.create({
      data: {
        title,
        content: content || "",
        category,
        tags: tags || "",
        isPublished: isPublished || false,
        sortOrder: sortOrder || 0,
        authorId: userId,
      },
    });

    return NextResponse.json({
      success: true,
      data: document,
      message: "文档创建成功",
    });
  } catch (error) {
    console.error("Create document error:", error);
    return NextResponse.json(
      {
        error: "创建文档失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/admin/documents
 * 更新文档
 */
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

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "缺少文档 ID" }, { status: 400 });
    }

    const body = await request.json();
    const {
      title,
      content,
      category,
      tags,
      isPublished,
      sortOrder,
    } = body;

    // 检查文档是否存在
    const document = await prisma.systemdocument.findUnique({
      where: { id },
    });

    if (!document) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (category !== undefined) updateData.category = category;
    if (tags !== undefined) updateData.tags = tags;
    if (isPublished !== undefined) updateData.isPublished = isPublished;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

    const updated = await prisma.systemdocument.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: "文档更新成功",
    });
  } catch (error) {
    console.error("Update document error:", error);
    return NextResponse.json(
      {
        error: "更新文档失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/documents
 * 删除文档
 */
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
      return NextResponse.json({ error: "缺少文档 ID" }, { status: 400 });
    }

    // 检查文档是否存在
    const document = await prisma.systemdocument.findUnique({
      where: { id },
    });

    if (!document) {
      return NextResponse.json({ error: "文档不存在" }, { status: 404 });
    }

    await prisma.systemdocument.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: "文档删除成功",
    });
  } catch (error) {
    console.error("Delete document error:", error);
    return NextResponse.json(
      {
        error: "删除文档失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
