import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser, isAdmin } from "@/lib/auth";

/**
 * POST /api/admin/workspaces/archive-inactive
 * 自动归档 2 年未活跃的工作空间
 * 
 * 业务逻辑：
 * 1. 查找超过 2 年（730 天）未活跃的企业空间
 * 2. 将状态更新为已归档（ARCHIVED）
 * 3. 记录操作日志
 * 
 * 注意：
 * - 只处理状态为 ACTIVE 的企业空间
 * - 需要管理员权限
 */
export async function POST(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    // 验证是否为管理员
    if (!isAdmin(authResult.user!)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    // 计算 2 年前的日期
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);

    // 查找 2 年未活跃的企业空间
    const inactiveWorkspaces = await prisma.workspace.findMany({
      where: {
        status: "ACTIVE", // 只处理活跃状态
        OR: [
          // 条件 1: lastActiveAt 小于 2 年前
          {
            lastActiveAt: {
              lte: twoYearsAgo,
            },
          },
          // 条件 2: lastActiveAt 为空且 updatedAt 小于 2 年前
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

    // 记录操作日志
    console.log(`已归档 ${archivedIds.length} 个长期未活跃的企业空间`, {
      count: archivedIds.length,
      workspaces: inactiveWorkspaces.map((ws) => ({
        id: ws.id,
        name: ws.name,
        lastActive: ws.lastActiveAt || ws.updatedAt,
      })),
    });

    return NextResponse.json({
      success: true,
      message: `已归档 ${archivedIds.length} 个长期未活跃的企业空间`,
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
      { error: "归档长期未活跃企业空间失败", details: error instanceof Error ? error.message : error },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/workspaces/archive-inactive
 * 获取待归档的长期未活跃企业空间列表
 */
export async function GET(request: NextRequest) {
  try {
    // 验证管理员权限
    const authHeader = request.headers.get("authorization");
    const authResult = await validateUser(authHeader);

    if (!authResult.valid) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    // 验证是否为管理员
    if (!isAdmin(authResult.user!)) {
      return NextResponse.json({ error: "无权访问" }, { status: 403 });
    }

    // 计算 2 年前的日期
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);

    // 查找待归档的企业空间
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
      take: 100, // 最多返回 100 条
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
      { error: "获取未活跃工作空间列表失败" },
      { status: 500 }
    );
  }
}
