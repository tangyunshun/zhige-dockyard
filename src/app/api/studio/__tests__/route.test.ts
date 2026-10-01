import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "net";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { reconstructConsumeResult, refundConsumedPoints } from "@/lib/credit-service";

/**
 * /api/studio 路由级**真实**验收
 *
 * 说明与约束：
 *  - 使用真实数据库 + 真实 JWT 测试会话 + 临时测试用户/空间/算力；
 *  - 真实调用已注册的 MagicAI/gpt-5.5（真实外部 HTTP）；
 *  - 429 / 5xx 场景使用**本地 mock 供应商**（临时改写 MagicAI 的 baseUrl，测试后恢复），
 *    仅用于验证路由层退款闭环，不代表真实供应商行为；
 *  - 不输出 API Key，不输出模型响应全文，只记录状态码/错误码/taskId/余额与流水变化；
 *  - 测试结束清理临时数据，不触碰真实用户数据。
 */

// ---- 环境准备（必须在导入路由之前）----
const ROUTE_MODEL_TIMEOUT_ENV = "MODEL_TIMEOUT_MS";
function loadEnvLocal() {
  // tsx 不会自动加载 .env.local；这里仅把缺失的键补进 process.env（不打印任何值）
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
process.env[ROUTE_MODEL_TIMEOUT_ENV] = process.env[ROUTE_MODEL_TIMEOUT_ENV] || "60000";
process.env.MODEL_ALLOW_INSECURE_LOCAL = "true"; // 仅测试：允许本地 mock 的 http 端点

const TEST_JWT_SECRET_STRING = "zhige-test-explicit-jwt-secret-key-min-32-chars!";
process.env.JWT_SECRET = process.env.JWT_SECRET || TEST_JWT_SECRET_STRING;
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const C07 = "C07";
const MAGIC_PROVIDER = "MagicAI";

let mockServer: http.Server;
let mockPort = 0;
let mockStatus = 500;

function startMockServer(): Promise<void> {
  mockServer = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(mockStatus, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "mock upstream error", status: mockStatus }));
    });
  });
  return new Promise<void>((r) => mockServer.listen(0, "127.0.0.1", () => {
    mockPort = (mockServer.address() as AddressInfo).port;
    r();
  }));
}

async function ensureMockServer(status: number): Promise<void> {
  mockStatus = status;
  if (mockServer?.listening) return;
  await startMockServer();
}

after(async () => {
  try {
    mockServer?.close();
  } catch {
    /* ignore */
  }
  // 恢复真实的 MagicAI 供应商配置（基址与密钥来源）
  const realBase = process.env.MODEL_BASE_URL || "https://jayce.sky1818.com/v1";
  await prisma.modelprovider.updateMany({ where: { name: MAGIC_PROVIDER }, data: { baseUrl: realBase } }).catch(() => {});
  await prisma.modelprovider.updateMany({ where: { name: MAGIC_PROVIDER }, data: { apiKeyEnv: "MODEL_API_KEY" } }).catch(() => {});
  delete process.env.IT_BAD_KEY;
});

async function token(uid: string) {
  return new SignJWT({ userId: uid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(JWT_SECRET);
}

interface Fixture {
  uid: string;
  wid: string;
  walletId: string;
  qid: string;
  grantId: string;
  cleanup: () => Promise<void>;
}

async function createFixture(balance: bigint = BigInt(1000)): Promise<Fixture> {
  const uid = "it_st_u_" + randomUUID();
  const wid = "it_st_ws_" + randomUUID();
  const walletId = "it_st_w_" + randomUUID();
  const qid = "it_st_q_" + randomUUID();
  const grantId = "it_st_g_" + randomUUID();
  const now = new Date();
  await prisma.user.create({ data: { id: uid, password: "x", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: wid, name: "it-studio", type: "PERSONAL", ownerId: uid, updatedAt: now } });
  await prisma.workspacemember.create({
    data: { id: "it_st_m_" + randomUUID(), userId: uid, workspaceId: wid, role: "OWNER", monthlyTokenUsed: BigInt(0), tokenBalance: balance },
  });
  await prisma.userwallet.create({ data: { id: walletId, userId: uid, balance } });
  await prisma.workspacequota.create({
    data: { id: qid, workspaceId: wid, membershipLevelId: "FREE", tokenBalance: BigInt(0), updatedAt: now },
  });
  await prisma.pointgrant.create({
    data: {
      id: grantId,
      scope: "WALLET",
      userId: uid,
      workspaceId: null,
      points: balance,
      remaining: balance,
      sourceType: "MANUAL",
      status: "ACTIVE",
    },
  });
  const cleanup = async () => {
    await prisma.refundrecovery.deleteMany({ where: { userId: uid } }).catch(() => {});
    await prisma.pointledger.deleteMany({ where: { userId: uid } }).catch(() => {});
    await prisma.componenttask.deleteMany({ where: { userId: uid } }).catch(() => {});
    await prisma.componentusage.deleteMany({ where: { workspaceId: wid } }).catch(() => {});
    await prisma.pointgrant.deleteMany({ where: { id: grantId } }).catch(() => {});
    await prisma.userwallet.deleteMany({ where: { id: walletId } }).catch(() => {});
    await prisma.workspacequota.deleteMany({ where: { id: qid } }).catch(() => {});
    await prisma.workspacemember.deleteMany({ where: { workspaceId: wid } }).catch(() => {});
    await prisma.workspace.deleteMany({ where: { id: wid } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: uid } }).catch(() => {});
  };
  return { uid, wid, walletId, qid, grantId, cleanup };
}

async function callSimulate(params: {
  uid: string;
  wid: string;
  json?: Record<string, unknown>;
  file?: { name: string; type: string; data: Buffer };
}) {
  const { POST } = await import("../route");
  const t = await token(params.uid);
  const headers = { Authorization: `Bearer ${t}` };
  if (params.file) {
    const fd = new FormData();
    fd.append("action", "simulate");
    fd.append("workspaceId", params.wid);
    fd.append("componentId", C07);
    fd.append("inputSource", JSON.stringify({ sourceType: "file" }));
    fd.append("file", new File([new Uint8Array(params.file.data)], params.file.name, { type: params.file.type }));
    const req = new NextRequest("http://localhost:3000/api/studio", { method: "POST", body: fd, headers });
    return { res: await POST(req), body: null as any };
  }
  const req = new NextRequest("http://localhost:3000/api/studio", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "simulate", workspaceId: params.wid, componentId: C07, ...params.json }),
  });
  const res = await POST(req);
  return { res, body: await res.clone().json().catch(() => null) };
}

async function balances(f: Fixture) {
  const [w, g] = await Promise.all([
    prisma.userwallet.findUnique({ where: { id: f.walletId }, select: { balance: true } }),
    prisma.pointgrant.findUnique({ where: { id: f.grantId }, select: { remaining: true } }),
  ]);
  return { wallet: Number(w!.balance), grant: Number(g!.remaining) };
}

/** 扣点可能来自钱包或分桶，断言统一看总额变化 */
async function totalBalance(f: Fixture): Promise<number> {
  const b = await balances(f);
  return b.wallet + b.grant;
}

async function consumeSum(taskId: string): Promise<number> {
  const rows = await prisma.pointledger.findMany({ where: { taskId, type: "CONSUME" }, select: { points: true } });
  return rows.reduce((s, r) => s + Number(r.points), 0);
}

async function refundSum(taskId: string): Promise<number> {
  const rows = await prisma.pointledger.findMany({ where: { taskId, type: "REFUND" }, select: { points: true } });
  return rows.reduce((s, r) => s + Number(r.points), 0);
}

/** 只统计「真实退款到账」流水（points>0），排除 0 点的月度回滚标记 */
async function refundCount(taskId: string): Promise<number> {
  return prisma.pointledger.count({ where: { taskId, type: "REFUND", points: { gt: 0 } } });
}

/** 从消费流水推导 taskId（失败响应体不保证携带 taskId） */
async function consumeTaskId(uid: string): Promise<string> {
  const row = await prisma.pointledger.findFirst({
    where: { userId: uid, type: "CONSUME" },
    select: { taskId: true },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(row?.taskId, "必须存在带 taskId 的消费流水");
  return row!.taskId!;
}

/** 对该任务重复发起一次退款，返回本次实际退款点数（幂等应为 0） */
async function refundAgain(uid: string, wid: string, taskId: string): Promise<number> {
  const cr = await reconstructConsumeResult(`CONSUME:${taskId}`, uid, wid);
  assert.ok(cr, "应能重建消费结果用于重复退款验证");
  const again = await refundConsumedPoints({ consumeResult: cr!, userId: uid, workspaceId: wid, taskId });
  return again.refunded;
}

describe("/api/studio 路由级真实验收（真实模型 + 临时测试数据）", { skip: !process.env.DATABASE_URL }, () => {
  test("① 文本输入真实模型成功：executionMode/usage/artifacts/余额扣点正确", async () => {
    const f = await createFixture();
    const before = await totalBalance(f);
    try {
      const { res, body } = await callSimulate({
        uid: f.uid,
        wid: f.wid,
        json: { inputMaterial: "请用一句话说明什么是需求评审。", inputSource: { sourceType: "text" } },
      });
      console.log(
        `[route-accept] ① HTTP=${res.status} success=${body?.success} executionMode=${body?.executionMode} usage=${JSON.stringify(body?.usage)} artifactLen=${body?.artifacts?.[0]?.content?.length ?? 0}`,
      );
      assert.equal(res.status, 200, `文本真实调用应 200，实际 ${res.status} body=${JSON.stringify(body)?.slice(0, 200)}`);
      assert.equal(body.success, true);
      assert.equal(body.executionMode, "REAL_MODEL");
      assert.equal(body.provider?.id, MAGIC_PROVIDER);
      assert.ok(body.usage?.totalTokens > 0, "usage 必须落库");
      assert.ok(Array.isArray(body.artifacts) && body.artifacts[0]?.content?.length > 0, "artifacts 必须保存模型原文");
      assert.equal(body.task?.executionMode, "REAL_MODEL");

      const after = await totalBalance(f);
      const consumeRows = await prisma.pointledger.findMany({
        where: { taskId: body.task.id, type: "CONSUME" },
        select: { points: true },
      });
      const consumed = consumeRows.reduce((s, r) => s + Number(r.points), 0);
      console.log(
        `[route-accept] ① before=${before} after=${after} cost=${body.cost} consumed=${consumed} consumeRows=${consumeRows.length} tokenBalance=${body.tokenBalance}`,
      );
      assert.ok(body.cost > 0, "cost 必须为正");
      assert.equal(consumed, body.cost, "消费流水总额必须等于接口返回 cost");
      assert.equal(consumeRows.length, 1, "同一任务只能产生一条消费流水（幂等）");

      const task = await prisma.componenttask.findUnique({ where: { id: body.task.id }, select: { config: true, result: true } });
      const cfg = task?.config as any;
      assert.equal(cfg?.executionMode, "REAL_MODEL");
      assert.equal(cfg?.pricingSnapshot?.pricingSource, "MODEL_REGISTRY", "价格快照必须来自注册表");
      const consumeCount = await prisma.pointledger.count({ where: { taskId: body.task.id, type: "CONSUME" } });
      assert.equal(consumeCount, 1);
    } finally {
      await f.cleanup();
    }
  });

  test("② 文件 multipart 真实成功：服务端解析文本并调用真实模型", async () => {
    const f = await createFixture();
    const before = await totalBalance(f);
    try {
      const { res } = await callSimulate({
        uid: f.uid,
        wid: f.wid,
        file: {
          name: "meeting-notes.txt",
          type: "text/plain",
          data: Buffer.from("会议纪要：需要支持导出 PRD，负责人张三，时间下周五。", "utf8"),
        },
      });
      const body = await res.json();
      console.log(
        `[route-accept] ② HTTP=${res.status} success=${body?.success} executionMode=${body?.executionMode} usage=${JSON.stringify(body?.usage)} artifactLen=${body?.artifacts?.[0]?.content?.length ?? 0}`,
      );
      assert.equal(res.status, 200, `multipart 应 200，实际 ${res.status} body=${JSON.stringify(body)?.slice(0, 200)}`);
      assert.equal(body.success, true);
      assert.equal(body.executionMode, "REAL_MODEL");
      assert.ok(body.artifacts?.[0]?.content?.length > 0);
      const after = await totalBalance(f);
      const consumeRows = await prisma.pointledger.findMany({
        where: { taskId: body.task.id, type: "CONSUME" },
        select: { points: true },
      });
      const consumed = consumeRows.reduce((s, r) => s + Number(r.points), 0);
      console.log(
        `[route-accept] ② before=${before} after=${after} cost=${body.cost} consumed=${consumed} tokenBalance=${body.tokenBalance}`,
      );
      assert.equal(consumed, body.cost, "multipart 任务消费流水必须等于 cost");
    } finally {
      await f.cleanup();
    }
  });

  test("③ 无文字输入被拒绝且不扣点（服务端解析后无文本）", async () => {
    const f = await createFixture();
    const before = await totalBalance(f);
    try {
      // 仅含空白字符的文件：服务端解析后无有效文本 → INPUT_TEXT_NOT_EXTRACTED
      const { res } = await callSimulate({
        uid: f.uid,
        wid: f.wid,
        file: { name: "blank.txt", type: "text/plain", data: Buffer.from("   \n\t  \n", "utf8") },
      });
      const body = await res.json();
      console.log(`[route-accept] ③ HTTP=${res.status} code=${body?.code ?? "-"}`);
      assert.ok(res.status === 400 || res.status === 403, `应拒绝，实际 ${res.status}`);
      assert.ok(
        ["INPUT_TEXT_NOT_EXTRACTED", "INPUT_TOO_LARGE", "INPUT_SOURCE_INVALID"].includes(body.code),
        `应为输入类错误码，实际 ${body.code}`,
      );
      const after = await totalBalance(f);
      const rows = await prisma.pointledger.findMany({
        where: { userId: f.uid },
        select: { type: true, direction: true, points: true, scope: true, idempotencyKey: true, taskId: true },
      });
      console.log(
        `[route-accept] ③ before=${before} after=${after} ledger=${JSON.stringify(
          rows.map((r) => ({ ...r, points: Number(r.points) })),
        )}`,
      );
      assert.equal(after, before, "被拒绝的任务不得扣点");
      assert.equal(rows.filter((r) => r.type === "CONSUME").length, 0, "不得产生消费流水");
    } finally {
      await f.cleanup();
    }
  });

  test("④ 真实 401 失败 → 路由原路退款，且重复退款幂等", async () => {
    const f = await createFixture();
    try {
      // 临时把 MagicAI 的密钥来源指向一个无效密钥环境变量（不触碰真实密钥）
      process.env.IT_BAD_KEY = "sk-invalid-key-for-401-route-test";
      await prisma.modelprovider.update({ where: { name: MAGIC_PROVIDER }, data: { apiKeyEnv: "IT_BAD_KEY" } });

      const { res, body } = await callSimulate({
        uid: f.uid,
        wid: f.wid,
        json: { inputMaterial: "触发 401 退款。", inputSource: { sourceType: "text" } },
      });
      console.log(`[route-accept] ④ HTTP=${res.status} success=${body?.success} code=${body?.code ?? "-"}`);
      assert.equal(res.status, 401, `401 应返回 HTTP 401，实际 ${res.status}`);
      assert.equal(body.success, false);
      assert.equal(body.code, "MODEL_AUTH_ERROR");

      const taskId = await consumeTaskId(f.uid);
      assert.equal(await consumeSum(taskId), 100, "失败前必须真实产生过消费流水（100 点）");
      const refunded = await refundSum(taskId);
      assert.equal(refunded, 100, "必须产生等额退款流水");
      assert.equal(await refundAgain(f.uid, f.wid, taskId), 0, "第二次退款必须 refunded=0");
      assert.equal(await refundCount(taskId), 1, "重复退款不得增加退款流水");
      assert.equal(await refundSum(taskId), 100, "重复退款后退款总额不得增加");
    } finally {
      await prisma.modelprovider.update({ where: { name: MAGIC_PROVIDER }, data: { apiKeyEnv: "MODEL_API_KEY" } }).catch(() => {});
      delete process.env.IT_BAD_KEY;
      await f.cleanup();
    }
  });

  test("⑤ 5xx 失败（本地 mock 供应商）→ 路由退款；重复退款不重复到账", async () => {
    const f = await createFixture();
    const realBase = process.env.MODEL_BASE_URL;
    try {
      await ensureMockServer(503);
      await prisma.modelprovider.update({
        where: { name: MAGIC_PROVIDER },
        data: { baseUrl: `http://127.0.0.1:${mockPort}/v1` },
      });

      const { res, body } = await callSimulate({
        uid: f.uid,
        wid: f.wid,
        json: { inputMaterial: "触发 5xx 退款。", inputSource: { sourceType: "text" } },
      });
      console.log(`[route-accept] ⑤ HTTP=${res.status} success=${body?.success} code=${body?.code ?? "-"}`);
      assert.equal(res.status, 502, `5xx 应返回 HTTP 502，实际 ${res.status}`);
      assert.equal(body.success, false);
      assert.equal(body.code, "MODEL_UPSTREAM_ERROR");

      const taskId = await consumeTaskId(f.uid);
      assert.equal(await consumeSum(taskId), 100, "5xx 失败前必须真实扣过 100 点");
      assert.equal(await refundSum(taskId), 100, "5xx 失败必须等额退款");
      assert.equal(await refundAgain(f.uid, f.wid, taskId), 0, "第二次退款必须 refunded=0");
      assert.equal(await refundCount(taskId), 1, "重复退款不得增加退款流水");
    } finally {
      const restoreBase = process.env.MODEL_BASE_URL || "https://jayce.sky1818.com/v1";
      await prisma.modelprovider.update({ where: { name: MAGIC_PROVIDER }, data: { baseUrl: restoreBase } }).catch(() => {});
      await f.cleanup();
    }
  });

  test("⑥ 429 限流失败（本地 mock）→ MODEL_RATE_LIMITED + 退款 + 幂等", async () => {
    const f = await createFixture();
    try {
      await ensureMockServer(429);
      await prisma.modelprovider.update({
        where: { name: MAGIC_PROVIDER },
        data: { baseUrl: `http://127.0.0.1:${mockPort}/v1` },
      });

      const { res, body } = await callSimulate({
        uid: f.uid,
        wid: f.wid,
        json: { inputMaterial: "触发 429 退款。", inputSource: { sourceType: "text" } },
      });
      console.log(`[route-accept] ⑥ HTTP=${res.status} success=${body?.success} code=${body?.code ?? "-"}`);
      assert.equal(res.status, 429, `429 应返回 HTTP 429，实际 ${res.status}`);
      assert.equal(body.success, false);
      assert.equal(body.code, "MODEL_RATE_LIMITED");

      const taskId = await consumeTaskId(f.uid);
      assert.equal(await consumeSum(taskId), 100, "限流失败前必须真实扣过 100 点");
      assert.equal(await refundSum(taskId), 100, "限流失败必须等额退款");
      assert.equal(await refundAgain(f.uid, f.wid, taskId), 0, "第二次退款必须 refunded=0");
      assert.equal(await refundCount(taskId), 1, "重复退款不得增加退款流水");
    } finally {
      const restoreBase = process.env.MODEL_BASE_URL || "https://jayce.sky1818.com/v1";
      await prisma.modelprovider.update({ where: { name: MAGIC_PROVIDER }, data: { baseUrl: restoreBase } }).catch(() => {});
      await f.cleanup();
    }
  });

  test("⑦ 无文字图片被拒绝且不扣点（真实路由 + 确定性 OCR 测试替身）", async () => {
    const f = await createFixture();
    process.env.TEXT_EXTRACT_TEST_OCR_EMPTY = "true"; // 确定性 OCR 替身：视为无文本（非真实 OCR 验收）
    try {
      // 有效 1x1 PNG
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
        "base64",
      );
      const { res } = await callSimulate({
        uid: f.uid,
        wid: f.wid,
        file: { name: "blank-image.png", type: "image/png", data: png },
      });
      const body = await res.json();
      console.log(`[route-accept] ⑦ HTTP=${res.status} code=${body?.code ?? "-"}`);
      assert.equal(res.status, 400, `无文字图片应返回 400，实际 ${res.status}`);
      assert.equal(body.code, "INPUT_TEXT_NOT_EXTRACTED");

      const consume = await prisma.pointledger.count({ where: { userId: f.uid, type: "CONSUME" } });
      assert.equal(consume, 0, "无文字图片不得产生消费流水（不扣点）");
    } finally {
      delete process.env.TEXT_EXTRACT_TEST_OCR_EMPTY;
      await f.cleanup();
    }
  });
});
