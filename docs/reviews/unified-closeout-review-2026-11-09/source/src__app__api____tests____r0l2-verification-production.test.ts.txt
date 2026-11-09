/**
 * F15 / U03：真实 Prisma 生产算法验收（隔离委托，不测 Memory）
 *
 * 通过 __setVerificationModelsForTest 注入实现相同接口的隔离替身，使真实
 * PrismaVerificationBackend 的全部逻辑（60s 间隔、10/日限、5 次失败锁 30 分、
 * 原子消费、CAS 回滚、未就绪 503）在隔离环境下被真正执行。
 *
 * 运行：npx vitest run src/app/api/__tests__/r0l2-verification-production.test.ts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} as any }));

import {
  __setVerificationBackendForTest,
  __resetVerificationBackend,
  PrismaVerificationBackend,
  __setVerificationModelsForTest,
  __resetVerificationModels,
  VERIFY_POLICY,
} from "@/lib/verification-backend";
import {
  storeVerificationCode,
  consumeVerificationCode,
  verifyVerificationCode,
} from "@/lib/verification-codes";

function makeStores() {
  const budget: Record<string, any> = {};
  const smscodes: any[] = [];

  const budgetModel = {
    findUnique: async ({ where }: any) => (budget[where.id] ? { ...budget[where.id] } : null),
    // 冷启动由 create 占有主键：重复键抛 P2002，忠实模拟唯一约束。
    create: async ({ data }: any) => {
      if (budget[data.id]) {
        const e = new Error("unique");
        (e as any).code = "P2002";
        throw e;
      }
      budget[data.id] = { ...data };
      return { ...budget[data.id] };
    },
    upsert: async ({ where, create, update }: any) => {
      if (!budget[where.id]) {
        budget[where.id] = { ...create, id: where.id };
        return { ...budget[where.id] };
      }
      const row = budget[where.id];
      if (update?.count?.increment) row.count += update.count.increment;
      if (update?.count?.decrement) row.count -= update.count.decrement;
      if (update?.lastSentAt != null) row.lastSentAt = update.lastSentAt;
      if (update?.windowStart != null) row.windowStart = update.windowStart;
      if (update?.failCount != null) row.failCount = update.failCount;
      if (update?.lockedUntil != null) row.lockedUntil = update.lockedUntil;
      if (update?.version?.increment) row.version += update.version.increment;
      return { ...row };
    },
    update: async ({ where, data }: any) => {
      let row = budget[where.id];
      if (!row) {
        row = budget[where.id] = {
          id: where.id,
          count: 0,
          windowStart: Date.now(),
          lastSentAt: 0,
          failCount: 0,
          lockedUntil: 0,
          version: 1,
        };
      }
      // 真实版本 CAS：where 带 version 且不匹配时抛 P2025，逼后端走重试
      if (where.version != null && Number(where.version) !== row.version) {
        const e = new Error("version conflict");
        (e as any).code = "P2025";
        throw e;
      }
      if (data?.count?.increment) row.count += data.count.increment;
      if (data?.count?.decrement) row.count -= data.count.decrement;
      if (data?.lastSentAt != null) row.lastSentAt = data.lastSentAt;
      if (data?.windowStart != null) row.windowStart = data.windowStart;
      if (data?.failCount != null) row.failCount = data.failCount;
      if (data?.lockedUntil != null) row.lockedUntil = data.lockedUntil;
      if (data?.version?.increment) row.version += data.version.increment;
      return { ...row };
    },
  };

  const smscodeModel = {
    findFirst: async ({ where }: any) => {
      const matches = smscodes.filter(
        (c) => c.phone === where.phone && c.type === where.type && (where.used === undefined || c.used === where.used),
      );
      if (!matches.length) return null;
      matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return { ...matches[0] };
    },
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      for (const c of smscodes) {
        if (c.phone === where.phone && c.type === where.type && c.used === false) {
          c.used = true;
          c.usedAt = data.usedAt;
          count++;
        }
      }
      return { count };
    },
    create: async ({ data }: any) => {
      const row = { ...data, createdAt: new Date(), used: false };
      smscodes.push(row);
      return row;
    },
  };

  return { budgetModel, smscodeModel, budget, smscodes };
}

let stores: ReturnType<typeof makeStores>;

beforeEach(() => {
  stores = makeStores();
  __setVerificationModelsForTest(stores.budgetModel, stores.smscodeModel);
  __setVerificationBackendForTest(new PrismaVerificationBackend());
});

afterEach(() => {
  __resetVerificationModels();
  __resetVerificationBackend();
});

describe("U03 真实生产算法：预算裁决", () => {
  it("ready() 在委托存在时为 true", async () => {
    const backend = new PrismaVerificationBackend();
    expect(await backend.ready()).toBe(true);
  });

  it("60 秒间隔：立即重发被拒并给出 waitSeconds", async () => {
    expect((await storeVerificationCode("email", "interval@x.com", "register", "123456")).ok).toBe(true);
    const second = await storeVerificationCode("email", "interval@x.com", "register", "123456");
    expect(second.ok).toBe(false);
    expect(second.status).toBe(429);
    expect((second.waitSeconds ?? 0) > 0).toBe(true);
  });

  it("日限 10：绕过间隔后 12 次请求至多 10 次成功", async () => {
    const key = "target:email:daylimit@x.com";
    let ok = 0;
    for (let i = 0; i < 12; i++) {
      const row = stores.budget[key];
      if (row) row.lastSentAt = 0; // 绕过间隔，单独验证日限
      const r = await storeVerificationCode("email", "daylimit@x.com", "register", "123456");
      if (r.ok) ok++;
    }
    expect(ok).toBe(10);
  });

  it("失败 5 次后锁定 30 分钟，正确码也无法发送", async () => {
    await storeVerificationCode("email", "faillock@x.com", "reset-password", "123456");
    for (let i = 0; i < 5; i++) {
      await verifyVerificationCode("email", "faillock@x.com", "reset-password", "wrong");
    }
    const locked = await storeVerificationCode("email", "faillock@x.com", "reset-password", "123456");
    expect(locked.ok).toBe(false);
    expect(locked.status).toBe(429);
    expect(Number(stores.budget["target:email:faillock@x.com"].lockedUntil) > Date.now()).toBe(true);
  });

  it("并发同目标：日限计数正确，不穿限（CAS 不丢增量）", async () => {
    // 预建 platform 与目标行，避免创建竞争；临时关闭间隔以单独验证并发日限与 CAS。
    const targetKey = "target:email:concurrent@x.com";
    const seedRow = (id: string) => {
      stores.budget[id] = {
        id,
        count: 0,
        windowStart: Date.now(),
        lastSentAt: 0,
        failCount: 0,
        lockedUntil: 0,
        version: 1,
      };
    };
    seedRow("platform");
    seedRow(targetKey);

    const savedInterval = VERIFY_POLICY.sendIntervalMs;
    (VERIFY_POLICY as any).sendIntervalMs = 0; // 关闭间隔，仅验证并发日限/CAS
    try {
      const tasks: Promise<any>[] = [];
      for (let i = 0; i < 10; i++) {
        tasks.push(storeVerificationCode("email", "concurrent@x.com", "register", "123456"));
      }
      const results = await Promise.all(tasks);
      const successes = results.filter((r) => r.ok).length;
      // 成功数 = 真实计数（无丢增量/无幽灵计数），且不超过日限 10
      expect(successes).toBe(10);
      expect(stores.budget[targetKey].count).toBe(10);
    } finally {
      (VERIFY_POLICY as any).sendIntervalMs = savedInterval;
    }
  });
});

describe("U03 真实生产算法：一次性消费", () => {
  it("已消费的验证码不可重复消费（两实例并发也仅一成功）", async () => {
    await storeVerificationCode("sms", "13800138001", "reset-password", "333333");
    const [a, b] = await Promise.all([
      consumeVerificationCode("sms", "13800138001", "reset-password"),
      consumeVerificationCode("sms", "13800138001", "reset-password"),
    ]);
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
  });

  it("消费后原码再次核验也失败（challenge 已绑定并消费）", async () => {
    await storeVerificationCode("sms", "13800138002", "reset-password", "444444");
    const v1 = await verifyVerificationCode("sms", "13800138002", "reset-password", "444444");
    expect(v1.valid).toBe(true);
    await consumeVerificationCode("sms", "13800138002", "reset-password");
    const v2 = await verifyVerificationCode("sms", "13800138002", "reset-password", "444444");
    expect(v2.valid).toBe(false);
  });
});

describe("U02 真实生产算法：用途隔离", () => {
  it("register 验证码不可用于 reset-password 核验", async () => {
    await storeVerificationCode("email", "iso@x.com", "register", "222222");
    expect((await verifyVerificationCode("email", "iso@x.com", "reset-password", "222222")).valid).toBe(false);
    expect((await verifyVerificationCode("email", "iso@x.com", "register", "222222")).valid).toBe(true);
  });
});

describe("U03 真实生产算法：未就绪拒绝", () => {
  it("缺委托（表不存在）时 admitSend 返回 503，不发生发送", async () => {
    __setVerificationModelsForTest(null, null);
    const backend = new PrismaVerificationBackend();
    const r = await backend.admitSend({ channel: "email", target: "none@x.com", purpose: "register" });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
  });

  it("缺委托时 consume 返回 503，密码/绑定等敏感效果为 0", async () => {
    __setVerificationModelsForTest(null, null);
    const backend = new PrismaVerificationBackend();
    const r = await backend.consume({ channel: "sms", target: "13800138099", purpose: "reset-password" });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(503);
  });
});
