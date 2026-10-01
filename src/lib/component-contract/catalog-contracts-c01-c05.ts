/**
 * 第一批组件合同（C01-C05）真实业务合同定义
 *
 * 设计原则（严格遵循迁移批次约束）：
 *  - 逐组件依据真实业务用途编写，**禁止**复制 C07 合同后仅改 componentId；
 *  - 禁止为所有组件套用相同输入/输出/提示词（C01/C02 单文件、C03 多文件、C04/C05 纯文本，输出与提示词各不相同）；
 *  - 禁止默认合同、占位文本、模拟结果；
 *  - 合同严禁携带 providerId/modelId/upstreamModel/baseUrl/apiKey/apiVersion/endpoint 等模型绑定字段；
 *  - requiredCapabilities 仅来源于组件真实输出需求：仅当需要结构化（表格/分值）时才声明 STRUCTURED_OUTPUT，
 *    绝不因“处理过文件”就声明 FILE_ANALYSIS（文件解析由平台服务端完成，模型侧只需文本生成）。
 *
 * 证据来源：
 *  - prisma/component-catalog-data.ts：组件真实 description / previewData / inputMode / accept / hint / detail；
 *  - prisma/seed-components.ts：组件真实业务契约（标书➜偏离表 / 方案➜合规报告 / 竞品资料➜对比表 / 技术方案➜白话汇报 / 模块清单➜成本测算）；
 *  - docs/component-capability-matrix.json：审计得出的输入原型与推荐原型
 *    （C01、C03 = TABLE_OR_SCORE_OUTPUT；C02 = SINGLE_FILE；C04、C05 = TEXT_ONLY）。
 *
 * 注意：本模块只产出 **DRAFT** 合同模板（publishedAt/publishedBy 为 null），
 * 是否 PUBLISH/激活由 `evaluateActivationEligibility` 依据真实部署能力裁决。
 */

import {
  ComponentContract,
  ComponentOutputKind,
  RendererType,
  RequiredModelCapability,
} from "./types";

/** 逐组件业务分析（覆盖迁移批次要求的全部字段；缺失显式标注 MISSING，绝不静默补默认值） */
export interface ComponentContractMigrationAnalysis {
  componentId: string;
  /** 组件用途与用户目标 */
  purpose: string;
  /** 输入类型（真实：来自 component_catalog.inputMode / accept） */
  inputType: string;
  /** 文本必填规则 */
  textRequiredRule: string;
  /** 文件类型与大小限制 */
  fileTypeAndSizeRule: string;
  /** 是否支持单文件 */
  singleFileSupported: boolean;
  /** 是否支持多文件 */
  multiFileSupported: boolean;
  /** 是否支持图片 */
  imageSupported: boolean;
  /** 是否需要 OCR */
  ocrRequired: "REQUIRED" | "NOT_REQUIRED" | "UNKNOWN";
  /** 模型能力要求 */
  requiredCapabilities: RequiredModelCapability[];
  /** 输出 artifact 类型 */
  outputKind: ComponentOutputKind;
  /** 结果展示方式 */
  rendererType: RendererType;
  /** 结构化字段或文档结构 */
  structure: string;
  /** 失败处理规则 */
  failureHandling: string;
  /** 估算 Token（与 component_catalog.estimatedModelTokens 对齐） */
  estimatedTokens: number;
  /** 合同版本 */
  contractVersion: string;
  /** 发布状态（模板态：DRAFT） */
  publishStatus: "DRAFT";
  /** 激活状态（模板态：未激活，由能力裁决决定） */
  activationStatus: "NOT_ACTIVATED" | "ELIGIBLE";
  /** 资料缺口（无缺口为 []，缺失必须显式列出） */
  missingMaterials: string[];
  /** 说明 */
  notes: string;
}

const CONTRACT_VERSION = "1.0.0";

function draft(
  componentId: string,
  contract: Omit<ComponentContract, "componentId" | "contractVersion" | "lifecycle" | "publishedAt" | "publishedBy">,
  version: string = CONTRACT_VERSION,
): ComponentContract {
  return {
    componentId,
    contractVersion: version,
    lifecycle: "DRAFT",
    publishedAt: null,
    publishedBy: null,
    ...contract,
  };
}

// ---------------------------------------------------------------------------
// C01 招标文件智能解析（标书 ➜ 偏离表）
// ---------------------------------------------------------------------------
export const C01_CONTRACT: ComponentContract = draft("C01", {
  input: {
    kind: "FILE",
    fileConstraints: {
      required: true,
      minCount: 1,
      maxCount: 1,
      acceptedMimes: [".pdf", ".doc", ".docx", ".txt", ".md"],
      maxSingleFileBytes: 20_971_520,
      maxTotalBytes: 20_971_520,
    },
  },
  materialPipeline: {
    steps: [
      { name: "招标文件文档文本提取", type: "DOCUMENT_PARSE" },
      { name: "提取文本归一化", type: "TEXT_NORMALIZE" },
    ],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c01-rfp-deviation",
        name: "招标要求提取与偏离表生成",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深投标售前分析专家。请对提供的招标文件文本进行结构化解析，输出《招标要求与偏离分析报告》，必须包含四个部分：\n" +
          "1. 《招标关键要求清单》：逐条列出资格门槛、技术指标、商务条款、交付与验收要求；\n" +
          "2. 《我方能力匹配》：对每条要求标注【完全匹配 / 需要定制 / 无法满足】并简述理由；\n" +
          "3. 《偏离表》：以 Markdown 表格输出，列固定为「序号 | 招标要求 | 我方响应 | 偏离结论 | 风险提示」；\n" +
          "4. 《风险与替代建议》：给出需要重点关注的竞标风险与可替代方案。\n" +
          "硬性要求：严格忠于原文，不得编造招标条款；原文未明确的条目必须显式标注「原文未明确」。",
        inputMapping: {},
        outputKey: "rfp_deviation_report",
        contextBudgetTokens: 16_000,
        maxOutputTokens: 2_200,
        timeoutMs: 180_000,
        requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
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
    structureConstraints: {
      requiredProperties: ["requirements", "deviations", "risks"],
    },
  },
  qualityPolicy: {
    requiredSections: ["招标要求", "能力匹配", "偏离", "风险"],
    minOutputLength: 200,
    forbiddenPhrases: [],
    disclaimerPolicy: {
      required: true,
      marker: "AI 招标分析建议",
      template: "本结果为 AI 生成的投标响应与偏离分析建议，需由投标或业务负责人复核。",
    },
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 50,
    ruleDescription: "按组件声明的估算 Token 预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C02 方案安全合规体检（方案 ➜ 合规报告）
// ---------------------------------------------------------------------------
export const C02_CONTRACT: ComponentContract = draft("C02", {
  input: {
    kind: "FILE",
    fileConstraints: {
      required: true,
      minCount: 1,
      maxCount: 1,
      acceptedMimes: [".pdf", ".doc", ".docx", ".txt", ".md"],
      maxSingleFileBytes: 20_971_520,
      maxTotalBytes: 20_971_520,
    },
  },
  materialPipeline: {
    steps: [
      { name: "技术方案文档文本提取", type: "DOCUMENT_PARSE" },
      { name: "提取文本归一化", type: "TEXT_NORMALIZE" },
    ],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c02-compliance-review",
        name: "等保与密码安全合规审查",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是网络安全等级保护与商用密码合规审查专家。请依据等保与密码合规的通行要求，对提供的技术方案文本进行审查，输出《方案安全合规体检报告》，必须包含四个部分：\n" +
          "1. 《总体结论》：合规结论与整体风险等级；\n" +
          "2. 《问题清单》：以 Markdown 表格输出，列固定为「序号 | 问题描述 | 对应合规要求 | 风险等级 | 整改建议」；\n" +
          "3. 《待补充材料清单》：列出需要方案方补充的安全设计与证明材料；\n" +
          "4. 《优先整改顺序》：给出整改优先级建议。\n" +
          "硬性要求：只依据输入材料与公开合规知识判断；不得虚构政策条款编号，无法确认的条目必须标注「需人工复核」。",
        inputMapping: {},
        outputKey: "compliance_report",
        contextBudgetTokens: 16_000,
        maxOutputTokens: 2_200,
        timeoutMs: 180_000,
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
    structureConstraints: {
      requiredProperties: ["conclusion", "findings", "remediation"],
    },
  },
  qualityPolicy: {
    requiredSections: ["合规结论", "问题清单", "待补充材料", "整改顺序"],
    minOutputLength: 200,
    forbiddenPhrases: ["已通过法律认证", "已完成合规认证", "已获得等保认证", "具备法律效力"],
    disclaimerPolicy: {
      required: true,
      marker: "AI 安全合规整改建议",
      template: "本结果为 AI 生成的安全合规整改建议，不等同于正式认证或专业机构结论。",
    },
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 80,
    ruleDescription: "按组件声明的估算 Token 预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C03 竞品优劣深度对比（竞品资料 ➜ 对比表）
// ---------------------------------------------------------------------------
export const C03_CONTRACT: ComponentContract = draft("C03", {
  input: {
    // 多主材料：竞品资料 + 我方能力清单可分多份上传（平台已支持合同驱动的多文件，按 maxCount 强校验）
    kind: "MULTI_FILE",
    fileConstraints: {
      required: true,
      minCount: 1,
      maxCount: 4,
      acceptedMimes: [".pdf", ".doc", ".docx", ".xlsx", ".xls", ".txt", ".md"],
      maxSingleFileBytes: 20_971_520,
      maxTotalBytes: 41_943_040,
    },
  },
  materialPipeline: {
    steps: [
      { name: "竞品与他方资料文本提取", type: "DOCUMENT_PARSE" },
      { name: "多材料合并", type: "MATERIAL_MERGE" },
    ],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c03-competitive-matrix",
        name: "竞品多维对比矩阵生成",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是竞品分析专家。输入材料可能包含多份文档（竞品资料与我方能力清单，以分隔线区分），请自行识别各部分归属。请据此输出机器可读的结构化对比结果，严格以 JSON 对象返回，字段名固定为 dimensions、rows、summary：\n" +
          "1. dimensions：字符串数组，比对维度名称；\n" +
          "2. rows：数组，每项为 {dimension, ours, competitor, verdict, note}，verdict 取值仅限「优势 / 劣势 / 持平」；\n" +
          "3. summary：字符串，给出优劣势数量统计与改进建议。\n" +
          "硬性要求：只依据输入材料，不得编造竞品参数；材料未覆盖的维度必须在 note 中标注「材料未提及」。",
        inputMapping: {},
        outputKey: "competitive_matrix",
        contextBudgetTokens: 16_000,
        maxOutputTokens: 2_000,
        timeoutMs: 180_000,
        requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
      },
    ],
  },
  output: {
    kind: "TABLE",
    artifactMime: "application/json",
    schemaVersion: "1.0",
    rendererType: "STRUCTURED_TABLE",
    previewable: true,
    downloadable: true,
    structureConstraints: {
      requiredProperties: ["dimensions", "rows", "summary"],
      schemaDefinition: {
        type: "object",
        required: ["dimensions", "rows", "summary"],
        properties: {
          dimensions: { type: "array", items: { type: "string" } },
          rows: { type: "array" },
          summary: { type: "string" },
        },
      },
    },
  },
  qualityPolicy: {
    minOutputLength: 100,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 120,
    ruleDescription: "按组件声明的估算 Token 预估扣点，未开启真实结算。",
  },
}, "1.0.2");

// ---------------------------------------------------------------------------
// C04 工作汇报白话文翻译（技术方案 ➜ 白话汇报）
// ---------------------------------------------------------------------------
export const C04_CONTRACT: ComponentContract = draft("C04", {
  input: {
    // 真实业务含「汇报对象（高管/技术）」参数，建模为结构化表单（服务端按合同字段强校验）
    kind: "STRUCTURED_FORM",
    formConstraints: {
      fields: [
        { name: "audience", label: "汇报对象", type: "select", required: true, options: ["高管", "技术", "两者"] },
        { name: "techPlan", label: "技术方案", type: "string", required: true },
      ],
    },
  },
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c04-plain-language",
        name: "面向不同受众的白话汇报改写",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是技术方案白话汇报专家。输入为结构化表单：汇报对象（高管 / 技术 / 两者）与技术方案正文。请据此输出《工作汇报（白话版）》：\n" +
          "1. 若汇报对象为「高管」，仅输出《高管版》：突出商业价值、成本收益与关键结论，避免技术术语；\n" +
          "2. 若为「技术」，仅输出《技术版》：保留关键架构与实现要点，用通俗语言解释；\n" +
          "3. 若为「两者」，同时输出《高管版》与《技术版》；\n" +
          "4. 末尾必须给出《一句话总结》。\n" +
          "硬性要求：忠于原方案事实，不得夸大或编造输入材料中不存在的数据。",
        inputMapping: {},
        outputKey: "plain_language_report",
        contextBudgetTokens: 12_000,
        maxOutputTokens: 2_000,
        timeoutMs: 120_000,
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
    structureConstraints: {
      requiredProperties: ["executive", "technical", "summary"],
    },
  },
  qualityPolicy: {
    requiredSections: ["高管版"],
    minOutputLength: 150,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: false,
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 60,
    ruleDescription: "按组件声明的估算 Token 预估扣点，未开启真实结算。",
  },
}, "1.0.1");

// ---------------------------------------------------------------------------
// C05 开发工时与成本估算（模块清单 ➜ 成本测算）
// ---------------------------------------------------------------------------
export const C05_CONTRACT: ComponentContract = draft("C05", {
  input: {
    kind: "TEXT",
    textConstraints: {
      required: true,
      minLength: 1,
      maxLength: 100_000,
      placeholder: "请输入功能模块清单、团队成员角色与人数等估算输入信息",
    },
  },
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c05-effort-cost",
        name: "开发工时与成本测算",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是软件项目成本与工时估算专家。请基于输入的模块清单与团队信息，输出《开发工时与成本估算报告》，必须包含四个部分：\n" +
          "1. 《工时估算》：以 Markdown 表格输出，列固定为「模块 | 角色 | 人天」；\n" +
          "2. 《成本测算》：分别给出人力成本、软硬件与云资源成本及合计；\n" +
          "3. 《关键假设与不确定性说明》：列出估算所依赖的假设与置信区间；\n" +
          "4. 《风险与优化建议》。\n" +
          "硬性要求：给出估算区间与计算依据；如输入未提供单价/工时基准，必须显式采用下方基准并在报告中逐条列出其数值与性质（真实历史基准或假设值）：\n" +
          "{{COST_BASELINE}}\n" +
          "严禁在不声明的情况下静默套用任何单价或工时默认值。",
        inputMapping: {},
        outputKey: "effort_cost_report",
        contextBudgetTokens: 12_000,
        maxOutputTokens: 2_000,
        timeoutMs: 120_000,
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
    structureConstraints: {
      requiredProperties: ["effort", "cost", "assumptions"],
    },
  },
  qualityPolicy: {
    requiredSections: ["成本"],
    minOutputLength: 150,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: false,
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 150,
    ruleDescription: "按组件声明的估算 Token 预估扣点，未开启真实结算。",
  },
}, "1.0.2");

// ---------------------------------------------------------------------------
// 逐组件业务分析（迁移批次要求的字段清单）
// ---------------------------------------------------------------------------
const ANALYSIS: Record<string, ComponentContractMigrationAnalysis> = {
  C01: {
    componentId: "C01",
    purpose: "自动阅读招标文件关键要求，快速对比自身能力并生成差异偏离表（标书 ➜ 偏离表）",
    inputType: "FILE（单文件，招标文件）",
    textRequiredRule: "不适用（文件模式）；文本由服务端从上传文件提取，客户端粘贴文本不作为主材料",
    fileTypeAndSizeRule: "接受 .pdf/.doc/.docx/.txt/.md；单文件上限 20MB，总量上限 20MB",
    singleFileSupported: true,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequired: "UNKNOWN",
    requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    structure: "文档结构：requirements（要求清单）/ deviations（偏离表）/ risks（风险建议）",
    failureHandling: "REFUND_ON_FAILURE（模型/结果失败原路退款，不产生错误扣费）",
    estimatedTokens: 50,
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    notes:
      "0.1.0-sample 草稿声明了 FILE_ANALYSIS（错误：文件解析由平台服务端完成），已按真实用途重写为声明 TEXT_GENERATION + STRUCTURED_OUTPUT；平台默认部署已具备 STRUCTURED_OUTPUT，可 PUBLISH/激活。历史 0.1.0-sample DRAFT 已由 prisma/cleanup-c01-sample-draft.ts 清理。",
  },
  C02: {
    componentId: "C02",
    purpose: "扫描技术方案文档，检查是否符合等保与密码安全合规要求（方案 ➜ 合规报告）",
    inputType: "FILE（单文件，技术方案文档）",
    textRequiredRule: "不适用（文件模式）",
    fileTypeAndSizeRule: "接受 .pdf/.doc/.docx/.txt/.md；单文件上限 20MB，总量上限 20MB",
    singleFileSupported: true,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequired: "UNKNOWN",
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    structure: "文档结构：conclusion（总体结论）/ findings（问题清单）/ remediation（整改建议）",
    failureHandling: "REFUND_ON_FAILURE",
    estimatedTokens: 80,
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    notes: "仅需文本生成，可 PUBLISH 并激活。",
  },
  C03: {
    componentId: "C03",
    purpose: "提取竞品介绍文档的核心数据，自动生成优劣势对比分析表格（竞品资料 ➜ 对比表）",
    inputType: "MULTI_FILE（竞品资料 + 我方能力清单，1-4 份）",
    textRequiredRule: "不适用（多文件模式）",
    fileTypeAndSizeRule: "接受 .pdf/.doc/.docx/.xlsx/.xls/.txt/.md；单文件上限 20MB，总量上限 40MB",
    singleFileSupported: true,
    multiFileSupported: true,
    imageSupported: false,
    ocrRequired: "UNKNOWN",
    requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
    outputKind: "TABLE",
    rendererType: "STRUCTURED_TABLE",
    structure: "结构化字段：dimensions（维度数组）/ rows（对比行数组）/ summary",
    failureHandling: "REFUND_ON_FAILURE",
    estimatedTokens: 120,
    contractVersion: "1.0.2",
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    notes:
      "核心价值为机器可读的多维对比表（审计推荐原型 TABLE_OR_SCORE_OUTPUT），声明 STRUCTURED_OUTPUT；输入为多主材料（MULTI_FILE，1-4 份）。平台已支持合同驱动的多文件上传：按 fileConstraints.maxCount 强校验数量、逐文件校验 MIME 与单文件大小、校验总量，并按序合并提取文本。",
  },
  C04: {
    componentId: "C04",
    purpose: "根据汇报对象（高管或技术人），将深奥的技术方案转化为易懂的白话文汇报（技术方案 ➜ 白话汇报）",
    inputType: "STRUCTURED_FORM（结构化表单：汇报对象 + 技术方案）",
    textRequiredRule: "不适用（结构化表单模式）；必填字段由 formConstraints 强制（audience / techPlan）",
    fileTypeAndSizeRule: "不适用（纯文本模式）",
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequired: "NOT_REQUIRED",
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    structure: "文档结构：executive（高管版）/ technical（技术版）/ summary（一句话总结）",
    failureHandling: "REFUND_ON_FAILURE",
    estimatedTokens: 60,
    contractVersion: "1.0.1",
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    notes:
      "「汇报对象（高管/技术/两者）」已建模为结构化表单 select 字段，route 已支持 STRUCTURED_FORM 服务端强校验（必填 + 选项合法），以 1.0.1 修正。MISSING：前端表单 UI 尚未提供（当前可通过 API 传入 formData）。",
  },
  C05: {
    componentId: "C05",
    purpose: "结合历史开发数据，自动估算新项目所需的资金、人员工时和软硬件开销（模块清单 ➜ 成本测算）",
    inputType: "TEXT（模块清单/团队信息）",
    textRequiredRule: "文本必填：minLength=1，maxLength=100000",
    fileTypeAndSizeRule: "不适用（纯文本模式）",
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequired: "NOT_REQUIRED",
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    structure: "文档结构：effort（工时表）/ cost（成本测算）/ assumptions（假设与不确定性）",
    failureHandling: "REFUND_ON_FAILURE",
    estimatedTokens: 150,
    contractVersion: "1.0.2",
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: ["真实历史工时/单价数据集（接入机制已就绪：配置 systemconfig.COMPONENT_COST_BASELINE 即自动生效）"],
    notes:
      "以 1.0.2 改为消费「{{COST_BASELINE}}」占位符：已接入真实历史基准（systemconfig.COMPONENT_COST_BASELINE）时注入真实数据并在报告中注明来源；未配置时回退为显式假设文本（模型必须标注为假设值），严禁静默套用。",
  },
};

export const C01_C05_BATCH = [
  { componentId: "C01", contract: C01_CONTRACT, analysis: ANALYSIS.C01 },
  { componentId: "C02", contract: C02_CONTRACT, analysis: ANALYSIS.C02 },
  { componentId: "C03", contract: C03_CONTRACT, analysis: ANALYSIS.C03 },
  { componentId: "C04", contract: C04_CONTRACT, analysis: ANALYSIS.C04 },
  { componentId: "C05", contract: C05_CONTRACT, analysis: ANALYSIS.C05 },
] as const;

export const C01_C05_CONTRACTS: ComponentContract[] = C01_C05_BATCH.map((b) => b.contract);

/** 依据真实部署能力裁决合同是否可激活（缺失能力必须显式列出，绝不静默放行） */
export function evaluateActivationEligibility(
  contract: ComponentContract,
  deploymentCapabilities: string[],
): { eligible: boolean; requiredCapabilities: RequiredModelCapability[]; missingCapabilities: string[] } {
  const declared = new Set(deploymentCapabilities.map((c) => String(c).toUpperCase()));
  const requiredCapabilities = Array.from(
    new Set(contract.executionPlan.steps.flatMap((s) => s.requiredCapabilities)),
  );
  const missingCapabilities = requiredCapabilities.filter((c) => !declared.has(String(c).toUpperCase()));
  return { eligible: missingCapabilities.length === 0, requiredCapabilities, missingCapabilities };
}
