/**
 * 通用组件合同纯领域验证器
 *
 * 核心要求：
 * - 严格 TypeScript 类型，绝不使用宽泛类型绕过；
 * - 纯领域逻辑，无 ORM/Prisma/外部大模型依赖；
 * - 错误抛出稳定的 ComponentContractError 与错误码；
 * - 递归禁止 providerId/modelId 等模型绑定字段；
 * - 补齐数值交叉验证、表单字段唯一性、生命周期一致性；
 * - 支持 requireCitations 真实结构与输出校验；
 * - 声明 schemaDefinition 必须真实校验输出，不支持的 schema 关键字明确拒绝。
 */

import { ComponentContractError } from "./errors";
import {
  ALLOWED_INPUT_KINDS,
  ALLOWED_MODEL_CAPABILITIES,
  ALLOWED_OUTPUT_KINDS,
  ALLOWED_PIPELINE_STEPS,
  ALLOWED_RENDERER_TYPES,
  assertNoExecutableCode,
  assertNoModelBindingFields,
  assertNoSecretFields,
  assertSafeInteger,
  assertValidMimeList,
  isAllowedInputKind,
  isAllowedModelCapability,
  isAllowedOutputKind,
  isAllowedPipelineStepType,
  isAllowedRendererType,
} from "./capabilities";
import {
  ComponentContract,
  ComponentExecutionPlan,
  ComponentInputContract,
  ComponentOutputContract,
  ComponentPrivacyPolicy,
  ExecutionPlanStep,
  FileInputConstraints,
  TextInputConstraints,
} from "./types";

/** 校验成功后的输入对象 */
export interface ValidatedComponentInput {
  text?: string;
  files?: Array<{ name: string; mimeType: string; sizeBytes: number; buffer?: Buffer }>;
  formData?: Record<string, unknown>;
  upstreamArtifact?: { artifactId: string; artifactType: string; schemaVersion: string; data: unknown };
}

/** 校验成功后的输出成果物对象 */
export interface ValidatedComponentOutput {
  kind: string;
  mimeType: string;
  content: string | Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/** 校验成功后的材料集合 */
export interface ValidatedMaterials {
  extractedTexts: string[];
  tables?: Array<Record<string, unknown>[]>;
  rawFiles?: Array<{ name: string; sizeBytes: number }>;
}

/** 允许的 schemaDefinition 关键字集合 */
const SUPPORTED_SCHEMA_KEYWORDS = new Set([
  "type",
  "properties",
  "required",
  "items",
  "enum",
  "description",
  "title",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
]);

/** 允许的 schemaDefinition 数据类型集合（结构校验严格支持 integer 等受控类型） */
const SUPPORTED_SCHEMA_TYPES = new Set([
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
]);

/**
 * 递归检查 schemaDefinition 中是否包含不支持的关键字或非法数据类型
 */
function assertSupportedSchemaKeywords(schema: unknown, path = "schemaDefinition"): void {
  if (schema === null || schema === undefined || typeof schema !== "object") return;

  if (Array.isArray(schema)) {
    for (let i = 0; i < schema.length; i++) {
      assertSupportedSchemaKeywords(schema[i], `${path}[${i}]`);
    }
    return;
  }

  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (!SUPPORTED_SCHEMA_KEYWORDS.has(key)) {
      throw new ComponentContractError(
        "SCHEMA_KEYWORD_UNSUPPORTED",
        `合同 output.structureConstraints.schemaDefinition 在 [${path}] 包含了不支持的 schema 关键字: "${key}"！系统拒绝静默忽略未实现的 schema 语法。`
      );
    }
    if (key === "type" && typeof value === "string") {
      if (!SUPPORTED_SCHEMA_TYPES.has(value)) {
        throw new ComponentContractError(
          "SCHEMA_TYPE_UNSUPPORTED",
          `合同 output.structureConstraints.schemaDefinition 在 [${path}] 声明了不支持的数据类型: "${value}"！允许的类型集合为 [${Array.from(SUPPORTED_SCHEMA_TYPES).join(", ")}]。`
        );
      }
    }
    if (typeof value === "object" && value !== null) {
      if (key === "properties") {
        for (const [propKey, propVal] of Object.entries(value as Record<string, unknown>)) {
          assertSupportedSchemaKeywords(propVal, `${path}.properties.${propKey}`);
        }
      } else if (key === "items") {
        assertSupportedSchemaKeywords(value, `${path}.items`);
      }
    }
  }
}

/**
 * 真实校验输出数据是否符合 schemaDefinition 结构
 */
function verifyContentMatchesSchema(data: unknown, schema: Record<string, unknown>, path = "content"): void {
  const expectedType = schema.type;

  if (typeof expectedType === "string") {
    if (expectedType === "object") {
      if (data === null || typeof data !== "object" || Array.isArray(data)) {
        throw new ComponentContractError(
          "OUTPUT_VALIDATION_FAILED",
          `输出成果物 [${path}] 类型错误: 期望 object，实际为 ${Array.isArray(data) ? "array" : typeof data}！`
        );
      }
      const dataObj = data as Record<string, unknown>;

      // required 校验
      if (Array.isArray(schema.required)) {
        for (const reqField of schema.required) {
          if (typeof reqField === "string" && (dataObj[reqField] === undefined || dataObj[reqField] === null)) {
            throw new ComponentContractError(
              "OUTPUT_VALIDATION_FAILED",
              `输出成果物 [${path}] 缺失 schema 必填属性: "${reqField}"！`
            );
          }
        }
      }

      // properties 属性递归校验
      if (schema.properties && typeof schema.properties === "object") {
        for (const [propKey, propSchema] of Object.entries(schema.properties as Record<string, unknown>)) {
          if (dataObj[propKey] !== undefined && typeof propSchema === "object" && propSchema !== null) {
            verifyContentMatchesSchema(dataObj[propKey], propSchema as Record<string, unknown>, `${path}.${propKey}`);
          }
        }
      }
    } else if (expectedType === "array") {
      if (!Array.isArray(data)) {
        throw new ComponentContractError(
          "OUTPUT_VALIDATION_FAILED",
          `输出成果物 [${path}] 类型错误: 期望 array，实际为 ${typeof data}！`
        );
      }
      if (schema.items && typeof schema.items === "object") {
        for (let i = 0; i < data.length; i++) {
          verifyContentMatchesSchema(data[i], schema.items as Record<string, unknown>, `${path}[${i}]`);
        }
      }
    } else if (expectedType === "string") {
      if (typeof data !== "string") {
        throw new ComponentContractError(
          "OUTPUT_VALIDATION_FAILED",
          `输出成果物 [${path}] 类型错误: 期望 string，实际为 ${typeof data}！`
        );
      }
    } else if (expectedType === "number") {
      if (typeof data !== "number" || isNaN(data)) {
        throw new ComponentContractError(
          "OUTPUT_VALIDATION_FAILED",
          `输出成果物 [${path}] 类型错误: 期望 number，实际为 ${typeof data}！`
        );
      }
      if (typeof schema.minimum === "number" && data < schema.minimum) {
        throw new ComponentContractError(
          "OUTPUT_VALIDATION_FAILED",
          `输出成果物 [${path}] 数值低于最小值: 期望 >= ${schema.minimum}，实际为 ${data}！`
        );
      }
      if (typeof schema.maximum === "number" && data > schema.maximum) {
        throw new ComponentContractError(
          "OUTPUT_VALIDATION_FAILED",
          `输出成果物 [${path}] 数值高于最大值: 期望 <= ${schema.maximum}，实际为 ${data}！`
        );
      }
    } else if (expectedType === "integer") {
      if (
        typeof data !== "number" ||
        isNaN(data) ||
        !Number.isSafeInteger(data) ||
        data > Number.MAX_SAFE_INTEGER ||
        data < Number.MIN_SAFE_INTEGER
      ) {
        throw new ComponentContractError(
          "OUTPUT_VALIDATION_FAILED",
          `输出成果物 [${path}] 类型错误: 期望安全整数 integer（介于 [${Number.MIN_SAFE_INTEGER}, ${Number.MAX_SAFE_INTEGER}]），实际为 ${typeof data === "number" ? data : typeof data}！`
        );
      }
      if (typeof schema.minimum === "number" && data < schema.minimum) {
        throw new ComponentContractError(
          "OUTPUT_VALIDATION_FAILED",
          `输出成果物 [${path}] 数值低于最小值: 期望 >= ${schema.minimum}，实际为 ${data}！`
        );
      }
      if (typeof schema.maximum === "number" && data > schema.maximum) {
        throw new ComponentContractError(
          "OUTPUT_VALIDATION_FAILED",
          `输出成果物 [${path}] 数值高于最大值: 期望 <= ${schema.maximum}，实际为 ${data}！`
        );
      }
    } else if (expectedType === "boolean") {
      if (typeof data !== "boolean") {
        throw new ComponentContractError(
          "OUTPUT_VALIDATION_FAILED",
          `输出成果物 [${path}] 类型错误: 期望 boolean，实际为 ${typeof data}！`
        );
      }
    }
  }

  // enum 校验
  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    if (!schema.enum.includes(data)) {
      throw new ComponentContractError(
        "OUTPUT_VALIDATION_FAILED",
        `输出成果物 [${path}] 的值 (${String(data)}) 不在 schema.enum [${schema.enum.join(", ")}] 范围内！`
      );
    }
  }
}

/**
 * 完整校验组件合同规范实体
 */
export function validateComponentContract(contractRaw: unknown): ComponentContract {
  if (contractRaw === null || contractRaw === undefined || typeof contractRaw !== "object") {
    throw new ComponentContractError(
      "CONTRACT_VALIDATION_FAILED",
      "合同对象不能为空，且必须为合法的非空 Object！"
    );
  }

  const raw = contractRaw as Record<string, unknown>;

  // 1. 安全过滤扫描（结构化模型绑定递归校验、代码注入、密钥字段）
  assertNoModelBindingFields(raw);
  assertNoExecutableCode(raw);
  assertNoSecretFields(raw);

  // 2. 身份与版本校验
  if (typeof raw.componentId !== "string" || !raw.componentId.trim()) {
    throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "componentId 必须为非空字符串！");
  }
  if (typeof raw.contractVersion !== "string" || !raw.contractVersion.trim()) {
    throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "contractVersion 必须为非空字符串！");
  }

  // 生命周期校验
  const lifecycle = raw.lifecycle as string;
  if (lifecycle !== "DRAFT" && lifecycle !== "PUBLISHED" && lifecycle !== "ARCHIVED") {
    throw new ComponentContractError(
      "CONTRACT_LIFECYCLE_INVALID",
      `合同生命周期状态非法: ${String(lifecycle)}，只允许 DRAFT / PUBLISHED / ARCHIVED！`
    );
  }

  // 生命周期与发布字段交叉验证
  if (lifecycle === "PUBLISHED") {
    if (typeof raw.publishedAt !== "string" || isNaN(Date.parse(raw.publishedAt))) {
      throw new ComponentContractError(
        "CONTRACT_VALIDATION_FAILED",
        "PUBLISHED 状态合同必须包含合法的 ISO 发布时间 publishedAt！"
      );
    }
    if (typeof raw.publishedBy !== "string" || !raw.publishedBy.trim()) {
      throw new ComponentContractError(
        "CONTRACT_VALIDATION_FAILED",
        "PUBLISHED 状态合同必须包含发布人标识 publishedBy！"
      );
    }
  } else if (lifecycle === "DRAFT") {
    if (raw.publishedAt !== null && raw.publishedAt !== undefined) {
      throw new ComponentContractError(
        "CONTRACT_VALIDATION_FAILED",
        "DRAFT 状态合同不得伪装已发布，publishedAt 必须为 null 或未设置！"
      );
    }
  }

  // 3. 输入合同校验
  const input = raw.input as Record<string, unknown> | undefined;
  if (!input || typeof input !== "object") {
    throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "合同必须包含 input 输入规范对象！");
  }
  const inputKind = input.kind as string;
  if (!isAllowedInputKind(inputKind)) {
    throw new ComponentContractError(
      "UNKNOWN_INPUT_KIND",
      `未知的输入类型: ${String(inputKind)}，只允许声明标准白名单中的输入模式！`
    );
  }

  // 文本输入交叉校验
  if (inputKind === "TEXT" || inputKind === "TEXT_AND_FILES") {
    const textConstraints = input.textConstraints as Record<string, unknown> | undefined;
    if (!textConstraints || typeof textConstraints.required !== "boolean") {
      throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "文本输入类型必须提供 textConstraints 约束配置！");
    }
    let minLen: number | undefined;
    let maxLen: number | undefined;
    if (textConstraints.minLength !== undefined) {
      minLen = assertSafeInteger(textConstraints.minLength, "input.textConstraints.minLength");
    }
    if (textConstraints.maxLength !== undefined) {
      maxLen = assertSafeInteger(textConstraints.maxLength, "input.textConstraints.maxLength", 1);
    }
    if (minLen !== undefined && maxLen !== undefined && minLen > maxLen) {
      throw new ComponentContractError(
        "CONTRACT_VALIDATION_FAILED",
        `textConstraints 约束冲突: minLength (${minLen}) 不能大于 maxLength (${maxLen})！`
      );
    }
  }

  // 文件输入交叉校验
  if (inputKind === "FILE" || inputKind === "MULTI_FILE" || inputKind === "TEXT_AND_FILES") {
    const fileConstraints = input.fileConstraints as Record<string, unknown> | undefined;
    if (!fileConstraints || typeof fileConstraints !== "object") {
      throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "文件输入类型必须提供 fileConstraints 约束配置！");
    }
    const maxCount = assertSafeInteger(fileConstraints.maxCount, "input.fileConstraints.maxCount", 1);
    if (fileConstraints.minCount !== undefined) {
      const minCount = assertSafeInteger(fileConstraints.minCount, "input.fileConstraints.minCount", 0);
      if (minCount > maxCount) {
        throw new ComponentContractError(
          "CONTRACT_VALIDATION_FAILED",
          `fileConstraints 约束冲突: minCount (${minCount}) 不能大于 maxCount (${maxCount})！`
        );
      }
    }
    const maxSingle = assertSafeInteger(fileConstraints.maxSingleFileBytes, "input.fileConstraints.maxSingleFileBytes", 1);
    const maxTotal = assertSafeInteger(fileConstraints.maxTotalBytes, "input.fileConstraints.maxTotalBytes", 1);
    if (maxSingle > maxTotal) {
      throw new ComponentContractError(
        "CONTRACT_VALIDATION_FAILED",
        `fileConstraints 约束冲突: maxSingleFileBytes (${maxSingle}) 不能大于 maxTotalBytes (${maxTotal})！`
      );
    }

    // 校验 MIME 白名单合法且去重
    assertValidMimeList(fileConstraints.acceptedMimes, "input.fileConstraints.acceptedMimes");

    if (inputKind === "FILE" && maxCount !== 1) {
      throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "单文件模式 (FILE) 的 maxCount 必须等于 1！");
    }
  }

  // 结构化表单字段唯一性与选项校验
  if (inputKind === "STRUCTURED_FORM") {
    const formConstraints = input.formConstraints as Record<string, unknown> | undefined;
    if (!formConstraints || !Array.isArray(formConstraints.fields) || formConstraints.fields.length === 0) {
      throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "STRUCTURED_FORM 模式必须提供非空 fields 字段列表！");
    }

    const fieldNames = new Set<string>();
    for (let i = 0; i < formConstraints.fields.length; i++) {
      const f = formConstraints.fields[i];
      if (!f || typeof f !== "object" || typeof f.name !== "string" || !f.name.trim()) {
        throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", `表单第 [${i}] 项字段缺少合法的 name！`);
      }
      const trimmedName = f.name.trim();
      if (fieldNames.has(trimmedName)) {
        throw new ComponentContractError(
          "CONTRACT_VALIDATION_FAILED",
          `表单字段名存在重复: "${trimmedName}"，字段名称必须唯一！`
        );
      }
      fieldNames.add(trimmedName);

      // select / multiselect 必须有非空、唯一的 options 选项列表
      if (f.type === "select" || f.type === "multiselect") {
        if (!Array.isArray(f.options) || f.options.length === 0) {
          throw new ComponentContractError(
            "CONTRACT_VALIDATION_FAILED",
            `表单字段 [${trimmedName}] 类型为 ${f.type}，必须提供非空 options 选项列表！`
          );
        }
        const optSet = new Set<string>();
        for (const opt of f.options) {
          if (typeof opt !== "string" || !opt.trim()) {
            throw new ComponentContractError(
              "CONTRACT_VALIDATION_FAILED",
              `表单字段 [${trimmedName}] 的选项值必须为非空字符串！`
            );
          }
          if (optSet.has(opt.trim())) {
            throw new ComponentContractError(
              "CONTRACT_VALIDATION_FAILED",
              `表单字段 [${trimmedName}] 包含重复选项值: "${opt.trim()}"！`
            );
          }
          optSet.add(opt.trim());
        }
      }
    }
  }

  // 4. 材料处理流水线校验
  const materialPipeline = raw.materialPipeline as Record<string, unknown> | undefined;
  if (!materialPipeline || !Array.isArray(materialPipeline.steps)) {
    throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "materialPipeline.steps 必须为数组！");
  }
  for (let i = 0; i < materialPipeline.steps.length; i++) {
    const step = materialPipeline.steps[i];
    if (!step || typeof step !== "object" || !step.type) {
      throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", `materialPipeline.steps[${i}] 结构非法！`);
    }
    if (!isAllowedPipelineStepType(step.type)) {
      throw new ComponentContractError(
        "UNKNOWN_PIPELINE_STEP",
        `流水线步骤 [${i}] 存在未知步骤类型: ${String(step.type)}！`
      );
    }
  }

  // 5. 执行计划校验
  const executionPlan = raw.executionPlan as Record<string, unknown> | undefined;
  if (!executionPlan || !Array.isArray(executionPlan.steps)) {
    throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "executionPlan.steps 必须为数组！");
  }
  validateExecutionPlan(executionPlan as unknown as ComponentExecutionPlan);

  // 6. 输出合同校验
  const output = raw.output as Record<string, unknown> | undefined;
  if (!output || typeof output !== "object") {
    throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "output 必须为对象！");
  }
  const outputKind = output.kind as string;
  if (!isAllowedOutputKind(outputKind)) {
    throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", `未知的输出类型: ${String(outputKind)}！`);
  }
  const rendererType = output.rendererType as string;
  if (!isAllowedRendererType(rendererType)) {
    throw new ComponentContractError(
      "UNKNOWN_RENDERER_TYPE",
      `未知的渲染器类型: ${String(rendererType)}！系统严禁使用未声明的未知渲染器。`
    );
  }

  // MIME 与 schemaVersion 格式校验
  if (typeof output.artifactMime !== "string" || !output.artifactMime.trim()) {
    throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "output.artifactMime 必须为非空字符串！");
  }
  const mimeRegex = /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/;
  if (!mimeRegex.test(output.artifactMime.trim())) {
    throw new ComponentContractError(
      "CONTRACT_VALIDATION_FAILED",
      `output.artifactMime 格式非法: "${output.artifactMime}"，必须为合法的 "type/subtype" 规范！`
    );
  }

  if (typeof output.schemaVersion !== "string" || !output.schemaVersion.trim()) {
    throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "output.schemaVersion 必须为非空字符串！");
  }
  const versionRegex = /^(v\d+(\.\d+)*|\d+(\.\d+)*)$/i;
  if (!versionRegex.test(output.schemaVersion.trim())) {
    throw new ComponentContractError(
      "CONTRACT_VALIDATION_FAILED",
      `output.schemaVersion 格式非法: "${output.schemaVersion}"，必须符合语义化版本格式（如 "v1", "v1.0", "1.0.0"）！`
    );
  }

  // schemaDefinition 关键字合法性强校验
  const structureConstraints = output.structureConstraints as Record<string, unknown> | undefined;
  if (structureConstraints && structureConstraints.schemaDefinition) {
    assertSupportedSchemaKeywords(structureConstraints.schemaDefinition);
  }

  // 7. 质量策略校验
  const qualityPolicy = raw.qualityPolicy as Record<string, unknown> | undefined;
  if (!qualityPolicy || typeof qualityPolicy !== "object") {
    throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "qualityPolicy 必须为对象！");
  }
  if (qualityPolicy.minOutputLength !== undefined) {
    assertSafeInteger(qualityPolicy.minOutputLength, "qualityPolicy.minOutputLength", 0);
  }
  if (qualityPolicy.maxRetryCount !== undefined) {
    assertSafeInteger(qualityPolicy.maxRetryCount, "qualityPolicy.maxRetryCount", 0);
  }

  // forbiddenPhrases 校验：必须为非空字符串数组或缺省
  if (qualityPolicy.forbiddenPhrases !== undefined) {
    if (!Array.isArray(qualityPolicy.forbiddenPhrases)) {
      throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "qualityPolicy.forbiddenPhrases 必须为字符串数组！");
    }
    for (let i = 0; i < qualityPolicy.forbiddenPhrases.length; i++) {
      const item = qualityPolicy.forbiddenPhrases[i];
      if (typeof item !== "string" || item.trim().length === 0) {
        throw new ComponentContractError(
          "CONTRACT_VALIDATION_FAILED",
          `qualityPolicy.forbiddenPhrases[${i}] 必须为非空字符串！`
        );
      }
    }
  }

  // disclaimerPolicy 校验：必须为符合规格的对象或缺省
  if (qualityPolicy.disclaimerPolicy !== undefined) {
    if (
      !qualityPolicy.disclaimerPolicy ||
      typeof qualityPolicy.disclaimerPolicy !== "object" ||
      Array.isArray(qualityPolicy.disclaimerPolicy)
    ) {
      throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "qualityPolicy.disclaimerPolicy 必须为对象！");
    }
    const dp = qualityPolicy.disclaimerPolicy as Record<string, unknown>;
    if (typeof dp.required !== "boolean") {
      throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "qualityPolicy.disclaimerPolicy.required 必须为布尔值！");
    }
    if (dp.marker !== undefined && (typeof dp.marker !== "string" || dp.marker.trim().length === 0)) {
      throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "qualityPolicy.disclaimerPolicy.marker 必须为非空字符串或缺省！");
    }
    if (dp.template !== undefined && (typeof dp.template !== "string" || dp.template.trim().length === 0)) {
      throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "qualityPolicy.disclaimerPolicy.template 必须为非空字符串或缺省！");
    }
  }

  // requireCitations 交叉验证：必须对应明确的输出结构
  if (qualityPolicy.requireCitations === true) {
    const reqProps = structureConstraints?.requiredProperties;
    const schemaDef = structureConstraints?.schemaDefinition as Record<string, unknown> | undefined;
    const hasPropCitation =
      Array.isArray(reqProps) &&
      reqProps.some((p) => typeof p === "string" && (p.toLowerCase() === "citations" || p.toLowerCase() === "references"));
    const hasSchemaCitation =
      schemaDef &&
      schemaDef.properties &&
      typeof schemaDef.properties === "object" &&
      ("citations" in (schemaDef.properties as Record<string, unknown>) ||
        "references" in (schemaDef.properties as Record<string, unknown>));

    if (!hasPropCitation && !hasSchemaCitation) {
      throw new ComponentContractError(
        "CITATIONS_STRUCTURE_REQUIRED",
        "质量策略声明了 requireCitations=true，但输出结构约束 (output.structureConstraints) 未声明包含 citations 或 references 属性！"
      );
    }
  }

  // 8. 计费声明校验
  const billingPolicy = raw.billingPolicy as Record<string, unknown> | undefined;
  if (!billingPolicy || typeof billingPolicy !== "object") {
    throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", "billingPolicy 必须为对象！");
  }
  const billingMode = billingPolicy.mode as string;
  if (billingMode !== "ESTIMATED_COMPATIBILITY" && billingMode !== "REAL_SETTLEMENT_ELIGIBLE") {
    throw new ComponentContractError("CONTRACT_VALIDATION_FAILED", `billingPolicy.mode 非法: ${String(billingMode)}！`);
  }
  // 严禁成本价充当用户售价的字段声明
  const serializedBilling = JSON.stringify(billingPolicy);
  if (/costInput|costOutput|costPrice|useCostAsPrice/i.test(serializedBilling)) {
    throw new ComponentContractError(
      "COST_PRICE_FALLBACK_FORBIDDEN",
      "组件合同的计费策略严禁声明成本价兜底或将成本价作为用户售价！"
    );
  }
  if (billingPolicy.minServiceFeePoints !== undefined) {
    assertSafeInteger(billingPolicy.minServiceFeePoints, "billingPolicy.minServiceFeePoints", 0);
  }
  if (billingPolicy.estimatedTokens !== undefined) {
    assertSafeInteger(billingPolicy.estimatedTokens, "billingPolicy.estimatedTokens", 0);
  }

  return raw as unknown as ComponentContract;
}

/** 统一合同校验函数别名（供纯函数测试与上层模块调用） */
export const validateContract = validateComponentContract;

/**
 * 校验执行计划步骤依赖顺序与参数
 */
export function validateExecutionPlan(plan: ComponentExecutionPlan): void {
  if (!plan || !Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new ComponentContractError("EXECUTION_PLAN_INVALID", "执行计划 steps 必须为非空数组！");
  }

  const seenStepIds = new Set<string>();
  const seenOutputKeys = new Set<string>();
  const generatedOutputKeys = new Set<string>();

  for (let i = 0; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    if (!step || typeof step !== "object") {
      throw new ComponentContractError("EXECUTION_PLAN_INVALID", `执行计划第 [${i}] 步不是合法对象！`);
    }

    if (!step.stepId || typeof step.stepId !== "string" || !step.stepId.trim()) {
      throw new ComponentContractError("EXECUTION_PLAN_INVALID", `步骤 [${i}] 缺少非空 stepId！`);
    }
    const trimmedStepId = step.stepId.trim();
    if (seenStepIds.has(trimmedStepId)) {
      throw new ComponentContractError(
        "EXECUTION_PLAN_INVALID",
        `执行计划存在重复的 stepId: "${trimmedStepId}"，步骤 ID 必须全局唯一！`
      );
    }
    seenStepIds.add(trimmedStepId);

    if (!step.promptTemplateVersion || typeof step.promptTemplateVersion !== "string") {
      throw new ComponentContractError("EXECUTION_PLAN_INVALID", `步骤 [${trimmedStepId}] promptTemplateVersion 必须为非空版本号！`);
    }
    if (!step.promptTemplate || typeof step.promptTemplate !== "string") {
      throw new ComponentContractError("EXECUTION_PLAN_INVALID", `步骤 [${trimmedStepId}] promptTemplate 必须为非空字符串！`);
    }
    if (!step.outputKey || typeof step.outputKey !== "string" || !step.outputKey.trim()) {
      throw new ComponentContractError("EXECUTION_PLAN_INVALID", `步骤 [${trimmedStepId}] outputKey 必须为非空字符串！`);
    }
    const trimmedOutputKey = step.outputKey.trim();
    if (seenOutputKeys.has(trimmedOutputKey)) {
      throw new ComponentContractError(
        "EXECUTION_PLAN_INVALID",
        `执行计划存在重复的 outputKey: "${trimmedOutputKey}"，产出键必须全局唯一！`
      );
    }
    seenOutputKeys.add(trimmedOutputKey);

    assertSafeInteger(step.contextBudgetTokens, `executionPlan.steps[${i}].contextBudgetTokens`, 1);
    assertSafeInteger(step.maxOutputTokens, `executionPlan.steps[${i}].maxOutputTokens`, 1);
    assertSafeInteger(step.timeoutMs, `executionPlan.steps[${i}].timeoutMs`, 100);

    // 模型能力白名单强校验
    if (!Array.isArray(step.requiredCapabilities) || step.requiredCapabilities.length === 0) {
      throw new ComponentContractError("EXECUTION_PLAN_INVALID", `步骤 [${trimmedStepId}] 必须声明至少一项所需模型能力！`);
    }
    for (const cap of step.requiredCapabilities) {
      if (!isAllowedModelCapability(cap)) {
        throw new ComponentContractError(
          "UNKNOWN_MODEL_CAPABILITY",
          `步骤 [${trimmedStepId}] 声明了未知的模型能力: ${String(cap)}！合同只能声明标准抽象能力。`
        );
      }
    }

    // inputMapping 必须为字符串键值映射，且只能引用先前步骤已生成的 outputKey
    if (step.inputMapping !== undefined) {
      if (typeof step.inputMapping !== "object" || step.inputMapping === null || Array.isArray(step.inputMapping)) {
        throw new ComponentContractError(
          "EXECUTION_PLAN_INVALID",
          `步骤 [${trimmedStepId}] 的 inputMapping 必须为键值对对象！`
        );
      }
      for (const [paramName, sourceKey] of Object.entries(step.inputMapping)) {
        if (typeof sourceKey !== "string" || !sourceKey.trim()) {
          throw new ComponentContractError(
            "EXECUTION_PLAN_INVALID",
            `步骤 [${trimmedStepId}] 的 inputMapping["${paramName}"] 必须为非空字符串映射！`
          );
        }
        if (sourceKey.startsWith("steps.")) {
          const parts = sourceKey.split(".");
          const refOutputKey = parts[1];
          if (!refOutputKey || !generatedOutputKeys.has(refOutputKey)) {
            throw new ComponentContractError(
              "EXECUTION_PLAN_INVALID",
              `步骤 [${trimmedStepId}] 依赖的上游输出 [${refOutputKey}] 尚未生成，步骤执行顺序颠倒或依赖缺失！`
            );
          }
        }
      }
    }

    generatedOutputKeys.add(trimmedOutputKey);
  }
}

/**
 * 校验组件输入材料（严格根据合同定义）
 */
export function validateComponentInput(
  contract: ComponentContract,
  rawInput: unknown
): ValidatedComponentInput {
  // DRAFT / ARCHIVED 合同严禁作为执行合同
  if (contract.lifecycle !== "PUBLISHED") {
    throw new ComponentContractError(
      "CONTRACT_LIFECYCLE_INVALID",
      `当前合同处于 [${contract.lifecycle}] 状态，只有 [PUBLISHED] 状态的合同才允许执行！`
    );
  }

  if (rawInput === null || rawInput === undefined || typeof rawInput !== "object") {
    throw new ComponentContractError("INPUT_VALIDATION_FAILED", "组件输入必须为非空对象！");
  }

  const inputObj = rawInput as Record<string, unknown>;
  const inputKind = contract.input.kind;

  // 1. 文本校验
  if (inputKind === "TEXT" || inputKind === "TEXT_AND_FILES") {
    const text = inputObj.text;
    const constraints = contract.input.textConstraints;
    if (typeof text === "string") {
      const trimmed = text.trim();
      if (constraints?.required && !trimmed) {
        throw new ComponentContractError("INPUT_VALIDATION_FAILED", "文本输入为必填项，当前内容为空！");
      }
      if (trimmed.length > 0) {
        if (constraints?.minLength !== undefined && trimmed.length < constraints.minLength) {
          throw new ComponentContractError(
            "INPUT_VALIDATION_FAILED",
            `文本长度 (${trimmed.length}) 小于合同要求的最小长度 (${constraints.minLength})！`
          );
        }
        if (constraints?.maxLength !== undefined && text.length > constraints.maxLength) {
          throw new ComponentContractError(
            "INPUT_VALIDATION_FAILED",
            `文本长度 (${text.length}) 超过合同允许的最大长度 (${constraints.maxLength})！`
          );
        }
      }
    } else if (constraints?.required) {
      throw new ComponentContractError("INPUT_VALIDATION_FAILED", "文本输入为必填项，当前内容为空！");
    }
  }

  // TEXT_AND_FILES 联合校验：至少需要文本或文件其一非空
  if (inputKind === "TEXT_AND_FILES") {
    const text = inputObj.text;
    const files = inputObj.files;
    const hasText = typeof text === "string" && text.trim().length > 0;
    const hasFiles = Array.isArray(files) && files.length > 0;
    if (!hasText && !hasFiles) {
      throw new ComponentContractError(
        "INPUT_VALIDATION_FAILED",
        "组件要求文本或文件输入，当前文本为空且未提供任何文件！"
      );
    }
  }

  // 2. 文件校验
  if (inputKind === "FILE" || inputKind === "MULTI_FILE" || inputKind === "TEXT_AND_FILES") {
    const files = inputObj.files;
    const fileConstraints = contract.input.fileConstraints;
    if (!fileConstraints) {
      throw new ComponentContractError("INPUT_VALIDATION_FAILED", "合同缺少 fileConstraints 约束！");
    }

    if (fileConstraints.required && (!Array.isArray(files) || files.length === 0)) {
      throw new ComponentContractError("INPUT_VALIDATION_FAILED", "文件输入为必填项，当前未提供任何文件！");
    }

    if (Array.isArray(files) && files.length > 0) {
      if (files.length > fileConstraints.maxCount) {
        throw new ComponentContractError(
          "INPUT_VALIDATION_FAILED",
          `上传文件数量 (${files.length}) 超过合同限制的最大数量 (${fileConstraints.maxCount})！`
        );
      }
      if (fileConstraints.minCount !== undefined && files.length < fileConstraints.minCount) {
        throw new ComponentContractError(
          "INPUT_VALIDATION_FAILED",
          `上传文件数量 (${files.length}) 少于合同要求的最小数量 (${fileConstraints.minCount})！`
        );
      }

      let totalBytes = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file || typeof file !== "object") {
          throw new ComponentContractError("INPUT_VALIDATION_FAILED", `文件列表第 [${i}] 项不是有效文件对象！`);
        }
        if (!fileConstraints.acceptedMimes.includes(file.mimeType)) {
          throw new ComponentContractError(
            "INPUT_VALIDATION_FAILED",
            `文件 [${file.name || i}] 的 MIME 类型 (${file.mimeType}) 不在合同允许的白名单中: [${fileConstraints.acceptedMimes.join(", ")}]！`
          );
        }
        assertSafeInteger(file.sizeBytes, `files[${i}].sizeBytes`, 1);
        if (file.sizeBytes > fileConstraints.maxSingleFileBytes) {
          throw new ComponentContractError(
            "INPUT_VALIDATION_FAILED",
            `文件 [${file.name || i}] 大小 (${file.sizeBytes} 字节) 超过单文件上限 (${fileConstraints.maxSingleFileBytes} 字节)！`
          );
        }
        totalBytes += file.sizeBytes;
      }

      if (totalBytes > fileConstraints.maxTotalBytes) {
        throw new ComponentContractError(
          "INPUT_VALIDATION_FAILED",
          `文件总大小 (${totalBytes} 字节) 超过合同允许的总大小限制 (${fileConstraints.maxTotalBytes} 字节)！`
        );
      }
    }
  }

  // 3. 结构化表单校验
  if (inputKind === "STRUCTURED_FORM") {
    const formData = inputObj.formData as Record<string, unknown> | undefined;
    const formConstraints = contract.input.formConstraints;
    if (!formData || typeof formData !== "object") {
      throw new ComponentContractError("INPUT_VALIDATION_FAILED", "结构化表单输入必须提供 formData 对象！");
    }
    if (formConstraints?.fields) {
      for (const field of formConstraints.fields) {
        const val = formData[field.name];
        if (field.required && (val === undefined || val === null || val === "")) {
          throw new ComponentContractError(
            "INPUT_VALIDATION_FAILED",
            `表单必填字段 [${field.label || field.name}] 缺失或为空！`
          );
        }
        // select/multiselect 选项有效性运行时校验
        if (val !== undefined && val !== null && val !== "" && field.options) {
          if (field.type === "select") {
            if (!field.options.includes(String(val))) {
              throw new ComponentContractError(
                "INPUT_VALIDATION_FAILED",
                `表单字段 [${field.name}] 取值 "${String(val)}" 不在合法选项列表中: [${field.options.join(", ")}]！`
              );
            }
          } else if (field.type === "multiselect") {
            if (!Array.isArray(val)) {
              throw new ComponentContractError(
                "INPUT_VALIDATION_FAILED",
                `表单多选字段 [${field.name}] 必须为数组！`
              );
            }
            for (const item of val) {
              if (!field.options.includes(String(item))) {
                throw new ComponentContractError(
                  "INPUT_VALIDATION_FAILED",
                  `表单多选字段 [${field.name}] 包含非法选项值: "${String(item)}"！`
                );
              }
            }
          }
        }
      }
    }
  }

  // 4. 上游成果物依赖校验
  if (inputKind === "UPSTREAM_ARTIFACT") {
    const upstream = inputObj.upstreamArtifact as Record<string, unknown> | undefined;
    const artifactConstraints = contract.input.artifactConstraints;
    if (!upstream || typeof upstream !== "object") {
      throw new ComponentContractError("INPUT_VALIDATION_FAILED", "必须提供有效的前序上游成果物 upstreamArtifact！");
    }
    if (artifactConstraints?.acceptedArtifactTypes) {
      const acceptedList: readonly string[] = artifactConstraints.acceptedArtifactTypes;
      if (!acceptedList.includes(String(upstream.artifactType))) {
        throw new ComponentContractError(
          "INPUT_VALIDATION_FAILED",
          `上游成果物类型 [${String(upstream.artifactType)}] 不符合组件要求的类型: [${artifactConstraints.acceptedArtifactTypes.join(", ")}]！`
        );
      }
    }
    if (artifactConstraints?.requiredSchemaVersions) {
      if (!artifactConstraints.requiredSchemaVersions.includes(upstream.schemaVersion as string)) {
        throw new ComponentContractError(
          "INPUT_VALIDATION_FAILED",
          `上游成果物 schemaVersion [${String(upstream.schemaVersion)}] 不兼容！`
        );
      }
    }
  }

  return inputObj as unknown as ValidatedComponentInput;
}

/**
 * 校验材料要求是否就绪
 */
export function validateMaterialRequirements(
  contract: ComponentContract,
  materialsRaw: unknown
): ValidatedMaterials {
  if (!materialsRaw || typeof materialsRaw !== "object") {
    throw new ComponentContractError("MATERIAL_REQUIREMENTS_UNMET", "输入材料对象不能为空！");
  }

  const mat = materialsRaw as Record<string, unknown>;
  const steps = contract.materialPipeline.steps;

  for (const step of steps) {
    if (step.type === "OCR" || step.type === "DOCUMENT_PARSE") {
      const hasFiles = Array.isArray(mat.rawFiles) && mat.rawFiles.length > 0;
      const hasTexts = Array.isArray(mat.extractedTexts) && mat.extractedTexts.length > 0;
      if (!hasFiles && !hasTexts) {
        throw new ComponentContractError(
          "MATERIAL_REQUIREMENTS_UNMET",
          `流水线包含 [${step.type}] 步骤，但未提供有效的原材料或提取文本！`
        );
      }
    }
  }

  return mat as unknown as ValidatedMaterials;
}

/**
 * 校验组件实际输出成果物（拒绝非法结构与残缺成果）
 */
export function validateComponentOutput(
  contract: ComponentContract,
  outputRaw: unknown
): ValidatedComponentOutput {
  if (!outputRaw || typeof outputRaw !== "object") {
    throw new ComponentContractError("OUTPUT_VALIDATION_FAILED", "输出成果物不能为空，且必须为合法 Object！");
  }

  const out = outputRaw as Record<string, unknown>;

  // 1. 类型匹配
  if (out.kind !== contract.output.kind) {
    throw new ComponentContractError(
      "OUTPUT_VALIDATION_FAILED",
      `输出成果物类型 [${String(out.kind)}] 与合同要求的输出类型 [${contract.output.kind}] 不匹配！`
    );
  }

  // 2. 质量策略强制检查
  const quality = contract.qualityPolicy;

  // 必填章节检查
  if (quality.requiredSections && quality.requiredSections.length > 0) {
    const textContent = typeof out.content === "string" ? out.content : JSON.stringify(out.content);
    for (const section of quality.requiredSections) {
      if (!textContent.includes(section)) {
        throw new ComponentContractError(
          "OUTPUT_VALIDATION_FAILED",
          `输出成果物缺失合同规定的必填章节或关键词: [${section}]！`
        );
      }
    }
  }

  // 最小长度检查
  if (quality.minOutputLength !== undefined && quality.minOutputLength > 0) {
    const textContent = typeof out.content === "string" ? out.content : JSON.stringify(out.content);
    if (textContent.length < quality.minOutputLength) {
      throw new ComponentContractError(
        "OUTPUT_VALIDATION_FAILED",
        `输出内容长度 (${textContent.length}) 低于质量基线要求的最小长度 (${quality.minOutputLength})！`
      );
    }
  }

  // 必填结构化字段检查
  if (quality.requiredFields && quality.requiredFields.length > 0) {
    if (typeof out.content !== "object" || out.content === null) {
      throw new ComponentContractError(
        "OUTPUT_VALIDATION_FAILED",
        "质量策略要求必填字段，但输出成果 content 不是结构化对象！"
      );
    }
    const contentObj = out.content as Record<string, unknown>;
    for (const field of quality.requiredFields) {
      if (contentObj[field] === undefined || contentObj[field] === null) {
        throw new ComponentContractError(
          "OUTPUT_VALIDATION_FAILED",
          `输出成果物缺失质量策略必填字段: [${field}]！`
        );
      }
    }
  }

  // requireCitations 真实输出校验
  if (quality.requireCitations === true) {
    let hasValidCitation = false;
    if (typeof out.content === "object" && out.content !== null) {
      const contentObj = out.content as Record<string, unknown>;
      const citations = contentObj.citations || contentObj.references;
      if (Array.isArray(citations) && citations.length > 0) {
        hasValidCitation = true;
      }
    }
    if (!hasValidCitation) {
      const textContent = typeof out.content === "string" ? out.content : JSON.stringify(out.content);
      if (/\[\d+\]|\[引用|\[文献|\[ref/i.test(textContent)) {
        hasValidCitation = true;
      }
    }
    if (!hasValidCitation) {
      throw new ComponentContractError(
        "OUTPUT_VALIDATION_FAILED",
        "质量策略要求提供引用与出处标记 (requireCitations=true)，但输出成果物中未找到有效的引用数据或引用标记！"
      );
    }
  }

  // schemaDefinition 真实输出校验
  const schemaDef = contract.output.structureConstraints?.schemaDefinition;
  if (schemaDef && typeof schemaDef === "object") {
    verifyContentMatchesSchema(out.content, schemaDef);
  }

  return out as unknown as ValidatedComponentOutput;
}

/**
 * 模型结果输出校验（服务端执行成功路径的统一出口，在写成功 task / 保存成功 artifact 之前调用）。
 *
 * 设计原则（与现有 schema 校验复用同一套能力，不新增第二套互相矛盾的规则）：
 *  - DOCUMENT / MARKDOWN_DOCUMENT 类合同：仅做非空校验，保持既有文档结果行为不变；
 *  - TABLE / JSON 等结构化合同：模型文本必须可解析为 JSON，并按合同
 *    output.structureConstraints.schemaDefinition 校验必需字段与类型（复用 verifyContentMatchesSchema）；
 *  - 若合同声明隐私策略（privacyPolicy），额外做隐私边界校验（脱敏模式、高风险数字串、privacyNotes 非空）。
 *
 * 不满足任一约束时抛出 ComponentContractError：
 *  - JSON 不可解析 / 缺 required 字段 / 字段类型错误 → OUTPUT_VALIDATION_FAILED（路由映射为 MODEL_OUTPUT_INVALID）；
 *  - 未脱敏手机号 / 未脱敏身份证 / 银行卡 / 缺失 privacyNotes → MODEL_OUTPUT_INVALID。
 * 调用方（路由）捕获后不得写成功 task / 成功 artifact，并原路退款。
 */
export function validateModelOutput(contract: ComponentContract, modelText: string): ValidatedComponentOutput {
  const kind = contract.output?.kind;

  let result: ValidatedComponentOutput;
  switch (kind) {
    case "DOCUMENT": {
      if (typeof modelText !== "string" || modelText.trim().length === 0) {
        throw new ComponentContractError("MODEL_OUTPUT_INVALID", "文档类输出为空，无法满足合同输出约束");
      }
      let finalContent = modelText;

      const trimmed = modelText.trim();
      const qp = contract.qualityPolicy;

      // 1. 禁用词检查（qualityPolicy.forbiddenPhrases，纯合同驱动）
      if (qp?.forbiddenPhrases && Array.isArray(qp.forbiddenPhrases)) {
        for (const fakeKw of qp.forbiddenPhrases) {
          if (trimmed.includes(fakeKw)) {
            throw new ComponentContractError(
              "OUTPUT_VALIDATION_FAILED",
              `成果物包含合同明令禁止的禁用词、虚假认证表述或未经验证的虚假状态 [${fakeKw}]！AI 生成文档不得伪造未经认证或未确认的状态。`,
            );
          }
        }
      }

      // 2. 必填章节或关键词检查（qualityPolicy.requiredSections，纯合同驱动，支持 | 分隔多选一）
      if (qp?.requiredSections && Array.isArray(qp.requiredSections)) {
        for (const sec of qp.requiredSections) {
          const options = sec.split("|").map((s) => s.trim()).filter(Boolean);
          const matched = options.some((opt) => trimmed.includes(opt));
          if (!matched) {
            throw new ComponentContractError(
              "OUTPUT_VALIDATION_FAILED",
              `成果物缺失合同规定的必填章节或关键词: [${sec}]！`,
            );
          }
        }
      }

      // 3. 最小输出长度检查（qualityPolicy.minOutputLength，纯合同驱动）
      if (typeof qp?.minOutputLength === "number" && qp.minOutputLength > 0) {
        if (trimmed.length < qp.minOutputLength) {
          throw new ComponentContractError(
            "OUTPUT_VALIDATION_FAILED",
            `成果物长度 (${trimmed.length}) 低于质量基线要求的最小长度 (${qp.minOutputLength})！`,
          );
        }
      }

      // 4. 免责声明/草案标识策略（qualityPolicy.disclaimerPolicy，纯合同驱动）
      if (qp?.disclaimerPolicy?.required) {
        const marker = qp.disclaimerPolicy.marker;
        const template = qp.disclaimerPolicy.template;
        const hasMarker = marker ? trimmed.includes(marker) : false;
        if (!hasMarker && template) {
          finalContent = `${template}\n\n${modelText}`;
        }
      }

      result = { kind, mimeType: contract.output.artifactMime, content: finalContent };
      break;
    }

    case "TABLE":
    case "JSON": {
      const parsed = parseModelJson(modelText);
      const schemaDef = contract.output?.structureConstraints?.schemaDefinition;
      if (schemaDef && typeof schemaDef === "object") {
        verifyContentMatchesSchema(parsed, schemaDef); // 抛 OUTPUT_VALIDATION_FAILED
      }
      if (contract.privacyPolicy) {
        validateOutputPrivacy(contract.componentId, parsed, contract.privacyPolicy);
      }
      // 最小输出长度检查（TABLE/JSON：校验规范化后的模型结果序列化长度；纯合同驱动，与 DOCUMENT 同源口径）
      const minLen = contract.qualityPolicy?.minOutputLength;
      if (typeof minLen === "number" && minLen > 0) {
        const serializedLen = JSON.stringify(parsed).length;
        if (serializedLen < minLen) {
          throw new ComponentContractError(
            "OUTPUT_VALIDATION_FAILED",
            `TABLE/JSON 输出序列化长度 (${serializedLen}) 低于质量基线要求的最小长度 (${minLen})！`,
          );
        }
      }
      result = { kind, mimeType: contract.output.artifactMime, content: parsed as Record<string, unknown> };
      break;
    }

    // 以下类型当前无正式合同 / 无真实文件构建协议：明确拒绝并交由路由原路退款，
    // 绝不允许把文本强行当作 JSON 猜测，也绝不为“支持未来”伪造成果物（见需求条款 4、7）。
    case "SCORE":
    case "TIMELINE":
    case "FILE":
    case "DOCUMENT_PACKAGE":
      throw new ComponentContractError(
        "OUTPUT_KIND_NOT_SUPPORTED",
        `组件输出类型 [${kind}] 当前尚无正式合同或真实构建协议支持，服务端拒绝猜测性校验；该失败路径将触发原路退款，不得把文本强行当作 JSON。`,
      );

    default:
      // 未知/未声明输出类型：防御性兜底（合同层 isAllowedOutputKind 已经拦截非法值）
      throw new ComponentContractError(
        "OUTPUT_VALIDATION_FAILED",
        `未知或不受支持的组件输出类型: [${String(kind)}]`,
      );
  }

  return result;
}

/** 解析模型输出文本为 JSON（容忍 ```json 代码围栏），失败抛 MODEL_OUTPUT_INVALID */
function parseModelJson(text: string): unknown {
  if (typeof text !== "string") {
    throw new ComponentContractError("MODEL_OUTPUT_INVALID", "模型输出不是文本，无法满足结构化约束");
  }
  let t = text.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) t = fence[1].trim();
  try {
    return JSON.parse(t);
  } catch {
    throw new ComponentContractError("MODEL_OUTPUT_INVALID", "模型输出不是合法 JSON，无法满足合同结构化约束");
  }
}

/**
 * 隐私边界校验（仅当合同声明 privacyPolicy 时调用）。
 * 服务端只校验可机器判定的硬约束；姓名等不可靠判定字段不在此强制，由 nameVerifiability 声明并提示用户复核。
 */
function validateOutputPrivacy(componentId: string, data: unknown, privacy: ComponentPrivacyPolicy): void {
  const text = typeof data === "string" ? data : JSON.stringify(data);

  if (privacy.requirePrivacyNotes) {
    const obj: Record<string, unknown> = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
    const notes = obj.privacyNotes;
    if (typeof notes !== "string" || notes.trim().length === 0) {
      throw new ComponentContractError(
        "MODEL_OUTPUT_INVALID",
        `${componentId} 输出缺少非空的 privacyNotes（合同要求声明脱敏与虚构策略，禁止静默放行）`,
      );
    }
  }

  // 未脱敏中国大陆手机号：1[3-9] 后接 9 位数字（共 11 位）；脱敏形式为中间四位打码（含 '*'），不命中本正则
  if (privacy.phoneMaskPattern) {
    if (/\b1[3-9]\d{9}\b/.test(text)) {
      throw new ComponentContractError(
        "MODEL_OUTPUT_INVALID",
        `${componentId} 输出包含未脱敏手机号，不满足合同声明的脱敏模式（${privacy.phoneMaskPattern}）`,
      );
    }
  }

  if (privacy.forbiddenUnmasked?.includes("ID_CARD")) {
    if (/\b\d{17}[\dXx]\b|\b\d{15}\b/.test(text)) {
      throw new ComponentContractError("MODEL_OUTPUT_INVALID", `${componentId} 输出包含未脱敏身份证号，违反隐私边界`);
    }
  }

  if (privacy.forbiddenUnmasked?.includes("BANK_CARD")) {
    if (/\b\d{16,19}\b/.test(text)) {
      throw new ComponentContractError("MODEL_OUTPUT_INVALID", `${componentId} 输出包含未脱敏银行卡号，违反隐私边界`);
    }
  }
}
