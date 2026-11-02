import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdminRole } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");

    // 登录态解析：无 token 或无效 → 游客，仅返回 PUBLIC 文档；
    // 已登录用户可见 PUBLIC 与 LOGIN_REQUIRED 文档。
    const auth = await validateUser(request.headers.get("Authorization"), request);
    const isLoggedIn = auth.valid && !!auth.user;
    const isAdmin = isLoggedIn && isAdminRole((auth.user as { role?: string }).role);

    // 注意：历史上误迁移的两条组件业务数据（doc_mig_1792267375767_7、doc_mig_1792267375780_9）
    // 已由一次性脚本 scripts/cleanup-migrated-docs.ts 安全删除，此处不再每次 GET 执行写操作。
    const where: any = {
      isPublished: true,
    };
    // 可见范围三态：游客仅 PUBLIC；登录用户 PUBLIC + LOGIN_REQUIRED；管理员全部（含 ADMIN_ONLY）
    if (!isLoggedIn) {
      where.visibility = "PUBLIC";
    } else if (!isAdmin) {
      where.visibility = { in: ["PUBLIC", "LOGIN_REQUIRED"] };
    }

    if (category) {
      where.category = category;
    }

    const documents = await prisma.systemdocument.findMany({
      where,
      orderBy: [
        { sortOrder: "asc" },
        { createdAt: "desc" }
      ]
    });

    return NextResponse.json({
      success: true,
      data: documents,
    });
  } catch (error) {
    console.error("Get public documents list error:", error);
    return NextResponse.json({ error: "获取公开文档列表失败" }, { status: 500 });
  }
}

