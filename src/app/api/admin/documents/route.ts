import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search");
    const category = searchParams.get("category");
    const published = searchParams.get("published") || searchParams.get("isPublished");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: any = {};
    
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { content: { contains: search } },
      ];
    }
    
    if (category) {
      where.category = category;
    }
    
    if (published !== undefined && published !== null && published !== "") {
      where.isPublished = published === "true";
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(`${startDate}T00:00:00.000Z`);
      if (endDate) where.createdAt.lte = new Date(`${endDate}T23:59:59.999Z`);
    }

    // 聚合全局真实统计指标（不受分页截断影响）
    const [documents, total, totalAll, publishedCount, unPublishedCount, viewAggResult, categoryStats] = await Promise.all([
      prisma.systemdocument.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatar: true,
            },
          },
        },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      }),
      prisma.systemdocument.count({ where }),
      prisma.systemdocument.count(),
      prisma.systemdocument.count({ where: { isPublished: true } }),
      prisma.systemdocument.count({ where: { isPublished: false } }),
      prisma.systemdocument.aggregate({ _sum: { viewCount: true } }),
      prisma.systemdocument.groupBy({
        by: ["category"],
        _count: { id: true },
      }),
    ]);

    const categoryCountMap: Record<string, number> = {};
    categoryStats.forEach((cat) => {
      categoryCountMap[cat.category] = cat._count.id;
    });

    const summary = {
      totalDocs: totalAll,
      publishedDocs: publishedCount,
      unPublishedDocs: unPublishedCount,
      totalViews: viewAggResult._sum.viewCount || 0,
      categoryCounts: categoryCountMap,
    };

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      data: {
        documents,
        total,
        totalPages,
        page,
        summary,
      },
    });
  } catch (error) {
    console.error("Get documents error:", error);
    return NextResponse.json({ error: "获取文档列表失败" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const body = await request.json();
    const { title, content, category, tags, isPublished, sortOrder } = body;

    if (!title || !category) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const document = await prisma.systemdocument.create({
      data: {
        id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        title,
        content,
        category,
        tags,
        isPublished: isPublished || false,
        sortOrder: sortOrder || 0,
        authorId: userId,
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: document });
  } catch (error) {
    console.error("Create document error:", error);
    return NextResponse.json({ error: "创建文档失败" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("id");

    if (!documentId) {
      return NextResponse.json({ error: "缺少文档 ID" }, { status: 400 });
    }

    const body = await request.json();
    const { title, content, category, tags, isPublished, sortOrder } = body;

    const document = await prisma.systemdocument.update({
      where: { id: documentId },
      data: {
        ...(title !== undefined && { title }),
        ...(content !== undefined && { content }),
        ...(category !== undefined && { category }),
        ...(tags !== undefined && { tags }),
        ...(isPublished !== undefined && { isPublished }),
        ...(sortOrder !== undefined && { sortOrder }),
        updatedAt: new Date(),
      },
      include: {
        user: true,
      },
    });

    return NextResponse.json({ success: true, data: document });
  } catch (error) {
    console.error("Update document error:", error);
    return NextResponse.json({ error: "更新文档失败" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get("id");

    if (!documentId) {
      return NextResponse.json({ error: "缺少文档 ID" }, { status: 400 });
    }

    const targetDoc = await prisma.systemdocument.findUnique({
      where: { id: documentId },
      select: { id: true, isPublished: true, title: true },
    });

    if (!targetDoc) {
      return NextResponse.json({ error: "文档不存在或已被删除" }, { status: 404 });
    }

    if (targetDoc.isPublished) {
      return NextResponse.json(
        { error: `文档《${targetDoc.title}》当前处于已发布上线状态，禁止直接删除。请先执行下架为草稿后再进行删除。` },
        { status: 400 }
      );
    }

    await prisma.systemdocument.delete({ where: { id: documentId } });

    return NextResponse.json({ success: true, message: "文档已删除" });
  } catch (error) {
    console.error("Delete document error:", error);
    return NextResponse.json({ error: "删除文档失败" }, { status: 500 });
  }
}
