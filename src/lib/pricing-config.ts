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
    // 防御式访问：表未迁移或 Client 未重新生成时为 undefined
    const model = (prisma as any).systemsetting;
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
  const model = (prisma as any).systemsetting;
  if (!model?.upsert) {
    throw new Error("系统配置表尚未迁移，无法保存。请先执行数据库迁移。");
  }
  await model.upsert({
    where: { key: PRICING_CONFIG_KEY },
    create: {
      key: PRICING_CONFIG_KEY,
      value: JSON.stringify(clean),
      description: "AI 厂商价格表与加价系数（算力点折算）",
    },
    update: { value: JSON.stringify(clean) },
  });
  cache = { data: clean, at: Date.now() };
  return clean;
}

/** 是否启用了数据库配置（false = 正在使用内置默认值） */
export async function isPricingConfigPersisted(): Promise<boolean> {
  try {
    const model = (prisma as any).systemsetting;
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
