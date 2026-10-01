/**
 * 组件进度只读审计（数据库唯一真源，禁止硬编码统计口径）
 *
 * 安全约束：
 *  - **纯只读**：不写入、不发布、不激活、不删除任何数据；
 *  - 不返回任何密钥信息（不读取 provider.apiKeyEnv 的值、不返回 baseUrl）；
 *  - 所有统计均由数据库查询实时得出，不接受前端提交的组件状态。
 */

import { prisma } from "@/lib/prisma";
import { getPlatformDefaultDeploymentId } from "@/lib/model-registry";
import { extractRequiredCapabilities } from "@/lib/component-contract/capabilities";
import { isTokenSettlementFeatureEnabled } from "@/lib/token-settlement-service";
import { deriveQualityHints } from "@/lib/component-readiness-view";
import type { ComponentContract } from "@/lib/component-contract/types";

/** 兼容口径计费模式（未开启真实结算时的唯一口径） */
export const COMPATIBILITY_BILLING_MODE = "ESTIMATED_COMPATIBILITY";

/** 需要真实能力证据的抽象能力（不得无证据出现） */
export const CAPABILITIES_REQUIRING_EVIDENCE = ["VISION", "FILE_ANALYSIS", "LONG_CONTEXT"] as const;

export interface ComponentCapabilityRow {
  componentId: string;
  isPublished: boolean;
  activeContractId: string | null;
  activeContractVersion: string | null;
  activeLifecycle: string | null;
  requiredCapabilities: string[];
  missingCapabilities: string[];
  executable: boolean;
  /** 质量/产品限制提示（来自激活合同元数据派生；executable=true 不代表结果已验收） */
  qualityHints: string[];
}

export interface ComponentProgressAudit {
  generatedAt: string;
  windowDays: number;
  catalog: {
    total: number;
    published: number;
    withActiveContract: number;
    activePublished: number;
    /** 全部 lifecycle=PUBLISHED 的合同行数（含历史版本，数据库实时计数） */
    publishedContracts: number;
    noContract: number;
    draftOnly: number;
    invalidActiveRef: number;
    invalidActiveRefComponents: string[];
    /** 合同覆盖率（%）：正式激活（PUBLISHED）组件数 / 组件总数，无组件时为 null */
    contractCoveragePercent: number | null;
  };
  capabilities: {
    platformDefaultDeployment: {
      id: string | null;
      providerId: string | null;
      modelId: string | null;
      enabled: boolean;
      capabilities: string[];
    } | null;
    enabledDeployments: Array<{ providerId: string; modelId: string; capabilities: string[] }>;
    components: ComponentCapabilityRow[];
    /** 能力满足数：激活合同为 PUBLISHED 且部署能力全覆盖的组件数（= executableCount） */
    capabilitySatisfiedCount: number;
    executableCount: number;
    blockedByCapabilityCount: number;
    /** 部署声明了但缺乏证据的能力（NEEDS_REVIEW，绝不自动增删） */
    needsReviewDeploymentCapabilities: Array<{ providerId: string; modelId: string; capability: string }>;
    /** 合同要求但当前启用部署未覆盖的「需证据能力」 */
    contractsRequiringUnsupportedCapabilities: Array<{ componentId: string; capability: string }>;
  };
  execution: {
    recentRealModelTasks: number;
    recentSuccessfulRealExecutions: number;
    /** 窗口内全部任务数（用于计算真实模型覆盖率，前端不得写死比例） */
    recentTotalTasks: number;
    /** 真实模型覆盖率（%）：recentRealModelTasks / recentTotalTasks，无任务时为 null */
    realModelCoveragePercent: number | null;
  };
  billing: {
    settlementEnabled: boolean;
    billingMode: string;
    actualPoints: null;
    userPriceConfigured: boolean;
    markupRateBpsConfigured: boolean;
    markupRateBpsValues: number[];
    byokImplemented: boolean;
  };
}

function normCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((c) => String(c).trim().toUpperCase()).filter(Boolean)));
}

function requiredCapabilitiesOf(contract: unknown): string[] {
  return extractRequiredCapabilities(contract);
}

/** 构建组件进度只读审计结果（全部来自数据库） */
export async function buildComponentProgressAudit(options?: { windowDays?: number }): Promise<ComponentProgressAudit> {
  const windowDays = Number.isFinite(options?.windowDays) && (options?.windowDays as number) > 0 ? (options!.windowDays as number) : 7;

  // 1) 目录与合同（一次读全，逐组件分类）
  const catalogs = await prisma.componentcatalog.findMany({
    select: { id: true, isPublished: true, activeContractId: true },
  });
  const contracts = await prisma.componentcontract.findMany({
    select: { id: true, componentId: true, contractVersion: true, lifecycle: true, contract: true },
  });

  const contractById = new Map(contracts.map((c) => [c.id, c]));
  const contractsByComponent = new Map<string, typeof contracts>();
  for (const c of contracts) {
    const list = contractsByComponent.get(c.componentId) ?? [];
    list.push(c);
    contractsByComponent.set(c.componentId, list);
  }

  // 2) 部署能力（只读；不读取/返回 apiKeyEnv 值，不返回 baseUrl）
  const deployments = await prisma.modeldeployment.findMany({
    where: { enabled: true, provider: { enabled: true } },
    select: { providerId: true, modelId: true, capabilities: true },
  });
  const enabledDeployments = deployments.map((d) => ({
    providerId: d.providerId,
    modelId: d.modelId,
    capabilities: normCapabilities(d.capabilities),
  }));
  const enabledCapabilityUnion = new Set(enabledDeployments.flatMap((d) => d.capabilities));

  const pdId = await getPlatformDefaultDeploymentId();
  const pdRow = pdId
    ? await prisma.modeldeployment.findUnique({
        where: { id: pdId },
        select: { id: true, providerId: true, modelId: true, enabled: true, capabilities: true, provider: { select: { enabled: true } } },
      })
    : null;
  const platformDefaultDeployment = pdRow
    ? {
        id: pdRow.id,
        providerId: pdRow.providerId,
        modelId: pdRow.modelId,
        enabled: pdRow.enabled && pdRow.provider?.enabled === true,
        capabilities: normCapabilities(pdRow.capabilities),
      }
    : null;

  // 3) 逐组件分类 + 能力覆盖
  const componentRows: ComponentCapabilityRow[] = [];
  const invalidActiveRefComponents: string[] = [];
  let noContract = 0;
  let draftOnly = 0;
  let withActiveContract = 0;
  let activePublished = 0;

  for (const cat of catalogs) {
    const list = contractsByComponent.get(cat.id) ?? [];
    const active = cat.activeContractId ? contractById.get(cat.activeContractId) ?? null : null;

    if (list.length === 0) noContract++;
    else if (!list.some((c) => c.lifecycle === "PUBLISHED")) draftOnly++;

    // 激活合同除 lifecycle=PUBLISHED 外，必须满足 contract.componentId === cat.id，
    // 否则视为跨组件引用，不得计入 activePublished、不得冒用其 requiredCapabilities。
    const activeOwned =
      active != null &&
      active.lifecycle === "PUBLISHED" &&
      (active.contract as { componentId?: string } | null)?.componentId === cat.id;

    if (cat.activeContractId) {
      withActiveContract++;
      if (activeOwned) activePublished++;
      else if (!invalidActiveRefComponents.includes(cat.id)) invalidActiveRefComponents.push(cat.id);
    }

    // 跨组件引用：不得从错误归属的合同冒用 requiredCapabilities
    const required = activeOwned ? requiredCapabilitiesOf(active!.contract) : [];
    const missing = required.filter(
      (c) => !(platformDefaultDeployment?.enabled && platformDefaultDeployment.capabilities.includes(c)),
    );
    // 质量提示仅从本组件真实归属的激活合同元数据派生（跨组件引用不套用他人提示）
    const qualityHints = activeOwned ? deriveQualityHints(active!.contract as unknown as ComponentContract) : [];
    componentRows.push({
      componentId: cat.id,
      isPublished: cat.isPublished,
      activeContractId: cat.activeContractId ?? null,
      activeContractVersion: active?.contractVersion ?? null,
      activeLifecycle: active?.lifecycle ?? null,
      requiredCapabilities: required,
      missingCapabilities: missing,
      executable: Boolean(activeOwned && platformDefaultDeployment?.enabled && missing.length === 0),
      qualityHints,
    });
  }

  const contractsRequiringUnsupportedCapabilities: Array<{ componentId: string; capability: string }> = [];
  for (const row of componentRows) {
    for (const cap of row.requiredCapabilities) {
      if ((CAPABILITIES_REQUIRING_EVIDENCE as readonly string[]).includes(cap) && !enabledCapabilityUnion.has(cap)) {
        contractsRequiringUnsupportedCapabilities.push({ componentId: row.componentId, capability: cap });
      }
    }
  }
  const needsReviewDeploymentCapabilities: Array<{ providerId: string; modelId: string; capability: string }> = [];
  for (const d of enabledDeployments) {
    for (const cap of d.capabilities) {
      if ((CAPABILITIES_REQUIRING_EVIDENCE as readonly string[]).includes(cap)) {
        needsReviewDeploymentCapabilities.push({ providerId: d.providerId, modelId: d.modelId, capability: cap });
      }
    }
  }

  // 4) 执行统计（窗口内真实模型任务；JSON 字段按 MySQL JSON_EXTRACT 读取）
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const realModelWhere = `\`createdAt\` >= ? AND (
    JSON_UNQUOTE(JSON_EXTRACT(\`config\`, '$.executionMode')) = 'REAL_MODEL'
    OR JSON_UNQUOTE(JSON_EXTRACT(\`result\`, '$.executionMode')) = 'REAL_MODEL'
  )`;
  const realModelRows = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
    `SELECT COUNT(*) AS n FROM \`componenttask\` WHERE ${realModelWhere}`,
    since,
  );
  const realModelSuccessRows = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
    `SELECT COUNT(*) AS n FROM \`componenttask\` WHERE ${realModelWhere} AND \`status\` = 'SUCCESS'`,
    since,
  );
  const totalTaskRows = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
    "SELECT COUNT(*) AS n FROM `componenttask` WHERE `createdAt` >= ?",
    since,
  );
  const recentRealModelTasks = Number(realModelRows[0]?.n ?? 0);
  const recentTotalTasks = Number(totalTaskRows[0]?.n ?? 0);

  // 5) 计费与商业化状态（只读；不返回任何密钥）
  const pricingRows = await prisma.modelpricing.findMany({
    select: { priceInputMicrosPerMillion: true, priceOutputMicrosPerMillion: true, markupRateBps: true },
  });
  const userPriceConfigured = pricingRows.some(
    (p) => p.priceInputMicrosPerMillion !== null || p.priceOutputMicrosPerMillion !== null,
  );
  const markupRateBpsValues = pricingRows
    .map((p) => p.markupRateBps)
    .filter((v): v is number => typeof v === "number");

  return {
    generatedAt: new Date().toISOString(),
    windowDays,
    catalog: {
      total: catalogs.length,
      published: catalogs.filter((c) => c.isPublished).length,
      withActiveContract,
      activePublished,
      publishedContracts: contracts.filter((c) => c.lifecycle === "PUBLISHED").length,
      noContract,
      draftOnly,
      invalidActiveRef: invalidActiveRefComponents.length,
      invalidActiveRefComponents,
      contractCoveragePercent:
        catalogs.length > 0 ? Math.round((activePublished / catalogs.length) * 1000) / 10 : null,
    },
    capabilities: {
      platformDefaultDeployment,
      enabledDeployments,
      components: componentRows,
      capabilitySatisfiedCount: componentRows.filter((r) => r.executable).length,
      executableCount: componentRows.filter((r) => r.executable).length,
      blockedByCapabilityCount: componentRows.filter(
        (r) => r.activeLifecycle === "PUBLISHED" && r.missingCapabilities.length > 0,
      ).length,
      needsReviewDeploymentCapabilities,
      contractsRequiringUnsupportedCapabilities,
    },
    execution: {
      recentRealModelTasks,
      recentSuccessfulRealExecutions: Number(realModelSuccessRows[0]?.n ?? 0),
      recentTotalTasks,
      realModelCoveragePercent:
        recentTotalTasks > 0 ? Math.round((recentRealModelTasks / recentTotalTasks) * 1000) / 10 : null,
    },
    billing: {
      settlementEnabled: isTokenSettlementFeatureEnabled(),
      billingMode: COMPATIBILITY_BILLING_MODE,
      actualPoints: null,
      userPriceConfigured,
      markupRateBpsConfigured: markupRateBpsValues.length > 0,
      markupRateBpsValues,
      byokImplemented: false,
    },
  };
}
