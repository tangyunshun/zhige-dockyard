import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "component:publish");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const body = await request.json();
    const ids = body.ids || body.componentIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "缺少组件 ID 列表" }, { status: 400 });
    }

    await prisma.componentcatalog.updateMany({
      where: { id: { in: ids } },
      data: { isPublished: false },
    });

    return NextResponse.json({
      success: true,
      message: `已批量下架 ${ids.length} 个组件`,
    });
  } catch (error) {
    console.error("Batch unpublish components error:", error);
    return NextResponse.json({ error: "批量下架组件失败" }, { status: 500 });
  }
}
