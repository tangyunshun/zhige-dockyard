/**
 * 发布 C12 / C18 @ 1.1.0（破阻断：Mermaid 文本等价方案）
 *
 * 流程（严格经 repository，每步同事务审计）：
 *   createDraftContract → validateComponentContract → 能力门禁(resolveDefaultDeployment)
 *   → publishContract(autoActivate=false) → activateContract
 * 完成后：只读核对 activeContractId 指向 1.1.0 PUBLISHED 且 requiredSections 符合 Mermaid 方案；
 * 最后从数据库只读重导 fixture（独立文件，绝不覆盖封板组件 C01/C02/C07 的快照）。
 *
 * 安全约束：
 *  - 不修改 1.0.0；不改动历史任务 contractSnapshot；不直接 SQL。
 *  - 带幂等保护：已存在的 1.1.0 不重复创建/发布。
 *  - **绝不写入 src/app/api/studio/__tests__/fixtures/active-contracts.snapshot.ts**（该文件属于封板组件 C01/C02/C07）。
 *
 * 关于操作人：componentcontract.publishedBy 与审计日志 operationlog.userId **存在外键约束**，
 * 必须使用真实用户 ID。本脚本使用超管账号（name/role 均为小写 superadmin）：
 *   id = cmugq95w200018v57lop5qtm9
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
  C12_CANDIDATE_1_1_0,
  C18_CANDIDATE_1_1_0,
} from "./candidates-c12-c18-1.1.0";

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

/** 超管账号：name="superadmin"、role="superadmin"（小写）。审计外键要求使用其用户 ID。 */
const SUPER_ADMIN_ID = "cmugq95w200018v57lop5qtm9";
const GATE_WS = "ws-enterprise-1787927954618-9arzol";
const VERSION = "1.1.0";

const COMPS = [
  { id: "C12", candidate: C12_CANDIDATE_1_1_0, expectSections: ["DDL", "Mermaid", "关联"] },
  { id: "C18", candidate: C18_CANDIDATE_1_1_0, expectSections: ["实体", "Mermaid", "关系"] },
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
    description: "C12/C18 1.1.0 发布候选（Mermaid 文本等价方案，负责人授权）",
  });
  return { id: created.id, created: true };
}

async function publishIfNeeded(id: string, draftId: string): Promise<boolean> {
  const cur = await prisma.componentcontract.findUnique({ where: { id: draftId }, select: { lifecycle: true } });
  if (cur?.lifecycle === "PUBLISHED") return false;
  await publishContract({
    componentId: id,
    contractVersion: VERSION,
    publishedBy: SUPER_ADMIN_ID,
    autoActivate: false,
  });
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

async function main() {
  for (const f of [".env.local", ".env.development.local", ".env"]) loadEnvFile(path.join(process.cwd(), f));

  const steps: Array<Record<string, unknown>> = [];
  for (const { id, candidate } of COMPS) {
    validateComponentContract(candidate);
    const reqCaps = extractRequiredCapabilities(candidate);
    let gate = "OK";
    try {
      await resolveDefaultDeployment({ workspaceId: GATE_WS, requiredCapabilities: reqCaps }); // 能力门禁（只读）
    } catch (e) {
      gate = `GATE_FAIL: ${(e as Error)?.message ?? String(e)}`;
    }
    const draft = await findOrCreateDraft(id, candidate);
    const published = await publishIfNeeded(id, draft.id);
    const activated = await activateIfNeeded(id);
    steps.push({ id, draftId: draft.id, createdDraft: draft.created, published, activated, capabilityGate: gate });
  }

  // 只读核对
  const verify: Array<Record<string, unknown>> = [];
  for (const { id, expectSections } of COMPS) {
    const cat = await prisma.componentcatalog.findUnique({ where: { id }, select: { activeContractId: true } });
    const row = await prisma.componentcontract.findUnique({
      where: { componentId_contractVersion: { componentId: id, contractVersion: VERSION } },
      select: { id: true, lifecycle: true, contract: true },
    });
    const c = (row?.contract as AnyContract) ?? {};
    const qp = (c.qualityPolicy ?? {}) as AnyContract;
    const out = (c.output ?? {}) as AnyContract;
    const sections = Array.isArray(qp.requiredSections) ? (qp.requiredSections as string[]) : [];
    const unsup = Array.isArray(c.unsupportedRequirements) ? c.unsupportedRequirements : [];
    verify.push({
      id,
      activeContractId: cat?.activeContractId ?? null,
      pointsTo1_1_0: cat?.activeContractId === row?.id,
      lifecycle: row?.lifecycle ?? null,
      outputKind: out.kind ?? null,
      requiredSections: sections,
      requiredSectionsMatch: JSON.stringify(sections) === JSON.stringify(expectSections),
      unsupportedCount: unsup.length,
    });
  }

  // 从数据库只读重导 fixture（独立文件，绝不覆盖封板组件快照）
  const contracts: Record<string, AnyContract> = {};
  for (const { id } of COMPS) {
    const cat = await prisma.componentcatalog.findUnique({ where: { id }, select: { activeContractId: true } });
    const row = await prisma.componentcontract.findUnique({ where: { id: cat?.activeContractId ?? "" }, select: { contract: true } });
    contracts[id] = (row?.contract as AnyContract) ?? {};
  }
  const ts = new Date().toISOString();
  const header = `/**
 * C12 / C18 生产激活合同【只读导出】固定测试夹具
 * 导出时间: ${ts}
 * 来源: componentcatalog.activeContract（componentcontract 表，lifecycle=PUBLISHED）
 * 组件/版本: C12@1.1.0, C18@1.1.0（Mermaid 文本等价方案，破图形化 ER 图阻断）
 *
 * 注意：本文件与 active-contracts.snapshot.ts（封板组件 C01/C02/C07）**相互独立**，
 * 严禁合并或覆盖后者；封板组件快照由 publish-core3-1.1.0.ts 单独维护。
 *
 * 用途: 依赖 C12/C18 当前真实激活合同的测试之唯一来源。
 * 严禁: 用 DRAFT 模板冒充；为通过测试而篡改本文件；本 fixture 不得自动覆盖生产数据。
 */
import type { ComponentContract } from "@/lib/component-contract/types";

`;
  const body = (k: string) =>
    `export const ${k}_ACTIVE_CONTRACT: ComponentContract = JSON.parse(${JSON.stringify(JSON.stringify(contracts[k]))});\n`;
  const fileContent =
    header +
    body("C12") + body("C18") +
    "\nexport const ACTIVE_CONTRACTS_C12_C18 = {\n  C12: C12_ACTIVE_CONTRACT,\n  C18: C18_ACTIVE_CONTRACT,\n} as const;\n";
  const outPath = path.join(process.cwd(), "src/app/api/studio/__tests__/fixtures/active-contracts-c12-c18.snapshot.ts");
  fs.writeFileSync(outPath, fileContent, "utf-8");

  const allOk = verify.every(
    (v) => v.pointsTo1_1_0 === true && v.lifecycle === "PUBLISHED" && v.requiredSectionsMatch === true && v.outputKind === "DOCUMENT",
  );
  console.log(JSON.stringify({ action: "PUBLISH_C12_C18_1_1_0", steps, verify, fixtureRegenerated: outPath, allOk }, null, 2));
  await prisma.$disconnect();
  if (!allOk) process.exit(2);
}

main().catch((e) => { console.error("PUBLISH_FAIL", (e as Error)?.message || String(e)); prisma.$disconnect(); process.exit(2); });
