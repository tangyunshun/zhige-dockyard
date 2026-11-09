/**
 * [R0-K / 原 F14] 文件解析资源安全：集中策略、稳定错误码与根预算。
 *
 * 单一真源：所有解析入口（独立提取、Studio 文件/资料、upload_doc、资料预览）
 * 共用这里的技术阈值与错误语义。数值是服务端技术资源阈值，不是收费/套餐规则，
 * 不允许浏览器覆盖；无法证明的生产容量按部署前置条件报告。
 */
import { randomUUID } from "node:crypto";

// ────────────────────────────── 稳定错误码 ──────────────────────────────

export const PARSE_CODES = {
  TIMEOUT: "PARSE_TIMEOUT",
  CANCELLED: "PARSE_CANCELLED",
  BUDGET_EXCEEDED: "PARSE_BUDGET_EXCEEDED",
  BUSY: "PARSE_BUSY",
  RATE_LIMITED: "PARSE_RATE_LIMITED",
  ADMISSION_NOT_READY: "PARSE_ADMISSION_NOT_READY",
  WORKER_NOT_READY: "PARSE_WORKER_NOT_READY",
  STOP_UNCONFIRMED: "PARSE_STOP_UNCONFIRMED",
  NO_TEXT: "PARSE_NO_TEXT",
  FAILED: "PARSE_FAILED",
  UNREADABLE_INPUT: "PARSE_UNREADABLE_INPUT",
} as const;

export type ParseCode = (typeof PARSE_CODES)[keyof typeof PARSE_CODES];

/** 稳定 HTTP 状态；错误必须可区分，不统一吞成空串/无文本/成功 */
export const PARSE_ERROR_STATUS: Record<ParseCode, number> = {
  PARSE_TIMEOUT: 504,
  PARSE_CANCELLED: 499,
  PARSE_BUDGET_EXCEEDED: 413,
  PARSE_BUSY: 429,
  PARSE_RATE_LIMITED: 429,
  PARSE_ADMISSION_NOT_READY: 503,
  PARSE_WORKER_NOT_READY: 503,
  PARSE_STOP_UNCONFIRMED: 503,
  PARSE_NO_TEXT: 422,
  PARSE_FAILED: 500,
  PARSE_UNREADABLE_INPUT: 400,
};

/** 人能理解、不泄露原文/密钥/堆栈的稳定提示 */
const PARSE_ERROR_MESSAGE: Record<ParseCode, string> = {
  PARSE_TIMEOUT: "文件解析超时，解析任务已停止，请缩小文件后重试",
  PARSE_CANCELLED: "文件解析已取消，解析任务已停止",
  PARSE_BUDGET_EXCEEDED: "文件解析超出服务端资源上限，已停止解析并保留原文件，请缩小或拆分材料",
  PARSE_BUSY: "当前解析任务繁忙，请稍后重试",
  PARSE_RATE_LIMITED: "文件解析请求过于频繁，请稍后再试",
  PARSE_ADMISSION_NOT_READY: "解析资源准入服务尚未就绪（需先完成离线数据库迁移），请稍后重试或联系管理员",
  PARSE_WORKER_NOT_READY: "解析隔离任务入口未就绪（部署产物缺失），请稍后重试或联系管理员",
  PARSE_STOP_UNCONFIRMED: "解析任务结束状态未能确认，已保守隔离本次占用，请稍后重试或联系管理员",
  PARSE_NO_TEXT: "未能从文件中提取到有效文本，请检查文件内容或下载原文件查看",
  PARSE_FAILED: "文件解析失败，请下载原文件查看或稍后重试",
  PARSE_UNREADABLE_INPUT: "无法读取上传文件内容，请重新上传",
};

export class ParseResourceError extends Error {
  readonly code: ParseCode;
  readonly status: number;
  readonly limitKind?: string;

  constructor(code: ParseCode, message?: string, limitKind?: string) {
    super(message || PARSE_ERROR_MESSAGE[code]);
    this.name = "ParseResourceError";
    this.code = code;
    this.status = PARSE_ERROR_STATUS[code];
    this.limitKind = limitKind;
  }
}

export function asParseResourceError(err: unknown): ParseResourceError {
  if (err instanceof ParseResourceError) return err;
  return new ParseResourceError(PARSE_CODES.FAILED);
}

/** 统一响应体：稳定 code + 可理解信息；绝不回传原文或内部堆栈 */
export function parseErrorBody(err: unknown): { success: false; code: ParseCode; error: string } {
  const e = asParseResourceError(err);
  return { success: false, code: e.code, error: e.message };
}

// ────────────────────────────── 阈值（数值 / 单位 / 依据） ──────────────────────────────

/**
 * 既有基线（不得静默放宽）：
 *  - 20MB：独立 extract-text 接口的单文件上限（不是全系统同一上限）
 *  - 100MB：Studio 任务 file 模式绝对上限/合同约束（保留在 handler，不由本表改写）
 *  - 3 / 20次每分钟 / 60秒：独立接口既有单账号并发、频次、超时基线
 *  - 深度 2 / 每层 20 条：既有压缩包局部限制
 *  - 500 行：既有表格预览行数
 * 新增平台与格式预算为服务端技术阈值，集中于此；测试用小预算覆写，不制造真实资源耗尽。
 */
export const PARSE_LIMITS = {
  // 输入（字节）
  EXTRACT_TEXT_MAX_INPUT_BYTES: 20 * 1024 * 1024,
  TASK_FILE_HARD_CAP_BYTES: 100 * 1024 * 1024,
  ROOT_MAX_INPUT_BYTES: 20 * 1024 * 1024,
  ROOT_MAX_INFLATED_BYTES: 24 * 1024 * 1024,
  MAX_ENTRY_BYTES: 4 * 1024 * 1024,
  MAX_XML_PART_BYTES: 4 * 1024 * 1024,

  // 结构与工作量（条 / 层 / 次）
  ROOT_MAX_ENTRIES: 200,
  ENTRIES_PER_LEVEL: 20,
  ROOT_MAX_DEPTH: 2,
  ROOT_MAX_WORK_UNITS: 200,
  ROOT_MAX_OUTPUT_CHARS: 2_000_000,
  FORM_DATA_TIMEOUT_MS: 30_000,

  // 格式（页 / 像素 / 工作表 / 单元格 / 字符）
  MAX_PDF_PAGES: 200,
  MAX_PDF_TEXT_CHARS: 1_000_000,
  MAX_IMAGE_PIXELS: 20_000_000,
  MAX_SHEETS: 20,
  MAX_CELLS: 200_000,
  MAX_PREVIEW_ROWS: 500,
  MAX_HTML_CHARS: 1_000_000,

  // 时间（毫秒）
  HARD_DEADLINE_MS: 60_000,
  EXIT_CONFIRM_MS: 5_000,
  LEASE_TTL_MS: 75_000,
  LEASE_SWEEP_GRACE_MS: 15_000,
  RATE_WINDOW_MS: 60_000,

  // 共享准入（个 / 单位）
  USER_MAX_CONCURRENT: 3,
  USER_MAX_PER_MINUTE: 20,
  PLATFORM_MAX_CONCURRENT: 6,
  PLATFORM_MAX_WORK_UNITS: 12,
  WORK_UNITS_PER_PARSE: 1,
  LEASE_SWEEP_BATCH: 64,
} as const;

export type BudgetKind =
  | "inputBytes"
  | "inflatedBytes"
  | "entries"
  | "depth"
  | "outputChars"
  | "workUnits"
  | "pdfPages"
  | "pdfTextChars"
  | "imagePixels"
  | "sheets"
  | "cells"
  | "previewRows"
  | "htmlChars";

export type BudgetUsage = Partial<Record<BudgetKind, number>>;
export type BudgetLimits = Record<BudgetKind, number>;

/** 每个解析请求的有限根预算；fork 只共享同一份状态，不重置额度 */
export const ROOT_LIMITS: BudgetLimits = {
  inputBytes: PARSE_LIMITS.ROOT_MAX_INPUT_BYTES,
  inflatedBytes: PARSE_LIMITS.ROOT_MAX_INFLATED_BYTES,
  entries: PARSE_LIMITS.ROOT_MAX_ENTRIES,
  depth: PARSE_LIMITS.ROOT_MAX_DEPTH,
  outputChars: PARSE_LIMITS.ROOT_MAX_OUTPUT_CHARS,
  workUnits: PARSE_LIMITS.ROOT_MAX_WORK_UNITS,
  pdfPages: PARSE_LIMITS.MAX_PDF_PAGES,
  pdfTextChars: PARSE_LIMITS.MAX_PDF_TEXT_CHARS,
  imagePixels: PARSE_LIMITS.MAX_IMAGE_PIXELS,
  sheets: PARSE_LIMITS.MAX_SHEETS,
  cells: PARSE_LIMITS.MAX_CELLS,
  previewRows: PARSE_LIMITS.MAX_PREVIEW_ROWS,
  htmlChars: PARSE_LIMITS.MAX_HTML_CHARS,
};

type RootState = {
  limits: BudgetLimits;
  used: BudgetUsage;
  deadlineAt: number;
  clock: () => number;
};

export type BudgetSnapshot = {
  limits: BudgetLimits;
  used: BudgetUsage;
  remaining: BudgetLimits;
  remainingMs: number;
};

export class RootBudget {
  private readonly state: RootState;

  constructor(opts: { limits?: Partial<BudgetLimits>; deadlineMs?: number; now?: number; clock?: () => number } = {}) {
    const clock = opts.clock ?? Date.now;
    const now = opts.now ?? clock();
    this.state = {
      limits: { ...ROOT_LIMITS, ...(opts.limits ?? {}) },
      used: {},
      deadlineAt: now + (opts.deadlineMs ?? PARSE_LIMITS.HARD_DEADLINE_MS),
      clock,
    };
  }

  /** 同一根预算的视图：多文件请求与嵌套压缩包共享状态，绝不重新获得完整额度 */
  fork(): RootBudget {
    const view = Object.create(RootBudget.prototype) as RootBudget & { state: RootState };
    (view as any).state = this.state;
    return view;
  }

  checkDeadline(): void {
    if (this.state.clock() >= this.state.deadlineAt) {
      throw new ParseResourceError(PARSE_CODES.TIMEOUT);
    }
  }

  consume(kind: BudgetKind, amount: number): void {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new ParseResourceError(PARSE_CODES.UNREADABLE_INPUT);
    }
    this.checkDeadline();
    const used = (this.state.used[kind] ?? 0) + amount;
    if (used > this.state.limits[kind]) {
      throw new ParseResourceError(PARSE_CODES.BUDGET_EXCEEDED, undefined, kind);
    }
    this.state.used[kind] = used;
  }

  /** 合并 worker 上报的实际消耗；worker 侧限额本身来自剩余额度快照 */
  applyUsage(usage: BudgetUsage): void {
    for (const [kind, amount] of Object.entries(usage || {})) {
      if (typeof amount === "number") this.consume(kind as BudgetKind, amount);
    }
  }

  snapshot(): BudgetSnapshot {
    const remaining = {} as BudgetLimits;
    for (const k of Object.keys(this.state.limits) as BudgetKind[]) {
      remaining[k] = Math.max(0, this.state.limits[k] - (this.state.used[k] ?? 0));
    }
    return {
      limits: { ...this.state.limits },
      used: { ...this.state.used },
      remaining,
      remainingMs: Math.max(0, this.state.deadlineAt - this.state.clock()),
    };
  }

  get used(): BudgetUsage {
    return { ...this.state.used };
  }

  get deadlineAt(): number {
    return this.state.deadlineAt;
  }
}

// ────────────────────────────── 输入预检 ──────────────────────────────

/**
 * 大 buffer 分配前按声明长度预检；分配后必须以实际字节再核验一次。
 * 客户端 Content-Length 与扩展名都不作为依据。
 */
export function checkDeclaredInput(declaredBytes: number | null | undefined, cap: number): void {
  if (declaredBytes == null) return;
  if (!Number.isFinite(declaredBytes) || declaredBytes < 0) {
    throw new ParseResourceError(PARSE_CODES.UNREADABLE_INPUT);
  }
  if (declaredBytes > cap) {
    throw new ParseResourceError(PARSE_CODES.BUDGET_EXCEEDED, undefined, "inputBytes");
  }
}

export function checkRealInput(buffer: Buffer, cap: number): void {
  if (!Buffer.isBuffer(buffer)) {
    throw new ParseResourceError(PARSE_CODES.UNREADABLE_INPUT);
  }
  if (buffer.length > cap) {
    throw new ParseResourceError(PARSE_CODES.BUDGET_EXCEEDED, undefined, "inputBytes");
  }
}

/** 解析专用准入身份：服务端裁决，不接受客户端指定 */
export function newParseIdentity(): { leaseId: string; claimToken: string; instanceId: string } {
  return {
    leaseId: randomUUID(),
    claimToken: randomUUID(),
    instanceId: process.env.PARSE_INSTANCE_ID || `pid-${process.pid}`,
  };
}
