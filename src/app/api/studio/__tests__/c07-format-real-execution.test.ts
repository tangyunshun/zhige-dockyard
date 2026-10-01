/**
 * C07 非纯文本输入的真实路由验收（Word 文档 / 空间资料）
 *
 * 独立进程（独立文件）原因：真实 MagicAI/gpt-5.5 端点在**单轮连续多次调用**时会出现明显排队/限流，
 * 实测同轮第 3~4 次调用会顶到超时上限。故本文件只做 2 次真实调用（预热 + 2 个用例），
 * 并把模型超时放宽到 600s，以获得稳定结论。
 *
 * 严格约束（同主验收文件）：
 *  - 不切换供应商、不改 baseUrl、不打印或读取任何密钥值；
 *  - 临时用户/空间/资料/账务/任务必须清理，清理失败必须让测试失败；
 *  - settlementEnabled / billingMode / 价格 均不改动。
 */

import test, { describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { loadEnvConfig } from "@next/env";
import AdmZip from "adm-zip";

loadEnvConfig(process.cwd());
process.env.JWT_SECRET = process.env.JWT_SECRET || "zhige-test-explicit-jwt-secret-key-min-32-chars!";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const C07 = "C07";
const MAGIC_PROVIDER = "MagicAI";
const MAGIC_MODEL = "gpt-5.5";

// 必须在动态导入路由之前设置（model-adapter 在模块加载期冻结超时）
process.env.MODEL_TIMEOUT_MS = "600000";
process.env.MODEL_MAX_OUTPUT_TOKENS = "300";

type PrismaMod = typeof import("@/lib/prisma");
type RouteMod = typeof import("../route");
let prisma: PrismaMod["prisma"];
let studioPostRoute: RouteMod["POST"];

/** 构造最小合法 .docx（OOXML zip：word/document.xml 正文） */
function buildDocx(text: string): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    "word/document.xml",
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
      "utf-8",
    ),
  );
  return zip.toBuffer();
}

async function generateToken(userId: string) {
  return new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(JWT_SECRET);
}

function buildMultipartRequest(token: string, fields: Record<string, string>, file: { name: string; content: string | Uint8Array; mimeType: string }): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append("file", new Blob([file.content as BlobPart], { type: file.mimeType }), file.name);
  return new NextRequest("http://localhost/api/studio", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
}

function buildJsonRequest(token: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/studio", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function setupTempUserAndWorkspace() {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_c07f_${suffix}`;
  const workspaceId = `ws_c07f_${suffix}`;
  const balance = BigInt(100000);
  await prisma.user.create({ data: { id: userId, password: "test", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `C07格式验收_${suffix}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
  await prisma.workspacemember.create({ data: { id: `m_${suffix}`, userId, workspaceId, role: "OWNER", monthlyTokenUsed: BigInt(0), tokenBalance: balance } });
  await prisma.userwallet.create({ data: { id: `w_${suffix}`, userId, balance } });
  await prisma.workspacequota.create({ data: { id: `q_${suffix}`, workspaceId, membershipLevelId: "FREE", tokenBalance: balance, updatedAt: new Date() } });
  await prisma.pointgrant.create({ data: { id: `g_${suffix}`, scope: "WALLET", userId, workspaceId: null, points: balance, remaining: balance, sourceType: "MANUAL", status: "ACTIVE" } });
  const userToken = await generateToken(userId);
  const cleanup = async () => {
    await prisma.document.deleteMany({ where: { workspaceId } });
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

type TaskResultShape = { provider?: { id?: string; modelId?: string }; usage?: { totalTokens?: number } };

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST: studioPostRoute } = await import("../route"));

  // 预热（吸收冷启动；预热失败不判失败，但清理失败必须暴露）
  const warm = await setupTempUserAndWorkspace();
  try {
    const req = buildJsonRequest(warm.userToken, { action: "simulate", workspaceId: warm.workspaceId, componentId: C07, inputMaterial: "预热调用：请仅回复“就绪”。" });
    await studioPostRoute(req).catch(() => null);
  } finally {
    await warm.cleanup();
  }
});

describe("C07 非纯文本输入真实调用（Word 文档 / 空间资料）", () => {
  test("1. Word 文档（.docx）：真实提取正文并完成 REAL_MODEL 调用", async () => {
    const f = await setupTempUserAndWorkspace();
    try {
      const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      const req = buildMultipartRequest(
        f.userToken,
        { action: "simulate", workspaceId: f.workspaceId, componentId: C07, inputSource: JSON.stringify({ sourceType: "file", fileName: "c07-spec.docx", mimeType: docxMime }) },
        { name: "c07-spec.docx", content: buildDocx("（原始材料）智慧园区项目需包含总体架构、实施路径与风险管控，预算 500 万。"), mimeType: docxMime },
      );
      const res = await studioPostRoute(req);
      const json = await res.json();
      assert.equal(res.status, 200, `期望 200，实际 ${res.status} body=${JSON.stringify(json).slice(0, 300)}`);
      assert.equal(json.executionMode, "REAL_MODEL");
      assert.equal(json.billingMode, "ESTIMATED_COMPATIBILITY");
      assert.ok(typeof json.artifacts?.[0]?.content === "string" && json.artifacts[0].content.trim().length > 0, "artifact 必须非空");

      const task = await prisma.componenttask.findFirst({ where: { userId: f.userId, type: C07 }, orderBy: { createdAt: "desc" } });
      assert.ok(task, "必须落库任务");
      const result = task!.result as TaskResultShape;
      assert.ok(result.provider?.id === MAGIC_PROVIDER && result.provider?.modelId === MAGIC_MODEL, "落库 provider/model 必须正确");
      assert.ok(Number(result.usage?.totalTokens) > 0, "usage 必须真实落库");
      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }), 1, "恰好一条消费流水");
    } finally {
      await f.cleanup();
    }
  });

  test("2. 空间资料（asset）：真实读取资料正文并完成 REAL_MODEL 调用", async () => {
    const f = await setupTempUserAndWorkspace();
    try {
      const docId = `doc_c07f_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
      await prisma.document.create({
        data: {
          id: docId,
          workspaceId: f.workspaceId,
          title: "C07 空间资料",
          content: "（空间资料正文）智慧交通项目：信号配时优化、诱导屏统一发布、三年运维服务。请归纳关键要点。",
          visibility: "PUBLIC",
          uploaderId: f.userId,
          originalName: "asset.txt",
          type: "doc",
          updatedAt: new Date(),
        },
      });
      const req = buildJsonRequest(f.userToken, {
        action: "simulate",
        workspaceId: f.workspaceId,
        componentId: C07,
        inputSource: { sourceType: "asset", sourceId: docId },
      });
      const res = await studioPostRoute(req);
      const json = await res.json();
      assert.equal(res.status, 200, `期望 200，实际 ${res.status} body=${JSON.stringify(json).slice(0, 300)}`);
      assert.equal(json.executionMode, "REAL_MODEL");
      assert.equal(json.billingMode, "ESTIMATED_COMPATIBILITY");
      assert.ok(typeof json.artifacts?.[0]?.content === "string" && json.artifacts[0].content.trim().length > 0, "artifact 必须非空");

      const task = await prisma.componenttask.findFirst({ where: { userId: f.userId, type: C07 }, orderBy: { createdAt: "desc" } });
      assert.ok(task, "必须落库任务");
      const result = task!.result as TaskResultShape;
      assert.ok(result.provider?.id === MAGIC_PROVIDER && result.provider?.modelId === MAGIC_MODEL, "落库 provider/model 必须正确");
      assert.ok(Number(result.usage?.totalTokens) > 0, "usage 必须真实落库");
      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }), 1, "恰好一条消费流水");
    } finally {
      await f.cleanup();
    }
  });
});
