/**
 * 退款与账务状态服务端权威派生服务
 *
 * 核心原则：
 * 1. 状态必须从数据库账务事实（pointledger、refundrecovery）派生，严禁从前端或错误码盲目猜测；
 * 2. 存在 CONSUME 流水但无 REFUND/恢复记录时，必须返回 UNKNOWN，严禁声称 NO_CHARGE 或 REFUNDED；
 * 3. 严格区分 NO_CHARGE、REFUNDED、REFUND_PENDING、RECONCILIATION_REQUIRED、UNKNOWN；
 * 4. 严禁返回用户原始输入材料、密钥或 Prompt。
 */

import type { PrismaClient } from "@prisma/client";

export type RefundStatus =
  | "NO_CHARGE"
  | "REFUNDED"
  | "REFUND_PENDING"
  | "RECONCILIATION_REQUIRED"
  | "UNKNOWN";

export interface TaskRefundMeta {
  refundStatus: RefundStatus;
  refundedPoints: number | null;
  /**
   * 是否曾尝试扣费（三态，严禁折叠）：
   *  - false：明确未发生扣费；
   *  - true：明确发生扣费尝试；
   *  - null：无法判断（严禁推断为 true 或 false）。
   */
  chargeAttempted: boolean | null;
}

export interface RefundFactInput {
  taskId: string;
  hasConsumeLedger: boolean;
  refundLedgerPoints?: number | bigint | null;
  recoveryStatus?: string | null;
  taskStatus?: string | null;
  /** 是否曾尝试扣费（如任务在扣费前即校验失败中断时为 false） */
  chargeAttemptedExplicit?: boolean | null;
}

export interface RecoveryRecordLike {
  id: string;
  taskId: string;
  status: string;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
}

/**
 * 业务状态确定性优先级权重（数值越小越权威/越优先处理）:
 * 1. SETTLED (已结算/退款成功关联事实)
 * 2. REQUIRES_REVIEW / FAILED (待对账/人工核对，异常优先级高)
 * 3. PROCESSING / PENDING (处理中 / 队列排队)
 * 4. 其他未知状态
 */
export function getRecoveryStatusPriority(status?: string | null): number {
  if (!status) return 99;
  const s = status.trim().toUpperCase();
  if (s === "SETTLED") return 1;
  if (s === "REQUIRES_REVIEW" || s === "FAILED") return 2;
  if (s === "PROCESSING" || s === "PENDING") return 3;
  return 4;
}

/**
 * 从可能存在的多条 Recovery 记录中，按照严格确定的业务规则选举唯一权威记录：
 * 1. 业务状态优先级（SETTLED > REQUIRES_REVIEW/FAILED > PROCESSING/PENDING > 其他）；
 * 2. 同状态下按 updatedAt 倒序（最新更新优先）；若无有效 updatedAt 则按 createdAt 倒序；
 * 3. 时间仍相同时，按 id 字典序倒序稳定排序，杜绝数据库返回顺序随机漂移。
 */
export function selectAuthoritativeRecoveryRecord<T extends RecoveryRecordLike>(
  records: T[],
): T | null {
  if (!records || records.length === 0) return null;
  if (records.length === 1) return records[0];

  const sorted = [...records].sort((a, b) => {
    // 1. 业务优先级
    const pA = getRecoveryStatusPriority(a.status);
    const pB = getRecoveryStatusPriority(b.status);
    if (pA !== pB) {
      return pA - pB;
    }

    // 2. 时间权威性（最新优先）
    const getTimestamp = (rec: T): number => {
      if (rec.updatedAt) {
        const t = new Date(rec.updatedAt).getTime();
        if (Number.isFinite(t)) return t;
      }
      if (rec.createdAt) {
        const t = new Date(rec.createdAt).getTime();
        if (Number.isFinite(t)) return t;
      }
      return 0;
    };

    const tA = getTimestamp(a);
    const tB = getTimestamp(b);
    if (tA !== tB) {
      return tB - tA; // 降序
    }

    // 3. 稳定备选（id 字典序）
    return String(b.id || "").localeCompare(String(a.id || ""));
  });

  return sorted[0];
}

/**
 * 纯领域状态派生函数（支持无 ORM 单元测试）
 */
export function deriveRefundStatus(facts: RefundFactInput): TaskRefundMeta {
  const {
    hasConsumeLedger,
    refundLedgerPoints,
    recoveryStatus,
    chargeAttemptedExplicit,
  } = facts;

  const refPointsNum = refundLedgerPoints != null ? Number(refundLedgerPoints) : 0;
  const hasRefundLedger = refPointsNum > 0;

  // 规则 2: 只有存在明确退款流水或权威成功证据时返回 REFUNDED，同时返回实际退款点数
  if (hasRefundLedger) {
    return {
      refundStatus: "REFUNDED",
      refundedPoints: refPointsNum,
      chargeAttempted: true,
    };
  }

  // 规则 3: 存在该 taskId 对应的权威 recovery 记录
  if (recoveryStatus) {
    const normRecStatus = recoveryStatus.trim().toUpperCase();
    if (normRecStatus === "PENDING" || normRecStatus === "PROCESSING") {
      return {
        refundStatus: "REFUND_PENDING",
        refundedPoints: null,
        chargeAttempted: true,
      };
    }
    if (normRecStatus === "FAILED" || normRecStatus === "REQUIRES_REVIEW") {
      return {
        refundStatus: "RECONCILIATION_REQUIRED",
        refundedPoints: null,
        chargeAttempted: true,
      };
    }
    if (normRecStatus === "SETTLED") {
      // 若已标记 SETTLED 但无对应 REFUND pointledger，账务事实无法闭环确认，严格返回 UNKNOWN
      return {
        refundStatus: "UNKNOWN",
        refundedPoints: null,
        chargeAttempted: true,
      };
    }
  }

  // 规则 4: 存在扣费流水证据，但没有退款成功、处理中或待对账证据，返回 UNKNOWN（绝不得展示为已退款或误判为 NO_CHARGE）
  if (hasConsumeLedger) {
    return {
      refundStatus: "UNKNOWN",
      refundedPoints: null,
      chargeAttempted: true,
    };
  }

  // 规则 1: 仅当存在明确前置阻断证据且没有消费流水时，返回 NO_CHARGE
  // （例如输入为空、文件类型不允许、文件提取失败未进入扣费、合同未就绪等前置阻断，chargeAttemptedExplicit === false）
  if (chargeAttemptedExplicit === false) {
    return {
      refundStatus: "NO_CHARGE",
      refundedPoints: null,
      chargeAttempted: false,
    };
  }

  // 规则 5: 无法确定账务事实（缺省保底 UNKNOWN，严禁返回 NO_CHARGE）
  // chargeAttempted 严格三态：缺失/未知一律保留 null，严禁推断为 true 或 false
  return {
    refundStatus: "UNKNOWN",
    refundedPoints: null,
    chargeAttempted: typeof chargeAttemptedExplicit === "boolean" ? chargeAttemptedExplicit : null,
  };
}

/**
 * 批量从数据库账务事实中反查并派生任务的权威退款状态
 */
export async function resolveTasksRefundMetaMap(
  taskIds: string[],
  prismaClient: PrismaClient,
  taskConfigs?: Map<string, { chargeAttempted?: boolean | null; status?: string }>,
): Promise<Map<string, TaskRefundMeta>> {
  const result = new Map<string, TaskRefundMeta>();
  const validIds = Array.from(new Set(taskIds.filter(Boolean)));
  if (validIds.length === 0) return result;

  // 1. 批量查询关联的 pointledger 流水（CONSUME 与 REFUND）
  const ledgers = await prismaClient.pointledger.findMany({
    where: {
      taskId: { in: validIds },
      type: { in: ["CONSUME", "REFUND"] },
    },
    select: {
      taskId: true,
      type: true,
      points: true,
    },
  });

  const consumeSet = new Set<string>();
  const refundPointsMap = new Map<string, number>();

  for (const ledger of ledgers) {
    if (!ledger.taskId) continue;
    if (ledger.type === "CONSUME") {
      consumeSet.add(ledger.taskId);
    } else if (ledger.type === "REFUND") {
      const prev = refundPointsMap.get(ledger.taskId) || 0;
      refundPointsMap.set(ledger.taskId, prev + Number(ledger.points));
    }
  }

  // 2. 批量查询关联的 refundrecovery 记录（包含时间和 ID 供稳定确定性选举）
  const recoveries = await prismaClient.refundrecovery.findMany({
    where: {
      taskId: { in: validIds },
    },
    select: {
      id: true,
      taskId: true,
      status: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  // 按 taskId 聚合候选 recovery 记录数组
  const recoveryListMap = new Map<string, RecoveryRecordLike[]>();
  for (const rec of recoveries) {
    if (rec.taskId) {
      const list = recoveryListMap.get(rec.taskId) || [];
      list.push(rec);
      recoveryListMap.set(rec.taskId, list);
    }
  }

  // 使用确定性选举算法选出各 taskId 的权威记录，杜绝数据库返回乱序干扰
  const authoritativeRecoveryMap = new Map<string, string>();
  for (const [taskId, list] of recoveryListMap.entries()) {
    const authoritative = selectAuthoritativeRecoveryRecord(list);
    if (authoritative?.status) {
      authoritativeRecoveryMap.set(taskId, authoritative.status);
    }
  }

  // 3. 逐个派生状态
  for (const id of validIds) {
    const configMeta = taskConfigs?.get(id);
    const chargeAttemptedExplicit =
      configMeta?.chargeAttempted !== undefined ? configMeta.chargeAttempted : null;

    const meta = deriveRefundStatus({
      taskId: id,
      hasConsumeLedger: consumeSet.has(id),
      refundLedgerPoints: refundPointsMap.get(id) || null,
      recoveryStatus: authoritativeRecoveryMap.get(id) || null,
      taskStatus: configMeta?.status || null,
      chargeAttemptedExplicit,
    });
    result.set(id, meta);
  }

  return result;
}
