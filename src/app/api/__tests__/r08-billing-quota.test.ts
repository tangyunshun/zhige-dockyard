import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    membershiplevel: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    systemconfig: { findMany: vi.fn() },
  },
}));

import { getMembershipTokenLimit } from "@/lib/quota-token";
import { parseBillingConfig } from "@/lib/billing/billing-config";
import { prisma } from "@/lib/prisma";

const membership = prisma.membershiplevel as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("U08 计费口径与 FREE 只读", () => {
  it("parseBillingConfig：合法 20000 bps 原值保留，无自动 ÷10", () => {
    const cfg = parseBillingConfig([
      { key: "billing.markupCoefficientBps", value: "20000" },
    ]);
    expect(cfg.markupCoefficientBps).toBe(20000);
  });

  it("parseBillingConfig：合法 2000 bps 保持 2000", () => {
    const cfg = parseBillingConfig([
      { key: "billing.markupCoefficientBps", value: "2000" },
    ]);
    expect(cfg.markupCoefficientBps).toBe(2000);
  });

  it("getMembershipTokenLimit：读取真实值，不写库", async () => {
    membership.findUnique.mockResolvedValue({ tokenLimit: BigInt(500) });
    const limit = await getMembershipTokenLimit("GOLD");
    expect(limit).toBe(BigInt(500));
    expect(membership.update).not.toHaveBeenCalled();
  });

  it("getMembershipTokenLimit：FREE 缺失配置返回 0 且仍不写库、不写死 100", async () => {
    membership.findUnique.mockResolvedValue(null);
    const limit = await getMembershipTokenLimit("FREE");
    expect(limit).toBe(BigInt(0));
    expect(membership.update).not.toHaveBeenCalled();
  });
});
