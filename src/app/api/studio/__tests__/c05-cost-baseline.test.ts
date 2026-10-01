/**
 * C05 成本基准诚实性验收
 *
 * 强断言：
 *  - 平台真实历史基准未配置时，注入文本必须显式标注为「假设」，且不得伪装成真实来源；
 *  - 不产生默认单价（不伪造 COMPONENT_COST_BASELINE，不写入 systemconfig，不配置用户售价/加价）；
 *  - catalog API 必须向前端下发 `costBaselineStatus=ASSUMPTION`（前端据此显示警告，不写死假设单价）；
 *  - 真实执行的成果物必须保留模型原文中的「假设」说明（不得被清洗掉）。
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
process.env.MODEL_MAX_OUTPUT_TOKENS = "800";
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const C05 = "C05";

type PrismaMod = typeof import("@/lib/prisma");
type RouteMod = typeof import("../route");
type BaselineMod = typeof import("@/lib/component-cost-baseline");
let prisma: PrismaMod["prisma"];
let studioPostRoute: RouteMod["POST"];
let studioGetRoute: RouteMod["GET"];
let getComponentCostBaseline: BaselineMod["getComponentCostBaseline"];
let renderCostBaselineText: BaselineMod["renderCostBaselineText"];
let COST_BASELINE_CONFIG_KEY: BaselineMod["COST_BASELINE_CONFIG_KEY"];

function jsonReq(token: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/studio", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

async function setupFixture() {
  const s = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_c05b_${s}`;
  const workspaceId = `ws_c05b_${s}`;
  const balance = BigInt(100000);
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `c05b_${s}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
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
  ({ POST: studioPostRoute, GET: studioGetRoute } = await import("../route"));
  ({ getComponentCostBaseline, renderCostBaselineText, COST_BASELINE_CONFIG_KEY } = await import("@/lib/component-cost-baseline"));

  const warm = await setupFixture();
  try {
    await studioPostRoute(
      jsonReq(warm.userToken, {
        action: "simulate",
        workspaceId: warm.workspaceId,
        componentId: C05,
        inputMaterial: "预热：模块清单（用户中心 2 人）。",
      }),
    ).catch(() => null);
  } finally {
    await warm.cleanup();
  }
});

describe("C05 基准缺失诚实性（只读）", () => {
  test("1. 真实历史基准未配置 → 注入文本显式标记为「假设」，不得伪装真实来源", async () => {
    const baseline = await getComponentCostBaseline();
    assert.equal(baseline, null, "当前平台真实历史基准必须为「未配置」（若已接入真实基准，请更新本用例并改判为 CONFIGURED 分支）");

    const assumptionText = renderCostBaselineText(null);
    assert.ok(assumptionText.includes("假设"), "未配置基准时必须显式标注为「假设」");
    assert.ok(assumptionText.includes("未接入真实历史数据集"), "必须明确说明未接入真实历史数据集");
    assert.ok(
      !assumptionText.includes("真实历史基准（来源"),
      "未配置时绝不得渲染成「真实历史基准（来源…）」以免误导为真实报价",
    );

    // 不得伪造 COMPONENT_COST_BASELINE：库中不存在合法基准配置
    const row = await prisma.systemconfig.findUnique({ where: { key: COST_BASELINE_CONFIG_KEY } });
    const raw = row?.value;
    if (typeof raw === "string" && raw.trim()) {
      // 存在记录时，必须不是「合法可解析的基准」（否则 getComponentCostBaseline 不会返回 null）
      assert.fail("检测到 COMPONENT_COST_BASELINE 记录与基准解析结果不一致，需人工复核");
    }
  });

  test("2. 不产生默认单价：无用户售价、无平台加价", async () => {
    const pricing = await prisma.modelpricing.findMany({
      select: { priceInputMicrosPerMillion: true, priceOutputMicrosPerMillion: true, markupRateBps: true },
    });
    assert.equal(
      pricing.some((p) => p.priceInputMicrosPerMillion !== null || p.priceOutputMicrosPerMillion !== null),
      false,
      "不得配置用户售价（未开启真实结算）",
    );
    assert.equal(pricing.some((p) => p.markupRateBps !== null), false, "不得配置平台加价");
  });

  test("3. catalog API 必须下发 costBaselineStatus=ASSUMPTION（前端据此显示警告，不写死假设单价）", async () => {
    const client = await setupFixture();
    try {
      const res = await studioGetRoute(
        new NextRequest("http://localhost/api/studio?action=catalog", {
          method: "GET",
          headers: { Authorization: `Bearer ${client.userToken}` },
        }),
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      const components = (body.data?.components ?? []) as Array<Record<string, unknown>>;

      const c05 = components.find((c) => c.id === C05);
      assert.ok(c05, "catalog 必须包含 C05");
      assert.equal(c05!.costBaselineStatus, "ASSUMPTION", "C05 必须下发 ASSUMPTION（真实基准未配置）");
      // C05 合同本身必须声明 {{COST_BASELINE}} 占位符（否则不会有基准状态）
      const cat = await prisma.componentcatalog.findUnique({ where: { id: C05 }, select: { activeContractId: true } });
      const contract = await prisma.componentcontract.findUnique({ where: { id: cat!.activeContractId! } });
      const steps = ((contract?.contract as { executionPlan?: { steps?: Array<{ promptTemplate?: string }> } } | null)?.executionPlan?.steps ?? []);
      assert.ok(
        steps.some((s) => typeof s.promptTemplate === "string" && s.promptTemplate.includes("{{COST_BASELINE}}")),
        "C05 激活合同必须消费 {{COST_BASELINE}} 占位符",
      );

      // 不含占位符的组件不应下发基准状态（避免误导）
      const c02 = components.find((c) => c.id === "C02");
      assert.ok(c02, "catalog 必须包含 C02");
      assert.equal(c02!.costBaselineStatus ?? null, null, "不消费基准占位符的组件不得下发基准状态");
    } finally {
      await client.cleanup();
    }
  });
});

describe("C05 真实执行：成果物保留假设说明（真实外部模型）", () => {
  test("4. 真实调用成果物必须包含「假设」说明，且不得表述为平台真实报价", async () => {
    const f = await setupFixture();
    try {
      const res = await studioPostRoute(
        jsonReq(f.userToken, {
          action: "simulate",
          workspaceId: f.workspaceId,
          componentId: C05,
          inputMaterial:
            "模块清单：用户中心（2 人）、订单服务（3 人）、支付对接（2 人）、运维与监控（1 人）；团队共 8 人。请给出工时与成本估算。",
        }),
      );
      const json = await res.json();
      assert.equal(res.status, 200, `期望 200，实际 ${res.status} body=${JSON.stringify(json).slice(0, 300)}`);
      assert.equal(json.executionMode, "REAL_MODEL");
      assert.equal(json.billingMode, "ESTIMATED_COMPATIBILITY");
      assert.ok(json.actualPoints === null || json.actualPoints === undefined);

      const content = String(json.artifacts?.[0]?.content ?? "");
      assert.ok(content.trim().length > 0, "C05 成果物必须非空");
      assert.ok(
        content.includes("假设"),
        `成果物必须保留模型原文中的假设说明（不得被清洗掉），实际前 300 字：${content.slice(0, 300)}`,
      );
      assert.ok(Number(json.usage?.totalTokens) > 0, "必须产生真实 usage");
      assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "REFUND" } }), 0, "成功路径不得退款");
    } finally {
      await f.cleanup();
    }
  });
});
