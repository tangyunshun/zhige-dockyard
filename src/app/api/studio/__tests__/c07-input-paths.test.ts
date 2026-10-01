/**
 * C07 非文本输入路径验收（多主材料 / 空间资料 asset / 图片 OCR）
 *
 * 全部为**快速确定性**用例（不调用外部模型）：
 *  - 多主材料：C07 合同 maxCount=1 → 两个文件必须被合同层拒绝；
 *  - 空间资料（asset）：归属校验（403）、私密资料越权（403）、无可提取文本（400）；
 *  - 图片：OCR 无文本（测试替身）→ 400 INPUT_TEXT_NOT_EXTRACTED。
 *
 * 真实模型调用（.docx / asset 成功路径）在 c07-real-execution-acceptance.test.ts 中覆盖。
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import AdmZip from "adm-zip";
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";
import { POST as studioPostRoute } from "../route";

/** 真实旧版样本（本机 Word 生成）与最小 zip，用于验证 C07 合同层 MIME 约束 */
const REAL_DOC = path.join(process.cwd(), "src", "lib", "__tests__", "fixtures", "legacy", "sample-real.doc");
function buildZip(): Buffer {
  const zip = new AdmZip();
  zip.addFile("note.txt", Buffer.from("压缩包内文本", "utf-8"));
  return zip.toBuffer();
}

loadEnvConfig(process.cwd());
process.env.JWT_SECRET = process.env.JWT_SECRET || "zhige-test-explicit-jwt-secret-key-min-32-chars!";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);
const C07 = "C07";
const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

async function token(userId: string) {
  return new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(JWT_SECRET);
}

function multipartReq(
  tokenValue: string,
  fields: Record<string, string>,
  files: Array<{ name: string; content: Buffer; mimeType: string }>,
): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const f of files) form.append("file", new Blob([f.content as unknown as BlobPart], { type: f.mimeType }), f.name);
  return new NextRequest("http://localhost/api/studio", { method: "POST", headers: { Authorization: `Bearer ${tokenValue}` }, body: form });
}

async function setupFixture() {
  const s = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_inp_${s}`;
  const otherId = `u_inp2_${s}`;
  const workspaceId = `ws_inp_${s}`;
  const balance = BigInt(10000);
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.user.create({ data: { id: otherId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `inp_${s}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
  await prisma.workspacemember.create({ data: { id: `m_${s}`, userId, workspaceId, role: "OWNER", monthlyTokenUsed: BigInt(0), tokenBalance: balance } });
  await prisma.userwallet.create({ data: { id: `w_${s}`, userId, balance } });
  await prisma.workspacequota.create({ data: { id: `q_${s}`, workspaceId, membershipLevelId: "FREE", tokenBalance: balance, updatedAt: new Date() } });
  await prisma.pointgrant.create({ data: { id: `g_${s}`, scope: "WALLET", userId, workspaceId: null, points: balance, remaining: balance, sourceType: "MANUAL", status: "ACTIVE" } });
  const userToken = await token(userId);

  const cleanup = async () => {
    await prisma.document.deleteMany({ where: { workspaceId } });
    await prisma.pointledger.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await prisma.pointgrant.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await prisma.userwallet.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await prisma.componenttask.deleteMany({ where: { userId: { in: [userId, otherId] } } });
    await prisma.componentusage.deleteMany({ where: { workspaceId } });
    await prisma.workspacemember.deleteMany({ where: { workspaceId } });
    await prisma.workspacequota.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
  };

  return { userId, otherId, workspaceId, userToken, cleanup };
}

describe("C07 非文本输入路径（多主材料 / asset / 图片 OCR）", () => {
  test("1. 多主材料：C07 合同 maxCount=1，上传 2 个文件必须被合同层拒绝", async () => {
    const f = await setupFixture();
    try {
      const req = multipartReq(
        f.userToken,
        { action: "simulate", workspaceId: f.workspaceId, componentId: C07, inputSource: JSON.stringify({ sourceType: "file", fileName: "a.txt", mimeType: "text/plain" }) },
        [
          { name: "a.txt", content: Buffer.from("材料一".repeat(30)), mimeType: "text/plain" },
          { name: "b.txt", content: Buffer.from("材料二".repeat(30)), mimeType: "text/plain" },
        ],
      );
      const res = await studioPostRoute(req);
      const body = await res.json();
      assert.equal(res.status, 400, `期望 400，实际 ${res.status} body=${JSON.stringify(body).slice(0, 160)}`);
      assert.equal(body.code, "INPUT_MULTIPLE_NOT_SUPPORTED");
      assert.match(String(body.error), /最大数量/);
      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }), 0, "不得扣点");
      assert.equal(await prisma.componenttask.count({ where: { userId: f.userId } }), 0, "不得写成功任务");
    } finally {
      await f.cleanup();
    }
  });

  test("2. 空间资料 asset：不属于当前空间的资料必须 403（不读取内容）", async () => {
    const f = await setupFixture();
    try {
      const req = new NextRequest("http://localhost/api/studio", {
        method: "POST",
        headers: { Authorization: `Bearer ${f.userToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate",
          workspaceId: f.workspaceId,
          componentId: C07,
          inputSource: { sourceType: "asset", sourceId: `doc_missing_${randomUUID()}` },
        }),
      });
      const res = await studioPostRoute(req);
      const body = await res.json();
      assert.equal(res.status, 403, `期望 403，实际 ${res.status} body=${JSON.stringify(body).slice(0, 160)}`);
      assert.equal(body.code, "INPUT_SOURCE_FORBIDDEN");
      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }), 0);
    } finally {
      await f.cleanup();
    }
  });

  test("3. 空间资料 asset：他人私密资料必须 403（越权治理不允许在组件接口内放行）", async () => {
    const f = await setupFixture();
    try {
      const docId = `doc_priv_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
      await prisma.document.create({
        data: {
          id: docId,
          workspaceId: f.workspaceId,
          title: "他人私密资料",
          content: "私密正文内容",
          visibility: "PRIVATE",
          uploaderId: f.otherId,
          originalName: "private.txt",
          type: "doc",
          updatedAt: new Date(),
        },
      });
      const req = new NextRequest("http://localhost/api/studio", {
        method: "POST",
        headers: { Authorization: `Bearer ${f.userToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate",
          workspaceId: f.workspaceId,
          componentId: C07,
          inputSource: { sourceType: "asset", sourceId: docId },
        }),
      });
      const res = await studioPostRoute(req);
      const body = await res.json();
      assert.equal(res.status, 403, `期望 403，实际 ${res.status} body=${JSON.stringify(body).slice(0, 160)}`);
      assert.equal(body.code, "INPUT_SOURCE_FORBIDDEN");
      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }), 0);
    } finally {
      await f.cleanup();
    }
  });

  test("4. 空间资料 asset：无可提取文本必须 400 INPUT_TEXT_NOT_EXTRACTED（不扣点、不写任务）", async () => {
    const f = await setupFixture();
    try {
      const docId = `doc_empty_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
      await prisma.document.create({
        data: {
          id: docId,
          workspaceId: f.workspaceId,
          title: "空资料",
          content: "",
          visibility: "PUBLIC",
          uploaderId: f.userId,
          originalName: "empty.txt",
          filePath: null,
          type: "doc",
          updatedAt: new Date(),
        },
      });
      const req = new NextRequest("http://localhost/api/studio", {
        method: "POST",
        headers: { Authorization: `Bearer ${f.userToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "simulate",
          workspaceId: f.workspaceId,
          componentId: C07,
          inputSource: { sourceType: "asset", sourceId: docId },
        }),
      });
      const res = await studioPostRoute(req);
      const body = await res.json();
      assert.equal(res.status, 400, `期望 400，实际 ${res.status} body=${JSON.stringify(body).slice(0, 160)}`);
      assert.equal(body.code, "INPUT_TEXT_NOT_EXTRACTED");
      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }), 0, "不得扣点");
      assert.equal(await prisma.componenttask.count({ where: { userId: f.userId } }), 0, "不得写成功任务");
    } finally {
      await f.cleanup();
    }
  });

  test("4b. 合同层 MIME 约束：真实 .doc/.zip 不在 C07 acceptedMimes → 400 INPUT_MIME_NOT_ALLOWED（平台仍可提取，但 C07 合同拒绝）", async () => {
    const f = await setupFixture();
    try {
      const cases: Array<{ name: string; content: Buffer; mime: string }> = [
        { name: "legacy.doc", content: fs.readFileSync(REAL_DOC), mime: "application/msword" },
        { name: "bundle.zip", content: buildZip(), mime: "application/zip" },
      ];
      for (const c of cases) {
        const req = multipartReq(
          f.userToken,
          {
            action: "simulate",
            workspaceId: f.workspaceId,
            componentId: C07,
            inputSource: JSON.stringify({ sourceType: "file", fileName: c.name, mimeType: c.mime }),
          },
          [{ name: c.name, content: c.content, mimeType: c.mime }],
        );
        const res = await studioPostRoute(req);
        const body = await res.json();
        assert.equal(res.status, 400, `${c.name} 期望 400，实际 ${res.status} body=${JSON.stringify(body).slice(0, 160)}`);
        assert.equal(body.code, "INPUT_MIME_NOT_ALLOWED", `${c.name} 必须被合同层 MIME 约束拒绝`);
      }
      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }), 0, "不得扣点");
      assert.equal(await prisma.componenttask.count({ where: { userId: f.userId } }), 0, "不得写成功任务");
    } finally {
      await f.cleanup();
    }
  });

  test("5. 图片路径：OCR 无文本 → 400 INPUT_TEXT_NOT_EXTRACTED（不伪造内容）", async () => {
    const f = await setupFixture();
    const prev = process.env.TEXT_EXTRACT_TEST_OCR_EMPTY;
    process.env.TEXT_EXTRACT_TEST_OCR_EMPTY = "true";
    try {
      const req = multipartReq(
        f.userToken,
        { action: "simulate", workspaceId: f.workspaceId, componentId: C07, inputSource: JSON.stringify({ sourceType: "file", fileName: "scan.png", mimeType: "image/png" }) },
        [{ name: "scan.png", content: PNG_1x1, mimeType: "image/png" }],
      );
      const res = await studioPostRoute(req);
      const body = await res.json();
      assert.equal(res.status, 400, `期望 400，实际 ${res.status} body=${JSON.stringify(body).slice(0, 160)}`);
      assert.equal(body.code, "INPUT_TEXT_NOT_EXTRACTED");
      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }), 0, "不得扣点");
      assert.equal(await prisma.componenttask.count({ where: { userId: f.userId } }), 0, "不得写成功任务");
    } finally {
      if (prev === undefined) delete process.env.TEXT_EXTRACT_TEST_OCR_EMPTY;
      else process.env.TEXT_EXTRACT_TEST_OCR_EMPTY = prev;
      await f.cleanup();
    }
  });
});
