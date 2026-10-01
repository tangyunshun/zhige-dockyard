/**
 * CORE-3 合同候选基线：C01 / C02 / C07 @ 1.1.0（待业务负责人确认，不写库、不发布、不激活）
 *
 * 构成原则：
 *  - input / materialPipeline / executionPlan / output / billingPolicy 沿用各组件已批准的真实业务结构；
 *  - 仅 qualityPolicy 按业务负责人本轮明确提供的规则文本升级为 1.1.0；
 *  - contractVersion = "1.1.0"，lifecycle = "DRAFT"，publishedAt / publishedBy = null（发布流程另行裁决）；
 *  - 严禁组件 ID 特判；能力提取沿用通用 extractRequiredCapabilities。
 *
 * 本文件仅作为「待确认候选」源码，供业务负责人逐字段复核。确认后由发布流程经
 * repository（DRAFT → validateComponentContract → 能力校验 → 管理员审批 → PUBLISHED → 显式激活）落地。
 */
import {
  C01_CONTRACT,
  C02_CONTRACT,
} from "@/lib/component-contract/catalog-contracts-c01-c05";
import type { ComponentContract, ComponentQualityPolicy } from "@/lib/component-contract/types";

const C01_QUALITY_1_1_0: ComponentQualityPolicy = {
  requiredSections: ["招标关键要求清单|招标要求", "我方能力匹配|能力匹配", "偏离表|偏离", "风险与替代建议|风险"],
  minOutputLength: 200,
  forbiddenPhrases: [
    "保证中标",
    "包中标",
    "100%中标",
    "确保中标",
    "绝对满足招标要求",
    "零风险",
    "无需人工复核",
    "具备法律效力",
    "正式投标响应",
  ],
  disclaimerPolicy: {
    required: true,
    marker: "AI 招标分析建议",
    template:
      "本结果为 AI 生成的投标响应与偏离分析建议，需由投标或业务负责人复核，不构成正式投标响应或中标承诺。",
  },
  requireHumanReview: true,
  allowAutoRetry: true,
  maxRetryCount: 1,
  requireCitations: false,
};

const C02_QUALITY_1_1_0: ComponentQualityPolicy = {
  requiredSections: ["总体结论|合规结论", "问题清单", "待补充材料清单|待补充材料", "优先整改顺序|整改顺序"],
  minOutputLength: 200,
  forbiddenPhrases: [
    "已通过法律认证",
    "已完成合规认证",
    "已获得等保认证",
    "已通过等保测评",
    "已通过等级保护测评",
    "已完成商用密码认证",
    "已获得商用密码认证",
    "已通过国家法律法规",
    "100%合规",
    "保证合规",
    "无需整改",
    "无需人工复核",
    "具备法律效力",
  ],
  disclaimerPolicy: {
    required: true,
    marker: "AI 安全合规整改建议",
    template:
      "本结果为 AI 生成的安全合规整改建议，不等同于正式认证、法律意见或专业机构结论，必须由法务、安全或专业机构复核。",
  },
  requireHumanReview: true,
  allowAutoRetry: true,
  maxRetryCount: 1,
  requireCitations: false,
};

const C07_QUALITY_1_1_0: ComponentQualityPolicy = {
  requiredSections: ["背景与目标", "用户与使用场景", "功能需求", "非功能需求", "数据与接口", "验收标准"],
  minOutputLength: 600,
  forbiddenPhrases: [
    "已通过业务评审",
    "评审已批准",
    "已正式立项",
    "已锁定研发排期",
    "已进入开发",
    "已完成需求确认",
    "已验收通过",
    "已上线",
    "保证实现",
    "确保按期交付",
    "确定上线日期",
    "无需人工复核",
    "具备法律效力",
    "正式合同",
  ],
  disclaimerPolicy: {
    required: true,
    marker: "AI 需求规格草案",
    template:
      "本结果为 AI 基于输入材料生成的需求规格草案，仅供业务评审、产品分析和技术估算使用；未通过业务负责人确认，不构成研发排期、立项、交付或上线承诺。",
  },
  requireHumanReview: true,
  allowAutoRetry: false,
  maxRetryCount: 0,
  requireCitations: false,
};

export const C01_CANDIDATE_1_1_0: ComponentContract = {
  ...C01_CONTRACT,
  contractVersion: "1.1.0",
  lifecycle: "DRAFT",
  publishedAt: null,
  publishedBy: null,
  qualityPolicy: C01_QUALITY_1_1_0,
};

export const C02_CANDIDATE_1_1_0: ComponentContract = {
  ...C02_CONTRACT,
  contractVersion: "1.1.0",
  lifecycle: "DRAFT",
  publishedAt: null,
  publishedBy: null,
  qualityPolicy: C02_QUALITY_1_1_0,
};

// C07 无 TS 源码合同（仅迁移 SQL 1.0.0），此处依据迁移 SQL 的结构 + 本轮质量规则构造候选。
export const C07_CANDIDATE_1_1_0: ComponentContract = {
  componentId: "C07",
  contractVersion: "1.1.0",
  lifecycle: "DRAFT",
  publishedAt: null,
  publishedBy: null,
  input: {
    kind: "TEXT_AND_FILES",
    textConstraints: {
      required: false,
      minLength: 1,
      maxLength: 30000,
      placeholder: "请输入或粘贴分析文本材料",
    },
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
      maxSingleFileBytes: 20_971_520,
      maxTotalBytes: 20_971_520,
    },
  },
  materialPipeline: {
    steps: [{ name: "多模态材料预处理与标准化", type: "TEXT_NORMALIZE" }],
  },
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
  qualityPolicy: C07_QUALITY_1_1_0,
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 1500,
    ruleDescription: "按组件声明的估算 Token 预估扣点，未开启真实结算。",
  },
};

export const CORE3_CANDIDATES_1_1_0 = [
  C01_CANDIDATE_1_1_0,
  C02_CANDIDATE_1_1_0,
  C07_CANDIDATE_1_1_0,
] as const;
