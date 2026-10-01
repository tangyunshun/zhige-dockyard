import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { GET, PATCH } from "../[deploymentId]/route";

/**
 * 管理员价格接口测试：权限、非法价格、版本递增与审计日志、历史快照不可变。
 * 使用临时 provider/deployment/管理员，测试后清理；不触碰真实数据与密钥。
 */
const TEST_JWT_SECRET_STRING = "zhige-test-explicit-jwt-secret-key-min-32-chars!";
process.env.JWT_SECRET = process.env.JWT_SECRET || TEST_JWT_SECRET_STRING;
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

async function adminToken(uid: string) {
  return new SignJWT({ userId: uid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(JWT_SECRET);
}

function req(url: string, init?: { method?: string; token?: string; body?: unknown }) {
  return new NextRequest(url, {
    method: init?.method ?? "GET",
    headers: {
      ...(init?.token ? { Authorization: `Bearer ${init.token}` } : {}),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init?.body ? { body: JSON.stringify(init.body) } : {}),
  });
}

async function fixture() {
  const adminId = "it_mp_u_" + randomUUID();
  const providerName = "it_mp_p_" + randomUUID();
  const depId = randomUUID();
  await prisma.user.create({ data: { id: adminId, password: "x", role: "SUPER_ADMIN", status: "active" } });
  await prisma.modelprovider.create({
    data: {
      id: randomUUID(),
      name: providerName,
      protocol: "OPENAI_COMPATIBLE",
      baseUrl: "https://api.example.com/v1",
      apiKeyEnv: "MODEL_API_KEY",
      enabled: true,
    },
  });
  await prisma.modeldeployment.create({
    data: {
      id: depId,
      providerId: providerName,
      modelId: "it-price-model",
      upstreamModel: "it-price-model",
      enabled: true,
    },
  });
  const cleanup = async () => {
    await prisma.modelpricing.deleteMany({ where: { deploymentId: depId } }).catch(() => {});
    await prisma.modeldeployment.deleteMany({ where: { id: depId } }).catch(() => {});
    await prisma.modelprovider.deleteMany({ where: { name: providerName } }).catch(() => {});
    await prisma.componenttask.deleteMany({ where: { userId: adminId } }).catch(() => {});
    await prisma.operationlog.deleteMany({ where: { userId: adminId } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: adminId } }).catch(() => {});
  };
  return { adminId, depId, cleanup };
}

describe("管理员模型价格接口", { skip: !process.env.DATABASE_URL }, () => {
  test("旧价格字段已从 modeldeployment 物理移除（新建模型不可能只写旧价格）", async () => {
    const rows = await prisma.$queryRaw<Array<{ COLUMN_NAME: string }>>`
      SELECT COLUMN_NAME FROM information_schema.columns
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'modeldeployment'
        AND COLUMN_NAME IN ('inputPricePer1KCents', 'outputPricePer1KCents')
    `;
    assert.equal(rows.length, 0, "modeldeployment 旧价格列必须已删除");
  });

  test("未授权 → 401/403", async () => {
    const f = await fixture();
    try {
      const g = await GET(req(`http://localhost:3000/api/admin/model-pricing/${f.depId}`), {
        params: Promise.resolve({ deploymentId: f.depId }),
      });
      assert.ok(g.status === 401 || g.status === 403, `GET 未授权应 401/403，实际 ${g.status}`);
      const p = await PATCH(req("http://localhost:3000/api/admin/model-pricing/x", { method: "PATCH", body: {} }), {
        params: Promise.resolve({ deploymentId: f.depId }),
      });
      assert.ok(p.status === 401 || p.status === 403, `PATCH 未授权应 401/403，实际 ${p.status}`);
    } finally {
      await f.cleanup();
    }
  });

  test("非法价格（负数 / 小数）→ 400，不写入任何价格", async () => {
    const f = await fixture();
    try {
      const token = await adminToken(f.adminId);
      for (const body of [{ priceInputMicrosPerMillion: -1 }, { priceInputMicrosPerMillion: 1.5 }]) {
        const res = await PATCH(
          req("http://localhost:3000/api/admin/model-pricing/x", { method: "PATCH", token, body }),
          { params: Promise.resolve({ deploymentId: f.depId }) },
        );
        assert.equal(res.status, 400, `非法价格应 400，实际 ${res.status}`);
      }
      assert.equal(await prisma.modelpricing.count({ where: { deploymentId: f.depId } }), 0, "非法请求不得写入价格");
    } finally {
      await f.cleanup();
    }
  });

  test("合法改价：版本递增 + 审计日志 + 历史任务快照不可变", async () => {
    const f = await fixture();
    try {
      const token = await adminToken(f.adminId);
      const url = "http://localhost:3000/api/admin/model-pricing/x";

      // 第一次改价
      const r1 = await PATCH(
        req(url, {
          method: "PATCH",
          token,
          body: {
            // DIRECT_PRICE：只提交直接售价（不提交加价率）
            costInputMicrosPerMillion: 1_000_000,
            priceInputMicrosPerMillion: 2_000_000,
            priceOutputMicrosPerMillion: 12_000_000,
            priceSource: "VERIFIED",
            effectiveFrom: "2026-09-19T00:00:00.000Z",
          },
        }),
        { params: Promise.resolve({ deploymentId: f.depId }) },
      );
      assert.equal(r1.status, 200, `合法改价应 200，实际 ${r1.status}`);
      const b1 = await r1.json();
      assert.equal(b1.data.priceVersion, 1);
      assert.equal(b1.data.priceStatus, "VERIFIED");
      assert.equal(b1.data.userPrice.priceInputMicrosPerMillion, 2_000_000);

      // 历史任务：写入当时的快照
      const taskId = "it_mp_task_" + randomUUID();
      await prisma.componenttask.create({
        data: {
          id: taskId,
          name: "it-price-task",
          type: "component",
          status: "completed",
          userId: f.adminId,
          config: { executionMode: "REAL_MODEL", pricingSnapshot: b1.data },
        },
      });

      // 第二次改价（涨价）
      const r2 = await PATCH(
        req(url, { method: "PATCH", token, body: { priceInputMicrosPerMillion: 9_000_000, priceSource: "VERIFIED" } }),
        { params: Promise.resolve({ deploymentId: f.depId }) },
      );
      assert.equal(r2.status, 200);
      const b2 = await r2.json();
      assert.equal(b2.data.priceVersion, 2, "每次改价版本必须递增");
      assert.equal(b2.data.userPrice.priceInputMicrosPerMillion, 9_000_000);

      // 历史任务快照必须保持不变（不得重算历史账单）
      const task = await prisma.componenttask.findUnique({ where: { id: taskId }, select: { config: true } });
      const snap = (task?.config as any)?.pricingSnapshot;
      assert.equal(snap.priceVersion, 1, "历史快照版本不得被改写");
      assert.equal(snap.userPrice.priceInputMicrosPerMillion, 2_000_000, "历史快照价格不得被改写");
      assert.equal(await prisma.modelpricing.count({ where: { deploymentId: f.depId } }), 1, "每个部署只保留一条当前价");

      // 审计日志：两次改价各一条，且不含密钥
      const logs = await prisma.operationlog.findMany({
        where: { userId: f.adminId, action: "UPDATE_MODEL_PRICING" },
        select: { details: true },
      });
      assert.equal(logs.length, 2, "两次改价必须各写一条审计日志");
      const serialized = JSON.stringify(logs);
      assert.ok(!/apiKey|MODEL_API_KEY\s*[:=]\s*["']?sk-/.test(serialized), "审计日志不得包含密钥");
    } finally {
      await f.cleanup();
    }
  });

  test("COST_PLUS_MARKUP：只提交 markupRateBps（不提交直接售价）→ 200", async () => {
    const f = await fixture();
    try {
      const token = await adminToken(f.adminId);
      const url = "http://localhost:3000/api/admin/model-pricing/x";
      // 先落成本（成本 + 加价模式的前提）
      const r1 = await PATCH(
        req(url, { method: "PATCH", token, body: { costInputMicrosPerMillion: 5_000_000, costOutputMicrosPerMillion: 30_000_000, priceSource: "VERIFIED" } }),
        { params: Promise.resolve({ deploymentId: f.depId }) },
      );
      assert.equal(r1.status, 200);
      // 只提交加价率
      const r2 = await PATCH(
        req(url, { method: "PATCH", token, body: { markupRateBps: 2000 } }),
        { params: Promise.resolve({ deploymentId: f.depId }) },
      );
      assert.equal(r2.status, 200, `COST_PLUS_MARKUP 应 200，实际 ${r2.status}`);
      const b2 = await r2.json();
      assert.equal(b2.data.priceVersion, 2, "改价版本必须递增");
      assert.equal(b2.data.userPrice.priceInputMicrosPerMillion, null, "COST_PLUS_MARKUP 不写入直接售价字段");
      // 解析出的有效售价应为 成本×(1+20%)
      const { resolveEffectiveUserPrice } = await import("@/lib/model-pricing");
      const eff = resolveEffectiveUserPrice({
        currency: "CNY",
        costInputMicrosPerMillion: 5_000_000,
        costOutputMicrosPerMillion: 30_000_000,
        costCacheReadMicrosPerMillion: null,
        costCacheWriteMicrosPerMillion: null,
        priceInputMicrosPerMillion: b2.data.userPrice.priceInputMicrosPerMillion,
        priceOutputMicrosPerMillion: b2.data.userPrice.priceOutputMicrosPerMillion,
        priceCacheReadMicrosPerMillion: null,
        priceCacheWriteMicrosPerMillion: null,
        priceSource: "VERIFIED",
        priceStatus: "VERIFIED",
        markupRateBps: b2.data.markupRateBps,
        priceVersion: b2.data.priceVersion,
        effectiveFrom: null,
      });
      assert.equal(eff.mode, "COST_PLUS_MARKUP");
      assert.equal(eff.inputMicrosPerMillion, 6_000_000);
      assert.equal(eff.outputMicrosPerMillion, 36_000_000);
    } finally {
      await f.cleanup();
    }
  });

  test("定价模式互斥：同一请求同时提交 → 400；分两次提交后合并冲突 → 400", async () => {
    const f = await fixture();
    try {
      const token = await adminToken(f.adminId);
      const url = "http://localhost:3000/api/admin/model-pricing/x";

      // ① 同一请求同时提交直接售价与加价率
      const same = await PATCH(
        req(url, {
          method: "PATCH",
          token,
          body: {
            priceInputMicrosPerMillion: 6_000_000,
            priceOutputMicrosPerMillion: 36_000_000,
            markupRateBps: 2000,
          },
        }),
        { params: Promise.resolve({ deploymentId: f.depId }) },
      );
      assert.equal(same.status, 400, `同一请求混用两种模式应 400，实际 ${same.status}`);

      // ② 先 DIRECT_PRICE，再单独提交加价率 → 合并后冲突
      const step1 = await PATCH(
        req(url, { method: "PATCH", token, body: { priceInputMicrosPerMillion: 6_000_000, priceOutputMicrosPerMillion: 36_000_000, priceSource: "VERIFIED" } }),
        { params: Promise.resolve({ deploymentId: f.depId }) },
      );
      assert.equal(step1.status, 200);
      const step2 = await PATCH(
        req(url, { method: "PATCH", token, body: { markupRateBps: 2000 } }),
        { params: Promise.resolve({ deploymentId: f.depId }) },
      );
      assert.equal(step2.status, 400, `分两次提交合并冲突应 400，实际 ${step2.status}`);
    } finally {
      await f.cleanup();
    }
  });
});
