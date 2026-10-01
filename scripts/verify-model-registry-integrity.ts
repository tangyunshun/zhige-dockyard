/**
 * 模型注册表数据完整性只读核验（不写入任何数据，不输出任何密钥）。
 *
 * 用法：npm run verify:model-registry
 *
 * 核验项：
 *  1. modelprovider / modeldeployment / modelpricing / workspace_model_policy / modelcostobservation 五表重复 id 数量；
 *  2. modelpricing 孤儿 deploymentId 数量；
 *  3. 五表是否均存在 PRIMARY KEY(id)；
 *  4. modelpricing 是否存在 ModelPricing_deploymentId_fkey 且 ON DELETE 为 CASCADE；
 *  5. modeldeployment.providerId 是否存在无法匹配供应商的悬挂引用；
 *  6. workspace_model_policy 的 defaultDeploymentId / allowedDeploymentIds 是否存在无效部署引用；
 *  7. C07 合同模型绑定命中已启用部署；
 *  8. registrylock 表存在、PRIMARY KEY(id)、ENGINE=InnoDB 且 MODEL_REGISTRY_REFS 单例行恰好 1 条。
 */
import { PrismaClient } from "@prisma/client";
import { extractRequiredCapabilities } from "@/lib/component-contract/capabilities";

const prisma = new PrismaClient();

const TABLES = [
  "modelprovider",
  "modeldeployment",
  "modelpricing",
  "workspace_model_policy",
  "modelcostobservation",
] as const;

let failures = 0;
function report(label: string, value: string | number, ok: boolean) {
  if (!ok) failures += 1;
  console.log(`${ok ? "[OK]  " : "[FAIL]"} ${label}: ${value}`);
}

async function countDuplicateIds(table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
    `SELECT COALESCE(SUM(c - 1), 0) AS n FROM (SELECT COUNT(*) AS c FROM \`${table}\` GROUP BY \`id\` HAVING COUNT(*) > 1) t`,
  );
  return Number(rows[0]?.n ?? 0);
}

async function main() {
  // 1) 重复 id
  for (const t of TABLES) {
    const dup = await countDuplicateIds(t);
    report(`${t} 重复 id 记录数`, dup, dup === 0);
  }

  // 2) 孤儿价格
  const orphanPricing = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
    "SELECT COUNT(*) AS n FROM `modelpricing` p WHERE NOT EXISTS (SELECT 1 FROM `modeldeployment` d WHERE d.`id` = p.`deploymentId`)",
  );
  const orphanPricingN = Number(orphanPricing[0]?.n ?? 0);
  report("modelpricing 孤儿 deploymentId 记录数", orphanPricingN, orphanPricingN === 0);

  // 3) 主键
  const pkRows = await prisma.$queryRawUnsafe<Array<{ TABLE_NAME: string }>>(
    "SELECT TABLE_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'PRIMARY KEY' AND TABLE_NAME IN ('modelprovider','modeldeployment','modelpricing','workspace_model_policy','modelcostobservation')",
  );
  const withPk = new Set(pkRows.map((r) => r.TABLE_NAME));
  for (const t of TABLES) {
    report(`${t} PRIMARY KEY`, withPk.has(t) ? "存在" : "缺失", withPk.has(t));
  }

  // 3b) 主键列必须恰为 id，且序号为 1（仅「存在主键」不足以排除主键落在其他列上）
  const pkCols = await prisma.$queryRawUnsafe<Array<{ TABLE_NAME: string; COLUMN_NAME: string; ORDINAL_POSITION: number }>>(
    "SELECT k.TABLE_NAME, k.COLUMN_NAME, k.ORDINAL_POSITION FROM information_schema.KEY_COLUMN_USAGE k WHERE k.TABLE_SCHEMA = DATABASE() AND k.CONSTRAINT_NAME = 'PRIMARY' AND k.TABLE_NAME IN ('modelprovider','modeldeployment','modelpricing','workspace_model_policy','modelcostobservation')",
  );
  const pkById = new Map(pkCols.map((r) => [r.TABLE_NAME, { col: r.COLUMN_NAME, pos: Number(r.ORDINAL_POSITION) }]));
  for (const t of TABLES) {
    const info = pkById.get(t);
    const ok = info?.col === "id" && info?.pos === 1;
    report(
      `${t} PRIMARY KEY 列 = id 且序号 = 1`,
      info ? `column=${info.col}, ordinal=${info.pos}` : "未找到主键列",
      ok,
    );
  }

  // 4) 外键级联
  const fkRows = await prisma.$queryRawUnsafe<Array<{ DELETE_RULE: string }>>(
    "SELECT rc.DELETE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS rc WHERE rc.CONSTRAINT_SCHEMA = DATABASE() AND rc.CONSTRAINT_NAME = 'ModelPricing_deploymentId_fkey'",
  );
  const deleteRule = fkRows[0]?.DELETE_RULE ?? "缺失";
  report("modelpricing.ModelPricing_deploymentId_fkey ON DELETE", deleteRule, deleteRule === "CASCADE");

  // 4b) 新增关联外键（RESTRICT：删除与改名都被数据库拒绝，保证引用不被静默改写）
  const relFks = await prisma.$queryRawUnsafe<Array<{ CONSTRAINT_NAME: string; DELETE_RULE: string; UPDATE_RULE: string }>>(
    "SELECT rc.CONSTRAINT_NAME, rc.DELETE_RULE, rc.UPDATE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS rc WHERE rc.CONSTRAINT_SCHEMA = DATABASE() AND rc.CONSTRAINT_NAME IN ('ModelDeployment_providerId_fkey','WorkspaceModelPolicy_defaultDeploymentId_fkey')",
  );
  const relMap = new Map(relFks.map((r) => [r.CONSTRAINT_NAME, r]));
  for (const name of ["ModelDeployment_providerId_fkey", "WorkspaceModelPolicy_defaultDeploymentId_fkey"]) {
    const rule = relMap.get(name)?.DELETE_RULE ?? "缺失";
    report(`${name} ON DELETE`, rule, rule === "RESTRICT");
    const upd = relMap.get(name)?.UPDATE_RULE ?? "缺失";
    report(`${name} ON UPDATE`, upd, upd === "RESTRICT");
  }

  // 5) 部署 → 供应商悬挂引用（providerId 语义为供应商 name）
  const orphanDep = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
    "SELECT COUNT(*) AS n FROM `modeldeployment` d WHERE NOT EXISTS (SELECT 1 FROM `modelprovider` p WHERE p.`name` = d.`providerId`)",
  );
  const orphanDepN = Number(orphanDep[0]?.n ?? 0);
  report("modeldeployment.providerId 无法匹配供应商(name) 的记录数", orphanDepN, orphanDepN === 0);

  // 5b) 语义核对：providerId 命中 name 与命中 id 的数量对比
  const byName = await prisma.modeldeployment.count({
    where: { providerId: { in: (await prisma.modelprovider.findMany({ select: { name: true } })).map((p) => p.name) } },
  });
  const byId = await prisma.modeldeployment.count({
    where: { providerId: { in: (await prisma.modelprovider.findMany({ select: { id: true } })).map((p) => p.id) } },
  });
  report("modeldeployment 总数 / 命中供应商 name / 命中供应商 id", `${await prisma.modeldeployment.count()} / ${byName} / ${byId}`, true);

  // 6) 空间策略无效引用
  const policies = await prisma.workspace_model_policy.findMany({
    select: { workspaceId: true, defaultDeploymentId: true, allowedDeploymentIds: true },
  });
  const validIds = new Set((await prisma.modeldeployment.findMany({ select: { id: true } })).map((d) => d.id));
  let badDefault = 0;
  let badAllowed = 0;
  for (const p of policies) {
    if (p.defaultDeploymentId && !validIds.has(p.defaultDeploymentId)) badDefault += 1;
    const ids = Array.isArray(p.allowedDeploymentIds) ? (p.allowedDeploymentIds as unknown as string[]) : [];
    for (const id of ids) if (!validIds.has(id)) badAllowed += 1;
  }
  report("空间策略 defaultDeploymentId 无效引用数", badDefault, badDefault === 0);
  report("空间策略 allowedDeploymentIds 无效引用数", badAllowed, badAllowed === 0);

  // 7) C07 合同模型绑定 与 已启用部署 的一致性（不输出任何密钥）
  const pilot = await prisma.componentcatalog.findUnique({
    where: { id: "C07" },
    select: { detail: true },
  });
  const profile = (pilot?.detail as Record<string, any> | null)?.executionProfile ?? null;
  if (!profile) {
    report("C07 合同 executionProfile", "未配置（不参与本次一致性核验）", true);
  } else {
    const boundProvider = profile?.model?.defaultProviderId ?? null;
    const boundModel = profile?.model?.defaultModelId ?? null;
    const enabledDeps = await prisma.modeldeployment.findMany({
      where: { enabled: true, provider: { enabled: true } },
      select: { providerId: true, modelId: true },
    });
    const matched = enabledDeps.some((d) => d.providerId === boundProvider && d.modelId === boundModel);
    report(
      "C07 合同模型绑定命中已启用部署",
      `contract=${boundProvider}/${boundModel}，enabledDeployments=${enabledDeps.map((d) => `${d.providerId}/${d.modelId}`).join(" | ") || "无"}`,
      matched,
    );
    report("C07 合同 execution.mode", String(profile?.execution?.mode ?? "缺失"), profile?.execution?.mode === "REAL_MODEL");
  }

  // 7b) C07 激活合同防漂移核验（只读，绝不写入或自动修复）：
  //     - activeContractId 必须存在且对应合同 lifecycle === PUBLISHED；
  //     - 读取合同 executionPlan.steps.requiredCapabilities；
  //     - 读取 C07 实际绑定部署（平台默认 MagicAI/gpt-5.5）capabilities；
  //     - 断言部署能力覆盖合同要求，缺失则核验失败。
  const c07Catalog = await prisma.componentcatalog.findUnique({
    where: { id: "C07" },
    select: { activeContractId: true },
  });
  const c07ActiveId = c07Catalog?.activeContractId ?? null;
  if (!c07ActiveId) {
    report("C07 activeContractId", "缺失（必须配置 PUBLISHED 激活合同）", false);
  } else {
    const c07Contract = await prisma.componentcontract.findUnique({ where: { id: c07ActiveId } });
    const lifecycleOk = c07Contract?.lifecycle === "PUBLISHED";
    report("C07 激活合同 lifecycle", String(c07Contract?.lifecycle ?? "缺失"), lifecycleOk);
    const requiredCaps = extractRequiredCapabilities(c07Contract?.contract);
    const boundDep = await prisma.modeldeployment.findUnique({
      where: { providerId_modelId: { providerId: "MagicAI", modelId: "gpt-5.5" } },
      select: { enabled: true, capabilities: true },
    });
    const declaredCaps = Array.from(
      new Set(
        (Array.isArray(boundDep?.capabilities) ? (boundDep.capabilities as unknown as string[]) : []).map((c) =>
          String(c).toUpperCase(),
        ),
      ),
    );
    const missingCaps = requiredCaps.filter((c) => !declaredCaps.includes(c));
    report(
      "C07 合同要求能力 ⊆ MagicAI/gpt-5.5 部署能力（防漂移）",
      `required=${requiredCaps.join(",") || "（无）"} declared=${declaredCaps.join(",") || "（无）"} missing=${missingCaps.join(",") || "（无）"} boundEnabled=${boundDep?.enabled ?? false}`,
      lifecycleOk && boundDep?.enabled === true && missingCaps.length === 0,
    );
  }

  // 8) 模型注册表引用串行锁表 (registrylock) 完整性核验（只读核验，缺失不自动写入或修复）
  const regTableRows = await prisma.$queryRawUnsafe<Array<{ TABLE_NAME: string; ENGINE: string }>>(
    "SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'registrylock'",
  );
  const regTableExists = regTableRows.length > 0;
  report("registrylock 表存在", regTableExists ? "存在" : "缺失", regTableExists);

  const regEngine = regTableRows[0]?.ENGINE ?? "缺失";
  report("registrylock ENGINE", regEngine, regEngine === "InnoDB");

  const regPkCols = await prisma.$queryRawUnsafe<Array<{ COLUMN_NAME: string; ORDINAL_POSITION: number }>>(
    "SELECT COLUMN_NAME, ORDINAL_POSITION FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'PRIMARY' AND TABLE_NAME = 'registrylock'",
  );
  const regPkCol = regPkCols[0];
  const regPkOk = regPkCols.length === 1 && regPkCol?.COLUMN_NAME === "id" && Number(regPkCol?.ORDINAL_POSITION) === 1;
  report(
    "registrylock PRIMARY KEY 列 = id 且序号 = 1",
    regPkCol ? `column=${regPkCol.COLUMN_NAME}, ordinal=${regPkCol.ORDINAL_POSITION}` : "未找到主键列",
    regPkOk,
  );

  let singleRowCount = 0;
  if (regTableExists) {
    const singleRows = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
      "SELECT COUNT(*) AS n FROM `registrylock` WHERE `id` = 'MODEL_REGISTRY_REFS'",
    );
    singleRowCount = Number(singleRows[0]?.n ?? 0);
  }
  report(
    "registrylock.MODEL_REGISTRY_REFS 单例行恰好 1 条",
    `count=${singleRowCount}`,
    singleRowCount === 1,
  );

  // 平台默认模型配置完整性核验（**只报告，绝不自动修复**）
  // 键名与 @/lib/model-registry 导出的 PLATFORM_DEFAULT_DEPLOYMENT_KEY 必须保持一致
  const PLATFORM_DEFAULT_KEY = "PLATFORM_DEFAULT_DEPLOYMENT_ID";
  const platformDefaultRow = await prisma.systemconfig.findUnique({ where: { key: PLATFORM_DEFAULT_KEY } });
  const platformDefaultValue = typeof platformDefaultRow?.value === "string" ? platformDefaultRow.value.trim() : "";
  if (!platformDefaultValue) {
    // 明确区分「未配置」（空值，合法状态）与「配置失效」（见下），绝不把失效当作未配置
    report("platformDefaultDeployment", "NOT_CONFIGURED (未配置平台默认模型)", true);
  } else {
    const pdDep = await prisma.modeldeployment.findUnique({
      where: { id: platformDefaultValue },
      select: { id: true, providerId: true, modelId: true, enabled: true },
    });
    if (!pdDep) {
      report(
        "platformDefaultDeployment",
        `DANGLING (配置失效：部署 ${platformDefaultValue} 不存在；需管理员手动修正，脚本不自动修复)`,
        false,
      );
    } else {
      const pdProvider = await prisma.modelprovider.findUnique({
        where: { name: pdDep.providerId },
        select: { enabled: true },
      });
      report(
        "platformDefaultDeployment",
        `${pdDep.providerId}/${pdDep.modelId} deploymentId=${pdDep.id} deploymentEnabled=${pdDep.enabled} providerEnabled=${pdProvider?.enabled ?? false}`,
        pdDep.enabled && pdProvider?.enabled === true,
      );
    }
  }

  // modelpricing 孤儿核验（存在价格但对应部署已不存在）
  const orphanRows = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
    "SELECT COUNT(*) AS n FROM `modelpricing` p LEFT JOIN `modeldeployment` d ON p.deploymentId = d.id WHERE d.id IS NULL",
  );
  const orphanCount = Number(orphanRows[0]?.n ?? 0);
  report("modelpricing 孤儿数", `count=${orphanCount}`, orphanCount === 0);

  // MagicAI/gpt-5.5 成本与价格只读基线（不得被任何测试/脚本篡改；不输出任何密钥）
  const magicDep = await prisma.modeldeployment.findUnique({
    where: { providerId_modelId: { providerId: "MagicAI", modelId: "gpt-5.5" } },
    select: { id: true, pricing: true },
  });
  const costInput = magicDep?.pricing?.costInputMicrosPerMillion ?? null;
  const costOutput = magicDep?.pricing?.costOutputMicrosPerMillion ?? null;
  const pSource = magicDep?.pricing?.priceSource ?? null;
  const pVersion = magicDep?.pricing?.priceVersion ?? null;
  report(
    "MagicAI/gpt-5.5 成本与价格",
    `costInput=${costInput} costOutput=${costOutput} priceSource=${pSource} priceVersion=${pVersion}（期望 5000000 / 30000000 / VERIFIED / 1）`,
    costInput === 5_000_000 && costOutput === 30_000_000 && pSource === "VERIFIED" && pVersion === 1,
  );

  // 真实 Token 结算开关必须保持关闭
  const { isTokenSettlementFeatureEnabled } = await import("../src/lib/token-settlement-service");
  report("settlementEnabled", String(isTokenSettlementFeatureEnabled()), isTokenSettlementFeatureEnabled() === false);

  console.log(`\n核验结论：${failures === 0 ? "全部通过" : `${failures} 项未通过`}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("核验脚本执行失败:", (e as Error)?.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
