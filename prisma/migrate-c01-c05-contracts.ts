/**
 * 第一批组件合同迁移（C01-C05）
 *
 * 规则（严格遵循迁移批次约束）：
 *  - 仅处理 C01-C05，**绝不触碰 C07**；
 *  - 只使用 src/lib/component-contract/catalog-contracts-c01-c05.ts 的真实合同（逐组件业务编写）；
 *  - 能力裁决：仅当“当前启用的平台默认部署能力 ⊇ 合同 requiredCapabilities”时才 PUBLISH + 激活；
 *    缺失能力者仅创建 DRAFT，绝不强行 PUBLISH/激活；
 *  - 幂等：已存在相同版本合同则跳过；已激活则保持不换绑；
 *  - 不写 component_catalog.detail.executionProfile（旧字段一律不写）。
 *
 * 用法：npx tsx prisma/migrate-c01-c05-contracts.ts [--apply]
 *       不带 --apply 时仅做只读预演（dry-run），不写库。
 */
async function main() {
  // 说明：本脚本**不主动读取 .env / .env.local**，数据库连接所需环境变量由 Prisma Client 自动加载。
  const apply = process.argv.includes("--apply");

  const { prisma } = await import("../src/lib/prisma");
  const { createDraftContract, publishContract } = await import("../src/lib/component-contract/repository");
  const { getPlatformDefaultDeploymentId } = await import("../src/lib/model-registry");
  const { C01_C05_BATCH, evaluateActivationEligibility } = await import(
    "../src/lib/component-contract/catalog-contracts-c01-c05"
  );

  // 操作人：真实存在的超级管理员（operationlog.userId 为必填外键）
  const admin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" }, select: { id: true }, orderBy: { createdAt: "asc" } });
  if (!admin) {
    console.error("MIGRATE_FAIL NO_SUPER_ADMIN: 未找到可用的 SUPER_ADMIN 操作人，无法写入发布审计。");
    await prisma.$disconnect();
    process.exit(2);
  }

  // 真实部署能力（平台默认部署）
  const pdId = await getPlatformDefaultDeploymentId();
  const pd = pdId
    ? await prisma.modeldeployment.findUnique({ where: { id: pdId }, select: { enabled: true, capabilities: true } })
    : null;
  const deploymentCapabilities = (Array.isArray(pd?.capabilities) ? (pd.capabilities as unknown as string[]) : []).map((c) => String(c));

  const results: Array<Record<string, unknown>> = [];

  for (const { componentId, contract, analysis } of C01_C05_BATCH) {
    if ((componentId as string) === "C07") continue; // 绝不触碰 C07

    const comp = await prisma.componentcatalog.findUnique({ where: { id: componentId }, select: { activeContractId: true } });
    const existing = await prisma.componentcontract.findFirst({
      where: { componentId, contractVersion: contract.contractVersion },
      select: { id: true, lifecycle: true },
    });

    const eligibility = evaluateActivationEligibility(contract, deploymentCapabilities);
    const row: Record<string, unknown> = {
      componentId,
      contractVersion: contract.contractVersion,
      requiredCapabilities: eligibility.requiredCapabilities,
      missingCapabilities: eligibility.missingCapabilities,
      eligible: eligibility.eligible,
      alreadyExisting: existing ? `${existing.id}@${existing.lifecycle}` : null,
      action: "",
    };

    if (!apply) {
      row.action = existing ? "SKIP_DRY_RUN" : eligibility.eligible ? "WOULD_PUBLISH_ACTIVATE" : "WOULD_CREATE_DRAFT_ONLY";
      results.push(row);
      continue;
    }

    // 1) 创建 DRAFT（若不存在该版本）
    if (!existing) {
      await createDraftContract({
        componentId,
        contractVersion: contract.contractVersion,
        contract: { ...contract, componentId },
      });
    }

    // 2) 能力达标才 PUBLISH + 激活；否则保持 DRAFT
    if (eligibility.eligible) {
      const alreadyActive = comp?.activeContractId && existing?.lifecycle === "PUBLISHED";
      if (!alreadyActive) {
        await publishContract({
          componentId,
          contractVersion: contract.contractVersion,
          publishedBy: admin.id,
          autoActivate: true,
        });
        row.action = existing ? "PUBLISH_ACTIVATE" : "CREATE_PUBLISH_ACTIVATE";
      } else {
        row.action = "SKIP_ALREADY_ACTIVE";
      }
    } else {
      row.action = existing ? "SKIP_KEEP_DRAFT" : "CREATE_DRAFT_ONLY";
    }
    row.missingMaterials = analysis.missingMaterials;
    results.push(row);
  }

  console.log(JSON.stringify({ apply, deploymentCapabilities, superAdmin: admin.id, results }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("MIGRATE_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});

// 显式声明为模块作用域，避免与其它脚本文件（如 scripts/test-page-fetch.ts）的顶层 main 冲突
export {};
