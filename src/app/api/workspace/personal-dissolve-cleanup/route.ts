import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid || !authResult.user) {
      return NextResponse.json({ error: authResult.error || "未登录或登录已失效" }, { status: 401 });
    }

    const userId = authResult.user.id;
    const body = await request.json();
    const { workspaceId, action, targetUsageId, targetTaskId } = body;

    if (!workspaceId) {
      return NextResponse.json({ error: "缺少个人工作空间 ID" }, { status: 400 });
    }

    // 1. 验证个人工作空间所有权
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, ownerId: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: "个人工作空间不存在" }, { status: 404 });
    }

    if (workspace.ownerId !== userId) {
      return NextResponse.json({ error: "只有个人空间所有者才可以执行清理操作" }, { status: 403 });
    }

    let unboundAssetsCount = 0;
    let clearedTasksCount = 0;

    // 2. 根据 action 拆解执行数据清理
    if (action === "UNBIND_ASSETS" || action === "CLEAR_ALL") {
      // 物理解绑清理该个人空间关联的所有个人组件使用/装配记录
      const assetRes = await prisma.componentusage.deleteMany({
        where: { workspaceId },
      });
      unboundAssetsCount = assetRes.count;
    }

    if (action === "CANCEL_TASKS" || action === "CLEAR_ALL") {
      // 物理清理/标记该空间下的个人效能任务
      const taskRes = await prisma.componenttask.deleteMany({
        where: { tenantId: workspaceId },
      });
      clearedTasksCount = taskRes.count;
    }

    if (action === "UNBIND_SINGLE_ASSET" && targetUsageId) {
      const singleUsage = await prisma.componentusage.findUnique({
        where: { id: targetUsageId },
      });
      if (singleUsage && singleUsage.workspaceId === workspaceId) {
        await prisma.componentusage.delete({
          where: { id: targetUsageId },
        });
        unboundAssetsCount = 1;
      }
    }

    if (action === "CANCEL_SINGLE_TASK" && targetTaskId) {
      const singleTask = await prisma.componenttask.findUnique({
        where: { id: targetTaskId },
      });
      if (singleTask && singleTask.tenantId === workspaceId) {
        await prisma.componenttask.delete({
          where: { id: targetTaskId },
        });
        clearedTasksCount = 1;
      }
    }

    // 3. 查询即时剩余状态
    const remainingAssets = await prisma.componentusage.count({
      where: { workspaceId },
    });
    const remainingActiveTasks = await prisma.componenttask.count({
      where: { tenantId: workspaceId, status: { in: ["IN_PROGRESS", "PENDING"] } },
    });

    return NextResponse.json({
      success: true,
      message: "个人沙箱依赖数据清理完成",
      cleaned: {
        unboundAssetsCount,
        clearedTasksCount,
      },
      remaining: {
        assetCount: remainingAssets,
        activeTaskCount: remainingActiveTasks,
        canDissolve: remainingAssets === 0 && remainingActiveTasks === 0,
      },
    });
  } catch (error: any) {
    console.error("Personal dissolve cleanup error:", error);
    return NextResponse.json(
      { error: "个人空间清理失败，请稍后重试", details: error?.message },
      { status: 500 }
    );
  }
}
