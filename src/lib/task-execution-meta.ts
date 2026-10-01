/**
 * 任务执行元数据统一提取（真实 / 模拟 / 未知）。
 *
 * 原则：
 *  - 禁止根据组件名、是否存在 artifacts 等信号"猜测"执行模式；
 *  - 缺失 executionMode → UNKNOWN（EXECUTION_META_MISSING），不得默认为 SIMULATED；
 *  - REAL_MODEL 但缺 provider / usage / contractVersion → 标记数据异常（供审计）；
 *  - 仅"执行元数据引入前的旧历史任务"才允许标记为历史数据缺失（legacy）。
 */

/** 执行元数据引入时间点：早于该时间的无元数据任务视为旧历史数据 */
export const EXEC_META_CUTOFF_ISO = "2026-09-19T00:00:00.000Z";

import { deriveQualityHints } from "@/lib/component-readiness-view";
import type { ComponentContract } from "@/lib/component-contract/types";

export type TaskExecutionMode = "REAL_MODEL" | "SIMULATED" | "UNKNOWN";

export interface TaskExecutionMeta {
  executionMode: TaskExecutionMode;
  /** 执行元数据缺失（无法判定真实/模拟） */
  metaMissing: boolean;
  /** 数据异常标记（如 REAL_MODEL 元数据不完整），供前端提示与后端审计 */
  anomaly: string | null;
  /** 是否为执行元数据引入前的旧历史任务 */
  legacy: boolean;
  provider: { id: string; modelId: string } | null;
  model: string | null;
  usage: { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null } | null;
  billingMode: string;
  estimatedPoints: number | null;
  actualPoints: number | null;
  artifacts: unknown[] | null;
  contractVersion: string | null;
  /**
   * 对应历史任务实际使用的合同版本的质量/限制提示。
   * 优先从任务持久化的不可变快照 (contractSnapshot) 派生；
   * 既无快照又无版本的历史任务（legacy）明确为空，严禁拿最新目录提示回填！
   */
  qualityHints: string[];
  /** 任务是否持有不可变合同快照 */
  hasContractSnapshot: boolean;
}

/**
 * 专用于任务列表的严格安全脱敏元数据（CORE-3-R3 规范）
 * 核心红线：
 * 列表严禁返回：
 * - artifacts
 * - artifact.content
 * - outputData
 * - inputMaterial
 * - prompt
 * - 完整 config
 * - provider secret / headers / baseURL
 * - 内部错误堆栈
 */
export type TaskListExecutionMeta = {
  executionMode: "REAL_MODEL" | "SIMULATED" | "UNKNOWN";
  anomaly: string | null;
  legacy: boolean;
  provider: string | null;
  model: string | null;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  } | null;
  billingMode: string | null;
  estimatedPoints: number | null;
  actualPoints: number | null;
  contractVersion: string | null;
  hasContractSnapshot: boolean;
  qualityHints: string[];
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * 最小快照类型守卫：判断输入对象是否具备合法的 ComponentContract 核心结构
 */
export function isComponentContractEntity(v: unknown): v is ComponentContract {
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return false;
  }
  const obj = v as Record<string, unknown>;
  // 必须具有合法的 output 对象（不得将未拆解的包装层直接当做实体）
  if (!obj.output || typeof obj.output !== "object" || Array.isArray(obj.output)) {
    return false;
  }
  const out = obj.output as Record<string, unknown>;
  const hasOutputKind = typeof out.kind === "string" || typeof out.type === "string";
  const hasStructure = out.structureConstraints !== undefined && typeof out.structureConstraints === "object";
  return hasOutputKind || hasStructure;
}

/**
 * 从原始快照数据中提取合同本体。
 * 同时兼容：
 *  1. 真实保存的快照包装结构: { contract: ComponentContract, ... }
 *  2. 直接合同结构: ComponentContract
 * 快照缺失、损坏或无法确认合同本体时，严格返回 null。
 */
export function extractContractFromSnapshot(rawSnapshot: unknown): ComponentContract | null {
  if (!rawSnapshot || typeof rawSnapshot !== "object" || Array.isArray(rawSnapshot)) {
    return null;
  }
  const snap = rawSnapshot as Record<string, unknown>;

  // 1. 优先检查包装结构: { contract: { ... } }
  if (snap.contract && typeof snap.contract === "object" && !Array.isArray(snap.contract)) {
    if (isComponentContractEntity(snap.contract)) {
      return snap.contract;
    }
    // 包含 contract 键但本体结构损坏，直接拒绝（不回退也不冒充）
    return null;
  }

  // 2. 检查直接合同结构
  if (isComponentContractEntity(snap)) {
    return snap;
  }

  // 3. 其它任意结构（损坏快照）
  return null;
}

export function extractTaskExecutionMeta(config: unknown, result: unknown, createdAt?: string | Date | null): TaskExecutionMeta {
  const c = asRecord(config);
  const r = asRecord(result);

  const rawMode = r.executionMode ?? c.executionMode;
  let executionMode: TaskExecutionMode = "UNKNOWN";
  if (rawMode === "REAL_MODEL") executionMode = "REAL_MODEL";
  else if (rawMode === "SIMULATED") executionMode = "SIMULATED";

  let provider: TaskExecutionMeta["provider"] = null;
  if (r.provider && typeof r.provider === "object" && !Array.isArray(r.provider)) {
    const prov = r.provider as Record<string, unknown>;
    provider = { id: String(prov.id ?? ""), modelId: String(prov.modelId ?? "") };
  } else if (typeof c.providerId === "string" && c.providerId) {
    provider = { id: c.providerId, modelId: String(c.modelId ?? "") };
  }

  let usage: TaskExecutionMeta["usage"] = null;
  if (r.usage && typeof r.usage === "object" && !Array.isArray(r.usage)) {
    const u = r.usage as Record<string, unknown>;
    usage = {
      inputTokens: typeof u.inputTokens === "number" ? u.inputTokens : null,
      outputTokens: typeof u.outputTokens === "number" ? u.outputTokens : null,
      totalTokens: typeof u.totalTokens === "number" ? u.totalTokens : null,
    };
  } else if (c.totalTokens !== undefined || c.inputTokens !== undefined || c.outputTokens !== undefined) {
    usage = {
      inputTokens: typeof c.inputTokens === "number" ? c.inputTokens : null,
      outputTokens: typeof c.outputTokens === "number" ? c.outputTokens : null,
      totalTokens: typeof c.totalTokens === "number" ? c.totalTokens : null,
    };
  }

  const rawTaskContractVersion =
    typeof c.contractVersion === "string" && c.contractVersion.trim()
      ? c.contractVersion.trim()
      : typeof r.contractVersion === "string" && r.contractVersion.trim()
        ? r.contractVersion.trim()
        : null;

  const rawSnapshot = c.contractSnapshot ?? r.contractSnapshot ?? null;
  const extractedContract = extractContractFromSnapshot(rawSnapshot);
  const hasContractSnapshot = extractedContract !== null;

  let qualityHints: string[] = [];
  let trustedContractVersion: string | null = rawTaskContractVersion;
  let versionMismatch = false;

  if (hasContractSnapshot && extractedContract) {
    try {
      qualityHints = deriveQualityHints(extractedContract);
    } catch {
      qualityHints = [];
    }

    const snapshotVersion =
      typeof extractedContract.contractVersion === "string" && extractedContract.contractVersion.trim()
        ? extractedContract.contractVersion.trim()
        : null;

    if (snapshotVersion) {
      if (rawTaskContractVersion) {
        if (rawTaskContractVersion === snapshotVersion) {
          trustedContractVersion = rawTaskContractVersion;
        } else {
          // 任务记录版本与快照版本冲突：不可作为可信版本展示
          trustedContractVersion = null;
          versionMismatch = true;
        }
      } else {
        trustedContractVersion = snapshotVersion;
      }
    } else {
      trustedContractVersion = rawTaskContractVersion;
    }
  } else {
    // 快照缺失或损坏：严格不派生提示，不得拿最新目录提示回填
    qualityHints = [];
    trustedContractVersion = rawTaskContractVersion;
  }

  const createdAtMs = createdAt ? new Date(createdAt).getTime() : NaN;
  const legacy = Number.isFinite(createdAtMs) && createdAtMs < new Date(EXEC_META_CUTOFF_ISO).getTime();

  let anomaly: string | null = null;
  if (executionMode === "UNKNOWN") {
    anomaly = "EXECUTION_META_MISSING";
  } else if (versionMismatch) {
    anomaly = "CONTRACT_VERSION_MISMATCH";
  } else if (executionMode === "REAL_MODEL" && (!provider || !usage || !rawTaskContractVersion)) {
    anomaly = "REAL_MODEL_META_INCOMPLETE";
  }

  return {
    executionMode,
    metaMissing: executionMode === "UNKNOWN",
    anomaly,
    legacy: executionMode === "UNKNOWN" ? legacy : false,
    provider,
    model: provider?.modelId ?? null,
    usage,
    billingMode:
      typeof c.billingMode === "string"
        ? c.billingMode
        : executionMode === "SIMULATED"
          ? "SIMULATED"
          : executionMode === "REAL_MODEL"
            ? "ESTIMATED_COMPATIBILITY"
            : "UNKNOWN",
    estimatedPoints:
      typeof c.estimatedPoints === "number" ? c.estimatedPoints : typeof c.tokenCost === "number" ? c.tokenCost : null,
    actualPoints: typeof c.actualPoints === "number" ? c.actualPoints : null,
    artifacts: Array.isArray(r.artifacts) ? r.artifacts : null,
    contractVersion: trustedContractVersion,
    qualityHints,
    hasContractSnapshot,
  };
}

/**
 * 从任务配置、结果与创建时间中提取专用于列表视图的安全脱敏执行元数据
 * 严格遵循 CORE-3-R3 规范：
 * - 绝不返回 artifacts 或其内部 content
 * - 绝不返回 outputData / inputMaterial / prompt
 * - provider 仅返回脱敏的安全标识（字符串或 null）
 * - usage 仅返回 token 统计数值
 */
export function extractTaskListExecutionMeta(
  config: unknown,
  result: unknown,
  createdAt?: string | Date | null,
): TaskListExecutionMeta {
  const meta = extractTaskExecutionMeta(config, result, createdAt);

  let safeUsage: TaskListExecutionMeta["usage"] = null;
  if (meta.usage) {
    const hasAnyToken =
      typeof meta.usage.inputTokens === "number" ||
      typeof meta.usage.outputTokens === "number" ||
      typeof meta.usage.totalTokens === "number";

    if (hasAnyToken) {
      safeUsage = {};
      if (typeof meta.usage.inputTokens === "number") safeUsage.inputTokens = meta.usage.inputTokens;
      if (typeof meta.usage.outputTokens === "number") safeUsage.outputTokens = meta.usage.outputTokens;
      if (typeof meta.usage.totalTokens === "number") safeUsage.totalTokens = meta.usage.totalTokens;
    }
  }

  const safeProvider = meta.provider?.id || null;

  return {
    executionMode: meta.executionMode,
    anomaly: meta.anomaly,
    legacy: meta.legacy,
    provider: safeProvider,
    model: meta.model,
    usage: safeUsage,
    billingMode: meta.billingMode || null,
    estimatedPoints: meta.estimatedPoints,
    actualPoints: meta.actualPoints,
    contractVersion: meta.contractVersion,
    hasContractSnapshot: meta.hasContractSnapshot,
    qualityHints: meta.qualityHints || [],
  };
}
