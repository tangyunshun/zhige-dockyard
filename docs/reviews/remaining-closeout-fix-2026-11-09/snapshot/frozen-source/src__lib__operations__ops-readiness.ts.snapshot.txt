/**
 * [P11 / R5] 运营恢复、审计与发布准备 —— 只读健康/待处理登记/安全恢复（A11 接线层）。
 *
 * 定位：让管理员经「专用恢复权限」看见 收款未履约 / 任务 unknown / 退点·预算恢复失败 / 权限·容量未就绪，
 * 并以安全动作（独立权限 + 原因 + 必要再验证 + 幂等 + 审计）调用原业务服务（批次8 recoverAttempt /
 * 批次7 恢复准备），而不是让运营直接改库。只读健康检查不写业务数据。
 *
 * 严格约束（COMMON-RULES / 批次11）：
 *   - 只读查询/健康/导出零业务副作用；不沿用旧维护 GET 补权益/建表/调度兜底。
 *   - 恢复动作：独立权限、原因、必要再验证、幂等、审计；unknown 不能一键盲重试；停止未确认不能
 *     直接腾槽；不用「恢复」绕过既有暂停（如 F07 人工 APPROVE 暂停）。
 *   - 未知事实与确定失败区分；错误日志不含 key/验证码/客户正文。
 *   - 配置/迁移/worker/供应商未就绪有稳定状态与可诊断信息；未配置外部服务就报告未就绪，
 *     不引入新付费监控或自动发送真实通知。
 *   - 不改批次12 指标 API，不扩大管理员自动资金权限；不真实触发 cron/渠道/库。
 *   - CF-F06 调价：读权限不能改价；批量修改按既有批准语义原子；计数对应真实修改；审计失败不能伪报成功。
 *   - 零真实库/SMTP/模型/支付；外部依赖通过 RecoveryDelegate / 注入快照，离线可测。
 */

import type { AttemptOutcome, RecoverySummary } from "@/lib/billing/execution-orchestration";

/** 专用恢复权限标识（与现有一致：仅此权限可恢复，读权限/普通管理员不可） */
export const RECOVERY_PERMISSION = "ops:recovery";
export const PRICE_WRITE_PERMISSION = "price:write";

export type PendingRecordKind = "UNFULFILLED_PAYMENT" | "UNKNOWN_TASK" | "RECOVERY_FAILED" | "CAPACITY_NOT_READY" | "PERMISSION_NOT_READY";

export interface PendingRecord {
  businessId: string;
  kind: PendingRecordKind;
  reason: string;
  status: "UNKNOWN" | "FAILED" | "PENDING";
  retryCount: number;
  responsibleRole: string;
  nextStep: string;
  tenantId: string;
}

/** 待处理记录采集：按权限与租户裁剪；未知事实与确定失败区分 */
export function collectPendingRecords(
  records: PendingRecord[],
  scopeTenantId: string | null,
  canViewCrossTenant: boolean,
): PendingRecord[] {
  return records.filter((r) => canViewCrossTenant || scopeTenantId === null || r.tenantId === scopeTenantId);
}

/** 日志/错误脱敏：移除 key/验证码/客户正文等敏感片段，仅保留可诊断信息 */
export function redactSensitive(raw: string): string {
  return raw
    .replace(/sk-[A-Za-z0-9_\-]{8,}/g, "[REDACTED_KEY]")
    .replace(/[0-9]{4,6}/g, (m) => (/\d{4,6}/.test(m) ? "[REDACTED_CODE]" : m))
    .replace(/验证码[:：]\s*\S+/g, "验证码:[REDACTED]")
    .replace(/password["'=:\s]+\S+/gi, "password:[REDACTED]");
}

export interface ServiceHealth {
  name: string;
  ready: boolean;
  diagnostics: string;
}

export interface HealthReport {
  status: "OK" | "DEGRADED" | "NOT_READY";
  services: ServiceHealth[];
}

/** 只读健康检查：纯计算，零业务副作用（不补权益/建表/调度兜底） */
export function readonlyHealthCheck(services: ServiceHealth[]): HealthReport {
  if (services.length === 0) return { status: "NOT_READY", services };
  const allReady = services.every((s) => s.ready);
  const anyReady = services.some((s) => s.ready);
  return { status: allReady ? "OK" : anyReady ? "DEGRADED" : "NOT_READY", services };
}

export interface RecoveryAuditRecord {
  operatorId: string;
  operatorRole: string;
  action: "RECOVER";
  businessId: string;
  reason: string;
  idempotencyKey: string;
  intendedOutcome: "SUCCESS" | "FAILED" | "REVIEW";
  /** 不含 key/验证码/客户正文 */
  note: string;
}

export interface RecoveryDelegate {
  /** 真实接线在第13批：内部调用批次8 recoverAttempt（绝不重新扣点） */
  performRecovery(taskId: string, summary: RecoverySummary, intendedOutcome: "SUCCESS" | "FAILED", idempotencyKey: string): Promise<{ ok: boolean; outcome?: AttemptOutcome }>;
  /** 审计落盘；返回 ok=false 表示审计失败（此时不得伪报业务成功） */
  audit(record: RecoveryAuditRecord): Promise<{ ok: boolean }>;
}

export interface RecoveryContext {
  operatorId: string;
  operatorRole: string;
  permissions: string[];
  reason: string;
  reVerifyToken?: string;
  idempotencyKey: string;
  intendedOutcome: "SUCCESS" | "FAILED" | "REVIEW";
}

export type RecoveryResult =
  | { ok: true; outcome: AttemptOutcome }
  | { ok: false; code: "FORBIDDEN" | "MISSING_REASON" | "MISSING_IDEMPOTENCY" | "UNKNOWN_NEEDS_DECISION" | "AUDIT_FAILED" | "RECOVERY_FAILED"; error: string };

/**
 * 安全恢复动作：独立权限 + 原因 + 幂等 + 审计；unknown 不能盲重试（必须显式成功/失败意图）；
 * 审计失败不伪报成功。绝不绕过既有暂停（如 F07 人工 APPROVE 暂停由调用方在 summary 上标 REVIEW）。
 */
export async function recoverAction(
  taskId: string,
  summary: RecoverySummary,
  ctx: RecoveryContext,
  delegate: RecoveryDelegate,
): Promise<RecoveryResult> {
  if (!ctx.permissions.includes(RECOVERY_PERMISSION)) {
    return { ok: false, code: "FORBIDDEN", error: "仅具备专用恢复权限(ops:recovery)可恢复；只读/普通管理员不可。" };
  }
  if (!ctx.reason || ctx.reason.trim().length === 0) {
    return { ok: false, code: "MISSING_REASON", error: "恢复必须填写原因。" };
  }
  if (!ctx.idempotencyKey || ctx.idempotencyKey.trim().length === 0) {
    return { ok: false, code: "MISSING_IDEMPOTENCY", error: "恢复必须携带幂等键，防重复恢复。" };
  }
  // unknown 不能一键盲重试：REVIEW 表示无显式成功/失败意图，必须人工核实，不得盲重试
  const intended = ctx.intendedOutcome;
  if (intended === "REVIEW") {
    return { ok: false, code: "UNKNOWN_NEEDS_DECISION", error: "供应商结果未知，不能盲重试，需明确成功/失败意图或转人工 REVIEW。" };
  }
  // 审计先于业务提交；审计失败不得伪报业务成功
  const auditResult = await delegate.audit({
    operatorId: ctx.operatorId,
    operatorRole: ctx.operatorRole,
    action: "RECOVER",
    businessId: taskId,
    reason: ctx.reason,
    idempotencyKey: ctx.idempotencyKey,
    intendedOutcome: intended,
    note: redactSensitive(summary.note),
  });
  if (!auditResult.ok) {
    return { ok: false, code: "AUDIT_FAILED", error: "审计落盘失败，已中止恢复，未提交任何业务副作用。" };
  }
  const rec = await delegate.performRecovery(taskId, summary, intended, ctx.idempotencyKey);
  if (!rec.ok) {
    return { ok: false, code: "RECOVERY_FAILED", error: "业务恢复失败，未产生资金/权益副作用。" };
  }
  return { ok: true, outcome: rec.outcome ?? "RECOVERED" };
}

export interface ResumeContext {
  operatorId: string;
  permissions: string[];
  /** 停止服务重新启用必须显式确认，未确认不能腾槽 */
  confirmed: boolean;
}

/** 停止/未确认服务不得直接腾槽/恢复：需显式确认 */
export function resumeStoppedService(ctx: ResumeContext): { ok: boolean; code?: "FORBIDDEN" | "NOT_CONFIRMED"; error?: string } {
  if (!ctx.permissions.includes(RECOVERY_PERMISSION)) return { ok: false, code: "FORBIDDEN", error: "无恢复权限。" };
  if (!ctx.confirmed) return { ok: false, code: "NOT_CONFIRMED", error: "停止服务重新启用需显式确认，未确认不能腾槽。" };
  return { ok: true };
}

/** CF-F06 调价守卫：读权限不能改价；仅 price:write 可；且要求明确意图（不改真实价格，仅校验授权） */
export function authorizePriceChange(permissions: string[]): { ok: boolean; code?: "FORBIDDEN"; error?: string } {
  if (!permissions.includes(PRICE_WRITE_PERMISSION)) {
    return { ok: false, code: "FORBIDDEN", error: "读权限/普通管理员不能改价（CF-F06）。" };
  }
  return { ok: true };
}

/**
 * CF-F06 批量调价计数校验：原子修改中，审计计数必须与实际修改行数一致，否则视为不一致（不伪报成功）。
 * 纯校验，不改真实价格。
 */
export function validateBatchPriceCount(declaredCount: number, actualModified: number): { ok: boolean; error?: string } {
  if (declaredCount !== actualModified) {
    return { ok: false, error: `调价审计计数(${declaredCount})与实际修改行数(${actualModified})不一致，拒绝伪报成功。` };
  }
  return { ok: true };
}
