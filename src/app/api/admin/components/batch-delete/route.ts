import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    const { componentIds } = await request.json();

    if (!componentIds || !Array.isArray(componentIds) || componentIds.length === 0) {
      return NextResponse.json({ error: "缺少组件 ID 列表" }, { status: 400 });
    }

    await prisma.componenttask.deleteMany({
      where: { id: { in: componentIds } },
    });

    return NextResponse.json({
      success: true,
      message: `已批量删除 ${componentIds.length} 个组件`,
    });
  } catch (error) {
    console.error("Batch delete components error:", error);
    return NextResponse.json({ error: "批量删除组件失败" }, { status: 500 });
  }
}
