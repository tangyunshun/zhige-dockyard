/**
 * 发布前只读核对（批次 CORE-3 FINAL-ACCEPTANCE 五.2/五.3）：
 *  - 只读对比 DB 内 1.0.0 与候选 1.1.0 的质量规则字段（脱敏：仅输出规则元数据，不输出任何样例正文）；
 *  - 运行 validateComponentContract 校验候选；
 *  - 确认候选声明了非空 requiredCapabilities（能力门禁可放行）。
 * 本脚本只读，不写库、不发布、不激活、不修改合同。
 */
import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { validateComponentContract } from "../src/lib/component-contract/validators";
import { extractRequiredCapabilities } from "../src/lib/component-contract/capabilities";
import {
  C01_CANDIDATE_1_1_0,
  C02_CANDIDATE_1_1_0,
  C07_CANDIDATE_1_1_0,
} from "./candidates-core3-1.1.0";

const COMPONENTS: Array<{ id: string; candidate: typeof C01_CANDIDATE_1_1_0 }> = [
  { id: "C01", candidate: C01_CANDIDATE_1_1_0 },
  { id: "C02", candidate: C02_CANDIDATE_1_1_0 },
  { id: "C07", candidate: C07_CANDIDATE_1_1_0 },
];

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

function qualityView(c: { qualityPolicy?: Record<string, unknown>; output?: Record<string, unknown> } | null) {
  const qp = (c?.qualityPolicy ?? {}) as Record<string, unknown>;
  const dp = (qp.disclaimerPolicy ?? {}) as Record<string, unknown>;
  return {
    minOutputLength: qp.minOutputLength ?? null,
    requiredSections: Array.isArray(qp.requiredSections) ? (qp.requiredSections as unknown[]).length : 0,
    forbiddenPhrases: Array.isArray(qp.forbiddenPhrases) ? (qp.forbiddenPhrases as unknown[]).length : 0,
    requireHumanReview: qp.requireHumanReview ?? null,
    allowAutoRetry: qp.allowAutoRetry ?? null,
    maxRetryCount: qp.maxRetryCount ?? null,
    disclaimerRequired: dp.required ?? null,
    outputKind: (c?.output as Record<string, unknown> | undefined)?.kind ?? null,
  };
}

async function main() {
  for (const f of [".env.local", ".env.development.local", ".env"]) {
    loadEnvFile(path.join(process.cwd(), f));
  }

  const out: Record<string, unknown>[] = [];
  for (const { id, candidate } of COMPONENTS) {
    const rows = await prisma.componentcontract.findMany({
      where: { componentId: id, contractVersion: "1.0.0" },
      select: { id: true, lifecycle: true, contract: true },
    });
    const dbRow = rows[0];
    const dbContract = dbRow ? (dbRow.contract as unknown as { qualityPolicy?: Record<string, unknown>; output?: Record<string, unknown> }) : null;

    const dbView = qualityView(dbContract);
    const candView = qualityView(candidate as unknown as { qualityPolicy?: Record<string, unknown>; output?: Record<string, unknown> });

    let validateOk = false;
    let validateMsg = "";
    try {
      validateComponentContract(candidate as unknown as Parameters<typeof validateComponentContract>[0]);
      validateOk = true;
    } catch (e) {
      validateMsg = (e as Error)?.message || String(e);
    }
    const requiredCaps = extractRequiredCapabilities(
      candidate as unknown as Parameters<typeof extractRequiredCapabilities>[0],
    );

    out.push({
      componentId: id,
      db1_0_0: {
        found: !!dbRow,
        lifecycle: dbRow?.lifecycle ?? null,
        ...dbView,
      },
      candidate1_1_0: { ...candView },
      qualityRulesUnchanged:
        JSON.stringify(dbView) === JSON.stringify(candView),
      validate: { ok: validateOk, error: validateMsg },
      requiredCapabilitiesDeclared: requiredCaps,
      capabilityGateWillPass: requiredCaps.length > 0,
    });
  }

  console.log(JSON.stringify({ action: "PREPUBLISH_READONLY_CHECK", items: out }, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("PREPUBLISH_CHECK_FAIL", (e as Error)?.message || String(e));
  prisma.$disconnect();
  process.exit(2);
});
