/**
 * 批次 2E 组件合同（C16、C17、C18、C19）真实业务合同定义
 *
 * 严格遵循批次约束（禁止规则）：
 *  - 逐组件依据**真实业务用途**编写，禁止复制既有合同后仅改 componentId；
 *  - 禁止默认合同、占位提示词与模拟结果；四份合同的目标、输入方式、提示词、输出结构两两不同；
 *  - **仅使用当前确实支持的输出类型：DOCUMENT、TABLE、JSON**；
 *    业务上若需要图形化 ER 图（FILE/DOCUMENT_PACKAGE 类图形产物），一律登记为 unsupportedRequirements（阻断项），
 *    不得发布伪支持合同；
 *  - 未经证据严禁声明 VISION / FILE_ANALYSIS / LONG_CONTEXT：
 *    · C16/C17/C19 输入均为纯文本或文本+日志文件，无图像理解需求 → 不声明 VISION；
 *    · 输入文件（C19 的 .log/.txt/.sql）解析为文本后由模型承担理解，但本批不声明 FILE_ANALYSIS（沿用第一批口径：
 *      纯文本/日志类输入即文本理解，不额外声明文件解析能力）；
 *    · 单次上下文预算 ≤ 16000 tokens，未超出常规上下文 → 不声明 LONG_CONTEXT；
 *  - 合同严禁携带 providerId / modelId / upstreamModel / baseUrl / apiKey / apiVersion / endpoint 等模型绑定字段；
 *  - 能力裁决复用第一批的纯函数 `evaluateActivationEligibility`（单一实现，避免语义漂移）。
 *
 * 证据来源（真实数据，非编造）：
 *  - prisma/component-catalog-data.ts：目录真实 name / description / previewData / inputMode / accept / hint / estimatedModelTokens；
 *    C16/C17/C18 的 inputMode='text'（accept=DEFAULT_INPUT.accept）；C19 的 inputMode='both'（accept=.log,.txt,.sql）；
 *  - docs/component-capability-matrix.json：C16-C19 无特殊执行链分支、无既有激活 PUBLISHED 合同（批次 2E 启动前只读核验）；
 *  - 数据库平台 default deployment 实测能力：TEXT_GENERATION + STRUCTURED_OUTPUT。
 *
 * 注意：本模块只产出 **DRAFT** 合同模板（publishedAt/publishedBy 为 null），
 * 是否 PUBLISH/激活由 `evaluateActivationEligibility` 依据真实部署能力裁决。
 * 其中 C18 因目录承诺「ER 实体图」属图形化输出（当前不支持），登记为 unsupportedRequirements 阻断项，
 * 仅产出 DRAFT（以 Markdown 关系说明 + DDL 替代，不发布伪支持的图形合同）。
 */

import {
  ComponentContract,
  ComponentOutputKind,
  RendererType,
  RequiredModelCapability,
} from "./types";
// 复用第一批合同的激活裁决纯函数（单一实现；本模块不重复实现，避免两份语义漂移）
export { evaluateActivationEligibility } from "./catalog-contracts-c01-c05";

/** 逐组件业务分析（覆盖批次 2E 要求的全部字段；缺失显式标注，绝不静默补默认值） */
export interface Batch2EContractAnalysis {
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
  /**
   * 业务上确实需要、但当前系统不支持的能力/输出类型（阻断项）。
   * 严禁通过伪装成 DOCUMENT/TABLE/JSON 来"伪支持"，必须在此显式登记。
   */
  unsupportedRequirements: string[];
  notes: string;
}

const CONTRACT_VERSION = "1.0.0";
const MAX_TEXT_LENGTH = 20_000;
const MIN_TEXT_LENGTH = 20;

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

/** 纯文本类组件的统一输入合同（C16/C17/C18 共用形态，但 placeholder 与业务语义各自不同） */
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

/** 文本 + 文件类组件的统一输入合同（C19：inputMode='both'，文本或日志文件任一非空即可） */
function textAndFilesInput(textPlaceholder: string) {
  return {
    kind: "TEXT_AND_FILES" as const,
    textConstraints: {
      required: false,
      minLength: MIN_TEXT_LENGTH,
      maxLength: MAX_TEXT_LENGTH,
      placeholder: textPlaceholder,
    },
    fileConstraints: {
      required: false,
      maxCount: 3,
      acceptedMimes: ["text/plain", "text/markdown", "application/sql", "text/x-log"],
      maxSingleFileBytes: 2_000_000,
      maxTotalBytes: 6_000_000,
    },
  };
}

// ---------------------------------------------------------------------------
// C16 登录权限与安全卡点（JWT/OAuth2 登录验证与角色权限校验 ➜ 中间件骨架代码）
// ---------------------------------------------------------------------------
export const C16_CONTRACT: ComponentContract = draft("C16", {
  input: textOnlyInput("请描述期望的安全校验方式与角色划分，例如：基于 JWT 的登录态校验，区分超级管理员与普通成员，未登录接口一律拦截，越权请求返回 403。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c16-auth-guard",
        name: "登录鉴权与角色权限防护代码产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深后端安全架构师。请基于输入材料描述的鉴权诉求与角色划分，输出《登录权限与安全卡点设计方案》，必须包含四部分：\n" +
          "1. 《鉴权中间件设计》：说明令牌（JWT/OAuth2）的生成、签名校验、过期检查与刷新策略，以及未登录请求的拦截时机；\n" +
          "2. 《角色权限模型》：列出角色划分（如超级管理员/普通成员）、权限点定义与越权防护口径（如何判定并拒绝越权请求）；\n" +
          "3. 《核心骨架代码》：给出鉴权中间件/拦截器骨架代码，必须包含令牌解析校验、角色判断与 401/403 响应处理；\n" +
          "4. 《安全卡点清单》：逐条列出必须拦截的越权场景与上线前测试要点。\n" +
          "硬性要求：必须显式说明令牌密钥的存储与轮换建议（禁止将密钥硬编码进代码）；" +
          "输入未声明角色数量、令牌有效期、刷新策略时，必须显式标注为「待确认」；" +
          "严禁编造具体的框架版本、端口与密钥取值，凡未声明者一律以占位标识列出。",
        inputMapping: {},
        outputKey: "auth_guard_package",
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
      requiredProperties: ["middleware", "roleModel", "code", "checklist"],
    },
  },
  qualityPolicy: {
    requiredSections: ["越权"],
    minOutputLength: 400,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证绝对安全", "已通过安全认证", "无需二次验证"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下鉴权方案由模型辅助生成，涉及密钥存储与权限边界，须经人工安全复核后方可用于生产。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 100,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C17 SQL 数据库查询语句生成（查询意图 ➜ 标准 SQL + 索引建议）
// ---------------------------------------------------------------------------
export const C17_CONTRACT: ComponentContract = draft("C17", {
  input: textOnlyInput("请描述您的查询需求，例如：查一下近 30 天订单总额前 10 名的消费用户，及其最近一次下单时间。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c17-sql-gen",
        name: "查询意图拆解与标准 SQL 产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深数据库工程师。请基于输入材料描述的查询意图，输出《SQL 查询与索引方案》，必须包含三部分：\n" +
          "1. 《需求拆解》：明确查询意图、涉及的表与字段，以及过滤/聚合/排序/分页等维度；\n" +
          "2. 《标准 SQL 语句》：给出带注释的可执行 SQL，正确处理多表关联、空值、去重与分页，并标注每段的意图；\n" +
          "3. 《索引建议》：指出应新建或调整的索引字段与索引类型，说明其如何避免全表扫描，并给出建索引语句。\n" +
          "硬性要求：SQL 必须标注目标数据库类型（如 MySQL/PostgreSQL）的语法口径；" +
          "输入未声明表结构、字段名或数据库类型时，必须显式标注为「待确认」并给出假设；" +
          "严禁编造输入中未出现的表名或字段名。",
        inputMapping: {},
        outputKey: "sql_query_package",
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
      requiredProperties: ["analysis", "sql", "indexAdvice"],
    },
  },
  qualityPolicy: {
    requiredSections: ["索引"],
    minOutputLength: 300,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证查询绝对最优", "无需任何索引"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下 SQL 与索引建议由模型辅助生成，请在测试库验证执行计划后再上生产。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 60,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C18 数据表结构与关系图设计（字段/表意图 ➜ 表结构 + 关系说明）
//   注：目录承诺「ER 实体图」属图形化输出，当前不支持 → 登记为 unsupportedRequirements 阻断项，
//       以 Markdown 关系说明 + DDL 替代，仅产出 DRAFT，不发布伪支持的图形合同。
// ---------------------------------------------------------------------------
export const C18_CONTRACT: ComponentContract = draft("C18", {
  input: textOnlyInput("请描述您所需的实体属性，例如：商品表需要主键、标题、分类、库存、价格、创建时间；订单表需要订单号、用户、金额、状态。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c18-schema-design",
        name: "表结构与关系说明产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深数据库架构师。请基于输入材料描述的实体与字段意图，输出《数据表结构与关系设计方案》，必须包含三部分：\n" +
          "1. 《实体与字段清单》：以 Markdown 表格输出，列固定为「表名 | 字段 | 类型 | 约束 | 说明」；\n" +
          "2. 《DDL 建表语句》：给出完整建表语句（含主键、外键、唯一约束与常用索引）；\n" +
          "3. 《关系说明》：以 Markdown 表格逐条写出实体间的一对一/一对多/多对多关系、外键落地方向与级联策略。\n" +
          "硬性要求：输入未声明的字段必须显式标注为「待确认」，不得凭空扩展业务字段；" +
          "多对多关系必须显式给出中间表设计；涉及金额、时间等字段必须明确类型与精度；" +
          "若输入存在自相矛盾的关系描述，必须在末尾列出矛盾点而不是自行选择其中一种解释。" +
          "注意：本组件不输出图形化的 ER 实体图（图形产物当前系统不支持），关系一律以 Markdown 表格说明替代。",
        inputMapping: {},
        outputKey: "schema_design_package",
        contextBudgetTokens: 13_000,
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
      requiredProperties: ["entities", "ddl", "relations"],
    },
  },
  qualityPolicy: {
    requiredSections: ["关系"],
    minOutputLength: 400,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["已生成ER实体图", "已绘制关系拓扑图"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下表结构与关系说明由模型辅助生成，请人工核对字段类型与精度后再建表。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 120,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
  // 业务阻断事实（结构化三要素，随 DRAFT 合同持久化）：
  // 目录输出承诺包含「ER 实体图」/「清晰展示外键关系的实体图」，属图形化输出，当前不支持 → 登记阻断，
  // 本批次以 Markdown 关系说明表格 + DDL 建表语句替代，绝不发布伪支持的图形/文件型合同。
  unsupportedRequirements: [
    {
      requirement: "ER 实体关系图（图形化输出）",
      reason: "当前执行引擎仅支持 DOCUMENT/TABLE/JSON，图形化输出无渲染器",
      suggestedAlternative: "TABLE/JSON 等价表达实体关系（待负责人裁决）或 Mermaid 文本方案（待路线图）",
    },
  ],
});

// ---------------------------------------------------------------------------
// C19 慢 SQL 查询自动诊断提速（慢查询日志/EXPLAIN ➜ 诊断 + 整改方案）
//   注：inputMode='both'，文本粘贴或上传 .log/.txt/.sql 文件任一非空即可。
// ---------------------------------------------------------------------------
export const C19_CONTRACT: ComponentContract = draft("C19", {
  input: textAndFilesInput("请粘贴慢查询 SQL、慢查询日志或 EXPLAIN 执行计划结果，例如：SELECT * FROM orders WHERE user_id=? AND status=? ORDER BY created_at DESC 耗时 3.2s，EXPLAIN 显示 type=ALL。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c19-slow-sql-diagnosis",
        name: "慢查询瓶颈定位与整改方案产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深数据库性能专家。请基于输入材料（慢查询 SQL / 慢查询日志 / EXPLAIN 结果），输出《慢 SQL 诊断与提速方案》，必须包含四部分：\n" +
          "1. 《瓶颈定位》：指出根因（如全表扫描、索引失效、锁竞争、排序溢出），并结合 EXPLAIN 的 type/rows/key 字段给出判读；\n" +
          "2. 《索引整改》：给出需新建或调整的索引及对应建索引语句，说明其如何消除全表扫描；\n" +
          "3. 《SQL 重写》：给出重写后的语句与逐条优化点（如避免 SELECT *、缩小扫描范围、下推过滤条件）；\n" +
          "4. 《验证与回滚》：给出上线前在从库/测试库验证执行计划的方式，以及索引变更失败时的回滚预案。\n" +
          "硬性要求：必须给出可复现的验证口径（如改写前后 EXPLAIN 的 rows 对比）；" +
          "输入未提供表结构或数据量级时，必须显式标注为「待确认」并给出假设；" +
          "严禁编造输入中未出现的表名、字段名或具体耗时数据。",
        inputMapping: {},
        outputKey: "slow_sql_diagnosis_package",
        contextBudgetTokens: 16_000,
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
      requiredProperties: ["bottleneck", "indexFix", "sqlRewrite", "verifyRollback"],
    },
  },
  qualityPolicy: {
    requiredSections: ["瓶颈"],
    minOutputLength: 400,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证慢查询彻底消失", "性能一定提升90%"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下诊断与整改方案由模型辅助生成，请在从库/测试库验证执行计划后再上生产。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 150,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// 逐组件业务分析（批次 2E 要求的全部字段）
// ---------------------------------------------------------------------------
const TEXT_INPUT_METHOD =
  "纯文本粘贴（目录 inputMode=text；accept=.txt,.md,.json,.csv,.log,.sql,.ts,.js,.html,.css,.xml,.yaml,.yml；真实观测 inputMode='text'）";
const TEXT_REQUIREMENT = "必填；最短 20 字符，最长 20000 字符（低于下限视为未提供有效材料）";
const FILE_REQUIREMENT_C19 =
  "可选；最多 3 个文件，单文件 ≤ 2MB，总计 ≤ 6MB；accept=.log,.txt,.sql（MIME: text/plain,text/markdown,application/sql,text/x-log）；" +
  "文本与文件任一非空即可（inputMode='both'）";

export const BATCH_2E_ANALYSIS: Record<"C16" | "C17" | "C18" | "C19", Batch2EContractAnalysis> = {
  C16: {
    componentId: "C16",
    businessPurpose:
      "生成 JWT/OAuth2 登录验证逻辑，保障未登录拦截与不同角色权限校验（目录真实描述：生成权限校验中间件代码，支持令牌生成与过期检查、防止非法越权请求）。",
    inputMethod: TEXT_INPUT_METHOD,
    textRequirement: TEXT_REQUIREMENT,
    fileRequirement: "不适用（纯文本模式，不接受文件上传）",
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: false,
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    artifactStructure: "Markdown 文档：middleware（鉴权中间件设计）/ roleModel（角色权限模型）/ code（核心骨架代码）/ checklist（安全卡点清单）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 100,
    realDataBaseline:
      "不需要真实数据基准：鉴权诉求与角色划分全部来自用户输入；未声明的令牌有效期、刷新策略等必须显式标注「待确认」。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes:
      "产物是鉴权设计与中间件骨架代码文本 → 仅声明 TEXT_GENERATION；安全类输出要求 requireHumanReview=true 且标注草案免责声明，并禁止伪造安全认证类表述。",
  },
  C17: {
    componentId: "C17",
    businessPurpose:
      "用中文白话文描述查询意图，自动生成最优的 SQL 语句和索引建议（目录真实描述：用中文白话文描述查询意图，自动生成最优的 SQL 语句和索引建议）。",
    inputMethod: TEXT_INPUT_METHOD,
    textRequirement: TEXT_REQUIREMENT,
    fileRequirement: "不适用（纯文本模式，不接受文件上传）",
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: false,
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    artifactStructure: "Markdown 文档：analysis（需求拆解）/ sql（标准 SQL 语句）/ indexAdvice（索引建议）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 60,
    realDataBaseline:
      "不需要真实数据基准：查询意图与表结构全部来自用户输入；未声明的表名、字段名或数据库类型必须显式标注「待确认」。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes:
      "产物是 SQL 文本与索引说明 → 仅声明 TEXT_GENERATION；要求 requireHumanReview=true，禁止伪造「绝对最优」等表述。",
  },
  C18: {
    componentId: "C18",
    businessPurpose:
      "输入字段和表意图，自动设计表结构和关联逻辑（目录真实描述：输入字段和表意图，自动设计表结构和关联逻辑并生成 ER 实体图）。",
    inputMethod: TEXT_INPUT_METHOD,
    textRequirement: TEXT_REQUIREMENT,
    fileRequirement: "不适用（纯文本模式，不接受文件上传）",
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: false,
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    artifactStructure: "Markdown 文档：entities（实体与字段清单）/ ddl（建表语句）/ relations（关系说明表格）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 120,
    realDataBaseline:
      "不需要真实数据基准：实体与字段全部来自用户输入；未声明的字段统一显式标注「待确认」，不引入外部历史数据集。",
    capabilitySupport:
      "能力支持，但**输出形态部分不支持**：平台能力 TEXT_GENERATION + STRUCTURED_OUTPUT 完整覆盖文本产出；" +
      "目录承诺的「ER 实体图」属图形化产物（FILE/DOCUMENT_PACKAGE 类），当前不支持 → 登记为阻断项。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "BLOCKED",
    missingMaterials: [],
    unsupportedRequirements: [
      "ER 实体图（图形化关系图）：目录输出承诺包含「ER 实体图」/「清晰展示外键关系的实体图」，但当前不支持图形类输出类型（FILE / DOCUMENT_PACKAGE）；" +
        "本批次以 Markdown 关系说明表格 + DDL 建表语句替代，不发布伪支持的图形/文件型合同，仅保留 DRAFT。",
    ],
    notes:
      "产物是人类阅读的表结构与关系说明文本（实体/字段以 Markdown 表格呈现），非机器可读结构化数据 → 按证据只声明 TEXT_GENERATION；" +
      "因目录图形化承诺与系统能力冲突，本组件维持 DRAFT 阻断，待图形化输出能力具备后再评估发布。",
  },
  C19: {
    componentId: "C19",
    businessPurpose:
      "分析数据库卡顿慢 SQL，精确定位慢查瓶颈并输出建立索引等整改方案（目录真实描述：分析数据库卡顿慢 SQL，精确定位慢查瓶颈并输出建立索引等整改方案）。",
    inputMethod:
      "文本粘贴或上传慢查询日志/EXPLAIN 结果文件（目录 inputMode='both'；accept=.log,.txt,.sql；hint=上传慢查询日志或 EXPLAIN 结果文件，或直接粘贴日志内容）",
    textRequirement: "可选（与文件二选一，任一非空即可）；最短 20 字符，最长 20000 字符",
    fileRequirement: FILE_REQUIREMENT_C19,
    singleFileSupported: true,
    multiFileSupported: true,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: false,
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    artifactStructure: "Markdown 文档：bottleneck（瓶颈定位）/ indexFix（索引整改）/ sqlRewrite（SQL 重写）/ verifyRollback（验证与回滚）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 150,
    realDataBaseline:
      "不需要真实数据基准：诊断依据来自用户粘贴的 SQL/日志/EXPLAIN；未提供表结构或数据量级时必须显式标注「待确认」。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖（日志文件按文本理解，不额外声明 FILE_ANALYSIS）。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes:
      "产物是诊断报告与整改说明文本 → 仅声明 TEXT_GENERATION；日志/EXPLAIN 文件以文本解析理解，沿用纯文本口径不声明 FILE_ANALYSIS；" +
      "要求 requireHumanReview=true，禁止伪造「性能一定提升90%」等未经验证的表述。",
  },
};

export const BATCH_2E = [
  { componentId: "C16", contract: C16_CONTRACT, analysis: BATCH_2E_ANALYSIS.C16 },
  { componentId: "C17", contract: C17_CONTRACT, analysis: BATCH_2E_ANALYSIS.C17 },
  { componentId: "C18", contract: C18_CONTRACT, analysis: BATCH_2E_ANALYSIS.C18 },
  { componentId: "C19", contract: C19_CONTRACT, analysis: BATCH_2E_ANALYSIS.C19 },
] as const;

export const BATCH_2E_CONTRACTS: ComponentContract[] = BATCH_2E.map((b) => b.contract);

/** 批次 2E 目标组件 ID（严禁触碰 C07 与暂停中的 C09，及其它批次组件） */
export const BATCH_2E_COMPONENT_IDS = ["C16", "C17", "C18", "C19"] as const;

/** 批次 2E 明确禁止触碰的组件 ID（冻结快照 + 暂停范围） */
export const BATCH_2E_FORBIDDEN_IDS = ["C07", "C09"] as const;
