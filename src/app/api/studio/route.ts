export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jwtVerify } from "jose";
import { requireWorkspaceMembership } from "@/lib/security";
import { ensureDefaultComponents } from "@/lib/workspaceInit";

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
      
      // 执行兜底默认组件自愈初始化
      await ensureDefaultComponents(workspaceId, userId);

      const usages = await prisma.componentusage.findMany({
        where: { workspaceId },
        select: { componentId: true, metadata: true },
      });
      
      const boundIds = Array.from(new Set(usages.map(u => u.componentId)));

      // 提取启用状态映射，默认 enabled: true
      const states: Record<string, { enabled: boolean }> = {};
      usages.forEach(u => {
        let enabled = true;
        if (u.metadata) {
          try {
            const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : (u.metadata as any);
            if (meta && meta.enabled === false) {
              enabled = false;
            }
          } catch (e) {
            console.error("解析组件 metadata 失败:", e);
          }
        }
        states[u.componentId] = { enabled };
      });
      
      return NextResponse.json({
        success: true,
        data: boundIds,
        states
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

    // 获取用户最近使用的组件 (进行去重保证 React Key 唯一)
    if (action === "recent") {
      const recent = await prisma.componentusage.findMany({
        where: { userId },
        select: { componentId: true },
        orderBy: { usedAt: "desc" },
      });
      const uniqueIds = Array.from(new Set(recent.map(r => r.componentId))).slice(0, 10);
      return NextResponse.json({ 
        success: true, 
        data: uniqueIds
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

    // 获取指定工作空间下的任务日志
    if (action === "tasks") {
      const workspaceId = searchParams.get("workspaceId");
      if (!workspaceId) {
        return NextResponse.json({ 
          success: false, 
          error: "缺少 workspaceId 参数" 
        }, { status: 400 });
      }

      const isMember = await requireWorkspaceMembership(userId, workspaceId);
      if (!isMember) {
        return NextResponse.json({
          success: false,
          error: "越权警告：您不属于该工作空间，无权查看任务日志"
        }, { status: 403 });
      }

      const tasks = await prisma.componenttask.findMany({
        where: { tenantId: workspaceId },
        orderBy: { createdAt: "desc" },
        take: 10
      });

      const formattedTasks = tasks.map(t => ({
        ...t,
        config: t.config ? JSON.parse(JSON.stringify(t.config)) : null,
        result: t.result ? JSON.parse(JSON.stringify(t.result)) : null,
      }));

      return NextResponse.json({ success: true, data: formattedTasks });
    }

    // 获取指定工作空间下的文件资料
    if (action === "documents") {
      const workspaceId = searchParams.get("workspaceId");
      if (!workspaceId) {
        return NextResponse.json({ 
          success: false, 
          error: "缺少 workspaceId 参数" 
        }, { status: 400 });
      }

      const isMember = await requireWorkspaceMembership(userId, workspaceId);
      if (!isMember) {
        return NextResponse.json({
          success: false,
          error: "越权警告：您不属于该工作空间，无权查看文件资料"
        }, { status: 403 });
      }

      const documents = await prisma.document.findMany({
        where: { 
          workspaceId,
          status: "active" 
        },
        orderBy: { createdAt: "desc" }
      });

      return NextResponse.json({ success: true, data: documents });
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

      // 验证空间归属与使用权限
      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { type: true, ownerId: true }
      });
      if (!ws) {
        return NextResponse.json({ success: false, error: "工作空间不存在" }, { status: 400 });
      }

      const member = await prisma.workspacemember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } }
      });
      if (ws.ownerId !== userId && !member) {
        return NextResponse.json({ success: false, error: "越权警告：您不属于该工作空间，无组件运行权限" }, { status: 403 });
      }

      const { requireWorkspacePermission, writeAuditLog } = require("@/lib/security");
      const hasExecPermission = await requireWorkspacePermission(userId, workspaceId, "component:execute");
      if (!hasExecPermission) {
        return NextResponse.json({ success: false, error: "越权警告：您在当前空间下的岗位不支持此组件的执行" }, { status: 403 });
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

      // 从请求体结构化获取任务名称和材料等，写入真实任务历史
      const taskName = body.taskName;
      const inputMaterial = body.inputMaterial;
      const outputData = body.outputData;
      const taskStatus = body.status || "SUCCESS";

      // 记录真实的使用率日志
      await prisma.componentusage.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          componentId,
          workspaceId,
          usedAt: new Date()
        }
      });

      // 向 componenttask 写入一条状态为 taskStatus 的运行审计日志任务，确保数据链路闭环
      await prisma.componenttask.create({
        data: {
          id: crypto.randomUUID(),
          name: taskName || `${componentId} 运行任务`,
          description: `使用组件在工作空间中运行任务。输入材料：${inputMaterial || "未上传"}`,
          type: componentId, // 关联组件 ID，以作标识
          status: taskStatus,
          progress: taskStatus === "FAILED" ? 40 : 100,
          config: { inputMaterial, tokenCost: deductTokens },
          result: { outputData },
          userId,
          tenantId: workspaceId,
          completedAt: new Date(),
          isPublished: false,
          icon: "Zap",
          updatedAt: new Date(),
        }
      });

      // 写入高危审计日志
      await writeAuditLog(userId, "component:execute", { componentId, tokens: deductTokens }, workspaceId);

      return NextResponse.json({ 
        success: true, 
        tokenBalance: Number(updatedQuota.tokenBalance) 
      });
    }

    // 新增：上传文档/沉淀材料至知识库与原始文件库
    if (action === "upload_doc") {
      const { title, content, type } = body;
      if (!workspaceId || !title) {
        return NextResponse.json({ 
          success: false, 
          error: "缺少必要的 workspaceId 或 title 参数" 
        }, { status: 400 });
      }

      const doc = await prisma.document.create({
        data: {
          id: crypto.randomUUID(),
          workspaceId,
          title,
          content: content || "",
          type: type || "doc",
          status: "active",
          updatedAt: new Date()
        }
      });

      return NextResponse.json({ success: true, data: doc });
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
          metadata: { enabled: true },
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

    // 解绑组件从工作空间
    if (action === "unbind") {
      const fs = require("fs");
      const logFile = "d:\\Project Development\\ZhiGe-Dockyard\\zhige-dockyard-web\\unbind_debug.log";
      const debugLogs = [];
      debugLogs.push(`=== [DEBUG] API UNBIND AT ${new Date().toISOString()} ===`);
      debugLogs.push(`workspaceId: ${workspaceId}`);
      debugLogs.push(`componentId: ${componentId}`);

      if (!workspaceId || !componentId) {
        debugLogs.push("❌ unbind parameters missing");
        fs.appendFileSync(logFile, debugLogs.join("\n") + "\n\n");
        return NextResponse.json({ 
          success: false, 
          error: "缺少必要的 workspaceId 或 componentId 参数" 
        }, { status: 400 });
      }

      // 删除绑定记录
      const deleteResult = await prisma.componentusage.deleteMany({
        where: {
          workspaceId,
          componentId,
        },
      });
      
      // 同步物理删除当前工作空间下属于该组件的所有任务历史数据，做到彻底清除干净
      await prisma.componenttask.deleteMany({
        where: {
          tenantId: workspaceId,
          type: componentId,
        },
      });
      debugLogs.push(`Prisma deleteResult: ${JSON.stringify(deleteResult)}`);

      const remaining = await prisma.componentusage.findMany({
        where: { workspaceId, componentId }
      });
      debugLogs.push(`Remaining componentusages in DB count: ${remaining.length}`);
      debugLogs.push("=== [DEBUG] API UNBIND END ===");
      fs.appendFileSync(logFile, debugLogs.join("\n") + "\n\n");

      // 写入空间操作审计日志
      await prisma.operationlog.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          workspaceId,
          action: "UNBIND_COMPONENT",
          resource: componentId,
          details: {
            componentId,
            unboundAt: new Date(),
          },
        },
      });

      return NextResponse.json({ 
        success: true, 
        message: `组件已从当前工作空间成功解绑` 
      });
    }

    // 启用或禁用组件状态控制
    if (action === "toggle-active") {
      const { enabled } = body;
      if (!workspaceId || !componentId || typeof enabled !== "boolean") {
        return NextResponse.json({ 
          success: false, 
          error: "缺少必要的参数或参数格式错误" 
        }, { status: 400 });
      }

      // 企业空间权限验证 (安全防线)
      const restrictedIds = await getRestrictedComponentIds(workspaceId, userId);
      if (restrictedIds.includes(componentId)) {
        return NextResponse.json({
          success: false,
          error: "您当前的岗位在当前企业空间下无此组件的状态修改权限，请联系管理员"
        }, { status: 403 });
      }

      // 检查绑定关系是否存在
      const usage = await prisma.componentusage.findFirst({
        where: { workspaceId, componentId }
      });

      if (!usage) {
        return NextResponse.json({
          success: false,
          error: "该组件在此空间中尚未装配载入，无法修改状态"
        }, { status: 400 });
      }

      // 更新启用禁用状态到 metadata
      await prisma.componentusage.updateMany({
        where: { workspaceId, componentId },
        data: {
          metadata: { enabled }
        }
      });

      // 写入审计日志
      await prisma.operationlog.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          workspaceId,
          action: enabled ? "ENABLE_COMPONENT" : "DISABLE_COMPONENT",
          resource: componentId,
          details: {
            componentId,
            updatedAt: new Date(),
          },
        },
      });

      return NextResponse.json({ 
        success: true, 
        message: enabled ? "组件已成功启用" : "组件已成功禁用" 
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

    // 删除单条最近使用记录
    if (action === "remove-recent" && componentId) {
      await prisma.componentusage.deleteMany({
        where: { 
          userId,
          componentId,
        },
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
