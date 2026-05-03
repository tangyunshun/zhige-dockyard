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
        { error: "请选择要下架的组件" },
        { status: 400 },
      );
    }

    // 批量下架组件
    await prisma.componenttask.updateMany({
      where: {
        id: {
          in: ids,
        },
      },
      data: {
        isPublished: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: "批量下架成功",
    });
  } catch (error) {
    console.error("Batch unpublish error:", error);
    return NextResponse.json(
      {
        error: "批量下架失败",
        details: error instanceof Error ? error.message : error,
      },
      { status: 500 },
    );
  }
}
