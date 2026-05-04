import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const userId = request.headers.get("authorization");
    if (!userId) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "请选择要删除的组件" },
        { status: 400 },
      );
    }

    // 检查组件状态
    const components = await prisma.componenttask.findMany({
      where: {
        id: {
          in: ids,
        },
      },
      select: {
        id: true,
        name: true,
        usageCount: true,
        isPublished: true,
      },
    });

    // 过滤出可以删除的组件（未上架且未被使用）
    const deletableComponents = components.filter(
      (c) => !c.isPublished && c.usageCount === 0,
    );

    if (deletableComponents.length === 0) {
      return NextResponse.json(
        { error: "选中的组件中没有可以删除的组件" },
        { status: 400 },
      );
    }

    // 只删除可以删除的组件
    await prisma.componenttask.deleteMany({
      where: {
        id: {
          in: deletableComponents.map((c) => c.id),
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `成功删除 ${deletableComponents.length} 个组件`,
    });
  } catch (error) {
    console.error("Batch delete error:", error);
    return NextResponse.json(
      {
        error: "批量删除失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
