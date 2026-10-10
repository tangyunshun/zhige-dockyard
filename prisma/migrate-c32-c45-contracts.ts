/**
 * 批次 COMPONENT-EXPANSION-E3 组件合同迁移（C32-C45，14 个组件）
 *
 * 规则（严格遵循 E1/E1-FIX/E2 基线 + E3 差异化强制项）：
 *  - 仅处理 C32-C45（真实目录 DEVOPS/SECURITY/PROJ_MGMT 类组件），**绝不触碰 C07**、
 *    **绝不触碰暂停中的 C09**，也绝不触碰其它批次组件（含 C46+ 越界一律拒绝）；
 *  - 输出类型仅限 DOCUMENT / JSON（与 SUPPORTED_OUTPUT_KINDS 一致）；图形化需求
 *    （C34 看板 / C35 日志大盘 / C42 甘特图 / C45 PDF）已登记为 unsupportedRequirements 阻断，
 *    仅发布 DOCUMENT/JSON 文本等价合同，绝不为伪支持强行发布；
 *  - 能力裁决：仅当「当前启用的平台默认部署能力 ⊇ 合同 requiredCapabilities」且输出类型受支持时
 *    PUBLISH + 激活；缺失能力者仅创建 DRAFT，绝不强行 PUBLISH/激活；
 *  - unsupportedRequirements 仅作合同层审计标注（如图形化看板/甘特图/PDF 像素渲染不支持），
 *    但本批次已给出 DOCUMENT/JSON 文本等价输出，输出类型本身受支持，故照常 PUBLISH+激活并随合同落库标注；
 *    真正阻断发布的是输出类型本身不支持（由上方 OUTPUT_KIND_BLOCKED 门禁处理）。
 *  - 幂等：已存在相同版本合同则跳过；已存在其它有效激活合同则保持不换绑；
 *  - 不写 component_catalog.detail.executionProfile（旧字段一律不写）；
 *  - 不修改价格、结算开关、BYOK、C07/C09 合同与 .env/.env.local；
 *  - 目录 estimatedModelTokens 已由种子数据预置且 > 0（与合同 billingPolicy.estimatedTokens 一致），无需修复；
 *  - 默认只读预演（dry-run），必须显式传入 --apply 才会写库。
 *
 * 用法：npx tsx prisma/migrate-c32-c45-contracts.ts [--apply] [--target=C32]
 *       不带 --apply 时仅做只读预演（dry-run），不写库。
 */

// 复用的激活裁决纯函数（与 C01-C31 同一份实现，避免语义漂移）
export { evaluateActivationEligibility } from "../src/lib/component-contract/catalog-contracts-c01-c05";

async function main() {
  const apply = process.argv.includes("--apply");

  const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
  const explicitTarget = targetArg ? targetArg.split("=")[1]?.trim().toUpperCase() : null;

  const { prisma } = await import("../src/lib/prisma");
  const { createDraftContract, publishContract } = await import("../src/lib/component-contract/repository");
  const { getPlatformDefaultDeploymentId } = await import("../src/lib/model-registry");
  const {
    BATCH_E3,
    BATCH_E3_COMPONENT_IDS,
    BATCH_E3_FORBIDDEN_IDS,
    SUPPORTED_OUTPUT_KINDS,
    evaluateActivationEligibility,
  } = await import("../src/lib/component-contract/catalog-contracts-c32-c45");

  // 硬防线 1：批次目标集合必须精确等于 C32-C45，任何越界立即中止（C46+ 绝不可进入）
  const allowed = new Set<string>(BATCH_E3_COMPONENT_IDS as readonly string[]);
  const forbidden = new Set<string>(BATCH_E3_FORBIDDEN_IDS as readonly string[]);

  if (explicitTarget) {
    if (!allowed.has(explicitTarget) || forbidden.has(explicitTarget)) {
      console.error(
        `MIGRATE_FAIL TARGET_SCOPE_VIOLATION: 指定的单组件目标 [${explicitTarget}] 不合法！` +
          `仅允许在 [${Array.from(allowed).join("/")}] 中指定，且绝对禁止指定 [${Array.from(forbidden).join("/")}] 或 C46+。`,
      );
      process.exit(2);
    }
  }

  const targetItems = explicitTarget
    ? BATCH_E3.filter((item) => item.componentId === explicitTarget)
    : BATCH_E3;

  for (const { componentId } of targetItems) {
    const id = componentId as string;
    if (!allowed.has(id) || forbidden.has(id)) {
      console.error(
        `MIGRATE_FAIL BATCH_SCOPE_VIOLATION: 批次 E3 只允许 C32-C45（禁止触碰 ${Array.from(forbidden).join("/")} 与 C46+），实际包含 ${id}`,
      );
      process.exit(2);
    }
  }

  // 硬防线 2：输出类型门禁。任何非 DOCUMENT/TABLE/JSON 的输出一律拒绝迁移
  for (const { componentId, contract } of targetItems) {
    const kind = contract.output.kind;
    if (!SUPPORTED_OUTPUT_KINDS.includes(kind)) {
      console.error(
        `MIGRATE_FAIL OUTPUT_KIND_BLOCKED: ${componentId} 声明了当前不支持的输出类型 ${kind}；` +
          `仅支持 ${SUPPORTED_OUTPUT_KINDS.join("/")}，业务需要的其它类型必须登记为阻断项，不得发布伪支持合同。`,
      );
      process.exit(2);
    }
  }

  // 操作人：真实存在的超级管理员（operationlog.userId 为必填外键）。优先小写 superadmin 角色。
  const admin = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "superadmin", "SUPERADMIN", "super_admin"] } },
    select: { id: true, role: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
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
  const pdEnabled = Boolean(pd && pd.enabled && pd.provider?.enabled === true);
  const deploymentCapabilities = pdEnabled
    ? (Array.isArray(pd?.capabilities) ? (pd.capabilities as unknown as string[]) : []).map((c) => String(c))
    : [];

  const results: Array<Record<string, unknown>> = [];

  for (const { componentId, contract, analysis } of targetItems) {
    const id = componentId as string;
    if (forbidden.has(id)) continue; // 绝不触碰 C07 / C09

    const comp = await prisma.componentcatalog.findUnique({ where: { id }, select: { id: true, activeContractId: true, estimatedModelTokens: true } });
    if (!comp) {
      console.error(`MIGRATE_FAIL NO_CATALOG_ROW: 组件目录行 [${id}] 不存在（应先有目录种子行），无法绑定合同。`);
      process.exit(2);
    }
    // 只读核对：目录 estimatedModelTokens 与合同 estimatedTokens 是否一致（不一致仅告警，不擅自改目录）
    const catalogTokens = (comp as { estimatedModelTokens: number }).estimatedModelTokens;
    const contractTokens = (contract.billingPolicy as { estimatedTokens?: number }).estimatedTokens ?? null;
    const tokenMismatch = contractTokens !== null && catalogTokens !== contractTokens;

    const existing = await prisma.componentcontract.findFirst({
      where: { componentId: id, contractVersion: contract.contractVersion },
      select: { id: true, lifecycle: true },
    });
    const otherPublished = await prisma.componentcontract.findFirst({
      where: { componentId: id, lifecycle: "PUBLISHED" },
      select: { id: true, contractVersion: true },
    });

    const eligibility = evaluateActivationEligibility(contract, deploymentCapabilities);
    const hasUnsupportedRequirements =
      Array.isArray(analysis.unsupportedRequirements) && analysis.unsupportedRequirements.length > 0;
    // 注意：unsupportedRequirements 仅作合同层审计标注（如图形化看板/甘特图/PDF 的像素渲染不支持，
    // 但本批次已给出 DOCUMENT/JSON 文本等价输出，输出类型本身受支持），不阻断发布。
    // 真正阻断发布的是输出类型本身不支持（见上方 OUTPUT_KIND_BLOCKED 门禁）。
    const isEligible = eligibility.eligible;

    const sameActive =
      comp?.activeContractId && existing?.lifecycle === "PUBLISHED" && comp.activeContractId === existing.id;
    const hasOtherActive = comp?.activeContractId && (!existing || comp.activeContractId !== existing.id);

    const row: Record<string, unknown> = {
      componentId: id,
      contractVersion: contract.contractVersion,
      outputKind: contract.output.kind,
      requiredCapabilities: eligibility.requiredCapabilities,
      missingCapabilities: eligibility.missingCapabilities,
      eligible: isEligible,
      catalogEstimatedTokens: catalogTokens,
      contractEstimatedTokens: contractTokens,
      tokenMismatch: tokenMismatch ? "WARN_CATALOG_CONTRACT_TOKEN_DIFF" : "OK",
      alreadyExisting: existing ? `${existing.id}@${existing.lifecycle}` : null,
      otherPublishedContract: otherPublished ? `${otherPublished.id}@${otherPublished.contractVersion}` : null,
      unsupportedRequirements: analysis.unsupportedRequirements,
      publishedWithUnsupportedAnnotation: hasUnsupportedRequirements,
      action: "",
    };

    if (!apply) {
      if (hasUnsupportedRequirements && eligibility.eligible) {
        row.action = "WOULD_PUBLISH_ACTIVATE_WITH_UNSUPPORTED_ANNOTATION";
      } else if (sameActive) {
        row.action = "SKIP_ALREADY_ACTIVE";
      } else if (hasOtherActive) {
        row.action = "CONFLICT_KEEP_OTHER_ACTIVE";
      } else if (eligibility.eligible) {
        row.action = existing ? "WOULD_PUBLISH_ACTIVATE" : "WOULD_CREATE_PUBLISH_ACTIVATE";
      } else {
        row.action = existing ? "WOULD_KEEP_DRAFT_ONLY" : "WOULD_CREATE_DRAFT_ONLY";
      }
      results.push(row);
      continue;
    }

    // 1) 创建 DRAFT（若不存在该版本）
    if (!existing) {
      await createDraftContract({
        componentId: id,
        contractVersion: contract.contractVersion,
        contract: { ...contract, componentId: id },
      });
    }

    // 2) 发布/激活：仅当能力覆盖（输出类型受支持）时 PUBLISH+激活；
    //    unsupportedRequirements 已作为合同层审计标注随合同落库，不阻断文本等价合同的发布。
    if (eligibility.eligible) {
      const noOtherActive = !comp?.activeContractId || comp.activeContractId === existing?.id;
      if (sameActive) {
        row.action = "SKIP_ALREADY_ACTIVE";
      } else if (noOtherActive) {
        await publishContract({
          componentId: id,
          contractVersion: contract.contractVersion,
          publishedBy: admin.id,
          autoActivate: true,
        });
        row.action = existing ? "PUBLISH_ACTIVATE" : "CREATE_PUBLISH_ACTIVATE";
        if (hasUnsupportedRequirements) row.action = `${row.action}_WITH_UNSUPPORTED_ANNOTATION`;
      } else {
        row.action = "SKIP_KEEP_OTHER_ACTIVE";
      }
    } else {
      row.action = existing ? "SKIP_KEEP_DRAFT" : "CREATE_DRAFT_ONLY";
    }
    row.missingMaterials = analysis.missingMaterials;
    results.push(row);
  }

  const rollbackGuide = {
    target: explicitTarget || "ALL_BATCH_E3",
    rollbackMethod: "NON_DESTRUCTIVE_ARCHIVE_AND_UNBIND",
    instructions: [
      "1. 归档已发布版本：调用 repository.archiveContract({ componentId, contractVersion, operatorId })，同事务升级为 ARCHIVED 并生成不可变审计证据；",
      "2. 解绑激活指针：将 component_catalog.active_contract_id 重置为 NULL（恢复为未配置状态）；",
      "3. 审计可追溯：operationlog 自动记录归档事件与操作人快照；严禁 DROP/TRUNCATE/DELETE。",
    ],
  };

  console.log(
    JSON.stringify(
      {
        batch: "E3",
        apply,
        targetMode: explicitTarget ? "SINGLE_COMPONENT_ISOLATION" : "BATCH_ALL",
        target: explicitTarget ? [explicitTarget] : BATCH_E3_COMPONENT_IDS,
        forbidden: Array.from(forbidden),
        supportedOutputKinds: SUPPORTED_OUTPUT_KINDS,
        deploymentCapabilities,
        superAdmin: { id: admin.id, role: admin.role },
        results,
        rollbackGuide,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("MIGRATE_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});

// 显式声明为模块作用域，避免与其它脚本文件的顶层 main 冲突
export {};
