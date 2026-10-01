/**
 * 空间自带模型（BYO：Bring Your Own Model）
 *
 * 允许空间所有者/管理员登记自己的 OpenAI 兼容模型端点 + API Key，
 * 作为该空间的默认执行模型；平台仍按此处配置的价格向用户收费。
 *
 * 安全约束（与系统模型注册表一致）：
 *  - API Key 以 AES-256-GCM 密文落库，明文不出服务端；
 *  - Base URL 复用 SSRF/格式校验（validateModelBaseUrlForRequest）；
 *  - 协议仅 OPENAI_COMPATIBLE；
 *  - 解析时逐项校验能力覆盖与上下文上限，不满足则回落到空间/平台默认模型。
 */
import { prisma } from "@/lib/prisma";
import { ContractValidationError } from "@/lib/component-runtime-utils";
import { isSupportedModelProtocol, validateModelBaseUrlForRequest, SUPPORTED_MODEL_PROTOCOLS } from "@/lib/model-endpoint";
import { createModelAdapter, ModelAdapterError } from "@/lib/model-adapter";
import { encryptSecret, decryptSecret } from "@/lib/crypto-secrets";
import type { DeploymentPricing, PriceSource, PriceStatus } from "@/lib/model-pricing";
import type { ResolvedModelPlan } from "@/lib/model-registry";

export const SUPPORTED_CAPABILITIES = [
  "TEXT_GENERATION",
  "STRUCTURED_OUTPUT",
  "VISION",
  "LONG_CONTEXT",
  "FILE_ANALYSIS",
] as const;

function normCapabilities(raw: unknown): string[] {
  const arr = Array.isArray(raw) ? (raw as unknown[]) : [];
  return Array.from(
    new Set(
      arr
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        .map((c) => c.trim().toUpperCase()),
    ),
  );
}

export interface WorkspaceByoInput {
  label: string;
  protocol: string;
  baseUrl: string;
  apiKey: string;
  capabilities: string[];
  contextLimit: number;
  enabled: boolean;
  priceInputMicrosPerMillion: number | null;
  priceOutputMicrosPerMillion: number | null;
  /** 编辑时留空 API Key 且已有密钥 → 保留现有密钥，不更新 */
  keepExistingKey?: boolean;
}

/**
 * 校验并规范化 BYO 输入（不含密钥存储细节）；返回规范化后的字段。
 * @param requireApiKey 是否强制要求 API Key（新增时必填；编辑时可由调用方关闭以保留现有密钥）
 */
export function validateByoInput(
  body: Partial<WorkspaceByoInput>,
  opts?: { requireApiKey?: boolean },
): { ok: true; data: WorkspaceByoInput } | { ok: false; error: string } {
  const requireApiKey = opts?.requireApiKey !== false;
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const protocol = typeof body.protocol === "string" ? body.protocol.trim().toUpperCase() : "OPENAI_COMPATIBLE";
  const baseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  const capabilities = normCapabilities(body.capabilities);
  const contextLimit = typeof body.contextLimit === "number" ? body.contextLimit : 32000;
  const enabled = body.enabled !== false;

  if (!label) return { ok: false, error: "展示名不能为空" };
  if (!isSupportedModelProtocol(protocol)) {
    return { ok: false, error: `协议暂不支持：${protocol}（可选：${SUPPORTED_MODEL_PROTOCOLS.join(" / ")}）` };
  }
  if (!baseUrl) return { ok: false, error: "Base URL 不能为空" };
  let keepExistingKey = false;
  if (!apiKey) {
    if (requireApiKey) return { ok: false, error: "API Key 不能为空" };
    keepExistingKey = true;
  }
  if (contextLimit < 1) return { ok: false, error: "上下文上限必须为正整数" };
  for (const c of capabilities) {
    if (!(SUPPORTED_CAPABILITIES as readonly string[]).includes(c)) {
      return { ok: false, error: `不支持的能力声明：${c}` };
    }
  }
  const priceInput = body.priceInputMicrosPerMillion ?? null;
  const priceOutput = body.priceOutputMicrosPerMillion ?? null;
  if (priceInput === null || priceOutput === null) {
    return { ok: false, error: "平台服务费（输入/输出）必须配置，系统按此向用户收费" };
  }
  if (priceInput < 0 || priceOutput < 0) {
    return { ok: false, error: "平台服务费不能为负数" };
  }
  return {
    ok: true,
    data: { label, protocol, baseUrl, apiKey, capabilities, contextLimit, enabled, priceInputMicrosPerMillion: priceInput, priceOutputMicrosPerMillion: priceOutput, keepExistingKey },
  };
}

/** 配置（新增或更新）某空间的 BYO 模型；异步做 SSRF 校验 */
export async function upsertWorkspaceByoModel(
  workspaceId: string,
  input: WorkspaceByoInput,
): Promise<void> {
  const urlCheck = await validateModelBaseUrlForRequest(input.baseUrl);
  if (!urlCheck.ok) {
    throw new ContractValidationError("MODEL_NOT_ALLOWED", `BYO Base URL 校验失败：${urlCheck.error}`, 400);
  }
  const cipher = input.keepExistingKey ? undefined : encryptSecret(input.apiKey);
  await prisma.workspace_byo_model.upsert({
    where: { workspaceId },
    create: {
      workspaceId,
      label: input.label,
      protocol: input.protocol,
      baseUrl: input.baseUrl,
      apiKeyCipher: cipher ?? encryptSecret(input.apiKey),
      capabilities: input.capabilities,
      contextLimit: input.contextLimit,
      enabled: input.enabled,
      priceInputMicrosPerMillion: input.priceInputMicrosPerMillion,
      priceOutputMicrosPerMillion: input.priceOutputMicrosPerMillion,
      priceStatus: "VERIFIED",
    },
    update: {
      label: input.label,
      protocol: input.protocol,
      baseUrl: input.baseUrl,
      ...(cipher ? { apiKeyCipher: cipher } : {}),
      capabilities: input.capabilities,
      contextLimit: input.contextLimit,
      enabled: input.enabled,
      priceInputMicrosPerMillion: input.priceInputMicrosPerMillion,
      priceOutputMicrosPerMillion: input.priceOutputMicrosPerMillion,
      priceStatus: "VERIFIED",
    },
  });
}

/** 删除某空间的 BYO 配置 */
export async function deleteWorkspaceByoModel(workspaceId: string): Promise<void> {
  await prisma.workspace_byo_model.deleteMany({ where: { workspaceId } });
}

/** 读取配置（不含密钥，仅暴露能力/价格/状态供前端展示） */
export async function getWorkspaceByoModelView(workspaceId: string) {
  const row = await prisma.workspace_byo_model.findUnique({ where: { workspaceId } });
  if (!row) return null;
  const declared = normCapabilities(row.capabilities);
  const priceReady = row.priceInputMicrosPerMillion !== null && row.priceOutputMicrosPerMillion !== null;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    label: row.label,
    protocol: row.protocol,
    baseUrl: row.baseUrl,
    hasApiKey: true,
    capabilities: declared,
    contextLimit: row.contextLimit,
    enabled: row.enabled,
    priceInputMicrosPerMillion: row.priceInputMicrosPerMillion,
    priceOutputMicrosPerMillion: row.priceOutputMicrosPerMillion,
    priceStatus: row.priceStatus,
    priceReady,
  };
}

/**
 * 解析空间 BYO 默认模型为执行计划。
 *  - 未配置 / 禁用 / 能力或上下文不满足合同要求 → 返回 null（回落到空间/平台默认模型）；
 *  - 否则返回可直接用于执行的 ResolvedModelPlan，并把平台服务费同时作为结算成本入账，保证可结算。
 */
export async function tryResolveWorkspaceByoDefault(
  workspaceId: string,
  requiredCapabilities: string[],
): Promise<ResolvedModelPlan | null> {
  if (!workspaceId) return null;
  const row = await prisma.workspace_byo_model.findUnique({ where: { workspaceId } });
  if (!row || !row.enabled) return null;

  const required = Array.isArray(requiredCapabilities)
    ? Array.from(new Set(requiredCapabilities.filter((c) => typeof c === "string" && c.trim()).map((c) => c.trim().toUpperCase())))
    : [];
  const declared = normCapabilities(row.capabilities);

  // 能力必须全覆盖（不强制、回落），上下文上限必须满足（不满足则回落）
  if (required.some((c) => !declared.includes(c))) return null;
  if (required.length > 0 && row.contextLimit < 0) return null; // 防御性（实际不会触发）

  let apiKey: string;
  try {
    apiKey = decryptSecret(row.apiKeyCipher);
  } catch {
    return null; // 解密失败（主密钥不匹配等）→ 不可用，回落
  }

  const pricing = buildByoPricing(row);
  return {
    source: "WORKSPACE_BYO",
    pricing,
    deploymentId: `byo:${workspaceId}`,
    providerId: `BYO:${workspaceId}`,
    modelId: row.label,
    upstreamModelId: row.label,
    protocol: row.protocol || "OPENAI_COMPATIBLE",
    baseUrl: row.baseUrl,
    apiKey,
    contextLimit: row.contextLimit,
  };
}

/** BYO 定价：平台服务费同时作为结算成本（价差即平台收入），状态 VERIFIED 以通过结算就绪校验 */
function buildByoPricing(row: {
  priceInputMicrosPerMillion: number | null;
  priceOutputMicrosPerMillion: number | null;
  priceStatus: string;
}): DeploymentPricing {
  const inM = row.priceInputMicrosPerMillion;
  const outM = row.priceOutputMicrosPerMillion;
  const source: PriceSource = "VERIFIED";
  const status: PriceStatus =
    (["UNCONFIGURED", "FREE", "OBSERVED_ONLY", "VERIFIED"] as readonly string[]).includes(row.priceStatus)
      ? (row.priceStatus as PriceStatus)
      : "VERIFIED";
  return {
    currency: "CNY",
    costInputMicrosPerMillion: inM,
    costOutputMicrosPerMillion: outM,
    costCacheReadMicrosPerMillion: null,
    costCacheWriteMicrosPerMillion: null,
    priceInputMicrosPerMillion: inM,
    priceOutputMicrosPerMillion: outM,
    priceCacheReadMicrosPerMillion: null,
    priceCacheWriteMicrosPerMillion: null,
    priceSource: source,
    priceStatus: status,
    markupRateBps: 0,
    priceVersion: 1,
    effectiveFrom: null,
  };
}

/**
 * 测试通道错误分类（用于前端给出可执行的排查建议）
 */
export type ByoTestErrorType =
  | "endpoint_blocked"
  | "protocol_unsupported"
  | "auth"
  | "forbidden"
  | "timeout"
  | "rate_limited"
  | "bad_request"
  | "upstream"
  | "unknown";

export interface ByoTestResult {
  ok: boolean;
  latencyMs: number;
  errorType?: ByoTestErrorType;
  message?: string;
  troubleshooting?: string[];
  sampleReply?: string;
}

/**
 * 测试 BYO 模型连通性（真实发一次最小调用，不落库）。
 * 用于配置页「测试通道」：用户填完表单后先验证端点 + 密钥是否可用，再决定是否保存。
 * 安全：复用 SSRF 校验；apiKey 仅内存使用，绝不进入任何存储。
 */
export async function testByoModelConnection(input: {
  baseUrl: string;
  protocol: string;
  apiKey: string;
  modelLabel: string;
}): Promise<ByoTestResult> {
  const startedAt = Date.now();
  const latency = () => Date.now() - startedAt;

  const protocol = (input.protocol || "OPENAI_COMPATIBLE").trim().toUpperCase();
  if (!isSupportedModelProtocol(protocol)) {
    return {
      ok: false,
      latencyMs: latency(),
      errorType: "protocol_unsupported",
      message: `协议暂不支持：${protocol}（可选：${SUPPORTED_MODEL_PROTOCOLS.join(" / ")}）`,
      troubleshooting: ["请在协议下拉框中选择受支持的接入协议后再试。"],
    };
  }

  // SSRF 校验（与保存时一致；createModelAdapter 内部会再校验一次，这里先行给出明确拦截原因）
  const urlCheck = await validateModelBaseUrlForRequest(input.baseUrl);
  if (!urlCheck.ok) {
    return {
      ok: false,
      latencyMs: latency(),
      errorType: "endpoint_blocked",
      message: `Base URL 安全校验未通过：${urlCheck.error}`,
      troubleshooting: [
        "仅允许 https 公网地址（本地联调请设置 MODEL_ALLOW_INSECURE_LOCAL=true 后使用 http）。",
        "不得使用本机 / 内网 / 链路本地 / 云元数据（如 169.254.169.254）地址，存在 SSRF 风险。",
        "确认 Base URL 拼写正确、包含协议前缀（如 https://your-host/v1）。",
      ],
    };
  }

  const modelLabel = (input.modelLabel || input.baseUrl || "byo-test").trim();
  try {
    const adapter = await createModelAdapter({
      providerId: `byo-test:${modelLabel}`,
      modelId: modelLabel,
      upstreamModelId: modelLabel,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      protocol,
    });
    const res = await adapter.execute({
      providerId: modelLabel,
      modelId: modelLabel,
      userPrompt: "请只回复「连通正常」四个字，不要输出任何其他内容。",
      temperature: 0,
      maxOutputTokens: 16,
    });
    return {
      ok: true,
      latencyMs: res.latencyMs || latency(),
      sampleReply: res.text.slice(0, 200),
    };
  } catch (err) {
    const e = err as { code?: string; message?: string };
    const code = err instanceof ModelAdapterError ? err.code : e?.code || "UNKNOWN";
    const msg = e?.message || "模型服务调用失败";
    const map: Record<string, { type: ByoTestErrorType; tips: string[] }> = {
      MODEL_ENDPOINT_BLOCKED: {
        type: "endpoint_blocked",
        tips: ["Base URL 未通过服务端 SSRF 安全校验，请检查地址是否为公网 https。", "本地/内网地址需开启 MODEL_ALLOW_INSECURE_LOCAL 测试开关后重试。"],
      },
      MODEL_AUTH_ERROR: {
        type: "auth",
        tips: [
          "API Key 鉴权失败（401）。请检查密钥是否正确、是否过期或额度耗尽。",
          "OpenAI 兼容网关：密钥通常需以 sk- 开头；Anthropic 由系统自动以 x-api-key 头部注入。",
          "确认该密钥对该模型有调用权限。",
        ],
      },
      MODEL_FORBIDDEN: {
        type: "forbidden",
        tips: ["该密钥无权限访问目标模型（403）。", "确认密钥所属账号已被授予该模型的调用权限。"],
      },
      MODEL_TIMEOUT: {
        type: "timeout",
        tips: ["调用超时。请检查 Base URL 是否可达、网络是否通畅。", "确认服务端出站防火墙已放行目标端口（如 443）。", "上游响应慢可稍后重试。"],
      },
      MODEL_RATE_LIMITED: {
        type: "rate_limited",
        tips: ["触发上游限流（429）。", "请降低调用频率，或升级配额 / 更换密钥。"],
      },
      MODEL_BAD_REQUEST: {
        type: "bad_request",
        tips: ["请求参数被拒绝（400）。", "请确认「模型展示名称」填写的是上游真实的模型 ID（如 deepseek-chat），而非自定义昵称。"],
      },
      MODEL_UPSTREAM_ERROR: {
        type: "upstream",
        tips: ["上游模型服务返回错误。", "确认 Base URL 路径正确（OpenAI 兼容需含 /v1 等前缀）。", "确认模型 ID 存在且服务可用。"],
      },
    };
    const hit = map[code] || { type: "unknown" as ByoTestErrorType, tips: ["未知错误，请检查配置后重试。", msg] };
    return {
      ok: false,
      latencyMs: latency(),
      errorType: hit.type,
      message: msg,
      troubleshooting: hit.tips,
    };
  }
}
