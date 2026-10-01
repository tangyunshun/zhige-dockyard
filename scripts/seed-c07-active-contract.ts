/**
 * C07 首个正式合同（1.0.0）数据初始化脚本 —— 从迁移体系中剥离后的替代入口。
 *
 * 背景：原初始化语句写在迁移 20260920223000_seed_c07_active_contract 里，导致全新库重放时
 * 因外键（component_contract.component_id -> component_catalog.id）失败而阻塞所有后续迁移。
 * 本脚本承担同样的数据职责，但只在「已存在组件行」的环境中按需执行。
 *
 * 安全约束（必须保留）：
 *  - 仅在 C07 组件行已存在时才写入，不存在则直接跳过并明确提示（不擅自伪造组件行）；
 *  - 合同行采用 upsert：已存在则保留其现有发布状态，不覆盖已经在用的更高版本合同；
 *  - active_contract_id 仅当为空时才绑定 1.0.0，避免把已升级的 1.1.0 等更高版本打回旧版。
 *
 * 运行： npx tsx scripts/seed-c07-active-contract.ts
 */
import { prisma } from "../src/lib/prisma";

const TARGET_COMPONENT_ID = "C07";
const CONTRACT_ID = "c07_contract_v1_0_0";
const CONTRACT_VERSION = "1.0.0";

/** 与历史迁移完全一致的合同快照内容（勿随意改写，保持可复现） */
const CONTRACT_JSON = {
  componentId: "C07",
  contractVersion: "1.0.0",
  lifecycle: "PUBLISHED",
  publishedAt: "2026-09-20T22:00:00.000Z",
  publishedBy: "system_bootstrap",
  input: {
    kind: "TEXT_AND_FILES",
    textConstraints: { required: false, minLength: 1, maxLength: 30000, placeholder: "请输入或粘贴分析文本材料" },
    fileConstraints: {
      required: false,
      minCount: 0,
      maxCount: 1,
      acceptedMimes: [
        "text/plain",
        "text/markdown",
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/png",
        "image/jpeg",
      ],
      maxSingleFileBytes: 20971520,
      maxTotalBytes: 20971520,
    },
  },
  materialPipeline: { steps: [{ name: "多模态材料预处理与标准化", type: "TEXT_NORMALIZE" }] },
  executionPlan: {
    steps: [
      {
        stepId: "step_c07_main",
        name: "需求规格与架构方案生成",
        promptTemplateVersion: "v1.0",
        promptTemplate:
          "你是一名资深需求分析师与技术架构师，请对以下输入材料进行深度结构化分析并输出专业规格文档：\n\n{{sourceText}}",
        inputMapping: { sourceText: "input.text" },
        outputKey: "c07_output_doc",
        contextBudgetTokens: 8192,
        maxOutputTokens: 4096,
        timeoutMs: 60000,
        requiredCapabilities: ["TEXT_GENERATION"],
      },
    ],
  },
  output: {
    kind: "DOCUMENT",
    artifactMime: "text/markdown",
    schemaVersion: "1.0",
    rendererType: "MARKDOWN_DOCUMENT",
    previewable: true,
    downloadable: true,
  },
  qualityPolicy: { allowAutoRetry: false, requireHumanReview: false },
  billingPolicy: { mode: "ESTIMATED_COMPATIBILITY", estimatedTokens: 1500 },
};

async function main() {
  const component = await prisma.componentcatalog.findUnique({
    where: { id: TARGET_COMPONENT_ID },
    select: { id: true, name: true, activeContractId: true },
  });
  if (!component) {
    console.log(`[seed-c07] 组件 ${TARGET_COMPONENT_ID} 不存在，已跳过（不会伪造组件行）。请先建好组件再执行本脚本。`);
    await prisma.$disconnect();
    return;
  }

  const existing = await prisma.componentcontract.findUnique({
    where: { id: CONTRACT_ID },
    select: { id: true, lifecycle: true },
  });

  if (existing) {
    console.log(`[seed-c07] 合同 ${CONTRACT_ID} 已存在（${existing.lifecycle}），保留现状不覆盖。`);
  } else {
    await prisma.componentcontract.create({
      data: {
        id: CONTRACT_ID,
        componentId: TARGET_COMPONENT_ID,
        contractVersion: CONTRACT_VERSION,
        lifecycle: "PUBLISHED",
        description: "C07 需求规格与架构方案标准执行合同",
        contract: CONTRACT_JSON,
        publishedAt: new Date("2026-09-20T22:00:00.000Z"),
        publishedBy: "system_bootstrap",
      },
    });
    console.log(`[seed-c07] 已创建合同 ${CONTRACT_ID}（1.0.0 / PUBLISHED）。`);
  }

  // 仅当组件尚未绑定任何激活合同时才绑定，避免覆盖后续升级的更高版本合同
  if (component.activeContractId) {
    console.log(
      `[seed-c07] ${TARGET_COMPONENT_ID} 已绑定激活合同 ${component.activeContractId}，按防护规则不改动。`,
    );
  } else {
    await prisma.componentcatalog.update({
      where: { id: TARGET_COMPONENT_ID },
      data: { activeContractId: CONTRACT_ID },
    });
    console.log(`[seed-c07] 已将 ${TARGET_COMPONENT_ID} 的激活合同绑定为 ${CONTRACT_ID}。`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[seed-c07] 初始化失败:", e);
  await prisma.$disconnect();
  process.exit(1);
});
