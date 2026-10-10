/**
 * 批次 E1-FIX：将「结构化阻断事实」补记进已存在的 DRAFT 合同 JSON
 *
 * 背景：批次 2E 迁移脚本在「该版本合同已存在」时不覆盖既有合同体，
 *       因此已落库的 C18 DRAFT 尚未携带后来补充的 unsupportedRequirements。
 *       本脚本负责把该字段补记进去，使「候选源文件 → 迁移脚本注释 → 合同 JSON(DB)」三方一致。
 *
 * 写入目标：合同 JSON 的 unsupportedRequirements，结构化三要素：
 *   [{ requirement: 不被支持的需求, reason: 客观依据, suggestedAlternative: 等价替代方案 }]
 *
 * 数据源唯一真源：候选合同模块的导出对象（严禁在本脚本内二次硬编码事实文本）。
 *
 * 安全约束：
 *  - 仅处理显式允许的 C18 / C12，绝不触碰其它组件（含 C07 / C09）；
 *  - 仅更新 lifecycle === "DRAFT" 的合同；命中非 DRAFT 一律跳过并告警（严禁改写已发布合同）；
 *  - 绝不变更 lifecycle、componentId、contractVersion，也绝不 PUBLISH/激活；
 *  - 默认只读预演（dry-run），必须显式 --apply 才写库。
 *
 * 用法：npx tsx prisma/record-blocking-facts.ts [--apply]
 */

/**
 * 键序无关的规范化序列化：MySQL JSON 列会对对象键做归一化重排，
 * 直接 JSON.stringify 比对会产生「内容相同但字符串不同」的假差异，
 * 因此比对与幂等判定一律使用本函数（递归按键名字典序稳定化）。
 */
function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value) as string;
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`)
    .join(",")}}`;
}

async function main() {
  const apply = process.argv.includes("--apply");

  const ALLOWED_TARGETS = new Set(["C18", "C12"]);

  const { prisma } = await import("../src/lib/prisma");
  const { C18_CONTRACT } = await import("../src/lib/component-contract/catalog-contracts-c16-c19");
  const { C12_CONTRACT } = await import("../src/lib/component-contract/catalog-contracts-c12-c15");

  const plan = [
    { componentId: "C18", source: C18_CONTRACT },
    { componentId: "C12", source: C12_CONTRACT },
  ];

  const results: Array<Record<string, unknown>> = [];

  for (const { componentId, source } of plan) {
    // 硬防线：目标集合最小化，越界立即中止
    if (!ALLOWED_TARGETS.has(componentId)) {
      console.error(`RECORD_FAIL SCOPE_VIOLATION: 目标 [${componentId}] 不在允许集合内。`);
      process.exit(2);
    }

    const row = await prisma.componentcontract.findFirst({
      where: { componentId, contractVersion: source.contractVersion },
      select: { id: true, lifecycle: true, contract: true, contractVersion: true, updatedAt: true },
    });

    if (!row) {
      results.push({ componentId, action: "SKIP_ROW_NOT_FOUND", contractVersion: source.contractVersion });
      continue;
    }

    // 只允许补记 DRAFT：已 PUBLISHED/ARCHIVED 的合同一律不得改写本体
    if (row.lifecycle !== "DRAFT") {
      results.push({
        componentId,
        action: "SKIP_NOT_DRAFT",
        contractId: row.id,
        lifecycle: row.lifecycle,
        reason: "仅允许向 DRAFT 合同补记阻断事实，禁止改写已发布/已归档合同本体",
      });
      continue;
    }

    const before = (row.contract || {}) as Record<string, unknown>;
    const beforeUr = before.unsupportedRequirements ?? null;
    const nextUr = source.unsupportedRequirements ?? [];
    const unchanged = canonicalStringify(beforeUr) === canonicalStringify(nextUr);

    const record: Record<string, unknown> = {
      componentId,
      contractId: row.id,
      contractVersion: row.contractVersion,
      lifecycle: row.lifecycle,
      before: beforeUr,
      after: nextUr,
      action: "",
    };

    if (unchanged) {
      record.action = apply ? "SKIP_ALREADY_IN_SYNC" : "WOULD_SKIP_ALREADY_IN_SYNC";
    } else if (!apply) {
      record.action = "WOULD_RECORD_BLOCKING_FACTS";
    } else {
      await prisma.componentcontract.update({
        where: { id: row.id },
        data: { contract: { ...before, unsupportedRequirements: nextUr } as never },
      });
      // 回读校验：确认事实已真实落库且生命周期未被改动
      const after = await prisma.componentcontract.findUnique({
        where: { id: row.id },
        select: { lifecycle: true, contract: true },
      });
      const persisted = ((after?.contract || {}) as Record<string, unknown>).unsupportedRequirements;
      const ok =
        after?.lifecycle === "DRAFT" &&
        canonicalStringify(persisted) === canonicalStringify(nextUr);
      record.action = ok ? "RECORDED_AND_VERIFIED" : "RECORD_FAILED";
      if (!ok) process.exitCode = 2;
    }

    results.push(record);
  }

  console.log(
    JSON.stringify(
      {
        batch: "E1-FIX",
        apply,
        targets: Array.from(ALLOWED_TARGETS),
        sourceOfTruth: [
          "src/lib/component-contract/catalog-contracts-c16-c19.ts (C18_CONTRACT.unsupportedRequirements)",
          "src/lib/component-contract/catalog-contracts-c12-c15.ts (C12_CONTRACT.unsupportedRequirements)",
        ],
        results,
        rollbackGuide:
          "非破坏性回滚：仅需将目标行 contract.unsupportedRequirements 置回原值即可；" +
          "本脚本不产生 DELETE/DROP，lifecycle 与激活指针均未被触碰。",
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("RECORD_FAIL", (e as Error)?.message || String(e));
  process.exit(2);
});

export {};
