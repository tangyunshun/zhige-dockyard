/**
 * 组件进度视图（纯函数）
 *
 * 目的：管理员进度页的状态派生、筛选与汇总逻辑与 UI 解耦，便于测试。
 * 约束：
 *  - **不按组件 ID 的数字范围分组**（新增 C61/C78/C100 或非 Cxx 组件必须同样可用）；
 *  - 状态完全由数据库字段派生（activeContractId / activeLifecycle / executable）；
 *  - 无数据库依赖、无副作用。
 */

import type { ComponentContract } from "@/lib/component-contract/types";

export interface ReadinessComponentRow {
  componentId: string;
  isPublished: boolean;
  activeContractId: string | null;
  activeContractVersion: string | null;
  activeLifecycle: string | null;
  requiredCapabilities: string[];
  missingCapabilities: string[];
  executable: boolean;
  /**
   * 质量/产品限制提示（来自激活合同的数据库元数据派生，非硬编码组件状态）。
   * 用于页面明确「可执行 ≠ 结果已验收」，并展示各组件输出的待验证项与产品限制。
   */
  qualityHints: string[];
}

export type ReadinessStatusKey = "EXECUTABLE" | "UNCONFIGURED" | "NOT_EXECUTABLE" | "INVALID_CONTRACT_REF";
export type ReadinessFilter = "ALL" | ReadinessStatusKey;

/**
 * 质量/产品限制提示（纯函数，全部由激活合同元数据派生；不按组件 ID 硬编码、不写死任何完成度数字）。
 *
 * 设计原则（呼应批次 2B 用户侧纠偏）：
 *  - 「状态=可执行」仅表示合同已发布且能力门禁允许执行；**不代表结果已验收或产品质量 COMPLETE**；
 *  - 各组件的待验证项与产品限制必须从合同元数据推导，集中在此处，避免在 UI 再建一份组件状态表。
 *
 * 触发规则（均来自合同字段，新增 C61/C11x 等组件只要元数据一致即自动得到对应提示）：
 *  - 结构化输出（TABLE/JSON 且声明 schemaDefinition）→ 已启用服务端 schema 校验，但业务/数值准确性仍需人工复核；
 *  - privacyPolicy.requirePrivacyNotes → 生成含个人信息样例，须脱敏且不得输入真实个人信息；
 *  - 输出含代码（requiredProperties 含 "code" / rendererType=CODE_BLOCK / kind=FILE）→ 代码未经编译验证，需人工审查；
 *  - 含量化 ROI/收益字段（requiredProperties 含 investment/returns/paybackPeriod/roi 或中文「收益/投入」）→ 数值 AI 推算未经独立验证。
 */
export function deriveQualityHints(contract: ComponentContract | null | undefined): string[] {
  const hints: string[] = [];
  if (!contract) return hints;
  const out = contract.output;
  const reqProps: string[] = out?.structureConstraints?.requiredProperties ?? [];
  const propsText = reqProps.join(" ");
  const isStructured = (out?.kind === "TABLE" || out?.kind === "JSON") && !!out?.structureConstraints?.schemaDefinition;

  if (isStructured) {
    hints.push("结构化结果已启用服务端 schema 校验；业务/数值准确性仍需人工复核，不得直接依赖为最终结论");
  }
  if (contract.privacyPolicy?.requirePrivacyNotes) {
    hints.push("生成含个人信息样例，须脱敏且不得输入真实个人信息；合成数据使用前须人工复核");
  }
  const hasCodeOutput =
    reqProps.some((p) => /(code|ddl|resolver|implementation|producer|consumer|script)/i.test(p)) ||
    out?.kind === "FILE" ||
    contract.executionPlan?.steps?.some(
      (s) => /代码/i.test(s.name) || /(代码|骨架代码)/.test(s.promptTemplate),
    );

  if (hasCodeOutput) {
    hints.push("生成代码未经目标工程编译/运行验证，需开发人员在目标工程内审查与验证");
  }
  if (/(investment|returns|paybackPeriod|roi)/i.test(propsText) || propsText.includes("收益") || propsText.includes("投入")) {
    hints.push("含量化 ROI/收益结论，AI 推算未经独立验证，数值须人工复核");
  }

  // 缓存/压测/容量性能规则检查（完全由元数据属性与描述推导，无组件 ID 硬编码）
  const schemaStr = JSON.stringify(out?.structureConstraints?.schemaDefinition ?? {});
  const hasCacheOrPerf =
    /(ttlseconds|cachekey|invalidation|antipenetration)/i.test(schemaStr) ||
    /(ttlseconds|cachekey)/i.test(propsText) ||
    contract.executionPlan?.steps?.some((s) => /(缓存|命中率|压测|容量)/.test(s.promptTemplate));

  if (hasCacheOrPerf) {
    hints.push("性能、命中率与容量未经实际压测，不构成性能保证；命中率口径与降级方案须在目标环境进行基准测试");
  }

  return hints;
}

/** 目录端公开的通用组件就绪与提示状态 */
export interface CatalogComponentReadiness {
  readinessStatus: "EXECUTABLE" | "UNCONFIGURED" | "BLOCKED" | "NOT_EXECUTABLE";
  blockingReasons: string[];
  qualityHints: string[];
  isCandidateEligible: boolean;
  contractReady: boolean;
  hasPublishedContract: boolean;
}

/**
 * 派生目录端组件的通用就绪状态、阻断原因与质量提示（纯函数）。
 *
 * 核心保证：
 *  1. 区分“数据库中已发布可执行”与“候选合同满足能力但尚未发布”；
 *  2. 候选满足能力（isCandidateEligible: true）绝不代表可执行（contractReady 仍为 false，readinessStatus 为 UNCONFIGURED）；
 *  3. 阻断原因（如 C12 图形 ER 阻断）100% 来自明确登记的 unsupportedRequirements，不按组件 ID 硬编码；
 *  4. 无合同组件明确返回 UNCONFIGURED，不伪装为已就绪。
 */
export function deriveCatalogComponentReadiness(params: {
  activeContractLifecycle?: string | null;
  activeContract?: ComponentContract | null;
  missingCapabilities?: string[];
  candidateMeta?: {
    contract: ComponentContract;
    analysis?: {
      activationStatus: "ELIGIBLE" | "BLOCKED";
      unsupportedRequirements?: string[];
    };
  } | null;
}): CatalogComponentReadiness {
  const { activeContractLifecycle, activeContract, missingCapabilities = [], candidateMeta } = params;
  const isPublished = activeContractLifecycle === "PUBLISHED";

  // 1. 数据库中已发布合同存在
  if (isPublished && activeContract) {
    const capsMissing = missingCapabilities.length > 0;
    return {
      readinessStatus: capsMissing ? "NOT_EXECUTABLE" : "EXECUTABLE",
      blockingReasons: capsMissing
        ? [
            missingCapabilities.includes("PLATFORM_DEFAULT_DEPLOYMENT_NOT_AVAILABLE")
              ? "平台默认模型部署未配置或暂不可用（状态不可确认），当前无法在公开目录验证执行能力"
              : missingCapabilities.includes("CONTRACT_CAPABILITY_NOT_DECLARED")
                ? "合同未声明任何模型能力要求（requiredCapabilities 为空或非法），默认模型门禁拒绝执行，不得判定为可执行"
                : `平台当前模型部署未满足合同所需能力：${missingCapabilities.join("、")}`,
          ]
        : [],
      qualityHints: deriveQualityHints(activeContract),
      isCandidateEligible: false,
      contractReady: !capsMissing,
      hasPublishedContract: true,
    };
  }

  // 2. 数据库激活合同为非 PUBLISHED 状态（DRAFT/ARCHIVED 等）
  if (activeContractLifecycle && activeContractLifecycle !== "PUBLISHED") {
    return {
      readinessStatus: "UNCONFIGURED",
      blockingReasons: [`激活合同当前处于 ${activeContractLifecycle} 状态，尚未正式发布`],
      qualityHints: deriveQualityHints(activeContract),
      isCandidateEligible: false,
      contractReady: false,
      hasPublishedContract: false,
    };
  }

  // 3. 数据库无激活合同，但存在受控候选合同元数据
  if (candidateMeta) {
    const analysis = candidateMeta.analysis;
    const isBlocked = analysis?.activationStatus === "BLOCKED" || (analysis?.unsupportedRequirements && analysis.unsupportedRequirements.length > 0);
    const blockingReasons = analysis?.unsupportedRequirements ? [...analysis.unsupportedRequirements] : [];
    if (isBlocked && blockingReasons.length === 0) {
      blockingReasons.push("候选合同存在未满足的业务依赖门禁");
    }

    return {
      // 若受控阻断则为 BLOCKED，若候选满足能力则仍为 UNCONFIGURED（未发布候选绝不显示为可执行）
      readinessStatus: isBlocked ? "BLOCKED" : "UNCONFIGURED",
      blockingReasons,
      qualityHints: deriveQualityHints(candidateMeta.contract),
      isCandidateEligible: analysis?.activationStatus === "ELIGIBLE" && !isBlocked,
      contractReady: false, // 严格为 false：数据库未发布绝不可执行！
      hasPublishedContract: false,
    };
  }

  // 4. 既无数据库激活合同，又无受控候选元数据
  return {
    readinessStatus: "UNCONFIGURED",
    blockingReasons: [],
    qualityHints: [],
    isCandidateEligible: false,
    contractReady: false,
    hasPublishedContract: false,
  };
}

/** 筛选器清单（顺序即页面展示顺序） */
export const READINESS_FILTERS: Array<{ key: ReadinessFilter; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "EXECUTABLE", label: "可执行" },
  { key: "UNCONFIGURED", label: "待配置" },
  { key: "NOT_EXECUTABLE", label: "暂不可执行" },
  { key: "INVALID_CONTRACT_REF", label: "无效合同引用" },
];

/**
 * 派生单个组件的就绪状态（全部来自后端字段，与组件 ID 命名无关）：
 *  - 无 activeContractId            → 待配置
 *  - 有激活引用但非 PUBLISHED         → 无效合同引用
 *  - PUBLISHED 且能力覆盖             → 可执行
 *  - PUBLISHED 但能力不足             → 暂不可执行
 */
export function deriveReadinessStatus(row: ReadinessComponentRow): { key: ReadinessStatusKey; label: string } {
  if (!row.activeContractId) return { key: "UNCONFIGURED", label: "待配置" };
  if (row.activeLifecycle !== "PUBLISHED") return { key: "INVALID_CONTRACT_REF", label: "无效合同引用" };
  if (row.executable) return { key: "EXECUTABLE", label: "可执行" };
  return { key: "NOT_EXECUTABLE", label: "暂不可执行" };
}

/** 按状态筛选（ALL 返回全部） */
export function filterReadinessRows<T extends ReadinessComponentRow>(rows: T[], filter: ReadinessFilter): T[] {
  if (filter === "ALL") return rows;
  return rows.filter((r) => deriveReadinessStatus(r).key === filter);
}

/** 汇总各状态数量（含 ALL 总数） */
export function summarizeReadiness(rows: ReadinessComponentRow[]): Record<ReadinessFilter, number> {
  const counts: Record<ReadinessFilter, number> = {
    ALL: rows.length,
    EXECUTABLE: 0,
    UNCONFIGURED: 0,
    NOT_EXECUTABLE: 0,
    INVALID_CONTRACT_REF: 0,
  };
  for (const row of rows) counts[deriveReadinessStatus(row).key] += 1;
  return counts;
}
