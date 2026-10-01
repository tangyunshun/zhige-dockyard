import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { SignJWT } from "jose";
import { prisma } from "@/lib/prisma";
import { DELETE as deleteDeployment } from "../[id]/route";
import { DELETE as deleteProvider } from "@/app/api/admin/model-providers/[id]/route";
import {
  resolveDefaultDeployment,
  resolveModelExecutionPlan,
  setPlatformDefaultDeploymentId,
  getPlatformDefaultDeploymentId,
  PLATFORM_DEFAULT_DEPLOYMENT_KEY,
} from "@/lib/model-registry";
import { ContractValidationError } from "@/lib/component-execution-profile";

/**
 * 平台默认部署引用完整性与模型能力校验
 *
 * 不变量：
 *  1. 平台默认部署被引用时删除必须 409，且部署 / 价格 / systemconfig 三者均不变；
 *  2. 清除平台默认后才允许删除；
 *  3. 缺少合同要求能力（VISION / STRUCTURED_OUTPUT / LONG_CONTEXT）必须拒绝；
 *  4. 能力完整时允许执行；
 *  5. 并发「删除部署」与「设置平台默认」不得产生悬挂配置；
 *  6. 测试只使用自建 provider/deployment/systemconfig，结束零残留。
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

function delReq(token: string, path: string) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe("平台默认部署引用完整性（删除 409 / 能力校验 / 并发无悬挂）", () => {
  const adminId = "it_pd_u_" + randomUUID();
  const providerName = "it_pd_p_" + randomUUID();
  const depId = randomUUID();
  const wsId = "it_pd_ws_" + randomUUID();
  let token = "";
  let originalDefault: string | null = null;
  let injectedApiKey = false;

  const depData = () => ({
    id: depId,
    providerId: providerName,
    modelId: "it-pd-model",
    upstreamModel: "it-pd-model",
    contextLimit: 128000,
    capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "LONG_CONTEXT"] as never,
    enabled: true,
  });

  async function recreateDeployment() {
    const exists = await prisma.modeldeployment.count({ where: { id: depId } });
    if (exists === 0) {
      await prisma.modeldeployment.create({ data: depData() });
    }
  }

  before(async () => {
    token = await adminToken(adminId);
    if (!process.env.MODEL_API_KEY) {
      process.env.MODEL_API_KEY = "sk-platform-default-test";
      injectedApiKey = true;
    }
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
    await prisma.modeldeployment.create({ data: depData() });
    await prisma.modelpricing.create({
      data: {
        id: randomUUID(),
        deploymentId: depId,
        currency: "CNY",
        costInputMicrosPerMillion: 1,
        costOutputMicrosPerMillion: 2,
      },
    });
    await prisma.workspace.create({
      data: { id: wsId, name: wsId, type: "PERSONAL", ownerId: adminId, updatedAt: new Date() },
    });
    await prisma.workspace_model_policy.create({
      data: { id: randomUUID(), workspaceId: wsId, defaultDeploymentId: depId, allowedDeploymentIds: [] },
    });
    originalDefault = await getPlatformDefaultDeploymentId();
    await setPlatformDefaultDeploymentId(null);
  });

  after(async () => {
    await prisma.workspace_model_policy.deleteMany({ where: { workspaceId: wsId } });
    await prisma.workspace.deleteMany({ where: { id: wsId } });
    await prisma.modelpricing.deleteMany({ where: { deploymentId: depId } });
    await prisma.modeldeployment.deleteMany({ where: { id: depId } });
    await prisma.modelprovider.deleteMany({ where: { name: providerName } });
    await setPlatformDefaultDeploymentId(originalDefault);
    await prisma.user.deleteMany({ where: { id: adminId } });
    if (injectedApiKey) delete process.env.MODEL_API_KEY;

    const residue = {
      policy: await prisma.workspace_model_policy.count({ where: { workspaceId: wsId } }),
      ws: await prisma.workspace.count({ where: { id: wsId } }),
      dep: await prisma.modeldeployment.count({ where: { id: depId } }),
      pricing: await prisma.modelpricing.count({ where: { deploymentId: depId } }),
      prov: await prisma.modelprovider.count({ where: { name: providerName } }),
      user: await prisma.user.count({ where: { id: adminId } }),
    };
    assert.deepEqual(
      residue,
      { policy: 0, ws: 0, dep: 0, pricing: 0, prov: 0, user: 0 },
      `本轮生成数据必须零残留: ${JSON.stringify(residue)}`,
    );
  });

  test("① 平台默认部署被引用时删除返回 409，且部署 / 价格 / systemconfig 均不变", async () => {
    await recreateDeployment();
    await setPlatformDefaultDeploymentId(depId);

    const depBefore = await prisma.modeldeployment.findUniqueOrThrow({ where: { id: depId } });
    const priceBefore = await prisma.modelpricing.findFirstOrThrow({ where: { deploymentId: depId } });
    const cfgBefore = await prisma.systemconfig.findUniqueOrThrow({ where: { key: PLATFORM_DEFAULT_DEPLOYMENT_KEY } });

    const res = await deleteDeployment(delReq(token, `/api/admin/model-deployments/${depId}`), {
      params: Promise.resolve({ id: depId }),
    });
    assert.equal(res.status, 409, "平台默认部署被引用时删除必须 409");
    const body = await res.json();
    assert.equal(body.code, "PLATFORM_DEFAULT_DEPLOYMENT_IN_USE");

    assert.deepEqual(await prisma.modeldeployment.findUniqueOrThrow({ where: { id: depId } }), depBefore, "部署不得变化");
    assert.deepEqual(
      await prisma.modelpricing.findFirstOrThrow({ where: { deploymentId: depId } }),
      priceBefore,
      "价格不得变化",
    );
    assert.deepEqual(
      await prisma.systemconfig.findUniqueOrThrow({ where: { key: PLATFORM_DEFAULT_DEPLOYMENT_KEY } }),
      cfgBefore,
      "systemconfig 不得变化",
    );
  });

  test("② 清除平台默认后才允许删除（但仍受空间策略引用约束）", async () => {
    await setPlatformDefaultDeploymentId(null);

    // 平台默认已清除，但空间策略仍引用 → 仍须 409
    const stillReferenced = await deleteDeployment(delReq(token, `/api/admin/model-deployments/${depId}`), {
      params: Promise.resolve({ id: depId }),
    });
    assert.equal(stillReferenced.status, 409, "仍被空间策略引用时必须 409");

    // 解除空间引用后才允许删除
    await prisma.workspace_model_policy.update({ where: { workspaceId: wsId }, data: { defaultDeploymentId: null } });
    const ok = await deleteDeployment(delReq(token, `/api/admin/model-deployments/${depId}`), {
      params: Promise.resolve({ id: depId }),
    });
    assert.equal(ok.status, 200, "无任何引用后应允许删除");
    assert.equal(await prisma.modeldeployment.count({ where: { id: depId } }), 0);

    // 重建部署与空间引用，供后续用例使用
    await recreateDeployment();
    await prisma.workspace_model_policy.update({ where: { workspaceId: wsId }, data: { defaultDeploymentId: depId } });
  });

  test("③ 缺少 VISION / STRUCTURED_OUTPUT / LONG_CONTEXT 能力时必须拒绝", async () => {
    await prisma.modeldeployment.update({ where: { id: depId }, data: { capabilities: ["TEXT_GENERATION"] as never } });

    for (const missing of ["VISION", "STRUCTURED_OUTPUT", "LONG_CONTEXT"]) {
      await assert.rejects(
        () => resolveDefaultDeployment({ workspaceId: wsId, requiredCapabilities: ["TEXT_GENERATION", missing] }),
        (e: unknown) => {
          assert.ok(e instanceof ContractValidationError, `缺少 ${missing} 必须抛出 ContractValidationError`);
          assert.equal(
            (e as ContractValidationError).code,
            "MODEL_CAPABILITY_NOT_SUPPORTED",
            `缺少 ${missing} 必须返回 MODEL_CAPABILITY_NOT_SUPPORTED`,
          );
          return true;
        },
        `缺少 ${missing} 必须拒绝`,
      );
    }

    // contextLimit 不得被当作能力：即使 contextLimit 很大，缺能力依然拒绝
    const dep = await prisma.modeldeployment.findUniqueOrThrow({ where: { id: depId } });
    assert.ok((dep.contextLimit ?? 0) >= 128000, "前置条件：contextLimit 足够大");
    await assert.rejects(
      () => resolveDefaultDeployment({ workspaceId: wsId, requiredCapabilities: ["LONG_CONTEXT"] }),
      (e: unknown) => e instanceof ContractValidationError,
      "contextLimit 不得代替能力表达",
    );
  });

  test("④ 能力完整时允许执行", async () => {
    await prisma.modeldeployment.update({
      where: { id: depId },
      data: { capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "LONG_CONTEXT", "VISION"] as never },
    });
    const plan = await resolveDefaultDeployment({
      workspaceId: wsId,
      requiredCapabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "LONG_CONTEXT"],
    });
    assert.equal(plan.deploymentId, depId);
    assert.equal(plan.defaultSource, "SPACE_DEFAULT");
  });

  test("⑤ 并发删除部署与设置平台默认不得产生悬挂配置", async () => {
    await prisma.workspace_model_policy.update({ where: { workspaceId: wsId }, data: { defaultDeploymentId: null } });
    await setPlatformDefaultDeploymentId(null);

    await Promise.allSettled([
      deleteDeployment(delReq(token, `/api/admin/model-deployments/${depId}`), {
        params: Promise.resolve({ id: depId }),
      }),
      setPlatformDefaultDeploymentId(depId),
    ]);

    // 核心不变量：平台默认若仍存在，必须指向真实存在的部署（绝不悬挂）
    const cfg = await prisma.systemconfig.findUnique({ where: { key: PLATFORM_DEFAULT_DEPLOYMENT_KEY } });
    if (cfg?.value) {
      const exists = await prisma.modeldeployment.count({ where: { id: cfg.value } });
      assert.equal(exists, 1, `平台默认不得悬挂指向已删除部署: ${cfg.value}`);
    }

    // 清理并确认供应商删除链路同样覆盖平台默认引用
    await setPlatformDefaultDeploymentId(null);
    await recreateDeployment();
  });

  test("⑥ 供应商删除链路覆盖平台默认引用（命中即 409）", async () => {
    await setPlatformDefaultDeploymentId(depId);
    const providerRow = await prisma.modelprovider.findFirstOrThrow({ where: { name: providerName } });

    const res = await deleteProvider(delReq(token, `/api/admin/model-providers/${providerRow.id}`), {
      params: Promise.resolve({ id: providerRow.id }),
    });
    assert.equal(res.status, 409, "供应商下部署为平台默认时必须 409");
    const body = await res.json();
    assert.equal(body.code, "PLATFORM_DEFAULT_DEPLOYMENT_IN_USE");

    // 清除平台默认后，仍因「存在部署」被拒（引用链两层保护）
    await setPlatformDefaultDeploymentId(null);
    const res2 = await deleteProvider(delReq(token, `/api/admin/model-providers/${providerRow.id}`), {
      params: Promise.resolve({ id: providerRow.id }),
    });
    assert.equal(res2.status, 409, "供应商下仍有部署时必须 409");
  });

  test("⑦ 停用的部署 / 停用的供应商不得被设为平台默认（且配置保持不变）", async () => {
    await recreateDeployment();
    await setPlatformDefaultDeploymentId(null);

    await prisma.modeldeployment.update({ where: { id: depId }, data: { enabled: false } });
    await assert.rejects(
      () => setPlatformDefaultDeploymentId(depId),
      (e: unknown) => e instanceof ContractValidationError,
      "停用部署不得设为平台默认",
    );
    await prisma.modeldeployment.update({ where: { id: depId }, data: { enabled: true } });

    await prisma.modelprovider.update({ where: { name: providerName }, data: { enabled: false } });
    await assert.rejects(
      () => setPlatformDefaultDeploymentId(depId),
      (e: unknown) => e instanceof ContractValidationError,
      "供应商停用时不得设为平台默认",
    );
    await prisma.modelprovider.update({ where: { name: providerName }, data: { enabled: true } });

    assert.equal(await getPlatformDefaultDeploymentId(), null, "被拒绝的写入不得改变 systemconfig");
    await recreateDeployment();
  });

  test("⑧ 解除平台默认后删除成功，且 modelpricing 同步清理（无孤儿）", async () => {
    await setPlatformDefaultDeploymentId(null);
    await prisma.workspace_model_policy.update({ where: { workspaceId: wsId }, data: { defaultDeploymentId: null } });

    const res = await deleteDeployment(delReq(token, `/api/admin/model-deployments/${depId}`), {
      params: Promise.resolve({ id: depId }),
    });
    assert.equal(res.status, 200, "无任何引用后应允许删除");
    assert.equal(await prisma.modeldeployment.count({ where: { id: depId } }), 0, "部署应被删除");
    assert.equal(
      await prisma.modelpricing.count({ where: { deploymentId: depId } }),
      0,
      "modelpricing 必须同步清理，不得留下价格孤儿",
    );

    // 复原供后续用例使用（含价格行）
    await prisma.modeldeployment.create({ data: depData() });
    await prisma.modelpricing.create({
      data: { id: randomUUID(), deploymentId: depId, currency: "CNY", costInputMicrosPerMillion: 1, costOutputMicrosPerMillion: 2 },
    });
  });

  test("⑨ resolveModelExecutionPlan：未注册模型不得通过任何环境变量回退", async () => {
    const saved = {
      a: process.env.MODEL_PROVIDER_ID,
      b: process.env.MODEL_MODEL_ID,
      c: process.env.MODEL_DEFAULT_PROVIDER,
      d: process.env.MODEL_DEFAULT_MODEL,
    };
    process.env.MODEL_PROVIDER_ID = providerName;
    process.env.MODEL_MODEL_ID = "it-pd-model";
    process.env.MODEL_DEFAULT_PROVIDER = providerName;
    process.env.MODEL_DEFAULT_MODEL = "it-pd-model";
    try {
      await assert.rejects(
        () =>
          resolveModelExecutionPlan({
            contractProviderId: `unregistered-${randomUUID()}`,
            contractModelId: "not-registered",
            workspaceId: wsId,
          }),
        (e: unknown) => {
          assert.ok(e instanceof ContractValidationError);
          assert.equal((e as ContractValidationError).code, "MODEL_NOT_ALLOWED");
          return true;
        },
        "未注册模型必须 MODEL_NOT_ALLOWED，绝不允许环境变量兜底",
      );
    } finally {
      process.env.MODEL_PROVIDER_ID = saved.a;
      process.env.MODEL_MODEL_ID = saved.b;
      process.env.MODEL_DEFAULT_PROVIDER = saved.c;
      process.env.MODEL_DEFAULT_MODEL = saved.d;
    }
  });

  test("⑩ resolveModelExecutionPlan 能力门禁：缺 VISION 拒绝，能力齐备放行", async () => {
    await recreateDeployment();
    await prisma.modeldeployment.update({ where: { id: depId }, data: { capabilities: ["TEXT_GENERATION"] as never } });

    await assert.rejects(
      () =>
        resolveModelExecutionPlan({
          contractProviderId: providerName,
          contractModelId: "it-pd-model",
          workspaceId: wsId,
          requiredCapabilities: ["TEXT_GENERATION", "VISION"],
        }),
      (e: unknown) => {
        assert.ok(e instanceof ContractValidationError, "缺能力必须抛领域错误");
        assert.equal((e as ContractValidationError).code, "MODEL_CAPABILITY_NOT_SUPPORTED");
        return true;
      },
      "缺少 VISION 必须返回 MODEL_CAPABILITY_NOT_SUPPORTED",
    );

    // contextLimit 不得当能力：能力缺失时即使 contextLimit 很大也必须拒绝（上面已证）
    await prisma.modeldeployment.update({
      where: { id: depId },
      data: { capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "VISION", "LONG_CONTEXT", "FILE_ANALYSIS"] as never },
    });
    const plan = await resolveModelExecutionPlan({
      contractProviderId: providerName,
      contractModelId: "it-pd-model",
      workspaceId: wsId,
      requiredCapabilities: ["VISION", "STRUCTURED_OUTPUT"],
    });
    assert.equal(plan.deploymentId, depId, "能力齐备时应解析成功");
    assert.equal(plan.source, "DATABASE");
  });
});
