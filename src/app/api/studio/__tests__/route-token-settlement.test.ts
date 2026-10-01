import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "net";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { grantPoints } from "@/lib/credit-service";

/**
 * 路由级真实 Token 结算 (Phase 2A 收口专项集成测试)
 * 验证：
 * 1. TEST_TOKEN_SETTLEMENT_ENABLED=true 时，结算成功返回 HTTP 200，billingMode="REAL_SETTLEMENT"，settlementStatus="SETTLED"；
 * 2. 任务持久化 config.billingMode 记录为 "REAL_SETTLEMENT"；
 * 3. 结算异常或需要复核时（REQUIRES_REVIEW / PENDING_RECOVERY），强断言绝不得返回 success=true，必须返回 HTTP 202 并暴露结算状态；
 * 4. 模型调用失败时触发释放，预扣点数全额原路退回，hold 状态流转为 RELEASED。
 */

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
const originalSettlementEnv = process.env.TEST_TOKEN_SETTLEMENT_ENABLED;
process.env.TEST_TOKEN_SETTLEMENT_ENABLED = "true";

const TEST_JWT_SECRET_STRING = "zhige-test-explicit-jwt-secret-key-min-32-chars!";
process.env.JWT_SECRET = process.env.JWT_SECRET || TEST_JWT_SECRET_STRING;
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const C07 = "C07";
const MAGIC_PROVIDER = "MagicAI";

let mockServer: http.Server;
let mockPort = 0;
let mockResponseStatusCode = 200;
let mockResponseBody: any = {
  id: "chatcmpl-mock-settle-1",
  choices: [{ message: { content: "【执行成功】知阁 Token 真实结算测试完成" } }],
  usage: {
    prompt_tokens: 1000,
    completion_tokens: 500,
    total_tokens: 1500,
  },
};

function startMockServer(): Promise<void> {
  mockServer = http.createServer((req, res) => {
    req.on("data", () => {});
    req.on("end", () => {
      res.writeHead(mockResponseStatusCode, { "Content-Type": "application/json" });
      res.end(JSON.stringify(mockResponseBody));
    });
  });
  return new Promise<void>((resolve) => {
    mockServer.listen(0, "127.0.0.1", () => {
      mockPort = (mockServer.address() as AddressInfo).port;
      resolve();
    });
  });
}

let originalBaseUrl: string | undefined;
let originalPricing: any = null;
let targetDeploymentId: string | undefined;

before(async () => {
  await startMockServer();
  const provider = await prisma.modelprovider.findFirst({ where: { name: MAGIC_PROVIDER } });
  if (provider) {
    originalBaseUrl = provider.baseUrl;
    await prisma.modelprovider.update({
      where: { id: provider.id },
      data: { baseUrl: `http://127.0.0.1:${mockPort}/v1` },
    });
  }

  const deployment = await prisma.modeldeployment.findFirst({
    where: { provider: { name: MAGIC_PROVIDER } },
  });
  if (deployment) {
    targetDeploymentId = deployment.id;
    originalPricing = await prisma.modelpricing.findUnique({
      where: { deploymentId: deployment.id },
    });
    await prisma.modelpricing.upsert({
      where: { deploymentId: deployment.id },
      create: {
        id: randomUUID(),
        deploymentId: deployment.id,
        currency: "CNY",
        costInputMicrosPerMillion: 5_000_000,
        costOutputMicrosPerMillion: 30_000_000,
        priceInputMicrosPerMillion: 10_000_000,
        priceOutputMicrosPerMillion: 60_000_000,
        priceSource: "VERIFIED",
        priceStatus: "VERIFIED",
        priceVersion: 1,
        effectiveFrom: new Date(),
        updatedAt: new Date(),
      },
      update: {
        costInputMicrosPerMillion: 5_000_000,
        costOutputMicrosPerMillion: 30_000_000,
        priceInputMicrosPerMillion: 10_000_000,
        priceOutputMicrosPerMillion: 60_000_000,
        costCacheReadMicrosPerMillion: null,
        costCacheWriteMicrosPerMillion: null,
        priceCacheReadMicrosPerMillion: null,
        priceCacheWriteMicrosPerMillion: null,
        priceSource: "VERIFIED",
        priceStatus: "VERIFIED",
        priceVersion: 1,
        updatedAt: new Date(),
      },
    });
  }
});

after(async () => {
  if (originalSettlementEnv === undefined) {
    delete process.env.TEST_TOKEN_SETTLEMENT_ENABLED;
  } else {
    process.env.TEST_TOKEN_SETTLEMENT_ENABLED = originalSettlementEnv;
  }
  try {
    mockServer?.close();
  } catch {
    /* ignore */
  }
  if (originalBaseUrl) {
    await prisma.modelprovider.updateMany({
      where: { name: MAGIC_PROVIDER },
      data: { baseUrl: originalBaseUrl },
    }).catch(() => {});
  }
  if (targetDeploymentId && originalPricing) {
    await prisma.modelpricing.update({
      where: { deploymentId: targetDeploymentId },
      data: {
        priceStatus: originalPricing.priceStatus,
        priceSource: originalPricing.priceSource,
        costInputMicrosPerMillion: originalPricing.costInputMicrosPerMillion,
        costOutputMicrosPerMillion: originalPricing.costOutputMicrosPerMillion,
        priceInputMicrosPerMillion: originalPricing.priceInputMicrosPerMillion,
        priceOutputMicrosPerMillion: originalPricing.priceOutputMicrosPerMillion,
        updatedAt: new Date(),
      },
    }).catch(() => {});
  }
});

describe("/api/studio 真实 Token 结算路由集成测试 (Phase 2A 收口验收)", { skip: !process.env.DATABASE_URL }, () => {
  test("1. 真实结算成功：返回 HTTP 200，billingMode 为 REAL_SETTLEMENT，双表状态为 SETTLED", async () => {
    const { POST } = await import("../route");
    const uid = "settle_u_" + randomUUID();
    const wid = "settle_ws_" + randomUUID();
    const now = new Date();

    await prisma.user.create({ data: { id: uid, password: "x", role: "USER", status: "active" } });
    await prisma.workspace.create({ data: { id: wid, name: "settle-ws", type: "PERSONAL", ownerId: uid, updatedAt: now } });
    await prisma.workspacemember.create({
      data: { id: "settle_m_" + randomUUID(), userId: uid, workspaceId: wid, role: "OWNER", monthlyTokenUsed: BigInt(0), tokenBalance: BigInt(0) },
    });

    // 为用户钱包充值 100 点
    await grantPoints({
      userId: uid,
      scope: "WALLET",
      points: 100,
      title: "测试充值",
      sourceType: "ONLINE_RECHARGE",
      type: "RECHARGE",
    });

    const token = await new SignJWT({ userId: uid })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(JWT_SECRET);

    mockResponseStatusCode = 200;
    mockResponseBody = {
      id: "chatcmpl-mock-settle-ok",
      choices: [{ message: { content: "【知阁】智能拆解任务完成" } }],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 500,
        total_tokens: 1500,
      },
    };

    const req = new NextRequest("http://127.0.0.1:3000/api/studio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "simulate",
        workspaceId: wid,
        componentId: C07,
        inputMaterial: "这是一段知阁真实结算测试用料，包含详细的需求说明与架构草案。",
        inputSource: { sourceType: "text" },
        taskName: "真实结算单体验收任务",
      }),
    });

    const res = await POST(req);
    const json = await res.json();
    console.log("[route-token-settlement] res.status:", res.status, "body:", json);
    assert.equal(res.status, 200, "真实结算成功时必须返回 HTTP 200");
    assert.equal(json.success, true, "结算成功返回 success=true");
    assert.equal(json.billingMode, "REAL_SETTLEMENT", "强断言：billingMode 必须为 REAL_SETTLEMENT");
    assert.equal(json.settlementStatus, "SETTLED", "结算状态必须为 SETTLED");
    assert.ok(typeof json.actualPoints === "number", "actualPoints 必须为数字类型");
    assert.ok(json.task?.id, "必须包含 taskId");

    // 数据库双表状态与任务记录持久化强校验
    const taskId = json.task.id;
    const holdRow = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
    const settleRow = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
    assert.equal(holdRow.status, "SETTLED", "hold 表状态必须流转为 SETTLED");
    assert.equal(settleRow.status, "SETTLED", "settlement 表状态必须流转为 SETTLED");

    const taskRow = await prisma.componenttask.findUniqueOrThrow({ where: { id: taskId } });
    const configObj = taskRow.config as any;
    assert.equal(configObj.billingMode, "REAL_SETTLEMENT", "componenttask.config 中的 billingMode 必须为 REAL_SETTLEMENT");
  });

  test("2. 结算异常或转入复核时：强断言绝不返回 success=true，返回 HTTP 202 明确告知待对账", async () => {
    const { POST } = await import("../route");
    const uid = "settle_rev_u_" + randomUUID();
    const wid = "settle_rev_ws_" + randomUUID();
    const now = new Date();

    await prisma.user.create({ data: { id: uid, password: "x", role: "USER", status: "active" } });
    await prisma.workspace.create({ data: { id: wid, name: "settle-rev-ws", type: "PERSONAL", ownerId: uid, updatedAt: now } });
    await prisma.workspacemember.create({
      data: { id: "settle_rev_m_" + randomUUID(), userId: uid, workspaceId: wid, role: "OWNER", monthlyTokenUsed: BigInt(0), tokenBalance: BigInt(0) },
    });

    await grantPoints({
      userId: uid,
      scope: "WALLET",
      points: 100,
      title: "测试充值",
      sourceType: "ONLINE_RECHARGE",
      type: "RECHARGE",
    });

    const token = await new SignJWT({ userId: uid })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(JWT_SECRET);

    // Mock 模型返回非法负数 token 触发 completeSettlement 内部校验异常进入 REQUIRES_REVIEW
    mockResponseStatusCode = 200;
    mockResponseBody = {
      id: "chatcmpl-mock-settle-invalid-usage",
      choices: [{ message: { content: "异常 usage 输出" } }],
      usage: {
        prompt_tokens: -999,
        completion_tokens: -1,
        total_tokens: -1000,
      },
    };

    const req = new NextRequest("http://127.0.0.1:3000/api/studio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "simulate",
        workspaceId: wid,
        componentId: C07,
        inputMaterial: "异常用量测试材料",
        inputSource: { sourceType: "text" },
        taskName: "转入人工复核结算测试任务",
      }),
    });

    const res = await POST(req);
    // 强断言：当结算处于 REQUIRES_REVIEW 时，必须返回 HTTP 202，且 success 绝对不能为 true
    assert.equal(res.status, 202, "未完全结算成功的任务必须返回 HTTP 202 状态码");

    const json = await res.json();
    assert.equal(json.success, false, "强断言：非 SETTLED 终态绝对不得返回 success=true");
    assert.equal(json.billingStatus, "REQUIRES_REVIEW", "结算状态必须为 REQUIRES_REVIEW");
    assert.equal(json.code, "BILLING_REQUIRES_REVIEW");
    assert.ok(json.task?.id, "仍需透传 task.id 方便追踪任务");

    // 数据库双表状态校验
    const taskId = json.taskId;
    const holdRow = await prisma.tokensettlementhold.findUniqueOrThrow({ where: { taskId } });
    const settleRow = await prisma.tokensettlement.findUniqueOrThrow({ where: { taskId } });
    assert.equal(holdRow.status, "REQUIRES_REVIEW", "hold 必须记录为 REQUIRES_REVIEW");
    assert.equal(settleRow.status, "REQUIRES_REVIEW", "settlement 必须记录为 REQUIRES_REVIEW");
  });

  test("3. 模型上游失败：触发 releaseSettlementHold 全额退款，状态流转为 RELEASED", async () => {
    const { POST } = await import("../route");
    const uid = "settle_fail_u_" + randomUUID();
    const wid = "settle_fail_ws_" + randomUUID();
    const now = new Date();

    await prisma.user.create({ data: { id: uid, password: "x", role: "USER", status: "active" } });
    await prisma.workspace.create({ data: { id: wid, name: "settle-fail-ws", type: "PERSONAL", ownerId: uid, updatedAt: now } });
    await prisma.workspacemember.create({
      data: { id: "settle_fail_m_" + randomUUID(), userId: uid, workspaceId: wid, role: "OWNER", monthlyTokenUsed: BigInt(0), tokenBalance: BigInt(0) },
    });

    await grantPoints({
      userId: uid,
      scope: "WALLET",
      points: 100,
      title: "测试充值",
      sourceType: "ONLINE_RECHARGE",
      type: "RECHARGE",
    });

    const token = await new SignJWT({ userId: uid })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("2h")
      .sign(JWT_SECRET);

    // Mock 模型服务端抛 500
    mockResponseStatusCode = 500;
    mockResponseBody = { error: { message: "Internal Server Error in Upstream Model" } };

    const req = new NextRequest("http://127.0.0.1:3000/api/studio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "simulate",
        workspaceId: wid,
        componentId: C07,
        inputMaterial: "上游错误测试材料",
        inputSource: { sourceType: "text" },
        taskName: "模型调用失败释放预扣测试",
      }),
    });

    const res = await POST(req);
    assert.ok(res.status >= 500, "模型失败必须返回 5xx 错误码");

    const json = await res.json();
    assert.equal(json.success, false);

    // 验证用户钱包余额依然是 100 点（全额原路退还释放）
    const wallet = await prisma.userwallet.findUniqueOrThrow({ where: { userId: uid } });
    assert.equal(wallet.balance, BigInt(100), "模型失败释放预扣后，钱包可用余额必须保持 100 点不变");
  });
});
