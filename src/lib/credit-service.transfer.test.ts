import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * transferPoints 账务一致性测试。
 * 断言核心（债 3 铁律）：
 *   1. 共享池侧必须走分桶扣减 / 建桶入账，「分桶剩余合计」与「workspacequota 余额变化」一致；
 *   2. 两腿流水（OUT / IN）点数相等、方向相反，流水条数 >= 2；
 *   3. 点数不足 / 非法入参必须显式抛错，绝不静默部分入账。
 */

const h = vi.hoisted(() => {
  const state = {
    member: { id: "m1", userId: "u1", workspaceId: "ws1", tokenBalance: BigInt(0) },
    quota: { tokenBalance: BigInt(1000) },
    buckets: [] as Array<{
      id: string;
      remaining: bigint;
      status: string;
      expiresAt: Date | null;
      createdAt: Date;
      scope: string;
      workspaceId: string;
    }>,
    ledgers: [] as Array<Record<string, any>>,
  };
  return { state };
});

vi.mock("@/lib/prisma", () => {
  const tx: any = {
    workspacemember: {
      findUnique: async () => h.state.member,
      update: async ({ data }: any) => {
        if (data?.tokenBalance?.increment) h.state.member.tokenBalance += BigInt(data.tokenBalance.increment);
        if (data?.tokenBalance?.decrement) h.state.member.tokenBalance -= BigInt(data.tokenBalance.decrement);
        return h.state.member;
      },
    },
    pointgrant: {
      findMany: async () => h.state.buckets,
      update: async ({ where, data }: any) => {
        const b = h.state.buckets.find((x) => x.id === where.id)!;
        b.remaining = BigInt(data.remaining);
        if (data.status) b.status = data.status;
        return b;
      },
      create: async ({ data }: any) => {
        const row = { id: `g${h.state.buckets.length + 1}`, ...data };
        h.state.buckets.push(row as any);
        return row;
      },
    },
    workspacequota: {
      update: async ({ data }: any) => {
        if (data?.tokenBalance?.increment) h.state.quota.tokenBalance += BigInt(data.tokenBalance.increment);
        if (data?.tokenBalance?.decrement) h.state.quota.tokenBalance -= BigInt(data.tokenBalance.decrement);
        return h.state.quota;
      },
    },
    pointledger: {
      create: async ({ data }: any) => {
        h.state.ledgers.push(data);
        return data;
      },
    },
  };
  return { prisma: { $transaction: async (fn: any) => fn(tx) } };
});

vi.mock("@/lib/notifications-store", () => ({ addNotification: async () => {} }));

import { transferPoints } from "@/lib/credit-service";

const sumLedger = (direction: "IN" | "OUT") =>
  h.state.ledgers
    .filter((l) => l.direction === direction)
    .reduce((s, l) => s + Number(l.points), 0);

const bucketTotal = () => h.state.buckets.reduce((s, b) => s + Number(b.remaining), 0);

beforeEach(() => {
  h.state.member.tokenBalance = BigInt(0);
  h.state.quota.tokenBalance = BigInt(1000);
  h.state.buckets = [
    {
      id: "b1",
      remaining: BigInt(1000),
      status: "ACTIVE",
      expiresAt: null,
      createdAt: new Date("2026-01-01"),
      scope: "WORKSPACE",
      workspaceId: "ws1",
    },
  ];
  h.state.ledgers = [];
});

describe("transferPoints：共享池 → 成员（POOL_TO_MEMBER）", () => {
  it("分桶扣减、成员入账、双流水点数相等且与余额变化一致", async () => {
    const r = await transferPoints({
      workspaceId: "ws1",
      userId: "u1",
      points: 300,
      direction: "POOL_TO_MEMBER",
      operatorId: "admin1",
      reason: "分配算力",
      idempotencyKey: "T1",
    });

    // 成员侧
    expect(Number(h.state.member.tokenBalance)).toBe(300);
    expect(r.memberBalanceAfter).toBe(300);
    // 池侧
    expect(Number(h.state.quota.tokenBalance)).toBe(700);
    expect(r.poolBalanceAfter).toBe(700);
    // 分桶与余额一致（债 3 核心断言）
    expect(bucketTotal()).toBe(Number(h.state.quota.tokenBalance));
    // 双流水：OUT 与 IN 点数相等
    expect(sumLedger("OUT")).toBe(300);
    expect(sumLedger("IN")).toBe(300);
    expect(h.state.ledgers.length).toBeGreaterThanOrEqual(2);
    // 池侧流水必须带分桶归属（证明走了分桶而非直改余额）
    expect(h.state.ledgers.some((l) => l.direction === "OUT" && l.grantId === "b1")).toBe(true);
  });

  it("池内可用分桶不足 → 抛错且不产生任何流水（绝不部分入账）", async () => {
    await expect(
      transferPoints({
        workspaceId: "ws1",
        userId: "u1",
        points: 5000,
        direction: "POOL_TO_MEMBER",
        operatorId: "admin1",
        reason: "超额分配",
      }),
    ).rejects.toThrow();
    expect(h.state.ledgers.length).toBe(0);
    expect(Number(h.state.member.tokenBalance)).toBe(0);
    expect(Number(h.state.quota.tokenBalance)).toBe(1000);
  });
});

describe("transferPoints：成员 → 共享池（MEMBER_TO_POOL）", () => {
  it("成员出账、池侧建桶入账，双流水点数相等", async () => {
    h.state.member.tokenBalance = BigInt(500);
    h.state.buckets = []; // 池内暂无分桶，验证会新建

    const r = await transferPoints({
      workspaceId: "ws1",
      userId: "u1",
      points: 200,
      direction: "MEMBER_TO_POOL",
      operatorId: "admin1",
      reason: "回收算力",
      idempotencyKey: "T2",
    });

    expect(Number(h.state.member.tokenBalance)).toBe(300);
    expect(r.memberBalanceAfter).toBe(300);
    expect(Number(h.state.quota.tokenBalance)).toBe(1200);
    // 必须新建分桶，且分桶剩余 = 回收点数
    expect(h.state.buckets.length).toBe(1);
    expect(Number(h.state.buckets[0].remaining)).toBe(200);
    expect(sumLedger("OUT")).toBe(200);
    expect(sumLedger("IN")).toBe(200);
  });

  it("成员余额不足 → 抛错且不建桶、不写流水", async () => {
    h.state.member.tokenBalance = BigInt(50);
    await expect(
      transferPoints({
        workspaceId: "ws1",
        userId: "u1",
        points: 200,
        direction: "MEMBER_TO_POOL",
        operatorId: "admin1",
        reason: "超额回收",
      }),
    ).rejects.toThrow();
    expect(h.state.ledgers.length).toBe(0);
  });
});

describe("transferPoints：入参校验", () => {
  it("非正整数一律拒绝（0 / 负数 / NaN）", async () => {
    for (const bad of [0, -1, Number.NaN]) {
      await expect(
        transferPoints({
          workspaceId: "ws1",
          userId: "u1",
          points: bad,
          direction: "POOL_TO_MEMBER",
          operatorId: "admin1",
          reason: "非法入参",
        }),
      ).rejects.toThrow();
    }
    expect(h.state.ledgers.length).toBe(0);
  });
});
