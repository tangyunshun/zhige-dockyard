export const dynamic = "force-dynamic"; // Trigger Turbopack Cache Rebuild 2026-08-31

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth-admin";
import { buildComponentResult } from "@/lib/component-result";
import {
  requireWorkspaceMembership,
  getLogicalWorkspaceRole,
  requireWorkspacePermission,
  writeAuditLog,
} from "@/lib/security";
import { checkAndResetQuotaCycle } from "@/lib/quota-cycle";
import { isProbablyBinaryContent, sanitizeTextContent } from "@/lib/text-utils";
import { scanSensitiveWords } from "@/lib/sensitive-words";
import {
  notifyAssetRemoved,
  notifyAssetsBatchRemoved,
  notifyAssetRestored,
  notifyRestoreRequested,
  notifyDeletionRequested,
  notifyDeletionRejected,
  notifyPrivateReviewRequest,
  reasonLabel,
  type AssetUsage,
} from "@/lib/asset-notify";
import { getAssetPermissions } from "@/lib/asset-permission";
import { getFileTypeLabel, resolveAssetSize } from "@/lib/file-type";
import { generateSmartSummary } from "@/lib/smart-summary";
import { saveAssetFile, deleteAssetFile } from "@/lib/file-store";
import { getFileExtension } from "@/lib/file-type";
import { extractTextFromBuffer } from "@/lib/text-extract";
import { UNLIMITED_TOKEN, isUnlimitedTokenLimit, getMembershipTokenLimit } from "@/lib/quota-token";
import { consumePoints, InsufficientPointsError } from "@/lib/credit-service";

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

  // 治理中心管理者判定：仅认空间角色——空间 ADMIN/OWNER 视为治理管理员，
  // 可查看并管理全空间移除单与操作日志（含私密文档）。
  // 注意：平台全局管理员若非本空间成员，则在本空间内无任何治理权限（普通成员视角），
  // 治理权限严格跟随「空间成员 + 空间角色」，与 list_removals 过滤口径一致。
  async function isGovernanceAdminRole(userId: string, workspaceId: string): Promise<boolean> {
    const role = await getLogicalWorkspaceRole(userId, workspaceId);
    return role === "ADMIN" || role === "OWNER";
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
      const [components, categories, internalComponents, presetPositions, usageStats, taskStatsRows] = await Promise.all([
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
        // 组件真实调用次数（component_stats.totalUses，由每次执行真实累加）
        prisma.componentstats.findMany({
          select: { componentId: true, totalUses: true },
        }),
        // 组件真实执行结果分布（用于计算真实成功率，无任何模拟数值）
        prisma.componenttask.groupBy({
          by: ["type", "status"],
          _count: { _all: true },
        }),
      ]);

      // 真实调用次数映射（componentId → totalUses）
      const usageMap = new Map<string, number>();
      usageStats.forEach((s) => {
        if (s.componentId) usageMap.set(s.componentId.trim().toUpperCase(), s.totalUses || 0);
      });

      // 真实成功率映射（componentId → { total, success }）
      const taskStatsMap = new Map<string, { total: number; success: number }>();
      taskStatsRows.forEach((row) => {
        const key = (row.type || "").trim().toUpperCase();
        if (!key) return;
        const cur = taskStatsMap.get(key) || { total: 0, success: 0 };
        cur.total += row._count._all;
        if (row.status === "SUCCESS") cur.success += row._count._all;
        taskStatsMap.set(key, cur);
      });

      // 附加真实统计，供前端展示（前端禁止再派生任何模拟数值）
      const componentsWithStats = components.map((c) => {
        const key = c.id.trim().toUpperCase();
        return {
          ...c,
          realUsageCount: usageMap.get(key) ?? 0,
          realTaskStats: taskStatsMap.get(key) ?? { total: 0, success: 0 },
        };
      });

      // 免费用户默认可用组件 = 非付费组件（由数据库 isPremium 字段推导，不再写死）
      const defaultAllowedIds = components.filter((c) => !c.isPremium).map((c) => c.id);

      return NextResponse.json({
        success: true,
        data: {
          components: componentsWithStats,
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
        where: {
          tenantId: workspaceId,
          status: { not: "ARCHIVED" },
        },
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
        const dbCompName = compNameMap.get(cId) || t.type || "";

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

    // 获取指定工作空间下状态为 SUCCESS 的任务结果列表
    if (action === "results") {
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
          error: "越权警告：您不属于该工作空间，无权查看任务结果"
        }, { status: 403 });
      }

      const limitParam = searchParams.get("limit");
      const take = limitParam ? parseInt(limitParam, 10) : undefined;

      const tasks = await prisma.componenttask.findMany({
        where: {
          tenantId: workspaceId,
          status: "SUCCESS",
        },
        orderBy: { createdAt: "desc" },
        ...(take ? { take } : {}),
      });

      const allComponents = await prisma.componentcatalog.findMany({ select: { id: true, name: true } });
      const compNameMap = new Map<string, string>();
      allComponents.forEach((comp) => {
        if (comp.id && comp.name) {
          compNameMap.set(comp.id.trim().toUpperCase(), comp.name);
        }
      });

      const formattedResults = tasks.map((t) => {
        const cId = (t.type || "").trim().toUpperCase();
        const dbCompName = compNameMap.get(cId) || t.type || "";
        return {
          id: t.id,
          name: t.name,
          type: t.type,
          componentName: dbCompName,
          config: t.config ? JSON.parse(JSON.stringify(t.config)) : null,
          result: t.result ? JSON.parse(JSON.stringify(t.result)) : null,
          createdAt: t.createdAt,
        };
      });

      return NextResponse.json({ success: true, data: formattedResults });
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

      const accessCheck = await checkWorkspaceAccess(userId, workspaceId);
      if (accessCheck.error) {
        return NextResponse.json({
          success: false,
          error: accessCheck.error.message
        }, { status: accessCheck.error.status });
      }

      const documents = await prisma.document.findMany({
        where: { 
          workspaceId,
          // 资料列表只返回仍可见的资料；REMOVED 资料由治理中心移除记录承载，不在此列表中出现
          status: { in: ["active", "APPROVED", "PENDING", "REJECTED"] }
        },
        orderBy: { createdAt: "desc" }
      });

      const wsRole = await getLogicalWorkspaceRole(userId, workspaceId);
      const isManager = wsRole === "ADMIN" || wsRole === "OWNER";

      // 资料权限与空间统一隔离规则：
      // 1. 个人私密资料(PRIVATE)：严格仅上传人本人可见，空间管理员/所有者也不可见他人私密内容；
      // 2. 企空间公开资料(PUBLIC)：全空间所有成员可见性与数量保持一致。
      const visibleDocuments = documents.filter((d) => {
        if (d.visibility === "PRIVATE" && d.uploaderId !== userId) {
          return false;
        }
        return true;
      });

      // 当前用户本人发起的、待管理员审核的删除申请（用于资料列表展示“审核中”）
      const myPendingRemovals = await prisma.documentremoval.findMany({
        where: { workspaceId, status: "PENDING", removedBy: userId },
      }).catch(() => []);
      const myPendingMap = new Map(myPendingRemovals.map((r) => [r.documentId, r]));

      // 解析真实上传者账号：根据 document.uploaderId 关联 user 表，
      // 取昵称/邮箱/手机号中任意一个真实存在的账号标识（手机号注册用户无 name/email 也能正确显示），
      // 绝不回退为硬编码占位字符串。历史存量文档无 uploaderId 时返回 null。
      const uploaderIds = visibleDocuments
        .map((d) => d.uploaderId)
        .filter((id): id is string => Boolean(id));
      const uploaderUsers = uploaderIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: uploaderIds } },
            select: { id: true, name: true, email: true, phone: true },
          })
        : [];
      const uploaderMap = new Map(uploaderUsers.map((u) => [u.id, u]));

      const resolveUploaderName = (u: { name?: string | null; email?: string | null; phone?: string | null } | undefined) => {
        if (!u) return null;
        const name = (u.name || "").trim();
        if (name) return name;
        const email = (u.email || "").trim();
        if (email) return email;
        const phone = (u.phone || "").trim();
        if (phone) return phone;
        return null;
      };

      // 关联查询最近的操作/审计日志中的审核意见 comment
      const auditLogs = await prisma.operationlog.findMany({
        where: {
          workspaceId,
          action: { in: ["asset:approve", "asset:reject", "KNOWLEDGE_APPROVE", "KNOWLEDGE_REJECT"] }
        },
        orderBy: { createdAt: "desc" },
        take: 200
      }).catch(() => []);

      const commentMap = new Map<string, string>();
      auditLogs.forEach((l) => {
        if (!l.details) return;
        let det: any = l.details;
        if (typeof det === "string") {
          try { det = JSON.parse(det); } catch (e) {}
        }
        if (det && typeof det === "object") {
          const targetId = det.documentId || det.knowledgeId || det.assetId || det.id;
          const commentStr = (det.comment || det.reviewComment || det.reason || "").trim();
          if (targetId && commentStr && !commentMap.has(targetId)) {
            commentMap.set(targetId, commentStr);
          }
        }
      });

      const data = visibleDocuments.map((d) => {
        const uploader = d.uploaderId ? uploaderMap.get(d.uploaderId) : undefined;
        // 兼容历史数据：迁移前审核意见曾被写入 content 的 JSON 包装中，
        // 仅在独立字段为空时才回退解析，避免正文被误当作审核意见。
        let contentComment = null;
        if (!d.reviewComment && d.content) {
          try {
            const p = JSON.parse(d.content);
            if (p && typeof p === "object" && p.reviewComment) {
              contentComment = p.reviewComment;
            }
          } catch (e) {}
        }
        const logComment = commentMap.get(d.id);
        // 优先取独立的 review_comment 字段，其次审计日志，最后兼容历史 content 写法
        const resolvedReviewComment = d.reviewComment || logComment || contentComment || (d.status === "REJECTED" ? "请根据空间合规要求修正提要后再发起公开申请。" : null);

        // 格式类型：由文件真实类型决定，输出中文类型名（Word 文档 / Excel 表格 / 图片 …）
        const fileTypeLabel = getFileTypeLabel({
          type: d.type,
          ext: d.fileExt,
          title: d.title,
          content: d.content,
        });
        // 容量大小：优先真实字节数，历史数据缺失时按内容 UTF-8 字节数估算
        const resolvedSizeStr = resolveAssetSize({
          fileSize: d.fileSize,
          content: d.content,
        });

        return {
          ...d,
          isMine: Boolean(d.uploaderId === userId),
          fileUrl: d.filePath ? `/api/workspace/assets/${d.id}/file` : null,
          mimeType: d.mimeType,
          originalName: d.originalName,
          uploaderName: resolveUploaderName(uploader),
          uploaderEmail: uploader ? (uploader.email || null) : null,
          uploaderPhone: uploader ? (uploader.phone || null) : null,
          reviewComment: resolvedReviewComment,
          fileTypeLabel,
          sizeStr: resolvedSizeStr,
          // 智能总结：优先取持久化的 summary；历史资料缺失时基于原文即时生成
          summary: (d.summary && d.summary.trim()) ? d.summary : generateSmartSummary(d.content, d.title).overview,
          // 当前用户本人发起、待审核的删除申请（仅 PENDING 且由本人提交时存在）
          pendingRemoval: myPendingMap.get(d.id) || null,
        };
      });

      // 治理中心入口红点：统计“非本人删除且已生效(APPROVED)”的未恢复移除单。
      // - 仅计 APPROVED：待审核(PENDING)申请尚未真正移除，不计入红点；
      // - 排除 removedBy === userId：删除人本人（无论管理员还是成员主动删除自己的资料）不再显示红点，
      //   仅对删除人与审核人之外的其他成员提示“有资料被移除”。
      const activeRemovalCount = await prisma.documentremoval.count({
        where: { workspaceId, restoredAt: null, confirmedAt: null, status: "APPROVED", removedBy: { not: userId } },
      }).catch(() => 0);

      // 资料与知识库彻底分离：排除 type==="knowledge" 的知识库，兼容历史/新建立 type 为 null 的存量资料
      const materialDocs = visibleDocuments.filter((d) => d.type !== "knowledge");

      // 1. 公开资料数：全空间已生效发布的公开资料（排除待审核与已移除）
      const publicCount = materialDocs.filter((d) => d.visibility === "PUBLIC" && d.status !== "PENDING" && d.status !== "REMOVED").length;

      // 2. 本人私密资料数：严格统计当前登录用户上传的个人私密资料
      const ownPrivateCount = materialDocs.filter((d) => d.visibility === "PRIVATE" && d.uploaderId === userId && d.status !== "PENDING" && d.status !== "REMOVED").length;

      // 3. 其他成员私密资料数：严格隔离，不向任何空间角色泄露成员私密资料数量
      const otherPrivateCount = 0;

      // 4. 待审核资料数：管理员查看全空间待审核大盘，普通成员仅查看本人提交的待审核
      const pendingCount = isManager
        ? materialDocs.filter((d) => d.status === "PENDING").length
        : materialDocs.filter((d) => d.status === "PENDING" && d.uploaderId === userId).length;

      // 5. 资料总数：
      // - 任何角色视角：空间公开 + 本人私密 + 本人可处理的待审核项（不泄漏任何其他成员私密数据）
      const total = publicCount + ownPrivateCount + pendingCount;

      return NextResponse.json({
        success: true,
        data,
        removalStats: { activeCount: activeRemovalCount },
        stats: {
          publicCount,
          ownPrivateCount,
          otherPrivateCount,
          pendingCount,
          total,
          isManager,
          scope: isManager ? "governance-public" : "mine",
        },
      });
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

      const auditLogs = await prisma.operationlog.findMany({
        where: {
          workspaceId,
          action: { in: ["KNOWLEDGE_APPROVE", "KNOWLEDGE_REJECT", "asset:approve", "asset:reject"] }
        },
        orderBy: { createdAt: "desc" },
        take: 200
      }).catch(() => []);

      const commentMap = new Map<string, string>();
      auditLogs.forEach((l) => {
        if (!l.details) return;
        let det: any = l.details;
        if (typeof det === "string") {
          try { det = JSON.parse(det); } catch (e) {}
        }
        if (det && typeof det === "object") {
          const targetId = det.knowledgeId || det.documentId || det.assetId || det.id;
          const commentStr = (det.comment || det.reviewComment || det.reason || "").trim();
          if (targetId && commentStr && !commentMap.has(targetId)) {
            commentMap.set(targetId, commentStr);
          }
        }
      });

      // 批量拉取来源任务与组件目录，避免 N+1 查询
      const parentIds = documents.map(d => d.parentId).filter((id): id is string => !!id);
      const [sourceTasks, componentCatalogs] = await Promise.all([
        parentIds.length > 0
          ? prisma.componenttask.findMany({
              where: { id: { in: parentIds } },
              select: { id: true, name: true, type: true }
            })
          : Promise.resolve<Awaited<ReturnType<typeof prisma.componenttask.findMany>>>([]),
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
        let contentComment = null;
        if (d.content) {
          try {
            const p = JSON.parse(d.content);
            if (p && typeof p === "object" && p.reviewComment) {
              contentComment = p.reviewComment;
            }
          } catch (e) {}
        }
        const logComment = commentMap.get(d.id);
        const resolvedReviewComment = logComment || contentComment || (d.status === "rejected" ? "请根据空间合规要求修正后重新发起申请。" : null);

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
          reviewComment: resolvedReviewComment,
        };
      });

      return NextResponse.json({ success: true, data });
    }

    // ===== 拉取空间审计与操作日志列表 =====
    if (action === "logs" || action === "operation_logs") {
      const workspaceId = searchParams.get("workspaceId") || "";
      if (!workspaceId) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId 参数" }, { status: 400 });
      }
      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }

      const logs = await prisma.operationlog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 300,
        include: {
          user: {
            select: { id: true, name: true, email: true, avatar: true, role: true }
          }
        }
      });

      return NextResponse.json({ success: true, data: logs });
    }

    return NextResponse.json({ 
      success: false, 
      error: "缺少 action 参数" 
    }, { status: 400 });

  } catch (error: any) {
    console.error("Studio API GET error:", error);
    return NextResponse.json({ 
      success: false, 
      error: "服务器内部错误",
      details: error?.message || undefined
    }, { status: 500 });
  }
} // HMR_FLUSH_REFRESH_2026_08_31

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
    
    // tokenLimit 一律从 membershiplevel 表读取真实值，不再写死档位数值
    const tierTokenLimit = await getMembershipTokenLimit(membershipLevel);
    
    // 查询或匹配会员等级关联 ID
    let ml = await prisma.membershiplevel.findUnique({
      where: { id: membershipLevel }
    });
    if (!ml) {
      ml = await prisma.membershiplevel.findFirst();
    }
    const mlId = ml?.id || "FREE";
    // 无限额度（-1）保持 -1，不写死任何固定大数
    const tokenBalance = isUnlimitedTokenLimit(tierTokenLimit) ? UNLIMITED_TOKEN : tierTokenLimit;
    
    quota = await prisma.workspacequota.create({
      data: {
        id: crypto.randomUUID(),
        workspaceId,
        membershipLevelId: mlId,
        tokenBalance,
        updatedAt: new Date()
      }
    });
  }
  return quota;
}

// 岗位受限组件 ID 列表获取辅助函数 (闭环安全隔离，100% 联动真实岗位权限矩阵 componentpermission)
async function getRestrictedComponentIds(workspaceId: string, userId: string): Promise<string[]> {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { type: true, ownerId: true }
  });

  // 0. 空间不存在时绝不返回空数组放行
  if (!ws) {
    throw new Error("工作空间不存在");
  }

  // 1. 若为个人空间，或者当前用户是空间创建者/所有者，拥有全量特权，无任何受限
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

  // 查当前空间装配的所有有效组件（去重且优先取带装配标记的记录）
  const usages = await prisma.componentusage.findMany({
    where: { workspaceId },
    select: { componentId: true, metadata: true }
  });

  const boundComponentMap = new Map<string, string>(); // UpperCase -> 原始ID
  usages.forEach(u => {
    if (!u.componentId) return;
    const original = u.componentId.trim();
    if (!original) return;
    const upper = original.toUpperCase();
    if (!u.metadata) {
      if (!boundComponentMap.has(upper)) boundComponentMap.set(upper, original);
      return;
    }
    try {
      const meta = typeof u.metadata === "string" ? JSON.parse(u.metadata) : (u.metadata as any);
      if (meta && typeof meta.enabled === "boolean") {
        boundComponentMap.set(upper, original);
      } else if (!boundComponentMap.has(upper)) {
        boundComponentMap.set(upper, original);
      }
    } catch {
      if (!boundComponentMap.has(upper)) boundComponentMap.set(upper, original);
    }
  });

  // 兜底：如果全空间绑定记录为空，则取系统默认装配的 5 套件组件
  if (boundComponentMap.size === 0) {
    ["C01", "C02", "C07", "C11", "C12"].forEach(id => boundComponentMap.set(id.toUpperCase(), id));
  }

  const installedComponentIds = Array.from(boundComponentMap.values());

  // 非空间成员：全量组件均受限
  if (!memberRecord) {
    return installedComponentIds;
  }

  // 空间底层所有者角色的成员全无限制
  if (memberRecord.role === "OWNER") {
    return [];
  }

  // 3. 收集该成员在当前空间被赋予的全部岗位标识 (支持 postmember 关系表与 operationlog 扩展兼任岗位)
  const memberRoleTokens = new Set<string>();
  if (memberRecord.role) memberRoleTokens.add(memberRecord.role.trim());
  if ((memberRecord as any).positionCode) memberRoleTokens.add(String((memberRecord as any).positionCode).trim());

  // 查 postmember 关联表（包含 post 关联对象）
  const postMembers = await prisma.postmember.findMany({
    where: { workspaceId, userId },
    include: { post: true }
  });
  postMembers.forEach(pm => {
    if (pm.postId) memberRoleTokens.add(pm.postId.trim());
    if (pm.post?.name) memberRoleTokens.add(pm.post.name.trim());
  });

  // 查 operationlog 变更日志（支持 resource 为 userId，或 details 中包含 targetUserId 为当前用户）
  const roleLogs = await prisma.operationlog.findMany({
    where: {
      workspaceId,
      action: "UPDATE_MEMBER_ROLE",
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  for (const log of roleLogs) {
    const details = log.details as any;
    const isTarget = log.resource === userId || 
      (details && typeof details === "object" && (details.targetUserId === userId || details.userId === userId));
    
    if (isTarget && details) {
      if (Array.isArray(details.roles)) {
        details.roles.forEach((r: any) => r && memberRoleTokens.add(String(r).trim()));
      } else if (typeof details.newRole === "string" && details.newRole.trim()) {
        details.newRole.split(",").forEach((r: string) => r.trim() && memberRoleTokens.add(r.trim()));
      }
      break; // 仅取最新一条该成员的岗位分配记录
    }
  }

  // 4. 查询当前空间已装配引入的所有岗位对象
  const allWorkspacePosts = await prisma.workspacepost.findMany({
    where: { workspaceId },
    select: { id: true, name: true, isSystem: true }
  });

  // 系统英文代号与中文名称标准映射字典
  const SYSTEM_ROLE_NAME_MAP: Record<string, string> = {
    OWNER: "空间所有者",
    ADMIN: "空间管理员",
    MEMBER: "协同成员",
    DEVELOPER: "研发工程师",
    PRODUCT_MANAGER: "产品经理",
    PROJECT_MANAGER: "项目经理",
    FRONTEND_DEV: "前端开发工程师",
    FRONTEND_ENGINEER: "前端开发工程师",
    BACKEND_DEV: "后端开发工程师",
    BACKEND_ENGINEER: "后端开发工程师",
    TEST_QA: "测试工程师",
    TEST_ENGINEER: "测试工程师",
    QA_ENGINEER: "测试工程师",
    QA_MANAGER: "质量经理",
    UI_UX_DESIGNER: "UI/UX交互设计师",
    DESIGNER: "UI/UX交互设计师",
    DEVOPS_ENGINEER: "运维工程师",
    DEVOPS: "运维工程师",
    SYSTEM_ARCHITECT: "系统架构师",
    ARCHITECT: "系统架构师",
    ALGORITHM_ENGINEER: "算法工程师",
    HARDWARE_ENGINEER: "硬件工程师",
    SECURITY_AUDITOR: "空间审计员",
    SECURITY_EXPERT: "安全专家",
    TECH_LEAD: "技术主管",
    DELIVERY_LEAD: "交付负责人",
    QUANT_STRATEGIST: "量化策略分析师",
  };

  // 匹配属于该成员的岗位 Post ID 集合
  const matchedPostIds = new Set<string>();
  allWorkspacePosts.forEach(post => {
    const postNameUpper = post.name.toUpperCase().trim();
    for (const token of memberRoleTokens) {
      const tokenUpper = token.toUpperCase().trim();
      if (
        post.id.toUpperCase() === tokenUpper ||
        postNameUpper === tokenUpper ||
        (SYSTEM_ROLE_NAME_MAP[tokenUpper] && post.name === SYSTEM_ROLE_NAME_MAP[tokenUpper]) ||
        (tokenUpper.includes("PRODUCT") || tokenUpper.includes("产品")) && (post.name.includes("产品") || post.name.toUpperCase().includes("PRODUCT"))
      ) {
        matchedPostIds.add(post.id);
      }
    }
  });

  // 特权检查：如果成员匹配到“空间所有者”岗位，全放行无限制
  const ownerPost = allWorkspacePosts.find(p => p.isSystem || p.name === "空间所有者");
  if (ownerPost && matchedPostIds.has(ownerPost.id)) {
    return [];
  }

  // 5. 检查当前空间在 componentpermission 中是否配置过岗位权限矩阵
  const totalPermCount = await prisma.componentpermission.count({
    where: {
      post: {
        workspaceId,
      },
    },
  });

  // 如果当前空间从未配置过权限矩阵，普通成员默认不限制（冷启动平滑可用）
  if (totalPermCount === 0) {
    return [];
  }

  // 6. 如果成员已分配具体岗位：查询这些岗位所有被授权可执行（canExecute === true）的组件
  if (matchedPostIds.size > 0) {
    const permissions = await prisma.componentpermission.findMany({
      where: {
        postId: { in: Array.from(matchedPostIds) },
        canExecute: true,
      },
      select: { componentId: true },
    });

    const allowedComponentUpperSet = new Set(permissions.map(p => p.componentId.trim().toUpperCase()));

    // 受限组件 = 当前空间已装配的组件中，不在已授权列表里的所有组件
    const restricted = installedComponentIds.filter(cid => !allowedComponentUpperSet.has(cid.trim().toUpperCase()));
    return restricted;
  }

  // 如果空间已有权限管控矩阵，而该成员未被授予任何已知岗位，则所有装配组件均受限不可用
  return installedComponentIds;
}

// POST - 执行组件相关操作
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    
    const searchParams = request.nextUrl.searchParams;
    const isMultipartRequest =
      (request.headers.get("content-type") || "").includes("multipart/form-data");
    const body = isMultipartRequest ? {} : await request.json().catch(() => ({}));
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
      try {
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

        // 装配与启用校验：若未装配则自动极速补全装配记录；若显式禁用则拦截
        const binding = await prisma.componentusage.findFirst({
          where: { workspaceId, componentId },
          orderBy: { usedAt: "desc" },
          select: { metadata: true },
        });
        if (!binding) {
          await prisma.componentusage.create({
            data: {
              id: crypto.randomUUID(),
              userId,
              componentId,
              workspaceId,
              usedAt: new Date(),
              metadata: { enabled: true }
            }
          }).catch((e) => console.warn("[simulate] 自动补全组件装配非致命提示:", e));
        } else if (binding.metadata) {
          try {
            const meta = typeof binding.metadata === "string" ? JSON.parse(binding.metadata) : (binding.metadata as any);
            if (meta && typeof meta.enabled === "boolean" && meta.enabled === false) {
              return NextResponse.json({ success: false, error: "该组件已被管理员禁用，暂时无法执行" }, { status: 403 });
            }
          } catch (e) {
            console.error("解析组件 metadata 失败:", e);
          }
        }

        // 1. 从 componentcatalog 读取组件信息与真实 estimatedTokens 成本（不信任客户端 body.tokens）
        const comp = await prisma.componentcatalog.findUnique({
          where: { id: componentId },
          select: {
            id: true,
            name: true,
            category: true,
            description: true,
            contract: true,
            previewData: true,
            inputMode: true,
            estimatedTokens: true,
          },
        });

        if (!comp) {
          return NextResponse.json({ success: false, error: "未找到对应组件，无法执行" }, { status: 404 });
        }

        const deductTokens = comp.estimatedTokens && Number(comp.estimatedTokens) > 0 ? Number(comp.estimatedTokens) : 5;

        // 自然月跨月算力配额自动重置
        await checkAndResetQuotaCycle(prisma, workspaceId, userId);

        // 1. 确保空间配额记录存在（算力点真源为 pointgrant 分桶，此处仅保证配额行存在）
        const quota = await getOrCreateQuota(workspaceId, userId);

        // 任务 ID 先行生成：作为扣费幂等键与算力流水关联的任务号
        const taskId = crypto.randomUUID();

        // 2. 校验成员月度算力额度 (若管理员显式为该成员配置了额度)
        const currentMember = await prisma.workspacemember.findUnique({
          where: { userId_workspaceId: { userId, workspaceId } },
        });
        if (currentMember && currentMember.monthlyTokenLimit !== null && currentMember.monthlyTokenLimit !== undefined) {
          const memberLimit = Number(currentMember.monthlyTokenLimit);
          const memberUsed = Number(currentMember.monthlyTokenUsed || 0);
          if (memberUsed + deductTokens > memberLimit) {
            return NextResponse.json({
              success: false,
              error: `您本月的个人算力点配额已用尽（当前已用 ${memberUsed}/${memberLimit}，本次需要 ${deductTokens}），请联系空间管理员提升配额`,
            }, { status: 400 });
          }
        }

        // 任务名称与输入材料来自请求体，但执行状态与产出结果一律由服务端判定
        const taskName = body.taskName;
        const rawInputMaterial = typeof body.inputMaterial === "string" ? body.inputMaterial : "";

        // 输入清洗：阻止二进制乱码（如 PDF 被 readAsText 读出的 %PDF-1.7...）进入数据库
        const inputMaterial = sanitizeTextContent(rawInputMaterial);
        if (isProbablyBinaryContent(inputMaterial)) {
          return NextResponse.json({
            success: false,
            error: "输入材料包含二进制乱码内容（如 PDF/Word 等被误当作文本读取）。请先提取纯文本后重试。",
          }, { status: 400 });
        }

        // 统一任务输入契约：以数据库 component_catalog.inputMode 为唯一准绳校验输入来源，
        // 文本 / 文件 / 空间资料只需满足其一即可，每个任务至多一个主材料。
        const compInputMode: string = comp.inputMode || "text";
        const reqInputSource = body.inputSource && typeof body.inputSource === "object" ? (body.inputSource as any) : null;
        const reqSourceType: string | undefined = reqInputSource?.sourceType;
        const hasText = inputMaterial.length > 0;

        let inputError = "";
        switch (compInputMode) {
          case "text":
            if (!hasText && reqSourceType !== "asset") {
              inputError = "该组件要求文本输入：请粘贴文本材料，或选择空间资料作为主材料。";
            }
            break;
          case "file":
            if (reqSourceType !== "file" && reqSourceType !== "asset") {
              inputError = "该组件需要上传文件或选择空间资料作为主材料：纯文本粘贴不允许执行。";
            }
            break;
          case "both":
          default:
            if (!hasText && reqSourceType !== "file" && reqSourceType !== "asset") {
              inputError = "该组件需要文本、文件或空间资料任一作为主材料。";
            }
            break;
        }
        if (inputError) {
          return NextResponse.json({ success: false, error: inputError }, { status: 400 });
        }

        // 落库用标准化 inputSource 结构
        const storedInputSource = {
          sourceType: reqSourceType || "text",
          sourceId: (typeof reqInputSource?.sourceId === "string" && reqInputSource.sourceId) ? reqInputSource.sourceId : null,
          fileName: (typeof reqInputSource?.fileName === "string" && reqInputSource.fileName) ? reqInputSource.fileName : null,
          fileSize: typeof reqInputSource?.fileSize === "number" ? reqInputSource.fileSize : null,
        };

        // ===== 算力点扣费：按分桶「到期最早优先」扣减，写入算力流水（幂等）=====
        // 可用额度 = 用户钱包（跨空间通用）+ 当前空间池（企业共享池 / 个人专属赠送）
        try {
          await consumePoints({
            workspaceId,
            userId,
            points: deductTokens,
            componentId: comp.id,
            componentName: comp.name || componentId,
            taskId,
            workspaceType: ws?.type || null,
            workspaceName: ws?.name || null,
            idempotencyKey: `CONSUME:${taskId}`,
          });
        } catch (consumeErr) {
          if (consumeErr instanceof InsufficientPointsError) {
            return NextResponse.json({
              success: false,
              code: "POINTS_INSUFFICIENT",
              error: `算力点余额不足：当前可用 ${consumeErr.available} 点，本次需要 ${consumeErr.required} 点，请充值后再试`,
            }, { status: 400 });
          }
          throw consumeErr;
        }

        // 服务端感知组件属性（category, contract, previewData, inputMode）生成差异化结果
        const outputData = buildComponentResult(comp, inputMaterial);
        const taskStatus = "SUCCESS"; // 模拟执行已完成，服务端判定成功

        // 事务化处理：扣减 Token + 更新组件统计 + 写入任务历史
        const taskResult = await prisma.$transaction(async (tx) => {
          // 确保租户记录存在，避免 componenttask.tenantId 外键约束失败导致 simulate 恒 500
          await tx.tenant.upsert({
            where: { id: workspaceId },
            update: { name: ws?.name || workspaceId, updatedAt: new Date() },
            create: { id: workspaceId, name: ws?.name || workspaceId, updatedAt: new Date() },
          });

          // 算力点已由 credit-service 在事务外按分桶扣减并写入流水，此处仅回读最新余额
          const updatedQuota = await tx.workspacequota.findUnique({
            where: { workspaceId },
          });

          // 若存在成员记录，同时更新成员已使用额度
          if (currentMember) {
            await tx.workspacemember.update({
              where: { id: currentMember.id },
              data: {
                monthlyTokenUsed: { increment: BigInt(deductTokens) },
              },
            }).catch((e) => console.warn("[算力扣费] 成员已用额度自增警告:", e));
          }

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

          // 原子更新组件字典库 componentcatalog 的全局真实调度次数自增 usageCount + 1
          await tx.componentcatalog.update({
            where: { id: componentId },
            data: {
              usageCount: { increment: 1 },
              updatedAt: new Date(),
            },
          }).catch((e) => console.warn("[组件调度] componentcatalog usageCount 自增警告:", e));

          const sensitivity = scanSensitiveWords(typeof inputMaterial === "string" ? inputMaterial : "");
          const effectiveInputMaterial = sensitivity.hasSensitive ? sensitivity.sanitizedText : inputMaterial;

          const rawMaterialStr = typeof effectiveInputMaterial === "string" ? effectiveInputMaterial.trim().replace(/\s+/g, " ") : "";
          const materialSummary = rawMaterialStr ? (rawMaterialStr.length > 40 ? `${rawMaterialStr.slice(0, 40)}...` : rawMaterialStr) : "快捷输入";
          const safeDescription = `使用【${comp.name || componentId}】处理任务 (${materialSummary})`.slice(0, 180);

          const task = await tx.componenttask.create({
            data: {
              id: taskId,
              name: taskName || `${comp.name || componentId} 运行任务`,
              description: safeDescription,
              type: componentId,
              status: taskStatus,
              progress: 100,
              config: { 
                inputMaterial: effectiveInputMaterial || "", 
                tokenCost: deductTokens, 
                inputSource: storedInputSource,
                hasSensitive: sensitivity.hasSensitive,
                foundSensitiveWords: sensitivity.foundWords
              },
              result: { outputData: outputData as unknown as Prisma.InputJsonValue },
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

        // 记录真实的使用率日志
        await touchComponentUsage(userId, componentId, workspaceId);

        // 写入高危审计日志（非阻断式）
        await writeAuditLog(userId, "component:execute", { componentId, tokens: deductTokens }, workspaceId).catch((e) => console.warn("写入审计日志非阻断式提示:", e));

        return NextResponse.json({
          success: true,
          tokenBalance: taskResult.quota ? Number(taskResult.quota.tokenBalance) : 0,
          cost: deductTokens,
          task: {
            id: taskResult.task.id,
            name: taskResult.task.name,
            status: taskResult.task.status,
            result: taskResult.task.result,
            tokens: deductTokens,
            createdAt: taskResult.task.createdAt,
          },
        });
      } catch (simError: any) {
        console.error("执行 simulate 分支发生内部异常:", simError);
        return NextResponse.json({
          success: false,
          error: simError.message || "组件任务处理内部异常，请联系系统管理员"
        }, { status: 500 });
      }
    }

    // 新增：上传文档/沉淀材料至知识库与原始文件库（支持 multipart 真实文件与 JSON 文本兼容）
    if (action === "upload_doc") {
      const contentType = request.headers.get("content-type") || "";
      const isMultipart = contentType.includes("multipart/form-data");

      let title = "";
      let content = "";
      let type = "";
      let visibility = "PUBLIC";
      let fileSize: number | null = null;
      let fileExt: string | null = null;
      let summary: string | null = null;
      let filePath: string | null = null;
      let mimeType: string | null = null;
      let originalName: string | null = null;
      let targetWorkspaceId = workspaceId || "";

      if (isMultipart) {
        const formData = await request.formData();
        const file = formData.get("file");
        title = String(formData.get("title") || (file as any)?.name || "");
        type = String(formData.get("type") || "");
        visibility = String(formData.get("visibility") || "PUBLIC");
        summary = String(formData.get("summary") || "") || null;
        targetWorkspaceId = String(formData.get("workspaceId") || workspaceId || "");

        if (!file || !(file instanceof Blob)) {
          return NextResponse.json({ success: false, error: "缺少文件" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const MAX_FILE_SIZE = 50 * 1024 * 1024;
        if (buffer.length > MAX_FILE_SIZE) {
          return NextResponse.json({ success: false, error: "文件过大，请上传 50MB 以内的文件" }, { status: 400 });
        }

        originalName = (file as any).name || title;
        fileExt = getFileExtension(originalName);
        const saved = await saveAssetFile(targetWorkspaceId || "", originalName || title, buffer, fileExt);
        filePath = saved.filePath;
        fileSize = saved.size;
        mimeType = saved.mimeType;

        const imageExts = ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"];
        const isImage = (file as any).type?.startsWith("image/") || imageExts.includes(fileExt || "");
        content = await Promise.race([
          extractTextFromBuffer(buffer, originalName || "", (file as any).type || ""),
          new Promise<string>((resolve) => setTimeout(() => resolve(""), 60000)),
        ]).catch(() => "");
        if (!summary) {
          if (content) {
            summary = generateSmartSummary(content, originalName).overview;
          } else {
            summary = `《${originalName || title}》${isImage ? "为图片文件，无可提取文字内容" : "解析超时或无可提取文字"}，可预览原文件或下载查看。`;
          }
        }
      } else {
        ({ title, content, type, visibility, fileSize, fileExt, summary } = body);
        originalName = null;
      }

      if (!targetWorkspaceId || !title) {
        return NextResponse.json({
          success: false,
          error: "缺少必要的 workspaceId 或 title 参数",
        }, { status: 400 });
      }

      // 空间归属强校验：空间不存在 → 404，非成员 → 403
      const uploadAccess = await checkWorkspaceAccess(userId, targetWorkspaceId);
      if (uploadAccess.error) {
        return NextResponse.json({ success: false, error: uploadAccess.error.message }, { status: uploadAccess.error.status });
      }

      // RBAC 审核机制：
      // 管理员/所有者上传公开资料、或者任何人上传私密资料 → 直接 APPROVED 自动合规通过
      // 普通成员在企业空间上传公开资料 → 状态设为 PENDING 待审核
      const userRole = await getLogicalWorkspaceRole(userId, targetWorkspaceId);
      const isManager = userRole === "ADMIN" || userRole === "OWNER";
      const isPrivate = visibility === "PRIVATE";
      const initialStatus = (isPrivate || isManager) ? "APPROVED" : "PENDING";

      // 查询 user 表解析真正的账号用户名/昵称
      const uploaderUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });
      const resolvedUploaderName = uploaderUser?.name || uploaderUser?.email || "系统用户";

      // 真实文件元信息：fileSize 取文件真实字节数（仅接受正整数），
      // fileExt 规范化为小写无点扩展名，summary 为前端基于原文生成的智能总结。
      const normalizedFileSize =
        typeof fileSize === "number" && Number.isFinite(fileSize) && fileSize > 0
          ? Math.round(fileSize)
          : null;
      const normalizedFileExt =
        typeof fileExt === "string" && fileExt.trim()
          ? fileExt.trim().toLowerCase().replace(/^\./, "").slice(0, 32)
          : null;
      const normalizedSummary =
        typeof summary === "string" && summary.trim() ? summary.trim() : null;

      const doc = await prisma.document.create({
        data: {
          id: crypto.randomUUID(),
          workspaceId: targetWorkspaceId,
          title,
          content: content || "",
          type: type || "doc",
          status: initialStatus,
          uploaderId: userId,
          visibility: visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
          fileSize: normalizedFileSize,
          fileExt: normalizedFileExt,
          summary: normalizedSummary,
          filePath,
          mimeType,
          originalName,
          updatedAt: new Date(),
        },
      });

      // 资料上传同样需要留痕审计
      await writeAuditLog(userId, "asset:upload", { title, type: doc.type, documentId: doc.id, status: initialStatus }, targetWorkspaceId)
        .catch((e) => console.warn("[审计] 资料上传日志写入失败:", e));

      return NextResponse.json({
        success: true,
        data: {
          ...doc,
          uploaderName: resolvedUploaderName,
          status: initialStatus,
          fileUrl: doc.filePath ? `/api/workspace/assets/${doc.id}/file` : null,
        },
      });
    }

    // 新增：资料审核接口（空间管理员/所有者可对待审核公开资料进行【通过】或【驳回】）
    if (action === "review_asset") {
      const { assetId, approve, comment, reviewComment } = body;
      const finalComment = (comment || reviewComment || "").trim();
      if (!workspaceId || !assetId) {
        return NextResponse.json({ success: false, error: "缺少必要的 workspaceId 或 assetId 参数" }, { status: 400 });
      }

      const reviewAccess = await checkWorkspaceAccess(userId, workspaceId);
      if (reviewAccess.error) {
        return NextResponse.json({ success: false, error: reviewAccess.error.message }, { status: reviewAccess.error.status });
      }

      const role = await getLogicalWorkspaceRole(userId, workspaceId);
      const isManager = role === "ADMIN" || role === "OWNER";
      if (!isManager) {
        return NextResponse.json({ success: false, error: "权限不足，仅空间管理员或所有者可以审核公开资料" }, { status: 403 });
      }

      // 审核逻辑：通过 → 正式归档为 PUBLIC 空间公开；驳回 → 自动降级为上传者的 PRIVATE 个人私密资料（管理员列表中屏蔽，上传者自己保留使用）
      const targetStatus = approve ? "APPROVED" : "REJECTED";
      const targetVisibility = approve ? "PUBLIC" : "PRIVATE";

      const existingAsset = await prisma.document.findUnique({ where: { id: assetId } });
      if (!existingAsset) {
        return NextResponse.json({ success: false, error: "未找到待审核的资料记录" }, { status: 404 });
      }

      // 审核意见独立落库到 review_comment 字段。
      // 严禁再写入 content：否则正文会被包成 {"reviewComment":"...","text":"原文"}，
      // 导致预览异常，且「带入快速任务」会把整段 JSON 当成材料喂给模型。
      const updatedDoc = await prisma.document.update({
        where: { id: assetId },
        data: { 
          status: targetStatus,
          visibility: targetVisibility,
          ...(finalComment ? { reviewComment: finalComment } : {}),
          updatedAt: new Date()
        }
      });

      await writeAuditLog(userId, approve ? "asset:approve" : "asset:reject", { documentId: assetId, title: updatedDoc.title, comment: finalComment }, workspaceId)
        .catch((e) => console.warn("[审计] 资料审核日志写入失败:", e));

      return NextResponse.json({ 
        success: true, 
        data: {
          ...updatedDoc,
          status: targetStatus,
          visibility: targetVisibility,
          reviewComment: finalComment
        } 
      });
    }

    // ===== 资料治理 P0-1：管理员移除资料（软删除 + 移除单 + 全员通知） =====
    if (action === "remove_asset") {
      const { workspaceId, assetId, reasonCode, reasonDetail } = body;
      if (!workspaceId || !assetId) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId 或 assetId 参数" }, { status: 400 });
      }

      const validReasons = ["VIOLATION", "EXPIRED", "COPYRIGHT", "OTHER"];
      const finalReason = validReasons.includes(reasonCode) ? reasonCode : "OTHER";
      const detail = (reasonDetail || "").trim();
      if (finalReason === "OTHER" && detail.length < 5) {
        return NextResponse.json({ success: false, error: "选择「其他原因」时必须填写不少于 5 个字的补充说明" }, { status: 400 });
      }

      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }

      const role = await getLogicalWorkspaceRole(userId, workspaceId);
      const isManager = role === "ADMIN" || role === "OWNER";

      const target = await prisma.document.findUnique({ where: { id: assetId } });
      if (!target || target.workspaceId !== workspaceId) {
        // 容错处理：若库中已被擦除或不存在，说明已处于移除状态，优雅返回成功
        return NextResponse.json({ success: true, data: { assetId, notifiedCount: 0 } });
      }

      const isSelfUploaded = Boolean(target.uploaderId && target.uploaderId === userId);
      if (!isManager && !isSelfUploaded) {
        return NextResponse.json({ success: false, error: "权限不足，仅空间管理员或资料上传人可移除该资料" }, { status: 403 });
      }

      // 个人私密资料严格归上传人本人所有：空间管理员/所有者也不得查看或删除他人私密资料
      if (target.visibility === "PRIVATE" && target.uploaderId !== userId) {
        return NextResponse.json(
          { success: false, error: "越权警告：个人私密资料仅上传人本人可删除，管理员无法访问他人私密资料" },
          { status: 403 }
        );
      }

      // —— 删除「本人上传的公开资料」前置校验：若仍被其他功能使用则禁止删除 ——
      // 公开资料可能被分享链接 / 其他资料依赖，删除会破坏这些关联，必须先行解除使用关系。
      if (isSelfUploaded && target.visibility === "PUBLIC") {
        const usage = await getAssetUsageCounts(workspaceId, [assetId]);
        const usedByOthers = usage.sharesActive > 0 || usage.childDocs > 0;
        if (usedByOthers) {
          const parts: string[] = [];
          if (usage.sharesActive > 0) parts.push(`${usage.sharesActive} 条分享链接`);
          if (usage.childDocs > 0) parts.push(`${usage.childDocs} 个子资料依赖`);
          return NextResponse.json(
            {
              success: false,
              error: `该公开资料正在被其他功能使用（${parts.join("、")}），请先解除使用后再删除`,
              usage,
            },
            { status: 400 }
          );
        }
      }

      // 普通成员删除自己上传的公开资料：进入管理员审核流，不直接移除（文档保持 active），仅创建待审核申请
      // 个人私密资料（PRIVATE）由用户本人直接删除/移除，无需管理员审核
      if (!isManager && isSelfUploaded && target.visibility === "PUBLIC") {
        const existing = await prisma.documentremoval.findFirst({
          where: { documentId: assetId, workspaceId, status: "PENDING" },
        });
        if (existing) {
          return NextResponse.json(
            { success: false, error: "该资料已存在待审核的删除申请，请等待管理员处理" },
            { status: 400 }
          );
        }

        const requester = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true, phone: true },
        });
        const requesterName = requester?.name || requester?.email || requester?.phone || "空间成员";

        const removal = await prisma.documentremoval.create({
          data: {
            id: `rm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            documentId: assetId,
            workspaceId,
            titleSnapshot: target.title,
            uploaderId: target.uploaderId || null,
            removedBy: userId,
            reasonCode: finalReason,
            reasonDetail: detail || null,
            status: "PENDING",
            removedAt: new Date(),
          },
        });

        await writeAuditLog(
          userId,
          "asset:removal_request",
          {
            documentId: assetId,
            title: target.title,
            reasonCode: finalReason,
            reasonDetail: detail || null,
            removalId: removal.id,
          },
          workspaceId
        ).catch((e) => console.warn("[审计] 删除申请写入失败:", e));

        // 通知空间管理员：有成员提交了删除申请，请在治理中心「删除申请」中审核
        await notifyDeletionRequested({
          workspaceId,
          documentId: assetId,
          title: target.title,
          requesterName,
          requesterId: userId,
          reasonCode: finalReason,
          reasonDetail: detail,
        }).catch((e) => console.warn("[资料通知] 删除申请通知发送失败:", (e as Error)?.message));

        return NextResponse.json({
          success: true,
          data: {
            pending: true,
            removalId: removal.id,
            status: "PENDING",
            message: "删除申请已提交，等待管理员审核",
          },
        });
      }

      // —— 个人私密资料 (PRIVATE)：仅上传人本人可删除，直接彻底擦除，不在治理中心留存恢复记录，也不通知任何人 ——
      if (target.visibility === "PRIVATE") {
        try {
          await prisma.document.delete({ where: { id: assetId } });
          await deleteAssetFile(target.filePath);
        } catch {
          await prisma.document.update({
            where: { id: assetId },
            data: { status: "REMOVED", updatedAt: new Date() },
          });
        }

        await writeAuditLog(userId, "asset:remove_private", {
          documentId: assetId,
          title: target.title,
        }, workspaceId).catch(() => {});

        return NextResponse.json({
          success: true,
          data: {
            id: assetId,
            status: "REMOVED",
            notifiedCount: 0,
          },
          message: "资料删除成功",
        });
      }

      // —— 公开资料 (PUBLIC)：管理员/所有者直接移除，生成治理记录(documentremoval)并向全员发送站内通知 ——
      const updated = await prisma.document.update({
        where: { id: assetId },
        data: { status: "REMOVED", updatedAt: new Date() },
      });

      const removedAt = new Date();
      const removal = await prisma.documentremoval.create({
        data: {
          id: `rm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          documentId: assetId,
          workspaceId,
          titleSnapshot: target.title,
          uploaderId: target.uploaderId || null,
          removedBy: userId,
          reasonCode: finalReason,
          reasonDetail: detail || null,
          status: "APPROVED",
          removedAt,
        },
      });

      await writeAuditLog(userId, "asset:remove", {
        documentId: assetId,
        title: target.title,
        reasonCode: finalReason,
        reasonDetail: detail || null,
        removalId: removal.id,
      }, workspaceId).catch((e) => console.warn("[审计] 资料移除日志写入失败:", e));

      // 仅对公开资料（PUBLIC）向全体成员发送移除通知；个人私密资料（PRIVATE）静默移除，不通知任何人
      let notifyResult = { notified: 0, mailed: 0 };
      if (target.visibility === "PUBLIC") {
        const selfUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true, phone: true },
        });
        const removedByName = selfUser?.name || selfUser?.email || selfUser?.phone || "空间管理员";

        const usage = await getAssetUsageCounts(workspaceId, [assetId]).catch(() => null);
        notifyResult = await notifyAssetRemoved({
          workspaceId,
          documentId: assetId,
          title: target.title,
          reasonCode: finalReason,
          reasonDetail: detail,
          removedByName,
          removedByUserId: userId,
          uploaderId: target.uploaderId || null,
          removedAt,
          usage,
        }).catch((e) => {
          console.warn("[资料通知] 移除通知发送失败:", (e as Error)?.message);
          return { notified: 0, mailed: 0 };
        });
      }

      await prisma.documentremoval.update({
        where: { id: removal.id },
        data: { notifiedCount: notifyResult.notified },
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        data: {
          id: updated.id,
          status: "REMOVED",
          removalId: removal.id,
          reasonCode: finalReason,
          reasonLabel: reasonLabel(finalReason),
          notifiedCount: notifyResult.notified,
          mailedCount: notifyResult.mailed,
        },
      });
    }

    // ===== 资料治理 P0-2：恢复被移除的资料（仅管理员 / 所有者） =====
    if (action === "restore_asset") {
      const { workspaceId, assetId } = body;
      if (!workspaceId || !assetId) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId 或 assetId 参数" }, { status: 400 });
      }

      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }

      const role = await getLogicalWorkspaceRole(userId, workspaceId);
      const isManager = role === "ADMIN" || role === "OWNER";
      if (!isManager) {
        return NextResponse.json({ success: false, error: "权限不足，仅空间管理员或所有者可恢复资料" }, { status: 403 });
      }

      const target = await prisma.document.findUnique({ where: { id: assetId } });
      if (!target || target.workspaceId !== workspaceId) {
        return NextResponse.json({ success: false, error: "未找到该资料" }, { status: 404 });
      }
      if (target.visibility === "PRIVATE" && target.uploaderId !== userId) {
        return NextResponse.json(
          { success: false, error: "越权警告：个人私密资料仅上传人本人可处理" },
          { status: 403 }
        );
      }
      if (target.status !== "REMOVED") {
        return NextResponse.json({ success: false, error: "该资料未被移除，无需恢复" }, { status: 400 });
      }

      const updated = await prisma.document.update({
        where: { id: assetId },
        data: { status: "APPROVED", updatedAt: new Date() },
      });

      await prisma.documentremoval.updateMany({
        where: { documentId: assetId, workspaceId, restoredAt: null },
        data: { restoredAt: new Date(), restoredBy: userId },
      });

      await writeAuditLog(userId, "asset:restore", { documentId: assetId, title: target.title }, workspaceId)
        .catch((e) => console.warn("[审计] 资料恢复日志写入失败:", e));

      const selfUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, phone: true },
      });
      await notifyAssetRestored({
        workspaceId,
        documentId: assetId,
        title: target.title,
        restoredByName: selfUser?.name || selfUser?.email || selfUser?.phone || "空间管理员",
        restoredByUserId: userId,
      }).catch((e) => console.warn("[资料通知] 恢复通知发送失败:", (e as Error)?.message));

      return NextResponse.json({ success: true, data: { id: updated.id, status: "APPROVED" } });
    }

    // ===== 资料治理 P0-3：移除单列表（管理员查看历史移除记录，可据此恢复） =====
    if (action === "list_removals") {
      const workspaceId = body?.workspaceId || searchParams.get("workspaceId");
      if (!workspaceId) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId 参数" }, { status: 400 });
      }

      // 仅企业空间成员可访问治理中心（空间管理员/所有者或普通成员）；全局管理员非成员无权限
      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }

      // 移除记录只展示“已生效移除”的真实治理单（APPROVED），
      // 待审核删除申请在删除申请 Tab 中展示；空数据时显示空列表，不注入演示记录。
      const removals = await prisma.documentremoval.findMany({
        where: { workspaceId, status: "APPROVED" },
        orderBy: { removedAt: "desc" },
        take: 100,
      });

      // 治理中心隐私保护：所有角色都只展示公开资料的移除单，私密资料不进入移除/恢复流程
      const docIds = Array.from(new Set(removals.map((r) => r.documentId).filter(Boolean)));
      const docs = docIds.length > 0
        ? await prisma.document.findMany({ where: { id: { in: docIds } }, select: { id: true, visibility: true } })
        : [];
      const privateDocIdSet = new Set(docs.filter((d) => d.visibility === "PRIVATE").map((d) => d.id));
      const publicRemovals = removals.filter((r) => !privateDocIdSet.has(r.documentId));

      const removerIds = Array.from(new Set(publicRemovals.map((r) => r.removedBy)));
      const removers = await prisma.user.findMany({
        where: { id: { in: removerIds } },
        select: { id: true, name: true, email: true, phone: true },
      });
      const removerMap = new Map(removers.map((u) => [u.id, u.name || u.email || u.phone || "空间管理员"]));

      const data = publicRemovals.map((r) => ({
        ...r,
        reasonLabel: reasonLabel(r.reasonCode),
        removedByName: removerMap.get(r.removedBy) || "空间管理员",
      }));

      return NextResponse.json({ success: true, data });
    }

    // ===== 资料治理 P0-4：删除申请列表（仅管理员可见待审核项） =====
    if (action === "list_deletion_requests") {
      const workspaceId = body?.workspaceId || searchParams.get("workspaceId");
      if (!workspaceId) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId 参数" }, { status: 400 });
      }
      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }
      const role = await getLogicalWorkspaceRole(userId, workspaceId);
      if (role !== "ADMIN" && role !== "OWNER") {
        return NextResponse.json({ success: false, error: "仅空间管理员可审核删除申请" }, { status: 403 });
      }

      const removals = await prisma.documentremoval.findMany({
        where: { workspaceId, status: "PENDING" },
        orderBy: { removedAt: "desc" },
        take: 100,
      });

      const requesterIds = Array.from(new Set(removals.map((r) => r.removedBy)));
      const requesters = await prisma.user.findMany({
        where: { id: { in: requesterIds } },
        select: { id: true, name: true, email: true, phone: true },
      });
      const requesterMap = new Map(requesters.map((u) => [u.id, u.name || u.email || u.phone || "空间成员"]));

      const data = removals.map((r) => ({
        ...r,
        reasonLabel: reasonLabel(r.reasonCode),
        requesterName: requesterMap.get(r.removedBy) || "空间成员",
      }));

      return NextResponse.json({ success: true, data });
    }

    // ===== 资料治理 P0-4d：成员私密资料治理台账（仅元数据，不返回内容/预览地址） =====
    if (action === "list_private_governance") {
      const workspaceId = body?.workspaceId || searchParams.get("workspaceId");
      if (!workspaceId) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId 参数" }, { status: 400 });
      }
      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }
      const role = await getLogicalWorkspaceRole(userId, workspaceId);
      if (role !== "ADMIN" && role !== "OWNER") {
        return NextResponse.json({ success: false, error: "仅空间管理员可查看私密治理台账" }, { status: 403 });
      }

      // 仅返回“其他成员”私密资料的元数据；绝不返回 content / summary / filePath / fileUrl
      const docs = (await prisma.document.findMany({
        where: {
          workspaceId,
          visibility: "PRIVATE",
          status: { not: "REMOVED" },
        },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          title: true,
          type: true,
          status: true,
          uploaderId: true,
          fileSize: true,
          fileExt: true,
          originalName: true,
          createdAt: true,
          updatedAt: true,
        },
      })).filter((d) => d.uploaderId && d.uploaderId !== userId);

      const uploaderIds = Array.from(new Set(docs.map((d) => d.uploaderId).filter((id): id is string => !!id)));
      const uploaders = await prisma.user.findMany({
        where: { id: { in: uploaderIds } },
        select: { id: true, name: true, email: true, phone: true },
      });
      const uploaderMap = new Map(uploaders.map((u) => [u.id, u.name || u.email || u.phone || "空间成员"]));

      const data = docs.map((d) => ({
        id: d.id,
        title: d.title,
        type: d.type,
        status: d.status,
        uploaderId: d.uploaderId,
        uploaderName: d.uploaderId ? uploaderMap.get(d.uploaderId) || "空间成员" : "空间成员",
        fileSize: d.fileSize,
        fileTypeLabel: getFileTypeLabel({
          type: d.type,
          ext: d.fileExt,
          title: d.title,
          content: "",
        }),
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }));

      return NextResponse.json({ success: true, data });
    }

    // ===== 资料治理 P0-4e：管理员对成员私密资料发起处理要求（不查看内容，仅通知上传人） =====
    if (action === "notify_private_review") {
      const { workspaceId, assetId, message } = body;
      const reason = (message || "").trim();
      if (!workspaceId || !assetId || !reason) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId、assetId 或处理要求说明" }, { status: 400 });
      }
      if (reason.length < 5) {
        return NextResponse.json({ success: false, error: "处理要求说明不能少于 5 个字" }, { status: 400 });
      }
      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }
      const role = await getLogicalWorkspaceRole(userId, workspaceId);
      if (role !== "ADMIN" && role !== "OWNER") {
        return NextResponse.json({ success: false, error: "仅空间管理员可发起私密资料治理要求" }, { status: 403 });
      }

      const target = await prisma.document.findFirst({
        where: { id: assetId, workspaceId, visibility: "PRIVATE" },
      });
      if (!target || !target.uploaderId || target.uploaderId === userId) {
        return NextResponse.json(
          { success: false, error: "未找到可治理的其他成员私密资料，或该资料已被处理" },
          { status: 404 }
        );
      }

      const requester = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, phone: true },
      });
      const requesterName = requester?.name || requester?.email || requester?.phone || "空间治理人员";

      await writeAuditLog(
        userId,
        "asset:private_review_request",
        { documentId: target.id, title: target.title, message: reason },
        workspaceId
      ).catch((e) => console.warn("[审计] 私密资料治理要求写入失败:", e));

      const notifyResult = await notifyPrivateReviewRequest({
        workspaceId,
        documentId: target.id,
        title: target.title,
        uploaderId: target.uploaderId,
        requesterName,
        message: reason,
      }).catch((e) => {
        console.warn("[资料通知] 私密资料治理要求通知失败:", (e as Error)?.message);
        return { notified: 0, mailed: 0 };
      });

      return NextResponse.json({ success: true, data: { notified: notifyResult.notified } });
    }

    // ===== 资料治理 P0-4b：管理员同意删除申请 → 正式移除并通知其他成员 =====
    if (action === "approve_deletion") {
      const { workspaceId, removalId } = body;
      if (!workspaceId || !removalId) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId 或 removalId 参数" }, { status: 400 });
      }
      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }
      const role = await getLogicalWorkspaceRole(userId, workspaceId);
      if (role !== "ADMIN" && role !== "OWNER") {
        return NextResponse.json({ success: false, error: "仅空间管理员可审核删除申请" }, { status: 403 });
      }

      const removal = await prisma.documentremoval.findUnique({ where: { id: removalId } });
      if (!removal || removal.workspaceId !== workspaceId) {
        return NextResponse.json({ success: false, error: "未找到对应的删除申请" }, { status: 404 });
      }
      if (removal.status !== "PENDING") {
        return NextResponse.json({ success: false, error: "该删除申请已处理，请勿重复操作" }, { status: 400 });
      }

      // 正式移除文档（软删除）；若底层文档已被清理则只推进移除单状态，避免重复报错
      const targetDoc = await prisma.document.findUnique({ where: { id: removal.documentId } });
      if (targetDoc && targetDoc.workspaceId === workspaceId) {
        await prisma.document.update({
          where: { id: removal.documentId },
          data: { status: "REMOVED", updatedAt: new Date() },
        });
      }
      await prisma.documentremoval.update({
        where: { id: removalId },
        data: { status: "APPROVED", removedAt: new Date() },
      });

      await writeAuditLog(
        userId,
        "asset:removal_approve",
        { documentId: removal.documentId, title: removal.titleSnapshot, removalId },
        workspaceId
      ).catch((e) => console.warn("[审计] 删除同意写入失败:", e));

      // 通知除申请人本人外的其他成员（含原上传人）：资料已被移除
      const selfUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, phone: true },
      });
      const removedByName = selfUser?.name || selfUser?.email || selfUser?.phone || "空间管理员";
      const usage = await getAssetUsageCounts(workspaceId, [removal.documentId]).catch(() => null);
      const notifyResult = await notifyAssetRemoved({
        workspaceId,
        documentId: removal.documentId,
        title: removal.titleSnapshot,
        reasonCode: removal.reasonCode,
        reasonDetail: removal.reasonDetail,
        removedByName,
        removedByUserId: userId,
        uploaderId: removal.uploaderId,
        removedAt: new Date(),
        usage,
        excludeUserIds: [removal.removedBy],
      }).catch((e) => {
        console.warn("[资料通知] 移除通知发送失败:", (e as Error)?.message);
        return { notified: 0, mailed: 0 };
      });

      await prisma.documentremoval.update({
        where: { id: removalId },
        data: { notifiedCount: notifyResult.notified },
      }).catch(() => {});

      return NextResponse.json({ success: true, data: { status: "APPROVED" } });
    }

    // ===== 资料治理 P0-4c：管理员驳回删除申请（必须填写驳回意见） =====
    if (action === "reject_deletion") {
      const { workspaceId, removalId, rejectReason } = body;
      if (!workspaceId || !removalId) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId 或 removalId 参数" }, { status: 400 });
      }
      const reason = (rejectReason || "").trim();
      if (!reason) {
        return NextResponse.json({ success: false, error: "驳回删除申请必须填写驳回意见" }, { status: 400 });
      }
      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }
      const role = await getLogicalWorkspaceRole(userId, workspaceId);
      if (role !== "ADMIN" && role !== "OWNER") {
        return NextResponse.json({ success: false, error: "仅空间管理员可审核删除申请" }, { status: 403 });
      }

      const removal = await prisma.documentremoval.findUnique({ where: { id: removalId } });
      if (!removal || removal.workspaceId !== workspaceId) {
        return NextResponse.json({ success: false, error: "未找到对应的删除申请" }, { status: 404 });
      }
      if (removal.status !== "PENDING") {
        return NextResponse.json({ success: false, error: "该删除申请已处理，请勿重复操作" }, { status: 400 });
      }

      await prisma.documentremoval.update({
        where: { id: removalId },
        data: { status: "REJECTED", rejectReason: reason },
      });

      await writeAuditLog(
        userId,
        "asset:removal_reject",
        { documentId: removal.documentId, title: removal.titleSnapshot, removalId, rejectReason: reason },
        workspaceId
      ).catch((e) => console.warn("[审计] 删除驳回写入失败:", e));

      // 通知申请人：删除申请被驳回，并附驳回意见
      await notifyDeletionRejected({
        workspaceId,
        documentId: removal.documentId,
        title: removal.titleSnapshot,
        requesterId: removal.removedBy,
        rejectReason: reason,
      }).catch((e) => console.warn("[资料通知] 驳回通知发送失败:", (e as Error)?.message));

      return NextResponse.json({ success: true, data: { status: "REJECTED" } });
    }

    // 资料使用量统计：检测是否仍被分享/评论/版本/子资料引用
    async function getAssetUsageCounts(workspaceId: string, ids: string[]): Promise<AssetUsage> {
      if (!ids.length) return { sharesActive: 0, comments: 0, versions: 0, childDocs: 0 };
      const now = new Date();
      const [sharesActive, comments, versions, childDocs] = await Promise.all([
        prisma.documentshare.count({
          where: { workspaceId, documentId: { in: ids }, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        }),
        prisma.documentcomment.count({ where: { workspaceId, documentId: { in: ids } } }),
        prisma.documentversion.count({ where: { documentId: { in: ids } } }),
        prisma.document.count({ where: { workspaceId, parentId: { in: ids }, status: { not: "REMOVED" } } }),
      ]);
      return { sharesActive, comments, versions, childDocs };
    }

    // ===== 资料治理 P0-4：检测资料是否被其他功能引用（分享/评论/版本/子资料） =====
    if (action === "get_asset_usage") {
      const workspaceId = body?.workspaceId || searchParams.get("workspaceId");
      const ids: string[] = Array.isArray(body?.assetIds)
        ? body.assetIds
        : body?.documentId
          ? [body.documentId]
          : [];
      if (!workspaceId || ids.length === 0) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId 或 assetIds 参数" }, { status: 400 });
      }
      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }
      const usage = await getAssetUsageCounts(workspaceId, ids);
      return NextResponse.json({ success: true, data: usage });
    }

    // ===== 资料治理 P0-5：成员申请恢复被移除的资料（7 日窗口内，通知管理员） =====
    if (action === "request_restore_asset") {
      const { workspaceId, assetId, message } = body;
      if (!workspaceId || !assetId) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId 或 assetId 参数" }, { status: 400 });
      }
      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }

      const target = await prisma.document.findUnique({ where: { id: assetId } });
      if (!target || target.workspaceId !== workspaceId) {
        return NextResponse.json({ success: false, error: "未找到该资料" }, { status: 404 });
      }
      if (target.status !== "REMOVED") {
        return NextResponse.json({ success: false, error: "该资料未被移除，无需申请恢复" }, { status: 400 });
      }
      const removal = await prisma.documentremoval.findFirst({
        where: { documentId: assetId, workspaceId, restoredAt: null },
        orderBy: { removedAt: "desc" },
      });
      if (!removal) {
        return NextResponse.json({ success: false, error: "未找到对应的移除记录" }, { status: 404 });
      }

      const deadline = new Date(removal.removedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (Date.now() > deadline.getTime()) {
        return NextResponse.json({ success: false, error: "已超过 7 日恢复期，无法在线申请恢复，请联系管理员线下处理" }, { status: 400 });
      }

      const selfUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, phone: true },
      });
      const requesterName = selfUser?.name || selfUser?.email || selfUser?.phone || "空间成员";
      const dl = deadline;
      const deadlineText = `${dl.getFullYear()}-${String(dl.getMonth() + 1).padStart(2, "0")}-${String(dl.getDate()).padStart(2, "0")} ${String(dl.getHours()).padStart(2, "0")}:${String(dl.getMinutes()).padStart(2, "0")} 前`;

      const notifyResult = await notifyRestoreRequested({
        workspaceId,
        title: target.title,
        requesterName,
        requesterId: userId,
        message: (message || "").trim() || null,
        removedAt: removal.removedAt,
        deadlineText,
      }).catch((e) => {
        console.warn("[资料通知] 恢复申请通知发送失败:", (e as Error)?.message);
        return { notified: 0, mailed: 0 };
      });

      await writeAuditLog(userId, "asset:restore_request", { documentId: assetId, title: target.title, message }, workspaceId)
        .catch((e) => console.warn("[审计] 恢复申请日志写入失败:", e));

      // 持久化恢复申请状态，便于列表遮罩层同步并避免重复申请
      await prisma.documentremoval.updateMany({
        where: { documentId: assetId, workspaceId, restoredAt: null },
        data: {
          restoreRequestedAt: new Date(),
          restoreRequestMessage: (message || "").trim() || null,
        },
      }).catch((e) => console.warn("[资料治理] 更新恢复申请状态失败:", e));

      return NextResponse.json({ success: true, data: { notified: notifyResult.notified, deadline: deadline.toISOString() } });
    }

    // ===== 资料治理 P0-6：上传人确认被移除的资料（转入个人私密，可在治理中心申请恢复） =====
    if (action === "confirm_removed_asset") {
      const { workspaceId, assetId } = body;
      if (!workspaceId || !assetId) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId 或 assetId 参数" }, { status: 400 });
      }
      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }

      const target = await prisma.document.findUnique({ where: { id: assetId } });
      if (!target || target.workspaceId !== workspaceId) {
        return NextResponse.json({ success: false, error: "未找到该资料" }, { status: 404 });
      }
      if (target.status !== "REMOVED") {
        return NextResponse.json({ success: false, error: "该资料未被移除，无需确认" }, { status: 400 });
      }
      // 仅上传人本人可确认（移除的管理员无需确认）
      if (target.uploaderId !== userId) {
        return NextResponse.json({ success: false, error: "仅资料上传人可执行确认操作" }, { status: 403 });
      }

      // 转入个人私密；移除单记录确认时间，便于治理中心与列表状态同步
      await prisma.document.update({
        where: { id: assetId },
        data: { visibility: "PRIVATE", updatedAt: new Date() },
      });
      return NextResponse.json({ success: true, data: { confirmed: true } });
    }

    // ===== 资料治理 P0-7：删除变更记录 / 操作日志（支持单条及批量删除；管理员可删任何记录，普通成员仅可删本人私密资料记录） =====
    if (action === "delete_operation_log" || action === "delete_log") {
      const { workspaceId, logId, logIds } = body;
      const targetIds: string[] = Array.isArray(logIds) ? logIds : (logId ? [logId] : []);
      if (!workspaceId || targetIds.length === 0) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId 或 logId/logIds 参数" }, { status: 400 });
      }
      // 仅企业空间成员可访问治理中心（空间管理员/所有者或普通成员）；全局管理员非成员无权限
      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }

      const isManager = await isGovernanceAdminRole(userId, workspaceId);

      const targetLogs = await prisma.operationlog.findMany({
        where: { id: { in: targetIds }, workspaceId },
      });
      if (targetLogs.length === 0) {
        return NextResponse.json({ success: false, error: "未找到可删除的变更记录" }, { status: 404 });
      }

      for (const tLog of targetLogs) {
        let isPrivateLog = false;
        let detailsObj: any = tLog.details;
        if (typeof detailsObj === "string") {
          try { detailsObj = JSON.parse(detailsObj); } catch (e) {}
        }
        if (detailsObj && typeof detailsObj === "object") {
          if (detailsObj.visibility === "PRIVATE" || detailsObj.isPrivate === true) {
            isPrivateLog = true;
          } else if (detailsObj.documentId) {
            const doc = await prisma.document.findUnique({
              where: { id: detailsObj.documentId },
              select: { visibility: true, uploaderId: true },
            });
            if (doc && doc.visibility === "PRIVATE") {
              isPrivateLog = true;
            }
          }
        }
        const isSelfLog = tLog.userId === userId || (detailsObj && typeof detailsObj === "object" && detailsObj.uploaderId === userId);
        const canDelete = isManager || (isPrivateLog && isSelfLog);
        if (!canDelete) {
          return NextResponse.json(
            { success: false, error: "权限不足：包含您无权删除的公开资料变更记录" },
            { status: 403 }
          );
        }
      }

      await prisma.operationlog.deleteMany({
        where: { id: { in: targetLogs.map((l) => l.id) } },
      });

      // 持久化记录管理员删除记录的累计总条数
      if (isManager) {
        const configKey = `admin_deleted_log_count_${workspaceId}`;
        const existing = await prisma.systemconfig.findUnique({ where: { key: configKey } }).catch(() => null);
        const currentCount = existing ? parseInt(existing.value || "0") : 0;
        const newCount = currentCount + targetLogs.length;
        await prisma.systemconfig.upsert({
          where: { key: configKey },
          create: { key: configKey, value: String(newCount), updatedAt: new Date() },
          update: { value: String(newCount), updatedAt: new Date() },
        }).catch(() => {});
      }

      return NextResponse.json({ success: true, count: targetLogs.length, message: "变更记录已删除" });
    }

    // ===== 定期物理清理 1 年前历史日志 =====
    if (action === "clear_expired_logs") {
      const { workspaceId } = body;
      if (!workspaceId) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId 参数" }, { status: 400 });
      }
      const isManager = await isGovernanceAdminRole(userId, workspaceId);
      if (!isManager) {
        return NextResponse.json({ success: false, error: "权限不足：仅空间管理员可定期清理历史审计日志" }, { status: 403 });
      }
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const deleteRes = await prisma.operationlog.deleteMany({
        where: {
          workspaceId,
          createdAt: { lt: oneYearAgo }
        }
      });

      return NextResponse.json({
        success: true,
        count: deleteRes.count,
        message: `已定期清理满 1 年历史日志，共清除 ${deleteRes.count} 条记录`
      });
    }

    // ===== 资料治理 P0-7：管理员彻底删除已移除资料（资料 + 移除记录一并清理，审计留痕） =====
    if (action === "delete_removal_record") {
      const { workspaceId, removalId } = body;
      if (!workspaceId || !removalId) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId 或 removalId 参数" }, { status: 400 });
      }

      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }

      const isManager = await isGovernanceAdminRole(userId, workspaceId);
      if (!isManager) {
        return NextResponse.json({ success: false, error: "权限不足，仅空间管理员或所有者可彻底删除资料" }, { status: 403 });
      }

      const record = await prisma.documentremoval.findFirst({
        where: { id: removalId, workspaceId },
      });
      if (!record) {
        return NextResponse.json({ success: false, error: "未找到可彻底删除的移除记录，请刷新后重试" }, { status: 404 });
      }
      if (record.status !== "APPROVED") {
        return NextResponse.json(
          { success: false, error: "该移除记录尚未生效或已驳回，请先在删除申请中处理" },
          { status: 400 }
        );
      }
      if (record.restoredAt) {
        return NextResponse.json(
          { success: false, error: "该资料已恢复，不能通过移除记录彻底删除，请从资料库中处理" },
          { status: 400 }
        );
      }

      const targetDoc = await prisma.document.findFirst({
        where: { id: record.documentId, workspaceId },
      });
      const docTitle = targetDoc?.title || record.titleSnapshot || "未知资料";
      if (targetDoc && targetDoc.visibility === "PRIVATE" && targetDoc.uploaderId !== userId) {
        return NextResponse.json(
          { success: false, error: "越权警告：个人私密资料仅上传人本人可彻底删除" },
          { status: 403 }
        );
      }
      if (targetDoc && targetDoc.status !== "REMOVED") {
        return NextResponse.json(
          { success: false, error: "该资料当前仍在资料库中，请先移除再执行彻底删除" },
          { status: 400 }
        );
      }

      if (targetDoc) {
        // 先移除底层资料，再清理移除单；同资料的历史移除单也一并清理，避免残留“找不到文档”的记录
        await prisma.document.delete({ where: { id: targetDoc.id } });
        await prisma.documentremoval.deleteMany({
          where: { documentId: targetDoc.id, workspaceId },
        });
        await deleteAssetFile(targetDoc.filePath);
      } else {
        await prisma.documentremoval.deleteMany({
          where: { documentId: record.documentId, workspaceId },
        });
      }

      await writeAuditLog(
        userId,
        "asset:removal_record_delete",
        {
          removalId,
          documentId: record.documentId,
          title: docTitle,
          permanentlyDeleted: true,
        },
        workspaceId
      ).catch((e) => console.warn("[审计] 彻底删除资料审计日志写入失败:", e));

      return NextResponse.json({
        success: true,
        data: { id: removalId, title: docTitle, permanentlyDeleted: true },
      });
    }

    // ===== 查询当前用户的资料操作权限（资料页按钮显隐与治理鉴权） =====
    if (action === "get_asset_permissions") {
      const wsId = body?.workspaceId || searchParams.get("workspaceId");
      if (!wsId) {
        return NextResponse.json({ success: false, error: "缺少 workspaceId 参数" }, { status: 400 });
      }

      const access = await checkWorkspaceAccess(userId, wsId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }

      const mine = await getAssetPermissions(userId, wsId);
      return NextResponse.json({ success: true, data: { mine } });
    }

    // 资料公开申请/发布接口：管理员可直接公开，普通成员发起公开审核
    if (action === "request_publish") {
      const { assetId } = body;
      if (!workspaceId || !assetId) {
        return NextResponse.json({ success: false, error: "缺少必要的 workspaceId 或 assetId 参数" }, { status: 400 });
      }

      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }

      const targetDoc = await prisma.document.findUnique({ where: { id: assetId } });
      if (!targetDoc || targetDoc.workspaceId !== workspaceId) {
        return NextResponse.json({ success: false, error: "未找到目标资料文档" }, { status: 404 });
      }

      const role = await getLogicalWorkspaceRole(userId, workspaceId);
      const isManager = role === "ADMIN" || role === "OWNER";

      let newStatus = "APPROVED";
      let newVis = "PUBLIC";
      let isDirectPublic = true;

      if (!isManager) {
        // 普通成员：发起公开申请，状态变为 PENDING 待审核，等待管理员审批
        newStatus = "PENDING";
        newVis = "PUBLIC";
        isDirectPublic = false;
      }

      const updated = await prisma.document.update({
        where: { id: assetId },
        data: {
          status: newStatus,
          visibility: newVis,
          updatedAt: new Date()
        }
      });

      await writeAuditLog(userId, isDirectPublic ? "asset:publish_direct" : "asset:request_publish", { documentId: assetId, title: updated.title }, workspaceId)
        .catch((e) => console.warn("[审计] 资料公开日志写入失败:", e));

      return NextResponse.json({
        success: true,
        data: {
          ...updated,
          status: newStatus,
          visibility: newVis,
          isDirectPublic
        }
      });
    }

    // 批量删除资料接口
    if (action === "batch_delete_assets") {
      const { assetIds } = body;
      if (!workspaceId || !Array.isArray(assetIds) || assetIds.length === 0) {
        return NextResponse.json({ success: false, error: "缺少有效的 workspaceId 或 assetIds 参数" }, { status: 400 });
      }

      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }

      const deleteRes = await prisma.document.deleteMany({
        where: {
          id: { in: assetIds },
          workspaceId
        }
      });

      await writeAuditLog(userId, "asset:batch_delete", { count: deleteRes.count, assetIds }, workspaceId)
        .catch((e) => console.warn("[审计] 批量删除资料日志写入失败:", e));

      return NextResponse.json({
        success: true,
        count: deleteRes.count
      });
    }

    // ===== 资料治理：批量移除资料（软删除 + 移除单 + 全员通知） =====
    if (action === "batch_remove_assets") {
      const { assetIds, reasonCode, reasonDetail } = body;
      if (!workspaceId || !Array.isArray(assetIds) || assetIds.length === 0) {
        return NextResponse.json({ success: false, error: "缺少有效的 workspaceId 或 assetIds 参数" }, { status: 400 });
      }

      const validReasons = ["VIOLATION", "EXPIRED", "COPYRIGHT", "OTHER"];
      const finalReason = validReasons.includes(reasonCode) ? reasonCode : "OTHER";
      const detail = (reasonDetail || "").trim();
      if (finalReason === "OTHER" && detail.length < 5) {
        return NextResponse.json({ success: false, error: "选择「其他原因」时必须填写不少于 5 个字的补充说明" }, { status: 400 });
      }

      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }
      const role = await getLogicalWorkspaceRole(userId, workspaceId);
      const isManager = role === "ADMIN" || role === "OWNER";

      const removedAt = new Date();
      const selfUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true, phone: true },
      });
      const removedByName = selfUser?.name || selfUser?.email || selfUser?.phone || "空间管理员";

      const titles: string[] = [];
      const byUploader: Record<string, string[]> = {};
      const removedIds: string[] = [];
      let removedCount = 0;
      let skippedCount = 0;
      const removalRows: any[] = [];

      for (const assetId of assetIds) {
        const target = await prisma.document.findUnique({ where: { id: assetId } });
        if (!target || target.workspaceId !== workspaceId) { skippedCount++; continue; }
        const isSelfUploaded = Boolean(target.uploaderId && target.uploaderId === userId);
        // 越权拦截：非管理员/所有者只能移除本人上传的资料
        if (!isManager && !isSelfUploaded) { skippedCount++; continue; }
        // 私密资料严格本人隔离：管理员也不得批量处理他人私密资料
        if (target.visibility === "PRIVATE" && target.uploaderId !== userId) { skippedCount++; continue; }

        if (target.visibility === "PRIVATE") {
          // 个人私密资料：仅上传人本人可删除，物理直接抹除，不生成治理记录，也不通知任何人
          try {
            await prisma.document.delete({ where: { id: assetId } });
            await deleteAssetFile(target.filePath);
          } catch {
            await prisma.document.update({
              where: { id: assetId },
              data: { status: "REMOVED", updatedAt: removedAt },
            });
          }
          removedIds.push(target.id);
          removedCount++;
          await writeAuditLog(
            userId,
            "asset:remove_private",
            { documentId: target.id, title: target.title },
            workspaceId
          ).catch(() => {});
          continue;
        }

        // 公开资料：标记 REMOVED 并生成 documentremoval 治理记录
        await prisma.document.update({
          where: { id: assetId },
          data: { status: "REMOVED", updatedAt: removedAt },
        });

        const removal = await prisma.documentremoval.create({
          data: {
            id: `rm_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            documentId: assetId,
            workspaceId,
            titleSnapshot: target.title,
            uploaderId: target.uploaderId || null,
            removedBy: userId,
            reasonCode: finalReason,
            reasonDetail: detail || null,
            removedAt,
          },
        });
        removalRows.push(removal);

        // 仅把公开资料纳入批量通知列表
        titles.push(target.title);
        if (target.uploaderId) {
          (byUploader[target.uploaderId] ||= []).push(target.title);
        }
        removedIds.push(target.id);
        removedCount++;
      }

      let notifiedCount = 0;
      // 仅当包含公开资料（titles.length > 0）时才触发批量站内通知
      if (titles.length > 0) {
        const usage = await getAssetUsageCounts(workspaceId, removedIds).catch(() => null);
        const notifyResult = await notifyAssetsBatchRemoved({
          workspaceId,
          titles,
          reasonCode: finalReason,
          reasonDetail: detail,
          removedByName,
          removedByUserId: userId,
          byUploader,
          removedAt,
          usage,
        }).catch((e) => {
          console.warn("[资料通知] 批量移除通知发送失败:", (e as Error)?.message);
          return { notified: 0, mailed: 0 };
        });
        notifiedCount = notifyResult.notified;

        // 回填各移除单的通知计数
        await Promise.all(
          removalRows.map((rm) =>
            prisma.documentremoval.update({ where: { id: rm.id }, data: { notifiedCount } }).catch(() => {})
          )
        );

        await writeAuditLog(userId, "asset:batch_remove", {
          removedCount,
          skippedCount,
          reasonCode: finalReason,
          reasonDetail: detail,
          titles,
        }, workspaceId).catch((e) => console.warn("[审计] 批量移除日志写入失败:", e));
      }

      return NextResponse.json({
        success: true,
        data: { removedCount, skippedCount, notifiedCount },
      });
    }

    // 批量公开资料接口（管理员直接批量公开，普通成员批量提交公开审核）
    if (action === "batch_publish_assets") {
      const { assetIds } = body;
      if (!workspaceId || !Array.isArray(assetIds) || assetIds.length === 0) {
        return NextResponse.json({ success: false, error: "缺少有效的 workspaceId 或 assetIds 参数" }, { status: 400 });
      }

      const access = await checkWorkspaceAccess(userId, workspaceId);
      if (access.error) {
        return NextResponse.json({ success: false, error: access.error.message }, { status: access.error.status });
      }

      const role = await getLogicalWorkspaceRole(userId, workspaceId);
      const isManager = role === "ADMIN" || role === "OWNER";

      const targetStatus = isManager ? "APPROVED" : "PENDING";
      const targetVis = "PUBLIC";

      const updateRes = await prisma.document.updateMany({
        where: {
          id: { in: assetIds },
          workspaceId
        },
        data: {
          status: targetStatus,
          visibility: targetVis,
          updatedAt: new Date()
        }
      });

      await writeAuditLog(userId, isManager ? "asset:batch_publish_direct" : "asset:batch_request_publish", { count: updateRes.count, assetIds }, workspaceId)
        .catch((e) => console.warn("[审计] 批量公开资料日志写入失败:", e));

      return NextResponse.json({
        success: true,
        count: updateRes.count,
        isDirectPublic: isManager,
        status: targetStatus,
        visibility: targetVis
      });
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

      let finalContent = content || "";

      // 当关联 sourceTaskId 时，自动从任务 result 的 outputData 组装完整 Markdown 结构
      if (sourceTaskId) {
        const sourceTaskObj = await prisma.componenttask.findUnique({
          where: { id: sourceTaskId },
          select: { result: true },
        });

        if (sourceTaskObj?.result) {
          const rawResult: any = sourceTaskObj.result;
          const outputData = rawResult?.outputData || rawResult;

          // 仅当传入 content 为空或为简短摘要时，根据 outputData 生成完整 Markdown 结构
          const isBasicSummary = !finalContent || finalContent.trim().length < 100 || !finalContent.includes("##");

          if (isBasicSummary && outputData && typeof outputData === "object") {
            const summaryText = outputData.summary || finalContent || "暂无成果摘要";
            const mdSections: string[] = [`# 成果摘要\n${summaryText}`];

            // 关键结论
            if (Array.isArray(outputData.conclusions) && outputData.conclusions.length > 0) {
              const list = outputData.conclusions.map((item: any, idx: number) => `${idx + 1}. ${typeof item === "string" ? item : item.title || JSON.stringify(item)}`).join("\n");
              mdSections.push(`## 关键结论\n${list}`);
            }

            // 偏离分析
            if (Array.isArray(outputData.deviations) && outputData.deviations.length > 0) {
              const rows = outputData.deviations
                .map((d: any) => `| ${d.item || d.clause || d.name || "-"} | ${d.rfp || d.requirement || "-"} | ${d.actual || d.contrast || "-"} | ${d.risk || d.level || "-"} |`)
                .join("\n");
              mdSections.push(`## 偏离分析\n| 条款 | 要求 | 比对 | 风险 |\n| --- | --- | --- | --- |\n${rows}`);
            }

            // 风险清单
            if (outputData.risks) {
              const risksArr = Array.isArray(outputData.risks) ? outputData.risks : [outputData.risks];
              if (risksArr.length > 0) {
                const risksText = risksArr.map((r: any) => typeof r === "string" ? `- ${r}` : `- [${r.level || "风险"}] ${r.title || r.desc || JSON.stringify(r)}`).join("\n");
                mdSections.push(`## 风险清单\n${risksText}`);
              }
            }

            // 建议清单
            if (outputData.advices || outputData.suggestions) {
              const advicesArr = outputData.advices || outputData.suggestions;
              const advicesList = Array.isArray(advicesArr) ? advicesArr : [advicesArr];
              if (advicesList.length > 0) {
                const advicesText = advicesList.map((a: any) => typeof a === "string" ? `- ${a}` : `- ${a.title || a.desc || JSON.stringify(a)}`).join("\n");
                mdSections.push(`## 建议\n${advicesText}`);
              }
            }

            finalContent = mdSections.join("\n\n");
          }
        }
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
          content: finalContent,
          type: "knowledge",
          status: finalStatus,
          parentId: sourceTaskId || null,
          uploaderId: userId,
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
          uploaderId: doc.uploaderId || null,
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
      const { knowledgeId, approve, comment, reviewComment } = body;
      const finalComment = (comment || reviewComment || "").trim();
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
          details: { knowledgeId, workspaceId, userId, status: approve ? "active" : "rejected", reviewer: userId, comment: finalComment },
        },
      });

      return NextResponse.json({
        success: true,
        data: {
          id: updated.id,
          title: updated.title,
          status: updated.status === "active" ? "APPROVED" : "REJECTED",
          createdAt: updated.createdAt,
          reviewComment: finalComment,
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

    // 归档任务记录（仅变更 status 为 ARCHIVED，保留在数据库中）
    if (action === "archive_task" || action === "archive-task") {
      const targetTaskId = body.taskId || searchParams.get("taskId");
      const targetWsId = workspaceId || body.workspaceId || searchParams.get("workspaceId");

      if (!targetTaskId || !targetWsId) {
        return NextResponse.json({
          success: false,
          error: "缺少必要的 workspaceId 或 taskId 参数"
        }, { status: 400 });
      }

      const isMember = await requireWorkspaceMembership(userId, targetWsId);
      if (!isMember) {
        return NextResponse.json({
          success: false,
          error: "越权警告：您不属于该工作空间，无权归档任务"
        }, { status: 403 });
      }

      const existingTask = await prisma.componenttask.findFirst({
        where: { id: targetTaskId, tenantId: targetWsId }
      });

      if (!existingTask) {
        return NextResponse.json({
          success: false,
          error: "未在该工作空间中找到对应任务"
        }, { status: 404 });
      }

      await prisma.componenttask.update({
        where: { id: targetTaskId },
        data: { status: "ARCHIVED", updatedAt: new Date() }
      });

      // 任务归档补全审计日志记录
      await prisma.operationlog.create({
        data: {
          id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId,
          workspaceId: targetWsId,
          action: "ARCHIVE_TASK",
          resource: "TASK",
          details: {
            taskId: targetTaskId,
            workspaceId: targetWsId,
            userId,
            archivedAt: new Date().toISOString(),
          },
        },
      });

      return NextResponse.json({ success: true });
    }

    // 从数据库中真实物理擦除/删除特定任务记录（前台不再使用，仅允许平台管理员调用）
    if (action === "delete-task" || action === "delete_task") {
      const targetTaskId = searchParams.get("taskId") || body.taskId;
      if (!targetTaskId) {
        return NextResponse.json({ 
          success: false, 
          error: "缺少必要的 taskId 参数" 
        }, { status: 400 });
      }

      // 仅允许平台管理员调用，普通用户拦截返回 403
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!currentUser || !isAdminRole(currentUser.role || "")) {
        return NextResponse.json({
          success: false,
          error: "越权警告：仅平台管理员可执行物理擦除/删除任务操作",
        }, { status: 403 });
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

      // 更新统计 (仅更新累计调用次数与最近使用时间，不创建任何未执行的任务记录，不扣除算力点)
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
      error: "服务器内部错误",
      details: process.env.NODE_ENV === "development" && error instanceof Error
        ? error.message
        : undefined,
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
