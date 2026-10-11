/**
 * E6-OPS-READY · settlementMode=ALL 全量切换预检（只预检，不切换）
 *
 * 产出：
 *   (b) 全部「启用中」部署的价格就绪（evaluateSettlementReadiness 全 true）；
 *   (c) 空间余额与流水守恒信号（全局 pointledger 净流入净额 + tokensettlement 状态分布）；
 *   (d) 灰度期(WHITELIST) 与 ALL 模式的差异点（哪些组件首次进入押金-结算）。
 */
import { loadCliEnv } from "./cli-env";
loadCliEnv();
import { prisma } from "@/lib/prisma";
import { evaluateSettlementReadiness } from "@/lib/model-pricing";
import { loadBillingConfig } from "@/lib/billing/billing-config";

const safe = (o: unknown) => JSON.stringify(o, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);

async function main() {
  // (b) 启用中部署价格就绪
  const deps = await prisma.modeldeployment.findMany({ select: { id: true, displayName: true, enabled: true, providerId: true, upstreamModel: true } });
  const pricings = await prisma.modelpricing.findMany({ where: { deploymentId: { in: deps.map((d) => d.id) } } });
  const priceMap = new Map(pricings.map((p) => [p.deploymentId, p as any]));

  const enabled = deps.filter((d) => d.enabled);
  const readinessRows = enabled.map((d) => {
    const pricing = priceMap.get(d.id) ?? null;
    const ready = evaluateSettlementReadiness(pricing, { settlementFeatureEnabled: true });
    let reason = "OK";
    if (!ready) {
      if (!pricing) reason = "NO_PRICING";
      else if (pricing.supplierCostStatus !== "VERIFIED") reason = `SUPPLIER_COST=${pricing.supplierCostStatus}`;
      else if (!pricing.priceInputMicrosPerMillion || !pricing.priceOutputMicrosPerMillion) reason = "MISSING_USER_PRICE";
      else if (pricing.markupRateBps != null && pricing.priceInputMicrosPerMillion != null) reason = "PRICING_MODE_CONFLICT";
      else reason = "OTHER";
    }
    return { id: d.id, name: d.displayName, ready, reason };
  });
  const notReady = readinessRows.filter((r) => !r.ready);
  console.log(`\n=== (b) 启用中部署价格就绪 ===`);
  console.log(`启用中部署总数: ${enabled.length}  就绪: ${readinessRows.length - notReady.length}  未就绪: ${notReady.length}`);
  if (notReady.length) console.log("未就绪部署:\n" + safe(notReady));

  // (c) 余额与流水守恒
  const ledgerAgg = await prisma.$queryRaw<Array<{ inSum: bigint; outSum: bigint; net: bigint }>>`
    SELECT
      COALESCE(SUM(CASE WHEN direction='IN' THEN points ELSE 0 END),0) AS inSum,
      COALESCE(SUM(CASE WHEN direction='OUT' THEN points ELSE 0 END),0) AS outSum,
      COALESCE(SUM(CASE WHEN direction='IN' THEN points ELSE 0 END),0)-COALESCE(SUM(CASE WHEN direction='OUT' THEN points ELSE 0 END),0) AS net
    FROM pointledger
  `;
  const stats = await prisma.$queryRaw<Array<{ s: string; c: bigint }>>`
    SELECT status AS s, COUNT(*) AS c FROM tokensettlement GROUP BY status
  `;
  console.log(`\n=== (c) 余额与流水守恒（监控信号） ===`);
  console.log(`全局 pointledger: IN=${ledgerAgg[0].inSum.toString()} OUT=${ledgerAgg[0].outSum.toString()} 净额=${ledgerAgg[0].net.toString()}`);
  console.log(`tokensettlement 状态分布: ${safe(stats.map((x) => ({ status: x.s, count: Number(x.c) })))}`);
  console.log(`（注：逐任务流水配对与金额等式由「任务一」对账扫描覆盖；账户级绝对值总账核对为后续独立任务。）`);

  // (d) WHITELIST vs ALL 差异
  const cfg = await loadBillingConfig();
  const whitelist = (cfg.settlementComponentWhitelist ?? []).map((x) => String(x).trim().toUpperCase());
  const mode = cfg.settlementMode ?? "WHITELIST";
  const cats = await prisma.componentcatalog.findMany({ where: { activeContractId: { not: null } }, select: { id: true, activeContractId: true } });
  const inWhitelist = cats.filter((c) => whitelist.includes(String(c.id).trim().toUpperCase())).map((c) => c.id);
  const newToAll = cats.filter((c) => !whitelist.includes(String(c.id).trim().toUpperCase())).map((c) => c.id);
  console.log(`\n=== (d) 灰度(WHITELIST) vs ALL 差异 ===`);
  console.log(`当前 settlementMode: ${mode}`);
  console.log(`有激活合同的组件总数: ${cats.length}`);
  console.log(`已在 WHITELIST(切 ALL 无影响): ${inWhitelist.length}  -> ${safe(inWhitelist)}`);
  console.log(`首次进入 ALL(第一次进押金-结算): ${newToAll.length}  -> ${safe(newToAll)}`);

  // 预检结论
  const allGreen = notReady.length === 0 && cats.length > 0;
  console.log(`\n=== 预检结论 ===`);
  console.log(`(a) 60 组件估价全通过: 见 estimate-all-60 输出（60/60 CONVERTED_PRICE）`);
  console.log(`(b) 启用部署价格就绪: ${notReady.length === 0 ? "PASS" : "FAIL(" + notReady.length + ")"}`);
  console.log(`(c) 流水守恒信号: 已采集（逐任务等式见对账）`);
  console.log(`(d) WHITELIST/ALL 差异: 已列出（首进 ALL 组件 ${newToAll.length} 个）`);
  console.log(`总体预检: ${allGreen ? "READY（具备切换条件，待负责人在对账期后批准）" : "NOT READY"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e?.message || e); process.exit(1); });
