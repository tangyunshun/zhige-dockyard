/**
 * C01 真实外部模型结构化产出证据（独立进程）
 *
 * 独立成文件的原因：真实 MagicAI/gpt-5.5 端点在**单进程连续多次调用**时会出现排队/限流，
 * 同进程第 3 次调用实测会顶到超时上限。本文件只做 2 次真实调用（预热 + 1 个用例）。
 *
 * 证明目标：C01 合同声明 STRUCTURED_OUTPUT，其真实产出必须包含合同要求的结构化内容
 * （requiredSections 含「偏离」、偏离表为 Markdown 表格）。若失败则 STRUCTURED_OUTPUT 判为 NEEDS_REVIEW。
 */

import test, { describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
process.env.JWT_SECRET = process.env.JWT_SECRET || "zhige-test-explicit-jwt-secret-key-min-32-chars!";
// 真实端点延迟波动大（实测 C01 在 78s~>300s），放宽超时以取得可判定结论
process.env.MODEL_TIMEOUT_MS = "600000";
process.env.MODEL_MAX_OUTPUT_TOKENS = "600";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

type PrismaMod = typeof import("@/lib/prisma");
type RouteMod = typeof import("../route");
let prisma: PrismaMod["prisma"];
let studioPostRoute: RouteMod["POST"];

function multipartReq(tokenValue: string, fields: Record<string, string>, files: Array<{ name: string; content: string; mimeType: string }>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const f of files) form.append("file", new Blob([f.content], { type: f.mimeType }), f.name);
  return new NextRequest("http://localhost/api/studio", { method: "POST", headers: { Authorization: `Bearer ${tokenValue}` }, body: form });
}

async function setupFixture() {
  const s = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_c01ev_${s}`;
  const workspaceId = `ws_c01ev_${s}`;
  const balance = BigInt(100000);
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `c01ev_${s}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
  await prisma.workspacemember.create({ data: { id: `m_${s}`, userId, workspaceId, role: "OWNER", monthlyTokenUsed: BigInt(0), tokenBalance: balance } });
  await prisma.userwallet.create({ data: { id: `w_${s}`, userId, balance } });
  await prisma.workspacequota.create({ data: { id: `q_${s}`, workspaceId, membershipLevelId: "FREE", tokenBalance: balance, updatedAt: new Date() } });
  await prisma.pointgrant.create({ data: { id: `g_${s}`, scope: "WALLET", userId, workspaceId: null, points: balance, remaining: balance, sourceType: "MANUAL", status: "ACTIVE" } });
  const userToken = await new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(JWT_SECRET);
  const cleanup = async () => {
    await prisma.pointledger.deleteMany({ where: { userId } });
    await prisma.pointgrant.deleteMany({ where: { userId } });
    await prisma.userwallet.deleteMany({ where: { userId } });
    await prisma.componenttask.deleteMany({ where: { userId } });
    await prisma.componentusage.deleteMany({ where: { workspaceId } });
    await prisma.workspacemember.deleteMany({ where: { workspaceId } });
    await prisma.workspacequota.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.user.delete({ where: { id: userId } });
  };
  return { userId, workspaceId, userToken, cleanup };
}

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST: studioPostRoute } = await import("../route"));

  const warm = await setupFixture();
  try {
    await studioPostRoute(
      multipartReq(
        warm.userToken,
        {
          action: "simulate",
          workspaceId: warm.workspaceId,
          componentId: "C01",
          inputSource: JSON.stringify({ sourceType: "file", fileName: "warm.txt", mimeType: "text/plain" }),
        },
        [{ name: "warm.txt", content: "预热材料：招标文件要求等保三级资质。".repeat(3), mimeType: "text/plain" }],
      ),
    ).catch(() => null);
  } finally {
    await warm.cleanup();
  }
});

describe("C01 真实外部模型结构化产出证据", () => {
  test("C01 真实调用：产出含偏离表的文档型结构化成果（Markdown 表格 + 必需小节）", async () => {
    const f = await setupFixture();
    try {
      const req = multipartReq(
        f.userToken,
        {
          action: "simulate",
          workspaceId: f.workspaceId,
          componentId: "C01",
          inputSource: JSON.stringify({ sourceType: "file", fileName: "tender.txt", mimeType: "text/plain" }),
        },
        [
          {
            name: "tender.txt",
            content:
              "招标文件：要求具备等保三级资质，工期 6 个月，预算 500 万，需提供三年运维，必须提供同城灾备能力。".repeat(3),
            mimeType: "text/plain",
          },
        ],
      );
      const res = await studioPostRoute(req);
      const json = await res.json();
      assert.equal(res.status, 200, `期望 200，实际 ${res.status} body=${JSON.stringify(json).slice(0, 300)}`);
      assert.equal(json.executionMode, "REAL_MODEL");
      assert.equal(json.provider?.id, "MagicAI");
      assert.equal(json.billingMode, "ESTIMATED_COMPATIBILITY");
      assert.ok(json.actualPoints === null || json.actualPoints === undefined, "actualPoints 必须为 null（兼容口径）");

      const content = String(json.artifacts?.[0]?.content ?? "");
      assert.ok(content.trim().length > 0, "C01 成果物必须非空");
      assert.ok(content.includes("偏离"), "必须产出偏离分析（合同 requiredSections 含「偏离」）");
      assert.ok(content.includes("|"), "必须产出 Markdown 表格（偏离表结构）");
      assert.ok(Number(json.usage?.totalTokens) > 0, `必须产生真实 usage，实际 ${JSON.stringify(json.usage)}`);
      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "REFUND" } }), 0, "成功路径不得退款");
    } finally {
      await f.cleanup();
    }
  });
});
