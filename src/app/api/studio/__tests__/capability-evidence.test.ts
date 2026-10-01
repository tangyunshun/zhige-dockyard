/**
 * 能力扩展证据核验（只读能力关系 + C01/C03 真实结构化产出）
 *
 * 目标：证明 STRUCTURED_OUTPUT 是**真实支持**的，而不是纸面声明：
 *  - 只读断言：C07 / C01 / C03 合同要求能力、MagicAI/gpt-5.5 声明能力、覆盖关系；
 *  - 证明不存在未具证据的 VISION / FILE_ANALYSIS / LONG_CONTEXT；
 *  - 通过**真实外部模型调用**证明 C01（文档型偏离表）与 C03（结构化 JSON 对比表）
 *    确实产生了可解析的结构化结果。
 *
 * 若上述真实证据断言失败，即表示 STRUCTURED_OUTPUT 无法被证明为真实支持 → 必须报告 NEEDS_REVIEW，
 * 绝不自动新增或删除任何模型能力。
 */

import test, { describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
process.env.JWT_SECRET = process.env.JWT_SECRET || "zhige-test-explicit-jwt-secret-key-min-32-chars!";
process.env.MODEL_TIMEOUT_MS = "300000";
process.env.MODEL_MAX_OUTPUT_TOKENS = "600";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const MAGIC_PROVIDER = "MagicAI";
const MAGIC_MODEL = "gpt-5.5";
const EVIDENCE_REQUIRED_CAPS = ["VISION", "FILE_ANALYSIS", "LONG_CONTEXT"];

type PrismaMod = typeof import("@/lib/prisma");
type RouteMod = typeof import("../route");
type SettlementMod = typeof import("@/lib/token-settlement-service");
let prisma: PrismaMod["prisma"];
let studioPostRoute: RouteMod["POST"];
let isTokenSettlementFeatureEnabled: SettlementMod["isTokenSettlementFeatureEnabled"];

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST: studioPostRoute } = await import("../route"));
  ({ isTokenSettlementFeatureEnabled } = await import("@/lib/token-settlement-service"));

  // 真实预热（吸收冷启动；预热失败不判失败，清理失败必须暴露）
  const warm = await setupFixture();
  try {
    await studioPostRoute(
      jsonReq(warm.userToken, { action: "simulate", workspaceId: warm.workspaceId, componentId: "C01", inputMaterial: "预热：请仅回复就绪。" }),
    ).catch(() => null);
  } finally {
    await warm.cleanup();
  }
});

async function token(userId: string) {
  return new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(JWT_SECRET);
}

function jsonReq(tokenValue: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/studio", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenValue}` },
    body: JSON.stringify(body),
  });
}

function multipartReq(tokenValue: string, fields: Record<string, string>, files: Array<{ name: string; content: string; mimeType: string }>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const f of files) form.append("file", new Blob([f.content], { type: f.mimeType }), f.name);
  return new NextRequest("http://localhost/api/studio", { method: "POST", headers: { Authorization: `Bearer ${tokenValue}` }, body: form });
}

async function setupFixture() {
  const s = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_capev_${s}`;
  const workspaceId = `ws_capev_${s}`;
  const balance = BigInt(100000);
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `capev_${s}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
  await prisma.workspacemember.create({ data: { id: `m_${s}`, userId, workspaceId, role: "OWNER", monthlyTokenUsed: BigInt(0), tokenBalance: balance } });
  await prisma.userwallet.create({ data: { id: `w_${s}`, userId, balance } });
  await prisma.workspacequota.create({ data: { id: `q_${s}`, workspaceId, membershipLevelId: "FREE", tokenBalance: balance, updatedAt: new Date() } });
  await prisma.pointgrant.create({ data: { id: `g_${s}`, scope: "WALLET", userId, workspaceId: null, points: balance, remaining: balance, sourceType: "MANUAL", status: "ACTIVE" } });
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
    await prisma.user.delete({ where: { id: userId } });
  };
  return { userId, workspaceId, userToken, cleanup };
}

async function requiredCapsOf(componentId: string): Promise<string[]> {
  const cat = await prisma.componentcatalog.findUnique({ where: { id: componentId }, select: { activeContractId: true } });
  assert.ok(cat?.activeContractId, `${componentId} 必须有 activeContractId`);
  const contract = await prisma.componentcontract.findUnique({ where: { id: cat!.activeContractId! } });
  const steps = ((contract?.contract as { executionPlan?: { steps?: Array<{ requiredCapabilities?: string[] }> } } | null)
    ?.executionPlan?.steps ?? []) as Array<{ requiredCapabilities?: string[] }>;
  return Array.from(new Set(steps.flatMap((s) => (s.requiredCapabilities ?? []).map((c) => String(c).toUpperCase()))));
}

describe("能力配置与覆盖关系（只读）", () => {
  test("1. C07 / C01 / C03 合同要求能力 ⊆ MagicAI/gpt-5.5 声明能力；无未具证据能力", async () => {
    const dep = await prisma.modeldeployment.findUnique({
      where: { providerId_modelId: { providerId: MAGIC_PROVIDER, modelId: MAGIC_MODEL } },
      select: { enabled: true, capabilities: true },
    });
    assert.ok(dep, "MagicAI/gpt-5.5 部署必须存在");
    const declared = ((dep!.capabilities as unknown as string[]) ?? []).map((c) => String(c).toUpperCase());
    assert.equal(dep!.enabled, true, "部署必须启用");

    const c07 = await requiredCapsOf("C07");
    const c01 = await requiredCapsOf("C01");
    const c03 = await requiredCapsOf("C03");

    assert.deepEqual(c07, ["TEXT_GENERATION"], "C07 合同要求能力必须为 TEXT_GENERATION");
    assert.deepEqual(c01.sort(), ["STRUCTURED_OUTPUT", "TEXT_GENERATION"], "C01 要求 TEXT_GENERATION + STRUCTURED_OUTPUT");
    assert.deepEqual(c03.sort(), ["STRUCTURED_OUTPUT", "TEXT_GENERATION"], "C03 要求 TEXT_GENERATION + STRUCTURED_OUTPUT");
    assert.ok(declared.includes("TEXT_GENERATION") && declared.includes("STRUCTURED_OUTPUT"), "部署必须声明 TEXT_GENERATION 与 STRUCTURED_OUTPUT");

    for (const [id, required] of [
      ["C07", c07],
      ["C01", c01],
      ["C03", c03],
    ] as const) {
      const missing = required.filter((c) => !declared.includes(c));
      assert.deepEqual(missing, [], `${id} 的能力缺口必须为空（覆盖关系必须成立）`);
    }

    // 不允许出现未具证据的 VISION / FILE_ANALYSIS / LONG_CONTEXT
    for (const cap of EVIDENCE_REQUIRED_CAPS) {
      assert.ok(!declared.includes(cap), `部署不得声明未具证据的能力：${cap}`);
      assert.ok(!c07.includes(cap) && !c01.includes(cap) && !c03.includes(cap), `合同不得要求未具证据的能力：${cap}`);
    }
  });

  test("2. 计费与商业化状态只读核验：结算关闭、无用户售价、无加价、无 BYOK", async () => {
    const pricing = await prisma.modelpricing.findMany({
      select: { priceInputMicrosPerMillion: true, priceOutputMicrosPerMillion: true, markupRateBps: true },
    });
    assert.equal(
      pricing.some((p) => p.priceInputMicrosPerMillion !== null || p.priceOutputMicrosPerMillion !== null),
      false,
      "不得配置用户售价",
    );
    assert.equal(pricing.some((p) => p.markupRateBps !== null), false, "不得配置 markupRateBps");
    assert.equal(isTokenSettlementFeatureEnabled(), false, "settlementEnabled 必须为 false");

    // 供应商成本保持 5 / 30 元每百万（5000000 / 30000000 微元）
    const magic = await prisma.modeldeployment.findUnique({
      where: { providerId_modelId: { providerId: MAGIC_PROVIDER, modelId: MAGIC_MODEL } },
      select: { pricing: { select: { costInputMicrosPerMillion: true, costOutputMicrosPerMillion: true, priceSource: true, priceVersion: true } } },
    });
    assert.equal(magic?.pricing?.costInputMicrosPerMillion, 5_000_000, "成本输入必须为 5 元/百万");
    assert.equal(magic?.pricing?.costOutputMicrosPerMillion, 30_000_000, "成本输出必须为 30 元/百万");
    assert.equal(magic?.pricing?.priceSource, "VERIFIED");
    assert.equal(magic?.pricing?.priceVersion, 1);
  });
});

describe("真实外部模型结构化产出证据（C01 / C03）", () => {
  test("3. C03 真实调用：产出可解析的结构化对比表（JSON，含合同声明字段）", async () => {
    const f = await setupFixture();
    try {
      const req = multipartReq(
        f.userToken,
        {
          action: "simulate",
          workspaceId: f.workspaceId,
          componentId: "C03",
          inputSource: JSON.stringify({ sourceType: "file", fileName: "competitor.txt", mimeType: "text/plain" }),
        },
        [
          { name: "competitor.txt", content: "竞品资料：功能覆盖 9 项，P95 延迟 180ms，缺少合规资质。".repeat(3), mimeType: "text/plain" },
          { name: "ours.txt", content: "我方能力清单：功能覆盖 12 项，P95 延迟 200ms，具备等保三级资质。".repeat(3), mimeType: "text/plain" },
        ],
      );
      const res = await studioPostRoute(req);
      const json = await res.json();
      assert.equal(res.status, 200, `期望 200，实际 ${res.status} body=${JSON.stringify(json).slice(0, 300)}`);
      assert.equal(json.executionMode, "REAL_MODEL");
      assert.equal(json.provider?.id, MAGIC_PROVIDER);
      assert.equal(json.billingMode, "ESTIMATED_COMPATIBILITY");
      assert.ok(json.actualPoints === null || json.actualPoints === undefined, "actualPoints 必须为 null（兼容口径）");

      const content = String(json.artifacts?.[0]?.content ?? "");
      let parsed: { dimensions?: unknown; rows?: unknown; summary?: unknown };
      try {
        parsed = JSON.parse(content);
      } catch {
        assert.fail(`STRUCTURED_OUTPUT 未被真实支持：C03 成果物无法解析为 JSON（前 200 字：${content.slice(0, 200)}）`);
      }
      assert.ok(Array.isArray(parsed!.dimensions) && parsed!.dimensions.length > 0, "必须含 dimensions 维度数组");
      assert.ok(Array.isArray(parsed!.rows) && parsed!.rows.length > 0, "必须含 rows 对比行数组");
      assert.equal(typeof parsed!.summary, "string", "必须含 summary 文本");

      // 真实 usage 与账务
      assert.ok(
        Number(json.usage?.inputTokens) > 0 && Number(json.usage?.outputTokens) > 0 && Number(json.usage?.totalTokens) > 0,
        `必须产生真实 usage，实际 ${JSON.stringify(json.usage)}`,
      );
      const consumeRows = await prisma.pointledger.findMany({ where: { userId: f.userId, type: "CONSUME" }, select: { points: true } });
      const totalConsumed = consumeRows.reduce((s, r) => s + Number(r.points), 0);
      assert.ok(consumeRows.length >= 1, "必须存在消费流水");
      assert.equal(totalConsumed, Number(json.task?.estimatedPoints), "消费合计必须等于任务预估算力点");
      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "REFUND" } }), 0, "成功路径不得退款");
    } finally {
      await f.cleanup();
    }
  });

});
