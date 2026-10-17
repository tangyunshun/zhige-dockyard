/**
 * 组件库公共类型与权限规则
 * 注意：组件元数据（名称/描述/分类/图标/标签/计费/预览/输入方式）全部保存在数据库
 * （component_catalog / component_category 表），由 /api/studio?action=catalog 统一提供，
 * 代码中不再硬编码任何组件信息。
 */

export interface ComponentPreviewData {
  inputMock: string;
  outputMock: string;
  roiText: string;
}

/**
 * 组件可视化图表规格（存数据库 component_catalog.detail.visual，前端按规格渲染，
 * 不同组件呈现不同类型的图表：流程图 / 对比条形图 / 指标卡 / 阶段时间线）。
 * 所有数字必须来自该组件既有文案中的真实业务预估，禁止前端或种子数据凭空编造。
 */
export interface ComponentVisualSpec {
  /**
   * 图表类型：
   * flow=卡片流程图 / pipeline=管线流程图（流动光效）/ console=终端执行模拟（真实执行示例）
   * compare=前后对比条形图 / metrics=核心指标卡 / timeline=阶段时间线 / checklist=安全检查清单
   */
  kind: "flow" | "pipeline" | "console" | "compare" | "metrics" | "timeline" | "checklist";
  /** 主题色（hex），由数据库配置，驱动图表标题 / 节点 / 光效配色，不硬编码 */
  accent?: string;
  /** 用户痛点：打开弹窗即知道这个组件解决自己的什么问题 */
  painPoint?: string;
  /** 使用后的收获：明确告诉用户能得到什么 */
  gain?: string;
  /** 图表标题（如「标书解析四步流水线」） */
  title?: string;
  /** 图表下一句话点评 */
  caption?: string;
  /** flow / pipeline：流程节点（2-5 个，按组件真实处理链路提炼） */
  nodes?: Array<{ title: string; desc?: string; tag?: string }>;
  /** console：终端执行模拟（输入 / 过程 / 输出全部取自组件真实文案，呈现真实执行示例） */
  consoleSpec?: {
    /** 终端窗口标题 */
    title?: string;
    /** 用户输入行 */
    input: string;
    /** 处理过程行 */
    steps?: string[];
    /** 结果输出行 */
    output: string;
  };
  /** compare：对比条（before/after 为同一换算单位下的数值，仅用于条长比例；文案显示用 *Text 字段） */
  bars?: Array<{
    label: string;
    before: number;
    after: number;
    beforeText: string;
    afterText: string;
  }>;
  /** metrics：核心指标卡（数字来自组件既有说明文案） */
  metrics?: Array<{ label: string; value: string; hint?: string }>;
  /** timeline：阶段时间线 */
  stages?: Array<{ phase: string; title: string; desc?: string }>;
  /** checklist：风险检查清单（安全 / 合规 / 审计类组件），level 为风险等级 */
  checks?: Array<{ item: string; level?: "high" | "medium" | "low"; note?: string }>;
}

/**
 * 组件深度详情（唯一数据源：component_catalog.detail 字段）
 * 由 prisma/seed-component-details.mjs 写入并维护，前端禁止硬编码任何兜底文案。
 */
export interface ComponentDetailContent {
  fullDescription: string;
  usage: string;
  apiDoc: string;
  faq: Array<{ q: string; a: string }>;
  // 核心能力清单（能帮用户解决什么问题）与价值清单（能带来什么收益），均为纯展示用的字符串数组
  capabilities?: string[];
  valueProps?: string[];
  beforeAfter?: Array<{ before: string; after: string }>;
  estimatedDuration?: string;
  // 可视化图表规格：按组件能力与价值定制，因组件而异
  visual?: ComponentVisualSpec;
}

export interface ComponentDefinition {
  id: string;
  name: string;
  description: string;
  category: ComponentCategory;
  icon: string;
  tags: string[];
  isPremium: boolean;
  estimatedModelTokens: number;
  previewData: ComponentPreviewData;
  businessTags?: string[];
  // 深度详情：来自数据库 component_catalog.detail 字段
  detail?: ComponentDetailContent | null;
  // 真实统计：由服务端从 component_stats / component_task 聚合后下发，前端不得自行派生模拟数值
  realUsageCount?: number;
  realTaskStats?: { total: number; success: number };
  // 以下字段与数据库 component_catalog 表一一对应
  inputMode?: ComponentInputMode; // text | file | both
  accept?: string; // 文件上传支持的格式
  hint?: string;   // 界面引导文案
  contract?: string;    // 数据流动契约描述（如 "标书 ➜ 偏离表"）
  keywords?: string[];  // 智能搜索关键词
  usageCount?: number;  // 全网累计调用次数
  isDefault?: boolean;  // 新空间默认装配标记
}

/**
 * 统一目录契约响应字段接口（由后端 /api/studio?action=catalog 严格驱动下发）
 * 供 ComponentDispatcherPanelNew, WorkspaceInternalLayoutV3, ComponentBrowser, 任务创建入口等统一复用，
 * 严禁在前端使用 as any 或组件 ID 特判弥补字段缺口。
 */
export interface CatalogContractFields {
  // 合同真实状态（来自 component_contract 表，前端诚实化唯一真源，不得硬编码完成态）
  activeContractLifecycle?: string | null; // PUBLISHED | DRAFT | ARCHIVED | null(无激活合同)
  hasActiveContract?: boolean;
  contractReady?: boolean;        // 仅 PUBLISHED 激活合同为可执行
  hasPublishedContract?: boolean;
  requiredCapabilities?: string[];
  // 服务端返回的通用只读就绪、阻断与质量限制字段（由后端唯一裁决与派生，前端严禁按 ID 特判）
  readinessStatus?: "EXECUTABLE" | "UNCONFIGURED" | "BLOCKED" | "NOT_EXECUTABLE";
  blockingReasons?: string[];
  qualityHints?: string[];
  isCandidateEligible?: boolean;
  // 合同纯数据驱动的输入输出与审核契约字段（服务端真实下发，彻底消除前端 as any 断言）
  inputContractKind?: string | null;
  textConstraints?: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    placeholder?: string;
  } | null;
  fileConstraints?: {
    required?: boolean;
    minCount?: number;
    maxCount: number;
    acceptedMimes: string[];
    maxSingleFileBytes: number;
    maxTotalBytes: number;
  } | null;
  formConstraints?: {
    fields?: Array<{ name: string; label?: string; type: string; required: boolean; options?: string[] }>;
  } | null;
  costBaselineStatus?: string | null;
  outputKind?: string | null;
  disclaimer?: string | null;
  requireHumanReview?: boolean;
  contractVersion?: string | null;
  contractView?: import("@/lib/task-query-helpers").CatalogContractView | null;
}

// 保证 ComponentDefinition 完整继承目录契约字段并保持既有结构兼容
export interface ComponentDefinition extends CatalogContractFields {}

/** 统一组件目录 API 响应类型（由 /api/studio?action=catalog 返回） */
export interface CatalogApiResponse {
  success: boolean;
  components: ComponentDefinition[];
  categories: Record<string, CategoryDetails>;
}

/**
 * 组件输入方式（与数据库 component_catalog.inputMode 字段对应）
 * - text: 仅支持直接输入/粘贴文字
 * - file: 仅支持上传文档，由系统从文件中解析文字内容
 * - both: 两者皆可（上传文件 或 输入文字）
 */
export type ComponentInputMode = "text" | "file" | "both";

export interface ComponentInputInfo {
  mode: ComponentInputMode;
  accept: string; // 文件上传支持的格式
  hint: string;   // 界面引导文案
}

export type ComponentCategory =
  | "BID_PREP"
  | "REQ_DESIGN"
  | "BACKEND_CORE"
  | "DATABASE_ENG"
  | "FRONTEND_DEV"
  | "TEST_QA"
  | "DEVOPS"
  | "SECURITY"
  | "PROJ_MGMT"
  | "KNOWLEDGE";

export interface CategoryDetails {
  name: string;
  color: string;
  range: string;
  sortOrder?: number; // 数据库 component_category.sortOrder（阶段分组顺序）
}
