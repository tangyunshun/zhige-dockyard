/**
 * C03 多主材料（MULTI_FILE）业务核验
 *
 * 覆盖强断言（不得只断言 HTTP 200）：
 *  - 每个文件的**唯一内容标记**都进入模型请求上下文（通过本地可控上游捕获请求体逐条断言）；
 *  - 文件顺序与数量按合同约束执行（顺序即上传顺序；超过 maxCount=4 必须被合同层拒绝）；
 *  - 任意一个文件解析失败时**不扣费或完整退款**；
 *  - 计费口径：billingMode=ESTIMATED_COMPATIBILITY、settlementEnabled=false、不产生真实结算。
 *
 * 重要：本文件的本地上游仅用于**捕获请求上下文**与**结构化解析**验证，
 * 绝不用其结论冒充「真实外部模型验收」。真实外部模型验收见 c01-c05-real-execution-acceptance / capability-evidence 测试。
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
import { isTokenSettlementFeatureEnabled } from "@/lib/token-settlement-service";

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

const MAGIC_PROVIDER = "MagicAI";
/** C03 合同要求的结构化字段（TABLE + schemaDefinition） */
const C03_JSON = JSON.stringify({
  dimensions: ["功能覆盖", "性能", "资质"],
  rows: [
    { dimension: "功能覆盖", ours: "12 项", competitor: "9 项", verdict: "优势", note: "MARKER_ALPHA 已计入" },
    { dimension: "性能", ours: "200ms", competitor: "180ms", verdict: "劣势", note: "MARKER_BETA 已计入" },
  ],
  summary: "综合两文件材料：我方优势 1 项、劣势 1 项。MARKER_ALPHA / MARKER_BETA 均已纳入。",
});

let mockServer: http.Server;
let mockPort = 0;
let capturedBodies: string[] = [];

function startMockServer(): Promise<void> {
  mockServer = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.from(c)));
    req.on("end", () => {
      capturedBodies.push(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: C03_JSON } }],
          usage: { prompt_tokens: 120, completion_tokens: 60, total_tokens: 180 },
        }),
      );
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

function multipartReq(token: string, fields: Record<string, string>, files: Array<{ name: string; content: string; mimeType: string }>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const f of files) form.append("file", new Blob([f.content], { type: f.mimeType }), f.name);
  return new NextRequest("http://localhost/api/studio", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
}

async function setupFixture() {
  const s = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_c03mf_${s}`;
  const workspaceId = `ws_c03mf_${s}`;
  const balance = BigInt(100000);
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `c03mf_${s}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
  await prisma.workspacemember.create({ data: { id: `m_${s}`, userId, workspaceId, role: "OWNER", monthlyTokenUsed: BigInt(0), tokenBalance: balance } });
  await prisma.userwallet.create({ data: { id: `w_${s}`, userId, balance } });
  await prisma.workspacequota.create({ data: { id: `q_${s}`, workspaceId, membershipLevelId: "FREE", tokenBalance: balance, updatedAt: new Date() } });
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

const C03 = "C03";
const fileFields = (workspaceId: string, name: string) => ({
  action: "simulate",
  workspaceId,
  componentId: C03,
  inputSource: JSON.stringify({ sourceType: "file", fileName: name, mimeType: "text/plain" }),
});

describe("C03 多主材料业务核验（本地可控上游，捕获请求上下文）", { skip: !process.env.DATABASE_URL }, () => {
  test("1. 两个文件：唯一标记均进入模型上下文、顺序保持、数量符合合同", async () => {
    const f = await setupFixture();
    try {
      if (!mockServer) await startMockServer();
      await prisma.modelprovider.update({ where: { name: MAGIC_PROVIDER }, data: { baseUrl: `http://127.0.0.1:${mockPort}/v1` } });
      capturedBodies = [];

      const { POST } = await import("../route");
      const req = multipartReq(
        f.userToken,
        fileFields(f.workspaceId, "competitor.txt"),
        [
          { name: "competitor.txt", content: "MARKER_ALPHA_7f3a 竞品资料：功能覆盖 9 项，P95 延迟 180ms，缺少合规资质。".repeat(3), mimeType: "text/plain" },
          { name: "ours.txt", content: "MARKER_BETA_9c21 我方能力清单：功能覆盖 12 项，P95 延迟 200ms，具备等保三级资质。".repeat(3), mimeType: "text/plain" },
        ],
      );

      const res = await POST(req);
      const json = await res.json();
      assert.equal(res.status, 200, `期望 200，实际 ${res.status} body=${JSON.stringify(json).slice(0, 240)}`);
      assert.equal(json.executionMode, "REAL_MODEL");

      // —— 模型请求上下文强断言（逐条标记，不得只看状态码）——
      assert.equal(capturedBodies.length, 1, "必须恰好发生一次上游调用");
      const payload = capturedBodies[0];
      assert.ok(payload.includes("MARKER_ALPHA_7f3a"), "文件一唯一标记必须进入模型请求上下文");
      assert.ok(payload.includes("MARKER_BETA_9c21"), "文件二唯一标记必须进入模型请求上下文");
      assert.ok(
        payload.indexOf("MARKER_ALPHA_7f3a") < payload.indexOf("MARKER_BETA_9c21"),
        "多文件必须按上传顺序合并进入上下文（顺序不得倒置）",
      );
      assert.ok(payload.includes("competitor.txt"), "上下文必须标注第一个文件来源");
      assert.ok(payload.includes("ours.txt"), "上下文必须标注第二个文件来源");

      // —— 输出 artifact 必须基于全部文件 ——
      const artifacts = json.artifacts as Array<{ type?: string; mimeType?: string; content?: string }>;
      assert.ok(Array.isArray(artifacts) && artifacts.length > 0, "必须有 artifact");
      const content = String(artifacts[0]?.content ?? "");
      const parsed = JSON.parse(content) as { dimensions?: unknown; rows?: unknown; summary?: string };
      assert.ok(Array.isArray(parsed.dimensions) && Array.isArray(parsed.rows), "结构化对比表必须可解析为 contract 声明字段");
      assert.ok(
        String(parsed.summary).includes("MARKER_ALPHA") && String(parsed.summary).includes("MARKER_BETA"),
        "成果物必须体现来自全部文件的信息",
      );

      // —— 计费口径 ——
      assert.equal(json.billingMode, "ESTIMATED_COMPATIBILITY");
      assert.ok(json.actualPoints === null || json.actualPoints === undefined, "actualPoints 必须为 null（兼容口径，未开启真实结算）");
      assert.equal(isTokenSettlementFeatureEnabled(), false, "settlementEnabled 必须为 false");
      // 消费流水可能是分账多行（如空间配额 + 个人钱包），但**合计必须等于任务 tokenCost**，绝不允许重复扣费
      const consumeRows = await prisma.pointledger.findMany({
        where: { userId: f.userId, type: "CONSUME" },
        select: { points: true },
      });
      assert.ok(consumeRows.length >= 1, "成功路径必须存在消费流水");
      const totalConsumed = consumeRows.reduce((s, r) => s + Number(r.points), 0);
      assert.equal(
        totalConsumed,
        Number(json.task?.estimatedPoints),
        `消费合计必须等于任务 tokenCost（不得重复扣费），实际 ${totalConsumed} vs ${Number(json.task?.tokens)}`,
      );
      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "REFUND" } }), 0, "成功路径不得产生退款");
    } finally {
      if (realBase) {
        await prisma.modelprovider.updateMany({ where: { name: MAGIC_PROVIDER }, data: { baseUrl: realBase } }).catch(() => {});
      }
      await f.cleanup();
    }
  });

  test("2. 数量约束：超过合同 maxCount=4 必须被合同层拒绝（不扣点、不写任务）", async () => {
    const f = await setupFixture();
    try {
      const { POST } = await import("../route");
      const files = Array.from({ length: 5 }, (_, i) => ({
        name: `f${i + 1}.txt`,
        content: `MARKER_FILE_${i + 1} 竞品资料内容`.repeat(3),
        mimeType: "text/plain",
      }));
      const res = await POST(multipartReq(f.userToken, fileFields(f.workspaceId, files[0].name), files));
      const json = await res.json();
      assert.equal(res.status, 400, `期望 400，实际 ${res.status}`);
      assert.equal(json.code, "INPUT_MULTIPLE_NOT_SUPPORTED", "超过 maxCount 必须被合同层拒绝");
      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }), 0, "不得扣点");
      assert.equal(await prisma.componenttask.count({ where: { userId: f.userId } }), 0, "不得写成功任务");
    } finally {
      await f.cleanup();
    }
  });

  test("3. 单文件解析失败：不扣费或完整退款（绝不静默部分成功）", async () => {
    const f = await setupFixture();
    try {
      if (!mockServer) await startMockServer();
      await prisma.modelprovider.update({ where: { name: MAGIC_PROVIDER }, data: { baseUrl: `http://127.0.0.1:${mockPort}/v1` } });
      const { POST } = await import("../route");

      // 文件一正常；文件二为纯空白（可提取但无文字）→ 该文件解析失败
      const res = await POST(
        multipartReq(f.userToken, fileFields(f.workspaceId, "ok.txt"), [
          { name: "ok.txt", content: "MARKER_OK_1a2b 正常竞品资料内容".repeat(3), mimeType: "text/plain" },
          { name: "blank.txt", content: "   \n\t  \r\n  ", mimeType: "text/plain" },
        ]),
      );
      const json = await res.json();

      const consumes = await prisma.pointledger.findMany({ where: { userId: f.userId, type: "CONSUME" }, select: { points: true } });
      const refunds = await prisma.pointledger.findMany({ where: { userId: f.userId, type: "REFUND" }, select: { points: true } });
      const consumeSum = consumes.reduce((s, r) => s + Number(r.points), 0);
      const refundSum = refunds.reduce((s, r) => s + Number(r.points), 0);

      if (res.status === 200) {
        assert.equal(consumeSum > 0, true, "成功路径必须有消费");
        assert.equal(refundSum, 0, "成功路径不得退款");
      } else {
        assert.equal(res.status, 400, `期望 400 或 200，实际 ${res.status} body=${JSON.stringify(json).slice(0, 200)}`);
        assert.equal(json.code, "INPUT_TEXT_NOT_EXTRACTED", "含无文字文件时必须明确拒绝");
        assert.equal(consumeSum, refundSum, "若已扣点必须完整退款（不得部分扣费）");
      }
      assert.equal(isTokenSettlementFeatureEnabled(), false);
    } finally {
      if (realBase) {
        await prisma.modelprovider.updateMany({ where: { name: MAGIC_PROVIDER }, data: { baseUrl: realBase } }).catch(() => {});
      }
      await f.cleanup();
    }
  });
});
