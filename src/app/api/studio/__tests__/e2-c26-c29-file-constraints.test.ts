/**
 * 批次 E3 差异化输入约束（fileConstraints）边界验收：C26（both 源码）/ C27（both OpenAPI）/ C29（both 源码）
 *
 * 单个边界用例覆盖三要素，全部为**快速确定性**用例（不调用外部模型、不产生算力流水）：
 *   1) 白名单 MIME 放行：上传空内容文件，流程止步于 INPUT_TEXT_NOT_EXTRACTED（证明 MIME 已放行），
 *      绝不触发真实模型；
 *   2) 非白名单 MIME 拒绝：INPUT_MIME_NOT_ALLOWED；
 *   3) 超过 maxCount=1 拒绝：INPUT_MULTIPLE_NOT_SUPPORTED；
 *   4) 超限字节数拒绝：单文件 > maxSingleFileBytes=2,000,000 → INPUT_TOO_LARGE。
 *
 * 安全性说明：以上三类拦截均发生在「模型策略解析」与「扣点」之前，
 *           因此每个场景都必须满足：无 pointledger CONSUME 流水、无 componenttask 记录（绝不先扣后退）。
 *
 * 前置：本测试依赖 C26/C27/C29 已 PUBLISH + 激活（由 prisma/migrate-c26-c31-contracts.ts --apply 完成），
 *       路由据此使用其 fileConstraints 作为唯一裁决依据。
 */

import { describe, it, expect } from "vitest";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";
import { POST as studioPostRoute } from "../route";

loadEnvConfig(process.cwd());
process.env.JWT_SECRET = process.env.JWT_SECRET || "zhige-test-explicit-jwt-secret-key-min-32-chars!";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const MAX_SINGLE_FILE_BYTES = 2_000_000;

async function token(userId: string) {
  return new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(JWT_SECRET);
}

function multipartReq(
  tokenValue: string,
  componentId: string,
  workspaceId: string,
  files: Array<{ name: string; content: Buffer; mimeType: string }>,
): NextRequest {
  const form = new FormData();
  form.append("action", "simulate");
  form.append("componentId", componentId);
  form.append("workspaceId", workspaceId);
  form.append("inputSource", JSON.stringify({ sourceType: "file" }));
  for (const f of files) {
    form.append("file", new Blob([f.content as unknown as BlobPart], { type: f.mimeType }), f.name);
  }
  return new NextRequest("http://localhost/api/studio", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenValue}` },
    body: form,
  });
}

async function setupFixture() {
  const s = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_e3fc_${s}`;
  const workspaceId = `ws_e3fc_${s}`;
  const balance = BigInt(10000);
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `e3fc_${s}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
  await prisma.workspacemember.create({ data: { id: `m_${s}`, userId, workspaceId, role: "OWNER" } });
  await prisma.userwallet.create({ data: { id: `w_${s}`, userId, balance } });
  await prisma.workspacequota.create({ data: { id: `q_${s}`, workspaceId, membershipLevelId: "FREE", tokenBalance: balance, updatedAt: new Date() } });
  await prisma.pointgrant.create({
    data: { id: `g_${s}`, scope: "WALLET", userId, workspaceId: null, points: balance, remaining: balance, sourceType: "MANUAL", status: "ACTIVE" },
  });
  const userToken = await token(userId);

  const cleanup = async () => {
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

async function assertNoCharge(userId: string, scenario: string) {
  const consumeCount = await prisma.pointledger.count({ where: { userId, type: "CONSUME" } });
  const taskCount = await prisma.componenttask.count({ where: { userId } });
  expect(consumeCount, `[${scenario}] 不得产生任何 CONSUME 流水`).toBe(0);
  expect(taskCount, `[${scenario}] 不得写入任何 componenttask 记录`).toBe(0);
}

describe("E3 C26（both 源码）差异化输入约束边界", () => {
  it("白名单 MIME 放行 / 非白名单拒绝 / 超量拒绝 / 超限字节拒绝，且全程零扣点", async () => {
    const f = await setupFixture();
    try {
      {
        const req = multipartReq(f.userToken, "C26", f.workspaceId, [
          { name: "src.ts", content: Buffer.from("", "utf-8"), mimeType: "text/plain" },
        ]);
        const res = await studioPostRoute(req);
        const body = (await res.json()) as Record<string, unknown>;
        const code = String(body.code ?? "");
        expect(code).not.toBe("INPUT_MIME_NOT_ALLOWED");
        expect(code).toBe("INPUT_TEXT_NOT_EXTRACTED");
        expect(res.status).toBe(400);
        await assertNoCharge(f.userId, "C26 .ts 放行");
      }
      {
        const req = multipartReq(f.userToken, "C26", f.workspaceId, [
          { name: "x.png", content: Buffer.from("png", "utf-8"), mimeType: "image/png" },
        ]);
        const res = await studioPostRoute(req);
        const body = (await res.json()) as Record<string, unknown>;
        expect(res.status).toBe(400);
        expect(body.code).toBe("INPUT_MIME_NOT_ALLOWED");
        await assertNoCharge(f.userId, "C26 非白名单 MIME");
      }
      {
        const req = multipartReq(f.userToken, "C26", f.workspaceId, [
          { name: "a.ts", content: Buffer.from("a", "utf-8"), mimeType: "text/plain" },
          { name: "b.ts", content: Buffer.from("b", "utf-8"), mimeType: "text/plain" },
        ]);
        const res = await studioPostRoute(req);
        const body = (await res.json()) as Record<string, unknown>;
        expect(res.status).toBe(400);
        expect(body.code).toBe("INPUT_MULTIPLE_NOT_SUPPORTED");
        await assertNoCharge(f.userId, "C26 超量");
      }
      {
        const oversize = MAX_SINGLE_FILE_BYTES + 1;
        const req = multipartReq(f.userToken, "C26", f.workspaceId, [
          { name: "huge.ts", content: Buffer.alloc(oversize, 0x61), mimeType: "text/plain" },
        ]);
        const res = await studioPostRoute(req);
        const body = (await res.json()) as Record<string, unknown>;
        expect(res.status).toBe(400);
        expect(body.code).toBe("INPUT_TOO_LARGE");
        await assertNoCharge(f.userId, "C26 超限字节");
      }
    } finally {
      await f.cleanup();
    }
  });
});

describe("E3 C27（both OpenAPI）差异化输入约束边界", () => {
  it("白名单 MIME 放行 / 非白名单拒绝 / 超量拒绝 / 超限字节拒绝，且全程零扣点", async () => {
    const f = await setupFixture();
    try {
      {
        const req = multipartReq(f.userToken, "C27", f.workspaceId, [
          { name: "openapi.json", content: Buffer.from("", "utf-8"), mimeType: "application/json" },
        ]);
        const res = await studioPostRoute(req);
        const body = (await res.json()) as Record<string, unknown>;
        const code = String(body.code ?? "");
        expect(code).not.toBe("INPUT_MIME_NOT_ALLOWED");
        expect(code).toBe("INPUT_TEXT_NOT_EXTRACTED");
        expect(res.status).toBe(400);
        await assertNoCharge(f.userId, "C27 .json 放行");
      }
      {
        const req = multipartReq(f.userToken, "C27", f.workspaceId, [
          { name: "x.png", content: Buffer.from("png", "utf-8"), mimeType: "image/png" },
        ]);
        const res = await studioPostRoute(req);
        const body = (await res.json()) as Record<string, unknown>;
        expect(res.status).toBe(400);
        expect(body.code).toBe("INPUT_MIME_NOT_ALLOWED");
        await assertNoCharge(f.userId, "C27 非白名单 MIME");
      }
      {
        const req = multipartReq(f.userToken, "C27", f.workspaceId, [
          { name: "a.json", content: Buffer.from("[1]", "utf-8"), mimeType: "application/json" },
          { name: "b.json", content: Buffer.from("[2]", "utf-8"), mimeType: "application/json" },
        ]);
        const res = await studioPostRoute(req);
        const body = (await res.json()) as Record<string, unknown>;
        expect(res.status).toBe(400);
        expect(body.code).toBe("INPUT_MULTIPLE_NOT_SUPPORTED");
        await assertNoCharge(f.userId, "C27 超量");
      }
      {
        const oversize = MAX_SINGLE_FILE_BYTES + 1;
        const req = multipartReq(f.userToken, "C27", f.workspaceId, [
          { name: "huge.json", content: Buffer.alloc(oversize, 0x61), mimeType: "application/json" },
        ]);
        const res = await studioPostRoute(req);
        const body = (await res.json()) as Record<string, unknown>;
        expect(res.status).toBe(400);
        expect(body.code).toBe("INPUT_TOO_LARGE");
        await assertNoCharge(f.userId, "C27 超限字节");
      }
    } finally {
      await f.cleanup();
    }
  });
});

describe("E3 C29（both 源码）差异化输入约束边界", () => {
  it("白名单 MIME 放行 / 非白名单拒绝 / 超量拒绝 / 超限字节拒绝，且全程零扣点", async () => {
    const f = await setupFixture();
    try {
      {
        const req = multipartReq(f.userToken, "C29", f.workspaceId, [
          { name: "src.ts", content: Buffer.from("", "utf-8"), mimeType: "text/plain" },
        ]);
        const res = await studioPostRoute(req);
        const body = (await res.json()) as Record<string, unknown>;
        const code = String(body.code ?? "");
        expect(code).not.toBe("INPUT_MIME_NOT_ALLOWED");
        expect(code).toBe("INPUT_TEXT_NOT_EXTRACTED");
        expect(res.status).toBe(400);
        await assertNoCharge(f.userId, "C29 .ts 放行");
      }
      {
        const req = multipartReq(f.userToken, "C29", f.workspaceId, [
          { name: "x.png", content: Buffer.from("png", "utf-8"), mimeType: "image/png" },
        ]);
        const res = await studioPostRoute(req);
        const body = (await res.json()) as Record<string, unknown>;
        expect(res.status).toBe(400);
        expect(body.code).toBe("INPUT_MIME_NOT_ALLOWED");
        await assertNoCharge(f.userId, "C29 非白名单 MIME");
      }
      {
        const req = multipartReq(f.userToken, "C29", f.workspaceId, [
          { name: "a.ts", content: Buffer.from("a", "utf-8"), mimeType: "text/plain" },
          { name: "b.ts", content: Buffer.from("b", "utf-8"), mimeType: "text/plain" },
        ]);
        const res = await studioPostRoute(req);
        const body = (await res.json()) as Record<string, unknown>;
        expect(res.status).toBe(400);
        expect(body.code).toBe("INPUT_MULTIPLE_NOT_SUPPORTED");
        await assertNoCharge(f.userId, "C29 超量");
      }
      {
        const oversize = MAX_SINGLE_FILE_BYTES + 1;
        const req = multipartReq(f.userToken, "C29", f.workspaceId, [
          { name: "huge.ts", content: Buffer.alloc(oversize, 0x61), mimeType: "text/plain" },
        ]);
        const res = await studioPostRoute(req);
        const body = (await res.json()) as Record<string, unknown>;
        expect(res.status).toBe(400);
        expect(body.code).toBe("INPUT_TOO_LARGE");
        await assertNoCharge(f.userId, "C29 超限字节");
      }
    } finally {
      await f.cleanup();
    }
  });
});
