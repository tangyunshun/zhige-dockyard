/**
 * 路由级上游错误映射与退款验收（429 限流 / 5xx 上游异常）
 *
 * 使用**本地 mock 供应商**（明确区别于真实模型调用）强制返回 429 / 500，
 * 验证生产路由：HTTP 状态与错误码映射正确、失败必等额退款、失败不写成功任务。
 *
 * 说明：与 route-timeout.test.ts 同样需要在测试前后切换 provider baseUrl，故独立成文件（独立进程），
 * 并严格在 finally/after 中还原真实 baseUrl。绝不打印任何密钥或环境变量值。
 */

import test, { describe, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "net";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";

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

process.env.JWT_SECRET = process.env.JWT_SECRET || "zhige-test-explicit-jwt-secret-key-min-32-chars!";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const C07 = "C07";
const MAGIC_PROVIDER = "MagicAI";

let mockServer: http.Server;
let mockPort = 0;

/** mock 供应商：URL 含 429 → 429；否则 → 500 */
function startMockServer(): Promise<void> {
  mockServer = http.createServer((req, res) => {
    req.on("data", () => {});
    req.on("end", () => {
      const isRateLimited = (req.url || "").includes("429");
      res.writeHead(isRateLimited ? 429 : 500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: isRateLimited ? "rate limited" : "upstream boom" } }));
    });
  });
  return new Promise<void>((resolve) =>
    mockServer.listen(0, "127.0.0.1", () => {
      mockPort = (mockServer.address() as AddressInfo).port;
      resolve();
    }),
  );
}

const realBase = process.env.MODEL_BASE_URL;
after(async () => {
  try {
    mockServer?.close();
  } catch {
    /* ignore */
  }
  if (realBase) {
    await prisma.modelprovider.updateMany({ where: { name: MAGIC_PROVIDER }, data: { baseUrl: realBase } }).catch(() => {});
  }
});

async function setupFixture() {
  const s = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_upe_${s}`;
  const workspaceId = `ws_upe_${s}`;
  const balance = BigInt(10000);
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `upe_${s}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
  await prisma.workspacemember.create({ data: { id: `m_${s}`, userId, workspaceId, role: "OWNER", monthlyTokenUsed: BigInt(0), tokenBalance: balance } });
  await prisma.userwallet.create({ data: { id: `w_${s}`, userId, balance } });
  await prisma.workspacequota.create({ data: { id: `q_${s}`, workspaceId, membershipLevelId: "FREE", tokenBalance: BigInt(0), updatedAt: new Date() } });
  await prisma.pointgrant.create({ data: { id: `g_${s}`, scope: "WALLET", userId, workspaceId: null, points: balance, remaining: balance, sourceType: "MANUAL", status: "ACTIVE" } });
  const userToken = await new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(JWT_SECRET);
  const cleanup = async () => {
    await prisma.refundrecovery.deleteMany({ where: { userId } });
    await prisma.pointledger.deleteMany({ where: { userId } });
    await prisma.pointgrant.deleteMany({ where: { userId } });
    await prisma.userwallet.deleteMany({ where: { userId } });
    await prisma.componenttask.deleteMany({ where: { userId } });
    await prisma.componentusage.deleteMany({ where: { workspaceId } });
    await prisma.workspacemember.deleteMany({ where: { workspaceId } });
    await prisma.workspacequota.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  };
  return { userId, workspaceId, userToken, cleanup };
}

describe("/api/studio 上游错误映射与退款（本地 mock 供应商）", { skip: !process.env.DATABASE_URL }, () => {
  for (const { kind, suffix, expectStatus, expectCode } of [
    { kind: "429 限流", suffix: "429", expectStatus: 429, expectCode: "MODEL_RATE_LIMITED" },
    { kind: "5xx 上游异常", suffix: "500", expectStatus: 502, expectCode: "MODEL_UPSTREAM_ERROR" },
  ]) {
    test(`${kind} → HTTP ${expectStatus} / ${expectCode} / 等额退款 / 不写成功任务`, async () => {
      const f = await setupFixture();
      try {
        if (!mockServer) await startMockServer();
        await prisma.modelprovider.update({
          where: { name: MAGIC_PROVIDER },
          data: { baseUrl: `http://127.0.0.1:${mockPort}/v1/${suffix}` },
        });

        const { POST } = await import("../route");
        const req = new NextRequest("http://localhost:3000/api/studio", {
          method: "POST",
          headers: { Authorization: `Bearer ${f.userToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ action: "simulate", workspaceId: f.workspaceId, componentId: C07, inputMaterial: `触发 ${kind}。`, inputSource: { sourceType: "text" } }),
        });
        const res = await POST(req);
        const body = await res.json();

        assert.equal(res.status, expectStatus, `期望 HTTP ${expectStatus}，实际 ${res.status} body=${JSON.stringify(body).slice(0, 200)}`);
        assert.equal(body.success, false);
        assert.equal(body.code, expectCode);

        // 失败必须等额退款、且不得写成功任务
        const consumeRows = await prisma.pointledger.findMany({ where: { userId: f.userId, type: "CONSUME" }, select: { points: true, taskId: true } });
        const refundRows = await prisma.pointledger.findMany({ where: { userId: f.userId, type: "REFUND", points: { gt: 0 } }, select: { points: true } });
        const consumeSum = consumeRows.reduce((s, r) => s + Number(r.points), 0);
        const refundSum = refundRows.reduce((s, r) => s + Number(r.points), 0);
        assert.ok(consumeSum > 0, "失败前必须真实扣过算力点");
        assert.equal(refundSum, consumeSum, "上游失败必须等额退款");
        assert.equal(refundRows.length, 1, "真实退款流水应只有一条");
        assert.equal(await prisma.componenttask.count({ where: { userId: f.userId } }), 0, "上游失败不得写成功任务");
      } finally {
        if (realBase) {
          await prisma.modelprovider.updateMany({ where: { name: MAGIC_PROVIDER }, data: { baseUrl: realBase } }).catch(() => {});
        }
        await f.cleanup();
      }
    });
  }
});
