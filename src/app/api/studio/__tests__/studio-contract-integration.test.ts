/**
 * Studio 组件合同真实路由集成与唯一真源测试
 *
 * 覆盖核心验收标准：
 * 1. 发布并激活 v1，新任务使用 v1 并固化保存不可变快照；
 * 2. 激活 v2 后新任务使用 v2，旧任务重试仍保持 v1 不可变；
 * 3. 草稿、归档、无激活合同均被严格拒绝 (404/409)，绝不降级模拟；
 * 4. 旧 detail.executionProfile 与新合同冲突时，唯一真源只执行新合同；
 * 5. 匿名与普通请求无法获取 promptTemplate / pipeline / 内部规则，后台 system:manage 可完整读取；
 * 6. 审计失败时直接调用 publishContract / archiveContract 触发真实外键回滚。
 */

import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { POST as studioPostRoute, GET as studioGetRoute } from "../route";
import { GET as contractSnapshotRoute } from "@/app/api/components/[id]/contract-snapshot/route";
import {
  createDraftContract,
  publishContract,
  archiveContract,
  activateContract,
} from "@/lib/component-contract/repository";
import type { ComponentContract } from "@/lib/component-contract/types";
import {
  getPlatformDefaultDeploymentId,
  setPlatformDefaultDeploymentId,
} from "@/lib/model-registry";

const TEST_JWT_SECRET_STRING = "zhige-test-explicit-jwt-secret-key-min-32-chars!";
process.env.JWT_SECRET = process.env.JWT_SECRET || TEST_JWT_SECRET_STRING;
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET);

let mockServer: http.Server;
let mockPort = 0;
let originalProviderBaseUrl: string | null = null;
let targetProviderId: string | null = null;
let targetApiKeyEnv: string = "MODEL_API_KEY";
let originalEnvKey: string | undefined = undefined;
/** 平台默认模型部署的原始值（测试结束必须还原，绝不修改平台真实配置） */
let originalPlatformDefaultId: string | null = null;
let targetDeploymentId: string | null = null;
/** 夹具部署原始能力声明（测试结束必须严格还原，绝不永久改动共享部署） */
let originalCapabilities: unknown = null;

function startMockServer(): Promise<void> {
  mockServer = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "chatcmpl_mock_test",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "mock-model",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "合同驱动的真实模型推理产出文本内容。" },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 15,
            completion_tokens: 20,
            total_tokens: 35,
          },
        }),
      );
    });
  });
  return new Promise<void>((resolve) => {
    mockServer.listen(0, "127.0.0.1", () => {
      mockPort = (mockServer.address() as AddressInfo).port;
      resolve();
    });
  });
}

before(async () => {
  await startMockServer();
  process.env.MODEL_ALLOW_INSECURE_LOCAL = "true";
  process.env.MODEL_TIMEOUT_MS = "30000";

  const activeDep = await prisma.modeldeployment.findFirst({
    where: { enabled: true, provider: { enabled: true } },
    include: { provider: true },
    orderBy: { createdAt: "asc" },
  });

  if (activeDep && activeDep.provider) {
    targetProviderId = activeDep.provider.id;
    targetDeploymentId = activeDep.id;
    originalProviderBaseUrl = activeDep.provider.baseUrl;
    targetApiKeyEnv = activeDep.provider.apiKeyEnv || "MODEL_API_KEY";
    originalEnvKey = process.env[targetApiKeyEnv];
    process.env[targetApiKeyEnv] = process.env[targetApiKeyEnv] || "sk-mock-integration-test-key";

    await prisma.modelprovider.update({
      where: { id: activeDep.provider.id },
      data: { baseUrl: `http://127.0.0.1:${mockPort}/v1` },
    });
  } else {
    const pId = "prov_test_mock";
    const mId = "dep_test_mock";
    await prisma.modelprovider.upsert({
      where: { id: pId },
      update: { baseUrl: `http://127.0.0.1:${mockPort}/v1`, enabled: true },
      create: {
        id: pId,
        name: "MockTestProvider",
        protocol: "OPENAI_COMPATIBLE",
        baseUrl: `http://127.0.0.1:${mockPort}/v1`,
        apiKeyEnv: "MODEL_API_KEY",
        enabled: true,
      },
    });
    await prisma.modeldeployment.upsert({
      where: { id: mId },
      update: { enabled: true },
      create: {
        id: mId,
        providerId: pId,
        modelId: "mock-model",
        upstreamModel: "mock-model",
        contextLimit: 8192,
        enabled: true,
      },
    });
    process.env.MODEL_API_KEY = process.env.MODEL_API_KEY || "sk-mock-integration-test-key";
    targetDeploymentId = mId;
  }

  // 为本次集成测试临时配置平台默认部署（唯一裁决入口要求必须有显式默认值）
  originalPlatformDefaultId = await getPlatformDefaultDeploymentId();
  if (targetDeploymentId) {
    // 夹具部署需声明合同要求的能力（否则 capability 门禁会正确拒绝）；测试结束严格还原
    const dep = await prisma.modeldeployment.findUnique({
      where: { id: targetDeploymentId },
      select: { capabilities: true },
    });
    originalCapabilities = dep?.capabilities ?? [];
    await prisma.modeldeployment.update({
      where: { id: targetDeploymentId },
      data: {
        capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "LONG_CONTEXT", "VISION", "FILE_ANALYSIS"] as never,
      },
    });
    await setPlatformDefaultDeploymentId(targetDeploymentId);
  }
});

after(async () => {
  mockServer?.close();
  if (targetProviderId && originalProviderBaseUrl) {
    await prisma.modelprovider.update({
      where: { id: targetProviderId },
      data: { baseUrl: originalProviderBaseUrl },
    });
  }
  // 还原平台默认模型部署，绝不留下测试配置
  await setPlatformDefaultDeploymentId(originalPlatformDefaultId).catch((e: unknown) => {
    console.error("[studio-contract-integration] 平台默认部署还原失败（必须人工复核）:", e);
  });
  // 还原夹具部署的能力声明（清理失败必须使测试失败，不静默吞掉）
  if (targetDeploymentId && originalCapabilities !== null) {
    await prisma.modeldeployment.update({
      where: { id: targetDeploymentId },
      data: { capabilities: originalCapabilities as never },
    });
  }
  if (originalEnvKey === undefined) {
    delete process.env[targetApiKeyEnv];
  } else {
    process.env[targetApiKeyEnv] = originalEnvKey;
  }
});

/** 生成特定用户的 JWT 凭证 */
async function generateToken(userId: string) {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(JWT_SECRET);
}

/** 构造 JSON 请求 */
function buildJsonRequest(
  url: string,
  method: string,
  token?: string,
  body?: Record<string, unknown>
): NextRequest {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return new NextRequest(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/** 标准合同定义模板 */
function buildStandardContract(componentId: string, version: string, customPrompt = "默认处理指令"): ComponentContract {
  return {
    componentId,
    contractVersion: version,
    lifecycle: "DRAFT",
    publishedAt: null,
    publishedBy: null,
    input: {
      kind: "TEXT",
      textConstraints: {
        required: true,
        minLength: 5,
        maxLength: 2000,
        placeholder: "请输入至少5个字符",
      },
    },
    materialPipeline: {
      steps: [{ name: "基础清洗", type: "TEXT_NORMALIZE" }],
    },
    executionPlan: {
      steps: [
        {
          stepId: "step_main",
          name: "文本分析",
          promptTemplateVersion: "v1.0",
          promptTemplate: `${customPrompt}: {{sourceText}}`,
          inputMapping: { sourceText: "input.text" },
          outputKey: "output_text",
          contextBudgetTokens: 4096,
          maxOutputTokens: 1024,
          timeoutMs: 30000,
          requiredCapabilities: ["TEXT_GENERATION"],
        },
      ],
    },
    output: {
      kind: "DOCUMENT",
      artifactMime: "text/markdown",
      schemaVersion: "1.0",
      rendererType: "MARKDOWN_DOCUMENT",
      previewable: true,
      downloadable: true,
    },
    qualityPolicy: {
      allowAutoRetry: false,
      requireHumanReview: false,
    },
    billingPolicy: {
      mode: "ESTIMATED_COMPATIBILITY",
      estimatedTokens: 100,
    },
  };
}

/**
 * 断言「预期内的数据库外键失败」：
 *  - 通过临时拦截 console.error / process.stderr.write，捕获 Prisma 自身打印的 prisma:error，
 *    避免控制台输出误导性错误；捕获内容用于**显式断言**预期错误确实由数据库外键约束触发，
 *    防止把「静默吞异常」误判为通过。
 *  - 若未观察到预期外键错误，则断言失败。
 */
async function expectFkFailure(
  operation: () => Promise<unknown>,
  expectedSubstring = "Foreign key constraint",
): Promise<void> {
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  const originalConsoleError = console.error;
  const originalConsoleLog = console.log;
  const chunks: string[] = [];

  const captureWrite = ((chunk: unknown, ...rest: unknown[]) => {
    chunks.push(typeof chunk === "string" ? chunk : String(chunk));
    const cb = rest.find((r) => typeof r === "function") as (() => void) | undefined;
    if (cb) cb();
    // 预期内的外键失败输出被拦截，不再打印到终端（避免误导性 prisma:error）
    return true;
  }) as typeof process.stdout.write;
  const captureLog = (...args: unknown[]) => {
    chunks.push(args.map((a) => (typeof a === "string" ? a : String(a))).join(" "));
  };

  process.stdout.write = captureWrite;
  process.stderr.write = captureWrite;
  console.error = captureLog as typeof console.error;
  console.log = captureLog as typeof console.log;

  try {
    await assert.rejects(operation, /Foreign key constraint/i, "必须触发 MySQL 外键约束失败");
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
    console.error = originalConsoleError;
    console.log = originalConsoleLog;
  }

  // 明确断言：预期的外键失败确实出现（而非被静默吞掉）
  assert.ok(
    chunks.join("").includes(expectedSubstring),
    `预期内的数据库外键失败必须显式出现（防止静默吞异常）。实际捕获输出: ${
      chunks.join("").slice(0, 300) || "（空）"
    }`,
  );
}

/** 夹具：创建用于 Studio 路由测试的用户、空间、配额和组件 */
async function setupStudioTestFixture() {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 8);
  const userId = `u_std_${suffix}`;
  const superAdminId = `u_adm_${suffix}`;
  const workspaceId = `ws_std_${suffix}`;
  const compId = `C_STD_${suffix}`;

  // 1. 创建常规普通用户
  await prisma.user.create({
    data: {
      id: userId,
      password: "test_password",
      role: "USER",
      status: "active",
    },
  });

  // 2. 创建超级管理员用户
  await prisma.user.create({
    data: {
      id: superAdminId,
      password: "test_password",
      role: "SUPER_ADMIN",
      status: "active",
    },
  });

  // 3. 创建测试空间与配额
  const now = new Date();
  const balance = BigInt(100000);
  await prisma.workspace.create({
    data: {
      id: workspaceId,
      name: `测试空间_${suffix}`,
      ownerId: userId,
      type: "PERSONAL",
      updatedAt: now,
    },
  });

  await prisma.workspacemember.create({
    data: {
      id: `m_${suffix}`,
      userId,
      workspaceId,
      role: "OWNER",
      monthlyTokenUsed: BigInt(0),
      tokenBalance: balance,
    },
  });

  await prisma.userwallet.create({
    data: {
      id: `w_${suffix}`,
      userId,
      balance,
    },
  });

  await prisma.workspacequota.create({
    data: {
      id: `q_${suffix}`,
      workspaceId,
      membershipLevelId: "FREE",
      tokenBalance: balance,
      updatedAt: now,
    },
  });

  await prisma.pointgrant.create({
    data: {
      id: `g_${suffix}`,
      scope: "WALLET",
      userId,
      workspaceId: null,
      points: balance,
      remaining: balance,
      sourceType: "MANUAL",
      status: "ACTIVE",
    },
  });

  // 4. 创建测试组件
  await prisma.componentcatalog.create({
    data: {
      id: compId,
      name: `Studio合同测试组件_${suffix}`,
      description: "用于验证执行合同唯一真源与快照不可变性",
      category: "BID_PREP",
      icon: "Cpu",
      tags: ["studio-contract-test"],
      estimatedModelTokens: 100,
      previewData: {},
    },
  });

  const userToken = await generateToken(userId);
  const adminToken = await generateToken(superAdminId);

  const cleanup = async () => {
    await prisma.pointledger.deleteMany({
      where: { userId },
    });
      await prisma.pointgrant.deleteMany({
        where: { userId },
      });
      await prisma.userwallet.deleteMany({
        where: { userId },
      });
      await prisma.componenttask.deleteMany({
        where: { type: compId },
      });
      await prisma.componentcatalog.update({
        where: { id: compId },
        data: { activeContractId: null },
      });
      await prisma.operationlog.deleteMany({
        where: { userId: { in: [userId, superAdminId] } },
      });
      await prisma.componentcontract.deleteMany({
        where: { componentId: compId },
      });
      await prisma.componentusage.deleteMany({
        where: { workspaceId },
      });
      await prisma.workspacemember.deleteMany({
        where: { workspaceId },
      });
      await prisma.workspacequota.deleteMany({
        where: { workspaceId },
      });
      await prisma.workspace.deleteMany({
        where: { id: workspaceId },
      });
      await prisma.componentcatalog.delete({
        where: { id: compId },
      });
    await prisma.user.deleteMany({
      where: { id: { in: [userId, superAdminId] } },
    });
  };

  return { userId, superAdminId, workspaceId, compId, userToken, adminToken, cleanup };
}

describe("Studio 组件合同真实路由集成测试", () => {
  test("1. 发布并激活 v1，新任务使用 v1 并固化保存不可变快照", async () => {
    const f = await setupStudioTestFixture();
    try {
      // 创建并发布激活 v1
      const draft = await createDraftContract({
        componentId: f.compId,
        contractVersion: "1.0.0",
        contract: buildStandardContract(f.compId, "1.0.0", "指令V1"),
      });
      await publishContract({
        componentId: f.compId,
        contractVersion: "1.0.0",
        publishedBy: f.superAdminId,
        autoActivate: true,
      });

      // 验证组件 activeContractId 已指向 v1
      const comp = await prisma.componentcatalog.findUnique({
        where: { id: f.compId },
        select: { activeContractId: true },
      });
      assert.equal(comp?.activeContractId, draft.id);

      // 调用 Studio simulate
      const req = buildJsonRequest("http://localhost/api/studio", "POST", f.userToken, {
        action: "simulate",
        workspaceId: f.workspaceId,
        componentId: f.compId,
        inputMaterial: "这是一条测试输入材料，符合长度要求",
      });
      const res = await studioPostRoute(req);
      const json = await res.json();

      assert.equal(res.status, 200, `期望 200，实际: ${res.status}, 详情: ${JSON.stringify(json)}`);
      assert.equal(json.success, true);
      assert.equal(json.contractVersion, "1.0.0");
      assert.ok(json.task && json.task.id, "必须返回任务对象与任务ID");

      // 验证数据库中持久化的不可变快照
      const taskInDb = await prisma.componenttask.findUnique({
        where: { id: json.task.id },
      });
      assert.ok(taskInDb, "数据库中必须存在该任务");
      const config = taskInDb.config as Record<string, unknown>;
      assert.equal(config.contractId, draft.id);
      assert.equal(config.contractVersion, "1.0.0");
      assert.ok(config.contractSnapshot, "必须保存 contractSnapshot");
      const snap = config.contractSnapshot as Record<string, unknown>;
      assert.equal((snap.contract as Record<string, unknown>).contractVersion, "1.0.0");
    } finally {
      await f.cleanup();
    }
  });

  test("2. 激活 v2 后新任务使用 v2，旧任务重试仍为 v1（不可变快照）", async () => {
    const f = await setupStudioTestFixture();
    try {
      // 1. 发布并激活 v1
      const draftV1 = await createDraftContract({
        componentId: f.compId,
        contractVersion: "1.0.0",
        contract: buildStandardContract(f.compId, "1.0.0", "指令V1"),
      });
      await publishContract({
        componentId: f.compId,
        contractVersion: "1.0.0",
        publishedBy: f.superAdminId,
        autoActivate: true,
      });

      // 运行任务 1
      const req1 = buildJsonRequest("http://localhost/api/studio", "POST", f.userToken, {
        action: "simulate",
        workspaceId: f.workspaceId,
        componentId: f.compId,
        inputMaterial: "任务1输入材料内容",
      });
      const res1 = await studioPostRoute(req1);
      const json1 = await res1.json();
      assert.equal(res1.status, 200);
      assert.equal(json1.contractVersion, "1.0.0");
      const task1Id = json1.task.id;

      // 2. 创建并发布激活 v2
      const draftV2 = await createDraftContract({
        componentId: f.compId,
        contractVersion: "2.0.0",
        contract: buildStandardContract(f.compId, "2.0.0", "指令V2"),
      });
      await publishContract({
        componentId: f.compId,
        contractVersion: "2.0.0",
        publishedBy: f.superAdminId,
        autoActivate: true,
      });

      // 验证当前激活版本已是 v2
      const compAfterV2 = await prisma.componentcatalog.findUnique({
        where: { id: f.compId },
        select: { activeContractId: true },
      });
      assert.equal(compAfterV2?.activeContractId, draftV2.id);

      // 3. 发起新任务（无 retryTaskId），新任务应使用 v2
      const req2 = buildJsonRequest("http://localhost/api/studio", "POST", f.userToken, {
        action: "simulate",
        workspaceId: f.workspaceId,
        componentId: f.compId,
        inputMaterial: "任务2新材料内容",
      });
      const res2 = await studioPostRoute(req2);
      const json2 = await res2.json();
      assert.equal(res2.status, 200);
      assert.equal(json2.contractVersion, "2.0.0");

      // 4. 重试任务 1（带 retryTaskId），断言重试任务仍保持 v1，绝不读取后来激活的 v2
      const reqRetry = buildJsonRequest("http://localhost/api/studio", "POST", f.userToken, {
        action: "simulate",
        workspaceId: f.workspaceId,
        componentId: f.compId,
        inputMaterial: "任务1材料重新提交",
        retryTaskId: task1Id,
      });
      const resRetry = await studioPostRoute(reqRetry);
      const jsonRetry = await resRetry.json();
      assert.equal(resRetry.status, 200);
      assert.equal(jsonRetry.contractVersion, "1.0.0", "重试任务必须严格保持历史快照的 v1 版本，不可被 v2 篡改");

      const retryTaskInDb = await prisma.componenttask.findUnique({
        where: { id: jsonRetry.task.id },
      });
      const rConfig = retryTaskInDb?.config as Record<string, unknown>;
      assert.equal(rConfig.contractId, draftV1.id);
      assert.equal(rConfig.contractVersion, "1.0.0");
    } finally {
      await f.cleanup();
    }
  });

  test("3. 草稿、归档、无激活合同均被拒绝 (404/409)，绝不降级模拟", async () => {
    const f = await setupStudioTestFixture();
    try {
      // 场景 A：无激活合同 -> 409 COMPONENT_CONTRACT_NOT_READY（绝不降级模拟、不扣点、不写任务/成果物）
      const reqNoActive = buildJsonRequest("http://localhost/api/studio", "POST", f.userToken, {
        action: "simulate",
        workspaceId: f.workspaceId,
        componentId: f.compId,
        inputMaterial: "测试无激活合同",
      });
      const resNoActive = await studioPostRoute(reqNoActive);
      const jsonNoActive = await resNoActive.json();
      assert.equal(resNoActive.status, 409);
      assert.equal(jsonNoActive.code, "COMPONENT_CONTRACT_NOT_READY");
      // 严禁产生任何生产副作用：无任务、无算力点执行流水（CONSUME）、无成功 artifact
      const tasksNoActive = await prisma.componenttask.count({ where: { userId: f.userId } });
      assert.equal(tasksNoActive, 0, "无合同组件不得创建任何任务记录");
      const ledgersNoActive = await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } });
      assert.equal(ledgersNoActive, 0, "无合同组件不得产生任何算力点执行流水");

      // 场景 B：草稿状态被设置为激活（异常脏数据防御） -> 409 CONTRACT_DRAFT_CANNOT_EXECUTE
      const draft = await createDraftContract({
        componentId: f.compId,
        contractVersion: "1.0.0",
        contract: buildStandardContract(f.compId, "1.0.0"),
      });
      await prisma.componentcatalog.update({
        where: { id: f.compId },
        data: { activeContractId: draft.id },
      });
      const reqDraft = buildJsonRequest("http://localhost/api/studio", "POST", f.userToken, {
        action: "simulate",
        workspaceId: f.workspaceId,
        componentId: f.compId,
        inputMaterial: "测试草稿合同执行",
      });
      const resDraft = await studioPostRoute(reqDraft);
      const jsonDraft = await resDraft.json();
      assert.equal(resDraft.status, 409);
      assert.equal(jsonDraft.code, "CONTRACT_DRAFT_CANNOT_EXECUTE");
      // 草稿合同：绝不扣点、绝不写成功任务/成果物
      assert.equal(
        await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }),
        0,
        "草稿合同不得扣点",
      );
      assert.equal(
        await prisma.componenttask.count({ where: { userId: f.userId } }),
        0,
        "草稿合同不得写成功任务（也就没有成果物）",
      );

      // 场景 C：归档当前激活版本必须被 409 拦截（防呆设计）
      await prisma.componentcontract.update({
        where: { id: draft.id },
        data: { lifecycle: "PUBLISHED", publishedAt: new Date(), publishedBy: f.superAdminId },
      });
      await assert.rejects(
        async () => {
          await archiveContract({
            componentId: f.compId,
            contractVersion: "1.0.0",
            operatorId: f.superAdminId,
          });
        },
        (err: any) => {
          assert.equal(err.code, "ACTIVE_CONTRACT_CANNOT_ARCHIVE");
          return true;
        }
      );

      // 解绑后归档，并将已被归档的合同设为 activeContractId 测试执行防御 -> 409 CONTRACT_ARCHIVED_CANNOT_EXECUTE
      await prisma.componentcatalog.update({
        where: { id: f.compId },
        data: { activeContractId: null },
      });
      await archiveContract({
        componentId: f.compId,
        contractVersion: "1.0.0",
        operatorId: f.superAdminId,
      });
      await prisma.componentcatalog.update({
        where: { id: f.compId },
        data: { activeContractId: draft.id },
      });

      const reqArchived = buildJsonRequest("http://localhost/api/studio", "POST", f.userToken, {
        action: "simulate",
        workspaceId: f.workspaceId,
        componentId: f.compId,
        inputMaterial: "测试已归档合同执行",
      });
      const resArchived = await studioPostRoute(reqArchived);
      const jsonArchived = await resArchived.json();
      assert.equal(resArchived.status, 409);
      assert.equal(jsonArchived.code, "CONTRACT_ARCHIVED_CANNOT_EXECUTE");
      // 归档合同：绝不扣点、绝不写成功任务/成果物
      assert.equal(
        await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }),
        0,
        "归档合同不得扣点",
      );
      assert.equal(
        await prisma.componenttask.count({ where: { userId: f.userId } }),
        0,
        "归档合同不得写成功任务（也就没有成果物）",
      );
    } finally {
      await f.cleanup();
    }
  });

  test("3b. 即使设置 STUDIO_ALLOW_SIMULATED=true，生产路由也绝不生成模拟结果", async () => {
    const f = await setupStudioTestFixture();
    const prev = process.env.STUDIO_ALLOW_SIMULATED;
    process.env.STUDIO_ALLOW_SIMULATED = "true";
    try {
      // 无有效 PUBLISHED 激活合同：即使开启任何模拟开关，也必须 409 拒绝
      const req = buildJsonRequest("http://localhost/api/studio", "POST", f.userToken, {
        action: "simulate",
        workspaceId: f.workspaceId,
        componentId: f.compId,
        inputMaterial: "尝试以环境变量开启模拟执行",
      });
      const res = await studioPostRoute(req);
      const json = await res.json();
      assert.equal(res.status, 409, "模拟开关不得恢复生产模拟执行");
      assert.equal(json.code, "COMPONENT_CONTRACT_NOT_READY");
      assert.equal(json.executionMode, undefined, "拒绝响应不得带任何执行模式/模拟标记");
      assert.equal(
        await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } }),
        0,
        "模拟开关不得扣点",
      );
      assert.equal(
        await prisma.componenttask.count({ where: { userId: f.userId } }),
        0,
        "模拟开关不得写成功任务",
      );
    } finally {
      if (prev === undefined) delete process.env.STUDIO_ALLOW_SIMULATED;
      else process.env.STUDIO_ALLOW_SIMULATED = prev;
      await f.cleanup();
    }
  });

  test("4. 旧 detail.executionProfile 与新合同冲突时，只执行新合同", async () => {
    const f = await setupStudioTestFixture();
    try {
      // 在 componentcatalog.detail 中写入旧的 executionProfile
      await prisma.componentcatalog.update({
        where: { id: f.compId },
        data: {
          detail: {
            executionProfile: {
              contractVersion: "0.9.0-conflict-legacy",
              execution: { mode: "LEGACY_MODE" },
            },
          },
        },
      });

      // 接入并激活真实的 component_contract v1
      await createDraftContract({
        componentId: f.compId,
        contractVersion: "1.0.0",
        contract: buildStandardContract(f.compId, "1.0.0", "新合同指令"),
      });
      await publishContract({
        componentId: f.compId,
        contractVersion: "1.0.0",
        publishedBy: f.superAdminId,
        autoActivate: true,
      });

      // 执行任务
      const req = buildJsonRequest("http://localhost/api/studio", "POST", f.userToken, {
        action: "simulate",
        workspaceId: f.workspaceId,
        componentId: f.compId,
        inputMaterial: "冲突测试输入内容",
      });
      const res = await studioPostRoute(req);
      const json = await res.json();

      assert.equal(res.status, 200);
      assert.equal(json.contractVersion, "1.0.0", "必须执行新合同版本，绝对禁止使用旧 detail.executionProfile");
      assert.notEqual(json.contractVersion, "0.9.0-conflict-legacy");
    } finally {
      await f.cleanup();
    }
  });

  test("5. 匿名请求访问 /contract-snapshot 绝不泄露 promptTemplate 与内部策略", async () => {
    const f = await setupStudioTestFixture();
    try {
      await createDraftContract({
        componentId: f.compId,
        contractVersion: "1.0.0",
        contract: buildStandardContract(f.compId, "1.0.0", "绝密Prompt指令"),
      });
      await publishContract({
        componentId: f.compId,
        contractVersion: "1.0.0",
        publishedBy: f.superAdminId,
        autoActivate: true,
      });

      // 匿名访问
      const anonReq = buildJsonRequest(`http://localhost/api/components/${f.compId}/contract-snapshot`, "GET");
      const anonRes = await contractSnapshotRoute(anonReq, { params: Promise.resolve({ id: f.compId }) });
      const anonJson = await anonRes.json();

      assert.equal(anonRes.status, 200);
      assert.equal(anonJson.success, true);
      const publicContract = anonJson.data.contract;
      assert.ok(publicContract.input, "公开元数据包含 input 约束");
      assert.ok(publicContract.output, "公开元数据包含 output 渲染配置");
      assert.equal(publicContract.executionPlan, undefined, "白名单清洗：不得泄露 executionPlan");
      assert.equal(publicContract.promptTemplate, undefined, "白名单清洗：不得泄露 promptTemplate");
      assert.equal(publicContract.materialPipeline, undefined, "白名单清洗：不得泄露 materialPipeline");
      assert.equal(publicContract.qualityPolicy, undefined, "白名单清洗：不得泄露 qualityPolicy");
      assert.equal(publicContract.billingPolicy, undefined, "白名单清洗：不得泄露 billingPolicy");

      // 超级管理员访问（携带 system:manage 权限）
      const adminReq = buildJsonRequest(
        `http://localhost/api/components/${f.compId}/contract-snapshot`,
        "GET",
        f.adminToken
      );
      const adminRes = await contractSnapshotRoute(adminReq, { params: Promise.resolve({ id: f.compId }) });
      const adminJson = await adminRes.json();

      assert.equal(adminRes.status, 200);
      assert.equal(adminJson.success, true);
      const fullContract = adminJson.data.contract;
      assert.ok(fullContract.executionPlan, "管理员权限下发完整 executionPlan");
      assert.ok(
        fullContract.executionPlan.steps[0].promptTemplate.includes("绝密Prompt指令"),
        "管理员可获取完整内部 promptTemplate"
      );
    } finally {
      await f.cleanup();
    }
  });

  test("6. 审计失败时直接调用 publishContract / archiveContract 触发外键回滚", async () => {
    const f = await setupStudioTestFixture();
    try {
      const draft = await createDraftContract({
        componentId: f.compId,
        contractVersion: "1.0.0",
        contract: buildStandardContract(f.compId, "1.0.0"),
      });

      const nonExistentUserId = "non_existent_op_" + randomUUID().replace(/-/g, "").slice(0, 8);

      // 直接调用真实 publishContract 传入不存在的用户 ID（预期外键失败，显式断言并抑制误导性输出）
      await expectFkFailure(async () => {
        await publishContract({
          componentId: f.compId,
          contractVersion: "1.0.0",
          publishedBy: nonExistentUserId,
          autoActivate: true,
        });
      });

      // 验证生命周期回滚
      const rollbackContract = await prisma.componentcontract.findUnique({
        where: { id: draft.id },
      });
      assert.equal(rollbackContract?.lifecycle, "DRAFT", "发布事务失败后，生命周期必须回滚为 DRAFT");
      assert.equal(rollbackContract?.publishedAt, null);
      assert.equal(rollbackContract?.publishedBy, null);

      // 验证激活指针回滚
      const rollbackComp = await prisma.componentcatalog.findUnique({
        where: { id: f.compId },
        select: { activeContractId: true },
      });
      assert.equal(rollbackComp?.activeContractId, null, "发布事务失败后，activeContractId 必须回滚为空");

      // 正常发布
      await publishContract({
        componentId: f.compId,
        contractVersion: "1.0.0",
        publishedBy: f.superAdminId,
        autoActivate: false,
      });

      // 尝试使用不存在的用户 ID 归档（预期外键失败，显式断言并抑制误导性输出）
      await expectFkFailure(async () => {
        await archiveContract({
          componentId: f.compId,
          contractVersion: "1.0.0",
          operatorId: nonExistentUserId,
        });
      });

      // 验证归档操作完整回滚
      const rollbackArchive = await prisma.componentcontract.findUnique({
        where: { id: draft.id },
      });
      assert.equal(rollbackArchive?.lifecycle, "PUBLISHED", "归档失败后必须回滚保持 PUBLISHED");
    } finally {
      await f.cleanup();
    }
  });

  test("7. 合同要求 TEXT_GENERATION 但平台默认部署未声明能力 → MODEL_CAPABILITY_NOT_SUPPORTED，不扣点不写成果物", async () => {
    const f = await setupStudioTestFixture();
    try {
      await createDraftContract({
        componentId: f.compId,
        contractVersion: "1.0.0",
        contract: buildStandardContract(f.compId, "1.0.0", "能力缺口指令"),
      });
      await publishContract({
        componentId: f.compId,
        contractVersion: "1.0.0",
        publishedBy: f.superAdminId,
        autoActivate: true,
      });

      // 临时清空平台默认部署能力，模拟能力不匹配（after 钩子会还原 originalCapabilities）
      if (targetDeploymentId) {
        await prisma.modeldeployment.update({
          where: { id: targetDeploymentId },
          data: { capabilities: [] as never },
        });
      }

      const req = buildJsonRequest("http://localhost/api/studio", "POST", f.userToken, {
        action: "simulate",
        workspaceId: f.workspaceId,
        componentId: f.compId,
        inputMaterial: "能力不匹配测试输入内容",
      });
      const res = await studioPostRoute(req);
      const json = await res.json();
      assert.equal(res.status, 403, `能力不匹配应 403，实际 ${res.status} body=${JSON.stringify(json)?.slice(0, 200)}`);
      assert.equal(json.code, "MODEL_CAPABILITY_NOT_SUPPORTED", "能力门禁必须拒绝");

      const tasks = await prisma.componenttask.count({ where: { userId: f.userId } });
      assert.equal(tasks, 0, "能力不匹配不得创建任务");
      const ledgers = await prisma.pointledger.count({ where: { userId: f.userId, type: "CONSUME" } });
      assert.equal(ledgers, 0, "能力不匹配不得产生算力点执行流水");
    } finally {
      if (targetDeploymentId && originalCapabilities !== null) {
        await prisma.modeldeployment.update({
          where: { id: targetDeploymentId },
          data: { capabilities: originalCapabilities as never },
        }).catch(() => {});
      }
      await f.cleanup();
    }
  });

  test("8. catalog 诚实化：无合同 contractReady=false；PUBLISHED 合同 contractReady=true；C07 contractReady=true", async () => {
    const f = await setupStudioTestFixture();
    try {
      // 夹具组件需为已发布才会出现在公开目录中
      await prisma.componentcatalog.update({ where: { id: f.compId }, data: { isPublished: true } });

      // 1) 无激活合同：contractReady=false，所有前端入口据此判定不可执行
      const res1 = await studioGetRoute(buildJsonRequest("http://localhost/api/studio?action=catalog", "GET", f.userToken));
      const json1 = await res1.json();
      assert.equal(res1.status, 200);
      const comp1 = (json1.data?.components ?? []).find((c: { id: string }) => c.id === f.compId);
      assert.ok(comp1, "catalog 必须包含夹具组件");
      assert.equal(comp1.contractReady, false, "无合同组件 contractReady 必须为 false");
      assert.equal(comp1.hasPublishedContract, false, "无合同组件 hasPublishedContract 必须为 false");
      assert.equal(comp1.hasActiveContract, false);
      assert.equal(comp1.activeContractLifecycle ?? null, null);

      // 2) 发布并激活 PUBLISHED 合同：contractReady=true
      await createDraftContract({
        componentId: f.compId,
        contractVersion: "1.0.0",
        contract: buildStandardContract(f.compId, "1.0.0"),
      });
      await publishContract({
        componentId: f.compId,
        contractVersion: "1.0.0",
        publishedBy: f.superAdminId,
        autoActivate: true,
      });
      const res2 = await studioGetRoute(buildJsonRequest("http://localhost/api/studio?action=catalog", "GET", f.userToken));
      const json2 = await res2.json();
      const comp2 = (json2.data?.components ?? []).find((c: { id: string }) => c.id === f.compId);
      assert.equal(comp2.contractReady, true, "PUBLISHED 合同 contractReady 必须为 true");
      assert.equal(comp2.hasPublishedContract, true, "PUBLISHED 合同 hasPublishedContract 必须为 true");
      assert.equal(comp2.activeContractLifecycle, "PUBLISHED");

      // 3) C07 真实组件：contractReady=true（其激活合同为 PUBLISHED，前端入口据此允许执行）
      const c07 = (json2.data?.components ?? []).find((c: { id: string }) => c.id === "C07");
      assert.ok(c07, "catalog 必须包含真实组件 C07");
      assert.equal(c07.contractReady, true, "C07 必须 contractReady=true");
      assert.equal(c07.hasPublishedContract, true);
    } finally {
      await f.cleanup();
    }
  });
});
