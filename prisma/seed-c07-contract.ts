/**
 * C07 合同初始化 / 校验脚本（**新合同路径**）
 *
 * 本脚本已彻底退出旧运营路径：
 *  - **不再写入** component_catalog.detail.executionProfile（旧字段一律不写、不读）；
 *  - 唯一真源为 component_contract（component_contract 表，@@map("component_contract")）
 *    与 component_catalog.active_contract_id；
 *  - 只做「校验 / 按需激活」，**不改写任何合同内容**、不删除任何数据；
 *  - 模型绑定不再写入合同：执行模型由数据库唯一裁决（空间默认 -> 平台默认 -> 拒绝）。
 *
 * 安全约束：
 *  - 已存在「已激活且为 PUBLISHED」的合同时：完全幂等，写库 = false，绝不因排序或新增部署自动换绑；
 *  - 未激活但存在 PUBLISHED 合同：默认仅报告 ACTIVATION_REQUIRED；
 *    只有显式传入 --activate 才执行激活（仍只改 active_contract_id，不动合同内容）；
 *  - 换绑（把 active_contract_id 指向另一合同）：必须显式 --rebind，并输出 previous contract 供审计；
 *  - 目标合同必须存在、属于本组件、状态为 PUBLISHED，并通过平台默认部署的能力承载校验；
 *  - 不存在 PUBLISHED 合同：明确失败，要求先通过发布流程发布合同，**绝不凭空伪造合同**。
 *
 * 用法：
 *   npx tsx prisma/seed-c07-contract.ts                 # 仅校验（推荐，CI 可跑）
 *   npx tsx prisma/seed-c07-contract.ts --activate --contract-id=<id>            # 首次激活（显式目标）
 *   npx tsx prisma/seed-c07-contract.ts --activate --rebind --contract-id=<id>   # 显式换绑
 */
import fs from "fs";
import path from "path";
import { extractRequiredCapabilities, isCapabilitySatisfied } from "../src/lib/component-contract/capabilities";

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

/** 解析命令行参数（--key=value 或 --flag） */
function parseArgs(argv: string[]) {
  const out: Record<string, string | boolean> = {};
  for (const raw of argv) {
    const m = raw.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

async function main() {
  const cwd = process.cwd();
  for (const f of [".env.local", ".env.development.local", ".env"]) {
    loadEnvFile(path.join(cwd, f));
  }

  const args = parseArgs(process.argv.slice(2));
  const activate = args.activate === true;
  // 换绑必须显式声明；未声明时任何情况都不得改动已有激活合同
  const rebind = args.rebind === true;
  // 显式激活目标（二选一）；严禁自动挑选，尤其禁止 published[0]
  const contractIdArg = typeof args["contract-id"] === "string" ? args["contract-id"].trim() : "";
  const contractVersionArg = typeof args["contract-version"] === "string" ? args["contract-version"].trim() : "";

  const { prisma } = await import("../src/lib/prisma");

  // 组件 ID：显式 --component-id 优先，其次 PILOT_COMPONENT_ID 环境变量，最后默认 C07。
  // 只读取「组件标识」，不读取任何旧合同字段（旧合同读取模块已物理删除）。
  const id =
    (typeof args["component-id"] === "string" ? args["component-id"].trim() : "") ||
    process.env.PILOT_COMPONENT_ID?.trim() ||
    "C07";

  const comp = await prisma.componentcatalog.findUnique({
    where: { id },
    select: { id: true, activeContractId: true, detail: true },
  });
  if (!comp) {
    console.error(`COMPONENT_NOT_FOUND ${id}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // 旧路径巡检：仅**检测并告警**，绝不写入
  const detailKeys = comp.detail && typeof comp.detail === "object" && !Array.isArray(comp.detail)
    ? Object.keys(comp.detail as Record<string, unknown>)
    : [];
  const hasLegacyExecutionProfile = detailKeys.includes("executionProfile");

  const contracts = await prisma.componentcontract.findMany({
    where: { componentId: id },
    select: { id: true, componentId: true, contractVersion: true, lifecycle: true, publishedAt: true, contract: true },
    orderBy: { createdAt: "asc" },
  });
  const published = contracts.filter((c) => c.lifecycle === "PUBLISHED");
  const active = comp.activeContractId
    ? await prisma.componentcontract.findUnique({
        where: { id: comp.activeContractId },
        select: { id: true, contractVersion: true, lifecycle: true },
      })
    : null;

  // 情形一：已存在有效激活合同（PUBLISHED）且未显式 --rebind
  //  - 完全幂等：绝不因排序变化或新增部署自动换绑；
  //  - 若同时指定了「不同」的目标合同，明确拒绝并要求显式 --rebind，避免静默忽略管理员意图。
  if (active && active.lifecycle === "PUBLISHED" && !rebind) {
    const wantsOtherTarget =
      (!!contractIdArg && contractIdArg !== active.id) ||
      (!!contractVersionArg && contractVersionArg !== active.contractVersion);
    if (wantsOtherTarget) {
      console.error(
        `SEED_FAIL REBIND_FLAG_REQUIRED: 组件 ${id} 当前已激活 ${active.id}@${active.contractVersion}，` +
          `但本次指定了不同的目标合同（${contractIdArg || `--contract-version=${contractVersionArg}`}）；` +
          "换绑必须显式追加 --rebind，脚本绝不隐式改绑。",
      );
      await prisma.$disconnect();
      process.exit(2);
    }
    console.log(
      JSON.stringify(
        {
          id,
          action: "KEEP",
          reason: "C07 已存在激活且为 PUBLISHED 的合同，保持原激活合同不变。",
          activeContractId: active.id,
          activeContractVersion: active.contractVersion,
          publishedCount: published.length,
          wroteDatabase: false,
          legacyExecutionProfilePresent: hasLegacyExecutionProfile,
          legacyFieldWritten: false,
        },
        null,
        2,
      ),
    );
    await prisma.$disconnect();
    return;
  }

  // 情形二：尚无 PUBLISHED 合同 → 明确失败，绝不伪造
  if (published.length === 0) {
    console.error(
      `SEED_FAIL NO_PUBLISHED_CONTRACT: 组件 ${id} 尚无 PUBLISHED 合同，请先通过发布流程发布合同；` +
        "本脚本绝不凭空伪造合同，也不再写入 detail.executionProfile。",
    );
    await prisma.$disconnect();
    process.exit(2);
  }

  // 情形三：需要激活/换绑但未给显式目标 → **必须显式指定目标**，严禁自动挑选（尤其禁止 published[0]）
  if (!contractIdArg && !contractVersionArg) {
    const why = rebind
      ? "已显式传入 --rebind（换绑），但未指定换绑目标合同。"
      : `组件 ${id} 当前没有有效激活的 PUBLISHED 合同。`;
    console.error(
      `SEED_FAIL CONTRACT_ACTIVATION_TARGET_REQUIRED: ${why}` +
        `现有 PUBLISHED 候选 ${published.length} 个（${published.map((c) => `${c.id}@${c.contractVersion}`).join(", ")}）。` +
        "必须显式指定 --contract-id=<id> 或 --contract-version=<version>，脚本绝不自动挑选合同。",
    );
    await prisma.$disconnect();
    process.exit(2);
  }
  if (contractIdArg && contractVersionArg) {
    console.error(
      "SEED_FAIL 参数冲突: --contract-id 与 --contract-version 只能二选一（两者同时提供会产生歧义）。",
    );
    await prisma.$disconnect();
    process.exit(2);
  }

  // 解析显式目标
  const targetRow = contractIdArg
    ? contracts.find((c) => c.id === contractIdArg)
    : contracts.find((c) => c.contractVersion === contractVersionArg);
  if (!targetRow) {
    console.error(
      `SEED_FAIL CONTRACT_ACTIVATION_TARGET_NOT_FOUND: 未找到指定合同（` +
        (contractIdArg ? `--contract-id=${contractIdArg}` : `--contract-version=${contractVersionArg}`) +
        `），组件 ${id} 下的合同为：${contracts.map((c) => `${c.id}@${c.contractVersion}[${c.lifecycle}]`).join(", ") || "（无）"}。`,
    );
    await prisma.$disconnect();
    process.exit(2);
  }
  if (targetRow.componentId !== id) {
    console.error(
      `SEED_FAIL CONTRACT_ACTIVATION_TARGET_COMPONENT_MISMATCH: 目标合同 ${targetRow.id} 所属组件 ` +
        `[${targetRow.componentId}] 与目标组件 [${id}] 不一致。`,
    );
    await prisma.$disconnect();
    process.exit(2);
  }
  if (targetRow.lifecycle !== "PUBLISHED") {
    console.error(
      `SEED_FAIL CONTRACT_ACTIVATION_TARGET_NOT_PUBLISHED: 目标合同 ${targetRow.id} 当前处于 ` +
        `[${targetRow.lifecycle}] 状态，只有 PUBLISHED 合同允许被激活。`,
    );
    await prisma.$disconnect();
    process.exit(2);
  }

  // 二.5：目标合同必须通过「当前模型部署 + 能力」校验（数据库驱动，严禁硬编码厂商/模型清单）。
  // 可用部署池 = 部署与供应商「同时启用」的部署。已配置平台默认时必须由平台默认部署承载（它就是实际执行用的部署）。
  const { getPlatformDefaultDeploymentId } = await import("../src/lib/model-registry");
  const platformDefaultId = await getPlatformDefaultDeploymentId();
  const enabledDeployments = await prisma.modeldeployment.findMany({
    where: { enabled: true, provider: { enabled: true } },
    select: { id: true, modelId: true, capabilities: true, provider: { select: { id: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (enabledDeployments.length === 0) {
    console.error(
      "SEED_FAIL MODEL_NOT_ALLOWED: 数据库中没有「部署与供应商同时启用」的模型部署，无法验证目标合同的能力承载。",
    );
    await prisma.$disconnect();
    process.exit(2);
  }
  let capabilityPool = enabledDeployments;
  if (platformDefaultId) {
    const platformDefaultDep = enabledDeployments.find((d) => d.id === platformDefaultId);
    if (!platformDefaultDep) {
      console.error(
        `SEED_FAIL MODEL_NOT_ALLOWED: 已配置的平台默认部署 ${platformDefaultId} 不存在，或其部署/供应商处于禁用状态；` +
          "部署与供应商必须同时启用。",
      );
      await prisma.$disconnect();
      process.exit(2);
    }
    capabilityPool = [platformDefaultDep];
  }
  const capsOf = (d: (typeof enabledDeployments)[number]): string[] =>
    Array.isArray(d.capabilities)
      ? (d.capabilities as unknown[]).filter((v): v is string => typeof v === "string")
      : [];
  const rawContract = targetRow.contract as Record<string, unknown> | null;
  // 统一能力提取：优先 executionPlan.steps[].requiredCapabilities，并兼容合法顶层字段；
  // 严禁组件 ID 特判。修复此前只读取顶层 requiredCapabilities 导致能力门禁被静默跳过的缺陷。
  const requiredCapabilities = extractRequiredCapabilities(rawContract);
  // 使用统一门禁判定：空能力集合显式判为不满足，杜绝「空能力静默通过所有部署」。
  const capable = capabilityPool.filter((d) => isCapabilitySatisfied(capsOf(d), requiredCapabilities));
  if (capable.length === 0) {
    console.error(
      `SEED_FAIL MODEL_CAPABILITY_UNSATISFIED: 目标合同 ${targetRow.id} 声明需要能力 [${requiredCapabilities.join(", ") || "（无）"}]，` +
        `但可用部署 ${capabilityPool
          .map((d) => `${d.provider.id}/${d.modelId}[${capsOf(d).join("|") || "无"}]`)
          .join(", ")} 均无法完整承载。`,
    );
    await prisma.$disconnect();
    process.exit(2);
  }
  const capabilityCarrier = capable[0];

  if (!activate) {
    console.log(
      JSON.stringify(
        {
          id,
          action: "ACTIVATION_REQUIRED",
          reason: "已按显式目标定位到 PUBLISHED 合同，但未传入 --activate；如需激活请追加 --activate。",
          candidateContractId: targetRow.id,
          candidateContractVersion: targetRow.contractVersion,
          publishedCount: published.length,
          wroteDatabase: false,
          legacyExecutionProfilePresent: hasLegacyExecutionProfile,
          legacyFieldWritten: false,
        },
        null,
        2,
      ),
    );
    await prisma.$disconnect();
    return;
  }

  // 只有「显式 --activate + 显式目标」才允许写 activeContractId（不改合同内容、不删除、不写旧字段）
  await prisma.componentcatalog.update({
    where: { id },
    data: { activeContractId: targetRow.id },
  });

  const after = await prisma.componentcatalog.findUnique({
    where: { id },
    select: { activeContractId: true },
  });

  // 审计：换绑必须留下 previous contract 证据。
  // 本脚本没有真实 operator 上下文（operationlog.userId 为必填外键），故以结构化审计输出为准；
  // 带操作人的 DB 审计由后台 activate/archive 接口在同一事务内落库。
  const isRebind = !!active && active.id !== targetRow.id;
  console.log(
    JSON.stringify(
      {
        id,
        action: isRebind ? "REBIND" : "ACTIVATE",
        reason: isRebind
          ? "按 --activate --rebind + 显式目标换绑激活 PUBLISHED 合同（仅设置 activeContractId）。"
          : "按 --activate + 显式目标激活 PUBLISHED 合同（仅设置 activeContractId）。",
        activeContractId: after?.activeContractId ?? null,
        activeContractVersion: targetRow.contractVersion,
        previousContractId: active?.id ?? null,
        previousContractVersion: active?.contractVersion ?? null,
        previousContractLifecycle: active?.lifecycle ?? null,
        rebindExplicit: isRebind ? rebind : false,
        capabilityCarrierDeployment: `${capabilityCarrier.provider.id}/${capabilityCarrier.modelId}`,
        verifiedRequiredCapabilities: requiredCapabilities,
        publishedCount: published.length,
        wroteDatabase: true,
        wroteLegacyExecutionProfile: false,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("SEED_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});
