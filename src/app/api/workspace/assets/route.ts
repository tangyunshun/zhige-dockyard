import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: 获取用户资产统计
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { error: "缺少用户 ID" },
        { status: 400 }
      );
    }

    // 获取用户的所有工作空间
    const workspaces = await prisma.workspace.findMany({
      where: {
        ownerId: userId,
      },
      include: {
        workspacemember: true,
      },
    });

    const workspaceIds = workspaces.map(ws => ws.id);

    // 统计项目总数
    const totalProjects = await prisma.componenttask.count({
      where: {
        tenantId: {
          in: workspaceIds,
        },
      },
    });

    // 统计文档总数（假设有 document 表）
    const totalDocuments = await prisma.document.count({
      where: {
        userId,
      },
    }).catch(() => 0); // 如果表不存在，返回 0

    // 统计架构图总数（假设 componenttask 中包含架构图）
    const totalDiagrams = await prisma.componenttask.count({
      where: {
        tenantId: {
          in: workspaceIds,
        },
        componentId: {
          in: ["C06", "C09", "C10"], // 架构图、UI 设计、原型设计
        },
      },
    });

    // 获取用户 Token 余额（假设有 user 表的 balance 字段）
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        balance: true,
      },
    });

    const tokenBalance = user?.balance || 0;

    // 计算存储使用量（假设有 file 表）
    const storageUsed = await prisma.file
      .aggregate({
        where: {
          userId,
        },
        _sum: {
          size: true,
        },
      })
      .then(r => r._sum.size || 0)
      .catch(() => 0);

    const storageTotal = 1024 * 1024 * 1024; // 1GB

    return NextResponse.json({
      success: true,
      stats: {
        totalProjects,
        totalDocuments,
        totalDiagrams,
        tokenBalance,
        storageUsed,
        storageTotal,
      },
    });
  } catch (error) {
    console.error("Get asset stats error:", error);
    return NextResponse.json(
      { error: "获取资产统计失败" },
      { status: 500 }
    );
  }
}
