/**
 * [P06 / R2] 平台共享成本预算与成本预约生命周期（check/reserve/settle/release/unknown）。
 *
 * 定位：本模块是「准入裁决」（@/lib/model-cost-admission 唯一真源）与「真实外部调用接线」
 * （批次8 Studio handler）之间的薄服务层。它负责：
 *   1. 把一次执行绑定成可核查的报价（服务端用户/空间/付款账户/合同/价格版本/输入摘要/
 *      模型策略/执行范围/有效期/幂等键）——客户端不得定模型/供应商/key/费率；
 *   2. 用 model-cost-admission 做准入裁决（缺价/超预算/FREE 等口径全部复用，不重写）；
 *   3. 用现有数据库能力做最小共享原子成本预留（在途），跨实例/账号/企业/模型共用上限；
 *   4. 明确 未发起/成功/确定失败/未知 的释放与保留策略，未知保守保留且可恢复。
 *
 * 严格约束（COMMON-RULES §三）：
 *   - 不真实连接库/模型/支付；后端通过 ReservationBackend 注入，离线用 MemoryReservationBackend。
 *   - 决策门：platformBudgetCapMicros = null 表示平台共享成本预算未批准，任何正成本（新付费能力）
 *     预约被拒（DECISION_BLOCKED）；FREE/0 成本流程不受影响。不擅自编商业预算。
 *   - -1 权益或管理员身份不豁免平台成本：本服务对任何身份一视同仁地占在途预算。
 *   - 事务不跨外部调用；状态/清理有界；提交失败可恢复。
 *   - 不改 payment（A5）或 credit 扣款原语（A7）；外部调用接线由 B8 完成。
 */

import { MICROS_PER_POINT } from "@/lib/point-rate";
import {
  decidePlatformModelCostAdmission,
  type CostAdmissionPricing,
  type CostAdmissionDecision,
} from "@/lib/model-cost-admission";

export type ReservationStatus = "RESERVED" | "SETTLED" | "RELEASED" | "UNKNOWN";

/** 一次执行的报价绑定（全部来自服务端可信来源，客户端不得指定模型/供应商/key/费率） */
export interface QuoteInput {
  userId: string;
  workspaceId: string;
  paymentAccountId: string | null;
  contractId: string | null;
  priceVersionId: string | null;
  inputDigest: string;
  modelStrategy: string;
  executionScope: string;
  /** 有效期（ms epoch）；过期必须重新报价，不能拿旧成功键修改内容 */
  validUntil: number;
  /** 幂等摘要：同键不重复占预算、不重复创建收费执行 */
  idempotencyKey: string;
}

export interface ReservationRow {
  id: string;
  idempotencyKey: string;
  quote: QuoteInput;
  /** 保守成本上界（微元，BigInt.toString 持久化） */
  conservativeCostMicros: string;
  status: ReservationStatus;
  createdAt: number;
  settledAt: number | null;
  releasedAt: number | null;
  unknownAt: number | null;
  /** 关联的结算 hold ID（执行阶段创建后回填，用于恢复/释放） */
  holdId?: string | null;
}

/**
 * 平台共享成本预算后端契约（DB 接线的唯一接口；批次13统一接入正式 schema）。
 * 离线验证与测试用 MemoryReservationBackend；真实实现需保证 reservePlatformInFlight 的原子性
 * （跨实例共享、条件更新、在途超上限即拒绝、不在业务请求内建表）。
 */
export interface ReservationBackend {
  /** 平台在途成本（微元）原子增加；capMicros=null 时由调用方先判决策门，不在此拦截 */
  reservePlatformInFlight(micros: bigint, capMicros: bigint | null): Promise<{ ok: boolean; inFlight: bigint }>;
  releasePlatformInFlight(micros: bigint): Promise<void>;
  createReservation(row: ReservationRow): Promise<{ created: boolean }>;
  getReservation(idempotencyKey: string): Promise<ReservationRow | null>;
  updateReservation(idempotencyKey: string, patch: Partial<ReservationRow>): Promise<{ count: number }>;
  transition(
    idempotencyKey: string,
    from: ReservationStatus,
    to: ReservationStatus,
    patch?: Partial<ReservationRow>,
  ): Promise<{ count: number }>;
}

export interface AdmitInputs {
  pricing: CostAdmissionPricing | null | undefined;
  contextLimit: unknown;
  maxOutputTokens: number;
  budgetPoints: number;
  markupRateBps: number;
}

export interface ReserveConfig {
  /** 平台在途成本硬上限（微元）；null = 未批准新付费能力 → 拦截正成本预约（决策门） */
  platformBudgetCapMicros: bigint | null;
  now?: () => number;
}

export type ReserveOutcome =
  | { ok: true; reservation: ReservationRow; costMicros: bigint; decision: Extract<CostAdmissionDecision, { allowed: true }> }
  | {
      ok: false;
      code:
        | "QUOTE_EXPIRED"
        | "ALREADY_SETTLED"
        | "ALREADY_RELEASED"
        | "ALREADY_UNKNOWN"
        | "ADMISSION_REJECTED"
        | "PLATFORM_BUDGET_BLOCKED"
        | "PLATFORM_BUDGET_EXCEEDED"
        | "RESERVE_FAILED";
      error: string;
      decision?: CostAdmissionDecision;
      reservation?: ReservationRow;
    };

export type LifecycleOutcome =
  | { ok: true; status: ReservationStatus }
  | { ok: false; status: ReservationStatus | null; error: string };

export class CostReservationService {
  private now: () => number;

  constructor(
    private backend: ReservationBackend,
    private config: ReserveConfig,
  ) {
    this.now = config.now ?? (() => Date.now());
  }

  /** 报价绑定 + 准入裁决 + 平台在途预算原子预留（一步事务边界内完成判断；真实 DB 接线由批次13保证原子） */
  async admitAndReserve(quote: QuoteInput, admit: AdmitInputs): Promise<ReserveOutcome> {
    // 1. 报价过期：材料/模型/版本变化必须重新裁决，旧成功键不得修改内容继续用
    if (quote.validUntil <= this.now()) {
      return {
        ok: false,
        code: "QUOTE_EXPIRED",
        error: "报价已过期，请重新生成报价后再提交（材料/模型/版本变化需重新裁决）。",
      };
    }
    // 2. 幂等：同幂等键存在 → 返回既有态，不重复占预算、不重复创建收费执行
    const existing = await this.backend.getReservation(quote.idempotencyKey);
    if (existing) {
      if (existing.status === "SETTLED")
        return { ok: false, code: "ALREADY_SETTLED", error: "该预约已结算（成功），不可重复预约。", reservation: existing };
      if (existing.status === "RELEASED")
        return { ok: false, code: "ALREADY_RELEASED", error: "该预约已释放（失败），不可重复预约。", reservation: existing };
      if (existing.status === "UNKNOWN")
        return { ok: false, code: "ALREADY_UNKNOWN", error: "该预约处于未知待恢复状态，不可重复预约。", reservation: existing };
      // RESERVED：已在在途，直接返回，避免重复占预算
      return {
        ok: true,
        reservation: existing,
        costMicros: BigInt(existing.conservativeCostMicros),
        decision: {
          allowed: true,
          conservativeCostMicros: BigInt(existing.conservativeCostMicros),
          conservativeCostPoints: Number(BigInt(existing.conservativeCostMicros) / MICROS_PER_POINT),
          inputTokenUpperBound: quote.modelStrategy.length,
          inputBoundSource: "REGISTRY_CONTEXT_LIMIT_FULL",
          budgetPoints: quote.executionScope.length,
        },
      };
    }
    // 3. 准入裁决（复用 model-cost-admission 唯一真源；缺价/状态不可信/超预算/FREE 等口径不动）
    const decision = decidePlatformModelCostAdmission(admit);
    if (!decision.allowed) {
      return { ok: false, code: "ADMISSION_REJECTED", error: decision.error, decision };
    }
    // 4. 决策门：平台共享成本预算未批准时，任何正成本（新付费能力）预约被拒；FREE/0 成本放行
    const cap = this.config.platformBudgetCapMicros;
    if (cap === null && decision.conservativeCostMicros > BigInt(0)) {
      return {
        ok: false,
        code: "PLATFORM_BUDGET_BLOCKED",
        error: "平台共享成本预算尚未批准，相关新付费能力暂不可用（零成本/FREE 流程不受影响）。",
        decision,
      };
    }
    // 5. 原子预留平台在途成本（跨实例/账号/企业/模型共用上限）
    const reserved = await this.backend.reservePlatformInFlight(decision.conservativeCostMicros, cap);
    if (!reserved.ok) {
      return {
        ok: false,
        code: "PLATFORM_BUDGET_EXCEEDED",
        error: "平台共享在途成本已超上限，本次执行被暂缓，请稍后重试。",
        decision,
      };
    }
    // 6. 落预约行（幂等创建；并发冲突回退在途占用）
    const row: ReservationRow = {
      id: `res_${quote.idempotencyKey}`,
      idempotencyKey: quote.idempotencyKey,
      quote,
      conservativeCostMicros: decision.conservativeCostMicros.toString(),
      status: "RESERVED",
      createdAt: this.now(),
      settledAt: null,
      releasedAt: null,
      unknownAt: null,
    };
    const created = await this.backend.createReservation(row);
    if (!created.created) {
      await this.backend.releasePlatformInFlight(decision.conservativeCostMicros);
      return { ok: false, code: "RESERVE_FAILED", error: "预约创建冲突，已回退在途占用。", decision };
    }
    return { ok: true, reservation: row, costMicros: decision.conservativeCostMicros, decision };
  }

  /** 成功：结算并释放平台在途（成本转为已消耗，不再占用在途额度），允许从 UNKNOWN 恢复为 SETTLED */
  async settle(idempotencyKey: string): Promise<LifecycleOutcome> {
    const r = await this.backend.transition(idempotencyKey, "RESERVED", "SETTLED", { settledAt: this.now() });
    if (r.count === 0) {
      const alt = await this.backend.transition(idempotencyKey, "UNKNOWN", "SETTLED", { settledAt: this.now() });
      if (alt.count === 0) return { ok: false, status: null, error: "预约不可结算（状态非在途/未知）。" };
    }
    const row = await this.backend.getReservation(idempotencyKey);
    if (row) await this.backend.releasePlatformInFlight(BigInt(row.conservativeCostMicros));
    return { ok: true, status: "SETTLED" };
  }

  /** 确定失败：释放平台在途与预约占用 */
  async release(idempotencyKey: string): Promise<LifecycleOutcome> {
    const r = await this.backend.transition(idempotencyKey, "RESERVED", "RELEASED", { releasedAt: this.now() });
    if (r.count === 0) return { ok: false, status: null, error: "预约不可释放（状态非在途）。" };
    const row = await this.backend.getReservation(idempotencyKey);
    if (row) await this.backend.releasePlatformInFlight(BigInt(row.conservativeCostMicros));
    return { ok: true, status: "RELEASED" };
  }

  /** 未知供应商结果：保守保留在途占用（不盲释再重试），状态转 UNKNOWN，待批次11恢复服务处理 */
  async markUnknown(idempotencyKey: string): Promise<LifecycleOutcome> {
    const r = await this.backend.transition(idempotencyKey, "RESERVED", "UNKNOWN", { unknownAt: this.now() });
    if (r.count === 0) return { ok: false, status: null, error: "预约不可标记未知（状态非在途）。" };
    return { ok: true, status: "UNKNOWN" };
  }

  /** 读取预约行（含 holdId），供编排层恢复/释放使用 */
  async getReservation(idempotencyKey: string): Promise<ReservationRow | null> {
    return this.backend.getReservation(idempotencyKey);
  }

  /** 回填结算 hold ID（执行阶段创建 hold 后） */
  async attachHold(idempotencyKey: string, holdId: string): Promise<void> {
    await this.backend.updateReservation(idempotencyKey, { holdId });
  }
}

/**
 * 离线/测试用内存后端：单一共享 Map 与单一在途计数器模拟「跨实例共享」的数据库真相源。
 * 真实 DB 接线（批次13）须保证 reservePlatformInFlight 的原子条件更新，不在业务请求内建表。
 */
export class MemoryReservationBackend implements ReservationBackend {
  private reservations = new Map<string, ReservationRow>();
  private inFlight: bigint = BigInt("0");

  async reservePlatformInFlight(micros: bigint, capMicros: bigint | null): Promise<{ ok: boolean; inFlight: bigint }> {
    if (capMicros !== null && this.inFlight + micros > capMicros) {
      return { ok: false, inFlight: this.inFlight };
    }
    this.inFlight += micros;
    return { ok: true, inFlight: this.inFlight };
  }

  async releasePlatformInFlight(micros: bigint): Promise<void> {
    this.inFlight -= micros;
    if (this.inFlight < BigInt("0")) this.inFlight = BigInt("0");
  }

  async createReservation(row: ReservationRow): Promise<{ created: boolean }> {
    if (this.reservations.has(row.idempotencyKey)) return { created: false };
    this.reservations.set(row.idempotencyKey, row);
    return { created: true };
  }

  async getReservation(idempotencyKey: string): Promise<ReservationRow | null> {
    return this.reservations.get(idempotencyKey) ?? null;
  }

  async updateReservation(idempotencyKey: string, patch: Partial<ReservationRow>): Promise<{ count: number }> {
    const row = this.reservations.get(idempotencyKey);
    if (!row) return { count: 0 };
    Object.assign(row, patch);
    return { count: 1 };
  }

  async transition(
    idempotencyKey: string,
    from: ReservationStatus,
    to: ReservationStatus,
    patch?: Partial<ReservationRow>,
  ): Promise<{ count: number }> {
    const row = this.reservations.get(idempotencyKey);
    if (!row || row.status !== from) return { count: 0 };
    row.status = to;
    if (patch) Object.assign(row, patch);
    return { count: 1 };
  }
}
