import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * 岗位商务图标库查询
 * 图标集合来自数据库 posticonlibrary（唯一权威数据源），
 * 前端「岗位图标选择器」与图标渲染一律以本接口返回的 iconKey 为准。
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await validateUser(request.headers.get("Authorization"), request);
    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const rows = await prisma.posticonlibrary.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, iconKey: true, name: true, category: true },
    });

    return NextResponse.json({
      success: true,
      icons: rows.map((r) => ({
        id: r.id,
        iconKey: r.iconKey,
        name: r.name || "",
        category: r.category,
      })),
    });
  } catch (error) {
    console.error("查询岗位图标库错误:", error);
    return NextResponse.json({ error: "获取岗位图标库失败" }, { status: 500 });
  }
}
