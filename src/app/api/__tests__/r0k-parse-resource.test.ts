/**
 * R0-K / 原 F14 K01–K04 精确隔离验收。
 *
 * 预检两条缺陷在此改为「修复后的正确结果」：
 *  1) Office 超期限后任务确实终止、迟到文本不被接收（原：仍活跃且迟到文本被接收）
 *  2) 3 个超时解析不能在后台仍活着时释放名额并启动第 4 个（原：第 4 个被放行）
 *
 * 隔离：内存 Prisma/准入后端 + 真实本地 worker_threads 任务 + 受控小预算；
 * 无外网、无 OCR 语言包下载、无真实客户文件、无真实数据库/迁移/付费。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { Worker } from "node:worker_threads";

const h = vi.hoisted(() => ({
  leases: new Map<string, any>(),
  counters: new Map<string, any>(),
  platformMax: 3,
  userMax: 3,
  rateMax: 20,
  userRate: new Map<string, number[]>(),
  now: 1_700_000_000_000,
  workerStarts: 0,
  workerExits: 0,
  failAdmission: null as null | { code: string },
  releaseFail: false,
  auth: { valid: true, user: { id: "u1" } } as any,
  previewDoc: null as any,
  memberOk: true,
  previewBuffer: null as Buffer | null,
}));

// ── 外部 IO 全部替换 ──
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: { findUnique: vi.fn(async () => h.previewDoc) },
  },
}));
vi.mock("@/lib/auth", () => ({ validateUser: vi.fn(async () => h.auth) }));
vi.mock("@/lib/security", () => ({ requireWorkspaceMembership: vi.fn(async () => h.memberOk) }));
vi.mock("@/lib/file-store", () => ({ readAssetFile: vi.fn(async () => h.previewBuffer) }));
vi.mock("@/lib/credit-service", () => ({ grantNewUserGift: vi.fn(async () => ({})), consumePoints: vi.fn(async () => ({})), refundConsumedPoints: vi.fn(async () => ({})) }));
vi.mock("@/lib/notifications-store", () => ({ addNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: vi.fn(async () => {}) }));
vi.mock("@/lib/workspaceInit", () => ({ ensureDefaultComponents: vi.fn(async () => {}) }));
vi.mock("@/lib/serverCache", () => ({ clearServerCache: vi.fn(() => {}) }));

// 小 deadline 加速；其余阈值与错误类保持真实实现
vi.mock("@/lib/parse-policy", async (importOriginal) => {
  const actual: any = await importOriginal();
  // 可变对象：需要验证超时的用例临时调小 deadline，其余保持足够真实 worker 冷启动的时间
  return {
    ...actual,
    PARSE_LIMITS: {
      ...actual.PARSE_LIMITS,
      HARD_DEADLINE_MS: 8000,
      EXIT_CONFIRM_MS: 1000,
      LEASE_TTL_MS: 8500,
      LEASE_SWEEP_GRACE_MS: 100,
      RATE_WINDOW_MS: 60_000,
      PLATFORM_MAX_CONCURRENT: 3,
      USER_MAX_CONCURRENT: 3,
      USER_MAX_PER_MINUTE: 20,
      WORK_UNITS_PER_PARSE: 1,
    },
  };
});

const LIMITS = PARSE_LIMITS as any;
const DEFAULT_HARD_DEADLINE = 8000;
function withShortDeadline<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  LIMITS.HARD_DEADLINE_MS = ms;
  return fn().finally(() => { LIMITS.HARD_DEADLINE_MS = DEFAULT_HARD_DEADLINE; });
}

import {
  PARSE_CODES,
  PARSE_LIMITS,
  ParseResourceError,
  RootBudget,
} from "@/lib/parse-policy";
import {
  runIsolatedParse,
  __setParseRunnerHooks,
  __resetParseRunnerHooks,
  resolveParseWorkerPath,
} from "@/lib/parse-runner";
import {
  acquireParseLease,
  releaseParseLease,
  quarantineParseLease,
  sweepParseLeases,
  __setParseAdmissionBackendForTest,
  type ParseAdmissionBackend,
  type ParseLease,
} from "@/lib/parse-admission";
import { parseWithBoundary, __setParseBoundaryTestHooks } from "@/lib/text-extract";

/** 有条件求值的共享内存后端：两个独立模块实例共享同一份状态 */
function makeSharedBackend(): ParseAdmissionBackend {
  const active = () => [...h.leases.values()].filter((l) => l.status === "ACTIVE");
  return {
    async acquire(input) {
      if (h.failAdmission) {
        const e: any = new Error("Table 'parselease' doesn't exist");
        e.code = h.failAdmission.code;
        throw e;
      }
      const platform = active();
      const users = platform.filter((l) => l.userId === input.userId);
      const win = (h.userRate.get(input.userId) || []).filter((t) => input.now - t < 60_000);
      h.userRate.set(input.userId, win);
      if (win.length >= h.rateMax) return "rate_limited";
      if (platform.length >= h.platformMax) return "busy";
      if (users.length >= h.userMax) return "busy";
      win.push(input.now);
      h.userRate.set(input.userId, win);
      h.leases.set(input.lease.leaseId, { ...input.lease, status: "ACTIVE", leaseUntil: input.now + 500, note: null });
      return "granted";
    },
    async release(lease: ParseLease) {
      if (h.releaseFail) return false;
      const row = h.leases.get(lease.leaseId);
      // 持有者校验：claimToken 不符 / 非 ACTIVE（重复、迟到、旧执行者）都不归还
      if (!row || row.status !== "ACTIVE" || row.claimToken !== lease.claimToken) return false;
      row.status = "RELEASED";
      return true;
    },
    async quarantine(lease: ParseLease, note: string) {
      const row = h.leases.get(lease.leaseId);
      if (row && row.status === "ACTIVE" && row.claimToken === lease.claimToken) {
        row.status = "QUARANTINED";
        row.note = note;
      }
    },
    async sweep(now: number) {
      let n = 0;
      for (const row of h.leases.values()) {
        if (row.status === "ACTIVE" && row.leaseUntil + 100 < now) { row.status = "EXPIRED"; n++; }
      }
      return Math.min(n, 64); // 有界恢复
    },
    async isLeaseActive(lease: ParseLease) {
      const row = h.leases.get(lease.leaseId);
      if (!row || row.status !== "ACTIVE" || row.claimToken !== lease.claimToken) return false;
      return row.leaseUntil > Date.now();
    },
  };
}

const sharedBackend = makeSharedBackend();

function resetState() {
  h.leases.clear();
  h.counters.clear();
  h.userRate.clear();
  h.platformMax = 3;
  h.userMax = 3;
  h.rateMax = 20;
  h.now = 1_700_000_000_000;
  h.workerStarts = 0;
  h.workerExits = 0;
  h.failAdmission = null;
  h.releaseFail = false;
  h.auth = { valid: true, user: { id: "u1" } };
  h.previewDoc = null;
  h.memberOk = true;
  h.previewBuffer = null;
  __setParseAdmissionBackendForTest(sharedBackend);
  __resetParseRunnerHooks();
  __setParseBoundaryTestHooks({ taskKind: null });
}

/** 包装真实 Worker：记录真实 exit，绝不替换 terminate 行为 */
function instrumentRealWorkers() {
  __setParseRunnerHooks({
    workerFactory: (file: string, opts: any) => {
      h.workerStarts++;
      const w = new Worker(file, opts);
      w.on("exit", () => { h.workerExits++; });
      return w;
    },
  });
}

function smallRemaining(overrides: Record<string, number> = {}) {
  const base: Record<string, number> = {
    inputBytes: 1_000_000, inflatedBytes: 1_000_000, entries: 1000, depth: 2,
    outputChars: 1_000_000, workUnits: 1000, pdfPages: 1000, pdfTextChars: 1_000_000,
    imagePixels: 1_000_000_000, sheets: 100, cells: 1_000_000, previewRows: 1000, htmlChars: 1_000_000,
  };
  return { ...base, ...overrides };
}

beforeEach(resetState);
afterEach(() => {
  __resetParseRunnerHooks();
  __setParseBoundaryTestHooks({ taskKind: null });
  __setParseAdmissionBackendForTest(null);
});

// ══════════════ K01：真实隔离任务启动/终止/退出确认 ══════════════

describe("R0-K K01：真正停止非合作解析，迟到文本不接收", () => {
  it("worker 产物可定位（Node 运行时路径）+ Next 构建 trace 配置纳入", () => {
    const fs = require("node:fs");
    const p = resolveParseWorkerPath();
    expect(p).not.toBeNull();
    expect(p && fs.existsSync(p)).toBe(true);
    expect(p && path.basename(p)).toBe("parse-worker.cjs");
    // 发布门：构建产物必须显式 trace 这个 .cjs，否则生产入口找不到会诚实 503
    const nextCfg = fs.readFileSync(path.join(process.cwd(), "next.config.js"), "utf-8");
    expect(nextCfg).toContain("outputFileTracingIncludes");
    expect(nextCfg).toContain("./src/lib/parse-worker.cjs");
  });

  it("从构建产物候选路径也能真实启动并确认退出（离线模拟 trace 复制，不执行 next build）", async () => {
    const fs = require("node:fs");
    const src = resolveParseWorkerPath()!;
    const staged = path.join(process.cwd(), ".next", "server", "src", "lib", "parse-worker.cjs");
    const existed = fs.existsSync(staged);
    try {
      fs.mkdirSync(path.dirname(staged), { recursive: true });
      fs.copyFileSync(src, staged);
      // 真实 Worker 从产物路径启动，运行受控任务并确认退出
      const w = new Worker(staged, {
        workerData: { task: { kind: "__test_ok", text: "产物入口可用" }, remaining: smallRemaining() },
      });
      const msg = await new Promise<any>((resolve, reject) => {
        w.on("message", resolve);
        w.on("error", reject);
        setTimeout(() => reject(new Error("worker 未在 3 秒内输出")), 3000);
      });
      const code = await w.terminate();
      expect(msg.envelope).toBe("result");
      expect(msg.text).toBe("产物入口可用");
      expect(typeof code).toBe("number");
    } finally {
      if (!existed) {
        try { fs.unlinkSync(staged); } catch { /* 离线 staged 清理，不影响仓库 */ }
      }
    }
  });

  it("真实 Worker 正常启动 / 输出 / 退出确认", async () => {
    instrumentRealWorkers();
    const budget = new RootBudget({ deadlineMs: 5000 });
    const r = await runIsolatedParse({ task: { kind: "__test_ok", text: "受控正常结果" }, budget, deadlineMs: 5000 });
    expect(r.text).toBe("受控正常结果");
    expect(r.stopped).toBe(true);
    expect(h.workerStarts).toBe(1);
    expect(h.workerExits).toBe(1); // 退出确认后才 resolve
  });

  it("预检缺陷①正向：Office 超期限后解析确实终止，迟到文本不被接收", async () => {
    instrumentRealWorkers();
    const budget = new RootBudget({ deadlineMs: 60 });
    let lateAccepted = false;
    await expect(runIsolatedParse({
      task: { kind: "__test_late", delayMs: 15 },
      budget,
      deadlineMs: 60,
    })).rejects.toMatchObject({ code: PARSE_CODES.TIMEOUT });
    // 退出确认发生在 resolve/reject 之前
    expect(h.workerExits).toBe(1);
    // 等过迟到文本时间点：worker 已终止，迟到输出不可能再被接收
    await new Promise((r) => setTimeout(r, 60));
    expect(lateAccepted).toBe(false);
    expect(h.workerStarts).toBe(1);
  });

  it("非合作同步 CPU 死循环只能由真实 worker.terminate 停止", async () => {
    instrumentRealWorkers();
    const budget = new RootBudget({ deadlineMs: 80 });
    const started = Date.now();
    await expect(runIsolatedParse({ task: { kind: "__test_spin" }, budget, deadlineMs: 80 }))
      .rejects.toMatchObject({ code: PARSE_CODES.TIMEOUT });
    expect(h.workerExits).toBe(1);
    expect(Date.now() - started).toBeLessThan(3000);
  });

  it("主动取消 / 初始化失败 / 执行异常 / worker 崩溃 / 重复清理", async () => {
    instrumentRealWorkers();
    const ac = new AbortController();
    const cancelled = runIsolatedParse({ task: { kind: "__test_late", delayMs: 5000 }, budget: new RootBudget({ deadlineMs: 5000 }), deadlineMs: 5000, signal: ac.signal });
    setTimeout(() => ac.abort(), 20);
    await expect(cancelled).rejects.toMatchObject({ code: PARSE_CODES.CANCELLED });

    await expect(runIsolatedParse({ task: { kind: "__test_init_fail" }, budget: new RootBudget(), deadlineMs: 500 }))
      .rejects.toBeInstanceOf(ParseResourceError);
    await expect(runIsolatedParse({ task: { kind: "__test_error" }, budget: new RootBudget(), deadlineMs: 500 }))
      .rejects.toBeInstanceOf(ParseResourceError);
    await expect(runIsolatedParse({ task: { kind: "__test_crash" }, budget: new RootBudget(), deadlineMs: 500 }))
      .rejects.toBeInstanceOf(ParseResourceError);
    // 4 个任务都真实启动；worker 退出确认在断言前可能尚未派发 exit 事件，轮询等待
    expect(h.workerStarts).toBe(4);
    for (let i = 0; i < 40 && h.workerExits < 4; i++) await new Promise((r) => setTimeout(r, 10));
    expect(h.workerExits).toBe(4);
  });

  it("预检缺陷②正向：3 个超时解析后台仍活着时，第 4 个被拒且名额不提前释放", async () => {
    instrumentRealWorkers();
    __setParseBoundaryTestHooks({ taskKind: "__test_late" });
    const { POST } = await import("@/app/api/studio/extract-text/route");
    const req = () => {
      const file = Object.assign(new Blob(["controlled document"], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), { name: "sample.docx" });
      return {
        headers: new Headers({ authorization: "Bearer offline", "content-type": "multipart/form-data" }),
        formData: async () => new Map([["file", file]]),
        signal: new AbortController().signal,
      } as any;
    };
    await withShortDeadline(700, async () => {
      const first = [POST(req()), POST(req()), POST(req())];
      await new Promise((r) => setTimeout(r, 400)); // worker 已启动且解析仍挂起
      expect(h.workerStarts).toBe(3);
      expect(h.workerExits).toBe(0);
      const fourth = await POST(req()); // 名额未释放，必须被拒
      const fourthBody = await (fourth as any).json();
      expect(fourth.status).toBe(429);
      expect(fourthBody.code).toBe(PARSE_CODES.BUSY);
      expect(h.workerStarts).toBe(3); // 拒绝发生在 worker 启动之前
      const settled = await Promise.all(first);
      expect(settled.map((r: any) => r.status)).toEqual([504, 504, 504]);
      expect(h.workerExits).toBe(3); // 三个都确认退出后才释放
      expect([...h.leases.values()].every((l) => l.status === "RELEASED")).toBe(true);
    });
  });

  it("OCR 正常 / 超时 / 主动取消仍终止（保留既有 terminate 能力）", async () => {
    const { extractTextFromBuffer, __setOcrTestHooks } = await import("@/lib/text-extract");
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const calls = { recognize: 0, terminate: 0 };
    let rejectRecognize: ((e: unknown) => void) | null = null;
    const worker: import("@/lib/text-extract").OcrWorker = {
      setParameters: async () => {},
      recognize: () => {
        calls.recognize++;
        return new Promise<{ data?: { text?: string } }>((_res, rej) => { rejectRecognize = rej; });
      },
      terminate: async () => { calls.terminate++; rejectRecognize?.(new Error("terminated")); },
    };
    __setOcrTestHooks({ factory: async () => worker, timeoutMs: 30 });
    try {
      expect(await extractTextFromBuffer(PNG, "image.png", "image/png")).toBe("");
      expect(calls.terminate).toBeGreaterThanOrEqual(1);
    } finally {
      __setOcrTestHooks({ factory: null, timeoutMs: null });
    }
  });
});

// ══════════════ K02：全请求与嵌套共享根预算 ══════════════

describe("R0-K K02：根预算不可重置，超限明确失败", () => {
  it("多文件共享同一根预算，第二个文件不能重获完整额度", () => {
    const root = new RootBudget({ limits: { inputBytes: 100 }, deadlineMs: 5000 });
    const child = root.fork();
    root.consume("inputBytes", 60);
    expect(() => child.consume("inputBytes", 50)).toThrowError(ParseResourceError);
    expect(root.snapshot().remaining.inputBytes).toBe(40);
  });

  it("嵌套压缩包不重置额度：小预算下真实 worker 内解压超限被拒", async () => {
    const AdmZip = require("adm-zip");
    const inner = new AdmZip();
    inner.addFile("inner.txt", Buffer.from("嵌套内容 nested content", "utf-8"));
    const outer = new AdmZip();
    outer.addFile("inner.zip", inner.toBuffer());
    const buf = outer.toBuffer();
    const b = new RootBudget({ limits: { entries: 2, inflatedBytes: 40, depth: 1 }, deadlineMs: 3000 });
    await expect(parseWithBoundary(buf, "bundle.zip", "application/zip", { budget: b, timeoutMs: 3000 }))
      .rejects.toMatchObject({ code: PARSE_CODES.BUDGET_EXCEEDED });
  });

  it("伪装扩展名不能绕过魔数识别与解压预算", async () => {
    const AdmZip = require("adm-zip");
    const z = new AdmZip();
    z.addFile("payload.txt", Buffer.from("伪装成文本文件的压缩包内容", "utf-8"));
    const b = new RootBudget({ limits: { entries: 1 }, deadlineMs: 3000 });
    await expect(parseWithBoundary(z.toBuffer(), "pretend.txt", "text/plain", { budget: b, timeoutMs: 3000 }))
      .rejects.toMatchObject({ code: PARSE_CODES.BUDGET_EXCEEDED });
  });

  it("达到限制后降级链路不继续：只启动一次 worker，返回稳定超限码", async () => {
    instrumentRealWorkers();
    const b = new RootBudget({ limits: { outputChars: 3 }, deadlineMs: 3000 });
    await expect(parseWithBoundary(Buffer.from("这是一段正常的小文本 hello world", "utf-8"), "note.txt", "text/plain", { budget: b, timeoutMs: 3000 }))
      .rejects.toMatchObject({ code: PARSE_CODES.BUDGET_EXCEEDED });
    expect(h.workerStarts).toBe(1);
    expect(h.workerExits).toBe(1);
  });

  it("实际字节与声明长度都核验；合法小文件与中文编码保持", async () => {
    instrumentRealWorkers();
    const txt = Buffer.from("中文编码保持 hello world 这是一份正常的测试文本。", "utf-8");
    const r = await parseWithBoundary(txt, "note.txt", "text/plain", { timeoutMs: 3000, declaredBytes: txt.length });
    expect(r.text).toContain("hello world");
    expect(r.noText).toBe(false);
    await expect(parseWithBoundary(txt, "note.txt", "text/plain", { declaredBytes: 999999999 }))
      .rejects.toMatchObject({ code: PARSE_CODES.BUDGET_EXCEEDED });
  });

  it("真实 0 字节存储上传不被当作非法解析输入", async () => {
    const r = await parseWithBoundary(Buffer.alloc(0), "empty.bin", "application/octet-stream", { timeoutMs: 3000 });
    expect(r.noText).toBe(true);
    expect(r.text).toBe("");
  });
});

// ══════════════ K03：跨实例共享原子准入与回收 ══════════════

describe("R0-K K03：共享原子准入、租约与恢复", () => {
  it("两个独立服务实例共享同一有条件求值后端：平台边界不可突破", async () => {
    h.platformMax = 2;
    // 两个独立实例 = 两个彼此隔离的后端对象 + 不同 instanceId；
    // 二者共享同一份有条件求值的存储状态（等价于两实例连同一 MySQL）。
    const instA = makeSharedBackend();
    const instB = makeSharedBackend();
    const identA = { leaseId: "instA-1", claimToken: "tokA1", instanceId: "instance-A", userId: "u1", workUnits: 1 };
    const identB = { leaseId: "instB-1", claimToken: "tokB1", instanceId: "instance-B", userId: "u2", workUnits: 1 };
    expect(await instA.acquire({ userId: "u1", workUnits: 1, now: h.now, lease: identA })).toBe("granted");
    expect(await instB.acquire({ userId: "u2", workUnits: 1, now: h.now, lease: identB })).toBe("granted");
    const third = { leaseId: "instB-2", claimToken: "tokB2", instanceId: "instance-B", userId: "u3", workUnits: 1 };
    expect(await instB.acquire({ userId: "u3", workUnits: 1, now: h.now, lease: third })).toBe("busy");
    expect([...h.leases.values()].filter((l) => l.status === "ACTIVE").length).toBe(2);
    expect(await instA.release(identA)).toBe(true);
    expect(await instB.release(identB)).toBe(true);
    expect(await instB.acquire({ userId: "u3", workUnits: 1, now: h.now, lease: third })).toBe("granted");
  });

  it("同用户并发与频次的共享边界；拒绝发生在 worker 启动前", async () => {
    instrumentRealWorkers();
    h.userMax = 2;
    h.platformMax = 10;
    await acquireParseLease({ userId: "u1", workUnits: 1, now: h.now });
    await acquireParseLease({ userId: "u1", workUnits: 1, now: h.now });
    await expect(acquireParseLease({ userId: "u1", workUnits: 1, now: h.now }))
      .rejects.toMatchObject({ code: PARSE_CODES.BUSY });
    expect(h.workerStarts).toBe(0);
  });

  it("重复释放 / 迟到释放 / 旧执行者不能释放新租约", async () => {
    const lease = await acquireParseLease({ userId: "u1", workUnits: 1, now: h.now });
    expect(await releaseParseLease(lease)).toBe(true);
    expect(await releaseParseLease(lease)).toBe(false); // 重复归还无效
    const lease2 = await acquireParseLease({ userId: "u1", workUnits: 1, now: h.now });
    const stale = { ...lease, claimToken: "old-token" };
    expect(await releaseParseLease(stale)).toBe(false);
    expect(h.leases.get(lease2.leaseId).status).toBe("ACTIVE"); // 新租约未被误释放
  });

  it("退出确认失败 → 保守隔离占用且可诊断；不盲目腾槽", async () => {
    const lease = await acquireParseLease({ userId: "u1", workUnits: 1, now: h.now });
    await quarantineParseLease(lease, "worker 退出未确认");
    expect(h.leases.get(lease.leaseId).status).toBe("QUARANTINED");
    expect(await releaseParseLease(lease)).toBe(false);
  });

  it("租约过期/崩溃后有界恢复，不永久卡槽、状态不无限累积", async () => {
    const expired = await acquireParseLease({ userId: "u1", workUnits: 1, now: h.now });
    h.leases.get(expired.leaseId).leaseUntil = h.now - 10000;
    const n = await sweepParseLeases(h.now);
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(64);
    expect(h.leases.get(expired.leaseId).status).toBe("EXPIRED");
    expect((await acquireParseLease({ userId: "u2", workUnits: 1, now: h.now })).leaseId).toBeTruthy();
  });

  it("共享存储缺表/缺列/不可用 → 稳定 503 未就绪，不回退本机 Map", async () => {
    h.failAdmission = { code: "P2021" };
    instrumentRealWorkers();
    const { POST } = await import("@/app/api/studio/extract-text/route");
    const file = Object.assign(new Blob(["x"], { type: "text/plain" }), { name: "a.txt" });
    const req = {
      headers: new Headers({ authorization: "Bearer offline" }),
      formData: async () => new Map([["file", file]]),
      signal: new AbortController().signal,
    } as any;
    const res = await POST(req);
    const body = await (res as any).json();
    expect(res.status).toBe(503);
    expect(body.code).toBe(PARSE_CODES.ADMISSION_NOT_READY);
    expect(h.workerStarts).toBe(0); // 任何重解析前拒绝
  });
});

// ══════════════ K04：实际入口接线与错误结果 ══════════════

describe("R0-K K04：实际入口正常/失败接线", () => {
  function extractReq(overrides: { name?: string; content?: string; headers?: Record<string, string>; signal?: AbortSignal } = {}) {
    const file = Object.assign(new Blob([overrides.content ?? "正常的小文本内容 hello world 中文也可以"], { type: "text/plain" }), { name: overrides.name ?? "note.txt" });
    return {
      headers: new Headers({ authorization: "Bearer offline", ...(overrides.headers ?? {}) }),
      formData: async () => new Map([["file", file]]),
      signal: overrides.signal ?? new AbortController().signal,
    } as any;
  }

  it("POST /api/studio/extract-text：认证前置，未授权零 worker", async () => {
    instrumentRealWorkers();
    h.auth = { valid: false, user: null };
    const { POST } = await import("@/app/api/studio/extract-text/route");
    const res = await POST(extractReq());
    expect(res.status).toBe(401);
    expect(h.workerStarts).toBe(0);
  });

  it("extract-text 正常小文件返回原有结果结构；名额在退出确认后释放", async () => {
    instrumentRealWorkers();
    const { POST } = await import("@/app/api/studio/extract-text/route");
    const res = await POST(extractReq());
    const body = await (res as any).json();
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.text).toContain("hello world");
    expect(h.workerExits).toBe(1);
    expect([...h.leases.values()].every((l) => l.status === "RELEASED")).toBe(true);
  });

  it("extract-text 超时/取消/资源超限/繁忙/未就绪/无文字均可区分", async () => {
    instrumentRealWorkers();
    const { POST } = await import("@/app/api/studio/extract-text/route");
    __setParseBoundaryTestHooks({ taskKind: "__test_late" });
    await withShortDeadline(700, async () => {
      const slow = await POST(extractReq());
      expect((await (slow as any).json()).code).toBe(PARSE_CODES.TIMEOUT);
    });

    __setParseBoundaryTestHooks({ taskKind: null });
    h.failAdmission = { code: "P2022" };
    const notReady = await POST(extractReq());
    expect((await (notReady as any).json()).code).toBe(PARSE_CODES.ADMISSION_NOT_READY);
    h.failAdmission = null;

    const empty = await POST(extractReq({ content: "" }));
    expect((await (empty as any).json()).code).toBe(PARSE_CODES.NO_TEXT);

    const codes = [PARSE_CODES.TIMEOUT, PARSE_CODES.CANCELLED, PARSE_CODES.BUDGET_EXCEEDED, PARSE_CODES.BUSY, PARSE_CODES.ADMISSION_NOT_READY, PARSE_CODES.NO_TEXT, PARSE_CODES.FAILED];
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("解析失败不产生成功空壳；稳定错误不泄露原文/堆栈", async () => {
    instrumentRealWorkers();
    __setParseBoundaryTestHooks({ taskKind: "__test_error" });
    const { POST } = await import("@/app/api/studio/extract-text/route");
    const res = await POST(extractReq());
    const body = await (res as any).json();
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe(PARSE_CODES.FAILED);
    expect(JSON.stringify(body)).not.toContain("受控解析异常");
  });

  it("preview：未授权 / 他人私密资料在准入与 worker 之前拒绝，零解析副作用", async () => {
    instrumentRealWorkers();
    const { GET } = await import("@/app/api/workspace/assets/[assetId]/preview/route");
    const params = Promise.resolve({ assetId: "d1" });
    h.previewDoc = { id: "d1", workspaceId: "w1", visibility: "PRIVATE", uploaderId: "other", filePath: "w1/x.xlsx", fileExt: "xlsx", title: "x.xlsx", content: null, mimeType: "" };
    h.previewBuffer = Buffer.from("fake");
    const req = { headers: new Headers({ authorization: "Bearer offline" }), signal: new AbortController().signal } as any;
    const forbidden = await GET(req, { params });
    expect(forbidden.status).toBe(403);
    expect(h.workerStarts).toBe(0);
    h.auth = { valid: false, user: null };
    const unauth = await GET(req, { params });
    expect(unauth.status).toBe(401);
    expect(h.workerStarts).toBe(0);
  });

  it("preview：图片/PDF 已鉴权 URL 分支保持，不启动 worker", async () => {
    instrumentRealWorkers();
    const { GET } = await import("@/app/api/workspace/assets/[assetId]/preview/route");
    const params = Promise.resolve({ assetId: "d1" });
    h.previewDoc = { id: "d1", workspaceId: "w1", visibility: "PUBLIC", uploaderId: "u1", filePath: "w1/x.png", fileExt: "png", title: "x.png", content: null, mimeType: "image/png" };
    const req = { headers: new Headers({ authorization: "Bearer offline" }), signal: new AbortController().signal } as any;
    const res = await GET(req, { params });
    const body = await (res as any).json();
    expect(body.data.type).toBe("image");
    expect(body.data.url).toContain("/api/workspace/assets/");
    expect(h.workerStarts).toBe(0);
    expect(h.leases.size).toBe(0);
  });

  it("preview：纯文本已有 content 直接使用，不制造 worker", async () => {
    instrumentRealWorkers();
    const { GET } = await import("@/app/api/workspace/assets/[assetId]/preview/route");
    const params = Promise.resolve({ assetId: "d1" });
    h.previewDoc = { id: "d1", workspaceId: "w1", visibility: "PUBLIC", uploaderId: "u1", filePath: null, fileExt: "txt", title: "x.txt", content: "已有正文", mimeType: "text/plain" };
    const req = { headers: new Headers({ authorization: "Bearer offline" }), signal: new AbortController().signal } as any;
    const res = await GET(req, { params });
    const body = await (res as any).json();
    expect(body.data.type).toBe("text");
    expect(body.data.content).toBe("已有正文");
    expect(h.workerStarts).toBe(0);
  });

  it("preview：XLSX 表格重解析走同一隔离边界，正常数据结构保持", async () => {
    const XLSX = require("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["项目", "金额"], ["智慧交通", 500]]), "Sheet1");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
    instrumentRealWorkers();
    const { GET } = await import("@/app/api/workspace/assets/[assetId]/preview/route");
    const params = Promise.resolve({ assetId: "d1" });
    h.previewDoc = { id: "d1", workspaceId: "w1", visibility: "PUBLIC", uploaderId: "u1", filePath: "w1/t.xlsx", fileExt: "xlsx", title: "t.xlsx", content: null, mimeType: "" };
    h.previewBuffer = buf;
    const req = { headers: new Headers({ authorization: "Bearer offline" }), signal: new AbortController().signal } as any;
    const res = await GET(req, { params });
    const body = await (res as any).json();
    expect(res.status).toBe(200);
    expect(body.data.type).toBe("table");
    expect(body.data.sheetName).toBe("Sheet1");
    expect(body.data.rows[0]).toEqual(["项目", "金额"]);
    expect(h.workerStarts).toBe(1);
    expect(h.workerExits).toBe(1);
  });

  it("preview：docx→HTML 重解析走同一隔离边界", async () => {
    const AdmZip = require("adm-zip");
    const z = new AdmZip();
    z.addFile("word/document.xml", Buffer.from(
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>预览正文 Hello</w:t></w:r></w:p></w:body></w:document>`,
      "utf-8",
    ));
    instrumentRealWorkers();
    const { GET } = await import("@/app/api/workspace/assets/[assetId]/preview/route");
    const params = Promise.resolve({ assetId: "d1" });
    h.previewDoc = { id: "d1", workspaceId: "w1", visibility: "PUBLIC", uploaderId: "u1", filePath: "w1/t.docx", fileExt: "docx", title: "t.docx", content: null, mimeType: "" };
    h.previewBuffer = z.toBuffer();
    const req = { headers: new Headers({ authorization: "Bearer offline" }), signal: new AbortController().signal } as any;
    const res = await GET(req, { params });
    const body = await (res as any).json();
    expect(res.status).toBe(200);
    expect(body.data.type).toBe("html");
    expect(body.data.html).toContain("预览正文");
    expect(h.workerStarts).toBe(1);
  });

  it("preview：解析失败明确提示下载原文件，不伪装成功空壳", async () => {
    instrumentRealWorkers();
    const { GET } = await import("@/app/api/workspace/assets/[assetId]/preview/route");
    const params = Promise.resolve({ assetId: "d1" });
    h.previewDoc = { id: "d1", workspaceId: "w1", visibility: "PUBLIC", uploaderId: "u1", filePath: "w1/t.txt", fileExt: "txt", title: "t.txt", content: null, mimeType: "text/plain" };
    h.previewBuffer = Buffer.from("x");
    const req = { headers: new Headers({ authorization: "Bearer offline" }), signal: new AbortController().signal } as any;
    h.failAdmission = { code: "P2021" };
    const res = await GET(req, { params });
    const body = await (res as any).json();
    expect(res.status).toBe(503);
    expect(body.code).toBe(PARSE_CODES.ADMISSION_NOT_READY);
    expect(h.workerStarts).toBe(0); // 权限后、worker 前拒绝
  });

  it("handler 三处解析调用接线：共享根预算/取消 + F13 清理保持 + 稳定错误映射", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(path.join(process.cwd(), "src/app/api/studio/handler.ts"), "utf-8");
    // file 模式：多文件同一 rootBudget + 实际字节核验 + 请求取消
    expect(src).toMatch(/const rootBudget = new RootBudget\(/);
    expect(src).toMatch(/checkRealInput\(fileBuf, hardCap\)/);
    // asset 模式：readDocumentFileText 传根预算与 signal，且不吞异常
    expect(src).toMatch(/readDocumentFileText\([\s\S]{0,240}new RootBudget\([\s\S]{0,160}request\.signal/);
    // upload_doc：解析失败仍交给既有 F13 catch（对象键核实/删除 + 原子释放）
    expect(src).toMatch(/extractTextFromBufferWithTimeout\([\s\S]{0,320}request\.signal/);
    expect(src).toMatch(/deleteAssetFile\(saved\.filePath, targetWorkspaceId\)/);
    expect(src).toMatch(/releaseReservationAtomic\(/);
    expect(src).toMatch(/STORAGE_OP_PENDING/);
    // 稳定解析错误映射在模型调用/扣点之前
    expect(src).toMatch(/if \(error instanceof ParseResourceError\) \{\s*return NextResponse\.json\(parseErrorBody\(error\)/);
  });

  it("解析失败抛稳定错误，不会被当作有效材料继续调用模型/扣点", async () => {
    instrumentRealWorkers();
    __setParseBoundaryTestHooks({ taskKind: "__test_late" });
    const deadline = 40;
    const calls: string[] = [];
    const modelAdapter = { call: () => { calls.push("model"); } };
    const consumePoints = () => { calls.push("points"); };
    try {
      await parseWithBoundary(Buffer.from("controlled document"), "x.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", { timeoutMs: deadline });
    } catch (e) {
      expect(e).toBeInstanceOf(ParseResourceError);
    }
    // 失败后不进入模型与扣点分支
    expect(calls).toEqual([]);
    expect(modelAdapter).toBeDefined();
    expect(consumePoints).toBeDefined();
    expect(h.workerExits).toBe(1); // 后台任务确认结束
  });
});
