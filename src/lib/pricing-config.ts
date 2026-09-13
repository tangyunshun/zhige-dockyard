import { prisma } from "@/lib/prisma";
import {
  AI_PROVIDERS,
  ZHIGE_ENGINE,
  DEFAULT_MARKUP,
  MIN_MARKUP,
  TYPICAL_CALL_INPUT_TOKENS,
  TYPICAL_CALL_OUTPUT_TOKENS,
  pointsPerToken,
  estimatePointsPerTypicalCall,
  type AiProvider,
} from "@/lib/model-rate";

/**
 * AI 计价配置的运行时数据源
 *
 * 优先级：数据库 systemsetting(key = "ai_pricing_config") ➔ 内置默认值(model-rate.ts)
 * 说明：
 *  - 表尚未迁移、或 Prisma Client 未重新生成时，本模块静默回退到内置默认值，系统照常运行；
 *  - 管理员在 /admin/ai-pricing 保存后，60 秒内自动生效（无需重启/发版）。
 */

export const PRICING_CONFIG_KEY = "ai_pricing_config";

export interface PricingConfig {
  /** 加价系数 k（1.0 = 成本价；2.5 = 60% 毛利） */
  markup: number;
  /** 厂商 × 模型价格表 */
  providers: AiProvider[];
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  markup: DEFAULT_MARKUP,
  providers: [...AI_PROVIDERS, ZHIGE_ENGINE],
};

let cache: { data: PricingConfig; at: number } | null = null;
const CACHE_TTL_MS = 60 * 1000;

/** 单价上限（元/百万 token），防止误填天文数字导致全站计费异常 */
export const MAX_PRICE_PER_MILLION = 1_000_000;
/** 加价系数上限 */
export const MAX_MARKUP = 10;
/** 模型名称最大长度 */
export const MAX_MODEL_NAME_LENGTH = 60;

export interface PricingValidationResult {
  ok: boolean;
  errors: string[];
}

/**
 * 业务校验（落库前拦截）：
 * 结构完整性 + 代号格式 + 重复检测 + 单价/系数值域，错误信息可直接展示给管理员。
 */
export function validatePricingConfig(input: any): PricingValidationResult {
  const errors: string[] = [];

  if (!input || typeof input !== "object") {
    return { ok: false, errors: ["计价配置数据格式不合法"] };
  }

  const markup = Number(input.markup);
  if (!Number.isFinite(markup)) {
    errors.push("全局加价系数必须为有效数值");
  } else if (markup < MIN_MARKUP || markup > MAX_MARKUP) {
    errors.push(`全局加价系数需在 ${MIN_MARKUP} ~ ${MAX_MARKUP} 之间`);
  }

  const providers = Array.isArray(input.providers) ? input.providers : [];
  if (providers.length === 0) {
    errors.push("至少需要保留 1 个 AI 厂商平台");
  }

  const providerIds = new Set<string>();
  providers.forEach((p: any, pi: number) => {
    const pid = String(p?.id ?? "").trim();
    const pname = String(p?.name ?? "").trim();
    const label = pname || pid || `第 ${pi + 1} 个厂商`;

    if (!pid) {
      errors.push(`${label}：厂商代号不能为空`);
    } else if (!/^[a-z0-9][a-z0-9_-]*$/i.test(pid)) {
      errors.push(`${label}：厂商代号仅允许字母、数字、- 与 _，且需以字母或数字开头`);
    } else if (providerIds.has(pid.toLowerCase())) {
      errors.push(`${label}：厂商代号「${pid}」重复`);
    } else {
      providerIds.add(pid.toLowerCase());
    }

    if (!Array.isArray(p?.models) || p.models.length === 0) {
      errors.push(`${label}：至少需要保留 1 个 AI 模型`);
      return;
    }

    const modelIds = new Set<string>();
    p.models.forEach((m: any, mi: number) => {
      const mid = String(m?.id ?? "").trim();
      const mname = String(m?.name ?? "").trim();
      const mlabel = mid || `第 ${mi + 1} 个模型`;

      if (!mid) {
        errors.push(`${label}：存在模型代号为空的行`);
      } else if (!/^[a-z0-9][a-z0-9_.:-]*$/i.test(mid)) {
        errors.push(`${label} / ${mid}：模型代号仅允许字母、数字与 - _ . :，且需以字母或数字开头`);
      } else if (modelIds.has(mid.toLowerCase())) {
        errors.push(`${label} / ${mid}：同一厂商下模型代号重复`);
      } else {
        modelIds.add(mid.toLowerCase());
      }

      if (!mname) {
        errors.push(`${label} / ${mlabel}：模型名称不能为空`);
      } else if (mname.length > MAX_MODEL_NAME_LENGTH) {
        errors.push(`${label} / ${mlabel}：模型名称不能超过 ${MAX_MODEL_NAME_LENGTH} 个字符`);
      }

      const priceChecks: Array<["inputPricePerMillion" | "outputPricePerMillion", string]> = [
        ["inputPricePerMillion", "输入单价"],
        ["outputPricePerMillion", "输出单价"],
      ];
      priceChecks.forEach(([key, cn]) => {
        const v = Number(m?.[key]);
        if (!Number.isFinite(v) || v < 0) {
          errors.push(`${label} / ${mlabel}：${cn}必须为 ≥ 0 的有效数值`);
        } else if (v > MAX_PRICE_PER_MILLION) {
          errors.push(
            `${label} / ${mlabel}：${cn}超出上限（≤ ${MAX_PRICE_PER_MILLION.toLocaleString()} 元/百万 Token）`
          );
        }
      });
    });
  });

  // 限制返回条数，避免错误提示刷屏
  return { ok: errors.length === 0, errors: errors.slice(0, 20) };
}

/** 结构校验与清洗，避免脏数据导致计费异常 */
function normalize(raw: any): PricingConfig {
  if (!raw || typeof raw !== "object") return DEFAULT_PRICING_CONFIG;
  const markup = Number(raw.markup);
  const safeMarkup =
    Number.isFinite(markup) && markup >= MIN_MARKUP ? markup : DEFAULT_MARKUP;

  const rawProviders = Array.isArray(raw.providers) ? raw.providers : [];
  const providers: AiProvider[] = rawProviders
    .map((p: any): AiProvider => ({
      id: String(p?.id || ""),
      name: String(p?.name || p?.id || ""),
      markup: Number.isFinite(Number(p?.markup)) ? Number(p.markup) : undefined,
      models: Array.isArray(p?.models)
        ? p.models.map((m: any) => ({
            id: String(m?.id || ""),
            name: String(m?.name || m?.id || ""),
            inputPricePerMillion: Number(m?.inputPricePerMillion) || 0,
            outputPricePerMillion: Number(m?.outputPricePerMillion) || 0,
            note: m?.note ? String(m.note) : undefined,
          }))
        : [],
    }))
    .filter((p: AiProvider) => p.id && p.models.length > 0);

  if (providers.length === 0) return { ...DEFAULT_PRICING_CONFIG, markup: safeMarkup };
  return { markup: safeMarkup, providers };
}

/** 读取配置（带 60 秒缓存；异常时回退默认值） */
export async function loadPricingConfig(force: boolean = false): Promise<PricingConfig> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;

  try {
    // 访问系统配置表（systemconfig）
    const model = (prisma as any).systemconfig;
    if (model?.findUnique) {
      const row = await model.findUnique({ where: { key: PRICING_CONFIG_KEY } });
      if (row?.value) {
        const cfg = normalize(JSON.parse(row.value));
        cache = { data: cfg, at: Date.now() };
        return cfg;
      }
    }
  } catch (error) {
    // 表不存在 / 未迁移 / 解析失败 → 一律使用内置默认值
    console.warn("[pricing-config] 读取数据库配置失败，回退内置默认值:", (error as Error)?.message);
  }

  cache = { data: DEFAULT_PRICING_CONFIG, at: Date.now() };
  return DEFAULT_PRICING_CONFIG;
}

/** 保存配置（管理员后台调用） */
export async function savePricingConfig(config: PricingConfig): Promise<PricingConfig> {
  const clean = normalize(config);
  const model = (prisma as any).systemconfig;
  if (!model?.upsert) {
    throw new Error("系统配置表尚未就绪，无法保存配置。");
  }
  await model.upsert({
    where: { key: PRICING_CONFIG_KEY },
    create: {
      key: PRICING_CONFIG_KEY,
      value: JSON.stringify(clean),
    },
    update: { value: JSON.stringify(clean) },
  });
  cache = { data: clean, at: Date.now() };
  return clean;
}

/** 是否启用了数据库配置（false = 正在使用内置默认值） */
export async function isPricingConfigPersisted(): Promise<boolean> {
  try {
    const model = (prisma as any).systemconfig;
    if (!model?.findUnique) return false;
    const row = await model.findUnique({ where: { key: PRICING_CONFIG_KEY } });
    return !!row?.value;
  } catch {
    return false;
  }
}

/** 依据运行时配置计算一次典型调用应扣的算力点 */
export async function estimateTypicalCallPoints(
  providerId: string,
  modelId?: string
): Promise<number> {
  const cfg = await loadPricingConfig();
  const provider = cfg.providers.find((p) => p.id === providerId);
  const price = provider?.models.find((m) => m.id === modelId) || provider?.models[0];
  if (!price) return estimatePointsPerTypicalCall(providerId, modelId, cfg.markup);

  const k = provider?.markup ?? cfg.markup;
  const total =
    TYPICAL_CALL_INPUT_TOKENS * pointsPerToken(price.inputPricePerMillion, k) +
    TYPICAL_CALL_OUTPUT_TOKENS * pointsPerToken(price.outputPricePerMillion, k);
  return total <= 0 ? 0 : Math.max(1, Math.ceil(total));
}

export { TYPICAL_CALL_INPUT_TOKENS, TYPICAL_CALL_OUTPUT_TOKENS };
