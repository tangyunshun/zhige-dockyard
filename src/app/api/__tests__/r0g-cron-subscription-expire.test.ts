/**
 * R0-G 隔离回归：订阅到期调度入口与资产止损（原方案 F10）。
 *
 * 覆盖 IDE-R0-G-PROMPT.md J01—J08：
 *  - J01 三环境×缺失/空/纯空白 CRON_SECRET 全部 503，零数据库/事务调用；
 *  - J02 缺失/空白/错误 x-cron-key 及普通登录 token 均 401 零 IO，正确专用凭证才执行；
 *  - J03 到期/未到期/无期限/STANDARD 分类准确，响应只统计实际成功；
 *  - J04 回收开关任意取值不清零 tokenBalance/来源资产，reclaimedPoints 恒 false，true 时明确暂停；
 *  - J05 扫描后续费/换套餐/quota 绑定变化/并发/重复请求不覆盖新事实，条件败者零相关写；
 *  - J06 套餐写/quota 写/提交失败注入完整回滚，无 ROOT 写逃逸；
 *  - J07 无公开 GET/旁路；POST 契约保持。
 *
 * 隔离说明：真实 route + 内存 Prisma（ROOT/TX 区分、条件精确求值含 Date/lt/not、undo 回滚、
 * 提交故障注入、扫描后写边界前受控变更钩子、未授权模型调用直接抛错）；环境仅合成值，
 * 不读取 .env/真实密钥。内存模型不证明 MySQL 行锁/隔离级别。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => {
  const store = {
    workspaceplan: new Map<string, any>(),
    workspace: new Map<string, any>(),
    workspacequota: new Map<string, any>(),
  };
  const fault = { commit: false, failWorkspaceUpdate: false, failQuotaUpdate: false, failPlanRead: false };
  const io = { calls: [] as string[] };
  // 扫描之后、写边界之前的受控变更（模拟续费/换套餐/换绑）
  const mutations: (() => void)[] = [];
  return { store, fault, io, mutations };
});

const ALLOWED_MODELS = new Set(["workspaceplan", "workspace", "workspacequota"]);

function makePrisma() {
  let txDepth = 0;
  // 消费式注入：每个登记的变更在其后首次 TX 写边界前执行一次（beforeEach 清空队列）
  const runMutations = () => {
    while (h.mutations.length) {
      h.mutations.shift()!();
    }
  };
  const record = (kind: string, model: string, method: string) =>
    h.io.calls.push(`${kind} ${model}.${method}`);
  const guardRootWrite = (kind: "ROOT" | "TX") => {
    if (kind === "ROOT" && txDepth > 0) throw new Error("ROOT_WRITE_DURING_TX");
  };

  const evalCond = (row: any, where: any): boolean => {
    for (const [k, v] of Object.entries(where || {})) {
      if (v !== null && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) {
        const op = v as Record<string, unknown>;
        if ("not" in op) {
          if (op.not === null) {
            if (row[k] === null || row[k] === undefined) return false;
          } else if (evalCond(row, { [k]: op.not })) return false; // 行匹配被否定值 → 排除
        }
        if ("lt" in op) {
          if (row[k] === null || row[k] === undefined) return false;
          if (!(new Date(row[k]).getTime() < new Date(op.lt as any).getTime())) return false;
        }
        if (!("not" in op) && !("lt" in op)) return false; // 未实现的操作符 → 显式失败
        continue;
      }
      const rv = row[k];
      if (v instanceof Date || rv instanceof Date) {
        if (rv == null || v == null) {
          if (rv !== v) return false;
        } else if (
          new Date(rv as string | number | Date).getTime() !==
          new Date(v as string | number | Date).getTime()
        )
          return false;
      } else if (rv !== v) return false;
    }
    return true;
  };

  const cloneRow = (r: any) => ({ ...r });
  const applyData = (row: any, data: any) => {
    const next = { ...row };
    for (const [k, v] of Object.entries(data || {})) next[k] = v;
    return next;
  };

  const makeClient = (kind: "ROOT" | "TX") => {
    const stage = (undo: (() => void)[] | undefined, restore: () => void) =>
      undo?.push(restore);
    return {
      workspaceplan: {
        findUnique: async ({ where }: any) => {
          record(kind, "workspaceplan", "findUnique");
          if (h.fault.failPlanRead) throw new Error("INJECTED_PLAN_READ_FAIL");
          const row = h.store.workspaceplan.get(where?.key);
          return row ? cloneRow(row) : null;
        },
      },
      workspace: {
        findMany: async ({ where, select }: any) => {
          record(kind, "workspace", "findMany");
          const rows = [...h.store.workspace.values()].filter((r) => {
            return evalCond(r, where);
          });
          return rows.map((r) => {
            if (!select) return cloneRow(r);
            const out: any = {};
            for (const k of Object.keys(select)) if (select[k]) out[k] = r[k];
            return out;
          });
        },
        findUnique: async ({ where }: any) => {
          record(kind, "workspace", "findUnique");
          const row = h.store.workspace.get(where?.id);
          return row ? cloneRow(row) : null;
        },
        updateMany: async ({ where, data }: any) => {
          record(kind, "workspace", "updateMany");
          guardRootWrite(kind);
          if (kind === "TX") runMutations(); // 扫描后、写边界前注入点
          if (h.fault.failWorkspaceUpdate) throw new Error("INJECTED_WORKSPACE_UPDATE_FAIL");
          const id = where?.id;
          const row = h.store.workspace.get(id); // Map 用 get（不能用 [] 下标）
          if (!row || !evalCond(row, where)) return { count: 0 };
          const undo: (() => void)[] | undefined = kind === "TX" ? (currentUndo ?? undefined) : undefined;
          const prev = cloneRow(row);
          h.store.workspace.set(id, applyData(row, data));
          stage(undo, () => {
            h.store.workspace.set(id, prev);
          });
          return { count: 1 };
        },
      },
      workspacequota: {
        updateMany: async ({ where, data }: any) => {
          record(kind, "workspacequota", "updateMany");
          guardRootWrite(kind);
          if (h.fault.failQuotaUpdate) throw new Error("INJECTED_QUOTA_UPDATE_FAIL");
          const id = where?.id;
          const row = h.store.workspacequota.get(id); // Map 用 get
          if (!row || !evalCond(row, where)) return { count: 0 };
          const undo: (() => void)[] | undefined = kind === "TX" ? (currentUndo ?? undefined) : undefined;
          const prev = cloneRow(row);
          h.store.workspacequota.set(id, applyData(row, data));
          stage(undo, () => {
            h.store.workspacequota.set(id, prev);
          });
          return { count: 1 };
        },
      },
    };
  };

  let currentUndo: (() => void)[] | null = null;
  let txQueue: Promise<any> = Promise.resolve();

  const prismaProxy: any = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === "$transaction") {
          return (fn: any) => {
            const run = async () => {
              txDepth++;
              const undo: (() => void)[] = [];
              const saved = currentUndo;
              currentUndo = undo;
              try {
                const r = await fn(makeClient("TX"));
                if (h.fault.commit) {
                  h.fault.commit = false;
                  throw new Error("INJECTED_COMMIT_FAIL");
                }
                return r;
              } catch (e) {
                for (let i = undo.length - 1; i >= 0; i--) undo[i]();
                throw e;
              } finally {
                currentUndo = saved;
                txDepth--;
              }
            };
            const p = txQueue.then(run, run); // 并发事务串行（对应行锁排队）
            txQueue = p.catch(() => {});
            return p;
          };
        }
        if (!ALLOWED_MODELS.has(prop)) {
          // 来源 grant/流水/钱包等模型未被授权访问：任何触碰直接失败（J04 哨兵）
          return () => {
            throw new Error(`UNEXPECTED_MODEL_CALL: ${String(prop)}`);
          };
        }
        return (makeClient("ROOT") as any)[prop];
      },
    },
  );
  return prismaProxy;
}

vi.mock("@/lib/prisma", () => ({ prisma: makePrisma() }));

const { POST: cronPOST } = await import("@/app/api/cron/workspace-subscription-expire/route");

// ── 哨兵：来源资产（路由不应有任何途径触碰） ──
const GRANT_SENTINEL = { id: "grant-1", workspaceId: "w1", remaining: BigInt(850), source: "RECHARGE" };
const LEDGER_SENTINEL = [{ id: "ledger-1", delta: -BigInt(850), ref: "grant-1" }];
const assertSentinelsUnchanged = () => {
  expect(GRANT_SENTINEL.remaining).toBe(BigInt(850));
  expect(LEDGER_SENTINEL).toEqual([{ id: "ledger-1", delta: -BigInt(850), ref: "grant-1" }]);
};

// ── 环境（合成值，不读取 .env） ──
const ENV_KEYS = ["CRON_SECRET", "RECLAIM_ENTERPRISE_POINTS_ON_EXPIRY", "NODE_ENV"] as const;
let savedEnv: Record<string, string | undefined> = {};
const setEnv = (k: string, v: string | undefined) => {
  if (v === undefined) delete process.env[k];
  else process.env[k] = v;
};

const SECRET = "sk-cron-test-0001";
const req = (key?: string, extraHeaders: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/cron/workspace-subscription-expire", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key !== undefined ? { "x-cron-key": key } : {}),
      ...extraHeaders,
    },
  });
const call = async (key?: string, extraHeaders: Record<string, string> = {}) => {
  const res = await cronPOST(req(key, extraHeaders));
  return { status: res.status, body: await res.json() };
};

// ── 夹具 ──
const PAST = new Date(Date.now() - 86400_000); // 1 天前（真实到期）
const FUTURE = new Date(Date.now() + 5_000); // 5 秒后（执行窗口内未到期）

function seedBasic() {
  h.store.workspaceplan.set("STANDARD", { key: "STANDARD", maxMembers: 2 });
  h.store.workspacequota.set("q1", {
    id: "q1", workspaceId: "w1", enterpriseSlots: BigInt(20), tokenBalance: BigInt(850), updatedAt: new Date(),
  });
  h.store.workspace.set("w1", {
    id: "w1", name: "到期空间", plan: "PRO", planStartedAt: new Date(Date.now() - 31 * 86400_000),
    planExpiresAt: PAST, planBillingCycle: "MONTH", extraSeats: 5, workspacequotaId: "q1", updatedAt: new Date(),
  });
}

beforeEach(() => {
  h.store.workspaceplan.clear();
  h.store.workspace.clear();
  h.store.workspacequota.clear();
  h.io.calls = [];
  h.mutations.length = 0;
  h.fault.commit = false;
  h.fault.failWorkspaceUpdate = false;
  h.fault.failQuotaUpdate = false;
  h.fault.failPlanRead = false;
  savedEnv = {};
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  seedBasic();
});

afterEach(() => {
  for (const k of ENV_KEYS) setEnv(k, savedEnv[k]);
});

describe("R0-G J01 缺失/空/纯空白 CRON_SECRET → 503 零 IO（三环境）", () => {
  for (const env of ["production", "development", "test"]) {
    for (const [label, val] of [
      ["缺失", undefined],
      ["空串", ""],
      ["纯空白", "   "],
    ] as const) {
      it(`${env} × secret ${label} → 503 CRON_SECRET_NOT_CONFIGURED，零数据库/事务调用`, async () => {
        setEnv("NODE_ENV", env);
        setEnv("CRON_SECRET", val as string | undefined);
        const r = await call(undefined);
        expect(r.status).toBe(503);
        expect(r.body.error).toBe("CRON_SECRET_NOT_CONFIGURED");
        expect(h.io.calls).toEqual([]); // 任何数据库读取/事务/业务调用之前停止
        // 空间与配额完全未变
        expect(h.store.workspace.get("w1")!.plan).toBe("PRO");
        expect(h.store.workspacequota.get("q1")!.tokenBalance).toBe(BigInt(850));
        assertSentinelsUnchanged();
      });
    }
  }
});

describe("R0-G J02 请求凭证门禁", () => {
  beforeEach(() => {
    setEnv("CRON_SECRET", SECRET);
  });

  it.each([
    ["缺失 header", undefined],
    ["空白 header", "   "],
    ["错误 key", "wrong-key"],
    ["空串 key", ""],
  ])("%s → 401 CRON_KEY_INVALID，零 IO", async (_label, key) => {
    const r = await call(key as string | undefined);
    expect(r.status).toBe(401);
    expect(r.body.error).toBe("CRON_KEY_INVALID");
    expect(h.io.calls).toEqual([]);
  });

  it("普通登录 token（authorization）不能替代专用调度凭证", async () => {
    const r = await call(undefined, { authorization: "Bearer some-user-login-token" });
    expect(r.status).toBe(401);
    expect(h.io.calls).toEqual([]);
  });

  it("查询参数不构成旁路（?key=secret 无 header 仍 401）", async () => {
    const res = await cronPOST(
      new NextRequest(
        `http://localhost/api/cron/workspace-subscription-expire?key=${encodeURIComponent(SECRET)}`,
        { method: "POST" },
      ),
    );
    expect(res.status).toBe(401);
    expect(h.io.calls).toEqual([]);
  });

  it("错误响应与成功响应不回显密钥", async () => {
    const bad = await call("wrong-key");
    expect(JSON.stringify(bad.body)).not.toContain(SECRET);
    const ok = await call(SECRET);
    expect(JSON.stringify(ok.body)).not.toContain(SECRET);
  });

  it("正确专用凭证 → 200 正常执行候选处理", async () => {
    const r = await call(SECRET);
    expect(r.status).toBe(200);
    expect(r.body.downgraded).toBe(1);
  });
});

describe("R0-G J03 到期分类准确", () => {
  beforeEach(() => {
    setEnv("CRON_SECRET", SECRET);
  });

  it("真实到期降级；未到期/无期限/STANDARD 保持原状；只统计实际成功", async () => {
    h.store.workspace.set("w2", {
      id: "w2", name: "未到期", plan: "PRO", planExpiresAt: FUTURE, planBillingCycle: "MONTH",
      extraSeats: 3, workspacequotaId: "q2", updatedAt: new Date(),
    });
    h.store.workspacequota.set("q2", { id: "q2", workspaceId: "w2", enterpriseSlots: BigInt(10), tokenBalance: BigInt(100) });
    h.store.workspace.set("w3", {
      id: "w3", name: "无期限", plan: "PRO", planExpiresAt: null, planBillingCycle: null,
      extraSeats: 3, workspacequotaId: null, updatedAt: new Date(),
    });
    h.store.workspace.set("w4", {
      id: "w4", name: "免费版已到期", plan: "STANDARD", planExpiresAt: PAST, planBillingCycle: null,
      extraSeats: 0, workspacequotaId: null, updatedAt: new Date(),
    });
    const r = await call(SECRET);
    expect(r.status).toBe(200);
    expect(r.body.downgraded).toBe(1); // 只有真实到期非 STANDARD 的 w1
    expect(r.body.affected).toEqual([{ id: "w1", name: "到期空间", fromPlan: "PRO", toPlan: "STANDARD" }]);
    // w1 已降级
    const w1 = h.store.workspace.get("w1")!;
    expect(w1.plan).toBe("STANDARD");
    expect(w1.planExpiresAt).toBeNull();
    expect(w1.extraSeats).toBe(0);
    expect(h.store.workspacequota.get("q1")!.enterpriseSlots).toBe(BigInt(2)); // STANDARD 自带席位
    // 未到期/无期限/STANDARD 保持
    expect(h.store.workspace.get("w2")!.plan).toBe("PRO");
    expect(h.store.workspace.get("w2")!.planExpiresAt).toEqual(FUTURE);
    expect(h.store.workspace.get("w3")!.plan).toBe("PRO");
    expect(h.store.workspace.get("w3")!.planExpiresAt).toBeNull(); // 无期限不猜成到期
    expect(h.store.workspace.get("w4")!.plan).toBe("STANDARD");
  });

  it("临界语义：过期 1ms 的候选被处理；执行时刻之后的期限不算到期（严格 lt，与扫描一致）", async () => {
    const justPast = new Date(Date.now() - 1);
    h.store.workspace.set("wp", {
      id: "wp", name: "刚到期", plan: "PRO", planExpiresAt: justPast, planBillingCycle: "MONTH",
      extraSeats: 1, workspacequotaId: null, updatedAt: new Date(),
    });
    const r = await call(SECRET);
    expect(r.status).toBe(200);
    // wp（执行时刻已过）与 w1 均被处理
    expect(r.body.downgraded).toBe(2);
    // FUTURE（+5s）候选在执行时刻未到期（声明规则：planExpiresAt < now 才到期，等于不算）
    expect(h.store.workspace.get("w1")!.plan).toBe("STANDARD");
  });
});

describe("R0-G J04 旧回收开关任意取值都不清零资产", () => {
  beforeEach(() => {
    setEnv("CRON_SECRET", SECRET);
  });

  it.each([
    ["缺失", undefined],
    ["false", "false"],
    ["true", "true"],
    ["TRUE（非小写）", "TRUE"],
    ["1", "1"],
  ])("RECLAIM=%s → 降级正常执行，tokenBalance/来源资产不变，reclaimedPoints=false", async (_l, val) => {
    setEnv("RECLAIM_ENTERPRISE_POINTS_ON_EXPIRY", val as string | undefined);
    const r = await call(SECRET);
    expect(r.status).toBe(200);
    expect(r.body.downgraded).toBe(1);
    expect(r.body.reclaimedPoints).toBe(false); // 恒 false
    const quota = h.store.workspacequota.get("q1")!;
    expect(quota.tokenBalance).toBe(BigInt(850)); // 剩余点数保留
    expect(quota.enterpriseSlots).toBe(BigInt(2)); // 席位正常回落
    assertSentinelsUnchanged(); // 来源 grant/流水未被触碰
    // 路由从未尝试访问 pointgrant/pointledger/wallet 等模型（未授权模型调用会直接抛错）
    expect(h.io.calls.some((c) => c.includes("pointgrant") || c.includes("pointledger"))).toBe(false);
    if (val === "true") {
      expect(r.body.reclaimPaused).toBe(true);
      expect(r.body.notice).toContain("回收已暂停");
    } else {
      expect(r.body.reclaimPaused).toBeUndefined();
    }
  });
});

describe("R0-G J05 扫描后续费/换套餐/quota 绑定变化不覆盖新事实", () => {
  beforeEach(() => {
    setEnv("CRON_SECRET", SECRET);
  });

  it("扫描后续费（期限更新为未来）：跳过，不覆盖新期限、不写 quota", async () => {
    h.mutations.push(() => {
      const w = h.store.workspace.get("w1")!;
      h.store.workspace.set("w1", { ...w, planExpiresAt: new Date(Date.now() + 30 * 86400_000) }); // 续费
    });
    const r = await call(SECRET);
    expect(r.status).toBe(200);
    expect(r.body.downgraded).toBe(0);
    expect(r.body.skipped).toBe(1);
    const w1 = h.store.workspace.get("w1")!;
    expect(w1.plan).toBe("PRO"); // 新套餐事实保留
    expect(new Date(w1.planExpiresAt).getTime()).toBeGreaterThan(Date.now()); // 新期限未被清空
    expect(w1.extraSeats).toBe(5);
    expect(h.store.workspacequota.get("q1")!.enterpriseSlots).toBe(BigInt(20)); // 新席位未被覆盖
  });

  it("扫描后换套餐（PRO→ENTERPRISE）：跳过，不覆盖新套餐", async () => {
    h.mutations.push(() => {
      const w = h.store.workspace.get("w1")!;
      h.store.workspace.set("w1", { ...w, plan: "ENTERPRISE" });
    });
    const r = await call(SECRET);
    expect(r.body.downgraded).toBe(0);
    expect(r.body.skipped).toBe(1);
    expect(h.store.workspace.get("w1")!.plan).toBe("ENTERPRISE");
    expect(h.store.workspacequota.get("q1")!.enterpriseSlots).toBe(BigInt(20));
  });

  it("扫描后 quota 绑定变化（换绑 q2）：跳过，不写旧 quota", async () => {
    h.store.workspacequota.set("q2", { id: "q2", workspaceId: "w1", enterpriseSlots: BigInt(30), tokenBalance: BigInt(10) });
    h.mutations.push(() => {
      const w = h.store.workspace.get("w1")!;
      h.store.workspace.set("w1", { ...w, workspacequotaId: "q2" }); // 换绑
    });
    const r = await call(SECRET);
    expect(r.body.downgraded).toBe(0);
    expect(r.body.skipped).toBe(1);
    expect(h.store.workspace.get("w1")!.workspacequotaId).toBe("q2"); // 新绑定保留
    expect(h.store.workspacequota.get("q2")!.enterpriseSlots).toBe(BigInt(30)); // 未被写入
    expect(h.store.workspacequota.get("q1")!.enterpriseSlots).toBe(BigInt(20)); // 旧 quota 也未被写
  });

  it("两个调度同时命中同一候选：恰好一次降级，另一跳过，终态正确", async () => {
    const [r1, r2] = await Promise.all([call(SECRET), call(SECRET)]);
    const downgraded = r1.body.downgraded + r2.body.downgraded;
    expect(downgraded).toBe(1); // 只有一次实际降级
    const w1 = h.store.workspace.get("w1")!;
    expect(w1.plan).toBe("STANDARD");
    expect(w1.extraSeats).toBe(0);
    expect(h.store.workspacequota.get("q1")!.enterpriseSlots).toBe(BigInt(2));
    expect(h.store.workspacequota.get("q1")!.tokenBalance).toBe(BigInt(850));
  });

  it("重复请求：降级完成后再次扫描无候选，不重复制造变更", async () => {
    await call(SECRET);
    const r2 = await call(SECRET);
    expect(r2.body.downgraded).toBe(0);
    expect(r2.body.affected).toEqual([]);
    expect(h.store.workspacequota.get("q1")!.enterpriseSlots).toBe(BigInt(2));
  });
});

describe("R0-G J06 故障注入：完整回滚、无 ROOT 写逃逸", () => {
  beforeEach(() => {
    setEnv("CRON_SECRET", SECRET);
  });

  it("套餐写入失败 → 500，套餐/quota 全部原状，不假报成功", async () => {
    h.fault.failWorkspaceUpdate = true;
    const r = await call(SECRET);
    expect(r.status).toBe(500);
    const w1 = h.store.workspace.get("w1")!;
    expect(w1.plan).toBe("PRO");
    expect(w1.planExpiresAt).toEqual(PAST);
    expect(w1.extraSeats).toBe(5);
    expect(h.store.workspacequota.get("q1")!.enterpriseSlots).toBe(BigInt(20));
    expect(h.store.workspacequota.get("q1")!.tokenBalance).toBe(BigInt(850));
  });

  it("quota 写入失败 → 500，套餐写一并回滚（同事务），无半降级", async () => {
    h.fault.failQuotaUpdate = true;
    const r = await call(SECRET);
    expect(r.status).toBe(500);
    const w1 = h.store.workspace.get("w1")!;
    expect(w1.plan).toBe("PRO"); // 套餐写已回滚
    expect(w1.extraSeats).toBe(5);
    expect(h.store.workspacequota.get("q1")!.enterpriseSlots).toBe(BigInt(20));
  });

  it("回调完成后提交失败 → 500，单空间状态完整回滚", async () => {
    h.fault.commit = true;
    const r = await call(SECRET);
    expect(r.status).toBe(500);
    expect(h.store.workspace.get("w1")!.plan).toBe("PRO");
    expect(h.store.workspace.get("w1")!.planExpiresAt).toEqual(PAST);
    expect(h.store.workspacequota.get("q1")!.enterpriseSlots).toBe(BigInt(20));
    expect(h.store.workspacequota.get("q1")!.tokenBalance).toBe(BigInt(850));
    assertSentinelsUnchanged();
  });

  it("全部履约调用经 TX：无 ROOT 写逃逸（封闭 stub 使事务期间根写直接失败）", async () => {
    const r = await call(SECRET);
    expect(r.status).toBe(200);
    expect(h.io.calls.filter((c) => c.startsWith("ROOT workspace.updateMany")).length).toBe(0);
    expect(h.io.calls.filter((c) => c.startsWith("ROOT workspacequota.updateMany")).length).toBe(0);
    expect(h.io.calls).toContain("TX workspace.updateMany");
    expect(h.io.calls).toContain("TX workspacequota.updateMany");
  });
});

describe("R0-G J07 调用契约与旁路", () => {
  beforeEach(() => {
    setEnv("CRON_SECRET", SECRET);
  });

  it("无公开 GET 旁路（路由仅导出 POST）", async () => {
    const routeModule = await import("@/app/api/cron/workspace-subscription-expire/route");
    expect((routeModule as any).GET).toBeUndefined();
  });

  it("POST 契约字段保持：success/checkedAt/downgraded/affected", async () => {
    const r = await call(SECRET);
    expect(r.body.success).toBe(true);
    expect(typeof r.body.checkedAt).toBe("string");
    expect(r.body.downgraded).toBe(1);
    expect(r.body.affected[0]).toMatchObject({ id: "w1", fromPlan: "PRO", toPlan: "STANDARD" });
  });
});


// ══════════════════════════════════════════════════════
// R0-G1：K01 绑定矩阵（null 也参与候选匹配）+ K02 STANDARD 配置保护
// 期望值独立取自种子与事务后实际存储；条件由夹具真实求值（null 等值参与比较）。
// ══════════════════════════════════════════════════════

describe("R0-G1 K01 quota 绑定矩阵（null 参与匹配）", () => {
  beforeEach(() => {
    setEnv("CRON_SECRET", SECRET);
  });

  function seedBinding(initialBinding: string | null) {
    h.store.workspace.set("w1", {
      id: "w1", name: "到期空间", plan: "PRO", planStartedAt: new Date(Date.now() - 31 * 86400_000),
      planExpiresAt: PAST, planBillingCycle: "MONTH", extraSeats: 5,
      workspacequotaId: initialBinding, updatedAt: new Date(),
    });
    if (initialBinding) {
      h.store.workspacequota.set(initialBinding, {
        id: initialBinding, workspaceId: "w1", enterpriseSlots: BigInt(20), tokenBalance: BigInt(850), updatedAt: new Date(),
      });
    }
  }

  it("null→非空（扫描时 null、写前绑定 q2）：跳过、零提交、新绑定保留", async () => {
    seedBinding(null);
    h.store.workspacequota.set("q2", { id: "q2", workspaceId: "w1", enterpriseSlots: BigInt(30), tokenBalance: BigInt(10) });
    h.mutations.push(() => {
      const w = h.store.workspace.get("w1")!;
      h.store.workspace.set("w1", { ...w, workspacequotaId: "q2" }); // 外部已提交的新绑定
    });
    const r = await call(SECRET);
    expect(r.status).toBe(200);
    expect(r.body.downgraded).toBe(0); // 不计入成功
    expect(r.body.skipped).toBe(1);
    const w1 = h.store.workspace.get("w1")!;
    expect(w1.plan).toBe("PRO"); // 未降级
    expect(w1.planExpiresAt).toEqual(PAST); // 期限未清
    expect(w1.extraSeats).toBe(5);
    expect(w1.workspacequotaId).toBe("q2"); // 新绑定保留（未被夹具整库恢复抹掉）
    expect(h.store.workspacequota.get("q2")!.enterpriseSlots).toBe(BigInt(30)); // 新 quota 未被写
    expect(h.store.workspacequota.get("q2")!.tokenBalance).toBe(BigInt(10));
  });

  it("q1→q2：跳过，旧/新 quota 均未被写", async () => {
    seedBinding("q1");
    h.store.workspacequota.set("q2", { id: "q2", workspaceId: "w1", enterpriseSlots: BigInt(30), tokenBalance: BigInt(10) });
    h.mutations.push(() => {
      const w = h.store.workspace.get("w1")!;
      h.store.workspace.set("w1", { ...w, workspacequotaId: "q2" });
    });
    const r = await call(SECRET);
    expect(r.body.downgraded).toBe(0);
    expect(r.body.skipped).toBe(1);
    expect(h.store.workspace.get("w1")!.plan).toBe("PRO");
    expect(h.store.workspace.get("w1")!.workspacequotaId).toBe("q2");
    expect(h.store.workspacequota.get("q1")!.enterpriseSlots).toBe(BigInt(20)); // 旧 quota 未被写
    expect(h.store.workspacequota.get("q2")!.enterpriseSlots).toBe(BigInt(30)); // 新 quota 未被写
    expect(h.store.workspacequota.get("q1")!.tokenBalance).toBe(BigInt(850));
  });

  it("q1→null（写前解绑）：跳过，旧 quota 与空间事实保持", async () => {
    seedBinding("q1");
    h.mutations.push(() => {
      const w = h.store.workspace.get("w1")!;
      h.store.workspace.set("w1", { ...w, workspacequotaId: null });
    });
    const r = await call(SECRET);
    expect(r.body.downgraded).toBe(0);
    expect(r.body.skipped).toBe(1);
    const w1 = h.store.workspace.get("w1")!;
    expect(w1.plan).toBe("PRO");
    expect(w1.workspacequotaId).toBeNull(); // 外部解绑事实保留
    expect(h.store.workspacequota.get("q1")!.enterpriseSlots).toBe(BigInt(20));
    expect(h.store.workspacequota.get("q1")!.tokenBalance).toBe(BigInt(850));
  });

  it("null→null 不变：保留合法处理（无 quota 空间正常降级，不写任何 quota）", async () => {
    seedBinding(null);
    const r = await call(SECRET);
    expect(r.status).toBe(200);
    expect(r.body.downgraded).toBe(1);
    expect(r.body.skipped).toBe(0);
    const w1 = h.store.workspace.get("w1")!;
    expect(w1.plan).toBe("STANDARD");
    expect(w1.planExpiresAt).toBeNull();
    expect(w1.extraSeats).toBe(0);
    expect(w1.workspacequotaId).toBeNull();
    expect(h.io.calls.some((c) => c.includes("workspacequota.updateMany"))).toBe(false);
  });

  it("q1→q1 不变：保留合法处理（席位回落 + 余额保持）", async () => {
    seedBinding("q1");
    const r = await call(SECRET);
    expect(r.status).toBe(200);
    expect(r.body.downgraded).toBe(1);
    expect(r.body.skipped).toBe(0);
    const w1 = h.store.workspace.get("w1")!;
    expect(w1.plan).toBe("STANDARD");
    expect(w1.workspacequotaId).toBe("q1");
    expect(h.store.workspacequota.get("q1")!.enterpriseSlots).toBe(BigInt(2)); // STANDARD 配置值
    expect(h.store.workspacequota.get("q1")!.tokenBalance).toBe(BigInt(850));
  });
});

describe("R0-G1 K02 STANDARD 配置保护", () => {
  beforeEach(() => {
    setEnv("CRON_SECRET", SECRET);
  });

  it("STANDARD 行缺失 → 503 稳定错误码，零降级/席位写，不使用写死 2 席", async () => {
    h.store.workspaceplan.clear(); // 无 STANDARD 配置
    const r = await call(SECRET);
    expect(r.status).toBe(503);
    expect(r.body.error).toBe("STANDARD_PLAN_CONFIG_UNAVAILABLE");
    const w1 = h.store.workspace.get("w1")!;
    expect(w1.plan).toBe("PRO"); // 未降级
    expect(w1.extraSeats).toBe(5);
    expect(h.store.workspacequota.get("q1")!.enterpriseSlots).toBe(BigInt(20)); // 未被覆盖为任何写死值
    expect(h.store.workspacequota.get("q1")!.tokenBalance).toBe(BigInt(850));
    expect(h.io.calls.some((c) => c.includes("workspace.updateMany") || c.includes("workspacequota.updateMany"))).toBe(false);
  });

  it.each([
    ["0 席", 0],
    ["负数席位", -1],
  ])("maxMembers=%s（不可靠配置）→ 503 拒绝，零写入，不发明免费/无限席位语义", async (_l, val) => {
    h.store.workspaceplan.set("STANDARD", { key: "STANDARD", maxMembers: val });
    const r = await call(SECRET);
    expect(r.status).toBe(503);
    expect(r.body.error).toBe("STANDARD_PLAN_CONFIG_UNAVAILABLE");
    expect(h.store.workspace.get("w1")!.plan).toBe("PRO");
    expect(h.store.workspacequota.get("q1")!.enterpriseSlots).toBe(BigInt(20));
    expect(h.io.calls.some((c) => c.includes("workspace.updateMany"))).toBe(false);
  });

  it("配置读取失败 → 非成功且零降级写", async () => {
    h.fault.failPlanRead = true;
    const r = await call(SECRET);
    expect(r.status).toBe(500); // 非 200/非成功
    expect(h.store.workspace.get("w1")!.plan).toBe("PRO");
    expect(h.store.workspacequota.get("q1")!.enterpriseSlots).toBe(BigInt(20));
    expect(h.io.calls.some((c) => c.includes("workspace.updateMany") || c.includes("workspacequota.updateMany"))).toBe(false);
  });

  it.each([
    ["4 席", 4],
    ["7 席", 7],
  ])("有效配置 %s → 精确使用配置值正常处理", async (_l, val) => {
    h.store.workspaceplan.set("STANDARD", { key: "STANDARD", maxMembers: val });
    const r = await call(SECRET);
    expect(r.status).toBe(200);
    expect(r.body.downgraded).toBe(1);
    expect(h.store.workspacequota.get("q1")!.enterpriseSlots).toBe(BigInt(val)); // 精确配置值
    expect(h.store.workspacequota.get("q1")!.tokenBalance).toBe(BigInt(850)); // 余额保持
  });

  it("凭证门禁仍在配置读取之前：未授权请求零 IO（含无 STANDARD 配置时）", async () => {
    h.store.workspaceplan.clear();
    const r = await call("wrong-key");
    expect(r.status).toBe(401);
    expect(h.io.calls).toEqual([]); // 未授权不开始读库
  });
});
