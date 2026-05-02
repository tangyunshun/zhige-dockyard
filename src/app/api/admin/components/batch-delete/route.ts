import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const userId = request.headers.get("authorization");
    if (!userId) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
      return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const { ids } = await request.json();

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        { error: "请选择要删除的组件" },
        { status: 400 }
      );
    }

    // 检查是否有组件被使用（usageCount > 0）
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
      },
    });

    const usedComponents = components.filter(c => c.usageCount > 0);
    if (usedComponents.length > 0) {
      const names = usedComponents.map(c => c.name).join("、");
      return NextResponse.json(
        { 
          error: `以下组件已被使用，无法删除：${names}` 
        },
        { status: 400 }
      );
    }

    // 批量删除组件
    await prisma.componenttask.deleteMany({
      where: {
        id: {
          in: ids,
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "批量删除成功",
    });
  } catch (error) {
    console.error("Batch delete error:", error);
    return NextResponse.json(
      {
        error: "批量删除失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 }
    );
  }
}
