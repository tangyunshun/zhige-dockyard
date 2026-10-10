/**
 * 批次 2E3 组件合同（C26、C27、C28、C29、C30、C31）真实业务合同定义
 *
 * 说明：经排查，C26-C31 在真实组件目录（prisma/component-catalog-data.ts）中已是
 * QA/运维类真实组件（单元测试用例生成 / 接口并发测试 / 服务器压测 / 代码质量扫描 /
 * UI 点按测试 / Docker 打包）。本批次即为这 6 个真实目录行编写合同，不存在 ID 冲突，
 * 不会覆盖任何现有组件（其 activeContractId 当前为 null、且无任何合同）。
 *
 * 严格遵循批次约束（沿用 E2 基线）：
 *  - 逐组件依据**真实业务用途**与**真实目录行**（已核验 DB 实际行）编写，
 *    禁止复制既有合同后仅改 componentId；
 *  - 禁止默认合同、占位提示词与模拟结果；六份合同目标、输入方式、提示词、输出结构两两不同；
 *  - 仅使用当前支持的输出类型：DOCUMENT、JSON；
 *    C29 代码质量扫描结果为结构化数据 → JSON（schemaDefinition 结构化校验，要求 STRUCTURED_OUTPUT），
 *    其余 5 份为代码/方案/脚本类 → DOCUMENT（Markdown 承载）；
 *  - 未经证据不声明 VISION / FILE_ANALYSIS / LONG_CONTEXT：输入为文本或源码/OpenAPI 文本文件，
 *    文件按文本理解，不声明 FILE_ANALYSIS；单次上下文预算 ≤ 16000 tokens → 不声明 LONG_CONTEXT；
 *  - 合同严禁携带 providerId / modelId / upstreamModel / baseUrl / apiKey 等模型绑定字段；
 *  - 能力裁决复用纯函数 `evaluateActivationEligibility`（单一实现）。
 *
 * 差异化输入（真实目录 inputMode）：
 *  - C26 inputMode=both（源码文件或文本），accept=.ts,.js,.tsx,.jsx,.py,.java,.go,.txt；
 *  - C27 inputMode=both（OpenAPI/Swagger 文件或文本），accept=.json,.yaml,.yml,.txt,.md；
 *  - C28 inputMode=text（目标 URL + 并发人数）；
 *  - C29 inputMode=both（源码文件或文本），accept=.ts,.js,.tsx,.jsx,.py,.java,.go,.c,.cpp,.txt；
 *  - C30 inputMode=text（用户操作步骤描述）；
 *  - C31 inputMode=text（语言/依赖说明）。
 *
 * 注意：本模块只产出 DRAFT 合同模板（publishedAt/publishedBy 为 null），
 * 是否 PUBLISH/激活由 `evaluateActivationEligibility` 依据真实部署能力裁决。
 */

import {
  ComponentContract,
  ComponentOutputKind,
  RendererType,
  RequiredModelCapability,
} from "./types";
// 复用第一批合同的激活裁决纯函数（单一实现；本模块不重复实现，避免两份语义漂移）
export { evaluateActivationEligibility } from "./catalog-contracts-c01-c05";

/** 逐组件业务分析（覆盖批次要求的全部字段） */
export interface Batch2E3ContractAnalysis {
  componentId: string;
  businessPurpose: string;
  inputMethod: string;
  textRequirement: string;
  fileRequirement: string;
  singleFileSupported: boolean;
  multiFileSupported: boolean;
  imageSupported: boolean;
  ocrRequirement: "REQUIRED" | "NOT_REQUIRED" | "UNKNOWN";
  structuredOutputRequired: boolean;
  requiredCapabilities: RequiredModelCapability[];
  outputKind: ComponentOutputKind;
  rendererType: RendererType;
  artifactStructure: string;
  failureHandling: string;
  estimatedTokens: number;
  realDataBaseline: string;
  capabilitySupport: string;
  contractVersion: string;
  publishStatus: "DRAFT";
  activationStatus: "ELIGIBLE" | "BLOCKED";
  missingMaterials: string[];
  unsupportedRequirements: string[];
  notes: string;
}

const CONTRACT_VERSION = "1.0.0";
const MAX_TEXT_LENGTH = 20_000;
const MIN_TEXT_LENGTH = 20;
const MAX_SINGLE_BYTES = 2_000_000;

/** 支持的输出类型白名单（与系统当前真实支持范围严格一致） */
export const SUPPORTED_OUTPUT_KINDS: readonly ComponentOutputKind[] = ["DOCUMENT", "TABLE", "JSON"];

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

/** 纯文本类组件的统一输入合同（C28/C30/C31 共用形态，placeholder 与业务语义各自不同） */
function textOnlyInput(placeholder: string) {
  return {
    kind: "TEXT" as const,
    textConstraints: {
      required: true,
      minLength: MIN_TEXT_LENGTH,
      maxLength: MAX_TEXT_LENGTH,
      placeholder,
    },
  };
}

/** 文本 + 文件类组件输入合同（C26/C27/C29：inputMode='both'，文本或文件任一非空即可；maxCount = 1） */
function bothInput(acceptedMimes: string[], maxSingleBytes: number) {
  return {
    kind: "TEXT_AND_FILES" as const,
    textConstraints: {
      required: false,
      minLength: MIN_TEXT_LENGTH,
      maxLength: MAX_TEXT_LENGTH,
      placeholder: "可粘贴源码/接口定义文本，或直接上传对应文件。",
    },
    fileConstraints: {
      required: false,
      maxCount: 1,
      acceptedMimes,
      maxSingleFileBytes: maxSingleBytes,
      maxTotalBytes: maxSingleBytes,
    },
  };
}

// ---------------------------------------------------------------------------
// C26 逻辑单元测试用例生成（both: 源码文件或文本，函数 ➜ 单元测试）
// ---------------------------------------------------------------------------
export const C26_CONTRACT: ComponentContract = draft("C26", {
  input: bothInput([".ts", ".js", ".tsx", ".jsx", ".py", ".java", ".go", ".txt", "text/plain"], MAX_SINGLE_BYTES),
  materialPipeline: {
    steps: [{ name: "输入文本/文件提取与归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c26-unit-test-gen",
        name: "单元测试代码产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深测试工程师。请基于输入材料（源码文件或函数代码），输出《单元测试方案》，必须包含两部分：\n" +
          "1. 《测试用例》章节：以 Markdown 表格列出覆盖正常路径、边界输入（空值/极值/特殊字符）、异常输入的测试用例，标注预期结果；\n" +
          "2. 《边界》章节：说明边界值与异常模拟策略，并给出可直接运行的 Jest/Vitest 测试代码块（含 describe/it 与断言）。\n" +
          "硬性要求：必须产出「测试用例」与「边界」章节且测试代码可运行；输入未声明测试框架时必须显式标注「待确认」并给假设（默认 Vitest）；" +
          "严禁编造不存在的测试 API。",
        inputMapping: {},
        outputKey: "unit_test_package",
        contextBudgetTokens: 12_000,
        maxOutputTokens: 2_500,
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
      requiredProperties: ["测试用例", "边界"],
    },
  },
  qualityPolicy: {
    requiredSections: ["测试用例", "边界"],
    minOutputLength: 400,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证覆盖率100%", "已通过生产验证"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下单元测试由模型辅助生成，请人工核对断言正确性与测试框架版本后使用。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 80,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C27 接口自动调试与并发测试（both: OpenAPI/Swagger 文件或文本，接口定义 ➜ 测试方案）
// ---------------------------------------------------------------------------
export const C27_CONTRACT: ComponentContract = draft("C27", {
  input: bothInput(
    [".json", ".yaml", ".yml", ".txt", ".md", "text/plain", "application/json", "application/yaml"],
    MAX_SINGLE_BYTES,
  ),
  materialPipeline: {
    steps: [{ name: "输入文本/文件提取与归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c27-api-test-gen",
        name: "接口测试方案产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深接口测试工程师。请基于输入材料（OpenAPI/Swagger 定义或接口说明），输出《接口测试方案》，必须包含两部分：\n" +
          "1. 《接口用例》章节：以 Markdown 表格列出鉴权、正常参数、异常参数、越权与并发校验用例，标注请求方法与预期状态码；\n" +
          "2. 《并发》章节：说明高并发压测与防越权检查策略，并给出可直接运行的接口测试脚本代码块（如 k6/Playwright 或 curl 集合）。\n" +
          "硬性要求：必须产出「接口用例」与「并发」章节；输入未声明测试工具时必须显式标注「待确认」并给假设（默认 k6）；" +
          "严禁编造不存在的接口字段。",
        inputMapping: {},
        outputKey: "api_test_package",
        contextBudgetTokens: 14_000,
        maxOutputTokens: 3_000,
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
      requiredProperties: ["接口用例", "并发"],
    },
  },
  qualityPolicy: {
    requiredSections: ["接口用例", "并发"],
    minOutputLength: 400,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证接口零漏洞", "无需任何测试"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下接口测试方案由模型辅助生成，请人工核对鉴权与并发阈值后使用。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 100,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C28 服务器压力承受测试（text: 目标 URL + 并发人数，需求 ➜ 压测脚本）
// ---------------------------------------------------------------------------
export const C28_CONTRACT: ComponentContract = draft("C28", {
  input: textOnlyInput("请描述目标服务 URL 与期望的最大并发模拟人数，例如：压测 https://api.example.com/health，最大并发 5000 用户，阶梯递增至峰值。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c28-load-test-gen",
        name: "压测脚本产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深性能测试工程师。请基于输入材料（目标服务 URL 与最大并发人数），输出《服务器压测方案》，必须包含一章《压测脚本》：给出可直接运行的压测脚本代码块（如 k6/JMeter），含阶梯递增并发、响应耗时采集与失败率阈值；并以表格列出并发档位与预期指标。\n" +
          "硬性要求：必须产出「压测脚本」章节且脚本可运行；输入未声明压测工具时必须显式标注「待确认」并给假设（默认 k6）；" +
          "严禁编造不存在的服务端点。",
        inputMapping: {},
        outputKey: "load_test_package",
        contextBudgetTokens: 12_000,
        maxOutputTokens: 3_000,
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
      requiredProperties: ["压测脚本"],
    },
  },
  qualityPolicy: {
    requiredSections: ["压测脚本"],
    minOutputLength: 400,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证服务器永不崩", "无需任何测试"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下压测脚本由模型辅助生成，请人工核对目标端点与并发上限后再执行，避免对生产造成冲击。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 200,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C29 代码质量与垃圾代码扫描（both: 源码文件或文本，代码 ➜ 结构化扫描结果 JSON）
//   差异化样本：输出 kind = JSON（扫描结果本就是结构化数据，结构化校验强于 MARKDOWN）。
// ---------------------------------------------------------------------------
export const C29_CONTRACT: ComponentContract = draft("C29", {
  input: bothInput(
    [".ts", ".js", ".tsx", ".jsx", ".py", ".java", ".go", ".c", ".cpp", ".txt", "text/plain"],
    MAX_SINGLE_BYTES,
  ),
  materialPipeline: {
    steps: [{ name: "输入文本/文件提取与归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c29-quality-scan",
        name: "代码质量扫描结果 JSON 产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深代码质量工程师。请基于输入材料（源码文件或代码片段），输出《代码质量扫描结果》，要求：\n" +
          "1. 必须输出一段**合法 JSON**（可被 JSON.parse 解析），顶层对象含 summary（扫描概览）与 issues（问题数组）；\n" +
          "2. issues 每项含 { file, line, severity(INFO/WARN/ERROR), type, message, suggestion } 字段；\n" +
          "3. 覆盖逻辑缺陷、安全隐患、重复与臃肿代码；对无法判定项显式标注「待确认」。\n" +
          "硬性要求：输出必须是合法 JSON（不得用 Markdown 散文包裹核心数据）；issues 必须有至少一项；severity 必须取值 INFO/WARN/ERROR。",
        inputMapping: {},
        outputKey: "quality_scan_package",
        contextBudgetTokens: 12_000,
        maxOutputTokens: 2_000,
        timeoutMs: 180_000,
        requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
      },
    ],
  },
  output: {
    kind: "JSON",
    artifactMime: "application/json",
    schemaVersion: "1.0",
    rendererType: "JSON_VIEWER",
    previewable: true,
    downloadable: true,
    structureConstraints: {
      schemaDefinition: {
        type: "object",
        properties: {
          summary: { type: "object" },
          issues: { type: "array" },
        },
      },
    },
  },
  qualityPolicy: {
    minOutputLength: 200,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证代码零缺陷", "无需人工复核"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下代码质量扫描结果由模型辅助生成，请人工复核高危项后再修复。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 120,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C30 模拟真人点按界面测试（text: 操作步骤 ➜ Playwright/Cypress 脚本）
// ---------------------------------------------------------------------------
export const C30_CONTRACT: ComponentContract = draft("C30", {
  input: textOnlyInput("请用白话文描述用户的一连串操作步骤与预期的文案显示，例如：登录后搜索商品，加入购物车，进入结算页，提交订单，验证订单号显示成功。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c30-ui-test-gen",
        name: "UI 自动化测试脚本产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深自动化测试工程师。请基于输入材料（用户操作步骤白话文描述），输出《UI 自动化测试方案》，必须包含一章《自动化脚本》：给出可直接运行的 Playwright/Cypress 测试脚本代码块，覆盖登录-搜索-下单-支付全流程，含元素定位、断言与截图；并以表格列出关键步骤与预期文案。\n" +
          "硬性要求：必须产出「自动化脚本」章节且脚本可运行；输入未声明测试框架时必须显式标注「待确认」并给假设（默认 Playwright）；" +
          "严禁编造不存在的选择器 API。",
        inputMapping: {},
        outputKey: "ui_test_package",
        contextBudgetTokens: 14_000,
        maxOutputTokens: 3_500,
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
      requiredProperties: ["自动化脚本"],
    },
  },
  qualityPolicy: {
    requiredSections: ["自动化脚本"],
    minOutputLength: 500,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证流程零失败", "无需任何测试"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下 UI 自动化脚本由模型辅助生成，请人工核对元素定位与断言后再运行。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 180,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C31 应用环境一键打包(Docker)（text: 语言/依赖 ➜ Dockerfile）
// ---------------------------------------------------------------------------
export const C31_CONTRACT: ComponentContract = draft("C31", {
  input: textOnlyInput("请描述您使用的语言（Node.js/Java 等）以及运行所需的系统依赖库，例如：Node.js 18 项目，依赖 express 与 prisma，需要多阶段构建镜像。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c31-docker-gen",
        name: "Docker 配置产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深 DevOps 工程师。请基于输入材料（语言/运行时与依赖库说明），输出《Docker 打包方案》，必须包含一章《Dockerfile》：给出标准多阶段 Dockerfile 代码块（含基础镜像、依赖安装、构建与启动命令），并附构建与运行命令说明；以表格列出镜像层级与体积优化点。\n" +
          "硬性要求：必须产出「Dockerfile」章节且配置可运行；输入未声明运行时时必须显式标注「待确认」并给假设（默认 Node.js 18 多阶段构建）；" +
          "严禁编造不存在的基础镜像。",
        inputMapping: {},
        outputKey: "docker_package",
        contextBudgetTokens: 10_000,
        maxOutputTokens: 2_000,
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
      requiredProperties: ["Dockerfile"],
    },
  },
  qualityPolicy: {
    requiredSections: ["Dockerfile"],
    minOutputLength: 300,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证一键部署成功", "无需任何测试"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下 Docker 配置由模型辅助生成，请人工核对基础镜像与启动命令后构建。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 60,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// 逐组件业务分析（批次 2E3 要求的全部字段）
// ---------------------------------------------------------------------------
const BOTH_INPUT_METHOD_C26 =
  "文本粘贴或上传源码文件（目录 inputMode=both；accept=.ts,.js,.tsx,.jsx,.py,.java,.go,.txt；MIME 含 text/plain 与源码扩展名）";
const BOTH_INPUT_METHOD_C27 =
  "文本粘贴或上传 OpenAPI/Swagger 文件（目录 inputMode=both；accept=.json,.yaml,.yml,.txt,.md；MIME 含 application/json,application/yaml,text/plain）";
const TEXT_INPUT_METHOD = "纯文本粘贴（目录 inputMode=text）";
const BOTH_INPUT_METHOD_C29 =
  "文本粘贴或上传源码文件（目录 inputMode=both；accept=.ts,.js,.tsx,.jsx,.py,.java,.go,.c,.cpp,.txt；MIME 含 text/plain 与源码扩展名）";

export const BATCH_2E3_ANALYSIS: Record<"C26" | "C27" | "C28" | "C29" | "C30" | "C31", Batch2E3ContractAnalysis> = {
  C26: {
    componentId: "C26",
    businessPurpose:
      "输入编写好的函数或源码，自动生成 Jest/Vitest 单元测试，确保逻辑万无一失（目录真实描述：输入编写好的函数，自动生成 Jest/Vitest 单元测试，确保逻辑万无一失）。",
    inputMethod: BOTH_INPUT_METHOD_C26,
    textRequirement: "可选（与文件二选一，任一非空即可）；最短 20 字符，最长 20000 字符",
    fileRequirement:
      "可选；单文件（maxCount=1），≤ 2MB；accept=.ts,.js,.tsx,.jsx,.py,.java,.go,.txt（MIME: text/plain 与源码扩展名）",
    singleFileSupported: true,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: false,
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    artifactStructure: "Markdown 文档：测试用例（用例表）/ 边界（测试代码块）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 80,
    realDataBaseline: "需要源码或函数作为唯一材料；测试框架若未声明必须显式标注「待确认」。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "产物是单元测试代码文本 → 仅声明 TEXT_GENERATION；要求 requireHumanReview=true。",
  },
  C27: {
    componentId: "C27",
    businessPurpose:
      "依据接口定义自动生成测试用例，模拟鉴权及接口参数校验是否通过（目录真实描述：依据接口定义，自动生成测试用例，模拟鉴权及接口参数校验是否通过）。",
    inputMethod: BOTH_INPUT_METHOD_C27,
    textRequirement: "可选（与文件二选一，任一非空即可）；最短 20 字符，最长 20000 字符",
    fileRequirement:
      "可选；单文件（maxCount=1），≤ 2MB；accept=.json,.yaml,.yml,.txt,.md（MIME: application/json,application/yaml,text/plain）",
    singleFileSupported: true,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: false,
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    artifactStructure: "Markdown 文档：接口用例（用例表）/ 并发（测试脚本代码块）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 100,
    realDataBaseline: "需要接口定义（OpenAPI/Swagger 或文本）作为唯一材料；测试工具若未声明必须显式标注「待确认」。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "产物是接口测试方案文本 → 仅声明 TEXT_GENERATION；要求 requireHumanReview=true。",
  },
  C28: {
    componentId: "C28",
    businessPurpose:
      "模拟成千上万用户同时访问，测试服务器在高并发下的抗压极限（目录真实描述：模拟成千上万用户同时疯狂访问，测试服务器在高并发下的抗压极限）。",
    inputMethod: TEXT_INPUT_METHOD,
    textRequirement: "必填；最短 20 字符，最长 20000 字符",
    fileRequirement: "不适用（纯文本模式）",
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: false,
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    artifactStructure: "Markdown 文档：压测脚本（k6/JMeter 代码块）+ 并发档位表",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 200,
    realDataBaseline: "需要目标 URL 与并发人数来自用户输入；压测工具若未声明必须显式标注「待确认」。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "产物是压测脚本文本 → 仅声明 TEXT_GENERATION；要求 requireHumanReview=true，禁止伪造「服务器永不崩」。",
  },
  C29: {
    componentId: "C29",
    businessPurpose:
      "自动筛查代码中的逻辑缺陷、安全隐患以及臃肿重复的技术垃圾（目录真实描述：自动筛查代码中的逻辑缺陷、安全隐患以及臃肿重复的技术垃圾）。",
    inputMethod: BOTH_INPUT_METHOD_C29,
    textRequirement: "可选（与文件二选一，任一非空即可）；最短 20 字符，最长 20000 字符",
    fileRequirement:
      "可选；单文件（maxCount=1），≤ 2MB；accept=.ts,.js,.tsx,.jsx,.py,.java,.go,.c,.cpp,.txt（MIME: text/plain 与源码扩展名）",
    singleFileSupported: true,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: true,
    requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
    outputKind: "JSON",
    rendererType: "JSON_VIEWER",
    artifactStructure: "合法 JSON：{ summary, issues:[{file,line,severity,type,message,suggestion}] }",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出非合法 JSON 或结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 120,
    realDataBaseline: "需要源码作为唯一材料；模型将代码规整为结构化扫描结果；无法判定项显式标注「待确认」。",
    capabilitySupport:
      "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件输出 JSON 需 STRUCTURED_OUTPUT，二者均具备。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "差异化样本：输出 JSON（代码质量扫描结果），以 schemaDefinition 定义 summary/issues，结构化校验强于 MARKDOWN；仅 C29 声明 STRUCTURED_OUTPUT。",
  },
  C30: {
    componentId: "C30",
    businessPurpose:
      "模拟用户在浏览器上自动完成（登录-搜索-下单-支付）等全流程自动化测试（目录真实描述：模拟用户在浏览器上自动完成全流程自动化测试）。",
    inputMethod: TEXT_INPUT_METHOD,
    textRequirement: "必填；最短 20 字符，最长 20000 字符",
    fileRequirement: "不适用（纯文本模式）",
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: false,
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    artifactStructure: "Markdown 文档：自动化脚本（Playwright/Cypress 代码块）+ 步骤预期表",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 180,
    realDataBaseline: "需要用户操作步骤描述来自用户输入；测试框架若未声明必须显式标注「待确认」。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "产物是 UI 自动化脚本文本 → 仅声明 TEXT_GENERATION；要求 requireHumanReview=true。",
  },
  C31: {
    componentId: "C31",
    businessPurpose:
      "自动编写 Docker 容器化配置，将软件运行所依赖的环境和代码打包成独立盒子（目录真实描述：自动编写 Docker 容器化配置，打包成独立盒子）。",
    inputMethod: TEXT_INPUT_METHOD,
    textRequirement: "必填；最短 20 字符，最长 20000 字符",
    fileRequirement: "不适用（纯文本模式）",
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: false,
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    artifactStructure: "Markdown 文档：Dockerfile（多阶段构建代码块）+ 镜像层级优化表",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 60,
    realDataBaseline: "需要语言/依赖说明来自用户输入；运行时若未声明必须显式标注「待确认」并给假设。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "产物是 Dockerfile 文本 → 仅声明 TEXT_GENERATION；要求 requireHumanReview=true。",
  },
};

export const BATCH_2E3 = [
  { componentId: "C26", contract: C26_CONTRACT, analysis: BATCH_2E3_ANALYSIS.C26 },
  { componentId: "C27", contract: C27_CONTRACT, analysis: BATCH_2E3_ANALYSIS.C27 },
  { componentId: "C28", contract: C28_CONTRACT, analysis: BATCH_2E3_ANALYSIS.C28 },
  { componentId: "C29", contract: C29_CONTRACT, analysis: BATCH_2E3_ANALYSIS.C29 },
  { componentId: "C30", contract: C30_CONTRACT, analysis: BATCH_2E3_ANALYSIS.C30 },
  { componentId: "C31", contract: C31_CONTRACT, analysis: BATCH_2E3_ANALYSIS.C31 },
] as const;

export const BATCH_2E3_CONTRACTS: ComponentContract[] = BATCH_2E3.map((b) => b.contract);

/** 批次 2E3 目标组件 ID（仅 C26-C31，不覆盖任何现有组件） */
export const BATCH_2E3_COMPONENT_IDS = ["C26", "C27", "C28", "C29", "C30", "C31"] as const;

/** 批次 2E3 明确禁止触碰的组件 ID（冻结快照 + 暂停范围，沿用基线） */
export const BATCH_2E3_FORBIDDEN_IDS = ["C07", "C09"] as const;
