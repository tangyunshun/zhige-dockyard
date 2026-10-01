/**
 * 组件合同能力枚举定义与安全防御校验
 */

import { ComponentContractError } from "./errors";
import {
  RequiredModelCapability,
  MaterialPipelineStepType,
  RendererType,
  ComponentInputKind,
  ComponentOutputKind,
} from "./types";

/** 允许声明的抽象模型能力（严格受限） */
export const ALLOWED_MODEL_CAPABILITIES: ReadonlySet<RequiredModelCapability> = new Set([
  "TEXT_GENERATION",
  "STRUCTURED_OUTPUT",
  "VISION",
  "LONG_CONTEXT",
  "FILE_ANALYSIS",
]);

/** 允许的材料流水线步骤类型 */
export const ALLOWED_PIPELINE_STEPS: ReadonlySet<MaterialPipelineStepType> = new Set([
  "TEXT_NORMALIZE",
  "DOCUMENT_PARSE",
  "OCR",
  "TABLE_EXTRACT",
  "MATERIAL_MERGE",
  "UPSTREAM_ARTIFACT_LOAD",
]);

/** 允许的渲染器类型 */
export const ALLOWED_RENDERER_TYPES: ReadonlySet<RendererType> = new Set([
  "MARKDOWN_DOCUMENT",
  "STRUCTURED_TABLE",
  "SCORE_CARD",
  "TIMELINE_VIEW",
  "JSON_VIEWER",
  "FILE_DOWNLOAD",
  "MULTI_TAB_PACKAGE",
]);

/** 允许的输入类型 */
export const ALLOWED_INPUT_KINDS: ReadonlySet<ComponentInputKind> = new Set([
  "TEXT",
  "FILE",
  "MULTI_FILE",
  "TEXT_AND_FILES",
  "STRUCTURED_FORM",
  "UPSTREAM_ARTIFACT",
]);

/** 允许的输出成果物类型 */
export const ALLOWED_OUTPUT_KINDS: ReadonlySet<ComponentOutputKind> = new Set([
  "DOCUMENT",
  "TABLE",
  "SCORE",
  "TIMELINE",
  "JSON",
  "FILE",
  "DOCUMENT_PACKAGE",
]);

/** 类型守卫：校验是否为支持的输入模式 */
export function isAllowedInputKind(kind: unknown): kind is ComponentInputKind {
  return typeof kind === "string" && (ALLOWED_INPUT_KINDS as ReadonlySet<string>).has(kind);
}

/** 类型守卫：校验是否为支持的材料处理步骤类型 */
export function isAllowedPipelineStepType(step: unknown): step is MaterialPipelineStepType {
  return typeof step === "string" && (ALLOWED_PIPELINE_STEPS as ReadonlySet<string>).has(step);
}

/** 类型守卫：校验是否为支持的模型抽象能力 */
export function isAllowedModelCapability(cap: unknown): cap is RequiredModelCapability {
  return typeof cap === "string" && (ALLOWED_MODEL_CAPABILITIES as ReadonlySet<string>).has(cap);
}

/** 类型守卫：校验是否为支持的输出类型 */
export function isAllowedOutputKind(kind: unknown): kind is ComponentOutputKind {
  return typeof kind === "string" && (ALLOWED_OUTPUT_KINDS as ReadonlySet<string>).has(kind);
}

/** 类型守卫：校验是否为支持的渲染器类型 */
export function isAllowedRendererType(type: unknown): type is RendererType {
  return typeof type === "string" && (ALLOWED_RENDERER_TYPES as ReadonlySet<string>).has(type);
}

/** 禁止在合同结构中携带的模型绑定字段名称（不区分大小写） */
const FORBIDDEN_MODEL_BINDING_KEYS = new Set([
  "providerid",
  "provider_id",
  "modelid",
  "model_id",
  "upstreammodel",
  "upstream_model",
  "baseurl",
  "base_url",
  "apikeyenv",
  "api_key_env",
  "endpoint",
  "apiendpoint",
  "apiversion",
  "api_version",
]);

/** 敏感密钥字段模式 */
const FORBIDDEN_SECRET_KEYS = [
  "apikey",
  "api_key",
  "secret",
  "secretkey",
  "secret_key",
  "password",
  "credential",
  "auth_token",
  "authtoken",
  "accesstoken",
  "access_token",
  "private_key",
  "privatekey",
];

/** 代码执行与动态求值危险特征 */
const FORBIDDEN_CODE_PATTERNS = [
  /\beval\s*\(/i,
  /\bFunction\s*\(/i,
  /<script\b[^>]*>/i,
  /\bprocess\.env\b/i,
  /\bchild_process\b/i,
  /\bexecSync\s*\(/i,
  /\bspawnSync\s*\(/i,
  /\b__dirname\b/i,
  /\b__filename\b/i,
];

/**
 * 递归校验合同结构内不得携带模型绑定字段（如 providerId, modelId, baseUrl 等）。
 * 核心设计：不再维护有限厂商黑名单，允许用户业务 Prompt 中正常提及厂商名词，
 * 但合同架构上严禁携带任何具体的供应商与模型绑定配置，模型需求必须只能通过抽象 capability 枚举表达。
 */
export function assertNoModelBindingFields(target: unknown, path = "contract"): void {
  if (target === null || target === undefined || typeof target !== "object") return;

  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i++) {
      assertNoModelBindingFields(target[i], `${path}[${i}]`);
    }
    return;
  }

  for (const [key, value] of Object.entries(target as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[-_]/g, "");
    for (const forbiddenKey of FORBIDDEN_MODEL_BINDING_KEYS) {
      if (normalizedKey === forbiddenKey.replace(/[-_]/g, "")) {
        throw new ComponentContractError(
          "FORBIDDEN_MODEL_BINDING",
          `合同在路径 [${path}] 包含了禁止的模型绑定字段 [${key}]！合同结构不得携带具体模型绑定，模型需求必须通过抽象能力 (capability) 表达。`
        );
      }
    }
    if (typeof value === "object" && value !== null) {
      assertNoModelBindingFields(value, `${path}.${key}`);
    }
  }
}

/**
 * 校验 MIME 类型列表为非空、合法且去重的字符串列表
 */
export function assertValidMimeList(mimes: unknown, path: string): string[] {
  if (!Array.isArray(mimes) || mimes.length === 0) {
    throw new ComponentContractError(
      "CONTRACT_VALIDATION_FAILED",
      `字段 [${path}] 必须为非空 MIME 字符串数组！`
    );
  }

  const seen = new Set<string>();
  const mimeRegex = /^([a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+|\.[a-zA-Z0-9]+)$/;

  for (let i = 0; i < mimes.length; i++) {
    const item = mimes[i];
    if (typeof item !== "string" || !item.trim()) {
      throw new ComponentContractError(
        "CONTRACT_VALIDATION_FAILED",
        `字段 [${path}[${i}]] 必须为非空字符串！`
      );
    }
    const trimmed = item.trim();
    if (!mimeRegex.test(trimmed)) {
      throw new ComponentContractError(
        "CONTRACT_VALIDATION_FAILED",
        `字段 [${path}[${i}]] MIME 格式非法: "${trimmed}"，必须为 "type/subtype" 或文件后缀如 ".pdf"！`
      );
    }
    if (seen.has(trimmed.toLowerCase())) {
      throw new ComponentContractError(
        "CONTRACT_VALIDATION_FAILED",
        `字段 [${path}] 包含重复的 MIME 类型: "${trimmed}"，MIME 白名单必须去重！`
      );
    }
    seen.add(trimmed.toLowerCase());
  }

  return mimes as string[];
}

/**
 * 校验对象内不得包含可执行代码或注入片段
 */
export function assertNoExecutableCode(target: unknown, path = "contract"): void {
  if (target === null || target === undefined) return;

  if (typeof target === "string") {
    for (const pattern of FORBIDDEN_CODE_PATTERNS) {
      if (pattern.test(target)) {
        throw new ComponentContractError(
          "FORBIDDEN_EXECUTABLE_CODE",
          `合同在字段 [${path}] 中包含可执行代码或高危危险语法片段，严禁在合同内存储可执行逻辑！`
        );
      }
    }
    return;
  }

  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i++) {
      assertNoExecutableCode(target[i], `${path}[${i}]`);
    }
    return;
  }

  if (typeof target === "object") {
    for (const [key, value] of Object.entries(target as Record<string, unknown>)) {
      assertNoExecutableCode(value, `${path}.${key}`);
    }
  }
}

/**
 * 校验对象字段名中不得包含 API Key 等密钥凭据
 */
export function assertNoSecretFields(target: unknown, path = "contract"): void {
  if (target === null || target === undefined || typeof target !== "object") return;

  if (Array.isArray(target)) {
    for (let i = 0; i < target.length; i++) {
      assertNoSecretFields(target[i], `${path}[${i}]`);
    }
    return;
  }

  for (const [key, value] of Object.entries(target as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    for (const secretKey of FORBIDDEN_SECRET_KEYS) {
      if (lowerKey === secretKey || lowerKey.includes(secretKey)) {
        throw new ComponentContractError(
          "FORBIDDEN_SECRET_FIELD",
          `合同在路径 [${path}] 包含了禁止的密钥属性 [${key}]，合同严禁存储任何凭据或密钥！`
        );
      }
    }
    if (typeof value === "object" && value !== null) {
      assertNoSecretFields(value, `${path}.${key}`);
    }
  }
}

/**
 * 通用合同能力提取（统一真源，严禁任何组件 ID 特判）。
 *
 * 提取规则：
 *  1. 优先从标准位置 `executionPlan.steps[].requiredCapabilities` 提取；
 *  2. 同时兼容合法的顶层 `requiredCapabilities` 字段（部分旧合同可能写在顶层）；
 *  3. 合并去重，且仅保留白名单内允许的能力枚举（非法能力不进入门禁集合）。
 *
 * 本函数被激活/能力校验路径与运行时校验路径共用，确保两者语义一致，
 * 避免 seed 脚本只读取顶层导致能力门禁被静默跳过的缺陷。
 */
export function extractRequiredCapabilities(contract: unknown): string[] {
  if (!contract || typeof contract !== "object") return [];
  const c = contract as Record<string, unknown>;

  const stepCaps: string[] = [];
  const exec = c.executionPlan as { steps?: Array<Record<string, unknown>> } | undefined;
  if (exec && Array.isArray(exec.steps)) {
    for (const step of exec.steps) {
      const caps = step?.requiredCapabilities;
      if (Array.isArray(caps)) {
        for (const cap of caps) {
          if (typeof cap === "string") stepCaps.push(cap);
        }
      }
    }
  }

  const topCapsRaw = c.requiredCapabilities;
  const topCaps = Array.isArray(topCapsRaw)
    ? topCapsRaw.filter((v): v is string => typeof v === "string")
    : [];

  const merged = [...stepCaps, ...topCaps];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const cap of merged) {
    if (!isAllowedModelCapability(cap)) continue;
    const key = String(cap).toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cap);
  }
  return out;
}

/**
 * 判定某部署的能力集合是否满足合同要求的能力集合。
 *
 * 关键防御：当 `required` 为空（合同未声明任何能力）时，显式返回 `false`，
 * 防止空能力集合在 `Array.every` 语义下（对空数组恒为真）静默满足所有部署、
 * 使未校验合同悄悄通过能力门禁。即「空能力不得使未校验合同静默通过」。
 */
export function isCapabilitySatisfied(available: unknown, required: unknown): boolean {
  if (!Array.isArray(required) || required.length === 0) return false;
  const pool = new Set((Array.isArray(available) ? available : []).map((c) => String(c).toUpperCase()));
  return (required as unknown[]).every((c) => pool.has(String(c).toUpperCase()));
}

/**
 * 校验安全整数
 */
export function assertSafeInteger(value: unknown, fieldName: string, min = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) {
    throw new ComponentContractError(
      "UNSAFE_INTEGER_VALUE",
      `字段 [${fieldName}] 必须为大于等于 ${min} 的安全整数 (Safe Integer)，当前实际值: ${String(value)}`
    );
  }
  return value;
}
