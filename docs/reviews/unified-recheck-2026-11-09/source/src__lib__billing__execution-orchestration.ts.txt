/**
 * [P08 / R2] 持久任务、调用 attempt 与安全恢复 —— 执行编排（B8 接线层）。
 *
 * 定位：把第 6 批成本预约（CostReservationService）、第 7 批退款/结算守恒，与既有
 * credit-service（A7 资金原语）、token-settlement-service（结算 hold/release/recovery）按
 * 正确锁序串起来，并保证 关页/超时/重启/提交失败 不盲再付一次钱。
 *
 * 本模块是「编排契约」层，所有外部依赖（扣点/退款/结算/恢复/事务client）通过 AttemptDelegate
 * 注入，离线用 FakeAttemptDelegate 验证；真实接线由第 13 批接入 studio handler。
 *
 * 严格约束（COMMON-RULES §三 / 批次8）：
 *   - 不真实执行真实模型/支付/SMTP；零真实连接、零真实发放。
 *   - 不改 payment（A5）渠道核验、A7 资金原语签名、F05/席位/会员与回收、F14 解析安全、B6/B7 已交接口。
 *   - 不开放原 F07 人工 APPROVE。
 *   - 锁序：reserve → consume → settle/release；事务 client 包裹 DB 操作；提交失败可恢复，不丢事务。
 *   - 并发不得双扣/双退/透支；旧 token/异参幂等 ID 稳定，不盲重试。
 */

import type { CostReservationService, QuoteInput, AdmitInputs } from "@/lib/billing/cost-reservation";

export type AttemptOutcome = "SUCCESS" | "FAILED" | "UNKNOWN" | "REJECTED" | "RECOVERED";

export interface RecoverySummary {
  taskId: string;
  /** 未知来源：供应商结果未知，保守保留待恢复 */
  unknownSource: boolean;
  /** 差异状态：来源不明/异常透支，需人工对账 */
  differenceState: boolean;
  recoveryAction: "SETTLE" | "RELEASE" | "REVIEW";
  note: string;
}

/** 所有外部副作用通过此契约注入；真实实现在第 13 批接入既有 credit/token-settlement */
export interface AttemptDelegate {
  /** A7 扣点（幂等键 = taskId 派生；返回流水ID与扣减额；unknown=供应商结果未知，保守保留待恢复） */
  consume(taskId: string, idempotencyKey: string, consumeInput: unknown): Promise<{ ledgerIds: string[]; consumed: bigint; unknown?: boolean }>;
  /** A7 退款（原路，幂等键 = taskId 派生） */
  refund(taskId: string, idempotencyKey: string): Promise<void>;
  /** token-settlement 结算 hold 创建/完成/释放 */
  createHold(taskId: string): Promise<string>;
  completeHold(holdId: string): Promise<void>;
  releaseHold(holdId: string): Promise<void>;
  /** A11 恢复登记（关页/超时/未知），保守保留待恢复 */
  enqueueRecovery(summary: RecoverySummary): Promise<void>;
  /** 事务 client 包裹：锁序/事务保护生产结算；提交失败可恢复 */
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
  /** 硬关闭信号：执行中返回 false 表示收到硬关闭，应安全中断并留可恢复态 */
  canContinue(): boolean;
}

export interface AttemptContext {
  taskId: string;
  /** 业务幂等 ID（旧 token/异参稳定；不盲重试、并发不双付） */
  idempotencyKey: string;
  quote: QuoteInput;
  admit: AdmitInputs;
  consumeInput: unknown;
}

export class HardShutdownError extends Error {
  constructor() {
    super("收到硬关闭信号，安全中断执行并保留可恢复状态");
    this.name = "HardShutdownError";
  }
}

/**
 * 执行一次 attempt（关页/超时/重启/提交失败都要可恢复）。
 * 锁序：reserve(平台在途) → consume(扣点) → 成功 settle(结算+释放在途) / 失败 release(退点+释放hold+释放在途) / 未知 unknown(保守保留+登记恢复)。
 */
export async function executeAttempt(
  ctx: AttemptContext,
  reserve: CostReservationService,
  delegate: AttemptDelegate,
): Promise<{ outcome: AttemptOutcome; holdId?: string }> {
  // 1. 报价预约（占用平台在途预算，幂等；过期/预算超限直接拒绝，不进入执行）
  const r = await reserve.admitAndReserve(ctx.quote, ctx.admit);
  if (!r.ok) return { outcome: "REJECTED" };

  try {
    // 2. 事务内执行真实扣点与结算（锁序/事务保护）
    const result = await delegate.withTransaction(async () => {
      if (!delegate.canContinue()) throw new HardShutdownError();

      const consume = await delegate.consume(ctx.taskId, ctx.idempotencyKey, ctx.consumeInput);
      if (!delegate.canContinue()) throw new HardShutdownError();

      const holdId = await delegate.createHold(ctx.taskId);
      if (!delegate.canContinue()) throw new HardShutdownError();
      await reserve.attachHold(ctx.quote.idempotencyKey, holdId);

      return { consume, holdId };
    });

    // 供应商结果未知：保守保留在途与 hold（HOLD 不完成/不释放），登记恢复，不盲释再重试
    if (result.consume.unknown) {
      await reserve.markUnknown(ctx.quote.idempotencyKey);
      await delegate.enqueueRecovery({
        taskId: ctx.taskId,
        unknownSource: true,
        differenceState: false,
        recoveryAction: "REVIEW",
        note: "供应商结果未知，保守保留在途待恢复",
      });
      return { outcome: "UNKNOWN", holdId: result.holdId };
    }

    // 3a. 成功：完成结算 + 预约结算（释放在途→已消耗）
    await delegate.completeHold(result.holdId);
    await reserve.settle(ctx.quote.idempotencyKey);
    return { outcome: "SUCCESS", holdId: result.holdId };
  } catch (err) {
    // 4. 硬关闭：保守保留（标记 UNKNOWN + 登记恢复），不盲释再重试
    if (err instanceof HardShutdownError) {
      await reserve.markUnknown(ctx.quote.idempotencyKey);
      await delegate.enqueueRecovery({
        taskId: ctx.taskId,
        unknownSource: false,
        differenceState: false,
        recoveryAction: "REVIEW",
        note: "执行中被硬关闭，保守保留在途待恢复",
      });
      return { outcome: "UNKNOWN" };
    }
    // 4b. 确定失败/取消：退点 + 释放 hold + 释放预约（在途回退，不双付）
    await delegate.refund(ctx.taskId, ctx.idempotencyKey);
    const rec = await reserve.getReservation(ctx.quote.idempotencyKey);
    if (rec?.holdId) await delegate.releaseHold(rec.holdId);
    await reserve.release(ctx.quote.idempotencyKey);
    return { outcome: "FAILED" };
  }
}

/**
 * 恢复已中断/未知的 attempt（关页/超时/重启/提交失败后的收尾）：
 * 用保存的「意图结果」完成 settle 或 release，绝不重新扣点（幂等键复用，不双付）。
 */
export async function recoverAttempt(
  ctx: AttemptContext,
  reserve: CostReservationService,
  delegate: AttemptDelegate,
  intendedOutcome: "SUCCESS" | "FAILED",
): Promise<{ outcome: AttemptOutcome }> {
  if (intendedOutcome === "SUCCESS") {
    const rec = await reserve.getReservation(ctx.quote.idempotencyKey);
    const holdId = rec?.holdId ?? (await delegate.createHold(ctx.taskId));
    await delegate.completeHold(holdId);
    await reserve.settle(ctx.quote.idempotencyKey);
    return { outcome: "RECOVERED" };
  }
  // 失败恢复：退点 + 释放 + 释放预约（复用幂等键，不重新扣点）
  await delegate.refund(ctx.taskId, ctx.idempotencyKey);
  await delegate.releaseHold((await reserve.getReservation(ctx.quote.idempotencyKey))?.holdId ?? "");
  await reserve.release(ctx.quote.idempotencyKey);
  return { outcome: "RECOVERED" };
}
