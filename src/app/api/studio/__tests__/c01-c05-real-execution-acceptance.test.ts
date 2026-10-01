/**
 * C01-C05 真实外部模型端到端执行验收
 *
 * 目标：对已 PUBLISHED + 激活的 C01-C05 激活合同，走真实生产路由（POST /api/studio "simulate"）
 * 完成真实外部模型调用，验证 executionMode=REAL_MODEL、真实 usage、真实成果物与账务。
 *
 * 约束：
 *  - 使用真实注册表部署（MagicAI/gpt-5.5），不切换供应商/不改 baseUrl/不打印密钥；
 *  - 临时用户/空间/账务，finally 严格清理，清理失败即测试失败；
 *  - 真实端点延迟波动大（首次调用冷启动），before() 先做一次真实预热调用以吸收冷启动。
 */

import test, { describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "zhige-test-explicit-jwt-secret-key-min-32-chars!",
);
process.env.JWT_SECRET = process.env.JWT_SECRET || "zhige-test-explicit-jwt-secret-key-min-32-chars!";

type PrismaMod = typeof import("@/lib/prisma");
type RouteMod = typeof import("../route");

let prisma: PrismaMod["prisma"];
let studioPostRoute: RouteMod["POST"];

before(async () => {
  process.env.MODEL_TIMEOUT_MS = "300000";
  process.env.MODEL_MAX_OUTPUT_TOKENS = "300";
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST: studioPostRoute } = await import("../route"));

  // 真实预热调用，吸收首次调用冷启动（预热失败不判失败，但清理失败必须暴露）
  const warm = await setupFixture();
  try {
    await studioPostRoute(jsonReq(warm.userToken, { action: "simulate", workspaceId: warm.workspaceId, componentId: "C04", inputMaterial: "预热调用：请仅回复就绪。" })).catch(() => null);
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

function multipartReq(
  tokenValue: string,
  fields: Record<string, string>,
  files: Array<{ name: string; content: string; mimeType: string }>,
): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  for (const f of files) form.append("file", new Blob([f.content], { type: f.mimeType }), f.name);
  return new NextRequest("http://localhost/api/studio", { method: "POST", headers: { Authorization: `Bearer ${tokenValue}` }, body: form });
}

function fileFields(workspaceId: string, componentId: string, fileName: string) {
  return {
    action: "simulate",
    workspaceId,
    componentId,
    inputSource: JSON.stringify({ sourceType: "file", fileName, mimeType: "text/plain" }),
  };
}

async function setupFixture() {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_c0105_${suffix}`;
  const workspaceId = `ws_c0105_${suffix}`;
  const balance = BigInt(100000);
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `C0105_${suffix}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
  await prisma.workspacemember.create({ data: { id: `m_${suffix}`, userId, workspaceId, role: "OWNER", monthlyTokenUsed: BigInt(0), tokenBalance: balance } });
  await prisma.userwallet.create({ data: { id: `w_${suffix}`, userId, balance } });
  await prisma.workspacequota.create({ data: { id: `q_${suffix}`, workspaceId, membershipLevelId: "FREE", tokenBalance: balance, updatedAt: new Date() } });
  await prisma.pointgrant.create({ data: { id: `g_${suffix}`, scope: "WALLET", userId, workspaceId: null, points: balance, remaining: balance, sourceType: "MANUAL", status: "ACTIVE" } });
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

async function assertRealExecution(f: Awaited<ReturnType<typeof setupFixture>>, componentId: string, req: NextRequest) {
  const res = await studioPostRoute(req);
  const json = await res.json();
  assert.equal(res.status, 200, `${componentId} 期望 200，实际 ${res.status} body=${JSON.stringify(json).slice(0, 220)}`);
  assert.equal(json.executionMode, "REAL_MODEL", `${componentId} 必须真实模型执行`);
  assert.ok(json.provider && json.provider.id === "MagicAI" && json.provider.modelId === "gpt-5.5", `${componentId} provider 必须 MagicAI/gpt-5.5`);
  assert.equal(json.billingMode, "ESTIMATED_COMPATIBILITY");
  assert.ok(Array.isArray(json.artifacts) && json.artifacts.length > 0, `${componentId} 必须有 artifact`);
  assert.ok(typeof json.artifacts[0].content === "string" && json.artifacts[0].content.trim().length > 0, `${componentId} artifact 内容非空`);
  assert.ok(
    Number(json.usage?.inputTokens) > 0 && Number(json.usage?.outputTokens) > 0 && Number(json.usage?.totalTokens) > 0,
    `${componentId} usage 必须真实正数，实际 ${JSON.stringify(json.usage)}`,
  );
  const consumeLedgers = await prisma.pointledger.findMany({
    where: { userId: f.userId, type: "CONSUME" },
    select: { points: true },
  });
  assert.ok(consumeLedgers.length >= 1, `${componentId} 必须存在消费流水`);
  const totalConsumed = consumeLedgers.reduce((s, l) => s + Number(l.points), 0);
  assert.equal(totalConsumed, Number(json.task?.estimatedPoints), `${componentId} 消费点数必须等于任务预估算力点`);
  assert.equal(
    await prisma.pointledger.count({ where: { userId: f.userId, type: "REFUND" } }),
    0,
    `${componentId} 成功路径不得产生退款流水`,
  );
}

const MD = (s: string) => s.repeat(3);

describe("C01-C05 真实外部模型端到端执行验收", () => {
  for (const componentId of ["C01", "C02", "C03", "C04", "C05"] as const) {
    test(`${componentId} 真实执行：REAL_MODEL + 真实 usage + 成果物 + 单条消费流水`, async () => {
      const f = await setupFixture();
      try {
        let req: NextRequest;
        if (componentId === "C04") {
          // C04 为结构化表单（汇报对象 + 技术方案）
          req = jsonReq(f.userToken, {
            action: "simulate",
            workspaceId: f.workspaceId,
            componentId,
            formData: {
              audience: "两者",
              techPlan: "技术方案：采用微服务架构，使用 Redis 缓存与消息队列削峰，数据库读写分离，部署于容器集群。",
            },
          });
        } else if (componentId === "C05") {
          req = jsonReq(f.userToken, {
            action: "simulate",
            workspaceId: f.workspaceId,
            componentId,
            inputMaterial: "模块清单：用户中心（2 人）、订单服务（3 人）、支付对接（2 人）、运维与监控（1 人）；团队共 8 人。",
          });
        } else {
          // C01/C02 单文件；C03 多文件
          const files =
            componentId === "C03"
              ? [
                  { name: "competitor.txt", content: MD("【竞品资料】竞品功能覆盖 9 项，P95 延迟 180ms，缺少合规资质。"), mimeType: "text/plain" },
                  { name: "ours.txt", content: MD("【我方能力清单】我方功能覆盖 12 项，P95 延迟 200ms，具备等保三级资质。"), mimeType: "text/plain" },
                ]
              : [
                  {
                    name: "doc.txt",
                    content:
                      componentId === "C01"
                        ? MD("招标文件：要求具备等保三级资质，工期 6 个月，预算 500 万，需提供三年运维。")
                        : MD("技术方案：采用等保三级设计，密码模块符合商用密码要求，缺少安全审计与日志留存设计。"),
                    mimeType: "text/plain",
                  },
                ];
          req = multipartReq(f.userToken, fileFields(f.workspaceId, componentId, files[0].name), files);
        }
        await assertRealExecution(f, componentId, req);
      } finally {
        await f.cleanup();
      }
    });
  }
});
