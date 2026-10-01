/**
 * 【受控写库脚本 · 阶段 A BILLING-1.5-CALIBRATION-COMMIT】
 * 负责人 2026-10-01 拍板后执行。写入范围严格限定为 6 行：
 *   - systemconfig      2 行（billing_usage_calibration、billing.minPointsPerTask）
 *   - componentcatalog  3 行（仅 C01 / C02 / C07 的 estimatedModelTokens）
 *   - modelpricing      1 行（deepseek-flash 价格登记）
 * 严禁触碰 pointledger / pointgrant / componenttask / 订单等任何既有数据，不发新合同版本。
 *
 * 每次写入前后均打印取值，供逐行核对。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** 校准值：来自只读脚本 report-pricing-calibration.ts（真实历史 SUCCESS 任务 usage 均值） */
const CALIBRATION: Record<string, { in: number; out: number }> = {
  C01: { in: 1209, out: 2939 },
  C02: { in: 3282, out: 3326 },
  C07: { in: 1325, out: 1359 },
};

/** 校准总值 = in + out，写回 catalog.estimatedModelTokens（回归 Token 本义） */
const CATALOG_TOTALS: Record<string, number> = {
  C01: 4148,
  C02: 6609,
  C07: 2684,
};

const MIN_POINTS_PER_TASK = "5";

/** deepseek-flash 部署（启用中） */
const DEEPSEEK_DEPLOYMENT_ID = "78fb45bc-08e4-4658-a7cf-a22441595dc6";
/**
 * DeepSeek 官方公开报价（高峰时段 + 缓存未命中），单位：元 / 百万 Token
 * 来源：https://api-docs.deepseek.com/zh-cn/quick_start/pricing/（抓取时间 2026-10-01）
 *   deepseek-flash（DeepSeek-V4.1-Flash）：输入 2 元/百万、输出 8 元/百万
 * 1 元 = 1_000_000 微元
 */
const COST_INPUT_MICROS = 2_000_000;
const COST_OUTPUT_MICROS = 8_000_000;

async function main() {
  console.log("=== 阶段 A 受控写库开始（上限 6 行）===\n");

  // ——— 1. systemconfig: billing_usage_calibration ———
  const calibKey = "billing_usage_calibration";
  const beforeCalib = await prisma.systemconfig.findUnique({ where: { key: calibKey } });
  console.log(`[1] systemconfig/${calibKey}`);
  console.log(`    变更前: ${beforeCalib ? beforeCalib.value : "(不存在)"}`);
  await prisma.systemconfig.upsert({
    where: { key: calibKey },
    create: { key: calibKey, value: JSON.stringify(CALIBRATION) },
    update: { value: JSON.stringify(CALIBRATION) },
  });
  const afterCalib = await prisma.systemconfig.findUnique({ where: { key: calibKey } });
  console.log(`    变更后: ${afterCalib?.value}\n`);

  // ——— 2. systemconfig: billing.minPointsPerTask ———
  const minKey = "billing.minPointsPerTask";
  const beforeMin = await prisma.systemconfig.findUnique({ where: { key: minKey } });
  console.log(`[2] systemconfig/${minKey}`);
  console.log(`    变更前: ${beforeMin ? beforeMin.value : "(不存在)"}`);
  await prisma.systemconfig.upsert({
    where: { key: minKey },
    create: { key: minKey, value: MIN_POINTS_PER_TASK },
    update: { value: MIN_POINTS_PER_TASK },
  });
  const afterMin = await prisma.systemconfig.findUnique({ where: { key: minKey } });
  console.log(`    变更后: ${afterMin?.value}\n`);

  // ——— 3~5. componentcatalog: C01 / C02 / C07 ———
  for (const [componentId, total] of Object.entries(CATALOG_TOTALS)) {
    const before = await prisma.componentcatalog.findUnique({
      where: { id: componentId },
      select: { id: true, name: true, estimatedModelTokens: true },
    });
    if (!before) {
      console.log(`[catalog] ${componentId} 不存在，跳过（未写入）`);
      continue;
    }
    console.log(`[catalog] ${componentId} ${before.name}`);
    console.log(`    变更前 estimatedModelTokens: ${before.estimatedModelTokens}`);
    await prisma.componentcatalog.update({
      where: { id: componentId },
      data: { estimatedModelTokens: total },
    });
    const after = await prisma.componentcatalog.findUnique({
      where: { id: componentId },
      select: { estimatedModelTokens: true },
    });
    console.log(`    变更后 estimatedModelTokens: ${after?.estimatedModelTokens}`);
    console.log(`    校准明细: in=${CALIBRATION[componentId].in} out=${CALIBRATION[componentId].out} 合计=${total}\n`);
  }

  // ——— 6. modelpricing: deepseek-flash ———
  const beforePricing = await prisma.modelpricing.findUnique({
    where: { deploymentId: DEEPSEEK_DEPLOYMENT_ID },
  });
  console.log(`[6] modelpricing/deploymentId=${DEEPSEEK_DEPLOYMENT_ID}`);
  console.log(
    `    变更前: ${beforePricing ? JSON.stringify({ costIn: beforePricing.costInputMicrosPerMillion, costOut: beforePricing.costOutputMicrosPerMillion, status: beforePricing.priceStatus, origin: beforePricing.priceOrigin }) : "(不存在)"}`,
  );
  await prisma.modelpricing.upsert({
    where: { deploymentId: DEEPSEEK_DEPLOYMENT_ID },
    create: {
      id: crypto.randomUUID(),
      deploymentId: DEEPSEEK_DEPLOYMENT_ID,
      currency: "CNY",
      costInputMicrosPerMillion: COST_INPUT_MICROS,
      costOutputMicrosPerMillion: COST_OUTPUT_MICROS,
      priceSource: "VERIFIED",
      priceStatus: "VERIFIED",
      priceOrigin: "PLATFORM",
      priceVersion: 1,
      effectiveFrom: new Date(),
    },
    update: {
      currency: "CNY",
      costInputMicrosPerMillion: COST_INPUT_MICROS,
      costOutputMicrosPerMillion: COST_OUTPUT_MICROS,
      priceSource: "VERIFIED",
      priceStatus: "VERIFIED",
      priceOrigin: "PLATFORM",
      effectiveFrom: new Date(),
    },
  });
  const afterPricing = await prisma.modelpricing.findUnique({
    where: { deploymentId: DEEPSEEK_DEPLOYMENT_ID },
  });
  console.log(
    `    变更后: ${JSON.stringify({ costIn: afterPricing?.costInputMicrosPerMillion, costOut: afterPricing?.costOutputMicrosPerMillion, status: afterPricing?.priceStatus, origin: afterPricing?.priceOrigin })}`,
  );
  console.log("    价格来源: DeepSeek 官方文档 api-docs.deepseek.com/zh-cn/quick_start/pricing/，抓取时间 2026-10-01");
  console.log("    口径: 高峰时段 + 缓存未命中（输入 2 元/百万、输出 8 元/百万）\n");

  console.log("=== 写入完成：systemconfig 2 行 + componentcatalog 3 行 + modelpricing 1 行 ===");
}

main()
  .catch((e) => {
    console.error("受控写库失败:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
