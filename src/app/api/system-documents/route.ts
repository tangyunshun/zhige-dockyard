import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdminRole } from "@/lib/auth";
import { LEGAL_DOCUMENTS } from "@/lib/legal-document-content";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    if (!category) {
      return NextResponse.json(
        { error: "缺少分类参数" },
        { status: 400 }
      );
    }

    // 登录态解析：游客仅可见 PUBLIC；登录用户 PUBLIC + LOGIN_REQUIRED；管理员全部。
    const auth = await validateUser(request.headers.get("Authorization"), request);
    const isLoggedIn = auth.valid && !!auth.user;
    const isAdmin = isLoggedIn && isAdminRole((auth.user as { role?: string }).role);

    let document = await prisma.systemdocument.findFirst({
      where: {
        category,
        isPublished: true,
        ...(isLoggedIn ? (isAdmin ? {} : { visibility: { in: ["PUBLIC", "LOGIN_REQUIRED"] } }) : { visibility: "PUBLIC" }),
      },
      orderBy: { createdAt: "desc" },
    });

    // 功能自愈：仅当该分类“完全无文档”时注入默认文案；
    // 若文档存在但已下架(isPublished=false)，则尊重下架状态，不再重建（避免 title+category 唯一约束冲突）
    if (!document) {
      const existingAny = await prisma.systemdocument.findFirst({ where: { category } });
      if (existingAny) {
        return NextResponse.json(
          { success: false, unpublished: true, error: "文档处于维护中，请等待恢复。" },
          { status: 404 }
        );
      }

      // 单一副本：法律全文来自 src/lib/legal-document-content.ts，与 seed 共用同一正源
      const fallback = LEGAL_DOCUMENTS[category];
      if (!fallback) {
        return NextResponse.json(
          { error: "未找到文档" },
          { status: 404 }
        );
      }

      console.log(`[System Document] Category "${category}" not found, auto-rebuilding default document...`);
      const randomId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

      // 系统自愈补建：落操作日志 + 写入首版历史快照（authorId/editorId 为系统，留痕可审计）
      const created = await prisma.systemdocument.create({
        data: {
          id: randomId,
          title: fallback.title,
          content: fallback.content,
          category,
          tags: fallback.tags,
          isPublished: true,
          sortOrder: 0,
          viewCount: 0,
          authorId: null,
          updatedAt: new Date(),
        },
      });

      await prisma.systemdocumenthistory.create({
        data: {
          documentId: created.id,
          title: created.title,
          content: created.content,
          category: created.category,
          tags: created.tags,
          isPublished: created.isPublished,
          sortOrder: created.sortOrder,
          editorId: null,
        },
      }).catch((err) => {
        console.warn("[System Document] 自愈首版快照写入非阻断提示:", err);
      });

      await prisma.operationlog.create({
        data: {
          id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId: "system",
          action: "SYSTEM_DOC_AUTO_CREATE",
          resource: "SYSTEM_DOCUMENT",
          details: { category, id: created.id, title: created.title },
        },
      }).catch((err) => {
        console.warn("[System Document] 自愈操作日志非阻断提示:", err);
      });

      document = created;
    }

    if (!document) {
      return NextResponse.json(
        { error: "未找到文档" },
        { status: 404 }
      );
    }

    // 注意：浏览量不再在此 GET 中无条件自增（旧实现可无限刷且游客无留痕）。
    // 真实阅读计数统一走带去重的 POST /api/documents/view（前台阅读弹层与法务页挂载时上报）。
    return NextResponse.json({ success: true, data: document });
  } catch (error: any) {
    console.error("Get system document error:", error);
    return NextResponse.json(
      { 
        error: "获取文档失败", 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
}
