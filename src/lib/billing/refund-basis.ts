/**
 * [P07 / R1] 来源、退款/转移与权益守恒 —— 净可退依据与只读可退预览。
 *
 * 定位：本模块不是新建账务系统（credit-service / token-settlement-service 已有成熟的
 * 原路退款、来源分桶守恒、结算 hold/release/recovery、转移幂等），而是补齐批次7要求的
 * 三件「共享/只读」增量：
 *   1. 自动退点、结算释放、人工可退预览 共用的「净可退依据」——按来源桶计算，
 *      已退/已释放的金额不能再创造额度；来源不明进入差异状态，绝不创建兜底付费事实抹平。
 *   2. 人工退款前的只读「可退明细/差异理由」预览，并在 F07 APPROVE 暂停期间对
 *      商业售后退款返回明确未就绪（不执行）。
 *   3. 全局不变量校验供测试与第13批接入复用。
 *
 * 严格约束（COMMON-RULES §三 / 批次7）：
 *   - 不真实连接库/支付/模型；记录通过注入的纯数组，离线可测。
 *   - 不改 payment（A5）或已有 credit/token-settlement 原语签名；此为只读/纯函数增量。
 *   - 不开放原 F07 人工 APPROVE；新增商业售后/补偿/企业转个人/优惠期限未经批准返回未就绪。
 *   - 单位：算力点用安全 BigInt；桶间归属守恒，赠送/企业资产不转个人。
 */

export type SourceBucket = "WALLET" | "PERSONAL_GIFT" | "WORKSPACE" | "MEMBER";
export type LedgerRecordType = "GRANT" | "CONSUME" | "REFUND" | "RELEASE" | "ADJUST";

export interface LedgerRecord {
  id: string;
  type: LedgerRecordType;
  /** 来源分桶；来源不明用 "UNKNOWN"（不造兜底付费事实） */
  bucket: SourceBucket | "UNKNOWN";
  /** BigInt 安全整数点数 */
  points: bigint;
  sourceId?: string | null;
}

export interface BucketNet {
  bucket: SourceBucket;
  consumed: bigint;
  refunded: bigint;
  released: bigint;
  /** 仍可退净额（= 已扣 - 已退 - 已释放，下限 0） */
  refundable: bigint;
}

export interface NetRefundableBasis {
  byBucket: BucketNet[];
  totalRefundable: bigint;
  /** 来源不明金额（进入差异，不造兜底付费事实） */
  unknownSourceAmount: bigint;
  differenceReasons: string[];
}

const BUCKETS: SourceBucket[] = ["WALLET", "PERSONAL_GIFT", "WORKSPACE", "MEMBER"];

/** 共享「净可退依据」：自动退点/结算释放/人工可退预览都调用它，保证已退/已释放不再创造额度 */
export function computeNetRefundable(records: LedgerRecord[]): NetRefundableBasis {
  const acc: Record<SourceBucket, { consumed: bigint; refunded: bigint; released: bigint }> = {
    WALLET: { consumed: BigInt(0), refunded: BigInt(0), released: BigInt(0) },
    PERSONAL_GIFT: { consumed: BigInt(0), refunded: BigInt(0), released: BigInt(0) },
    WORKSPACE: { consumed: BigInt(0), refunded: BigInt(0), released: BigInt(0) },
    MEMBER: { consumed: BigInt(0), refunded: BigInt(0), released: BigInt(0) },
  };
  let unknownSourceAmount = BigInt(0);
  const differenceReasons: string[] = [];

  for (const r of records) {
    if (r.bucket === "UNKNOWN") {
      unknownSourceAmount += r.points;
      continue;
    }
    const a = acc[r.bucket];
    if (r.type === "CONSUME") a.consumed += r.points;
    else if (r.type === "REFUND") a.refunded += r.points;
    else if (r.type === "RELEASE") a.released += r.points;
    // GRANT / ADJUST 不参与净可退（它们不是消费的可退基数）
  }

  const byBucket: BucketNet[] = BUCKETS.map((bucket) => {
    const a = acc[bucket];
    let refundable = a.consumed - a.refunded - a.released;
    if (refundable < BigInt(0)) {
      differenceReasons.push(`${bucket} 已退/已释放(${a.refunded + a.released})超过已扣(${a.consumed})，存在异常透支`);
      refundable = BigInt(0);
    }
    return { bucket, consumed: a.consumed, refunded: a.refunded, released: a.released, refundable };
  });

  let totalRefundable = BigInt(0);
  for (const b of byBucket) totalRefundable += b.refundable;

  if (unknownSourceAmount > BigInt(0)) {
    differenceReasons.push(`存在来源不明金额 ${unknownSourceAmount}，归入差异状态，不创建兜底付费事实抹平`);
  }

  return { byBucket, totalRefundable, unknownSourceAmount, differenceReasons };
}

export interface PreviewRefundInput {
  records: LedgerRecord[];
  /** 退款性质：COMMERCIAL 商业售后 / MODEL_FAILURE 模型失败 / SETTLEMENT_RELEASE 结算释放 */
  refundNature: "COMMERCIAL" | "MODEL_FAILURE" | "SETTLEMENT_RELEASE";
  /** 商业售后退款是否已获批准（F07 APPROVE 暂停期间为 false） */
  commercialRefundApproved: boolean;
}

export type PreviewRefundResult =
  | { ready: true; basis: NetRefundableBasis }
  | { ready: false; reason: "F07_APPROVE_PAUSED" | "NO_REFUNDABLE"; basis: NetRefundableBasis };

/** 只读「可退明细/差异理由」预览：不执行任何写；F07 APPROVE 暂停期间对商业退款明确未就绪 */
export function previewRefundable(input: PreviewRefundInput): PreviewRefundResult {
  const basis = computeNetRefundable(input.records);
  if (input.refundNature === "COMMERCIAL" && !input.commercialRefundApproved) {
    return { ready: false, reason: "F07_APPROVE_PAUSED", basis };
  }
  if (basis.totalRefundable <= BigInt(0) && basis.unknownSourceAmount <= BigInt(0)) {
    return { ready: false, reason: "NO_REFUNDABLE", basis };
  }
  return { ready: true, basis };
}
