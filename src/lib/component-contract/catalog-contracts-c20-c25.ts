/**
 * 批次 2E2 组件合同（C20、C21、C22、C23、C24、C25）真实业务合同定义
 *
 * 严格遵循批次约束（禁止规则，沿用 E1/E1-FIX 基线）：
 *  - 逐组件依据**真实业务用途**与**真实目录行**（prisma/component-catalog-data.ts 已核验 DB 实际行）编写，
 *    禁止复制既有合同后仅改 componentId；
 *  - 禁止默认合同、占位提示词与模拟结果；六份合同的目标、输入方式、提示词、输出结构两两不同；
 *  - 仅使用当前确实支持的输出类型：DOCUMENT、TABLE、JSON；
 *    差异化输出选型（E2 强制项 B）：代码/方案/诊断类用 DOCUMENT（C20/C21/C22/C23/C25）；
 *    数据/配置/映射类用 DOCUMENT（C20 映射表以 Markdown 承载）或 JSON（C24 ECharts option 本就是 JSON，结构化校验更强）；
 *  - 未经证据严禁声明 VISION / FILE_ANALYSIS / LONG_CONTEXT：六组件输入均为文本或文本/表格文件，
 *    无图像理解需求 → 不声明 VISION；文件（.sql/.json/.csv/.xlsx）解析为文本/结构化数据后由模型承担理解，
 *    本批不声明 FILE_ANALYSIS；单次上下文预算 ≤ 16000 tokens → 不声明 LONG_CONTEXT；
 *    C24 输出为 JSON，需模型产出合法 JSON → 仅 C24 额外声明 STRUCTURED_OUTPUT（平台默认部署已实测具备）；
 *  - 合同严禁携带 providerId / modelId / upstreamModel / baseUrl / apiKey / apiVersion / endpoint 等模型绑定字段；
 *  - 能力裁决复用第一批的纯函数 `evaluateActivationEligibility`（单一实现，避免语义漂移）。
 *
 * 差异化输入验证（E2 强制项 A）：
 *  - C20 inputMode=file（真实 DB 行）：FILE 单文件，必须覆盖真实文件上传成功 + 非白名单 MIME/超量拒绝；
 *  - C24 inputMode=both（真实 DB 行）：TEXT_AND_FILES，maxCount=1，必须覆盖真实 .json 文件上传成功 + 拒绝用例；
 *  - C21/C22/C23/C25 inputMode=text：仅文本用例。
 *
 * 注意：本模块只产出 **DRAFT** 合同模板（publishedAt/publishedBy 为 null），
 * 是否 PUBLISH/激活由 `evaluateActivationEligibility` 依据真实部署能力裁决。
 * 六组件目录输出形态均落在 DOCUMENT/JSON 支持范围内，无图形化阻断项，故全部可进入发布激活。
 */

import {
  ComponentContract,
  ComponentOutputKind,
  RendererType,
  RequiredModelCapability,
} from "./types";
// 复用第一批合同的激活裁决纯函数（单一实现；本模块不重复实现，避免两份语义漂移）
export { evaluateActivationEligibility } from "./catalog-contracts-c01-c05";

/** 逐组件业务分析（覆盖批次要求的全部字段；缺失显式标注，绝不静默补默认值） */
export interface Batch2E2ContractAnalysis {
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

/** 纯文本类组件的统一输入合同（C21/C22/C23/C25 共用形态，但 placeholder 与业务语义各自不同） */
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

/** 单文件类组件输入合同（C20：FILE 单文件；maxCount 必须 = 1） */
function fileOnlyInput(acceptedMimes: string[], maxSingleBytes: number) {
  return {
    kind: "FILE" as const,
    fileConstraints: {
      required: true,
      minCount: 1,
      maxCount: 1,
      acceptedMimes,
      maxSingleFileBytes: maxSingleBytes,
      maxTotalBytes: maxSingleBytes,
    },
  };
}

/** 文本 + 文件类组件输入合同（C24：inputMode='both'，文本或文件任一非空即可；maxCount = 1） */
function bothInput(acceptedMimes: string[], maxSingleBytes: number) {
  return {
    kind: "TEXT_AND_FILES" as const,
    textConstraints: {
      required: false,
      minLength: MIN_TEXT_LENGTH,
      maxLength: MAX_TEXT_LENGTH,
      placeholder: "可粘贴数据结构文本（如销售排行），或直接上传数据文件（JSON/CSV/Excel）。",
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
// C20 跨数据库 DDL 平移（file: .sql/.txt/.md，DDL ➜ 目标库 DDL）
// ---------------------------------------------------------------------------
export const C20_CONTRACT: ComponentContract = draft("C20", {
  input: fileOnlyInput(["application/sql", "text/plain", "text/markdown"], 2_000_000),
  materialPipeline: {
    steps: [{ name: "文件文本提取与归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c20-ddl-translate",
        name: "源库 DDL 识别与目标库 DDL 平移",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深数据库迁移工程师。请基于上传的源库 DDL 建表语句，输出《跨数据库 DDL 平移方案》，必须包含三部分：\n" +
          "1. 《源库识别》：识别源数据库类型（Oracle/MySQL/PostgreSQL/SQL Server 等）与版本口径，列出涉及的表、字段、约束、索引与特殊函数；\n" +
          "2. 《目标库 DDL》：给出完全兼容目标库语法的建表语句（含主键、外键、唯一约束、常用索引），逐条标注与原 DDL 的语法差异（如自增、分页、时间类型、字符串类型、存储过程等），并给出对应改写法；\n" +
          "3. 《映射》章节：以 Markdown 表格逐行给出「源表/字段/类型 → 目标库表/字段/类型」的映射，明确类型转换口径与精度影响。\n" +
          "硬性要求：必须识别源库类型；若输入未明确目标库类型，必须显式标注为「待确认」并给出假设目标库（默认 PostgreSQL）；" +
          "严禁编造输入中未出现的表名或字段名；类型转换涉及精度/时区时必须显式说明风险。",
        inputMapping: {},
        outputKey: "ddl_translate_package",
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
      requiredProperties: ["targetDdl", "mapping"],
    },
  },
  qualityPolicy: {
    requiredSections: ["映射"],
    minOutputLength: 400,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证100%兼容", "已生成ER图", "无需任何测试"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下 DDL 平移结果由模型辅助生成，跨库函数/类型差异请以目标库官方文档为准，请在目标库测试执行后再上生产。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 200,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C21 网页界面积木生成（React）（text，需求 ➜ React 代码）
// ---------------------------------------------------------------------------
export const C21_CONTRACT: ComponentContract = draft("C21", {
  input: textOnlyInput("请描述您想要的界面与交互需求，例如：设计一个支持关键词搜索、表格分页展示的数据列表页（含筛选与排序）。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c21-react-gen",
        name: "React 积木组件代码产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深前端 React 工程师。请基于输入材料描述的界面需求，输出《React 组件方案》，必须包含两部分：\n" +
          "1. 《组件》章节：给出完整可运行的 React + TypeScript 源码（含 Props 类型定义、状态管理、事件处理），代码以 ```tsx 代码块承载，并标注关键交互逻辑；\n" +
          "2. 《TypeScript 说明》：说明组件 Props 契约、状态数据流、依赖与接入方式、以及可访问性/边界处理要点。\n" +
          "硬性要求：必须产出「组件」章节且代码可编译；输入未声明技术栈/样式方案时，必须显式标注为「待确认」并给出假设（默认函数组件 + hooks + CSS Modules）；" +
          "严禁编造不存在的第三方库 API。",
        inputMapping: {},
        outputKey: "react_component_package",
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
      requiredProperties: ["component", "code"],
    },
  },
  qualityPolicy: {
    requiredSections: ["组件"],
    minOutputLength: 400,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证零Bug", "已通过生产验证"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下 React 组件由模型辅助生成，请人工核对 TypeScript 类型、依赖版本与构建配置后使用。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 80,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C22 网页界面积木生成（Vue）（text，需求 ➜ Vue3 组件代码）
//   注：目录数据修复（contract=「需求 ➜ Vue3 组件代码」、estimatedModelTokens=80），
//       由 migrate-c20-c25-contracts.ts 在 --apply 时仅改这两字段（逐行可清单），修复后方可执行。
// ---------------------------------------------------------------------------
export const C22_CONTRACT: ComponentContract = draft("C22", {
  input: textOnlyInput("请描述您想要的界面与交互需求，例如：设计一个支持多文件拖拽上传、带蓝色条形进度显示的组件。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c22-vue-gen",
        name: "Vue3 积木组件代码产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深前端 Vue 工程师。请基于输入材料描述的界面需求，输出《Vue3 组件方案》，必须包含两部分：\n" +
          "1. 《组件》章节：给出完整可运行的 Vue 3 单文件组件源码（采用 script setup 语法 + TypeScript），含 Props/Emits 数据流、响应式状态与事件处理，代码以 ```vue 代码块承载；\n" +
          "2. 《TypeScript 说明》：说明 Props/Emits 契约、响应式数据流、依赖与接入方式、以及边界处理要点。\n" +
          "硬性要求：必须产出「组件」章节且代码可编译；输入未声明样式/状态方案时，必须显式标注为「待确认」并给出假设（默认采用 script setup 且 lang=\"ts\" 的组合式 API）；" +
          "严禁编造不存在的第三方库 API。",
        inputMapping: {},
        outputKey: "vue_component_package",
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
      requiredProperties: ["component", "code"],
    },
  },
  qualityPolicy: {
    requiredSections: ["组件"],
    minOutputLength: 400,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证零Bug", "已通过生产验证"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下 Vue3 组件由模型辅助生成，请人工核对 TypeScript 类型、依赖版本与构建配置后使用。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 80,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C23 多端屏幕自适应排版适配（text，布局 ➜ 响应式 CSS）
// ---------------------------------------------------------------------------
export const C23_CONTRACT: ComponentContract = draft("C23", {
  input: textOnlyInput("请描述您的排版布局设计意图，或粘贴基础网页布局样式，例如：一个三栏电商首页，PC 端展示完整导航与侧边栏，平板两栏，手机单栏堆叠。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c23-responsive-css",
        name: "响应式 CSS 排版产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深前端布局工程师。请基于输入材料描述的布局意图，输出《响应式排版方案》，必须包含两部分：\n" +
          "1. 《CSS 代码》：给出响应式 CSS（媒体查询 / 弹性布局 / 栅格），覆盖 PC、平板、手机三档断点，代码以 ```css 代码块承载；\n" +
          "2. 《断点》章节：以 Markdown 表格列出各断点（如 ≥1200px / 768–1199px / <768px）的布局变化、列数与关键适配规则。\n" +
          "硬性要求：必须产出「断点」章节且 CSS 可运行；输入未声明设计稿/组件库时，必须显式标注为「待确认」并给出假设（默认移动优先 + 流式栅格）；" +
          "严禁编造不存在的 CSS 属性。",
        inputMapping: {},
        outputKey: "responsive_css_package",
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
      requiredProperties: ["css", "breakpoints"],
    },
  },
  qualityPolicy: {
    requiredSections: ["断点"],
    minOutputLength: 400,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证所有设备完美", "无需任何测试"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下响应式 CSS 由模型辅助生成，请在不同真机/浏览器核验断点表现后再上生产。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 100,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C24 炫酷数据图表一键生成（both: .json/.csv/.xlsx/.xls/.txt，数据 ➜ ECharts）
//   差异化样本：输出 kind = JSON（ECharts option 本就是 JSON 结构，结构化校验比 MARKDOWN 更强）。
//   schemaVersion 以宽松结构定义 ECharts option 最外层字段（title/tooltip/legend/xAxis/yAxis/series 类目）。
//   xlsx/xls 提取已被 text-extract 支持（officeparser + SheetJS 兜底），故 acceptedMimes 含其二进制 MIME，属真实支持、非伪支持。
// ---------------------------------------------------------------------------
export const C24_CONTRACT: ComponentContract = draft("C24", {
  input: bothInput(
    [
      "application/json",
      "text/csv",
      "text/plain",
      "text/markdown",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ],
    2_000_000,
  ),
  materialPipeline: {
    steps: [{ name: "输入文本/文件提取与归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c24-echarts-gen",
        name: "ECharts option JSON 产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深数据可视化工程师。请基于输入材料（JSON/CSV/Excel 数据或数据结构文本），输出《ECharts 图表配置》，要求：\n" +
          "1. 必须输出一段**合法 JSON**（可被 JSON.parse 解析），顶层为 ECharts option 对象；\n" +
          "2. option 顶层须包含 series（图表系列数组，至少一项）、title、tooltip、legend、xAxis、yAxis 等字段（以 ECharts 官方 option 为准的宽松结构），series.type 明确图表类型（line/bar/pie 等）；\n" +
          "3. 若输入为聚合后的数据文本，必须先将其规整为 ECharts 所需的 categories 与 series.data 结构再产出 option；\n" +
          "4. 标注图表类型选择与配色思路，并对缺失字段显式标注「待确认」。\n" +
          "硬性要求：输出必须是合法 JSON（不得用 Markdown 散文包裹核心数据）；不得编造输入中未出现的字段名；" +
          "series 必须有至少一项。",
        inputMapping: {},
        outputKey: "echarts_option_package",
        contextBudgetTokens: 14_000,
        maxOutputTokens: 3_000,
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
          title: { type: "object" },
          tooltip: { type: "object" },
          legend: { type: "object" },
          xAxis: { type: "object" },
          yAxis: { type: "object" },
          series: { type: "array" },
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
    forbiddenPhrases: ["保证数据绝对准确", "无需核对数据源"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下 ECharts 配置由模型辅助生成，请核对数据口径与 series 类型后再渲染上生产。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 150,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C25 大厂科技感数据监控大屏（text，指标 ➜ 大屏）
// ---------------------------------------------------------------------------
export const C25_CONTRACT: ComponentContract = draft("C25", {
  input: textOnlyInput("请描述大屏所需的展示网格排版与数据指标定义，例如：顶部 6 个 KPI 卡片（GMV/订单量/转化率/在线设备/告警数/满意度），中部实时折线图与地图，底部排行榜表格，数据每 5 秒轮询刷新。"),
  materialPipeline: {
    steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "c25-dashboard-gen",
        name: "数据监控大屏单文件工程产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深数据可视化与大屏前端工程师。请基于输入材料描述的网格排版与指标定义，输出《数据监控大屏方案》，必须包含两部分：\n" +
          "1. 《HTML+ECharts 单文件大屏代码》：给出可直接在浏览器打开运行的单文件 HTML（内联 CSS + ECharts CDN + 原生 JS），含炫酷边框特效、自适应拉伸布局与多个图表/指标卡；\n" +
          "2. 《轮询》章节：说明数据轮询刷新机制（如 setInterval 每 N 秒 fetch 接口并更新图表/指标），列出轮询间隔、失败降级与重连策略。\n" +
          "硬性要求：必须产出「轮询」章节且 HTML 可独立运行；输入未声明接口/数据源时，必须显式标注为「待确认」并给出 mock 数据结构；" +
          "严禁编造不存在的 ECharts API。",
        inputMapping: {},
        outputKey: "dashboard_package",
        contextBudgetTokens: 16_000,
        maxOutputTokens: 6_000,
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
      requiredProperties: ["html", "polling"],
    },
  },
  qualityPolicy: {
    requiredSections: ["轮询"],
    minOutputLength: 600,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证大屏永不崩", "无需任何测试"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下大屏工程由模型辅助生成，请核对接口契约、轮询间隔与浏览器兼容性后再上生产。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 300,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// 逐组件业务分析（批次 2E2 要求的全部字段）
// ---------------------------------------------------------------------------
const TEXT_INPUT_METHOD =
  "纯文本粘贴（目录 inputMode=text；accept 为文本类扩展名集合；C22 目录 accept 经修复后与同族一致）";
const FILE_INPUT_METHOD_C20 =
  "单文件上传（目录 inputMode=file；accept=.sql,.txt,.md；MIME: application/sql,text/plain,text/markdown）";
const BOTH_INPUT_METHOD_C24 =
  "文本粘贴或上传数据文件（目录 inputMode=both；accept=.json,.csv,.xlsx,.xls,.txt；MIME 含 application/json,text/csv 与 xlsx/xls 二进制类型）";

export const BATCH_2E2_ANALYSIS: Record<"C20" | "C21" | "C22" | "C23" | "C24" | "C25", Batch2E2ContractAnalysis> = {
  C20: {
    componentId: "C20",
    businessPurpose:
      "上传源库 DDL，自动转换为目标库兼容建表语句（目录真实描述：自动转换不同数据库语法差异，支持 Oracle/MySQL 等表结构一键平移）。",
    inputMethod: FILE_INPUT_METHOD_C20,
    textRequirement: "不适用（FILE 单文件模式，文件必填）",
    fileRequirement: "必填；单文件（maxCount=1），≤ 2MB；accept=.sql,.txt,.md（MIME: application/sql,text/plain,text/markdown）",
    singleFileSupported: true,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: false,
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    artifactStructure: "Markdown 文档：targetDdl（目标库 DDL）/ mapping（源→目标映射表）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 200,
    realDataBaseline:
      "需要源库 DDL 文件作为唯一材料；目标库类型若未声明必须显式标注「待确认」并给假设，不引入外部历史数据集。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes:
      "产物是目标库 DDL 与映射说明文本 → 仅声明 TEXT_GENERATION；DDL 文件按文本理解，不额外声明 FILE_ANALYSIS；要求 requireHumanReview=true。",
  },
  C21: {
    componentId: "C21",
    businessPurpose:
      "输入排版需求，自动生成带 TypeScript 说明的 React 网页模块代码（目录真实描述：自动生成带 TypeScript 说明的 React 网页模块代码）。",
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
    artifactStructure: "Markdown 文档：component（React TSX 代码块）/ code（TypeScript 说明）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 80,
    realDataBaseline: "不需要真实数据基准：界面需求全部来自用户输入；未声明技术栈必须显式标注「待确认」。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "产物是 React 组件代码文本 → 仅声明 TEXT_GENERATION；要求 requireHumanReview=true，禁止伪造「零 Bug」等表述。",
  },
  C22: {
    componentId: "C22",
    businessPurpose:
      "输入网页样式要求，自动生成 Vue3 标准组件与页面代码（目录真实描述：自动生成 Vue 3 标准组件与页面代码）。",
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
    artifactStructure: "Markdown 文档：component（Vue3 SFC 代码块）/ code（TypeScript 说明）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 80,
    realDataBaseline:
      "不需要真实数据基准：界面需求全部来自用户输入；目录 contract/estimatedModelTokens 经 migrate 修复（contract=「需求 ➜ Vue3 组件代码」、estTokens=80）后方可执行。",
    capabilitySupport:
      "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖（修复目录成本后无成本门禁阻断）。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes:
      "目录数据修复前置：contract=null、estimatedModelTokens=0 会导致算账中心 COMPONENT_COST_NOT_CONFIGURED 阻断；migrate 仅修这两字段。修复后与 C21 同族，仅框架差异。",
  },
  C23: {
    componentId: "C23",
    businessPurpose:
      "自动生成适配 PC/平板/手机分辨率的响应式代码（目录真实描述：自动生成适配各终端分辨率的代码，保证显示完美）。",
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
    artifactStructure: "Markdown 文档：css（响应式 CSS 代码块）/ breakpoints（断点说明表）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 100,
    realDataBaseline: "不需要真实数据基准：布局意图全部来自用户输入；未声明设计稿必须显式标注「待确认」。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "产物是响应式 CSS 文本 → 仅声明 TEXT_GENERATION；要求 requireHumanReview=true，禁止伪造「所有设备完美」等表述。",
  },
  C24: {
    componentId: "C24",
    businessPurpose:
      "将 JSON/CSV/Excel 数据转换为精美 ECharts 网页图表配置（目录真实描述：将 JSON/CSV 数据自动转换为精美 ECharts 网页图表配置）。",
    inputMethod: BOTH_INPUT_METHOD_C24,
    textRequirement: "可选（与文件二选一，任一非空即可）；最短 20 字符，最长 20000 字符",
    fileRequirement:
      "可选；单文件（maxCount=1），≤ 2MB；accept=.json,.csv,.xlsx,.xls,.txt（MIME: application/json,text/csv,text/plain,text/markdown,xlsx/xls 二进制类型）",
    singleFileSupported: true,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: true,
    requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
    outputKind: "JSON",
    rendererType: "JSON_VIEWER",
    artifactStructure: "合法 JSON：ECharts option（title/tooltip/legend/xAxis/yAxis/series），结构化校验强于 MARKDOWN",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出非合法 JSON 或结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 150,
    realDataBaseline:
      "需要数据结构（JSON/CSV/Excel 或文本描述）；模型将数据结构规整为 ECharts categories/series.data；缺失字段显式标注「待确认」。",
    capabilitySupport:
      "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件输出 JSON 需 STRUCTURED_OUTPUT，二者均具备；xlsx/xls 提取由 text-extract（officeparser+SheetJS）真实支持，非伪支持。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes:
      "差异化样本：输出 JSON（ECharts option），以 schemaDefinition 宽松定义最外层字段，结构化校验比 MARKDOWN 更强；仅 C24 声明 STRUCTURED_OUTPUT。",
  },
  C25: {
    componentId: "C25",
    businessPurpose:
      "一键布局数据监控大屏，含实时数据轮询更新（目录真实描述：一键布局数据监控大屏，包含实时数据轮询更新，效果炫丽）。",
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
    artifactStructure: "Markdown 文档：html（HTML+ECharts 单文件大屏代码块）/ polling（轮询说明）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 300,
    realDataBaseline:
      "不需要真实数据基准：网格排版与指标定义全部来自用户输入；未声明接口/数据源必须显式标注「待确认」并给 mock 结构。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes:
      "产物是 HTML+ECharts 大屏代码文本（长代码输出，押金相应放大，属合理）→ 仅声明 TEXT_GENERATION；要求 requireHumanReview=true。",
  },
};

export const BATCH_2E2 = [
  { componentId: "C20", contract: C20_CONTRACT, analysis: BATCH_2E2_ANALYSIS.C20 },
  { componentId: "C21", contract: C21_CONTRACT, analysis: BATCH_2E2_ANALYSIS.C21 },
  { componentId: "C22", contract: C22_CONTRACT, analysis: BATCH_2E2_ANALYSIS.C22 },
  { componentId: "C23", contract: C23_CONTRACT, analysis: BATCH_2E2_ANALYSIS.C23 },
  { componentId: "C24", contract: C24_CONTRACT, analysis: BATCH_2E2_ANALYSIS.C24 },
  { componentId: "C25", contract: C25_CONTRACT, analysis: BATCH_2E2_ANALYSIS.C25 },
] as const;

export const BATCH_2E2_CONTRACTS: ComponentContract[] = BATCH_2E2.map((b) => b.contract);

/** 批次 2E2 目标组件 ID（仅 C20-C25，绝不触碰 C07 与暂停中的 C09，也不覆盖其它批次组件） */
export const BATCH_2E2_COMPONENT_IDS = ["C20", "C21", "C22", "C23", "C24", "C25"] as const;

/** 批次 2E2 明确禁止触碰的组件 ID（冻结快照 + 暂停范围，沿用 E1 基线） */
export const BATCH_2E2_FORBIDDEN_IDS = ["C07", "C09"] as const;
