/**
 * 通用模型价格导入器（任意模型 / 任意规则）
 *
 * 设计目标：让「任何模型、任何定价规则」都能一键录入系统，不受字段写死限制。
 *  - 供应商（modelprovider）缺失时自动创建；
 *  - 模型部署（modeldeployment）缺失时自动创建，已存在则保留既有 enabled/价格不覆盖；
 *  - 价格唯一真源 modelpricing：成本/售价（输入/输出/缓存读/缓存写）按「元/百万」录入，自动转微元；
 *  - 任意厂商特殊规则（多币种参考价、订阅积分抵扣系数、缓存存储标记等）写入 modelpricing.rules（JSON 容器）；
 *  - 时段价（峰谷/节假日）可经 periods 录入，复用 modelpricingperiod。
 *
 * 用法：
 *   npx tsx scripts/import-model-pricing.ts --file scripts/data/glm53-pricing.json
 *   npx tsx scripts/import-model-pricing.ts --file <路径> --dry-run   # 仅校验不写库
 *
 * JSON 规格见 scripts/data/glm53-pricing.json 示例。
 */
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import { loadCliEnv } from "./cli-env";
import {
  yuanPerMillionToMicros,
  resolvePriceStatus,
  validatePricingRules,
  type PriceSource,
} from "../src/lib/model-pricing";

loadCliEnv();

export interface ImportCostSpec {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}
export interface ImportModelSpec {
  modelId: string;
  upstreamModel?: string;
  displayName?: string;
  contextLimit?: number;
  capabilities?: string[];
  enabled?: boolean;
  currency?: string;
  priceSource?: string;
  /** 平台加价率（基点）；非空 + 已配成本 → COST_PLUS_MARKUP 推算用户售价 */
  markupRateBps?: number;
  /** 供应商成本（元/百万 Token） */
  cost?: ImportCostSpec;
  /** 用户直接售价（元/百万 Token）；与 markupRateBps 互斥 */
  price?: ImportCostSpec;
  /** 通用规则容器：多币种参考价、订阅积分抵扣系数、缓存存储标记等任意结构 */
  rules?: Record<string, unknown> | null;
  /** 时段价覆盖（峰谷/节假日），复用 modelpricingperiod */
  periods?: Array<{
    name: string;
    kind?: string;
    enabled?: boolean;
    priority?: number;
    weekdays?: string;
    startTime?: string;
    endTime?: string;
    startDate?: string;
    endDate?: string;
    cost?: ImportCostSpec;
    price?: ImportCostSpec;
    markupRateBps?: number;
  }>;
}
export interface ImportProviderSpec {
  name: string;
  displayName?: string;
  protocol?: string;
  baseUrl?: string;
  apiKeyEnv?: string;
}
export interface ImportSpec {
  provider: ImportProviderSpec;
  models: ImportModelSpec[];
}

function toMicrosOrNull(v: number | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? yuanPerMillionToMicros(v) : null;
}

export interface ImportResult {
  provider: string;
  created: string[];
  updated: string[];
  skipped: string[];
  errors: string[];
}

/**
 * 导入单个 spec（幂等、可重入）。
 * dryRun 时只做校验与存在性判断，不写库。
 */
export async function importModelPricing(spec: ImportSpec, prisma: PrismaClient, dryRun = false): Promise<ImportResult> {
  const result: ImportResult = { provider: spec.provider.name, created: [], updated: [], skipped: [], errors: [] };

  // 1) 供应商
  const providerName = spec.provider.name.trim();
  let provider = await prisma.modelprovider.findUnique({ where: { name: providerName } });
  if (!provider) {
    if (dryRun) {
      result.skipped.push(`provider:${providerName} (dry-run 未创建)`);
    } else {
      provider = await prisma.modelprovider.create({
        data: {
          id: randomUUID(),
          name: providerName,
          protocol: spec.provider.protocol?.trim() || "OPENAI_COMPATIBLE",
          baseUrl: spec.provider.baseUrl?.trim() || "",
          apiKeyEnv: spec.provider.apiKeyEnv?.trim() || "MODEL_API_KEY",
          enabled: true,
          sortOrder: 0,
        },
      });
      result.created.push(`provider:${providerName}`);
    }
  } else if (!dryRun) {
    result.skipped.push(`provider:${providerName} (已存在，保留)`);
  }

  for (const m of spec.models) {
    const modelId = m.modelId.trim();
    try {
      const dep = await prisma.modeldeployment.findUnique({
        where: { providerId_modelId: { providerId: providerName, modelId } },
      });

      let deploymentId: string;
      if (!dep) {
        if (dryRun) {
          result.skipped.push(`${providerName}/${modelId} (dry-run 未创建部署)`);
          continue;
        }
        const created = await prisma.modeldeployment.create({
          data: {
            id: randomUUID(),
            providerId: providerName,
            modelId,
            upstreamModel: (m.upstreamModel ?? modelId).trim(),
            displayName: m.displayName?.trim() || modelId,
            contextLimit: Number.isFinite(Number(m.contextLimit)) ? Number(m.contextLimit) : 1_000_000,
            capabilities: Array.isArray(m.capabilities) ? m.capabilities : [],
            enabled: m.enabled !== false,
          },
        });
        deploymentId = created.id;
        result.created.push(`${providerName}/${modelId}`);
      } else {
        deploymentId = dep.id;
        result.skipped.push(`${providerName}/${modelId} (部署已存在，保留)`);
      }

      // 2) 价格
      const currency = (m.currency || "CNY").toUpperCase();
      const cost = {
        costInputMicrosPerMillion: toMicrosOrNull(m.cost?.input),
        costOutputMicrosPerMillion: toMicrosOrNull(m.cost?.output),
        costCacheReadMicrosPerMillion: toMicrosOrNull(m.cost?.cacheRead),
        costCacheWriteMicrosPerMillion: toMicrosOrNull(m.cost?.cacheWrite),
      };
      const price = {
        priceInputMicrosPerMillion: toMicrosOrNull(m.price?.input),
        priceOutputMicrosPerMillion: toMicrosOrNull(m.price?.output),
        priceCacheReadMicrosPerMillion: toMicrosOrNull(m.price?.cacheRead),
        priceCacheWriteMicrosPerMillion: toMicrosOrNull(m.price?.cacheWrite),
      };
      const priceSource = (m.priceSource || "VERIFIED").toUpperCase() as PriceSource;
      const priceStatus = resolvePriceStatus({
        priceSource,
        costValues: Object.values(cost),
        priceValues: Object.values(price),
      });

      // 规则校验
      const rulesCheck = validatePricingRules(m.rules ?? null);
      if (!rulesCheck.ok) {
        result.errors.push(`${providerName}/${modelId}: ${rulesCheck.error}`);
        continue;
      }
      const rules = rulesCheck.value;

      if (dryRun) {
        result.skipped.push(`${providerName}/${modelId} (dry-run 未写价格)`);
        continue;
      }

      const existing = await prisma.modelpricing.findUnique({ where: { deploymentId } });
      if (!existing) {
        await prisma.modelpricing.create({
          data: {
            id: randomUUID(),
            deploymentId,
            currency,
            ...cost,
            ...price,
            priceSource,
            priceStatus,
            priceOrigin: "PLATFORM",
            markupRateBps: typeof m.markupRateBps === "number" ? m.markupRateBps : null,
            priceVersion: 1,
            effectiveFrom: new Date(),
            rules: rules as object | undefined,
          },
        });
        result.created.push(`price:${providerName}/${modelId}`);
      } else {
        await prisma.modelpricing.update({
          where: { deploymentId },
          data: {
            currency,
            ...cost,
            ...price,
            priceSource,
            priceStatus,
            markupRateBps: m.markupRateBps === undefined ? existing.markupRateBps : typeof m.markupRateBps === "number" ? m.markupRateBps : null,
            priceVersion: (existing.priceVersion ?? 0) + 1,
            effectiveFrom: new Date(),
            rules: rules as object | undefined,
          },
        });
        result.updated.push(`price:${providerName}/${modelId}`);
      }

      // 3) 时段价（可选）
      if (Array.isArray(m.periods) && !dryRun) {
        for (const p of m.periods) {
          await prisma.modelpricingperiod.upsert({
            where: { id: `${deploymentId}:${p.name}` } as never,
            create: {
              id: `${deploymentId}:${p.name}`,
              deploymentId,
              name: p.name,
              kind: p.kind || "CUSTOM",
              enabled: p.enabled !== false,
              priority: p.priority ?? 0,
              weekdays: p.weekdays ?? null,
              startTime: p.startTime ?? null,
              endTime: p.endTime ?? null,
              startDate: p.startDate ? new Date(p.startDate) : null,
              endDate: p.endDate ? new Date(p.endDate) : null,
              costInputMicrosPerMillion: toMicrosOrNull(p.cost?.input),
              costOutputMicrosPerMillion: toMicrosOrNull(p.cost?.output),
              costCacheReadMicrosPerMillion: toMicrosOrNull(p.cost?.cacheRead),
              costCacheWriteMicrosPerMillion: toMicrosOrNull(p.cost?.cacheWrite),
              priceInputMicrosPerMillion: toMicrosOrNull(p.price?.input),
              priceOutputMicrosPerMillion: toMicrosOrNull(p.price?.output),
              priceCacheReadMicrosPerMillion: toMicrosOrNull(p.price?.cacheRead),
              priceCacheWriteMicrosPerMillion: toMicrosOrNull(p.price?.cacheWrite),
              markupRateBps: typeof p.markupRateBps === "number" ? p.markupRateBps : null,
              priceSource,
              priceStatus: "VERIFIED",
            } as never,
            update: {
              kind: p.kind || "CUSTOM",
              enabled: p.enabled !== false,
              priority: p.priority ?? 0,
              weekdays: p.weekdays ?? null,
              startTime: p.startTime ?? null,
              endTime: p.endTime ?? null,
              startDate: p.startDate ? new Date(p.startDate) : null,
              endDate: p.endDate ? new Date(p.endDate) : null,
              costInputMicrosPerMillion: toMicrosOrNull(p.cost?.input),
              costOutputMicrosPerMillion: toMicrosOrNull(p.cost?.output),
              costCacheReadMicrosPerMillion: toMicrosOrNull(p.cost?.cacheRead),
              costCacheWriteMicrosPerMillion: toMicrosOrNull(p.cost?.cacheWrite),
              priceInputMicrosPerMillion: toMicrosOrNull(p.price?.input),
              priceOutputMicrosPerMillion: toMicrosOrNull(p.price?.output),
              priceCacheReadMicrosPerMillion: toMicrosOrNull(p.price?.cacheRead),
              priceCacheWriteMicrosPerMillion: toMicrosOrNull(p.price?.cacheWrite),
              markupRateBps: typeof p.markupRateBps === "number" ? p.markupRateBps : null,
              priceStatus: "VERIFIED",
            } as never,
          });
        }
        result.created.push(`periods:${providerName}/${modelId} (${m.periods.length})`);
      }
    } catch (e) {
      result.errors.push(`${providerName}/${modelId}: ${(e as Error)?.message}`);
    }
  }

  return result;
}

function parseArgs(argv: string[]): { file?: string; dryRun: boolean } {
  let file: string | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--file" && i + 1 < argv.length) file = argv[++i];
    else if (a.startsWith("--file=")) file = a.split("=")[1];
    else if (a === "--dry-run") dryRun = true;
  }
  return { file, dryRun };
}

async function main() {
  const { file, dryRun } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error("用法: npx tsx scripts/import-model-pricing.ts --file <json 路径> [--dry-run]");
    process.exit(1);
  }
  const fs = await import("fs");
  if (!fs.existsSync(file)) {
    console.error(`文件不存在: ${file}`);
    process.exit(1);
  }
  const spec = JSON.parse(fs.readFileSync(file, "utf8")) as ImportSpec;
  const prisma = new PrismaClient();
  try {
    const res = await importModelPricing(spec, prisma, dryRun);
    console.log(`[import] provider=${res.provider} dryRun=${dryRun}`);
    console.log(`[import] 创建: ${res.created.join(", ") || "(无)"}`);
    console.log(`[import] 更新: ${res.updated.join(", ") || "(无)"}`);
    console.log(`[import] 跳过: ${res.skipped.join(", ") || "(无)"}`);
    if (res.errors.length) {
      console.error(`[import] 错误: ${res.errors.join("; ")}`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("import-model-pricing.ts") || process.argv[1].endsWith("import-model-pricing.js")) &&
  !process.argv[1].includes(".test.");

if (isDirectRun) {
  main().catch((e) => {
    console.error("[import] 失败:", (e as Error)?.message);
    process.exitCode = 1;
  });
}
