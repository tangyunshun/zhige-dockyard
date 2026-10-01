/**
 * 真实 Token 结算账务基础与状态机服务 (Phase 2A 最终闭环加固版)
 *
 * 核心设计原则：
 * 1. 严格有限状态机：
 *    - PENDING/HOLD -> SETTLED (成功完成结算)
 *    - PENDING/HOLD -> RELEASED (失败全额释放)
 *    - PENDING/HOLD -> REQUIRES_REVIEW (异常/补扣不足挂起人工复核)
 *    - SETTLED 终态不可逆，绝不可转为 FAILED / RELEASED / HOLD；
 *    - RELEASED 终态不可重复释放；
 *    - REQUIRES_REVIEW 只能由管理员人工处理，禁止普通业务请求自动覆盖。
 * 2. 全局统一锁顺序（任何涉及账务操作的事务必须严格按此递增顺序锁定，彻底杜绝 AB-BA 死锁）：
 *    1. 账户排他锁：userwallet (FOR UPDATE) -> workspacequota (FOR UPDATE) -> workspacemember (FOR UPDATE)
 *    2. 结算主记录排他锁：tokensettlement (WHERE taskId = ? FOR UPDATE)
 *    3. 分桶排他锁：pointgrant (FOR UPDATE)
 *    4. 记账流水：pointledger (写入/查询)
 *    5. 恢复与对账：refundrecovery / tokensettlementrecovery (FOR UPDATE / 写入)
 * 3. 历史价格快照与模式还原：
 *    - 结算价格唯一源于持久化的 pricingSnapshot，废弃外部 pricing，防篡改；
 *    - 精确还原 pricingMode：COST_PLUS_MARKUP 直接售价保持 null 由成本+加价推导，DIRECT_PRICE 加价率保持 null；
 *    - 严禁成本价兜底，用户售价缺失直接转入 REQUIRES_REVIEW 并记录审计；
 * 4. 共享补扣与分桶状态流转：
 *    - 超额补扣严格复用 credit-service.deductPointsInTx 共享账务原语，禁止宽泛查询；
 *    - 分桶扣尽转 EXHAUSTED，释放恢复 ACTIVE；原分桶过期或缺失自动创建同 scope 兜底分桶；
 *    - 差额释放按 LIFO 逆序释放；
 * 5. 归属、完整性与生产安全开关：
 *    - 事务内一律使用持久化记录的 userId / workspaceId，传入不一致抛 ACCOUNT_MISMATCH；
 *    - holdDetails 校验总额、流水关联与幂等重入一致性（不一致抛 HOLD_IDEMPOTENCY_MISMATCH）；
 *    - NODE_ENV=production 时特性开关无条件硬关闭。
 */
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isRetryableP2034,
  MAX_REFUND_RETRIES,
  RefundAccountNotFoundError,
  ConsumeDetail,
  ConsumeResult,
  deductPointsInTx,
  InsufficientPointsError,
  UNLIMITED_BALANCE,
} from "@/lib/credit-service";
export { RefundAccountNotFoundError };
import {
  type DeploymentPricing,
  type RegistryPricingSnapshot,
  type UsageCostInput,
  type UsageCostInputBigInt,
  type UsageCostResultBigInt,
  computeUsageCost,
  computeUsageCostBigInt,
  evaluateSettlementReadiness,
} from "@/lib/model-pricing";
import { MICROS_PER_POINT } from "@/lib/point-rate";

export type SettlementHoldStatus = "HELD" | "SETTLED" | "RELEASED" | "REQUIRES_REVIEW";
export type TokenSettlementStatus = "HOLD" | "SETTLED" | "RELEASED" | "REQUIRES_REVIEW";

export const SETTLEMENT_RECOVERY_MAX_RETRY = 3;
export const SETTLEMENT_RECOVERY_LEASE_MS = 5 * 60 * 1000; // 5 分钟租约超时

export interface StoredHoldDetails {
  details: ConsumeDetail[];
  consumeLedgerIds: string[];
  consumeIdempotencyKey: string;
  isUnlimited?: boolean;
}

export function parseStoredHoldDetails(raw: unknown): StoredHoldDetails {
  if (!raw) {
    return { details: [], consumeLedgerIds: [], consumeIdempotencyKey: "", isUnlimited: false };
  }
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { details: [], consumeLedgerIds: [], consumeIdempotencyKey: "", isUnlimited: false };
    }
  }
  if (Array.isArray(parsed)) {
    return {
      details: parsed as ConsumeDetail[],
      consumeLedgerIds: [],
      consumeIdempotencyKey: "",
      isUnlimited: false,
    };
  }
  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    return {
      details: Array.isArray(obj.details) ? (obj.details as ConsumeDetail[]) : [],
      consumeLedgerIds: Array.isArray(obj.consumeLedgerIds) ? (obj.consumeLedgerIds as string[]) : [],
      consumeIdempotencyKey: typeof obj.consumeIdempotencyKey === "string" ? obj.consumeIdempotencyKey : "",
      isUnlimited: Boolean(obj.isUnlimited),
    };
  }
  return { details: [], consumeLedgerIds: [], consumeIdempotencyKey: "", isUnlimited: false };
}

export class TokenSettlementError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(`[TOKEN_SETTLEMENT_ERROR][${code}] ${message}`);
    this.name = "TokenSettlementError";
    this.code = code;
  }
}

export class InvalidStateTransitionError extends TokenSettlementError {
  constructor(fromStatus: string, toStatus: string, taskId: string) {
    super(
      "INVALID_STATE_TRANSITION",
      `任务 ${taskId} 结算状态非法转换：不可从 ${fromStatus} 转为 ${toStatus}`
    );
  }
}

export class SettlementConcurrencyConflictError extends TokenSettlementError {
  constructor(taskId: string, action: string) {
    super(
      "SETTLEMENT_CONCURRENCY_CONFLICT",
      `任务 ${taskId} 在执行 ${action} 时发生并发冲突或已被其他事务终结`
    );
  }
}

export class SettlementSupplementFailedError extends TokenSettlementError {
  requiredPoints: bigint;
  availablePoints: bigint;
  constructor(taskId: string, required: bigint, available: bigint) {
    super(
      "SETTLEMENT_SUPPLEMENT_FAILED",
      `任务 ${taskId} 补扣失败：需要追加补扣 ${required} 点，但可用仅 ${available} 点。已整笔回滚并转入人工复核，未产生负余额。`
    );
    this.requiredPoints = required;
    this.availablePoints = available;
  }
}

const B_ZERO = BigInt(0);
const MAX_SAFE_TOKEN_USAGE = BigInt("1000000000000000"); // 1000 万亿 Token 上限

/**
 * 从注册表快照精确还原 DeploymentPricing：
 * - COST_PLUS_MARKUP 模式：直接售价必须严格置 null，仅还原成本与加价率（避免两者共存造成互斥冲突）；
 * - DIRECT_PRICE 模式：直接售价取用户售价，加价率必须严格置 null；
 * - 价格未配置或模式为空：均置 null。
 */
export function reconstructPricingFromSnapshot(snapshot: RegistryPricingSnapshot): DeploymentPricing {
  const supplierCost = snapshot.supplierCost || {};
  const derived = snapshot.derivedUserPrice || {};
  const userPrice = snapshot.userPrice || {};
  const isCostPlus = snapshot.pricingMode === "COST_PLUS_MARKUP";
  const isDirect = snapshot.pricingMode === "DIRECT_PRICE";

  return {
    currency: snapshot.currency || "CNY",
    costInputMicrosPerMillion: (supplierCost.inputMicrosPerMillion ?? supplierCost.input) ?? null,
    costOutputMicrosPerMillion: (supplierCost.outputMicrosPerMillion ?? supplierCost.output) ?? null,
    costCacheReadMicrosPerMillion: (supplierCost.cacheReadMicrosPerMillion ?? supplierCost.cacheRead) ?? null,
    costCacheWriteMicrosPerMillion: (supplierCost.cacheWriteMicrosPerMillion ?? supplierCost.cacheWrite) ?? null,
    priceInputMicrosPerMillion: isCostPlus ? null : (isDirect ? (userPrice.inputMicrosPerMillion ?? derived.inputMicrosPerMillion) ?? null : null),
    priceOutputMicrosPerMillion: isCostPlus ? null : (isDirect ? (userPrice.outputMicrosPerMillion ?? derived.outputMicrosPerMillion) ?? null : null),
    priceCacheReadMicrosPerMillion: isCostPlus ? null : (isDirect ? (userPrice.cacheReadMicrosPerMillion ?? derived.cacheReadMicrosPerMillion) ?? null : null),
    priceCacheWriteMicrosPerMillion: isCostPlus ? null : (isDirect ? (userPrice.cacheWriteMicrosPerMillion ?? derived.cacheWriteMicrosPerMillion) ?? null : null),
    priceSource: snapshot.priceSource ?? "UNVERIFIED",
    priceStatus: snapshot.priceStatus,
    markupRateBps: isDirect ? null : snapshot.markupRateBps,
    priceVersion: snapshot.priceVersion ?? 1,
    effectiveFrom: snapshot.effectiveFrom,
  };
}

/** Token 用量严格非负整数与安全上限校验 */
export function validateTokenCount(count: unknown, name: string): bigint {
  if (count === null || count === undefined) return B_ZERO;
  if (typeof count === "bigint") {
    if (count < B_ZERO) throw new TokenSettlementError("INVALID_USAGE_TOKENS", `${name} 必须为非负整数: ${count}`);
    if (count > MAX_SAFE_TOKEN_USAGE) throw new TokenSettlementError("USAGE_EXCEEDS_SAFE_LIMIT", `${name} 超过最大允许安全上限: ${count}`);
    return count;
  }
  if (typeof count === "number") {
    if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
      throw new TokenSettlementError("INVALID_USAGE_TOKENS", `${name} 必须为非负有效整数: ${count}`);
    }
    const b = BigInt(count);
    if (b > MAX_SAFE_TOKEN_USAGE) throw new TokenSettlementError("USAGE_EXCEEDS_SAFE_LIMIT", `${name} 超过最大允许安全上限: ${count}`);
    return b;
  }
  throw new TokenSettlementError("INVALID_USAGE_TOKENS", `${name} 类型必须为整数或 BigInt`);
}

/**
 * 生产特性开关判定：
 * 生产环境（NODE_ENV=production）无条件硬关闭（恒为 false），绝不允许通过 explicitOverride 穿透！
 * 仅在测试环境（NODE_ENV=test）下允许显式 override 测试。
 */
export function isTokenSettlementFeatureEnabled(explicitOverride?: boolean): boolean {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  if (process.env.NODE_ENV === "test" && typeof explicitOverride === "boolean") {
    return explicitOverride;
  }
  return process.env.TEST_TOKEN_SETTLEMENT_ENABLED === "true";
}

async function backoffDelay(attempt: number): Promise<void> {
  const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.TEST_FAST_BACKOFF);
  const base = isTest ? 5 * Math.pow(2, attempt - 1) : 25 * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * (isTest ? 5 : 25));
  await new Promise((resolve) => setTimeout(resolve, base + jitter));
}

/**
 * 统一 P2034/死锁有限重试包装：仅对可重试的写冲突/死锁重试，其余业务错误原样抛出（绝不吞掉）。
 */
async function withP2034Retry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_REFUND_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < MAX_REFUND_RETRIES && isRetryableP2034(err)) {
        lastErr = err;
        await backoffDelay(attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * 统一加锁辅助函数：按全局固定严格顺序锁定账户行
 * 1. userwallet -> 2. workspacequota -> 3. workspacemember
 */
async function acquireAccountLocks(
  tx: Prisma.TransactionClient,
  userId: string,
  workspaceId: string,
  options: { needWallet: boolean; needQuota: boolean; needMember: boolean }
): Promise<void> {
  // 1. userwallet
  if (options.needWallet) {
    const wallets = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT \`id\` FROM \`userwallet\` WHERE \`userId\` = ${userId} FOR UPDATE
    `;
    if (wallets.length === 0) {
      throw new RefundAccountNotFoundError(`REFUND_ACCOUNT_NOT_FOUND: 用户钱包不存在 (userId=${userId})`);
    }
  }

  // 2. workspacequota
  if (options.needQuota) {
    const quotas = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT \`id\` FROM \`workspacequota\` WHERE \`workspaceId\` = ${workspaceId} FOR UPDATE
    `;
    if (quotas.length === 0) {
      throw new RefundAccountNotFoundError(`REFUND_ACCOUNT_NOT_FOUND: 空间配额不存在 (workspaceId=${workspaceId})`);
    }
  }

  // 3. workspacemember
  if (options.needMember) {
    const members = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT \`id\` FROM \`workspacemember\` WHERE \`userId\` = ${userId} AND \`workspaceId\` = ${workspaceId} FOR UPDATE
    `;
    if (members.length === 0) {
      throw new RefundAccountNotFoundError(`REFUND_ACCOUNT_NOT_FOUND: 工作空间成员记录不存在 (userId=${userId})`);
    }
  }
}

/**
 * 刚性点数数值安全校验：拒绝负数、NaN、Infinity、小数和超安全范围点数，严禁静默转换为 0
 */
export function validateSafePoints(points: unknown, fieldName = "points"): bigint {
  if (points === null || points === undefined) {
    throw new TokenSettlementError("INVALID_POINTS", `${fieldName} 不能为空`);
  }
  if (typeof points === "bigint") {
    if (points < B_ZERO) {
      throw new TokenSettlementError("INVALID_POINTS", `${fieldName} 不能为负数: ${points}`);
    }
    if (points > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new TokenSettlementError("USAGE_EXCEEDS_SAFE_LIMIT", `${fieldName} (${points}) 超出安全整数上限`);
    }
    return points;
  }
  if (typeof points === "number") {
    if (Number.isNaN(points) || !Number.isFinite(points)) {
      throw new TokenSettlementError("INVALID_POINTS", `${fieldName} 不能为 NaN 或 Infinity`);
    }
    if (!Number.isInteger(points)) {
      throw new TokenSettlementError("INVALID_POINTS", `${fieldName} 必须为整数，不支持小数: ${points}`);
    }
    if (points < 0) {
      throw new TokenSettlementError("INVALID_POINTS", `${fieldName} 不能为负数: ${points}`);
    }
    if (!Number.isSafeInteger(points)) {
      throw new TokenSettlementError("USAGE_EXCEEDS_SAFE_LIMIT", `${fieldName} (${points}) 超出安全整数上限`);
    }
    return BigInt(points);
  }
  if (typeof points === "string") {
    const trimmed = points.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new TokenSettlementError("INVALID_POINTS", `${fieldName} 格式非法: ${points}`);
    }
    const b = BigInt(trimmed);
    if (b > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new TokenSettlementError("USAGE_EXCEEDS_SAFE_LIMIT", `${fieldName} (${b}) 超出安全整数上限`);
    }
    return b;
  }
  throw new TokenSettlementError("INVALID_POINTS", `${fieldName} 类型非法`);
}

export interface CreateHoldParams {
  taskId: string;
  userId: string;
  workspaceId: string;
  holdPoints: number | bigint;
  pricingSnapshot: RegistryPricingSnapshot;
  holdDetails: ConsumeDetail[] | StoredHoldDetails;
  consumeLedgerIds?: string[];
  consumeIdempotencyKey?: string;
  monthlyTokenUsedIncremented?: number | bigint;
  componentId?: string | null;
  componentName?: string | null;
  workspaceType?: string | null;
  workspaceName?: string | null;
  userEmail?: string | null;
  expiresInMs?: number;
}

export interface HoldResult {
  holdId: string;
  settlementId: string;
  taskId: string;
  holdPoints: bigint;
  status: SettlementHoldStatus;
  isIdempotent: boolean;
}

export interface ConsumeAndHoldParams {
  taskId: string;
  userId: string;
  workspaceId: string;
  points: number | bigint;
  pricingSnapshot: RegistryPricingSnapshot;
  componentId?: string | null;
  componentName?: string | null;
  workspaceType?: string | null;
  workspaceName?: string | null;
  userEmail?: string | null;
  remark?: string | null;
  idempotencyKey?: string | null;
  expiresInMs?: number;
}

export interface ConsumeAndHoldResult extends HoldResult {
  consumeResult: ConsumeResult;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface PointLedgerVerifyRow {
  id: string;
  userId: string | null;
  workspaceId: string | null;
  taskId: string | null;
  direction: string;
  type: string;
  idempotencyKey: string | null;
  scope: string;
  grantId: string | null;
  points: bigint;
}

/**
 * 校验 HOLD 绑定的消费流水、明细、金额与归属一致性（全系统统一真源）：
 * 1. details 合计与 holdPoints 强校验；
 * 2. 逐条校验流水真实存在、账户归属、OUT/CONSUME 类型、正则幂等键、taskId 严格一致及金额一致性；
 * 3. 非 MEMBER 明细强校验对应 pointgrant 存在性与 sourceType 一致性；
 * 4. 无限额度环境同样对用量流水进行全量 8 维校验。
 */
export async function verifyConsumeLedgersInTx(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    workspaceId: string;
    taskId: string;
    holdPoints: bigint;
    details: ConsumeDetail[];
    consumeLedgerIds?: string[];
    consumeIdempotencyKey?: string;
    isUnlimited?: boolean;
  }
): Promise<void> {
  const { userId, workspaceId, taskId, holdPoints, details, consumeLedgerIds, consumeIdempotencyKey, isUnlimited } = params;

  // 1. 普通空间与无限额度：均必须校验实际用量流水与消费明细
  if (!isUnlimited && holdPoints > B_ZERO && (!details || details.length === 0)) {
    throw new TokenSettlementError(
      "HOLD_DETAILS_EMPTY",
      `任务 ${taskId} 预扣点数大于 0 (${holdPoints}) 时消费明细 details 严禁为空`
    );
  }
  if (Boolean(isUnlimited) && (!details || details.length === 0)) {
    throw new TokenSettlementError(
      "HOLD_DETAILS_EMPTY",
      `任务 ${taskId} 无限额度空间消费明细 details 严禁为空`
    );
  }

  // 2. details 合计与 holdPoints 强校验（纯 BigInt）
  const detailsSum = (details || []).reduce((sum, d) => sum + validateSafePoints(d.points, "detail.points"), B_ZERO);
  if (!isUnlimited && detailsSum !== holdPoints) {
    throw new TokenSettlementError(
      "HOLD_AMOUNT_MISMATCH",
      `预扣点数与明细合计不符: holdPoints=${holdPoints}, detailsSum=${detailsSum}`
    );
  }

  // 3. consumeLedgerIds 必须有效、非空、且元素唯一
  const targetLedgerIds =
    consumeLedgerIds && consumeLedgerIds.length > 0
      ? consumeLedgerIds
      : (details || []).map((d) => d.ledgerId);

  const needsVerification = (!isUnlimited && holdPoints > B_ZERO) || Boolean(isUnlimited) || (details && details.length > 0);

  if (needsVerification) {
    if (!targetLedgerIds || targetLedgerIds.length === 0) {
      throw new TokenSettlementError(
        "HOLD_LEDGERS_EMPTY",
        `任务 ${taskId} 消费流水 consumeLedgerIds 严禁为空`
      );
    }
    // 校验每个 ledgerId 必须为非空有效字符串
    for (let i = 0; i < targetLedgerIds.length; i++) {
      const lid = targetLedgerIds[i];
      if (!lid || typeof lid !== "string" || lid.trim() === "") {
        throw new TokenSettlementError(
          "HOLD_LEDGER_INVALID_ID",
          `任务 ${taskId} 第 ${i + 1} 个 consumeLedgerId 必须为非空有效字符串`
        );
      }
    }
    // 校验唯一性
    const uniqueIds = new Set(targetLedgerIds);
    if (uniqueIds.size !== targetLedgerIds.length) {
      throw new TokenSettlementError(
        "HOLD_LEDGER_DUPLICATE",
        `任务 ${taskId} 关联流水 consumeLedgerIds 存在重复 ID，严禁重复关联同一流水`
      );
    }
    // 校验 details 数量与流水数量严格一对一相等
    if (details.length !== targetLedgerIds.length) {
      throw new TokenSettlementError(
        "HOLD_LEDGER_COUNT_MISMATCH",
        `任务 ${taskId} 消费明细数量 (${details.length}) 与流水数量 (${targetLedgerIds.length}) 不一致`
      );
    }

    // 4. 按 targetLedgerIds 顺序逐条读取流水（显式类型强转换，禁止 any）
    const ledgers: PointLedgerVerifyRow[] = [];
    for (let i = 0; i < targetLedgerIds.length; i++) {
      const lid = targetLedgerIds[i];
      const row = await tx.pointledger.findUnique({
        where: { id: lid },
        select: {
          id: true,
          userId: true,
          workspaceId: true,
          taskId: true,
          direction: true,
          type: true,
          idempotencyKey: true,
          scope: true,
          grantId: true,
          points: true,
        },
      });
      if (!row) {
        throw new TokenSettlementError(
          "HOLD_LEDGERS_MISSING",
          `任务 ${taskId} 关联消费流水缺失: ID=${lid}`
        );
      }
      ledgers.push(row);
    }

    // 5. 第 i 条 ledger 与第 i 条 detail 逐条一对一对齐校验（禁止 some/find）
    let ledgerPointsSum = B_ZERO;
    // 幂等键强校验：必须非空且严格匹配 ^CONSUME:{taskId}#[1-9]\d*$
    const expectedIdempRegex = new RegExp(`^CONSUME:${escapeRegex(taskId)}#[1-9]\\d*$`);

    for (let i = 0; i < details.length; i++) {
      const d = details[i];
      const l = ledgers[i];
      const expectedId = targetLedgerIds[i];

      // 5.1 ledgerId 对齐
      if (d.ledgerId !== expectedId || l.id !== expectedId) {
        throw new TokenSettlementError(
          "HOLD_LEDGER_INDEX_MISMATCH",
          `任务 ${taskId} 第 ${i + 1} 条流水 ID 错配: detail.ledgerId=${d.ledgerId}, expectedId=${expectedId}, actualLedger=${l.id}`
        );
      }

      // 5.2 userId 对齐
      if (l.userId !== userId) {
        throw new TokenSettlementError(
          "HOLD_LEDGER_ACCOUNT_MISMATCH",
          `任务 ${taskId} 第 ${i + 1} 条流水 ${l.id} 用户归属不符: 期望=${userId}, 实际=${l.userId}`
        );
      }

      // 5.3 workspaceId 对齐
      if (l.workspaceId !== workspaceId) {
        throw new TokenSettlementError(
          "HOLD_LEDGER_ACCOUNT_MISMATCH",
          `任务 ${taskId} 第 ${i + 1} 条流水 ${l.id} 空间归属不符: 期望=${workspaceId}, 实际=${l.workspaceId}`
        );
      }

      // 5.4 taskId 严格对齐：必须严格等于 taskId，null 也必须拒绝
      if (!l.taskId || l.taskId !== taskId) {
        throw new TokenSettlementError(
          "HOLD_LEDGER_TASK_MISMATCH",
          `任务 ${taskId} 第 ${i + 1} 条流水 ${l.id} 任务标识不符: 期望=${taskId}, 实际=${l.taskId ?? "null"}`
        );
      }

      // 5.5 direction 对齐 (OUT)
      if (l.direction !== "OUT") {
        throw new TokenSettlementError(
          "HOLD_LEDGER_INVALID_DIRECTION",
          `任务 ${taskId} 第 ${i + 1} 条流水 ${l.id} 方向非法: 期望 OUT, 实际=${l.direction}`
        );
      }

      // 5.6 type 对齐 (CONSUME)
      if (l.type !== "CONSUME") {
        throw new TokenSettlementError(
          "HOLD_LEDGER_INVALID_TYPE",
          `任务 ${taskId} 第 ${i + 1} 条流水 ${l.id} 类型非法: 期望 CONSUME, 实际=${l.type}`
        );
      }

      // 5.7 idempotencyKey 强校验：非空，且必须严格匹配 CONSUME:{taskId}#正整数
      // 或明确传入的消费键 (consumeIdempotencyKey，常用于无限额度/批量复用场景)
      const idempMatchesRegex = expectedIdempRegex.test(l.idempotencyKey ?? "");
      const idempMatchesExplicit = Boolean(consumeIdempotencyKey) && l.idempotencyKey === consumeIdempotencyKey;
      if (!l.idempotencyKey || (!idempMatchesRegex && !idempMatchesExplicit)) {
        throw new TokenSettlementError(
          "HOLD_LEDGER_IDEMPOTENCY_MISMATCH",
          `任务 ${taskId} 第 ${i + 1} 条流水 ${l.id} 幂等键非法: actual=${l.idempotencyKey}, 必须严格匹配 CONSUME:${taskId}#正整数 或明确传入的消费键`
        );
      }

      // 5.8 scope 对齐
      if (l.scope !== d.scope) {
        throw new TokenSettlementError(
          "HOLD_LEDGER_SCOPE_MISMATCH",
          `任务 ${taskId} 第 ${i + 1} 条流水 ${l.id} scope 错配: ledger=${l.scope}, detail=${d.scope}`
        );
      }

      // 5.9 points 对齐：每条 points 必须为正整数
      const dPoints = validateSafePoints(d.points, `detail[${i}].points`);
      if (dPoints <= B_ZERO) {
        throw new TokenSettlementError(
          "INVALID_POINTS",
          `任务 ${taskId} 第 ${i + 1} 条消费明细点数必须为正整数: ${d.points}`
        );
      }
      const lPoints = validateSafePoints(l.points, `ledger[${i}].points`);
      if (lPoints <= B_ZERO) {
        throw new TokenSettlementError(
          "INVALID_POINTS",
          `任务 ${taskId} 第 ${i + 1} 条消费流水点数必须为正整数: ${l.points}`
        );
      }
      if (dPoints !== lPoints) {
        throw new TokenSettlementError(
          "HOLD_LEDGER_POINTS_MISMATCH",
          `任务 ${taskId} 第 ${i + 1} 条流水 ${l.id} 金额错配: ledger=${l.points}, detail=${d.points}`
        );
      }

      // 5.10 MEMBER、非 MEMBER 及无限额度强校验
      if (d.kind === "MEMBER") {
        // MEMBER 必须 scope=WORKSPACE、sourceType=MEMBER、grantId=null
        if (d.scope !== "WORKSPACE" || l.scope !== "WORKSPACE") {
          throw new TokenSettlementError(
            "HOLD_LEDGER_SCOPE_MISMATCH",
            `任务 ${taskId} 第 ${i + 1} 条 MEMBER 明细与流水 scope 必须为 WORKSPACE, detail=${d.scope}, ledger=${l.scope}`
          );
        }
        if (d.sourceType !== "MEMBER") {
          throw new TokenSettlementError(
            "HOLD_DETAIL_SOURCE_TYPE_MISMATCH",
            `任务 ${taskId} 第 ${i + 1} 条明细 sourceType 必须为 MEMBER, 实际=${d.sourceType}`
          );
        }
        if (l.grantId !== null || (d.grantId && d.grantId !== "")) {
          throw new TokenSettlementError(
            "HOLD_LEDGER_GRANT_MISMATCH",
            `任务 ${taskId} 第 ${i + 1} 条 MEMBER 流水不得关联 grantId: detail=${d.grantId}, ledger=${l.grantId}`
          );
        }
      } else if (isUnlimited || d.sourceType === "UNLIMITED") {
        // 无限额度用量流水
        if (d.scope !== "WORKSPACE" || l.scope !== "WORKSPACE") {
          throw new TokenSettlementError(
            "HOLD_LEDGER_SCOPE_MISMATCH",
            `任务 ${taskId} 无限额度流水 scope 必须为 WORKSPACE, detail=${d.scope}, ledger=${l.scope}`
          );
        }
        if (l.grantId !== null && l.grantId !== "") {
          throw new TokenSettlementError(
            "HOLD_LEDGER_GRANT_MISMATCH",
            `任务 ${taskId} 无限额度流水不得关联 grantId: actual=${l.grantId}`
          );
        }
      } else {
        // 非 MEMBER 必须校验 grant 存在、scope、sourceType、userId、workspaceId 与 kind 完全匹配
        if (!d.grantId || typeof d.grantId !== "string" || d.grantId.trim() === "") {
          throw new TokenSettlementError(
            "HOLD_DETAIL_GRANT_MISSING",
            `任务 ${taskId} 非 MEMBER 消费明细第 ${i + 1} 条必须包含有效 grantId`
          );
        }
        const grant = await tx.pointgrant.findUnique({
          where: { id: d.grantId },
          select: { id: true, scope: true, sourceType: true, userId: true, workspaceId: true },
        });
        if (!grant) {
          throw new TokenSettlementError(
            "HOLD_DETAIL_GRANT_NOT_FOUND",
            `任务 ${taskId} 第 ${i + 1} 条明细引用的 pointgrant 记录不存在: grantId=${d.grantId}`
          );
        }
        if (grant.scope !== d.scope || l.scope !== d.scope) {
          throw new TokenSettlementError(
            "HOLD_LEDGER_SCOPE_MISMATCH",
            `任务 ${taskId} 第 ${i + 1} 条明细与分桶 scope 不一致: grant=${grant.scope}, detail=${d.scope}, ledger=${l.scope}`
          );
        }
        if (grant.sourceType !== d.sourceType) {
          throw new TokenSettlementError(
            "HOLD_DETAIL_SOURCE_TYPE_MISMATCH",
            `任务 ${taskId} 第 ${i + 1} 条明细 sourceType (${d.sourceType}) 与分桶记录 (${grant.sourceType}) 不一致`
          );
        }
        if (l.grantId !== d.grantId) {
          throw new TokenSettlementError(
            "HOLD_LEDGER_GRANT_MISMATCH",
            `任务 ${taskId} 第 ${i + 1} 条流水 ${l.id} grantId 错配: ledger=${l.grantId}, detail=${d.grantId}`
          );
        }

        // 校验 userId、workspaceId 与 kind 完全匹配
        if (d.kind === "WALLET") {
          if (grant.scope !== "WALLET") {
            throw new TokenSettlementError(
              "HOLD_LEDGER_SCOPE_MISMATCH",
              `任务 ${taskId} WALLET 分桶 scope 必须为 WALLET, actual=${grant.scope}`
            );
          }
          if (grant.userId !== userId) {
            throw new TokenSettlementError(
              "HOLD_LEDGER_ACCOUNT_MISMATCH",
              `任务 ${taskId} WALLET 分桶 userId 错配: grant=${grant.userId}, actual=${userId}`
            );
          }
        } else if (d.kind === "PERSONAL_GIFT") {
          if (grant.scope !== "PERSONAL_GIFT") {
            throw new TokenSettlementError(
              "HOLD_LEDGER_SCOPE_MISMATCH",
              `任务 ${taskId} PERSONAL_GIFT 分桶 scope 必须为 PERSONAL_GIFT, actual=${grant.scope}`
            );
          }
          if (grant.userId !== userId) {
            throw new TokenSettlementError(
              "HOLD_LEDGER_ACCOUNT_MISMATCH",
              `任务 ${taskId} PERSONAL_GIFT 分桶 userId 错配: grant=${grant.userId}, actual=${userId}`
            );
          }
          if (grant.workspaceId !== workspaceId) {
            throw new TokenSettlementError(
              "HOLD_LEDGER_ACCOUNT_MISMATCH",
              `任务 ${taskId} PERSONAL_GIFT 分桶 workspaceId 错配: grant=${grant.workspaceId}, actual=${workspaceId}`
            );
          }
        } else if (d.kind === "WORKSPACE") {
          if (grant.scope !== "WORKSPACE") {
            throw new TokenSettlementError(
              "HOLD_LEDGER_SCOPE_MISMATCH",
              `任务 ${taskId} WORKSPACE 分桶 scope 必须为 WORKSPACE, actual=${grant.scope}`
            );
          }
          if (grant.workspaceId !== workspaceId) {
            throw new TokenSettlementError(
              "HOLD_LEDGER_ACCOUNT_MISMATCH",
              `任务 ${taskId} WORKSPACE 分桶 workspaceId 错配: grant=${grant.workspaceId}, actual=${workspaceId}`
            );
          }
        } else {
          throw new TokenSettlementError(
            "HOLD_DETAIL_KIND_MISMATCH",
            `任务 ${taskId} 第 ${i + 1} 条明细 kind 非法: ${d.kind}`
          );
        }
      }

      ledgerPointsSum += BigInt(l.points);
    }

    // 6. 流水金额总和校验（非无限额度要求等于 holdPoints，无限额度要求等于 detailsSum）
    const expectedSum = isUnlimited ? detailsSum : holdPoints;
    if (ledgerPointsSum !== expectedSum) {
      throw new TokenSettlementError(
        "HOLD_LEDGER_AMOUNT_MISMATCH",
        `任务 ${taskId} 关联流水金额总计 (${ledgerPointsSum}) 与期望点数 (${expectedSum}) 不一致`
      );
    }
  }
}

/**
 * 0. 扣点与创建 HOLD 结算单的统一原子事务 (consumeAndCreateSettlementHold)
 * 核心要求：
 * - 扣点 (deductPointsInTx / 无限额度流水) 与 tokensettlementhold / tokensettlement 创建在同一个原子事务内执行；
 * - 若 HOLD 创建或强校验失败，整个事务自动回滚，扣点流水与余额变动绝不提交；
 * - 无限额度独立处理：holdPoints 强制为 0，不扣资金，仅记录用量流水与月度统计，不产生虚假退款；
 * - 完整保存 consumeLedgerIds 与 consumeIdempotencyKey 并逐条校验。
 */
export async function consumeAndCreateSettlementHold(
  params: ConsumeAndHoldParams
): Promise<ConsumeAndHoldResult> {
  const { taskId, userId, workspaceId, points, pricingSnapshot } = params;
  const needPointsBig = validateSafePoints(points, "points");
  const needNum = Number(needPointsBig);
  const consumeKey = params.idempotencyKey || `CONSUME:${taskId}`;
  const holdIdempotencyKey = `HOLD:${taskId}`;
  const expiresInMs = params.expiresInMs ?? 10 * 60 * 1000;

  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return await prisma.$transaction(async (tx) => {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + expiresInMs);

        // 1. 检查是否已有 HOLD 记录（幂等重入）
        const existingHolds = await tx.$queryRaw<
          Array<{ id: string; userId: string; workspaceId: string; status: string; holdPoints: bigint; holdDetails: unknown }>
        >`
          SELECT \`id\`, \`userId\`, \`workspaceId\`, \`status\`, \`holdPoints\`, \`holdDetails\`
          FROM \`tokensettlementhold\` WHERE \`taskId\` = ${taskId} LIMIT 1
        `;

        if (existingHolds.length > 0) {
          const row = existingHolds[0];
          const stored = parseStoredHoldDetails(row.holdDetails);
          const expectedHold = stored.isUnlimited ? B_ZERO : needPointsBig;
          if (row.userId !== userId || row.workspaceId !== workspaceId || row.holdPoints !== expectedHold) {
            throw new TokenSettlementError(
              "HOLD_IDEMPOTENCY_MISMATCH",
              `任务 ${taskId} 幂等重入参数与原 HOLD 不一致`
            );
          }

          const settlements = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT \`id\` FROM \`tokensettlement\` WHERE \`taskId\` = ${taskId} LIMIT 1
          `;

          const cr: ConsumeResult = {
            skipped: false,
            unlimited: Boolean(stored.isUnlimited),
            consumed: Number(row.holdPoints),
            ledgerIds: stored.consumeLedgerIds,
            details: stored.details,
            balanceAfter: 0,
            monthlyTokenUsedIncremented: Number(row.holdPoints),
          };

          return {
            holdId: row.id,
            settlementId: settlements[0]?.id || row.id,
            taskId,
            holdPoints: row.holdPoints,
            status: row.status as SettlementHoldStatus,
            isIdempotent: true,
            consumeResult: cr,
          };
        }

        // 2. 严格按顺序获取账户锁
        await acquireAccountLocks(tx, userId, workspaceId, {
          needWallet: true,
          needQuota: true,
          needMember: true,
        });

        // 3. 检查空间配额判断是否无限额度
        const quota = await tx.workspacequota.findUnique({
          where: { workspaceId },
          select: { tokenBalance: true },
        });
        const isUnlimited = quota !== null && quota.tokenBalance === BigInt(UNLIMITED_BALANCE);

        let holdPoints = B_ZERO;
        let monthlyIncBigInt = B_ZERO;
        let storedDetails: StoredHoldDetails;
        let cr: ConsumeResult;

        if (isUnlimited) {
          // 无限额度独立处理：holdPoints=0，不扣资金分桶，仅记一条用量流水
          holdPoints = B_ZERO;
          const ledger = await tx.pointledger.create({
            data: {
              id: randomUUID(),
              direction: "OUT",
              type: "CONSUME",
              scope: "WORKSPACE",
              userId,
              userEmail: params.userEmail ?? null,
              workspaceId,
              workspaceType: params.workspaceType ?? null,
              workspaceName: params.workspaceName ?? null,
              operatorId: userId,
              points: needPointsBig,
              balanceAfter: BigInt(UNLIMITED_BALANCE),
              componentId: params.componentId ?? null,
              componentName: params.componentName ?? null,
              taskId,
              title: params.componentName ? `组件消耗：${params.componentName}` : "组件算力消耗",
              remark: "无限额度空间，本次不计扣余额",
              idempotencyKey: `${consumeKey}#1`,
            },
          });

          // 累加成员月度用量
          const memberInc = await tx.workspacemember.updateMany({
            where: { userId, workspaceId },
            data: { monthlyTokenUsed: { increment: needPointsBig } },
          });
          monthlyIncBigInt = memberInc.count > 0 ? needPointsBig : B_ZERO;

          const unlimitedDetail: ConsumeDetail = {
            ledgerId: ledger.id,
            grantId: "",
            scope: "WORKSPACE",
            sourceType: "UNLIMITED",
            points: needNum,
            kind: "WORKSPACE",
          };

          storedDetails = {
            details: [unlimitedDetail],
            consumeLedgerIds: [ledger.id],
            consumeIdempotencyKey: consumeKey,
            isUnlimited: true,
          };

          // 逐条强校验无限额度用量流水与明细
          await verifyConsumeLedgersInTx(tx, {
            userId,
            workspaceId,
            taskId,
            holdPoints: B_ZERO,
            details: [unlimitedDetail],
            consumeLedgerIds: [ledger.id],
            consumeIdempotencyKey: consumeKey,
            isUnlimited: true,
          });

          cr = {
            skipped: false,
            unlimited: true,
            consumed: needNum,
            ledgerIds: [ledger.id],
            details: [unlimitedDetail],
            balanceAfter: Number.MAX_SAFE_INTEGER,
            monthlyTokenUsedIncremented: Number(monthlyIncBigInt),
          };
        } else {
          // 普通空间：先在事务内调用 deductPointsInTx 扣减点数
          const deductRes = await deductPointsInTx(tx, {
            userId,
            workspaceId,
            workspaceType: params.workspaceType,
            workspaceName: params.workspaceName,
            userEmail: params.userEmail,
            need: needNum,
            taskId,
            componentId: params.componentId,
            componentName: params.componentName,
            title: params.componentName ? `组件消耗：${params.componentName}` : "组件算力消耗",
            remark: params.remark ?? null,
            idempotencyPrefix: consumeKey,
            bumpMonthlyUsed: true,
          });

          holdPoints = BigInt(deductRes.consumed);
          monthlyIncBigInt = BigInt(deductRes.monthlyTokenUsedIncremented);

          storedDetails = {
            details: deductRes.details,
            consumeLedgerIds: deductRes.ledgerIds,
            consumeIdempotencyKey: consumeKey,
            isUnlimited: false,
          };

          // 逐条强校验流水与明细
          await verifyConsumeLedgersInTx(tx, {
            userId,
            workspaceId,
            taskId,
            holdPoints,
            details: deductRes.details,
            consumeLedgerIds: deductRes.ledgerIds,
            consumeIdempotencyKey: consumeKey,
            isUnlimited: false,
          });

          cr = {
            skipped: false,
            unlimited: false,
            ...deductRes,
          };
        }

        const holdId = randomUUID();
        const settlementId = randomUUID();

        // 插入预扣记录 (tokensettlementhold)
        await tx.$executeRaw`
          INSERT INTO \`tokensettlementhold\` (
            \`id\`, \`taskId\`, \`userId\`, \`workspaceId\`, \`holdPoints\`,
            \`monthlyTokenUsedIncremented\`, \`status\`, \`idempotencyKey\`, \`holdDetails\`, \`expiresAt\`,
            \`statusChangedAt\`, \`createdAt\`, \`updatedAt\`
          ) VALUES (
            ${holdId}, ${taskId}, ${userId}, ${workspaceId}, ${holdPoints},
            ${monthlyIncBigInt}, 'HELD', ${holdIdempotencyKey}, ${JSON.stringify(storedDetails)}, ${expiresAt},
            ${now}, ${now}, ${now}
          )
        `;

        // 插入结算主记录 (tokensettlement)
        await tx.$executeRaw`
          INSERT INTO \`tokensettlement\` (
            \`id\`, \`taskId\`, \`userId\`, \`workspaceId\`, \`status\`,
            \`holdPoints\`, \`monthlyTokenUsedIncremented\`, \`actualPricePoints\`, \`releasedPoints\`, \`supplementPoints\`,
            \`inputTokens\`, \`outputTokens\`, \`cacheReadTokens\`, \`cacheWriteTokens\`,
            \`costMicros\`, \`userPriceMicros\`, \`pricingSnapshot\`, \`settlementVersion\`,
            \`createdAt\`, \`updatedAt\`
          ) VALUES (
            ${settlementId}, ${taskId}, ${userId}, ${workspaceId}, 'HOLD',
            ${holdPoints}, ${monthlyIncBigInt}, 0, 0, 0,
            0, 0, 0, 0,
            NULL, NULL, ${JSON.stringify(pricingSnapshot)}, 1,
            ${now}, ${now}
          )
        `;

        return {
          holdId,
          settlementId,
          taskId,
          holdPoints,
          status: "HELD",
          isIdempotent: false,
          consumeResult: cr,
        };
      });
    } catch (err: unknown) {
      if (attempt < MAX_REFUND_RETRIES && isRetryableP2034(err)) {
        await backoffDelay(attempt);
        continue;
      }
      throw err;
    }
  }
}

/**
 * 1. 创建预扣与结算流水记录 (HOLD) - 兼容重载版
 * 按 taskId 幂等，具备严格的完整性校验与归属校验
 */
export async function createSettlementHold(params: CreateHoldParams): Promise<HoldResult> {
  const { taskId, userId, workspaceId, holdPoints, pricingSnapshot, holdDetails } = params;
  const holdBigInt = validateSafePoints(holdPoints, "holdPoints");
  const monthlyIncBigInt =
    params.monthlyTokenUsedIncremented !== undefined && params.monthlyTokenUsedIncremented !== null
      ? validateSafePoints(params.monthlyTokenUsedIncremented, "monthlyTokenUsedIncremented")
      : B_ZERO;

  const stored = parseStoredHoldDetails(holdDetails);
  const normalizedDetails = stored.details.length > 0 ? stored.details : (Array.isArray(holdDetails) ? holdDetails : []);
  const extractedLedgerIds = normalizedDetails.map((d) => d.ledgerId).filter(Boolean);
  const consumeLedgerIds =
    params.consumeLedgerIds ??
    (stored.consumeLedgerIds && stored.consumeLedgerIds.length > 0 ? stored.consumeLedgerIds : extractedLedgerIds);
  const consumeIdempotencyKey = params.consumeIdempotencyKey ?? stored.consumeIdempotencyKey;
  const isUnlimited = Boolean(stored.isUnlimited);

  // 完整性强校验（纯 BigInt）：
  if (holdBigInt > B_ZERO && (!normalizedDetails || normalizedDetails.length === 0) && !isUnlimited) {
    throw new TokenSettlementError("HOLD_DETAILS_EMPTY", `任务 ${taskId} 预扣点数大于 0 (${holdBigInt}) 时消费明细 details 严禁为空`);
  }
  const detailsSum = (normalizedDetails || []).reduce((sum, d) => sum + validateSafePoints(d.points, "detail.points"), B_ZERO);
  if (holdBigInt !== detailsSum && !isUnlimited) {
    throw new TokenSettlementError(
      "HOLD_AMOUNT_MISMATCH",
      `预扣点数与明细合计不符: holdPoints=${holdBigInt}, detailsSum=${detailsSum}`
    );
  }

  const storedToSave: StoredHoldDetails = {
    details: normalizedDetails,
    consumeLedgerIds: consumeLedgerIds || [],
    consumeIdempotencyKey: consumeIdempotencyKey || "",
    isUnlimited,
  };

  const idempotencyKey = `HOLD:${taskId}`;
  const expiresInMs = params.expiresInMs ?? 10 * 60 * 1000;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiresInMs);

  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return await prisma.$transaction(async (tx) => {
        // 先检查是否已有 HOLD 记录
        const existingHolds = await tx.$queryRaw<
          Array<{ id: string; userId: string; workspaceId: string; status: string; holdPoints: bigint }>
        >`
          SELECT \`id\`, \`userId\`, \`workspaceId\`, \`status\`, \`holdPoints\`
          FROM \`tokensettlementhold\` WHERE \`taskId\` = ${taskId} LIMIT 1
        `;

        if (existingHolds.length > 0) {
          const row = existingHolds[0];
          // 幂等校验：重入传参必须与原预扣记录严格一致
          if (row.userId !== userId || row.workspaceId !== workspaceId || row.holdPoints !== holdBigInt) {
            throw new TokenSettlementError(
              "HOLD_IDEMPOTENCY_MISMATCH",
              `任务 ${taskId} 幂等重入参数与原 HOLD 不一致`
            );
          }

          // 获取真正的 settlementId
          const settlements = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT \`id\` FROM \`tokensettlement\` WHERE \`taskId\` = ${taskId} LIMIT 1
          `;

          return {
            holdId: row.id,
            settlementId: settlements[0]?.id || row.id,
            taskId,
            holdPoints: row.holdPoints,
            status: row.status as SettlementHoldStatus,
            isIdempotent: true,
          };
        }

        // 校验流水归属与一致性
        await verifyConsumeLedgersInTx(tx, {
          userId,
          workspaceId,
          taskId,
          holdPoints: holdBigInt,
          details: normalizedDetails,
          consumeLedgerIds,
          consumeIdempotencyKey,
          isUnlimited,
        });

        const holdId = randomUUID();
        const settlementId = randomUUID();

        // 插入预扣记录
        await tx.$executeRaw`
          INSERT INTO \`tokensettlementhold\` (
            \`id\`, \`taskId\`, \`userId\`, \`workspaceId\`, \`holdPoints\`,
            \`monthlyTokenUsedIncremented\`, \`status\`, \`idempotencyKey\`, \`holdDetails\`, \`expiresAt\`,
            \`statusChangedAt\`, \`createdAt\`, \`updatedAt\`
          ) VALUES (
            ${holdId}, ${taskId}, ${userId}, ${workspaceId}, ${holdBigInt},
            ${monthlyIncBigInt}, 'HELD', ${idempotencyKey}, ${JSON.stringify(storedToSave)}, ${expiresAt},
            ${now}, ${now}, ${now}
          )
        `;

        // 插入结算主记录（初始为 HOLD，关联 taskId）
        await tx.$executeRaw`
          INSERT INTO \`tokensettlement\` (
            \`id\`, \`taskId\`, \`userId\`, \`workspaceId\`, \`status\`,
            \`holdPoints\`, \`monthlyTokenUsedIncremented\`, \`actualPricePoints\`, \`releasedPoints\`, \`supplementPoints\`,
            \`inputTokens\`, \`outputTokens\`, \`cacheReadTokens\`, \`cacheWriteTokens\`,
            \`costMicros\`, \`userPriceMicros\`, \`pricingSnapshot\`, \`settlementVersion\`,
            \`createdAt\`, \`updatedAt\`
          ) VALUES (
            ${settlementId}, ${taskId}, ${userId}, ${workspaceId}, 'HOLD',
            ${holdBigInt}, ${monthlyIncBigInt}, 0, 0, 0,
            0, 0, 0, 0,
            NULL, NULL, ${JSON.stringify(pricingSnapshot)}, 1,
            ${now}, ${now}
          )
        `;

        return {
          holdId,
          settlementId,
          taskId,
          holdPoints: holdBigInt,
          status: "HELD",
          isIdempotent: false,
        };
      });
    } catch (err: unknown) {
      if (attempt < MAX_REFUND_RETRIES && isRetryableP2034(err)) {
        await backoffDelay(attempt);
        continue;
      }
      const errObj = err as { code?: string; meta?: { code?: string }; message?: string };
      const isDuplicate =
        errObj?.code === "P2002" ||
        errObj?.meta?.code === "1062" ||
        (typeof errObj?.message === "string" &&
          (errObj.message.includes("1062") || errObj.message.includes("Duplicate entry")));

      if (isDuplicate) {
        for (let i = 0; i < 3; i++) {
          const rows = await prisma.$queryRaw<
            Array<{ id: string; userId: string; workspaceId: string; status: string; holdPoints: bigint }>
          >`
            SELECT \`id\`, \`userId\`, \`workspaceId\`, \`status\`, \`holdPoints\`
            FROM \`tokensettlementhold\` WHERE \`taskId\` = ${taskId} LIMIT 1
          `;
          if (rows.length > 0) {
            const row = rows[0];
            if (row.userId !== userId || row.workspaceId !== workspaceId || row.holdPoints !== holdBigInt) {
              throw new TokenSettlementError("HOLD_IDEMPOTENCY_MISMATCH", `任务 ${taskId} 幂等重入参数不一致`);
            }
            const settlements = await prisma.$queryRaw<Array<{ id: string }>>`
              SELECT \`id\` FROM \`tokensettlement\` WHERE \`taskId\` = ${taskId} LIMIT 1
            `;
            return {
              holdId: row.id,
              settlementId: settlements[0]?.id || row.id,
              taskId,
              holdPoints: row.holdPoints,
              status: row.status as SettlementHoldStatus,
              isIdempotent: true,
            };
          }
          await backoffDelay(i + 1);
        }
      }
      throw err;
    }
  }
}

export interface CompleteSettlementParams {
  taskId: string;
  userId: string;
  workspaceId: string;
  usage: UsageCostInput | UsageCostInputBigInt;
  /** @deprecated 外部 pricing 参数已废弃，completeSettlement 必须严格基于数据库锁定的 pricingSnapshot 进行真实结算 */
  pricing?: DeploymentPricing;
  pricingSnapshot?: RegistryPricingSnapshot;
  workspaceType?: string | null;
  workspaceName?: string | null;
  userEmail?: string | null;
  componentId?: string | null;
  componentName?: string | null;
  recoveryContext?: {
    claimToken: string;
    expectedSettlementVersion?: number;
    workerId?: string;
  };
}

export interface CompleteSettlementResult {
  taskId: string;
  status: SettlementHoldStatus;
  holdPoints: bigint;
  actualPricePoints: bigint;
  releasedPoints: bigint;
  supplementPoints: bigint;
  costMicros: bigint | null;
  userPriceMicros?: bigint | null;
  isAlreadySettled: boolean;
}

/**
 * 2. 结算真实用量 (HOLD -> SETTLED / REQUIRES_REVIEW)
 * - 严格遵循锁顺序：账户锁 -> tokensettlement (FOR UPDATE) -> pointgrant (FOR UPDATE) -> pointledger；
 * - 归属强校验：以数据库中的记录为准；
 * - 价格唯一源于 pricingSnapshot，严禁以成本价兜底，售价缺失转 REQUIRES_REVIEW；
 * - 超额补扣严格复用 deductPointsInTx 共享账务原语，补扣不足整笔回滚零负余额；
 * - 差额释放采用 LIFO 逆序释放分桶，分桶扣尽转 EXHAUSTED，释放变 ACTIVE；
 * - 状态流转原子 CAS 条件更新且递增 settlementVersion。
 */
export async function completeSettlement(
  params: CompleteSettlementParams
): Promise<CompleteSettlementResult> {
  const { taskId, userId, workspaceId, usage } = params;

  let tokenValidationError: string | null = null;
  let inputTokens = B_ZERO;
  let outputTokens = B_ZERO;
  let cacheReadTokens = B_ZERO;
  let cacheWriteTokens = B_ZERO;
  try {
    inputTokens = validateTokenCount(usage.inputTokens, "inputTokens");
    outputTokens = validateTokenCount(usage.outputTokens, "outputTokens");
    cacheReadTokens = validateTokenCount(usage.cacheReadTokens, "cacheReadTokens");
    cacheWriteTokens = validateTokenCount(usage.cacheWriteTokens, "cacheWriteTokens");
  } catch (err: unknown) {
    if (err instanceof TokenSettlementError && (err.code === "INVALID_USAGE_TOKENS" || err.code === "USAGE_EXCEEDS_SAFE_LIMIT")) {
      tokenValidationError = err.message;
    } else {
      throw err;
    }
  }

  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return await prisma.$transaction(async (tx) => {
        const now = new Date();

        // 按照统一全局账务锁顺序：
        // 步骤 1: 先锁定账户行（userwallet -> workspacequota -> workspacemember）
        await acquireAccountLocks(tx, userId, workspaceId, {
          needWallet: true,
          needQuota: true,
          needMember: true,
        });

        // 步骤 1.5: 若由 Recovery Worker 执行，必须在任何状态修改或提前返回之前锁定并校验 Recovery
        // （stale token / 过期租约 / 非 PROCESSING 状态将在此整笔回滚，三表零变化）
        if (params.recoveryContext) {
          await verifyRecoveryFencingInTx(tx, taskId, params.recoveryContext.claimToken, now);
        }

        // 步骤 2: 锁定结算主记录（tokensettlement -> tokensettlementhold）
        const records = await tx.$queryRaw<
          Array<{
            id: string;
            userId: string;
            workspaceId: string;
            status: string;
            holdPoints: bigint;
            monthlyTokenUsedIncremented: bigint;
            actualPricePoints: bigint;
            releasedPoints: bigint;
            supplementPoints: bigint;
            pricingSnapshot: unknown;
            settlementVersion: number;
          }>
        >`
          SELECT \`id\`, \`userId\`, \`workspaceId\`, \`status\`, \`holdPoints\`, \`monthlyTokenUsedIncremented\`,
                 \`actualPricePoints\`, \`releasedPoints\`, \`supplementPoints\`,
                 \`pricingSnapshot\`, \`settlementVersion\`
          FROM \`tokensettlement\`
          WHERE \`taskId\` = ${taskId}
          FOR UPDATE
        `;

        if (records.length === 0) {
          throw new TokenSettlementError("SETTLEMENT_RECORD_NOT_FOUND", `未找到任务 ${taskId} 的结算记录`);
        }

        const current = records[0];

        // 校验 settlementVersion CAS 一致性
        if (params.recoveryContext?.expectedSettlementVersion != null) {
          if (current.settlementVersion !== params.recoveryContext.expectedSettlementVersion) {
            throw new TokenSettlementError(
              "SETTLEMENT_VERSION_MISMATCH",
              `Recovery 版本不匹配: 期望=${params.recoveryContext.expectedSettlementVersion}, 实际=${current.settlementVersion}`
            );
          }
        }

        // 归属一致性强校验
        if (current.userId !== userId || current.workspaceId !== workspaceId) {
          throw new TokenSettlementError(
            "ACCOUNT_MISMATCH",
            `任务 ${taskId} 归属校验失败: 请求参数与结算主记录不匹配`
          );
        }

        // 终态不可逆校验
        if (current.status === "SETTLED") {
          // Recovery 上下文下必须同步终结算 Recovery（绝不残留 PROCESSING）
          if (params.recoveryContext) {
            await terminateRecoveryInTx(tx, taskId, params.recoveryContext.claimToken, "SETTLED", now);
          }
          return {
            taskId,
            status: "SETTLED",
            holdPoints: current.holdPoints,
            actualPricePoints: current.actualPricePoints,
            releasedPoints: current.releasedPoints,
            supplementPoints: current.supplementPoints,
            costMicros: null,
            isAlreadySettled: true,
          };
        }

        if (current.status === "RELEASED" || current.status === "REQUIRES_REVIEW") {
          // Recovery 上下文下：结算主记录已非 HOLD，强制将本 Worker 持有的 PROCESSING Recovery 收口为一致终态
          if (params.recoveryContext) {
            const termStatus: "RELEASED" | "REQUIRES_REVIEW" =
              current.status === "RELEASED" ? "RELEASED" : "REQUIRES_REVIEW";
            await terminateRecoveryInTx(tx, taskId, params.recoveryContext.claimToken, termStatus, now);
            return {
              taskId,
              status: current.status as "RELEASED" | "REQUIRES_REVIEW",
              holdPoints: current.holdPoints,
              actualPricePoints: B_ZERO,
              releasedPoints: B_ZERO,
              supplementPoints: B_ZERO,
              costMicros: null,
              isAlreadySettled: false,
            };
          }
          throw new InvalidStateTransitionError(current.status, "SETTLED", taskId);
        }

        if (current.status !== "HOLD") {
          if (params.recoveryContext) {
            await terminateRecoveryInTx(tx, taskId, params.recoveryContext.claimToken, "REQUIRES_REVIEW", now);
            return {
              taskId,
              status: "REQUIRES_REVIEW",
              holdPoints: current.holdPoints,
              actualPricePoints: B_ZERO,
              releasedPoints: B_ZERO,
              supplementPoints: B_ZERO,
              costMicros: null,
              isAlreadySettled: false,
            };
          }
          throw new InvalidStateTransitionError(current.status, "SETTLED", taskId);
        }

        if (tokenValidationError) {
          await tx.$executeRaw`
            UPDATE \`tokensettlement\`
            SET \`status\` = 'REQUIRES_REVIEW',
                \`errorCode\` = 'INVALID_USAGE_TOKENS',
                \`auditMessage\` = ${`结算拒绝: ${tokenValidationError}`},
                \`settlementVersion\` = \`settlementVersion\` + 1,
                \`settledAt\` = ${now},
                \`updatedAt\` = ${now}
            WHERE \`taskId\` = ${taskId} AND \`status\` = 'HOLD'
          `;
          await tx.$executeRaw`
            UPDATE \`tokensettlementhold\`
            SET \`status\` = 'REQUIRES_REVIEW',
                \`statusChangedAt\` = ${now},
                \`updatedAt\` = ${now}
            WHERE \`taskId\` = ${taskId} AND \`status\` = 'HELD'
          `;
          if (params.recoveryContext) {
            await terminateRecoveryInTx(tx, taskId, params.recoveryContext.claimToken, "REQUIRES_REVIEW", now);
          }
          return {
            taskId,
            status: "REQUIRES_REVIEW",
            holdPoints: current.holdPoints,
            actualPricePoints: B_ZERO,
            releasedPoints: B_ZERO,
            supplementPoints: B_ZERO,
            costMicros: null,
            isAlreadySettled: false,
          };
        }

        // 步骤 3: 提取并严格校验持久化 pricingSnapshot（唯一价格来源）
        let rawSnapshot = current.pricingSnapshot;
        if (typeof rawSnapshot === "string") {
          try {
            rawSnapshot = JSON.parse(rawSnapshot);
          } catch {
            rawSnapshot = null;
          }
        }
        const snapshot = rawSnapshot as RegistryPricingSnapshot | null;
        if (!snapshot) {
          await tx.$executeRaw`
            UPDATE \`tokensettlement\`
            SET \`status\` = 'REQUIRES_REVIEW',
                \`errorCode\` = 'PRICING_SNAPSHOT_MISSING',
                \`auditMessage\` = '结算失败：历史价格快照缺失或损坏，挂起人工复核',
                \`settlementVersion\` = \`settlementVersion\` + 1,
                \`updatedAt\` = ${now}
            WHERE \`taskId\` = ${taskId} AND \`status\` = 'HOLD'
          `;
          await tx.$executeRaw`
            UPDATE \`tokensettlementhold\`
            SET \`status\` = 'REQUIRES_REVIEW',
                \`statusChangedAt\` = ${now},
                \`updatedAt\` = ${now}
            WHERE \`taskId\` = ${taskId} AND \`status\` = 'HELD'
          `;
          if (params.recoveryContext) {
            await terminateRecoveryInTx(tx, taskId, params.recoveryContext.claimToken, "REQUIRES_REVIEW", now);
          }
          return {
            taskId,
            status: "REQUIRES_REVIEW",
            holdPoints: current.holdPoints,
            actualPricePoints: B_ZERO,
            releasedPoints: B_ZERO,
            supplementPoints: B_ZERO,
            costMicros: null,
            isAlreadySettled: false,
          };
        }

        const pricing = reconstructPricingFromSnapshot(snapshot);
        // 使用纯 BigInt 整数计费函数，单价、Token 与微元全程 BigInt，禁止 Math.round(Number)
        const calc = computeUsageCostBigInt(
          pricing,
          {
            inputTokens,
            outputTokens,
            cacheReadTokens,
            cacheWriteTokens,
          },
          { settlementFeatureEnabled: true }
        );

        // 严禁以成本价兜底：用户侧价格必须存在且计费可用
        if (!calc.settlementReady || !calc.pricePriced || calc.priceMicros === null) {
          const reason = !calc.settlementReady
            ? "价格门禁不满足(未就绪/模式冲突)"
            : `缺失必要价格项: [${calc.missingPriceCategories.join(",")}]`;

          await tx.$executeRaw`
            UPDATE \`tokensettlement\`
            SET \`status\` = 'REQUIRES_REVIEW',
                \`errorCode\` = 'PRICE_NOT_CONFIGURED',
                \`auditMessage\` = ${`结算转复核：严禁以成本价兜底计费，${reason}`},
                \`settlementVersion\` = \`settlementVersion\` + 1,
                \`updatedAt\` = ${now}
            WHERE \`taskId\` = ${taskId} AND \`status\` = 'HOLD'
          `;
          await tx.$executeRaw`
            UPDATE \`tokensettlementhold\`
            SET \`status\` = 'REQUIRES_REVIEW',
                \`statusChangedAt\` = ${now},
                \`updatedAt\` = ${now}
            WHERE \`taskId\` = ${taskId} AND \`status\` = 'HELD'
          `;
          if (params.recoveryContext) {
            await terminateRecoveryInTx(tx, taskId, params.recoveryContext.claimToken, "REQUIRES_REVIEW", now);
          }

          return {
            taskId,
            status: "REQUIRES_REVIEW",
            holdPoints: current.holdPoints,
            actualPricePoints: B_ZERO,
            releasedPoints: B_ZERO,
            supplementPoints: B_ZERO,
            costMicros: calc.costMicros,
            userPriceMicros: null,
            isAlreadySettled: false,
          };
        }

        // 计算应扣算力点数（从 MICROS_PER_POINT 共享真源向上取整）
        const userPriceMicrosBig = calc.priceMicros;
        const costMicrosBig = calc.costMicros;
        const actualPricePoints = (userPriceMicrosBig + MICROS_PER_POINT - BigInt(1)) / MICROS_PER_POINT;

        // 提取原预扣明细与无限额度标记
        const holds = await tx.$queryRaw<Array<{ holdDetails: unknown }>>`
          SELECT \`holdDetails\` FROM \`tokensettlementhold\` WHERE \`taskId\` = ${taskId} LIMIT 1
        `;
        const storedHold = parseStoredHoldDetails(holds[0]?.holdDetails);
        const isUnlimited = Boolean(storedHold.isUnlimited);

        const holdPoints = current.holdPoints;
        let releasedPoints = B_ZERO;
        let supplementPoints = B_ZERO;
        let nextStatus: TokenSettlementStatus = "SETTLED";
        let auditMsg = `用量结算成功: input=${inputTokens}, output=${outputTokens}, priceMicros=${userPriceMicrosBig}`;

        if (isUnlimited) {
          // 场景 0: 无限额度独立处理 —— 不扣真实点数，不退差额，只记录用量与供应商成本，零虚假流水
          auditMsg += `; 无限额度空间用量结算（不产生资金退扣）`;
        } else if (actualPricePoints < holdPoints) {
          // 场景 A: 实际使用低于预扣 -> 按 LIFO 逆序原路退还差额点数
          const diffToRelease = holdPoints - actualPricePoints;
          releasedPoints = diffToRelease;
          const details = storedHold.details;

          let remainingToRefund = diffToRelease;
          // LIFO 逆序释放：优先返还最后扣除的分桶
          const reversedDetails = [...details].reverse();

          for (let idx = 0; idx < reversedDetails.length; idx++) {
            if (remainingToRefund <= B_ZERO) break;
            const d = reversedDetails[idx];
            const dPointsBig = BigInt(d.points);
            const takeBack = dPointsBig < remainingToRefund ? dPointsBig : remainingToRefund;
            remainingToRefund -= takeBack;

            // 分桶与账户恢复
            let balanceAfter = B_ZERO;
            if (d.kind === "MEMBER") {
              const affected = await tx.$executeRaw`
                UPDATE \`workspacemember\`
                SET \`tokenBalance\` = \`tokenBalance\` + ${takeBack}
                WHERE \`userId\` = ${userId} AND \`workspaceId\` = ${workspaceId}
              `;
              if (affected === 0) {
                throw new RefundAccountNotFoundError(
                  `REFUND_ACCOUNT_NOT_FOUND: 工作空间成员账户不存在 (userId=${userId}, workspaceId=${workspaceId})`
                );
              }
              const m = await tx.workspacemember.findUnique({
                where: { userId_workspaceId: { userId, workspaceId } },
                select: { tokenBalance: true },
              });
              balanceAfter = m ? m.tokenBalance : B_ZERO;
            } else {
              // WALLET / WORKSPACE / PERSONAL_GIFT
              const grant = d.grantId ? await tx.pointgrant.findUnique({ where: { id: d.grantId } }) : null;
              const expiredOrMissing = !grant || grant.status === "EXPIRED" || (grant.expiresAt && grant.expiresAt < now);

              if (!expiredOrMissing && grant) {
                await tx.pointgrant.update({
                  where: { id: grant.id },
                  data: {
                    remaining: { increment: takeBack },
                    status: "ACTIVE",
                    updatedAt: now,
                  },
                });
              } else {
                // 原分桶已过期/缺失：创建同 scope 兜底分桶
                await tx.pointgrant.create({
                  data: {
                    id: randomUUID(),
                    scope: d.scope,
                    userId: d.kind === "WALLET" ? userId : null,
                    workspaceId: d.kind === "WALLET" ? null : workspaceId,
                    points: takeBack,
                    remaining: takeBack,
                    sourceType: "REFUND",
                    sourceId: `SETTLEMENT_RELEASE:${taskId}:${idx}`,
                    status: "ACTIVE",
                    title: "原分桶已过期·结算释放兜底",
                    remark: "原分桶已过期或缺失，已释放至同 scope 兜底分桶",
                    updatedAt: now,
                  },
                });
              }

              if (d.kind === "WALLET") {
                const affected = await tx.$executeRaw`
                  UPDATE \`userwallet\`
                  SET \`balance\` = \`balance\` + ${takeBack}, \`updatedAt\` = ${now}
                  WHERE \`userId\` = ${userId}
                `;
                if (affected === 0) {
                  throw new RefundAccountNotFoundError(
                    `REFUND_ACCOUNT_NOT_FOUND: 用户钱包账户不存在 (userId=${userId})`
                  );
                }
                const w = await tx.userwallet.findUnique({ where: { userId } });
                balanceAfter = w ? w.balance : B_ZERO;
              } else {
                const affected = await tx.$executeRaw`
                  UPDATE \`workspacequota\`
                  SET \`tokenBalance\` = \`tokenBalance\` + ${takeBack}, \`updatedAt\` = ${now}
                  WHERE \`workspaceId\` = ${workspaceId}
                `;
                if (affected === 0) {
                  throw new RefundAccountNotFoundError(
                    `REFUND_ACCOUNT_NOT_FOUND: 空间配额账户不存在 (workspaceId=${workspaceId})`
                  );
                }
                const q = await tx.workspacequota.findUnique({ where: { workspaceId } });
                balanceAfter = q ? q.tokenBalance : B_ZERO;
              }
            }

            // 写入释放流水
            await tx.pointledger.create({
              data: {
                id: randomUUID(),
                direction: "IN",
                type: "REFUND",
                scope: d.scope,
                userId,
                userEmail: params.userEmail ?? null,
                workspaceId,
                workspaceType: params.workspaceType ?? null,
                workspaceName: params.workspaceName ?? null,
                operatorId: userId,
                points: takeBack,
                balanceAfter,
                componentId: params.componentId ?? null,
                componentName: params.componentName ?? null,
                taskId,
                grantId: d.kind === "MEMBER" ? null : (d.grantId || null),
                title: "用量结算差额释放",
                remark: `实际使用低于预扣，释放多扣点数 ${takeBack} 点`,
                idempotencyKey: `SETTLEMENT_RELEASE:${taskId}:${idx}`,
              },
            });
          }

          // 回滚月度用量
          if (current.monthlyTokenUsedIncremented > B_ZERO) {
            const rollbackMonthly =
              diffToRelease < current.monthlyTokenUsedIncremented
                ? diffToRelease
                : current.monthlyTokenUsedIncremented;

            const affected = await tx.$executeRaw`
              UPDATE \`workspacemember\`
              SET \`monthlyTokenUsed\` = IF(\`monthlyTokenUsed\` >= ${rollbackMonthly}, \`monthlyTokenUsed\` - ${rollbackMonthly}, 0)
              WHERE \`userId\` = ${userId} AND \`workspaceId\` = ${workspaceId}
            `;
            if (affected === 0) {
              throw new RefundAccountNotFoundError(`REFUND_ACCOUNT_NOT_FOUND: 空间成员月度用量更新失败`);
            }
          }

          auditMsg += `; 多扣差额释放 ${diffToRelease} 点`;
        } else if (actualPricePoints > holdPoints) {
          // 场景 B: 实际消耗超出预扣 -> 强校验 BigInt 范围后复用 deductPointsInTx 追加补扣
          const diffToSupplement = actualPricePoints - holdPoints;

          if (diffToSupplement > BigInt(Number.MAX_SAFE_INTEGER)) {
            // 超出安全整数上限：抛错并整笔转入人工复核，禁止截断转 Number
            nextStatus = "REQUIRES_REVIEW";
            auditMsg += `; 追加补扣失败: 补扣点数超出安全整数上限 (${diffToSupplement})，已整笔转入人工复核`;
          } else {
            try {
              const suppRes = await deductPointsInTx(tx, {
                userId,
                workspaceId,
                workspaceType: params.workspaceType,
                workspaceName: params.workspaceName,
                userEmail: params.userEmail,
                need: Number(diffToSupplement),
                taskId,
                componentId: params.componentId,
                componentName: params.componentName,
                title: "用量结算超额补扣",
                remark: `实际使用超出预扣，追加补扣 ${diffToSupplement} 点`,
                idempotencyPrefix: `SETTLEMENT_SUPPLEMENT:${taskId}`,
                bumpMonthlyUsed: true, // 统一口径：多补差额同步累加成员 monthlyTokenUsed
              });

              supplementPoints = BigInt(suppRes.consumed);
              auditMsg += `; 成功追加补扣 ${supplementPoints} 点`;
            } catch (err: unknown) {
              if (err instanceof InsufficientPointsError) {
                // 补扣不足：整笔补扣事务完全回滚，不扣除任何点数，转入 REQUIRES_REVIEW，绝不产生负余额
                nextStatus = "REQUIRES_REVIEW";
                auditMsg += `; 追加补扣失败: 需补扣 ${diffToSupplement} 点，可用仅 ${err.available} 点。已整笔回滚并转入人工复核，未产生负余额。`;
              } else {
                throw err;
              }
            }
          }
        }

        // 原子 CAS 更新结算主记录
        await tx.$executeRaw`
          UPDATE \`tokensettlement\`
          SET \`status\` = ${nextStatus},
              \`actualPricePoints\` = ${nextStatus === "SETTLED" ? actualPricePoints : B_ZERO},
              \`releasedPoints\` = ${releasedPoints},
              \`supplementPoints\` = ${supplementPoints},
              \`inputTokens\` = ${inputTokens},
              \`outputTokens\` = ${outputTokens},
              \`cacheReadTokens\` = ${cacheReadTokens},
              \`cacheWriteTokens\` = ${cacheWriteTokens},
              \`costMicros\` = ${costMicrosBig},
              \`userPriceMicros\` = ${nextStatus === "SETTLED" ? userPriceMicrosBig : null},
              \`auditMessage\` = ${auditMsg},
              \`settlementVersion\` = \`settlementVersion\` + 1,
              \`settledAt\` = ${now},
              \`updatedAt\` = ${now}
          WHERE \`taskId\` = ${taskId} AND \`status\` = 'HOLD'
        `;

        // 同事务更新预扣单 tokensettlementhold 状态（SETTLED 或 REQUIRES_REVIEW 强一致同步）
        if (nextStatus === "SETTLED" || nextStatus === "REQUIRES_REVIEW") {
          await tx.$executeRaw`
            UPDATE \`tokensettlementhold\`
            SET \`status\` = ${nextStatus},
                \`statusChangedAt\` = ${now},
                \`updatedAt\` = ${now}
            WHERE \`taskId\` = ${taskId} AND \`status\` = 'HELD'
          `;
        }

        // 步骤 5: 若由 Recovery Worker 执行，Recovery 已在步骤 1.5 锁定并校验（claimToken/status/leaseUntil），
        // 此处仅同事务将已验证的 Recovery 置为一致终态并清空 claimToken/leaseUntil（绝不残留 PROCESSING）。
        if (params.recoveryContext) {
          await terminateRecoveryInTx(
            tx,
            taskId,
            params.recoveryContext.claimToken,
            nextStatus === "SETTLED" ? "SETTLED" : "REQUIRES_REVIEW",
            now
          );
        }

        return {
          taskId,
          status: nextStatus,
          holdPoints,
          actualPricePoints: nextStatus === "SETTLED" ? actualPricePoints : B_ZERO,
          releasedPoints,
          supplementPoints,
          costMicros: costMicrosBig,
          userPriceMicros: nextStatus === "SETTLED" ? userPriceMicrosBig : null,
          isAlreadySettled: false,
        };
      });
    } catch (err: unknown) {
      if (attempt < MAX_REFUND_RETRIES && isRetryableP2034(err)) {
        await backoffDelay(attempt);
        continue;
      }
      throw err;
    }
  }
}

export interface ReleaseHoldParams {
  taskId: string;
  userId: string;
  workspaceId: string;
  reason: string;
  errorCode?: string;
  componentId?: string | null;
  componentName?: string | null;
  workspaceType?: string | null;
  workspaceName?: string | null;
  userEmail?: string | null;
  recoveryContext?: {
    claimToken: string;
    expectedSettlementVersion?: number;
    workerId?: string;
  };
}

export interface ReleaseHoldResult {
  taskId: string;
  status: SettlementHoldStatus;
  releasedPoints: bigint;
  isAlreadyReleased: boolean;
}

/**
 * 3. 失败/异常释放预扣 (HOLD -> RELEASED)
 * 模型失败、超时、认证失败等场景触发，全额原路退还预扣点数并精确回滚月度用量。
 */
export async function releaseSettlementHold(params: ReleaseHoldParams): Promise<ReleaseHoldResult> {
  const { taskId, userId, workspaceId, reason, errorCode } = params;

  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return await prisma.$transaction(async (tx) => {
        const now = new Date();

        // 按照统一全局账务锁顺序：
        // 步骤 1: 先锁定账户行（userwallet -> workspacequota -> workspacemember）
        await acquireAccountLocks(tx, userId, workspaceId, {
          needWallet: true,
          needQuota: true,
          needMember: true,
        });

        // 步骤 1.5: 若由 Recovery Worker 执行，必须在任何状态修改或提前返回之前锁定并校验 Recovery
        if (params.recoveryContext) {
          await verifyRecoveryFencingInTx(tx, taskId, params.recoveryContext.claimToken, now);
        }

        // 步骤 2: 锁定结算主记录与预扣记录（tokensettlement -> tokensettlementhold）
        const records = await tx.$queryRaw<
          Array<{
            id: string;
            userId: string;
            workspaceId: string;
            status: string;
            holdPoints: bigint;
            monthlyTokenUsedIncremented: bigint;
            settlementVersion: number;
          }>
        >`
          SELECT \`id\`, \`userId\`, \`workspaceId\`, \`status\`, \`holdPoints\`,
                 \`monthlyTokenUsedIncremented\`, \`settlementVersion\`
          FROM \`tokensettlement\`
          WHERE \`taskId\` = ${taskId}
          FOR UPDATE
        `;

        if (records.length === 0) {
          throw new TokenSettlementError("SETTLEMENT_RECORD_NOT_FOUND", `未找到任务 ${taskId} 的结算记录`);
        }

        const current = records[0];

        // 校验 settlementVersion CAS 一致性
        if (params.recoveryContext?.expectedSettlementVersion != null) {
          if (current.settlementVersion !== params.recoveryContext.expectedSettlementVersion) {
            throw new TokenSettlementError(
              "SETTLEMENT_VERSION_MISMATCH",
              `Recovery 版本不匹配: 期望=${params.recoveryContext.expectedSettlementVersion}, 实际=${current.settlementVersion}`
            );
          }
        }

        // 归属一致性强校验
        if (current.userId !== userId || current.workspaceId !== workspaceId) {
          throw new TokenSettlementError(
            "ACCOUNT_MISMATCH",
            `任务 ${taskId} 释放归属校验失败: 请求参数与记录不匹配`
          );
        }

        // 终态校验：不可逆不可重复；普通释放绝不得处理 REQUIRES_REVIEW
        if (current.status === "RELEASED") {
          // Recovery 上下文下必须同步终结算 Recovery（绝不残留 PROCESSING）
          if (params.recoveryContext) {
            await terminateRecoveryInTx(tx, taskId, params.recoveryContext.claimToken, "RELEASED", now);
          }
          return {
            taskId,
            status: "RELEASED",
            releasedPoints: current.holdPoints,
            isAlreadyReleased: true,
          };
        }

        if (current.status === "SETTLED") {
          if (params.recoveryContext) {
            await terminateRecoveryInTx(tx, taskId, params.recoveryContext.claimToken, "REQUIRES_REVIEW", now);
            return {
              taskId,
              status: "REQUIRES_REVIEW",
              releasedPoints: current.holdPoints,
              isAlreadyReleased: false,
            };
          }
          throw new InvalidStateTransitionError("SETTLED", "RELEASED", taskId);
        }

        if (current.status === "REQUIRES_REVIEW") {
          if (params.recoveryContext) {
            await terminateRecoveryInTx(tx, taskId, params.recoveryContext.claimToken, "REQUIRES_REVIEW", now);
            return {
              taskId,
              status: "REQUIRES_REVIEW",
              releasedPoints: current.holdPoints,
              isAlreadyReleased: false,
            };
          }
          throw new InvalidStateTransitionError("REQUIRES_REVIEW", "RELEASED", taskId);
        }

        if (current.status !== "HOLD") {
          if (params.recoveryContext) {
            await terminateRecoveryInTx(tx, taskId, params.recoveryContext.claimToken, "REQUIRES_REVIEW", now);
            return {
              taskId,
              status: "REQUIRES_REVIEW",
              releasedPoints: current.holdPoints,
              isAlreadyReleased: false,
            };
          }
          throw new InvalidStateTransitionError(current.status, "RELEASED", taskId);
        }

        // 提取原预扣明细与无限额度标记
        const holds = await tx.$queryRaw<Array<{ holdDetails: unknown }>>`
          SELECT \`holdDetails\` FROM \`tokensettlementhold\` WHERE \`taskId\` = ${taskId} LIMIT 1
        `;
        const storedHold = parseStoredHoldDetails(holds[0]?.holdDetails);
        const isUnlimited = Boolean(storedHold.isUnlimited) || current.holdPoints === B_ZERO;
        const details = storedHold.details;

        if (!isUnlimited && current.holdPoints > B_ZERO) {
          // 普通额度执行全额原路退还
          for (let idx = 0; idx < details.length; idx++) {
            const d = details[idx];
            const dPointsBig = BigInt(d.points);

            let balanceAfter = B_ZERO;
            if (d.kind === "MEMBER") {
              const affected = await tx.$executeRaw`
                UPDATE \`workspacemember\`
                SET \`tokenBalance\` = \`tokenBalance\` + ${dPointsBig}
                WHERE \`userId\` = ${userId} AND \`workspaceId\` = ${workspaceId}
              `;
              if (affected === 0) {
                throw new RefundAccountNotFoundError(
                  `REFUND_ACCOUNT_NOT_FOUND: 工作空间成员账户不存在 (userId=${userId}, workspaceId=${workspaceId})`
                );
              }
              const m = await tx.workspacemember.findUnique({
                where: { userId_workspaceId: { userId, workspaceId } },
                select: { tokenBalance: true },
              });
              balanceAfter = m ? m.tokenBalance : B_ZERO;
            } else {
              const grant = d.grantId ? await tx.pointgrant.findUnique({ where: { id: d.grantId } }) : null;
              const expiredOrMissing = !grant || grant.status === "EXPIRED" || (grant.expiresAt && grant.expiresAt < now);

              if (!expiredOrMissing && grant) {
                await tx.pointgrant.update({
                  where: { id: grant.id },
                  data: {
                    remaining: { increment: dPointsBig },
                    status: "ACTIVE",
                    updatedAt: now,
                  },
                });
              } else {
                await tx.pointgrant.create({
                  data: {
                    id: randomUUID(),
                    scope: d.scope,
                    userId: d.kind === "WALLET" ? userId : null,
                    workspaceId: d.kind === "WALLET" ? null : workspaceId,
                    points: dPointsBig,
                    remaining: dPointsBig,
                    sourceType: "REFUND",
                    sourceId: `SETTLEMENT_FAIL_RELEASE:${taskId}:${idx}`,
                    status: "ACTIVE",
                    title: "原分桶已过期·释放兜底",
                    remark: "原分桶已过期，释放至同 scope 兜底分桶",
                    updatedAt: now,
                  },
                });
              }

              if (d.kind === "WALLET") {
                const affected = await tx.$executeRaw`
                  UPDATE \`userwallet\`
                  SET \`balance\` = \`balance\` + ${dPointsBig}, \`updatedAt\` = ${now}
                  WHERE \`userId\` = ${userId}
                `;
                if (affected === 0) {
                  throw new RefundAccountNotFoundError(
                    `REFUND_ACCOUNT_NOT_FOUND: 用户钱包账户不存在 (userId=${userId})`
                  );
                }
                const w = await tx.userwallet.findUnique({ where: { userId } });
                balanceAfter = w ? w.balance : B_ZERO;
              } else {
                const affected = await tx.$executeRaw`
                  UPDATE \`workspacequota\`
                  SET \`tokenBalance\` = \`tokenBalance\` + ${dPointsBig}, \`updatedAt\` = ${now}
                  WHERE \`workspaceId\` = ${workspaceId}
                `;
                if (affected === 0) {
                  throw new RefundAccountNotFoundError(
                    `REFUND_ACCOUNT_NOT_FOUND: 空间配额账户不存在 (workspaceId=${workspaceId})`
                  );
                }
                const q = await tx.workspacequota.findUnique({ where: { workspaceId } });
                balanceAfter = q ? q.tokenBalance : B_ZERO;
              }
            }

            // 写入释放流水
            await tx.pointledger.create({
              data: {
                id: randomUUID(),
                direction: "IN",
                type: "REFUND",
                scope: d.scope,
                userId,
                userEmail: params.userEmail ?? null,
                workspaceId,
                workspaceType: params.workspaceType ?? null,
                workspaceName: params.workspaceName ?? null,
                operatorId: userId,
                points: dPointsBig,
                balanceAfter,
                componentId: params.componentId ?? null,
                componentName: params.componentName ?? null,
                taskId,
                grantId: d.kind === "MEMBER" ? null : (d.grantId || null),
                title: "模型调用失败释放预扣",
                remark: `原因: ${reason}`,
                idempotencyKey: `SETTLEMENT_FAIL_RELEASE:${taskId}:${idx}`,
              },
            });
          }

          // 回滚成员月度用量
          if (current.monthlyTokenUsedIncremented > B_ZERO) {
            const affected = await tx.$executeRaw`
              UPDATE \`workspacemember\`
              SET \`monthlyTokenUsed\` = IF(\`monthlyTokenUsed\` >= ${current.monthlyTokenUsedIncremented}, \`monthlyTokenUsed\` - ${current.monthlyTokenUsedIncremented}, 0)
              WHERE \`userId\` = ${userId} AND \`workspaceId\` = ${workspaceId}
            `;
            if (affected === 0) {
              throw new RefundAccountNotFoundError(`REFUND_ACCOUNT_NOT_FOUND: 空间成员月度用量更新失败`);
            }
          }
        }

        // 原子更新两表为 RELEASED 终态（严格限定只允许从 HOLD/HELD 更新）
        await tx.$executeRaw`
          UPDATE \`tokensettlement\`
          SET \`status\` = 'RELEASED',
              \`releasedPoints\` = ${current.holdPoints},
              \`errorCode\` = ${errorCode ?? 'MODEL_CALL_FAILED'},
              \`auditMessage\` = ${`全额释放预扣: ${reason}`},
              \`settlementVersion\` = \`settlementVersion\` + 1,
              \`releasedAt\` = ${now},
              \`updatedAt\` = ${now}
          WHERE \`taskId\` = ${taskId} AND \`status\` = 'HOLD'
        `;

        await tx.$executeRaw`
          UPDATE \`tokensettlementhold\`
          SET \`status\` = 'RELEASED',
              \`statusChangedAt\` = ${now},
              \`updatedAt\` = ${now}
            WHERE \`taskId\` = ${taskId} AND \`status\` = 'HELD'
        `;

        // 步骤 5: 若由 Recovery Worker 执行，Recovery 已在步骤 1.5 锁定并校验，
        // 此处仅同事务将已验证的 Recovery 置为 RELEASED 终态并清空 claimToken/leaseUntil（绝不残留 PROCESSING）。
        if (params.recoveryContext) {
          await terminateRecoveryInTx(tx, taskId, params.recoveryContext.claimToken, "RELEASED", now);
        }

        return {
          taskId,
          status: "RELEASED",
          releasedPoints: current.holdPoints,
          isAlreadyReleased: false,
        };
      });
    } catch (err: unknown) {
      if (attempt < MAX_REFUND_RETRIES && isRetryableP2034(err)) {
        await backoffDelay(attempt);
        continue;
      }
      throw err;
    }
  }
}

export interface ReapExpiredHoldsOptions {
  limit?: number;
  batchSize?: number;
}

/**
 * 4. 过期 HOLD 扫描与幂等释放回收器 (reapExpiredHolds)
 * 联合检查 tokensettlementhold 与 tokensettlement 状态（严格仅当两表均为 HELD/HOLD 且非 REQUIRES_REVIEW 时执行回收）
 * 释放失败时强制登记到 tokensettlementrecovery 队列
 */
export async function reapExpiredHolds(opts: ReapExpiredHoldsOptions = {}): Promise<{ reapedCount: number }> {
  // 统一 limit 与 batchSize 语义；若两者均指定，取更保守的较小值以防超载；未指定默认 50
  const REAP_MAX_LIMIT = 1000; // 单批扫描硬上限，防止超大 limit 击穿数据库
  const effectiveLimit =
    opts.limit !== undefined && opts.batchSize !== undefined
      ? Math.min(opts.limit, opts.batchSize)
      : (opts.batchSize ?? opts.limit ?? 50);
  const limit = Math.min(REAP_MAX_LIMIT, Math.max(1, Math.floor(Number(effectiveLimit) || 50)));
  const now = new Date();

  // 双表联合查询：排除已处于 REQUIRES_REVIEW、SETTLED 或 RELEASED 的记录
  const expiredHolds = await prisma.$queryRaw<
    Array<{ taskId: string; userId: string; workspaceId: string }>
  >`
    SELECT h.\`taskId\`, h.\`userId\`, h.\`workspaceId\`
    FROM \`tokensettlementhold\` h
    INNER JOIN \`tokensettlement\` s ON h.\`taskId\` = s.\`taskId\`
    WHERE h.\`status\` = 'HELD' AND s.\`status\` = 'HOLD' AND h.\`expiresAt\` < ${now}
    ORDER BY h.\`expiresAt\` ASC
    LIMIT ${limit}
  `;

  let reapedCount = 0;
  for (const h of expiredHolds) {
    try {
      const res = await releaseSettlementHold({
        taskId: h.taskId,
        userId: h.userId,
        workspaceId: h.workspaceId,
        reason: "预扣超时自动回收释放",
        errorCode: "HOLD_EXPIRED",
      });
      if (res.status === "RELEASED") {
        reapedCount++;
      }
    } catch (err) {
      // 若单据已被并发完成结算 (SETTLED) 或释放 (RELEASED)，属于正常并发竞争，直接忽略，绝不得入队恢复！
      if (err instanceof InvalidStateTransitionError) {
        continue;
      }
      // 二次校验：查询当前结算主记录状态，若已进入终态直接跳过
      const checkSettle = await prisma.tokensettlement.findUnique({
        where: { taskId: h.taskId },
        select: { status: true },
      });
      if (checkSettle && (checkSettle.status === "SETTLED" || checkSettle.status === "RELEASED")) {
        continue;
      }

      console.error(`[reapExpiredHolds] 释放过期 HOLD 失败 (taskId=${h.taskId}):`, err);
      // 过期 HOLD 回收失败时必须入队 tokensettlementrecovery
      const enq = await enqueueSettlementRecovery({
        taskId: h.taskId,
        userId: h.userId,
        workspaceId: h.workspaceId,
        recoveryType: "EXPIRED_HOLD_REAP",
        error: `过期 HOLD 自动回收失败: ${(err as Error)?.message || "未知异常"}`,
      }).catch((enqErr) => {
        console.error(`[reapExpiredHolds] 恢复入队失败 (taskId=${h.taskId}):`, enqErr);
        return { ok: false, reason: (enqErr as Error)?.message || "ENQUEUE_FAILED" };
      });

      if (!enq.ok) {
        throw new TokenSettlementError(
          "ACCOUNTING_RECONCILIATION_REQUIRED",
          `任务 ${h.taskId} 过期回收异常且恢复入队失败 (${enq.reason})，必须对账处理`
        );
      }
    }
  }

  return { reapedCount };
}

// ---------------- 5. 结算异常恢复 (tokensettlementrecovery) 完整实现 ----------------

export interface EnqueueSettlementRecoveryParams {
  taskId: string;
  userId: string;
  workspaceId: string;
  recoveryType: "SETTLEMENT_FAILED" | "RELEASE_FAILED" | "EXPIRED_HOLD_REAP" | "TASK_WRITE_FAILED";
  error: string;
  usage?: UsageCostInput | UsageCostInputBigInt | null;
  pricingSnapshot?: RegistryPricingSnapshot | null;
  settlementVersion?: number | null;
}

function toPrismaJson(val: unknown): Prisma.InputJsonValue | undefined {
  if (val === undefined || val === null) return undefined;
  return JSON.parse(
    JSON.stringify(val, (_, v) => (typeof v === "bigint" ? v.toString() : v))
  ) as Prisma.InputJsonValue;
}

/**
 * 登记结算恢复任务 (enqueueSettlementRecovery)
 * 安全约束：
 * - 必须持久化保存 usage, pricingSnapshot, settlementVersion；
 * - 不得重置已完成（SETTLED/RELEASED）或正在处理且未超时租约（PROCESSING）的恢复记录！
 */
export async function enqueueSettlementRecovery(
  params: EnqueueSettlementRecoveryParams
): Promise<{ ok: boolean; reason?: string }> {
  const { taskId, userId, workspaceId, recoveryType, error, usage, pricingSnapshot, settlementVersion } = params;
  try {
    const now = new Date();

    // 检查既有恢复记录
    const existing = await prisma.tokensettlementrecovery.findUnique({
      where: { taskId },
    });

    let finalVersion = settlementVersion;
    if (finalVersion === undefined || finalVersion === null) {
      const currentSettle = await prisma.tokensettlement.findUnique({
        where: { taskId },
        select: { settlementVersion: true },
      });
      if (currentSettle) {
        finalVersion = currentSettle.settlementVersion;
      }
    }

    if (existing) {
      // 终态（SETTLED / RELEASED / REQUIRES_REVIEW）绝不重置
      if (existing.status === "SETTLED" || existing.status === "RELEASED" || existing.status === "REQUIRES_REVIEW") {
        return { ok: true, reason: `RECORD_ALREADY_${existing.status}` };
      }
      // 处理中且租约有效（leaseUntil > now），绝不重置
      if (existing.status === "PROCESSING" && existing.leaseUntil && existing.leaseUntil > now) {
        return { ok: true, reason: "RECORD_CURRENTLY_PROCESSING" };
      }

      // 仅对 PENDING、FAILED 或租约已过期的记录更新重试上下文并持久化 usage/pricing
      await prisma.tokensettlementrecovery.update({
        where: { taskId },
        data: {
          status: "PENDING",
          recoveryType,
          lastError: error.slice(0, 1000),
          usage: toPrismaJson(usage),
          pricingSnapshot: toPrismaJson(pricingSnapshot),
          settlementVersion: finalVersion ?? undefined,
          updatedAt: now,
        },
      });
      return { ok: true };
    }

    const id = randomUUID();
    await prisma.tokensettlementrecovery.create({
      data: {
        id,
        taskId,
        userId,
        workspaceId,
        status: "PENDING",
        recoveryType,
        retryCount: 0,
        lastError: error.slice(0, 1000),
        usage: toPrismaJson(usage) ?? Prisma.JsonNull,
        pricingSnapshot: toPrismaJson(pricingSnapshot) ?? Prisma.JsonNull,
        settlementVersion: finalVersion ?? null,
        createdAt: now,
        updatedAt: now,
      },
    });
    return { ok: true };
  } catch (e) {
    console.error(`[enqueueSettlementRecovery] 登记结算恢复失败 (taskId=${taskId}):`, e);
    return { ok: false, reason: (e as Error)?.message || "DB_INSERT_FAILED" };
  }
}

export interface SettlementRecoveryTask {
  id: string;
  taskId: string;
  userId: string;
  workspaceId: string;
  claimToken: string;
  recoveryType: string;
  retryCount: number;
  leaseUntil: Date;
  workerId?: string;
  settlementVersion?: number | null;
}

export interface ClaimSettlementRecoveryOptions {
  taskId?: string;
  userId?: string;
  workspaceId?: string;
  leaseMs?: number;
  leaseDurationMs?: number;
  limit?: number;
  workerId?: string;
}

/**
 * 原子认领恢复任务 (claimSettlementRecovery)
 * - 分配唯一 UUID claimToken；
 * - 租约控制：leaseUntil = now + leaseMs；
 * - workerId 写入审计上下文并参与任务封装；
 * - 重试次数递增；若达到或超出上限（>= MAX_RETRY），自动三表同步转入 REQUIRES_REVIEW，不予认领。
 */
export async function claimSettlementRecovery(
  opts: ClaimSettlementRecoveryOptions = {}
): Promise<SettlementRecoveryTask[]> {
  const leaseMs = opts.leaseDurationMs ?? opts.leaseMs ?? SETTLEMENT_RECOVERY_LEASE_MS;
  const limit = opts.limit ?? 10;
  const workerId = opts.workerId || "default-worker";
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + leaseMs);

  // 1. 扫描符合认领条件的记录
  const candidates = await prisma.tokensettlementrecovery.findMany({
    where: {
      ...(opts.taskId ? { taskId: opts.taskId } : {}),
      ...(opts.userId ? { userId: opts.userId } : {}),
      ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}),
      OR: [
        { status: { in: ["PENDING", "FAILED"] } },
        { status: "PROCESSING", OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
      ],
    },
    take: limit,
  });

  const claimed: SettlementRecoveryTask[] = [];

  for (const rec of candidates) {
    // 达到重试上限：同一事务按统一顺序锁 tokensettlement -> tokensettlementhold -> tokensettlementrecovery，
    // 锁内重新读取 retryCount/status/claimToken/leaseUntil，仅当仍是扫描到的可处理版本才转 REQUIRES_REVIEW；
    // Recovery 必须先 CAS 成功（影响行数严格为 1）再更新另外两表；被其他 Worker 抢占时三表必须零变化。
    if (rec.retryCount >= SETTLEMENT_RECOVERY_MAX_RETRY) {
      const fenced = await withP2034Retry(() => prisma.$transaction(async (tx) => {
        // 1. 非阻塞预检：主记录缺失时直接跳过，避免对「不存在的行」加 FOR UPDATE 而产生间隙锁(gap lock)，
        //    从而与其他并发事务互相死锁（这是并行测试 P2034/死锁的根因之一）。
        const preSettle = await tx.tokensettlement.findUnique({ where: { taskId: rec.taskId }, select: { id: true } });
        const preHold = await tx.tokensettlementhold.findUnique({ where: { taskId: rec.taskId }, select: { id: true } });
        if (!preSettle || !preHold) {
          return { changed: false as const };
        }
        // 2. 确认两表主记录均存在后，再按统一锁顺序加行锁（现有行 => 记录锁，不产生间隙锁）
        const settles = await tx.$queryRaw<Array<{ id: string; status: string }>>`
          SELECT \`id\`, \`status\` FROM \`tokensettlement\` WHERE \`taskId\` = ${rec.taskId} FOR UPDATE
        `;
        const holds = await tx.$queryRaw<Array<{ id: string; status: string }>>`
          SELECT \`id\`, \`status\` FROM \`tokensettlementhold\` WHERE \`taskId\` = ${rec.taskId} FOR UPDATE
        `;
        // 三表主记录必须全部存在；任一缺失整笔回滚（该候选保持 PENDING 留待人工核查），
        // 绝不允许只改 Recovery 而留下其他表不一致，也不得抛错中断整个认领扫描。
        if (settles.length === 0 || holds.length === 0) {
          return { changed: false as const };
        }
        const settleStatus = settles[0].status;
        const holdStatus = holds[0].status;

        // 3. 锁 tokensettlementrecovery 并重新读取当前真实状态
        const recs = await tx.$queryRaw<
          Array<{ id: string; status: string; retryCount: number; claimToken: string | null; leaseUntil: Date | null }>
        >`
          SELECT \`id\`, \`status\`, \`claimToken\`, \`retryCount\`, \`leaseUntil\`
          FROM \`tokensettlementrecovery\` WHERE \`id\` = ${rec.id} FOR UPDATE
        `;
        if (recs.length === 0) return { changed: false as const };

        const cur = recs[0];
        // 仅当仍是扫描到的“可处理版本”才允许转 REQUIRES_REVIEW：
        // - 状态仍为 PENDING/FAILED（未被认领），或
        // - PROCESSING 但租约已过期（与扫描条件一致，原持有者已失租约）；
        // 其余（已被其他 Worker 认领持有有效租约 / 已终态）一律视为被抢占，三表零变化。
        const stillProcessable =
          (cur.status === "PENDING" || cur.status === "FAILED") ||
          (cur.status === "PROCESSING" &&
            cur.leaseUntil !== null &&
            new Date(cur.leaseUntil).getTime() <= now.getTime());
        if (!stillProcessable) {
          return { changed: false as const };
        }

        // Recovery 先 CAS：必须影响行数严格为 1（确认仍是同一可处理版本），再更新另外两表。
        // 若并发已被其他 Worker 改写，CAS 影响行数为 0，整笔零变化回滚。
        const cas = await tx.tokensettlementrecovery.updateMany({
          where: {
            id: rec.id,
            status: cur.status,
            retryCount: cur.retryCount,
            OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
          },
          data: {
            status: "REQUIRES_REVIEW",
            lastError: `[Worker: ${workerId}] 重试超限 (已尝试 ${cur.retryCount} 次)，转人工复核`,
            claimToken: null,
            leaseUntil: null,
            updatedAt: now,
          },
        });
        if (cas.count !== 1) return { changed: false as const };

        // 更新另外两表，并严格校验影响行数与预期一致：
        // 主记录锁内读取为 HOLD/HELD 时，UPDATE 必须恰好影响 1 行；否则整笔回滚。
        const settleUpd = await tx.$executeRaw`
          UPDATE \`tokensettlement\`
          SET \`status\` = 'REQUIRES_REVIEW',
              \`errorCode\` = 'RECOVERY_RETRY_EXCEEDED',
              \`auditMessage\` = '恢复重试超限，自动转人工复核',
              \`updatedAt\` = ${now}
          WHERE \`taskId\` = ${rec.taskId} AND \`status\` NOT IN ('SETTLED', 'RELEASED')
        `;
        if (settleStatus === "HOLD" && settleUpd !== 1) {
          // 影响行数不符预期：整笔回滚该候选，保持 PENDING，不污染其他候选
          return { changed: false as const };
        }
        const holdUpd = await tx.$executeRaw`
          UPDATE \`tokensettlementhold\`
          SET \`status\` = 'REQUIRES_REVIEW',
              \`statusChangedAt\` = ${now},
              \`updatedAt\` = ${now}
          WHERE \`taskId\` = ${rec.taskId} AND \`status\` NOT IN ('SETTLED', 'RELEASED')
        `;
        if (holdStatus === "HELD" && holdUpd !== 1) {
          // 影响行数不符预期：整笔回滚该候选，保持 PENDING，不污染其他候选
          return { changed: false as const };
        }
        return { changed: true as const };
      }));
      continue;
    }

    const claimToken = randomUUID();
    // 原子 CAS 抢占认领：包含原状态与当前重试次数，并发认领时仅有一个 worker 能成功
    const claimRes = await withP2034Retry(() => prisma.tokensettlementrecovery.updateMany({
      where: {
        id: rec.id,
        status: rec.status,
        retryCount: rec.retryCount,
        OR: [
          { leaseUntil: null },
          { leaseUntil: { lt: now } },
          { leaseUntil: rec.leaseUntil },
        ],
      },
      data: {
        status: "PROCESSING",
        claimToken,
        leaseUntil,
        processingStartedAt: now,
        retryCount: { increment: 1 },
        lastError: `[Worker: ${workerId}] 认领执行中`,
        updatedAt: now,
      },
    }));

    if (claimRes.count > 0) {
      claimed.push({
        id: rec.id,
        taskId: rec.taskId,
        userId: rec.userId,
        workspaceId: rec.workspaceId,
        claimToken,
        recoveryType: rec.recoveryType,
        retryCount: rec.retryCount + 1,
        leaseUntil,
        workerId,
        settlementVersion: rec.settlementVersion,
      });
    }
  }

  return claimed;
}

/**
 * Fencing 条件写回 (writeSettlementRecoveryResult)
 * 必须带上本次认领的 claimToken；
 * 若影响行数为 0，说明租约过期且已由新 Worker 抢占认领，旧 Worker 绝不可覆盖新 Worker（Fencing Protection）；
 * 当结果为终态（SETTLED / RELEASED / REQUIRES_REVIEW）时，清空 claimToken 和 leaseUntil。
 */
export async function writeSettlementRecoveryResult(
  taskId: string,
  claimToken: string,
  result: {
    status: "SETTLED" | "RELEASED" | "FAILED" | "REQUIRES_REVIEW";
    lastError?: string | null;
  }
): Promise<{ applied: boolean }> {
  const now = new Date();
  const isTerminal = result.status === "SETTLED" || result.status === "RELEASED" || result.status === "REQUIRES_REVIEW";

  const res = await withP2034Retry(() =>
    prisma.tokensettlementrecovery.updateMany({
      where: {
        taskId,
        claimToken,
        status: "PROCESSING",
        leaseUntil: { gt: now },
      },
      data: {
        status: result.status,
        lastError: result.lastError ? result.lastError.slice(0, 1000) : null,
        claimToken: isTerminal ? null : undefined,
        leaseUntil: isTerminal || result.status === "FAILED" ? null : undefined,
        updatedAt: now,
      },
    })
  );

  return { applied: res.count > 0 };
}

/**
 * 统一异常转人工复核收口事务（abortRecoveryToReviewInTx）
 * 严格遵循统一账务锁顺序：
 *   userwallet -> workspacequota -> workspacemember -> tokensettlement -> pointgrant -> pointledger -> tokensettlementrecovery
 * 强约束：
 * - 必须在同一事务内更新 tokensettlement, tokensettlementhold, tokensettlementrecovery 三表；
 * - 必须验证 claimToken + status=PROCESSING + 有效 leaseUntil；
 * - 若旧 Worker 条件不匹配，整笔事务没有任何表发生修改（applied = false）；
 */
async function abortRecoveryToReviewInTx(params: {
  taskId: string;
  claimToken: string;
  reason: string;
  errorCode: string;
}): Promise<{ applied: boolean }> {
  const { taskId, claimToken, reason, errorCode } = params;
  const now = new Date();

  return await prisma.$transaction(async (tx) => {
    // 1. 锁 tokensettlement
    const settles = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT \`id\`, \`status\` FROM \`tokensettlement\` WHERE \`taskId\` = ${taskId} FOR UPDATE
    `;

    // 2. 锁 tokensettlementhold
    const holds = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT \`id\`, \`status\` FROM \`tokensettlementhold\` WHERE \`taskId\` = ${taskId} FOR UPDATE
    `;

    // 3. 锁 tokensettlementrecovery 并强校验 Fencing 条件
    const recoveries = await tx.$queryRaw<
      Array<{ id: string; claimToken: string | null; status: string; leaseUntil: Date | null }>
    >`
      SELECT \`id\`, \`claimToken\`, \`status\`, \`leaseUntil\`
      FROM \`tokensettlementrecovery\`
      WHERE \`taskId\` = ${taskId}
      FOR UPDATE
    `;

    if (recoveries.length === 0) {
      return { applied: false };
    }

    const rec = recoveries[0];
    const isLeaseValid = rec.leaseUntil !== null && new Date(rec.leaseUntil).getTime() > now.getTime();

    // 强校验：claimToken 匹配 + status=PROCESSING + 有效 leaseUntil
    if (rec.claimToken !== claimToken || rec.status !== "PROCESSING" || !isLeaseValid) {
      // 旧 Worker 条件不匹配，绝不修改任何表！
      return { applied: false };
    }

    // 校验通过：同事务原子将三表同步置为 REQUIRES_REVIEW
    await tx.tokensettlementrecovery.updateMany({
      where: {
        taskId,
        claimToken,
        status: "PROCESSING",
        leaseUntil: { gt: now },
      },
      data: {
        status: "REQUIRES_REVIEW",
        lastError: reason.slice(0, 1000),
        claimToken: null,
        leaseUntil: null,
        updatedAt: now,
      },
    });

    if (settles.length > 0 && settles[0].status !== "SETTLED" && settles[0].status !== "RELEASED") {
      await tx.$executeRaw`
        UPDATE \`tokensettlement\`
        SET \`status\` = 'REQUIRES_REVIEW',
            \`errorCode\` = ${errorCode},
            \`auditMessage\` = ${reason.slice(0, 500)},
            \`updatedAt\` = ${now}
        WHERE \`taskId\` = ${taskId} AND \`status\` NOT IN ('SETTLED', 'RELEASED')
      `;
    }

    if (holds.length > 0 && holds[0].status !== "SETTLED" && holds[0].status !== "RELEASED") {
      await tx.$executeRaw`
        UPDATE \`tokensettlementhold\`
        SET \`status\` = 'REQUIRES_REVIEW',
            \`statusChangedAt\` = ${now},
            \`updatedAt\` = ${now}
        WHERE \`taskId\` = ${taskId} AND \`status\` NOT IN ('SETTLED', 'RELEASED')
      `;
    }

    return { applied: true };
  });
}

/**
 * Recovery Fencing 前置校验（必须在任何状态修改或提前返回之前调用）。
 * 锁定 tokensettlementrecovery 并强校验 claimToken / status=PROCESSING / 有效 leaseUntil；
 * 任一不匹配立即抛错，调用方事务整笔回滚，三表零变化。
 */
async function verifyRecoveryFencingInTx(
  tx: Prisma.TransactionClient,
  taskId: string,
  claimToken: string,
  now: Date
): Promise<void> {
  const recs = await tx.$queryRaw<
    Array<{ id: string; status: string; claimToken: string | null; leaseUntil: Date | null }>
  >`
    SELECT \`id\`, \`status\`, \`claimToken\`, \`leaseUntil\`
    FROM \`tokensettlementrecovery\` WHERE \`taskId\` = ${taskId} FOR UPDATE
  `;
  if (recs.length === 0) {
    throw new TokenSettlementError("RECOVERY_RECORD_NOT_FOUND", `恢复记录不存在 (taskId=${taskId})`);
  }
  const rec = recs[0];
  if (rec.claimToken !== claimToken) {
    throw new TokenSettlementError(
      "FENCING_TOKEN_MISMATCH",
      `Recovery 认领令牌失效，当前任务已被其他 Worker 抢占 (taskId=${taskId})`
    );
  }
  if (rec.status !== "PROCESSING") {
    throw new TokenSettlementError(
      "RECOVERY_STATUS_INVALID",
      `Recovery 状态非法 (${rec.status})，期望 PROCESSING`
    );
  }
  if (!rec.leaseUntil || new Date(rec.leaseUntil).getTime() <= now.getTime()) {
    throw new TokenSettlementError(
      "RECOVERY_LEASE_EXPIRED",
      `Recovery 租约已过期 (leaseUntil=${rec.leaseUntil?.toISOString()})`
    );
  }
}

/**
 * Recovery 终态收口（必须在任何分支返回前调用）。
 * 将已通过 Fencing 校验的 Recovery 同事务置为终态并清空 claimToken / leaseUntil。
 */
async function terminateRecoveryInTx(
  tx: Prisma.TransactionClient,
  taskId: string,
  claimToken: string,
  terminalStatus: "SETTLED" | "RELEASED" | "REQUIRES_REVIEW",
  now: Date
): Promise<void> {
  await tx.tokensettlementrecovery.updateMany({
    where: { taskId, claimToken, status: "PROCESSING", leaseUntil: { gt: now } },
    data: {
      status: terminalStatus,
      claimToken: null,
      leaseUntil: null,
      updatedAt: now,
    },
  });
}

/**
 * 结算恢复执行 Worker (processSettlementRecovery)
 * - claimSettlementRecovery 后按 recoveryType 分流执行：
 *   - RELEASE_FAILED、EXPIRED_HOLD_REAP、TASK_WRITE_FAILED -> releaseSettlementHold；
 *   - SETTLEMENT_FAILED -> 使用持久化 usage 执行 completeSettlement；
 * - 所有结果必须使用 claimToken fencing 写回；
 * - 终态清空 claimToken 和 leaseUntil；
 * - 失败达到上限时三表同步转为 REQUIRES_REVIEW。
 */
export async function processSettlementRecovery(
  task: SettlementRecoveryTask
): Promise<{ status: "SETTLED" | "RELEASED" | "REQUIRES_REVIEW" | "FAILED"; error?: string }> {
  const { taskId, userId, workspaceId, claimToken, recoveryType } = task;

  try {
    const recoveryRec = await prisma.tokensettlementrecovery.findUnique({
      where: { taskId },
    });

    if (!recoveryRec) {
      return { status: "FAILED", error: "RECOVERY_RECORD_NOT_FOUND" };
    }

    const expectedSettlementVersion = recoveryRec.settlementVersion ?? undefined;
    const recoveryContext = {
      claimToken,
      expectedSettlementVersion,
      workerId: task.workerId,
    };

    let finalStatus: "SETTLED" | "RELEASED" | "REQUIRES_REVIEW" = "REQUIRES_REVIEW";

    if (
      recoveryType === "RELEASE_FAILED" ||
      recoveryType === "EXPIRED_HOLD_REAP" ||
      recoveryType === "TASK_WRITE_FAILED"
    ) {
      const releaseRes = await releaseSettlementHold({
        taskId,
        userId,
        workspaceId,
        reason: `Recovery Worker 自动恢复执行释放 (${recoveryType})`,
        errorCode: recoveryType,
        recoveryContext,
      });
      finalStatus = releaseRes.status === "RELEASED" ? "RELEASED" : "REQUIRES_REVIEW";
    } else if (recoveryType === "SETTLEMENT_FAILED") {
      let usageToUse: UsageCostInputBigInt = { inputTokens: B_ZERO, outputTokens: B_ZERO };
      if (recoveryRec.usage && typeof recoveryRec.usage === "object") {
        const u = recoveryRec.usage as Record<string, unknown>;
        usageToUse = {
          inputTokens: validateTokenCount(u.inputTokens, "inputTokens"),
          outputTokens: validateTokenCount(u.outputTokens, "outputTokens"),
          cacheReadTokens: validateTokenCount(u.cacheReadTokens, "cacheReadTokens"),
          cacheWriteTokens: validateTokenCount(u.cacheWriteTokens, "cacheWriteTokens"),
        };
      } else {
        const settle = await prisma.tokensettlement.findUnique({ where: { taskId } });
        if (settle) {
          usageToUse = {
            inputTokens: BigInt(settle.inputTokens),
            outputTokens: BigInt(settle.outputTokens),
            cacheReadTokens: BigInt(settle.cacheReadTokens),
            cacheWriteTokens: BigInt(settle.cacheWriteTokens),
          };
        }
      }

      const pricingSnapshotToUse =
        (recoveryRec.pricingSnapshot as unknown as RegistryPricingSnapshot | null) ?? undefined;

      const settleRes = await completeSettlement({
        taskId,
        userId,
        workspaceId,
        usage: usageToUse,
        pricingSnapshot: pricingSnapshotToUse,
        recoveryContext,
      });
      finalStatus = settleRes.status === "SETTLED" ? "SETTLED" : "REQUIRES_REVIEW";
    } else {
      // 未知 recoveryType：必须通过 fenced 事务把三表一致转为 REQUIRES_REVIEW，
      // 绝不能只返回内存状态（否则 Recovery 会残留 PROCESSING）。
      const applied = await abortRecoveryToReviewInTx({
        taskId,
        claimToken,
        reason: `未知 recoveryType: ${String(recoveryType)} 转人工复核`,
        errorCode: "UNKNOWN_RECOVERY_TYPE",
      });
      if (!applied.applied) {
        // 已被其他 Worker 抢占或租约失效：整笔退出，三表零变化
        return { status: "FAILED", error: "FENCING_TOKEN_MISMATCH" };
      }
      finalStatus = "REQUIRES_REVIEW";
    }

    return { status: finalStatus };
  } catch (err: unknown) {
    const errMsg = (err as Error)?.message || String(err);
    const errCode =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code: unknown }).code)
        : undefined;

    // Fencing 冲突或租约过期：已被其他 Worker 抢占，本 Worker 退出且不得改变任何状态与数据
    if (errCode === "FENCING_TOKEN_MISMATCH" || errCode === "RECOVERY_LEASE_EXPIRED") {
      console.warn(`[processSettlementRecovery] Fencing 校验拦截 (taskId=${taskId}): ${errMsg}`);
      return { status: "FAILED", error: errCode };
    }

    // 版本冲突：必须使用 claimToken + status=PROCESSING + 有效 leaseUntil 在同一事务内更新三表为 REQUIRES_REVIEW；条件不匹配则三表均不修改
    if (errCode === "SETTLEMENT_VERSION_MISMATCH") {
      console.warn(`[processSettlementRecovery] 结算版本冲突 (taskId=${taskId}): ${errMsg}`);
      const applied = await abortRecoveryToReviewInTx({
        taskId,
        claimToken,
        reason: `Recovery 版本 CAS 冲突转人工复核: ${errMsg}`,
        errorCode: "SETTLEMENT_VERSION_MISMATCH",
      });
      if (!applied.applied) {
        console.warn(`[processSettlementRecovery] 旧 Worker 租约已失效或已被抢占，版本冲突异常收口已安全阻断 (taskId=${taskId})`);
        return { status: "FAILED", error: "FENCING_TOKEN_MISMATCH" };
      }
      return { status: "REQUIRES_REVIEW", error: errMsg };
    }

    console.error(`[processSettlementRecovery] 执行恢复异常 (taskId=${taskId}):`, err);

    if (task.retryCount >= SETTLEMENT_RECOVERY_MAX_RETRY) {
      const applied = await abortRecoveryToReviewInTx({
        taskId,
        claimToken,
        reason: `恢复重试超限 (${task.retryCount} 次): ${errMsg}`,
        errorCode: "RECOVERY_RETRY_EXCEEDED",
      });
      if (!applied.applied) {
        console.warn(`[processSettlementRecovery] 旧 Worker 租约已失效或已被抢占，重试超限异常收口已安全阻断 (taskId=${taskId})`);
        return { status: "FAILED", error: "FENCING_TOKEN_MISMATCH" };
      }
      return { status: "REQUIRES_REVIEW", error: errMsg };
    }

    const applied = await writeSettlementRecoveryResult(taskId, claimToken, {
      status: "FAILED",
      lastError: errMsg,
    });
    if (!applied.applied) {
      console.warn(`[processSettlementRecovery] 旧 Worker 租约已失效或已被抢占，写回 FAILED 已安全阻断 (taskId=${taskId})`);
      return { status: "FAILED", error: "FENCING_TOKEN_MISMATCH" };
    }

    return { status: "FAILED", error: errMsg };
  }
}

/**
 * 批量执行结算恢复队列 Worker (runSettlementRecovery)
 */
export async function runSettlementRecovery(opts: {
  limit?: number;
  workerId?: string;
  userId?: string;
  workspaceId?: string;
  leaseMs?: number;
  leaseDurationMs?: number;
} = {}): Promise<{
  processed: number;
  settled: number;
  released: number;
  inReview: number;
  failed: number;
}> {
  const claimed = await claimSettlementRecovery(opts);
  let settled = 0;
  let released = 0;
  let inReview = 0;
  let failed = 0;

  for (const t of claimed) {
    const res = await processSettlementRecovery(t);
    if (res.status === "SETTLED") settled++;
    else if (res.status === "RELEASED") released++;
    else if (res.status === "REQUIRES_REVIEW") inReview++;
    else failed++;
  }

  return {
    processed: claimed.length,
    settled,
    released,
    inReview,
    failed,
  };
}

// ---------------- 6. 管理员人工复核独立动作 (adminResolveSettlementReview) ----------------

export interface AdminResolveReviewParams {
  taskId: string;
  adminUserId: string;
  action: "SETTLE" | "RELEASE";
  actualPoints?: number | bigint;
  auditRemark: string;
}

export interface AdminResolveReviewResult {
  taskId: string;
  status: SettlementHoldStatus;
  auditMessage: string;
  releasedPoints?: bigint;
  supplementPoints?: bigint;
  actualPricePoints?: bigint;
}

/**
 * 管理员人工复核独立处理动作：
 * - 仅允许对状态为 REQUIRES_REVIEW 的记录执行处理；
 * - RELEASE 必须真实退款、回滚 monthlyTokenUsed、写 REFUND 流水；
 * - SETTLE 必须真实补扣或依据已保存账务载荷完成结算；
 * - 所有账务变化与两张状态表必须在同一事务中完成；
 * - 具备幂等性，已处于终态直接返回。
 */
export async function adminResolveSettlementReview(
  params: AdminResolveReviewParams
): Promise<AdminResolveReviewResult> {
  const { taskId, adminUserId, action, auditRemark } = params;

  let attempt = 0;
  while (true) {
    attempt++;
    try {
      return await prisma.$transaction(async (tx) => {
        // 先快照读取归属信息以按严格全局锁顺序锁定账户（非阻塞读）
        const preCheck = await tx.tokensettlement.findUnique({
          where: { taskId },
          select: { userId: true, workspaceId: true, status: true },
        });

        if (!preCheck) {
          throw new TokenSettlementError("SETTLEMENT_RECORD_NOT_FOUND", `任务 ${taskId} 结算记录不存在`);
        }

        // 幂等处理：若已处于终态直接返回
        if (preCheck.status === "SETTLED" || preCheck.status === "RELEASED") {
          return {
            taskId,
            status: preCheck.status as SettlementHoldStatus,
            auditMessage: `任务已处于终态 (${preCheck.status})，幂等跳过`,
          };
        }

        if (preCheck.status !== "REQUIRES_REVIEW") {
          throw new TokenSettlementError(
            "INVALID_STATE_FOR_ADMIN_RESOLVE",
            `任务 ${taskId} 当前状态为 ${preCheck.status}，非 REQUIRES_REVIEW，禁止执行人工复核裁决`
          );
        }

        const { userId, workspaceId } = preCheck;

        // 步骤 1: 严格遵循全局锁顺序，先锁定账户行（userwallet -> workspacequota -> workspacemember）
        await acquireAccountLocks(tx, userId, workspaceId, {
          needWallet: true,
          needQuota: true,
          needMember: true,
        });

        // 步骤 2: 锁定结算主记录
        const records = await tx.$queryRaw<
          Array<{
            id: string;
            userId: string;
            workspaceId: string;
            status: string;
            holdPoints: bigint;
            monthlyTokenUsedIncremented: bigint;
            actualPricePoints: bigint;
          }>
        >`
          SELECT \`id\`, \`userId\`, \`workspaceId\`, \`status\`, \`holdPoints\`, \`monthlyTokenUsedIncremented\`, \`actualPricePoints\`
          FROM \`tokensettlement\`
          WHERE \`taskId\` = ${taskId}
          FOR UPDATE
        `;

        if (records.length === 0) {
          throw new TokenSettlementError("SETTLEMENT_RECORD_NOT_FOUND", `任务 ${taskId} 结算记录不存在`);
        }

        const current = records[0];
        const holdPoints = current.holdPoints;

        // 状态二次校验与幂等
        if (current.status === "SETTLED" || current.status === "RELEASED") {
          return {
            taskId,
            status: current.status as SettlementHoldStatus,
            auditMessage: `任务已处于终态 (${current.status})，幂等跳过`,
          };
        }

        if (current.status !== "REQUIRES_REVIEW") {
          throw new TokenSettlementError(
            "INVALID_STATE_FOR_ADMIN_RESOLVE",
            `任务 ${taskId} 当前状态为 ${current.status}，非 REQUIRES_REVIEW，禁止执行人工复核裁决`
          );
        }

    const now = new Date();
    const targetStatus: SettlementHoldStatus = action === "SETTLE" ? "SETTLED" : "RELEASED";
    const auditMessage = `管理员 [${adminUserId}] 人工复核裁决为 ${targetStatus}: ${auditRemark}`;

    // 获取 hold 详情
    const holds = await tx.$queryRaw<
      Array<{ holdDetails: unknown; monthlyTokenUsedIncremented: bigint }>
    >`
      SELECT \`holdDetails\`, \`monthlyTokenUsedIncremented\`
      FROM \`tokensettlementhold\`
      WHERE \`taskId\` = ${taskId}
      FOR UPDATE
    `;
    const storedHold =
      holds.length > 0
        ? parseStoredHoldDetails(holds[0].holdDetails)
        : { details: [], consumeLedgerIds: [], consumeIdempotencyKey: "", isUnlimited: false };
    const isUnlimited = Boolean(storedHold.isUnlimited);
    const details = storedHold.details;
    const monthlyIncremented = holds[0]?.monthlyTokenUsedIncremented ?? current.monthlyTokenUsedIncremented;

    let releasedPoints = B_ZERO;
    let supplementPoints = B_ZERO;
    let actualPricePoints = current.actualPricePoints;

    if (action === "RELEASE") {
      // 真实退款：原路退还预扣点数并回滚 monthlyTokenUsed
      releasedPoints = holdPoints;
      actualPricePoints = B_ZERO;

      if (!isUnlimited && holdPoints > B_ZERO && details.length > 0) {
        const reversed = [...details].reverse();
        let toRefund = holdPoints;

        for (let idx = 0; idx < reversed.length; idx++) {
          if (toRefund <= B_ZERO) break;
          const d = reversed[idx];
          const dPointsBig = BigInt(d.points);
          const takeBack = dPointsBig < toRefund ? dPointsBig : toRefund;
          toRefund -= takeBack;

          let balanceAfter = B_ZERO;
          if (d.kind === "MEMBER") {
            const affected = await tx.$executeRaw`
              UPDATE \`workspacemember\`
              SET \`tokenBalance\` = \`tokenBalance\` + ${takeBack}
              WHERE \`userId\` = ${userId} AND \`workspaceId\` = ${workspaceId}
            `;
            if (affected === 0) {
              throw new RefundAccountNotFoundError(
                `REFUND_ACCOUNT_NOT_FOUND: 工作空间成员账户不存在 (userId=${userId}, workspaceId=${workspaceId})`
              );
            }
            const m = await tx.workspacemember.findUnique({
              where: { userId_workspaceId: { userId, workspaceId } },
              select: { tokenBalance: true },
            });
            balanceAfter = m ? m.tokenBalance : B_ZERO;
          } else {
            const grant = d.grantId ? await tx.pointgrant.findUnique({ where: { id: d.grantId } }) : null;
            const expiredOrMissing = !grant || grant.status === "EXPIRED" || (grant.expiresAt && grant.expiresAt < now);

            if (!expiredOrMissing && grant) {
              await tx.pointgrant.update({
                where: { id: grant.id },
                data: { remaining: { increment: takeBack }, status: "ACTIVE", updatedAt: now },
              });
            } else {
              await tx.pointgrant.create({
                data: {
                  id: randomUUID(),
                  scope: d.scope,
                  userId: d.kind === "WALLET" ? userId : null,
                  workspaceId: d.kind === "WALLET" ? null : workspaceId,
                  points: takeBack,
                  remaining: takeBack,
                  sourceType: "REFUND",
                  sourceId: `ADMIN_REVIEW_RELEASE:${taskId}:${idx}`,
                  status: "ACTIVE",
                  title: "原分桶已过期·管理员复核释放兜底",
                  remark: auditRemark,
                  updatedAt: now,
                },
              });
            }

            if (d.kind === "WALLET") {
              const affected = await tx.$executeRaw`
                UPDATE \`userwallet\`
                SET \`balance\` = \`balance\` + ${takeBack}, \`updatedAt\` = ${now}
                WHERE \`userId\` = ${userId}
              `;
              if (affected === 0) {
                throw new RefundAccountNotFoundError(
                  `REFUND_ACCOUNT_NOT_FOUND: 用户钱包账户不存在 (userId=${userId})`
                );
              }
              const w = await tx.userwallet.findUnique({ where: { userId } });
              balanceAfter = w ? w.balance : B_ZERO;
            } else {
              const affected = await tx.$executeRaw`
                UPDATE \`workspacequota\`
                SET \`tokenBalance\` = \`tokenBalance\` + ${takeBack}, \`updatedAt\` = ${now}
                WHERE \`workspaceId\` = ${workspaceId}
              `;
              if (affected === 0) {
                throw new RefundAccountNotFoundError(
                  `REFUND_ACCOUNT_NOT_FOUND: 空间配额账户不存在 (workspaceId=${workspaceId})`
                );
              }
              const q = await tx.workspacequota.findUnique({ where: { workspaceId } });
              balanceAfter = q ? q.tokenBalance : B_ZERO;
            }
          }

          // 写入退款流水
          await tx.pointledger.create({
            data: {
              id: randomUUID(),
              direction: "IN",
              type: "REFUND",
              scope: d.scope,
              userId,
              workspaceId,
              operatorId: adminUserId,
              points: takeBack,
              balanceAfter,
              taskId,
              grantId: d.kind === "MEMBER" ? null : (d.grantId || null),
              title: "管理员复核释放预扣",
              remark: auditRemark,
              idempotencyKey: `ADMIN_REVIEW_RELEASE:${taskId}:${idx}`,
            },
          });
        }
      }

      // 回滚月度用量
      if (monthlyIncremented > B_ZERO) {
        const affected = await tx.$executeRaw`
          UPDATE \`workspacemember\`
          SET \`monthlyTokenUsed\` = IF(\`monthlyTokenUsed\` >= ${monthlyIncremented}, \`monthlyTokenUsed\` - ${monthlyIncremented}, 0)
          WHERE \`userId\` = ${userId} AND \`workspaceId\` = ${workspaceId}
        `;
        if (affected === 0) {
          throw new RefundAccountNotFoundError(`REFUND_ACCOUNT_NOT_FOUND: 空间成员月度用量更新失败`);
        }
      }
    } else {
      // action === "SETTLE"
      let targetPoints = holdPoints;
      if (params.actualPoints !== undefined && params.actualPoints !== null) {
        targetPoints = validateSafePoints(params.actualPoints, "actualPoints");
      } else if (current.actualPricePoints > B_ZERO) {
        targetPoints = current.actualPricePoints;
      }
      actualPricePoints = targetPoints;

      if (!isUnlimited) {
        if (targetPoints < holdPoints) {
          // 多退差额
          const diffToRelease = holdPoints - targetPoints;
          releasedPoints = diffToRelease;
          let remainingToRefund = diffToRelease;
          const reversed = [...details].reverse();

          for (let idx = 0; idx < reversed.length; idx++) {
            if (remainingToRefund <= B_ZERO) break;
            const d = reversed[idx];
            const dPointsBig = BigInt(d.points);
            const takeBack = dPointsBig < remainingToRefund ? dPointsBig : remainingToRefund;
            remainingToRefund -= takeBack;

            let balanceAfter = B_ZERO;
            if (d.kind === "MEMBER") {
              const affected = await tx.$executeRaw`
                UPDATE \`workspacemember\`
                SET \`tokenBalance\` = \`tokenBalance\` + ${takeBack}
                WHERE \`userId\` = ${userId} AND \`workspaceId\` = ${workspaceId}
              `;
              if (affected === 0) {
                throw new RefundAccountNotFoundError(`REFUND_ACCOUNT_NOT_FOUND: 工作空间成员账户不存在`);
              }
              const m = await tx.workspacemember.findUnique({
                where: { userId_workspaceId: { userId, workspaceId } },
                select: { tokenBalance: true },
              });
              balanceAfter = m ? m.tokenBalance : B_ZERO;
            } else {
              const grant = d.grantId ? await tx.pointgrant.findUnique({ where: { id: d.grantId } }) : null;
              const expiredOrMissing = !grant || grant.status === "EXPIRED" || (grant.expiresAt && grant.expiresAt < now);

              if (!expiredOrMissing && grant) {
                await tx.pointgrant.update({
                  where: { id: grant.id },
                  data: { remaining: { increment: takeBack }, status: "ACTIVE", updatedAt: now },
                });
              } else {
                await tx.pointgrant.create({
                  data: {
                    id: randomUUID(),
                    scope: d.scope,
                    userId: d.kind === "WALLET" ? userId : null,
                    workspaceId: d.kind === "WALLET" ? null : workspaceId,
                    points: takeBack,
                    remaining: takeBack,
                    sourceType: "REFUND",
                    sourceId: `ADMIN_REVIEW_SETTLE_REFUND:${taskId}:${idx}`,
                    status: "ACTIVE",
                    title: "管理员复核结算释放兜底",
                    remark: auditRemark,
                    updatedAt: now,
                  },
                });
              }

              if (d.kind === "WALLET") {
                const affected = await tx.$executeRaw`
                  UPDATE \`userwallet\`
                  SET \`balance\` = \`balance\` + ${takeBack}, \`updatedAt\` = ${now}
                  WHERE \`userId\` = ${userId}
                `;
                if (affected === 0) {
                  throw new RefundAccountNotFoundError(`REFUND_ACCOUNT_NOT_FOUND: 用户钱包不存在`);
                }
                const w = await tx.userwallet.findUnique({ where: { userId } });
                balanceAfter = w ? w.balance : B_ZERO;
              } else {
                const affected = await tx.$executeRaw`
                  UPDATE \`workspacequota\`
                  SET \`tokenBalance\` = \`tokenBalance\` + ${takeBack}, \`updatedAt\` = ${now}
                  WHERE \`workspaceId\` = ${workspaceId}
                `;
                if (affected === 0) {
                  throw new RefundAccountNotFoundError(`REFUND_ACCOUNT_NOT_FOUND: 空间配额不存在`);
                }
                const q = await tx.workspacequota.findUnique({ where: { workspaceId } });
                balanceAfter = q ? q.tokenBalance : B_ZERO;
              }
            }

            await tx.pointledger.create({
              data: {
                id: randomUUID(),
                direction: "IN",
                type: "REFUND",
                scope: d.scope,
                userId,
                workspaceId,
                operatorId: adminUserId,
                points: takeBack,
                balanceAfter,
                taskId,
                grantId: d.kind === "MEMBER" ? null : (d.grantId || null),
                title: "管理员复核结算差额释放",
                remark: auditRemark,
                idempotencyKey: `ADMIN_REVIEW_SETTLE_REFUND:${taskId}:${idx}`,
              },
            });
          }

          if (monthlyIncremented > B_ZERO) {
            const rollbackMonthly = diffToRelease < monthlyIncremented ? diffToRelease : monthlyIncremented;
            const affected = await tx.$executeRaw`
              UPDATE \`workspacemember\`
              SET \`monthlyTokenUsed\` = IF(\`monthlyTokenUsed\` >= ${rollbackMonthly}, \`monthlyTokenUsed\` - ${rollbackMonthly}, 0)
              WHERE \`userId\` = ${userId} AND \`workspaceId\` = ${workspaceId}
            `;
            if (affected === 0) {
              throw new RefundAccountNotFoundError(`REFUND_ACCOUNT_NOT_FOUND: 空间成员月度用量更新失败`);
            }
          }
        } else if (targetPoints > holdPoints) {
          // 少补差额
          const diffToSupplement = targetPoints - holdPoints;
          if (diffToSupplement > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new TokenSettlementError("USAGE_EXCEEDS_SAFE_LIMIT", `补扣点数 (${diffToSupplement}) 超出安全整数上限`);
          }
          supplementPoints = diffToSupplement;
          await deductPointsInTx(tx, {
            userId,
            workspaceId,
            need: Number(diffToSupplement),
            taskId,
            title: "管理员复核结算差额补扣",
            remark: auditRemark,
            idempotencyPrefix: `ADMIN_REVIEW_SUPPLEMENT:${taskId}`,
            bumpMonthlyUsed: true,
          });
        }
      }
    }

    // 更新结算主表与 HOLD 表
    await tx.$executeRaw`
      UPDATE \`tokensettlement\`
      SET \`status\` = ${targetStatus},
          \`actualPricePoints\` = ${actualPricePoints},
          \`releasedPoints\` = ${releasedPoints},
          \`supplementPoints\` = ${supplementPoints},
          \`auditMessage\` = ${auditMessage},
          \`settlementVersion\` = \`settlementVersion\` + 1,
          \`settledAt\` = ${targetStatus === "SETTLED" ? now : null},
          \`releasedAt\` = ${targetStatus === "RELEASED" ? now : null},
          \`updatedAt\` = ${now}
      WHERE \`taskId\` = ${taskId} AND \`status\` = 'REQUIRES_REVIEW'
    `;

    await tx.$executeRaw`
      UPDATE \`tokensettlementhold\`
      SET \`status\` = ${targetStatus},
          \`statusChangedAt\` = ${now},
          \`updatedAt\` = ${now}
      WHERE \`taskId\` = ${taskId} AND \`status\` = 'REQUIRES_REVIEW'
    `;

    // 同步将 tokensettlementrecovery 流转为终态并清空 claimToken 与 leaseUntil
    await tx.tokensettlementrecovery.updateMany({
      where: { taskId },
      data: {
        status: targetStatus,
        claimToken: null,
        leaseUntil: null,
        updatedAt: now,
      },
    });

      return {
        taskId,
        status: targetStatus,
        auditMessage,
        releasedPoints,
        supplementPoints,
        actualPricePoints,
      };
    });
  } catch (err: unknown) {
    if (attempt < MAX_REFUND_RETRIES && isRetryableP2034(err)) {
      await backoffDelay(attempt);
      continue;
    }
    throw err;
  }
}
}
