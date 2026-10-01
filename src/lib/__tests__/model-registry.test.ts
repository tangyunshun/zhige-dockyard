import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { prisma } from "../prisma";
import { ContractValidationError } from "../component-execution-profile";
import {
  resolveModelExecutionPlan,
  loadSpaceModelPolicy,
  type ResolvedModelPlan,
} from "../model-registry";

/**
 * Phase 1 模型注册表测试（真实数据库）。
 * 覆盖：启用/禁用、模型不存在、空间白名单允许与拒绝、用户篡改、并发一致性。
 * 无 DATABASE_URL 时自动 skip。
 */
const TEST_KEY_ENV = "MODEL_REGISTRY_TEST_KEY";

function codeOf(e: unknown): string | null {
  return e instanceof ContractValidationError ? e.code : null;
}

async function seedProvider(name: string, enabled: boolean, apiKeyEnv = TEST_KEY_ENV) {
  return prisma.modelprovider.create({
    data: {
      id: randomUUID(),
      name,
      protocol: "OPENAI_COMPATIBLE",
      baseUrl: "https://api.example.com/v1",
      apiKeyEnv,
      enabled,
    },
  });
}

async function seedDeployment(providerName: string, modelId: string, enabled: boolean) {
  return prisma.modeldeployment.create({
    data: {
      id: randomUUID(),
      providerId: providerName,
      modelId,
      upstreamModel: `${modelId}-upstream`,
      displayName: modelId,
      contextLimit: 32000,
      enabled,
    },
  });
}

describe("模型注册表 Phase 1", { skip: !process.env.DATABASE_URL }, () => {
  test("已注册且启用的模型：从数据库解析出完整执行计划", async () => {
    process.env[TEST_KEY_ENV] = "sk-unit-test";
    const p = "mp_ok_" + randomUUID();
    const m = "md_ok_" + randomUUID();
    const ws = "ws_ok_" + randomUUID();
    try {
      await seedProvider(p, true);
      const dep = await seedDeployment(p, m, true);

      const plan: ResolvedModelPlan = await resolveModelExecutionPlan({
        contractProviderId: p,
        contractModelId: m,
        workspaceId: ws,
      });
      assert.equal(plan.source, "DATABASE");
      assert.equal(plan.deploymentId, dep.id);
      assert.equal(plan.providerId, p);
      assert.equal(plan.modelId, m);
      assert.equal(plan.upstreamModelId, `${m}-upstream`, "上游模型名来自部署配置");
      assert.equal(plan.apiKey, "sk-unit-test", "密钥从环境变量读取，不入库");
      assert.equal(plan.pricing, null, "价格唯一真源为 modelpricing；未配置时为 null");
    } finally {
      await prisma.modeldeployment.deleteMany({ where: { providerId: p } }).catch(() => {});
      await prisma.modelprovider.deleteMany({ where: { name: p } }).catch(() => {});
    }
  });

  test("模型未注册（合同与注册表不匹配）→ MODEL_NOT_ALLOWED", async () => {
    const p = "mp_none_" + randomUUID();
    try {
      await assert.rejects(
        () => resolveModelExecutionPlan({ contractProviderId: p, contractModelId: "nope", workspaceId: "x" }),
        (e: unknown) => codeOf(e) === "MODEL_NOT_ALLOWED",
      );
    } finally {
      await prisma.modelprovider.deleteMany({ where: { name: p } }).catch(() => {});
    }
  });

  test("模型部署被禁用 → MODEL_NOT_ALLOWED，且不得回落环境变量", async () => {
    process.env[TEST_KEY_ENV] = "sk-unit-test";
    const p = "mp_dis_" + randomUUID();
    const m = "md_dis_" + randomUUID();
    const prevProvider = process.env.MODEL_PROVIDER_ID;
    const prevModel = process.env.MODEL_ID;
    process.env.MODEL_PROVIDER_ID = p;
    process.env.MODEL_ID = m;
    try {
      await seedProvider(p, true);
      await seedDeployment(p, m, false);

      await assert.rejects(
        () => resolveModelExecutionPlan({ contractProviderId: p, contractModelId: m, workspaceId: "x" }),
        (e: unknown) => codeOf(e) === "MODEL_NOT_ALLOWED",
      );
    } finally {
      if (prevProvider === undefined) delete process.env.MODEL_PROVIDER_ID;
      else process.env.MODEL_PROVIDER_ID = prevProvider;
      if (prevModel === undefined) delete process.env.MODEL_ID;
      else process.env.MODEL_ID = prevModel;
      await prisma.modeldeployment.deleteMany({ where: { providerId: p } }).catch(() => {});
      await prisma.modelprovider.deleteMany({ where: { name: p } }).catch(() => {});
    }
  });

  test("供应商被禁用 → MODEL_NOT_ALLOWED", async () => {
    process.env[TEST_KEY_ENV] = "sk-unit-test";
    const p = "mp_pdis_" + randomUUID();
    const m = "md_pdis_" + randomUUID();
    try {
      await seedProvider(p, false);
      await seedDeployment(p, m, true);

      await assert.rejects(
        () => resolveModelExecutionPlan({ contractProviderId: p, contractModelId: m, workspaceId: "x" }),
        (e: unknown) => codeOf(e) === "MODEL_NOT_ALLOWED",
      );
    } finally {
      await prisma.modeldeployment.deleteMany({ where: { providerId: p } }).catch(() => {});
      await prisma.modelprovider.deleteMany({ where: { name: p } }).catch(() => {});
    }
  });

  test("空间白名单：包含该部署 → 允许；未包含 → MODEL_NOT_ALLOWED", async () => {
    process.env[TEST_KEY_ENV] = "sk-unit-test";
    const p = "mp_wl_" + randomUUID();
    const m = "md_wl_" + randomUUID();
    const ws = "ws_wl_" + randomUUID();
    let policyId = "";
    try {
      await seedProvider(p, true);
      const dep = await seedDeployment(p, m, true);
      const pol = await prisma.workspace_model_policy.create({
        data: { id: randomUUID(), workspaceId: ws, defaultDeploymentId: dep.id, allowedDeploymentIds: [dep.id] },
      });
      policyId = pol.id;

      // 允许：白名单包含
      const allowed = await resolveModelExecutionPlan({
        contractProviderId: p,
        contractModelId: m,
        workspaceId: ws,
      });
      assert.equal(allowed.deploymentId, dep.id);

      // 拒绝：白名单改为其他部署
      await prisma.workspace_model_policy.update({
        where: { id: policyId },
        data: { allowedDeploymentIds: ["other_deployment_id"] },
      });
      await assert.rejects(
        () => resolveModelExecutionPlan({ contractProviderId: p, contractModelId: m, workspaceId: ws }),
        (e: unknown) => codeOf(e) === "MODEL_NOT_ALLOWED",
      );

      const policy = await loadSpaceModelPolicy(ws);
      assert.equal(policy.configured, true);
      assert.deepEqual(policy.allowedDeploymentIds, ["other_deployment_id"]);
    } finally {
      if (policyId) await prisma.workspace_model_policy.deleteMany({ where: { id: policyId } }).catch(() => {});
      await prisma.modeldeployment.deleteMany({ where: { providerId: p } }).catch(() => {});
      await prisma.modelprovider.deleteMany({ where: { name: p } }).catch(() => {});
    }
  });

  test("用户通过请求体篡改 provider/model → MODEL_OVERRIDE_NOT_ALLOWED", async () => {
    process.env[TEST_KEY_ENV] = "sk-unit-test";
    const p = "mp_ovr_" + randomUUID();
    const m = "md_ovr_" + randomUUID();
    try {
      await seedProvider(p, true);
      await seedDeployment(p, m, true);

      await assert.rejects(
        () =>
          resolveModelExecutionPlan({
            contractProviderId: p,
            contractModelId: m,
            workspaceId: "x",
            submittedProviderId: "evil-provider",
            submittedModelId: "evil-model",
          }),
        (e: unknown) => codeOf(e) === "MODEL_OVERRIDE_NOT_ALLOWED",
      );
    } finally {
      await prisma.modeldeployment.deleteMany({ where: { providerId: p } }).catch(() => {});
      await prisma.modelprovider.deleteMany({ where: { name: p } }).catch(() => {});
    }
  });

  test("同一模型并发解析：多次结果一致且正确记录 provider/model", async () => {
    process.env[TEST_KEY_ENV] = "sk-unit-test";
    const p = "mp_conc_" + randomUUID();
    const m = "md_conc_" + randomUUID();
    const ws = "ws_conc_" + randomUUID();
    try {
      await seedProvider(p, true);
      const dep = await seedDeployment(p, m, true);

      const plans = await Promise.all(
        Array.from({ length: 5 }, () =>
          resolveModelExecutionPlan({ contractProviderId: p, contractModelId: m, workspaceId: ws }),
        ),
      );
      for (const plan of plans) {
        assert.equal(plan.deploymentId, dep.id);
        assert.equal(plan.providerId, p);
        assert.equal(plan.modelId, m);
        assert.equal(plan.upstreamModelId, `${m}-upstream`);
      }
    } finally {
      await prisma.modeldeployment.deleteMany({ where: { providerId: p } }).catch(() => {});
      await prisma.modelprovider.deleteMany({ where: { name: p } }).catch(() => {});
    }
  });
});
