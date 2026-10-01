/**
 * 真实组件能力盘点脚本与纯分析流水线 (确定性与证据驱动架构)
 *
 * 核心规范：
 * 1. 纯函数解耦：数据读取、静态分析、报告渲染完全分离，便于单元测试；
 * 2. 确定性保障：输出不依赖系统易变时间戳，仅接受显式 --generated-at 或使用固定基准标记，同一输入逐字节一致；
 * 3. 严格类型安全：数据库所有 JSON 字段按 unknown + 类型守卫解析，零宽泛类型逃逸；
 * 4. 消除硬编码特判：删除特定组件 ID 硬编码特判，通过源码证据扫描动态发现组件特判与执行链；
 * 5. 证据三态标记：每项清晰标注 OBSERVED / INFERRED / UNKNOWN，记录可验证文件与符号，禁止死行号；
 * 6. 严禁写操作：只读数据库，安全脱敏。
 */

import fs from "fs";
import path from "path";
import { loadCliEnv } from "./cli-env";

/** 观测置信度三态标记 */
export type EvidenceStatus = "OBSERVED" | "INFERRED" | "UNKNOWN";

/** 建议与观测原型枚举 */
export type ComponentPrototype =
  | "TEXT_ONLY"
  | "SINGLE_FILE"
  | "MULTI_FILE"
  | "TEXT_AND_FILES"
  | "STRUCTURED_FORM"
  | "UPSTREAM_ARTIFACT"
  | "MULTI_STEP_ANALYSIS"
  | "TABLE_OR_SCORE_OUTPUT"
  | "DOCUMENT_PACKAGE_OUTPUT"
  | "UNKNOWN";

/** 数据库原始组件行抽象接口（不依赖 Prisma 运行时） */
export interface RawCatalogComponent {
  id: string;
  name: string;
  category: string | null;
  inputMode: string | null;
  accept: string | null;
  contract: string | null;
  previewData: unknown;
  detail: unknown;
  isPublished: boolean;
  estimatedModelTokens: number | null;
  /** 激活合同外键（新合同路径唯一真源：component_contract）；旧 fixture 可缺省 */
  activeContractId?: string | null;
}

/** 组件激活合同摘要（新合同路径：component_contract + active_contract_id） */
export interface ActiveContractInfo {
  id: string;
  componentId: string;
  contractVersion: string;
  lifecycle: string;
  contract: unknown;
}

/** 源码静态扫描提取的证据 */
export interface SourceCodeEvidence {
  specialCaseComponentIds: Set<string>;
  specialCaseLocations: Map<string, string>;
  realExecutionComponentIds: Set<string>;
  realExecutionLocations: Map<string, string>;
  knownFileParsers: Map<string, string>;
}

/** 单个组件审计项 */
export interface ComponentCapabilityItem {
  componentId: string;
  codeSlug: string;
  name: string;
  enabled: boolean;

  // 1. 输入能力与原型
  observedInputPrototype: ComponentPrototype;
  recommendedPrototype: ComponentPrototype;
  inputStatus: EvidenceStatus;
  inputEvidence: string;

  // 2. 执行链
  hasRealExecutionChain: boolean;
  executionChainStatus: EvidenceStatus;
  executionChainEvidence: string;

  // 3. 文件解析器
  fileParser: string;
  fileParserStatus: EvidenceStatus;
  fileParserEvidence: string;

  // 4. Prompt 路径与版本
  promptSource: string;
  isPromptVersioned: boolean;
  promptStatus: EvidenceStatus;
  promptEvidence: string;

  // 5. 组件特判
  hasSpecialCase: boolean;
  specialCaseStatus: EvidenceStatus;
  specialCaseEvidence: string;

  // 6. 综合能力缺口
  missingCapabilities: string[];
}

/** 全量审计汇总数据结构 */
export interface CapabilityAuditSummary {
  benchmarkTimestamp: string;
  totalComponents: number;
  enabledCount: number;
  disabledCount: number;
  observedCount: number;
  inferredCount: number;
  unknownCount: number;
  realExecutionCount: number;
  specialCaseCount: number;
  prototypeDistribution: Record<string, number>;
  items: ComponentCapabilityItem[];
}

// ==========================================
// 纯类型守卫助手函数 (Strict Type Guards)
// ==========================================

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function getSafeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

// ==========================================
// 源码证据扫描纯函数
// ==========================================

/**
 * 从源码内容中提取特定组件 ID 的特判与执行证据（不写死行号，记录符号特征）
 */
export function scanSourceCodeEvidence(sourceFiles: Map<string, string>): SourceCodeEvidence {
  const specialCaseComponentIds = new Set<string>();
  const specialCaseLocations = new Map<string, string>();
  const realExecutionComponentIds = new Set<string>();
  const realExecutionLocations = new Map<string, string>();
  const knownFileParsers = new Map<string, string>();
  const declaredPilotIds = new Set<string>();

  for (const [filePath, content] of sourceFiles.entries()) {
    // 1. 扫描 PILOT_COMPONENT_ID 声明（例如 export const PILOT_COMPONENT_ID = process.env.PILOT_COMPONENT_ID?.trim() || "PILOT_ID";）
    const pilotMatches = content.matchAll(
      /PILOT_COMPONENT_ID\s*=\s*(?:process\.env\.[A-Za-z0-9_]+(?:\?\.trim\(\))?\s*\|\|\s*)?["']([A-Za-z0-9_-]+)["']/g
    );
    for (const pm of pilotMatches) {
      const pilotId = pm[1];
      if (pilotId && pilotId.trim().length > 0) {
        declaredPilotIds.add(pilotId.trim());
        specialCaseComponentIds.add(pilotId.trim());
        specialCaseLocations.set(pilotId.trim(), `${filePath} [符号声明: PILOT_COMPONENT_ID 绑定组件 "${pilotId.trim()}"]`);
      }
    }

    // 2. 扫描 comp.id === "xxx" 或 componentId === "xxx" 等具体组件 ID 判定分支
    const compIdMatches = content.matchAll(/(?:comp(?:onent)?\.id|componentId)\s*===\s*["']([A-Za-z0-9_-]+)["']/g);
    for (const m of compIdMatches) {
      const cid = m[1];
      if (cid && cid.trim().length > 0) {
        specialCaseComponentIds.add(cid);
        specialCaseLocations.set(cid, `${filePath} [条件分支: comp.id === "${cid}"]`);
      }
    }

    // 3. 扫描显式将组件 ID 与真实模型执行链绑定的源码证据
    // 模式 A：代码中直接判定 if (comp.id === "XXX") 进入真实模型执行链
    const explicitRealMatches = content.matchAll(
      /(?:comp(?:onent)?\.id|componentId)\s*===\s*["']([A-Za-z0-9_-]+)["'][\s\S]{1,300}?(?:createModelAdapter|resolveModelExecutionPlan|REAL_MODEL)/g
    );
    for (const em of explicitRealMatches) {
      const cid = em[1];
      if (cid && cid.trim().length > 0) {
        realExecutionComponentIds.add(cid);
        realExecutionLocations.set(cid, `${filePath} [源码执行链: 条件分支 "${cid}" -> 真实模型调用]`);
      }
    }

    // 4. 扫描文件解析函数定义
    if (content.includes("extractTextFromBufferWithTimeout")) {
      knownFileParsers.set(
        "TEXT_AND_FILE_EXTRACTOR",
        `${filePath} [符号: extractTextFromBufferWithTimeout (OCR / PDF / DOCX 可取消解析入口)]`
      );
    }
  }

  // 模式 B：通过动态提取的 PILOT_COMPONENT_ID 跨文件绑定的分支进入真实模型调用链
  if (declaredPilotIds.size > 0) {
    for (const [filePath, content] of sourceFiles.entries()) {
      if (content.includes("PILOT_COMPONENT_ID") && (content.includes("createModelAdapter") || content.includes("resolveModelExecutionPlan"))) {
        for (const dynamicPilotId of declaredPilotIds) {
          realExecutionComponentIds.add(dynamicPilotId);
          realExecutionLocations.set(dynamicPilotId, `${filePath} [执行链路: PILOT_COMPONENT_ID ("${dynamicPilotId}") -> 真实模型流水线]`);
        }
      }
    }
  }

  return {
    specialCaseComponentIds,
    specialCaseLocations,
    realExecutionComponentIds,
    realExecutionLocations,
    knownFileParsers,
  };
}

// ==========================================
// 组件能力分析纯函数
// ==========================================

export function deduceObservedInputPrototype(inputModeRaw: string | null, acceptRaw: string | null): ComponentPrototype {
  const mode = (inputModeRaw || "").toLowerCase().trim();
  const accept = (acceptRaw || "").toLowerCase().trim();

  if (mode === "both") return "TEXT_AND_FILES";
  if (mode === "file") {
    if (accept.includes("zip") || accept.includes("tar") || accept.includes("多文件")) {
      return "MULTI_FILE";
    }
    return "SINGLE_FILE";
  }
  if (mode === "text") return "TEXT_ONLY";
  return "UNKNOWN";
}

export function deduceRecommendedPrototype(
  observedInput: ComponentPrototype,
  contractText: string | null,
  hasMultiSteps: boolean
): ComponentPrototype {
  if (hasMultiSteps) return "MULTI_STEP_ANALYSIS";
  if (contractText && /偏离表|对比表|打分|评分/i.test(contractText)) {
    return "TABLE_OR_SCORE_OUTPUT";
  }
  if (contractText && /交付包|材料包/i.test(contractText)) {
    return "DOCUMENT_PACKAGE_OUTPUT";
  }
  if (contractText && /结构化|表单|json/i.test(contractText)) {
    return "STRUCTURED_FORM";
  }
  return observedInput;
}

export function analyzeComponentRecord(
  comp: RawCatalogComponent,
  codeEvidence: SourceCodeEvidence,
  activeContract: ActiveContractInfo | null = null
): ComponentCapabilityItem {
  const missingCapabilities: string[] = [];

  // 1. 新合同证据（唯一真源：component_contract + component_catalog.active_contract_id）
  //    旧字段 detail.executionProfile **不作为执行证据**，仅做遗留检测（只报告、不采信）。
  const legacyExecutionProfilePresent = isRecord(comp.detail) && isRecord(comp.detail.executionProfile);
  const contractObj =
    activeContract && isRecord(activeContract.contract) ? (activeContract.contract as Record<string, unknown>) : null;
  const steps =
    contractObj && isRecord(contractObj.executionPlan) && Array.isArray(contractObj.executionPlan.steps)
      ? (contractObj.executionPlan.steps as Array<Record<string, unknown>>)
      : [];
  const hasActivePublishedContract = activeContract !== null && activeContract.lifecycle === "PUBLISHED";
  // 遗留字段只做提示，绝不作为执行证据
  if (legacyExecutionProfilePresent) {
    missingCapabilities.push("存在遗留字段 component_catalog.detail.executionProfile（旧路径已退出，需清理）");
  }

  // 2. 输入原型推断与状态判定
  const observedInputPrototype = deduceObservedInputPrototype(comp.inputMode, comp.accept);
  const isInputObserved = comp.inputMode !== null && comp.inputMode.trim().length > 0;
  const inputStatus: EvidenceStatus = isInputObserved ? "OBSERVED" : "UNKNOWN";
  const inputEvidence = isInputObserved
    ? `数据库字段 component_catalog.inputMode='${comp.inputMode}', accept='${comp.accept || "null"}'`
    : "缺失证据: component_catalog.inputMode 为空";

  // 3. 执行链判定（基于实际证据，不粗暴等同）
  const hasCodeRealExecution = codeEvidence.realExecutionComponentIds.has(comp.id);
  const hasRealExecutionChain = hasActivePublishedContract && hasCodeRealExecution;

  let executionChainStatus: EvidenceStatus = "UNKNOWN";
  let executionChainEvidence = "";

  if (hasRealExecutionChain) {
    executionChainStatus = "OBSERVED";
    executionChainEvidence = `数据库 component_catalog.active_contract_id 指向 PUBLISHED 合同 (${activeContract!.id}, v${activeContract!.contractVersion}) 且命中生产链路: ${codeEvidence.realExecutionLocations.get(comp.id) || "已连接"}`;
  } else if (hasActivePublishedContract) {
    executionChainStatus = "OBSERVED";
    executionChainEvidence = `数据库 component_catalog.active_contract_id 指向 PUBLISHED 合同 (${activeContract!.id}, v${activeContract!.contractVersion})，但源码中尚未映射专属生产管线`;
  } else if (hasCodeRealExecution) {
    executionChainStatus = "UNKNOWN";
    executionChainEvidence = `源码中显式绑定执行链路 (${codeEvidence.realExecutionLocations.get(comp.id) || "已连接"})，但数据库缺少已激活的 PUBLISHED 合同`;
    missingCapabilities.push("缺少已激活的 PUBLISHED 合同 (active_contract_id 未指向 PUBLISHED 合同)");
  } else {
    // 无激活 PUBLISHED 合同且无源码映射：明确标记 UNKNOWN，不推断为“模拟执行”
    executionChainStatus = "UNKNOWN";
    executionChainEvidence = "缺失证据: 无已激活 PUBLISHED 合同，且未在源码中建立执行链映射，真实性未知";
    missingCapabilities.push("缺少独立执行合同 (无激活 PUBLISHED 合同)");
  }

  // 4. 解析器判定（动态链接源码符号，不使用死行号）
  let fileParser = "N/A (纯文本模式无需解析器)";
  let fileParserStatus: EvidenceStatus = "OBSERVED";
  let fileParserEvidence = "基于纯文本模式判定无需文件抽取";

  if (observedInputPrototype === "SINGLE_FILE" || observedInputPrototype === "MULTI_FILE" || observedInputPrototype === "TEXT_AND_FILES") {
    const parserSym = codeEvidence.knownFileParsers.get("TEXT_AND_FILE_EXTRACTOR");
    if (parserSym) {
      fileParser = "extractTextFromBufferWithTimeout (统一可取消多格式解析入口)";
      fileParserStatus = "OBSERVED";
      fileParserEvidence = `生产代码动态引用符号: ${parserSym}`;
    } else {
      fileParser = "UNKNOWN (源码中未识别到明确的文件解析器调用)";
      fileParserStatus = "UNKNOWN";
      fileParserEvidence = "缺失证据: 源码中未发现对应解析器符号绑定";
    }
  }

  // 5. Prompt 路径与版本
  let promptSource = "UNKNOWN (未配置)";
  let isPromptVersioned = false;
  let promptStatus: EvidenceStatus = "UNKNOWN";
  let promptEvidence = "缺失证据: 激活合同缺少 executionPlan.steps[].promptTemplate";

  const firstPrompt = steps.find(
    (s) => typeof s.promptTemplate === "string" && (s.promptTemplate as string).trim().length > 0,
  );

  if (activeContract && firstPrompt) {
    promptSource = "component_contract.executionPlan.steps[].promptTemplate";
    isPromptVersioned = typeof activeContract.contractVersion === "string" && activeContract.contractVersion.trim().length > 0;
    promptStatus = "OBSERVED";
    promptEvidence = `数据库持久化 Prompt 模板 (contractId='${activeContract.id}', contractVersion='${activeContract.contractVersion}')`;
  } else {
    missingCapabilities.push("Prompt 模板未独立版本化");
  }

  // 6. 组件特判检查（通过动态扫描证据判定，彻底解耦硬编码 ID）
  const hasSpecialCase = codeEvidence.specialCaseComponentIds.has(comp.id);
  const specialCaseStatus: EvidenceStatus = hasSpecialCase ? "OBSERVED" : "INFERRED";
  const specialCaseEvidence = hasSpecialCase
    ? `命中生产源码特判证据: ${codeEvidence.specialCaseLocations.get(comp.id) || "已知特判"}`
    : "推断证据: 未在生产路由与适配层中检测到该组件 ID 的专有特判分支";

  // 7. 建议演进原型
  const hasMultiSteps = Boolean(steps.length > 1);
  const recommendedPrototype = deduceRecommendedPrototype(observedInputPrototype, comp.contract, hasMultiSteps);

  return {
    componentId: comp.id,
    codeSlug: comp.id.toLowerCase(),
    name: comp.name,
    enabled: comp.isPublished,
    observedInputPrototype,
    recommendedPrototype,
    inputStatus,
    inputEvidence,
    hasRealExecutionChain,
    executionChainStatus,
    executionChainEvidence,
    fileParser,
    fileParserStatus,
    fileParserEvidence,
    promptSource,
    isPromptVersioned,
    promptStatus,
    promptEvidence,
    hasSpecialCase,
    specialCaseStatus,
    specialCaseEvidence,
    missingCapabilities,
  };
}

export function analyzeAllComponents(
  components: RawCatalogComponent[],
  codeEvidence: SourceCodeEvidence,
  explicitBenchmarkTime?: string,
  activeContracts?: Map<string, ActiveContractInfo>
): CapabilityAuditSummary {
  // 严格字典序稳定排序
  const sorted = [...components].sort((a, b) => a.id.localeCompare(b.id));

  let enabledCount = 0;
  let observedCount = 0;
  let inferredCount = 0;
  let unknownCount = 0;
  let realExecutionCount = 0;
  let specialCaseCount = 0;
  const prototypeStats: Record<string, number> = {};

  const items = sorted.map((comp) => {
    const item = analyzeComponentRecord(comp, codeEvidence, activeContracts?.get(comp.id) ?? null);

    if (item.enabled) enabledCount++;
    if (item.hasRealExecutionChain) realExecutionCount++;
    if (item.hasSpecialCase) specialCaseCount++;

    // 统计置信度三态分布
    const statuses = [item.inputStatus, item.executionChainStatus, item.fileParserStatus, item.promptStatus, item.specialCaseStatus];
    if (statuses.includes("UNKNOWN")) unknownCount++;
    else if (statuses.includes("INFERRED")) inferredCount++;
    else observedCount++;

    prototypeStats[item.recommendedPrototype] = (prototypeStats[item.recommendedPrototype] || 0) + 1;
    return item;
  });

  return {
    benchmarkTimestamp: explicitBenchmarkTime || "STATIC_AUDIT_DETERMINISTIC_BENCHMARK",
    totalComponents: components.length,
    enabledCount,
    disabledCount: components.length - enabledCount,
    observedCount,
    inferredCount,
    unknownCount,
    realExecutionCount,
    specialCaseCount,
    prototypeDistribution: prototypeStats,
    items,
  };
}

// ==========================================
// 报告渲染纯函数 (确定性，逐字节一致)
// ==========================================

export function renderCapabilityMatrixJson(summary: CapabilityAuditSummary): string {
  // 保证 JSON 键名稳定，结尾统一带换行符
  return JSON.stringify(summary, null, 2) + "\n";
}

export function renderCapabilityMatrixMarkdown(summary: CapabilityAuditSummary): string {
  const lines: string[] = [];

  lines.push("# 知阁·舟坊 通用组件平台能力盘点矩阵 (Component Capability Matrix)");
  lines.push("");
  lines.push(`> **确定性基准标识**: \`${summary.benchmarkTimestamp}\`  `);
  lines.push(`> **数据源**: 生产数据库 \`component_catalog\` 表全量只读扫描与生产源码动态证据交叉校验  `);
  lines.push(`> **真实组件总数**: **${summary.totalComponents}** 项（无硬编码数量，依据真实数据库行数分析）  `);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 1. 核心统计与审计置信度概览");
  lines.push("");
  lines.push("| 统计维度 | 数量 | 占比 | 审计证据说明 |");
  lines.push("|---|:---:|:---:|---|");
  lines.push(`| **组件总数** | **${summary.totalComponents}** | 100.0% | 数据库实际组件行数 |`);
  lines.push(`| **已启用组件** | **${summary.enabledCount}** | ${((summary.enabledCount / summary.totalComponents) * 100).toFixed(1)}% | \`isPublished = true\` |`);
  lines.push(`| **真实模型执行链** | **${summary.realExecutionCount}** | ${((summary.realExecutionCount / summary.totalComponents) * 100).toFixed(1)}% | 具备 \`REAL_MODEL\` 执行合同与适配链路 |`);
  lines.push(`| **组件特判分支** | **${summary.specialCaseCount}** | ${((summary.specialCaseCount / summary.totalComponents) * 100).toFixed(1)}% | 动态扫描命中源码专有分支 |`);
  lines.push(`| **OBSERVED 完全观测组件** | **${summary.observedCount}** | ${((summary.observedCount / summary.totalComponents) * 100).toFixed(1)}% | 具备直接数据库与源码引用证据 |`);
  lines.push(`| **INFERRED 结构化推断组件** | **${summary.inferredCount}** | ${((summary.inferredCount / summary.totalComponents) * 100).toFixed(1)}% | 依据输入输出模式完成结构推断 |`);
  lines.push(`| **UNKNOWN 证据缺失组件** | **${summary.unknownCount}** | ${((summary.unknownCount / summary.totalComponents) * 100).toFixed(1)}% | 关键字段缺失，严格保留 UNKNOWN |`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 2. 建议组件原型分布 (基于证据归类)");
  lines.push("");
  lines.push("| 建议原型 | 组件数量 | 占比 |");
  lines.push("|---|:---:|:---:|");

  const sortedPrototypes = Object.entries(summary.prototypeDistribution).sort((a, b) => b[1] - a[1]);
  for (const [proto, count] of sortedPrototypes) {
    lines.push(`| \`${proto}\` | ${count} | ${((count / summary.totalComponents) * 100).toFixed(1)}% |`);
  }

  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 3. 全量组件能力审计明细");
  lines.push("");
  lines.push("| ID | 组件名称 | 观测输入原型 | 建议演进原型 | 执行链状态 | 特判状态 | 主要缺失能力 |");
  lines.push("|---|---|:---:|:---:|:---:|:---:|---|");

  for (const item of summary.items) {
    const missingStr = item.missingCapabilities.length > 0 ? item.missingCapabilities.join("；") : "无";
    const execLabel = item.hasRealExecutionChain
      ? "真实模型"
      : item.executionChainStatus === "UNKNOWN"
      ? "未配置(缺合同)"
      : "非真实模型";
    lines.push(
      `| **${item.componentId}** | ${item.name} | \`${item.observedInputPrototype}\` | \`${item.recommendedPrototype}\` | [${item.executionChainStatus}] ${execLabel} | [${item.specialCaseStatus}] ${item.hasSpecialCase ? "有特判" : "无特判"} | ${missingStr} |`
    );
  }

  lines.push("");
  return lines.join("\n") + "\n";
}

// ==========================================
// CLI 入口执行器（只读模式）
// ==========================================

export async function runCliAudit(options?: { generatedAt?: string; dryRun?: boolean }): Promise<void> {
  loadCliEnv();
  const { prisma } = await import("../src/lib/prisma");

  try {
    console.log("正在执行通用组件平台能力盘点 (只读模式)...");

    // 1. 读取数据库组件
    const dbComponents = await prisma.componentcatalog.findMany({
      orderBy: { id: "asc" },
    });

    // 1b. 读取激活合同（新合同路径唯一真源：component_contract + active_contract_id）
    const publishedContracts = await prisma.componentcontract.findMany({
      select: { id: true, componentId: true, contractVersion: true, lifecycle: true, contract: true },
    });
    const contractsById = new Map(publishedContracts.map((c) => [c.id, c]));
    const activeContracts = new Map<string, ActiveContractInfo>();
    for (const comp of dbComponents) {
      const row = comp.activeContractId ? contractsById.get(comp.activeContractId) : undefined;
      if (!row) continue;
      activeContracts.set(comp.id, {
        id: row.id,
        componentId: row.componentId,
        contractVersion: row.contractVersion,
        lifecycle: row.lifecycle,
        contract: row.contract,
      });
    }

    // 2. 读取生产源码证据
    const sourceFiles = new Map<string, string>();
    const studioRoutePath = path.resolve(process.cwd(), "src", "app", "api", "studio", "route.ts");
    if (fs.existsSync(studioRoutePath)) {
      sourceFiles.set("src/app/api/studio/route.ts", fs.readFileSync(studioRoutePath, "utf-8"));
    }
    // 说明：旧模块 src/lib/pilot-contract-binding.ts 已退役（不再通过 parseExecutionProfileValue
    // 校验旧 JSON 合同），因此不再纳入审计扫描输入。
    const execProfilePath = path.resolve(process.cwd(), "src", "lib", "component-execution-profile.ts");
    if (fs.existsSync(execProfilePath)) {
      sourceFiles.set("src/lib/component-execution-profile.ts", fs.readFileSync(execProfilePath, "utf-8"));
    }

    const codeEvidence = scanSourceCodeEvidence(sourceFiles);

    // 3. 执行纯分析
    const summary = analyzeAllComponents(
      dbComponents as unknown as RawCatalogComponent[],
      codeEvidence,
      options?.generatedAt,
      activeContracts,
    );

    console.log(`盘点完成！组件总数: ${summary.totalComponents}, 真实执行: ${summary.realExecutionCount}, 特判: ${summary.specialCaseCount}`);

    // 4. 写文件（如非 dryRun）
    if (!options?.dryRun) {
      const jsonContent = renderCapabilityMatrixJson(summary);
      const jsonPath = path.resolve(process.cwd(), "docs", "component-capability-matrix.json");
      fs.writeFileSync(jsonPath, jsonContent, "utf-8");

      const mdContent = renderCapabilityMatrixMarkdown(summary);
      const mdPath = path.resolve(process.cwd(), "docs", "component-capability-matrix.md");
      fs.writeFileSync(mdPath, mdContent, "utf-8");

      console.log(`已成功写出 canonical JSON 报告: ${jsonPath}`);
      console.log(`已成功写出 canonical Markdown 报告: ${mdPath}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// 当直接执行该脚本时触发
if (require.main === module) {
  const args = process.argv.slice(2);
  let explicitTime: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--generated-at" && args[i + 1]) {
      explicitTime = args[i + 1];
    }
  }

  runCliAudit({ generatedAt: explicitTime })
    .catch((err) => {
      console.error("执行盘点时发生异常:", err);
      process.exit(1);
    });
}
