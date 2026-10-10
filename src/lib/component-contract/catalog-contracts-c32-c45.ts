/**
 * 批次 COMPONENT-EXPANSION-E3 组件合同（C32、C33、C34、C35、C36、C37、C38、C39、
 * C40、C41、C42、C43、C44、C45）真实业务合同定义
 *
 * 经排查，C32-C45 在真实组件目录（prisma/component-catalog-data.ts）中已是
 * DEVOPS / SECURITY / PROJ_MGMT 类真实组件（集群扩容 / CI-CD / 监控告警 / 日志大盘 /
 * SQL 注入扫描 / 网页木马 CSP / 三方漏洞 / 等保自查 / 打码 / WBS / 甘特图 / 风险预案 /
 * 排班 / 结项报告）。本批次即为这 14 个真实目录行编写合同，ID 不冲突、不覆盖既有组件。
 *
 * 严格遵循既有规范（沿用 E1/E2 基线 + 差异化强制项 A+B）：
 *  - 逐组件依据真实业务用途与真实目录行（已核验 DB 实际行）编写，禁止复制改 ID；
 *  - 六份图形化/排版需求（C34 看板、C35 日志大盘、C42 甘特图、C45 PDF）按 C12/C18 模式
 *    登记 unsupportedRequirements 阻断，并给出 DOCUMENT/JSON 文本等价方案，严禁伪支持；
 *  - 数据/清单/映射/配置类组件（C36/C37/C38/C39/C41/C42/C44）输出 JSON 结构化校验
 *    （schemaDefinition），要求 STRUCTURED_OUTPUT；代码/方案/文档类用 DOCUMENT；
 *  - 仅使用当前支持的输出类型：DOCUMENT、JSON（与 SUPPORTED_OUTPUT_KINDS 一致）；
 *  - 未经证据不声明 VISION / FILE_ANALYSIS / LONG_CONTEXT：文本/源码按文本理解，
 *    单次上下文预算 ≤ 16000 tokens → 不声明 LONG_CONTEXT；
 *  - 合同严禁携带 providerId / modelId / upstreamModel / baseUrl / apiKey 等模型绑定字段；
 *  - 能力裁决复用纯函数 evaluateActivationEligibility（单一实现）。
 *
 * 输入形态差异化（真实目录 inputMode 已核实）：
 *  - TEXT：C32/C33/C34/C35/C39/C40/C41/C42/C43/C44（目录 DEFAULT_INPUT=text）
 *  - TEXT_AND_FILES(both)：C36（源码文件或文本）、C45（结项材料文件或文本）
 *  - FILE：C37（前端模板文件）、C38（依赖清单文件）
 *
 * 注意：本模块只产出 DRAFT 合同模板（publishedAt/publishedBy 为 null），
 * 是否 PUBLISH/激活由 evaluateActivationEligibility 依据真实部署能力裁决。
 */

import {
  ComponentContract,
  ComponentOutputKind,
  ComponentUnsupportedRequirement,
  RendererType,
  RequiredModelCapability,
} from "./types";
// 复用激活裁决纯函数（单一实现；本模块不重复实现，避免两份语义漂移）
export { evaluateActivationEligibility } from "./catalog-contracts-c01-c05";

/** 逐组件业务分析（覆盖批次要求的全部字段） */
export interface BatchE3ContractAnalysis {
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

/** 纯文本类组件输入合同 */
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

/** 文本 + 文件类组件输入合同（inputMode='both'，文本或文件任一非空即可；maxCount = 1） */
function bothInput(acceptedMimes: string[], maxSingleBytes: number) {
  return {
    kind: "TEXT_AND_FILES" as const,
    textConstraints: {
      required: false,
      minLength: MIN_TEXT_LENGTH,
      maxLength: MAX_TEXT_LENGTH,
      placeholder: "可粘贴相关文本材料，或直接上传对应文件。",
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

/** 纯文件类组件输入合同（inputMode='file'，必须上传文件；maxCount = 1） */
function fileInput(acceptedMimes: string[], maxSingleBytes: number) {
  return {
    kind: "FILE" as const,
    fileConstraints: {
      required: true,
      maxCount: 1,
      acceptedMimes,
      maxSingleFileBytes: maxSingleBytes,
      maxTotalBytes: maxSingleBytes,
    },
  };
}

// ---------------------------------------------------------------------------
// C32 服务器集群自动扩容与调度（text: 期望副本数/最小最大限制 → K8s 部署 YAML）
// ---------------------------------------------------------------------------
export const C32_CONTRACT: ComponentContract = draft("C32", {
  input: textOnlyInput(
    "请描述期望的集群部署需求，例如：将 Node.js 订单服务部署到 K8s，常态 3 副本、最大 10 副本，CPU 使用率超 70% 时自动扩容，最小 2 副本。",
  ),
  materialPipeline: { steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }] },
  executionPlan: {
    steps: [
      {
        stepId: "c32-k8s-gen",
        name: "K8s 部署与自动伸缩配置产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深云原生工程师。请基于输入材料（服务部署需求与副本/资源限制），输出《K8s 集群部署方案》，必须包含两章：\n" +
          "1. 《部署清单》：给出可直接应用的 Deployment YAML（含资源 request/limit、存活与就绪探针、滚动更新策略）；\n" +
          "2. 《自动伸缩》：给出 HorizontalPodAutoscaler YAML（含基于 CPU/内存的扩缩容指标、最小/最大副本与目标利用率）。\n" +
          "硬性要求：必须产出「部署清单」与「自动伸缩」章节且 YAML 可应用；输入未声明资源指标时必须显式标注「待确认」并给假设（默认 CPU 70% 目标利用率）；" +
          "严禁编造不存在的 K8s API 版本。",
        inputMapping: {},
        outputKey: "k8s_package",
        contextBudgetTokens: 12_000,
        maxOutputTokens: 2_800,
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
    structureConstraints: { requiredProperties: ["部署清单", "自动伸缩"] },
  },
  qualityPolicy: {
    requiredSections: ["部署清单", "自动伸缩"],
    minOutputLength: 400,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证永不宕机", "无需任何测试"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下 K8s 配置由模型辅助生成，请人工核对资源配额与探针端口后在预发环境验证后再上线。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 200,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C33 一键打包发布流水线（text: 仓库类型 + 目标环境 → CI/CD 配置）
// ---------------------------------------------------------------------------
export const C33_CONTRACT: ComponentContract = draft("C33", {
  input: textOnlyInput(
    "请描述代码托管仓库与期望发布的服务器环境，例如：GitHub 仓库，目标 K8s 集群，提交 main 分支后自动构建镜像并灰度发布。",
  ),
  materialPipeline: { steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }] },
  executionPlan: {
    steps: [
      {
        stepId: "c33-cicd-gen",
        name: "CI/CD 流水线配置产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深 DevOps 工程师。请基于输入材料（代码仓库与发布环境），输出《CI/CD 流水线方案》，必须包含两章：\n" +
          "1. 《流水线配置》：给出可直接提交的流水线 YAML（含代码拉取、依赖安装、安全扫描、编译构建、自动发布阶段）；\n" +
          "2. 《阶段说明》：以表格列出各阶段触发条件、产物与回滚方式。\n" +
          "硬性要求：必须产出「流水线配置」与「阶段说明」章节且配置可运行；输入未声明 CI 平台时必须显式标注「待确认」并给假设（默认 GitHub Actions）；" +
          "严禁编造不存在的步骤关键字。",
        inputMapping: {},
        outputKey: "cicd_package",
        contextBudgetTokens: 10_000,
        maxOutputTokens: 2_600,
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
    structureConstraints: { requiredProperties: ["流水线配置", "阶段说明"] },
  },
  qualityPolicy: {
    requiredSections: ["流水线配置", "阶段说明"],
    minOutputLength: 400,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证零故障发布", "无需任何测试"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下流水线配置由模型辅助生成，请人工核对密钥注入与发布门禁后再启用自动上线。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 100,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C34 服务器健康监控与告警（text: 指标阈值 + 接收人 → Prometheus/Grafana 配置）
//   图形化阻断项：Grafana 看板可视化渲染不支持，给出配置等价方案。
// ---------------------------------------------------------------------------
export const C34_CONTRACT: ComponentContract = draft("C34", {
  input: textOnlyInput(
    "请设定需要监控的系统指标与接收告警方式，例如：监控 CPU>90% 持续 5 分钟、内存>85%，通过企业微信与邮件通知运维组。",
  ),
  materialPipeline: { steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }] },
  executionPlan: {
    steps: [
      {
        stepId: "c34-monitor-gen",
        name: "监控与告警配置产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深 SRE 工程师。请基于输入材料（监控指标阈值与告警接收方式），输出《监控告警方案》，必须包含两章：\n" +
          "1. 《监控指标》：给出 Prometheus 抓取配置与 Recording Rules YAML（含 CPU/内存/磁盘/接口可用率指标）；\n" +
          "2. 《告警规则》：给出 Alertmanager 告警规则 YAML（含触发条件、持续时长、抑制策略与通知路由）。\n" +
          "硬性要求：必须产出「监控指标」与「告警规则」章节且配置可应用；并附一段 Grafana Dashboard JSON 配置（可导入渲染看板），" +
          "但须注明：可视化图形由用户在自有 Grafana 中渲染，本组件不生成图像；输入未声明通知渠道时必须显式标注「待确认」。",
        inputMapping: {},
        outputKey: "monitor_package",
        contextBudgetTokens: 14_000,
        maxOutputTokens: 3_200,
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
    structureConstraints: { requiredProperties: ["监控指标", "告警规则"] },
  },
  qualityPolicy: {
    requiredSections: ["监控指标", "告警规则"],
    minOutputLength: 450,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证提前发现所有故障", "无需任何测试"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下监控告警配置由模型辅助生成，请人工核对指标端口与通知 webhook 后再生效。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 250,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
  unsupportedRequirements: [
    {
      requirement: "Grafana 监控看板的可视化图表渲染（仪表盘/折线/柱状等图形）",
      reason: "当前组件成果物仅支持 DOCUMENT（YAML 配置与 JSON 看板定义）与文本，不具备图像/图表渲染引擎，无法输出像素级看板图。",
      suggestedAlternative:
        "提供 Prometheus 规则文件 + Grafana Dashboard JSON 配置（可一键导入渲染），等价交付指标采集与看板定义；可视化图形由用户在自有 Grafana 中渲染，不伪造成图。",
    },
  ],
});

// ---------------------------------------------------------------------------
// C35 多服务器运行日志大盘（text: 采集方式 + 日志路径 → 采集脚本 + 检索 DSL）
//   图形化阻断项：日志可视化大盘图表不支持，给出配置等价方案。
// ---------------------------------------------------------------------------
export const C35_CONTRACT: ComponentContract = draft("C35", {
  input: textOnlyInput(
    "请描述日志采集方式与需分析的日志路径格式，例如：通过 Filebeat 收集 /var/log/app/*.log 与 Nginx 访问日志，统一入 Elasticsearch，按服务名与错误级别检索。",
  ),
  materialPipeline: { steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }] },
  executionPlan: {
    steps: [
      {
        stepId: "c35-log-gen",
        name: "日志采集与检索配置产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深日志平台工程师。请基于输入材料（日志采集方式与路径），输出《日志集中检索方案》，必须包含两章：\n" +
          "1. 《采集配置》：给出 Filebeat/Vector 采集配置与 Elasticsearch 索引模板（含字段映射与 ILM 生命周期）；\n" +
          "2. 《检索示例》：给出常见排错检索 DSL（错误栈、5xx、慢请求、按服务聚合）及 Kibana/Grafana 看板导入 JSON。\n" +
          "硬性要求：必须产出「采集配置」与「检索示例」章节且配置可运行；并须注明：实时检索控制台图形由用户在自有 Kibana/Grafana 中渲染，本组件不生成图像。",
        inputMapping: {},
        outputKey: "log_package",
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
    structureConstraints: { requiredProperties: ["采集配置", "检索示例"] },
  },
  qualityPolicy: {
    requiredSections: ["采集配置", "检索示例"],
    minOutputLength: 450,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证秒级检索所有错误", "无需任何测试"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下日志采集配置由模型辅助生成，请人工核对路径权限与索引映射后再部署。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 200,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
  unsupportedRequirements: [
    {
      requirement: "日志可视化大盘图表（实时检索控制台看板的图形化展示）",
      reason: "当前组件成果物仅支持 DOCUMENT（采集脚本与检索 DSL）与文本，不具备图形化看板渲染引擎。",
      suggestedAlternative:
        "提供日志采集配置脚本（Filebeat/Vector）+ ES 索引模板 + 检索 DSL 与看板导入 JSON，等价交付集中检索能力；图形由用户在 Kibana/Grafana 中渲染。",
    },
  ],
});

// ---------------------------------------------------------------------------
// C36 数据库防黑客窃取扫描（both: 接口/查询代码文件或文本 → 结构化扫描结果 JSON）
// ---------------------------------------------------------------------------
export const C36_CONTRACT: ComponentContract = draft("C36", {
  input: bothInput([".ts", ".js", ".py", ".java", ".go", ".txt", "text/plain"], MAX_SINGLE_BYTES),
  materialPipeline: { steps: [{ name: "输入文本/文件提取与归一化", type: "TEXT_NORMALIZE" }] },
  executionPlan: {
    steps: [
      {
        stepId: "c36-sqli-scan",
        name: "SQL 注入风险扫描结果 JSON 产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深安全工程师。请基于输入材料（含数据库查询的代码），输出《SQL 注入风险扫描结果》，要求：\n" +
          "1. 必须输出一段合法 JSON（可被 JSON.parse 解析），顶层对象含 summary（扫描概览）与 issues（问题数组）；\n" +
          "2. issues 每项含 { file, line, severity(INFO/WARN/ERROR), type, message, suggestion } 字段，type 取值如 SQL_INJECTION/STRING_CONCAT/MISSING_PARAM；\n" +
          "3. 定位未参数化拼接、字符串格式化拼 SQL 等缺陷，并给出参数化查询或 ORM 修复方案。\n" +
          "硬性要求：输出必须是合法 JSON（不得用 Markdown 散文包裹核心数据）；issues 必须有至少一项；severity 必须取值 INFO/WARN/ERROR。",
        inputMapping: {},
        outputKey: "sqli_scan_package",
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
    forbiddenPhrases: ["保证数据库零入侵", "无需人工复核"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下 SQL 注入扫描结果由模型辅助生成，请人工复核高危项并落实参数化查询后再上线。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 80,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C37 网页防非法木马与广告植入（file: 前端模板文件 → 结构化扫描结果 JSON + CSP 规则）
// ---------------------------------------------------------------------------
export const C37_CONTRACT: ComponentContract = draft("C37", {
  input: fileInput([".html", ".htm", ".js", ".css", ".ts", ".tsx", "text/html", "text/plain"], MAX_SINGLE_BYTES),
  materialPipeline: { steps: [{ name: "前端模板文件解析", type: "DOCUMENT_PARSE" }] },
  executionPlan: {
    steps: [
      {
        stepId: "c37-xss-scan",
        name: "前端木马与 XSS 风险扫描结果 JSON 产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深前端安全工程师。请基于输入材料（前端静态模板/脚本文件），输出《前端安全风险扫描结果》，要求：\n" +
          "1. 必须输出一段合法 JSON（可被 JSON.parse 解析），顶层对象含 summary（扫描概览）、findings（风险数组）与 cspPolicy（字符串）；\n" +
          "2. findings 每项含 { location, risk(INFO/WARN/ERROR), description, suggestion } 字段，risk 取 INFO/WARN/ERROR；\n" +
          "3. 定位未转义用户输入、危险 innerHTML、可执行外链、Cookie 未设 HttpOnly 等缺陷，并给出内容安全策略（CSP）防御规则字符串存入 cspPolicy。\n" +
          "硬性要求：输出必须是合法 JSON；findings 至少一项；cspPolicy 必须是可直接部署的 CSP 头字符串。",
        inputMapping: {},
        outputKey: "xss_scan_package",
        contextBudgetTokens: 10_000,
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
          findings: { type: "array" },
          cspPolicy: { type: "string" },
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
    forbiddenPhrases: ["保证网站零入侵", "无需人工复核"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下前端安全扫描结果由模型辅助生成，请人工复核高危项并部署 CSP 后再发布。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 80,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C38 三方开源插件漏洞检测（file: 依赖清单 → 结构化漏洞清单 JSON）
// ---------------------------------------------------------------------------
export const C38_CONTRACT: ComponentContract = draft("C38", {
  input: fileInput([".json", ".xml", ".toml", ".txt", ".md", "application/json", "text/plain"], MAX_SINGLE_BYTES),
  materialPipeline: { steps: [{ name: "依赖清单文件解析", type: "DOCUMENT_PARSE" }] },
  executionPlan: {
    steps: [
      {
        stepId: "c38-cve-scan",
        name: "三方依赖漏洞清单 JSON 产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深供应链安全工程师。请基于输入材料（依赖声明清单如 package.json / pom.xml / requirements.txt），输出《三方开源漏洞清单》，要求：\n" +
          "1. 必须输出一段合法 JSON（可被 JSON.parse 解析），顶层对象含 summary（概览）与 vulnerabilities（数组）；\n" +
          "2. vulnerabilities 每项含 { package, installedVersion, severity(INFO/WARN/ERROR/CRITICAL), cve, fixedVersion, recommendation } 字段；\n" +
          "3. 对照常见漏洞库指出危险版本、对应 CVE 编号及推荐升级到的安全版本。\n" +
          "硬性要求：输出必须是合法 JSON；vulnerabilities 至少一项；severity 取 INFO/WARN/ERROR/CRITICAL。",
        inputMapping: {},
        outputKey: "cve_package",
        contextBudgetTokens: 12_000,
        maxOutputTokens: 2_200,
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
          vulnerabilities: { type: "array" },
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
    forbiddenPhrases: ["保证供应链零漏洞", "无需人工复核"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下三方漏洞清单由模型辅助生成，请人工核对 CVE 与升级版本后再更新依赖。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 150,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C39 国家等保2.0合规自查（text: 等保级别 + 架构 → 结构化自查清单 JSON）
// ---------------------------------------------------------------------------
export const C39_CONTRACT: ComponentContract = draft("C39", {
  input: textOnlyInput(
    "请描述系统期望达到的等保级别与架构部署，例如：等保三级，前后端分离 + 云上 RDS + 对象存储，含对外 Web 与管理后台。",
  ),
  materialPipeline: { steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }] },
  executionPlan: {
    steps: [
      {
        stepId: "c39-djcp-check",
        name: "等保2.0 合规自查清单 JSON 产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深等保合规工程师。请基于输入材料（等保级别与系统架构），输出《等保2.0 合规自查结果》，要求：\n" +
          "1. 必须输出一段合法 JSON（可被 JSON.parse 解析），顶层对象含 summary（概览）与 items（指标数组）；\n" +
          "2. items 每项含 { item, requirement, result(PASS/FAIL/NEED_IMPROVE), evidence, remediation } 字段；\n" +
          "3. 对照对应级别硬性指标逐条核对（身份鉴别、访问控制、安全审计、入侵防范、数据完整性与保密等），标出不符合项并给加固手段。\n" +
          "硬性要求：输出必须是合法 JSON；items 至少 5 项；result 必须取值 PASS/FAIL/NEED_IMPROVE。",
        inputMapping: {},
        outputKey: "djcp_package",
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
          summary: { type: "object" },
          items: { type: "array" },
        },
      },
    },
  },
  qualityPolicy: {
    minOutputLength: 250,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证一次过检", "无需人工复核"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下等保自查结果由模型辅助生成，请以官方测评机构结论为准，人工复核整改项。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 300,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C40 手机号身份证智能打码（text: 打码规则 → 脱敏转换逻辑代码 DOCUMENT）
//   声明 privacyPolicy（合同层脱敏意图；DOCUMENT 路径不在运行期强制结构化隐私校验）。
// ---------------------------------------------------------------------------
export const C40_CONTRACT: ComponentContract = draft("C40", {
  input: textOnlyInput(
    "请描述打码脱敏规则，例如：手机号显示前三后四中间打星（138****8000），身份证保留前 6 后 4（110101********1234），银行卡保留后 4。",
  ),
  materialPipeline: { steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }] },
  executionPlan: {
    steps: [
      {
        stepId: "c40-mask-gen",
        name: "脱敏打码转换逻辑产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深数据隐私工程师。请基于输入材料（打码脱敏规则），输出《敏感数据脱敏方案》，必须包含两章：\n" +
          "1. 《脱敏规则》：以表格列出字段类型（手机号/身份证/银行卡/姓名）、保留位与打星位、示例（必须使用已打码形式，如 138****8000、110101********1234、622202********1234）；\n" +
          "2. 《转换逻辑》：给出后端与前端可直接运行的脱敏函数代码（如 maskPhone/maskIdCard/maskBankCard），并说明密钥与防泄漏策略。\n" +
          "硬性要求：必须产出「脱敏规则」与「转换逻辑」章节；所有示例必须使用已脱敏形式，严禁输出任何真实未脱敏的手机号/身份证/银行卡；" +
          "严禁编造不存在的加密 API；如需说明策略须写入 privacyNotes 字段（纯文本描述亦可）。",
        inputMapping: {},
        outputKey: "mask_package",
        contextBudgetTokens: 10_000,
        maxOutputTokens: 2_400,
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
    structureConstraints: { requiredProperties: ["脱敏规则", "转换逻辑"] },
  },
  qualityPolicy: {
    requiredSections: ["脱敏规则", "转换逻辑"],
    minOutputLength: 450,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证完全防泄密", "无需任何测试"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下脱敏逻辑由模型辅助生成，请人工核对打星规则与密钥管理，并仅对测试/分析材料使用，禁止输入真实用户隐私。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 120,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
  privacyPolicy: {
    requirePrivacyNotes: true,
    phoneMaskPattern: "1[3-9]\\d{9}",
    forbiddenUnmasked: ["ID_CARD", "BANK_CARD"],
    nameVerifiability: "NOT_SERVER_VERIFIABLE",
    notes: "本组件产出脱敏打码逻辑，示例数据必须使用已打码形式（如 138****8000），禁止输出未脱敏的真实手机号/身份证/银行卡；姓名等无法由服务端判定的字段要求用户复核。",
  },
});

// ---------------------------------------------------------------------------
// C41 项目任务按工期逐步分解(WBS)（text: 愿景 + 交付物 → 结构化任务树 JSON）
// ---------------------------------------------------------------------------
export const C41_CONTRACT: ComponentContract = draft("C41", {
  input: textOnlyInput(
    "请描述项目愿景与各阶段核心交付成果，例如：3 个月上线电商小程序，阶段交付：需求评审、UI 设计、前后端开发、联调、灰度、正式上线。",
  ),
  materialPipeline: { steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }] },
  executionPlan: {
    steps: [
      {
        stepId: "c41-wbs-gen",
        name: "WBS 任务分解 JSON 产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深项目管理工程师。请基于输入材料（项目愿景与交付成果列表），输出《WBS 任务分解》，要求：\n" +
          "1. 必须输出一段合法 JSON（可被 JSON.parse 解析），顶层对象含 summary（概览）与 tasks（任务数组）；\n" +
          "2. tasks 每项含 { id, name, phase, parentId(可空), estimatedDays, milestone(可空) } 字段；\n" +
          "3. 逐级细化到可交付工作包，标注阶段、预估工期与里程碑依赖。\n" +
          "硬性要求：输出必须是合法 JSON；tasks 至少 4 项；parentId 用于表达层级归属（顶层为 null）。",
        inputMapping: {},
        outputKey: "wbs_package",
        contextBudgetTokens: 10_000,
        maxOutputTokens: 2_400,
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
          tasks: { type: "array" },
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
    forbiddenPhrases: ["保证按期交付", "无需人工复核"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下 WBS 分解由模型辅助生成，请人工核对工期估算与依赖后再排期。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 80,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C42 项目进度时间表甘特图（text: 任务清单 + 依赖 → 排期 JSON）
//   图形化阻断项：甘特图横向可视化渲染不支持，给出排期 JSON + 表格等价方案。
// ---------------------------------------------------------------------------
export const C42_CONTRACT: ComponentContract = draft("C42", {
  input: textOnlyInput(
    "请描述已拆解的任务清单列表及任务间前后依赖，例如：需求(3d)→设计(5d)→开发(10d)→联调(4d)→上线(2d)，开发与设计为并行。",
  ),
  materialPipeline: { steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }] },
  executionPlan: {
    steps: [
      {
        stepId: "c42-gantt-gen",
        name: "排期数据 JSON 产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深项目管理工程师。请基于输入材料（任务清单与依赖关系），输出《项目排期数据》，要求：\n" +
          "1. 必须输出一段合法 JSON（可被 JSON.parse 解析），顶层对象含 note（说明）与 tasks（数组）；\n" +
          "2. tasks 每项含 { task, startDate, endDate, durationDays, dependencies, criticalPath(boolean) } 字段，日期为 YYYY-MM-DD；\n" +
          "3. 推算关键路径与里程碑卡点，并附一段 Markdown 排期表（任务/起止/工期/依赖）作为文本等价交付物。\n" +
          "硬性要求：输出必须是合法 JSON；tasks 至少 4 项；并须注明：横向甘特图图形由用户在 Project/LibreOffice 等工具中渲染，本组件不生成图像。",
        inputMapping: {},
        outputKey: "gantt_package",
        contextBudgetTokens: 10_000,
        maxOutputTokens: 2_600,
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
          note: { type: "string" },
          tasks: { type: "array" },
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
    forbiddenPhrases: ["保证零延期", "无需人工复核"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下排期数据由模型辅助生成，请人工核对依赖与工期后再绘制甘特图。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 100,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
  unsupportedRequirements: [
    {
      requirement: "甘特图横向可视化图形渲染（任务条/依赖箭线/关键路径高亮的像素图）",
      reason: "当前组件成果物仅支持 JSON 结构化排期数据与 Markdown 排期表，不具备图像渲染引擎，无法输出像素级甘特图。",
      suggestedAlternative:
        "提供排期 JSON（含任务起止/工期/依赖/关键路径）+ Markdown 排期表，由用户在 Microsoft Project / LibreOffice / draw.io 中渲染甘特图，不伪造成图。",
    },
  ],
});

// ---------------------------------------------------------------------------
// C43 项目潜在风险防范预案（text: 团队规模 + 性质 + 期限 → 风险防范文档 DOCUMENT）
// ---------------------------------------------------------------------------
export const C43_CONTRACT: ComponentContract = draft("C43", {
  input: textOnlyInput(
    "请描述当前团队规模、项目性质与期望交付期限，例如：8 人团队，ToB SaaS 项目，6 个月内交付 v1.0，含大量第三方集成。",
  ),
  materialPipeline: { steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }] },
  executionPlan: {
    steps: [
      {
        stepId: "c43-risk-gen",
        name: "风险防范预案产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深 Risk PM。请基于输入材料（团队配置、项目性质、交付期限），输出《项目风险防范预案》，必须包含两章：\n" +
          "1. 《风险清单》：以表格列出 8-12 项高发风险（如人员流动、需求蔓延、系统延期、第三方依赖故障、安全合规），标注概率与影响；\n" +
          "2. 《防范预案》：针对每项高风险给出具体应急防范与备岗/降级建议。\n" +
          "硬性要求：必须产出「风险清单」与「防范预案」章节；输入信息不足时显式标注「待确认」假设。",
        inputMapping: {},
        outputKey: "risk_package",
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
    structureConstraints: { requiredProperties: ["风险清单", "防范预案"] },
  },
  qualityPolicy: {
    requiredSections: ["风险清单", "防范预案"],
    minOutputLength: 500,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证零风险", "无需任何预案"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下风险防范预案由模型辅助生成，请人工结合项目实际补充应急联络与责任分工。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 120,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C44 团队排班与闲置优化（text: 角色工时 + 任务 → 排班与饱和度 JSON）
// ---------------------------------------------------------------------------
export const C44_CONTRACT: ComponentContract = draft("C44", {
  input: textOnlyInput(
    "请描述团队各角色总可用工时与周期内紧要任务，例如：前端2人×40h、后端3人×40h、测试1人×40h；任务含开发A(120h)、开发B(80h)、测试(60h)。",
  ),
  materialPipeline: { steps: [{ name: "输入文本归一化", type: "TEXT_NORMALIZE" }] },
  executionPlan: {
    steps: [
      {
        stepId: "c44-roster-gen",
        name: "排班与利用率 JSON 产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深资源调度工程师。请基于输入材料（各角色可用工时与任务清单），输出《团队排班与饱和度分析》，要求：\n" +
          "1. 必须输出一段合法 JSON（可被 JSON.parse 解析），顶层对象含 summary（概览）与 assignments（数组）；\n" +
          "2. assignments 每项含 { role, member, allocatedHours, task, utilization(0-1) } 字段；\n" +
          "3. 均衡派单，标注过度加班（utilization>1）与长期闲置（utilization<0.5）的成员及优化建议，并附整体利用率统计。\n" +
          "硬性要求：输出必须是合法 JSON；assignments 至少 4 项；utilization 为 0-1 小数。",
        inputMapping: {},
        outputKey: "roster_package",
        contextBudgetTokens: 10_000,
        maxOutputTokens: 2_400,
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
          assignments: { type: "array" },
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
    forbiddenPhrases: ["保证零闲置", "无需人工复核"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下排班与饱和度分析由模型辅助生成，请人工核对成员实际可用工时后再派单。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 150,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
});

// ---------------------------------------------------------------------------
// C45 一键项目结项报告（both: 结项材料文件或文本 → 结项交付文档 DOCUMENT）
//   图形化阻断项：PDF 精美排版/一键导出 PDF 不支持，给出 Markdown 等价方案。
// ---------------------------------------------------------------------------
export const C45_CONTRACT: ComponentContract = draft("C45", {
  input: bothInput([".md", ".txt", ".doc", ".docx", ".pdf", ".xlsx", "text/plain", "application/pdf"], MAX_SINGLE_BYTES),
  materialPipeline: { steps: [{ name: "输入文本/文件提取与归一化", type: "TEXT_NORMALIZE" }] },
  executionPlan: {
    steps: [
      {
        stepId: "c45-closure-gen",
        name: "结项交付报告产出",
        promptTemplateVersion: "1.0.0",
        promptTemplate:
          "你是资深项目交付工程师。请基于输入材料（交付版本、测试大纲、缺陷处理统计），输出《项目结项报告》，必须包含三章：\n" +
          "1. 《交付物清单》：表格列出交付的产品版本、模块与文档；\n" +
          "2. 《缺陷处理》：表格列出缺陷总量、已修复/遗留、严重级别分布与遗留说明；\n" +
          "3. 《测试总结》：概述测试覆盖、通过率与验收结论，并附验收签字栏段落。\n" +
          "硬性要求：必须产出「交付物清单」「缺陷处理」「测试总结」章节；并须注明：PDF 精美排版/一键导出由用户用 Pandoc/typst 渲染，本组件不生成 PDF 图像。",
        inputMapping: {},
        outputKey: "closure_package",
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
    structureConstraints: { requiredProperties: ["交付物清单", "缺陷处理", "测试总结"] },
  },
  qualityPolicy: {
    requiredSections: ["交付物清单", "缺陷处理", "测试总结"],
    minOutputLength: 500,
    requireCitations: false,
    allowAutoRetry: true,
    maxRetryCount: 1,
    requireHumanReview: true,
    forbiddenPhrases: ["保证验收一次通过", "无需任何测试"],
    disclaimerPolicy: {
      required: true,
      template:
        "【AI 生成草案】以下结项报告由模型辅助生成，请人工核对缺陷统计与签字栏后再提交归档。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 120,
    ruleDescription: "按组件声明的估算 Token（与目录 estimatedModelTokens 一致）预估扣点，未开启真实结算。",
  },
  unsupportedRequirements: [
    {
      requirement: "PDF 精美排版与一键导出 PDF 报告（像素级版式/页眉页脚/签章图像）",
      reason: "当前组件成果物仅支持 DOCUMENT（Markdown 结项报告），不具备 PDF 渲染/排版引擎，无法输出 PDF 文件。",
      suggestedAlternative:
        "提供结构完整的 Markdown 结项报告（含交付物清单/缺陷单/测试总结/验收签字栏段落），由用户用 Pandoc / typst / Word 导出 PDF，不伪造成 PDF。",
    },
  ],
});

// ---------------------------------------------------------------------------
// 逐组件业务分析（批次 E3 要求的全部字段）
// ---------------------------------------------------------------------------
const TEXT_INPUT_METHOD = "纯文本粘贴（目录 inputMode=text）";
const BOTH_INPUT_METHOD_C36 =
  "文本粘贴或上传源码文件（目录 inputMode=both；accept=.ts,.js,.py,.java,.go,.txt；MIME 含 text/plain 与源码扩展名）";
const BOTH_INPUT_METHOD_C45 =
  "文本粘贴或上传结项材料文件（目录 inputMode=both；accept=.md,.txt,.doc,.docx,.pdf,.xlsx；MIME 含 text/plain,application/pdf）";
const FILE_INPUT_METHOD_C37 = "上传前端模板文件（目录 inputMode=file；accept=.html,.htm,.js,.css,.ts,.tsx）";
const FILE_INPUT_METHOD_C38 = "上传依赖清单文件（目录 inputMode=file；accept=.json,.xml,.toml,.txt,.md）";

const ELIGIBLE_NOTE =
  "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，本组件所需能力被完整覆盖。";

export const BATCH_E3_ANALYSIS: Record<
  "C32" | "C33" | "C34" | "C35" | "C36" | "C37" | "C38" | "C39" | "C40" | "C41" | "C42" | "C43" | "C44" | "C45",
  BatchE3ContractAnalysis
> = {
  C32: {
    componentId: "C32",
    businessPurpose:
      "自动将应用盒子部署到集群，并根据瞬间流量大小自动动态增减服务器数量（目录真实描述：部署到集群 + 瞬时流量自动扩容缩容）。",
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
    artifactStructure: "Markdown 文档：部署清单（Deployment YAML）/ 自动伸缩（HPA YAML）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 200,
    realDataBaseline: "需要副本数/资源限制来自用户输入；CI 平台若未声明必须显式标注「待确认」。",
    capabilitySupport: ELIGIBLE_NOTE,
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "产物是 K8s YAML 配置文本 → 仅声明 TEXT_GENERATION；要求 requireHumanReview=true。",
  },
  C33: {
    componentId: "C33",
    businessPurpose:
      "配置 CI/CD 自动上线，代码一提交自动走测试、构建并发布上网（目录真实描述：CI/CD 自动上线流水线）。",
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
    artifactStructure: "Markdown 文档：流水线配置（CI YAML）/ 阶段说明（表）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 100,
    realDataBaseline: "需要仓库类型与发布环境来自用户输入；CI 平台若未声明必须显式标注「待确认」。",
    capabilitySupport: ELIGIBLE_NOTE,
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "产物是 CI/CD YAML 文本 → 仅声明 TEXT_GENERATION；要求 requireHumanReview=true。",
  },
  C34: {
    componentId: "C34",
    businessPurpose:
      "实时监控服务器健康状态，内存不足或当机时自动发送微信/邮件告警（目录真实描述：监控 + 告警）。",
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
    artifactStructure: "Markdown 文档：监控指标（Prometheus YAML）/ 告警规则（Alertmanager YAML）+ Grafana Dashboard JSON",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 250,
    realDataBaseline: "需要指标阈值与接收渠道来自用户输入；通知渠道若未声明必须显式标注「待确认」。",
    capabilitySupport: ELIGIBLE_NOTE,
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: ["Grafana 监控看板可视化图表渲染（仪表盘/折线/柱状）"],
    notes: "含图形化阻断项：看板可视化不支持，给出 Grafana Dashboard JSON 等价方案；产物为 YAML 配置文本 → 仅声明 TEXT_GENERATION。",
  },
  C35: {
    componentId: "C35",
    businessPurpose:
      "汇聚分散在各服务器的运行日志，提供可视化大盘以便极速搜索查错（目录真实描述：日志大盘 + 检索）。",
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
    artifactStructure: "Markdown 文档：采集配置（Filebeat/Vector YAML）/ 检索示例（ES DSL + 看板 JSON）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 200,
    realDataBaseline: "需要采集方式与日志路径来自用户输入；检索图形由用户在 Kibana/Grafana 渲染。",
    capabilitySupport: ELIGIBLE_NOTE,
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: ["日志可视化大盘图表（实时检索控制台看板图形）"],
    notes: "含图形化阻断项：看板图表不支持，给出采集脚本 + 检索 DSL 等价方案；产物为配置文本 → 仅声明 TEXT_GENERATION。",
  },
  C36: {
    componentId: "C36",
    businessPurpose:
      "自动筛查代码中的数据库操作缺陷，堵死黑客通过注入参数修改数据的死角（目录真实描述：防 SQL 注入扫描）。",
    inputMethod: BOTH_INPUT_METHOD_C36,
    textRequirement: "可选（与文件二选一，任一非空即可）；最短 20 字符，最长 20000 字符",
    fileRequirement: "可选；单文件（maxCount=1），≤ 2MB；accept=.ts,.js,.py,.java,.go,.txt（MIME: text/plain 与源码扩展名）",
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
    estimatedTokens: 80,
    realDataBaseline: "需要源码/查询代码作为唯一材料；无法判定项显式标注「待确认」。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，二者均具备。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "结构化扫描结果 → JSON（schemaDefinition 校验 summary/issues）；要求 STRUCTURED_OUTPUT。",
  },
  C37: {
    componentId: "C37",
    businessPurpose:
      "自动扫描网页脚本，防止黑客恶意弹窗、强植小广告或窃取 Cookie（目录真实描述：防木马/广告植入 + CSP）。",
    inputMethod: FILE_INPUT_METHOD_C37,
    textRequirement: "不适用（纯文件模式）",
    fileRequirement: "必填；单文件（maxCount=1），≤ 2MB；accept=.html,.htm,.js,.css,.ts,.tsx（MIME: text/html,text/plain）",
    singleFileSupported: true,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: true,
    requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
    outputKind: "JSON",
    rendererType: "JSON_VIEWER",
    artifactStructure: "合法 JSON：{ summary, findings:[{location,risk,description,suggestion}], cspPolicy }",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出非合法 JSON 或结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 80,
    realDataBaseline: "需要前端模板/脚本文件作为唯一材料；CSP 规则以字符串交付。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，二者均具备。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "结构化扫描结果 → JSON（含 cspPolicy 字符串）；要求 STRUCTURED_OUTPUT；输入为 FILE（前端模板）。",
  },
  C38: {
    componentId: "C38",
    businessPurpose:
      "一键扫描项目引入的三方开源库，自动匹配漏洞库并指出危险需要升级的版本（目录真实描述：三方包 CVE 漏洞检测）。",
    inputMethod: FILE_INPUT_METHOD_C38,
    textRequirement: "不适用（纯文件模式）",
    fileRequirement: "必填；单文件（maxCount=1），≤ 2MB；accept=.json,.xml,.toml,.txt,.md（MIME: application/json,text/plain）",
    singleFileSupported: true,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: true,
    requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
    outputKind: "JSON",
    rendererType: "JSON_VIEWER",
    artifactStructure: "合法 JSON：{ summary, vulnerabilities:[{package,installedVersion,severity,cve,fixedVersion,recommendation}] }",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出非合法 JSON 或结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 150,
    realDataBaseline: "需要依赖清单文件（package.json/pom.xml/requirements.txt）作为唯一材料。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，二者均具备。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "结构化漏洞清单 → JSON（含 CVE 编号）；要求 STRUCTURED_OUTPUT；输入为 FILE（依赖清单）。",
  },
  C39: {
    componentId: "C39",
    businessPurpose:
      "对照国家安全合规硬性清单，自动核对系统架构并给出整改报告，避免违规整顿（目录真实描述：等保2.0 合规自查）。",
    inputMethod: TEXT_INPUT_METHOD,
    textRequirement: "必填；最短 20 字符，最长 20000 字符",
    fileRequirement: "不适用（纯文本模式）",
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: true,
    requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
    outputKind: "JSON",
    rendererType: "JSON_VIEWER",
    artifactStructure: "合法 JSON：{ summary, items:[{item,requirement,result,evidence,remediation}] }",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出非合法 JSON 或结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 300,
    realDataBaseline: "需要等保级别与系统架构来自用户输入；以官方测评结论为准。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，二者均具备。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "结构化自查清单 → JSON（含 PASS/FAIL/NEED_IMPROVE）；要求 STRUCTURED_OUTPUT。",
  },
  C40: {
    componentId: "C40",
    businessPurpose:
      "对姓名、手机号、身份证、银行卡等敏感数据自动用星号打码或不可逆脱敏（目录真实描述：智能打码脱敏）。",
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
    artifactStructure: "Markdown 文档：脱敏规则（表）/ 转换逻辑（代码块）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 120,
    realDataBaseline: "需要打码规则来自用户输入；示例必须用已打码形式，禁止输出真实敏感号码。",
    capabilitySupport: ELIGIBLE_NOTE,
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "声明 privacyPolicy（脱敏意图：requirePrivacyNotes + phoneMaskPattern + forbiddenUnmasked）；产物为脱敏代码文本 → DOCUMENT，运行期不在结构化隐私校验路径，避免误拒。",
  },
  C41: {
    componentId: "C41",
    businessPurpose:
      "将项目目标逐步分解为具体工作包和天数，生成结构化树形排期任务表（目录真实描述：WBS 任务分解）。",
    inputMethod: TEXT_INPUT_METHOD,
    textRequirement: "必填；最短 20 字符，最长 20000 字符",
    fileRequirement: "不适用（纯文本模式）",
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: true,
    requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
    outputKind: "JSON",
    rendererType: "JSON_VIEWER",
    artifactStructure: "合法 JSON：{ summary, tasks:[{id,name,phase,parentId,estimatedDays,milestone}] }",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出非合法 JSON 或结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 80,
    realDataBaseline: "需要项目愿景与交付物列表来自用户输入；工期为估算需人工复核。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，二者均具备。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "结构化任务树 → JSON（含 parentId 层级）；要求 STRUCTURED_OUTPUT。",
  },
  C42: {
    componentId: "C42",
    businessPurpose:
      "根据任务前后依赖关系，自动生成直观的任务进度横向对比甘特图（目录真实描述：甘特图排期）。",
    inputMethod: TEXT_INPUT_METHOD,
    textRequirement: "必填；最短 20 字符，最长 20000 字符",
    fileRequirement: "不适用（纯文本模式）",
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: true,
    requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
    outputKind: "JSON",
    rendererType: "JSON_VIEWER",
    artifactStructure: "合法 JSON：{ note, tasks:[{task,startDate,endDate,durationDays,dependencies,criticalPath}] }",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出非合法 JSON 或结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 100,
    realDataBaseline: "需要任务清单与依赖来自用户输入；图形由用户在 Project/LibreOffice 渲染。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，二者均具备。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: ["甘特图横向可视化图形渲染（任务条/依赖箭线/关键路径高亮）"],
    notes: "含图形化阻断项：甘特图不支持，给出排期 JSON + Markdown 排期表等价方案；结构化排期 → JSON。",
  },
  C43: {
    componentId: "C43",
    businessPurpose:
      "智能预判项目在工期、人员、技术上可能犯的十几种错误，提前开出防范药方（目录真实描述：风险防范预案）。",
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
    artifactStructure: "Markdown 文档：风险清单（表）/ 防范预案（章节）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 120,
    realDataBaseline: "需要团队规模/项目性质/期限来自用户输入；信息不足须标注「待确认」。",
    capabilitySupport: ELIGIBLE_NOTE,
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "产物是风险防范文档文本 → 仅声明 TEXT_GENERATION；要求 requireHumanReview=true。",
  },
  C44: {
    componentId: "C44",
    businessPurpose:
      "优化人员排工分配，避免部分人过度加班、部分人长期闲置的浪费（目录真实描述：排班与闲置优化）。",
    inputMethod: TEXT_INPUT_METHOD,
    textRequirement: "必填；最短 20 字符，最长 20000 字符",
    fileRequirement: "不适用（纯文本模式）",
    singleFileSupported: false,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: true,
    requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT"],
    outputKind: "JSON",
    rendererType: "JSON_VIEWER",
    artifactStructure: "合法 JSON：{ summary, assignments:[{role,member,allocatedHours,task,utilization}] }",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出非合法 JSON 或结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 150,
    realDataBaseline: "需要角色工时与任务来自用户输入；成员实际可用工时须人工复核。",
    capabilitySupport: "支持：平台默认部署实测能力为 TEXT_GENERATION + STRUCTURED_OUTPUT，二者均具备。",
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: [],
    notes: "结构化排班 → JSON（含 utilization 0-1）；要求 STRUCTURED_OUTPUT。",
  },
  C45: {
    componentId: "C45",
    businessPurpose:
      "自动整理并输出交付物清单、缺陷单和测试总结，生成一键结项交付文档（目录真实描述：结项报告）。",
    inputMethod: BOTH_INPUT_METHOD_C45,
    textRequirement: "可选（与文件二选一，任一非空即可）；最短 20 字符，最长 20000 字符",
    fileRequirement: "可选；单文件（maxCount=1），≤ 2MB；accept=.md,.txt,.doc,.docx,.pdf,.xlsx（MIME: text/plain,application/pdf）",
    singleFileSupported: true,
    multiFileSupported: false,
    imageSupported: false,
    ocrRequirement: "NOT_REQUIRED",
    structuredOutputRequired: false,
    requiredCapabilities: ["TEXT_GENERATION"],
    outputKind: "DOCUMENT",
    rendererType: "MARKDOWN_DOCUMENT",
    artifactStructure: "Markdown 文档：交付物清单（表）/ 缺陷处理（表）/ 测试总结（章节）",
    failureHandling: "REFUND_ON_FAILURE：模型失败/超时/输出结构不合规均由路由原路退款，不产生错误扣费",
    estimatedTokens: 120,
    realDataBaseline: "需要交付版本/测试大纲/缺陷统计来自用户输入或文件；PDF 由用户导出。",
    capabilitySupport: ELIGIBLE_NOTE,
    contractVersion: CONTRACT_VERSION,
    publishStatus: "DRAFT",
    activationStatus: "ELIGIBLE",
    missingMaterials: [],
    unsupportedRequirements: ["PDF 精美排版与一键导出 PDF 报告（像素级版式/签章图像）"],
    notes: "含图形化阻断项：PDF 渲染不支持，给出 Markdown 结项报告等价方案；产物为 Markdown 文本 → 仅声明 TEXT_GENERATION。",
  },
};

export const BATCH_E3 = [
  { componentId: "C32", contract: C32_CONTRACT, analysis: BATCH_E3_ANALYSIS.C32 },
  { componentId: "C33", contract: C33_CONTRACT, analysis: BATCH_E3_ANALYSIS.C33 },
  { componentId: "C34", contract: C34_CONTRACT, analysis: BATCH_E3_ANALYSIS.C34 },
  { componentId: "C35", contract: C35_CONTRACT, analysis: BATCH_E3_ANALYSIS.C35 },
  { componentId: "C36", contract: C36_CONTRACT, analysis: BATCH_E3_ANALYSIS.C36 },
  { componentId: "C37", contract: C37_CONTRACT, analysis: BATCH_E3_ANALYSIS.C37 },
  { componentId: "C38", contract: C38_CONTRACT, analysis: BATCH_E3_ANALYSIS.C38 },
  { componentId: "C39", contract: C39_CONTRACT, analysis: BATCH_E3_ANALYSIS.C39 },
  { componentId: "C40", contract: C40_CONTRACT, analysis: BATCH_E3_ANALYSIS.C40 },
  { componentId: "C41", contract: C41_CONTRACT, analysis: BATCH_E3_ANALYSIS.C41 },
  { componentId: "C42", contract: C42_CONTRACT, analysis: BATCH_E3_ANALYSIS.C42 },
  { componentId: "C43", contract: C43_CONTRACT, analysis: BATCH_E3_ANALYSIS.C43 },
  { componentId: "C44", contract: C44_CONTRACT, analysis: BATCH_E3_ANALYSIS.C44 },
  { componentId: "C45", contract: C45_CONTRACT, analysis: BATCH_E3_ANALYSIS.C45 },
] as const;

export const BATCH_E3_CONTRACTS: ComponentContract[] = BATCH_E3.map((b) => b.contract);

/** 批次 E3 目标组件 ID（仅 C32-C45，不覆盖任何现有组件、不越界 C46+） */
export const BATCH_E3_COMPONENT_IDS = [
  "C32", "C33", "C34", "C35", "C36", "C37", "C38", "C39", "C40", "C41", "C42", "C43", "C44", "C45",
] as const;

/** 批次 E3 明确禁止触碰的组件 ID（冻结快照 + 暂停范围，沿用基线） */
export const BATCH_E3_FORBIDDEN_IDS = ["C07", "C09"] as const;
