/**
 * 写入模型供应商成本（用户提供的真实价目）。
 *
 * 安全规范更新：
 *  - 严禁隐式写入默认价格！必须显式传入输入价格和输出价格参数；
 *  - 未显式提供时抛出 PRICE_INPUT_OUTPUT_REQUIRED 并硬失败，拒绝写库；
 *  - 只写入供应商成本（costInput/costOutput），不写用户售价；
 *  - 每次显式写入后 priceVersion 递增。
 *
 * 用法示例：
 *   npx tsx scripts/set-model-pricing.ts --input 5 --output 30
 *   PRICE_INPUT_YUAN_PER_MILLION=5 PRICE_OUTPUT_YUAN_PER_MILLION=30 npx tsx scripts/set-model-pricing.ts
 */
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import {
  yuanPerMillionToMicros,
  buildRegistryPricingSnapshot,
  computeUsageCost,
  type DeploymentPricing,
} from "../src/lib/model-pricing";
import { loadCliEnv } from "./cli-env";

loadCliEnv();

export class ModelPricingError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ModelPricingError";
    this.code = code;
  }
}

export interface SetModelPricingOptions {
  provider?: string;
  model?: string;
  currency?: string;
  inputYuan?: number;
  outputYuan?: number;
  prismaClient?: PrismaClient;
}

export function parsePricingArgs(argv: string[]): {
  inputYuan?: number;
  outputYuan?: number;
  provider?: string;
  model?: string;
  currency?: string;
} {
  let inputYuan: number | undefined;
  let outputYuan: number | undefined;
  let provider: string | undefined;
  let model: string | undefined;
  let currency: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--input" && i + 1 < argv.length) {
      inputYuan = Number(argv[++i]);
    } else if (arg.startsWith("--input=")) {
      inputYuan = Number(arg.split("=")[1]);
    } else if (arg === "--output" && i + 1 < argv.length) {
      outputYuan = Number(argv[++i]);
    } else if (arg.startsWith("--output=")) {
      outputYuan = Number(arg.split("=")[1]);
    } else if (arg === "--provider" && i + 1 < argv.length) {
      provider = argv[++i];
    } else if (arg.startsWith("--provider=")) {
      provider = arg.split("=")[1];
    } else if (arg === "--model" && i + 1 < argv.length) {
      model = argv[++i];
    } else if (arg.startsWith("--model=")) {
      model = arg.split("=")[1];
    } else if (arg === "--currency" && i + 1 < argv.length) {
      currency = argv[++i];
    } else if (arg.startsWith("--currency=")) {
      currency = arg.split("=")[1];
    }
  }

  // 若命令行参数未提供，尝试从环境变量读取
  if (inputYuan === undefined && process.env.PRICE_INPUT_YUAN_PER_MILLION !== undefined) {
    inputYuan = Number(process.env.PRICE_INPUT_YUAN_PER_MILLION);
  }
  if (outputYuan === undefined && process.env.PRICE_OUTPUT_YUAN_PER_MILLION !== undefined) {
    outputYuan = Number(process.env.PRICE_OUTPUT_YUAN_PER_MILLION);
  }
  if (!provider && process.env.PRICE_PROVIDER_NAME) {
    provider = process.env.PRICE_PROVIDER_NAME;
  }
  if (!model && process.env.PRICE_MODEL_ID) {
    model = process.env.PRICE_MODEL_ID;
  }
  if (!currency && process.env.PRICE_CURRENCY) {
    currency = process.env.PRICE_CURRENCY;
  }

  return { inputYuan, outputYuan, provider, model, currency };
}

export async function setModelPricing(options: SetModelPricingOptions) {
  const prisma = options.prismaClient || new PrismaClient();
  const shouldDisconnect = !options.prismaClient;

  try {
    const provider = options.provider || "MagicAI";
    const model = options.model || "gpt-5.5";
    const currency = (options.currency || "CNY").toUpperCase();

    if (
      options.inputYuan === undefined ||
      options.outputYuan === undefined ||
      Number.isNaN(options.inputYuan) ||
      Number.isNaN(options.outputYuan)
    ) {
      throw new ModelPricingError(
        "PRICE_INPUT_OUTPUT_REQUIRED",
        "错误 (PRICE_INPUT_OUTPUT_REQUIRED): 必须显式指定输入和输出单价，禁止隐式写入默认值！" +
          " 请使用 --input <元/百万> --output <元/百万> 或设置环境变量 PRICE_INPUT_YUAN_PER_MILLION / PRICE_OUTPUT_YUAN_PER_MILLION。"
      );
    }

    if (options.inputYuan < 0 || options.outputYuan < 0) {
      throw new ModelPricingError(
        "PRICE_VALUE_INVALID",
        `错误 (PRICE_VALUE_INVALID): 价格必须为非负数，接收到 input=${options.inputYuan}, output=${options.outputYuan}`
      );
    }

    const dep = await prisma.modeldeployment.findUnique({
      where: { providerId_modelId: { providerId: provider, modelId: model } },
    });
    if (!dep) {
      throw new ModelPricingError("DEPLOYMENT_NOT_FOUND", `未找到模型部署 ${provider}/${model}，请先初始化注册表`);
    }

    const costInputMicrosPerMillion = yuanPerMillionToMicros(options.inputYuan);
    const costOutputMicrosPerMillion = yuanPerMillionToMicros(options.outputYuan);

    const before = await prisma.modelpricing.findUnique({ where: { deploymentId: dep.id } });
    const row = before
      ? await prisma.modelpricing.update({
          where: { deploymentId: dep.id },
          data: {
            currency,
            costInputMicrosPerMillion,
            costOutputMicrosPerMillion,
            priceSource: "VERIFIED",
            priceStatus: "VERIFIED",
            priceVersion: (before.priceVersion ?? 0) + 1,
            effectiveFrom: new Date(),
          },
        })
      : await prisma.modelpricing.create({
          data: {
            id: randomUUID(),
            deploymentId: dep.id,
            currency,
            costInputMicrosPerMillion,
            costOutputMicrosPerMillion,
            priceSource: "VERIFIED",
            priceStatus: "VERIFIED",
            priceVersion: 1,
            effectiveFrom: new Date(),
          },
        });

    console.log(
      `[pricing] 已写入供应商成本：输入 ${options.inputYuan} ${currency}/百万、输出 ${options.outputYuan} ${currency}/百万（版本 v${row.priceVersion}，状态 ${row.priceStatus}）`
    );
    console.log(`[pricing] 用户售价：未配置（价格状态 ${row.priceStatus} 仅代表成本已确认；对外售价与加价需另行配置）`);
    console.log(
      "[pricing] 缓存读写价：供应商无此计价 → costCacheRead/costCacheWrite 字段保留但保持 null；用户侧 priceCache* 同样保留未配置"
    );

    const pricing: DeploymentPricing = {
      currency: row.currency,
      costInputMicrosPerMillion: row.costInputMicrosPerMillion,
      costOutputMicrosPerMillion: row.costOutputMicrosPerMillion,
      costCacheReadMicrosPerMillion: row.costCacheReadMicrosPerMillion,
      costCacheWriteMicrosPerMillion: row.costCacheWriteMicrosPerMillion,
      priceInputMicrosPerMillion: row.priceInputMicrosPerMillion,
      priceOutputMicrosPerMillion: row.priceOutputMicrosPerMillion,
      priceCacheReadMicrosPerMillion: row.priceCacheReadMicrosPerMillion,
      priceCacheWriteMicrosPerMillion: row.priceCacheWriteMicrosPerMillion,
      priceSource: "VERIFIED",
      priceStatus: "VERIFIED",
      markupRateBps: row.markupRateBps,
      priceVersion: row.priceVersion,
      effectiveFrom: row.effectiveFrom ? row.effectiveFrom.toISOString() : null,
    };

    const snapshot = buildRegistryPricingSnapshot({ providerId: provider, modelId: model, pricing });
    console.log(
      `[pricing] 快照检查：provider=${snapshot.providerId} model=${snapshot.modelId} v${snapshot.priceVersion} 来源=${snapshot.priceSource} 生效=${snapshot.effectiveFrom}`
    );
    console.log(
      `[pricing] 快照.供应商成本：输入 ${snapshot.supplierCost.inputYuanPerMillion} 元/百万、输出 ${snapshot.supplierCost.outputYuanPerMillion} 元/百万；结算模式=${snapshot.billingMode}，可结算=${snapshot.settlementEnabled}`
    );

    const sample = computeUsageCost(pricing, { inputTokens: 4799, outputTokens: 512 });
    console.log(
      `[pricing] 成本计算示例（输入 4799 / 输出 512 tokens）：供应商成本 = ${sample.costYuan} ${sample.currency}（${sample.costMicros} 微元）；用户售价 = ${
        sample.priceYuan === null ? "未配置" : sample.priceYuan
      }`
    );

    return { row, pricing, snapshot, sample };
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}

async function main() {
  const args = parsePricingArgs(process.argv.slice(2));
  await setModelPricing(args);
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("set-model-pricing.ts") || process.argv[1].endsWith("set-model-pricing.js")) &&
  !process.argv[1].includes(".test.");

if (isDirectRun) {
  main().catch((e) => {
    console.error("[pricing] 写入失败:", (e as Error)?.message);
    process.exitCode = 1;
  });
}

