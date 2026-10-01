/**
 * Phase 2B: Token 结算运营闭环 —— 对账扫描器 / 运营统计 / 管理员运营动作 / cron 编排。
 *
 * 设计原则（不可妥协）：
 *  - 对账只报告与「明确 CAS 修复」，**绝不自动猜测修复金额**；
 *  - 账户完整性依据 holdDetails 实际分桶判定，**不得要求无关账户存在**；
 *  - 仅当状态层面的修复是确定且无资金副作用的，才在「独立事务 + 固定锁序 + 锁内重读比对」下执行 CAS 修复；
 *  - 统计全部来自数据库聚合，严禁写死；对外输出不得包含 API Key / JWT / 模型密钥 / 完整用户隐私资料；
 *  - 所有管理员动作必须经过 claimToken / settlementVersion / 当前状态校验，且必须幂等。
 *
 * 对账能力边界（重要，防止过度宣称）：
 *  1) 流水结构一致（ledgerStructure）：单任务范围内，消费/退款/补扣流水的方向、类型、归属、
 *     scope、grant 引用、幂等键前缀与序号、逐条匹配 holdDetails —— 本轮已实现；
 *  2) 金额方程一致（amountEquation）：actualPricePoints = holdPoints - releasedPoints + supplementPoints，
 *     以及各类流水求和与结算字段一致 —— 本轮已实现；
 *  3) 当前账户余额聚合对账（accountBalanceAggregate）：**本轮未实现**。单任务快照无法证明
 *     userwallet.balance / workspacequota.tokenBalance / pointgrant.remaining 的绝对值正确，
 *     因此本模块**不宣称“余额结果已完整核对”**，该项作为后续「账户级总账对账」任务。
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { isRetryableP2034, type ConsumeDetail } from "@/lib/credit-service";
import {
  TokenSettlementError,
  adminResolveSettlementReview,
  reapExpiredHolds,
  runSettlementRecovery,
  parseStoredHoldDetails,
  verifyConsumeLedgersInTx,
} from "@/lib/token-settlement-service";

// ---------------------------------------------------------------------------
// 状态合法组合
// ---------------------------------------------------------------------------

export type SettlementStatus = "HOLD" | "SETTLED" | "RELEASED" | "REQUIRES_REVIEW";
export type HoldStatus = "HELD" | "SETTLED" | "RELEASED" | "REQUIRES_REVIEW";
export type RecoveryStatus = "PENDING" | "PROCESSING" | "SETTLED" | "RELEASED" | "REQUIRES_REVIEW" | "FAILED";

const ALLOWED_TRIPLE: Record<string, { hold: HoldStatus[]; recovery: RecoveryStatus[] }> = {
  HOLD: { hold: ["HELD"], recovery: ["PENDING", "PROCESSING", "FAILED"] },
  SETTLED: { hold: ["SETTLED"], recovery: ["SETTLED"] },
  RELEASED: { hold: ["RELEASED"], recovery: ["RELEASED"] },
  REQUIRES_REVIEW: {
    hold: ["REQUIRES_REVIEW"],
    recovery: ["PENDING", "PROCESSING", "FAILED", "REQUIRES_REVIEW"],
  },
};

export type ReconciliationKind =
  | "HOLD_ROW_MISSING"
  | "TRIPLE_STATUS_MISMATCH"
  | "RECOVERY_TERMINAL_MISMATCH"
  | "RECOVERY_STALE_PROCESSING"
  | "ACCOUNT_MISSING"
  | "LEDGER_MISMATCH"
  | "AMOUNT_EQUATION_MISMATCH"
  | "GRANT_MISMATCH";

export type ReconciliationSeverity = "HIGH" | "MEDIUM" | "LOW";

export interface ReconciliationFinding {
  taskId: string;
  userId: string;
  workspaceId: string;
  kind: ReconciliationKind;
  severity: ReconciliationSeverity;
  settlementStatus: string | null;
  holdStatus: string | null;
  recoveryStatus: string | null;
  expected: string;
  actual: string;
  fixable: boolean;
  reason: string;
  code?: string;
}

export interface ReconciliationFixRecord {
  taskId: string;
  kind: string;
  reason: string;
  operator: string;
  at: string;
  originalSnapshot: Record<string, unknown>;
}

export interface ReconcileFilters {
  status?: string;
  errorCode?: string;
  workspaceId?: string;
  userId?: string;
  taskId?: string;
  createdFrom?: Date;
  createdTo?: Date;
}

export interface ScanReconciliationOptions extends ReconcileFilters {
  limit?: number;
  offset?: number;
  autoFix?: boolean;
  operator?: string;
}

export interface ReconciliationScanResult {
  scanned: number;
  findingsCount: number;
  inconsistentCount: number;
  byKind: Partial<Record<ReconciliationKind, number>>;
  findings: ReconciliationFinding[];
  appliedFixes: ReconciliationFixRecord[];
  conflicts: number;
  autoFix: boolean;
  operator: string;
  /** 明确声明本轮对账能力边界，禁止过度宣称“余额已完整核对”。 */
  verificationScope: {
    ledgerStructure: boolean;
    amountEquation: boolean;
    accountBalanceAggregate: boolean;
  };
}

const SCAN_MAX_LIMIT = 1000;

function buildSettlementWhere(filters: ReconcileFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.status && filters.status !== "ALL") where.status = filters.status;
  if (filters.errorCode) where.errorCode = filters.errorCode;
  if (filters.workspaceId) where.workspaceId = filters.workspaceId;
  if (filters.userId) where.userId = filters.userId;
  if (filters.taskId) where.taskId = filters.taskId;
  if (filters.createdFrom || filters.createdTo) {
    where.createdAt = {
      ...(filters.createdFrom ? { gte: filters.createdFrom } : {}),
      ...(filters.createdTo ? { lte: filters.createdTo } : {}),
    };
  }
  return where;
}

interface TripleRow {
  taskId: string;
  userId: string;
  workspaceId: string;
  settlementStatus: string;
  settlementVersion: number;
  holdStatus: string | null;
  recoveryStatus: string | null;
  recoveryLeaseUntil: Date | null;
  holdPoints: bigint;
  releasedPoints: bigint;
  supplementPoints: bigint;
  actualPricePoints: bigint;
  monthlyTokenUsedIncremented: bigint;
  holdDetails: unknown;
  isUnlimited: boolean;
}

async function loadTriples(filters: ReconcileFilters, limit: number, offset: number): Promise<TripleRow[]> {
  const where = buildSettlementWhere(filters);
  const rows = await prisma.tokensettlement.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: offset,
    take: limit,
    select: {
      taskId: true,
      userId: true,
      workspaceId: true,
      status: true,
      settlementVersion: true,
      holdPoints: true,
      releasedPoints: true,
      supplementPoints: true,
      actualPricePoints: true,
      tokensettlementhold: {
        select: { status: true, holdDetails: true, monthlyTokenUsedIncremented: true },
      },
    },
  });

  const taskIds = rows.map((r) => r.taskId);
  const recoveries =
    taskIds.length > 0
      ? await prisma.tokensettlementrecovery.findMany({
          where: { taskId: { in: taskIds } },
          select: { taskId: true, status: true, leaseUntil: true },
        })
      : [];
  const recMap = new Map(recoveries.map((r) => [r.taskId, r]));

  return rows.map((r) => {
    const rec = recMap.get(r.taskId);
    const stored = parseStoredHoldDetails(r.tokensettlementhold?.holdDetails);
    return {
      taskId: r.taskId,
      userId: r.userId,
      workspaceId: r.workspaceId,
      settlementStatus: r.status,
      settlementVersion: r.settlementVersion,
      holdStatus: r.tokensettlementhold?.status ?? null,
      recoveryStatus: rec?.status ?? null,
      recoveryLeaseUntil: rec?.leaseUntil ?? null,
      holdPoints: r.holdPoints,
      releasedPoints: r.releasedPoints,
      supplementPoints: r.supplementPoints,
      actualPricePoints: r.actualPricePoints,
      monthlyTokenUsedIncremented: r.tokensettlementhold?.monthlyTokenUsedIncremented ?? BigInt(0),
      holdDetails: r.tokensettlementhold?.holdDetails ?? null,
      isUnlimited: Boolean(stored.isUnlimited),
    };
  });
}

/**
 * 合法租约判定：必须为非空、可解析为合法日期、且严格晚于 now。
 * PROCESSING + leaseUntil=null / 非法日期 / 过期日期 一律视为「无有效租约」。
 */
export function hasValidRecoveryLease(leaseUntil: Date | string | null | undefined, now: Date): boolean {
  if (leaseUntil === null || leaseUntil === undefined) return false;
  const t = new Date(leaseUntil).getTime();
  if (Number.isNaN(t)) return false;
  return t > now.getTime();
}

/** 纯函数：评估单条三表状态一致性（不做 IO，便于单测） */
export function evaluateTripleConsistency(row: {
  taskId: string;
  userId: string;
  workspaceId: string;
  settlementStatus: string;
  holdStatus: string | null;
  recoveryStatus: string | null;
  recoveryLeaseUntil?: Date | string | null;
  now?: Date;
}): ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  const now = row.now ?? new Date();
  const base = { taskId: row.taskId, userId: row.userId, workspaceId: row.workspaceId };

  if (row.holdStatus === null) {
    findings.push({
      ...base,
      kind: "HOLD_ROW_MISSING",
      severity: "HIGH",
      settlementStatus: row.settlementStatus,
      holdStatus: null,
      recoveryStatus: row.recoveryStatus,
      expected: "存在对应 tokensettlementhold 记录",
      actual: "缺失",
      fixable: false,
      reason: "结算主记录存在但预扣记录缺失，无法推断资金去向，禁止自动修复",
    });
  }

  const allowed = ALLOWED_TRIPLE[row.settlementStatus];
  if (allowed) {
    if (row.holdStatus !== null && !allowed.hold.includes(row.holdStatus as HoldStatus)) {
      const recoveryOkForFix =
        row.recoveryStatus === null ||
        row.recoveryStatus === row.settlementStatus ||
        (row.settlementStatus === "REQUIRES_REVIEW" &&
          (row.recoveryStatus === "PENDING" || row.recoveryStatus === "PROCESSING" || row.recoveryStatus === "FAILED"));
      findings.push({
        ...base,
        kind: "TRIPLE_STATUS_MISMATCH",
        severity: "MEDIUM",
        settlementStatus: row.settlementStatus,
        holdStatus: row.holdStatus,
        recoveryStatus: row.recoveryStatus,
        expected: `hold ∈ [${allowed.hold.join(",")}]`,
        actual: row.holdStatus,
        fixable: row.settlementStatus !== "HOLD" && recoveryOkForFix,
        reason: "预扣状态与结算状态不一致（状态层可 CAS 对齐，无资金副作用）",
      });
    }

    if (row.recoveryStatus !== null && !allowed.recovery.includes(row.recoveryStatus as RecoveryStatus)) {
      findings.push({
        ...base,
        kind: "RECOVERY_TERMINAL_MISMATCH",
        severity: "HIGH",
        settlementStatus: row.settlementStatus,
        holdStatus: row.holdStatus,
        recoveryStatus: row.recoveryStatus,
        expected: `recovery ∈ [${allowed.recovery.join(",")}] 或 null`,
        actual: row.recoveryStatus,
        fixable: false,
        reason: "恢复状态与结算状态矛盾，可能涉及资金结果，禁止自动修复",
      });
    }
  }

  // PROCESSING 无有效租约（null / 非法 / 过期）=> 卡死 Worker
  if (row.recoveryStatus === "PROCESSING" && !hasValidRecoveryLease(row.recoveryLeaseUntil, now)) {
    const leaseDesc =
      row.recoveryLeaseUntil === null || row.recoveryLeaseUntil === undefined
        ? "leaseUntil=null"
        : Number.isNaN(new Date(row.recoveryLeaseUntil).getTime())
          ? "leaseUntil 非法日期"
          : `leaseUntil=${new Date(row.recoveryLeaseUntil).toISOString()} 已过期`;
    findings.push({
      ...base,
      kind: "RECOVERY_STALE_PROCESSING",
      severity: "MEDIUM",
      settlementStatus: row.settlementStatus,
      holdStatus: row.holdStatus,
      recoveryStatus: row.recoveryStatus,
      expected: "PROCESSING 且租约未过期",
      actual: leaseDesc,
      fixable: false,
      reason: "恢复任务 PROCESSING 但无有效租约，需人工/Worker 重新认领",
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// 账户完整性（依据 holdDetails 实际分桶，不得要求无关账户）
// ---------------------------------------------------------------------------

interface RequiredAccounts {
  wallet: boolean;
  quota: boolean;
  member: boolean;
  buckets: string[];
}

export function requiredAccountsFromDetails(
  details: ConsumeDetail[],
  monthlyTokenUsedIncremented: bigint
): RequiredAccounts {
  const buckets = Array.from(new Set((details ?? []).map((d) => d.kind)));
  return {
    wallet: (details ?? []).some((d) => d.kind === "WALLET"),
    quota: (details ?? []).some((d) => d.kind === "WORKSPACE" || d.kind === "PERSONAL_GIFT"),
    member: (details ?? []).some((d) => d.kind === "MEMBER") || monthlyTokenUsedIncremented > BigInt(0),
    buckets,
  };
}

// ---------------------------------------------------------------------------
// 流水结构核对（退款 / 补扣逐条语义）
// ---------------------------------------------------------------------------

interface LedgerRow {
  id: string;
  taskId: string | null;
  direction: string;
  type: string;
  scope: string;
  userId: string | null;
  workspaceId: string | null;
  grantId: string | null;
  points: bigint;
  idempotencyKey: string | null;
}

interface GrantRow {
  id: string;
  scope: string;
  sourceType: string;
  sourceId: string | null;
  userId: string | null;
  workspaceId: string | null;
  status: string;
  expiresAt: Date | null;
}

/** 系统真实产生的补扣幂等键前缀（生产实际写入的两类） */
const SUPPLEMENT_PREFIXES = ["SETTLEMENT_SUPPLEMENT:", "ADMIN_REVIEW_SUPPLEMENT:"] as const;
/** 生产唯一真实存在的月度回滚 0 点 REFUND 标记键：REFUND_MODEL_FAILURE:{taskId}:MONTHLY */
const MONTHLY_MARKER_PREFIX = "REFUND_MODEL_FAILURE:";
const MONTHLY_MARKER_SUFFIX = ":MONTHLY";
/** 系统真实产生的退款幂等键/兜底 sourceId 前缀 */
const REFUND_PREFIXES = [
  "SETTLEMENT_RELEASE:",
  "SETTLEMENT_FAIL_RELEASE:",
  "ADMIN_REVIEW_RELEASE:",
  "ADMIN_REVIEW_SETTLE_REFUND:",
] as const;

function normalizeGrantId(x: string | null | undefined): string | null {
  return x && x.trim() !== "" ? x : null;
}

function isGrantExpired(g: GrantRow, now: Date): boolean {
  return g.status === "EXPIRED" || (g.expiresAt !== null && g.expiresAt.getTime() < now.getTime());
}

function grantOwnershipMatches(g: GrantRow, scope: string, userId: string, workspaceId: string): boolean {
  if (scope === "WALLET") return g.userId === userId;
  return g.workspaceId === workspaceId;
}

/** 解析退款幂等键：返回 { prefix, seqNum } 或 null（前缀非法/序号非数字） */
function parseRefundKey(key: string | null, taskId: string): { prefix: string; seqNum: number } | null {
  if (!key) return null;
  for (const p of REFUND_PREFIXES) {
    const full = `${p}${taskId}:`;
    if (key.startsWith(full)) {
      const seq = key.slice(full.length);
      if (/^\d+$/.test(seq)) return { prefix: p, seqNum: Number(seq) };
    }
  }
  return null;
}

/** 是否形如补扣幂等键（按基前缀判定，便于识别伪造 taskId/前缀） */
function isSupplementKeyLike(key: string | null): boolean {
  if (!key) return false;
  return SUPPLEMENT_PREFIXES.some((p) => key.startsWith(p));
}

/** 解析补扣幂等键：{SETTLEMENT_SUPPLEMENT|ADMIN_REVIEW_SUPPLEMENT}:{taskId}#{正整数} */
function parseSupplementKey(key: string | null, taskId: string): { prefix: string; seqNum: number } | null {
  if (!key) return null;
  for (const p of SUPPLEMENT_PREFIXES) {
    const full = `${p}${taskId}#`;
    if (key.startsWith(full)) {
      const seq = key.slice(full.length);
      if (/^\d+$/.test(seq) && Number(seq) >= 1) return { prefix: p, seqNum: Number(seq) };
    }
  }
  return null;
}

/** 生产真实的月度回滚 0 点标记键 */
function monthlyMarkerKey(taskId: string): string {
  return `${MONTHLY_MARKER_PREFIX}${taskId}${MONTHLY_MARKER_SUFFIX}`;
}

interface TaskLedgerFinding {
  kind: ReconciliationKind;
  severity: ReconciliationSeverity;
  expected: string;
  actual: string;
  reason: string;
  code: string;
}

function reconcileTaskLedgers(args: {
  task: TripleRow;
  details: ConsumeDetail[];
  rows: LedgerRow[];
  grantById: Map<string, GrantRow>;
  grantBySourceId: Map<string, GrantRow>;
  now: Date;
}): TaskLedgerFinding[] {
  const { task, details, rows, grantById, grantBySourceId, now } = args;
  const out: TaskLedgerFinding[] = [];
  const push = (f: TaskLedgerFinding) => out.push(f);

  const refunds: LedgerRow[] = [];
  const zeroRefunds: LedgerRow[] = [];
  const supplements: LedgerRow[] = [];
  const holdConsumes: LedgerRow[] = [];
  for (const l of rows) {
    if (l.type === "REFUND") {
      // 0 点退款一律进入严格校验分支，禁止无差别忽略
      if (l.points === BigInt(0)) zeroRefunds.push(l);
      else refunds.push(l);
    } else if (l.type === "CONSUME" && isSupplementKeyLike(l.idempotencyKey)) {
      supplements.push(l);
    } else if (l.type === "CONSUME") {
      holdConsumes.push(l);
    }
  }

  const sumOf = (arr: LedgerRow[]) => arr.reduce((s, l) => s + l.points, BigInt(0));
  const holdConsumeSum = sumOf(holdConsumes);
  const supplementSum = sumOf(supplements);
  const refundSum = sumOf(refunds);

  // (a) 消费求和（非无限额度）
  if (!task.isUnlimited && task.holdPoints > BigInt(0) && holdConsumeSum !== task.holdPoints) {
    push({
      kind: "LEDGER_MISMATCH",
      severity: "HIGH",
      expected: `预扣消费流水合计 = ${task.holdPoints.toString()}`,
      actual: holdConsumeSum.toString(),
      reason: "[流水结构] 预扣消费流水合计与 holdPoints 不一致",
      code: "CONSUME_SUM_MISMATCH",
    });
  }
  // (b) 补扣求和
  if (supplementSum !== task.supplementPoints) {
    push({
      kind: "LEDGER_MISMATCH",
      severity: "HIGH",
      expected: `补扣流水合计 = ${task.supplementPoints.toString()}`,
      actual: supplementSum.toString(),
      reason: "[金额方程] 补扣流水合计与 supplementPoints 不一致",
      code: "SUPPLEMENT_SUM_MISMATCH",
    });
  }
  // (c) 退款求和（不含 0 点月度标记）
  if (refundSum !== task.releasedPoints) {
    push({
      kind: "LEDGER_MISMATCH",
      severity: "HIGH",
      expected: `退款流水合计(不含 0 点标记) = ${task.releasedPoints.toString()}`,
      actual: refundSum.toString(),
      reason: "[金额方程] 退款流水合计与 releasedPoints 不一致",
      code: "REFUND_SUM_MISMATCH",
    });
  }

  // (d) 退款逐条语义
  const refundSeqs = new Map<string, number>();
  for (const L of refunds) {
    if (L.direction !== "IN") {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: "REFUND direction=IN", actual: L.direction, reason: "[流水结构] 退款流水方向必须为 IN", code: "REFUND_DIRECTION_INVALID" });
    }
    if (L.points <= BigInt(0)) {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: "REFUND points>0", actual: L.points.toString(), reason: "[流水结构] 退款流水点数必须为正", code: "REFUND_POINTS_NONPOSITIVE" });
    }
    if (L.userId !== task.userId || L.workspaceId !== task.workspaceId) {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: `user=${task.userId}, workspace=${task.workspaceId}`, actual: `user=${L.userId}, workspace=${L.workspaceId}`, reason: "[流水结构] 退款流水归属与结算记录不一致", code: "REFUND_ACCOUNT_MISMATCH" });
    }
    if (L.taskId !== task.taskId) {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: `taskId=${task.taskId}`, actual: `taskId=${L.taskId ?? "null"}`, reason: "[流水结构] 退款流水 taskId 与结算记录不一致", code: "REFUND_TASK_MISMATCH" });
    }

    const parsed = parseRefundKey(L.idempotencyKey, task.taskId);
    if (parsed === null) {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: `幂等键 ∈ [${REFUND_PREFIXES.join(",")}]${task.taskId}:<序号>`, actual: L.idempotencyKey ?? "null", reason: "[流水结构] 退款流水幂等键前缀/序号非法（疑似伪造）", code: "REFUND_IDEMPOTENCY_INVALID" });
    } else {
      const seqKey = `${parsed.prefix}|${parsed.seqNum}`;
      refundSeqs.set(seqKey, (refundSeqs.get(seqKey) ?? 0) + 1);
    }

    // 分桶匹配：MEMBER => scope=WORKSPACE & grantId=null；非 MEMBER => scope+grantId 与某分桶一致
    const memberCase = L.scope === "WORKSPACE" && normalizeGrantId(L.grantId) === null;
    const matched = memberCase
      ? details.find((d) => d.kind === "MEMBER")
      : details.find(
          (d) => d.kind !== "MEMBER" && d.scope === L.scope && normalizeGrantId(d.grantId) === normalizeGrantId(L.grantId)
        );
    if (!matched) {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: "退款 scope/grantId 匹配 holdDetails 分桶", actual: `scope=${L.scope}, grantId=${L.grantId ?? "null"}`, reason: "[流水结构] 退款流水 scope/grantId 与 holdDetails 分桶不匹配", code: "REFUND_SCOPE_GRANT_MISMATCH" });
    } else if (!memberCase) {
      const gid = normalizeGrantId(L.grantId);
      const g = gid ? grantById.get(gid) ?? null : null;
      if (g && !isGrantExpired(g, now)) {
        if (g.scope !== L.scope || !grantOwnershipMatches(g, L.scope, task.userId, task.workspaceId)) {
          push({ kind: "GRANT_MISMATCH", severity: "HIGH", expected: "原 grant scope/归属正确", actual: `scope=${g.scope}, user=${g.userId}, workspace=${g.workspaceId}`, reason: "[流水结构] 退款引用的原 grant 归属或 scope 错误", code: "REFUND_GRANT_MISMATCH" });
        }
      } else {
        // 原 grant 缺失/过期：必须有同 sourceId 的兜底退款 grant（sourceId === 幂等键）
        const fb = L.idempotencyKey ? grantBySourceId.get(L.idempotencyKey) ?? null : null;
        if (!fb) {
          push({ kind: "GRANT_MISMATCH", severity: "HIGH", expected: `原 grant 存在或兜底 grant sourceId=${L.idempotencyKey ?? "null"}`, actual: "均不存在", reason: "[流水结构] 退款既无有效原 grant，也无匹配的兜底退款 grant（不得因 grantId=null 判定合法）", code: "REFUND_GRANT_MISSING" });
        } else if (
          fb.sourceType !== "REFUND" ||
          fb.scope !== L.scope ||
          !grantOwnershipMatches(fb, L.scope, task.userId, task.workspaceId)
        ) {
          push({ kind: "GRANT_MISMATCH", severity: "HIGH", expected: "兜底 grant sourceType=REFUND 且 scope/归属正确", actual: `sourceType=${fb.sourceType}, scope=${fb.scope}, user=${fb.userId}, workspace=${fb.workspaceId}`, reason: "[流水结构] 兜底退款 grant 的 sourceType/scope/归属错误", code: "REFUND_FALLBACK_GRANT_MISMATCH" });
        }
      }
    }
  }
  for (const [seqKey, count] of refundSeqs) {
    if (count > 1) {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: "退款幂等键序号唯一", actual: `${seqKey} 出现 ${count} 次`, reason: "[流水结构] 退款流水幂等键序号重复", code: "REFUND_IDEMPOTENCY_DUPLICATE" });
    }
  }

  // (d2) 0 点退款：只接受生产真实存在的月度回滚标记，未知/畸形/重复一律报错
  const markerCounts = new Map<string, number>();
  for (const L of zeroRefunds) {
    const expected = monthlyMarkerKey(task.taskId);
    if (L.idempotencyKey !== expected) {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: `0 点退款仅允许月度回滚标记 ${expected}`, actual: L.idempotencyKey ?? "null", reason: "[流水结构] 未知零点退款流水（生产不存在此写入）", code: "REFUND_ZERO_UNKNOWN" });
      continue;
    }
    markerCounts.set(expected, (markerCounts.get(expected) ?? 0) + 1);
    if (L.direction !== "IN") {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: "月度标记 direction=IN", actual: L.direction, reason: "[流水结构] 月度回滚标记方向非法", code: "MONTHLY_MARKER_DIRECTION_INVALID" });
    }
    if (L.scope !== "WORKSPACE" || normalizeGrantId(L.grantId) !== null) {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: "月度标记 scope=WORKSPACE 且 grantId=null", actual: `scope=${L.scope}, grantId=${L.grantId ?? "null"}`, reason: "[流水结构] 月度回滚标记 scope/grantId 非法", code: "MONTHLY_MARKER_SHAPE_INVALID" });
    }
    if (L.userId !== task.userId || L.workspaceId !== task.workspaceId || L.taskId !== task.taskId) {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: "月度标记 user/workspace/task 与结算记录完全一致", actual: `user=${L.userId}, workspace=${L.workspaceId}, task=${L.taskId ?? "null"}`, reason: "[流水结构] 月度回滚标记归属与结算记录不一致", code: "MONTHLY_MARKER_ACCOUNT_MISMATCH" });
    }
  }
  for (const [key, count] of markerCounts) {
    if (count > 1) {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: "月度回滚标记全任务唯一", actual: `${key} 出现 ${count} 次`, reason: "[流水结构] 月度回滚标记重复", code: "MONTHLY_MARKER_DUPLICATE" });
    }
  }

  // (e) 补扣逐条语义
  const supplSeqs = new Map<string, number>();
  for (const L of supplements) {
    if (L.direction !== "OUT") {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: "补扣 direction=OUT", actual: L.direction, reason: "[流水结构] 补扣流水方向必须为 OUT", code: "SUPPLEMENT_DIRECTION_INVALID" });
    }
    if (L.type !== "CONSUME") {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: "补扣 type=CONSUME", actual: L.type, reason: "[流水结构] 补扣流水类型必须为 CONSUME", code: "SUPPLEMENT_TYPE_INVALID" });
    }
    if (L.points <= BigInt(0)) {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: "补扣 points>0", actual: L.points.toString(), reason: "[流水结构] 补扣流水点数必须为正", code: "SUPPLEMENT_POINTS_NONPOSITIVE" });
    }
    if (L.userId !== task.userId || L.workspaceId !== task.workspaceId) {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: `user=${task.userId}, workspace=${task.workspaceId}`, actual: `user=${L.userId}, workspace=${L.workspaceId}`, reason: "[流水结构] 补扣流水归属与结算记录不一致", code: "SUPPLEMENT_ACCOUNT_MISMATCH" });
    }
    if (L.taskId !== task.taskId) {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: `taskId=${task.taskId}`, actual: `taskId=${L.taskId ?? "null"}`, reason: "[流水结构] 补扣流水 taskId 与结算记录不一致", code: "SUPPLEMENT_TASK_MISMATCH" });
    }

    const parsed = parseSupplementKey(L.idempotencyKey, task.taskId);
    if (parsed === null) {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: `幂等键 ∈ [${SUPPLEMENT_PREFIXES.join(",")}]${task.taskId}#<正整数序号>`, actual: L.idempotencyKey ?? "null", reason: "[流水结构] 补扣流水幂等键前缀/taskId/序号非法（疑似伪造）", code: "SUPPLEMENT_IDEMPOTENCY_INVALID" });
    } else {
      const key = `${parsed.prefix}|${parsed.seqNum}`;
      supplSeqs.set(key, (supplSeqs.get(key) ?? 0) + 1);
    }

    const gid = normalizeGrantId(L.grantId);
    if (!gid) {
      push({ kind: "GRANT_MISMATCH", severity: "HIGH", expected: "补扣必须关联存在的 pointgrant", actual: "grantId=null", reason: "[流水结构] 补扣流水必须关联有效 grant", code: "SUPPLEMENT_GRANT_MISSING" });
    } else {
      const g = grantById.get(gid);
      if (!g) {
        push({ kind: "GRANT_MISMATCH", severity: "HIGH", expected: "补扣 grant 存在", actual: `缺失 grantId=${gid}`, reason: "[流水结构] 补扣引用的 grant 不存在", code: "SUPPLEMENT_GRANT_MISSING" });
      } else if (g.scope !== L.scope || !grantOwnershipMatches(g, L.scope, task.userId, task.workspaceId)) {
        push({ kind: "GRANT_MISMATCH", severity: "HIGH", expected: "补扣 grant scope/归属正确", actual: `scope=${g.scope}, user=${g.userId}, workspace=${g.workspaceId}`, reason: "[流水结构] 补扣引用的 grant 归属或 scope 错误", code: "SUPPLEMENT_SCOPE_GRANT_MISMATCH" });
      }
    }
  }
  for (const [seqNum, count] of supplSeqs) {
    if (count > 1) {
      push({ kind: "LEDGER_MISMATCH", severity: "HIGH", expected: "补扣幂等键序号唯一", actual: `序号 ${seqNum} 出现 ${count} 次`, reason: "[流水结构] 补扣流水幂等键序号重复", code: "SUPPLEMENT_IDEMPOTENCY_DUPLICATE" });
    }
  }

  // (f) 金额方程（终态强断言）
  if (task.settlementStatus === "SETTLED" || task.settlementStatus === "RELEASED") {
    const expectedActual = task.holdPoints - task.releasedPoints + task.supplementPoints;
    if (task.actualPricePoints !== expectedActual) {
      push({
        kind: "AMOUNT_EQUATION_MISMATCH",
        severity: "HIGH",
        expected: `actualPricePoints = holdPoints - releasedPoints + supplementPoints = ${expectedActual.toString()}`,
        actual: task.actualPricePoints.toString(),
        reason: "[金额方程] 结算金额方程不成立",
        code: "AMOUNT_EQUATION_MISMATCH",
      });
    }
  }

  // (g) 月度用量：存在 MEMBER 分桶时，MEMBER 明细合计必须等于月度增量
  const memberDetailSum = details.filter((d) => d.kind === "MEMBER").reduce((s, d) => s + BigInt(d.points), BigInt(0));
  if (details.some((d) => d.kind === "MEMBER") && memberDetailSum !== task.monthlyTokenUsedIncremented) {
    push({
      kind: "GRANT_MISMATCH",
      severity: "MEDIUM",
      expected: `MEMBER 明细合计 = 月度用量增量 (${task.monthlyTokenUsedIncremented.toString()})`,
      actual: memberDetailSum.toString(),
      reason: "[流水结构] MEMBER 分桶消耗与月度用量增量不一致，无法证明月度回滚正确",
      code: "MONTHLY_ROLLBACK_MISMATCH",
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// autoFix：独立事务 + 固定锁序 + 锁内重读比对
// ---------------------------------------------------------------------------

export interface HoldRepairSnapshot {
  taskId: string;
  settlementStatus: string;
  settlementVersion: number;
  holdStatus: string;
  recoveryStatus: string | null;
}

export interface HoldRepairResult {
  applied: boolean;
  conflict: boolean;
  reason: string;
  message: string;
}

export async function repairHoldStatusWithSnapshot(
  snapshot: HoldRepairSnapshot,
  opts: { operator?: string; reason: string }
): Promise<HoldRepairResult> {
  const operator = opts.operator || "reconciliation-scanner";
  const now = new Date();

  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const settles = await tx.$queryRaw<Array<{ status: string; settlementVersion: number }>>`
        SELECT \`status\`, \`settlementVersion\` FROM \`tokensettlement\` WHERE \`taskId\` = ${snapshot.taskId} FOR UPDATE
      `;
      const holds = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT \`status\` FROM \`tokensettlementhold\` WHERE \`taskId\` = ${snapshot.taskId} FOR UPDATE
      `;
      const recs = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT \`status\` FROM \`tokensettlementrecovery\` WHERE \`taskId\` = ${snapshot.taskId} FOR UPDATE
      `;

      if (settles.length === 0 || holds.length === 0) {
        return { applied: false, conflict: true, reason: "MISSING_RECORD", message: "主记录缺失，放弃修复" };
      }
      const s = settles[0];
      const h = holds[0];
      const r = recs[0]?.status ?? null;

      if (
        s.status !== snapshot.settlementStatus ||
        s.settlementVersion !== snapshot.settlementVersion ||
        h.status !== snapshot.holdStatus ||
        r !== snapshot.recoveryStatus
      ) {
        return {
          applied: false,
          conflict: true,
          reason: "STATE_CHANGED",
          message: "状态或 settlementVersion 已变化，返回并发冲突，不修复",
        };
      }

      if (s.status === "HOLD" || h.status === s.status) {
        return { applied: false, conflict: false, reason: "NO_OP", message: "无需修复" };
      }

      const target = s.status;
      const upd = await tx.$executeRaw`
        UPDATE \`tokensettlementhold\`
        SET \`status\` = ${target}, \`statusChangedAt\` = ${now}, \`updatedAt\` = ${now}
        WHERE \`taskId\` = ${snapshot.taskId} AND \`status\` = ${snapshot.holdStatus}
      `;
      if (upd !== 1) {
        return { applied: false, conflict: true, reason: "CAS_FAILED", message: "hold CAS 影响行数异常，整笔回滚" };
      }

      await tx.$executeRaw`
        UPDATE \`tokensettlement\`
        SET \`auditMessage\` = ${buildAudit("REPAIR_HOLD_STATUS", operator, opts.reason, { ...snapshot }, now)},
            \`updatedAt\` = ${now}
        WHERE \`taskId\` = ${snapshot.taskId}
      `;

      return { applied: true, conflict: false, reason: "APPLIED", message: `hold ${snapshot.holdStatus} -> ${target}` };
    })
  );
}

// ---------------------------------------------------------------------------
// 对账扫描器
// ---------------------------------------------------------------------------

export async function scanSettlementReconciliation(
  opts: ScanReconciliationOptions = {}
): Promise<ReconciliationScanResult> {
  const autoFix = opts.autoFix === true;
  const operator = opts.operator || (autoFix ? "reconciliation-scanner" : "reconciliation-dry-run");
  const now = new Date();
  const limit = Math.min(SCAN_MAX_LIMIT, Math.max(1, Math.floor(Number(opts.limit) || 200)));
  const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));

  const triples = await loadTriples(opts, limit, offset);
  const findings: ReconciliationFinding[] = [];
  const appliedFixes: ReconciliationFixRecord[] = [];
  let conflicts = 0;
  const push = (...fs: ReconciliationFinding[]) => findings.push(...fs);

  const userIds = Array.from(new Set(triples.map((t) => t.userId)));
  const workspaceIds = Array.from(new Set(triples.map((t) => t.workspaceId)));
  const taskIds = triples.map((t) => t.taskId);

  const [walletRows, quotaRows, memberRows, ledgerRows] = await Promise.all([
    userIds.length ? prisma.userwallet.findMany({ where: { userId: { in: userIds } }, select: { userId: true } }) : Promise.resolve([]),
    workspaceIds.length
      ? prisma.workspacequota.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { workspaceId: true } })
      : Promise.resolve([]),
    workspaceIds.length
      ? prisma.workspacemember.findMany({ where: { workspaceId: { in: workspaceIds } }, select: { userId: true, workspaceId: true } })
      : Promise.resolve([]),
    taskIds.length
      ? prisma.pointledger.findMany({
          where: { taskId: { in: taskIds } },
          select: {
            id: true,
            taskId: true,
            direction: true,
            type: true,
            scope: true,
            userId: true,
            workspaceId: true,
            grantId: true,
            points: true,
            idempotencyKey: true,
          },
        })
      : Promise.resolve([] as LedgerRow[]),
  ]);
  const walletSet = new Set(walletRows.map((r) => r.userId));
  const quotaSet = new Set(quotaRows.map((r) => r.workspaceId));
  const memberKey = (u: string, w: string) => `${u}::${w}`;
  const memberSet = new Set(memberRows.map((r) => memberKey(r.userId, r.workspaceId)));

  const ledgersByTask = new Map<string, LedgerRow[]>();
  const grantIds = new Set<string>();
  const fallbackSourceIds = new Set<string>();
  for (const l of ledgerRows as LedgerRow[]) {
    if (!l.taskId) continue;
    const list = ledgersByTask.get(l.taskId) ?? [];
    list.push(l);
    ledgersByTask.set(l.taskId, list);
    if (l.grantId) grantIds.add(l.grantId);
    // 退款兜底 grant 的 sourceId 等于退款幂等键
    if (l.type === "REFUND" && l.idempotencyKey) fallbackSourceIds.add(l.idempotencyKey);
  }

  const grantOr: Prisma.pointgrantWhereInput[] = [];
  if (grantIds.size > 0) grantOr.push({ id: { in: Array.from(grantIds) } });
  if (fallbackSourceIds.size > 0) grantOr.push({ sourceId: { in: Array.from(fallbackSourceIds) } });
  const grants: GrantRow[] =
    grantOr.length > 0
      ? await prisma.pointgrant.findMany({
          where: { OR: grantOr },
          select: { id: true, scope: true, sourceType: true, sourceId: true, userId: true, workspaceId: true, status: true, expiresAt: true },
        })
      : [];
  const grantById = new Map<string, GrantRow>(grants.map((g) => [g.id, g]));
  const grantBySourceId = new Map<string, GrantRow>();
  for (const g of grants) if (g.sourceId) grantBySourceId.set(g.sourceId, g);

  const detailsByTask = new Map<string, ReturnType<typeof parseStoredHoldDetails>>();
  for (const t of triples) detailsByTask.set(t.taskId, parseStoredHoldDetails(t.holdDetails));

  const consumeErrors: Array<{ taskId: string; code: string; message: string }> = [];
  if (taskIds.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const t of triples) {
        const stored = detailsByTask.get(t.taskId)!;
        try {
          await verifyConsumeLedgersInTx(tx, {
            userId: t.userId,
            workspaceId: t.workspaceId,
            taskId: t.taskId,
            holdPoints: t.holdPoints,
            details: stored.details,
            consumeLedgerIds: stored.consumeLedgerIds,
            consumeIdempotencyKey: stored.consumeIdempotencyKey,
            isUnlimited: stored.isUnlimited,
          });
        } catch (e) {
          if (e instanceof TokenSettlementError) consumeErrors.push({ taskId: t.taskId, code: e.code, message: e.message });
          else throw e;
        }
      }
    });
  }

  for (const t of triples) {
    const base = {
      taskId: t.taskId,
      userId: t.userId,
      workspaceId: t.workspaceId,
      settlementStatus: t.settlementStatus,
      holdStatus: t.holdStatus,
      recoveryStatus: t.recoveryStatus,
    };

    push(...evaluateTripleConsistency({ ...base, recoveryLeaseUntil: t.recoveryLeaseUntil, now }));

    const stored = detailsByTask.get(t.taskId)!;
    const reqAcc = requiredAccountsFromDetails(stored.details, t.monthlyTokenUsedIncremented);
    const missing: string[] = [];
    if (reqAcc.wallet && !walletSet.has(t.userId)) missing.push("userwallet(WALLET 分桶)");
    if (reqAcc.quota && !quotaSet.has(t.workspaceId)) missing.push("workspacequota(WORKSPACE/PERSONAL_GIFT 分桶)");
    if (reqAcc.member && !memberSet.has(memberKey(t.userId, t.workspaceId)))
      missing.push("workspacemember(MEMBER 分桶或月度用量>0)");
    if (missing.length > 0) {
      push({
        ...base,
        kind: "ACCOUNT_MISSING",
        severity: "HIGH",
        expected: `按分桶 [${reqAcc.buckets.join(",")}] 应存在对应账户`,
        actual: `缺失: ${missing.join(",")}`,
        fixable: false,
        reason: "[账户主数据] 按实际分桶所需的账户缺失，禁止自动修复",
      });
    }

    for (const ce of consumeErrors.filter((e) => e.taskId === t.taskId)) {
      push({
        ...base,
        kind: "LEDGER_MISMATCH",
        severity: "HIGH",
        expected: "consumeLedgerIds 存在/唯一/逐条匹配 holdDetails，字段一致",
        actual: ce.code,
        fixable: false,
        reason: `[流水结构] 消费流水/明细校验失败：${ce.message}`,
        code: ce.code,
      });
    }

    const taskFindings = reconcileTaskLedgers({
      task: t,
      details: stored.details,
      rows: ledgersByTask.get(t.taskId) ?? [],
      grantById,
      grantBySourceId,
      now,
    });
    for (const tf of taskFindings) {
      push({ ...base, ...tf, fixable: false });
    }

    if (autoFix && t.holdStatus !== null) {
      const fixableFinding = findings.find(
        (f) => f.taskId === t.taskId && f.kind === "TRIPLE_STATUS_MISMATCH" && f.fixable
      );
      if (fixableFinding) {
        const result = await repairHoldStatusWithSnapshot(
          {
            taskId: t.taskId,
            settlementStatus: t.settlementStatus,
            settlementVersion: t.settlementVersion,
            holdStatus: t.holdStatus,
            recoveryStatus: t.recoveryStatus,
          },
          { operator, reason: fixableFinding.reason }
        );
        if (result.applied) {
          appliedFixes.push({
            taskId: t.taskId,
            kind: "REPAIR_HOLD_STATUS",
            reason: fixableFinding.reason,
            operator,
            at: now.toISOString(),
            originalSnapshot: {
              settlementStatus: t.settlementStatus,
              settlementVersion: t.settlementVersion,
              holdStatus: t.holdStatus,
              recoveryStatus: t.recoveryStatus,
            },
          });
        } else if (result.conflict) {
          conflicts++;
        }
      }
    }
  }

  const byKind: Partial<Record<ReconciliationKind, number>> = {};
  for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;

  return {
    scanned: triples.length,
    findingsCount: findings.length,
    inconsistentCount: new Set(findings.map((f) => f.taskId)).size,
    byKind,
    findings,
    appliedFixes,
    conflicts,
    autoFix,
    operator,
    verificationScope: {
      // 本轮已实现前两项；第三项（当前账户余额聚合对账）未实现，禁止宣称余额已完整核对
      ledgerStructure: true,
      amountEquation: true,
      accountBalanceAggregate: false,
    },
  };
}

function buildAudit(
  kind: string,
  operator: string,
  reason: string,
  snapshot: Record<string, unknown>,
  at: Date
): string {
  return `[RECON:${kind}] operator=${operator} at=${at.toISOString()} reason=${reason} snapshot=${JSON.stringify(
    snapshot
  )}`;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < 3 && isRetryableP2034(err)) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 5 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export interface ReconciliationRecord {
  taskId: string;
  userId: string;
  workspaceId: string;
  settlementStatus: string;
  holdStatus: string | null;
  recoveryStatus: string | null;
  updatedAt: string;
  consistent: boolean;
  findings: ReconciliationFinding[];
}

export interface ListReconciliationResult {
  records: ReconciliationRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  findingsTotal: number;
}

export async function listReconciliationRecords(opts: {
  filters?: ReconcileFilters;
  page?: number;
  pageSize?: number;
  includeConsistent?: boolean;
}): Promise<ListReconciliationResult> {
  const filters = opts.filters ?? {};
  const page = Math.max(1, Math.floor(Number(opts.page) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(opts.pageSize) || 20)));
  const includeConsistent = opts.includeConsistent === true;
  const where = buildSettlementWhere(filters);

  const [total, rows] = await Promise.all([
    prisma.tokensettlement.count({ where }),
    prisma.tokensettlement.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        taskId: true,
        userId: true,
        workspaceId: true,
        status: true,
        updatedAt: true,
        tokensettlementhold: { select: { status: true } },
      },
    }),
  ]);

  const taskIds = rows.map((r) => r.taskId);
  const recoveries =
    taskIds.length > 0
      ? await prisma.tokensettlementrecovery.findMany({ where: { taskId: { in: taskIds } }, select: { taskId: true, status: true } })
      : [];
  const recMap = new Map(recoveries.map((r) => [r.taskId, r.status]));

  const scan = await scanSettlementReconciliation({
    ...filters,
    limit: pageSize,
    offset: (page - 1) * pageSize,
    autoFix: false,
  });
  const findingsByTask = new Map<string, ReconciliationFinding[]>();
  for (const f of scan.findings) {
    const list = findingsByTask.get(f.taskId) ?? [];
    list.push(f);
    findingsByTask.set(f.taskId, list);
  }

  const allRecords: ReconciliationRecord[] = rows.map((r) => {
    const findings = findingsByTask.get(r.taskId) ?? [];
    return {
      taskId: r.taskId,
      userId: r.userId,
      workspaceId: r.workspaceId,
      settlementStatus: r.status,
      holdStatus: r.tokensettlementhold?.status ?? null,
      recoveryStatus: recMap.get(r.taskId) ?? null,
      updatedAt: r.updatedAt.toISOString(),
      consistent: findings.length === 0,
      findings,
    };
  });

  const records = includeConsistent ? allRecords : allRecords.filter((r) => !r.consistent);

  return {
    records,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    findingsTotal: scan.findingsCount,
  };
}

// ---------------------------------------------------------------------------
// 运营统计（全部 DB 派生，不写死，不输出密钥/隐私）
// ---------------------------------------------------------------------------

export interface SettlementOperationalStats {
  generatedAt: string;
  recoveryStatusCounts: {
    pending: number;
    processing: number;
    failed: number;
    requiresReview: number;
    settled: number;
    released: number;
  };
  settlementStatusCounts: {
    hold: number;
    settled: number;
    released: number;
    requiresReview: number;
  };
  anomalies: {
    /** 名称语义：包含「重试错误标记」的记录数（P2034 / deadlock / 写冲突），并非真实重试次数。 */
    retryErrorMarkerCount: number;
    retryErrorMarkerLabel: string;
    recoveryTimeoutCount: number;
    accountMissingCount: number;
    priceMissingCount: number;
    recoveryRetryTotal: number;
  };
}

const ACCOUNT_MISSING_CODES = ["REFUND_ACCOUNT_NOT_FOUND", "ACCOUNT_RECONCILIATION_REQUIRED"];
const PRICE_MISSING_CODES = ["PRICING_SNAPSHOT_MISSING", "PRICE_NOT_CONFIGURED"];

export async function getSettlementOperationalStats(filters: ReconcileFilters = {}): Promise<SettlementOperationalStats> {
  const now = new Date();
  const settlementWhere = buildSettlementWhere(filters);
  const userFilter = filters.userId ? { userId: filters.userId } : {};
  const wsFilter = filters.workspaceId ? { workspaceId: filters.workspaceId } : {};
  const recoveryBase = { ...userFilter, ...wsFilter };

  const [
    rPending,
    rProcessing,
    rFailed,
    rReview,
    rSettled,
    rReleased,
    sHold,
    sSettled,
    sReleased,
    sReview,
    recoveryTimeoutCount,
    accountMissingSettle,
    accountMissingRecovery,
    priceMissingCount,
    retryAgg,
    retryMarkerRecovery,
    retryMarkerSettle,
  ] = await Promise.all([
    prisma.tokensettlementrecovery.count({ where: { ...recoveryBase, status: "PENDING" } }),
    prisma.tokensettlementrecovery.count({ where: { ...recoveryBase, status: "PROCESSING" } }),
    prisma.tokensettlementrecovery.count({ where: { ...recoveryBase, status: "FAILED" } }),
    prisma.tokensettlementrecovery.count({ where: { ...recoveryBase, status: "REQUIRES_REVIEW" } }),
    prisma.tokensettlementrecovery.count({ where: { ...recoveryBase, status: "SETTLED" } }),
    prisma.tokensettlementrecovery.count({ where: { ...recoveryBase, status: "RELEASED" } }),
    prisma.tokensettlement.count({ where: { ...settlementWhere, status: "HOLD" } }),
    prisma.tokensettlement.count({ where: { ...settlementWhere, status: "SETTLED" } }),
    prisma.tokensettlement.count({ where: { ...settlementWhere, status: "RELEASED" } }),
    prisma.tokensettlement.count({ where: { ...settlementWhere, status: "REQUIRES_REVIEW" } }),
    prisma.tokensettlementrecovery.count({ where: { ...recoveryBase, status: "PROCESSING", leaseUntil: { lt: now } } }),
    prisma.tokensettlement.count({ where: { ...settlementWhere, errorCode: { in: ACCOUNT_MISSING_CODES } } }),
    prisma.tokensettlementrecovery.count({
      where: {
        ...recoveryBase,
        OR: [{ lastError: { contains: "REFUND_ACCOUNT_NOT_FOUND" } }, { lastError: { contains: "ACCOUNT_RECONCILIATION_REQUIRED" } }],
      },
    }),
    prisma.tokensettlement.count({ where: { ...settlementWhere, errorCode: { in: PRICE_MISSING_CODES } } }),
    prisma.tokensettlementrecovery.aggregate({ where: recoveryBase, _sum: { retryCount: true } }),
    prisma.tokensettlementrecovery.count({
      where: {
        ...recoveryBase,
        OR: [{ lastError: { contains: "P2034" } }, { lastError: { contains: "deadlock" } }, { lastError: { contains: "写冲突" } }],
      },
    }),
    prisma.tokensettlement.count({
      where: { ...settlementWhere, OR: [{ auditMessage: { contains: "P2034" } }, { auditMessage: { contains: "deadlock" } }] },
    }),
  ]);

  return {
    generatedAt: now.toISOString(),
    recoveryStatusCounts: {
      pending: rPending,
      processing: rProcessing,
      failed: rFailed,
      requiresReview: rReview,
      settled: rSettled,
      released: rReleased,
    },
    settlementStatusCounts: {
      hold: sHold,
      settled: sSettled,
      released: sReleased,
      requiresReview: sReview,
    },
    anomalies: {
      retryErrorMarkerCount: retryMarkerRecovery + retryMarkerSettle,
      retryErrorMarkerLabel: "包含重试错误标记的记录数（非真实重试次数）",
      recoveryTimeoutCount,
      accountMissingCount: accountMissingSettle + accountMissingRecovery,
      priceMissingCount,
      recoveryRetryTotal: retryAgg._sum.retryCount ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// 管理员运营动作（retry / release / settle / mark-review），带校验与幂等
// ---------------------------------------------------------------------------

export type AdminSettlementActionType = "retry" | "release" | "settle" | "mark-review";

export interface AdminSettlementActionParams {
  taskId: string;
  action: AdminSettlementActionType;
  adminUserId: string;
  reason: string;
  actualPoints?: number | bigint;
  expectedClaimToken?: string | null;
  expectedSettlementVersion?: number | null;
  expectedStatus?: string | null;
}

export interface AdminSettlementActionResult {
  taskId: string;
  action: AdminSettlementActionType;
  status: string;
  applied: boolean;
  idempotent: boolean;
  message: string;
}

const ASSIGNABLE_ACTIONS: readonly AdminSettlementActionType[] = ["retry", "release", "settle", "mark-review"];

export function isAdminSettlementAction(v: unknown): v is AdminSettlementActionType {
  return typeof v === "string" && (ASSIGNABLE_ACTIONS as readonly string[]).includes(v);
}

export async function adminSettlementAction(params: AdminSettlementActionParams): Promise<AdminSettlementActionResult> {
  const { taskId, action, adminUserId, reason } = params;
  if (!isAdminSettlementAction(action)) {
    throw new TokenSettlementError("INVALID_ACTION_TYPE", `不支持的操作类型: ${String(action)}`);
  }
  if (!reason || reason.trim() === "") {
    throw new TokenSettlementError("INVALID_POINTS_OR_REASON", "必须提供非空操作原因 reason");
  }

  if (action === "release" || action === "settle") {
    await assertAdminActionGuards(params);
    const res = await adminResolveSettlementReview({
      taskId,
      adminUserId,
      action: action === "settle" ? "SETTLE" : "RELEASE",
      actualPoints: params.actualPoints,
      auditRemark: reason,
    });
    const idempotent = /幂等/.test(res.auditMessage || "");
    return { taskId, action, status: res.status, applied: !idempotent, idempotent, message: res.auditMessage };
  }

  if (action === "retry") return adminRetryRecovery(params);
  return adminMarkReview(params);
}

async function assertAdminActionGuards(params: AdminSettlementActionParams): Promise<void> {
  const { taskId } = params;
  const settlement = await prisma.tokensettlement.findUnique({ where: { taskId }, select: { status: true, settlementVersion: true } });
  if (!settlement) throw new TokenSettlementError("SETTLEMENT_RECORD_NOT_FOUND", `任务 ${taskId} 结算记录不存在`);
  if (settlement.status === "SETTLED" || settlement.status === "RELEASED") return;

  if (params.expectedStatus && params.expectedStatus !== settlement.status) {
    throw new TokenSettlementError("INVALID_STATE_FOR_REVIEW_ACTION", `当前状态 ${settlement.status} 与期望 ${params.expectedStatus} 不一致`);
  }
  if (
    params.expectedSettlementVersion !== undefined &&
    params.expectedSettlementVersion !== null &&
    params.expectedSettlementVersion !== settlement.settlementVersion
  ) {
    throw new TokenSettlementError(
      "SETTLEMENT_VERSION_MISMATCH",
      `settlementVersion 冲突: 期望 ${params.expectedSettlementVersion}，实际 ${settlement.settlementVersion}`
    );
  }
  if (settlement.status !== "REQUIRES_REVIEW") {
    throw new TokenSettlementError(
      "INVALID_STATE_FOR_REVIEW_ACTION",
      `任务 ${taskId} 当前状态 ${settlement.status}，非 REQUIRES_REVIEW，禁止裁决`
    );
  }
  await assertClaimTokenIfProcessing(params);
}

async function assertClaimTokenIfProcessing(params: AdminSettlementActionParams): Promise<void> {
  const recovery = await prisma.tokensettlementrecovery.findUnique({ where: { taskId: params.taskId }, select: { status: true, claimToken: true } });
  if (!recovery) return;
  if (recovery.status === "PROCESSING") {
    if (!params.expectedClaimToken || params.expectedClaimToken !== recovery.claimToken) {
      throw new TokenSettlementError("FENCING_TOKEN_MISMATCH", "恢复记录正在被处理中，必须提供匹配的 claimToken");
    }
  }
}

async function adminRetryRecovery(params: AdminSettlementActionParams): Promise<AdminSettlementActionResult> {
  const { taskId, adminUserId, reason } = params;
  const now = new Date();

  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: string; claimToken: string | null; leaseUntil: Date | null; retryCount: number }>>`
        SELECT \`status\`, \`claimToken\`, \`leaseUntil\`, \`retryCount\` FROM \`tokensettlementrecovery\` WHERE \`taskId\` = ${taskId} FOR UPDATE
      `;
      if (rows.length === 0) throw new TokenSettlementError("SETTLEMENT_RECORD_NOT_FOUND", `任务 ${taskId} 恢复记录不存在`);
      const rec = rows[0];

      if (rec.status === "SETTLED" || rec.status === "RELEASED") {
        throw new TokenSettlementError("INVALID_STATE_FOR_REVIEW_ACTION", `恢复记录已处于终态 (${rec.status})，不可重试`);
      }
      if (params.expectedStatus && params.expectedStatus !== rec.status) {
        throw new TokenSettlementError("INVALID_STATE_FOR_REVIEW_ACTION", `当前恢复状态 ${rec.status} 与期望 ${params.expectedStatus} 不一致`);
      }
      if (rec.status === "PROCESSING") {
        if (hasValidRecoveryLease(rec.leaseUntil, now)) {
          throw new TokenSettlementError(
            "RECOVERY_LEASE_ACTIVE",
            `恢复记录仍处于有效租约中，禁止强制重试 (leaseUntil=${rec.leaseUntil?.toISOString() ?? "null"})`
          );
        }
        if (params.expectedClaimToken && params.expectedClaimToken !== rec.claimToken) {
          throw new TokenSettlementError("FENCING_TOKEN_MISMATCH", "claimToken 与当前持有者不一致，禁止强制重试");
        }
      }

      const snapshot = { status: rec.status, claimToken: rec.claimToken, leaseUntil: rec.leaseUntil, retryCount: rec.retryCount };

      if (rec.status === "PENDING") {
        return { taskId, action: "retry" as const, status: "PENDING", applied: false, idempotent: true, message: "恢复记录已处于 PENDING，幂等返回" };
      }

      const res = await tx.tokensettlementrecovery.updateMany({
        where: { taskId, status: rec.status, ...(rec.claimToken ? { claimToken: rec.claimToken } : {}) },
        data: {
          status: "PENDING",
          claimToken: null,
          leaseUntil: null,
          lastError: buildAudit("ADMIN_RETRY", adminUserId, reason, snapshot, now),
          updatedAt: now,
        },
      });
      if (res.count !== 1) throw new TokenSettlementError("SETTLEMENT_CONCURRENCY_CONFLICT", "重试时状态被并发修改，请重试");
      return { taskId, action: "retry" as const, status: "PENDING", applied: true, idempotent: false, message: `已将恢复记录重置为 PENDING（原状态 ${rec.status}）` };
    })
  );
}

async function adminMarkReview(params: AdminSettlementActionParams): Promise<AdminSettlementActionResult> {
  const { taskId, adminUserId, reason } = params;
  const now = new Date();

  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const settles = await tx.$queryRaw<Array<{ status: string; settlementVersion: number }>>`
        SELECT \`status\`, \`settlementVersion\` FROM \`tokensettlement\` WHERE \`taskId\` = ${taskId} FOR UPDATE
      `;
      if (settles.length === 0) throw new TokenSettlementError("SETTLEMENT_RECORD_NOT_FOUND", `任务 ${taskId} 结算记录不存在`);
      const settle = settles[0];

      if (settle.status === "SETTLED" || settle.status === "RELEASED") {
        throw new TokenSettlementError("INVALID_STATE_FOR_REVIEW_ACTION", `结算记录已处于终态 (${settle.status})，不可转入复核`);
      }
      if (params.expectedStatus && params.expectedStatus !== settle.status) {
        throw new TokenSettlementError("INVALID_STATE_FOR_REVIEW_ACTION", `当前结算状态 ${settle.status} 与期望 ${params.expectedStatus} 不一致`);
      }
      if (
        params.expectedSettlementVersion !== undefined &&
        params.expectedSettlementVersion !== null &&
        params.expectedSettlementVersion !== settle.settlementVersion
      ) {
        throw new TokenSettlementError("SETTLEMENT_VERSION_MISMATCH", `settlementVersion 冲突: 期望 ${params.expectedSettlementVersion}，实际 ${settle.settlementVersion}`);
      }

      if (settle.status === "REQUIRES_REVIEW") {
        return { taskId, action: "mark-review" as const, status: "REQUIRES_REVIEW", applied: false, idempotent: true, message: "结算记录已处于 REQUIRES_REVIEW，幂等返回" };
      }

      const recRows = await tx.$queryRaw<Array<{ status: string; claimToken: string | null }>>`
        SELECT \`status\`, \`claimToken\` FROM \`tokensettlementrecovery\` WHERE \`taskId\` = ${taskId} FOR UPDATE
      `;
      const rec = recRows[0];
      if (rec && rec.status === "PROCESSING") {
        if (!params.expectedClaimToken || params.expectedClaimToken !== rec.claimToken) {
          throw new TokenSettlementError("FENCING_TOKEN_MISMATCH", "恢复记录正在处理中，必须提供匹配的 claimToken");
        }
      }

      const snapshot = { settlementStatus: settle.status, settlementVersion: settle.settlementVersion, recoveryStatus: rec?.status ?? null };

      const settleUpd = await tx.$executeRaw`
        UPDATE \`tokensettlement\`
        SET \`status\` = 'REQUIRES_REVIEW',
            \`errorCode\` = 'ADMIN_MARK_REVIEW',
            \`auditMessage\` = ${buildAudit("ADMIN_MARK_REVIEW", adminUserId, reason, snapshot, now)},
            \`updatedAt\` = ${now}
        WHERE \`taskId\` = ${taskId} AND \`status\` NOT IN ('SETTLED', 'RELEASED')
      `;
      if (settleUpd !== 1) throw new TokenSettlementError("SETTLEMENT_CONCURRENCY_CONFLICT", "转入复核时状态被并发修改，请重试");
      await tx.$executeRaw`
        UPDATE \`tokensettlementhold\`
        SET \`status\` = 'REQUIRES_REVIEW', \`statusChangedAt\` = ${now}, \`updatedAt\` = ${now}
        WHERE \`taskId\` = ${taskId} AND \`status\` NOT IN ('SETTLED', 'RELEASED')
      `;
      if (rec && rec.status !== "SETTLED" && rec.status !== "RELEASED") {
        await tx.tokensettlementrecovery.updateMany({
          where: { taskId, ...(rec.claimToken ? { claimToken: rec.claimToken } : {}) },
          data: { status: "REQUIRES_REVIEW", claimToken: null, leaseUntil: null, lastError: buildAudit("ADMIN_MARK_REVIEW", adminUserId, reason, snapshot, now), updatedAt: now },
        });
      }

      return { taskId, action: "mark-review" as const, status: "REQUIRES_REVIEW", applied: true, idempotent: false, message: `已转入 REQUIRES_REVIEW（原结算状态 ${settle.status}）` };
    })
  );
}

// ---------------------------------------------------------------------------
// cron 对账编排（本阶段只允许 dry-run，强制 autoFix=false）
// ---------------------------------------------------------------------------

export interface CronReconciliationOptions {
  limit?: number;
  workerId?: string;
  leaseMs?: number;
  operator?: string;
  stepTimeoutMs?: number;
  /** 可选数据作用域（用于隔离，缺省为全局运营调度） */
  userId?: string;
  workspaceId?: string;
}

export interface CronStepResult<T> {
  ok: boolean;
  error?: string;
  durationMs: number;
  data?: T;
}

export interface CronReconciliationResult {
  reaped: CronStepResult<{ reaped: number }>;
  recovery: CronStepResult<{ processed: number; settled: number; released: number; inReview: number; failed: number }>;
  reconcile: CronStepResult<{ scanned: number; findingsCount: number; inconsistentCount: number; appliedFixes: number; dryRun: boolean }>;
  allStepsSucceeded: boolean;
}

export interface CronReconciliationDeps {
  reap?: (opts: { limit: number }) => Promise<{ reapedCount: number }>;
  recover?: (opts: {
    limit: number;
    workerId?: string;
    leaseMs: number;
    leaseDurationMs: number;
    userId?: string;
    workspaceId?: string;
  }) => Promise<{
    processed: number;
    settled: number;
    released: number;
    inReview: number;
    failed: number;
  }>;
  reconcile?: (opts: ScanReconciliationOptions) => Promise<ReconciliationScanResult>;
}

async function runStep<T>(label: string, timeoutMs: number, fn: () => Promise<T>): Promise<CronStepResult<T>> {
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const data = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`步骤 ${label} 执行超时 (${timeoutMs}ms)`)), timeoutMs);
      }),
    ]);
    return { ok: true, durationMs: Date.now() - started, data };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || String(err), durationMs: Date.now() - started };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runSettlementReconciliationCron(
  opts: CronReconciliationOptions = {},
  deps: CronReconciliationDeps = {}
): Promise<CronReconciliationResult> {
  const limit = Math.min(SCAN_MAX_LIMIT, Math.max(1, Math.floor(Number(opts.limit) || 20)));
  const leaseMs = Math.max(1000, Math.floor(Number(opts.leaseMs) || 60000));
  const timeoutMs = Math.max(1000, Math.floor(Number(opts.stepTimeoutMs) || 30000));
  const operator = opts.operator || opts.workerId || "cron-reconciliation";

  const reap = deps.reap ?? ((o: { limit: number }) => reapExpiredHolds({ limit: o.limit }));
  const recover = deps.recover ?? ((o: { limit: number; workerId?: string; leaseMs: number; leaseDurationMs: number }) => runSettlementRecovery(o));
  const reconcile = deps.reconcile ?? ((o: ScanReconciliationOptions) => scanSettlementReconciliation(o));

  const reaped = await runStep("reapExpiredHolds", timeoutMs, async () => {
    const r = await reap({ limit });
    return { reaped: r.reapedCount };
  });

  const recovery = await runStep("runSettlementRecovery", timeoutMs, () =>
    recover({ limit, workerId: opts.workerId, leaseMs, leaseDurationMs: leaseMs, userId: opts.userId, workspaceId: opts.workspaceId })
  );

  const reconcileStep = await runStep("scanSettlementReconciliation", timeoutMs, async () => {
    const r = await reconcile({ limit, autoFix: false, operator, userId: opts.userId, workspaceId: opts.workspaceId });
    return {
      scanned: r.scanned,
      findingsCount: r.findingsCount,
      inconsistentCount: r.inconsistentCount,
      appliedFixes: r.appliedFixes.length,
      dryRun: true,
    };
  });

  return { reaped, recovery, reconcile: reconcileStep, allStepsSucceeded: reaped.ok && recovery.ok && reconcileStep.ok };
}
