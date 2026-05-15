import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/auth";

export async function GET(request: NextRequest) {
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

    const stats = await prisma.componentStats.findMany({
      orderBy: { totalUses: "desc" },
      take: 100,
    });

    return NextResponse.json({ success: true, data: stats });
  } catch (error) {
    console.error("Get component stats error:", error);
    return NextResponse.json({ error: "获取组件统计失败" }, { status: 500 });
  }
}
