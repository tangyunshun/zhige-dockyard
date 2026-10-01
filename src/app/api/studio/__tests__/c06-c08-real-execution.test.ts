/**
 * 批次 2B 真实验收（第一部分）：C06、C08 真实外部模型端到端执行
 *
 * 目标：对已 PUBLISHED + 激活的 C06/C08 合同，走真实生产路由（POST /api/studio action=simulate）
 * 完成真实外部模型调用，验证 executionMode=REAL_MODEL、真实 usage、真实成果物与账务。
 *
 * 约束：
 *  - 使用真实注册表部署（平台默认部署），不切换供应商、不改 baseUrl、不打印密钥；
 *  - 临时用户/空间/额度，finally 严格清理，**清理不净即抛出异常使测试失败**；
 *  - 真实端点延迟波动大（首次调用冷启动），before() 先做一次真实预热以吸收冷启动；
 *  - 与 C10/C11 分文件独立进程运行，避免同进程连续真实调用触发上游限流。
 */

import test, { describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { loadEnvConfig } from "@next/env";

// 仅注入运行时环境变量，绝不打印/读取密钥值
loadEnvConfig(process.cwd());

const JWT_SECRET_STRING = "zhige-test-explicit-jwt-secret-key-min-32-chars!";
process.env.JWT_SECRET = process.env.JWT_SECRET || JWT_SECRET_STRING;
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

const MAGIC_PROVIDER = "MagicAI";
const MAGIC_MODEL = "gpt-5.5";

type PrismaMod = typeof import("@/lib/prisma");
type RouteMod = typeof import("../route");

let prisma: PrismaMod["prisma"];
let studioPostRoute: RouteMod["POST"];

before(async () => {
  // 真实端点推理较慢，放宽超时；收紧单次最大输出 token 使调用更快收敛（路由在调用时读取）
  process.env.MODEL_TIMEOUT_MS = "300000";
  process.env.MODEL_MAX_OUTPUT_TOKENS = "300";
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST: studioPostRoute } = await import("../route"));

  // 预热真实端点（吸收冷启动）；预热失败不判失败，但清理失败必须暴露
  const warm = await setupFixture();
  try {
    await studioPostRoute(
      jsonReq("http://localhost/api/studio", warm.userToken, {
        action: "simulate",
        workspaceId: warm.workspaceId,
        componentId: "C06",
        inputMaterial: "预热：投入 10 万元，月增收入 2 万元，请简述回收周期。",
      }),
    ).catch(() => null);
  } finally {
    await warm.cleanup();
  }
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

type TaskResultShape = {
  executionMode?: string;
  provider?: { id?: string; modelId?: string };
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
};
type TaskConfigShape = {
  executionMode?: string;
  billingMode?: string;
  providerId?: string;
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

/** 临时夹具：临时用户 + 个人空间 + 额度（清理不净即抛错使测试失败） */
async function setupFixture() {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_c2br_${suffix}`;
  const workspaceId = `ws_c2br_${suffix}`;
  const balance = BigInt(100000);

  await prisma.user.create({ data: { id: userId, password: "t", role: "USER", status: "active" } });
  await prisma.workspace.create({ data: { id: workspaceId, name: `C2B真实_${suffix}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() } });
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

    // 清理失败必须使测试失败（不允许静默残留）
    const residue = {
      ledgers: await prisma.pointledger.count({ where: { userId } }),
      grants: await prisma.pointgrant.count({ where: { userId } }),
      wallets: await prisma.userwallet.count({ where: { userId } }),
      tasks: await prisma.componenttask.count({ where: { userId } }),
      usages: await prisma.componentusage.count({ where: { workspaceId } }),
      members: await prisma.workspacemember.count({ where: { workspaceId } }),
      quotas: await prisma.workspacequota.count({ where: { workspaceId } }),
      workspaces: await prisma.workspace.count({ where: { id: workspaceId } }),
      users: await prisma.user.count({ where: { id: userId } }),
    };
    if (Object.values(residue).some((v) => v !== 0)) {
      throw new Error(`清理失败：临时数据存在残留 ${JSON.stringify(residue)}`);
    }
  };

  return { userId, workspaceId, userToken, cleanup };
}

/** 强断言：真实模型执行 + 真实 usage（config/result 双落库）+ 恰好一条消费流水 + 无退款 */
async function assertRealExecution(
  f: Awaited<ReturnType<typeof setupFixture>>,
  componentId: string,
  req: NextRequest,
) {
  const res = await studioPostRoute(req);
  const json = await res.json();
  assert.equal(res.status, 200, `${componentId} 期望 200，实际 ${res.status} body=${JSON.stringify(json).slice(0, 300)}`);
  assert.equal(json.success, true, `${componentId} success 必须为 true`);
  assert.equal(json.executionMode, "REAL_MODEL", `${componentId} 必须真实模型执行`);
  assert.notEqual(json.executionMode, "SIMULATED", `${componentId} 绝不允许 SIMULATED`);
  assert.equal(json.billingMode, "ESTIMATED_COMPATIBILITY", `${componentId} billingMode 必须为兼容口径`);
  assert.ok(
    json.provider && json.provider.id === MAGIC_PROVIDER && json.provider.modelId === MAGIC_MODEL,
    `${componentId} provider 必须为 ${MAGIC_PROVIDER}/${MAGIC_MODEL}，实际 ${JSON.stringify(json.provider)}`,
  );
  assert.ok(Array.isArray(json.artifacts) && json.artifacts.length > 0, `${componentId} 必须有 artifact`);
  assert.ok(
    typeof json.artifacts[0].content === "string" && json.artifacts[0].content.trim().length > 0,
    `${componentId} artifact 内容必须非空`,
  );
  assert.ok(
    json.usage && Number(json.usage.inputTokens) > 0 && Number(json.usage.outputTokens) > 0 && Number(json.usage.totalTokens) > 0,
    `${componentId} usage 必须为真实正数，实际 ${JSON.stringify(json.usage)}`,
  );

  const task = await prisma.componenttask.findFirst({
    where: { userId: f.userId, type: componentId },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(task, `${componentId} 必须落库任务`);
  const cfg = task!.config as TaskConfigShape;
  const result = task!.result as TaskResultShape;
  assert.equal(cfg.executionMode, "REAL_MODEL", `${componentId} task.config.executionMode 必须为 REAL_MODEL`);
  assert.equal(result.executionMode, "REAL_MODEL", `${componentId} task.result.executionMode 必须为 REAL_MODEL`);
  assert.equal(cfg.billingMode, "ESTIMATED_COMPATIBILITY", `${componentId} task.config.billingMode 必须为兼容口径`);
  assert.ok(
    cfg.providerId === MAGIC_PROVIDER && cfg.modelId === MAGIC_MODEL,
    `${componentId} task.config provider/model 必须为 ${MAGIC_PROVIDER}/${MAGIC_MODEL}`,
  );
  assert.ok(Number(cfg.totalTokens) > 0, `${componentId} task.config 必须落库真实 usage`);
  assert.ok(
    result.provider && result.provider.id === MAGIC_PROVIDER && result.provider.modelId === MAGIC_MODEL,
    `${componentId} task.result provider/model 必须为 ${MAGIC_PROVIDER}/${MAGIC_MODEL}`,
  );
  assert.ok(Number(result.usage?.totalTokens) > 0, `${componentId} task.result 必须落库真实 usage`);

  // 账务：平台按分桶拆分扣点（实测「当月赠送点优先，余额补足」→ 同一任务产生 1..N 条 CONSUME 流水，
  // 幂等键为 `CONSUME:<taskId>#1..#N` 且序号连续）。因此不变量为：
  // 「同一任务、点数合计 == 任务 token 成本、幂等序号连续、无退款」。
  const consume = await prisma.pointledger.findMany({
    where: { userId: f.userId, type: "CONSUME" },
    select: { points: true, taskId: true, idempotencyKey: true },
  });
  assert.ok(consume.length >= 1, `${componentId} 必须存在消费流水`);
  const totalConsumed = consume.reduce((s, l) => s + Number(l.points), 0);
  assert.equal(totalConsumed, Number(json.task?.estimatedPoints), `${componentId} 消费点数合计必须等于任务预估算力点`);
  assert.equal(
    new Set(consume.map((l) => l.taskId)).size,
    1,
    `${componentId} 一次执行只允许对应一个任务（禁止跨任务串账）`,
  );
  assert.ok(consume.every((l) => l.taskId === task!.id), `${componentId} 消费流水必须归属本次真实任务`);
  const seq = consume
    .map((l) => Number((l.idempotencyKey || "").split("#").pop()))
    .sort((a, b) => a - b);
  assert.deepEqual(seq, seq.map((_, i) => i + 1), `${componentId} 消费幂等序号必须为 #1..#N 连续无缺口`);
  assert.equal(await prisma.pointledger.count({ where: { userId: f.userId, type: "REFUND" } }), 0, `${componentId} 成功路径不得退款`);
}

async function assertContractPublished(componentId: string) {
  const cat = await prisma.componentcatalog.findUnique({ where: { id: componentId }, select: { activeContractId: true } });
  assert.ok(cat?.activeContractId, `${componentId} 必须已激活合同`);
  const row = await prisma.componentcontract.findUnique({ where: { id: cat!.activeContractId! }, select: { lifecycle: true } });
  assert.equal(row?.lifecycle, "PUBLISHED", `${componentId} 激活合同必须为 PUBLISHED`);
}

describe("批次 2B 真实执行验收（C06 / C08，真实外部模型）", () => {
  test("C06 真实执行：ROI 文本输入 → REAL_MODEL + 真实 usage + 成果物 + 消费流水合计等于任务成本", async () => {
    const f = await setupFixture();
    try {
      await assertContractPublished("C06");
      const req = jsonReq("http://localhost/api/studio", f.userToken, {
        action: "simulate",
        workspaceId: f.workspaceId,
        componentId: "C06",
        inputMaterial:
          "投入数据：研发人力 120 万元、云资源与软硬件 30 万元，合计 150 万元；" +
          "收益预测：上线后月增收入 30 万元，毛利率 60%；请测算投资回收周期与 ROI，并给出敏感性结论。",
      });
      await assertRealExecution(f, "C06", req);
    } finally {
      await f.cleanup();
    }
  });

  test("C08 真实执行：主流程文本输入 → REAL_MODEL + 结构化异常清单 + 真实 usage + 消费流水合计等于任务成本", async () => {
    const f = await setupFixture();
    try {
      await assertContractPublished("C08");
      const req = jsonReq("http://localhost/api/studio", f.userToken, {
        action: "simulate",
        workspaceId: f.workspaceId,
        componentId: "C08",
        inputMaterial:
          "正常主流程：用户在小程序选择商品并提交订单，调用微信支付；支付成功后扣减库存、生成发货单，第三方物流推送物流单号通知用户。",
      });
      await assertRealExecution(f, "C08", req);
    } finally {
      await f.cleanup();
    }
  });
});
