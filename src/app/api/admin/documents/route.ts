import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole, validateUser } from "@/lib/auth";
import { requirePlatformPermission, writeAuditLog } from "@/lib/security";

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

    // 细粒度权限：文档查看（document:read）；写操作由已启用接口规则 document:create/update/delete 强制覆盖
    const permCheck = await requirePlatformPermission(request, "document:read");
    if (!permCheck.authorized) {
      return permCheck.errorResponse || NextResponse.json({ error: "无权限查看文档" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    // KN-CAT-V3：知识分类总览分支——统一数据列表（服务端分页 + 关键字/类型筛选）
    // 行结构：{ name, type: "system"|"personal", creatorName, createdAt, count }；系统内置分类无创建人/创建时间
    if (searchParams.get("view") === "categories") {
      let systemCats: string[] = ["规约与SOP", "经验总结", "问题记录", "使用心得"];
      try {
        const cfg = await prisma.systemconfig.findUnique({ where: { key: "knowledge_categories" } });
        if (cfg?.value) {
          const parsed = JSON.parse(cfg.value);
          if (Array.isArray(parsed) && parsed.length > 0) systemCats = parsed.map(String);
        }
      } catch (e) {}

      const personalRows = await prisma.knowledgecategory.findMany({ orderBy: { createdAt: "desc" } });
      const creatorIds = Array.from(new Set(personalRows.map((r) => r.creatorId)));
      const creators = creatorIds.length
        ? await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, name: true, email: true } })
        : [];
      const creatorMap = new Map(creators.map((u) => [u.id, u.name || u.email || "未知用户"]));

      const usageCounts = await prisma.document.groupBy({
        by: ["category"],
        where: { type: "knowledge", status: { not: "deleted" }, category: { not: null } },
        _count: { _all: true },
      });
      const usageMap = new Map(usageCounts.map((g) => [g.category as string, g._count._all]));

      // 合并为统一行集：系统内置在前（按配置顺序），用户自建按创建时间倒序
      const allRows: Array<{ name: string; type: "system" | "personal"; creatorName: string | null; createdAt: string | null; count: number }> = [
        ...systemCats.map((name) => ({ name, type: "system" as const, creatorName: null, createdAt: null, count: usageMap.get(name) || 0 })),
        ...personalRows.map((r) => ({
          name: r.name,
          type: "personal" as const,
          creatorName: creatorMap.get(r.creatorId) || "未知用户",
          createdAt: r.createdAt.toISOString(),
          count: usageMap.get(r.name) || 0,
        })),
      ];

      // 筛选：类型 + 关键字（分类名/创建人模糊匹配）
      const typeFilter = searchParams.get("type") || "ALL";
      const search = (searchParams.get("search") || "").trim().toLowerCase();
      const filtered = allRows.filter((r) => {
        if (typeFilter !== "ALL" && r.type !== typeFilter) return false;
        if (search && !(r.name.toLowerCase().includes(search) || (r.creatorName || "").toLowerCase().includes(search))) return false;
        return true;
      });

      const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "10") || 10));
      const total = filtered.length;
      const totalPages = Math.ceil(total / pageSize) || 1;
      const safePage = Math.min(page, totalPages);
      const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

      return NextResponse.json({
        success: true,
        rows: paged,
        total,
        page: safePage,
        pageSize,
        totalPages,
        stats: {
          systemCount: allRows.filter((r) => r.type === "system").length,
          personalCount: allRows.filter((r) => r.type === "personal").length,
          totalEntries: allRows.reduce((sum, r) => sum + r.count, 0),
        },
      });
    }

    // 历史版本查询分支：/api/admin/documents?mode=history&documentId=xxx
    if (searchParams.get("mode") === "history") {
      const documentId = searchParams.get("documentId");
      if (!documentId) {
        return NextResponse.json({ error: "缺少文档 ID" }, { status: 400 });
      }
      const [history, mainDoc] = await Promise.all([
        prisma.systemdocumenthistory.findMany({
          where: { documentId },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.systemdocument.findUnique({
          where: { id: documentId },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        }),
      ]);

      if (!mainDoc) {
        return NextResponse.json({ error: "未找到目标文档" }, { status: 404 });
      }

      // 若历史快照表尚无记录（刚新建尚未经历二次编辑），自动以主文档数据构建 V1.0 初始创建快照
      const enrichedHistory = [...history];
      if (enrichedHistory.length === 0) {
        enrichedHistory.push({
          id: `init-${mainDoc.id}`,
          documentId: mainDoc.id,
          title: mainDoc.title,
          content: mainDoc.content,
          category: mainDoc.category,
          tags: mainDoc.tags,
          isPublished: mainDoc.isPublished,
          sortOrder: mainDoc.sortOrder,
          editorId: mainDoc.authorId,
          createdAt: mainDoc.createdAt,
          user: mainDoc.user,
        } as any);
      }

      return NextResponse.json({ success: true, data: enrichedHistory });
    }

    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search");
    const category = searchParams.get("category");
    const published = searchParams.get("published") || searchParams.get("isPublished");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // 注意：历史上误迁移的两条组件业务数据已通过一次性脚本安全删除，
    // 此处不再每次 GET 执行写操作（删除逻辑见 scripts/cleanup-migrated-docs.ts）。
    const where: any = {};
    
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { content: { contains: search } },
        { summary: { contains: search } },
        { codeSample: { contains: search } },
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
    const [documents, total, totalAll, publishedCount, unPublishedCount, viewAggResult, categoryStats, feedbackGroups] = await Promise.all([
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
      // 用户反馈两态票数（真实落库的 systemdocumentfeedback）
      prisma.systemdocumentfeedback.groupBy({
        by: ["documentId", "vote"],
        _count: { _all: true },
      }),
    ]);

    const categoryCountMap: Record<string, number> = {};
    categoryStats.forEach((cat) => {
      categoryCountMap[cat.category] = cat._count.id;
    });

    // 反馈票数映射：documentId → { helpful, notHelpful }
    const feedbackMap: Record<string, { helpful: number; notHelpful: number }> = {};
    feedbackGroups.forEach((g) => {
      const entry = feedbackMap[g.documentId] || { helpful: 0, notHelpful: 0 };
      if (g.vote === "HELPFUL") entry.helpful += g._count._all;
      if (g.vote === "NOT_HELPFUL") entry.notHelpful += g._count._all;
      feedbackMap[g.documentId] = entry;
    });
    const documentsWithFeedback = documents.map((d) => ({
      ...d,
      helpfulVotes: feedbackMap[d.id]?.helpful ?? 0,
      notHelpfulVotes: feedbackMap[d.id]?.notHelpful ?? 0,
    }));

    // 从数据库异步拉取全部自定义分类，随 summary 静默下发，实现全功能联动
    let customCategories: any[] = [];
    try {
      const cfg = await prisma.systemconfig.findUnique({
        where: { key: "document_custom_categories" },
      });
      if (cfg?.value) {
        customCategories = JSON.parse(cfg.value) || [];
      }
    } catch (e) {
      console.warn("读取自定义分类静默容错:", e);
    }

    const summary = {
      totalDocs: totalAll,
      publishedDocs: publishedCount,
      unPublishedDocs: unPublishedCount,
      totalViews: viewAggResult._sum.viewCount || 0,
      categoryCounts: categoryCountMap,
      customCategories,
    };

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      success: true,
      data: {
        documents: documentsWithFeedback,
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
    const {
      title,
      content,
      category,
      tags,
      isPublished,
      sortOrder,
      summary,
      codeSample,
      relatedLink,
      visibility,
    } = body;

    if (!title || !category) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const trimmedTitle = title.trim();
    const duplicate = await prisma.systemdocument.findFirst({
      where: {
        title: trimmedTitle,
        category,
      },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "该分类下已存在同名文档，请直接编辑现有文档" },
        { status: 409 }
      );
    }

    const document = await prisma.systemdocument.create({
      data: {
        id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        title: trimmedTitle,
        content,
        category,
        tags: tags ? tags.trim() : tags,
        summary: summary !== undefined ? String(summary).trim() : null,
        codeSample: codeSample !== undefined ? String(codeSample).trim() : null,
        relatedLink: relatedLink !== undefined ? String(relatedLink).trim() : null,
        visibility: visibility || "PUBLIC",
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

    // 写入第一条初始创建快照，确保历史版本追踪链路从首版即形成闭环
    await prisma.systemdocumenthistory.create({
      data: {
        documentId: document.id,
        title: document.title,
        content: document.content,
        category: document.category,
        tags: document.tags,
        summary: document.summary,
        codeSample: document.codeSample,
        relatedLink: document.relatedLink,
        helpfulCount: document.helpfulCount,
        isPublished: document.isPublished,
        sortOrder: document.sortOrder,
        editorId: userId,
      },
    }).catch((err) => {
      console.warn("[文档历史快照] 记录初始创建版本非阻断提示:", err);
    });

    await writeAuditLog(userId, "document:create", { id: document.id, title: document.title, category: document.category, visibility: document.visibility }, null, null, request);

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
    const {
      title,
      content,
      category,
      tags,
      isPublished,
      sortOrder,
      summary,
      codeSample,
      relatedLink,
      visibility,
    } = body;

    const current = await prisma.systemdocument.findUnique({
      where: { id: documentId },
    });
    if (!current) {
      return NextResponse.json({ error: "文档不存在或已被删除" }, { status: 404 });
    }

    // 核心安全约束：已发布上线状态下禁止直接修改正文与标题内容，需先下架为草稿
    const isEditingContent =
      (title !== undefined && title.trim() !== current.title) ||
      (content !== undefined && content !== current.content) ||
      (category !== undefined && category !== current.category) ||
      (summary !== undefined && summary !== current.summary) ||
      (codeSample !== undefined && codeSample !== current.codeSample);

    if (current.isPublished && isEditingContent && isPublished !== false) {
      return NextResponse.json(
        {
          error: `文档《${current.title}》当前处于已发布上线状态，禁止直接修改正文。请先下架为草稿后再进行编辑修改与重新发布上线。`,
        },
        { status: 400 }
      );
    }

    const newTitle = title !== undefined ? title.trim() : current.title;
    const newCategory = category !== undefined ? category : current.category;
    if (newTitle !== current.title || newCategory !== current.category) {
      const duplicate = await prisma.systemdocument.findFirst({
        where: {
          title: newTitle,
          category: newCategory,
          NOT: { id: documentId },
        },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: "该分类下已存在同名文档，无法重复保存" },
          { status: 409 }
        );
      }
    }

    // 保存编辑前快照到历史版本表
    await prisma.systemdocumenthistory.create({
      data: {
        documentId: current.id,
        title: current.title,
        content: current.content,
        category: current.category,
        tags: current.tags,
        summary: current.summary,
        codeSample: current.codeSample,
        relatedLink: current.relatedLink,
        helpfulCount: current.helpfulCount,
        isPublished: current.isPublished,
        sortOrder: current.sortOrder,
        editorId: userId,
      },
    });

    const document = await prisma.systemdocument.update({
      where: { id: documentId },
      data: {
        ...(title !== undefined && { title: newTitle }),
        ...(content !== undefined && { content }),
        ...(category !== undefined && { category }),
        ...(tags !== undefined && { tags: tags ? tags.trim() : tags }),
        ...(summary !== undefined && { summary: String(summary).trim() || null }),
        ...(codeSample !== undefined && { codeSample: String(codeSample).trim() || null }),
        ...(relatedLink !== undefined && { relatedLink: String(relatedLink).trim() || null }),
        ...(visibility !== undefined && { visibility }),
        ...(isPublished !== undefined && { isPublished }),
        ...(sortOrder !== undefined && { sortOrder }),
        updatedAt: new Date(),
      },
      include: {
        user: true,
      },
    });

    await writeAuditLog(userId, "document:update", { id: documentId, title: newTitle, category: newCategory, visibility: document.visibility }, null, null, request);

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

    // 删除留痕：先写一份“删除前快照”到历史表（note 标注 + editorId）。
    // 历史表外键已改为 ON DELETE SET NULL，删除主文档后该快照仍保留，可审计溯源。
    await prisma.systemdocumenthistory.create({
      data: {
        documentId: targetDoc.id,
        title: targetDoc.title,
        content: targetDoc.content,
        category: targetDoc.category,
        tags: targetDoc.tags,
        summary: targetDoc.summary,
        codeSample: targetDoc.codeSample,
        relatedLink: targetDoc.relatedLink,
        helpfulCount: targetDoc.helpfulCount,
        isPublished: targetDoc.isPublished,
        sortOrder: targetDoc.sortOrder,
        editorId: userId,
        note: "删除前快照",
      },
    });

    await prisma.systemdocument.delete({ where: { id: documentId } });

    await writeAuditLog(userId, "document:delete", { id: documentId, title: targetDoc.title, category: targetDoc.category }, null, null, request);

    return NextResponse.json({ success: true, message: "文档已删除" });
  } catch (error) {
    console.error("Delete document error:", error);
    return NextResponse.json({ error: "删除文档失败" }, { status: 500 });
  }
}
