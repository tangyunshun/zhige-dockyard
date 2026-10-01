/**
 * 发布 C01/C02/C07 @ 1.1.0（批次 CORE-3 CLOSURE-FINAL 四）
 *
 * 流程（严格经 repository，每步同事务审计）：
 *   createDraftContract → validateComponentContract → 能力门禁(resolveDefaultDeployment)
 *   → publishContract(autoActivate=false) → activateContract
 * 完成后：只读核对 activeContractId 指向 1.1.0 PUBLISHED 且质量规则符合规范；
 * 最后从数据库只读重导 fixture（active-contracts.snapshot.ts），绝不手工编辑。
 *
 * 安全约束：
 *  - 不修改 1.0.0；不改动历史任务 contractSnapshot；不直接 SQL。
 *  - operatorId / publishedBy 使用真实 SUPER_ADMIN（cmugq95w200018v57lop5qtm9）。
 *  - 带幂等保护：已存在的 1.1.0 不重复创建/发布。
 */
import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/prisma";
import {
  createDraftContract,
  publishContract,
  activateContract,
} from "../src/lib/component-contract/repository";
import { validateComponentContract } from "../src/lib/component-contract/validators";
import { resolveDefaultDeployment } from "../src/lib/model-registry";
import { extractRequiredCapabilities } from "../src/lib/component-contract/capabilities";
import {
  C01_CANDIDATE_1_1_0,
  C02_CANDIDATE_1_1_0,
  C07_CANDIDATE_1_1_0,
} from "./candidates-core3-1.1.0";

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

const SUPER_ADMIN_ID = "cmugq95w200018v57lop5qtm9";
const GATE_WS = "ws-enterprise-1787927954618-9arzol";
const VERSION = "1.1.0";
const COMPS = [
  { id: "C01", candidate: C01_CANDIDATE_1_1_0 },
  { id: "C02", candidate: C02_CANDIDATE_1_1_0 },
  { id: "C07", candidate: C07_CANDIDATE_1_1_0 },
];

type AnyContract = Record<string, unknown>;

async function findOrCreateDraft(id: string, candidate: unknown): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.componentcontract.findUnique({
    where: { componentId_contractVersion: { componentId: id, contractVersion: VERSION } },
    select: { id: true, lifecycle: true },
  });
  if (existing) return { id: existing.id, created: false };
  const created = await createDraftContract({
    componentId: id,
    contractVersion: VERSION,
    contract: candidate,
    description: "CORE-3 1.1.0 发布候选（业务确认）",
  });
  return { id: created.id, created: true };
}

async function publishIfNeeded(id: string, draftId: string): Promise<boolean> {
  const cur = await prisma.componentcontract.findUnique({ where: { id: draftId }, select: { lifecycle: true } });
  if (cur?.lifecycle === "PUBLISHED") return false;
  await publishContract({ componentId: id, contractVersion: VERSION, publishedBy: SUPER_ADMIN_ID, autoActivate: false });
  return true;
}

async function activateIfNeeded(id: string): Promise<boolean> {
  const cat = await prisma.componentcatalog.findUnique({ where: { id }, select: { activeContractId: true } });
  const row = await prisma.componentcontract.findUnique({
    where: { componentId_contractVersion: { componentId: id, contractVersion: VERSION } },
    select: { id: true },
  });
  if (cat?.activeContractId === row?.id) return false;
  if (!row) throw new Error(`1.1.0 合同不存在，无法激活：${id}`);
  await activateContract({ componentId: id, contractVersion: VERSION, operatorId: SUPER_ADMIN_ID });
  return true;
}

function qualityCheck(c: AnyContract | null, spec: AnyContract) {
  const qp = (c?.qualityPolicy ?? {}) as AnyContract;
  const dp = (qp.disclaimerPolicy ?? {}) as AnyContract;
  const rs = Array.isArray(qp.requiredSections) ? (qp.requiredSections as unknown[]).length : 0;
  const fp = Array.isArray(qp.forbiddenPhrases) ? (qp.forbiddenPhrases as unknown[]).length : 0;
  return {
    minOutputLength: qp.minOutputLength,
    requiredSections: rs,
    forbiddenPhrases: fp,
    requireHumanReview: qp.requireHumanReview,
    allowAutoRetry: qp.allowAutoRetry,
    maxRetryCount: qp.maxRetryCount,
    disclaimerRequired: dp.required,
    matches:
      qp.minOutputLength === spec.minOutputLength &&
      rs === spec.requiredSections &&
      fp === spec.forbiddenPhrases &&
      qp.requireHumanReview === spec.requireHumanReview &&
      qp.allowAutoRetry === spec.allowAutoRetry &&
      qp.maxRetryCount === spec.maxRetryCount &&
      dp.required === spec.disclaimerRequired,
  };
}

const SPEC: Record<string, AnyContract> = {
  C01: { minOutputLength: 200, requiredSections: 4, forbiddenPhrases: 9, requireHumanReview: true, allowAutoRetry: true, maxRetryCount: 1, disclaimerRequired: true },
  C02: { minOutputLength: 200, requiredSections: 4, forbiddenPhrases: 13, requireHumanReview: true, allowAutoRetry: true, maxRetryCount: 1, disclaimerRequired: true },
  C07: { minOutputLength: 600, requiredSections: 6, forbiddenPhrases: 14, requireHumanReview: true, allowAutoRetry: false, maxRetryCount: 0, disclaimerRequired: true },
};

async function main() {
  for (const f of [".env.local", ".env.development.local", ".env"]) loadEnvFile(path.join(process.cwd(), f));

  const steps: Array<Record<string, unknown>> = [];
  for (const { id, candidate } of COMPS) {
    validateComponentContract(candidate);
    const reqCaps = extractRequiredCapabilities(candidate);
    await resolveDefaultDeployment({ workspaceId: GATE_WS, requiredCapabilities: reqCaps }); // 能力门禁（只读）
    const draft = await findOrCreateDraft(id, candidate);
    const published = await publishIfNeeded(id, draft.id);
    const activated = await activateIfNeeded(id);
    steps.push({ id, draftId: draft.id, createdDraft: draft.created, published, activated });
  }

  // 只读核对
  const verify: Array<Record<string, unknown>> = [];
  for (const { id } of COMPS) {
    const cat = await prisma.componentcatalog.findUnique({ where: { id }, select: { activeContractId: true } });
    const row = await prisma.componentcontract.findUnique({
      where: { componentId_contractVersion: { componentId: id, contractVersion: VERSION } },
      select: { id: true, lifecycle: true, contract: true },
    });
    const qc = qualityCheck((row?.contract as AnyContract) ?? null, SPEC[id]);
    verify.push({
      id,
      activeContractId: cat?.activeContractId ?? null,
      pointsTo1_1_0: cat?.activeContractId === row?.id,
      lifecycle: row?.lifecycle ?? null,
      qualityMatchesSpec: qc.matches,
      quality: qc,
    });
  }

  // 从数据库只读重导 fixture
  const contracts: Record<string, AnyContract> = {};
  for (const { id } of COMPS) {
    const cat = await prisma.componentcatalog.findUnique({ where: { id }, select: { activeContractId: true } });
    const row = await prisma.componentcontract.findUnique({ where: { id: cat?.activeContractId ?? "" }, select: { contract: true } });
    contracts[id] = (row?.contract as AnyContract) ?? {};
  }
  const ts = new Date().toISOString();
  const header = `/**
 * 生产激活合同【只读导出】固定测试夹具
 * 导出时间: ${ts}
 * 来源: componentcatalog.activeContract（componentcontract 表，lifecycle=PUBLISHED）
 * 组件/版本: C01@1.1.0, C02@1.1.0, C07@1.1.0
 * 用途: simulate-request-di 等 fake 依赖测试的"当前真实激活合同"唯一来源。
 * 严禁: 用 DRAFT 模板冒充；为通过测试而篡改本文件；本 fixture 不得自动覆盖生产数据。
 * 若生产合同变更，须重新只读导出并人工比对，不得手工猜测字段。
 */
import type { ComponentContract } from "@/lib/component-contract/types";

`;
  const body = (k: string) =>
    `export const ${k}_ACTIVE_CONTRACT: ComponentContract = JSON.parse(${JSON.stringify(JSON.stringify(contracts[k]))});\n`;
  const fileContent =
    header +
    body("C01") + body("C02") + body("C07") +
    "\nexport const ACTIVE_CONTRACTS = {\n  C01: C01_ACTIVE_CONTRACT,\n  C02: C02_ACTIVE_CONTRACT,\n  C07: C07_ACTIVE_CONTRACT,\n} as const;\n";
  const outPath = path.join(process.cwd(), "src/app/api/studio/__tests__/fixtures/active-contracts.snapshot.ts");
  fs.writeFileSync(outPath, fileContent, "utf-8");

  const allOk = verify.every((v) => v.pointsTo1_1_0 === true && v.lifecycle === "PUBLISHED" && v.qualityMatchesSpec === true);
  console.log(JSON.stringify({ action: "PUBLISH_1_1_0", steps, verify, fixtureRegenerated: outPath, allOk }, null, 2));
  await prisma.$disconnect();
  if (!allOk) process.exit(2);
}

main().catch((e) => { console.error("PUBLISH_FAIL", (e as Error)?.message || String(e)); prisma.$disconnect(); process.exit(2); });
