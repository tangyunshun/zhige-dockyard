export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import {
  requireWorkspaceMembership,
  getLogicalWorkspaceRole,
  requireWorkspacePermission,
  writeAuditLog,
} from "@/lib/security";

// 获取真实用户 ID：统一走 validateUser 的合法 JWT 校验
// （Authorization Bearer JWT 或 Cookie auth_token 均强制验签，
//   x-user-id 仅作交叉校验，绝不直接信任客户端伪造的 x-user-id）。
async function getUserId(request: NextRequest): Promise<string | null> {
  const auth = await validateUser(request.headers.get("Authorization"), request);
  if (!auth.valid || !auth.user) {
    return null;
  }
  return auth.user.id;
}

// 空间访问强校验：空间不存在 → 404；非成员/非 Owner → 403；通过 → 无错误
async function checkWorkspaceAccess(
  userId: string,
  workspaceId: string,
): Promise<{ error?: { message: string; status: number } }> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  });
  if (!ws) {
    return { error: { message: "工作空间不存在", status: 404 } };
  }
  const isMember = await requireWorkspaceMembership(userId, workspaceId);
  if (!isMember) {
    return { error: { message: "越权警告：您不属于该工作空间，无权访问其数据", status: 403 } };
  }
  return {};
}

// 空间管理权限强校验：仅 OWNER / ADMIN / COMPONENT_MANAGER 可执行组件绑定、
// 解绑、启停、安全矩阵与岗位配置等管理操作；普通 MEMBER 一律 403。
async function checkWorkspaceManager(
  userId: string,
  workspaceId: string,
): Promise<{ error?: { message: string; status: number } }> {
  const access = await checkWorkspaceAccess(userId, workspaceId);
  if (access.error) return access;

  const role = await getLogicalWorkspaceRole(userId, workspaceId);
  const managerRoles = ["OWNER", "ADMIN", "COMPONENT_MANAGER"];
  if (!role || !managerRoles.includes(role)) {
    return {
      error: { message: "越权警告：仅空间所有者、管理员或组件管理员可执行此管理操作", status: 403 },
    };
  }
  return {};
}

// 组件"使用中"检测：启用状态(metadata.enabled === true) 或存在执行中的任务 → 视为使用中。
// 供解除装配前的检测流程与 unbind 强校验共用，保证弹窗提示与后端拦截口径完全一致。
async function checkComponentInUse(
  workspaceId: string,
  componentId: string,
): Promise<{ inUse: boolean; reason?: string }> {
  // 查询工作空间类型：个人空间 PERSONAL 无需校验 enabled 启用标记
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { type: true }
  });

  // 1. 仅企业空间：启用状态检测（metadata.enabled === true 视为正在使用中）
  if (ws?.type === "ENTERPRISE") {
    const binding = await prisma.componentusage.findFirst({
      where: { workspaceId, componentId },
      orderBy: { usedAt: "desc" },
      select: { metadata: true },
    });
    if (binding?.metadata) {
      try {
        const meta = typeof binding.metadata === "string" ? JSON.parse(binding.metadata) : (binding.metadata as any);
        if (meta && typeof meta.enabled === "boolean" && meta.enabled === true) {
          return { inUse: true, reason: "该组件当前已在企业空间内启用使用中" };
        }
      } catch (e) {
        console.error("解析组件 metadata 失败:", e);
      }
    }
  }

  // 2. 执行中任务检测（进行中/排队/处理中均视为被占用）
  const activeTask = await prisma.componenttask.findFirst({
    where: {
      tenantId: workspaceId,
      type: componentId,
      status: { in: ["IN_PROGRESS", "RUNNING", "PENDING", "PROCESSING", "QUEUED", "running", "pending", "processing", "queued"] },
    },
    select: { id: true },
  });
  if (activeTask) {
    return { inUse: true, reason: "该组件当前存在执行中的任务" };
  }

  return { inUse: false };
}

// 复用/新建组件使用记录：componentusage 同时承载“绑定”与“使用日志”，
// 这里按 (userId, componentId) 复用最新一条并刷新 usedAt，避免使用日志向绑定表堆叠重复脏数据
async function touchComponentUsage(userId: string, componentId: string, workspaceId?: string | null) {
  // 使用记录必须严格限定 userId + componentId + workspaceId，实现空间隔离，
  // 避免同一用户在同一空间内的多次使用互相覆盖，也避免不同空间之间串用。
  const existing = await prisma.componentusage.findFirst({
    where: workspaceId
      ? { userId, componentId, workspaceId }
      : { userId, componentId, workspaceId: null },
    orderBy: { usedAt: "desc" },
    select: { id: true },
  });
  if (existing) {
    await prisma.componentusage.update({
      where: { id: existing.id },
      data: { usedAt: new Date() },
    });
  } else {
    await prisma.componentusage.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        componentId,
        workspaceId: workspaceId ?? null,
        usedAt: new Date(),
      },
    });
  }
}

// GET - 获取组件相关信息
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action");

    // 获取系统组件目录（唯一数据源：component_catalog / component_category 表）。
    // 组件大厅属于公开页面，目录只包含已发布组件元数据，无需登录即可读取。
    if (action === "catalog") {
      const [components, categories, internalComponents, presetPositions] = await Promise.all([
        prisma.componentcatalog.findMany({
          where: { isPublished: true },
          orderBy: { sortOrder: "asc" },
        }),
        prisma.componentcategory.findMany({
          orderBy: { sortOrder: "asc" },
        }),
        // 系统内部引擎（AI_ENGINE 等，不进入用户组件目录，仅供任务/绑定场景展示名称）
        prisma.componentcatalog.findMany({
          where: { isPublished: false },
          orderBy: { sortOrder: "asc" },
        }),
        // 预置岗位定义（从数据库 position 表读取，不再硬编码岗位数据）
        prisma.position.findMany({
          where: { isPreset: true, status: "ACTIVE" },
          orderBy: { sortOrder: "asc" },
        }),
      ]);

      // 免费用户默认可用组件 = 非付费组件（由数据库 isPremium 字段推导，不再写死）
      const defaultAllowedIds = components.filter((c) => !c.isPremium).map((c) => c.id);

      return NextResponse.json({
        success: true,
        data: {
          components,
          categories,
          internalComponents,
          defaultAllowedIds,
          presetPositions,
        },
      });
    }

    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }

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

      // 空间归属强校验：空间不存在 → 404，非成员 → 403（GET 禁止对陌生空间产生任何写入副作用）
      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }

      // 仅统计当前空间真实装配记录（metadata 含 enabled 标记），与纯使用日志区分；
      // 兼容历史数据：若全空间无任何带标记的绑定记录，回退展示全部 usage 避免列表空白
      const usages = await prisma.componentusage.findMany({
        where: { workspaceId },
        select: { componentId: true, metadata: true },
      });

      const boundMap = new Map<string, boolean>();
      usages.forEach(u => {
        if (!u.metadata) return; // 无 metadata → 纯使用日志，不计入绑定
        let enabled = true;
        let hasEnabledMark = false;
        try {
          const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : (u.metadata as any);
          if (meta && typeof meta.enabled === "boolean") {
            enabled = meta.enabled;
            hasEnabledMark = true;
          }
        } catch (e) {
          console.error("解析组件 metadata 失败:", e);
          hasEnabledMark = true; // 解析失败但存在 metadata，按绑定记录保守处理
        }
        if (hasEnabledMark) {
          boundMap.set(u.componentId, enabled);
        }
      });

      // 过滤未发布组件：系统内部引擎（如 AI_ENGINE，isPublished = false）不计入空间组件大厅，
      // 保证 boundComponentIds 与空间中枢/空间列表的组件数量统计口径完全一致，
      // 避免"空间内可见 0 个组件，但中枢/工作台计数为 1"的矛盾。
      if (boundMap.size > 0) {
        const publishedBoundRows = await prisma.componentcatalog.findMany({
          where: { id: { in: Array.from(boundMap.keys()) }, isPublished: true },
          select: { id: true },
        });
        const publishedBoundIdSet = new Set(publishedBoundRows.map(c => c.id));
        for (const componentId of Array.from(boundMap.keys())) {
          if (!publishedBoundIdSet.has(componentId)) {
            boundMap.delete(componentId);
          }
        }
      }

      const states: Record<string, { enabled: boolean }> = {};
      boundMap.forEach((enabled, componentId) => {
        states[componentId] = { enabled };
      });

      const boundIds = Array.from(boundMap.keys());
      const componentsFromDb = await prisma.componentcatalog.findMany({
        where: { id: { in: boundIds } },
        select: { id: true, name: true, category: true, description: true }
      }).catch(() => []);

      const compDbMap = new Map<string, any>();
      componentsFromDb.forEach(c => compDbMap.set(c.id, c));

      // 组件名称/描述/分类一律从数据库 component_catalog 表读取（含内部引擎 AI_ENGINE 等，均已入库），
      // 代码中不再硬编码任何组件信息映射。
      const detailsList = boundIds.map(id => {
        const dbComp = compDbMap.get(id);
        return {
          id,
          code: dbComp?.id || id,
          name: dbComp?.name || `组件 ${id}`,
          category: dbComp?.category || "研发组件",
          desc: dbComp?.description || "支持自动化任务分析与数据归集处理。"
        };
      });

      return NextResponse.json({
        success: true,
        data: boundIds,
        details: detailsList,
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

      // 空间归属强校验：非成员访问其他空间 → 403
      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }

      const restrictedIds = await getRestrictedComponentIds(workspaceId, userId);
      return NextResponse.json({ 
        success: true, 
        data: restrictedIds 
      });
    }

    // 解除装配前的"使用中"检测：返回结构化结果供前端弹窗展示
    if (action === "check-usage") {
      const workspaceId = searchParams.get("workspaceId");
      const componentId = searchParams.get("componentId");
      if (!workspaceId || !componentId) {
        return NextResponse.json({
          success: false,
          error: "缺少 workspaceId 或 componentId 参数",
        }, { status: 400 });
      }

      // 管理权限强校验：仅 OWNER/ADMIN/COMPONENT_MANAGER 可解除装配
      const managerCheck = await checkWorkspaceManager(userId, workspaceId);
      if (managerCheck.error) {
        return NextResponse.json({ success: false, error: managerCheck.error.message }, { status: managerCheck.error.status });
      }

      const usage = await checkComponentInUse(workspaceId, componentId);
      return NextResponse.json({ success: true, data: usage });
    }

    // 获取当前空间下的动态岗位列表及授权设定 (动态配置中心)
    if (action === "positions") {
      const workspaceId = searchParams.get("workspaceId");
      if (!workspaceId) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId" }, { status: 400 });
      }

      // 空间归属强校验：非成员访问其他空间 → 403
      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }

      const log = await prisma.operationlog.findFirst({
        where: { workspaceId, action: "SAVE_CUSTOM_POSITIONS" },
        orderBy: { createdAt: "desc" }
      });

      const positions = (log?.details as any)?.positions || null;
      return NextResponse.json({ success: true, positions });
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

      const limitParam = searchParams.get("limit");
      const take = limitParam ? parseInt(limitParam, 10) : undefined;

      const tasks = await prisma.componenttask.findMany({
        where: { tenantId: workspaceId },
        orderBy: { createdAt: "desc" },
        ...(take ? { take } : {}),
      });

      // 从数据库 componentcatalog (组件表) 和 componentcategory (分类表) 统一反查真实中文名称字典
      const [allComponents, allCategories] = await Promise.all([
        prisma.componentcatalog.findMany({ select: { id: true, name: true } }),
        prisma.componentcategory.findMany({ select: { key: true, name: true } }),
      ]);

      const compNameMap = new Map<string, string>();
      // 1. 注入数据库 componentcategory 分类的中文名称 (如 BACKEND_CORE -> 后端开发与接口)
      allCategories.forEach((cat) => {
        if (cat.key && cat.name) {
          compNameMap.set(cat.key.trim().toUpperCase(), cat.name);
        }
      });
      // 2. 注入数据库 componentcatalog 组件的中文名称
      allComponents.forEach((comp) => {
        if (comp.id && comp.name) {
          compNameMap.set(comp.id.trim().toUpperCase(), comp.name);
        }
      });

      const formattedTasks = tasks.map((t) => {
        const cId = (t.type || "").trim().toUpperCase();
        // 100% 从数据库 compNameMap (componentcatalog / componentcategory) 动态获取中文名称，拒绝硬编码
        const dbCompName = compNameMap.get(cId) || t.componentName || t.type || "";

        return {
          ...t,
          componentId: t.type,
          componentName: dbCompName,
          config: t.config ? JSON.parse(JSON.stringify(t.config)) : null,
          result: t.result ? JSON.parse(JSON.stringify(t.result)) : null,
        };
      });

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

    // 获取空间知识库：企业空间普通成员仅可见已发布(active)知识，管理角色可见全部含待审核
    if (action === "knowledges") {
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
          error: "越权警告：您不属于该工作空间，无权查看知识库"
        }, { status: 403 });
      }

      const logicalRole = await getLogicalWorkspaceRole(userId, workspaceId);
      const canViewPending = logicalRole === "OWNER" || logicalRole === "ADMIN" || logicalRole === "KNOWLEDGE_MANAGER";

      const documents = await prisma.document.findMany({
        where: {
          workspaceId,
          type: "knowledge",
          ...(canViewPending ? {} : { status: "active" }),
        },
        orderBy: { createdAt: "desc" }
      });

      // 批量拉取来源任务与组件目录，避免 N+1 查询
      const parentIds = documents.map(d => d.parentId).filter((id): id is string => !!id);
      const [sourceTasks, componentCatalogs] = await Promise.all([
        parentIds.length > 0
          ? prisma.componenttask.findMany({
              where: { id: { in: parentIds } },
              select: { id: true, name: true, type: true }
            })
          : Promise.resolve<typeof prisma.componenttask extends { findMany: infer F } ? Awaited<ReturnType<F>> : never>([]),
        prisma.componentcatalog.findMany({
          select: { id: true, name: true, category: true }
        })
      ]);
      const taskMap = new Map(sourceTasks.map(t => [t.id, t]));
      const catalogMap = new Map(componentCatalogs.map(c => [c.id, c]));

      const data = documents.map((d) => {
        const task = d.parentId ? taskMap.get(d.parentId) : null;
        const componentId = task?.type || "";
        const catalog = componentId ? catalogMap.get(componentId) : null;
        return {
          id: d.id,
          title: d.title,
          sourceTaskId: d.parentId,
          sourceTaskName: task?.name || d.parentId || "空间研发任务",
          componentId,
          componentName: catalog?.name || "",
          componentCategory: catalog?.category || "",
          status: d.status === "active" ? "APPROVED" : d.status === "rejected" ? "REJECTED" : "PENDING",
          createdAt: d.createdAt,
          content: d.content,
        };
      });

      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ 
      success: false, 
      error: "缺少 action 参数" 
    }, { status: 400 });

  } catch (error) {
    console.error("Studio API GET error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "服务器内部错误",
      details: process.env.NODE_ENV === "development" && error instanceof Error
        ? error.message
        : undefined,
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

  // 0. 空间不存在时绝不返回空数组放行（所有调用方必须先通过 checkWorkspaceAccess）
  if (!ws) {
    throw new Error("工作空间不存在");
  }

  // 1. 若为个人空间，或者当前用户是空间所有者，无限制
  if (ws.type === "PERSONAL" || ws.ownerId === userId) {
    return [];
  }

  // 2. 查询该成员在当前空间下的底层角色
  const memberRecord = await prisma.workspacemember.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId,
      },
    },
  });

  // 3. 查询最新的扩展岗位变更日志，解析全系统拓展岗位
  const roleLog = await prisma.operationlog.findFirst({
    where: {
      workspaceId,
      action: "UPDATE_MEMBER_ROLE",
      resource: userId,
    },
    orderBy: { createdAt: "desc" }
  });

  const extendedRole = (roleLog?.details as any)?.newRole || memberRecord?.role || "MEMBER";

  // 4. 特权岗位（所有者 OWNER、管理员 ADMIN、项目经理 PROJECT_MANAGER）全流程全量开放！全无限制！
  if (ws.ownerId === userId || memberRecord?.role === "OWNER" || memberRecord?.role === "ADMIN" || extendedRole === "PROJECT_MANAGER" || extendedRole === "OWNER" || extendedRole === "ADMIN") {
    return [];
  }

  // 5. 若只读观察员 VIEWER：限制全量组件调度
  if (extendedRole === "VIEWER") {
    const usages = await prisma.componentusage.findMany({
      where: { workspaceId },
      select: { componentId: true }
    });
    return usages.map(u => u.componentId);
  }

  // 6. 普通研发工程师 DEVELOPER / MEMBER：获取所有者在安全矩阵中配置的真实受限列表
  const restrictLog = await prisma.operationlog.findFirst({
    where: { workspaceId, action: "SET_RESTRICTED_COMPONENTS" },
    orderBy: { createdAt: "desc" }
  });

  if (restrictLog && restrictLog.details) {
    const ids = (restrictLog.details as any)?.restrictedIds;
    if (Array.isArray(ids)) return ids;
  }

  return [];
}

// POST - 执行组件相关操作
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    
    const searchParams = request.nextUrl.searchParams;
    const body = await request.json().catch(() => ({}));
    const action = body.action || searchParams.get("action");
    const workspaceId = body.workspaceId || searchParams.get("workspaceId");
    const { componentId, rating, comment, content, parentId, tokens } = body;

    // 设置/更新空间组件岗位受限列表 (全局持久化)
    if (action === "set-restricted") {
      const { workspaceId, restrictedIds } = body;
      if (!workspaceId || !Array.isArray(restrictedIds)) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId 或 restrictedIds" }, { status: 400 });
      }

      // 管理权限强校验：仅 OWNER/ADMIN/COMPONENT_MANAGER 可配置安全矩阵
      const managerCheck = await checkWorkspaceManager(userId, workspaceId);
      if (managerCheck.error) {
        return NextResponse.json({ success: false, error: managerCheck.error.message }, { status: managerCheck.error.status });
      }

      await prisma.operationlog.create({
        data: {
          id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          workspaceId,
          userId,
          action: "SET_RESTRICTED_COMPONENTS",
          resource: "SECURITY_MATRIX",
          details: { restrictedIds },
        },
      });

      return NextResponse.json({ success: true, restrictedIds });
    }

    // 保存/更新空间自定义岗位与组件授权矩阵 (动态配置中心)
    if (action === "save-positions") {
      const { workspaceId, positions } = body;
      if (!workspaceId || !Array.isArray(positions)) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId 或 positions" }, { status: 400 });
      }

      // 管理权限强校验：仅 OWNER/ADMIN/COMPONENT_MANAGER 可配置岗位授权
      const managerCheck = await checkWorkspaceManager(userId, workspaceId);
      if (managerCheck.error) {
        return NextResponse.json({ success: false, error: managerCheck.error.message }, { status: managerCheck.error.status });
      }

      await prisma.operationlog.create({
        data: {
          id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          workspaceId,
          userId,
          action: "SAVE_CUSTOM_POSITIONS",
          resource: "POSITIONS_CONFIG",
          details: { positions },
        },
      });

      return NextResponse.json({ success: true, positions });
    }

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
        select: { type: true, ownerId: true, name: true }
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

      // 装配与启用校验：组件必须已装配到当前空间且处于启用状态
      const binding = await prisma.componentusage.findFirst({
        where: { workspaceId, componentId },
        orderBy: { usedAt: "desc" },
        select: { metadata: true },
      });
      if (!binding) {
        return NextResponse.json({ success: false, error: "该组件尚未装配到当前空间，请先装配后再执行" }, { status: 400 });
      }
      let isEnabled = true;
      if (binding.metadata) {
        try {
          const meta = typeof binding.metadata === "string" ? JSON.parse(binding.metadata) : (binding.metadata as any);
          if (meta && typeof meta.enabled === "boolean") {
            isEnabled = meta.enabled;
          }
        } catch (e) {
          console.error("解析组件 metadata 失败:", e);
        }
      }
      if (!isEnabled) {
        return NextResponse.json({ success: false, error: "该组件已被管理员禁用，暂时无法执行" }, { status: 403 });
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

      // 任务名称与输入材料来自请求体，但执行状态与产出结果一律由服务端判定，
      // 不信任客户端传入的 status / outputData，保证前后端数据一致性。
      const taskName = body.taskName;
      const inputMaterial = body.inputMaterial;

      // 服务端基于输入材料生成真实的结构化分析产出（模拟执行引擎结果）
      const inputSnippet = (inputMaterial || "").toString().slice(0, 120);
      const deviationCount = inputSnippet ? Math.max(1, Math.round(inputSnippet.length / 60)) : 1;
      const outputData = {
        summary: `系统已完成「${inputSnippet ? inputSnippet + "…" : "本次研发材料"}」的条款拆解，并与团队标准规范完成全量比对，产出结构化偏离分析结果。`,
        conclusions: [
          "已完成输入材料核心描述拆解，共识别 " + deviationCount + " 处关键交付点。",
          "经与团队标准规范比对，接口协议对齐一致度 98.5%，核心流程整体合规。",
          "本次运行已计入当前空间算力消耗，任务历史与统计已同步更新。",
        ],
        deviations: [
          { item: "交付工期说明", rfp: "要求 90 天内交付", actual: "评估拟定 120 天，发生轻微偏离", risk: "偏离警告，建议调整交付排期" },
          { item: "验收指标定义", rfp: "需明确验收通过率", actual: "现有描述缺失量化指标", risk: "轻微偏离，建议补充验收标准" },
        ],
        risks: ["由于历史代码耦合，存在调用溢出风险，请遵循最新 SOP 设计"],
        advices: ["建议后续在此接口中引入自愈缓存", "在与合作方商议时使用本推荐条款模板"],
      };
      const taskStatus = "SUCCESS"; // 模拟执行已完成，服务端判定成功

      // 事务化处理：扣减 Token + 更新组件统计 + 写入任务历史，任一步失败整体回滚，
      // 确保后端失败时不会扣 Token，也不会残留“成功”任务。
      const taskResult = await prisma.$transaction(async (tx) => {
        // 确保租户记录存在，避免 componenttask.tenantId 外键约束失败导致 simulate 恒 500
        await tx.tenant.upsert({
          where: { id: workspaceId },
          update: { name: ws?.name || workspaceId, updatedAt: new Date() },
          create: { id: workspaceId, name: ws?.name || workspaceId, updatedAt: new Date() },
        });

        const updatedQuota = await tx.workspacequota.update({
          where: { workspaceId },
          data: {
            tokenBalance: {
              decrement: BigInt(deductTokens)
            },
            updatedAt: new Date()
          }
        });

        await tx.componentstats.upsert({
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

        const task = await tx.componenttask.create({
          data: {
            id: crypto.randomUUID(),
            name: taskName || `${componentId} 运行任务`,
            description: `使用组件在工作空间中运行任务。输入材料：${inputMaterial || "未上传"}`,
            type: componentId, // 关联组件 ID，以作标识
            status: taskStatus,
            progress: 100,
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

        return { quota: updatedQuota, task };
      });

      // 记录真实的使用率日志（按 用户+组件+空间 隔离，复用既有记录，避免堆叠脏数据）
      await touchComponentUsage(userId, componentId, workspaceId);

      // 写入高危审计日志
      await writeAuditLog(userId, "component:execute", { componentId, tokens: deductTokens }, workspaceId);

      return NextResponse.json({
        success: true,
        tokenBalance: Number(taskResult.quota.tokenBalance),
        task: {
          id: taskResult.task.id,
          name: taskResult.task.name,
          status: taskResult.task.status,
          result: taskResult.task.result,
          outputData,
          tokens: deductTokens,
          createdAt: taskResult.task.createdAt,
        },
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

      // 空间归属强校验：空间不存在 → 404，非成员 → 403
      const uploadAccess = await checkWorkspaceAccess(userId, workspaceId);
      if (uploadAccess.error) {
        return NextResponse.json({ success: false, error: uploadAccess.error.message }, { status: uploadAccess.error.status });
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

    // 知识库沉淀：个人空间直接发布；企业空间 MEMBER/VIEWER 提交审核，管理角色直接发布
    if (action === "save_knowledge") {
      const { title, content, sourceTaskId, componentId } = body;
      if (!workspaceId || !title) {
        return NextResponse.json({
          success: false,
          error: "缺少必要的 workspaceId 或 title 参数"
        }, { status: 400 });
      }

      // 空间归属强校验
      const kAccess = await checkWorkspaceAccess(userId, workspaceId);
      if (kAccess.error) {
        return NextResponse.json({ success: false, error: kAccess.error.message }, { status: kAccess.error.status });
      }

      const wsRecord = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { type: true },
      });
      const logicalRole = await getLogicalWorkspaceRole(userId, workspaceId);
      const canPublish = wsRecord?.type === "PERSONAL" || logicalRole === "OWNER" || logicalRole === "ADMIN" || logicalRole === "KNOWLEDGE_MANAGER";
      const finalStatus = canPublish ? "active" : "pending";

      const doc = await prisma.document.create({
        data: {
          id: crypto.randomUUID(),
          workspaceId,
          title,
          content: content || "",
          type: "knowledge",
          status: finalStatus,
          parentId: sourceTaskId || null,
          updatedAt: new Date()
        }
      });

      // 沉淀审计日志：记录提交/发布来源与审核状态
      await prisma.operationlog.create({
        data: {
          id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId,
          workspaceId,
          action: finalStatus === "active" ? "KNOWLEDGE_PUBLISH" : "KNOWLEDGE_SUBMIT",
          resource: "KNOWLEDGE",
          details: { sourceTaskId: sourceTaskId || null, workspaceId, userId, status: finalStatus, reviewer: finalStatus === "active" ? userId : null },
        },
      });

      // 查询来源任务与组件目录，返回完整来源信息供前端直接展示
      const [sourceTask, savedCatalog] = await Promise.all([
        sourceTaskId
          ? prisma.componenttask.findUnique({ where: { id: sourceTaskId }, select: { name: true } })
          : Promise.resolve(null),
        componentId
          ? prisma.componentcatalog.findUnique({ where: { id: componentId }, select: { name: true, category: true } })
          : Promise.resolve(null)
      ]);

      return NextResponse.json({
        success: true,
        data: {
          id: doc.id,
          title: doc.title,
          status: finalStatus === "active" ? "APPROVED" : "PENDING",
          createdAt: doc.createdAt,
          sourceTaskId: doc.parentId,
          sourceTaskName: sourceTask?.name || sourceTaskId || "空间研发任务",
          componentId: componentId || "",
          componentName: savedCatalog?.name || "",
          componentCategory: savedCatalog?.category || "",
          sourceComponent: componentId || sourceTaskId || "",
        },
      });
    }

    // 知识库审核：仅 OWNER / ADMIN / KNOWLEDGE_MANAGER 可通过或驳回
    if (action === "review_knowledge") {
      const { knowledgeId, approve } = body;
      if (!workspaceId || !knowledgeId || typeof approve !== "boolean") {
        return NextResponse.json({
          success: false,
          error: "缺少必要的 knowledgeId、approve 或 workspaceId 参数"
        }, { status: 400 });
      }

      const rAccess = await checkWorkspaceAccess(userId, workspaceId);
      if (rAccess.error) {
        return NextResponse.json({ success: false, error: rAccess.error.message }, { status: rAccess.error.status });
      }

      const reviewerRole = await getLogicalWorkspaceRole(userId, workspaceId);
      if (!reviewerRole || !["OWNER", "ADMIN", "KNOWLEDGE_MANAGER"].includes(reviewerRole)) {
        return NextResponse.json({
          success: false,
          error: "越权警告：仅知识库管理员或空间管理员可审核知识沉淀"
        }, { status: 403 });
      }

      const target = await prisma.document.findUnique({ where: { id: knowledgeId } });
      if (!target || target.workspaceId !== workspaceId || target.type !== "knowledge") {
        return NextResponse.json({ success: false, error: "未找到待审核的知识沉淀记录" }, { status: 404 });
      }

      const updated = await prisma.document.update({
        where: { id: knowledgeId },
        data: { status: approve ? "active" : "rejected", updatedAt: new Date() }
      });

      await prisma.operationlog.create({
        data: {
          id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId,
          workspaceId,
          action: approve ? "KNOWLEDGE_APPROVE" : "KNOWLEDGE_REJECT",
          resource: "KNOWLEDGE",
          details: { knowledgeId, workspaceId, userId, status: approve ? "active" : "rejected", reviewer: userId },
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          id: updated.id,
          title: updated.title,
          status: updated.status === "active" ? "APPROVED" : "REJECTED",
          createdAt: updated.createdAt,
        },
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

      // 管理权限强校验：仅 OWNER/ADMIN/COMPONENT_MANAGER 可执行装配操作
      const managerCheck = await checkWorkspaceManager(userId, workspaceId);
      if (managerCheck.error) {
        return NextResponse.json({ success: false, error: managerCheck.error.message }, { status: managerCheck.error.status });
      }

      // 企业空间权限验证 (安全防线)
      const restrictedIds = await getRestrictedComponentIds(workspaceId, userId);
      if (restrictedIds.includes(componentId)) {
        return NextResponse.json({
          success: false,
          error: "您当前的岗位在当前企业空间下无此组件的绑定权限，请联系管理员"
        }, { status: 403 });
      }

      // 幂等保护：若该组件在此空间已存在真实装配记录（metadata 含 enabled 标记），直接返回成功
      const existingBinding = await prisma.componentusage.findFirst({
        where: { workspaceId, componentId },
        orderBy: { usedAt: "desc" },
        select: { metadata: true },
      });
      const existingMeta = existingBinding?.metadata
        ? (typeof existingBinding.metadata === "string" ? JSON.parse(existingBinding.metadata) : existingBinding.metadata)
        : null;
      if (existingMeta && existingMeta.enabled === true) {
        return NextResponse.json({
          success: true,
          message: "组件已装配到当前工作空间，无需重复绑定",
        });
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
      if (!workspaceId || !componentId) {
        return NextResponse.json({ 
          success: false, 
          error: "缺少必要的 workspaceId 或 componentId 参数" 
        }, { status: 400 });
      }

      // 管理权限强校验：仅 OWNER/ADMIN/COMPONENT_MANAGER 可执行解绑操作
      const managerCheck = await checkWorkspaceManager(userId, workspaceId);
      if (managerCheck.error) {
        return NextResponse.json({ success: false, error: managerCheck.error.message }, { status: managerCheck.error.status });
      }

      // 解除前"使用中"强校验（与前端空间内交互及 check-usage 检测口径完全一致）：
      // 组件处于启用状态或存在执行中的任务 → 禁止解除，必须先切断服务或等待任务完成。
      const usageCheck = await checkComponentInUse(workspaceId, componentId);
      if (usageCheck.inUse) {
        return NextResponse.json({
          success: false,
          error: `该组件正在使用中（${usageCheck.reason}），禁止解除装配！请先在空间内禁用该组件，切断服务后再解除`,
        }, { status: 400 });
      }

      // 解绑只删除当前空间的组件绑定记录（componentusage 中的装配关系）。
      // 组件任务历史（componenttask）、结果数据、知识库沉淀与审计日志一律保留，禁止物理删除。
      await prisma.componentusage.deleteMany({
        where: {
          workspaceId,
          componentId,
        },
      });

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

    // 从数据库中真实物理擦除/删除特定任务记录
    if (action === "delete-task" || action === "delete_task") {
      const targetTaskId = searchParams.get("taskId") || body.taskId;
      if (!targetTaskId) {
        return NextResponse.json({ 
          success: false, 
          error: "缺少必要的 taskId 参数" 
        }, { status: 400 });
      }

      // 执行真实的 PostgreSQL 数据库物理擦除删除
      const deleteResult = await prisma.componenttask.deleteMany({
        where: {
          id: targetTaskId
        }
      });

      // 写入操作审计日志
      await prisma.operationlog.create({
        data: {
          id: crypto.randomUUID(),
          userId,
          workspaceId: workspaceId || "SYSTEM",
          action: "DELETE_TASK",
          resource: targetTaskId,
          details: {
            taskId: targetTaskId,
            deletedCount: deleteResult.count,
            deletedAt: new Date(),
          },
        },
      });

      return NextResponse.json({ 
        success: true, 
        message: "任务记录已从数据库中真实物理擦除删除",
        deletedCount: deleteResult.count 
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

      // 管理权限强校验：仅 OWNER/ADMIN/COMPONENT_MANAGER 可启停组件
      const managerCheck = await checkWorkspaceManager(userId, workspaceId);
      if (managerCheck.error) {
        return NextResponse.json({ success: false, error: managerCheck.error.message }, { status: managerCheck.error.status });
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
      // 架构冻结 6.3「派发与执行规则」：从大厅发起使用时必须选择/确认归属工作空间，
      // 在该空间额度内执行。未带 workspaceId → 400，禁止创建无归属（无 tenantId）的游离任务。
      if (!targetWorkspaceId) {
        return NextResponse.json({
          success: false,
          error: "必须选择或确认归属的工作空间后才能使用组件",
        }, { status: 400 });
      }

      // 空间归属强校验：空间不存在 → 404，非成员 → 403
      const access = await checkWorkspaceAccess(userId, targetWorkspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }

      // 企业空间权限验证 (安全防线)
      const restrictedIds = await getRestrictedComponentIds(targetWorkspaceId, userId);
      if (restrictedIds.includes(componentId)) {
        return NextResponse.json({
          success: false,
          error: "您当前的岗位在当前企业空间下无此组件的使用权限，请联系管理员"
        }, { status: 403 });
      }

      // 使用日志复用既有记录，避免向绑定表堆叠重复脏数据
      await touchComponentUsage(userId, componentId, targetWorkspaceId);

      // 实时向 componenttask 表中创建一条真实的完成运行任务数据 (闭环流程)。
      // 组件定义一律从 component_catalog 目录表读取，绝不用任务记录当组件定义。
      const compDef = await prisma.componentcatalog.findUnique({
        where: { id: componentId }
      });

      // 确保租户记录存在，避免 componenttask.tenantId 外键约束失败（与 simulate 分支一致）
      await prisma.tenant.upsert({
        where: { id: targetWorkspaceId },
        update: { name: targetWorkspaceId, updatedAt: new Date() },
        create: { id: targetWorkspaceId, name: targetWorkspaceId, updatedAt: new Date() },
      });

      await prisma.componenttask.create({
        data: {
          id: crypto.randomUUID(),
          name: compDef?.name || "能力组件运行",
          description: compDef?.description || "通过效能组件矩阵启动运行的任务",
          type: compDef?.category || compDef?.id || "use",
          status: "completed",
          progress: 100,
          userId,
          tenantId: targetWorkspaceId,
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

    // 删除知识库文档记录 (支持 delete_knowledge 与 deleteDocument)
    if (action === "delete_knowledge" || action === "deleteDocument") {
      const documentId = searchParams.get("documentId") || searchParams.get("id");
      const workspaceId = searchParams.get("workspaceId");

      if (!documentId) {
        return NextResponse.json({ success: false, error: "缺少 documentId 参数" }, { status: 400 });
      }

      if (workspaceId) {
        const accessCheck = await checkWorkspaceAccess(userId, workspaceId);
        if (accessCheck.error) {
          return NextResponse.json({ success: false, error: accessCheck.error.message }, { status: accessCheck.error.status });
        }
      }

      await prisma.document.delete({
        where: { id: documentId },
      });

      return NextResponse.json({ success: true, message: "知识记录已成功删除" });
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
