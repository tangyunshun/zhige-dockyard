/**
 * 模型失败退款恢复服务。
 *
 * 目的：退款失败时不能只返回错误码 + console.error，必须在数据库留下可查询、可幂等重试的待退款记录。
 * 仅保存账务与任务标识（taskId/userId/workspaceId/消费流水/明细/月度回滚量），
 * **不记录原始材料、Prompt、API Key**。
 */
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { refundConsumedPoints, type ConsumeResult, type ConsumeDetail } from "@/lib/credit-service";

export type RefundRecoveryStatus = "PENDING" | "PROCESSING" | "SETTLED" | "FAILED" | "REQUIRES_REVIEW";
export const REFUND_RECOVERY_MAX_RETRY = 3;
export const REFUND_RECOVERY_LEASE_MS = 5 * 60 * 1000; // 5分钟处理租约超时

export interface RefundRecoveryDTO {
  id: string;
  taskId: string;
  workspaceId: string;
  points: string;
  monthlyUsedRollback: string;
  status: RefundRecoveryStatus;
  retryCount: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueRefundRecoveryParams {
  taskId: string;
  userId: string;
  workspaceId: string;
  consumeIdempotencyKey: string;
  consumeResult: ConsumeResult;
  componentId?: string | null;
  componentName?: string | null;
  workspaceType?: string | null;
  workspaceName?: string | null;
  error?: string | null;
}

function truncate(v: unknown, max = 1000): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s.length > max ? s.slice(0, max) : s;
}

/** 仅取账务事实，绝不含原始材料 / Prompt / 密钥 */
function serializeConsumeResult(cr: ConsumeResult) {
  return {
    skipped: cr.skipped,
    unlimited: cr.unlimited,
    consumed: cr.consumed,
    ledgerIds: cr.ledgerIds,
    details: cr.details,
    balanceAfter: cr.balanceAfter,
    monthlyTokenUsedIncremented: cr.monthlyTokenUsedIncremented,
  };
}

/** 记录（幂等 upsert）一条待退款恢复记录；不吞异常，返回明确执行结果 */
export async function enqueueRefundRecovery(
  p: EnqueueRefundRecoveryParams
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cr = p.consumeResult;
  try {
    await prisma.refundrecovery.upsert({
      where: {
        taskId_consumeIdempotencyKey: {
          taskId: p.taskId,
          consumeIdempotencyKey: p.consumeIdempotencyKey,
        },
      },
      create: {
        id: randomUUID(),
        taskId: p.taskId,
        userId: p.userId,
        workspaceId: p.workspaceId,
        consumeIdempotencyKey: p.consumeIdempotencyKey,
        consumeLedgerIds: (cr.ledgerIds ?? []) as unknown as object,
        details: (cr.details ?? []) as unknown as object,
        points: BigInt(Math.max(0, Number(cr.consumed) || 0)),
        monthlyUsedRollback: BigInt(Math.max(0, Number(cr.monthlyTokenUsedIncremented) || 0)),
        status: "PENDING" satisfies RefundRecoveryStatus,
        lastError: truncate(p.error),
      },
      update: {
        lastError: truncate(p.error),
        updatedAt: new Date(),
      },
    });
    return { ok: true };
  } catch (e) {
    const errMsg = (e as Error)?.message || String(e);
    console.error("[refund-recovery] 记录待退款失败:", errMsg);
    return { ok: false, error: errMsg };
  }
}

export async function listRefundRecoveries(opts: { status?: string; page?: number; limit?: number }) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 20));
  const where: Record<string, unknown> = {};
  if (opts.status) where.status = opts.status;
  const [rawRecords, total] = await Promise.all([
    prisma.refundrecovery.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.refundrecovery.count({ where }),
  ]);

  // BigInt 统一显式转换为字符串，严格避免原生 JSON.stringify 报错并防止前端精度丢失
  const records: RefundRecoveryDTO[] = rawRecords.map((r) => ({
    id: r.id,
    taskId: r.taskId,
    workspaceId: r.workspaceId,
    points: r.points.toString(),
    monthlyUsedRollback: r.monthlyUsedRollback.toString(),
    status: r.status as RefundRecoveryStatus,
    retryCount: r.retryCount,
    lastError: r.lastError,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  return { records, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export interface RetryResult {
  ok: boolean;
  status: RefundRecoveryStatus;
  refunded: number;
  error?: string;
}

/** 历史恢复明细允许存在的 sourceType 兼容白名单（明确列出，非空即需与真实分桶一致） */
const LEGACY_SOURCE_TYPE_WHITELIST = ["", "UNKNOWN", "SYSTEM"];

/** 判断消费流水幂等键是否为「基础键」或「基础键#正整数」 */
function isLedgerIdempotencyMatch(ledgerKey: string, baseKey: string): boolean {
  if (!ledgerKey) return false;
  if (ledgerKey === baseKey) return true;
  if (!ledgerKey.startsWith(`${baseKey}#`)) return false;
  return /^[1-9]\d*$/.test(ledgerKey.slice(baseKey.length + 1));
}

/**
 * 校验待退款记录的数据完整性与一致性（**逐条流水 / 逐条明细对齐**）：
 * 1. details 必须为数组，且 details.length === consumeLedgerIds.length；
 * 2. consumeLedgerIds 必须为唯一字符串数组；
 * 3. 每条流水的 points 必须等于对应明细 points，且总和等于 recovery.points；
 * 4. 每条流水必须归属同一用户 / 空间 / 任务，且为 OUT+CONSUME；
 * 5. MEMBER 明细必须对应 grantId=null、scope=WORKSPACE 的流水；
 * 6. 非 MEMBER 明细的流水 grantId / scope 必须与明细一致；
 * 7. 非 MEMBER 明细的 grantId 必须存在，且归属、scope、sourceType 与明细一致；
 * 8. points=0 且无明细且无月度回滚的损坏记录严禁标记 SETTLED。
 *
 * 任一不一致返回 valid=false，调用方转 REQUIRES_REVIEW 且不执行任何退款 / 余额变更 / 月度回滚。
 */
async function validateRefundRecoveryIntegrity(
  rec: {
    id: string;
    taskId: string;
    userId: string;
    workspaceId: string;
    consumeIdempotencyKey: string;
    consumeLedgerIds: unknown;
    details: unknown;
    points: bigint;
    monthlyUsedRollback: bigint;
  }
): Promise<{ valid: boolean; reason?: string }> {
  const pointsNum = Number(rec.points);
  const monthlyRollback = Number(rec.monthlyUsedRollback);
  const details = Array.isArray(rec.details) ? (rec.details as unknown as ConsumeDetail[]) : null;

  if (!details) return { valid: false, reason: "DETAILS_NOT_ARRAY" };

  // 无意义损坏数据：无退款点、无明细、无月度回滚
  if (pointsNum === 0 && details.length === 0 && monthlyRollback === 0) {
    return { valid: false, reason: "EMPTY_RECORD_POINTS_AND_DETAILS_ZERO" };
  }

  // consumeLedgerIds 必须是唯一字符串数组
  const ledgerIdsRaw = Array.isArray(rec.consumeLedgerIds) ? (rec.consumeLedgerIds as unknown[]) : null;
  if (!ledgerIdsRaw) return { valid: false, reason: "CONSUME_LEDGER_IDS_NOT_ARRAY" };
  if (!ledgerIdsRaw.every((v) => typeof v === "string" && (v as string).length > 0)) {
    return { valid: false, reason: "CONSUME_LEDGER_ID_INVALID" };
  }
  const ledgerIds = ledgerIdsRaw as string[];
  if (new Set(ledgerIds).size !== ledgerIds.length) {
    return { valid: false, reason: "CONSUME_LEDGER_IDS_DUPLICATED" };
  }

  // 明细数量必须与流水数量一一对应，杜绝错配导致的跨账户退款
  if (details.length !== ledgerIds.length) {
    return {
      valid: false,
      reason: `LEDGER_DETAIL_COUNT_MISMATCH: details=${details.length}, ledgers=${ledgerIds.length}`,
    };
  }

  const detailsSum = details.reduce((sum, d) => sum + (Number(d?.points) || 0), 0);
  if (pointsNum !== detailsSum) {
    return {
      valid: false,
      reason: `POINTS_MISMATCH: record.points=${pointsNum}, details.sum=${detailsSum}`,
    };
  }

  // 存在明细/流水时必须真实存在对应流水，且 refund 金额有真实扣费依据
  if (ledgerIds.length > 0 || pointsNum > 0) {
    if (ledgerIds.length === 0) {
      return { valid: false, reason: "CONSUME_LEDGER_IDS_EMPTY" };
    }
    const ledgers = await prisma.pointledger.findMany({ where: { id: { in: ledgerIds } } });
    if (ledgers.length !== ledgerIds.length) {
      return {
        valid: false,
        reason: `CONSUME_LEDGER_COUNT_MISMATCH: expected=${ledgerIds.length}, found=${ledgers.length}`,
      };
    }
    const ledgerById = new Map(ledgers.map((l) => [l.id, l]));
    const validKinds = new Set(["WALLET", "PERSONAL_GIFT", "WORKSPACE", "MEMBER"]);
    const validScopes = new Set(["WALLET", "PERSONAL_GIFT", "PERSONAL_DEDUCTION", "WORKSPACE"]);
    let ledgerPointsSum = 0;

    // 按 consumeLedgerIds 顺序与 details 逐条对齐校验
    for (let i = 0; i < ledgerIds.length; i += 1) {
      const l = ledgerById.get(ledgerIds[i])!;
      const d = details[i];

      if (!d || typeof d !== "object") return { valid: false, reason: `DETAIL_ITEM_INVALID: index=${i}` };
      if (!validKinds.has(d.kind)) return { valid: false, reason: `INVALID_DETAIL_KIND: ${d.kind}` };
      if (!validScopes.has(d.scope)) return { valid: false, reason: `INVALID_DETAIL_SCOPE: ${d.scope}` };
      if (typeof d.points !== "number" || !Number.isSafeInteger(d.points) || d.points <= 0) {
        return { valid: false, reason: `INVALID_DETAIL_POINTS: ${d.points}` };
      }

      if (l.userId !== rec.userId) {
        return { valid: false, reason: `LEDGER_USER_MISMATCH: expected=${rec.userId}, actual=${l.userId}` };
      }
      if (l.workspaceId !== rec.workspaceId) {
        return { valid: false, reason: `LEDGER_WORKSPACE_MISMATCH: expected=${rec.workspaceId}, actual=${l.workspaceId}` };
      }
      if (l.taskId !== rec.taskId) {
        return { valid: false, reason: `LEDGER_TASK_MISMATCH: expected=${rec.taskId}, actual=${l.taskId}` };
      }
      if (l.direction !== "OUT" || l.type !== "CONSUME") {
        return { valid: false, reason: `LEDGER_DIRECTION_TYPE_INVALID: ${l.direction}/${l.type}` };
      }
      if (!isLedgerIdempotencyMatch(l.idempotencyKey ?? "", rec.consumeIdempotencyKey)) {
        return {
          valid: false,
          reason: `LEDGER_IDEMPOTENCY_MISMATCH: expected=${rec.consumeIdempotencyKey}(#n), actual=${l.idempotencyKey}`,
        };
      }

      // 金额必须与明细逐条一致
      if (Number(l.points) !== d.points) {
        return {
          valid: false,
          reason: `LEDGER_DETAIL_POINTS_MISMATCH: index=${i}, ledger=${Number(l.points)}, detail=${d.points}`,
        };
      }
      ledgerPointsSum += Number(l.points);

      const isMemberDetail = d.kind === "MEMBER";
      if (isMemberDetail) {
        // MEMBER 明细：必须 grantId="" / scope=WORKSPACE，且流水 grantId=null / scope=WORKSPACE
        if (d.scope !== "WORKSPACE") {
          return { valid: false, reason: `MEMBER_DETAIL_SCOPE_INVALID: ${d.scope}` };
        }
        if (d.grantId !== "") {
          return { valid: false, reason: `MEMBER_DETAIL_GRANT_ID_NOT_EMPTY: ${d.grantId}` };
        }
        if (l.grantId !== null) {
          return { valid: false, reason: `MEMBER_LEDGER_GRANT_ID_NOT_NULL: ${l.grantId}` };
        }
        if (l.scope !== "WORKSPACE") {
          return { valid: false, reason: `MEMBER_LEDGER_SCOPE_INVALID: ${l.scope}` };
        }
        continue;
      }

      // 非 MEMBER 明细：必须有合法 grantId，且流水 grantId / scope 与明细一致
      if (!d.grantId || typeof d.grantId !== "string") {
        return { valid: false, reason: `INVALID_DETAIL_GRANT_ID: index=${i}` };
      }
      if (l.grantId !== d.grantId) {
        return {
          valid: false,
          reason: `LEDGER_DETAIL_GRANT_ID_MISMATCH: index=${i}, ledger=${l.grantId}, detail=${d.grantId}`,
        };
      }
      if (l.scope !== d.scope || l.scope !== d.kind) {
        return {
          valid: false,
          reason: `LEDGER_DETAIL_SCOPE_MISMATCH: index=${i}, ledger=${l.scope}, detail.scope=${d.scope}, detail.kind=${d.kind}`,
        };
      }

      // 分桶归属与来源类型必须与真实 pointgrant 一致
      const grant = await prisma.pointgrant.findUnique({
        where: { id: d.grantId },
        select: { userId: true, workspaceId: true, scope: true, sourceType: true },
      });
      if (!grant) {
        return { valid: false, reason: `DETAIL_GRANT_NOT_FOUND: ${d.grantId}` };
      }
      // WALLET / PERSONAL_GIFT 分桶归属用户；WORKSPACE 分桶归属空间
      if (grant.scope === "WALLET" || grant.scope === "PERSONAL_GIFT") {
        if (grant.userId !== rec.userId) {
          return { valid: false, reason: `GRANT_USER_MISMATCH: grant=${grant.userId}, record=${rec.userId}` };
        }
      } else if (grant.workspaceId !== rec.workspaceId) {
        return { valid: false, reason: `GRANT_WORKSPACE_MISMATCH: grant=${grant.workspaceId}, record=${rec.workspaceId}` };
      }
      if (grant.scope !== d.kind) {
        return { valid: false, reason: `GRANT_SCOPE_MISMATCH: grant=${grant.scope}, detail.kind=${d.kind}` };
      }
      const detailSourceType = d.sourceType ?? "";
      const sourceAllowed =
        grant.sourceType === detailSourceType || LEGACY_SOURCE_TYPE_WHITELIST.includes(detailSourceType);
      if (!sourceAllowed) {
        return {
          valid: false,
          reason: `GRANT_SOURCE_TYPE_MISMATCH: grant=${grant.sourceType}, detail=${detailSourceType}`,
        };
      }
    }

    // 流水金额总和必须等于记录退款点数
    if (ledgerPointsSum !== pointsNum) {
      return {
        valid: false,
        reason: `LEDGER_POINTS_SUM_MISMATCH: ledger.sum=${ledgerPointsSum}, record.points=${pointsNum}`,
      };
    }
  }

  return { valid: true };
}

/**
 * 租约 fencing 状态写入：必须同时匹配 **id + status=PROCESSING + claimToken**。
 * 旧 Worker 的令牌与当前记录不一致时写入 0 行，绝不覆盖新 Worker 的终态
 * （例如把 SETTLED 改回 FAILED）。
 *
 * @returns applied=false 表示记录已被其他 Worker 接管 / 已完成，调用方不得再写入。
 */
export async function writeRefundRecoveryResult(
  id: string,
  claimToken: string,
  patch: { status: RefundRecoveryStatus; lastError?: string | null; incrementRetry?: boolean },
): Promise<{ applied: boolean; currentStatus: RefundRecoveryStatus | null }> {
  const written = await prisma.refundrecovery.updateMany({
    where: { id, status: "PROCESSING", claimToken },
    data: {
      status: patch.status,
      lastError: patch.lastError ?? null,
      leaseUntil: null,
      claimToken: null, // 释放租约，杜绝旧 Worker 后续写入
      retryCount: patch.incrementRetry ? { increment: 1 } : undefined,
      updatedAt: new Date(),
    },
  });
  if (written.count > 0) return { applied: true, currentStatus: patch.status };
  const cur = await prisma.refundrecovery.findUnique({ where: { id }, select: { status: true } });
  return { applied: false, currentStatus: (cur?.status as RefundRecoveryStatus) ?? null };
}

/**
 * 幂等重试一次退款：
 *  - 采用原子状态认领（Atomic Claim）：仅 PENDING/FAILED 或租约超时的 PROCESSING 可抢占；
 *  - 每次认领生成唯一 claimToken（fencing token），后续所有写入必须校验该令牌；
 *  - 数据完整性强校验：若明细与流水不一致，直接转入 REQUIRES_REVIEW；
 *  - 底层依赖 refundConsumedPoints 的分桶幂等键作为第二层防重。
 */
export async function retryRefundRecovery(id: string): Promise<RetryResult> {
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + REFUND_RECOVERY_LEASE_MS);
  // 本次认领的唯一 fencing token
  const claimToken = randomUUID();

  // 1. 原子抢占认领（Atomic Claim）
  // 所有分支都必须满足 retryCount < MAX：达到上限的记录无论租约是否过期都不得再被认领
  const claimResult = await prisma.refundrecovery.updateMany({
    where: {
      id,
      OR: [
        {
          status: { in: ["PENDING", "FAILED"] },
          retryCount: { lt: REFUND_RECOVERY_MAX_RETRY },
        },
        {
          status: "PROCESSING",
          retryCount: { lt: REFUND_RECOVERY_MAX_RETRY },
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
      ],
    },
    data: {
      status: "PROCESSING" satisfies RefundRecoveryStatus,
      processingStartedAt: now,
      leaseUntil,
      claimToken, // fencing token：本次认领的唯一凭证
      updatedAt: now,
    },
  });

  // 2. 抢占失败：已 SETTLED / 正在 PROCESSING（租约期内）/ 达到最大重试次数 REQUIRES_REVIEW
  if (claimResult.count === 0) {
    const existing = await prisma.refundrecovery.findUnique({ where: { id } });
    if (!existing) {
      return { ok: false, status: "FAILED", refunded: 0, error: "REFUND_RECOVERY_NOT_FOUND" };
    }
    if (existing.status === "SETTLED") {
      return { ok: true, status: "SETTLED", refunded: 0 };
    }
    if (existing.status === "PROCESSING") {
      const leaseExpired = !existing.leaseUntil || existing.leaseUntil.getTime() < now.getTime();
      if (leaseExpired && existing.retryCount >= REFUND_RECOVERY_MAX_RETRY) {
        // 租约过期但已达最大重试次数：不得再次认领，转人工复核
        await prisma.refundrecovery.update({
          where: { id },
          data: {
            status: "REQUIRES_REVIEW" satisfies RefundRecoveryStatus,
            leaseUntil: null,
            lastError: "MAX_RETRIES_EXCEEDED",
            updatedAt: new Date(),
          },
        });
        return { ok: false, status: "REQUIRES_REVIEW", refunded: 0, error: "MAX_RETRIES_EXCEEDED" };
      }
      return { ok: false, status: "PROCESSING", refunded: 0, error: "RECORD_CURRENTLY_PROCESSING" };
    }
    if (existing.status === "REQUIRES_REVIEW") {
      return { ok: false, status: "REQUIRES_REVIEW", refunded: 0, error: "MAX_RETRIES_EXCEEDED" };
    }
    // 兜底：任何状态只要达到最大重试次数，一律不得再次认领
    if (existing.retryCount >= REFUND_RECOVERY_MAX_RETRY) {
      await prisma.refundrecovery.update({
        where: { id },
        data: {
          status: "REQUIRES_REVIEW" satisfies RefundRecoveryStatus,
          lastError: "MAX_RETRIES_EXCEEDED",
          updatedAt: new Date(),
        },
      });
      return { ok: false, status: "REQUIRES_REVIEW", refunded: 0, error: "MAX_RETRIES_EXCEEDED" };
    }
    return { ok: false, status: existing.status as RefundRecoveryStatus, refunded: 0, error: "CLAIM_FAILED" };
  }

  // 3. 认领成功，读取完整记录并进行数据完整性强校验
  const rec = await prisma.refundrecovery.findUnique({ where: { id } });
  if (!rec) {
    return { ok: false, status: "FAILED", refunded: 0, error: "REFUND_RECOVERY_NOT_FOUND" };
  }
  // fencing：记录已被其他 Worker 接管（令牌变化），当前 Worker 必须放弃，不得继续写入
  if (rec.claimToken !== claimToken || rec.status !== "PROCESSING") {
    return {
      ok: false,
      status: rec.status as RefundRecoveryStatus,
      refunded: 0,
      error: "LEASE_TAKEN_OVER",
    };
  }

  const integrity = await validateRefundRecoveryIntegrity(rec);
  if (!integrity.valid) {
    const integrityError = `INTEGRITY_CHECK_FAILED: ${integrity.reason}`;
    const w = await writeRefundRecoveryResult(id, claimToken, {
      status: "REQUIRES_REVIEW",
      lastError: integrityError,
      incrementRetry: true,
    });
    if (!w.applied) {
      return { ok: false, status: w.currentStatus ?? "REQUIRES_REVIEW", refunded: 0, error: "LEASE_TAKEN_OVER" };
    }
    return { ok: false, status: "REQUIRES_REVIEW", refunded: 0, error: integrityError };
  }

  const points = Number(rec.points);
  const monthly = Number(rec.monthlyUsedRollback);
  const cr: ConsumeResult = {
    skipped: false,
    unlimited: points === 0 && monthly > 0,
    consumed: points,
    ledgerIds: Array.isArray(rec.consumeLedgerIds) ? (rec.consumeLedgerIds as unknown as string[]) : [],
    details: Array.isArray(rec.details) ? (rec.details as unknown as ConsumeDetail[]) : [],
    balanceAfter: 0,
    monthlyTokenUsedIncremented: monthly,
  };

  // 4. 执行原路退款
  try {
    const r = await refundConsumedPoints({
      consumeResult: cr,
      userId: rec.userId,
      workspaceId: rec.workspaceId,
      taskId: rec.taskId,
    });
    const w = await writeRefundRecoveryResult(id, claimToken, {
      status: "SETTLED",
      lastError: null,
      incrementRetry: true,
    });
    if (!w.applied) {
      // 已被其他 Worker 接管并完成：不得覆盖其终态（SETLED 不可被改回 FAILED）
      return {
        ok: false,
        status: w.currentStatus ?? "SETTLED",
        refunded: r.refunded,
        error: "LEASE_TAKEN_OVER",
      };
    }
    return { ok: true, status: "SETTLED", refunded: r.refunded };
  } catch (e) {
    const nextRetry = rec.retryCount + 1;
    const status: RefundRecoveryStatus =
      nextRetry >= REFUND_RECOVERY_MAX_RETRY ? "REQUIRES_REVIEW" : "FAILED";
    const msg = truncate((e as Error)?.message || e);
    const w = await writeRefundRecoveryResult(id, claimToken, {
      status,
      lastError: msg,
      incrementRetry: true,
    });
    if (!w.applied) {
      return { ok: false, status: w.currentStatus ?? status, refunded: 0, error: "LEASE_TAKEN_OVER" };
    }
    return { ok: false, status, refunded: 0, error: msg || "RETRY_FAILED" };
  }
}
