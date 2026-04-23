import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader === "Bearer null" || authHeader === "Bearer ") {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    const userId = authHeader.replace("Bearer ", "");
    
    // 获取用户信息
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 统计企业空间数量
    const enterpriseWorkspaces = await prisma.workspace.findMany({
      where: {
        ownerId: userId,
        type: "ENTERPRISE",
      },
    });

    // 判断会员状态（简化版本：通过角色判断）
    const isMember = user.role === "admin" || user.role === "super_admin";
    const maxEnterprise = isMember ? 3 : 1;

    const quota = {
      hasEnterprise: enterpriseWorkspaces.length > 0,
      enterpriseCount: enterpriseWorkspaces.length,
      maxEnterprise,
      isMember,
    };

    return NextResponse.json({
      success: true,
      quota,
    });
  } catch (error) {
    console.error("Get quota error:", error);
    return NextResponse.json(
      { error: "获取配额失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}
