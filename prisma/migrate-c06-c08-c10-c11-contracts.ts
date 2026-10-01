/**
 * 批次 2B 组件合同迁移（C06、C08、C10、C11）
 *
 * 规则（严格遵循批次约束）：
 *  - 仅处理 C06/C08/C10/C11，**绝不触碰 C07** 与其它批次组件（C09 继续暂停，C12-C60 不处理）；
 *  - 只使用 src/lib/component-contract/catalog-contracts-c06-c08-c10-c11.ts 的真实合同（逐组件业务编写）；
 *  - 能力裁决：仅当「当前启用的平台默认部署能力 ⊇ 合同 requiredCapabilities」时才 PUBLISH + 激活；
 *    缺失能力者仅创建 DRAFT，绝不强行 PUBLISH/激活；
 *  - 幂等：已存在相同版本合同则跳过；已激活则保持不换绑（不因排序/新增部署自动改绑）；
 *  - 不写 component_catalog.detail.executionProfile（旧字段一律不写）；
 *  - 不修改价格、结算开关、BYOK、C07 合同与 .env/.env.local。
 *
 * 用法：npx tsx prisma/migrate-c06-c08-c10-c11-contracts.ts [--apply]
 *       不带 --apply 时仅做只读预演（dry-run），不写库。
 */
async function main() {
  // 说明：本脚本**不主动读取 .env / .env.local**，数据库连接所需环境变量由 Prisma Client 自动加载。
  const apply = process.argv.includes("--apply");

  const { prisma } = await import("../src/lib/prisma");
  const { createDraftContract, publishContract } = await import("../src/lib/component-contract/repository");
  const { getPlatformDefaultDeploymentId } = await import("../src/lib/model-registry");
  const { BATCH_2B, BATCH_2B_COMPONENT_IDS, evaluateActivationEligibility } = await import(
    "../src/lib/component-contract/catalog-contracts-c06-c08-c10-c11"
  );

  // 硬防线：批次目标集合必须精确等于 C06/C08/C10/C11，任何越界立即中止
  const allowed = new Set<string>(BATCH_2B_COMPONENT_IDS as readonly string[]);
  for (const { componentId } of BATCH_2B) {
    if (!allowed.has(componentId as string) || (componentId as string) === "C07") {
      console.error(`MIGRATE_FAIL BATCH_SCOPE_VIOLATION: 批次 2B 只允许 C06/C08/C10/C11，实际包含 ${componentId}`);
      process.exit(2);
    }
  }

  // 操作人：真实存在的超级管理员（operationlog.userId 为必填外键）
  const admin = await prisma.user.findFirst({
    where: { role: "SUPER_ADMIN" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!admin) {
    console.error("MIGRATE_FAIL NO_SUPER_ADMIN: 未找到可用的 SUPER_ADMIN 操作人，无法写入发布审计。");
    await prisma.$disconnect();
    process.exit(2);
  }

  // 真实部署能力（平台默认部署，数据库唯一裁决）
  const pdId = await getPlatformDefaultDeploymentId();
  const pd = pdId
    ? await prisma.modeldeployment.findUnique({
        where: { id: pdId },
        select: { enabled: true, capabilities: true, provider: { select: { enabled: true } } },
      })
    : null;
  // 能力裁决必须同时要求「默认 deployment 启用」与「provider 启用」；任一禁用则视为无可用部署能力
  const pdEnabled = Boolean(pd && pd.enabled && pd.provider?.enabled === true);
  const deploymentCapabilities = pdEnabled
    ? (Array.isArray(pd?.capabilities) ? (pd.capabilities as unknown as string[]) : []).map((c) => String(c))
    : [];

  const results: Array<Record<string, unknown>> = [];

  for (const { componentId, contract, analysis } of BATCH_2B) {
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

    // 2) 能力达标才 PUBLISH + 激活；否则保持 DRAFT（BLOCKED，绝不强行发布）
    if (eligibility.eligible) {
      const sameActive = comp?.activeContractId && existing?.lifecycle === "PUBLISHED" && comp.activeContractId === existing.id;
      // 已存在其它有效 activeContractId（指向其它合同）时，不得自动换绑；
      // 仅当「当前无 active」或「已激活本版本」时才激活，避免跨版本/跨合同误换绑。
      const noOtherActive = !comp?.activeContractId || comp.activeContractId === existing?.id;
      if (sameActive) {
        row.action = "SKIP_ALREADY_ACTIVE";
      } else if (noOtherActive) {
        await publishContract({
          componentId,
          contractVersion: contract.contractVersion,
          publishedBy: admin.id,
          autoActivate: true,
        });
        row.action = existing ? "PUBLISH_ACTIVATE" : "CREATE_PUBLISH_ACTIVATE";
      } else {
        row.action = "SKIP_KEEP_OTHER_ACTIVE";
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

// 显式声明为模块作用域，避免与其它脚本文件的顶层 main 冲突
export {};
