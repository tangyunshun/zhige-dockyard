import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { validateUser, isAdmin } from "@/lib/auth";

/**
 * 自动注销超过 2 年无操作的工作空间
 * 
 * 业务逻辑：
 * 1. 查找所有超过 2 年（730 天）没有活跃记录的工作空间
 * 2. 将其状态改为 ARCHIVED（已归档）
 * 3. 记录操作日志
 * 
 * 触发方式：
 * - 手动调用：管理员后台触发
 * - 自动触发：可配置定时任务（如每天凌晨 2 点）
 */
export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    // 检查是否为管理员
    if (!isAdmin(authResult.user!)) {
      return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    }

    // 计算 2 年前的日期
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);

    // 查找超过 2 年无操作的工作空间
    const inactiveWorkspaces = await prisma.workspace.findMany({
      where: {
        status: "ACTIVE", // 只处理活跃状态的空间
        OR: [
          // 情况 1：有 lastActiveAt 记录，但超过 2 年
          {
            lastActiveAt: {
              lte: twoYearsAgo,
            },
          },
          // 情况 2：没有 lastActiveAt 记录，且 updatedAt 超过 2 年
          {
            lastActiveAt: null,
            updatedAt: {
              lte: twoYearsAgo,
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        ownerId: true,
        updatedAt: true,
        lastActiveAt: true,
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // 批量更新状态为 ARCHIVED
    const archivedIds = inactiveWorkspaces.map((ws) => ws.id);
    
    if (archivedIds.length > 0) {
      await prisma.workspace.updateMany({
        where: {
          id: { in: archivedIds },
        },
        data: {
          status: "ARCHIVED",
        },
      });
    }

    // 记录操作日志（可以写入专门的日志表）
    console.log(`自动归档工作空间：${archivedIds.length} 个`, {
      count: archivedIds.length,
      workspaces: inactiveWorkspaces.map((ws) => ({
        id: ws.id,
        name: ws.name,
        lastActive: ws.lastActiveAt || ws.updatedAt,
      })),
    });

    return NextResponse.json({
      success: true,
      message: `成功归档 ${archivedIds.length} 个超过 2 年无操作的工作空间`,
      data: {
        archivedCount: archivedIds.length,
        archivedWorkspaces: inactiveWorkspaces.map((ws) => ({
          id: ws.id,
          name: ws.name,
          ownerEmail: ws.owner.email,
          lastActive: ws.lastActiveAt || ws.updatedAt,
        })),
      },
    });
  } catch (error) {
    console.error("Archive inactive workspaces error:", error);
    return NextResponse.json(
      { error: "归档工作空间失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

/**
 * 获取即将被归档的工作空间列表（预览）
 */
export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    // 检查是否为管理员
    if (!isAdmin(authResult.user!)) {
      return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
    }

    // 计算 2 年前的日期
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);

    // 查找即将被归档的工作空间
    const inactiveWorkspaces = await prisma.workspace.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          {
            lastActiveAt: {
              lte: twoYearsAgo,
            },
          },
          {
            lastActiveAt: null,
            updatedAt: {
              lte: twoYearsAgo,
            },
          },
        ],
      },
      select: {
        id: true,
        name: true,
        ownerId: true,
        updatedAt: true,
        lastActiveAt: true,
        owner: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      take: 100, // 最多返回 100 个
    });

    return NextResponse.json({
      success: true,
      data: {
        count: inactiveWorkspaces.length,
        workspaces: inactiveWorkspaces,
      },
    });
  } catch (error) {
    console.error("Get inactive workspaces error:", error);
    return NextResponse.json(
      { error: "获取工作空间列表失败" },
      { status: 500 }
    );
  }
}
