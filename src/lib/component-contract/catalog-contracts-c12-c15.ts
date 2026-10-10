/**
 * 批次 2C 组件合同（C12、C13、C14、C15）真实业务合同定义
 *
 * 严格遵循批次约束（禁止规则）：
 *  - 逐组件依据**真实业务用途**编写，禁止复制既有合同后仅改 componentId；
 *  - 禁止默认合同、占位提示词与模拟结果；四份合同的目标、输入方式、提示词、输出结构两两不同；
 *  - **仅使用当前确实支持的输出类型：DOCUMENT、TABLE、JSON**；
 *    业务上若需要 SCORE/TIMELINE/FILE/DOCUMENT_PACKAGE，一律登记为 unsupportedRequirements（阻断项），
 *    不得发布伪支持合同；
 *  - 未经证据严禁声明 VISION / FILE_ANALYSIS / LONG_CONTEXT：
 *      · 四组件输入均为纯文本（目录 inputMode=text），无图像理解需求 → 不声明 VISION；
 *      · 输入文件解析不由模型承担（本批纯文本输入，无附件）→ 不声明 FILE_ANALYSIS；
 *      · 单次上下文预算 ≤ 16000 tokens，未超出常规上下文 → 不声明 LONG_CONTEXT；
 *  - 合同严禁携带 providerId / modelId / upstreamModel / baseUrl / apiKey / apiVersion / endpoint 等模型绑定字段；
 *  - 能力裁决复用第一批的纯函数 `evaluateActivationEligibility`（单一实现，避免语义漂移）。
 *
 * 证据来源（真实数据，非编造）：
 *  - prisma/component-catalog-data.ts：目录真实 name / description / previewData / inputMode / accept / estimatedModelTokens；
 *  - docs/component-capability-matrix.json：C12-C15 observedInputPrototype=TEXT_ONLY、inputMode='text'、
 *    无特殊执行链分支、无既有激活 PUBLISHED 合同；
 *  - 数据库 componentcontract 实测（批次 2C 启动前只读核验）：C12/C13/C14/C15 合同行数均为 0、无激活合同；
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

/** 逐组件业务分析（覆盖批次 2C 要求的全部字段；缺失显式标注，绝不静默补默认值） */
export interface Batch2CContractAnalysis {
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

/** 纯文本类组件的统一输入合同（C12-C15 共用形态，但 placeholder 与业务语义各自不同） */
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
// C12 接口数据关联设计（表关系口语描述 ➜ 实体关联 + DDL + Resolver 代码）
// ---------------------------------------------------------------------------
export const C12_CONTRACT: ComponentContract = draft("C12", {
  input: textOnlyInput("请用口语描述表之间的关系，例如：一个用户可以下多个订单，一个订单只属于一个商家，商家可以同时上架多个商品。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c12-relation-modeling",
        name: "实体关系梳理与接口数据模型代码产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深后端数据建模专家。请基于输入材料中口语描述的实体与业务关系，输出《接口数据关联设计方案》，必须包含四部分：\n" +
          "1. 《实体清单》：以 Markdown 表格输出，列固定为「实体 | 主键 | 关键字段 | 说明」；\n" +
          "2. 《关系说明》：逐条写出实体间的一对一/一对多/多对多关系、外键落地方向与级联策略；\n" +
          "3. 《DDL 建表语句》：给出完整的建表语句（含主键、外键、唯一约束与常用索引）；\n" +
          "4. 《Resolver 骨架代码》：给出按实体划分的数据读取骨架代码，标注每个 Resolver 的输入、返回字段与 N+1 规避方式。\n" +
          "硬性要求：输入未声明的字段必须显式标注为「待确认」，不得凭空扩展业务字段；" +
          "多对多关系必须显式给出中间表设计；涉及金额、时间等字段必须明确类型与精度；" +
          "若输入存在自相矛盾的关系描述，必须在末尾列出矛盾点而不是自行选择其中一种解释。",
        inputMapping: {},
        outputKey: "relation_design_package",
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
      requiredProperties: ["entities", "relations", "ddl", "resolvers"],
    },
  },
  qualityPolicy: {
    requiredSections: ["实体"],
    minOutputLength: 400,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: false,
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 120,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
  // 业务阻断事实（结构化三要素，随 DRAFT 合同持久化）：
  // 目录/口语诉求包含「DDL/ER 图 图形化输出」（清晰展示外键关系的关联拓扑图），属图形化输出，当前不支持 → 登记阻断，
  // 本批次以 DOCUMENT（实体清单 + 关系说明 + DDL/Resolver 文本）替代，绝不发布伪支持的图形/文件型合同。
  unsupportedRequirements: [
    {
      requirement: "DDL/ER图 图形化输出（关联拓扑图）",
      reason: "当前执行引擎仅支持 DOCUMENT/TABLE/JSON，图形化 ER 图/拓扑渲染无渲染器",
      suggestedAlternative: "TABLE/JSON 等价表达实体关系（待负责人裁决）或 Mermaid 文本方案（待路线图）",
    },
  ],
});

// ---------------------------------------------------------------------------
// C13 即时消息 WebSocket 开发（实时通信需求 ➜ 双端通信代码）
// ---------------------------------------------------------------------------
export const C13_CONTRACT: ComponentContract = draft("C13", {
  input: textOnlyInput("请描述实时通信场景与要求，例如：多人在线白板协同，需要房间内广播笔迹，支持断线后自动重连并补拉最近 50 条笔画。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c13-realtime-channel",
        name: "实时双向通道设计与双端代码产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深实时通信架构师。请基于输入材料描述的实时场景，输出《即时消息通道实现方案》，必须包含四部分：\n" +
          "1. 《消息协议设计》：给出消息帧的字段定义（类型、房间/会话标识、载荷、序号、时间戳）与各类消息的语义；\n" +
          "2. 《服务端实现代码》：给出连接建立、房间订阅、广播与点对点推送的服务端骨架代码；\n" +
          "3. 《客户端实现代码》：给出连接、收发、重连与状态恢复的客户端骨架代码；\n" +
          "4. 《可靠性设计》：给出心跳间隔与超时判定、指数退避重连、消息去重与断线补偿拉取的处理方式。\n" +
          "硬性要求：必须显式说明鉴权握手时机；必须给出消息乱序/重复的处理口径；" +
          "输入未声明重连策略、消息保留时长、并发规模等关键参数时，必须显式标注为「待确认」；" +
          "严禁假设具体的框架版本与端口取值，凡未声明者一律以占位标识列出。",
        inputMapping: {},
        outputKey: "realtime_channel_package",
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
      requiredProperties: ["protocol", "serverImplementation", "clientImplementation", "reliability"],
    },
  },
  qualityPolicy: {
    requiredSections: ["重连"],
    minOutputLength: 400,
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
// C14 高并发排队消息队列集成（场景 + 队列类型 ➜ 生产/消费与重试死信代码）
// ---------------------------------------------------------------------------
export const C14_CONTRACT: ComponentContract = draft("C14", {
  input: textOnlyInput("请描述业务场景与所选队列类型，例如：秒杀下单削峰，使用 RabbitMQ，要求下单消息不丢失，失败后最多重试 3 次并进入死信队列。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c14-queue-integration",
        name: "削峰队列集成与可靠投递代码产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深分布式中间件工程师。请基于输入材料描述的排队诉求与队列类型，输出《高并发排队集成方案》，必须包含四部分：\n" +
          "1. 《投递拓扑》：说明交换机/主题或分区的划分、路由键与队列绑定关系，以及消费分组方式；\n" +
          "2. 《生产者代码》：给出发送端骨架代码，必须包含发布确认与失败落库补偿的处理；\n" +
          "3. 《消费者代码》：给出消费端骨架代码，必须包含幂等判重与手动确认/提交偏移的处理；\n" +
          "4. 《重试与死信》：给出重试次数、退避间隔、死信转入条件，以及死信队列的人工介入与重投流程。\n" +
          "硬性要求：必须显式回答「消息会不会丢」「会不会重复消费」两个问题并给出对应的机制依据；" +
          "输入未声明吞吐目标、重试次数、延迟等级时，必须显式标注为「待确认」；" +
          "严禁编造输入中未出现的业务参数。",
        inputMapping: {},
        outputKey: "queue_integration_package",
        contextBudgetTokens: 16_000,
        maxOutputTokens: 4_000,
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
      requiredProperties: ["topology", "producer", "consumer", "retryAndDeadLetter"],
    },
  },
  qualityPolicy: {
    requiredSections: ["死信"],
    minOutputLength: 400,
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
// C15 高速数据内存提速设计（QPS 与更新策略 ➜ 缓存配置方案表）
// ---------------------------------------------------------------------------
export const C15_CONTRACT: ComponentContract = draft("C15", {
  input: textOnlyInput("请输入接口访问频次与数据更新策略，例如：商品详情 QPS 约 3000，日均更新 2 次，允许分钟级不一致，热点集中在头部爆款。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c15-cache-strategy",
        name: "缓存键空间设计与防穿透方案",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深性能架构师。请基于输入材料给出的访问频次与数据更新策略，输出缓存提速设计方案，" +
          "严格以 JSON 对象返回，字段名固定为 schema、rows、antiPenetration、summary：\n" +
          "1. schema：数组，每项为 {field, type, description}，依次声明 field=cacheKey、field=ttlSeconds、" +
          "field=invalidation、field=purpose、field=riskNote；\n" +
          "2. rows：数组，每项为一条缓存规则对象，键必须与 schema 的 field 一一对应，" +
          "cacheKey 必须给出命名规范（含业务前缀与参数占位），ttlSeconds 必须为整数秒数；\n" +
          "3. antiPenetration：字符串，说明缓存穿透、击穿、雪崩三类问题的对应处理口径；\n" +
          "4. summary：字符串，说明预期命中率口径与需要人工压测验证的事项。\n" +
          "硬性要求：输入未给出 QPS、更新频率或一致性容忍度时，必须在 summary 中显式标注为「待确认」并说明所采用的假设；" +
          "严禁编造实测命中率等未经压测的数据。",
        inputMapping: {},
        outputKey: "cache_strategy_table",
        contextBudgetTokens: 14_000,
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
      requiredProperties: ["schema", "rows", "antiPenetration", "summary"],
      schemaDefinition: {
        type: "object",
        required: ["schema", "rows", "antiPenetration", "summary"],
        properties: {
          schema: {
            type: "array",
            description: "字段定义（field/type/description）",
            items: {
              type: "object",
              required: ["field", "type", "description"],
              properties: {
                field: { type: "string", description: "字段标识名" },
                type: { type: "string", description: "字段数据类型" },
                description: { type: "string", description: "字段含义描述" },
              },
            },
          },
          rows: {
            type: "array",
            description: "缓存规则数据行",
            items: {
              type: "object",
              required: ["cacheKey", "ttlSeconds", "invalidation", "purpose", "riskNote"],
              properties: {
                cacheKey: { type: "string", description: "缓存键命名规范（含业务前缀与参数占位）" },
                ttlSeconds: { type: "integer", minimum: 1, description: "缓存过期秒数（安全整数，必须 >= 1）" },
                invalidation: { type: "string", description: "主动失效与更新机制" },
                purpose: { type: "string", description: "业务提速目的" },
                riskNote: { type: "string", description: "数据倾斜/冷启动等风险备注" },
              },
            },
          },
          antiPenetration: { type: "string", description: "穿透/击穿/雪崩处理口径" },
          summary: { type: "string", description: "命中率口径与待确认事项" },
        },
      },
    },
  },
  qualityPolicy: {
    requiredSections: ["缓存"],
    minOutputLength: 300,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: false,
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 100,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// 逐组件业务分析（批次 2C 要求的全部字段）
// ---------------------------------------------------------------------------
const TEXT_INPUT_METHOD =
  "纯文本粘贴（目录 inputMode=text；accept=.txt,.md,.json,.csv,.log,.sql,.ts,.js,.html,.css,.xml,.yaml,.yml；真实观测 observedInputPrototype=TEXT_ONLY）";
const TEXT_REQUIREMENT = "必填；最短 20 字符，最长 20000 字符（低于下限视为未提供有效材料）";
const FILE_REQUIREMENT = "不适用（纯文本模式，不接受文件上传）";

export const BATCH_2C_ANALYSIS: Record<"C12" | "C13" | "C14" | "C15", Batch2CContractAnalysis> = {
  C12: {
    componentId: "C12",
    businessPurpose:
      "把口语化的表关系描述整理成可落地的数据关联方案：实体清单、关系与外键方向、DDL 建表语句与 Resolver 骨架代码（目录真实描述：快速理清数据流关系，自动画出实体关联图并输出接口定义代码）。",
    inputMethod: TEXT_INPUT_METHOD,
    textRequirement: TEXT_REQUIREMENT,
    fileRequirement: FILE_REQUIREMENT,
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: false,
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    artifactStructure: "Markdown 文档：entities（实体清单表）/ relations（关系说明）/ ddl（建表语句）/ resolvers（Resolver 骨架代码）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 120,
    realDataBaseline:
      "不需要真实数据基准：实体与关系全部来自用户输入描述；输入未声明的字段统一显式标注「待确认」，不引入外部历史数据集。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "BLOCKED",
    missingMaterials: [],
    unsupportedRequirements: [
      "关联拓扑图（图形化 ER 图）：目录输出承诺包含「直观的关联拓扑图」，但当前不支持图形类输出类型；" +
        "本批次以 Markdown 关系说明 + 实体清单替代，不发布伪支持的图形/文件型合同。",
    ],
    notes:
      "产物是人类阅读的设计文档与代码文本（其中表格以 Markdown 呈现），非机器可读结构化数据 → 按证据只声明 TEXT_GENERATION，不声明 STRUCTURED_OUTPUT。",
  },
  C13: {
    componentId: "C13",
    businessPurpose:
      "按实时场景产出可用的双向通信方案：消息帧协议、服务端骨架代码、客户端骨架代码，以及心跳与断线重连等可靠性设计（目录真实描述：生成 WebSocket 协议代码，实现客服聊天、多人协同编辑或实时数据更新）。",
    inputMethod: TEXT_INPUT_METHOD,
    textRequirement: TEXT_REQUIREMENT,
    fileRequirement: FILE_REQUIREMENT,
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: false,
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    artifactStructure: "Markdown 文档：protocol（消息帧协议）/ serverImplementation（服务端代码）/ clientImplementation（客户端代码）/ reliability（心跳与重连）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 150,
    realDataBaseline:
      "不需要真实数据基准：场景与参数全部来自用户输入；并发规模、消息保留时长等未声明项必须显式标注「待确认」。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes:
      "产物为协议说明与双端代码文本 → 仅声明 TEXT_GENERATION；不做具体框架版本与端口假设，凡未声明者以占位标识列出。",
  },
  C14: {
    componentId: "C14",
    businessPurpose:
      "按排队诉求与队列类型产出可靠投递方案：投递拓扑、生产者与消费者代码、幂等判重，以及重试与死信处理（目录真实描述：自动集成 RabbitMQ/Kafka 等队列，应对瞬时大流量，生成防遗漏发送代码）。",
    inputMethod: TEXT_INPUT_METHOD,
    textRequirement: TEXT_REQUIREMENT,
    fileRequirement: FILE_REQUIREMENT,
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: false,
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    artifactStructure: "Markdown 文档：topology（投递拓扑）/ producer（生产者代码）/ consumer（消费者代码）/ retryAndDeadLetter（重试与死信）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 200,
    realDataBaseline:
      "不需要真实数据基准：队列类型、吞吐与重试策略全部来自用户输入；未声明的吞吐目标与重试次数必须显式标注「待确认」。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes:
      "产物为中间件集成说明与代码文本 → 仅声明 TEXT_GENERATION；必须显式回答消息丢失与重复消费问题并给出机制依据。",
  },
  C15: {
    componentId: "C15",
    businessPurpose:
      "把访问频次与更新策略转化为可直接评审的缓存规则清单：缓存键命名规范、过期时间、失效方式、用途与风险备注，并给出防穿透口径（目录真实描述：合理设计 Redis 缓存逻辑，极大降低数据库访问频次，包含 Key 命名规范、过期失效时间及防穿透设计）。",
    inputMethod: TEXT_INPUT_METHOD,
    textRequirement: TEXT_REQUIREMENT,
    fileRequirement: FILE_REQUIREMENT,
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: true,
    requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
    outputKind: "TABLE",
    rendererType: "STRUCTURED_TABLE",
    artifactStructure: "TABLE（application/json）：schema（字段定义）/ rows（缓存规则数据行）/ antiPenetration（处理口径）/ summary（命中率口径与待确认项）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出不满足 TABLE schema 均由路由原路退款，不产生错误扣费",
    estimatedTokens: 100,
    realDataBaseline:
      "不需要真实数据基准：QPS、更新频率与一致性容忍度由用户输入提供；命中率等压测结论系统不生成真实数据，必须标注需人工压测验证。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes:
      "产物是逐条缓存规则的**数据行**（键名/TTL/失效方式/用途/风险备注），属机器可读结构化数据而非散文 → 证据充分，声明 STRUCTURED_OUTPUT；输出为 TABLE + STRUCTURED_TABLE 渲染器。",
  },
};

export const BATCH_2C = [
  { componentId: "C12", contract: C12_CONTRACT, analysis: BATCH_2C_ANALYSIS.C12 },
  { componentId: "C13", contract: C13_CONTRACT, analysis: BATCH_2C_ANALYSIS.C13 },
  { componentId: "C14", contract: C14_CONTRACT, analysis: BATCH_2C_ANALYSIS.C14 },
  { componentId: "C15", contract: C15_CONTRACT, analysis: BATCH_2C_ANALYSIS.C15 },
] as const;

export const BATCH_2C_CONTRACTS: ComponentContract[] = BATCH_2C.map((b) => b.contract);

/** 批次 2C 目标组件 ID（严禁触碰 C07 与暂停中的 C09，及其它批次组件） */
export const BATCH_2C_COMPONENT_IDS = ["C12", "C13", "C14", "C15"] as const;

/** 批次 2C 明确禁止触碰的组件 ID（冻结快照 + 暂停范围） */
export const BATCH_2C_FORBIDDEN_IDS = ["C07", "C09"] as const;
