import { it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ ownerStatus: "active" as string, bannedUntil: null as Date | null, userReads: 0 }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async () => {
        h.userReads++;
        return { id: "disabled-user", role: "USER", status: h.ownerStatus, bannedUntil: h.bannedUntil };
      }),
    },
    apikey: {
      findMany: vi.fn(async () => [
        { id: "key", userId: "disabled-user", keyHash: "fake-hash", name: "fixture", keyPrefix: "sk-" },
      ]),
      update: vi.fn(async () => ({})),
    },
    operationlog: { create: vi.fn(async () => ({})) },
    systemconfig: { findUnique: vi.fn(async () => null) },
  },
}));

const validateUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ validateUser: validateUserMock }));
vi.mock("@/lib/ip-risk", () => ({ getClientIP: () => "127.0.0.1" }));
vi.mock("bcryptjs", () => ({ default: { compare: vi.fn(async () => true) } }));

import { requirePlatformAuth } from "@/lib/security";
import { authenticateApiKey } from "@/lib/api-key-auth";

const req = () =>
  new NextRequest("http://audit/open", {
    headers: { cookie: "auth_token=verified-expired-session-fixture", "x-api-key": "fixture-key" },
  });

beforeEach(() => {
  validateUserMock.mockReset();
  h.ownerStatus = "active";
  h.bannedUntil = null;
  h.userReads = 0;
});

it("完整认证明确拒绝（FORCED_LOGOUT）后平台守卫不复活，仍 unauthorized", async () => {
  validateUserMock.mockResolvedValue({ valid: false, error: "FORCED_LOGOUT" });
  const r = await requirePlatformAuth(req());
  expect(r.authorized).toBe(false);
});

it("完整认证通过时平台守卫正常放行超管", async () => {
  validateUserMock.mockResolvedValue({
    valid: true,
    user: { id: "u", email: "a@b.c", name: "n", role: "SUPER_ADMIN", status: "active" },
  });
  const r = await requirePlatformAuth(req());
  expect(r.authorized).toBe(true);
});

it("账号被封禁时 API Key 拒绝，且实际查询了账号状态", async () => {
  h.ownerStatus = "banned";
  h.bannedUntil = null;
  const r = await authenticateApiKey(req());
  expect(r).toBeNull();
  expect(h.userReads).toBeGreaterThan(0);
});

it("账号注销冷静期（deleting）时 API Key 拒绝", async () => {
  h.ownerStatus = "deleting";
  const r = await authenticateApiKey(req());
  expect(r).toBeNull();
});

it("账号正常时 API Key 放行", async () => {
  h.ownerStatus = "active";
  const r = await authenticateApiKey(req());
  expect(r?.userId).toBe("disabled-user");
});
