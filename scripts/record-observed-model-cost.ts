/**
 * 记录「综合有效成本」观测数据（OBSERVED_BLENDED_COST）
 *
 * ⚠️ 该数据仅用于成本分析与运营报表，**不是输入/输出官方单价**，
 *    不得据此写入 modelpricing 的输入价/输出价，也不得据此开启真实 Token 结算。
 *
 * 用法：npx tsx scripts/record-observed-model-cost.ts
 */
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 观测数据（来自供应商账单截图） */
const OBSERVED = {
  providerId: "MagicAI",
  modelId: "gpt-5.5",
  totalTokens: 265_900_000,
  inputTokens: 53_200_000,
  outputTokens: 1_400_000,
  cacheTokens: 211_300_000,
  nonCacheTokens: 54_600_000,
  requestCount: 2158,
  totalCostMicrosUsd: 66_401_900, // $66.4019
  effectiveCostPerMillionMicrosUsd: 249_725, // $0.249725 / 1M（含缓存）
  nonCacheCostPerMillionMicrosUsd: 1_216_152, // $1.216152 / 1M（不含缓存）
};

async function main() {
  const existing = await prisma.modelcostobservation.findFirst({
    where: {
      providerId: OBSERVED.providerId,
      modelId: OBSERVED.modelId,
      metric: "OBSERVED_BLENDED_COST",
      totalTokens: OBSERVED.totalTokens,
    },
  });
  if (existing) {
    console.log(`[observed] 已存在相同观测记录，跳过：id=${existing.id}`);
    return;
  }
  const row = await prisma.modelcostobservation.create({
    data: {
      id: randomUUID(),
      ...OBSERVED,
      metric: "OBSERVED_BLENDED_COST",
      currency: "USD",
      note:
        "来源：供应商账单截图。仅用于成本分析/运营报表；不得作为输入或输出官方单价，" +
        "也不得用于真实 Token 结算（综合成本已包含缓存与输入输出混合口径）。",
    },
  });
  console.log(
    `[observed] 已记录观测数据：id=${row.id} 综合=${(OBSERVED.effectiveCostPerMillionMicrosUsd / 1e6).toFixed(6)} 美元/百万（含缓存），不含缓存=${(
      OBSERVED.nonCacheCostPerMillionMicrosUsd / 1e6
    ).toFixed(6)} 美元/百万`,
  );
  console.log("[observed] 注意：modelpricing 的输入/输出价未被修改（保持未配置/已观测状态）。");
}

main()
  .catch((e) => {
    console.error("[observed] 记录失败:", (e as Error)?.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
