/**
 * C12 / C18 @ 1.1.0 发布候选（破阻断：Mermaid 文本等价方案）
 *
 * 背景：
 *  - C12「接口数据关联设计」与 C18「数据表结构与关系图设计」目录承诺包含图形化的
 *    ER 图 / 关联拓扑图，但当前执行引擎仅支持 DOCUMENT / TABLE / JSON，无图形渲染器，
 *    因此 1.0.0 只能停留在 DRAFT（阻断态，activeContractId = null）。
 *  - 负责人授权采用 **Mermaid 文本等价方案**：以 Mermaid erDiagram 文本块 + Markdown
 *    关联拓扑表表达图形语义，既不伪支持图形输出，又能交付可用的关联设计产物。
 *
 * 关键设计（保证通过 DOCUMENT 门禁）：
 *  - qualityPolicy.requiredSections 是对输出正文做**子串匹配**（区分大小写，支持 | 多选一），
 *    因此 promptTemplate **逐字引导**模型输出含指定关键词的章节标题：
 *      C12 → "DDL" / "Mermaid" / "关联"
 *      C18 → "实体" / "Mermaid" / "关系"
 *  - 输出类型仍为 DOCUMENT（text/markdown），绝不声明图形/文件型输出。
 *
 * 安全约束：不修改 1.0.0；不改动历史任务 contractSnapshot；不直接写 SQL；
 *           不触碰封板组件 C01/C02/C07 与共享层。
 */
import type { ComponentContract } from "../src/lib/component-contract/types";
import { C12_CONTRACT } from "../src/lib/component-contract/catalog-contracts-c12-c15";
import { C18_CONTRACT } from "../src/lib/component-contract/catalog-contracts-c16-c19";

/** 统一的不支持项说明（负责人授权的 Mermaid 文本等价方案） */
const MERMAID_UNSUPPORTED_REASON = "图形化渲染器缺失，已采用 Mermaid 文本等价方案（负责人授权）";

// ---------------------------------------------------------------------------
// C12 @ 1.1.0：接口数据关联设计（表关系 ➜ DDL + Mermaid erDiagram + 关联拓扑表）
// ---------------------------------------------------------------------------
const C12_PROMPT_1_1_0 =
  "你是资深后端数据建模专家。请基于输入材料中口语描述的实体与业务关系，输出《接口数据关联设计方案》。\n" +
  "必须严格包含以下三个章节，且**章节标题必须逐字包含**指定的关键词（系统会按关键词校验，不得改写或翻译）：\n" +
  "1. 章节标题必须包含「DDL」二字（例如「## DDL 建表语句」）：用 ```sql 代码块给出完整的建表语句，" +
  "包含 CREATE TABLE、必要的 ALTER TABLE 与 CREATE INDEX（主键、外键、唯一约束与常用索引）。\n" +
  "2. 章节标题必须包含「Mermaid」二字（例如「## Mermaid ER 图」）：内容必须是一个 ```mermaid 代码块，" +
  "使用 erDiagram 语法表达实体与关系，关系行形如：ENTITY_A ||--o{ ENTITY_B : \"关系名\"。\n" +
  "3. 章节标题必须包含「关联」二字（例如「## 关联拓扑表」）：内容必须是一个 Markdown 表格，" +
  "列固定为「表A | 关系 | 表B | 外键字段」，逐条列出表之间的关联、基数与外键落地方向。\n" +
  "硬性要求：输入未声明的字段必须显式标注为「待确认」，不得凭空扩展业务字段；" +
  "多对多关系必须显式给出中间表设计；涉及金额、时间等字段必须明确类型与精度；" +
  "若输入存在自相矛盾的关系描述，必须在末尾列出矛盾点而不是自行选择其中一种解释。\n" +
  "注意：本组件不输出图形化渲染的 ER 图（图形渲染器当前缺失，已获负责人授权采用 Mermaid 文本等价方案），" +
  "严禁声称「已生成/已绘制图形化 ER 图」，图形语义一律以 Mermaid 文本块与 Markdown 表格表达。";

export const C12_CANDIDATE_1_1_0: ComponentContract = {
  ...C12_CONTRACT,
  contractVersion: "1.1.0",
  lifecycle: "DRAFT",
  publishedAt: null,
  publishedBy: null,
  executionPlan: {
    steps: [
      {
        ...C12_CONTRACT.executionPlan.steps[0],
        promptTemplateVersion: "1.1.0",
        promptTemplate: C12_PROMPT_1_1_0,
        outputKey: "relation_design_package",
      },
    ],
  },
  output: {
    ...C12_CONTRACT.output,
    kind: "DOCUMENT",
    artifactMime: "text/markdown",
    rendererType: "MARKDOWN_DOCUMENT",
    structureConstraints: {
      requiredProperties: ["ddl", "mermaid", "relations"],
    },
  },
  qualityPolicy: {
    ...C12_CONTRACT.qualityPolicy,
    requiredSections: ["DDL", "Mermaid", "关联"],
  },
  unsupportedRequirements: [
    {
      requirement: "图形化 ER 图 / 关联拓扑图渲染（图形类输出）",
      reason: MERMAID_UNSUPPORTED_REASON,
      suggestedAlternative:
        "以 Mermaid erDiagram 文本块 + Markdown 关联拓扑表等价表达（本版本已实现，替代图形渲染）",
    },
  ],
};

// ---------------------------------------------------------------------------
// C18 @ 1.1.0：数据表结构与关系图设计（实体意图 ➜ 实体清单 + Mermaid + 关系表）
// ---------------------------------------------------------------------------
const C18_PROMPT_1_1_0 =
  "你是资深数据库架构师。请基于输入材料描述的实体与字段意图，输出《数据表结构与关系设计方案》。\n" +
  "必须严格包含以下三个章节，且**章节标题必须逐字包含**指定的关键词（系统会按关键词校验，不得改写或翻译）：\n" +
  "1. 章节标题必须包含「实体」二字（例如「## 实体与字段清单」）：以 Markdown 表格输出，" +
  "列固定为「表名 | 字段 | 类型 | 约束 | 说明」。\n" +
  "2. 章节标题必须包含「Mermaid」二字（例如「## Mermaid ER 图」）：内容必须是一个 ```mermaid 代码块，" +
  "使用 erDiagram 语法表达实体与关系，关系行形如：ENTITY_A ||--o{ ENTITY_B : \"关系名\"。\n" +
  "3. 章节标题必须包含「关系」二字（例如「## 关系说明」）：以 Markdown 表格逐条写出实体间的" +
  "一对一 / 一对多 / 多对多关系、外键落地方向与级联策略。\n" +
  "硬性要求：输入未声明的字段必须显式标注为「待确认」，不得凭空扩展业务字段；" +
  "多对多关系必须显式给出中间表设计；涉及金额、时间等字段必须明确类型与精度；" +
  "若输入存在自相矛盾的关系描述，必须在末尾列出矛盾点而不是自行选择其中一种解释。\n" +
  "注意：本组件不输出图形化渲染的 ER 实体图（图形渲染器当前缺失，已获负责人授权采用 Mermaid 文本等价方案），" +
  "严禁声称「已生成/已绘制图形化 ER 图」，图形语义一律以 Mermaid 文本块与 Markdown 表格表达。";

export const C18_CANDIDATE_1_1_0: ComponentContract = {
  ...C18_CONTRACT,
  contractVersion: "1.1.0",
  lifecycle: "DRAFT",
  publishedAt: null,
  publishedBy: null,
  executionPlan: {
    steps: [
      {
        ...C18_CONTRACT.executionPlan.steps[0],
        promptTemplateVersion: "1.1.0",
        promptTemplate: C18_PROMPT_1_1_0,
        outputKey: "schema_design_package",
      },
    ],
  },
  output: {
    ...C18_CONTRACT.output,
    kind: "DOCUMENT",
    artifactMime: "text/markdown",
    rendererType: "MARKDOWN_DOCUMENT",
    structureConstraints: {
      requiredProperties: ["entities", "mermaid", "relations"],
    },
  },
  qualityPolicy: {
    ...C18_CONTRACT.qualityPolicy,
    requiredSections: ["实体", "Mermaid", "关系"],
  },
  unsupportedRequirements: [
    {
      requirement: "ER 实体关系图（图形化输出）",
      reason: MERMAID_UNSUPPORTED_REASON,
      suggestedAlternative:
        "以 Mermaid erDiagram 文本块 + Markdown 关系表等价表达（本版本已实现，替代图形渲染）",
    },
  ],
};

// ---------------------------------------------------------------------------
// C12 @ 1.1.1：抑制思维链（CoT）泄漏，确保 Mermaid 章节真实产出
//
// 背景（1.1.0 实测缺陷）：真实模型会先输出大量「思考过程 / 需求复述 / 英文草稿」，
// 在输出额度被耗尽后才进入正文章节，导致 «```mermaid 代码块被整体截断，
// 而 requiredSections 的**子串校验**又恰好被开头复述里的关键词命中 → 门禁假阳性。
// 故 1.1.1 在保留相同章节要求与 requiredSections 的前提下，追加「输出纪律」约束：
// 禁止任何思考过程与需求复述，直接输出最终交付文档，从源头释放被 CoT 挤占的额度。
// ---------------------------------------------------------------------------
const C12_PROMPT_1_1_1 =
  "你是资深后端数据建模专家。请基于输入材料中口语描述的实体与业务关系，输出《接口数据关联设计方案》。\n" +
  "【输出纪律（最高优先级，违反即视为不合格）】严禁输出任何思考过程、分析过程、需求复述、自言自语或英文草稿；" +
  "严禁出现「我需要」「让我分析」「让我们」「The user wants」「Let me」等字样；" +
  "严禁在正文前写任何前言、说明或解题思路。必须直接输出最终交付文档，全文使用中文，并力求精简：" +
  "表格与语句压缩到必要的最小篇幅，不写冗余解释，不重复罗列同一信息。\n" +
  "正文必须严格包含以下三个章节，且**章节标题必须逐字包含**指定关键词（系统会按关键词校验，不得改写或翻译）：\n" +
  "1. 标题包含「DDL」二字（例如「## DDL 建表语句」）：用 ```sql 代码块给出建表语句，" +
  "包含 CREATE TABLE、必要的 ALTER TABLE 与 CREATE INDEX（主键、外键、唯一约束、常用索引），语句精简不写注释堆砌。\n" +
  "2. 标题包含「Mermaid」二字（例如「## Mermaid ER 图」）：必须给出 ```mermaid 代码块，" +
  "使用 erDiagram 语法，关系行形如：ENTITY_A ||--o{ ENTITY_B : \"关系名\"。\n" +
  "3. 标题包含「关联」二字（例如「## 关联拓扑表」）：必须是 Markdown 表格，" +
  "列固定为「表A | 关系 | 表B | 外键字段」，逐条列出表间关联与基数。\n" +
  "硬性要求：输入未声明的字段须标注「待确认」，不得凭空扩展业务字段；" +
  "多对多关系必须显式给出中间表设计；金额、时间等字段须明确类型与精度；" +
  "若输入存在自相矛盾的关系描述，在末尾列出矛盾点而非自行选择其中一种解释。\n" +
  "注意：本组件不输出图形化渲染的 ER 图（图形渲染器缺失，已获负责人授权采用 Mermaid 文本等价方案），" +
  "严禁声称「已生成/已绘制图形化 ER 图」，图形语义一律以 Mermaid 文本块与 Markdown 表格表达。";

export const C12_CANDIDATE_1_1_1: ComponentContract = {
  ...C12_CANDIDATE_1_1_0,
  contractVersion: "1.1.1",
  lifecycle: "DRAFT",
  publishedAt: null,
  publishedBy: null,
  executionPlan: {
    steps: [
      {
        ...C12_CANDIDATE_1_1_0.executionPlan.steps[0],
        promptTemplateVersion: "1.1.1",
        promptTemplate: C12_PROMPT_1_1_1,
      },
    ],
  },
};
