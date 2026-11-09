/**
 * [P10 / R3] 从首页到首个可复用成果 —— 首次价值旅程协调层。
 *
 * 定位：把批次9（企业/空间边界授权）、批次6（成本预约/报价）、批次8（attempt 执行事实）
 * 串成「首页 → 场景入口 → 登录(保留意图) → 空间 → 材料预检/报价 → 任务 → 成果/费用 →
 * 历史下载/再次工作」的可解释状态机。本模块只做「判断与披露」，不写授权/定价/补权益
 * （那些归 6/8/9 与既有业务原语），也不触碰真实库/模型/支付。
 *
 * 严格约束（COMMON-RULES / 批次10）：
 *   - 名称/场景来自当前可公开且有真实证据的能力/合同，不写死组件数或 C 编号。
 *   - 示例永久标示示例；无客户授权/测量证据不编客户案例、提升百分比或支持承诺。
 *   - 未上传文件不称已保存；登录/注册保留安全来源意图，防开放跳转。
 *   - 任务前集中说明材料/成果范围/资料接收者/付款方/固定或估算性质及授权上限。
 *   - 任务中用真实状态，不伪造百分比/完成时间；失败/无有效成果不显示成功。
 *   - 结果显示内容/来源/需复核处/版本/费用口径；查看/下载/历史复用不重新调用模型。
 *   - 按同一工作继续的新执行明确重新授权费用，不能跨企业复用缓存。
 *   - 零真实库/SMTP/模型/支付；外部依赖通过注入入参，离线可测。
 */

import type { AttemptOutcome } from "@/lib/billing/execution-orchestration";
import { authorizeWorkspaceAccess, type AccessContext } from "@/lib/tenant/enterprise-lifecycle";

/** 首页可展示的能力卡片（名称来自真实证据，未就绪诚实标记） */
export interface CapabilityCard {
  id: string;
  /** 展示用名称（不写死 C 编号） */
  name: string;
  /** 一句话产出说明 */
  produces: string;
  /** 是否已有真实合同/能力证据（否则诚实标记未就绪，不承诺） */
  ready: boolean;
  /** 是否示例（永久标示，不冒充真实分析） */
  isExample: boolean;
  /** 需复核/未就绪的诚实说明（ready=false 时必填） */
  notReadyReason?: string;
}

export interface HomepageState {
  targetAudience: string;
  problemSolved: string;
  primaryAction: { label: string; href: string };
  capabilities: CapabilityCard[];
}

/** 首页状态：明确「给谁/解决什么/产出什么」，主行动突出；未就绪诚实标记，不用演示冒充真实分析 */
export function computeHomepageState(
  targetAudience: string,
  problemSolved: string,
  capabilities: CapabilityCard[],
): HomepageState {
  const readyExample = capabilities.find((c) => c.ready && c.isExample);
  const primaryAction = readyExample
    ? { label: "查看示例", href: "/scenarios/example" }
    : capabilities.some((c) => c.ready)
      ? { label: "开始使用", href: "/workspaces" }
      : { label: "了解能力", href: "/capabilities" };
  return { targetAudience, problemSolved, primaryAction, capabilities };
}

/**
 * 登录/注册安全意图保留：校验回跳地址，防止开放跳转（不信任 body 任意 X-Forwarded-For/redirect）。
 * 仅允许站内相对路径或白名单主机；否则回落首页。
 */
export function preserveLoginIntent(returnTo: string | null | undefined, allowedHosts: string[]): string {
  if (!returnTo) return "/workspaces";
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) return returnTo;
  try {
    const u = new URL(returnTo);
    if (allowedHosts.includes(u.host)) return returnTo;
  } catch {
    /* 非法 URL 回落 */
  }
  return "/workspaces";
}

export type FeeNature = "FIXED" | "ESTIMATE" | "FREE";

export interface PreTaskDisclosureInput {
  materialScope: string;
  resultScope: string;
  /** 资料接收者（空间/企业，不暴露私有材料） */
  recipient: string;
  payer: string;
  feeNature: FeeNature;
  /** 授权上限（点数），固定/估算不同口径 */
  authCapPoints: number;
  /** 服务端报价是否就绪（批次6 报价状态） */
  quoteReady: boolean;
  /** 报价是否过期（过期必须重新确认，不能拿旧成功键修改内容） */
  quoteExpired: boolean;
  /** 是否已上传文件（未上传不称已保存） */
  fileUploaded: boolean;
}

export interface PreTaskDisclosure {
  materialScope: string;
  resultScope: string;
  recipient: string;
  payer: string;
  feeNature: FeeNature;
  authCapPoints: number;
  /** 服务端报价是否就绪（预算不足/未批准新付费能力时 false） */
  quoteReady: boolean;
  canSubmit: boolean;
  /** 必须重新确认的原因（如报价过期） */
  reconfirmRequired: boolean;
  warnings: string[];
}

/** 任务前集中披露：材料/成果范围/接收者/付款方/费用性质/授权上限；用服务器报价就绪状态 */
export function computePreTaskDisclosure(input: PreTaskDisclosureInput): PreTaskDisclosure {
  const warnings: string[] = [];
  if (!input.fileUploaded) warnings.push("尚未上传文件，未保存任何材料，请先上传后再提交。");
  const reconfirmRequired = input.quoteExpired;
  if (reconfirmRequired) warnings.push("报价已过期（材料/模型/版本可能变化），请重新生成报价确认后再提交。");
  const canSubmit = input.quoteReady && !input.quoteExpired && input.fileUploaded;
  return {
    materialScope: input.materialScope,
    resultScope: input.resultScope,
    recipient: input.recipient,
    payer: input.payer,
    feeNature: input.feeNature,
    authCapPoints: input.authCapPoints,
    quoteReady: input.quoteReady,
    canSubmit,
    reconfirmRequired,
    warnings,
  };
}

export interface TaskProgressView {
  /** 诚实状态，绝不伪造完成百分比 */
  status: "PENDING" | "RUNNING" | "SUCCESS" | "FAILED" | "UNKNOWN" | "NO_RESULT";
  /** 是否展示为成功（仅当真实成功且存在有效成果） */
  shownAsSuccess: boolean;
  /** 需向用户展示的服务器事实说明（unknown 如实、失败不伪装成功） */
  message: string;
}

/**
 * 任务进度视图：用真实状态与可查询记录，不伪造百分比/完成时间；
 * 失败/无有效成果不显示成功；unknown 按服务器事实展示（保守保留待恢复）。
 */
export function computeTaskProgressView(
  taskStatus: "PENDING" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED",
  attemptOutcome: AttemptOutcome | null,
  hasValidResult: boolean,
): TaskProgressView {
  if (taskStatus === "FAILED" || attemptOutcome === "FAILED") {
    return { status: "FAILED", shownAsSuccess: false, message: "任务执行失败，未产生有效成果，资金/退款按服务器事实处理。" };
  }
  if (attemptOutcome === "UNKNOWN") {
    return { status: "UNKNOWN", shownAsSuccess: false, message: "供应商结果未知，已保守保留在途，待运营核实恢复，请勿重复提交以免重复计费。" };
  }
  if (attemptOutcome === "REJECTED") {
    return { status: "NO_RESULT", shownAsSuccess: false, message: "本次提交被拒绝（未授权/无价/预算不足/报价过期），未产生费用，请检查后重试。" };
  }
  if (taskStatus === "DONE" && hasValidResult && attemptOutcome === "SUCCESS") {
    return { status: "SUCCESS", shownAsSuccess: true, message: "任务完成，已生成有效成果。" };
  }
  if (taskStatus === "DONE" && (!hasValidResult || attemptOutcome !== "SUCCESS")) {
    return { status: "NO_RESULT", shownAsSuccess: false, message: "任务已结束但未产生有效成果，不显示为成功。" };
  }
  if (taskStatus === "PENDING") return { status: "PENDING", shownAsSuccess: false, message: "任务已提交，等待执行。" };
  return { status: "RUNNING", shownAsSuccess: false, message: "任务执行中。" };
}

export interface ResultView {
  contentSummary: string;
  source: string;
  /** 需人工复核处 */
  needsReview: boolean;
  version: string;
  feeBasis: FeeNature;
  /** 查看/下载/历史复用是否产生新模型调用或新费用 */
  newCallOnView: false;
  newFeeOnView: false;
}

/** 成果视图：内容/来源/需复核/版本/费用口径；查看下载历史复用不重新调用模型 */
export function computeResultView(input: {
  contentSummary: string;
  source: string;
  needsReview: boolean;
  version: string;
  feeBasis: FeeNature;
}): ResultView {
  return {
    contentSummary: input.contentSummary,
    source: input.source,
    needsReview: input.needsReview,
    version: input.version,
    feeBasis: input.feeBasis,
    newCallOnView: false,
    newFeeOnView: false,
  };
}

export interface ReuseDecisionInput {
  hasExistingResult: boolean;
  /** 复用方与成果归属是否同一工作空间 */
  sameWorkspace: boolean;
  /** 复用方与成果归属是否同一企业（跨企业缓存复用禁止） */
  sameEnterprise: boolean;
  /** 材料是否变化（变了需新执行重新授权费用） */
  materialChanged: boolean;
  /** 既有报价是否仍有效（过期需重新授权费用） */
  quoteStillValid: boolean;
}

export interface ReuseDecision {
  /** 可直接复用历史成果（查看/下载），不产生新费用/新模型调用 */
  reuse: boolean;
  /** 需要新执行并重新授权费用（继续同一工作） */
  requireNewExecution: boolean;
  reason: string;
}

/**
 * 复用 vs 新执行决策：
 *   - 同一工作空间、同一企业、材料未变、报价仍有效 → 直接复用，零新费用/零新模型调用；
 *   - 跨企业缓存复用一律禁止；
 *   - 其余（材料变/报价过期/跨空间）→ 新执行，明确重新授权费用。
 */
export function decideReuseOrNew(input: ReuseDecisionInput): ReuseDecision {
  if (!input.hasExistingResult) {
    return { reuse: false, requireNewExecution: true, reason: "无既有成果，需新执行并授权费用。" };
  }
  if (!input.sameEnterprise) {
    return { reuse: false, requireNewExecution: true, reason: "跨企业，禁止复用缓存，需在本企业新执行并授权费用。" };
  }
  if (!input.sameWorkspace) {
    return { reuse: false, requireNewExecution: true, reason: "跨工作空间，需新执行并授权费用。" };
  }
  if (input.materialChanged || !input.quoteStillValid) {
    return { reuse: false, requireNewExecution: true, reason: "材料已变化或报价过期，需新执行并重新授权费用。" };
  }
  return { reuse: true, requireNewExecution: false, reason: "同一企业/空间、材料与报价未变，可直接复用既有成果，零新费用。" };
}

/** 空间访问授权（复用批次9 CF-F08 边界，UI 不另写授权） */
export function checkWorkspaceEntry(ctx: AccessContext): { allowed: boolean; reason?: string } {
  return authorizeWorkspaceAccess(ctx);
}
