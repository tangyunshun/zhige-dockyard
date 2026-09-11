/**
 * 模型 Token ⇄ 算力点「厂商折算引擎」（全系统唯一数据源）
 *
 * ────────────────────────────────────────────────────────────────
 * 一、统一口径（与 @/lib/point-rate 保持一致，禁止另行硬编码）
 *   1. 「算力点」是全系统唯一的【计费货币】：1 算力点 = 0.01 元，100 算力点 = 1 元。
 *   2. 「模型 Token」是 AI 真实的输入/输出用量单位；本平台统一说明为：
 *      **1 个模型 token = 1 个算力点（1:1 计量口径）**，用户无需理解两套单位。
 *   3. 但「计量」与「计价」是两件事：
 *      - 计量：用户消耗多少 token，就记多少算力点（1:1）；
 *      - 计价：这些算力点【成本】取决于所用厂商的官方单价，按下面的公式折算。
 *
 * 二、折算公式
 *    官方单价 P（元 / 百万 token）→ 每个 token 的成本 = P / 1e6 元
 *    换算成算力点（1 点 = 0.01 元）→ 成本中性点数 = P / 1e4
 *    叠加加价系数 k 后：
 *        pointsPerToken = P / 10_000 × k
 *        毛利率 = 1 − 1 / k     （k = 2.5 → 毛利率 60%）
 *    反推：tokens = points ÷ pointsPerToken
 *
 *    推导示例（DeepSeek-V3 输出价 ¥8/百万）：
 *      k = 1.0（成本价）→ 0.0008 点/token → 1 算力点 = 1,250 token，毛利 0%
 *      k = 2.5（推荐）  → 0.0020 点/token → 1 算力点 =   500 token，毛利 60%
 *
 * 三、为什么必须要有 k（加价系数）
 *    1 算力点 = 0.01 元恰好等于多数厂商的成本价，按成本价兑付等于 0 毛利，
 *    服务器、带宽、支付通道、风控与人工全部由平台倒贴；
 *    而会员等级又赠送大量算力点（如皇冠 ¥999 / 20 万点），全额用掉必然亏损。
 *    因此售价保持 0.01 元/点不变（用户心智简单：100 点 = 1 元），
 *    通过 k 把毛利做出来；高等级会员可享受更低的 k（相当于算力打折）。
 *
 * 四、接入新厂商
 *    在 AI_PROVIDERS 中新增一条即可，UI 与计费自动生效；价格变动只改数据，无需发版。
 *    ⚠ 下表价格为公开参考价（人民币 / 百万 token，美元按 7.2 折算），
 *      上线前必须按各厂商官网最新价核对；生产环境建议改为后台可配置。
 */

import { YUAN_PER_POINT } from "@/lib/point-rate";

/** 默认加价系数：2.5 → 毛利率 60% */
export const DEFAULT_MARKUP = 2.5;

/** 加价系数下限：不允许低于成本价（1.0 = 成本价） */
export const MIN_MARKUP = 1.0;

/** 计量口径提示（用户可见）：token 与本平台唯一单位的关系 */
export const UNIT_EXPLAIN_HINT =
  "本平台全系统只使用「算力点」作为计量与计费单位：1 个模型 token = 1 个算力点，100 算力点 = 1 元。";

export interface ModelPrice {
  /** 模型标识（与接口/配置中的模型名一致） */
  id: string;
  /** 展示名 */
  name: string;
  /** 输入价：元 / 百万 token */
  inputPricePerMillion: number;
  /** 输出价：元 / 百万 token */
  outputPricePerMillion: number;
  /** 备注（如是否免费、是否推理模型） */
  note?: string;
}

export interface AiProvider {
  id: string;
  name: string;
  /** 厂商级默认加价系数（可被调用方覆盖） */
  markup?: number;
  models: ModelPrice[];
}

/** 厂商 × 模型 价格表（人民币 / 百万 token） */
export const AI_PROVIDERS: AiProvider[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    models: [
      {
        id: "deepseek-chat",
        name: "DeepSeek-V3",
        inputPricePerMillion: 2,
        outputPricePerMillion: 8,
      },
      {
        id: "deepseek-reasoner",
        name: "DeepSeek-R1（推理）",
        inputPricePerMillion: 4,
        outputPricePerMillion: 16,
      },
    ],
  },
  {
    id: "zhipu",
    name: "智谱 AI",
    models: [
      {
        id: "glm-4-plus",
        name: "GLM-4-Plus",
        inputPricePerMillion: 50,
        outputPricePerMillion: 50,
      },
      {
        id: "glm-4-air",
        name: "GLM-4-Air",
        inputPricePerMillion: 0.5,
        outputPricePerMillion: 0.5,
      },
      {
        id: "glm-4-flash",
        name: "GLM-4-Flash",
        inputPricePerMillion: 0,
        outputPricePerMillion: 0,
        note: "免费模型，不扣减算力点",
      },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    models: [
      {
        id: "gpt-4o",
        name: "GPT-4o",
        inputPricePerMillion: 18,
        outputPricePerMillion: 72,
      },
      {
        id: "gpt-4o-mini",
        name: "GPT-4o mini",
        inputPricePerMillion: 1.1,
        outputPricePerMillion: 4.3,
      },
    ],
  },
  {
    id: "dashscope",
    name: "阿里通义千问",
    models: [
      {
        id: "qwen-plus",
        name: "Qwen-Plus",
        inputPricePerMillion: 0.8,
        outputPricePerMillion: 2,
      },
      {
        id: "qwen-max",
        name: "Qwen-Max",
        inputPricePerMillion: 20,
        outputPricePerMillion: 60,
      },
    ],
  },
  {
    id: "moonshot",
    name: "月之暗面 Kimi",
    models: [
      {
        id: "moonshot-v1-8k",
        name: "Moonshot-v1-8k",
        inputPricePerMillion: 12,
        outputPricePerMillion: 12,
      },
    ],
  },
];

/** 平台自研引擎（不产生外部厂商成本，按标准加价系数计价） */
export const ZHIGE_ENGINE: AiProvider = {
  id: "zhige",
  name: "知阁自研引擎",
  models: [
    {
      id: "zhige-standard",
      name: "知阁标准引擎",
      // 自研引擎无外部 token 成本，此处给一个等效成本价用于统一计价口径
      inputPricePerMillion: 1,
      outputPricePerMillion: 4,
      note: "平台自研，无外部厂商成本，按等效价计价",
    },
  ],
};

/** 依据 id 查厂商 */
export function getProvider(providerId: string): AiProvider | undefined {
  if (providerId === ZHIGE_ENGINE.id) return ZHIGE_ENGINE;
  return AI_PROVIDERS.find((p) => p.id === providerId);
}

/** 依据 厂商+模型 查价格 */
export function getModelPrice(
  providerId: string,
  modelId?: string
): ModelPrice | undefined {
  const provider = getProvider(providerId);
  if (!provider) return undefined;
  if (!modelId) return provider.models[0];
  return provider.models.find((m) => m.id === modelId) || provider.models[0];
}

/**
 * 由图折算：官方单价（元/百万 token）➔ 每 token 折算的算力点数
 * pointsPerToken = P / 10_000 × k
 */
export function pointsPerToken(
  pricePerMillion: number,
  markup: number = DEFAULT_MARKUP
): number {
  const p = Number(pricePerMillion);
  const k = Number(markup);
  if (!Number.isFinite(p) || p <= 0) return 0;
  const safeK = Number.isFinite(k) && k > MIN_MARKUP ? k : MIN_MARKUP;
  // 1 元 = 1 / YUAN_PER_POINT 个算力点（默认 100 点），再乘以加价系数
  const pointsPerYuan = 1 / YUAN_PER_POINT;
  return (p / 1e6) * pointsPerYuan * safeK;
}

/** 加价系数 ➔ 毛利率（0~1），k=2.5 → 0.6 */
export function marginRate(markup: number = DEFAULT_MARKUP): number {
  const k = Number(markup);
  if (!Number.isFinite(k) || k <= 1) return 0;
  return 1 - 1 / k;
}

/** 目标毛利率 ➔ 所需加价系数，margin=0.6 → k=2.5 */
export function markupFromMargin(margin: number): number {
  const m = Number(margin);
  if (!Number.isFinite(m) || m <= 0) return MIN_MARKUP;
  const clamped = Math.min(m, 0.95);
  return 1 / (1 - clamped);
}

/**
 * 会员折扣 ➔ 加价系数（会员越高级，算力越接近成本价）
 * discountPercent 语义与 point-rate 的「立减百分比」一致：10 → 9 折，20 → 8 折。
 * 例：baseMarkup 2.5、discount 20 → 2.0（毛利 50%）
 */
export function markupWithMemberDiscount(
  discountPercent: number | null | undefined,
  baseMarkup: number = DEFAULT_MARKUP
): number {
  const d = Number(discountPercent);
  if (!Number.isFinite(d) || d <= 0) return baseMarkup;
  const off = Math.min(Math.max(d, 0), 60) / 100;
  return Math.max(baseMarkup * (1 - off), MIN_MARKUP);
}

export interface TokenUsageInput {
  providerId: string;
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  /** 覆盖加价系数（会员折扣、活动等场景） */
  markup?: number;
}

/**
 * Token 用量 ➔ 应扣算力点（向上取整，最小 1 点；免费模型返回 0）
 */
export function tokensToPoints({
  providerId,
  modelId,
  inputTokens = 0,
  outputTokens = 0,
  markup,
}: TokenUsageInput): number {
  const price = getModelPrice(providerId, modelId);
  if (!price) return 0;
  const k = markup ?? getProvider(providerId)?.markup ?? DEFAULT_MARKUP;
  const inCost = pointsPerToken(price.inputPricePerMillion, k) * Math.max(0, inputTokens);
  const outCost = pointsPerToken(price.outputPricePerMillion, k) * Math.max(0, outputTokens);
  const total = inCost + outCost;
  if (total <= 0) return 0;
  return Math.max(1, Math.ceil(total));
}

/**
 * 算力点 ➔ 可使用的 token 数量（按纯输入或纯输出估算，用于定价测算与展示）
 */
export function pointsToTokens(
  points: number,
  pricePerMillion: number,
  markup: number = DEFAULT_MARKUP
): number {
  const ppt = pointsPerToken(pricePerMillion, markup);
  if (ppt <= 0) return 0;
  return Math.floor(Math.max(0, Number(points)) / ppt);
}

/**
 * 一次典型调用（默认 3,000 输入 + 1,000 输出）折算的算力点，
 * 用于「按次计费」场景给每个组件标定 estimatedModelTokens。
 */
export const TYPICAL_CALL_INPUT_TOKENS = 3000;
export const TYPICAL_CALL_OUTPUT_TOKENS = 1000;

export function estimatePointsPerTypicalCall(
  providerId: string,
  modelId?: string,
  markup: number = DEFAULT_MARKUP
): number {
  return tokensToPoints({
    providerId,
    modelId,
    inputTokens: TYPICAL_CALL_INPUT_TOKENS,
    outputTokens: TYPICAL_CALL_OUTPUT_TOKENS,
    markup,
  });
}

/** 用户可见的折算说明（带具体示例，避免只讲概念） */
export function formatModelRateHint(providerId: string, modelId?: string): string {
  const price = getModelPrice(providerId, modelId);
  if (!price) return UNIT_EXPLAIN_HINT;
  const perPointIn = pointsToTokens(1, price.inputPricePerMillion);
  const perPointOut = pointsToTokens(1, price.outputPricePerMillion);
  return `1 个模型 token = 1 个算力点；按 ${price.name} 官方价（输入 ¥${price.inputPricePerMillion}/百万、输出 ¥${price.outputPricePerMillion}/百万）折算，1 算力点 ≈ ${perPointIn.toLocaleString()} 输入 token 或 ${perPointOut.toLocaleString()} 输出 token。`;
}

/** 定价测算表（后台/文档用）：各模型在给定售价下的成本与毛利 */
export interface PricingRow {
  providerId: string;
  providerName: string;
  modelId: string;
  modelName: string;
  /** 1 算力点（¥0.01）成本中性可买 token 数（输入/输出） */
  breakEvenTokensPerPoint: { input: number; output: number };
  /** 当前加价系数下 1 算力点可买 token 数（输入/输出） */
  actualTokensPerPoint: { input: number; output: number };
  margin: number;
}

export function buildPricingTable(
  markup: number = DEFAULT_MARKUP
): PricingRow[] {
  const rows: PricingRow[] = [];
  for (const provider of [...AI_PROVIDERS, ZHIGE_ENGINE]) {
    for (const model of provider.models) {
      rows.push({
        providerId: provider.id,
        providerName: provider.name,
        modelId: model.id,
        modelName: model.name,
        breakEvenTokensPerPoint: {
          input: pointsToTokens(1, model.inputPricePerMillion, MIN_MARKUP),
          output: pointsToTokens(1, model.outputPricePerMillion, MIN_MARKUP),
        },
        actualTokensPerPoint: {
          input: pointsToTokens(1, model.inputPricePerMillion, markup),
          output: pointsToTokens(1, model.outputPricePerMillion, markup),
        },
        margin: marginRate(markup),
      });
    }
  }
  return rows;
}
