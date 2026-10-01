/**
 * 通用组件合同纯领域类型定义
 *
 * 核心设计原则：
 * 1. 与数据库 ORM (Prisma) 彻底解耦；
 * 2. 禁止任何具体组件 ID 特判；
 * 3. 禁止任何具体模型厂商或具体模型 ID 硬编码；
 * 4. 严禁可执行代码字段与 API Key 等敏感信息；
 * 5. 所有大小、数量、Token 预算字段必须为安全整数 (Safe Integer)。
 */

/** 合同生命周期状态 */
export type ContractLifecycle = "DRAFT" | "PUBLISHED" | "ARCHIVED";

/** 输入类型模式 */
export type ComponentInputKind =
  | "TEXT"
  | "FILE"
  | "MULTI_FILE"
  | "TEXT_AND_FILES"
  | "STRUCTURED_FORM"
  | "UPSTREAM_ARTIFACT";

/** 材料处理流水线步骤类型 */
export type MaterialPipelineStepType =
  | "TEXT_NORMALIZE"
  | "DOCUMENT_PARSE"
  | "OCR"
  | "TABLE_EXTRACT"
  | "MATERIAL_MERGE"
  | "UPSTREAM_ARTIFACT_LOAD";

/** 模型抽象能力要求（严禁具体模型/供应商名称） */
export type RequiredModelCapability =
  | "TEXT_GENERATION"
  | "STRUCTURED_OUTPUT"
  | "VISION"
  | "LONG_CONTEXT"
  | "FILE_ANALYSIS";

/** 输出成果物类型 */
export type ComponentOutputKind =
  | "DOCUMENT"
  | "TABLE"
  | "SCORE"
  | "TIMELINE"
  | "JSON"
  | "FILE"
  | "DOCUMENT_PACKAGE";

/** 渲染器类型 */
export type RendererType =
  | "MARKDOWN_DOCUMENT"
  | "STRUCTURED_TABLE"
  | "SCORE_CARD"
  | "TIMELINE_VIEW"
  | "JSON_VIEWER"
  | "FILE_DOWNLOAD"
  | "MULTI_TAB_PACKAGE";

/** 计费声明模式 */
export type BillingDeclarationMode =
  | "ESTIMATED_COMPATIBILITY"
  | "REAL_SETTLEMENT_ELIGIBLE";

/** 文本输入约束 */
export interface TextInputConstraints {
  required: boolean;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
}

/** 单/多文件输入约束 */
export interface FileInputConstraints {
  required: boolean;
  minCount?: number;
  maxCount: number;
  acceptedMimes: string[];
  maxSingleFileBytes: number;
  maxTotalBytes: number;
}

/** 表单字段描述 */
export interface FormFieldDefinition {
  name: string;
  label: string;
  type: "string" | "number" | "boolean" | "select" | "multiselect";
  required: boolean;
  options?: string[];
  defaultValue?: unknown;
}

/** 结构化表单约束 */
export interface FormInputConstraints {
  fields: FormFieldDefinition[];
}

/** 上游成果依赖约束 */
export interface UpstreamArtifactConstraints {
  acceptedArtifactTypes: ComponentOutputKind[];
  requiredSchemaVersions?: string[];
}

/** 完整输入合同定义 */
export interface ComponentInputContract {
  kind: ComponentInputKind;
  textConstraints?: TextInputConstraints;
  fileConstraints?: FileInputConstraints;
  formConstraints?: FormInputConstraints;
  artifactConstraints?: UpstreamArtifactConstraints;
}

/** 材料处理步骤 */
export interface MaterialPipelineStep {
  name: string;
  type: MaterialPipelineStepType;
  options?: Record<string, string | number | boolean>;
}

/** 执行计划单步定义 */
export interface ExecutionPlanStep {
  stepId: string;
  name: string;
  promptTemplateVersion: string;
  promptTemplate: string;
  inputMapping: Record<string, string>;
  outputKey: string;
  contextBudgetTokens: number;
  maxOutputTokens: number;
  timeoutMs: number;
  requiredCapabilities: RequiredModelCapability[];
}

/** 完整执行计划 */
export interface ComponentExecutionPlan {
  steps: ExecutionPlanStep[];
}

/** 输出成果物结构约束 */
export interface OutputStructureConstraints {
  requiredProperties?: string[];
  schemaDefinition?: Record<string, unknown>;
}

/** 完整输出合同定义 */
export interface ComponentOutputContract {
  kind: ComponentOutputKind;
  artifactMime: string;
  schemaVersion: string;
  rendererType: RendererType;
  previewable: boolean;
  downloadable: boolean;
  structureConstraints?: OutputStructureConstraints;
}

/** 质量与审核策略 */
export interface ComponentQualityPolicy {
  requiredSections?: string[];
  minOutputLength?: number;
  requiredFields?: string[];
  requireCitations?: boolean;
  allowAutoRetry: boolean;
  maxRetryCount?: number;
  requireHumanReview: boolean;
  /** 合同明令禁止的禁用词或虚假承诺清单（如未经验证的法律认证、虚构排期、保过承诺等） */
  forbiddenPhrases?: string[];
  /** 输出免责声明或草案标识策略（纯合同驱动，不得硬编码组件 ID） */
  disclaimerPolicy?: {
    required: boolean;
    marker?: string;
    template?: string;
  };
}

/** 计费声明策略 */
export interface ComponentBillingPolicy {
  mode: BillingDeclarationMode;
  minServiceFeePoints?: number;
  estimatedTokens?: number;
  ruleDescription?: string;
}

/**
 * 隐私与数据边界策略（仅数据生成类组件声明；可选）
 *
 * 设计原则：服务端只能对「可机器校验」的约束做硬性拒绝（脱敏模式、高风险数字串、
 * privacyNotes 非空）。姓名等无法由正则可靠判定的字段，服务端不得声称已被证明为虚构，
 * 仅以 nameVerifiability 声明其可验证性，并要求用户在使用结果前人工复核。
 */
export interface ComponentPrivacyPolicy {
  /** 合同是否要求输出包含非空的 privacyNotes（脱敏与虚构策略说明） */
  requirePrivacyNotes?: boolean;
  /**
   * 合同声明的手机号脱敏模式（正则源串）。
   * 输出中若出现未脱敏的中国大陆手机号（1[3-9] 后接 9 位数字）则拒绝结果并触发退款。
   */
  phoneMaskPattern?: string;
  /** 禁止以明文出现的高风险数字串类型；命中则拒绝结果并触发退款 */
  forbiddenUnmasked?: Array<"ID_CARD" | "BANK_CARD">;
  /**
   * 姓名等字段的服务端可验证性：
   *  - NOT_SERVER_VERIFIABLE：服务端无法证明其为虚构，不声称已验证，要求用户复核；
   *  - VERIFIED：已具备可验证的虚构生成证据（当前批次无此情形）。
   */
  nameVerifiability?: "NOT_SERVER_VERIFIABLE" | "VERIFIED";
  /** 产品/合同层面的隐私边界说明（用于前端展示与用户提示） */
  notes?: string;
}

/** 完整组件合同实体 (Pure Domain Entity) */
export interface ComponentContract {
  // 1. 身份与版本
  componentId: string;
  contractVersion: string;
  lifecycle: ContractLifecycle;
  publishedAt: string | null;
  publishedBy: string | null;

  // 2. 输入合同
  input: ComponentInputContract;

  // 3. 材料处理流水线
  materialPipeline: {
    steps: MaterialPipelineStep[];
  };

  // 4. 执行计划
  executionPlan: ComponentExecutionPlan;

  // 5. 输出合同
  output: ComponentOutputContract;

  // 6. 质量策略
  qualityPolicy: ComponentQualityPolicy;

  // 7. 计费声明
  billingPolicy: ComponentBillingPolicy;

  // 8. 隐私与数据边界策略（可选；仅数据生成类组件声明）
  privacyPolicy?: ComponentPrivacyPolicy;
}

/** 不可变合同快照 */
export interface ComponentContractSnapshot {
  readonly snapshotId: string;
  readonly snapshotCreatedAt: string;
  readonly contract: Readonly<ComponentContract>;
}
