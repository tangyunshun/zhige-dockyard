import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET - 获取用户仪表板统计信息
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get("Authorization")?.replace("Bearer ", "");

    if (!userId) {
      return NextResponse.json({ error: "未授权" }, { status: 401 });
    }

    // 获取工作空间数量
    const workspaceCount = await prisma.workspace.count({
      where: {
        OR: [
          { ownerId: userId },
          {
            workspacemember: {
              some: { userId },
            },
          },
        ],
      },
    });

    // 获取组件任务数量
    const componentCount = await prisma.componenttask.count({
      where: { userId },
    });

    // 获取用户会员等级信息
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { membershipLevel: true },
    });

    let apiCallsLimit = 1000;
    let storageLimit = 1073741824; // 1GB

    if (user?.membershipLevel) {
      const membershipLevel = await prisma.membershiplevel.findUnique({
        where: { name: user.membershipLevel },
        select: {
          maxApiCalls: true,
          maxStorage: true,
        },
      });

      if (membershipLevel) {
        apiCallsLimit = Number(membershipLevel.maxApiCalls) || 1000;
        storageLimit = Number(membershipLevel.maxStorage) || 1073741824;
      }
    }

    // 获取已使用的 API 调用次数和存储空间
    // TODO: 实现具体的统计逻辑
    const apiCallsUsed = 0;
    const storageUsed = 0;

    return NextResponse.json({
      success: true,
      data: {
        workspaceCount,
        componentCount,
        apiCallsUsed,
        apiCallsLimit,
        storageUsed,
        storageLimit,
      },
    });
  } catch (error) {
    console.error("Get dashboard stats error:", error);
    return NextResponse.json(
      { error: "获取统计信息失败" },
      { status: 500 }
    );
  }
}
