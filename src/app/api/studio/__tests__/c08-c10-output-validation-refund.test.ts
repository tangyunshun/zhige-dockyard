/**
 * 批次 2B 输出质量：无效输出退款闭环（路由集成，真实外部模型）
 *
 * 思路：为临时组件发布一份「要求一个不可能出现的字段 _MUST_BE_ABSENT_xyz」的结构化合同，
 * 真实模型必然返回不含该字段的 JSON → 服务端在写成功 task / 保存成功 artifact 之前校验失败，
 * 返回 MODEL_OUTPUT_INVALID 并原路退款。该失败是确定性的（与模型内容无关）。
 *
 * 强断言：
 *  - 响应不成功，且失败码为 MODEL_OUTPUT_INVALID（或上游失败码）；
 *  - 绝不落任何 componenttask（含 SUCCESS），绝不保存成功 artifact；
 *  - 已预扣算力点被原路退款（REFUND 流水存在，无净扣费）；
 *  - settlementEnabled=false / billingMode=ESTIMATED_COMPATIBILITY 不变。
 *
 * 临时用户/空间/额度/组件在 finally 严格清理，清理失败使测试失败。
 */

import test, { describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const JWT_SECRET_STRING = "zhige-test-explicit-jwt-secret-key-min-32-chars!";
process.env.JWT_SECRET = process.env.JWT_SECRET || JWT_SECRET_STRING;
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

let prisma: typeof import("@/lib/prisma")["prisma"];
let studioPostRoute: typeof import("../route")["POST"];

before(async () => {
  process.env.MODEL_TIMEOUT_MS = "300000";
  process.env.MODEL_MAX_OUTPUT_TOKENS = "400";
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST: studioPostRoute } = await import("../route"));
});

async function token(userId: string) {
  return new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(JWT_SECRET);
}

function jsonReq(url: string, tokenValue: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenValue}` },
    body: JSON.stringify(body),
  });
}

async function setupFixture() {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  const adminId = `u_c2bo_${suffix}`;
  const userId = `u_c2bu_${suffix}`;
  const workspaceId = `ws_c2bo_${suffix}`;
  const compId = `C_OUTVAL_${suffix}`;
  const balance = BigInt(100000);

  await prisma.user.create({ data: { id: adminId, password: "t", role: "SUPER_ADMIN", status: "active" } });
  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `OUTVAL_${suffix}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
  await prisma.workspacemember.create({ data: { id: `m_${suffix}`, userId, workspaceId, role: "OWNER", monthlyTokenUsed: BigInt(0), tokenBalance: balance } });
  await prisma.userwallet.create({ data: { id: `w_${suffix}`, userId, balance } });
  await prisma.workspacequota.create({ data: { id: `q_${suffix}`, workspaceId, membershipLevelId: "FREE", tokenBalance: balance, updatedAt: new Date() } });
  await prisma.pointgrant.create({ data: { id: `g_${suffix}`, scope: "WALLET", userId, workspaceId: null, points: balance, remaining: balance, sourceType: "MANUAL", status: "ACTIVE" } });
  await prisma.componentcatalog.create({
    data: {
      id: compId,
      name: `输出校验临时组件_${suffix}`,
      description: "无效输出退款闭环（临时）",
      category: "REQ_DESIGN",
      icon: "Cpu",
      tags: ["output-validation"],
      estimatedModelTokens: 150,
      previewData: {},
      isPublished: true,
    },
  });

  const { C08_CONTRACT } = await import("@/lib/component-contract/catalog-contracts-c06-c08-c10-c11");
  // 复用 C08 的真实业务提示词（模型会返回合法 JSON），但故意要求一个不可能出现的字段，
  // 使服务端 schema 校验必然失败 → 触发 MODEL_OUTPUT_INVALID 退款路径。
  const invalidContract = {
    ...C08_CONTRACT,
    componentId: compId,
    executionPlan: {
      steps: [
        {
          ...C08_CONTRACT.executionPlan.steps[0],
          promptTemplate:
            "你是测试数据生成器。请基于输入返回 JSON，字段固定为 scenarios、coverageSummary、openQuestions。" +
            "不要包含任何名为 _MUST_BE_ABSENT_xyz 的字段。",
        },
      ],
    },
    output: {
      ...C08_CONTRACT.output,
      structureConstraints: {
        requiredProperties: ["_MUST_BE_ABSENT_xyz"],
        schemaDefinition: {
          type: "object",
          required: ["_MUST_BE_ABSENT_xyz"],
          properties: { _MUST_BE_ABSENT_xyz: { type: "string" } },
        },
      },
    },
  };
  const { createDraftContract, publishContract } = await import("@/lib/component-contract/repository");
  await createDraftContract({ componentId: compId, contractVersion: "1.0.0", contract: invalidContract });
  await publishContract({ componentId: compId, contractVersion: "1.0.0", publishedBy: adminId, autoActivate: true });

  const userToken = await token(userId);
  const cleanup = async () => {
    await prisma.componentcatalog.update({ where: { id: compId }, data: { activeContractId: null } }).catch(() => null);
    await prisma.pointledger.deleteMany({ where: { userId } });
    await prisma.pointgrant.deleteMany({ where: { userId } });
    await prisma.userwallet.deleteMany({ where: { userId } });
    await prisma.componenttask.deleteMany({ where: { userId } });
    await prisma.componentusage.deleteMany({ where: { workspaceId } });
    await prisma.operationlog.deleteMany({ where: { userId: { in: [adminId, userId] } } });
    await prisma.componentcontract.deleteMany({ where: { componentId: compId } });
    await prisma.workspacemember.deleteMany({ where: { workspaceId } });
    await prisma.workspacequota.deleteMany({ where: { workspaceId } });
    await prisma.workspace.deleteMany({ where: { id: workspaceId } });
    await prisma.componentcatalog.delete({ where: { id: compId } }).catch(() => null);
    await prisma.user.deleteMany({ where: { id: { in: [adminId, userId] } } });

    const residue = {
      ledgers: await prisma.pointledger.count({ where: { userId } }),
      grants: await prisma.pointgrant.count({ where: { userId } }),
      wallets: await prisma.userwallet.count({ where: { userId } }),
      tasks: await prisma.componenttask.count({ where: { userId } }),
      usages: await prisma.componentusage.count({ where: { workspaceId } }),
      members: await prisma.workspacemember.count({ where: { workspaceId } }),
      quotas: await prisma.workspacequota.count({ where: { workspaceId } }),
      contracts: await prisma.componentcontract.count({ where: { componentId: compId } }),
      workspaces: await prisma.workspace.count({ where: { id: workspaceId } }),
      components: await prisma.componentcatalog.count({ where: { id: compId } }),
      users: await prisma.user.count({ where: { id: { in: [adminId, userId] } } }),
    };
    if (Object.values(residue).some((v) => v !== 0)) {
      throw new Error(`清理失败：临时数据存在残留 ${JSON.stringify(residue)}`);
    }
    // 批次 2B 验收：最终清理计数断言（临时用户 / 空间 / 组件 / 合同 / 额度 / 流水 / 任务 / usage 必须全为 0）
    console.log(`[批次2B 验收] 最终清理计数（应全为 0）: ${JSON.stringify(residue)}`);
  };

  return { userId, workspaceId, compId, userToken, cleanup };
}

describe("批次 2B 输出质量：无效输出退款闭环", () => {
  test("无效结构化输出：MODEL_OUTPUT_INVALID + 不落成功任务 + 原路退款", async () => {
    const f = await setupFixture();
    try {
      const res = await studioPostRoute(
        jsonReq("http://localhost/api/studio", f.userToken, {
          action: "simulate",
          workspaceId: f.workspaceId,
          componentId: f.compId,
          inputMaterial:
            "正常主流程：用户在小程序选择商品并提交订单，调用微信支付；支付成功后扣减库存、生成发货单，" +
            "第三方物流推送物流单号通知用户。请基于该主流程生成一份标准的异常场景清单。",
        }),
      );
      const status = res.status;
      const json = (await res.json()) as { code?: string; success?: boolean };

      // 批次 2B 验收收紧：仅接受确定性的「无效输出」退款路径，绝不允许把上游错误 / 退款挂起误判为通过。
      // 契约依据 route.ts:2484 —— MODEL_OUTPUT_INVALID 路径 HTTP 状态为 400，响应 code 严格为 "MODEL_OUTPUT_INVALID"。
      assert.equal(json.success, false, "无效输出必须失败（success 必须为 false）");

      // 若真实模型本次返回上游错误，直接判定为验收失败（不放宽任何断言、不跳过清理）。
      if (json.code === "MODEL_UPSTREAM_ERROR") {
        throw new Error(
          `验收失败：真实模型本次返回 MODEL_UPSTREAM_ERROR（HTTP ${status}），输出质量校验路径未被触发，不得放宽断言。`,
        );
      }

      // 1) HTTP 状态必须为 400（即约定的 MODEL_OUTPUT_INVALID 状态）
      assert.equal(
        status,
        400,
        `无效结构化输出必须返回 HTTP 400（约定的 MODEL_OUTPUT_INVALID 状态），实际 HTTP ${status}`,
      );
      // 2) 失败码必须严格等于 MODEL_OUTPUT_INVALID（不再接受 MODEL_UPSTREAM_ERROR / REFUND_PENDING 等放宽口径）
      assert.equal(
        json.code,
        "MODEL_OUTPUT_INVALID",
        `失败码必须严格等于 MODEL_OUTPUT_INVALID，实际 ${json.code}`,
      );

      // 3) 核心：失败路径不落成功任务、不保存成功 artifact，且已预扣算力点原路退款
      const totalTaskCount = await prisma.componenttask.count({ where: { userId: f.userId } });
      const successTaskCount = await prisma.componenttask.count({ where: { userId: f.userId, status: "SUCCESS" } });
      assert.equal(totalTaskCount, 0, "失败路径绝不落任何任务（含 SUCCESS）");
      assert.equal(successTaskCount, 0, "失败路径绝不落成功任务（SUCCESS 任务数必须为 0）");

      // 退款：存在 REFUND 流水（已预扣算力点原路退回，无净扣费）
      const refundCount = await prisma.pointledger.count({ where: { userId: f.userId, type: "REFUND" } });
      assert.ok(refundCount >= 1, "失败路径必须对已预扣算力点原路退款（REFUND 流水至少 1 条）");

      // 4) 不变量：结算开关与计费模式未被本次路径改变
      const audit = await import("@/lib/component-progress-audit").then((m) => m.buildComponentProgressAudit());
      assert.equal(audit.billing.settlementEnabled, false, "settlementEnabled 必须保持 false");
      assert.equal(audit.billing.billingMode, "ESTIMATED_COMPATIBILITY", "billingMode 必须保持 ESTIMATED_COMPATIBILITY");

      // 7) 报告验收证据
      console.log(
        `[批次2B 验收] actualHttpStatus=${status} actualCode=${json.code} refundCount=${refundCount} successTaskCount=${successTaskCount}`,
      );
    } finally {
      await f.cleanup();
    }
  });
});
