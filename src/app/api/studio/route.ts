export const dynamic = "force-dynamic"; // Trigger Turbopack Cache Rebuild 2026-08-31

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { validateUser } from "@/lib/auth";
import { isAdminRole } from "@/lib/auth-admin";
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
import { addNotification } from "@/lib/notifications-store";
import { generateSmartSummary } from "@/lib/smart-summary";
import { saveAssetFile, deleteAssetFile, readAssetFile } from "@/lib/file-store";
import { getFileExtension } from "@/lib/file-type";

// 文件/资料文本提取统一走可取消超时入口（内部 AbortController，超时真正终止底层 OCR worker）
const TEXT_EXTRACT_TIMEOUT_MS = 60000;

async function readDocumentFileText(filePath: string, fileName: string): Promise<string> {
  try {
    const buf = await readAssetFile(filePath);
    return await extractTextFromBufferWithTimeout(buf, fileName, "", TEXT_EXTRACT_TIMEOUT_MS);
  } catch {
    return "";
  }
}
import { extractTextFromBufferWithTimeout } from "@/lib/text-extract";
/** 合同 MIME 白名单匹配（服务端唯一依据：文件扩展名 + 真实 MIME，支持多主材料逐文件校验） */
function isAcceptedFileMime(accepted: string[], fileName: string, mimeType: string): boolean {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  const extWithDot = "." + ext;
  const mimeMap: Record<string, string[]> = {
    txt: ["text/plain"],
    md: ["text/markdown", "text/plain"],
    markdown: ["text/markdown", "text/plain"],
    pdf: ["application/pdf"],
    docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    doc: ["application/msword"],
    png: ["image/png"],
    jpg: ["image/jpeg"],
    jpeg: ["image/jpeg"],
    json: ["application/json", "text/plain"],
    csv: ["text/csv", "text/plain"],
  };
  const mapped = mimeMap[ext] || [];
  const raw = (mimeType || "").toLowerCase().trim();
  return accepted.some((m) => {
    const lower = m.toLowerCase().trim();
    return (
      lower === "*" ||
      lower === "*/*" ||
      lower === extWithDot ||
      lower.endsWith(extWithDot) ||
      mapped.includes(lower) ||
      (raw !== "" && (lower === raw || (lower.endsWith("/*") && raw.startsWith(lower.slice(0, -1)))))
    );
  });
}
import { UNLIMITED_TOKEN, isUnlimitedTokenLimit, getMembershipTokenLimit } from "@/lib/quota-token";
import {
  consumePoints,
  InsufficientPointsError,
  IdempotencyStateUnknownError,
  refundConsumedPoints,
  getBalanceSummary,
  type ConsumeResult,
  type ConsumeDetail,
  type ConsumeDetailKind,
} from "@/lib/credit-service";
import { clearServerCache } from "@/lib/serverCache";
import {
  COST_BASELINE_PLACEHOLDER,
  getComponentCostBaseline,
  renderCostBaselineText,
} from "@/lib/component-cost-baseline";
import { enqueueRefundRecovery } from "@/lib/refund-recovery";
import { resolveTasksRefundMetaMap } from "@/lib/refund-status";
import {
  resolveDefaultDeployment,
  getPlatformDefaultDeploymentCapabilities,
  calculateMissingCapabilities,
  type ResolvedModelPlan,
} from "@/lib/model-registry";
import {
  estimatePoints,
  splitTokenEstimate,
  resolvePricingSource,
  computeDepositTokenBounds,
} from "@/lib/billing/pricing-center";
import {
  isComponentSettlementEnabled,
  loadBillingConfig,
} from "@/lib/billing/billing-config";
import {
  buildRegistryPricingSnapshot,
  evaluateSettlementReadiness,
  type RegistryPricingSnapshot,
} from "@/lib/model-pricing";
import {
  isTokenSettlementFeatureEnabled,
  createSettlementHold,
  consumeAndCreateSettlementHold,
  completeSettlement,
  releaseSettlementHold,
  enqueueSettlementRecovery,
  type CompleteSettlementResult,
} from "@/lib/token-settlement-service";
import { extractTaskExecutionMeta } from "@/lib/task-execution-meta";
import { deriveCatalogComponentReadiness } from "@/lib/component-readiness-view";
import {
  deriveCatalogContractView,
  serializeTaskListItem,
  serializeTaskDetailItem,
  deriveTaskContractView,
  type CatalogContractView,
  type TaskDetailExecutionMeta,
} from "@/lib/task-query-helpers";
import { getDefaultCatalogComponentIds } from "@/lib/workspaceInit";
import { BATCH_2C } from "@/lib/component-contract/catalog-contracts-c12-c15";

// 受控候选元数据字典（只读依据，严格区分于已发布的数据库激活合同）
const CANDIDATE_COMPONENTS_MAP = new Map(
  BATCH_2C.map((item) => [item.componentId.trim().toUpperCase(), { contract: item.contract, analysis: item.analysis }]),
);

import {
  createModelAdapter,
  getModelTimeoutMs,
  ModelAdapterError,
  type ModelAdapter,
  type ModelExecutionUsage,
  type ModelExecutionResult,
} from "@/lib/model-adapter";
import {
  buildSourceMaterialPrompt,
  summarizeText,
  isPrivateDocumentForbidden,
  shouldRefundOnFailure,
  ContractValidationError,
} from "@/lib/component-runtime-utils";
import { buildResultArtifact, type ResultArtifact } from "@/lib/component-contract/artifact";
import { validateModelOutput } from "@/lib/component-contract/validators";
import {
  getActiveContractSnapshot,
  ComponentContractError,
  type ComponentContract,
  type ComponentContractSnapshot,
} from "@/lib/component-contract";
import { extractRequiredCapabilities } from "@/lib/component-contract/capabilities";

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
export async function runStudioGet(request: NextRequest, deps: StudioExecutionDeps) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action");
    // 依赖注入边界（请求级）：生产缺省使用真实单例，测试传入内存 fake
    const ed: StudioExecutionDeps = deps;
    const prisma = ed.prisma;
    const getUserId = ed.getUserId;
    const requireWorkspaceMembership = ed.requireWorkspaceMembership;
    const requireWorkspacePermission = ed.requireWorkspacePermission;

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

      // 组件合同真实状态（来自 component_contract 表，作为前端诚实化展示的唯一真源）：
      // 仅查询当前激活合同，得出 lifecycle / 是否 PUBLISHED / requiredCapabilities。
      const activeContractIds = components
        .map((c) => c.activeContractId)
        .filter((id): id is string => Boolean(id));
      const activeContracts = activeContractIds.length
        ? await prisma.componentcontract.findMany({
            where: { id: { in: activeContractIds } },
            select: { id: true, lifecycle: true, contractVersion: true, contract: true },
          })
        : [];
      const contractInfoMap = new Map<
        string,
        {
          contractVersion: string | null;
          lifecycle: string | null;
          requiredCapabilities: string[];
          inputKind: string | null;
          textConstraints: unknown;
          formConstraints: unknown;
          fileConstraints: unknown;
          outputKind: string | null;
          disclaimer: string | null;
          requireHumanReview: boolean;
          usesCostBaseline: boolean;
          fullContract: ComponentContract | null;
        }
      >();
      let anyUsesCostBaseline = false;
      for (const ac of activeContracts) {
        const c = ac.contract as
          | {
              executionPlan?: { steps?: Array<{ requiredCapabilities?: string[]; promptTemplate?: string }> };
              input?: { kind?: string; formConstraints?: unknown; fileConstraints?: unknown };
            }
          | null;
        const reqCaps = extractRequiredCapabilities(c);
        // 合同是否消费「真实历史成本/工时基准」占位符（决定是否需要向前端暴露基准状态）
        const usesCostBaseline = (c?.executionPlan?.steps ?? []).some(
          (s) => typeof s?.promptTemplate === "string" && s.promptTemplate.includes(COST_BASELINE_PLACEHOLDER),
        );
        if (usesCostBaseline) anyUsesCostBaseline = true;
        const full = (ac.contract ?? null) as ComponentContract | null;
        contractInfoMap.set(ac.id, {
          contractVersion: ac.contractVersion || full?.contractVersion || null,
          lifecycle: ac.lifecycle,
          requiredCapabilities: reqCaps,
          inputKind: (c as ComponentContract | null)?.input?.kind ?? null,
          textConstraints: (c as ComponentContract | null)?.input?.textConstraints ?? null,
          formConstraints: (c as ComponentContract | null)?.input?.formConstraints ?? null,
          fileConstraints: (c as ComponentContract | null)?.input?.fileConstraints ?? null,
          outputKind: (c as ComponentContract | null)?.output?.kind ?? null,
          disclaimer: (c as ComponentContract | null)?.qualityPolicy?.disclaimerPolicy?.template ?? null,
          requireHumanReview: (c as ComponentContract | null)?.qualityPolicy?.requireHumanReview ?? false,
          usesCostBaseline,
          fullContract: full,
        });
      }

      // 成本基准状态（只读，绝不写入/伪造默认值）：仅在确有合同消费占位符时才查询 systemconfig。
      // ASSUMPTION = 平台真实历史基准尚未配置，前端必须明确标注「假设估算」，不得显示为真实报价。
      const costBaselineStatus: "CONFIGURED" | "ASSUMPTION" | null = anyUsesCostBaseline
        ? (await getComponentCostBaseline())
          ? "CONFIGURED"
          : "ASSUMPTION"
        : null;

      // 读取平台默认模型部署的实际能力（与 resolveDefaultDeployment 判定口径 100% 一致）
      const platformDepInfo = await getPlatformDefaultDeploymentCapabilities();

      // 附加真实统计与合同状态，供前端展示（前端禁止再派生任何模拟数值）
      const componentsWithStats = components.map((c) => {
        const key = c.id.trim().toUpperCase();
        const acInfo = c.activeContractId ? contractInfoMap.get(c.activeContractId) : null;
        const candidateMeta = CANDIDATE_COMPONENTS_MAP.get(key) ?? null;

        // 计算合同所需能力与平台默认部署能力的真实缺口（不得写死为空数组）
        const missingCapabilities = acInfo
          ? calculateMissingCapabilities(
              acInfo.requiredCapabilities,
              platformDepInfo.capabilities,
              platformDepInfo.usable,
            )
          : [];

        // 通用就绪状态、阻断原因与质量提示派生（纯函数，依据真实数据库合同或受控候选元数据）
        const readiness = deriveCatalogComponentReadiness({
          activeContractLifecycle: acInfo?.lifecycle ?? null,
          activeContract: acInfo?.fullContract ?? null,
          missingCapabilities,
          candidateMeta,
        });

        // 构造标准的只读目录合同视图 CatalogContractView
        const contractView: CatalogContractView | null = acInfo?.fullContract
          ? deriveCatalogContractView(acInfo.fullContract, readiness.qualityHints)
          : null;

        return {
          ...c,
          realUsageCount: usageMap.get(key) ?? 0,
          realTaskStats: taskStatsMap.get(key) ?? { total: 0, success: 0 },
          // 通用只读就绪与审计字段（彻底消除前端按组件 ID 推断）
          readinessStatus: readiness.readinessStatus,
          blockingReasons: readiness.blockingReasons,
          qualityHints: readiness.qualityHints,
          isCandidateEligible: readiness.isCandidateEligible,
          // 标准只读目录合同视图（供前端与审计统一使用）
          contractView,
          // 合同状态（数据库唯一真源）：无激活合同 -> lifecycle=null；DRAFT/ARCHIVED/PENDING -> 待配置；
          // 仅 PUBLISHED 视为可执行（contractReady）。未发布候选绝不得伪装为可执行。
          activeContractLifecycle: acInfo?.lifecycle ?? null,
          contractVersion: acInfo?.contractVersion ?? null,
          hasActiveContract: Boolean(c.activeContractId),
          contractReady: readiness.contractReady,
          hasPublishedContract: readiness.hasPublishedContract,
          requiredCapabilities: acInfo?.requiredCapabilities ?? [],
          missingCapabilities,
          // 合同输入结构（供前端渲染结构化表单，如 C04 的「汇报对象」）；未激活/无合同时为 null
          inputContractKind: acInfo?.inputKind ?? null,
          textConstraints: acInfo?.textConstraints ?? null,
          formConstraints: acInfo?.formConstraints ?? null,
          // 合同文件约束（多主材料数量/MIME/大小提示的唯一真源，前端不得硬编码）
          fileConstraints: acInfo?.fileConstraints ?? null,
          outputKind: acInfo?.outputKind ?? null,
          disclaimer: acInfo?.disclaimer ?? null,
          requireHumanReview: acInfo?.requireHumanReview ?? false,
          // 成本基准状态：ASSUMPTION=平台真实历史基准未配置（前端必须标注为假设估算）
          costBaselineStatus: acInfo?.usesCostBaseline ? costBaselineStatus : null,
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

      // 批量查询权威退款与账务状态
      const taskIds = tasks.map((t) => t.id);
      const taskConfigMap = new Map<string, { chargeAttempted?: boolean | null; status?: string }>();
      tasks.forEach((t) => {
        const cfg = t.config && typeof t.config === "object" ? (t.config as Record<string, unknown>) : null;
        taskConfigMap.set(t.id, {
          // 三态收口：仅采信明确布尔值，缺失/未知一律保留 null，严禁推断为「已发生扣费」
          chargeAttempted: typeof cfg?.chargeAttempted === "boolean" ? cfg.chargeAttempted : null,
          status: t.status,
        });
      });
      const refundMetaMap = await resolveTasksRefundMetaMap(taskIds, prisma, taskConfigMap);

      // 查询当前工作空间基本元数据
      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true, type: true },
      });
      const wsInfo = { name: ws?.name || "工作空间", type: ws?.type || "PERSONAL" };

      // 任务列表统一脱敏序列化（与 /api/tasks 保持 100% 一致口径，严格剥离原始材料/密钥/堆栈）
      const formattedTasks = tasks.map((t) => {
        const cId = (t.type || "").trim().toUpperCase();
        const dbCompName = compNameMap.get(cId) || t.type || "";
        const refundMeta = refundMetaMap.get(t.id) || {
          refundStatus: "UNKNOWN" as const,
          refundedPoints: null,
          // 三态兜底：缺少账务事实时为 null（无法判断），严禁推断为「已发生扣费」
          chargeAttempted: null,
        };

        return serializeTaskListItem(t, wsInfo, dbCompName, refundMeta);
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

      const ws = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { name: true, type: true },
      });
      const wsInfo = { name: ws?.name || "工作空间", type: ws?.type || "PERSONAL" };

      const allComponents = await prisma.componentcatalog.findMany({ select: { id: true, name: true } });
      const compNameMap = new Map<string, string>();
      allComponents.forEach((comp) => {
        if (comp.id && comp.name) {
          compNameMap.set(comp.id.trim().toUpperCase(), comp.name);
        }
      });

      const taskIds = tasks.map((t) => t.id);
      const taskConfigMap = new Map<string, { chargeAttempted?: boolean | null; status?: string }>();
      tasks.forEach((t) => {
        const cfg = t.config && typeof t.config === "object" ? (t.config as Record<string, unknown>) : null;
        taskConfigMap.set(t.id, {
          // 三态收口：仅采信明确布尔值，缺失/未知一律保留 null，严禁推断为「已发生扣费」
          chargeAttempted: typeof cfg?.chargeAttempted === "boolean" ? cfg.chargeAttempted : null,
          status: t.status,
        });
      });
      const refundMetaMap = await resolveTasksRefundMetaMap(taskIds, prisma, taskConfigMap);

      const formattedResults = tasks.map((t) => {
        const cId = (t.type || "").trim().toUpperCase();
        const dbCompName = compNameMap.get(cId) || t.type || "";
        const refundMeta = refundMetaMap.get(t.id) || {
          refundStatus: "UNKNOWN" as const,
          refundedPoints: null,
          // 三态兜底：缺少账务事实时为 null（无法判断），严禁推断为「已发生扣费」
          chargeAttempted: null,
        };

        return serializeTaskListItem(t, wsInfo, dbCompName, refundMeta);
      });

      return NextResponse.json({ success: true, data: formattedResults });
    }

    // 获取单条任务成果物详情（按需加载，严格权限校验与安全脱敏）
    if (action === "task_detail") {
      const targetTaskId = searchParams.get("taskId") || searchParams.get("id");
      if (!targetTaskId) {
        return NextResponse.json({ success: false, error: "缺少 taskId 参数" }, { status: 400 });
      }

      // 若调用方显式提供了 workspaceId，先对工作空间权限执行前置校验，防止跨空间盲测
      const explicitWsId = searchParams.get("workspaceId");
      if (explicitWsId) {
        const isMemberExplicit = await requireWorkspaceMembership(userId, explicitWsId);
        if (!isMemberExplicit) {
          return NextResponse.json({ success: false, error: "越权拦截：您无权查看该工作空间任务成果" }, { status: 403 });
        }
      }

      const task = await prisma.componenttask.findUnique({
        where: { id: targetTaskId },
      });
      if (!task) {
        return NextResponse.json({ success: false, error: "任务记录不存在" }, { status: 404 });
      }
      if (!task.tenantId) {
        return NextResponse.json({ success: false, error: "任务数据异常：缺少租户空间归属" }, { status: 500 });
      }

      const isMember = await requireWorkspaceMembership(userId, task.tenantId);
      if (!isMember) {
        return NextResponse.json({ success: false, error: "越权拦截：您无权查看该任务成果详情" }, { status: 403 });
      }

      const comp = await prisma.componentcatalog.findUnique({
        where: { id: task.type },
        select: { id: true, name: true },
      });

      const cfg = task.config && typeof task.config === "object" ? (task.config as Record<string, unknown>) : null;
      const res = task.result && typeof task.result === "object" ? (task.result as Record<string, unknown>) : null;

      const taskConfigMap = new Map<string, { chargeAttempted?: boolean | null; status?: string }>();
      taskConfigMap.set(task.id, {
        // 三态收口：仅采信明确布尔值，缺失/未知一律保留 null，严禁推断为「已发生扣费」
        chargeAttempted: typeof cfg?.chargeAttempted === "boolean" ? cfg.chargeAttempted : null,
        status: task.status,
      });

      const refundMap = await resolveTasksRefundMetaMap([task.id], prisma, taskConfigMap);
      const refundMeta = refundMap.get(task.id) || {
        refundStatus: "UNKNOWN" as const,
        refundedPoints: null,
        chargeAttempted: null,
      };

      // 统一调用生产安全序列化函数（纯函数，保证路由与测试口径 100% 一致，严格最小化披露）
      const detailSafeData = serializeTaskDetailItem(task, comp?.name || task.type, refundMeta);

      return NextResponse.json({
        success: true,
        data: detailSafeData,
      });
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
    if (error?.code === "DEFAULT_COMPONENT_SOURCE_MISSING") {
      return NextResponse.json({
        success: false,
        error: "系统默认组件策略缺少已批准数据源",
        code: "DEFAULT_COMPONENT_SOURCE_MISSING",
      }, { status: 500 });
    }
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

    // 查询或匹配会员等级关联 ID
    let ml = await prisma.membershiplevel.findUnique({
      where: { id: membershipLevel }
    });
    if (!ml) {
      ml = await prisma.membershiplevel.findFirst();
    }
    const mlId = ml?.id || "FREE";
    // 兜底配额余额一律 0 起步，不预置任何免费算力（免费额度只来自注册福利按月 100 或充值/购买）；
    // 无限额度（tokenLimit = -1）为平台特权标记，保持原样
    const tierTokenLimit = await getMembershipTokenLimit(membershipLevel);
    const tokenBalance = isUnlimitedTokenLimit(tierTokenLimit) ? UNLIMITED_TOKEN : BigInt(0);
    
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

  // 兜底：如果全空间绑定记录为空，则取数据库中真实标记的已发布默认装配组件
  if (boundComponentMap.size === 0) {
    const defaultIds = await getDefaultCatalogComponentIds();
    defaultIds.forEach(id => boundComponentMap.set(id.toUpperCase(), id));
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

// ===== 请求级依赖注入边界（CORE-3-R3.6） =====
// POST 处理函数支持可选 deps 参数：生产入口（Next.js 运行时）不传 -> 使用真实单例；
// 测试入口传入内存 fake。禁止用全局可变变量或测试环境分支实现注入。
// 该边界仅改变依赖来源、不改变任何执行逻辑（生产中 ed.X 即为真实 X）。
export interface StudioExecutionDeps {
  readonly prisma: typeof prisma;
  readonly getUserId: typeof getUserId;
  readonly createModelAdapter: typeof createModelAdapter;
  readonly getActiveContractSnapshot: typeof getActiveContractSnapshot;
  readonly requireWorkspaceMembership: typeof requireWorkspaceMembership;
  readonly requireWorkspacePermission: typeof requireWorkspacePermission;
  readonly getRestrictedComponentIds: typeof getRestrictedComponentIds;
  readonly getOrCreateQuota: typeof getOrCreateQuota;
  readonly checkAndResetQuotaCycle: typeof checkAndResetQuotaCycle;
  readonly resolveDefaultDeployment: typeof resolveDefaultDeployment;
  readonly touchComponentUsage: typeof touchComponentUsage;
  readonly writeAuditLog: typeof writeAuditLog;
  readonly creditService: {
    consumePoints: typeof consumePoints;
    consumeAndCreateSettlementHold: typeof consumeAndCreateSettlementHold;
    refundConsumedPoints: typeof refundConsumedPoints;
  };
  readonly refundService: { enqueueRefundRecovery: typeof enqueueRefundRecovery };
  readonly settlementService: {
    releaseSettlementHold: typeof releaseSettlementHold;
    completeSettlement: typeof completeSettlement;
    enqueueSettlementRecovery: typeof enqueueSettlementRecovery;
  };
}

// ============ CORE-3 任务状态机辅助（失败任务持久化 / 退款状态派生 / 僵尸恢复） ============
// 失败任务必须持久化；退款状态一律由 pointledger / refundrecovery 事实派生，严禁写死。
// 所有更新均使用 status 条件（仅 RUNNING -> SUCCESS / RUNNING -> FAILED），已终态任务不被覆盖。

const EXECUTION_LEASE_MS = Number(process.env.EXECUTION_LEASE_MS) || 10 * 60 * 1000;

function buildRunningTaskConfig(params: {
  contractId: string | null;
  contractVersion: string | null;
  contractSnapshot: unknown;
  executionMode: string;
  materialSummary: string;
  inputSource: unknown;
}): Record<string, unknown> {
  const now = new Date();
  return {
    executionMode: params.executionMode,
    contractId: params.contractId,
    contractVersion: params.contractVersion,
    contractSnapshot: params.contractSnapshot as unknown as Prisma.InputJsonValue,
    startedAt: now,
    executionLeaseUntil: new Date(now.getTime() + EXECUTION_LEASE_MS),
    chargeAttempted: false,
    inputSource: params.inputSource as unknown as Prisma.InputJsonValue,
    materialSummary: params.materialSummary,
    // 严禁写入原始 Prompt / API Key / 供应商响应 / 异常堆栈 / 原始 inputMaterial
  };
}

async function createRunningTask(
  prisma: typeof import("@/lib/prisma").prisma,
  params: { taskId: string; userId: string; workspaceId: string; componentId: string; name: string; config: Record<string, unknown> },
): Promise<void> {
  await prisma.componenttask.create({
    data: {
      id: params.taskId,
      name: params.name,
      type: params.componentId,
      status: "RUNNING",
      progress: 0,
      config: params.config as unknown as Prisma.InputJsonValue,
      result: { executionMode: params.config.executionMode } as unknown as Prisma.InputJsonValue,
      userId: params.userId,
      tenantId: params.workspaceId,
      isPublished: false,
      icon: "Zap",
    },
  });
}

/**
 * 原子状态转换 RUNNING -> FAILED（§二.1）：
 *  - 必须使用带状态条件的更新 where: { id, status: "RUNNING" }，杜绝「先读后无条件写」冒充原子；
 *  - 更新 0 行时重新读取任务状态，已是 SUCCESS/FAILED/ARCHIVED 等终态按幂等处理，绝不覆盖；
 *  - 任务不存在返回 NOT_FOUND（由调用方返回稳定错误 + taskId）；
 *  - 并发请求不会重复失败、不会覆盖终态。
 */
type FailTransitionOutcome =
  | "FAILED_TRANSITIONED"
  | "ALREADY_TERMINAL"
  | "TASK_NOT_FOUND"
  | "PERSISTENCE_FAILED";

// 导出以供确定性测试直接验证「终态不得被覆盖」等状态机语义（生产行为不变）
export async function markTaskStatusFailed(
  prisma: typeof import("@/lib/prisma").prisma,
  taskId: string,
  err: { errorCode: string; errorMessage: string; chargeAttempted?: boolean },
): Promise<FailTransitionOutcome> {
  let existing: { status: string; config: unknown; result: unknown } | null = null;
  try {
    existing = await prisma.componenttask.findUnique({
      where: { id: taskId },
      select: { status: true, config: true, result: true },
    });
  } catch (readErr) {
    console.error("[TASK_FAIL_READ] 读取任务状态失败，需对账", {
      taskId,
      error: (readErr as Error)?.message || String(readErr),
    });
    return "PERSISTENCE_FAILED";
  }
  if (!existing) return "TASK_NOT_FOUND";
  if (existing.status !== "RUNNING") return "ALREADY_TERMINAL";

  const cfg = (existing.config as Record<string, unknown>) || {};
  const baseRes = (existing.result as Record<string, unknown>) || {};
  const executionMode = (cfg.executionMode as string) || "REAL_MODEL";

  try {
  const upd = await prisma.componenttask.updateMany({
    where: { id: taskId, status: "RUNNING" },
    data: {
      status: "FAILED",
      progress: 100,
      completedAt: new Date(),
      result: {
        ...baseRes,
        executionMode,
        errorCode: err.errorCode,
        errorMessage: err.errorMessage,
        outputData: null,
        artifacts: [],
        artifact: null,
        hasArtifact: false,
      },
      // 仅补充 chargeAttempted，保留 contractSnapshot / contractVersion / executionMode 等元数据；
      // 失败任务不保存原始 inputMaterial / Prompt / 模型响应 / API Key / 堆栈
      config: { ...cfg, chargeAttempted: err.chargeAttempted ?? null },
    } as unknown as Prisma.componenttaskUpdateManyMutationInput,
  });

  if (upd.count === 0) {
    // 并发竞态或已被其他请求置为终态：重新读取确认，绝不覆盖终态
    const cur = await prisma.componenttask.findUnique({ where: { id: taskId }, select: { status: true } });
    return cur ? "ALREADY_TERMINAL" : "TASK_NOT_FOUND";
  }
  return "FAILED_TRANSITIONED";
  } catch (writeErr) {
    console.error("[TASK_FAIL_WRITE] RUNNING->FAILED 持久化失败，需对账", {
      taskId,
      error: (writeErr as Error)?.message || String(writeErr),
    });
    return "PERSISTENCE_FAILED";
  }
}

// FAILED 持久化安全包装（批次规则 6）：成功返回 null；持久化异常（DB 写入失败）必须返回
// ACCOUNTING_RECONCILIATION_REQUIRED 并严格记录 taskId + 告警，严禁用 .catch(() => undefined) 吞掉失败任务写库异常，
// 也不得声称已退款或任务已闭环。
async function failTaskSafe(
  prisma: typeof import("@/lib/prisma").prisma,
  taskId: string,
  err: { errorCode: string; errorMessage: string; chargeAttempted?: boolean },
): Promise<NextResponse | null> {
  const outcome = await markTaskStatusFailed(prisma, taskId, err);

  // FAILED_TRANSITIONED：确认已由 RUNNING 转为 FAILED，调用方方可继续退款/恢复
  if (outcome === "FAILED_TRANSITIONED") return null;

  // ALREADY_TERMINAL（§二.2）：立即终止失败分支——不得退款、不得创建 refundrecovery、不得重复写 FAILED；
  // 重新读取当前任务状态与账务事实后以幂等响应返回真实 taskId。若已 SUCCESS，绝不把本次旧请求当失败继续处理。
  if (outcome === "ALREADY_TERMINAL") {
    let curStatus: string | null = null;
    let hasConsume = false;
    try {
      const cur = await prisma.componenttask.findUnique({ where: { id: taskId }, select: { status: true } });
      curStatus = cur?.status ?? null;
      const led = await prisma.pointledger.findMany({
        where: { taskId, type: "CONSUME" },
        select: { id: true },
      });
      hasConsume = led.length > 0;
    } catch (readErr) {
      console.error("[TERMINAL_REREAD] 重读终态任务失败", { taskId, error: (readErr as Error)?.message });
    }
    return NextResponse.json(
      {
        success: false,
        code: "TASK_ALREADY_TERMINAL",
        taskId,
        status: curStatus,
        chargeAttempted: hasConsume,
        error: `任务已处于终态（${curStatus ?? "未知"}），本次请求按幂等处理，未重复退款、未创建恢复记录。`,
      },
      { status: 409 },
    );
  }

  // TASK_NOT_FOUND（§二.3）：返回 taskId，绝不声称已失败/已退款/已对账
  if (outcome === "TASK_NOT_FOUND") {
    return NextResponse.json(
      {
        success: false,
        code: "TASK_NOT_FOUND",
        taskId,
        error: "任务不存在或已被清理，无法完成失败状态转换。",
      },
      { status: 404 },
    );
  }

  // PERSISTENCE_FAILED（§二.4）：账务事实未知，严禁继续调用退款
  console.error("[ACCOUNTING_RECONCILIATION_REQUIRED] FAILED 持久化失败，需对账", {
    taskId,
    errorCode: err.errorCode,
  });
  return NextResponse.json(
    {
      success: false,
      code: "ACCOUNTING_RECONCILIATION_REQUIRED",
      taskId,
      error: "任务失败状态写库异常，已触发对账处理，请联系管理员。",
    },
    { status: 500 },
  );
}

async function safeRefundOnFailure(
  prisma: typeof import("@/lib/prisma").prisma,
  params: {
    userId: string;
    workspaceId: string;
    taskId: string;
    componentId: string;
    componentName: string;
    consumeResult: ConsumeResult | null;
    wsType: string | null;
    wsName: string | null;
    refundConsumedPoints: (args: {
      consumeResult: ConsumeResult;
      userId: string;
      workspaceId: string;
      taskId: string;
      componentId: string;
      componentName: string;
      workspaceType: string | null;
      workspaceName: string | null;
    }) => Promise<unknown>;
    enqueueRefundRecovery: (args: {
      taskId: string;
      userId: string;
      workspaceId: string;
      consumeIdempotencyKey: string;
      consumeResult: ConsumeResult;
      componentId: string;
      componentName: string;
      workspaceType: string | null;
      workspaceName: string | null;
      error: string;
    }) => Promise<{ ok: boolean; error?: string }>;
  },
): Promise<{ ok: boolean; enqueued?: boolean; error?: string }> {
  if (!params.consumeResult || !shouldRefundOnFailure(params.consumeResult)) return { ok: true };
  try {
    await params.refundConsumedPoints({
      consumeResult: params.consumeResult,
      userId: params.userId,
      workspaceId: params.workspaceId,
      taskId: params.taskId,
      componentId: params.componentId,
      componentName: params.componentName,
      workspaceType: params.wsType,
      workspaceName: params.wsName,
    });
    return { ok: true };
  } catch (e) {
    const errMsg = (e as Error)?.message || String(e);
    const enqueueRes: { ok: boolean; error?: string } = await params.enqueueRefundRecovery({
      taskId: params.taskId,
      userId: params.userId,
      workspaceId: params.workspaceId,
      consumeIdempotencyKey: `CONSUME:${params.taskId}`,
      consumeResult: params.consumeResult,
      componentId: params.componentId,
      componentName: params.componentName,
      workspaceType: params.wsType,
      workspaceName: params.wsName,
      error: errMsg,
    });
    if (enqueueRes.ok) {
      return { ok: false, enqueued: true };
    }
    return { ok: false, enqueued: false, error: enqueueRes.error };
  }
}

// RUNNING 僵尸任务恢复：超过 executionLeaseUntil 的 RUNNING 任务必须进入 FAILED；
// 若账务存在 CONSUME，则登记退款恢复（幂等键 CONSUME:${taskId}），不得留下永久 RUNNING 僵尸任务。
async function recoverZombieRunningTasks(
  prisma: typeof import("@/lib/prisma").prisma,
  deps: { enqueueRefundRecovery: typeof enqueueRefundRecovery },
): Promise<number> {
  const now = Date.now();
  const running = await prisma.componenttask.findMany({
    where: { status: "RUNNING" },
    select: { id: true, userId: true, tenantId: true, type: true, name: true, config: true },
  });
  let recovered = 0;
  for (const t of running) {
    const cfg = (t.config as Record<string, unknown>) || {};
    const lease = cfg.executionLeaseUntil ? new Date(cfg.executionLeaseUntil as string).getTime() : 0;
    if (lease > now) continue;
    const existing = await prisma.componenttask.findUnique({ where: { id: t.id }, select: { status: true, config: true } });
    if (!existing || existing.status !== "RUNNING") continue;
    const mergedCfg = (existing.config as Record<string, unknown>) || {};
    const executionMode = (mergedCfg.executionMode as string) || "REAL_MODEL";
    const consumeLedgers = await prisma.pointledger.findMany({
      where: { taskId: t.id, type: "CONSUME" },
      select: { id: true, points: true, scope: true },
    });
    const chargeAttempted = consumeLedgers.length > 0;
    const zombieResult = {
      executionMode,
      errorCode: "EXECUTION_LEASE_EXPIRED",
      errorMessage: "任务执行超过租约时限，已转入失败并待对账/退款。",
      outputData: null,
      artifacts: [],
      artifact: null,
      hasArtifact: false,
    };
    // §四.1：僵尸恢复必须使用带状态条件的原子转换 where: { id, status: "RUNNING" }
    let upd: { count: number };
    try {
      upd = await prisma.componenttask.updateMany({
        where: { id: t.id, status: "RUNNING" },
        data: {
          status: "FAILED",
          progress: 100,
          completedAt: new Date(),
          result: zombieResult as unknown as Prisma.InputJsonValue,
          config: { ...mergedCfg, chargeAttempted } as unknown as Prisma.InputJsonValue,
        } as unknown as Prisma.componenttaskUpdateManyMutationInput,
      });
    } catch (updateErr) {
      // 严禁吞掉 FAILED 持久化异常：记录 taskId + 告警并跳过（不视为恢复成功）
      console.error("[ZOMBIE_RECOVERY] RUNNING->FAILED 持久化失败，需对账", {
        taskId: t.id,
        error: (updateErr as Error)?.message || String(updateErr),
      });
      continue;
    }
    if (upd.count === 0) {
      // §四.2：更新 0 行必须重新读取状态
      let cur: { status: string } | null = null;
      try {
        cur = await prisma.componenttask.findUnique({ where: { id: t.id }, select: { status: true } });
      } catch (readErr) {
        console.error("[ZOMBIE_RECOVERY] 重读僵尸任务失败", { taskId: t.id });
        continue;
      }
      if (!cur) {
        console.error("[ZOMBIE_RECOVERY] TASK_NOT_FOUND", { taskId: t.id });
        continue;
      }
      if (cur.status !== "RUNNING") continue; // 已 SUCCESS/FAILED/ARCHIVED：跳过，绝不创建退款
      console.error("[ZOMBIE_RECOVERY] 仍为 RUNNING，恢复失败需对账", { taskId: t.id });
      continue;
    }
    if (chargeAttempted) {
      const details: ConsumeDetail[] = consumeLedgers.map((l) => {
        const scope = (l.scope as string) || "WORKSPACE";
        const kind: ConsumeDetailKind =
          scope === "WALLET"
            ? "WALLET"
            : scope === "MEMBER"
              ? "MEMBER"
              : scope === "PERSONAL_GIFT"
                ? "PERSONAL_GIFT"
                : "WORKSPACE";
        return {
          ledgerId: l.id,
          grantId: "",
          scope,
          sourceType: "WORKSPACE",
          points: Number(l.points),
          kind,
        };
      });
      const rebuiltConsume: ConsumeResult = {
        consumed: consumeLedgers.reduce((s, l) => s + Number(l.points), 0),
        details,
        ledgerIds: consumeLedgers.map((l) => l.id),
        skipped: false,
        unlimited: false,
        balanceAfter: 0,
        monthlyTokenUsedIncremented: 0,
      };
      try {
        await deps.enqueueRefundRecovery({
          taskId: t.id,
          userId: t.userId || "",
          workspaceId: t.tenantId || "",
          consumeIdempotencyKey: `CONSUME:${t.id}`,
          consumeResult: rebuiltConsume,
          componentId: t.type,
          componentName: t.name,
          error: "超时僵尸任务退款恢复",
        });
      } catch (enqErr) {
        // §四.4：严禁只 console.error 后继续视为恢复成功——必须持久化 ACCOUNTING_RECONCILIATION_REQUIRED
        console.error("[ZOMBIE_RECOVERY] 退款恢复入队失败，需对账", {
          taskId: t.id,
          error: (enqErr as Error)?.message || String(enqErr),
        });
        try {
          await prisma.componenttask.update({
            where: { id: t.id },
            data: {
              result: {
                ...zombieResult,
                errorCode: "ACCOUNTING_RECONCILIATION_REQUIRED",
                errorMessage: "僵尸任务退款恢复入队失败，已扣点未退款，需人工对账。",
              } as unknown as Prisma.InputJsonValue,
            },
          });
        } catch (persistErr) {
          console.error("[ZOMBIE_RECOVERY] 对账状态持久化失败", {
            taskId: t.id,
            error: (persistErr as Error)?.message || String(persistErr),
          });
        }
        continue; // 绝不计数为已恢复
      }
    }
    recovered++;
  }
  return recovered;
}

export function buildProductionDeps(): StudioExecutionDeps {
  return {
    prisma,
    getUserId,
    createModelAdapter,
    getActiveContractSnapshot,
    requireWorkspaceMembership,
    requireWorkspacePermission,
    getRestrictedComponentIds,
    getOrCreateQuota,
    checkAndResetQuotaCycle,
    resolveDefaultDeployment,
    touchComponentUsage,
    writeAuditLog,
    creditService: { consumePoints, consumeAndCreateSettlementHold, refundConsumedPoints },
    refundService: { enqueueRefundRecovery },
    settlementService: { releaseSettlementHold, completeSettlement, enqueueSettlementRecovery },
  };
}

// 生产入口：Next.js 路由处理器（第二参为框架路由上下文，不用于注入）。
// 真正的执行逻辑在 runStudioPost，测试可传入内存 fake deps 调用同一处理函数。
export async function POST(
  request: NextRequest,
  _context?: { params: Promise<Record<string, string>> },
): Promise<NextResponse> {
  return runStudioPost(request, buildProductionDeps());
}

export async function GET(
  request: NextRequest,
  _context?: { params: Promise<Record<string, string>> },
): Promise<NextResponse> {
  return runStudioGet(request, buildProductionDeps());
}

// 内部实现：请求级依赖注入边界（CORE-3-R3.6）。生产由 POST 传入真实单例，测试传入内存 fake。
// 该边界仅改变依赖来源、不改变任何执行逻辑（生产中 ed.X 即为真实 X）。
export async function runStudioPost(request: NextRequest, deps: StudioExecutionDeps) {
  try {
    // 依赖注入边界（请求级）：生产缺省使用真实单例，测试传入内存 fake
    const ed: StudioExecutionDeps = deps;
    const prisma = ed.prisma;
    const getUserId = ed.getUserId;
    const createModelAdapter = ed.createModelAdapter;
    const getActiveContractSnapshot = ed.getActiveContractSnapshot;
    const requireWorkspaceMembership = ed.requireWorkspaceMembership;
    const requireWorkspacePermission = ed.requireWorkspacePermission;
    const getRestrictedComponentIds = ed.getRestrictedComponentIds;
    const getOrCreateQuota = ed.getOrCreateQuota;
    const checkAndResetQuotaCycle = ed.checkAndResetQuotaCycle;
    const resolveDefaultDeployment = ed.resolveDefaultDeployment;
    const touchComponentUsage = ed.touchComponentUsage;
    const writeAuditLog = ed.writeAuditLog;
    const creditService = ed.creditService;
    const settlementService = ed.settlementService;
    const refundService = ed.refundService;
    const consumePoints = creditService.consumePoints;
    const consumeAndCreateSettlementHold = creditService.consumeAndCreateSettlementHold;
    const refundConsumedPoints = creditService.refundConsumedPoints;
    const enqueueRefundRecovery = refundService.enqueueRefundRecovery;
    const releaseSettlementHold = settlementService.releaseSettlementHold;
    const completeSettlement = settlementService.completeSettlement;
    const enqueueSettlementRecovery = settlementService.enqueueSettlementRecovery;

    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ success: false, error: "未登录" }, { status: 401 });
    }
    
    const searchParams = request.nextUrl.searchParams;
    const isMultipartRequest =
      (request.headers.get("content-type") || "").includes("multipart/form-data");
    let body: Record<string, any> = {};
    let uploadFiles: File[] = [];
    let multipartForm: FormData | null = null;
    if (isMultipartRequest) {
      const form = await request.formData();
      multipartForm = form;
      const uploadedFiles: File[] = [];
      for (const [key, value] of form.entries()) {
        if (key === "file" && value instanceof File) {
          uploadedFiles.push(value);
          continue;
        }
        if (typeof value === "string") body[key] = value;
      }
      // 多主材料支持：先收集全部上传文件，最终以「激活合同声明的 fileConstraints.maxCount」为唯一裁决依据
      // （服务端强校验；单文件合同的多文件请求仍会被合同层拒绝，前端限制不能替代服务端校验）
      uploadFiles = uploadedFiles;
      if (typeof body.inputSource === "string") {
        try { body.inputSource = JSON.parse(body.inputSource); } catch { body.inputSource = null; }
      }
      if (body.tokens !== undefined && body.tokens !== null && body.tokens !== "") {
        body.tokens = Number(body.tokens);
      }
    } else {
      body = await request.json().catch(() => ({}));
    }
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
        // RUNNING 僵尸恢复：每次 simulate 入口顺带扫描并恢复超过租约的 RUNNING 任务（幂等，不阻塞主流程）
        await recoverZombieRunningTasks(prisma, { enqueueRefundRecovery: refundService.enqueueRefundRecovery });
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

        // 默认组件数据源（componentcatalog.isDefault=true && isPublished=true）仅用于：
        //   1) 受限组件列表无绑定记录时的数据库兜底（GET catalog 路径）；
        //   2) 全新空间默认装配自愈（workspaceInit 自检哨兵）。
        // simulate 执行的是调用方显式指定的 componentId，并经绑定组件集合与权限校验，
        // 不依赖默认装配集合，因此此处不再无条件校验默认数据源；
        // 已明确绑定组件的合法执行不会因无关的默认装配配置缺失被错误阻断。
        // （默认数据源缺失的稳定错误码仍由上述两条真正需要默认组件集合的路径抛出）

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

        // 1. 从 componentcatalog 读取组件信息与真实 estimatedModelTokens 成本（不信任客户端 body.tokens）
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
            estimatedModelTokens: true,
            activeContractId: true,
            detail: true,
          },
        });

        if (!comp) {
          return NextResponse.json({ success: false, error: "未找到对应组件，无法执行" }, { status: 404 });
        }

        // 建立执行合同唯一真源：
        // 彻底移除对 componentcatalog.detail.executionProfile 的读取，运行时只读取 component_contract 中明确激活的 PUBLISHED 版本！
        // 严禁“找不到新合同后回落旧 detail”，严禁降级为模拟假数据。
        const retryTaskId = (typeof body.retryTaskId === "string" && body.retryTaskId) ? body.retryTaskId : null;
        let targetContractSnapshot: ComponentContractSnapshot;
        let targetContractId: string;
        let targetContractVersion: string;

        if (retryTaskId) {
          // 重试模式：始终读取该历史任务保存的不可变快照，绝不读取后来激活的新版本。
          // 权限边界（必须同时绑定）：id + userId(当前用户) + tenantId(当前空间) + type(当前组件)，
          // 跨用户 / 跨空间 / 跨组件读取他人任务一律拒绝。
          const historicalTask = await prisma.componenttask.findFirst({
            where: {
              id: retryTaskId,
              userId,
              tenantId: workspaceId,
              type: componentId,
            },
            select: { config: true, status: true },
          });
          if (!historicalTask) {
            return NextResponse.json(
              {
                success: false,
                code: "TASK_NOT_RETRYABLE",
                error: "未找到可重试的任务：该任务不存在，或不属于当前用户 / 当前空间 / 当前组件。",
              },
              { status: 404 },
            );
          }

          // 任务状态必须属于允许重试的状态集合
          const retryStatus = String(historicalTask.status || "").toUpperCase();
          const RETRYABLE_STATUSES = new Set([
            "FAILED",
            "ERROR",
            "CANCELLED",
            "CANCELED",
            "COMPLETED",
            "DONE",
            "SUCCESS",
            "SUCCEEDED",
            "ARCHIVED",
          ]);
          if (!RETRYABLE_STATUSES.has(retryStatus)) {
            return NextResponse.json(
              {
                success: false,
                code: "TASK_STATUS_NOT_RETRYABLE",
                error: `任务当前状态 [${historicalTask.status}] 不允许重试。`,
              },
              { status: 409 },
            );
          }

          const hConfig = (historicalTask.config as Record<string, unknown> | null) || {};
          if (!hConfig.contractSnapshot || !hConfig.contractId || !hConfig.contractVersion) {
            return NextResponse.json(
              {
                success: false,
                code: "TASK_SNAPSHOT_MISSING",
                error: "历史任务未包含合法的合同不可变快照，无法执行重试",
              },
              { status: 400 },
            );
          }
          targetContractSnapshot = hConfig.contractSnapshot as unknown as ComponentContractSnapshot;
          targetContractId = String(hConfig.contractId);
          targetContractVersion = String(hConfig.contractVersion);

          // 快照结构与一致性校验：快照本身必须存在 contract 对象，
          // 且 snapshot.componentId / contractVersion 必须与任务元数据完全一致（损坏快照一律拒绝）
          const snap = targetContractSnapshot as unknown as
            | { snapshotId?: unknown; snapshotCreatedAt?: unknown; contract?: unknown }
            | null
            | undefined;
          const snapContract = snap && typeof snap === "object" ? (snap.contract as Record<string, unknown> | undefined) : undefined;
          if (!snap || typeof snap !== "object" || !snapContract || typeof snapContract !== "object") {
            return NextResponse.json(
              {
                success: false,
                code: "TASK_SNAPSHOT_CORRUPTED",
                error: "历史任务的合同快照结构损坏（缺少 contract 对象），无法执行重试。",
              },
              { status: 400 },
            );
          }
          if (snapContract.componentId !== comp.id) {
            return NextResponse.json(
              {
                success: false,
                code: "TASK_SNAPSHOT_COMPONENT_MISMATCH",
                error: `合同快照所属组件（${String(snapContract.componentId)}）与当前组件（${comp.id}）不一致，拒绝执行。`,
              },
              { status: 400 },
            );
          }
          if (String(snapContract.contractVersion) !== targetContractVersion) {
            return NextResponse.json(
              {
                success: false,
                code: "TASK_SNAPSHOT_VERSION_MISMATCH",
                error: `合同快照版本（${String(snapContract.contractVersion)}）与任务记录版本（${targetContractVersion}）不一致，拒绝执行。`,
              },
              { status: 400 },
            );
          }
        } else {
          // 新任务模式：只读取 component_contract 中明确激活的 PUBLISHED 版本！
          // 服务端直接调用仓储层，严禁 HTTP 自调用
          try {
            const activeResult = await getActiveContractSnapshot(comp.id);
            targetContractSnapshot = activeResult.snapshot;
            targetContractId = activeResult.contractId;
            targetContractVersion = activeResult.contractVersion;
          } catch (contractErr: unknown) {
            if (contractErr instanceof ComponentContractError) {
              let status = 400;
              let code = contractErr.code;
              if (contractErr.code === "NO_ACTIVE_CONTRACT") {
                // 无有效 PUBLISHED 激活合同：统一为明确的生产就绪错误码，绝不降级模拟
                code = "COMPONENT_CONTRACT_NOT_READY";
                status = 409;
              } else if (contractErr.code === "COMPONENT_NOT_FOUND") {
                status = 404;
              } else if (
                contractErr.code === "CONTRACT_ARCHIVED_CANNOT_EXECUTE" ||
                contractErr.code === "CONTRACT_DRAFT_CANNOT_EXECUTE"
              ) {
                status = 409;
              }
              return NextResponse.json(
                { success: false, code, error: contractErr.message },
                { status },
              );
            }
            throw contractErr;
          }
        }

        const activeContract = targetContractSnapshot.contract;
        if (activeContract.componentId !== comp.id) {
          return NextResponse.json(
            {
              success: false,
              code: "CONTRACT_BINDING_MISMATCH",
              error: `组件执行合同绑定不一致（合同=${activeContract.componentId}，组件=${comp.id}），拒绝执行。`,
            },
            { status: 400 },
          );
        }

        // 组件成本必须来自 componentcatalog 真实字段；空 / 0 / 非法一律拒绝，绝不猜测或回退到固定值
        const rawCost = Number(comp.estimatedModelTokens);
        if (!Number.isFinite(rawCost) || rawCost <= 0) {
          return NextResponse.json(
            {
              success: false,
              code: "COMPONENT_COST_NOT_CONFIGURED",
              error: "组件算力成本未配置（componentcatalog.estimatedModelTokens 为空或非法），无法执行。请在后台配置真实成本后重试。",
            },
            { status: 400 },
          );
        }
        // 扣点口径：一律经算账中心换算（componentcatalog.estimatedModelTokens 是 Token 估算，
        // 严禁直接当算力点扣）。兼容期规则：换算所需价格未登记的模型，维持既有扣点行为，
        // 并在返回中标注估算口径、记录待登记清单，绝不静默改变既有组件的扣费数额。
        const fallbackPoints = rawCost;
        let deductTokens = fallbackPoints;
        let billingBasis: "CONVERTED_PRICE" | "ESTIMATED_COMPATIBILITY" = "ESTIMATED_COMPATIBILITY";
        let pricingEstimateSnapshot: unknown = null;
        let pendingRegistration: { deploymentId: string; reason: string | null } | null = null;
        try {
          const caps = extractRequiredCapabilities(activeContract);
          if (caps.length > 0) {
            const plan = await resolveDefaultDeployment({ workspaceId, requiredCapabilities: caps });
            const steps = Array.isArray((activeContract as any)?.executionPlan?.steps)
              ? ((activeContract as any).executionPlan.steps as Array<{ maxOutputTokens?: number }>)
              : [];
            const maxOut = steps.reduce(
              (acc, s) => acc + (typeof s?.maxOutputTokens === "number" ? s.maxOutputTokens : 0),
              0,
            );
            const split = splitTokenEstimate({
              estimatedTotalTokens: rawCost,
              maxOutputTokens: maxOut > 0 ? maxOut : null,
            });
            const est = await estimatePoints({
              modelDeploymentId: plan.deploymentId,
              inputTokens: split.inputTokens,
              outputTokens: split.outputTokens,
              pricingSource: resolvePricingSource(plan.deploymentId),
            });
            pricingEstimateSnapshot = est.snapshot;
            if (est.basis === "CONVERTED_PRICE" && est.points !== null && est.points > 0) {
              deductTokens = est.points;
              billingBasis = "CONVERTED_PRICE";
            } else {
              pendingRegistration = { deploymentId: plan.deploymentId, reason: est.blockedReason };
              console.warn(
                `[算账中心] 部署 ${plan.deploymentId} 单价未登记，兼容期维持既有估算扣点口径 ${fallbackPoints} 点`,
              );
            }
          }
        } catch (estimateErr) {
          // 估价失败不得在此阻断执行：交由后续正式模型裁决抛出稳定错误码，此处维持既有扣点口径
          console.warn("[算账中心] 估价失败，兼容期维持既有估算扣点口径:", (estimateErr as Error)?.message);
        }

        // 自然月跨月算力配额自动重置
        await checkAndResetQuotaCycle(prisma, workspaceId, userId);

        // 1. 确保空间配额记录存在（算力点真源为 pointgrant 分桶，此处仅保证配额行存在）
        const quota = await getOrCreateQuota(workspaceId, userId);

        // 任务 ID 先行生成：作为扣费幂等键与算力流水关联的任务号
        const taskId = crypto.randomUUID();

        // 统一「原路退款」辅助：失败路径调用，按扣点来源分桶幂等退款；
        // 返回明确状态：退款成功 { ok: true }；退款失败且落库成功 { ok: false, enqueued: true }；双重失败 { ok: false, enqueued: false, error }
        // 统一「原路退款」辅助：失败路径调用，按扣点来源分桶幂等退款；
        // 委托模块级 safeRefundOnFailure（退款成功 { ok: true }；退款失败且落库成功 { ok: false, enqueued: true }；双重失败 { ok: false, enqueued: false, error }）
        const safeRefund = (cr: ConsumeResult): Promise<{ ok: boolean; enqueued?: boolean; error?: string }> =>
          safeRefundOnFailure(prisma, {
            userId,
            workspaceId,
            taskId,
            componentId: comp.id,
            componentName: comp.name || componentId,
            consumeResult: cr,
            wsType: ws?.type || null,
            wsName: ws?.name || null,
            refundConsumedPoints: creditService.refundConsumedPoints,
            enqueueRefundRecovery: refundService.enqueueRefundRecovery,
          });

        // 2. 校验成员月度算力额度 (若管理员显式为该成员配置了额度)
        const currentMember = await prisma.workspacemember.findUnique({
          where: { userId_workspaceId: { userId, workspaceId } },
          include: { user: { select: { name: true, email: true } } },
        });
        if (currentMember && currentMember.monthlyTokenLimit !== null && currentMember.monthlyTokenLimit !== undefined) {
          const memberLimit = Number(currentMember.monthlyTokenLimit);
          const memberUsed = Number(currentMember.monthlyTokenUsed || 0);
          if (memberUsed + deductTokens > memberLimit) {
            // 成员月度额度将用尽：首次跨越阈值时通知空间所有者补充算力点，避免重复骚扰
            if (memberUsed < memberLimit) {
              try {
                const ownerWs = await prisma.workspace.findUnique({
                  where: { id: workspaceId },
                  select: { ownerId: true, name: true },
                });
                if (ownerWs?.ownerId) {
                  const memberName = (currentMember as any).user?.name || currentMember.userId;
                  await addNotification(
                    ownerWs.ownerId,
                    "成员算力额度已用尽，请补充企业池",
                    `成员「${memberName}」在「${ownerWs.name || "企业空间"}」的月度算力额度已用尽（已用 ${memberUsed}/${memberLimit}）。请补充企业池算力点，或提升该成员额度后重试。`,
                    "asset",
                    `/workspace/${workspaceId}/members`
                  );
                }
              } catch (notifyErr) {
                console.warn("[额度提醒] 通知空间所有者失败:", notifyErr);
              }
            }
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

        // 输入来源解析（以 activeContract.input 为唯一权威依据）
        const reqInputSource = body.inputSource && typeof body.inputSource === "object" ? (body.inputSource as any) : null;
        const reqSourceType: string | undefined = reqInputSource?.sourceType;
        const hasText = inputMaterial.length > 0;

        const inputKind = activeContract.input?.kind || "TEXT";
        let inputError = "";
        if (inputKind === "TEXT") {
          if (!hasText && reqSourceType !== "asset") {
            inputError = "该组件要求文本输入：请粘贴文本材料，或选择空间资料作为主材料。";
          }
        } else if (inputKind === "FILE" || inputKind === "MULTI_FILE") {
          if (reqSourceType !== "file" && reqSourceType !== "asset") {
            inputError = "该组件需要上传文件或选择空间资料作为主材料：纯文本粘贴不允许执行。";
          }
        } else if (inputKind === "STRUCTURED_FORM") {
          // 结构化表单：以合同声明字段为唯一依据，服务端强校验必填与 select 选项合法性
          const formData =
            body.formData && typeof body.formData === "object" && !Array.isArray(body.formData)
              ? (body.formData as Record<string, unknown>)
              : null;
          if (!formData) {
            inputError = "该组件需要结构化表单输入：请在 formData 中提供表单字段。";
          } else {
            const fields = activeContract.input?.formConstraints?.fields ?? [];
            for (const fdef of fields) {
              const v = formData[fdef.name];
              if (fdef.required && (v === undefined || v === null || String(v).trim() === "")) {
                inputError = `表单必填字段「${fdef.label || fdef.name}」缺失或为空。`;
                break;
              }
              if (
                v !== undefined &&
                v !== null &&
                fdef.type === "select" &&
                Array.isArray(fdef.options) &&
                !fdef.options.includes(String(v))
              ) {
                inputError = `表单字段「${fdef.name}」取值不在合法选项列表中。`;
                break;
              }
            }
          }
        } else {
          if (!hasText && reqSourceType !== "file" && reqSourceType !== "asset") {
            inputError = "该组件需要文本、文件或空间资料任一作为主材料。";
          }
        }
        if (inputError) {
          return NextResponse.json({ success: false, code: "INPUT_REQUIRED", error: inputError }, { status: 400 });
        }

        // 落库用标准化 inputSource 结构（文件/资料元数据一律以服务端真实读取结果为准）
        const storedInputSource = {
          sourceType: reqSourceType || "text",
          sourceId: (typeof reqInputSource?.sourceId === "string" && reqInputSource.sourceId) ? reqInputSource.sourceId : null,
          fileName: (typeof reqInputSource?.fileName === "string" && reqInputSource.fileName) ? reqInputSource.fileName : null,
          fileSize: typeof reqInputSource?.fileSize === "number" ? reqInputSource.fileSize : null,
          mimeType: null as string | null,
        };

        // 已解析的空间资料（用于服务端读取正文；绝不信任客户端传入的 fileName/fileSize/content）
        let resolvedDoc: {
          workspaceId: string;
          visibility: string | null;
          uploaderId: string | null;
          originalName: string | null;
          fileSize: number | null;
          content: string | null;
          filePath: string | null;
        } | null = null;

        // 输入来源安全校验：来源元数据不可信任客户端提交，必须以服务端真实数据为准
        if (reqSourceType === "file" || reqSourceType === "asset") {
          if (reqSourceType === "file") {
            // 文件输入：必须以 multipart 原始上传文件为准，文件名/大小/MIME 全部来自服务端读取
            if (uploadFiles.length === 0) {
              return NextResponse.json(
                { success: false, code: "INPUT_SOURCE_INVALID", error: "文件输入缺少上传文件，请通过 multipart/form-data 上传原始文件" },
                { status: 400 },
              );
            }
            storedInputSource.sourceId = null;
            storedInputSource.fileName = uploadFiles.map((f) => f.name || "upload.bin").join("、");
            storedInputSource.fileSize = uploadFiles.reduce((sum, f) => sum + (typeof f.size === "number" ? f.size : 0), 0);
            storedInputSource.mimeType = uploadFiles[0]?.type || null;

            // 多主材料合同校验（服务端唯一真源：激活合同的 fileConstraints）
            const fcUpload = activeContract.input?.fileConstraints;
            if (fcUpload) {
              if (typeof fcUpload.minCount === "number" && uploadFiles.length < fcUpload.minCount) {
                return NextResponse.json(
                  {
                    success: false,
                    code: "INPUT_FILE_COUNT_INVALID",
                    error: `上传文件数量（${uploadFiles.length}）少于组件合同要求的最小数量（${fcUpload.minCount}）。`,
                  },
                  { status: 400 },
                );
              }
              if (typeof fcUpload.maxCount === "number" && uploadFiles.length > fcUpload.maxCount) {
                return NextResponse.json(
                  {
                    success: false,
                    code: "INPUT_MULTIPLE_NOT_SUPPORTED",
                    error: `上传文件数量（${uploadFiles.length}）超过组件合同允许的最大数量（${fcUpload.maxCount}）。`,
                  },
                  { status: 400 },
                );
              }
              let totalBytes = 0;
              for (const uf of uploadFiles) {
                const fname = uf.name || "upload.bin";
                if (fcUpload.acceptedMimes?.length && !isAcceptedFileMime(fcUpload.acceptedMimes, fname, uf.type || "")) {
                  return NextResponse.json(
                    {
                      success: false,
                      code: "INPUT_MIME_NOT_ALLOWED",
                      error: `不支持的文件类型：${fname}（仅允许 ${fcUpload.acceptedMimes.join("、")}）。`,
                    },
                    { status: 400 },
                  );
                }
                const sz = typeof uf.size === "number" ? uf.size : 0;
                if (typeof fcUpload.maxSingleFileBytes === "number" && sz > fcUpload.maxSingleFileBytes) {
                  return NextResponse.json(
                    {
                      success: false,
                      code: "INPUT_TOO_LARGE",
                      error: `文件过大：${fname}（${sz} 字节），超过合同单文件上限 ${fcUpload.maxSingleFileBytes} 字节。`,
                    },
                    { status: 400 },
                  );
                }
                totalBytes += sz;
              }
              if (typeof fcUpload.maxTotalBytes === "number" && totalBytes > fcUpload.maxTotalBytes) {
                return NextResponse.json(
                  {
                    success: false,
                    code: "INPUT_TOO_LARGE",
                    error: `文件总大小（${totalBytes} 字节）超过合同允许的总大小限制 ${fcUpload.maxTotalBytes} 字节。`,
                  },
                  { status: 400 },
                );
              }
            }
          } else {
            // 空间资料：sourceId 必须存在，否则无法校验归属
            const sourceId = reqInputSource?.sourceId;
            if (!sourceId) {
              return NextResponse.json(
                { success: false, code: "INPUT_SOURCE_INVALID", error: "空间资料来源缺少 sourceId，无法校验归属" },
                { status: 400 },
              );
            }
            const doc = await prisma.document.findUnique({
              where: { id: sourceId },
              select: { workspaceId: true, visibility: true, uploaderId: true, originalName: true, fileSize: true, content: true, filePath: true },
            });
            if (!doc || doc.workspaceId !== workspaceId) {
              return NextResponse.json(
                { success: false, code: "INPUT_SOURCE_FORBIDDEN", error: "资料不属于当前工作空间，无权访问" },
                { status: 403 },
              );
            }
            // 私密资料仅上传者本人可访问；即使是空间 OWNER/ADMIN 也不得直接读取其他成员私密资料
            // （治理/干涉须走独立申诉流程，不在组件执行接口内放行）
            if (isPrivateDocumentForbidden(doc.visibility, doc.uploaderId, userId)) {
              return NextResponse.json(
                { success: false, code: "INPUT_SOURCE_FORBIDDEN", error: "私密资料仅上传者本人可访问" },
                { status: 403 },
              );
            }
            // 以数据库真实元数据覆盖客户端提交（文件名/大小/来源类型不可信任）
            if (doc.originalName != null) storedInputSource.fileName = doc.originalName;
            storedInputSource.fileSize = doc.fileSize;
            resolvedDoc = doc;
          }
        }

        // 服务端真实解析输入文本：file/asset 必须以服务端读取内容为准，客户端 inputMaterial 仅用于 text 模式
        let serverInputMaterial = inputMaterial;
        // 结构化表单：按合同字段声明顺序拼装为模型可读材料（服务端以合同字段为准，不信任客户端自由文本）
        if (inputKind === "STRUCTURED_FORM") {
          const formData = body.formData as Record<string, unknown>;
          const fields = activeContract.input?.formConstraints?.fields ?? [];
          serverInputMaterial = fields.map((f) => `${f.label || f.name}：${String(formData?.[f.name] ?? "")}`).join("\n");
        }
        if (reqSourceType === "file") {
          const fileSize = storedInputSource.fileSize ?? 0;
          const hardCap = 100 * 1024 * 1024; // 100MB 绝对上限，避免超大文件占用内存
          if (fileSize > hardCap) {
            return NextResponse.json(
              { success: false, code: "INPUT_TOO_LARGE", error: `文件过大（${fileSize} 字节），超过系统上限 ${hardCap} 字节。` },
              { status: 400 },
            );
          }
          // 多主材料：逐文件提取文本并按上传顺序合并为单一材料（顺序稳定、分隔清晰、标注来源）
          const extractedParts: string[] = [];
          const unreadableFiles: string[] = [];
          for (const uf of uploadFiles) {
            const fname = uf.name || "upload.bin";
            const fileBuf = Buffer.from(await uf.arrayBuffer());
            const extractedOne = await extractTextFromBufferWithTimeout(fileBuf, fname, uf.type || "", TEXT_EXTRACT_TIMEOUT_MS);
            if (extractedOne && extractedOne.trim()) {
              // 保留文件名，便于模型区分多份材料的归属（多主材料合同要求自行识别各部分）
              extractedParts.push(`【材料：${fname}】\n${extractedOne.trim()}`);
            } else {
              unreadableFiles.push(fname);
            }
          }
          // 任一文件无法提取文本一律拒绝整单：绝不静默丢弃文件后照常扣费（本次不扣点、不写任务）
          if (unreadableFiles.length > 0) {
            return NextResponse.json(
              {
                success: false,
                code: "INPUT_TEXT_NOT_EXTRACTED",
                error: `以下文件未能提取出可分析文本：${unreadableFiles.join("、")}。请确认文件包含文字内容（图片扫描件无法识别）后重新提交，本次不扣费。`,
              },
              { status: 400 },
            );
          }
          if (extractedParts.length === 0) {
            return NextResponse.json(
              { success: false, code: "INPUT_TEXT_NOT_EXTRACTED", error: "文件未能提取出可分析文本，请确认文件包含文字内容（图片扫描件无法识别）。" },
              { status: 400 },
            );
          }
          serverInputMaterial = extractedParts.join("\n\n---\n\n");
        } else if (reqSourceType === "asset") {
          let extracted = resolvedDoc?.content ? String(resolvedDoc.content) : "";
          if (!extracted.trim() && resolvedDoc?.filePath) {
            extracted = await readDocumentFileText(
              resolvedDoc.filePath,
              resolvedDoc.originalName || storedInputSource.fileName || "doc",
            );
          }
          if (!extracted || !extracted.trim()) {
            return NextResponse.json(
              { success: false, code: "INPUT_TEXT_NOT_EXTRACTED", error: "空间资料未能提取出可分析文本，请确认资料包含文字内容。" },
              { status: 400 },
            );
          }
          serverInputMaterial = extracted;
        }

        // 服务端解析后的文本再次清洗，防止二进制脏数据进入模型 / 落库
        const cleanServerMaterial = sanitizeTextContent(serverInputMaterial);
        if (isProbablyBinaryContent(cleanServerMaterial)) {
          return NextResponse.json(
            { success: false, code: "INPUT_TEXT_NOT_EXTRACTED", error: "输入材料解析后包含不可分析的二进制数据。" },
            { status: 400 },
          );
        }

        // 敏感内容识别（与数据库落库、模型调用保持一致）：一律基于服务端真实文本
        const sensitivity = scanSensitiveWords(cleanServerMaterial);
        const effectiveInputMaterial =
          sensitivity.hasSensitive ? sensitivity.sanitizedText : cleanServerMaterial;

        // ====== 执行分支：仅真实模型（生产严禁模拟执行） ======
        let executionMode: "REAL_MODEL" = "REAL_MODEL";
        let realMeta: {
          providerId: string;
          modelId: string;
          inputTokens: number | null;
          outputTokens: number | null;
          totalTokens: number | null;
          estimatedPoints: number;
          billingMode: string;
          pricingSnapshot: unknown;
          latencyMs: number;
          providerRequestId: string | null;
          usage: ModelExecutionUsage;
          artifacts: ResultArtifact[];
          contractVersion: string;
          timeoutMs: number;
        } | null = null;
        let outputData: any;

        let consumeResult: ConsumeResult | null = null;
        let settlementFeatureEnabled = false;
        /** 白名单组件押金点数（最坏情况，扣点前预估）；非白名单/估算模式为 null */
        let depositPoints: number | null = null;
        let modelPlanForSettlement: ResolvedModelPlan | null = null;
        let modelResultForSettlement: ModelExecutionResult | null = null;

        if (activeContract) {
          // 批次 2 灰度：全局结算 flag 与组件白名单同时满足才启用押金-结算；
          // 白名单外组件（含 C02）维持估算兼容模式，禁止全局一刀切。
          const billingCfg = await loadBillingConfig();
          settlementFeatureEnabled = isComponentSettlementEnabled(comp.id, {
            globalFlag: isTokenSettlementFeatureEnabled(),
            whitelist: billingCfg.settlementComponentWhitelist,
          });
          // Phase 1：模型必须来自数据库注册表（受 enabled 与空间白名单约束），适配器在执行前按解析结果创建
          let adapter: ModelAdapter;
          let modelPlan: ResolvedModelPlan;

          // 1. 输入约束前置业务校验（文本长度约束、文件扩展名与单文件大小约束）
          if (activeContract.input.textConstraints) {
            const tc = activeContract.input.textConstraints;
            if (typeof tc.maxLength === "number" && cleanServerMaterial.length > tc.maxLength) {
              return NextResponse.json(
                {
                  success: false,
                  code: "INPUT_TOO_LARGE",
                  error: `输入文本过长（${cleanServerMaterial.length} 字符），超过合同上限 ${tc.maxLength} 字符。`,
                },
                { status: 400 },
              );
            }
            if (typeof tc.minLength === "number" && cleanServerMaterial.length < tc.minLength) {
              return NextResponse.json(
                {
                  success: false,
                  code: "INPUT_TOO_SHORT",
                  error: `输入文本过短（${cleanServerMaterial.length} 字符），未达合同下限 ${tc.minLength} 字符。`,
                },
                { status: 400 },
              );
            }
          }

          // file 来源的 MIME/大小/数量已在来源解析阶段按合同逐文件校验，此处仅处理空间资料(asset)
          if (activeContract.input.fileConstraints && reqSourceType === "asset" && storedInputSource.fileName) {
            const fc = activeContract.input.fileConstraints;
            if (fc.acceptedMimes && fc.acceptedMimes.length > 0) {
              const ext = (storedInputSource.fileName.split(".").pop() || "").toLowerCase();
              const extWithDot = "." + ext;
              const mimeMap: Record<string, string[]> = {
                txt: ["text/plain"],
                md: ["text/markdown", "text/plain"],
                markdown: ["text/markdown", "text/plain"],
                pdf: ["application/pdf"],
                docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
                doc: ["application/msword"],
                png: ["image/png"],
                jpg: ["image/jpeg"],
                jpeg: ["image/jpeg"],
                json: ["application/json", "text/plain"],
                csv: ["text/csv", "text/plain"],
              };
              const mappedMimes = mimeMap[ext] || [];
              const rawMime = (storedInputSource.mimeType || "").toLowerCase().trim();
              const ok = fc.acceptedMimes.some((m) => {
                const lower = m.toLowerCase().trim();
                return (
                  lower === "*" ||
                  lower === "*/*" ||
                  lower === extWithDot ||
                  lower.endsWith(extWithDot) ||
                  mappedMimes.includes(lower) ||
                  (rawMime !== "" && (lower === rawMime || (lower.endsWith("/*") && rawMime.startsWith(lower.slice(0, -1)))))
                );
              });
              if (!ok) {
                return NextResponse.json(
                  {
                    success: false,
                    code: "INPUT_MIME_NOT_ALLOWED",
                    error: `不支持的文件类型：${storedInputSource.fileName}（仅允许 ${fc.acceptedMimes.join("、")}）。`,
                  },
                  { status: 400 },
                );
              }
            }
            if (typeof fc.maxSingleFileBytes === "number" && typeof storedInputSource.fileSize === "number" && storedInputSource.fileSize > fc.maxSingleFileBytes) {
              return NextResponse.json(
                {
                  success: false,
                  code: "INPUT_TOO_LARGE",
                  error: `文件过大（${storedInputSource.fileSize} 字节），超过合同单文件上限 ${fc.maxSingleFileBytes} 字节。`,
                },
                { status: 400 },
              );
            }
          }

          // 模型策略校验：从数据库注册表解析；未注册/未启用/不在白名单 → MODEL_NOT_ALLOWED（绝不降级模拟）
          const reqProvider = typeof body.providerId === "string" ? body.providerId : null;
          const reqModel = typeof body.modelId === "string" ? body.modelId : null;
          try {
            // 执行模型唯一裁决：空间默认 -> 平台默认 -> 明确拒绝 MODEL_NOT_ALLOWED。
            // 严禁 findFirst(orderBy: createdAt) 之类「按创建时间挑一个」的逻辑，严禁环境变量兜底。
            // 合同声明的能力要求，统一由通用 helper 提取（executionPlan.steps + 兼容合法顶层），
            // 交由裁决入口逐项校验；严禁组件 ID 特判。
            const requiredCapabilities = extractRequiredCapabilities(activeContract);
            const defaultPlan = await resolveDefaultDeployment({ workspaceId, requiredCapabilities });

            // 请求体一旦显式指定 provider/model，必须与裁决结果完全一致（禁止越权指定模型）
            if (reqProvider || reqModel) {
              if (reqProvider !== defaultPlan.providerId || reqModel !== defaultPlan.modelId) {
                return NextResponse.json(
                  {
                    success: false,
                    code: "MODEL_OVERRIDE_NOT_ALLOWED",
                    error: "当前仅允许使用空间/平台默认模型，不接受自定义 provider/model。",
                  },
                  { status: 400 },
                );
              }
            }

            modelPlan = defaultPlan;
            adapter = await createModelAdapter(modelPlan);
            modelPlanForSettlement = modelPlan;

            // 前置门禁：若启用了真实结算，必须校验模型定价就绪情况；未就绪直接阻断，不扣点、不调模型
            if (settlementFeatureEnabled) {
              if (!modelPlan.pricing || !evaluateSettlementReadiness(modelPlan.pricing, { settlementFeatureEnabled })) {
                return NextResponse.json(
                  {
                    success: false,
                    code: "SETTLEMENT_NOT_READY",
                    error: "模型真实结算定价尚未就绪，无法发起任务",
                  },
                  { status: 422 },
                );
              }
            }
          } catch (e) {
            if (e instanceof ContractValidationError) {
              return NextResponse.json({ success: false, code: e.code, error: e.message }, { status: e.status });
            }
            if (e instanceof ModelAdapterError) {
              return NextResponse.json({ success: false, code: e.code, error: e.message }, { status: e.status });
            }
            throw e;
          }

          // ====== CORE-3 状态机：所有前置校验（合同/权限/输入/文件/能力/模型部署）已通过，先创建最小安全 RUNNING 任务 ======
          // 扣点前建立任务，保证任何失败（扣点失败/模型失败/超时/输出校验失败/结果构建失败）都有可持久化的 FAILED 任务与退款追溯。
          // 仅记录材料长度/来源类别，绝不写入原始输入文本/Prompt/响应，满足「失败任务不得保存原始 inputMaterial」
          const materialSummary =
            effectiveInputMaterial && typeof effectiveInputMaterial === "string" && effectiveInputMaterial.trim()
              ? `输入材料（${effectiveInputMaterial.trim().length} 字符）`
              : "快捷输入";
          const runningTaskConfig = buildRunningTaskConfig({
            contractId: targetContractId || null,
            contractVersion: targetContractVersion || null,
            contractSnapshot: targetContractSnapshot || null,
            executionMode,
            materialSummary,
            inputSource: storedInputSource,
          });
          await createRunningTask(prisma, {
            taskId,
            userId,
            workspaceId,
            componentId: comp.id,
            name: taskName || `${comp.name || componentId} 运行任务`,
            config: runningTaskConfig,
          });

          // 预扣算力点与结算单创建（启用结算时走原子单事务，未启用时走既有扣费逻辑）
          try {
            if (settlementFeatureEnabled) {
              const pricingSnapshot = buildRegistryPricingSnapshot({
                providerId: modelPlan.providerId,
                modelId: modelPlan.modelId,
                pricing: modelPlan.pricing,
              });
              // 批次 2 押金（hold）：按最坏情况预扣——输入取 max(材料字符÷2, 校准输入均值)（封顶，
              // 校准值为历史真实 prompt 均值，防中文材料低估导致押金形同虚设）+ 合同 maxOutputTokens；
              // 押金 ≥ 实扣，实际用量结算后多退少补（completeSettlement），余额永不为负。
              const maxOutFromContract = Array.isArray((activeContract as any)?.executionPlan?.steps)
                ? ((activeContract as any).executionPlan.steps as Array<{ maxOutputTokens?: number }>).reduce(
                    (acc, s) => acc + (typeof s?.maxOutputTokens === "number" ? s.maxOutputTokens : 0),
                    0,
                  )
                : 0;
              let calibratedInput: number | null = null;
              try {
                const calibRow = await prisma.systemconfig.findUnique({
                  where: { key: "billing_usage_calibration" },
                  select: { value: true },
                });
                const calibJson = calibRow?.value ? JSON.parse(calibRow.value) : null;
                const cal = calibJson?.[comp.id];
                if (cal && Number.isFinite(Number(cal.in)) && Number(cal.in) > 0) calibratedInput = Number(cal.in);
              } catch {
                calibratedInput = null; // 校准缺失退回字符估算，绝不猜测
              }
              const bounds = computeDepositTokenBounds(
                typeof effectiveInputMaterial === "string" ? effectiveInputMaterial.length : 0,
                maxOutFromContract > 0 ? maxOutFromContract : null,
                calibratedInput,
              );
              const depositEst = await estimatePoints({
                modelDeploymentId: modelPlan.deploymentId,
                inputTokens: bounds.inputTokens,
                outputTokens: bounds.outputTokens,
                pricingSource: resolvePricingSource(modelPlan.deploymentId),
                estimateSource: "DEPOSIT_WORST_CASE",
              });
              depositPoints =
                depositEst.basis === "CONVERTED_PRICE" && depositEst.points !== null && depositEst.points > 0
                  ? depositEst.points
                  : Math.max(deductTokens, 1); // 押金兜底 = 预计扣点（绝不 0 押金开跑）
              const holdRes = await consumeAndCreateSettlementHold({
                taskId,
                userId,
                workspaceId,
                points: depositPoints,
                pricingSnapshot,
                componentId: comp.id,
                componentName: comp.name || componentId,
                workspaceType: ws?.type || null,
                workspaceName: ws?.name || null,
                idempotencyKey: `CONSUME:${taskId}`,
              });
              consumeResult = holdRes.consumeResult;
            } else {
              consumeResult = await consumePoints({
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
            }
          } catch (consumeErr) {
            if (consumeErr instanceof IdempotencyStateUnknownError) {
              // 已创建 RUNNING 任务：标记 FAILED（chargeAttempted 视是否存在 CONSUME 流水而定，禁止自动退款，待人工对账）
              const failRes = await failTaskSafe(prisma, taskId, {
                errorCode: "IDEMPOTENCY_STATE_UNKNOWN",
                errorMessage: "该任务已存在扣费流水但无法还原完整消费详情，已禁止自动退款，需人工对账。",
                chargeAttempted: true,
              });
              if (failRes) return failRes;
              return NextResponse.json(
                {
                  success: false,
                  code: "IDEMPOTENCY_STATE_UNKNOWN",
                  taskId,
                  error: "该任务已存在扣费流水但无法还原完整消费详情，已禁止自动退款，需人工对账。",
                },
                { status: 409 },
              );
            }
            if (consumeErr instanceof InsufficientPointsError) {
              // 已创建 RUNNING 任务：标记 FAILED（尚未扣点，chargeAttempted=false，无退款）
              const failRes = await failTaskSafe(prisma, taskId, {
                errorCode: "POINTS_INSUFFICIENT",
                errorMessage: `算力点余额不足：当前可用 ${consumeErr.available} 点，本次需要 ${consumeErr.required} 点，请充值后再试`,
                chargeAttempted: false,
              });
              if (failRes) return failRes;
              return NextResponse.json({
                success: false,
                code: "POINTS_INSUFFICIENT",
                taskId,
                error: `算力点余额不足：当前可用 ${consumeErr.available} 点，本次需要 ${consumeErr.required} 点，请充值后再试`,
              }, { status: 400 });
            }

            // ====== §二.2：扣点未知异常严禁直接 throw，必须按消费事实分流，绝不遗留永久 RUNNING ======
            // d. 已明确取得 ConsumeResult：先原子落 FAILED，再按 safeRefund 原路退款
            if (consumeResult) {
              const failRes = await failTaskSafe(prisma, taskId, {
                errorCode: "CONSUME_FAILED",
                errorMessage: "算力点扣减后处理异常，已原路退款。",
                chargeAttempted: true,
              });
              if (failRes) return failRes;
              const refundOutcome = await safeRefund(consumeResult);
              if (!refundOutcome.ok) {
                if (refundOutcome.enqueued) {
                  return NextResponse.json(
                    { success: false, code: "REFUND_PENDING", taskId, error: "扣点后处理异常且退款处理中，已进入恢复队列，请稍后重试或联系客服。" },
                    { status: 500 },
                  );
                }
                return NextResponse.json(
                  { success: false, code: "ACCOUNTING_RECONCILIATION_REQUIRED", taskId, error: "扣点后处理异常且待退款记录落库失败，请联系管理员核对任务对账。" },
                  { status: 500 },
                );
              }
              return NextResponse.json(
                { success: false, code: "CONSUME_FAILED", taskId, refundStatus: "REFUNDED", error: "算力点扣减后处理异常，算力点已原路退回。" },
                { status: 500 },
              );
            }

            // a. 查询该 taskId 是否存在真实 CONSUME 流水
            const consumeLedgers = await prisma.pointledger.findMany({
              where: { taskId, type: "CONSUME" },
              select: { id: true, points: true },
            });

            if (consumeLedgers.length === 0) {
              // b. 无 CONSUME 且确认未扣点：FAILED + CONSUME_FAILED + chargeAttempted=false + NO_CHARGE
              const failRes = await failTaskSafe(prisma, taskId, {
                errorCode: "CONSUME_FAILED",
                errorMessage: "算力点扣减失败，未发生扣费。",
                chargeAttempted: false,
              });
              if (failRes) return failRes;
              return NextResponse.json(
                { success: false, code: "CONSUME_FAILED", taskId, refundStatus: "NO_CHARGE", error: "算力点扣减失败，未发生扣费。" },
                { status: 500 },
              );
            }

            // c. 存在 CONSUME 但无法还原完整消费事实：禁止盲目自动退款，写入可审计恢复记录后待人工对账
            const failRes = await failTaskSafe(prisma, taskId, {
              errorCode: "ACCOUNTING_RECONCILIATION_REQUIRED",
              errorMessage: "该任务已存在扣费流水但无法还原完整消费详情，已禁止自动退款，需人工对账。",
              chargeAttempted: true,
            });
            if (failRes) return failRes;
            try {
              await enqueueRefundRecovery({
                taskId,
                userId,
                workspaceId,
                consumeIdempotencyKey: `CONSUME:${taskId}`,
                consumeResult: {
                  consumed: consumeLedgers.reduce((s, l) => s + Number(l.points), 0),
                  details: [],
                  ledgerIds: consumeLedgers.map((l) => l.id),
                  skipped: false,
                  unlimited: false,
                  balanceAfter: 0,
                  monthlyTokenUsedIncremented: 0,
                },
                componentId: comp.id,
                componentName: comp.name || componentId,
                error: `扣点未知异常且已存在 CONSUME 流水，需人工对账: ${(consumeErr as Error)?.message || "未知异常"}`,
              });
            } catch (enqErr) {
              // 严禁吞掉恢复入队异常：必须记录 taskId + 告警（任务已置 FAILED，待对账）
              console.error("[CONSUME_UNKNOWN] 退款恢复入队失败，需对账", {
                taskId,
                error: (enqErr as Error)?.message || String(enqErr),
              });
            }
            return NextResponse.json(
              { success: false, code: "ACCOUNTING_RECONCILIATION_REQUIRED", taskId, error: "该任务已存在扣费流水但无法还原完整消费详情，已禁止自动退款，需人工对账。" },
              { status: 500 },
            );
          }

          // 组装 Prompt：严格以通用合同 executionPlan.steps 为唯一依据（不记录原文到日志）
          const primaryStep = activeContract.executionPlan?.steps?.[0];
          const contractPromptTemplate = primaryStep?.promptTemplate || "请基于以下输入材料执行专业分析并输出规范成果物。";
          // 合同通过 {{COST_BASELINE}} 声明消费「真实历史成本/工时基准」：
          // 已配置真实基准则注入真实数据；未配置则回退为显式假设文本（模型必须标注其性质）。
          let systemPrompt = contractPromptTemplate;
          if (systemPrompt.includes(COST_BASELINE_PLACEHOLDER)) {
            const costBaseline = await getComponentCostBaseline();
            systemPrompt = systemPrompt
              .split(COST_BASELINE_PLACEHOLDER)
              .join(renderCostBaselineText(costBaseline));
          }
          let modelResult: ModelExecutionResult;
          try {
            modelResult = await adapter.execute({
              providerId: adapter.providerId,
              modelId: adapter.modelId,
              systemPrompt,
              userPrompt: buildSourceMaterialPrompt(effectiveInputMaterial),
              temperature: 0.5,
              maxOutputTokens: Number(process.env.MODEL_MAX_OUTPUT_TOKENS) || 2000,
            });
            modelResultForSettlement = modelResult;
          } catch (e) {
            const failCode = e instanceof ModelAdapterError ? e.code : "MODEL_UPSTREAM_ERROR";
            const failMsg = e instanceof ModelAdapterError ? e.message : "模型服务调用失败，请稍后重试";
            // 原子 RUNNING -> FAILED（已终态任务不覆盖）；失败任务保留 contractSnapshot，不保存原始输入/响应/堆栈
            const failRes = await failTaskSafe(prisma, taskId, {
              errorCode: failCode,
              errorMessage: failMsg,
              chargeAttempted: !!(consumeResult && shouldRefundOnFailure(consumeResult)),
            });
            if (failRes) return failRes;
            // Feature Flag 判定：开启时走结算状态机释放，未开启时保持既有 safeRefund 行为
            if (settlementFeatureEnabled) {
              try {
                await releaseSettlementHold({
                  taskId,
                  userId,
                  workspaceId,
                  reason: (e as Error)?.message || "模型调用失败",
                  errorCode: e instanceof ModelAdapterError ? e.code : "MODEL_UPSTREAM_ERROR",
                  componentId: comp.id,
                  componentName: comp.name || componentId,
                  workspaceType: ws?.type || null,
                  workspaceName: ws?.name || null,
                });
              } catch (relErr) {
                const enq = await enqueueSettlementRecovery({
                  taskId,
                  userId,
                  workspaceId,
                  recoveryType: "RELEASE_FAILED",
                  error: `模型调用失败后释放预扣异常: ${(relErr as Error)?.message || "释放失败"}`,
                });
                if (!enq.ok) {
                  return NextResponse.json(
                    { success: false, code: "ACCOUNTING_RECONCILIATION_REQUIRED", taskId, error: "模型调用失败且释放恢复记录入队失败，请联系管理员核对任务对账。" },
                    { status: 500 },
                  );
                }
                return NextResponse.json(
                  { success: false, code: "REFUND_PENDING", taskId, error: "模型调用失败且预扣释放处理中，已进入恢复队列，请稍后重试或联系客服。" },
                  { status: 500 },
                );
              }
            } else {
              // 模型调用失败 / 超时 / 401 / 429 / 5xx → 原路退款（幂等）
              const refundOutcome = await safeRefund(consumeResult);
              if (!refundOutcome.ok) {
                if (refundOutcome.enqueued) {
                  return NextResponse.json(
                    { success: false, code: "REFUND_PENDING", taskId, error: "模型调用失败且算力点退款处理中，已进入恢复队列，请稍后重试或联系客服。" },
                    { status: 500 },
                  );
                } else {
                  return NextResponse.json(
                    { success: false, code: "ACCOUNTING_RECONCILIATION_REQUIRED", taskId, error: "模型调用失败且待退款记录落库失败，请联系管理员核对任务对账。" },
                    { status: 500 },
                  );
                }
              }
            }
            if (e instanceof ModelAdapterError) {
              return NextResponse.json({ success: false, code: e.code, error: e.message, taskId }, { status: e.status });
            }
            console.error("真实模型调用异常:", (e as Error)?.message);
            return NextResponse.json({ success: false, code: "MODEL_UPSTREAM_ERROR", error: "模型服务调用失败，请稍后重试", taskId }, { status: 502 });
          }

          executionMode = "REAL_MODEL";
          let artifact: ResultArtifact;
          try {
            // 合同输出类型 -> 成果物真实类型（穷举映射）。
            // 未知/缺失输出类型一律明确抛错，由下方 catch 触发退款，绝不猜测或伪装成无关类型。
            const outKind = activeContract.output?.kind;
            if (!outKind) {
              throw new Error("组件合同缺少 output.kind，无法构建成果物");
            }
            // 输出结构化 / 隐私边界校验：在写成功 task / 保存成功 artifact 之前拒绝不合规结果并原路退款，
            // 绝不落成功任务与成功 artifact（DOCUMENT 类合同仅做非空校验，既有结果行为不变）。
            const validatedOutput = validateModelOutput(activeContract, modelResult.text);
            artifact = buildResultArtifact({
              outputKind: outKind,
              title: `${comp.name || componentId} 成果物`,
              content: typeof validatedOutput.content === "string" ? validatedOutput.content : JSON.stringify(validatedOutput.content, null, 2),
              artifactMime: activeContract.output?.artifactMime,
              schemaVersion: activeContract.output?.schemaVersion,
              rendererType: activeContract.output?.rendererType,
              previewable: activeContract.output?.previewable ?? true,
              downloadable: activeContract.output?.downloadable ?? false,
            });
          } catch (buildErr) {
            // 输出校验失败（MODEL_OUTPUT_INVALID / OUTPUT_VALIDATION_FAILED）与结果生成失败统一走退款路径
            const failCode =
              buildErr instanceof ComponentContractError &&
              (buildErr.code === "MODEL_OUTPUT_INVALID" || buildErr.code === "OUTPUT_VALIDATION_FAILED")
                ? "MODEL_OUTPUT_INVALID"
                : "RESULT_BUILD_FAILED";
            // 原子 RUNNING -> FAILED（已终态任务不覆盖）；失败任务保留 contractSnapshot，不保存原始输入/响应/堆栈
            const failRes = await failTaskSafe(prisma, taskId, {
              errorCode: failCode,
              errorMessage: buildErr instanceof Error ? buildErr.message : "模型结果生成失败，算力点已原路退回。",
              chargeAttempted: !!(consumeResult && shouldRefundOnFailure(consumeResult)),
            });
            if (failRes) return failRes;
            // 结果生成失败：已扣点必须原路退款，不得发放模型结果
            if (settlementFeatureEnabled) {
              try {
                await releaseSettlementHold({
                  taskId,
                  userId,
                  workspaceId,
                  reason: "结果生成失败",
                  errorCode: "RESULT_BUILD_FAILED",
                  componentId: comp.id,
                  componentName: comp.name || componentId,
                  workspaceType: ws?.type || null,
                  workspaceName: ws?.name || null,
                });
              } catch (relErr) {
                const enq = await enqueueSettlementRecovery({
                  taskId,
                  userId,
                  workspaceId,
                  recoveryType: "RELEASE_FAILED",
                  error: `结果生成失败后释放预扣异常: ${(relErr as Error)?.message || "释放失败"}`,
                });
                if (!enq.ok) {
                  return NextResponse.json(
                    { success: false, code: "ACCOUNTING_RECONCILIATION_REQUIRED", taskId, error: "结果生成失败且释放恢复记录入队失败，请联系管理员核对任务对账。" },
                    { status: 500 },
                  );
                }
                return NextResponse.json(
                  { success: false, code: "REFUND_PENDING", taskId, error: "结果生成失败且预扣释放处理中，已进入恢复队列，请稍后重试或联系客服。" },
                  { status: 500 },
                );
              }
            } else {
              const refundOutcome = await safeRefund(consumeResult);
              if (!refundOutcome.ok) {
                if (refundOutcome.enqueued) {
                  return NextResponse.json(
                    { success: false, code: "REFUND_PENDING", taskId, error: "结果生成失败且算力点退款处理中，已进入恢复队列，请稍后重试或联系客服。" },
                    { status: 500 },
                  );
                } else {
                  return NextResponse.json(
                    { success: false, code: "ACCOUNTING_RECONCILIATION_REQUIRED", taskId, error: "结果生成失败且待退款记录落库失败，请联系管理员核对任务对账。" },
                    { status: 500 },
                  );
                }
              }
            }
            // §二.3：执行后失败分支（MODEL_OUTPUT_INVALID / RESULT_BUILD_FAILED）必须统一返回真实 taskId，便于追踪与对账
            return NextResponse.json(
              {
                success: false,
                code: failCode,
                taskId,
                error: buildErr instanceof Error ? buildErr.message : "模型结果生成失败，算力点已原路退回。",
              },
              { status: failCode === "MODEL_OUTPUT_INVALID" ? 400 : 500 },
            );
          }
          outputData = { summary: summarizeText(modelResult.text), artifacts: [artifact] };
          realMeta = {
            // 记录平台内网一致的 provider/model（合同 + 注册表），避免记录供应商侧别名
            providerId: modelPlan.providerId,
            modelId: modelPlan.modelId,
            inputTokens: modelResult.usage.inputTokens,
            outputTokens: modelResult.usage.outputTokens,
            totalTokens: modelResult.usage.totalTokens,
            estimatedPoints: deductTokens,
            billingMode: settlementFeatureEnabled ? "REAL_SETTLEMENT" : "ESTIMATED_COMPATIBILITY",
            // 价格快照：供应商成本与用户售价分离，含版本/来源/生效时间；历史任务快照不可变
            pricingSnapshot: buildRegistryPricingSnapshot({
              providerId: modelPlan.providerId,
              modelId: modelPlan.modelId,
              pricing: modelPlan.pricing,
            }),
            latencyMs: modelResult.latencyMs,
            providerRequestId: modelResult.providerRequestId ?? null,
            usage: modelResult.usage,
            artifacts: [artifact],
            contractVersion: targetContractVersion,
            timeoutMs: getModelTimeoutMs(),
          };
        } else {
          // 生产路径严禁产生模拟结果：无有效 PUBLISHED 激活合同时一律拒绝，
          // 绝不伪造、绝不调用模型、绝不扣算力点、绝不写成功 task、绝不写 artifact。
          // 已彻底删除全部模拟执行开关与模拟执行路径，任何环境变量都无法恢复生产模拟执行。
          return NextResponse.json(
            {
              success: false,
              code: "COMPONENT_CONTRACT_NOT_READY",
              error: "组件尚未配置有效可执行合同（缺少 PUBLISHED 激活合同），无法执行。",
            },
            { status: 409 },
          );
        }

        const taskStatus = "SUCCESS";

        // 事务化处理：扣减 Token + 更新组件统计 + 写入任务历史
        let taskResult: { quota: any; task: any };
        try {
          taskResult = await prisma.$transaction(async (tx) => {
          // 确保租户记录存在，避免 componenttask.tenantId 外键约束失败导致 simulate 恒 500
          await tx.tenant.upsert({
            where: { id: workspaceId },
            update: { name: ws?.name || workspaceId, updatedAt: new Date() },
            create: { id: workspaceId, name: ws?.name || workspaceId, updatedAt: new Date() },
          });

          // 算力点已由 credit-service 在事务外按分桶扣减并写入流水（含成员月度已用额度 monthlyTokenUsed 的唯一权威写入），此处仅回读最新余额
          const updatedQuota = await tx.workspacequota.findUnique({
            where: { workspaceId },
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

          // 原子更新组件字典库 componentcatalog 的全局真实调度次数自增 usageCount + 1
          await tx.componentcatalog.update({
            where: { id: componentId },
            data: {
              usageCount: { increment: 1 },
              updatedAt: new Date(),
            },
          }).catch((e) => console.warn("[组件调度] componentcatalog usageCount 自增警告:", e));

          // 敏感内容已在分支外统一识别（sensitivity / effectiveInputMaterial 为外层变量），此处直接复用，保持模型调用与落库一致
          const rawMaterialStr = typeof effectiveInputMaterial === "string" ? effectiveInputMaterial.trim() : "";
          const materialLen = rawMaterialStr.length;
          const materialSummary = rawMaterialStr ? `输入材料（${materialLen} 字符）` : "快捷输入";
          const safeDescription = `使用【${comp.name || componentId}】处理任务 (${materialSummary})`.slice(0, 180);

          // 成功路径：原子 RUNNING -> SUCCESS（仅允许 RUNNING 终态转换，已终态任务不被旧请求覆盖）
          const existingTask = await tx.componenttask.findUnique({ where: { id: taskId }, select: { config: true, result: true } });
          const baseCfg = (existingTask?.config as Record<string, unknown>) || {};
          const baseRes = (existingTask?.result as Record<string, unknown>) || {};
          // §三.1/§三.2：成功转换必须用带状态条件的更新 where: { id, status: "RUNNING" }；
          // 用 updateMany 取 count，避免把并发状态冲突（P2025）误判为写库失败后退款。
          const upd = await tx.componenttask.updateMany({
            where: { id: taskId, status: "RUNNING" },
            data: {
              name: taskName || `${comp.name || componentId} 运行任务`,
              description: safeDescription,
              status: taskStatus,
              progress: 100,
              config: {
                ...baseCfg,
                inputMaterial: effectiveInputMaterial || "",
                tokenCost: deductTokens,
                // 扣点口径标注：CONVERTED_PRICE 经算账中心换算 / ESTIMATED_COMPATIBILITY 兼容期估算口径
                billingBasis,
                pricingEstimate: pricingEstimateSnapshot,
                pendingRegistration,
                inputSource: storedInputSource,
                hasSensitive: sensitivity.hasSensitive,
                foundSensitiveWords: sensitivity.foundWords,
                executionMode,
                contractId: targetContractId || null,
                contractVersion: targetContractVersion || null,
                contractSnapshot: (targetContractSnapshot || null) as unknown as Prisma.InputJsonValue,
                chargeAttempted: true,
                ...(realMeta
                  ? {
                      providerId: realMeta.providerId,
                      modelId: realMeta.modelId,
                      inputTokens: realMeta.inputTokens,
                      outputTokens: realMeta.outputTokens,
                      totalTokens: realMeta.totalTokens,
                      estimatedPoints: realMeta.estimatedPoints,
                      billingMode: realMeta.billingMode,
                      pricingSnapshot: realMeta.pricingSnapshot as any,
                      latencyMs: realMeta.latencyMs,
                      providerRequestId: realMeta.providerRequestId,
                      contractVersion: realMeta.contractVersion || targetContractVersion || null,
                      timeoutMs: realMeta.timeoutMs,
                      actualPoints: null,
                      // 批次 2：押金-结算试点元数据（押金点数与模式标注，供任务详情/对账追溯）
                      depositPoints: depositPoints,
                      settlementMode: settlementFeatureEnabled ? "PILOT_HOLD_SETTLE" : "ESTIMATED_COMPATIBILITY",
                    }
                  : {}),
              } as unknown as Prisma.InputJsonValue,
              result: {
                ...baseRes,
                outputData: outputData as unknown as Prisma.InputJsonValue,
                executionMode,
                contractId: targetContractId || null,
                contractVersion: targetContractVersion || null,
                ...(realMeta
                  ? {
                      provider: { id: realMeta.providerId, modelId: realMeta.modelId },
                      usage: realMeta.usage,
                      artifacts: realMeta.artifacts,
                      contractVersion: realMeta.contractVersion || targetContractVersion || null,
                    }
                  : {}),
              } as unknown as Prisma.InputJsonValue,
              userId,
              tenantId: workspaceId,
              completedAt: new Date(),
              isPublished: false,
              icon: "Zap",
              updatedAt: new Date(),
            },
          });

          if (upd.count === 0) {
            // §三.2：0 行（并发状态冲突）必须重新读取任务，按真实状态幂等分流，绝不退款
            const cur = await tx.componenttask.findUnique({
              where: { id: taskId },
              select: { status: true, config: true, result: true },
            });
            if (!cur) return { quota: updatedQuota, task: null, outcome: "TASK_NOT_FOUND" as const };
            if (cur.status === "SUCCESS") return { quota: updatedQuota, task: cur, outcome: "IDEMPOTENT_SUCCESS" as const };
            if (cur.status === "FAILED") return { quota: updatedQuota, task: cur, outcome: "IDEMPOTENT_FAILED" as const };
            // 仍为 RUNNING：确属数据库写库失败，交由外层 catch 走 TASK_WRITE_FAILED（扣点后退款）
            throw new Error("TASK_WRITE_FAILED_TRANSITION");
          }
          const task = await tx.componenttask.findUnique({ where: { id: taskId } });
          return { quota: updatedQuota, task, outcome: "SUCCESS_TRANSITIONED" as const };
          });
        } catch (taskErr) {
          // 扣点成功后任务写库失败：若已进入真实 Token 结算状态机，必须走结算状态机释放，严禁调用旧退款 safeRefund 导致重复退款
          if (settlementFeatureEnabled) {
            try {
              // 任务仍为 RUNNING：原子标记 FAILED（保留合同快照），随后释放预扣
              const failRes = await failTaskSafe(prisma, taskId, {
                errorCode: "TASK_WRITE_FAILED",
                errorMessage: "任务结果保存失败，预扣算力点已全额原路释放。",
                chargeAttempted: true,
              });
              if (failRes) return failRes;
              await releaseSettlementHold({
                taskId,
                userId,
                workspaceId,
                reason: "任务结果保存失败",
                errorCode: "TASK_WRITE_FAILED",
                componentId: comp.id,
                componentName: comp.name || componentId,
                workspaceType: ws?.type || null,
                workspaceName: ws?.name || null,
              });
              return NextResponse.json(
                { success: false, code: "TASK_WRITE_FAILED", taskId, error: "任务结果保存失败，预扣算力点已全额原路释放。" },
                { status: 500 },
              );
            } catch (relErr) {
              const enq = await enqueueSettlementRecovery({
                taskId,
                userId,
                workspaceId,
                recoveryType: "RELEASE_FAILED",
                error: `任务保存失败后释放预扣异常: ${(relErr as Error)?.message || "释放失败"}`,
              });
              if (!enq.ok) {
                return NextResponse.json(
                  { success: false, code: "ACCOUNTING_RECONCILIATION_REQUIRED", taskId, error: "任务保存失败且释放恢复记录入队失败，请联系管理员核对任务对账。" },
                  { status: 500 },
                );
              }
              return NextResponse.json(
                { success: false, code: "REFUND_PENDING", taskId, error: "任务保存失败且预扣释放处理中，已进入恢复队列，请稍后重试或联系客服。" },
                { status: 500 },
              );
            }
          }

          // 未启用真实结算状态机时（结算关闭）：任务仍为 RUNNING，先原子标记 FAILED 再原路退款
          const failRes = await failTaskSafe(prisma, taskId, {
            errorCode: "TASK_WRITE_FAILED",
            errorMessage: "任务结果保存失败，算力点已原路退回。",
            chargeAttempted: !!(consumeResult && shouldRefundOnFailure(consumeResult)),
          });
          if (failRes) return failRes;
          if (consumeResult && shouldRefundOnFailure(consumeResult)) {
            const refundOutcome = await safeRefund(consumeResult);
            if (!refundOutcome.ok) {
              if (refundOutcome.enqueued) {
                return NextResponse.json(
                  { success: false, code: "REFUND_PENDING", taskId, error: "任务结果保存失败且算力点退款处理中，已进入恢复队列，请稍后重试或联系客服。" },
                  { status: 500 },
                );
              } else {
                return NextResponse.json(
                  { success: false, code: "ACCOUNTING_RECONCILIATION_REQUIRED", taskId, error: "任务结果保存失败且待退款记录落库失败，请联系管理员核对任务对账。" },
                  { status: 500 },
                );
              }
            }
            return NextResponse.json(
              { success: false, code: "TASK_WRITE_FAILED", taskId, error: "任务结果保存失败，算力点已原路退回。" },
              { status: 500 },
            );
          }
          // §二.3：未取得可退款消费事实时也必须返回稳定错误码 + taskId，严禁让异常逃逸成无 taskId 的响应
          return NextResponse.json(
            { success: false, code: "TASK_WRITE_FAILED", taskId, error: "任务结果保存失败，请联系管理员核对任务对账。" },
            { status: 500 },
          );
        }

        // §三.2/§三.3：成功路径并发幂等分流——在结算/成功响应之前拦截，
        // 严禁把并发状态冲突误判为写库失败后退款，也严禁对已 FAILED 任务重复退款。
        const successOutcome = (taskResult as { outcome?: string } | undefined)?.outcome;
        if (successOutcome === "IDEMPOTENT_FAILED") {
          const curRes = ((taskResult as any)?.task?.result || {}) as Record<string, unknown>;
          return NextResponse.json(
            {
              success: false,
              code: "TASK_ALREADY_FAILED",
              taskId,
              status: "FAILED",
              errorCode: curRes.errorCode ?? null,
              error: "任务此前已判定失败，本次请求按幂等处理，未重复退款、未重复创建恢复记录。",
            },
            { status: 409 },
          );
        }
        if (successOutcome === "TASK_NOT_FOUND") {
          return NextResponse.json(
            {
              success: false,
              code: "TASK_NOT_FOUND",
              taskId,
              error: "任务不存在或已被清理，无法完成成功状态转换。",
            },
            { status: 404 },
          );
        }

        // 任务落库成功后，若开启真实结算状态机，执行最终结算（多退少补）
        let settlementOutcome: CompleteSettlementResult | null = null;
        if (settlementFeatureEnabled && modelPlanForSettlement?.pricing && modelResultForSettlement) {
          try {
            settlementOutcome = await completeSettlement({
              taskId,
              userId,
              workspaceId,
              usage: modelResultForSettlement.usage,
              pricingSnapshot: realMeta?.pricingSnapshot as RegistryPricingSnapshot | undefined,
              componentId: comp.id,
              componentName: comp.name || componentId,
              workspaceType: ws?.type || null,
              workspaceName: ws?.name || null,
            });

            if (settlementOutcome && settlementOutcome.status !== "SETTLED") {
              await prisma.componenttask.update({
                where: { id: taskId },
                data: {
                  description: `${taskResult.task.description || ""} [结算异常:${settlementOutcome.status}]`,
                },
              }).catch((err: unknown) => console.warn("[结算标记] 更新任务备注失败:", err));
            }
          } catch (settleErr) {
            console.error("[真实结算异常] completeSettlement 执行失败:", settleErr);
            const enq = await enqueueSettlementRecovery({
              taskId,
              userId,
              workspaceId,
              recoveryType: "SETTLEMENT_FAILED",
              error: `真实结算 completeSettlement 异常: ${(settleErr as Error)?.message || "结算失败"}`,
              usage: modelResultForSettlement.usage,
              pricingSnapshot: realMeta?.pricingSnapshot as RegistryPricingSnapshot | undefined,
            });
            if (!enq.ok) {
              return NextResponse.json(
                {
                  success: false,
                  code: "ACCOUNTING_RECONCILIATION_REQUIRED",
                  taskId,
                  error: "任务已执行但真实用量结算失败且恢复记录入队失败，请联系管理员核对账目。",
                },
                { status: 500 }
              );
            }
          }
        }

        // 记录真实的使用率日志（非核心统计，失败不得影响已成功任务）
        await touchComponentUsage(userId, componentId, workspaceId).catch((e) =>
          console.warn("[组件使用记录] 非阻断式写入失败:", e),
        );

        // 写入高危审计日志（非阻断式）
        await writeAuditLog(userId, "component:execute", { componentId, tokens: deductTokens }, workspaceId).catch((e) => console.warn("写入审计日志非阻断式提示:", e));

        // 返回执行人的真实可用余额（不无条件读取 workspacequota.tokenBalance）
        let tokenBalanceForResponse: number;
        if (ws?.type === "ENTERPRISE" && currentMember?.role === "MEMBER") {
          // 企业普通成员：返回其在本空间的独立余额
          const m = await prisma.workspacemember.findUnique({
            where: { userId_workspaceId: { userId, workspaceId } },
            select: { tokenBalance: true },
          });
          tokenBalanceForResponse = m ? Number(m.tokenBalance) : 0;
        } else if (ws?.type === "ENTERPRISE") {
          // 其他企业成员（OWNER/ADMIN）：返回企业共享池余额
          tokenBalanceForResponse = taskResult.quota ? Number(taskResult.quota.tokenBalance) : 0;
        } else {
          // 个人空间：返回个人空间实际可用余额（钱包 + 个人赠送池）
          const bal = await getBalanceSummary(userId, workspaceId);
          tokenBalanceForResponse = bal.unlimited ? Number(UNLIMITED_TOKEN) : (bal.available ?? 0);
        }

        // Feature Flag 开启真实结算时：路由绝不在结算失败/复核时返回普通 success
        if (settlementFeatureEnabled) {
          if (!settlementOutcome || settlementOutcome.status !== "SETTLED") {
            const isReview = settlementOutcome?.status === "REQUIRES_REVIEW";
            const billingStatus = settlementOutcome?.status || "PENDING_RECOVERY";
            return NextResponse.json({
              success: false,
              code: isReview ? "BILLING_REQUIRES_REVIEW" : "SETTLEMENT_PENDING",
              billingStatus,
              taskId,
              tokenBalance: tokenBalanceForResponse,
              cost: settlementOutcome ? Number(settlementOutcome.actualPricePoints) : deductTokens,
              actualPoints: settlementOutcome ? Number(settlementOutcome.actualPricePoints) : null,
              settlementStatus: billingStatus,
              executionMode,
              model: realMeta ? realMeta.modelId : null,
              billingMode: realMeta ? realMeta.billingMode : "REAL_SETTLEMENT",
              error: isReview
                ? "任务已执行完成，但计费结算转入人工复核，请关注账单中心审核进度"
                : "任务已执行完成，但用量结算处理中，已进入恢复队列",
              contractVersion: targetContractVersion || null,
              ...(realMeta
                ? {
                    provider: { id: realMeta.providerId, modelId: realMeta.modelId },
                    usage: {
                      inputTokens: realMeta.inputTokens,
                      outputTokens: realMeta.outputTokens,
                      totalTokens: realMeta.totalTokens,
                    },
                    artifacts: realMeta.artifacts,
                    latencyMs: realMeta.latencyMs,
                  }
                : {}),
              task: {
                id: taskResult.task.id,
                name: taskResult.task.name,
                status: taskResult.task.status,
                result: taskResult.task.result,
                tokens: deductTokens,
                executionMode,
                createdAt: taskResult.task.createdAt,
              },
            }, { status: 202 });
          }
        }

        return NextResponse.json({
          success: true,
          tokenBalance: tokenBalanceForResponse,
          cost: settlementOutcome ? Number(settlementOutcome.actualPricePoints) : deductTokens,
          executionMode,
          model: realMeta ? realMeta.modelId : null,
          billingMode: settlementFeatureEnabled && settlementOutcome?.status === "SETTLED"
            ? "REAL_SETTLEMENT"
            : (realMeta ? realMeta.billingMode : "ESTIMATED_COMPATIBILITY"),
          estimatedPoints: realMeta ? realMeta.estimatedPoints : deductTokens,
          depositPoints: depositPoints,
          settlementMode: settlementFeatureEnabled ? "PILOT_HOLD_SETTLE" : "ESTIMATED_COMPATIBILITY",
          actualPoints: settlementOutcome ? Number(settlementOutcome.actualPricePoints) : null,
          settlementStatus: settlementOutcome ? settlementOutcome.status : null,
          contractVersion: targetContractVersion || null,
          ...(realMeta
            ? {
                provider: { id: realMeta.providerId, modelId: realMeta.modelId },
                usage: {
                  inputTokens: realMeta.inputTokens,
                  outputTokens: realMeta.outputTokens,
                  totalTokens: realMeta.totalTokens,
                },
                artifacts: realMeta.artifacts,
                latencyMs: realMeta.latencyMs,
              }
            : {}),
          task: {
            id: taskResult.task.id,
            name: taskResult.task.name,
            status: taskResult.task.status,
            result: taskResult.task.result,
            tokens: deductTokens,
            executionMode,
            estimatedPoints: deductTokens,
            estimatedModelTokens: Number(comp.estimatedModelTokens),
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
        // 复用顶层已解析的 FormData（请求体只能被消费一次）
        const formData = multipartForm ?? (await request.formData());
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
        // 统一走可取消超时入口：超时会真正终止 OCR worker，避免资料导入卡死
        content = await extractTextFromBufferWithTimeout(buffer, originalName || "", (file as any).type || "", TEXT_EXTRACT_TIMEOUT_MS);
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
      // P3：装配成功会改变组件数等只读缓存，立即整体失效保证计数即时准确
      clearServerCache();

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
      // P3：解绑成功会改变组件数等只读缓存，立即整体失效保证计数即时准确
      clearServerCache();

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
      let targetWsId = workspaceId || body.workspaceId || searchParams.get("workspaceId");

      if (!targetTaskId) {
        return NextResponse.json({
          success: false,
          error: "缺少必要的 taskId 参数"
        }, { status: 400 });
      }

      // 先查询任务真实所属工作空间，杜绝客户端伪造 workspaceId 越权归档
      const existingTask = await prisma.componenttask.findUnique({
        where: { id: targetTaskId },
        select: { id: true, tenantId: true, status: true },
      });

      if (!existingTask) {
        return NextResponse.json({
          success: false,
          error: "未找到对应任务记录"
        }, { status: 404 });
      }

      if (targetWsId && targetWsId !== existingTask.tenantId) {
        return NextResponse.json({
          success: false,
          error: "任务所属工作空间与请求参数不一致"
        }, { status: 400 });
      }
      targetWsId = existingTask.tenantId;

      const isMember = await requireWorkspaceMembership(userId, targetWsId);
      if (!isMember) {
        return NextResponse.json({
          success: false,
          error: "越权警告：您不属于该工作空间，无权归档任务"
        }, { status: 403 });
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
      // P3：启停会改变装配状态口径，立即失效组件数与中枢缓存
      clearServerCache();

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

  } catch (error: any) {
    console.error("Studio API POST error:", error);
    if (error?.code === "DEFAULT_COMPONENT_SOURCE_MISSING") {
      return NextResponse.json({
        success: false,
        error: "系统默认组件策略缺少已批准数据源",
        code: "DEFAULT_COMPONENT_SOURCE_MISSING",
      }, { status: 500 });
    }
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
