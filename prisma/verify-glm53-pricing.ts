/**
 * 验证 GLM-5.3 系列价格与规则已正确录入 modelpricing。
 */
import { loadCliEnv } from "../scripts/cli-env";
import { PrismaClient } from "@prisma/client";
import { loadDeploymentPricing } from "../src/lib/model-registry";
import { yuanPerMillionToMicros } from "../src/lib/model-pricing";

loadCliEnv();

const PROVIDER = "智谱-bigmodel";
const EXPECT = [
  { modelId: "GLM-5.3", input: 8, output: 28, cacheRead: 2 },
  { modelId: "GLM-5.3-Flash", input: 0.8, output: 2.8, cacheRead: 0.23 },
  { modelId: "glm-5.3-flashx", input: 2, output: 7, cacheRead: 0.57 },
];

async function main() {
  const prisma = new PrismaClient();
  let failures = 0;
  try {
    for (const e of EXPECT) {
      const dep = await prisma.modeldeployment.findUnique({
        where: { providerId_modelId: { providerId: PROVIDER, modelId: e.modelId } },
      });
      if (!dep) {
        console.error(`✗ 部署缺失: ${PROVIDER}/${e.modelId}`);
        failures++;
        continue;
      }
      const p = await loadDeploymentPricing(dep.id);
      if (!p) {
        console.error(`✗ 价格缺失: ${PROVIDER}/${e.modelId}`);
        failures++;
        continue;
      }
      const inMicros = yuanPerMillionToMicros(e.input);
      const outMicros = yuanPerMillionToMicros(e.output);
      const cacheMicros = yuanPerMillionToMicros(e.cacheRead);
      const okCostIn = p.costInputMicrosPerMillion === inMicros;
      const okCostOut = p.costOutputMicrosPerMillion === outMicros;
      const okCostCache = p.costCacheReadMicrosPerMillion === cacheMicros;
      const okPriceIn = p.priceInputMicrosPerMillion === inMicros;
      const okPriceOut = p.priceOutputMicrosPerMillion === outMicros;
      const okPriceCache = p.priceCacheReadMicrosPerMillion === cacheMicros;
      const okRules = !!p.rules && typeof p.rules === "object";
      const okStatus = p.priceStatus === "VERIFIED" && p.priceSource === "VERIFIED";
      const okMode = p.markupRateBps === null || p.markupRateBps === 25000;
      const pass =
        okCostIn && okCostOut && okCostCache && okPriceIn && okPriceOut && okPriceCache && okRules && okStatus && okMode;
      console.log(
        `${pass ? "✓" : "✗"} ${PROVIDER}/${e.modelId} | costIn=${p.costInputMicrosPerMillion} priceIn=${p.priceInputMicrosPerMillion} | out: cost=${p.costOutputMicrosPerMillion} price=${p.priceOutputMicrosPerMillion} | cacheRead: cost=${p.costCacheReadMicrosPerMillion} price=${p.priceCacheReadMicrosPerMillion} | source=${p.priceSource} status=${p.priceStatus} markup=${p.markupRateBps} | rules=${okRules ? JSON.stringify(p.rules) : "null"}`,
      );
      if (!pass) failures++;
    }
  } finally {
    await prisma.$disconnect();
  }
  if (failures > 0) {
    console.error(`\n验证失败：${failures} 项`);
    process.exit(1);
  }
  console.log("\n全部通过：GLM-5.3 系列价格与规则已正确录入。");
}

main().catch((e) => {
  console.error("验证异常:", (e as Error)?.message);
  process.exit(1);
});
