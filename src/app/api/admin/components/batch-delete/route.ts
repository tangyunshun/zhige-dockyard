import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePlatformPermission } from "@/lib/security";

export async function POST(request: NextRequest) {
  try {
    const authResult = await requirePlatformPermission(request, "component:delete");
    if (!authResult.authorized) {
      return authResult.errorResponse!;
    }

    const body = await request.json();
    const ids = body.ids || body.componentIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "缺少组件 ID 列表" }, { status: 400 });
    }

    // 强安全门禁：待删除的组件中若包含已上架组件，禁止批量删除
    const publishedComponents = await prisma.componentcatalog.findMany({
      where: {
        id: { in: ids },
        isPublished: true,
      },
      select: { id: true, name: true },
    });

    if (publishedComponents.length > 0) {
      const names = publishedComponents.map((c) => `【${c.name}】`).slice(0, 3).join("、");
      const more = publishedComponents.length > 3 ? ` 等共 ${publishedComponents.length} 个组件` : "";
      return NextResponse.json(
        {
          error: `选中的组件中包含已上架组件（${names}${more}），系统禁止直接删除！请先下架后再执行批量删除。`,
        },
        { status: 400 }
      );
    }

    await prisma.componentcatalog.deleteMany({
      where: { id: { in: ids } },
    });

    return NextResponse.json({
      success: true,
      message: `已批量删除 ${ids.length} 个组件`,
    });
  } catch (error) {
    console.error("Batch delete components error:", error);
    return NextResponse.json({ error: "批量删除组件失败" }, { status: 500 });
  }
}
