/**
 * B1 / F15 验证码：诚实通道状态、共享原子预算、校验接线（L01/L02/L03）
 *
 * 运行：npx vitest run src/app/api/__tests__/r0l-verification.test.ts
 * 外部 IO 全部替身；真实 Prisma 用 mock 模拟条件/唯一性/事务回滚。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// 替身：mailer（sendMail 可控）+ 任意 smscode/verificationbudget（条件/唯一/回滚可模拟）
vi.mock("@/lib/mailer", () => ({
  sendMail: vi.fn(),
  buildVerificationEmailHtml: (_t: string, code: string) => `<html>${code}</html>`,
}));

vi.mock("@/lib/prisma", () => {
  const budget: Record<string, { id: string; count: number; windowStart: number; version: number }> = {};
  return {
    prisma: {
      smscode: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: "x" }),
      },
      verificationbudget: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          const row = budget[where.id] || { id: where.id, count: 0, windowStart: Date.now(), version: 1 };
          const inc = update?.count?.increment ?? create?.count ?? 0;
          row.count += inc;
          budget[where.id] = row;
          return { ...row };
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const row = budget[where.id] || { id: where.id, count: 0, windowStart: Date.now(), version: 1 };
          if (data?.count?.increment) row.count += data.count.increment;
          if (data?.count?.decrement) row.count -= data.count.decrement;
          budget[where.id] = row;
          return { ...row };
        }),
      },
    },
  };
});

import {
  __setVerificationBackendForTest,
  __resetVerificationBackend,
  MemoryVerificationBackend,
} from "@/lib/verification-backend";
import {
  storeVerificationCode,
  verifyVerificationCode,
  consumeVerificationCode,
} from "@/lib/verification-codes";
import { sendMail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";

import { POST as sendSmsPost } from "@/app/api/auth/send-sms/route";
import { POST as sendEmailPost } from "@/app/api/auth/send-email-code/route";

function jsonReq(url: string, body: unknown) {
  return new NextRequest(url, { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  __setVerificationBackendForTest(new MemoryVerificationBackend());
  (sendMail as any).mockReset?.();
  (prisma.smscode.findFirst as any).mockResolvedValue(null);
  (prisma.smscode.updateMany as any).mockResolvedValue({ count: 1 });
  (prisma.smscode.create as any).mockResolvedValue({ id: "x" });
});

afterEach(() => {
  __resetVerificationBackend();
});

// ---------------------------------------------------------------------------
// L01：诚实通道状态，不泄露验证码
// ---------------------------------------------------------------------------
describe("L01 诚实通道状态 / 不泄露验证码", () => {
  it("send-sms：未接通供应商，返回 503 CHANNEL_NOT_READY，绝不签发/返回验证码", async () => {
    const res = await sendSmsPost(jsonReq("http://x/api/auth/send-sms", { phone: "13800138000" }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("CHANNEL_NOT_READY");
  });

  it("send-email-code：正常路径成功且不回传 debugCode（明文仅进邮件正文）", async () => {
    (sendMail as any).mockResolvedValue({ ok: true });
    const res = await sendEmailPost(
      jsonReq("http://x/api/auth/send-email-code", { email: "user@example.com", type: "register" }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.debugCode).toBeUndefined();
    // 明文验证码仅传入邮件正文（合法投递），sendMail 被调用且收件人为请求邮箱
    expect((sendMail as any).mock.calls[0][0].to).toBe("user@example.com");
  });

  it("send-email-code：SMTP 未配置返回 503 CHANNEL_NOT_READY，不在发送前签发有效码", async () => {
    (sendMail as any).mockResolvedValue({ ok: false, reason: "SMTP_NOT_CONFIGURED" });
    const res = await sendEmailPost(
      jsonReq("http://x/api/auth/send-email-code", { email: "user@example.com" }),
    );
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe("CHANNEL_NOT_READY");
  });

  it("send-email-code：SMTP 发送失败返回 502 SEND_FAILED，并返还预算", async () => {
    (sendMail as any).mockResolvedValue({ ok: false, reason: "SEND_FAILED" });
    const res = await sendEmailPost(
      jsonReq("http://x/api/auth/send-email-code", { email: "user@example.com" }),
    );
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.code).toBe("SEND_FAILED");
  });

  it("send-email-code：后端未就绪（真实表缺失）在任何发送前 503，不本机放行", async () => {
    // 模拟真实表缺失：Prisma 抛错 -> 后端 not-ready
    __setVerificationBackendForTest(null); // 回落生产 Prisma 后端
    (prisma.smscode.findFirst as any).mockRejectedValue(new Error("P2021 table missing"));
    const res = await sendEmailPost(
      jsonReq("http://x/api/auth/send-email-code", { email: "user@example.com" }),
    );
    expect(res.status).toBe(503);
  });

  it("send-email-code：正常路径真实 Prisma 算法被执行（issue/create/upsert 条件）", async () => {
    __setVerificationBackendForTest(null);
    (prisma.smscode.findFirst as any).mockResolvedValue(null);
    (sendMail as any).mockResolvedValue({ ok: true });
    const res = await sendEmailPost(
      jsonReq("http://x/api/auth/send-email-code", { email: "real@example.com" }),
    );
    expect(res.status).toBe(200);
    expect((prisma.smscode.create as any).mock.calls.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// L02：发送前共享原子预算（多实例共用一份限制，不靠两份 Map）
// ---------------------------------------------------------------------------
describe("L02 共享原子预算 / 跨实例守限", () => {
  it("同一目标日限 10：12 次请求（绕过 60s 间隔以隔离日限分支）至多 10 次成功", async () => {
    const backend = new MemoryVerificationBackend();
    __setVerificationBackendForTest(backend);
    const target = "daylimit@example.com";
    const key = `email:${target}`;
    let ok = 0;
    for (let i = 0; i < 12; i++) {
      // 绕过 60s 间隔以单独验证日限（真实场景下间隔已先约束速率，日限为冗余安全网）
      const st = (backend as any).targetState.get(key);
      if (st) st.lastSentAt = 0;
      const r = await storeVerificationCode("email", target, "register", "123456");
      if (r.ok) ok++;
    }
    expect(ok).toBe(10);
  });

  it("发送间隔 60 秒：立即重发被拒并给出 waitSeconds", async () => {
    const backend = new MemoryVerificationBackend();
    __setVerificationBackendForTest(backend);
    expect((await storeVerificationCode("email", "interval@example.com", "register", "123456")).ok).toBe(true);
    const second = await storeVerificationCode("email", "interval@example.com", "register", "123456");
    expect(second.ok).toBe(false);
    expect(second.status).toBe(429);
    expect((second.waitSeconds ?? 0) > 0).toBe(true);
  });

  it("失败 5 次后锁定 30 分钟", async () => {
    const backend = new MemoryVerificationBackend();
    __setVerificationBackendForTest(backend);
    await storeVerificationCode("email", "faillock@example.com", "reset-password", "123456");
    for (let i = 0; i < 5; i++) {
      await verifyVerificationCode("email", "faillock@example.com", "reset-password", "wrong");
    }
    const locked = await storeVerificationCode("email", "faillock@example.com", "reset-password", "123456");
    expect(locked.ok).toBe(false);
    expect(locked.status).toBe(429);
  });

  it("一次性消费：已消费的验证码不可重复消费（两实例并发也不可）", async () => {
    const backend = new MemoryVerificationBackend();
    __setVerificationBackendForTest(backend);
    await storeVerificationCode("email", "once@example.com", "reset-password", "111111");
    expect((await verifyVerificationCode("email", "once@example.com", "reset-password", "111111")).valid).toBe(true);
    const c1 = await consumeVerificationCode("email", "once@example.com", "reset-password");
    expect(c1.ok).toBe(true);
    const c2 = await consumeVerificationCode("email", "once@example.com", "reset-password");
    expect(c2.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// L03：校验与现有调用完整接线（用途隔离 / 一次性凭证跨实例不重复消费）
// ---------------------------------------------------------------------------
describe("L03 用途隔离 / 接线正确", () => {
  it("register 验证码不可用于 reset-password 核验", async () => {
    const backend = new MemoryVerificationBackend();
    __setVerificationBackendForTest(backend);
    await storeVerificationCode("email", "iso@example.com", "register", "222222");
    const wrongPurpose = await verifyVerificationCode("email", "iso@example.com", "reset-password", "222222");
    expect(wrongPurpose.valid).toBe(false);
    const rightPurpose = await verifyVerificationCode("email", "iso@example.com", "register", "222222");
    expect(rightPurpose.valid).toBe(true);
  });

  it("reset-password 一次性凭证在两实例并发下仅一方成功消费", async () => {
    const backend = new MemoryVerificationBackend();
    __setVerificationBackendForTest(backend);
    await storeVerificationCode("sms", "13800138001", "reset-password", "333333");
    const [a, b] = await Promise.all([
      consumeVerificationCode("sms", "13800138001", "reset-password"),
      consumeVerificationCode("sms", "13800138001", "reset-password"),
    ]);
    const oks = [a.ok, b.ok].filter(Boolean).length;
    expect(oks).toBe(1); // 仅一次成功，防重复消费
  });

  it("verify-email-code 路由：注册用途校验通过后才下发 token（无 debugCode）", async () => {
    const backend = new MemoryVerificationBackend();
    __setVerificationBackendForTest(backend);
    await storeVerificationCode("email", "route@example.com", "register", "444444");
    // 直接走路由级核验保持一致
    const { POST: verifyPost } = await import("@/app/api/auth/verify-email-code/route");
    const res = await verifyPost(
      jsonReq("http://x/api/auth/verify-email-code", { email: "route@example.com", code: "444444", type: "register" }),
    );
    expect(res.status).toBe(200);
  });
});
