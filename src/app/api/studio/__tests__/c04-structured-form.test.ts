/**
 * C04 结构化表单验收（合同字段驱动）
 *
 * 强断言：
 *  - 缺 audience / 缺 techPlan / 非法 audience → 400 INPUT_REQUIRED，不扣点、不写成功任务；
 *  - 合法 formData 真实进入 Studio：REAL_MODEL + artifact 非空 + contractVersion 返回；
 *  - 计费口径 billingMode=ESTIMATED_COMPATIBILITY、settlementEnabled=false；
 *  - 客户端不得提交 providerId/modelId（模型必须由服务端注册表裁决）。
 */

import test, { describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
process.env.JWT_SECRET = process.env.JWT_SECRET || "zhige-test-explicit-jwt-secret-key-min-32-chars!";
process.env.MODEL_TIMEOUT_MS = "600000";
process.env.MODEL_MAX_OUTPUT_TOKENS = "600";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const C04 = "C04";

type PrismaMod = typeof import("@/lib/prisma");
type RouteMod = typeof import("../route");
type SettlementMod = typeof import("@/lib/token-settlement-service");
let prisma: PrismaMod["prisma"];
let studioPostRoute: RouteMod["POST"];
let isTokenSettlementFeatureEnabled: SettlementMod["isTokenSettlementFeatureEnabled"];

function jsonReq(token: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/studio", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

async function setupFixture() {
  const s = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_c04f_${s}`;
  const workspaceId = `ws_c04f_${s}`;
  const balance = BigInt(100000);
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `c04f_${s}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
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

/** 校验 C04 合同字段确实来自数据库合同（而非前端硬编码） */
async function assertC04ContractFields() {
  const cat = await prisma.componentcatalog.findUnique({ where: { id: C04 }, select: { activeContractId: true } });
  assert.ok(cat?.activeContractId, "C04 必须有 activeContractId");
  const contract = await prisma.componentcontract.findUnique({ where: { id: cat!.activeContractId! } });
  assert.equal(contract?.lifecycle, "PUBLISHED");
  const input = (contract?.contract as { input?: { kind?: string; formConstraints?: { fields?: Array<{ name: string; required?: boolean; type?: string; options?: string[] }> } } } | null)?.input;
  assert.equal(input?.kind, "STRUCTURED_FORM", "C04 合同输入必须为 STRUCTURED_FORM");
  const fields = input?.formConstraints?.fields ?? [];
  const audience = fields.find((f) => f.name === "audience");
  const techPlan = fields.find((f) => f.name === "techPlan");
  assert.ok(audience && audience.type === "select" && audience.required === true, "audience 必须是必填 select");
  assert.deepEqual(audience!.options, ["高管", "技术", "两者"], "audience 选项必须来自合同");
  assert.ok(techPlan && techPlan.required === true, "techPlan 必须是必填字段");
  return { contractVersion: contract!.contractVersion };
}

before(async () => {
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST: studioPostRoute } = await import("../route"));
  ({ isTokenSettlementFeatureEnabled } = await import("@/lib/token-settlement-service"));

  // 真实预热（吸收冷启动；预热失败不判失败，清理失败必须暴露）
  const warm = await setupFixture();
  try {
    await studioPostRoute(
      jsonReq(warm.userToken, {
        action: "simulate",
        workspaceId: warm.workspaceId,
        componentId: C04,
        formData: { audience: "高管", techPlan: "预热材料：微服务架构与容器化部署。" },
      }),
    ).catch(() => null);
  } finally {
    await warm.cleanup();
  }
});

describe("C04 结构化表单（合同字段驱动 + 真实执行）", () => {
  const rejectCases: Array<{ name: string; formData: Record<string, unknown> | undefined; expectKeyword: string }> = [
    { name: "缺少 formData", formData: undefined, expectKeyword: "结构化表单" },
    { name: "缺少 audience", formData: { techPlan: "微服务架构，容器化部署。" }, expectKeyword: "汇报对象" },
    { name: "缺少 techPlan", formData: { audience: "高管" }, expectKeyword: "技术方案" },
    { name: "非法 audience", formData: { audience: "股东", techPlan: "微服务架构，容器化部署。" }, expectKeyword: "合法选项" },
  ];

  for (const c of rejectCases) {
    test(`拒绝：${c.name} → 400 INPUT_REQUIRED（不扣点、不写成功任务）`, async () => {
      const f = await setupFixture();
      try {
        await assertC04ContractFields();
        const res = await studioPostRoute(
          jsonReq(f.userToken, {
            action: "simulate",
            workspaceId: f.workspaceId,
            componentId: C04,
            ...(c.formData !== undefined ? { formData: c.formData } : {}),
          }),
        );
        const json = await res.json();
        assert.equal(res.status, 400, `期望 400，实际 ${res.status} body=${JSON.stringify(json).slice(0, 200)}`);
        assert.equal(json.code, "INPUT_REQUIRED");
        assert.ok(String(json.error).includes(c.expectKeyword), `错误信息必须明确指向问题字段，实际：${json.error}`);
        assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }), 0, "不得扣点");
        assert.equal(await prisma.componenttask.count({ where: { userId: f.userId } }), 0, "不得写成功任务");
      } finally {
        await f.cleanup();
      }
    });
  }

  test("合法 formData 真实进入 Studio：REAL_MODEL + artifact 非空 + 返回合同版本", async () => {
    const f = await setupFixture();
    try {
      const { contractVersion } = await assertC04ContractFields();

      const res = await studioPostRoute(
        jsonReq(f.userToken, {
          action: "simulate",
          workspaceId: f.workspaceId,
          componentId: C04,
          formData: {
            audience: "两者",
            techPlan: "技术方案：采用微服务架构，使用 Redis 缓存与消息队列削峰，数据库读写分离，部署于容器集群。",
          },
        }),
      );
      const json = await res.json();
      assert.equal(res.status, 200, `期望 200，实际 ${res.status} body=${JSON.stringify(json).slice(0, 300)}`);
      assert.equal(json.success, true);
      assert.equal(json.executionMode, "REAL_MODEL", "必须为真实模型执行");
      assert.equal(json.billingMode, "ESTIMATED_COMPATIBILITY");
      assert.ok(json.actualPoints === null || json.actualPoints === undefined, "actualPoints 必须为 null（兼容口径）");
      assert.equal(isTokenSettlementFeatureEnabled(), false, "settlementEnabled 必须为 false");

      // 模型不得由客户端指定：必须命中注册表裁决的 MagicAI/gpt-5.5
      assert.equal(json.provider?.id, "MagicAI");
      assert.equal(json.provider?.modelId, "gpt-5.5");

      // 成果物与合同版本
      assert.ok(Array.isArray(json.artifacts) && json.artifacts.length > 0, "必须有 artifact");
      const content = String(json.artifacts?.[0]?.content ?? "");
      assert.ok(content.trim().length > 0, "artifact 内容必须非空");
      assert.equal(json.contractVersion, contractVersion, `必须返回合同版本 ${contractVersion}`);

      // 真实 usage 与账务
      assert.ok(Number(json.usage?.totalTokens) > 0, `必须产生真实 usage，实际 ${JSON.stringify(json.usage)}`);
      const consumeRows = await prisma.pointledger.findMany({ where: { userId: f.userId, type: "CONSUME" }, select: { points: true } });
      const totalConsumed = consumeRows.reduce((s, r) => s + Number(r.points), 0);
      assert.ok(consumeRows.length >= 1, "必须存在消费流水");
      assert.equal(totalConsumed, Number(json.task?.estimatedPoints), "消费合计必须等于任务预估算力点");
      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "REFUND" } }), 0, "成功路径不得退款");

      // 落库任务也必须记录执行模式与合同版本
      const task = await prisma.componenttask.findFirst({ where: { userId: f.userId, type: C04 }, orderBy: { createdAt: "desc" } });
      assert.ok(task, "必须落库任务");
      const cfg = task!.config as { executionMode?: string; contractVersion?: string | null };
      assert.equal(cfg.executionMode, "REAL_MODEL");
      assert.equal(cfg.contractVersion, contractVersion, "任务 config 必须记录合同版本");
    } finally {
      await f.cleanup();
    }
  });
});
