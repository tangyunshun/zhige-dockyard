/**
 * U12（原 13）正式反例：业务请求零 DDL，缺结构稳定 not-ready。
 *
 * 隔离：仅替换数据库委托/鉴权；真实执行 webhooks 四个方法、BYO 列探针、
 * admin/settings POST。DDL 语句一律用静态源码断言 + 运行时 $executeRaw 计数双重核验。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import fs from "fs";

const h = vi.hoisted(() => ({ ddl: [] as string[], writeCount: 0, txRolledBack: true }));

vi.mock("@/lib/prisma", () => {
  const prisma: any = {
    $executeRawUnsafe: vi.fn(async (sql: string) => {
      if (/\b(CREATE|ALTER|DROP|MODIFY)\s+(TABLE|COLUMN)\b/i.test(sql)) h.ddl.push(sql);
      h.writeCount++;
      return 1;
    }),
    $queryRawUnsafe: vi.fn(async () => []),
    systemconfig: { findMany: vi.fn(async () => []), upsert: vi.fn(async () => ({})) },
    operationlog: { create: vi.fn(async () => ({})) },
    notification: { create: vi.fn(async () => ({})) },
    webhooksubscription: { findMany: vi.fn(async () => []) },
  };
  prisma.$transaction = vi.fn(async (ops: any[]) => {
    await Promise.all(ops);
    return ops;
  });
  return { prisma };
});

vi.mock("@/lib/auth", () => ({
  validateUser: vi.fn(async () => ({ valid: true, user: { id: "admin", role: "SUPER_ADMIN", name: "a", status: "active" } })),
  isAdminRole: vi.fn(() => true),
}));
vi.mock("@/lib/security", () => ({ requirePlatformPermission: vi.fn(async () => ({ authorized: true, user: { id: "admin" } })) }));

import { GET as webhookGet, POST as webhookPost, PATCH as webhookPatch, DELETE as webhookDelete } from "@/app/api/webhooks/route";
import { ensureByoShareWithMembersColumn } from "@/lib/workspace-byo-model";

beforeEach(() => { h.ddl = []; h.writeCount = 0; });

const req = (method = "GET", body: any = undefined) =>
  new NextRequest("http://audit/api/webhooks", { method, body: body ? JSON.stringify(body) : undefined });

describe("U12 业务请求零 DDL", () => {
  it("webhooks 四个方法均不执行 CREATE TABLE / 任何 DDL", async () => {
    await webhookGet(req());
    await webhookPost(req("POST", { url: "https://example.invalid/hook", events: ["a"] }));
    await webhookPatch(req("PATCH", { id: "w1", action: "toggle" }));
    await webhookDelete(new NextRequest("http://audit/api/webhooks?id=w1", { method: "DELETE" }));
    expect(h.ddl).toEqual([]);
  });

  it("BYO 列探针（写模式与只读模式）均不执行 ALTER TABLE", async () => {
    await ensureByoShareWithMembersColumn();
    await ensureByoShareWithMembersColumn({ readOnly: true });
    expect(h.ddl).toEqual([]);
  });

  it("生产源码中不再含三类请求内 DDL 语句", () => {
    const webhooks = fs.readFileSync("src/app/api/webhooks/route.ts", "utf-8");
    const byo = fs.readFileSync("src/lib/workspace-byo-model.ts", "utf-8");
    const settings = fs.readFileSync("src/app/api/admin/settings/route.ts", "utf-8");
    // 检查可执行的 DDL 语句不在（注释里的说明文字不算）。
    expect(webhooks).not.toMatch(/\$executeRawUnsafe\([\s\S]{0,80}CREATE TABLE/);
    expect(webhooks).not.toContain("`CREATE TABLE IF NOT EXISTS");
    expect(byo).not.toContain('"ALTER TABLE');
    expect(settings).not.toContain('"ALTER TABLE');
    // 只读探针仍在
    expect(webhooks).toContain("SELECT 1 FROM `webhooksubscription` LIMIT 1");
    expect(byo).toContain("SELECT `shareWithMembers` FROM `workspace_byo_model` LIMIT 1");
  });

  it("离线迁移文件含建表前提，不只 ADD COLUMN", () => {
    const budget = fs.readFileSync(
      "prisma/migrations/20261109000000_verification_budget_lock/migration.sql", "utf-8",
    );
    expect(budget).toContain("CREATE TABLE IF NOT EXISTS `VerificationBudget`");
    expect(budget).toContain("lastSentAt");
    expect(budget).toContain("failCount");
    expect(budget).toContain("lockedUntil");
    const offline = fs.readFileSync(
      "prisma/migrations/20261109000100_request_ddl_offline/migration.sql", "utf-8",
    );
    expect(offline).toContain("CREATE TABLE IF NOT EXISTS `webhooksubscription`");
    expect(offline).toContain("shareWithMembers");
    expect(offline).toContain("MEDIUMTEXT");
  });
});
