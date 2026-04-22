import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 获取当前用户 ID（从 session 或 request header）
function getUserId(request: NextRequest): string {
  // TODO: 实现真实的用户认证
  // 暂时返回一个测试用户 ID
  return "test-user-001";
}

// GET - 获取组件相关数据
export async function GET(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action");

    // 获取用户的收藏列表
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

    // 获取用户的最近使用
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

    // 获取组件统计
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
          parentId: null, // 只获取主评论
          status: "active",
        },
        orderBy: { createdAt: "desc" },
      });

      return NextResponse.json({ success: true, data: reviews });
    }

    return NextResponse.json({ 
      success: false, 
      error: "未知的 action" 
    }, { status: 400 });

  } catch (error) {
    console.error("Studio API GET error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "服务器错误" 
    }, { status: 500 });
  }
}

// POST - 创建或更新组件相关数据
export async function POST(request: NextRequest) {
  try {
    const userId = getUserId(request);
    const body = await request.json();
    const { action, componentId, rating, comment, content, parentId } = body;

    // 添加收藏
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
        // 如果不存在，忽略错误
      });

      // 更新统计
      await prisma.componentStats.update({
        where: { componentId },
        data: {
          totalFavorites: { decrement: 1 },
        },
      }).catch(() => {
        // 如果不存在，忽略错误
      });

      return NextResponse.json({ success: true });
    }

    // 记录使用
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

    // 添加/更新评分
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

      // 重新计算平均评分
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

    // 添加评论
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
        // 如果不存在，则创建
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
      error: "未知的 action" 
    }, { status: 400 });

  } catch (error) {
    console.error("Studio API POST error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "服务器错误" 
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

    // 删除评论
    if (action === "review" && reviewId) {
      await prisma.componentReview.update({
        where: { id: reviewId },
        data: { status: "hidden" },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ 
      success: false, 
      error: "未知的 action" 
    }, { status: 400 });

  } catch (error) {
    console.error("Studio API DELETE error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "服务器错误" 
    }, { status: 500 });
  }
}
