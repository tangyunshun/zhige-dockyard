/**
 * C09 首个正式合同（1.0.0）数据初始化脚本 —— 与 seed-c07 同口径，从迁移体系剥离。
 *
 * 背景：C09「客户差评自动聚类与提单」此前按设计故意不设激活合同，作为"无激活合同"负面 UI 样本。
 * 验收要求全 60 组件可估价（60/60），故补建 C09 激活合同；负向 UI 样本改由 fixture 型集成测试覆盖。
 *
 * 安全约束（与 seed-c07 一致，必须保留）：
 *  - 仅在 C09 组件行已存在时才写入，不存在则跳过（不伪造组件行）；
 *  - 合同行 upsert：已存在则保留其发布状态，不覆盖；
 *  - active_contract_id 仅当为空时才绑定，避免覆盖后续升级的更高版本合同。
 *
 * 运行： npx tsx scripts/seed-c09-active-contract.ts
 */
import { prisma } from "../src/lib/prisma";

const TARGET_COMPONENT_ID = "C09";
const CONTRACT_ID = "c09_contract_v1_0_0";
const CONTRACT_VERSION = "1.0.0";
const PUBLISHED_AT = "2026-09-27T08:00:00.000Z";

/** C09 标准执行合同：FILE 输入（差评 csv/xlsx/txt）+ TEXT_GENERATION + STRUCTURED_OUTPUT，DOCUMENT 输出 */
const CONTRACT_JSON = {
  componentId: "C09",
  contractVersion: "1.0.0",
  lifecycle: "PUBLISHED",
  publishedAt: PUBLISHED_AT,
  publishedBy: "system_bootstrap",
  input: {
    kind: "FILE",
    fileConstraints: {
      maxCount: 1,
      minCount: 1,
      required: true,
      acceptedMimes: [".csv", ".xlsx", ".xls", ".txt"],
      maxTotalBytes: 20971520,
      maxSingleFileBytes: 20971520,
    },
  },
  output: {
    kind: "DOCUMENT",
    previewable: true,
    artifactMime: "text/markdown",
    downloadable: true,
    rendererType: "MARKDOWN_DOCUMENT",
    schemaVersion: "1.0",
    structureConstraints: {
      requiredProperties: ["clusters", "tickets"],
    },
  },
  executionPlan: {
    steps: [
      {
        name: "差评聚类与问题提单生成",
        stepId: "c09-review-cluster",
        outputKey: "review_cluster_tickets",
        timeoutMs: 180000,
        inputMapping: {},
        promptTemplate:
          "你是资深客户体验（CX）分析专家。请对提供的客户差评原始材料（CSV / Excel / 文本）进行结构化分析：\n1. 《差评聚类》：按主题、严重程度、出现频次对差评自动归类，输出聚类清单；\n2. 《问题提单》：将每一类高频问题转化为可派发至对应业务团队的处理工单，含问题摘要、影响面、建议处置与优先级；\n3. 《趋势与建议》：给出高频风险点与改进建议。\n硬性要求：忠实于原始数据，不得编造差评条目；频次类结论须基于材料实际计数。",
        maxOutputTokens: 2200,
        contextBudgetTokens: 16000,
        requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
        promptTemplateVersion: "1.0.0",
      },
    ],
  },
  qualityPolicy: {
    maxRetryCount: 1,
    allowAutoRetry: true,
    minOutputLength: 200,
    disclaimerPolicy: {
      marker: "AI 差评分析建议",
      required: true,
      template: "本结果为 AI 生成的差评聚类与提单建议，需由客户体验或业务负责人复核，不直接作为对外客诉结论。",
    },
    forbiddenPhrases: [
      "保证解决",
      "100%满意",
      "绝对无差评",
      "无需人工复核",
      "具备法律效力",
      "正式客诉结论",
    ],
    requireCitations: false,
    requiredSections: ["差评聚类|聚类", "问题提单|提单", "趋势与建议|趋势"],
    requireHumanReview: true,
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 100,
    ruleDescription: "按组件声明的估算 Token 预估扣点，未开启真实结算。",
  },
  materialPipeline: {
    steps: [
      { name: "差评文件文本提取", type: "DOCUMENT_PARSE" },
      { name: "提取文本归一化", type: "TEXT_NORMALIZE" },
    ],
  },
};

async function main() {
  const component = await prisma.componentcatalog.findUnique({
    where: { id: TARGET_COMPONENT_ID },
    select: { id: true, name: true, activeContractId: true },
  });
  if (!component) {
    console.log(`[seed-c09] 组件 ${TARGET_COMPONENT_ID} 不存在，已跳过（不会伪造组件行）。请先建好组件再执行本脚本。`);
    await prisma.$disconnect();
    return;
  }

  const existing = await prisma.componentcontract.findUnique({
    where: { id: CONTRACT_ID },
    select: { id: true, lifecycle: true },
  });

  if (existing) {
    console.log(`[seed-c09] 合同 ${CONTRACT_ID} 已存在（${existing.lifecycle}），保留现状不覆盖。`);
  } else {
    await prisma.componentcontract.create({
      data: {
        id: CONTRACT_ID,
        componentId: TARGET_COMPONENT_ID,
        contractVersion: CONTRACT_VERSION,
        lifecycle: "PUBLISHED",
        description: "C09 客户差评自动聚类与提单标准执行合同",
        contract: CONTRACT_JSON,
        publishedAt: new Date(PUBLISHED_AT),
        publishedBy: "system_bootstrap",
      },
    });
    console.log(`[seed-c09] 已创建合同 ${CONTRACT_ID}（1.0.0 / PUBLISHED）。`);
  }

  if (component.activeContractId) {
    console.log(
      `[seed-c09] ${TARGET_COMPONENT_ID} 已绑定激活合同 ${component.activeContractId}，按防护规则不改动。`,
    );
  } else {
    await prisma.componentcatalog.update({
      where: { id: TARGET_COMPONENT_ID },
      data: { activeContractId: CONTRACT_ID },
    });
    console.log(`[seed-c09] 已将 ${TARGET_COMPONENT_ID} 的激活合同绑定为 ${CONTRACT_ID}。`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[seed-c09] 初始化失败:", e);
  await prisma.$disconnect();
  process.exit(1);
});
