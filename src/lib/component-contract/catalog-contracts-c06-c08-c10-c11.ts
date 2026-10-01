/**
 * 批次 2B 组件合同（C06、C08、C10、C11）真实业务合同定义
 *
 * 严格遵循批次约束（禁止规则）：
 *  - 逐组件依据**真实业务用途**编写，禁止复制 C01-C05/C07 合同后仅改 componentId；
 *  - 禁止默认合同、占位提示词与模拟结果；四份合同的目标、输入方式、提示词、输出结构、质量策略两两不同；
 *  - 禁止把所有组件统一成 TEXT_GENERATION：C08/C10 因产物是**机器可读结构化数据**（清单 / 数据行）
 *    而声明 STRUCTURED_OUTPUT（部署已真实具备），C06/C11 产物为人类阅读的文档，故仅声明 TEXT_GENERATION；
 *  - 未经证据严禁声明 VISION / FILE_ANALYSIS / LONG_CONTEXT：
 *      · 无任何组件需要图像理解 → 不声明 VISION；
 *      · C11 的 PDF/Word 解析由**平台服务端**完成（文件解析不经过模型）→ 不声明 FILE_ANALYSIS；
 *      · 单次上下文预算 ≤ 16000 tokens，未超出常规上下文 → 不声明 LONG_CONTEXT；
 *  - 合同严禁携带 providerId / modelId / upstreamModel / baseUrl / apiKey / apiVersion / endpoint 等模型绑定字段；
 *  - 能力裁决复用第一批的纯函数 `evaluateActivationEligibility`（单一实现，避免语义漂移）。
 *
 * 证据来源（真实数据，非编造）：
 *  - prisma/component-catalog-data.ts：目录真实 name / description / previewData / inputMode / accept / hint / estimatedModelTokens；
 *  - prisma/seed-components.ts（COMPONENT_EXTRA_SEED）：真实业务契约
 *    （C06 投入产出➜ROI报告 / C08 主流程➜异常清单 / C10 规则➜模拟数据 / C11 需求➜Rest API）与智能搜索关键词；
 *  - 数据库 component_catalog 实测：C06/C08/C10 inputMode=text，C11 inputMode=both、accept=.md,.txt,.pdf,.doc,.docx；
 *  - 数据库 platform default deployment 实测能力：TEXT_GENERATION + STRUCTURED_OUTPUT。
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
// 复用第一批合同的激活裁决纯函数（单一实现；本模块不重复实现，避免两份语义漂移）
export { evaluateActivationEligibility } from "./catalog-contracts-c01-c05";

/** 逐组件业务分析（覆盖批次 2B 要求的全部字段；缺失显式标注，绝不静默补默认值） */
export interface Batch2BContractAnalysis {
  componentId: string;
  /** 真实业务用途与用户目标 */
  businessPurpose: string;
  /** 用户输入方式（真实：来自 component_catalog.inputMode / accept / hint） */
  inputMethod: string;
  /** 文本必填规则 */
  textRequirement: string;
  /** 文件类型与大小限制 */
  fileRequirement: string;
  singleFileSupported: boolean;
  multiFileSupported: boolean;
  imageSupported: boolean;
  /** 是否需要 OCR */
  ocrRequirement: "REQUIRED" | "NOT_REQUIRED" | "UNKNOWN";
  /** 是否需要机器可读的结构化输出 */
  structuredOutputRequired: boolean;
  /** 模型能力要求（仅依据真实输出需求，严禁无证据声明） */
  requiredCapabilities: RequiredModelCapability[];
  outputKind: ComponentOutputKind;
  rendererType: RendererType;
  /** 输出 artifact 结构与展示方式 */
  artifactStructure: string;
  /** 失败处理规则 */
  failureHandling: string;
  /** 估算 Token（与 component_catalog.estimatedModelTokens 对齐） */
  estimatedTokens: number;
  /** 是否需要真实数据基准 */
  realDataBaseline: string;
  /** 当前部署能力是否支持（实测：TEXT_GENERATION + STRUCTURED_OUTPUT） */
  capabilitySupport: string;
  contractVersion: string;
  publishStatus: "DRAFT";
  activationStatus: "ELIGIBLE" | "BLOCKED";
  /** 资料缺口（无缺口为 []，缺失必须显式列出） */
  missingMaterials: string[];
  notes: string;
}

const CONTRACT_VERSION = "1.0.0";
const MAX_SINGLE_BYTES = 20_971_520; // 20MB
const MAX_TOTAL_BYTES = 20_971_520; // 20MB
const MAX_TEXT_LENGTH = 20_000;
const MAX_DOC_TEXT_LENGTH = 30_000;
const MIN_TEXT_LENGTH = 20;

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

/** 纯文本类组件的统一输入合同（C06/C08/C10 共用形态，但 placeholder 与业务语义各自不同） */
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

// ---------------------------------------------------------------------------
// C06 项目投资回报ROI分析（投入产出 ➜ ROI 报告）
// ---------------------------------------------------------------------------
export const C06_CONTRACT: ComponentContract = draft("C06", {
  input: textOnlyInput("请粘贴开发投入（人力/云资源/软硬件）与预期上线收益数据，例如：投入 180 万元、预计月增收入 30 万元。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c06-roi-analysis",
        name: "投入产出量化与投资回收期测算",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深项目投资与商业分析师。请基于输入材料中的开发投入（人力、云资源、软硬件等）与收益预测信息，输出《项目投资回报（ROI）分析报告》，必须包含四个部分：\n" +
          "1. 《投入明细》：以 Markdown 表格输出，列固定为「投入项 | 类别 | 金额（万元） | 说明」；\n" +
          "2. 《收益预测与净收益》：给出期间收益、成本摊销与累计净收益口径；\n" +
          "3. 《投资回收周期与 ROI》：给出静态回收期（月）与投资回报率，并列出关键计算式；\n" +
          "4. 《敏感性与风险提示》：对收益下滑、成本超支等情形给出敏感性结论与决策建议。\n" +
          "硬性要求：所有金额与周期必须给出计算口径与算式；输入未提供的参数必须显式标注为「假设值」并说明取值依据，" +
          "严禁编造输入材料中不存在的经营数据。",
        inputMapping: {},
        outputKey: "roi_assessment_report",
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
      requiredProperties: ["investment", "returns", "paybackPeriod", "risks"],
    },
  },
  qualityPolicy: {
    requiredSections: ["投资回收"],
    minOutputLength: 300,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: false,
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 200,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C08 业务异常与极端场景补全（主流程 ➜ 异常清单）
// ---------------------------------------------------------------------------
export const C08_CONTRACT: ComponentContract = draft("C08", {
  input: textOnlyInput("请粘贴正常主流程的业务描述，例如：用户在小程序下单，微信支付成功后扣减库存并生成发货单。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c08-exception-scenarios",
        name: "异常与极端场景枚举及处理方案生成",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深软件业务分析师与测试架构师。请基于输入的主流程业务逻辑，补全异常与极端场景，严格以 JSON 对象返回，字段名固定为 scenarios、coverageSummary、openQuestions：\n" +
          "1. scenarios：数组，每项为 {scenario, trigger, impact, handling, priority, category}；" +
          "priority 取值仅限「高 / 中 / 低」；category 取值仅限「网络中断 / 支付与资金 / 并发与一致性 / 数据边界 / 权限与安全 / 依赖服务异常 / 用户误操作」；\n" +
          "2. coverageSummary：字符串，说明已覆盖的异常维度与仍存在的覆盖缺口；\n" +
          "3. openQuestions：字符串数组，列出需业务方确认的未决问题。\n" +
          "硬性要求：必须覆盖断网中断与重试、支付失败或重复支付、并发超卖、空值与超长输入、越权访问、第三方依赖超时等类别；" +
          "只依据输入的主流程逻辑推导，不得虚构输入中不存在的业务规则。",
        inputMapping: {},
        outputKey: "exception_scenario_list",
        contextBudgetTokens: 12_000,
        maxOutputTokens: 2_800,
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
      requiredProperties: ["scenarios", "coverageSummary", "openQuestions"],
      schemaDefinition: {
        type: "object",
        required: ["scenarios", "coverageSummary", "openQuestions"],
        properties: {
          scenarios: { type: "array", description: "异常与极端场景清单" },
          coverageSummary: { type: "string", description: "覆盖度小结与缺口" },
          openQuestions: { type: "array", description: "待业务方确认的问题" },
        },
      },
    },
  },
  qualityPolicy: {
    requiredSections: ["异常"],
    minOutputLength: 300,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: false,
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 150,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C10 虚拟模拟测试数据生成（规则 ➜ 模拟数据）
// ---------------------------------------------------------------------------
export const C10_CONTRACT: ComponentContract = draft("C10", {
  input: textOnlyInput("请粘贴行业规则与目标表结构，例如：电商订单表，字段 user_name/mobile/amount/created_at，生成 20 条。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c10-mock-data-generation",
        name: "行业规则驱动的脱敏模拟数据生成",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是测试数据工程专家。请基于输入的行业规则、目标表结构与数据条数，生成高拟真度的模拟测试数据，" +
          "严格以 JSON 对象返回，字段名固定为 schema、rows、privacyNotes、summary：\n" +
          "1. schema：数组，每项为 {field, type, description}，声明生成的数据字段；\n" +
          "2. rows：数组，每项为一条记录对象，键必须与 schema 的 field 一一对应；" +
          "3. privacyNotes：字符串，说明脱敏与虚构策略；\n" +
          "4. summary：字符串，说明数据分布特征与使用限制。\n" +
          "硬性要求：姓名必须为虚构值，手机号必须中间四位打码，身份证/银行卡等敏感标识一律使用不可还原的虚构值；" +
          "严禁使用任何真实个人身份信息；当输入未声明条数时必须显式说明所采用的默认条数与理由；" +
          "生成的数据必须符合输入声明的行业规则与字段约束。",
        inputMapping: {},
        outputKey: "mock_dataset",
        contextBudgetTokens: 16_000,
        maxOutputTokens: 3_000,
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
      requiredProperties: ["schema", "rows", "privacyNotes", "summary"],
      schemaDefinition: {
        type: "object",
        required: ["schema", "rows", "privacyNotes", "summary"],
        properties: {
          schema: { type: "array", description: "字段定义（field/type/description）" },
          rows: { type: "array", description: "模拟数据记录行" },
          privacyNotes: { type: "string", description: "脱敏与虚构策略说明" },
          summary: { type: "string", description: "数据分布与使用限制说明" },
        },
      },
    },
  },
  qualityPolicy: {
    requiredSections: ["脱敏"],
    minOutputLength: 300,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: false,
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 250,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
  // 隐私与数据边界（明确可机器校验的硬约束；姓名不可靠判定，不声称服务端已验证）
  privacyPolicy: {
    requirePrivacyNotes: true,
    phoneMaskPattern: "1[3-9]\\d{1}\\*{2}\\d{4}",
    forbiddenUnmasked: ["ID_CARD", "BANK_CARD"],
    nameVerifiability: "NOT_SERVER_VERIFIABLE",
    notes:
      "服务端仅可机器校验：手机号必须中间四位打码、身份证/银行卡等高风险数字串不得明文出现、privacyNotes 必须非空。" +
      "姓名是否真实无法仅靠正则可靠判定，服务端不声称已证明其为虚构；生成数据作为合成测试数据使用前，必须由用户人工复核并确认已脱敏。",
  },
}, "1.0.1");

// ---------------------------------------------------------------------------
// C11 后端数据接口自动开发（需求 ➜ Rest API）
// ---------------------------------------------------------------------------
export const C11_CONTRACT: ComponentContract = draft("C11", {
  input: {
    kind: "TEXT_AND_FILES",
    textConstraints: {
      required: false,
      minLength: 1,
      maxLength: MAX_DOC_TEXT_LENGTH,
      placeholder: "请粘贴接口需求描述，例如：设计用户注册与手机验证码登录接口，含字段校验与错误码。",
    },
    fileConstraints: {
      required: false,
      minCount: 0,
      maxCount: 1,
      // 与目录 accept（.md/.txt/.pdf/.doc/.docx）逐项对应；文件解析由平台服务端完成，模型侧仅消费提取后的文本
      acceptedMimes: [
        "text/markdown",
        "text/plain",
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      maxSingleFileBytes: MAX_SINGLE_BYTES,
      maxTotalBytes: MAX_TOTAL_BYTES,
    },
  },
  materialPipeline: {
    steps: [
      { name: "接口需求文档文本提取（服务端完成）", type: "DOCUMENT_PARSE" },
      { name: "提取文本归一化", type: "TEXT_NORMALIZE" },
    ],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c11-rest-api-development",
        name: "后端数据接口设计与实现代码生成",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深后端架构师。请基于输入的接口需求（文字描述或需求文档提取文本），输出《后端数据接口设计与实现》，必须包含四个部分：\n" +
          "1. 《接口清单》：以 Markdown 表格输出，列固定为「方法 | 路径 | 用途 | 鉴权要求」；\n" +
          "2. 《接口实现代码》：给出可落地的后端接口代码（Node.js 或 Java，与输入需求的技术栈匹配），" +
          "必须包含入参字段格式校验、统一错误码与错误提示；\n" +
          "3. 《数据契约》：给出请求/响应字段表与调用示例；\n" +
          "4. 《说明书注解》：为每个接口说明用途、参数含义与错误码含义。\n" +
          "硬性要求：每个接口都必须包含参数校验与错误处理，不得省略校验逻辑；" +
          "输入未声明的字段、状态码或鉴权方式必须显式标注为「待确认」，严禁自行编造业务约束。",
        inputMapping: {},
        outputKey: "rest_api_spec_and_code",
        contextBudgetTokens: 16_000,
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
      requiredProperties: ["apiList", "code", "dataContract", "annotations"],
    },
  },
  qualityPolicy: {
    requiredSections: ["接口"],
    minOutputLength: 300,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: false,
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 80,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// 逐组件业务分析（批次 2B 要求的全部字段）
// ---------------------------------------------------------------------------
const CAPABILITY_SUPPORTED = "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖。";

export const BATCH_2B_ANALYSIS: Record<"C06" | "C08" | "C10" | "C11", Batch2BContractAnalysis> = {
  C06: {
    componentId: "C06",
    businessPurpose:
      "把「开发投入 + 预期收益」的粗算数据量化为投资回报结论：投入明细、收益预测与净收益、投资回收周期（月）与 ROI、敏感性与风险提示，支撑立项/续投决策（目录真实描述：量化产品的开发投入与预期收益，计算收回研发成本所需的工期时间）。",
    inputMethod: "纯文本粘贴（目录 inputMode=text；accept=.txt,.md,.json,.csv,.log,.sql,.ts,.js,.html,.css,.xml,.yaml,.yml）",
    textRequirement: "必填；最短 20 字符，最长 20000 字符（低于下限视为未提供有效材料）",
    fileRequirement: "不适用（纯文本模式，不接受文件上传）",
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: false,
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    artifactStructure: "Markdown 文档：investment（投入明细表）/ returns（收益与净收益）/ paybackPeriod（回收期与 ROI）/ risks（敏感性与风险）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/结果异常均由路由原路退款，不产生错误扣费（幂等，二次退款 refunded=0）",
    estimatedTokens: 200,
    realDataBaseline:
      "不需要真实数据基准：计算所需的投入/收益数值全部来自用户输入；输入未提供的参数由模型显式标注为「假设值」并说明依据，不引入外部历史数据集。",
    capabilitySupport: CAPABILITY_SUPPORTED,
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    notes:
      "输出为人类阅读的决策报告（其中表格以 Markdown 呈现），非机器可读数据 → 按证据只声明 TEXT_GENERATION，不声明 STRUCTURED_OUTPUT。",
  },
  C08: {
    componentId: "C08",
    businessPurpose:
      "由正常主流程反推断网、支付失败、并发超卖等异常与极端场景，逐条给出触发条件、影响、处理方案与优先级，形成可评审、可转测试用例的异常清单（目录真实描述：根据核心业务逻辑，自动列出断网、支付失败、并发等异常场景的处理方案）。",
    inputMethod: "纯文本粘贴（目录 inputMode=text）",
    textRequirement: "必填；最短 20 字符，最长 20000 字符",
    fileRequirement: "不适用（纯文本模式）",
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: true,
    requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
    outputKind: "TABLE",
    rendererType: "STRUCTURED_TABLE",
    artifactStructure:
      "JSON：scenarios[]（scenario / trigger / impact / handling / priority / category）+ coverageSummary + openQuestions",
    failureHandling: "REFUND_ON_FAILURE：模型失败或产出不可解析时原路退款，不产生错误扣费",
    estimatedTokens: 150,
    realDataBaseline:
      "不需要外部真实数据基准：场景由输入的主流程逻辑推导，覆盖度以输入声明为准；未决问题在 openQuestions 中显式列出，不虚构业务规则。",
    capabilitySupport: CAPABILITY_SUPPORTED,
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    notes:
      "异常清单需按固定字段逐条呈现并可直接转为测试用例（机器可读）→ 证据充分，声明 STRUCTURED_OUTPUT（部署已具备）。",
  },
  C10: {
    componentId: "C10",
    businessPurpose:
      "按行业规则与目标表结构批量生成高拟真、已脱敏的业务测试数据，替代真实生产数据用于联调与压测，规避隐私泄露（目录真实描述：依照真实行业规则，批量生成高模拟度的业务测试数据，保障数据隐私）。",
    inputMethod: "纯文本粘贴（目录 inputMode=text）：行业模板/表结构 + 字段约束 + 所需条数",
    textRequirement: "必填；最短 20 字符，最长 20000 字符",
    fileRequirement: "不适用（纯文本模式）",
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: true,
    requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
    outputKind: "TABLE",
    rendererType: "STRUCTURED_TABLE",
    artifactStructure:
      "JSON：schema[]（field / type / description）+ rows[]（与 schema.field 一一对应的记录）+ privacyNotes + summary",
    failureHandling: "REFUND_ON_FAILURE：模型失败或产出不可解析时原路退款，不产生错误扣费",
    estimatedTokens: 250,
    realDataBaseline:
      "不需要真实数据基准、且**禁止**使用真实个人数据：所有姓名/手机号/证件号必须为虚构或脱敏值，脱敏策略写入 privacyNotes。",
    capabilitySupport: CAPABILITY_SUPPORTED,
    contractVersion: "1.0.1",
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    notes:
      "产物是可直接入库的**数据行**（非人类散文）→ 证据充分，声明 STRUCTURED_OUTPUT；输出为 TABLE + STRUCTURED_TABLE 渲染器。",
  },
  C11: {
    componentId: "C11",
    businessPurpose:
      "由接口需求（文字或需求文档）产出后端数据接口的完整交付物：接口清单、含参数校验与错误码的实现代码、数据契约与说明书注解（目录真实描述：输入数据增删改查逻辑，自动生成带参数校验与说明的后端API接口代码）。",
    inputMethod:
      "文本或文件任一（目录 inputMode=both、hint=上传接口 PRD/需求文档，或直接粘贴接口要求文字；accept=.md,.txt,.pdf,.doc,.docx）",
    textRequirement: "非必填（与文件二选一）；提供时最短 1 字符，最长 30000 字符",
    fileRequirement: "非必填（与文本二选一）；单文件 maxCount=1，接受 .md/.txt/.pdf/.doc/.docx，单文件与总量上限均 20MB",
    singleFileSupported: true,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: false,
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    artifactStructure: "Markdown 文档：apiList（接口清单表）/ code（含校验与错误码的实现代码）/ dataContract（请求响应字段与示例）/ annotations（说明书注解）",
    failureHandling: "REFUND_ON_FAILURE：模型失败或文件无法提取文本（INPUT_TEXT_NOT_EXTRACTED）时不扣点或原路退款",
    estimatedTokens: 80,
    realDataBaseline:
      "不需要真实数据基准：接口字段与约束全部来自输入需求；输入未声明的字段/状态码/鉴权方式必须标注「待确认」。",
    capabilitySupport: CAPABILITY_SUPPORTED,
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    notes:
      "PDF/Word 由平台服务端提取文本后交给模型 → 属平台提取能力，不声明 FILE_ANALYSIS；产物为代码与说明文本，不声明 STRUCTURED_OUTPUT。",
  },
};

export const BATCH_2B = [
  { componentId: "C06", contract: C06_CONTRACT, analysis: BATCH_2B_ANALYSIS.C06 },
  { componentId: "C08", contract: C08_CONTRACT, analysis: BATCH_2B_ANALYSIS.C08 },
  { componentId: "C10", contract: C10_CONTRACT, analysis: BATCH_2B_ANALYSIS.C10 },
  { componentId: "C11", contract: C11_CONTRACT, analysis: BATCH_2B_ANALYSIS.C11 },
] as const;

export const BATCH_2B_CONTRACTS: ComponentContract[] = BATCH_2B.map((b) => b.contract);

/** 批次 2B 目标组件 ID（严禁触碰 C07 与其它批次组件） */
export const BATCH_2B_COMPONENT_IDS = ["C06", "C08", "C10", "C11"] as const;
