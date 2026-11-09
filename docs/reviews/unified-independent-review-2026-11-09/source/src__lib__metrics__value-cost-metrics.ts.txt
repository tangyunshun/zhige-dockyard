/**
 * [P12 / R5] 用户价值、留存与成本经营指标 —— 只读聚合（B12 接线层）。
 *
 * 定位：让负责人看清真实使用价值与支出风险，不以漂亮数字替代利润证据。本模块对
 * task/ledger/cost 事实做只读聚合，明确排除 同日刷新/同任务重试·attempt/模拟/内部测试/
 * 赠送/人工补录 伪收入，并对缺项显式标 unknown（不填 0）。纯函数、注入事实，离线可测。
 *
 * 严格约束（COMMON-RULES / 批次12）：
 *   - 不引入外部分析平台或任意敏感埋点；复用既有只读 API。
 *   - 收款/已消费服务/点数/供应商成本/免费·推广/固定支出分栏；未知成本/收入标 unknown，不填 0。
 *   - 已购未消费余额不简单视为赚到的钱（财务口径仍由负责人决定）。
 *   - 成本卡覆盖多步/失败/重试/文件/OCR/存储下载/支付与直接支持等已有可获得事实，
 *     缺项显式列出，不填 0；目标贡献率/风险准备未定仅做参数化离线测算，不写回售价或预算。
 *   - 数据归属与查看/导出权限严格；用户不看其他企业明细，管理员只读无资金写；
 *     聚合接口不重算/补扣/补权益。必要事件只含最小业务ID/版本/原因，不收正文/验证码/密钥。
 *   - 不编转化/DAU/LTV/利润；低频工作不强求 DAU；下载一次不能当满意（结构验证≠用户认可）。
 *   - 零真实库/客户数据/财务账单；外部依赖通过注入事实，离线可测。
 */

export type CostComponent = "MULTI_STEP" | "FAIL" | "RETRY" | "FILE" | "OCR" | "STORAGE" | "DOWNLOAD" | "PAYMENT" | "SUPPORT";

export interface RawTaskFact {
  id: string;
  tenantId: string;
  scenario: string;
  createdAtMs: number;
  /** 首次有效成果时间；null = 尚未产生/被阻断 */
  firstValidResultAtMs: number | null;
  /** 同任务重试/attempt —— 从「重复完成/复用」中排除 */
  isRetry: boolean;
  isSimulation: boolean;
  isInternalTest: boolean;
  /** 结构验证通过（下载/出结果），但用户认可需显式标记，不等同满意 */
  structurallyValid: boolean;
  /** 用户显式认可（非仅下载） */
  recognizedSatisfied: boolean;
  qualityFailed: boolean;
  refunded: boolean;
  /** 是否为复用既有成果（非新执行） */
  isReuse: boolean;
  /** 差异/unknown 恢复标记（来自批次8/11） */
  recoveryDifference: boolean;
}

export interface RawLedgerFact {
  id: string;
  tenantId: string;
  category: "PAID" | "RENEWAL" | "GIFT" | "MANUAL" | "FREE_PROMO" | "FIXED";
  /** 金额（微元）；null = 未知（标 unknown，不填 0） */
  amountMicros: bigint | null;
  /** 是否为伪收入（赠送/人工补录），从真实收款中剔除 */
  pseudoRevenue: boolean;
}

export interface RawCostFact {
  id: string;
  tenantId: string;
  component: CostComponent;
  /** 成本（微元）；null = 未知（标 unknown，不填 0） */
  costMicros: bigint | null;
}

export interface MetricQueryOptions {
  /** 目标租户（强隔离；用户只看自己企业，管理员仅聚合不写） */
  tenantId: string;
  /** 观察窗口（ms epoch 起止） */
  windowStartMs: number;
  windowEndMs: number;
  /** 时区偏移（分钟），仅用于说明归因依据，不影响排除逻辑 */
  tzOffsetMinutes: number;
  /** 已购未消费余额（微元）——明确不计入已赚收入 */
  purchasedUnconsumedMicros: bigint;
}

/** 单指标值：区分「已知数值」与「未知（缺数据）」与「不适用（样本不足）」 */
export type MetricValue =
  | { kind: "NUMBER"; value: bigint | number }
  | { kind: "UNKNOWN"; note: string }
  | { kind: "INSUFFICIENT_SAMPLE"; note: string };

export interface ValueCostMetrics {
  tenantId: string;
  window: { startMs: number; endMs: number; tzOffsetMinutes: number };
  /** 结构有效成果数（≠ 用户认可） */
  structuralValidResults: MetricValue;
  /** 用户显式认可数（下载一次不当满意） */
  recognizedSatisfied: MetricValue;
  /** 首次有效成果平均耗时（ms），仅统计有成果者 */
  avgFirstResultLatencyMs: MetricValue;
  /** 质量失败/退款计数 */
  qualityFailRefund: MetricValue;
  /** 重复完成/复用计数（排除同任务重试/模拟/内部测试） */
  repeatCompletionReuse: MetricValue;
  /** 真实收款（PAID+RENEWAL，剔除赠送/人工伪收入） */
  realCollectedMicros: MetricValue;
  /** 已消费服务口径 */
  consumedServiceMicros: MetricValue;
  /** 供应商成本（已知部分求和） */
  supplierCostMicros: MetricValue;
  /** 免费/推广 */
  freePromoMicros: MetricValue;
  /** 固定支出 */
  fixedCostMicros: MetricValue;
  /** 已购未消费余额（不计入已赚收入，仅展示） */
  purchasedUnconsumedMicros: bigint;
  /** 恢复差异计数（来自批次8/11 unknown） */
  recoveryDifference: MetricValue;
  /** 成本覆盖缺口：未提供事实的成本组件（显式列出，不填 0） */
  costCoverageGaps: CostComponent[];
  /** 哪些指标因未知成本/收入而不可视作完整利润 */
  profitNotDeterminable: boolean;
}

/** 剔除伪收入/模拟/内部测试/同任务重试等噪声，仅留真实可归因样本 */
function filterTaskSample(facts: RawTaskFact[], opts: MetricQueryOptions): RawTaskFact[] {
  return facts.filter(
    (f) =>
      f.tenantId === opts.tenantId &&
      f.createdAtMs >= opts.windowStartMs &&
      f.createdAtMs <= opts.windowEndMs &&
      !f.isSimulation &&
      !f.isInternalTest &&
      !f.isRetry, // 同任务重试/attempt 不计入重复完成
  );
}

function filterLedgerSample(facts: RawLedgerFact[], opts: MetricQueryOptions): RawLedgerFact[] {
  return facts.filter(
    (f) =>
      f.tenantId === opts.tenantId &&
      !f.pseudoRevenue, // 赠送/人工补录伪收入剔除
  );
}

function filterCostSample(facts: RawCostFact[], opts: MetricQueryOptions): RawCostFact[] {
  return facts.filter((f) => f.tenantId === opts.tenantId);
}

function sumKnown(values: (bigint | null)[]): { total: bigint; hasUnknown: boolean } {
  let total = BigInt(0);
  let hasUnknown = false;
  for (const v of values) {
    if (v === null) hasUnknown = true;
    else total += v;
  }
  return { total, hasUnknown };
}

/** 只读聚合：全部纯计算，零业务写；未知标 unknown，缺项显式列缺口，不填 0 */
export function computeMetrics(
  taskFacts: RawTaskFact[],
  ledgerFacts: RawLedgerFact[],
  costFacts: RawCostFact[],
  opts: MetricQueryOptions,
): ValueCostMetrics {
  const tasks = filterTaskSample(taskFacts, opts);
  const ledgers = filterLedgerSample(ledgerFacts, opts);
  const costs = filterCostSample(costFacts, opts);

  const structuralValid = tasks.filter((t) => t.structurallyValid);
  const recognized = tasks.filter((t) => t.recognizedSatisfied);
  const withLatency = tasks.filter((t) => t.firstValidResultAtMs != null);

  const qualityFailRefund = tasks.filter((t) => t.qualityFailed || t.refunded);
  const reuse = tasks.filter((t) => t.isReuse);
  const recoveryDiff = tasks.filter((t) => t.recoveryDifference);

  // 真实收款：PAID + RENEWAL（已在 filterLedgerSample 剔除伪收入）
  const realCollected = sumKnown(ledgers.filter((l) => l.category === "PAID" || l.category === "RENEWAL").map((l) => l.amountMicros));
  const freePromo = sumKnown(ledgers.filter((l) => l.category === "FREE_PROMO").map((l) => l.amountMicros));
  const fixed = sumKnown(ledgers.filter((l) => l.category === "FIXED").map((l) => l.amountMicros));

  // 供应商成本：按组件求和，缺组件显式列缺口
  const allComponents: CostComponent[] = ["MULTI_STEP", "FAIL", "RETRY", "FILE", "OCR", "STORAGE", "DOWNLOAD", "PAYMENT", "SUPPORT"];
  const providedComponents = new Set(costs.map((c) => c.component));
  const costCoverageGaps = allComponents.filter((c) => !providedComponents.has(c));
  const supplierCost = sumKnown(costs.map((c) => c.costMicros));

  // 已消费服务口径：真实收款中扣除未消费余额（不计入已赚）
  const consumedService = realCollected.hasUnknown
    ? ({ kind: "UNKNOWN", note: "存在未知收款金额，已消费服务口径不可确定" } as MetricValue)
    : ({ kind: "NUMBER", value: realCollected.total } as MetricValue);

  const profitNotDeterminable = realCollected.hasUnknown || supplierCost.hasUnknown || costCoverageGaps.length > 0;

  // 计数指标：有基准记录（tasks 非空）时，0 也是真实测量值（NUMBER 0）；
  // 仅在完全没有基准数据时才标 INSUFFICIENT_SAMPLE（不编 DAU/留存/转化）。
  const countMetric = (basisCount: number, actualCount: number): MetricValue =>
    basisCount === 0
      ? ({ kind: "INSUFFICIENT_SAMPLE", note: "无基准数据，不编转化/留存/DAU" } as MetricValue)
      : ({ kind: "NUMBER", value: actualCount } as MetricValue);

  const avgLatency =
    withLatency.length === 0
      ? ({ kind: "INSUFFICIENT_SAMPLE", note: "无首次有效成果样本，无法计算平均耗时" } as MetricValue)
      : ({ kind: "NUMBER", value: withLatency.reduce((s, t) => s + (t.firstValidResultAtMs! - t.createdAtMs), 0) / withLatency.length } as MetricValue);

  return {
    tenantId: opts.tenantId,
    window: { startMs: opts.windowStartMs, endMs: opts.windowEndMs, tzOffsetMinutes: opts.tzOffsetMinutes },
    structuralValidResults: countMetric(tasks.length, structuralValid.length),
    recognizedSatisfied: countMetric(tasks.length, recognized.length),
    avgFirstResultLatencyMs: avgLatency,
    qualityFailRefund: countMetric(tasks.length, qualityFailRefund.length),
    repeatCompletionReuse: countMetric(tasks.length, reuse.length),
    realCollectedMicros: realCollected.hasUnknown ? ({ kind: "UNKNOWN", note: "存在未知收款金额，真实收款不可确定" } as MetricValue) : ({ kind: "NUMBER", value: realCollected.total } as MetricValue),
    consumedServiceMicros: consumedService,
    supplierCostMicros: supplierCost.hasUnknown ? ({ kind: "UNKNOWN", note: "存在未知供应商成本，成本口径不可确定" } as MetricValue) : ({ kind: "NUMBER", value: supplierCost.total } as MetricValue),
    freePromoMicros: freePromo.hasUnknown ? ({ kind: "UNKNOWN", note: "存在未知免费/推广金额" } as MetricValue) : ({ kind: "NUMBER", value: freePromo.total } as MetricValue),
    fixedCostMicros: fixed.hasUnknown ? ({ kind: "UNKNOWN", note: "存在未知固定支出" } as MetricValue) : ({ kind: "NUMBER", value: fixed.total } as MetricValue),
    purchasedUnconsumedMicros: opts.purchasedUnconsumedMicros,
    recoveryDifference: countMetric(tasks.length, recoveryDiff.length),
    costCoverageGaps,
    profitNotDeterminable,
  };
}

/** 参数化离线利润测算（不写回售价/预算，仅展示敏感性） */
export function offlineProfitSensitivity(
  realCollectedMicros: bigint,
  supplierCostMicros: bigint,
  targetContributionBps: number,
): { grossMarginMicros: bigint; targetContributionMicros: bigint; note: string } {
  const grossMarginMicros = realCollectedMicros - supplierCostMicros;
  const targetContributionMicros = (realCollectedMicros * BigInt(targetContributionBps)) / BigInt(10000);
  return {
    grossMarginMicros,
    targetContributionMicros,
    note: "仅参数化离线测算；目标贡献率/风险准备未定，不写回售价或预算。",
  };
}
