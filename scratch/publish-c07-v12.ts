/**
 * 【授权写库】发布 C07 合同 v1.2.0（负责人已授权）
 * 修复：v1.1.0 promptTemplate 不引导 requiredSections 六章节，质量门禁却检查 → 成功用例被正确阻断。
 * v1.2 变更：仅 executionPlan.steps[0].promptTemplate 补六章结构与「待确认」标注要求；其余字段不变。
 * 流程（经 repository，幂等）：读 v1.1.0 → 构造 1.2.0 → createDraftContract → publishContract → activateContract
 *   → 只读验证 → 重导 fixture（active-contracts.snapshot.ts）。
 * 不修改 v1.1.0 及更早版本；不触碰历史任务 contractSnapshot。
 */
import fs from "fs";
import path from "path";
import { loadCliEnv } from "../scripts/cli-env";
import { prisma } from "../src/lib/prisma";
import {
  createDraftContract,
  publishContract,
  activateContract,
} from "../src/lib/component-contract/repository";

const OPERATOR = "cmugq95w200018v57lop5qtm9"; // 真实 SUPER_ADMIN（与 1.1.0 发布一致）
const VERSION = "1.2.0";

const NEW_PROMPT = [
  "你是一名资深需求分析师与技术架构师。请对以下输入材料进行深度结构化分析，输出《需求规格文档》（Markdown）。",
  "文档必须严格包含以下六个章节，章节标题须原样出现（可使用 Markdown 标题格式）：",
  "背景与目标、用户与使用场景、功能需求、非功能需求、数据与接口、验收标准。",
  "各章节内容须基于输入材料提炼；输入材料未覆盖的信息在该章节内以「待确认」显式标注，禁止编造。",
  "",
  "输入材料如下：",
  "{{sourceText}}",
].join("\n");

async function main() {
  const cat = await prisma.componentcatalog.findUnique({ where: { id: "C07" }, select: { activeContractId: true } });
  const active = await prisma.componentcontract.findUnique({ where: { id: cat!.activeContractId! } });
  if (!active) throw new Error("C07 无激活合同");
  if (active.contractVersion === VERSION) {
    console.log("已存在 1.2.0 激活合同，幂等跳过创建");
  } else {
    const base = active.contract as any;
    const next = JSON.parse(JSON.stringify(base));
    next.contractVersion = VERSION;
    next.lifecycle = "DRAFT"; // createDraftContract 强制要求；发布时由 repository 更新行状态
    next.publishedAt = null; // DRAFT 不得伪装已发布
    delete next.publishedBy;
    next.executionPlan.steps[0].promptTemplate = NEW_PROMPT;

    const existing = await prisma.componentcontract.findUnique({
      where: { componentId_contractVersion: { componentId: "C07", contractVersion: VERSION } },
    });
    if (!existing) {
      const created = await createDraftContract({
        componentId: "C07",
        contractVersion: VERSION,
        contract: next,
        description: "C07 v1.2.0：promptTemplate 补齐 requiredSections 六章节引导（修复合同自矛盾，负责人授权）",
      });
      console.log("DRAFT created:", created.id);
    } else {
      console.log("1.2.0 行已存在，跳过创建");
    }
    await publishContract({ componentId: "C07", contractVersion: VERSION, publishedBy: OPERATOR, autoActivate: false });
    await activateContract({ componentId: "C07", contractVersion: VERSION, operatorId: OPERATOR });
  }

  // 只读验证
  const cat2 = await prisma.componentcatalog.findUnique({ where: { id: "C07" }, select: { activeContractId: true } });
  const act = await prisma.componentcontract.findUnique({ where: { id: cat2!.activeContractId! } });
  const k = act!.contract as any;
  const promptOk = k.executionPlan.steps[0].promptTemplate.includes("背景与目标");
  console.log(JSON.stringify({
    activeVersion: act!.contractVersion,
    lifecycle: act!.lifecycle,
    promptHasSections: promptOk,
    requiredSectionsUnchanged: JSON.stringify(k.qualityPolicy.requiredSections) === JSON.stringify(["背景与目标", "用户与使用场景", "功能需求", "非功能需求", "数据与接口", "验收标准"]),
  }));

  // 重导 fixture（只读数据库 → active-contracts.snapshot.ts）
  const contracts: Record<string, any> = {};
  for (const cid of ["C01", "C02", "C07"]) {
    const c = await prisma.componentcatalog.findUnique({ where: { id: cid }, select: { activeContractId: true } });
    const row = await prisma.componentcontract.findUnique({ where: { id: c!.activeContractId! } });
    contracts[cid] = row!.contract;
  }
  const header = `/**
 * 生产激活合同【只读导出】固定测试夹具
 * 导出时间: ${new Date().toISOString()}
 * 来源: componentcatalog.activeContract（componentcontract 表，lifecycle=PUBLISHED）
 * 组件/版本: C01@${contracts.C01.contractVersion}, C02@${contracts.C02.contractVersion}, C07@${contracts.C07.contractVersion}
 * 用途: simulate-request-di 等 fake 依赖测试的"当前真实激活合同"唯一来源。
 * 严禁: 用 DRAFT 模板冒充；为通过测试而篡改本文件；本 fixture 不得自动覆盖生产数据。
 * 若生产合同变更，须重新只读导出并人工比对，不得手工猜测字段。
 */
import type { ComponentContract } from "@/lib/component-contract/types";

`;
  const body = (key: string) =>
    `export const ${key}_ACTIVE_CONTRACT: ComponentContract = JSON.parse(${JSON.stringify(JSON.stringify(contracts[key]))});\n`;
  const content =
    header + body("C01") + body("C02") + body("C07") +
    "\nexport const ACTIVE_CONTRACTS = {\n  C01: C01_ACTIVE_CONTRACT,\n  C02: C02_ACTIVE_CONTRACT,\n  C07: C07_ACTIVE_CONTRACT,\n} as const;\n";
  const outPath = path.join(process.cwd(), "src/app/api/studio/__tests__/fixtures/active-contracts.snapshot.ts");
  fs.writeFileSync(outPath, content, "utf-8");
  console.log("fixture 重导完成:", outPath);
}
main()
  .catch((e) => { console.error("PUBLISH_FAIL:", (e as Error)?.message); process.exitCode = 2; })
  .finally(() => prisma.$disconnect());
