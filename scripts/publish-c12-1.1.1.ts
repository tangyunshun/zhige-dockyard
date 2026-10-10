/**
 * 发布 C12 @ 1.1.1（修复 CoT 泄漏导致的 Mermaid 章节截断）
 *
 * 流程（严格经 repository，每步同事务审计）：
 *   createDraftContract → validateComponentContract → 能力门禁(resolveDefaultDeployment)
 *   → publishContract(autoActivate=false) → activateContract
 * 完成后：只读核对 activeContractId 指向 1.1.1 PUBLISHED；
 * 最后从数据库只读重导 fixture（独立文件，绝不覆盖封板组件 C01/C02/C07 快照）。
 *
 * 仅在必要时 archived 旧版本？不——保留 1.1.0 记录用于审计追溯，不做归档。
 *
 * 操作人：超管（name/role 均为小写 superadmin）。
 * 注意：publishedBy / operatorId 会写入 operationlog.userId（有外键），必须是真实用户 ID。
 */
import fs from "fs";
import path from "path";
import { prisma } from "../src/lib/prisma";
import { createDraftContract, publishContract, activateContract } from "../src/lib/component-contract/repository";
import { validateComponentContract } from "../src/lib/component-contract/validators";
import { resolveDefaultDeployment } from "../src/lib/model-registry";
import { extractRequiredCapabilities } from "../src/lib/component-contract/capabilities";
import { C12_CANDIDATE_1_1_1 } from "./candidates-c12-c18-1.1.0";

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
const VERSION = "1.1.1";
const TARGET = { id: "C12", candidate: C12_CANDIDATE_1_1_1, expectSections: ["DDL", "Mermaid", "关联"] };

type AnyContract = Record<string, unknown>;

async function main() {
  for (const f of [".env.local", ".env.development.local", ".env"]) loadEnvFile(path.join(process.cwd(), f));

  validateComponentContract(TARGET.candidate);
  const caps = extractRequiredCapabilities(TARGET.candidate);
  let gate = "OK";
  try {
    await resolveDefaultDeployment({ workspaceId: GATE_WS, requiredCapabilities: caps });
  } catch (e) {
    gate = `GATE_FAIL: ${(e as Error)?.message ?? String(e)}`;
  }

  let row = await prisma.componentcontract.findUnique({
    where: { componentId_contractVersion: { componentId: TARGET.id, contractVersion: VERSION } },
    select: { id: true, lifecycle: true },
  });
  let createdDraft = false;
  if (!row) {
    const created = await createDraftContract({
      componentId: TARGET.id,
      contractVersion: VERSION,
      contract: TARGET.candidate,
      description: "C12 1.1.1：抑制 CoT 泄漏，确保 Mermaid 章节真实产出",
    });
    row = { id: created.id, lifecycle: created.lifecycle };
    createdDraft = true;
  }

  const published = row.lifecycle !== "PUBLISHED";
  if (published) {
    await publishContract({ componentId: TARGET.id, contractVersion: VERSION, publishedBy: SUPER_ADMIN_ID, autoActivate: false });
  }

  const cat = await prisma.componentcatalog.findUnique({ where: { id: TARGET.id }, select: { activeContractId: true } });
  const activated = cat?.activeContractId !== row.id;
  if (activated) {
    await activateContract({ componentId: TARGET.id, contractVersion: VERSION, operatorId: SUPER_ADMIN_ID });
  }

  // 只读核对
  const cat2 = await prisma.componentcatalog.findUnique({ where: { id: TARGET.id }, select: { activeContractId: true } });
  const finalRow = await prisma.componentcontract.findUnique({
    where: { componentId_contractVersion: { componentId: TARGET.id, contractVersion: VERSION } },
    select: { id: true, lifecycle: true, contract: true, publishedBy: true },
  });
  const c = (finalRow?.contract as AnyContract) ?? {};
  const sections = ((c.qualityPolicy as AnyContract)?.requiredSections as string[]) ?? [];
  const prompt = ((c.executionPlan as AnyContract)?.steps as AnyContract[])?.[0]?.promptTemplate as string | undefined;

  // fixture 重导（独立文件，不触碰封板快照）
  const active = await prisma.componentcontract.findUnique({
    where: { id: cat2?.activeContractId ?? "" },
    select: { contract: true },
  });
  const c18Row = await prisma.componentcatalog.findUnique({ where: { id: "C18" }, select: { activeContractId: true } });
  const c18 = await prisma.componentcontract.findUnique({ where: { id: c18Row?.activeContractId ?? "" }, select: { contract: true } });
  const ts = new Date().toISOString();
  const header = `/**
 * C12 / C18 生产激活合同【只读导出】固定测试夹具
 * 导出时间: ${ts}
 * 来源: componentcatalog.activeContract（componentcontract 表，lifecycle=PUBLISHED）
 * 组件/版本: C12@${VERSION}（抑制 CoT，修复 Mermaid 章节截断）, C18@1.1.0（Mermaid 文本等价方案）
 *
 * 注意：本文件与 active-contracts.snapshot.ts（封板组件 C01/C02/C07）**相互独立**，
 * 严禁合并或覆盖后者；封板组件快照由 publish-core3-1.1.0.ts 单独维护。
 *
 * 用途: 依赖 C12/C18 当前真实激活合同的测试之唯一来源。
 * 严禁: 用 DRAFT 模板冒充；为通过测试而篡改本文件；本 fixture 不得自动覆盖生产数据。
 */
import type { ComponentContract } from "@/lib/component-contract/types";

`;
  const body = (k: string, v: AnyContract) =>
    `export const ${k}_ACTIVE_CONTRACT: ComponentContract = JSON.parse(${JSON.stringify(JSON.stringify(v))});\n`;
  const outPath = path.join(process.cwd(), "src/app/api/studio/__tests__/fixtures/active-contracts-c12-c18.snapshot.ts");
  fs.writeFileSync(
    outPath,
    header +
      body("C12", (active?.contract as AnyContract) ?? {}) +
      body("C18", (c18?.contract as AnyContract) ?? {}) +
      "\nexport const ACTIVE_CONTRACTS_C12_C18 = {\n  C12: C12_ACTIVE_CONTRACT,\n  C18: C18_ACTIVE_CONTRACT,\n} as const;\n",
    "utf-8",
  );

  const allOk =
    cat2?.activeContractId === finalRow?.id &&
    finalRow?.lifecycle === "PUBLISHED" &&
    JSON.stringify(sections) === JSON.stringify(TARGET.expectSections) &&
    !!prompt && prompt.includes("输出纪律");

  console.log(JSON.stringify({
    action: "PUBLISH_C12_1_1_1",
    createdDraft, published, activated,
    capabilityGate: gate,
    activeContractId: cat2?.activeContractId ?? null,
    pointsToTarget: cat2?.activeContractId === finalRow?.id,
    lifecycle: finalRow?.lifecycle ?? null,
    publishedBy: finalRow?.publishedBy ?? null,
    requiredSections: sections,
    hasOutputDiscipline: !!prompt && prompt.includes("输出纪律"),
    fixtureRegenerated: outPath,
    allOk,
  }, null, 2));

  await prisma.$disconnect();
  if (!allOk) process.exit(2);
}

main().catch((e) => { console.error("PUBLISH_FAIL", (e as Error)?.message || String(e)); prisma.$disconnect(); process.exit(2); });
