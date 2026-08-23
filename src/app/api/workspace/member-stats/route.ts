import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

/**
 * 获取协同成员在指定工作空间下的真实研发数据盘点统计
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await validateUser(request.headers.get("Authorization"), request);
    if (!auth.valid || !auth.user) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }
    const userId = auth.user.id;
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少必要参数 workspaceId" }, { status: 400 });
    }

    // 1. 真实统计该用户在此空间下执行运行的 componenttask 任务条数
    const taskCount = await prisma.componenttask.count({
      where: {
        tenantId: workspaceId,
        userId: userId,
      },
    });

    // 2. 真实统计此空间下的 asset 资产组件材料份数
    const assetCount = await prisma.asset.count({
      where: {
        workspaceId: workspaceId,
      },
    });

    return NextResponse.json({
      success: true,
      stats: {
        taskCount,
        assetCount,
      },
    });
  } catch (error) {
    console.error("Fetch workspace member stats error:", error);
    return NextResponse.json(
      { error: "获取数据统计失败，请稍后重试" },
      { status: 500 }
    );
  }
}
