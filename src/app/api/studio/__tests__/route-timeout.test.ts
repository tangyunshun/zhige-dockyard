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
 * 路由级**超时**退款验收（独立进程/独立文件）。
 *
 * 关键点：模型调用超时常量在 model-adapter 模块加载时读取，
 * 因此必须在导入路由之前把 MODEL_TIMEOUT_MS 设为较小值（本文件单独运行，不影响其他测试）。
 * 使用延迟 mock 供应商强制超时，验证：HTTP 504 + MODEL_TIMEOUT + 等额退款 + 重复退款幂等。
 */

// 必须在 loadEnvLocal 之前设置，避免被 .env.local 的 180s 覆盖
process.env.MODEL_TIMEOUT_MS = "1500";

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

const TEST_JWT_SECRET_STRING = "zhige-test-explicit-jwt-secret-key-min-32-chars!";
process.env.JWT_SECRET = process.env.JWT_SECRET || TEST_JWT_SECRET_STRING;
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const C07 = "C07";
const MAGIC_PROVIDER = "MagicAI";

let slowServer: http.Server;
let slowPort = 0;

/** 延迟 8s 才响应的 mock（超过 1.5s 超时阈值） */
function startSlowServer(): Promise<void> {
  slowServer = http.createServer((req, res) => {
    req.on("data", () => {});
    req.on("end", () => {
      setTimeout(() => {
        try {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ choices: [{ message: { content: "late" } }] }));
        } catch {
          /* 连接可能已被客户端中止 */
        }
      }, 8000);
    });
  });
  return new Promise<void>((r) =>
    slowServer.listen(0, "127.0.0.1", () => {
      slowPort = (slowServer.address() as AddressInfo).port;
      r();
    }),
  );
}

after(async () => {
  try {
    slowServer?.close();
  } catch {
    /* ignore */
  }
  const realBase = process.env.MODEL_BASE_URL;
  if (realBase) {
    await prisma.modelprovider.updateMany({ where: { name: MAGIC_PROVIDER }, data: { baseUrl: realBase } }).catch(() => {});
  }
});

describe("/api/studio 路由级超时退款验收（延迟 mock 供应商）", { skip: !process.env.DATABASE_URL }, () => {
  test("模型超时 → HTTP 504 / MODEL_TIMEOUT / 等额退款 / 重复退款幂等", async () => {
    const uid = "it_to_u_" + randomUUID();
    const wid = "it_to_ws_" + randomUUID();
    const walletId = "it_to_w_" + randomUUID();
    const qid = "it_to_q_" + randomUUID();
    const grantId = "it_to_g_" + randomUUID();
    const now = new Date();
    const realBase = process.env.MODEL_BASE_URL;
    try {
      await prisma.user.create({ data: { id: uid, password: "x", role: "USER", status: "active" } });
      await prisma.workspace.create({ data: { id: wid, name: "it-timeout", type: "PERSONAL", ownerId: uid, updatedAt: now } });
      await prisma.workspacemember.create({
        data: { id: "it_to_m_" + randomUUID(), userId: uid, workspaceId: wid, role: "OWNER", monthlyTokenUsed: BigInt(0), tokenBalance: BigInt(1000) },
      });
      await prisma.userwallet.create({ data: { id: walletId, userId: uid, balance: BigInt(1000) } });
      await prisma.workspacequota.create({
        data: { id: qid, workspaceId: wid, membershipLevelId: "FREE", tokenBalance: BigInt(0), updatedAt: now },
      });
      await prisma.pointgrant.create({
        data: { id: grantId, scope: "WALLET", userId: uid, workspaceId: null, points: BigInt(1000), remaining: BigInt(1000), sourceType: "MANUAL", status: "ACTIVE" },
      });

      await startSlowServer();
      await prisma.modelprovider.update({
        where: { name: MAGIC_PROVIDER },
        data: { baseUrl: `http://127.0.0.1:${slowPort}/v1` },
      });

      const { POST } = await import("../route");
      const t = await new SignJWT({ userId: uid })
        .setProtectedHeader({ alg: "HS256" })
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(JWT_SECRET);
      const req = new NextRequest("http://localhost:3000/api/studio", {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "simulate", workspaceId: wid, componentId: C07, inputMaterial: "触发超时退款。", inputSource: { sourceType: "text" } }),
      });
      const res = await POST(req);
      const body = await res.json();
      console.log(`[route-accept] ⑧(超时) HTTP=${res.status} success=${body?.success} code=${body?.code ?? "-"}`);

      assert.equal(res.status, 504, `超时应返回 HTTP 504，实际 ${res.status}`);
      assert.equal(body.success, false);
      assert.equal(body.code, "MODEL_TIMEOUT");

      // 失败响应体不保证带 taskId：从消费流水推导
      const consumeLedger = await prisma.pointledger.findFirst({
        where: { userId: uid, type: "CONSUME" },
        select: { taskId: true },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(consumeLedger?.taskId, "必须存在带 taskId 的消费流水");
      const taskId = consumeLedger!.taskId!;
      const consumeRows = await prisma.pointledger.findMany({ where: { taskId, type: "CONSUME" }, select: { points: true } });
      const refundRows = await prisma.pointledger.findMany({ where: { taskId, type: "REFUND" }, select: { points: true } });
      const consumeSum = consumeRows.reduce((s, r) => s + Number(r.points), 0);
      const refundSum = refundRows.reduce((s, r) => s + Number(r.points), 0);
      assert.equal(consumeSum, 100, "超时前必须真实扣过 100 点");
      assert.equal(refundSum, 100, "超时失败必须等额退款");
      const positiveRefundCount = await prisma.pointledger.count({
        where: { taskId, type: "REFUND", points: { gt: 0 } },
      });
      assert.equal(positiveRefundCount, 1, "真实退款流水应只有一条（不含 0 点月度标记）");

      const cr = await reconstructConsumeResult(`CONSUME:${taskId}`, uid, wid);
      assert.ok(cr, "应能重建消费结果");
      const again = await refundConsumedPoints({ consumeResult: cr!, userId: uid, workspaceId: wid, taskId });
      assert.equal(again.refunded, 0, "第二次退款必须 refunded=0");
      assert.equal(
        await prisma.pointledger.count({ where: { taskId, type: "REFUND", points: { gt: 0 } } }),
        1,
        "重复退款不得增加退款流水",
      );
    } finally {
      if (realBase) {
        await prisma.modelprovider.update({ where: { name: MAGIC_PROVIDER }, data: { baseUrl: realBase } }).catch(() => {});
      }
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
    }
  });
});
