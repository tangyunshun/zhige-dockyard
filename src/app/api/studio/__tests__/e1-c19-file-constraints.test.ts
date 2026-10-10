/**
 * 批次 E1-FIX：C19 差异化输入约束（fileConstraints）边界验收
 *
 * 单个边界用例覆盖三要素，全部为**快速确定性**用例（不调用外部模型、不产生算力流水）：
 *   1) .log MIME 放行：不得产出 INPUT_MIME_NOT_ALLOWED（走到文本提取阶段即足以证明 MIME 已放行）；
 *      采用空内容 .log，使流程止步于 INPUT_TEXT_NOT_EXTRACTED，从而既不触发真实模型也验证了放行；
 *   2) 超过 3 份拒绝：4 份文件 > maxCount=3 → INPUT_MULTIPLE_NOT_SUPPORTED；
 *   3) 超限字节数拒绝：单文件 > maxSingleFileBytes=2,000,000 → INPUT_TOO_LARGE。
 *
 * 安全性说明：以上三类拦截均发生在「模型策略解析」与「扣点」之前，
 *           因此每个场景都必须满足：无 pointledger CONSUME 流水、无 componenttask 记录（绝不先扣后退）。
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { loadEnvConfig } from "@next/env";
import { prisma } from "@/lib/prisma";
import { POST as studioPostRoute } from "../route";

loadEnvConfig(process.cwd());
process.env.JWT_SECRET = process.env.JWT_SECRET || "zhige-test-explicit-jwt-secret-key-min-32-chars!";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const C19 = "C19";
/** 与 C19 合同一致的上限值（合同为真源，此处仅用于构造边界输入） */
const MAX_COUNT = 3;
const MAX_SINGLE_FILE_BYTES = 2_000_000;

async function token(userId: string) {
  return new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(JWT_SECRET);
}

function multipartReq(
  tokenValue: string,
  files: Array<{ name: string; content: Buffer; mimeType: string }>,
  extraFields: Record<string, string> = {},
): NextRequest {
  const form = new FormData();
  form.append("action", "simulate");
  form.append("componentId", C19);
  form.append("workspaceId", extraFields.workspaceId);
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
  const userId = `u_c19fc_${s}`;
  const workspaceId = `ws_c19fc_${s}`;
  const balance = BigInt(10000);
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `c19fc_${s}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
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

/** 幂等的「无副作用」断言：不得扣点、不得写任务 */
async function assertNoCharge(userId: string, scenario: string) {
  const consumeCount = await prisma.pointledger.count({ where: { userId, type: "CONSUME" } });
  const taskCount = await prisma.componenttask.count({ where: { userId } });
  assert.equal(consumeCount, 0, `[${scenario}] 不得产生任何 CONSUME 流水`);
  assert.equal(taskCount, 0, `[${scenario}] 不得写入任何 componenttask 记录`);
}

describe("E1-FIX C19 差异化输入约束边界（fileConstraints）", () => {
  test("单一边界用例：.log MIME 放行 / 超过 3 份拒绝 / 超限字节数拒绝，且全程零扣点", async () => {
    const f = await setupFixture();
    try {
      // ---------- 1) .log MIME 放行 ----------
      // 空内容 .log：若 MIME 被放行，流程会越过 MIME 门禁并在「文本提取」阶段止步（INPUT_TEXT_NOT_EXTRACTED）；
      // 若被拦截则必然是 INPUT_MIME_NOT_ALLOWED —— 据此判定放行/拒绝，且全程不触碰真实模型。
      {
        const req = multipartReq(f.userToken, [
          { name: "slow.log", content: Buffer.from("", "utf-8"), mimeType: "text/x-log" },
        ], { workspaceId: f.workspaceId });
        const res = await studioPostRoute(req);
        const body = (await res.json()) as Record<string, unknown>;
        const code = String(body.code ?? "");
        assert.notEqual(code, "INPUT_MIME_NOT_ALLOWED", `.log 必须被合同 MIME 放行，实际被拦截：${String(body.error)}`);
        assert.equal(code, "INPUT_TEXT_NOT_EXTRACTED", `.log 放行后应止步于文本提取阶段，实际 code=${code}`);
        assert.equal(res.status, 400);
        await assertNoCharge(f.userId, ".log 放行");
      }

      // ---------- 2) 超过 3 份拒绝（maxCount=3，传 4 份） ----------
      {
        const files = Array.from({ length: MAX_COUNT + 1 }, (_unused, i) => ({
          name: `slow-${i + 1}.sql`,
          content: Buffer.from(`第 ${i + 1} 份慢查询日志片段`, "utf-8"),
          mimeType: "application/sql",
        }));
        const req = multipartReq(f.userToken, files, { workspaceId: f.workspaceId });
        const res = await studioPostRoute(req);
        const body = (await res.json()) as Record<string, unknown>;
        assert.equal(res.status, 400, `期望 400，实际 ${res.status} body=${JSON.stringify(body).slice(0, 160)}`);
        assert.equal(body.code, "INPUT_MULTIPLE_NOT_SUPPORTED", "超过 maxCount=3 必须被拒绝");
        assert.match(String(body.error), /超过组件合同允许的最大数量/);
        await assertNoCharge(f.userId, "超过 3 份");
      }

      // ---------- 3) 超限字节数拒绝（单文件 > maxSingleFileBytes） ----------
      {
        const oversize = MAX_SINGLE_FILE_BYTES + 1;
        const req = multipartReq(f.userToken, [
          { name: "huge.log", content: Buffer.alloc(oversize, 0x61), mimeType: "text/x-log" },
        ], { workspaceId: f.workspaceId });
        const res = await studioPostRoute(req);
        const body = (await res.json()) as Record<string, unknown>;
        assert.equal(res.status, 400, `期望 400，实际 ${res.status} body=${JSON.stringify(body).slice(0, 160)}`);
        assert.equal(body.code, "INPUT_TOO_LARGE", `超过单文件上限 ${MAX_SINGLE_FILE_BYTES} 字节必须被拒绝`);
        assert.match(String(body.error), /超过合同单文件上限/);
        await assertNoCharge(f.userId, "超限字节数");
      }
    } finally {
      await f.cleanup();
    }
  });
});
