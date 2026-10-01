import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  resolveDefaultDeployment,
  getPlatformDefaultDeploymentId,
  setPlatformDefaultDeploymentId,
  PLATFORM_DEFAULT_DEPLOYMENT_KEY,
} from "@/lib/model-registry";
import { ContractValidationError } from "@/lib/component-execution-profile";

/**
 * 默认执行模型「数据库唯一裁决」专项测试
 *  - 空间 defaultDeploymentId 优先；
 *  - 未配置空间默认时使用平台默认；
 *  - 无平台默认时明确 MODEL_NOT_ALLOWED；
 *  - 部署禁用 / 供应商禁用 / 白名单不允许 一律拒绝；
 *  - 新增更早 createdAt 的部署**不得**改变裁决结果（禁止 findFirst(createdAt) 隐式选模）。
 */

const uid = () => randomUUID().slice(0, 8);
const PROV = `ProvArb_${uid()}`;
const PROV_ID = `prov-arb-${uid()}`;
const WS = `ws-arb-${uid()}`;
const USER = `user-arb-${uid()}`;

let depOld = "";
let depNew = "";
let depOldest = "";
let origPlatformDefault: string | null = null;
/** 是否由本套件注入了 MODEL_API_KEY（结束时仅还原自己注入的值） */
let injectedApiKey = false;

async function expectRejected(fn: () => Promise<unknown>, hint: string): Promise<void> {
  await assert.rejects(fn, (e: unknown) => {
    assert.ok(e instanceof ContractValidationError, `${hint}：必须抛出 ContractValidationError，实际 ${String(e)}`);
    assert.equal((e as ContractValidationError).code, "MODEL_NOT_ALLOWED", `${hint}：错误码必须为 MODEL_NOT_ALLOWED`);
    return true;
  }, hint);
}

describe("默认执行模型数据库唯一裁决（空间默认 -> 平台默认 -> 拒绝）", () => {
  before(async () => {
    await prisma.user.create({
      data: { id: USER, email: `${USER}@zhige.test`, name: USER, role: "USER", status: "active", password: "x" },
    });
    await prisma.workspace.create({
      data: { id: WS, name: WS, type: "PERSONAL", ownerId: USER, updatedAt: new Date() },
    });
    await prisma.modelprovider.create({
      data: {
        id: PROV_ID,
        name: PROV,
        protocol: "OPENAI_COMPATIBLE",
        baseUrl: "https://example.test/v1",
        apiKeyEnv: "MODEL_API_KEY",
        enabled: true,
      },
    });
    depOld = `dep-arb-old-${uid()}`;
    depNew = `dep-arb-new-${uid()}`;
    depOldest = `dep-arb-oldest-${uid()}`;
    await prisma.modeldeployment.create({
      data: { id: depOld, providerId: PROV, modelId: `m-old-${uid()}`, upstreamModel: "u", contextLimit: 8192, enabled: true, createdAt: new Date(Date.now() - 10_000) },
    });
    await prisma.modeldeployment.create({
      data: { id: depNew, providerId: PROV, modelId: `m-new-${uid()}`, upstreamModel: "u", contextLimit: 8192, enabled: true, createdAt: new Date() },
    });
    // 构建执行计划时按合同读取 apiKeyEnv，fixture 需提供最小环境变量（仅注入、结束还原）
    if (!process.env.MODEL_API_KEY) {
      process.env.MODEL_API_KEY = "sk-arb-test-key";
      injectedApiKey = true;
    }
    origPlatformDefault = await getPlatformDefaultDeploymentId();
    // 确保从「无平台默认」的干净基线开始
    await setPlatformDefaultDeploymentId(null);
  });

  after(async () => {
    await prisma.workspace_model_policy.deleteMany({ where: { workspaceId: WS } });
    await prisma.workspace.deleteMany({ where: { id: WS } });
    await prisma.modeldeployment.deleteMany({ where: { providerId: PROV } });
    await prisma.modelprovider.deleteMany({ where: { name: PROV } });
    await setPlatformDefaultDeploymentId(origPlatformDefault);
    if (injectedApiKey) {
      delete process.env.MODEL_API_KEY;
    }
    await prisma.user.deleteMany({ where: { id: USER } });

    const residue = {
      policy: await prisma.workspace_model_policy.count({ where: { workspaceId: WS } }),
      ws: await prisma.workspace.count({ where: { id: WS } }),
      dep: await prisma.modeldeployment.count({ where: { providerId: PROV } }),
      prov: await prisma.modelprovider.count({ where: { name: PROV } }),
      user: await prisma.user.count({ where: { id: USER } }),
    };
    assert.deepEqual(residue, { policy: 0, ws: 0, dep: 0, prov: 0, user: 0 }, `零残留断言失败: ${JSON.stringify(residue)}`);
  });

  test("① 无空间默认且无平台默认 → 明确 MODEL_NOT_ALLOWED（不猜测、不按创建时间挑）", async () => {
    await expectRejected(() => resolveDefaultDeployment({ workspaceId: WS }), "无默认时必须拒绝");
  });

  test("② 仅配置平台默认 → 使用平台默认", async () => {
    await setPlatformDefaultDeploymentId(depOld);
    const plan = await resolveDefaultDeployment({ workspaceId: WS });
    assert.equal(plan.deploymentId, depOld);
    assert.equal(plan.defaultSource, "PLATFORM_DEFAULT");
  });

  test("③ 空间默认优先：空间已配置时不得回落到平台默认", async () => {
    await prisma.workspace_model_policy.upsert({
      where: { workspaceId: WS },
      create: { id: `wmp-${uid()}`, workspaceId: WS, defaultDeploymentId: depNew, allowedDeploymentIds: [] },
      update: { defaultDeploymentId: depNew, allowedDeploymentIds: [] },
    });
    const plan = await resolveDefaultDeployment({ workspaceId: WS });
    assert.equal(plan.deploymentId, depNew, "空间默认必须优先于平台默认");
    assert.equal(plan.defaultSource, "SPACE_DEFAULT");
  });

  test("④ 新增更早 createdAt 的部署不得改变裁决结果（禁止 findFirst(createdAt)）", async () => {
    await prisma.modeldeployment.create({
      data: { id: depOldest, providerId: PROV, modelId: `m-oldest-${uid()}`, upstreamModel: "u", contextLimit: 8192, enabled: true, createdAt: new Date(Date.now() - 600_000) },
    });
    const before = await resolveDefaultDeployment({ workspaceId: WS });
    const after = await resolveDefaultDeployment({ workspaceId: WS });
    assert.equal(before.deploymentId, depNew, "新增更早部署前必须为空间默认");
    assert.equal(after.deploymentId, depNew, "新增更早 createdAt 部署后裁决结果不得改变");
  });

  test("⑤ 部署被禁用 → 拒绝", async () => {
    await prisma.modeldeployment.update({ where: { id: depNew }, data: { enabled: false } });
    await expectRejected(() => resolveDefaultDeployment({ workspaceId: WS }), "默认部署被禁用时必须拒绝");
    await prisma.modeldeployment.update({ where: { id: depNew }, data: { enabled: true } });
  });

  test("⑥ 供应商被禁用 → 拒绝", async () => {
    await prisma.modelprovider.update({ where: { name: PROV }, data: { enabled: false } });
    await expectRejected(() => resolveDefaultDeployment({ workspaceId: WS }), "默认供应商被禁用时必须拒绝");
    await prisma.modelprovider.update({ where: { name: PROV }, data: { enabled: true } });
  });

  test("⑦ 白名单不包含默认部署 → 拒绝", async () => {
    await prisma.workspace_model_policy.update({
      where: { workspaceId: WS },
      data: { allowedDeploymentIds: [depOld] },
    });
    await expectRejected(() => resolveDefaultDeployment({ workspaceId: WS }), "默认部署不在白名单时必须拒绝");
  });

  test("⑧ 清空空间与平台默认 → 再次明确拒绝", async () => {
    await prisma.workspace_model_policy.deleteMany({ where: { workspaceId: WS } });
    await setPlatformDefaultDeploymentId(null);
    assert.equal(await getPlatformDefaultDeploymentId(), null);
    await expectRejected(() => resolveDefaultDeployment({ workspaceId: WS }), "全部默认清空时必须拒绝");
  });

  test("⑨ 平台默认不得写入不存在的部署（防悬挂配置）", async () => {
    await assert.rejects(
      () => setPlatformDefaultDeploymentId(`not-exist-${uid()}`),
      (e: unknown) => e instanceof ContractValidationError,
    );
  });

  test("⑩ 平台默认存储于 system_config 且键名稳定", async () => {
    await setPlatformDefaultDeploymentId(depOld);
    const row = await prisma.systemconfig.findUnique({ where: { key: PLATFORM_DEFAULT_DEPLOYMENT_KEY } });
    assert.equal(row?.value, depOld);
    await setPlatformDefaultDeploymentId(null);
  });
});
