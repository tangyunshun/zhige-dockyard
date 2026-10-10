/**
 * 任务查询与契约视图领域纯辅助函数
 *
 * 供 /api/tasks、/api/studio 等生产路由及测试统一复用，杜绝“测试自写实现再自测”的反模式。
 */

import type { ComponentContract } from "@/lib/component-contract/types";
import {
  extractContractFromSnapshot,
  extractTaskExecutionMeta,
  extractTaskListExecutionMeta,
  type TaskListExecutionMeta,
} from "@/lib/task-execution-meta";

/**
 * 任务历史合同安全视图（严格由任务自身 contractSnapshot 派生）
 *
 * 红线：
 *  - 严禁读取当前目录合同覆盖历史任务合同；
 *  - 严禁按 componentId 补写任何业务标签；
 *  - 快照缺失/损坏/无法确认合同本体时一律返回 null。
 */
export type TaskContractView = {
  contractVersion: string | null;
  outputKind: string | null;
  artifactMime: string | null;
  rendererType: string | null;
  qualityHints: string[];
  disclaimer: string | null;
  requireHumanReview: boolean;
};

/**
 * 任务详情专用安全执行元数据 DTO
 *
 * 与完整 TaskExecutionMeta 的区别：严禁回传 artifacts / 完整 config / 原始输入 / prompt /
 * storagePath / 密钥 / 内部堆栈；详情响应只允许出现下列白名单字段。
 */
export type TaskDetailExecutionMeta = {
  executionMode: "REAL_MODEL" | "SIMULATED" | "UNKNOWN";
  anomaly: string | null;
  legacy: boolean;
  provider: { id: string; modelId?: string } | null;
  model: string | null;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null;
  billingMode: string | null;
  estimatedPoints: number | null;
  actualPoints: number | null;
  contractVersion: string | null;
  hasContractSnapshot: boolean;
  qualityHints: string[];
};

export type TaskDetailArtifactItem = {
  id: string | null;
  type: string | null;
  title: string | null;
  mimeType: string | null;
  rendererType: string | null;
  content: string | Record<string, unknown> | null;
  previewable: boolean;
  downloadable: boolean;
};

/**
 * 任务详情接口（task_detail）严格安全白名单 DTO
 * 核心红线：
 * 绝不包含：storagePath / apiKey / token / baseURL / headers / 内部堆栈 / 完整 config / 原始输入 / prompt
 */
export type TaskDetailSafeDTO = {
  id: string;
  name: string;
  componentId: string;
  componentName: string;
  status: string;
  createdAt: Date | string;
  workspaceId: string | null;
  execution: TaskDetailExecutionMeta;
  contractVersion: string | null;
  hasContractSnapshot: boolean;
  contractView: TaskContractView | null;
  qualityHints: string[];
  refundStatus: "NO_CHARGE" | "REFUNDED" | "REFUND_PENDING" | "RECONCILIATION_REQUIRED" | "UNKNOWN" | null;
  refundedPoints: number | null;
  chargeAttempted: boolean | null;
  errorCode: string | null;
  errorMessage: string | null;
  outputData: string | Record<string, unknown> | null;
  artifacts: TaskDetailArtifactItem[];
  artifact: TaskDetailArtifactItem | null;
  hasArtifact: boolean;
};

/**
 * 安全提取任务错误信息（纯函数）
 * 优先级必须稳定：顶层错误 > 嵌套结构错误（不被覆盖）
 * 严格拒绝：stack / prompt / inputMaterial / storagePath / 密钥或供应商原始响应
 */
export function extractSafeTaskError(res: Record<string, unknown> | null): {
  errorCode: string | null;
  errorMessage: string | null;
} {
  if (!res) {
    return { errorCode: null, errorMessage: null };
  }

  const od = res.outputData && typeof res.outputData === "object" && !Array.isArray(res.outputData)
    ? (res.outputData as Record<string, unknown>)
    : null;

  // 1. 错误码提取（稳定优先级）
  const rawCode =
    (typeof res.code === "string" ? res.code : null) ||
    (typeof res.errorCode === "string" ? res.errorCode : null) ||
    (typeof od?.code === "string" ? od.code : null);
  const errorCode = rawCode && rawCode.trim().length > 0 ? rawCode.trim() : null;

  // 2. 错误信息提取（稳定优先级：顶层优先，不被嵌套结构覆盖更可信错误）
  const rawMsg =
    (typeof res.error === "string" ? res.error : null) ||
    (typeof res.message === "string" ? res.message : null) ||
    (typeof od?.error === "string" ? od.error : null) ||
    (typeof od?.message === "string" ? od.message : null);

  if (!rawMsg || !rawMsg.trim()) {
    return { errorCode, errorMessage: null };
  }

  const trimmed = rawMsg.trim();

  // 检查是否包含敏感调用堆栈、内部 Prompt、输入材料、存储路径、密钥或供应商响应
  const containsSensitive =
    /\n\s*at\s+|at\s+[\w.$<>]+\s*\(|node:internal|storagePath|api[_-]?key|Bearer\s+|sk-[a-zA-Z0-9]{10,}|https?:\/\/|password|credential|inputMaterial|prompt|rawResponse/i.test(trimmed);

  if (containsSensitive) {
    return { errorCode, errorMessage: "任务执行未通过质量守卫，详情已记录安全日志" };
  }

  return { errorCode, errorMessage: trimmed.slice(0, 500) };
}

// 敏感键名完全正则匹配（含常见大小写变体与分隔符）
const SENSITIVE_KEY_REGEX = /^(apikey|secret|token|authorization|headers|baseurl|storagepath|prompt|inputmaterial|rawresponse|stack|trace|password|credential)$/i;

// 敏感字符串值探针：Bearer凭证、高熵密钥前缀、调用栈特征、内部绝对路径、供应商推理 URL
const SENSITIVE_VALUE_REGEX = /(?:bearer\s+[a-zA-Z0-9_\-.]+|sk-[a-zA-Z0-9]{16,}|node:internal|\/app\/src\/|[a-zA-Z]:\\[^\n\r]+\.(?:ts|js|json|tsx|jsx)|\bhttps?:\/\/(?:api\.|internal\.|api-inference)[^\s"'>]+|\bat\s+[\w.$<>]+\s*\(|\n\s*at\s+)/i;

/**
 * 递归安全过滤 artifact content 结构：
 * 1. 递归拒绝/剥离敏感键名；
 * 2. 深度扫描字符串值，识别密钥、内部路径、堆栈或供应商响应；
 * 3. 数组与嵌套对象递归下钻，发现不可恢复污染或未知危险结构时整树 fail-closed；
 * 4. 无法确认结构安全或有效键全被剔除时返回 null。
 */
export function sanitizeArtifactContentRecursively(
  val: unknown,
  depth = 0,
): { content: unknown; isSafe: boolean } {
  if (depth > 12) return { content: null, isSafe: false };
  if (val === null || val === undefined) return { content: val, isSafe: true };

  if (typeof val === "string") {
    if (SENSITIVE_VALUE_REGEX.test(val)) {
      return { content: null, isSafe: false };
    }
    return { content: val, isSafe: true };
  }

  if (typeof val === "number" || typeof val === "boolean") {
    return { content: val, isSafe: true };
  }

  if (Array.isArray(val)) {
    const cleanedArr: unknown[] = [];
    for (const item of val) {
      const res = sanitizeArtifactContentRecursively(item, depth + 1);
      if (!res.isSafe) return { content: null, isSafe: false };
      cleanedArr.push(res.content);
    }
    return { content: cleanedArr, isSafe: true };
  }

  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const cleanedObj: Record<string, unknown> = {};
    let keptCount = 0;
    for (const [k, v] of Object.entries(obj)) {
      const normalizedKey = k.replace(/[-_]/g, "");
      if (SENSITIVE_KEY_REGEX.test(normalizedKey)) {
        continue;
      }
      const res = sanitizeArtifactContentRecursively(v, depth + 1);
      if (!res.isSafe) {
        return { content: null, isSafe: false };
      }
      cleanedObj[k] = res.content;
      keptCount++;
    }
    if (keptCount === 0 && Object.keys(obj).length > 0) {
      return { content: null, isSafe: false };
    }
    return { content: cleanedObj, isSafe: true };
  }

  return { content: null, isSafe: false };
}

/**
 * 任务详情接口（task_detail）严格安全白名单序列化函数（纯函数，供路由与测试统一复用）
 * 核心规则：
 * 1. 白名单输出，绝不透传 storagePath、apiKey、token、baseURL、headers、内部堆栈、原始输入或 prompt；
 * 2. 失败任务：artifacts=[]，artifact=null，hasArtifact=false，outputData=null，仅返回 safe errorCode/errorMessage；
 * 3. 成功任务：白名单成果物过滤，DOCUMENT 允许 Markdown 字符串，结构化成果物安全过滤，无法确认结构时设 previewable/downloadable=false；
 * 4. 账务事实：无账务证据时 chargeAttempted 为 null，refundStatus 为 UNKNOWN，绝不按错误码猜测。
 */
export function serializeTaskDetailItem(
  task: {
    id: string;
    name: string;
    type: string | null;
    status: string;
    createdAt: Date | string;
    tenantId: string | null;
    config?: unknown;
    result?: unknown;
  },
  componentName: string,
  refundMeta: {
    refundStatus: "NO_CHARGE" | "REFUNDED" | "REFUND_PENDING" | "RECONCILIATION_REQUIRED" | "UNKNOWN" | null;
    refundedPoints: number | null;
    chargeAttempted: boolean | null;
  },
): TaskDetailSafeDTO {
  const cfg = task.config && typeof task.config === "object" ? (task.config as Record<string, unknown>) : null;
  const res = task.result && typeof task.result === "object" ? (task.result as Record<string, unknown>) : null;

  // 1. 提取执行元数据（严格白名单，剥离 artifacts/完整 config/原始输入/prompt/密钥/堆栈）
  const executionRaw = extractTaskExecutionMeta(task.config, task.result, task.createdAt);

  const safeProvider: { id: string; modelId?: string } | null = executionRaw.provider?.id
    ? {
        id: executionRaw.provider.id,
        modelId: executionRaw.provider.modelId || undefined,
      }
    : null;

  const safeUsage = executionRaw.usage
    ? {
        inputTokens: executionRaw.usage.inputTokens ?? undefined,
        outputTokens: executionRaw.usage.outputTokens ?? undefined,
        totalTokens: executionRaw.usage.totalTokens ?? undefined,
      }
    : null;

  const execution: TaskDetailExecutionMeta = {
    executionMode: executionRaw.executionMode,
    anomaly: executionRaw.anomaly,
    legacy: executionRaw.legacy,
    provider: safeProvider,
    model: executionRaw.model,
    usage: safeUsage,
    billingMode: executionRaw.billingMode,
    estimatedPoints: executionRaw.estimatedPoints,
    actualPoints: executionRaw.actualPoints,
    contractVersion: executionRaw.contractVersion,
    hasContractSnapshot: executionRaw.hasContractSnapshot,
    qualityHints: executionRaw.qualityHints || [],
  };

  // 2. 历史合同安全视图
  const rawSnapshot = cfg?.contractSnapshot ?? res?.contractSnapshot ?? null;
  const contractView = deriveTaskContractView(rawSnapshot, execution.qualityHints);

  // 3. 错误码与错误信息提取
  const { errorCode, errorMessage } = extractSafeTaskError(res);

  // 4. 失败与成功分支处理
  const isSuccess = task.status === "SUCCESS";

  const safeArtifacts: TaskDetailArtifactItem[] = [];
  let safeArtifact: TaskDetailArtifactItem | null = null;
  let hasArtifact = false;
  let safeOutputData: string | Record<string, unknown> | null = null;

  // 校验任务自身 contractSnapshot 是否有效且具备已确认的 output 规格
  const extractedContract = extractContractFromSnapshot(rawSnapshot);
  const contractOutputKind = extractedContract?.output?.kind ?? null;
  const isSnapshotValid = extractedContract !== null && typeof contractOutputKind === "string";

  if (isSuccess && isSnapshotValid) {
    const pushSafeArtifact = (raw: unknown): void => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
      const a = raw as Record<string, unknown>;

      // 规则 #2/#7：artifact.type 必须显式存在且（大小写归一化）匹配历史合同 output.kind；
      // 缺失或未知类型一律 fail-closed，严禁用合同 output.kind 掩盖缺失的 artifact.type。
      const rawType = typeof a.type === "string" ? a.type.trim() : null;
      if (!rawType) return;
      const normType = rawType.toUpperCase();
      const normContractKind = contractOutputKind ? String(contractOutputKind).toUpperCase() : null;
      if (!normContractKind || normType !== normContractKind) return;

      // 规则 #3：合同声明 artifactMime 时，artifact.mimeType 缺失或不匹配必须 fail closed。
      const contractMime = extractedContract?.output?.artifactMime ?? null;
      if (contractMime) {
        const artMime = typeof a.mimeType === "string" ? a.mimeType.trim() : null;
        if (!artMime || artMime.toUpperCase() !== String(contractMime).toUpperCase()) return;
      }

      // 规则 #4：合同声明 rendererType 时，artifact.rendererType 缺失或不匹配必须 fail closed。
      const contractRenderer = extractedContract?.output?.rendererType ?? null;
      if (contractRenderer) {
        const artRenderer = typeof a.rendererType === "string" ? a.rendererType.trim() : null;
        if (!artRenderer || artRenderer.toUpperCase() !== String(contractRenderer).toUpperCase()) return;
      }

      let content: string | Record<string, unknown> | null = null;
      // 规则 #6：校验失败或内容不安全时 content=null / previewable=false / downloadable=false，且不计入可导出成果物。
      let previewable = false;
      let downloadable = false;

      if (normContractKind === "DOCUMENT") {
        // 规则 #5：DOCUMENT 只允许非空字符串 Markdown content。
        if (typeof a.content === "string" && a.content.trim().length > 0) {
          const res = sanitizeArtifactContentRecursively(a.content);
          if (res.isSafe && typeof res.content === "string") {
            content = res.content;
            previewable = true;
            downloadable = true;
          }
        }
      } else {
        // 结构化成果物：递归安全过滤
        const res = sanitizeArtifactContentRecursively(a.content);
        if (res.isSafe && res.content !== null && typeof res.content === "object" && !Array.isArray(res.content)) {
          content = res.content as Record<string, unknown>;
          previewable = true;
          downloadable = true;
        } else if (res.isSafe && typeof res.content === "string") {
          content = res.content;
          previewable = true;
          downloadable = true;
        }
      }

      safeArtifacts.push({
        id: typeof a.id === "string" ? a.id : null,
        type: rawType,
        title: typeof a.title === "string" ? a.title : typeof a.name === "string" ? a.name : null,
        // 仅当 artifact 显式携带且与合同一致时才填充，缺失一律为 null（绝不回退到合同值掩盖）
        mimeType: typeof a.mimeType === "string" ? a.mimeType : null,
        rendererType: typeof a.rendererType === "string" ? a.rendererType : null,
        content,
        previewable,
        downloadable,
      });
    };

    const odObj = res?.outputData && typeof res.outputData === "object" && !Array.isArray(res.outputData)
      ? (res.outputData as Record<string, unknown>)
      : null;

    if (odObj && Array.isArray(odObj.artifacts)) {
      for (const a of odObj.artifacts as unknown[]) pushSafeArtifact(a);
    }
    if (safeArtifacts.length === 0 && Array.isArray(res?.artifacts)) {
      for (const a of res.artifacts as unknown[]) pushSafeArtifact(a);
    }
    if (safeArtifacts.length === 0 && res?.artifact) {
      pushSafeArtifact(res.artifact);
    }

    hasArtifact = safeArtifacts.length > 0;
    if (hasArtifact) {
      safeArtifact = safeArtifacts[0];
    }

    // 成功任务：DOCUMENT 允许返回 Markdown 字符串，且必须经字符串安全清洗
    if (typeof res?.outputData === "string" && contractOutputKind === "DOCUMENT") {
      const sanitizedOut = sanitizeArtifactContentRecursively(res.outputData);
      if (sanitizedOut.isSafe && typeof sanitizedOut.content === "string") {
        safeOutputData = sanitizedOut.content;
      }
    }
  } else {
    // 失败任务或快照损坏/缺失任务：全部 fail closed，绝不透传原始 outputData 或伪造成果物
    safeOutputData = null;
  }

  return {
    id: task.id,
    name: task.name,
    componentId: task.type || "",
    componentName: componentName || task.type || "",
    status: task.status,
    createdAt: task.createdAt,
    workspaceId: task.tenantId,
    execution,
    contractVersion: execution.contractVersion,
    hasContractSnapshot: execution.hasContractSnapshot,
    contractView,
    qualityHints: execution.qualityHints || [],
    refundStatus: refundMeta.refundStatus ?? null,
    refundedPoints: refundMeta.refundedPoints ?? null,
    chargeAttempted: typeof refundMeta.chargeAttempted === "boolean" ? refundMeta.chargeAttempted : null,
    errorCode,
    errorMessage,
    outputData: safeOutputData,
    artifacts: safeArtifacts,
    artifact: safeArtifact,
    hasArtifact,
  };
}

/**
 * 从任务自身快照派生历史合同安全视图。
 *
 * @param snapshot 任务记录中的 contractSnapshot（config 或 result 内的原始快照）
 * @param qualityHints 由同一快照派生的质量提示（调用方取自任务执行元数据）
 * @returns 快照无效时返回 null；有效时返回安全视图
 */
export function deriveTaskContractView(
  snapshot: unknown,
  qualityHints: string[] = [],
): TaskContractView | null {
  // 复用统一快照校验：快照缺失、损坏或无法确认合同本体时严格返回 null
  const contract = extractContractFromSnapshot(snapshot);
  if (!contract) return null;

  const qualityPolicy = contract.qualityPolicy as
    | {
        requireHumanReview?: boolean;
        disclaimerPolicy?: { required?: boolean; marker?: string; template?: string };
      }
    | undefined;

  return {
    contractVersion: typeof contract.contractVersion === "string" ? contract.contractVersion : null,
    outputKind: contract.output?.kind ?? null,
    artifactMime: contract.output?.artifactMime ?? null,
    rendererType: contract.output?.rendererType ?? null,
    qualityHints,
    // 免责声明严格读取 contract.qualityPolicy.disclaimerPolicy.template；无模板时为 null（不做 marker 兜底）
    disclaimer: qualityPolicy?.disclaimerPolicy?.template ?? null,
    requireHumanReview: qualityPolicy?.requireHumanReview === true,
  };
}
import type { TaskRefundMeta } from "@/lib/refund-status";

export type CatalogContractView = {
  contractVersion: string | null;
  inputKind: string | null;
  textConstraints: {
    minLength?: number;
    maxLength?: number;
  } | null;
  fileConstraints: {
    required?: boolean;
    minCount?: number;
    maxCount?: number;
    acceptedMimes?: string[];
    maxSingleFileBytes?: number;
    maxTotalBytes?: number;
  } | null;
  outputKind: string | null;
  artifactMime: string | null;
  rendererType: string | null;
  requiredCapabilities: string[];
  qualityHints: string[];
  requireHumanReview: boolean;
  disclaimer: string | null;
};

/**
 * 构造安全的工作空间任务过滤条件
 * 核心红线：
 * 1. 只能查询当前用户成员关系有效的空间；
 * 2. lastWorkspaceId 只能作为候选，不能直接加入授权集合；
 * 3. 必须通过 workspacemember 或空间权限验证。
 */
export function buildTaskWorkspacePermissionFilter(
  validWorkspaceIds: string[],
  lastWorkspaceCandidate?: string | null,
): { tenantId: { in: string[] } } {
  const allowed = new Set(validWorkspaceIds.filter(Boolean));
  if (lastWorkspaceCandidate && allowed.has(lastWorkspaceCandidate)) {
    allowed.add(lastWorkspaceCandidate);
  }
  return {
    tenantId: { in: Array.from(allowed) },
  };
}

/**
 * 任务列表数据最小化序列化函数
 * 核心红线：
 * 列表严禁返回：
 * - config.inputMaterial
 * - 原始文件内容
 * - Prompt
 * - 完整 config
 * - 完整 result
 * - 模型密钥信息
 * - 未经确认的原始账务数据
 */
export function serializeTaskListItem(
  task: {
    id: string;
    name: string;
    type: string | null;
    status: string;
    createdAt: Date | string;
    tenantId: string | null;
    config?: unknown;
    result?: unknown;
  },
  wsInfo: { name: string; type: string },
  componentName: string,
  refundMeta: TaskRefundMeta,
) {
  const res = task.result && typeof task.result === "object" ? (task.result as Record<string, unknown>) : null;

  const execution = extractTaskListExecutionMeta(task.config, task.result, task.createdAt);

  // 顶层合同版本只采信已验证的 execution.contractVersion（来自任务持久化不可变合同快照）；
  // 严禁回退裸 config.contractVersion / result.contractVersion 字段；无快照或版本不可确认时一律为 null。
  const contractVersion = execution.hasContractSnapshot ? execution.contractVersion : null;
  const errorCode =
    (typeof res?.code === "string" ? res.code : null) ||
    (typeof res?.errorCode === "string" ? res.errorCode : null);

  let resultSummary: string | null = null;
  if (typeof res?.summary === "string") {
    resultSummary = res.summary;
  } else if (typeof res?.outputData === "string") {
    resultSummary = res.outputData.slice(0, 150) + (res.outputData.length > 150 ? "..." : "");
  }

  return {
    id: task.id,
    name: task.name,
    componentId: task.type || "",
    componentName: componentName || task.type || "",
    status: task.status,
    createdAt: task.createdAt,
    workspaceId: task.tenantId,
    workspaceName: wsInfo.name,
    workspaceType: wsInfo.type,
    execution,
    contractVersion,
    refundStatus: refundMeta.refundStatus,
    refundedPoints: refundMeta.refundedPoints,
    chargeAttempted: refundMeta.chargeAttempted,
    errorCode,
    resultSummary,
  };
}

/**
 * 从合同和质量提示派生标准的目录合同只读视图 CatalogContractView
 * 核心红线：
 * - 只返回前端需要的字段；
 * - 不返回完整 prompt；
 * - 不返回密钥或模型连接信息；
 * - 不返回原始用户数据；
 * - qualityHints 从合同 qualityPolicy 派生；
 * - requireHumanReview 从合同策略返回；
 * - disclaimer 从合同 qualityPolicy.disclaimerPolicy 派生；
 * - outputKind 从合同输出定义返回；
 * - contractVersion 从当前激活合同返回。
 */
export function deriveCatalogContractView(
  contract: ComponentContract | null,
  qualityHints: string[] = [],
): CatalogContractView | null {
  if (!contract) return null;

  const reqCaps = Array.from(
    new Set((contract.executionPlan?.steps ?? []).flatMap((s) => s.requiredCapabilities ?? [])),
  );

  // 免责声明严格读取 contract.qualityPolicy.disclaimerPolicy.template；无模板时为 null（不做 marker 兜底，与 deriveTaskContractView 保持一致）
  const disclaimer = contract.qualityPolicy?.disclaimerPolicy?.template ?? null;

  return {
    contractVersion: contract.contractVersion ?? null,
    inputKind: contract.input?.kind ?? null,
    textConstraints: contract.input?.textConstraints
      ? {
          minLength: contract.input.textConstraints.minLength,
          maxLength: contract.input.textConstraints.maxLength,
        }
      : null,
    fileConstraints: contract.input?.fileConstraints
      ? {
          required: contract.input.fileConstraints.required,
          minCount: contract.input.fileConstraints.minCount,
          maxCount: contract.input.fileConstraints.maxCount,
          acceptedMimes: contract.input.fileConstraints.acceptedMimes,
          maxSingleFileBytes: contract.input.fileConstraints.maxSingleFileBytes,
          maxTotalBytes: contract.input.fileConstraints.maxTotalBytes,
        }
      : null,
    outputKind: contract.output?.kind ?? null,
    artifactMime: contract.output?.artifactMime ?? null,
    rendererType: contract.output?.rendererType ?? null,
    requiredCapabilities: reqCaps,
    qualityHints,
    requireHumanReview: contract.qualityPolicy?.requireHumanReview ?? false,
    disclaimer,
  };
}
