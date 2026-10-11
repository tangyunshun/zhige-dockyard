// POST /api/open/v1/execute route acceptance (real DB + real model). Cases: 401/403/200/POINTS_INSUFFICIENT/429.
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { POST } from "../route";
import { checkOpenApiRateLimit } from "@/lib/open-api-rate-limit";

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvLocal();
process.env.MODEL_ALLOW_INSECURE_LOCAL = "true";

const C07 = "C07";
const SAMPLE_INPUT = `规划一款面向中小团队的「项目协作与工时管理」SaaS 工具。背景：团队用表格+群聊管理项目，任务状态失真、工时靠手工。
用户与使用场景：产品经理维护需求；开发认领任务并记录工时；项目经理看风险；老板看成本看板。
功能需求：任务看板、工时填报与审批、里程碑与依赖、报表导出、权限管理。
非功能需求：支持 500 并发、数据加密、操作审计、平均响应<300ms、可用性 99.9%。
数据与接口：对接企业微信与钉钉日历，提供 OpenAPI。
验收标准：看板拖拽<100ms；工时月结准确率 100%；支持 SSO。
请输出含「背景与目标、用户与使用场景、功能需求、非功能需求、数据与接口、验收标准」六章节的需求规格文档。`;

async function getReadyTenantWorkspace(): Promise<string> {
  // 取「超管已加入且为合法 tenant」的空间（componenttask.tenantId 外键指向 tenant.id）。
  // 不依赖历史成功记录：用例 3 执行时会在该空间产生 SUCCESS 任务。
  const admin = await prisma.user.findFirst({ where: { role: "superadmin" }, select: { id: true } });
  if (!admin) throw new Error("未找到 superadmin");
  const members = await prisma.workspacemember.findMany({ where: { userId: admin.id }, select: { workspaceId: true } });
  const tenantIds = new Set((await prisma.tenant.findMany({ select: { id: true } })).map((t) => t.id));
  const wid = members.map((m) => m.workspaceId).find((w) => tenantIds.has(w));
  if (!wid) throw new Error("超管没有可用的 tenant 空间");
  return wid;
}

async function makeApiKey(userId: string, name: string) {
  const apiKey = "sk-" + randomUUID().replace(/-/g, "");
  const keyHash = await bcrypt.hash(apiKey, 10);
  const row = await prisma.apikey.create({
    data: { id: randomUUID(), userId, name, keyHash, keyPrefix: apiKey.slice(0, 11), lastUsedAt: null, updatedAt: new Date() },
  });
  return { apiKey, keyId: row.id };
}

function postReq(apiKey: string | null, body: unknown) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  return new NextRequest("http://localhost/api/open/v1/execute", { method: "POST", headers, body: JSON.stringify(body) });
}

let workspaceId = "";
let superKey = "";
let superUserId = "";
let poorUserId = "";
let poorKey = "";
let poorWorkspaceId = "";

before(async () => {
  workspaceId = await getReadyTenantWorkspace();
  const admin = await prisma.user.findFirst({ where: { role: "superadmin" }, select: { id: true } });
  if (!admin) throw new Error("未找到 superadmin");
  superUserId = admin.id;
  await prisma.workspacemember.upsert({
    where: { userId_workspaceId: { userId: admin.id, workspaceId } },
    create: { id: randomUUID(), userId: admin.id, workspaceId, role: "OWNER", joinedAt: new Date() },
    update: {},
  });
  superKey = (await makeApiKey(admin.id, "E1-test-super")).apiKey;
  const poor = await prisma.user.create({
    data: { id: randomUUID(), email: `e1-poor-${randomUUID()}@test.local`, name: "E1-poor", password: "x", role: "user" },
  });
  poorUserId = poor.id;
  // 余额不足用例：另建一个零余额的临时空间（同时作为 tenant 以满足 componenttask.tenantId 外键），
  // 穷用户为其 OWNER 且全平台无算力点，执行应在扣费前被 POINTS_INSUFFICIENT 硬阻断（不触发模型）。
  poorWorkspaceId = `ws-e1-poor-${randomUUID()}`;
  await prisma.tenant.create({ data: { id: poorWorkspaceId, name: "E1-poor-ws", updatedAt: new Date() } });
  await prisma.workspace.create({
    data: { id: poorWorkspaceId, name: "E1-poor-ws", type: "PERSONAL", ownerId: poor.id, status: "ACTIVE", updatedAt: new Date() },
  });
  await prisma.workspacemember.create({
    data: { id: randomUUID(), userId: poor.id, workspaceId: poorWorkspaceId, role: "OWNER", joinedAt: new Date() },
  });
  poorKey = (await makeApiKey(poor.id, "E1-test-poor")).apiKey;
});

after(async () => {
  await prisma.apikey.deleteMany({ where: { name: { in: ["E1-test-super", "E1-test-poor"] } } }).catch(() => {});
  await prisma.workspacemember.deleteMany({ where: { userId: poorUserId, workspaceId: poorWorkspaceId } }).catch(() => {});
  await prisma.workspace.deleteMany({ where: { id: poorWorkspaceId } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { id: poorWorkspaceId } }).catch(() => {});
  await prisma.workspacemember.deleteMany({ where: { userId: poorUserId, workspaceId } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: poorUserId } }).catch(() => {});
  await prisma.systemconfig.deleteMany({ where: { key: "OPEN_API_RATE_LIMIT_PER_KEY_PER_MIN" } }).catch(() => {});
  await prisma.$disconnect();
});

describe("POST /api/open/v1/execute", () => {
  test("1) API Key 鉴权失败 → 401", async () => {
    const res = await POST(postReq(null, { workspaceId, componentId: C07 }));
    assert.equal(res.status, 401);
  });
  test("2) 空间越权（非成员）→ 403", async () => {
    const other = await prisma.componenttask.findFirst({
      where: { type: "C07", tenantId: { not: workspaceId }, status: { in: ["SUCCESS", "DONE", "COMPLETED"] } },
      select: { tenantId: true },
    });
    const target = other?.tenantId || "ws-not-exist-e1";
    const res = await POST(postReq(superKey, { workspaceId: target, componentId: C07 }));
    assert.equal(res.status, 403);
  });
  test("3) 正常执行（真实模型）→ 200 + channel=OPEN_API", async () => {
    let taskId = "";
    let ok = false;
    for (let attempt = 1; attempt <= 6 && !ok; attempt++) {
      const res = await POST(postReq(superKey, { workspaceId, componentId: C07, inputMaterial: SAMPLE_INPUT }));
      const j = await res.json();
      if (res.status === 200 && j.success) {
        ok = true;
        taskId = j.taskId;
        const task = await prisma.componenttask.findUnique({ where: { id: taskId }, select: { config: true } });
        assert.equal((task?.config as any)?.channel, "OPEN_API");
        break;
      }
      if (j?.error !== "MODEL_OUTPUT_INVALID") throw new Error(`执行失败：${res.status} ${JSON.stringify(j)}`);
    }
    assert.ok(ok, "真实执行应在重试内成功");
  });
  test("4) 余额不足 → 400 POINTS_INSUFFICIENT", async () => {
    // 强制清零该用户与空间的全部余额来源，使扣费前即被硬阻断（不触发模型）：
    //  - 空间配额：显式创建为 0（避免 getOrCreateQuota 首次读取时建出「无限额度」配额）
    //  - 用户钱包、个人赠送桶：清零
    //  - 预置「已用赠送」去重流水（GIFT_REGISTER:<userId>:<ym>#1），阻止执行中按 idempotencyKey 自动补发的 100 注册赠送点
    const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
    const ml = await prisma.membershiplevel.findFirst({ select: { id: true } });
    await prisma.workspacequota.upsert({
      where: { workspaceId: poorWorkspaceId },
      create: { id: randomUUID(), workspaceId: poorWorkspaceId, membershipLevelId: ml?.id || "FREE", tokenBalance: 0, updatedAt: new Date() },
      update: { tokenBalance: 0 },
    });
    await prisma.userwallet.upsert({
      where: { userId: poorUserId },
      create: { id: randomUUID(), userId: poorUserId, balance: 0, updatedAt: new Date() },
      update: { balance: 0 },
    });
    await prisma.pointgrant.updateMany({ where: { userId: poorUserId }, data: { remaining: 0, status: "EXHAUSTED" } });
    await prisma.pointledger.create({
      data: {
        id: randomUUID(),
        direction: "IN",
        type: "GIFT_REGISTER",
        scope: "PERSONAL_GIFT",
        userId: poorUserId,
        workspaceId: poorWorkspaceId,
        points: BigInt(0),
        balanceAfter: BigInt(0),
        title: "测试去重：已用注册赠送",
        idempotencyKey: `GIFT_REGISTER:${poorUserId}:${ym}#1`,
      },
    }).catch(() => {});

    const res = await POST(postReq(poorKey, { workspaceId: poorWorkspaceId, componentId: C07, inputMaterial: SAMPLE_INPUT }));
    assert.equal(res.status, 400);
    const j = await res.json();
    assert.equal(j.error, "POINTS_INSUFFICIENT");
  });
  test("5) 限流触发 → 429 RATE_LIMITED", async () => {
    await prisma.systemconfig.upsert({
      where: { key: "OPEN_API_RATE_LIMIT_PER_KEY_PER_MIN" },
      create: { key: "OPEN_API_RATE_LIMIT_PER_KEY_PER_MIN", value: "1" },
      update: { value: "1" },
    });
    const k = (await makeApiKey(superUserId, "E1-test-ratelimit")).apiKey;
    const r1 = await POST(postReq(k, { workspaceId }));
    assert.ok([400, 200, 409].includes(r1.status), `首次请求不应被限流，实际 ${r1.status}`);
    const r2 = await POST(postReq(k, { workspaceId }));
    assert.equal(r2.status, 429);
    const j2 = await r2.json();
    assert.equal(j2.error, "RATE_LIMITED");
    await prisma.apikey.deleteMany({ where: { name: "E1-test-ratelimit" } }).catch(() => {});
  });
});
