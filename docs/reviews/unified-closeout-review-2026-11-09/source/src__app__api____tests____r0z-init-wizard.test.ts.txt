/**
 * U05-4 正式反例：安装向导一次性授权闭环。
 *
 * 隔离：仅替换数据库委托与密码散列；真实执行两个 API 路由与 install-auth 授权模块。
 * 替身忠实模拟 systemconfig 唯一键（P2002）、事务回滚、用户行写入。
 * 使用 vi.stubEnv 注入虚构 SETUP_TOKEN，不读取真实 .env，不创建真实管理员。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  users: [] as any[],
  claimed: false,
  tail: Promise.resolve() as Promise<any>,
}));

vi.mock("@/lib/prisma", () => {
  const prisma: any = {
    user: {
      count: vi.fn(async () => h.users.length),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: "admin-fixture", ...data };
        h.users.push(row);
        return row;
      }),
    },
    systemconfig: {
      create: vi.fn(async () => {
        if (h.claimed) throw Object.assign(new Error("unique"), { code: "P2002" });
        h.claimed = true;
        return {};
      }),
    },
  };
  // 忠实的事务替身：串行执行、失败整笔回滚。
  prisma.$transaction = (fn: any) => {
    const r = h.tail.then(async () => {
      const users = structuredClone(h.users);
      const claimed = h.claimed;
      try {
        return await fn(prisma);
      } catch (e) {
        h.users = users;
        h.claimed = claimed;
        throw e;
      }
    });
    h.tail = r.catch(() => {});
    return r;
  };
  return { prisma };
});
vi.mock("@/lib/auth", () => ({
  hashPassword: vi.fn(async () => "fake-hash"),
  validatePasswordStrength: vi.fn(() => ({ valid: true })),
}));

import { POST as setup } from "@/app/api/auth/verify-setup-token/route";
import { POST as init } from "@/app/api/auth/init-admin/route";
import { verifyInstallGrant } from "@/lib/install-auth";

const req = (body: unknown) =>
  new NextRequest("http://audit/init", { method: "POST", body: JSON.stringify(body) });
const wizardBody = { name: "fixture", email: "fixture@example.com", phone: "", password: "fixture-password" };

async function grant(): Promise<string> {
  const res = await setup(req({ token: "FAKE-SETUP-ONLY" }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.success).toBe(true);
  expect(typeof body.initToken).toBe("string");
  return body.initToken as string;
}

beforeEach(() => {
  h.users = [];
  h.claimed = false;
  h.tail = Promise.resolve();
  vi.stubEnv("SETUP_TOKEN", "FAKE-SETUP-ONLY");
});
afterEach(() => vi.unstubAllEnvs());

describe("U05-4 安装向导授权闭环", () => {
  it("SETUP_TOKEN 错误 → 401 且不签发授权", async () => {
    const res = await setup(req({ token: "WRONG" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.initToken).toBeUndefined();
  });

  it("无授权 / 伪造授权 / 用途不符 → 403，有明确提示，零创建", async () => {
    const missing = await init(req(wizardBody));
    expect(missing.status).toBe(403);
    expect((await missing.json()).message).toContain("授权");
    expect((await init(req({ ...wizardBody, initToken: "FAKE-STATIC-ONLY" }))).status).toBe(403);
    expect((await init(req({ ...wizardBody, initToken: "abc.def" }))).status).toBe(403);
    expect(h.users.length).toBe(0);
  });

  it("合法向导两步流程走通：验证取授权 → 携带授权创建成功", async () => {
    const token = await grant();
    expect(verifyInstallGrant(token).ok).toBe(true);
    const created = await init(req({ ...wizardBody, initToken: token }));
    expect(created.status).toBe(200);
    expect(h.users.length).toBe(1);
    expect(h.users[0].role).toBe("SUPER_ADMIN");
  });

  it("旧授权不可重放：已初始化后同授权再创建 → 400，仍只有一名管理员", async () => {
    const token = await grant();
    expect((await init(req({ ...wizardBody, initToken: token }))).status).toBe(200);
    expect((await init(req({ ...wizardBody, initToken: token }))).status).toBe(400);
    expect(h.users.length).toBe(1);
  });

  it("并发两笔同授权 → 最多一次创建（唯一认领 + 空库检查同事务）", async () => {
    const token = await grant();
    const results = await Promise.all([
      init(req({ ...wizardBody, initToken: token })),
      init(req({ ...wizardBody, initToken: token })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(h.users.length).toBe(1);
  });

  it("已初始化后不再签发新授权", async () => {
    const token = await grant();
    await init(req({ ...wizardBody, initToken: token }));
    const res = await setup(req({ token: "FAKE-SETUP-ONLY" }));
    expect(res.status).toBe(400);
    expect((await res.json()).initToken).toBeUndefined();
  });

  it("授权与 SETUP_TOKEN 绑定：换配置后旧授权失效", async () => {
    const token = await grant();
    vi.stubEnv("SETUP_TOKEN", "ANOTHER-FAKE-SETUP");
    expect(verifyInstallGrant(token).ok).toBe(false);
    expect((await init(req({ ...wizardBody, initToken: token }))).status).toBe(403);
    expect(h.users.length).toBe(0);
  });
});
