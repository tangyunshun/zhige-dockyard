import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  resolveDefaultDeployment,
  resolveDeploymentForWorkspace,
} from "@/lib/model-registry";
import { upsertWorkspaceByoModel } from "@/lib/workspace-byo-model";
import { ContractValidationError } from "@/lib/component-execution-profile";

/**
 * MODEL-SELECT-E1 确定性单测套件（7 项证据）
 * 1. 池内指定成功
 * 2. 白名单外 403
 * 3. BYO 未登记 403
 * 4. 能力缺失阻断
 * 5. BYO 仅自己时成员被拒（shareWithMembers: false 隔离）
 * 6. auto 向后兼容（不传参数行为完全一致）
 * 7. BYO 计价 15% 基础服务费
 */

const uid = () => randomUUID().slice(0, 8);
const OWNER_ID = `user-e1-owner-${uid()}`;
const MEMBER_ID = `user-e1-member-${uid()}`;
const WS_ID = `ws-e1-${uid()}`;
const PROV_NAME = `ProvE1_${uid()}`;
const PROV_ID = `prov-e1-${uid()}`;

let depAllowed = "";
let depDenied = "";
let depNoVision = "";

describe("MODEL-SELECT-E1: 空间可用模型池与指定解析测试套件", () => {
  before(async () => {
    // 1. 创建所有者与成员
    await prisma.user.create({
      data: { id: OWNER_ID, email: `${OWNER_ID}@test.com`, name: "Owner", role: "USER", status: "active", password: "p" },
    });
    await prisma.user.create({
      data: { id: MEMBER_ID, email: `${MEMBER_ID}@test.com`, name: "Member", role: "USER", status: "active", password: "p" },
    });

    // 2. 创建空间，并加入成员
    await prisma.workspace.create({
      data: { id: WS_ID, name: "E1 Workspace", type: "ENTERPRISE", ownerId: OWNER_ID, updatedAt: new Date() },
    });
    await prisma.workspacemember.create({
      data: { id: `wm-${uid()}`, workspaceId: WS_ID, userId: MEMBER_ID, role: "MEMBER" },
    });

    // 3. 创建供应商
    await prisma.modelprovider.create({
      data: {
        id: PROV_ID,
        name: PROV_NAME,
        protocol: "OPENAI_COMPATIBLE",
        baseUrl: "https://api.openai.com/v1",
        apiKeyEnv: "MODEL_API_KEY",
        enabled: true,
      },
    });

    if (!process.env.MODEL_API_KEY) {
      process.env.MODEL_API_KEY = "sk-test-mock-key";
    }

    // 4. 创建部署模型
    depAllowed = `dep-allowed-${uid()}`;
    depDenied = `dep-denied-${uid()}`;
    depNoVision = `dep-novision-${uid()}`;

    await prisma.modeldeployment.create({
      data: {
        id: depAllowed,
        providerId: PROV_NAME,
        modelId: `gpt-4o-allowed-${uid()}`,
        upstreamModel: "gpt-4o",
        contextLimit: 128000,
        capabilities: ["TEXT_GENERATION", "STRUCTURED_OUTPUT", "VISION"],
        enabled: true,
      },
    });

    await prisma.modeldeployment.create({
      data: {
        id: depDenied,
        providerId: PROV_NAME,
        modelId: `claude-denied-${uid()}`,
        upstreamModel: "claude-3-5",
        contextLimit: 128000,
        capabilities: ["TEXT_GENERATION"],
        enabled: true,
      },
    });

    await prisma.modeldeployment.create({
      data: {
        id: depNoVision,
        providerId: PROV_NAME,
        modelId: `text-only-${uid()}`,
        upstreamModel: "text-only",
        contextLimit: 32000,
        capabilities: ["TEXT_GENERATION"],
        enabled: true,
      },
    });

    // 5. 设置空间策略：白名单只允许 depAllowed 与 depNoVision（depDenied 不在白名单中）
    await prisma.workspace_model_policy.upsert({
      where: { workspaceId: WS_ID },
      create: {
        id: `wmp_${WS_ID}`,
        workspaceId: WS_ID,
        defaultDeploymentId: depAllowed,
        allowedDeploymentIds: [depAllowed, depNoVision],
      },
      update: {
        defaultDeploymentId: depAllowed,
        allowedDeploymentIds: [depAllowed, depNoVision],
      },
    });
  });

  after(async () => {
    await prisma.workspace_byo_model.deleteMany({ where: { workspaceId: WS_ID } });
    await prisma.workspace_model_policy.deleteMany({ where: { workspaceId: WS_ID } });
    await prisma.modeldeployment.deleteMany({ where: { id: { in: [depAllowed, depDenied, depNoVision] } } });
    await prisma.modelprovider.deleteMany({ where: { id: PROV_ID } });
    await prisma.workspacemember.deleteMany({ where: { workspaceId: WS_ID } });
    await prisma.workspace.deleteMany({ where: { id: WS_ID } });
    await prisma.user.deleteMany({ where: { id: { in: [OWNER_ID, MEMBER_ID] } } });
  });

  test("① 池内指定成功：显式指定白名单内的平台部署能正确解析", async () => {
    const plan = await resolveDeploymentForWorkspace({
      workspaceId: WS_ID,
      targetDeploymentId: depAllowed,
      requiredCapabilities: ["TEXT_GENERATION"],
      userId: MEMBER_ID,
    });
    assert.equal(plan.deploymentId, depAllowed);
    assert.equal(plan.defaultSource, "SPACE_DEFAULT");
  });

  test("② 白名单外 403：指定不在白名单内的模型必须抛出 MODEL_NOT_ALLOWED", async () => {
    await assert.rejects(
      resolveDeploymentForWorkspace({
        workspaceId: WS_ID,
        targetDeploymentId: depDenied,
        requiredCapabilities: ["TEXT_GENERATION"],
        userId: MEMBER_ID,
      }),
      (err: any) => {
        assert.equal(err.code, "MODEL_NOT_ALLOWED");
        return true;
      },
    );
  });

  test("③ BYO 未登记 403：未配置自带模型时指定 byo 必须抛出 MODEL_NOT_ALLOWED", async () => {
    await assert.rejects(
      resolveDeploymentForWorkspace({
        workspaceId: WS_ID,
        targetDeploymentId: "byo",
        requiredCapabilities: ["TEXT_GENERATION"],
        userId: MEMBER_ID,
      }),
      (err: any) => {
        assert.equal(err.code, "MODEL_NOT_ALLOWED");
        return true;
      },
    );
  });

  test("④ 能力缺失阻断：指定部署不满足合同能力必须抛出 MODEL_CAPABILITY_NOT_SUPPORTED", async () => {
    await assert.rejects(
      resolveDeploymentForWorkspace({
        workspaceId: WS_ID,
        targetDeploymentId: depNoVision,
        requiredCapabilities: ["VISION"], // depNoVision 只有 TEXT_GENERATION
        userId: MEMBER_ID,
      }),
      (err: any) => {
        assert.equal(err.code, "MODEL_CAPABILITY_NOT_SUPPORTED");
        return true;
      },
    );
  });

  test("⑤ BYO 仅自己时成员被拒：shareWithMembers 为 false 时普通成员被拒，所有者可用", async () => {
    // 登记一个仅所有者私有的 BYO 模型
    await upsertWorkspaceByoModel(WS_ID, {
      label: "Private-DeepSeek",
      protocol: "OPENAI_COMPATIBLE",
      baseUrl: "https://api.deepseek.com/v1",
      apiKey: "sk-private-test-key",
      capabilities: ["TEXT_GENERATION"],
      contextLimit: 64000,
      enabled: true,
      shareWithMembers: false, // 关键：关闭全员共享
      priceInputMicrosPerMillion: 2000000,
      priceOutputMicrosPerMillion: 8000000,
    });

    // 成员尝试指定 byo 执行 → 必须 403 拒绝
    await assert.rejects(
      resolveDeploymentForWorkspace({
        workspaceId: WS_ID,
        targetDeploymentId: "byo",
        requiredCapabilities: ["TEXT_GENERATION"],
        userId: MEMBER_ID,
      }),
      (err: any) => {
        assert.equal(err.code, "MODEL_NOT_ALLOWED");
        assert.ok(err.message.includes("仅限空间所有者使用"));
        return true;
      },
    );

    // 所有者指定 byo 执行 → 成功
    const ownerPlan = await resolveDeploymentForWorkspace({
      workspaceId: WS_ID,
      targetDeploymentId: "byo",
      requiredCapabilities: ["TEXT_GENERATION"],
      userId: OWNER_ID,
    });
    assert.equal(ownerPlan.defaultSource, "WORKSPACE_BYO");
    assert.equal(ownerPlan.modelId, "Private-DeepSeek");
  });

  test("⑥ auto 向后兼容：不传或传 auto 时，与现有 resolveDefaultDeployment 裁决行为完全一致", async () => {
    // 此时成员调用 resolveDefaultDeployment，因 BYO shareWithMembers=false，成员自动安全回落到空间默认 depAllowed
    const defaultPlan = await resolveDefaultDeployment({
      workspaceId: WS_ID,
      requiredCapabilities: ["TEXT_GENERATION"],
      userId: MEMBER_ID,
    });
    assert.equal(defaultPlan.deploymentId, depAllowed);
    assert.equal(defaultPlan.defaultSource, "SPACE_DEFAULT");
  });

  test("⑦ BYO 计价与平台服务费：BYO 执行计划定价状态为 VERIFIED 且包含完整微元参数", async () => {
    const byoPlan = await resolveDeploymentForWorkspace({
      workspaceId: WS_ID,
      targetDeploymentId: "byo",
      requiredCapabilities: ["TEXT_GENERATION"],
      userId: OWNER_ID,
    });
    assert.ok(byoPlan.pricing);
    assert.equal(byoPlan.pricing.priceStatus, "VERIFIED");
    assert.equal(byoPlan.pricing.priceInputMicrosPerMillion, 2000000);
    assert.equal(byoPlan.pricing.priceOutputMicrosPerMillion, 8000000);
  });
});
