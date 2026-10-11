/**
 * 只读探查：PRICING-FIX-R3 执行前的真实数据基线。
 * 打印 deepseek 两个部署的主表定价 + 全部时段价，以及 systemconfig billing.*。
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

function loadEnvFile(p: string) {
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

for (const f of [".env.local", ".env.development.local", ".env"]) loadEnvFile(path.join(process.cwd(), f));

const prisma = new PrismaClient();

async function main() {
  const deps = await prisma.modeldeployment.findMany({
    where: { providerId: { contains: "deepseek" } },
    select: { id: true, providerId: true, modelId: true, upstreamModel: true },
  });
  console.log("=== deepseek 部署 ===");
  for (const d of deps) {
    console.log(`\n[部署] ${d.providerId}/${d.modelId} (upstream=${d.upstreamModel}) id=${d.id}`);
    const main = await prisma.modelpricing.findUnique({ where: { deploymentId: d.id } });
    if (main) {
      console.log(
        `  主表: costIn=${main.costInputMicrosPerMillion} costOut=${main.costOutputMicrosPerMillion} | priceIn=${main.priceInputMicrosPerMillion} priceOut=${main.priceOutputMicrosPerMillion} | markup=${main.markupRateBps} | v=${main.priceVersion} status=${main.priceStatus}`,
      );
    } else {
      console.log("  主表: 无");
    }
    const periods = await prisma.modelpricingperiod.findMany({
      where: { deploymentId: d.id },
      orderBy: [{ priority: "desc" }, { kind: "asc" }],
    });
    console.log(`  时段行数: ${periods.length}`);
    for (const p of periods) {
      console.log(
        `    - [${p.kind}] ${p.name} enabled=${p.enabled} pri=${p.priority} id=${p.id}\n      costIn=${p.costInputMicrosPerMillion} costOut=${p.costOutputMicrosPerMillion} | priceIn=${p.priceInputMicrosPerMillion} priceOut=${p.priceOutputMicrosPerMillion} | markup=${p.markupRateBps} | v=${p.priceVersion}`,
      );
    }
  }

  console.log("\n=== systemconfig billing.* ===");
  const cfg = await prisma.systemconfig.findMany({
    where: { key: { startsWith: "billing." } },
    select: { key: true, value: true },
  });
  if (cfg.length === 0) console.log("  (无 billing.* 记录)");
  for (const c of cfg) console.log(`  ${c.key} = ${c.value}`);
}

main()
  .catch((e) => {
    console.error("INSPECT_FAIL", e);
    process.exit(2);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
