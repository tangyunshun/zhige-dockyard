import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 获取用户 ID（临时实现）
function getUserId(request: NextRequest): string {
  // TODO: 实现真实的用户认证
  // 目前返回测试用户 ID
  return "test-user-001";
}

// GET - 获取组件相关信息
export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action");

    // 获取用户收藏的组件
    if (action === "favorites") {
      const favorites = await prisma.componentFavorite.findMany({
        where: { userId },
        select: { componentId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ 
        success: true, 
        data: favorites.map(f => f.componentId) 
      });
    }

    // 获取用户最近使用的组件
    if (action === "recent") {
      const recent = await prisma.componentUsage.findMany({
        where: { userId },
        select: { componentId: true, usedAt: true },
        orderBy: { usedAt: "desc" },
        take: 10,
      });
      return NextResponse.json({ 
        success: true, 
        data: recent.map(r => r.componentId) 
      });
    }

    // 获取组件统计信息
    if (action === "stats") {
      const componentId = searchParams.get("componentId");
      if (!componentId) {
        return NextResponse.json({ 
          success: false, 
          error: "缺少 componentId 参数" 
        }, { status: 400 });
      }

      const stats = await prisma.componentStats.findUnique({
        where: { componentId },
      });

      return NextResponse.json({ 
        success: true, 
        data: stats || {
          componentId,
          totalUses: 0,
          totalFavorites: 0,
          averageRating: 0,
          ratingCount: 0,
          reviewCount: 0,
        }
      });
    }

    // 获取组件评分
    if (action === "ratings") {
      const componentId = searchParams.get("componentId");
      if (!componentId) {
        return NextResponse.json({ 
          success: false, 
          error: "缺少 componentId 参数" 
        }, { status: 400 });
      }

      const ratings = await prisma.componentRating.findMany({
        where: { componentId },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ success: true, data: ratings });
    }

    // 获取组件评论
    if (action === "reviews") {
      const componentId = searchParams.get("componentId");
      if (!componentId) {
        return NextResponse.json({ 
          success: false, 
          error: "缺少 componentId 参数" 
        }, { status: 400 });
      }

      const reviews = await prisma.componentReview.findMany({
        where: { 
          componentId,
          parentId: null,
          status: "active",
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ success: true, data: reviews });
    }

    return NextResponse.json({ 
      success: false, 
      error: "缺少 action 参数" 
    }, { status: 400 });

  } catch (error) {
    console.error("Studio API GET error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "服务器内部错误" 
    }, { status: 500 });
  }
}

// POST - 执行组件相关操作
export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const body = await request.json();
    const { action, componentId, rating, comment, content, parentId } = body;

    // 收藏组件
    if (action === "favorite") {
      if (!componentId) {
        return NextResponse.json({ 
          success: false, 
          error: "缺少 componentId 参数" 
        }, { status: 400 });
      }

      await prisma.componentFavorite.upsert({
        where: {
          userId_componentId: {
            userId,
            componentId,
          },
        },
        update: {},
        create: {
          userId,
          componentId,
        },
      });

      // 更新统计
      await prisma.componentStats.upsert({
        where: { componentId },
        update: {
          totalFavorites: { increment: 1 },
        },
        create: {
          componentId,
          totalFavorites: 1,
        },
      });

      return NextResponse.json({ success: true });
    }

    // 取消收藏
    if (action === "unfavorite") {
      if (!componentId) {
        return NextResponse.json({ 
          success: false, 
          error: "缺少 componentId 参数" 
        }, { status: 400 });
      }

      await prisma.componentFavorite.delete({
        where: {
          userId_componentId: {
            userId,
            componentId,
          },
        },
      }).catch(() => {
        // 如果不存在则忽略
      });

      // 更新统计
      await prisma.componentStats.update({
        where: { componentId },
        data: {
          totalFavorites: { decrement: 1 },
        },
      }).catch(() => {
        // 如果不存在则忽略
      });

      return NextResponse.json({ success: true });
    }

    // 使用组件
    if (action === "use") {
      if (!componentId) {
        return NextResponse.json({ 
          success: false, 
          error: "缺少 componentId 参数" 
        }, { status: 400 });
      }

      await prisma.componentUsage.create({
        data: {
          userId,
          componentId,
          workspaceId: body.workspaceId,
        },
      });

      // 更新统计
      await prisma.componentStats.upsert({
        where: { componentId },
        update: {
          totalUses: { increment: 1 },
          dailyUses: { increment: 1 },
          weeklyUses: { increment: 1 },
          monthlyUses: { increment: 1 },
          lastUsedAt: new Date(),
        },
        create: {
          componentId,
          totalUses: 1,
          dailyUses: 1,
          weeklyUses: 1,
          monthlyUses: 1,
          lastUsedAt: new Date(),
        },
      });

      return NextResponse.json({ success: true });
    }

    // 评分
    if (action === "rate") {
      if (!componentId || !rating || rating < 1 || rating > 5) {
        return NextResponse.json({ 
          success: false, 
          error: "参数错误" 
        }, { status: 400 });
      }

      const existing = await prisma.componentRating.findUnique({
        where: {
          userId_componentId: {
            userId,
            componentId,
          },
        },
      });

      if (existing) {
        await prisma.componentRating.update({
          where: {
            userId_componentId: {
              userId,
              componentId,
            },
          },
          data: { rating, comment },
        });
      } else {
        await prisma.componentRating.create({
          data: {
            userId,
            componentId,
            rating,
            comment,
          },
        });
      }

      // 计算平均评分
      const allRatings = await prisma.componentRating.findMany({
        where: { componentId },
        select: { rating: true },
      });

      const avg = allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;

      await prisma.componentStats.upsert({
        where: { componentId },
        update: {
          averageRating: avg,
          ratingCount: allRatings.length,
        },
        create: {
          componentId,
          averageRating: avg,
          ratingCount: allRatings.length,
        },
      });

      return NextResponse.json({ success: true });
    }

    // 评论
    if (action === "review") {
      if (!componentId || !content) {
        return NextResponse.json({ 
          success: false, 
          error: "参数错误" 
        }, { status: 400 });
      }

      await prisma.componentReview.create({
        data: {
          userId,
          componentId,
          parentId: parentId || null,
          content,
          rating: rating || null,
        },
      });

      // 更新统计
      try {
        await prisma.componentStats.update({
          where: { componentId },
          data: {
            reviewCount: { increment: 1 },
          },
        });
      } catch {
        // 如果不存在则创建
        await prisma.componentStats.create({
          data: {
            componentId,
            reviewCount: 1,
          },
        });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ 
      success: false, 
      error: "缺少 action 参数" 
    }, { status: 400 });

  } catch (error) {
    console.error("Studio API POST error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "服务器内部错误" 
    }, { status: 500 });
  }
}

// DELETE - 删除组件相关数据
export async function DELETE(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action");
    const componentId = searchParams.get("componentId");
    const reviewId = searchParams.get("reviewId");

    // 隐藏评论
    if (action === "review" && reviewId) {
      await prisma.componentReview.update({
        where: { id: reviewId },
        data: { status: "hidden" },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ 
      success: false, 
      error: "缺少 action 参数" 
    }, { status: 400 });

  } catch (error) {
    console.error("Studio API DELETE error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "服务器内部错误" 
    }, { status: 500 });
  }
}
