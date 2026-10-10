/**
 * 批次 2E 组件合同迁移（C16、C17、C18、C19）
 *
 * 规则（严格遵循批次约束）：
 *  - 仅处理 C16/C17/C18/C19，**绝不触碰 C07**、**绝不触碰暂停中的 C09**，也绝不触碰其它批次组件；
 *  - 全部输出类型仅限 DOCUMENT / TABLE / JSON；业务需要的其它类型一律登记为阻断项（**不得发布伪支持合同**）；
 *     阻断事实以结构化三要素写入 **合同 JSON 的 `unsupportedRequirements`**（随不可变快照一同落库）：
 *       [{ requirement: 不被支持的需求, reason: 客观依据, suggestedAlternative: 等价替代方案 }]；
 *     · C18：「ER 实体关系图（图形化输出）」→ 引擎仅支持 DOCUMENT/TABLE/JSON 且无图形渲染器；
 *       替代为 Markdown 关系说明 + DDL（本次以 TABLE/JSON 等价表达，待负责人裁决）。
 *  - C18 因上述图形化阻断项，仅创建/保留 DRAFT，绝不 PUBLISH/激活；
 *     幂等注意：本脚本在「该版本合同已存在」时不覆盖既有合同体，
 *     若需将阻断事实补记进已存在的 DRAFT，请执行 prisma/record-blocking-facts.ts。
 *  - 能力裁决：仅当「当前启用的平台默认部署能力 ⊇ 合同 requiredCapabilities」时才 PUBLISH + 激活；
 *    缺失能力者仅创建 DRAFT，绝不强行 PUBLISH/激活；
 *  - 幂等：已存在相同版本合同则跳过；已存在其它有效激活合同则保持不换绑（不因排序/新增部署自动改绑）；
 *  - 不写 component_catalog.detail.executionProfile（旧字段一律不写）；
 *  - 不修改价格、结算开关、BYOK、C07/C09 合同与 .env/.env.local；
 *  - 默认只读预演（dry-run），必须显式传入 --apply 才会写库。
 *
 * 用法：npx tsx prisma/migrate-c16-c19-contracts.ts [--apply] [--target=C17]
 *       不带 --apply 时仅做只读预演（dry-run），不写库。
 */

// 复用的激活裁决纯函数（与 C12-C15 同一份实现，避免语义漂移）
export { evaluateActivationEligibility } from "../src/lib/component-contract/catalog-contracts-c01-c05";

async function main() {
  // 本脚本**不主动读取 .env / .env.local**，数据库连接所需环境变量由 Prisma Client 自动加载。
  const apply = process.argv.includes("--apply");

  // 支持单组件安全隔离模式：--target=C17（仅处理指定组件，严禁触碰其他组件）
  const targetArg = process.argv.find((arg) => arg.startsWith("--target="));
  const explicitTarget = targetArg ? targetArg.split("=")[1]?.trim().toUpperCase() : null;

  const { prisma } = await import("../src/lib/prisma");
  const { createDraftContract, publishContract } = await import("../src/lib/component-contract/repository");
  const { getPlatformDefaultDeploymentId } = await import("../src/lib/model-registry");
  const {
    BATCH_2E,
    BATCH_2E_COMPONENT_IDS,
    BATCH_2E_FORBIDDEN_IDS,
    SUPPORTED_OUTPUT_KINDS,
    evaluateActivationEligibility,
  } = await import("../src/lib/component-contract/catalog-contracts-c16-c19");

  // 硬防线 1：批次目标集合必须精确等于 C16/C17/C18/C19，任何越界立即中止
  const allowed = new Set<string>(BATCH_2E_COMPONENT_IDS as readonly string[]);
  const forbidden = new Set<string>(BATCH_2E_FORBIDDEN_IDS as readonly string[]);

  if (explicitTarget) {
    if (!allowed.has(explicitTarget) || forbidden.has(explicitTarget)) {
      console.error(
        `MIGRATE_FAIL TARGET_SCOPE_VIOLATION: 指定的单组件目标 [${explicitTarget}] 不合法！` +
          `仅允许在 [${Array.from(allowed).join("/")}] 中指定，且绝对禁止指定 [${Array.from(forbidden).join("/")}]。`,
      );
      process.exit(2);
    }
  }

  // 待处理目标列表：若指定了 explicitTarget 则严格单组件隔离，绝不波及批次内其他组件
  const targetItems = explicitTarget
    ? BATCH_2E.filter((item) => item.componentId === explicitTarget)
    : BATCH_2E;

  for (const { componentId } of targetItems) {
    const id = componentId as string;
    if (!allowed.has(id) || forbidden.has(id)) {
      console.error(
        `MIGRATE_FAIL BATCH_SCOPE_VIOLATION: 批次 2E 只允许 C16/C17/C18/C19（禁止触碰 ${Array.from(forbidden).join("/")}），实际包含 ${id}`,
      );
      process.exit(2);
    }
  }

  // 硬防线 2：输出类型门禁。任何非 DOCUMENT/TABLE/JSON 的输出一律拒绝迁移（不得发布伪支持合同）
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

  // 操作人：真实存在的超级管理员（operationlog.userId 为必填外键）
  const admin = await prisma.user.findFirst({
    where: { role: { in: ["SUPER_ADMIN", "superadmin", "SUPERADMIN", "super_admin"] } },
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

  for (const { componentId, contract, analysis } of targetItems) {
    const id = componentId as string;
    if (forbidden.has(id)) continue; // 绝不触碰 C07 / C09

    const comp = await prisma.componentcatalog.findUnique({ where: { id }, select: { activeContractId: true } });
    const existing = await prisma.componentcontract.findFirst({
      where: { componentId: id, contractVersion: contract.contractVersion },
      select: { id: true, lifecycle: true },
    });
    // 已存在的其它 PUBLISHED 合同（用于「不得自动换绑」的只读判定）
    const otherPublished = await prisma.componentcontract.findFirst({
      where: { componentId: id, lifecycle: "PUBLISHED" },
      select: { id: true, contractVersion: true },
    });

    const eligibility = evaluateActivationEligibility(contract, deploymentCapabilities);
    const hasUnsupportedRequirements =
      Array.isArray(analysis.unsupportedRequirements) && analysis.unsupportedRequirements.length > 0;
    const isEligible = eligibility.eligible && !hasUnsupportedRequirements;

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
      alreadyExisting: existing ? `${existing.id}@${existing.lifecycle}` : null,
      otherPublishedContract: otherPublished ? `${otherPublished.id}@${otherPublished.contractVersion}` : null,
      unsupportedRequirements: analysis.unsupportedRequirements,
      action: "",
    };

    if (!apply) {
      if (hasUnsupportedRequirements) {
        row.action = "BLOCKED_UNSUPPORTED_REQUIREMENT";
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

    // 2) 业务阻断项门禁：存在 unsupportedRequirements 则只允许保留/创建 DRAFT，绝不得 PUBLISH/激活
    if (hasUnsupportedRequirements) {
      row.action = existing ? "SKIP_KEEP_DRAFT" : "CREATE_DRAFT_ONLY";
    } else if (eligibility.eligible) {
      // 3) 能力达标且无其它 active 冲突才 PUBLISH + 激活；否则保持 DRAFT（BLOCKED，绝不强行发布）
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
      } else {
        row.action = "SKIP_KEEP_OTHER_ACTIVE";
      }
    } else {
      row.action = existing ? "SKIP_KEEP_DRAFT" : "CREATE_DRAFT_ONLY";
    }
    row.missingMaterials = analysis.missingMaterials;
    results.push(row);
  }

  // 明确非破坏性回滚指引（Rollback Guide）
  const rollbackGuide = {
    target: explicitTarget || "ALL_BATCH_2E",
    rollbackMethod: "NON_DESTRUCTIVE_ARCHIVE_AND_UNBIND",
    instructions: [
      "1. 归档已发布版本：调用 repository.archiveContract({ componentId, contractVersion, operatorId })，同事务原子升级为 ARCHIVED 并生成不可变审计证据；",
      "2. 解绑激活指针：将 component_catalog.active_contract_id 重置为 NULL（恢复为未配置状态）；",
      "3. 审计可追溯：operationlog 自动记录归档事件与操作人快照；",
      "4. 安全红线保障：严禁执行任何 DROP/TRUNCATE/DELETE 操作，保证数据与审计链路绝对完整。"
    ],
  };

  console.log(
    JSON.stringify(
      {
        batch: "2E",
        apply,
        targetMode: explicitTarget ? "SINGLE_COMPONENT_ISOLATION" : "BATCH_ALL",
        target: explicitTarget ? [explicitTarget] : BATCH_2E_COMPONENT_IDS,
        forbidden: Array.from(forbidden),
        supportedOutputKinds: SUPPORTED_OUTPUT_KINDS,
        deploymentCapabilities,
        superAdmin: admin.id,
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
