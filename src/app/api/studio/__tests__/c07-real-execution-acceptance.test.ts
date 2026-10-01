/**
 * C07 当前版本真实路由验收（腾同学批次 · 不修改结算规则）
 *
 * 目标：使用数据库注册表中的真实 MagicAI/gpt-5.5 与当前真实 API 配置，验证 C07 当前
 * PUBLISHED 激活合同的真实执行链路（真实外部模型调用），并做账务/退款与只读数据核验。
 *
 * 严格约束（本文件不触碰）：
 *  - settlementEnabled=false、billingMode=ESTIMATED_COMPATIBILITY；
 *  - MagicAI/gpt-5.5 成本（5 / 30 CNY/百万）、priceSource=VERIFIED、priceVersion=1 不变；
 *  - 不配置用户售价与 markupRateBps、不实现 BYOK、不改 .env/.env.local、不改 C07 合同内容；
 *  - 不切换供应商、不改 baseUrl、不打印或读取任何密钥值（仅记录 apiKeyEnv 变量名）；
 *  - 临时数据（用户/空间/账务/任务）必须全部清理；清理失败必须让测试失败；
 *  - 仅在测试内临时清空目标部署能力 / 覆盖无效密钥，finally 中严格还原。
 */

import test, { describe, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { loadEnvConfig } from "@next/env";
import AdmZip from "adm-zip";

// 仅注入运行时环境变量，绝不打印/读取密钥值
loadEnvConfig(process.cwd());

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "zhige-test-explicit-jwt-secret-key-min-32-chars!",
);
process.env.JWT_SECRET = process.env.JWT_SECRET || "zhige-test-explicit-jwt-secret-key-min-32-chars!";

const C07 = "C07";
const MAGIC_PROVIDER = "MagicAI";
const MAGIC_MODEL = "gpt-5.5";
/** 仅记录环境变量名，绝不记录值 */
let magicProviderApiKeyEnv: string | null = null;

/**
 * 重要：`@/lib/model-adapter` 在**模块加载期**读取 `MODEL_TIMEOUT_MS` 并冻结为常量，
 * 且 `@/lib/model-registry` 会连带加载该模块。因此必须先用动态 import 在设置环境变量之后
 * 再加载路由与依赖，否则真实（较慢）的 MagicAI/gpt-5.5 推理会被 60s 旧默认值误判为超时。
 */
type PrismaMod = typeof import("@/lib/prisma");
type RegistryMod = typeof import("@/lib/model-registry");
type CreditMod = typeof import("@/lib/credit-service");
type RouteMod = typeof import("../route");
type SettlementMod = typeof import("@/lib/token-settlement-service");

let prisma: PrismaMod["prisma"];
let getPlatformDefaultDeploymentId: RegistryMod["getPlatformDefaultDeploymentId"];
let consumePoints: CreditMod["consumePoints"];
let refundConsumedPoints: CreditMod["refundConsumedPoints"];
let studioPostRoute: RouteMod["POST"];
let isTokenSettlementFeatureEnabled: SettlementMod["isTokenSettlementFeatureEnabled"];

before(async () => {
  // 真实 MagicAI/gpt-5.5 端点推理很慢（实测单次 40~200s，首调用存在冷启动，波动明显）。
  // 放宽超时覆盖冷启动，同时收紧单次最大输出 token（路由在调用时读取），使真实调用更快收敛。
  process.env.MODEL_TIMEOUT_MS = "300000";
  process.env.MODEL_MAX_OUTPUT_TOKENS = "300";

  ({ prisma } = await import("@/lib/prisma"));
  ({ getPlatformDefaultDeploymentId } = await import("@/lib/model-registry"));
  ({ POST: studioPostRoute } = await import("../route"));
  ({ consumePoints, refundConsumedPoints } = await import("@/lib/credit-service"));
  ({ isTokenSettlementFeatureEnabled } = await import("@/lib/token-settlement-service"));

  const pdId = await getPlatformDefaultDeploymentId();
  const dep = pdId
    ? await prisma.modeldeployment.findUnique({ where: { id: pdId }, include: { provider: true } })
    : null;
  if (dep?.provider) magicProviderApiKeyEnv = dep.provider.apiKeyEnv || null;

  // 预热真实端点：首次调用存在明显冷启动（实测可达 >300s），先以独立临时用户/空间做一次真实调用，
  // 吸收冷启动，使后续验收用例在稳定延迟下运行。预热失败（如超时）不判定测试失败，但清理失败必须暴露。
  const warm = await setupTempUserAndWorkspace();
  try {
    const warmC07 = await prisma.componentcatalog.findUnique({ where: { id: C07 }, select: { activeContractId: true } });
    if (warmC07?.activeContractId) {
      const warmReq = buildJsonRequest("http://localhost/api/studio", "POST", warm.userToken, {
        action: "simulate",
        workspaceId: warm.workspaceId,
        componentId: C07,
        inputMaterial: "预热调用：请仅回复“就绪”。",
      });
      await studioPostRoute(warmReq).catch(() => null);
    }
  } finally {
    await warm.cleanup();
  }
});

async function generateToken(userId: string) {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(JWT_SECRET);
}

function buildJsonRequest(
  url: string,
  method: string,
  token: string | undefined,
  body: Record<string, unknown>,
): NextRequest {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return new NextRequest(url, { method, headers, body: JSON.stringify(body) });
}

/** 构造 multipart/form-data 请求（用于真实文件输入 / 无文字输入） */
function buildMultipartRequest(
  url: string,
  token: string | undefined,
  fields: Record<string, string>,
  file: { name: string; content: string | Uint8Array; mimeType: string } | null,
): NextRequest {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (file) form.append("file", new Blob([file.content as BlobPart], { type: file.mimeType }), file.name);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return new NextRequest(url, { method: "POST", headers, body: form });
}

/** 构造最小合法 .docx（OOXML zip：word/document.xml 正文），用于非纯文本 MIME 真实调用 */
function buildDocx(text: string): Buffer {
  const zip = new AdmZip();
  zip.addFile(
    "word/document.xml",
    Buffer.from(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
        `<w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
      "utf-8",
    ),
  );
  return zip.toBuffer();
}

function simulateBody(workspaceId: string) {
  return { action: "simulate", workspaceId, componentId: C07 };
}

/** 创建临时测试用户 + 个人空间 + 余额；返回清理函数（清理失败必须由测试失败捕获） */
async function setupTempUserAndWorkspace() {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_c07_${suffix}`;
  const workspaceId = `ws_c07_${suffix}`;
  const balance = BigInt(100000);

  await prisma.user.create({ data: { id: userId, password: "test", role: "USER", status: "active" } });
  await prisma.workspace.create({
    data: { id: workspaceId, name: `C07验收_${suffix}`, ownerId: userId, type: "PERSONAL", updatedAt: new Date() },
  });
  await prisma.workspacemember.create({
    data: { id: `m_${suffix}`, userId, workspaceId, role: "OWNER", monthlyTokenUsed: BigInt(0), tokenBalance: balance },
  });
  await prisma.userwallet.create({ data: { id: `w_${suffix}`, userId, balance } });
  await prisma.workspacequota.create({
    data: { id: `q_${suffix}`, workspaceId, membershipLevelId: "FREE", tokenBalance: balance, updatedAt: new Date() },
  });
  await prisma.pointgrant.create({
    data: {
      id: `g_${suffix}`, scope: "WALLET", userId, workspaceId: null,
      points: balance, remaining: balance, sourceType: "MANUAL", status: "ACTIVE",
    },
  });

  const userToken = await generateToken(userId);
  const cleanup = async () => {
    // 只清理本临时用户/空间的数据，绝不触碰 C07 真实数据与其它用户
    await prisma.document.deleteMany({ where: { workspaceId } });
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

/** C07 必须已配置 PUBLISHED 激活合同（真实调用前置） */
async function assertC07ContractPublished() {
  const c07 = await prisma.componentcatalog.findUnique({ where: { id: C07 }, select: { activeContractId: true } });
  assert.ok(c07?.activeContractId, "C07 必须已配置 activeContractId");
  const contract = await prisma.componentcontract.findUnique({ where: { id: c07.activeContractId! } });
  assert.equal(contract?.lifecycle, "PUBLISHED", "C07 激活合同必须为 PUBLISHED");
  return c07!.activeContractId!;
}

type TaskResultShape = {
  executionMode?: string;
  provider?: { id?: string; modelId?: string };
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  artifacts?: Array<{ content?: string }>;
};
type TaskConfigShape = {
  executionMode?: string;
  providerId?: string;
  modelId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  billingMode?: string;
};

describe("C07 当前版本真实路由验收（真实外部模型调用）", () => {
  test("1. 文本调用：REAL_MODEL + 真实 usage（config/result 双落库）+ 仅一条消费流水", async () => {
    const f = await setupTempUserAndWorkspace();
    try {
      await assertC07ContractPublished();

      const req = buildJsonRequest("http://localhost/api/studio", "POST", f.userToken, {
        ...simulateBody(f.workspaceId),
        inputMaterial:
          "请基于以下输入生成一份投标技术方案大纲：项目为智慧园区平台建设，预算 500 万，周期 6 个月，需包含总体架构、实施路径与风险管控。",
      });
      const res = await studioPostRoute(req);
      const json = await res.json();
      assert.equal(res.status, 200, `期望 200，实际 ${res.status} body=${JSON.stringify(json).slice(0, 300)}`);
      assert.equal(json.success, true);
      assert.equal(json.executionMode, "REAL_MODEL", "必须为真实模型执行");
      assert.notEqual(json.executionMode, "SIMULATED", "绝不允许 SIMULATED");
      assert.equal(
        json.billingMode,
        "ESTIMATED_COMPATIBILITY",
        "billingMode 必须为 ESTIMATED_COMPATIBILITY（未开启真实 Token 结算）",
      );
      assert.ok(
        json.provider && json.provider.id === MAGIC_PROVIDER && json.provider.modelId === MAGIC_MODEL,
        `provider 必须为 ${MAGIC_PROVIDER}/${MAGIC_MODEL}，实际 ${JSON.stringify(json.provider)}`,
      );
      assert.ok(Array.isArray(json.artifacts) && json.artifacts.length > 0, "必须有 artifact");
      const content = json.artifacts?.[0]?.content;
      assert.ok(typeof content === "string" && content.trim().length > 0, "artifact content 必须非空");
      assert.ok(
        json.usage &&
          Number(json.usage.inputTokens) > 0 &&
          Number(json.usage.outputTokens) > 0 &&
          Number(json.usage.totalTokens) > 0,
        `usage 必须为真实正数，实际 ${JSON.stringify(json.usage)}`,
      );

      // task.config 与 task.result 均记录真实 usage / provider / model，且绝无 SIMULATED
      const task = await prisma.componenttask.findFirst({
        where: { userId: f.userId, type: C07 },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(task, "必须落库任务");
      const cfg = task!.config as TaskConfigShape;
      const result = task!.result as TaskResultShape;
      assert.equal(cfg.executionMode, "REAL_MODEL", "task.config.executionMode 必须为 REAL_MODEL");
      assert.equal(result.executionMode, "REAL_MODEL", "task.result.executionMode 必须为 REAL_MODEL");
      assert.equal(
        cfg.billingMode,
        "ESTIMATED_COMPATIBILITY",
        "task.config.billingMode 必须为 ESTIMATED_COMPATIBILITY",
      );
      assert.ok(
        cfg.providerId === MAGIC_PROVIDER && cfg.modelId === MAGIC_MODEL,
        `task.config provider/model 必须为 ${MAGIC_PROVIDER}/${MAGIC_MODEL}，实际 ${JSON.stringify({ p: cfg.providerId, m: cfg.modelId })}`,
      );
      assert.ok(
        Number(cfg.inputTokens) > 0 && Number(cfg.outputTokens) > 0 && Number(cfg.totalTokens) > 0,
        `task.config usage 必须为真实正数，实际 ${JSON.stringify({ i: cfg.inputTokens, o: cfg.outputTokens, t: cfg.totalTokens })}`,
      );
      assert.ok(
        result.provider && result.provider.id === MAGIC_PROVIDER && result.provider.modelId === MAGIC_MODEL,
        `task.result provider/model 必须为 ${MAGIC_PROVIDER}/${MAGIC_MODEL}`,
      );
      assert.ok(
        result.usage &&
          Number(result.usage.inputTokens) > 0 &&
          Number(result.usage.outputTokens) > 0 &&
          Number(result.usage.totalTokens) > 0,
        `task.result usage 必须为真实正数，实际 ${JSON.stringify(result.usage)}`,
      );
      assert.notEqual(cfg.executionMode, "SIMULATED");
      assert.notEqual(result.executionMode, "SIMULATED");

      // 消费流水：恰好一条 CONSUME（不重复）
      const consume = await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } });
      assert.equal(consume, 1, "必须恰好一条 CONSUME 消费流水");
    } finally {
      await f.cleanup();
    }
  });

  test("2. 原始文本文件调用：REAL_MODEL + artifact 非空 + provider/model/usage 正确落库", async () => {
    const f = await setupTempUserAndWorkspace();
    try {
      await assertC07ContractPublished();

      const text =
        "（原始招标材料）某市新区智慧交通项目需求：\n" +
        "1. 信号配时智能优化；2. 交通诱导屏统一发布；3. 与既有指挥平台对接；4. 三年运维服务。\n" +
        "请归纳关键要点并输出结构化清单。";
      const req = buildMultipartRequest(
        "http://localhost/api/studio",
        f.userToken,
        {
          ...simulateBody(f.workspaceId),
          inputSource: JSON.stringify({ sourceType: "file", fileName: "c07-raw.txt", mimeType: "text/plain" }),
        },
        { name: "c07-raw.txt", content: text, mimeType: "text/plain" },
      );
      const res = await studioPostRoute(req);
      const json = await res.json();
      assert.equal(res.status, 200, `期望 200，实际 ${res.status} body=${JSON.stringify(json).slice(0, 300)}`);
      assert.equal(json.executionMode, "REAL_MODEL", "文件输入也必须为真实模型执行");
      assert.equal(
        json.billingMode,
        "ESTIMATED_COMPATIBILITY",
        "文件调用 billingMode 必须为 ESTIMATED_COMPATIBILITY",
      );
      assert.ok(
        Array.isArray(json.artifacts) &&
          typeof json.artifacts?.[0]?.content === "string" &&
          json.artifacts[0].content.trim().length > 0,
        "artifact 必须非空",
      );

      const task = await prisma.componenttask.findFirst({
        where: { userId: f.userId, type: C07 },
        orderBy: { createdAt: "desc" },
      });
      assert.ok(task, "必须落库任务");
      const result = task!.result as TaskResultShape;
      const cfg = task!.config as TaskConfigShape;
      assert.equal(result.executionMode, "REAL_MODEL");
      assert.ok(
        result.provider && result.provider.id === MAGIC_PROVIDER && result.provider.modelId === MAGIC_MODEL,
        `落库 provider/model 必须为 ${MAGIC_PROVIDER}/${MAGIC_MODEL}，实际 ${JSON.stringify(result.provider)}`,
      );
      assert.ok(
        result.usage &&
          Number(result.usage.inputTokens) > 0 &&
          Number(result.usage.outputTokens) > 0 &&
          Number(result.usage.totalTokens) > 0,
        `落库 usage 必须为真实正数，实际 ${JSON.stringify(result.usage)}`,
      );
      assert.ok(Number(cfg.totalTokens) > 0, "task.config 也必须落库真实 usage");

      // 消费流水：恰好一条
      const consume = await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } });
      assert.equal(consume, 1, "必须恰好一条 CONSUME 消费流水");
    } finally {
      await f.cleanup();
    }
  });

  test("3. 无效密钥失败：MODEL_AUTH_ERROR + 已产生消费原路退款 + 第二次退款 refunded=0 且流水不重复", async () => {
    const f = await setupTempUserAndWorkspace();
    const envName = magicProviderApiKeyEnv;
    const originalVal = envName ? process.env[envName] : undefined; // 仅供还原，绝不打印
    try {
      // 注入无效密钥（非空，确保走鉴权失败而非配置缺失）
      if (envName) process.env[envName] = "sk-invalid-c07-acceptance-test-key";

      const req = buildJsonRequest("http://localhost/api/studio", "POST", f.userToken, {
        ...simulateBody(f.workspaceId),
        inputMaterial: "错误退款测试输入",
      });
      const res = await studioPostRoute(req);
      const json = await res.json();
      assert.equal(res.status, 401, `无效密钥必须返回 HTTP 401，实际 ${res.status} body=${JSON.stringify(json).slice(0, 200)}`);
      assert.equal(json.code, "MODEL_AUTH_ERROR", `无效密钥应返回 MODEL_AUTH_ERROR，实际 ${json.code}`);

      // 路由先扣点后内部原路退款
      const consume = await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } });
      assert.equal(consume, 1, "错误路径仍须先扣点（后退款）");
      const refundBefore = await prisma.pointledger.count({ where: { userId: f.userId, type: "REFUND" } });
      assert.ok(refundBefore >= 1, "错误路径必须已原路退款");
      // 失败不得写成功任务
      assert.equal(
        await prisma.componenttask.count({ where: { userId: f.userId } }),
        0,
        "鉴权失败不得写成功任务",
      );

      // 幂等退款：同一 consumeResult 再次退款必须 refunded=0 且不产生重复流水
      const cr = await consumePoints({
        workspaceId: f.workspaceId,
        userId: f.userId,
        points: 10,
        componentId: C07,
        componentName: "C07",
        taskId: "c07-refund-idem",
        idempotencyKey: "CONSUME:c07-refund-idem",
      });
      const r1 = await refundConsumedPoints({
        consumeResult: cr,
        userId: f.userId,
        workspaceId: f.workspaceId,
        taskId: "c07-refund-idem",
      });
      assert.ok(r1.refunded > 0, "首次退款必须退回点数");
      const refundAfter1 = await prisma.pointledger.count({ where: { userId: f.userId, type: "REFUND" } });
      const r2 = await refundConsumedPoints({
        consumeResult: cr,
        userId: f.userId,
        workspaceId: f.workspaceId,
        taskId: "c07-refund-idem",
      });
      assert.equal(r2.refunded, 0, "第二次退款必须 refunded=0（幂等）");
      const refundAfter2 = await prisma.pointledger.count({ where: { userId: f.userId, type: "REFUND" } });
      assert.equal(refundAfter2, refundAfter1, "第二次退款不得产生重复退款流水");
    } finally {
      if (envName) {
        if (originalVal === undefined) delete process.env[envName];
        else process.env[envName] = originalVal;
      }
      await f.cleanup();
    }
  });

  test("4. 无文字输入：INPUT_TEXT_NOT_EXTRACTED + 不产生消费流水 + 不产生成功 task", async () => {
    const f = await setupTempUserAndWorkspace();
    try {
      await assertC07ContractPublished();

      // 纯空白文本文件：可提取但为空（trim 后无文字），触发 INPUT_TEXT_NOT_EXTRACTED
      const req = buildMultipartRequest(
        "http://localhost/api/studio",
        f.userToken,
        {
          ...simulateBody(f.workspaceId),
          inputSource: JSON.stringify({ sourceType: "file", fileName: "blank.txt", mimeType: "text/plain" }),
        },
        { name: "blank.txt", content: "   \n\t  \r\n  ", mimeType: "text/plain" },
      );
      const res = await studioPostRoute(req);
      const json = await res.json();
      assert.equal(res.status, 400, `期望 400，实际 ${res.status} body=${JSON.stringify(json).slice(0, 200)}`);
      assert.equal(json.code, "INPUT_TEXT_NOT_EXTRACTED", "无文字输入必须返回 INPUT_TEXT_NOT_EXTRACTED");

      // 不产生消费流水、不产生成功任务
      assert.equal(
        await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }),
        0,
        "无文字输入不得产生消费流水",
      );
      assert.equal(
        await prisma.componenttask.count({ where: { userId: f.userId } }),
        0,
        "无文字输入不得产生成功任务",
      );
    } finally {
      await f.cleanup();
    }
  });

  test("5. 能力门禁：临时清空目标部署能力 → MODEL_CAPABILITY_NOT_SUPPORTED，不调用模型/不扣点/不写任务", async () => {
    const f = await setupTempUserAndWorkspace();
    const pdId = await getPlatformDefaultDeploymentId();
    let originalCapabilities: unknown = null;
    try {
      assert.ok(pdId, "必须存在平台默认部署");
      const before = await prisma.modeldeployment.findUnique({ where: { id: pdId! }, select: { capabilities: true } });
      originalCapabilities = before?.capabilities ?? [];
      await prisma.modeldeployment.update({ where: { id: pdId! }, data: { capabilities: [] as never } });

      const req = buildJsonRequest("http://localhost/api/studio", "POST", f.userToken, {
        ...simulateBody(f.workspaceId),
        inputMaterial: "能力缺失测试输入",
      });
      const res = await studioPostRoute(req);
      const json = await res.json();
      assert.equal(res.status, 403, `能力不匹配应 403，实际 ${res.status} body=${JSON.stringify(json).slice(0, 200)}`);
      assert.equal(json.code, "MODEL_CAPABILITY_NOT_SUPPORTED", "能力门禁必须拒绝");

      assert.equal(
        await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }),
        0,
        "能力不匹配不得扣点",
      );
      assert.equal(
        await prisma.componenttask.count({ where: { userId: f.userId, type: C07 } }),
        0,
        "能力不匹配不得写成功任务",
      );
    } finally {
      if (pdId) {
        await prisma.modeldeployment
          .update({ where: { id: pdId }, data: { capabilities: originalCapabilities as never } })
          .catch((e) => {
            throw new Error(`MagicAI/gpt-5.5 能力还原失败（必须人工复核）: ${(e as Error)?.message}`);
          });
      }
      await f.cleanup();
    }
  });
});

describe("C07 复验后置只读核验", () => {
  test("6. 只读核验：C07 合同/能力/平台默认/价格孤儿/临时数据清理/结算开关", async () => {
    // 1) C07 activeContractId 仍为 PUBLISHED
    const c07 = await prisma.componentcatalog.findUnique({ where: { id: C07 }, select: { activeContractId: true } });
    assert.ok(c07?.activeContractId, "C07 activeContractId 必须存在");
    const contract = await prisma.componentcontract.findUnique({ where: { id: c07.activeContractId! } });
    assert.equal(contract?.lifecycle, "PUBLISHED", "C07 activeContractId 对应合同必须仍为 PUBLISHED");

    // 2) MagicAI/gpt-5.5 capabilities 仍为 TEXT_GENERATION
    const magicDep = await prisma.modeldeployment.findUnique({
      where: { providerId_modelId: { providerId: MAGIC_PROVIDER, modelId: MAGIC_MODEL } },
      select: { id: true, enabled: true, capabilities: true },
    });
    assert.ok(magicDep, "MagicAI/gpt-5.5 部署必须存在");
    // 平台默认部署必须始终包含 C07 合同所需的 TEXT_GENERATION；
    // 允许平台按业务需要扩展其它抽象能力（如已授权的 STRUCTURED_OUTPUT），但不得缺失 TEXT_GENERATION。
    const magicCaps = [...((magicDep!.capabilities as unknown as string[]) ?? [])].map((c) => String(c).toUpperCase());
    assert.ok(
      magicCaps.includes("TEXT_GENERATION"),
      `MagicAI/gpt-5.5 必须仍声明 TEXT_GENERATION，实际 ${JSON.stringify(magicCaps)}`,
    );

    // 3) 平台默认部署仍有效（存在、部署与供应商均启用）
    const pdId = await getPlatformDefaultDeploymentId();
    assert.ok(pdId, "必须存在平台默认部署");
    const pd = await prisma.modeldeployment.findUnique({
      where: { id: pdId! },
      select: { enabled: true, providerId: true, modelId: true, provider: { select: { enabled: true } } },
    });
    assert.ok(pd && pd.enabled && pd.provider?.enabled === true, "平台默认部署及其供应商必须均启用");

    // 4) modelpricing 孤儿为 0
    const orphan = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
      "SELECT COUNT(*) AS n FROM `modelpricing` p LEFT JOIN `modeldeployment` d ON p.deploymentId = d.id WHERE d.id IS NULL",
    );
    assert.equal(Number(orphan[0]?.n ?? 0), 0, "modelpricing 孤儿必须为 0");

    // 5) 测试用户/空间/流水/任务均已清理
    const leftoverUsers = await prisma.user.count({ where: { id: { startsWith: "u_c07_" } } });
    const leftoverWs = await prisma.workspace.count({ where: { id: { startsWith: "ws_c07_" } } });
    const leftoverLedgers = await prisma.pointledger.count({
      where: { OR: [{ userId: { startsWith: "u_c07_" } }, { workspaceId: { startsWith: "ws_c07_" } }] },
    });
    const leftoverTasks = await prisma.componenttask.count({ where: { userId: { startsWith: "u_c07_" } } });
    assert.equal(leftoverUsers, 0, "临时用户必须全部清理");
    assert.equal(leftoverWs, 0, "临时空间必须全部清理");
    assert.equal(leftoverLedgers, 0, "临时算力流水必须全部清理");
    assert.equal(leftoverTasks, 0, "临时任务必须全部清理");

    // 6) settlementEnabled 仍为 false（代码特性开关）
    assert.equal(isTokenSettlementFeatureEnabled(), false, "settlementEnabled 必须仍为 false");
  });
});
