/**
 * U02 正式反例：一次性授权绑定 challenge + 短信登录并发唯一会话。
 *
 * 隔离：仅替换数据库委托、密码散列、JWT 密钥；真实执行 verify/reset/login 路由、
 * MemoryVerificationBackend 与 sms/email-code-store。零真实库/SMTP/短信/网络。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import fs from "fs";

const h = vi.hoisted(() => ({ writes: 0, sessions: 0 }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findFirst: vi.fn(async () => ({
        id: "u", status: "active", role: "USER", phone: "13800138000",
        email: "fixture@example.com", name: "fixture", lastLoginAt: null, sessionToken: null,
      })),
      findUnique: vi.fn(async () => ({ allowMultiDevice: false })),
      update: vi.fn(async ({ data }: any) => {
        if (data?.sessionToken) h.sessions++;
        else h.writes++;
        return {};
      }),
    },
    userdevice: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 0 })), create: vi.fn(async () => ({})) },
    operationlog: { create: vi.fn(async () => ({})) },
    loginhistory: { create: vi.fn(async () => ({})) },
    // [U02 §2.2] 改密授权认领替身（jti 唯一 + 状态机）
    passwordresetclaim: (() => {
      const claims = new Map<string, any>();
      return {
        findUnique: vi.fn(async ({ where }: any) => claims.get(where.id) ?? null),
        create: vi.fn(async ({ data }: any) => {
          if (claims.has(data.id)) { const e: any = new Error("unique"); e.code = "P2002"; throw e; }
          const row = { ...data };
          claims.set(data.id, row);
          return { ...row };
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const row = claims.get(where.id);
          if (!row) { const e: any = new Error("P2025"); e.code = "P2025"; throw e; }
          Object.assign(row, data);
          return { ...row };
        }),
      };
    })(),
  },
}));
vi.mock("@/lib/auth", () => ({ hashPassword: vi.fn(async () => "fake-hash") }));
vi.mock("@/lib/jwt-config", () => ({ getJwtSecretKey: () => new Uint8Array(32).fill(9) }));
vi.mock("@/lib/session-cache", () => ({ sessionCache: new Map() }));
vi.mock("@/lib/account-deletion", () => ({ maybeFinalizeDeletionIfDue: vi.fn(async () => false) }));

import {
  MemoryVerificationBackend,
  __setVerificationBackendForTest,
  __resetVerificationBackend,
} from "@/lib/verification-backend";
import { storeVerificationCode } from "@/lib/verification-codes";
import { storeSmsCode } from "@/lib/sms-store";
import { POST as verifyEmail } from "@/app/api/auth/verify-email-code/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
import { POST as loginSms } from "@/app/api/auth/login-sms/route";

const base = 1700000000000;
const req = (body: unknown) => new NextRequest("http://audit/auth", { method: "POST", body: JSON.stringify(body) });
const loginReq = () => new NextRequest("http://audit/login-sms", {
  method: "POST", body: JSON.stringify({ phone: "13800138000", smsCode: "123456", rememberMe: false }),
});

beforeEach(() => {
  h.writes = 0;
  h.sessions = 0;
  vi.useFakeTimers();
  vi.setSystemTime(base);
  __setVerificationBackendForTest(new MemoryVerificationBackend());
});
afterEach(() => { __resetVerificationBackend(); vi.useRealTimers(); });

describe("U02 resetToken 绑定 challenge", () => {
  it("同一 token 用两次：一次写密码；重放（响应丢失场景）幂等成功且不重做敏感写", async () => {
    await storeVerificationCode("email", "fixture@example.com", "reset-password", "123456");
    const token = (await (await verifyEmail(req({ email: "fixture@example.com", code: "123456" }))).json()).resetToken;
    const a = await reset(req({ resetToken: token, newPassword: "fixture-password" }));
    const b = await reset(req({ resetToken: token, newPassword: "fixture-password" }));
    // [U02 §2.2] 首次 200；重放按 COMPLETED 认领幂等 200，密码只写一次（不可重做敏感动作）
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(h.writes).toBe(1);
    expect((await b.json()).success).toBe(true);
  });

  it("旧 token（已用）不能借后来签发的新码恢复改密权，且新码不被误消费", async () => {
    await storeVerificationCode("email", "fixture@example.com", "reset-password", "123456");
    const tokenA = (await (await verifyEmail(req({ email: "fixture@example.com", code: "123456" }))).json()).resetToken;
    expect((await reset(req({ resetToken: tokenA, newPassword: "first-password" }))).status).toBe(200);

    vi.setSystemTime(base + 61_000);
    await storeVerificationCode("email", "fixture@example.com", "reset-password", "654321");
    // 旧 token（认领已 COMPLETED）→ 幂等成功但**不重做**密码写、不消费新码 B。
    const replay = await reset(req({ resetToken: tokenA, newPassword: "second-password" }));
    expect(replay.status).toBe(200);
    expect(h.writes).toBe(1); // 密码仍只写过第一次那回

    // 新 challenge B 未被旧 token 误消费：用 B 正常签发的新 token 仍可改密。
    const tokenB = (await (await verifyEmail(req({ email: "fixture@example.com", code: "654321" }))).json()).resetToken;
    expect((await reset(req({ resetToken: tokenB, newPassword: "third-password" }))).status).toBe(200);
    expect(h.writes).toBe(2);
  });

  it("缺少 challenge 绑定的伪造 token 拒绝，零密码写入", async () => {
    const { SignJWT } = await import("jose");
    const { getJwtSecretKey } = await import("@/lib/jwt-config");
    const fake = await new SignJWT({ email: "fixture@example.com", purpose: "reset_password" })
      .setProtectedHeader({ alg: "HS256" }).setExpirationTime("5m").sign(getJwtSecretKey());
    expect((await reset(req({ resetToken: fake, newPassword: "fixture-password" }))).status).toBe(401);
    expect(h.writes).toBe(0);
  });

  it("用途隔离：register 验证码不能换 reset-password 凭证", async () => {
    await storeVerificationCode("email", "fixture@example.com", "register", "123456");
    const res = await verifyEmail(req({ email: "fixture@example.com", code: "123456", type: "reset-password" }));
    expect(res.status).toBe(400);
  });
});

describe("U02 短信登录并发唯一会话", () => {
  it("两个并发请求最多一份会话、一次 sessionToken 写入", async () => {
    await storeSmsCode("13800138000", "123456", "login");
    const r = await Promise.all([loginSms(loginReq()), loginSms(loginReq())]);
    expect(r.filter((x) => x.status === 200).length).toBe(1);
    expect(h.sessions).toBe(1);
  });

  it("顺序重放被拒，零重复会话", async () => {
    await storeSmsCode("13800138000", "123456", "login");
    expect((await loginSms(loginReq())).status).toBe(200);
    expect((await loginSms(loginReq())).status).toBe(400);
    expect(h.sessions).toBe(1);
  });
});

describe("U02 源码接线契约（静态，无副作用）", () => {
  it("安装向导第二步传递 initToken，且注册不再用无返回值 delete 宣称已消费", () => {
    const initPage = fs.readFileSync("src/app/init/page.tsx", "utf-8");
    expect(initPage).toContain("initToken");
    const register = fs.readFileSync("src/app/api/auth/register/route.ts", "utf-8");
    expect(register).not.toContain("deleteSmsCode");
    expect(register).not.toContain("deleteEmailCode");
    const login = fs.readFileSync("src/app/api/auth/login-sms/route.ts", "utf-8");
    expect(login).not.toContain("deleteSmsCode");
  });
});
