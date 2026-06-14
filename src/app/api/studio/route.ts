import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-in-production",
);

// 获取真实用户 ID
async function getUserId(request: NextRequest): Promise<string | null> {
  // 从 Cookie 中获取 token
  let token = request.cookies.get("auth_token")?.value;

  // 如果 Cookie 中没有，尝试从 Authorization header 获取
  if (!token) {
    const authHeader = request.headers.get("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload.userId as string;
  } catch (error) {
    console.error("JWT verify failed in studio API:", error);
    return null;
  }
}

// GET - 获取组件相关信息
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action");

    // 获取用户收藏的组件
    if (action === "favorites") {
      const favorites = await prisma.componentfavorite.findMany({
        where: { userId },
        select: { componentId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ 
        success: true, 
        data: favorites.map(f => f.componentId) 
      });
    }

    // 获取指定工作空间已绑定的组件
    if (action === "bound") {
      const workspaceId = searchParams.get("workspaceId");
      if (!workspaceId) {
        return NextResponse.json({ 
          success: false, 
          error: "缺少 workspaceId 参数" 
        }, { status: 400 });
      }
      
      const usages = await prisma.componentusage.findMany({
        where: { workspaceId },
        select: { componentId: true },
        distinct: ['componentId'] // 去重
      });
      
      return NextResponse.json({
        success: true,
        data: usages.map(u => u.componentId)
      });
    }

    // 获取当前用户在当前空间下的岗位受限组件列表 (防截断和权限闭环)
    if (action === "restricted") {
      const workspaceId = searchParams.get("workspaceId");
      if (!workspaceId) {
        return NextResponse.json({ 
          success: false, 
          error: "缺少 workspaceId 参数" 
        }, { status: 400 });
      }

      const restrictedIds = await getRestrictedComponentIds(workspaceId, userId);
      return NextResponse.json({ 
        success: true, 
        data: restrictedIds 
      });
    }

    // 获取用户最近使用的组件
    if (action === "recent") {
      const recent = await prisma.componentusage.findMany({
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

      const stats = await prisma.componentstats.findUnique({
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

      const ratings = await prisma.componentrating.findMany({
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

      const reviews = await prisma.componentreview.findMany({
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

// 兜底创建或获取 Workspace Quota 信息的辅助函数
async function getOrCreateQuota(workspaceId: string, userId: string) {
  let quota = await prisma.workspacequota.findUnique({
    where: { workspaceId }
  });
  
  if (!quota) {
    // 获取用户的会员级别
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { membershipLevel: true }
    });
    const membershipLevel = dbUser?.membershipLevel || "FREE";
    
    // 不同会员等级对应的 Token 限额
    const tokenLimit = membershipLevel === "FREE" ? 10000 : membershipLevel === "GOLD" ? 50000 : 100000;
    
    // 查询或匹配会员等级关联 ID
    let ml = await prisma.membershiplevel.findUnique({
      where: { id: membershipLevel }
    });
    if (!ml) {
      ml = await prisma.membershiplevel.findFirst();
    }
    const mlId = ml?.id || "FREE";
    
    quota = await prisma.workspacequota.create({
      data: {
        id: crypto.randomUUID(),
        workspaceId,
        membershipLevelId: mlId,
        tokenBalance: BigInt(tokenLimit),
        updatedAt: new Date()
      }
    });
  }
  return quota;
}

// 岗位受限组件 ID 列表获取辅助函数 (闭环安全隔离)
async function getRestrictedComponentIds(workspaceId: string, userId: string): Promise<string[]> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { type: true, ownerId: true }
  });

  // 1. 若为个人空间，或者当前用户是空间所有者 (OWNER)，则没有任何使用限制
  if (!ws || ws.type === "PERSONAL" || ws.ownerId === userId) {
    return [];
  }

  // 2. 查询该成员在当前企业空间下的岗位列表
  const memberPosts = await prisma.postmember.findMany({
    where: { userId, workspaceId },
    select: { postId: true }
  });

  const postIds = memberPosts.map(p => p.postId);

  // 3. 兜底判定：如果成员在空间内还没有分配任何岗位，默认限制其访问算力消耗极高的核心敏感组件 "C01", "C02", "C03" 以防滥用
  if (postIds.length === 0) {
    return ["C01", "C02", "C03"];
  }

  // 4. 查询关联岗位的组件权限记录，收集 canView = false 或 canExecute = false 的组件
  const permissions = await prisma.componentpermission.findMany({
    where: {
      postId: { in: postIds }
    },
    select: {
      componentId: true,
      canView: true,
      canExecute: true
    }
  });

  const restrictedIds: string[] = [];
  permissions.forEach(p => {
    if (!p.canView || !p.canExecute) {
      restrictedIds.push(p.componentId);
    }
  });

  return Array.from(new Set(restrictedIds));
}

// POST - 执行组件相关操作
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    
    const body = await request.json();
    const { action, componentId, rating, comment, content, parentId, workspaceId, tokens } = body;

    // 模拟运行（扣减当前空间算力 Token）
    if (action === "simulate") {
      if (!workspaceId || !componentId) {
        return NextResponse.json({ 
          success: false, 
          error: "缺少必要的 workspaceId 或 componentId 参数" 
        }, { status: 400 });
      }

      // 企业空间权限验证 (安全防线)
      const restrictedIds = await getRestrictedComponentIds(workspaceId, userId);
      if (restrictedIds.includes(componentId)) {
        return NextResponse.json({
          success: false,
          error: "您当前的岗位在当前企业空间下无此组件的执行权限，请联系管理员"
        }, { status: 403 });
      }

      const deductTokens = tokens ? Number(tokens) : 5; // 默认扣减 5 个 Token

      // 获取或创建 Quota
      const quota = await getOrCreateQuota(workspaceId, userId);

      if (Number(quota.tokenBalance) < deductTokens) {
        return NextResponse.json({ 
          success: false, 
          error: "当前工作空间算力 Token 余额不足，请联系管理员充值" 
        });
      }

      // 扣减 Token 余额
      const updatedQuota = await prisma.workspacequota.update({
        where: { workspaceId },
        data: {
          tokenBalance: {
            decrement: BigInt(deductTokens)
          },
          updatedAt: new Date()
        }
      });

      // 更新组件统计
      await prisma.componentstats.upsert({
        where: { componentId },
        update: {
          totalUses: { increment: 1 },
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        },
        create: {
          id: crypto.randomUUID(),
          componentId,
          totalUses: 1,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      // 向 componenttask 写入一条状态为 COMPLETED 的运行审计日志任务，确保数据链路闭环
      await prisma.componenttask.create({
        data: {
          id: crypto.randomUUID(),
          name: `${componentId} 模拟调试运行`,
          description: `组件在工作空间中进行了模拟运行，消耗算力 ${deductTokens} 点`,
          type: "simulate",
          status: "COMPLETED",
          progress: 100,
          userId,
          tenantId: workspaceId,
          completedAt: new Date(),
          isPublished: false,
          icon: "Zap",
          updatedAt: new Date(),
        }
      });

      return NextResponse.json({ 
        success: true, 
        tokenBalance: Number(updatedQuota.tokenBalance) 
      });
    }

    // 绑定组件至工作空间
    if (action === "bind") {
      if (!workspaceId || !componentId) {
        return NextResponse.json({ 
          success: false, 
          error: "缺少必要的 workspaceId 或 componentId 参数" 
        }, { status: 400 });
      }

      // 企业空间权限验证 (安全防线)
      const restrictedIds = await getRestrictedComponentIds(workspaceId, userId);
      if (restrictedIds.includes(componentId)) {
        return NextResponse.json({
          success: false,
          error: "您当前的岗位在当前企业空间下无此组件的绑定权限，请联系管理员"
        }, { status: 403 });
      }

      // 在 componentusage 表中创建一条绑定状态记录
      await prisma.componentusage.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          componentId,
          workspaceId,
        },
      });

      // 写入空间操作审计日志
      await prisma.operationlog.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          workspaceId,
          action: "BIND_COMPONENT",
          resource: componentId,
          details: {
            componentId,
            boundAt: new Date(),
          },
        },
      });

      return NextResponse.json({ 
        success: true, 
        message: `组件已成功绑定到当前工作空间！` 
      });
    }

    // 收藏组件
    if (action === "favorite") {
      if (!componentId) {
        return NextResponse.json({ 
          success: false, 
          error: "缺少 componentId 参数" 
        }, { status: 400 });
      }

      await prisma.componentfavorite.upsert({
        where: {
          userId_componentId: {
            userId,
            componentId,
          },
        },
        update: {},
        create: {
          id: crypto.randomUUID(),
          userId,
          componentId,
        },
      });

      // 更新统计
      await prisma.componentstats.upsert({
        where: { componentId },
        update: {
          totalFavorites: { increment: 1 },
          updatedAt: new Date(),
        },
        create: {
          id: crypto.randomUUID(),
          componentId,
          totalFavorites: 1,
          updatedAt: new Date(),
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

      await prisma.componentfavorite.delete({
        where: {
          userId_componentId: {
            userId,
            componentId,
          },
        },
      }).catch(() => {
        // 如果存在则忽略
      });

      // 更新统计
      await prisma.componentstats.update({
        where: { componentId },
        data: {
          totalFavorites: { decrement: 1 },
          updatedAt: new Date(),
        },
      }).catch(() => {
        // 如果存在则忽略
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

      const targetWorkspaceId = workspaceId || body.workspaceId;
      if (targetWorkspaceId) {
        // 企业空间权限验证 (安全防线)
        const restrictedIds = await getRestrictedComponentIds(targetWorkspaceId, userId);
        if (restrictedIds.includes(componentId)) {
          return NextResponse.json({
            success: false,
            error: "您当前的岗位在当前企业空间下无此组件的使用权限，请联系管理员"
          }, { status: 403 });
        }
      }

      await prisma.componentusage.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          componentId,
          workspaceId: targetWorkspaceId,
        },
      });

      // 实时向 componenttask 表中创建一条真实的完成运行任务数据 (闭环流程)
      const compDef = await prisma.componenttask.findFirst({
        where: { id: componentId, isPublished: true }
      });
      
      await prisma.componenttask.create({
        data: {
          id: crypto.randomUUID(),
          name: compDef?.name || "能力组件运行",
          description: compDef?.description || "通过效能组件矩阵启动运行的任务",
          type: compDef?.type || "use",
          status: "completed",
          progress: 100,
          userId,
          completedAt: new Date(),
          isPublished: false,
          icon: compDef?.icon || "default",
          updatedAt: new Date(),
        }
      });

      // 更新统计
      await prisma.componentstats.upsert({
        where: { componentId },
        update: {
          totalUses: { increment: 1 },
          dailyUses: { increment: 1 },
          weeklyUses: { increment: 1 },
          monthlyUses: { increment: 1 },
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        },
        create: {
          id: crypto.randomUUID(),
          componentId,
          totalUses: 1,
          dailyUses: 1,
          weeklyUses: 1,
          monthlyUses: 1,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
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

      const existing = await prisma.componentrating.findUnique({
        where: {
          userId_componentId: {
            userId,
            componentId,
          },
        },
      });

      if (existing) {
        await prisma.componentrating.update({
          where: {
            userId_componentId: {
              userId,
              componentId,
            },
          },
          data: { 
            rating, 
            comment,
            updatedAt: new Date(),
          },
        });
      } else {
        await prisma.componentrating.create({
          data: {
            id: crypto.randomUUID(),
            userId,
            componentId,
            rating,
            comment,
            updatedAt: new Date(),
          },
        });
      }

      // 计算平均评分
      const allRatings = await prisma.componentrating.findMany({
        where: { componentId },
        select: { rating: true },
      });

      const avg = allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;

      await prisma.componentstats.upsert({
        where: { componentId },
        update: {
          averageRating: avg,
          ratingCount: allRatings.length,
          updatedAt: new Date(),
        },
        create: {
          id: crypto.randomUUID(),
          componentId,
          averageRating: avg,
          ratingCount: allRatings.length,
          updatedAt: new Date(),
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

      await prisma.componentreview.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          componentId,
          parentId: parentId || null,
          content,
          rating: rating || null,
          updatedAt: new Date(),
        },
      });

      // 更新统计
      try {
        await prisma.componentstats.update({
          where: { componentId },
          data: {
            reviewCount: { increment: 1 },
            updatedAt: new Date(),
          },
        });
      } catch {
        // 如果存在则创建
        await prisma.componentstats.create({
          data: {
            id: crypto.randomUUID(),
            componentId,
            reviewCount: 1,
            updatedAt: new Date(),
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
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action");
    const componentId = searchParams.get("componentId");
    const reviewId = searchParams.get("reviewId");

    // 隐藏评论
    if (action === "review" && reviewId) {
      await prisma.componentreview.update({
        where: { id: reviewId },
        data: { 
          status: "hidden",
          updatedAt: new Date(),
        },
      });

      return NextResponse.json({ success: true });
    }

    // 清空最近使用记录
    if (action === "clear-recent") {
      await prisma.componentusage.deleteMany({
        where: { userId },
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
