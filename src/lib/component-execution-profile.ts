/**
 * 组件执行输入校验 / 绑定一致性 / Prompt 组装工具（中立模块）
 *
 * 本模块**已不再具备任何合同读取能力**（旧读取器已物理删除）：
 *  - 已删除：parseExecutionProfile / parseExecutionProfileValue / getComponentExecutionProfile /
 *    assertPilotContractOrThrow / buildPilotProfile / PILOT_COMPONENT_ID /
 *    ComponentCatalogLikeForProfile / ParseExecutionProfileResult / PilotModelBinding /
 *    CONTRACT_INPUT_MODES / CONTRACT_ARTIFACT_TYPES；
 *  - 合同唯一真源为数据库 component_contract + component_catalog.active_contract_id；
 *  - 本模块仅保留「输入校验 / 绑定一致性 / Prompt 组装」中立能力；
 *    ComponentExecutionProfile 在此仅为中立数据结构，不是数据库读取结果；
 *  - 可复用的提示词/摘要/隐私校验/退款判定工具位于 @/lib/component-runtime-utils。
 */

import { ContractValidationError } from "@/lib/component-runtime-utils";

export type ExecutionMode = "REAL_MODEL" | "SIMULATED";

export {
  isPrivateDocumentForbidden,
  shouldRefundOnFailure,
  buildSourceMaterialPrompt,
  summarizeText,
  ContractValidationError,
} from "@/lib/component-runtime-utils";

/** 中立执行规格数据结构（由 component_contract 派生的调用方自行组装，本模块不读取数据库） */
export interface ComponentExecutionProfile {
  componentId: string;
  /** 合同版本（用于绑定校验与结果标注） */
  contractVersion: string;
  input: {
    mode: "text" | "file" | "asset" | "multiple";
    maxItems: number;
    acceptedMimeTypes?: string[];
    maxTotalBytes?: number;
    requiresTextExtraction?: boolean;
  };
  model: {
    capability: string;
    defaultProviderId: string;
    defaultModelId: string;
    allowUserModelOverride: boolean;
  };
  output: {
    artifactTypes: Array<
      "report" | "table" | "document" | "code" | "image" | "json" | "file" | "bundle"
    >;
    primaryType: string;
    schemaVersion: string;
  };
  execution: {
    mode: ExecutionMode;
    promptTemplate?: string;
  };
}

/** 退款幂等键前缀（配合 taskId 使用，保证同一任务失败退款仅一次） */
export const REFUND_IDEMPOTENCY_PREFIX = "REFUND_MODEL_FAILURE";

/** 输入校验上下文（由路由从请求体 + 落库结构组装） */
export interface InputValidationContext {
  sourceType?: string | null; // "text" | "file" | "asset"
  inputMaterial: string; // 已提取的可分析文本（可能为空）
  fileName?: string | null;
  fileSize?: number | null;
  /** 主材料数量（当前阶段仅允许 1 个；用于 maxItems 强校验） */
  materialCount?: number;
}

/**
 * 依据组件执行规格校验输入材料：
 *  - 文件/资料来源必须已提取出非空文本；
 *  - input.mode 必须满足（text / file / asset / multiple）；
 *  - acceptedMimeTypes、maxTotalBytes 配置存在时强制生效；
 *  - 不把空字符串当成合法输入发给真实模型。
 * 校验失败抛出 ContractValidationError（含中文可读 message）。
 */
export function validateInputAgainstContract(
  profile: ComponentExecutionProfile,
  ctx: InputValidationContext,
): void {
  const mode = profile.input.mode;
  const src = ctx.sourceType || "text";
  const hasText = (ctx.inputMaterial || "").trim().length > 0;

  // 当前阶段仅允许单一主材料：明确拒绝数组 / 多文件输入，不宣称支持 multiple
  const materialCount = typeof ctx.materialCount === "number" ? ctx.materialCount : 1;
  if (materialCount > 1) {
    throw new ContractValidationError(
      "INPUT_MULTIPLE_NOT_SUPPORTED",
      "当前阶段仅支持单一主材料，不支持多文件 / 数组输入。",
      400,
    );
  }
  if (typeof profile.input.maxItems === "number" && materialCount > profile.input.maxItems) {
    throw new ContractValidationError(
      "INPUT_TOO_MANY",
      `输入材料数量（${materialCount}）超过上限 ${profile.input.maxItems}。`,
      400,
    );
  }

  // 文件或资料必须先有非空文本提取结果
  if ((src === "file" || src === "asset") && !hasText) {
    throw new ContractValidationError(
      "INPUT_TEXT_NOT_EXTRACTED",
      "文件或资料尚未提取出可分析文本，无法执行模型任务。",
      400,
    );
  }

  // input.mode 校验
  switch (mode) {
    case "text":
      if (!hasText && src !== "asset") {
        throw new ContractValidationError(
          "INPUT_REQUIRED",
          "该组件要求文本输入：请粘贴文本材料，或选择空间资料作为主材料。",
          400,
        );
      }
      break;
    case "file":
      if (src !== "file" && src !== "asset") {
        throw new ContractValidationError(
          "INPUT_REQUIRED",
          "该组件需要上传文件或选择空间资料作为主材料。",
          400,
        );
      }
      break;
    case "asset":
      if (src !== "asset") {
        throw new ContractValidationError("INPUT_REQUIRED", "该组件需要选择空间资料作为主材料。", 400);
      }
      break;
    case "multiple":
      // 文本 / 文件 / 资料任一即可，空文本已在上面拦截
      if (!hasText) {
        throw new ContractValidationError("INPUT_REQUIRED", "缺少可分析的输入材料。", 400);
      }
      break;
    default:
      if (!hasText) {
        throw new ContractValidationError("INPUT_REQUIRED", "缺少可分析的输入材料。", 400);
      }
  }

  // acceptedMimeTypes（配置存在时生效）
  if (profile.input.acceptedMimeTypes && profile.input.acceptedMimeTypes.length > 0 && ctx.fileName) {
    const ext = "." + (ctx.fileName.split(".").pop() || "").toLowerCase();
    const ok = profile.input.acceptedMimeTypes.some((m) => m.endsWith(ext) || m === "*");
    if (!ok) {
      throw new ContractValidationError(
        "INPUT_MIME_NOT_ALLOWED",
        `不支持的文件类型：${ctx.fileName}（仅允许 ${profile.input.acceptedMimeTypes.join("、")}）。`,
        400,
      );
    }
  }

  // maxTotalBytes（配置存在时生效）
  if (
    typeof profile.input.maxTotalBytes === "number" &&
    typeof ctx.fileSize === "number" &&
    ctx.fileSize > profile.input.maxTotalBytes
  ) {
    throw new ContractValidationError(
      "INPUT_TOO_LARGE",
      `文件过大（${ctx.fileSize} 字节），超过上限 ${profile.input.maxTotalBytes} 字节。`,
      400,
    );
  }
}

/** 当前支持的合同版本白名单 */
export const SUPPORTED_CONTRACT_VERSIONS = ["v1"];

/** 绑定一致性校验：componentId 必须一致，且合同版本必须受支持 */
export function assertContractBinding(profile: ComponentExecutionProfile, componentId: string): void {
  if (profile.componentId !== componentId) {
    throw new ContractValidationError(
      "CONTRACT_BINDING_MISMATCH",
      `组件执行合同绑定不一致（合同=${profile.componentId}，组件=${componentId}），拒绝执行。`,
      400,
    );
  }
  if (!profile.contractVersion || !SUPPORTED_CONTRACT_VERSIONS.includes(profile.contractVersion)) {
    throw new ContractValidationError(
      "CONTRACT_VERSION_UNSUPPORTED",
      `组件执行合同版本不受支持（版本=${profile.contractVersion || "缺失"}），拒绝执行。`,
      400,
    );
  }
}

/** 组装系统 Prompt（不记录原文到日志） */
export function buildSystemPrompt(
  profile: ComponentExecutionProfile,
  comp: { name?: string | null; description?: string | null },
): string {
  const base =
    profile.execution.promptTemplate ||
    "你是一名专业的效能分析助手，请基于用户提供的材料生成结构化结果。";
  const ctx = [
    comp?.name ? `当前组件：${comp.name}` : "",
    comp?.description ? `组件说明：${comp.description}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return ctx ? `${base}\n\n${ctx}` : base;
}

// buildSourceMaterialPrompt / summarizeText 已迁移至 @/lib/component-runtime-utils（见文件顶部再导出）

// ResultArtifact / buildResultArtifact 位于中立模块 @/lib/component-contract/artifact：
// 「合同输出类型 (ComponentOutputKind) -> 成果物类型」穷举映射，禁止 lowercase 强转与无关类型伪装。
// 此处仅做向后兼容再导出，绝不保留第二套成果物定义。
export type { ResultArtifact, ResultArtifactType } from "@/lib/component-contract/artifact";

// 说明：旧价格快照构建器 buildPricingSnapshot 已删除。
// 价格唯一真源为 modelpricing，快照统一由 @/lib/model-pricing 的 buildRegistryPricingSnapshot() 生成。
// 架构守护测试（model-architecture.test.ts）禁止生产路径再出现该旧函数与旧价格字段。
