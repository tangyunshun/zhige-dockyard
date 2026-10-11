/**
 * PRICING-FIX-R3 — 任务一 + 任务四 数据应用脚本（幂等、可 dry-run）。
 *
 * 任务一：把 DeepSeek 两个部署的 8 行时段价由「写死直配价」改为「成本×加价率」派生：
 *   - 清空 priceInput/Output/Cache*（微元），设 markupRateBps=2000（=20%）；
 *   - cost* 保持不变；priceVersion 递增；写 operationlog 审计（含变更前后值）。
 * 任务四：systemconfig 补回 billing.markupCoefficientBps=20000 /
 *   billing.byokServiceRateBps=1500 / billing.settlementMode=WHITELIST。
 *
 * 用法：
 *   npx tsx scripts/apply-pricing-r3-fix.ts            # 仅打印将要做的变更（dry-run）
 *   npx tsx scripts/apply-pricing-r3-fix.ts --apply     # 真正写库
 */
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
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
const APPLY = process.argv.includes("--apply");
const MICROS_PER_YUAN = 1_000_000;
const yuan = (m: number | null) => (m == null ? null : (m / MICROS_PER_YUAN).toFixed(4));

async function main() {
  if (!APPLY) console.log("【DRY-RUN 模式】仅打印变更，不写库。加 --apply 真正执行。\n");

  // 操作人：超管
  const admin = await prisma.user.findFirst({ where: { role: "superadmin" }, select: { id: true, name: true } });
  if (!admin) throw new Error("未找到 superadmin 用户，无法写审计日志");
  const operatorId = admin.id;

  const deps = await prisma.modeldeployment.findMany({
    where: { providerId: "DeepSeek" },
    select: { id: true, providerId: true, modelId: true },
  });

  const changeList: Array<Record<string, unknown>> = [];

  for (const d of deps) {
    const periods = await prisma.modelpricingperiod.findMany({
      where: { deploymentId: d.id },
      orderBy: [{ priority: "desc" }, { kind: "asc" }],
    });
    for (const p of periods) {
      const before = {
        priceInputMicrosPerMillion: p.priceInputMicrosPerMillion,
        priceOutputMicrosPerMillion: p.priceOutputMicrosPerMillion,
        priceCacheReadMicrosPerMillion: p.priceCacheReadMicrosPerMillion,
        priceCacheWriteMicrosPerMillion: p.priceCacheWriteMicrosPerMillion,
        markupRateBps: p.markupRateBps,
        priceVersion: p.priceVersion,
      };
      const after = {
        priceInputMicrosPerMillion: null,
        priceOutputMicrosPerMillion: null,
        priceCacheReadMicrosPerMillion: null,
        priceCacheWriteMicrosPerMillion: null,
        markupRateBps: 2000,
        priceVersion: (p.priceVersion ?? 0) + 1,
      };
      console.log(
        `[${d.modelId}] [${p.kind}] ${p.name} v${p.priceVersion} → v${after.priceVersion}\n` +
          `    before: priceIn=${yuan(p.priceInputMicrosPerMillion)} priceOut=${yuan(p.priceOutputMicrosPerMillion)} markup=${p.markupRateBps} | costIn=${yuan(p.costInputMicrosPerMillion)} costOut=${yuan(p.costOutputMicrosPerMillion)}\n` +
          `    after : priceIn=null priceOut=null markup=2000 (派生价 = 成本×1.2)`,
      );
      changeList.push({
        deployment: `${d.providerId}/${d.modelId}`,
        periodId: p.id,
        kind: p.kind,
        name: p.name,
        before,
        after,
        derivedPriceIn: yuan(Math.round((p.costInputMicrosPerMillion ?? 0) * 1.2)),
        derivedPriceOut: yuan(Math.round((p.costOutputMicrosPerMillion ?? 0) * 1.2)),
      });

      if (APPLY) {
        await prisma.modelpricingperiod.update({
          where: { id: p.id },
          data: {
            priceInputMicrosPerMillion: null,
            priceOutputMicrosPerMillion: null,
            priceCacheReadMicrosPerMillion: null,
            priceCacheWriteMicrosPerMillion: null,
            markupRateBps: 2000,
            priceVersion: after.priceVersion,
            effectiveFrom: new Date(),
          },
        });
        await prisma.operationlog.create({
          data: {
            id: randomUUID(),
            userId: operatorId,
            action: "PRICING_PERIOD_TO_MARKUP",
            resource: `modelpricingperiod:${p.id}`,
            details: { task: "PRICING-FIX-R3", before, after, costKept: true } as object,
          },
        });
      }
    }
  }

  // 任务四：补回 billing 配置键
  const billingCfg = [
    { key: "billing.markupCoefficientBps", value: "20000", desc: "平台加价率基点（=20%，单一真源）" },
    { key: "billing.byokServiceRateBps", value: "1500", desc: "BYOK 服务费率基点（=15%）" },
    { key: "billing.settlementMode", value: "WHITELIST", desc: "结算模式（白名单）" },
  ];
  console.log("\n=== 任务四：systemconfig billing.* 补回 ===");
  for (const c of billingCfg) {
    const existing = await prisma.systemconfig.findUnique({ where: { key: c.key } });
    console.log(`  ${c.key} = ${c.value}  (${existing ? "已存在→跳过" : "缺失→补回"})  ${c.desc}`);
    if (APPLY && !existing) {
      await prisma.systemconfig.create({ data: { key: c.key, value: c.value } });
      await prisma.operationlog.create({
        data: {
          id: randomUUID(),
          userId: operatorId,
          action: "SYSTEMCONFIG_CREATE",
          resource: `systemconfig:${c.key}`,
          details: { task: "PRICING-FIX-R3", value: c.value } as object,
        },
      });
    }
  }

  console.log("\n=== 变更清单（JSON） ===");
  console.log(JSON.stringify(changeList, null, 2));
  console.log(APPLY ? "\n【已写库】" : "\n【DRY-RUN 完成，未写库】");
}

main()
  .catch((e) => {
    console.error("APPLY_FAIL", e);
    process.exit(2);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
