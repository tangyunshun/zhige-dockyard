/**
 * 模型注册表（Phase 1）
 *
 * 设计原则（当前真实规则）：
 *  - 模型必须已在数据库注册表注册；
 *  - provider / deployment / 空间白名单一律由数据库裁决（enabled 状态、白名单均以 DB 为准）；
 *  - 生产路径**没有环境变量兜底**：未注册模型一律 MODEL_NOT_ALLOWED（即使环境变量与合同一致也不放行）；
 *  - API Key 不入库：provider 仅保存环境变量名（apiKeyEnv），运行时据此从服务端环境变量读取；
 *  - 用户不得通过请求体篡改 providerId / modelId（MODEL_OVERRIDE_NOT_ALLOWED）；
 *  - 任何不合法情况 → MODEL_NOT_ALLOWED，**绝不降级为 SIMULATED**。
 */
import { prisma } from "@/lib/prisma";
import { ContractValidationError } from "@/lib/component-runtime-utils";
import { ModelAdapterError, createModelAdapter } from "@/lib/model-adapter";
import { validateModelBaseUrlForRequest } from "@/lib/model-endpoint";
import {
  PRICE_SOURCES,
  PRICE_STATUSES,
  resolvePriceStatus,
  resolveEffectiveUserPrice,
  type DeploymentPricing,
  type PriceSource,
  type PriceStatus,
} from "@/lib/model-pricing";
import { isHoliday } from "@/lib/holiday-calendar";
import { tryResolveWorkspaceByoDefault } from "@/lib/workspace-byo-model";
import { decryptSecret } from "@/lib/crypto-secrets";

/** 读取部署的价格配置（不存在返回 null = 未配置） */
export async function loadDeploymentPricing(deploymentId: string): Promise<DeploymentPricing | null> {
  const row = await prisma.modelpricing.findUnique({ where: { deploymentId } });
  if (!row) return null;
  const source = (PRICE_SOURCES as readonly string[]).includes(row.priceSource)
    ? (row.priceSource as PriceSource)
    : "UNVERIFIED";
  const status = (PRICE_STATUSES as readonly string[]).includes(row.priceStatus)
    ? (row.priceStatus as PriceStatus)
    : resolvePriceStatus({
        priceSource: source,
        costValues: [
          row.costInputMicrosPerMillion,
          row.costOutputMicrosPerMillion,
          row.costCacheReadMicrosPerMillion,
          row.costCacheWriteMicrosPerMillion,
        ],
        priceValues: [
          row.priceInputMicrosPerMillion,
          row.priceOutputMicrosPerMillion,
          row.priceCacheReadMicrosPerMillion,
          row.priceCacheWriteMicrosPerMillion,
        ],
      });
  return {
    currency: row.currency,
    costInputMicrosPerMillion: row.costInputMicrosPerMillion,
    costOutputMicrosPerMillion: row.costOutputMicrosPerMillion,
    costCacheReadMicrosPerMillion: row.costCacheReadMicrosPerMillion,
    costCacheWriteMicrosPerMillion: row.costCacheWriteMicrosPerMillion,
    priceInputMicrosPerMillion: row.priceInputMicrosPerMillion,
    priceOutputMicrosPerMillion: row.priceOutputMicrosPerMillion,
    priceCacheReadMicrosPerMillion: row.priceCacheReadMicrosPerMillion,
    priceCacheWriteMicrosPerMillion: row.priceCacheWriteMicrosPerMillion,
    priceSource: source,
    priceStatus: status,
    priceOrigin: row.priceOrigin || "PLATFORM",
    markupRateBps: row.markupRateBps,
    priceVersion: row.priceVersion,
    effectiveFrom: row.effectiveFrom ? row.effectiveFrom.toISOString() : null,
  };
}

/** 时段价类型权重（同级优先级时的决胜顺序：节假日 > 高峰 > 闲时 > 自定义） */
const PERIOD_KIND_WEIGHT: Record<string, number> = { HOLIDAY: 3, PEAK: 2, IDLE: 1, CUSTOM: 0 };

type PricingPeriodRow = {
  id: string;
  name: string;
  kind: string;
  enabled: boolean;
  priority: number;
  weekdays: string | null;
  startTime: string | null;
  endTime: string | null;
  startDate: Date | null;
  endDate: Date | null;
  costInputMicrosPerMillion: number | null;
  costOutputMicrosPerMillion: number | null;
  costCacheReadMicrosPerMillion: number | null;
  costCacheWriteMicrosPerMillion: number | null;
  priceInputMicrosPerMillion: number | null;
  priceOutputMicrosPerMillion: number | null;
  priceCacheReadMicrosPerMillion: number | null;
  priceCacheWriteMicrosPerMillion: number | null;
  priceSource: string;
  priceStatus: string;
  markupRateBps: number | null;
  priceVersion: number;
};

/** 时段价行 → DeploymentPricing（与 loadDeploymentPricing 同构，状态由来源+数值推导） */
function periodRowToDeploymentPricing(row: PricingPeriodRow): DeploymentPricing {
  const source = (PRICE_SOURCES as readonly string[]).includes(row.priceSource)
    ? (row.priceSource as PriceSource)
    : "UNVERIFIED";
  const status = (PRICE_STATUSES as readonly string[]).includes(row.priceStatus)
    ? (row.priceStatus as PriceStatus)
    : resolvePriceStatus({
        priceSource: source,
        costValues: [
          row.costInputMicrosPerMillion,
          row.costOutputMicrosPerMillion,
          row.costCacheReadMicrosPerMillion,
          row.costCacheWriteMicrosPerMillion,
        ],
        priceValues: [
          row.priceInputMicrosPerMillion,
          row.priceOutputMicrosPerMillion,
          row.priceCacheReadMicrosPerMillion,
          row.priceCacheWriteMicrosPerMillion,
        ],
      });
  return {
    currency: "CNY",
    costInputMicrosPerMillion: row.costInputMicrosPerMillion,
    costOutputMicrosPerMillion: row.costOutputMicrosPerMillion,
    costCacheReadMicrosPerMillion: row.costCacheReadMicrosPerMillion,
    costCacheWriteMicrosPerMillion: row.costCacheWriteMicrosPerMillion,
    priceInputMicrosPerMillion: row.priceInputMicrosPerMillion,
    priceOutputMicrosPerMillion: row.priceOutputMicrosPerMillion,
    priceCacheReadMicrosPerMillion: row.priceCacheReadMicrosPerMillion,
    priceCacheWriteMicrosPerMillion: row.priceCacheWriteMicrosPerMillion,
    priceSource: source,
    priceStatus: status,
    markupRateBps: row.markupRateBps,
    priceVersion: row.priceVersion,
    effectiveFrom: row.startDate ? row.startDate.toISOString() : null,
  };
}

/** 日期是否落在 [start,end] 区间（单侧缺失则只判另一侧；皆缺→true） */
function dateInRange(now: Date, start: Date | null, end: Date | null): boolean {
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

/** 当前星期+时间是否命中周计划窗口（无周计划约束→true） */
function weekTimeMatch(now: Date, weekdays: string | null, startTime: string | null, endTime: string | null): boolean {
  const hasWeek = !!weekdays && weekdays.trim().length > 0;
  const hasTime = !!startTime && !!endTime;
  if (!hasWeek && !hasTime) return true;
  if (hasWeek) {
    // JS getDay(): 0=周日..6=周六 → 转成 1=周一..7=周日
    const wd = now.getDay() === 0 ? 7 : now.getDay();
    const list = weekdays!.split(",").map((s) => s.trim()).filter(Boolean);
    if (!list.includes(String(wd))) return false;
  }
  if (hasTime) {
    const [sh, sm] = startTime!.split(":").map(Number);
    const [eh, em] = endTime!.split(":").map(Number);
    if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) return false;
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (endMin < startMin) return false; // 不支持跨天窗口
    const nowMin = now.getHours() * 60 + now.getMinutes();
    if (nowMin < startMin || nowMin > endMin) return false;
  }
  return true;
}

/** 时段价是否在当前时刻生效（日期区间 与 周计划窗口 同时命中） */
function periodMatchesNow(p: PricingPeriodRow, now: Date): boolean {
  // 自动节假日时段：无日期/星期/时间约束，仅在法定节假日当天命中（价格已在时段内设为闲时价）
  if (p.kind === "HOLIDAY" && !p.startDate && !p.endDate && !p.weekdays && !p.startTime && !p.endTime) {
    return isHoliday(now);
  }
  return dateInRange(now, p.startDate, p.endDate) && weekTimeMatch(now, p.weekdays, p.startTime, p.endTime);
}

/**
 * 按时段选价：返回「当前时刻生效的时段价」；无命中或命中时段未配置有效价格时，回退主流价。
 * 用于执行/结算路径，使分时定价对调用方透明（下游快照/选价/就绪判定均吃同一 DeploymentPricing）。
 */
export async function resolveActivePricingAt(
  deploymentId: string,
  now: Date = new Date(),
): Promise<DeploymentPricing | null> {
  const mainstream = await loadDeploymentPricing(deploymentId);
  let periods: PricingPeriodRow[] = [];
  try {
    periods = (await prisma.modelpricingperiod.findMany({
      where: { deploymentId, enabled: true },
      orderBy: { priority: "desc" },
    })) as unknown as PricingPeriodRow[];
  } catch {
    periods = [];
  }
  const matched = periods.filter((p) => periodMatchesNow(p, now));
  if (matched.length === 0) return mainstream;

  matched.sort(
    (a, b) =>
      b.priority - a.priority || (PERIOD_KIND_WEIGHT[b.kind] ?? 0) - (PERIOD_KIND_WEIGHT[a.kind] ?? 0),
  );
  for (const p of matched) {
    const priced = periodRowToDeploymentPricing(p);
    // 仅当该时段价自身可解析出有效定价模式时才采用；否则跳过，尝试下一个命中时段
    if (resolveEffectiveUserPrice(priced).mode) return priced;
  }
  return mainstream;
}

/** 当前生效价解析结果（供前端只读展示：生效价 + 生效时段 ID） */
export interface ActivePricingResolution {
  pricing: DeploymentPricing | null;
  activePeriodId: string | null;
}

/**
 * 在 resolveActivePricingAt 基础上额外回传「当前生效时段 ID」，
 * 用于用户前台只读展示「当前生效价」归属（主流价还是某个时段价）。
 * 判定逻辑与结算路径完全一致（仅启用时段、按优先级/类型权重决胜）。
 */
export async function resolveActivePricingWithPeriod(
  deploymentId: string,
  now: Date = new Date(),
): Promise<ActivePricingResolution> {
  const active = await resolveActivePricingAt(deploymentId, now);
  let periods: PricingPeriodRow[] = [];
  try {
    periods = (await prisma.modelpricingperiod.findMany({
      where: { deploymentId, enabled: true },
      orderBy: { priority: "desc" },
    })) as unknown as PricingPeriodRow[];
  } catch {
    periods = [];
  }
  const matched = periods.filter((p) => periodMatchesNow(p, now));
  matched.sort(
    (a, b) =>
      b.priority - a.priority || (PERIOD_KIND_WEIGHT[b.kind] ?? 0) - (PERIOD_KIND_WEIGHT[a.kind] ?? 0),
  );
  let activePeriodId: string | null = null;
  for (const p of matched) {
    if (resolveEffectiveUserPrice(periodRowToDeploymentPricing(p)).mode) {
      activePeriodId = p.id;
      break;
    }
  }
  return { pricing: active, activePeriodId };
}

/** 执行计划来源：正式路径只允许数据库注册表 */
export type PlanSource = "DATABASE" | "WORKSPACE_BYO";

export interface ResolvedModelPlan {
  source: PlanSource;
  /** 注册表价格（供应商成本与用户售价分离；null = 未配置价格） */
  pricing: DeploymentPricing | null;
  /** 部署记录 ID（白名单/审计用；正式路径必为数据库注册表 ID） */
  deploymentId: string;
  /** 平台内供应商标识（合同 providerId） */
  providerId: string;
  /** 平台内模型标识（合同 modelId） */
  modelId: string;
  /** 供应商侧真实模型名（实际下发） */
  upstreamModelId: string;
  protocol: string;
  baseUrl: string;
  /** 运行时读取的鉴权串（不落库、不返回前端） */
  apiKey: string;
  contextLimit: number;
  // 注意：价格唯一真源为 modelpricing（见 plan.pricing）；此处不再暴露 deployment 旧价格字段
}

/** 空间模型策略 */
export interface SpaceModelPolicy {
  defaultDeploymentId: string | null;
  /** 允许的部署 ID；空数组表示不限制 */
  allowedDeploymentIds: string[];
  configured: boolean;
}

/**
 * 纯函数：拦截用户通过请求体篡改 provider/model。
 * 只要提交了 providerId 或 modelId，必须与合同声明完全一致，否则拒绝。
 */
export function assertNoModelOverride(params: {
  contractProviderId: string;
  contractModelId: string;
  submittedProviderId?: string | null;
  submittedModelId?: string | null;
}): void {
  const hasSubmit = Boolean(params.submittedProviderId || params.submittedModelId);
  if (!hasSubmit) return;
  if (
    params.submittedProviderId !== params.contractProviderId ||
    params.submittedModelId !== params.contractModelId
  ) {
    throw new ContractValidationError(
      "MODEL_OVERRIDE_NOT_ALLOWED",
      "当前仅允许使用组件合同声明的模型，不接受自定义 provider/model。",
      400,
    );
  }
}

/**
 * 纯函数：模型可用性策略校验（无数据库依赖，便于单元测试）。
 * 调用前必须先执行 assertNoModelOverride。
 */
export function assertModelAllowed(params: {
  contractProviderId: string;
  contractModelId: string;
  /** null 表示未在注册表注册 */
  deploymentId: string | null;
  deploymentEnabled: boolean;
  providerEnabled: boolean;
  /** null 表示未配置空间策略；非空数组启用白名单限制 */
  allowedDeploymentIds: string[] | null;
}): void {
  if (params.deploymentId === null) {
    throw new ContractValidationError(
      "MODEL_NOT_ALLOWED",
      `组件合同声明的模型（${params.contractProviderId}/${params.contractModelId}）未在平台模型注册表中注册，不允许执行。`,
      403,
    );
  }
  if (!params.deploymentEnabled) {
    throw new ContractValidationError(
      "MODEL_NOT_ALLOWED",
      `组件合同声明的模型（${params.contractProviderId}/${params.contractModelId}）已被平台禁用，不允许执行。`,
      403,
    );
  }
  if (!params.providerEnabled) {
    throw new ContractValidationError(
      "MODEL_NOT_ALLOWED",
      `模型供应商（${params.contractProviderId}）已被平台禁用，不允许执行。`,
      403,
    );
  }
  if (params.allowedDeploymentIds && params.allowedDeploymentIds.length > 0) {
    if (!params.allowedDeploymentIds.includes(params.deploymentId)) {
      throw new ContractValidationError(
        "MODEL_NOT_ALLOWED",
        `当前空间未在允许模型白名单内：${params.contractProviderId}/${params.contractModelId}。`,
        403,
      );
    }
  }
}

/** 读取空间模型策略；未配置返回 { configured: false, allowedDeploymentIds: [] } */
export async function loadSpaceModelPolicy(workspaceId: string): Promise<SpaceModelPolicy> {
  if (!workspaceId) return { defaultDeploymentId: null, allowedDeploymentIds: [], configured: false };
  const row = await prisma.workspace_model_policy.findUnique({ where: { workspaceId } });
  if (!row) return { defaultDeploymentId: null, allowedDeploymentIds: [], configured: false };
  const ids = Array.isArray(row.allowedDeploymentIds) ? (row.allowedDeploymentIds as unknown as string[]) : [];
  return {
    defaultDeploymentId: row.defaultDeploymentId ?? null,
    allowedDeploymentIds: ids.filter((v) => typeof v === "string"),
    configured: true,
  };
}

/**
 * 解析供应商密钥：优先使用后台录入的密文（apiKeyCipher），其次回退到 apiKeyEnv 指示的环境变量。
 * 两者皆空表示模型无需密钥（本地/自托管模型常无鉴权），返回空串，由适配器决定是否下发 Authorization。
 */
function resolveProviderApiKey(envName: string | null | undefined, cipher: string | null | undefined): string {
  if (cipher && cipher.trim()) {
    try {
      return decryptSecret(cipher.trim());
    } catch {
      throw new ModelAdapterError(
        "MODEL_NOT_CONFIGURED",
        "模型密钥解密失败（主密钥不匹配或密文损坏），无法执行真实模型调用。",
        503,
      );
    }
  }
  const name = (envName || "").trim();
  if (!name) return "";
  const key = process.env[name]?.trim();
  if (!key) {
    throw new ModelAdapterError(
      "MODEL_NOT_CONFIGURED",
      `模型服务鉴权未配置（环境变量 ${name} 缺失），无法执行真实模型调用。`,
      503,
    );
  }
  return key;
}

/** 模型部署测试通道结果（与 BYO 测试同构，便于前端统一渲染） */
export type DeploymentTestResult = {
  ok: boolean;
  latencyMs: number;
  errorType?: string;
  label?: string;
  message?: string;
  troubleshooting?: string[];
  sampleReply?: string;
};

/**
 * 测试模型部署连通性（真实发一次最小调用，不落库）。
 * 用于模型注册表「测试通道」：按 deploymentId 解析其所属 provider 的端点与密钥（优先密文、回退环境变量），
 * 真实发起一次上游调用验证该部署模型是否可用。
 * 安全：复用 SSRF 校验；密钥仅内存使用，绝不进入任何存储。
 */
export async function testDeploymentConnection(deploymentId: string): Promise<DeploymentTestResult> {
  const startedAt = Date.now();
  const latency = () => Date.now() - startedAt;

  const deployment = await prisma.modeldeployment.findUnique({
    where: { id: deploymentId },
    include: { provider: true },
  });
  if (!deployment || !deployment.provider) {
    return { ok: false, latencyMs: latency(), errorType: "not_found", label: "记录不存在", message: "模型部署或所属供应商不存在" };
  }
  const provider = deployment.provider;
  const modelLabel = deployment.upstreamModel || deployment.modelId;

  // 禁用态门禁（与真实执行路径 assertModelAllowed 一致）：通道测试本质是一次测试性执行，
  // 禁用的供应商/模型不得发起任何真实上游调用，避免「能测通却用不了」的语义不一致与浪费真实 API 调用。
  if (!provider.enabled) {
    return {
      ok: false,
      latencyMs: latency(),
      errorType: "provider_disabled",
      label: "供应商已禁用",
      message: `供应商通道「${provider.name}」已被禁用，无法执行通道测试，请先在供应商列表启用该通道。`,
      troubleshooting: [
        "禁用态的供应商通道不会向任何端点发起调用（与执行路径规则一致）。",
        "在「供应商列表」中启用该通道后，再执行通道测试。",
      ],
    };
  }
  if (!deployment.enabled) {
    return {
      ok: false,
      latencyMs: latency(),
      errorType: "deployment_disabled",
      label: "模型已禁用",
      message: `模型部署「${deployment.providerId}/${deployment.modelId}」已被禁用，无法执行通道测试，请先启用该模型。`,
      troubleshooting: [
        "禁用态的模型部署不会被执行（含测试性调用），与执行路径规则一致。",
        "在「模型部署」列表中启用该模型后，再执行通道测试。",
      ],
    };
  }

  // SSRF 校验（与执行路径一致）
  const urlCheck = await validateModelBaseUrlForRequest(provider.baseUrl);
  if (!urlCheck.ok) {
    return {
      ok: false,
      latencyMs: latency(),
      errorType: "endpoint_blocked",
      label: "地址被拦截（安全校验）",
      message: `Base URL 安全校验未通过：${urlCheck.error}`,
      troubleshooting: [
        "仅允许 https 公网地址（本地联调请设置 MODEL_ALLOW_INSECURE_LOCAL=true 后使用 http）。",
        "不得使用本机 / 内网 / 链路本地 / 云元数据（如 169.254.169.254）地址，存在 SSRF 风险。",
      ],
    };
  }

  try {
    const apiKey = resolveProviderApiKey(provider.apiKeyEnv, provider.apiKeyCipher);
    const adapter = await createModelAdapter({
      providerId: provider.id,
      modelId: deployment.modelId,
      upstreamModelId: modelLabel,
      baseUrl: provider.baseUrl,
      apiKey,
      protocol: (provider.protocol || "OPENAI_COMPATIBLE").trim().toUpperCase(),
    });
    const res = await adapter.execute({
      providerId: provider.id,
      modelId: deployment.modelId,
      userPrompt: "请只回复「连通正常」四个字，不要输出任何其他内容。",
      temperature: 0,
      // 推理模型会先把 token 花在思考(reasoning)上，太小会导致 content 空而误判；给足预算让其先思考再作答
      maxOutputTokens: 512,
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
    const map: Record<string, { type: string; label: string; tips: string[] }> = {
      MODEL_ENDPOINT_BLOCKED: {
        type: "endpoint_blocked",
        label: "地址被拦截（安全校验）",
        tips: [
          "去「供应商配置」把 Base URL 改为公网 https 地址。",
          "本地/内网联调需开启 MODEL_ALLOW_INSECURE_LOCAL 测试开关。",
        ],
      },
      MODEL_AUTH_ERROR: {
        type: "auth",
        label: "密钥无效（401）",
        tips: [
          "去「供应商配置」检查 API Key（环境变量或密钥密文）是否正确、是否过期。",
          "确认该密钥对目标模型有调用权限与可用额度。",
        ],
      },
      MODEL_FORBIDDEN: {
        type: "forbidden",
        label: "无权限（403）",
        tips: ["密钥有效但账号无该模型权限：去供应商后台给账号开通目标模型的调用权限。"],
      },
      MODEL_TIMEOUT: {
        type: "timeout",
        label: "连接超时",
        tips: [
          "去「供应商配置」检查 Base URL 是否可达、模型名是否拼错。",
          "上游确实慢可稍后重试，或调大 MODEL_TIMEOUT_MS。",
        ],
      },
      MODEL_NOT_CONFIGURED: {
        type: "not_configured",
        label: "密钥未配置",
        tips: ["去「供应商配置」填写 apiKeyEnv 环境变量名，并在服务端设置该变量或录入密钥密文。"],
      },
      MODEL_PROTOCOL_UNSUPPORTED: {
        type: "protocol_unsupported",
        label: "协议不支持",
        tips: ["去「供应商配置」把协议改为受支持项：OpenAI 兼容 / Anthropic / Gemini。"],
      },
      MODEL_UPSTREAM_ERROR: {
        type: "upstream_error",
        label: "上游报错",
        tips: [
          "看上方「错误详情」：message 里是上游真实报错。",
          "常见原因：模型 ID 不存在/拼错、额度耗尽、服务临时不可用。",
          "去「供应商配置」核对 Base URL 路径（OpenAI 兼容需含 /v1）与 upstreamModel 模型名。",
        ],
      },
      MODEL_BAD_REQUEST: {
        type: "bad_request",
        label: "请求参数错误",
        tips: ["去「供应商配置」核对 upstreamModel（填上游真实模型 ID，如 deepseek-chat）与所选协议是否匹配该网关。"],
      },
    };
    const hit = map[code] || { type: "unknown", label: "未知错误", tips: ["未知错误，请查看 message 详情或后端日志。"] };
    return {
      ok: false,
      latencyMs: latency(),
      errorType: hit.type,
      label: hit.label,
      message: msg,
      troubleshooting: hit.tips,
    };
  }
}

/** 由部署 + 供应商记录构建数据库来源的执行计划 */
function buildDatabasePlan(
  deployment: {
    id: string;
    providerId: string;
    modelId: string;
    upstreamModel: string;
    contextLimit: number;
  },
  provider: { protocol: string; baseUrl: string; apiKeyEnv: string; apiKeyCipher?: string | null },
): ResolvedModelPlan {
  return {
    source: "DATABASE",
    pricing: null, // 由调用方按 deploymentId 加载后覆盖
    deploymentId: deployment.id,
    providerId: deployment.providerId,
    modelId: deployment.modelId,
    upstreamModelId: deployment.upstreamModel || deployment.modelId,
    protocol: provider.protocol || "OPENAI_COMPATIBLE",
    baseUrl: provider.baseUrl,
    apiKey: resolveProviderApiKey(provider.apiKeyEnv, provider.apiKeyCipher),
    contextLimit: deployment.contextLimit,
  };
}

/**
 * 从数据库解析真实模型执行计划。
 * 规则见文件头：注册表存在 → DB 完全裁决；不存在 → 空间默认模型 → 受限的环境变量兜底。
 */
/**
 * 能力与上下文门禁（**不以 contextLimit 代替能力表达**）：
 *  - 合同 requiredCapabilities 必须被部署声明能力全覆盖，否则 MODEL_CAPABILITY_NOT_SUPPORTED；
 *  - 合同要求的上下文预算不得超过部署 contextLimit。
 */
function assertCapabilitiesAndContext(params: {
  providerId: string;
  modelId: string;
  capabilities: unknown;
  contextLimit: number;
  requiredCapabilities?: string[];
  requiredContextTokens?: number;
}): void {
  const required = Array.isArray(params.requiredCapabilities)
    ? Array.from(
        new Set(
          params.requiredCapabilities
            .filter((c) => typeof c === "string" && c.trim().length > 0)
            .map((c) => c.trim().toUpperCase()),
        ),
      )
    : [];
  if (required.length > 0) {
    const declared = Array.isArray(params.capabilities)
      ? (params.capabilities as unknown as string[]).map((c) => String(c).toUpperCase())
      : [];
    const missing = required.filter((c) => !declared.includes(c));
    if (missing.length > 0) {
      throw new ContractValidationError(
        "MODEL_CAPABILITY_NOT_SUPPORTED",
        `模型（${params.providerId}/${params.modelId}）缺少合同要求的能力：${missing.join("、")}，不允许执行。`,
        403,
      );
    }
  }
  if (typeof params.requiredContextTokens === "number" && params.requiredContextTokens > 0) {
    if (params.contextLimit < params.requiredContextTokens) {
      throw new ContractValidationError(
        "MODEL_CONTEXT_LIMIT_EXCEEDED",
        `模型（${params.providerId}/${params.modelId}）上下文上限 ${params.contextLimit} 小于合同要求 ${params.requiredContextTokens}，不允许执行。`,
        403,
      );
    }
  }
}

export async function resolveModelExecutionPlan(params: {
  contractProviderId: string;
  contractModelId: string;
  workspaceId: string;
  submittedProviderId?: string | null;
  submittedModelId?: string | null;
  /** 合同声明的抽象能力要求（逐项校验部署能力声明） */
  requiredCapabilities?: string[];
  /** 合同要求的上下文预算（tokens），不得超过部署 contextLimit */
  requiredContextTokens?: number;
}): Promise<ResolvedModelPlan> {
  // 1. 用户不得篡改 —— 优先级最高，防止用请求体绕过白名单
  assertNoModelOverride(params);

  // 2. 查询注册表（providerId 即 modelprovider.name）
  const deployment = await prisma.modeldeployment.findUnique({
    where: {
      providerId_modelId: {
        providerId: params.contractProviderId,
        modelId: params.contractModelId,
      },
    },
  });
  const provider = deployment
    ? await prisma.modelprovider.findUnique({ where: { name: deployment.providerId } })
    : null;
  const policy = await loadSpaceModelPolicy(params.workspaceId);
  const allowedList = policy.configured ? policy.allowedDeploymentIds : null;

  // 2.5 空间默认模型：必须存在、启用、供应商启用（默认模型不得绕过启用状态与白名单）
  let defaultPlan: { deployment: NonNullable<typeof deployment>; provider: NonNullable<typeof provider> } | null = null;
  if (policy.defaultDeploymentId) {
    const dd = await prisma.modeldeployment.findUnique({ where: { id: policy.defaultDeploymentId } });
    if (!dd) {
      throw new ContractValidationError(
        "MODEL_NOT_ALLOWED",
        "当前空间配置的默认模型不存在，请联系管理员重新配置空间模型策略。",
        403,
      );
    }
    const dp = await prisma.modelprovider.findUnique({ where: { name: dd.providerId } });
    if (!dd.enabled || !dp?.enabled) {
      throw new ContractValidationError(
        "MODEL_NOT_ALLOWED",
        `当前空间配置的默认模型（${dd.providerId}/${dd.modelId}）已被禁用，不允许执行。`,
        403,
      );
    }
    defaultPlan = { deployment: dd, provider: dp };
  }

  // 3. 已注册 → 由数据库完全裁决（禁用不回落环境变量）
  if (deployment) {
    assertModelAllowed({
      contractProviderId: params.contractProviderId,
      contractModelId: params.contractModelId,
      deploymentId: deployment.id,
      deploymentEnabled: deployment.enabled,
      providerEnabled: provider?.enabled ?? false,
      allowedDeploymentIds: allowedList,
    });
    assertCapabilitiesAndContext({
      providerId: deployment.providerId,
      modelId: deployment.modelId,
      capabilities: deployment.capabilities,
      contextLimit: deployment.contextLimit,
      requiredCapabilities: params.requiredCapabilities,
      requiredContextTokens: params.requiredContextTokens,
    });
    return { ...buildDatabasePlan(deployment, provider!), pricing: await resolveActivePricingAt(deployment.id) };
  }

  // 4. 合同模型未注册 → 若空间配置了可用默认模型则使用它（仍受白名单约束）
  if (defaultPlan) {
    if (allowedList && allowedList.length > 0 && !allowedList.includes(defaultPlan.deployment.id)) {
      throw new ContractValidationError(
        "MODEL_NOT_ALLOWED",
        "当前空间的默认模型不在允许模型白名单内，不允许执行。",
        403,
      );
    }
    assertCapabilitiesAndContext({
      providerId: defaultPlan.deployment.providerId,
      modelId: defaultPlan.deployment.modelId,
      capabilities: defaultPlan.deployment.capabilities,
      contextLimit: defaultPlan.deployment.contextLimit,
      requiredCapabilities: params.requiredCapabilities,
      requiredContextTokens: params.requiredContextTokens,
    });
    return {
      ...buildDatabasePlan(defaultPlan.deployment, defaultPlan.provider),
      pricing: await resolveActivePricingAt(defaultPlan.deployment.id),
    };
  }

  // 5. 未在注册表注册，且空间未配置可用默认模型 → 一律拒绝
  //    生产路径**不存在**环境变量兜底：即使环境变量与合同一致，未注册模型也不得执行。
  throw new ContractValidationError(
    "MODEL_NOT_ALLOWED",
    `组件合同声明的模型（${params.contractProviderId}/${params.contractModelId}）未在平台模型注册表注册，不允许执行。请在「后台 → 模型注册表」注册并启用该模型。`,
    403,
  );
}

/**
 * ================= 平台默认模型部署（DB 唯一裁决，管理员可配置） =================
 *
 * 约束：
 *  - 存储于 system_config（管理员后台可写），绝不硬编码；
 *  - 绝不读取环境变量作为兜底；
 *  - 绝不通过 findFirst(orderBy: createdAt) 等「按创建时间挑一个」的方式选择模型。
 */

/** 平台默认部署在 system_config 中的键名 */
export const PLATFORM_DEFAULT_DEPLOYMENT_KEY = "PLATFORM_DEFAULT_DEPLOYMENT_ID";
import { withModelRegistryLock } from "@/lib/model-registry-lock";

/** 读取平台默认部署 ID（未配置返回 null） */
export async function getPlatformDefaultDeploymentId(): Promise<string | null> {
  const row = await prisma.systemconfig.findUnique({ where: { key: PLATFORM_DEFAULT_DEPLOYMENT_KEY } });
  const v = typeof row?.value === "string" ? row.value.trim() : "";
  return v ? v : null;
}

/**
 * 设置 / 清除平台默认部署（由管理员接口调用；null 或空串表示清除）。
 * 写入前强制校验目标部署真实存在，避免产生悬挂默认配置。
 */
export async function setPlatformDefaultDeploymentId(deploymentId: string | null): Promise<void> {
  const id = typeof deploymentId === "string" ? deploymentId.trim() : "";
  // 与「删除部署 / 删除供应商」共用同一把模型注册表命名锁：
  // 保证「校验目标存在 -> 写入配置」与「校验无引用 -> 删除部署」互斥，
  // 从而在任意交错下都不会产生「平台默认指向已删除部署」的悬挂配置。
  await withModelRegistryLock(async (tx) => {
    if (!id) {
      await tx.systemconfig.deleteMany({ where: { key: PLATFORM_DEFAULT_DEPLOYMENT_KEY } });
      return;
    }
    const dep = await tx.modeldeployment.findUnique({ where: { id } });
    if (!dep) {
      throw new ContractValidationError(
        "MODEL_NOT_ALLOWED",
        `指定的平台默认模型部署 [${id}] 不存在，无法配置。`,
        400,
      );
    }
    // 只允许把「启用中的部署 + 启用中的供应商」设为平台默认，避免默认指向不可用模型
    const depProvider = await tx.modelprovider.findUnique({
      where: { name: dep.providerId },
      select: { enabled: true },
    });
    if (!dep.enabled) {
      throw new ContractValidationError(
        "MODEL_NOT_ALLOWED",
        `模型部署 [${dep.providerId}/${dep.modelId}] 已停用，不能设为平台默认模型。`,
        400,
      );
    }
    if (!depProvider?.enabled) {
      throw new ContractValidationError(
        "MODEL_NOT_ALLOWED",
        `模型部署所属供应商 [${dep.providerId}] 已停用，不能设为平台默认模型。`,
        400,
      );
    }
    await tx.systemconfig.upsert({
      where: { key: PLATFORM_DEFAULT_DEPLOYMENT_KEY },
      create: { key: PLATFORM_DEFAULT_DEPLOYMENT_KEY, value: dep.id },
      update: { value: dep.id },
    });
  });
}

export type DefaultDeploymentSource = "SPACE_DEFAULT" | "PLATFORM_DEFAULT" | "WORKSPACE_BYO";

export interface DefaultDeploymentPlan extends ResolvedModelPlan {
  /** 本次裁决实际采用的默认来源 */
  defaultSource: DefaultDeploymentSource;
}

/**
 * 默认执行模型的唯一裁决入口：
 *   1. 当前空间 workspace_model_policy.defaultDeploymentId **优先**；
 *   2. 未配置空间默认时，读取 system_config 中的显式平台默认部署；
 *   3. 均无有效默认部署 → MODEL_NOT_ALLOWED（不猜测、不兜底环境变量、不按创建时间挑选）。
 *
 * 所有候选统一校验：部署存在、部署启用、供应商启用、空间白名单、协议与端点完备。
 */
export async function resolveDefaultDeployment(params: {
  workspaceId: string;
  /** 合同声明的抽象能力要求（如 TEXT_GENERATION / VISION / STRUCTURED_OUTPUT / LONG_CONTEXT） */
  requiredCapabilities?: string[];
}): Promise<DefaultDeploymentPlan> {
  // 空能力集合不得通过默认模型门禁：合同必须显式声明所需能力（来自 executionPlan.steps[].requiredCapabilities），
  // 否则在门禁入口即拒绝执行，稳定错误码 MODEL_CAPABILITY_NOT_DECLARED；不参与后续部署解析（失败前置）。
  const requiredCaps = Array.isArray(params.requiredCapabilities)
    ? Array.from(
        new Set(
          params.requiredCapabilities
            .filter((c) => typeof c === "string" && c.trim().length > 0)
            .map((c) => c.trim().toUpperCase()),
        ),
      )
    : [];
  if (requiredCaps.length === 0) {
    throw new ContractValidationError(
      "MODEL_CAPABILITY_NOT_DECLARED",
      "合同未声明任何模型能力要求（requiredCapabilities 为空或非法），默认模型门禁拒绝执行；能力提取必须来自 executionPlan.steps[].requiredCapabilities，不得为空。",
      403,
    );
  }

  // 0. 空间自带模型（BYO）优先：用户已登记且满足合同能力/上下文要求时，覆盖系统默认模型
  const byoPlan = await tryResolveWorkspaceByoDefault(params.workspaceId, requiredCaps);
  if (byoPlan) {
    return { ...byoPlan, defaultSource: "WORKSPACE_BYO" };
  }

  const policy = await loadSpaceModelPolicy(params.workspaceId);
  const allowedList = policy.configured ? policy.allowedDeploymentIds : null;

  const spaceDefaultId = policy.defaultDeploymentId;
  // 空间默认优先：仅当空间未配置默认时才读取平台默认
  const platformDefaultId = spaceDefaultId ? null : await getPlatformDefaultDeploymentId();

  const chosenId = spaceDefaultId || platformDefaultId;
  if (!chosenId) {
    throw new ContractValidationError(
      "MODEL_NOT_ALLOWED",
      "当前空间未配置默认模型，且平台未配置显式默认模型部署，无法裁决执行模型。请联系管理员在空间模型策略或后台模型管理中配置默认模型。",
      403,
    );
  }

  const dep = await prisma.modeldeployment.findUnique({ where: { id: chosenId } });
  if (!dep) {
    throw new ContractValidationError(
      "MODEL_NOT_ALLOWED",
      spaceDefaultId
        ? "当前空间配置的默认模型部署不存在（可能已被删除），请联系管理员重新配置空间模型策略。"
        : "平台配置的默认模型部署不存在（可能已被删除），请联系管理员重新配置平台默认模型。",
      403,
    );
  }

  const providerRow = await prisma.modelprovider.findUnique({ where: { name: dep.providerId } });
  if (!providerRow) {
    throw new ContractValidationError(
      "MODEL_NOT_ALLOWED",
      `默认模型（${dep.providerId}/${dep.modelId}）所属供应商未在注册表中登记，不允许执行。`,
      403,
    );
  }
  if (!dep.enabled) {
    throw new ContractValidationError(
      "MODEL_NOT_ALLOWED",
      `默认模型（${dep.providerId}/${dep.modelId}）已被平台禁用，不允许执行。`,
      403,
    );
  }
  if (!providerRow.enabled) {
    throw new ContractValidationError(
      "MODEL_NOT_ALLOWED",
      `默认模型供应商（${dep.providerId}）已被平台禁用，不允许执行。`,
      403,
    );
  }
  if (allowedList && allowedList.length > 0 && !allowedList.includes(dep.id)) {
    throw new ContractValidationError(
      "MODEL_NOT_ALLOWED",
      `默认模型（${dep.providerId}/${dep.modelId}）不在当前空间允许的模型白名单内。`,
      403,
    );
  }

  const protocol = (providerRow.protocol || "").trim();
  const baseUrl = (providerRow.baseUrl || "").trim();
  if (!protocol) {
    throw new ContractValidationError(
      "MODEL_NOT_ALLOWED",
      `默认模型供应商（${dep.providerId}）未配置访问协议，不允许执行。`,
      403,
    );
  }
  if (!baseUrl) {
    throw new ContractValidationError(
      "MODEL_NOT_ALLOWED",
      `默认模型供应商（${dep.providerId}）未配置访问端点，不允许执行。`,
      403,
    );
  }

  // 能力逐项校验：以数据库驱动的能力声明为准，**绝不以 contextLimit 代替能力表达**。
  const declared = Array.isArray(dep.capabilities)
    ? (dep.capabilities as unknown as string[]).map((c) => String(c).toUpperCase())
    : [];
  const missingCaps = requiredCaps.filter((c) => !declared.includes(c));
  if (missingCaps.length > 0) {
    throw new ContractValidationError(
      "MODEL_CAPABILITY_NOT_SUPPORTED",
      `默认模型（${dep.providerId}/${dep.modelId}）缺少合同要求的能力：${missingCaps.join("、")}，不允许执行。`,
      403,
    );
  }

  return {
    ...buildDatabasePlan(dep, providerRow),
    pricing: await resolveActivePricingAt(dep.id),
    defaultSource: spaceDefaultId ? "SPACE_DEFAULT" : "PLATFORM_DEFAULT",
  };
}

/**
 * 获取当前平台默认部署的可用能力集合（全大写）。
 * 若未配置平台默认、部署被禁用或供应商被禁用，则返回 usable: false 与空能力数组。
 */
export async function getPlatformDefaultDeploymentCapabilities(): Promise<{
  deploymentId: string | null;
  usable: boolean;
  capabilities: string[];
}> {
  const pdId = await getPlatformDefaultDeploymentId();
  if (!pdId) {
    return { deploymentId: null, usable: false, capabilities: [] };
  }
  const dep = await prisma.modeldeployment.findUnique({
    where: { id: pdId },
    select: {
      id: true,
      enabled: true,
      capabilities: true,
      provider: { select: { enabled: true } },
    },
  });
  if (!dep || !dep.enabled || !dep.provider?.enabled) {
    return { deploymentId: pdId, usable: false, capabilities: [] };
  }
  const capabilities = Array.isArray(dep.capabilities)
    ? (dep.capabilities as unknown as string[]).map((c) => String(c).trim().toUpperCase())
    : [];
  return { deploymentId: dep.id, usable: true, capabilities };
}

/**
 * 根据平台默认部署计算合同所需能力的缺失项（与 resolveDefaultDeployment 判定口径 100% 一致）。
 */
export function calculateMissingCapabilities(
  requiredCapabilities: string[],
  availableCapabilities: string[],
  isDeploymentUsable: boolean,
): string[] {
  const required = Array.from(
    new Set(
      requiredCapabilities
        .filter((c) => typeof c === "string" && c.trim().length > 0)
        .map((c) => c.trim().toUpperCase()),
    ),
  );
  if (!isDeploymentUsable) {
    return required.length > 0 ? required : ["PLATFORM_DEFAULT_DEPLOYMENT_NOT_AVAILABLE"];
  }
  // 部署可用但合同未声明任何能力：空能力集合不得被判定为已满足，
  // 必须生成明确阻断原因（不得按组件 ID 补能力）。
  if (required.length === 0) {
    return ["CONTRACT_CAPABILITY_NOT_DECLARED"];
  }
  return required.filter((c) => !availableCapabilities.includes(c));
}

