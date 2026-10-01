import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { prisma } from "../prisma";
import { ContractValidationError } from "../component-execution-profile";
import { resolveModelExecutionPlan } from "../model-registry";

/** 空间默认模型（defaultDeploymentId）语义测试（真实数据库） */
const TEST_KEY_ENV = "MODEL_REGISTRY_TEST_KEY";

function codeOf(e: unknown): string | null {
  return e instanceof ContractValidationError ? e.code : null;
}

async function seed(p: string, m: string, deploymentEnabled: boolean, providerEnabled: boolean) {
  await prisma.modelprovider.create({
    data: {
      id: randomUUID(),
      name: p,
      protocol: "OPENAI_COMPATIBLE",
      baseUrl: "https://api.example.com/v1",
      apiKeyEnv: TEST_KEY_ENV,
      enabled: providerEnabled,
    },
  });
  return prisma.modeldeployment.create({
    data: {
      id: randomUUID(),
      providerId: p,
      modelId: m,
      upstreamModel: `${m}-upstream`,
      contextLimit: 32000,
      enabled: deploymentEnabled,
    },
  });
}

describe("空间默认模型 defaultDeploymentId 语义", { skip: !process.env.DATABASE_URL }, () => {
  test("合同模型未注册但空间默认模型可用 → 使用默认模型", async () => {
    process.env[TEST_KEY_ENV] = "sk-unit-test";
    const p = "mp_def_" + randomUUID();
    const m = "md_def_" + randomUUID();
    const ws = "ws_def_" + randomUUID();
    let policyId = "";
    try {
      const dep = await seed(p, m, true, true);
      const pol = await prisma.workspace_model_policy.create({
        data: { id: randomUUID(), workspaceId: ws, defaultDeploymentId: dep.id, allowedDeploymentIds: [] },
      });
      policyId = pol.id;

      const plan = await resolveModelExecutionPlan({
        contractProviderId: "unregistered-provider",
        contractModelId: "unregistered-model",
        workspaceId: ws,
      });
      assert.equal(plan.source, "DATABASE");
      assert.equal(plan.deploymentId, dep.id, "应回落到空间默认模型");
      assert.equal(plan.providerId, p);
      assert.equal(plan.modelId, m);
      assert.equal(plan.pricing, null, "价格唯一真源为 modelpricing");
    } finally {
      if (policyId) await prisma.workspace_model_policy.deleteMany({ where: { id: policyId } }).catch(() => {});
      await prisma.modeldeployment.deleteMany({ where: { providerId: p } }).catch(() => {});
      await prisma.modelprovider.deleteMany({ where: { name: p } }).catch(() => {});
    }
  });

  test("空间默认模型被禁用 → MODEL_NOT_ALLOWED（默认模型不得绕过启用状态）", async () => {
    process.env[TEST_KEY_ENV] = "sk-unit-test";
    const p = "mp_defdis_" + randomUUID();
    const m = "md_defdis_" + randomUUID();
    const ws = "ws_defdis_" + randomUUID();
    let policyId = "";
    try {
      const dep = await seed(p, m, false, true);
      const pol = await prisma.workspace_model_policy.create({
        data: { id: randomUUID(), workspaceId: ws, defaultDeploymentId: dep.id, allowedDeploymentIds: [] },
      });
      policyId = pol.id;

      await assert.rejects(
        () =>
          resolveModelExecutionPlan({
            contractProviderId: "unregistered-provider",
            contractModelId: "unregistered-model",
            workspaceId: ws,
          }),
        (e: unknown) => codeOf(e) === "MODEL_NOT_ALLOWED",
      );
    } finally {
      if (policyId) await prisma.workspace_model_policy.deleteMany({ where: { id: policyId } }).catch(() => {});
      await prisma.modeldeployment.deleteMany({ where: { providerId: p } }).catch(() => {});
      await prisma.modelprovider.deleteMany({ where: { name: p } }).catch(() => {});
    }
  });

  test("空间默认模型 ID 不存在 → 数据库外键直接拒绝写入（不再可能产生无效引用）", async () => {
    process.env[TEST_KEY_ENV] = "sk-unit-test";
    const ws = "ws_defbad_" + randomUUID();

    // defaultDeploymentId 已建立 ON DELETE RESTRICT 外键：不存在的部署 ID 无法写入
    await assert.rejects(
      () =>
        prisma.workspace_model_policy.create({
          data: {
            id: randomUUID(),
            workspaceId: ws,
            defaultDeploymentId: "non-existent-deployment",
            allowedDeploymentIds: [],
          },
        }),
      (e: unknown) => (e as { code?: string }).code === "P2003" || /foreign key/i.test((e as Error).message),
      "外键必须阻止写入不存在的默认模型",
    );

    // 不得残留任何策略行
    assert.equal(await prisma.workspace_model_policy.count({ where: { workspaceId: ws } }), 0);

    // 解析器层面：无策略（等价于无有效默认模型）时仍必须 MODEL_NOT_ALLOWED，绝不降级模拟
    await assert.rejects(
      () =>
        resolveModelExecutionPlan({
          contractProviderId: "whatever",
          contractModelId: "whatever",
          workspaceId: ws,
        }),
      (e: unknown) => codeOf(e) === "MODEL_NOT_ALLOWED",
    );
  });

  test("C07 合同固定模型时：默认模型存在且白名单包含该合同模型 → 允许；白名单排除 → 拒绝", async () => {
    process.env[TEST_KEY_ENV] = "sk-unit-test";
    const p = "mp_c07_" + randomUUID();
    const m = "md_c07_" + randomUUID();
    const ws = "ws_c07_" + randomUUID();
    let policyId = "";
    try {
      const dep = await seed(p, m, true, true);
      const pol = await prisma.workspace_model_policy.create({
        data: {
          id: randomUUID(),
          workspaceId: ws,
          defaultDeploymentId: dep.id,
          allowedDeploymentIds: [dep.id],
        },
      });
      policyId = pol.id;

      // 合同模型就是默认模型且在白名单 → 允许
      const plan = await resolveModelExecutionPlan({
        contractProviderId: p,
        contractModelId: m,
        workspaceId: ws,
      });
      assert.equal(plan.deploymentId, dep.id);

      // 白名单移除该部署 → 即使默认模型也拒绝
      await prisma.workspace_model_policy.update({
        where: { id: policyId },
        data: { allowedDeploymentIds: ["other-id"] },
      });
      await assert.rejects(
        () => resolveModelExecutionPlan({ contractProviderId: p, contractModelId: m, workspaceId: ws }),
        (e: unknown) => codeOf(e) === "MODEL_NOT_ALLOWED",
      );
    } finally {
      if (policyId) await prisma.workspace_model_policy.deleteMany({ where: { id: policyId } }).catch(() => {});
      await prisma.modeldeployment.deleteMany({ where: { providerId: p } }).catch(() => {});
      await prisma.modelprovider.deleteMany({ where: { name: p } }).catch(() => {});
    }
  });
});
