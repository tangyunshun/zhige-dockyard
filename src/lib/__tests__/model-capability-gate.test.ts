import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { prisma } from "../prisma";
import { resolveModelExecutionPlan } from "../model-registry";
import { ContractValidationError } from "../component-execution-profile";

/**
 * 模型能力门禁强断言（批次 1A）。
 * 仅使用临时种子 provider/deployment，finally 全量清理，绝不修改生产数据。
 * 覆盖：能力缺失 / 能力齐全 / 越权能力 / 上下文超限 / 部署禁用 / 供应商禁用，
 * 以及 C07 真实执行前置（只读真实 MagicAI/gpt-5.5 部署与 C07 激活合同）。
 */
function codeOf(e: unknown): string | undefined {
  if (e && typeof e === "object" && "code" in e) return (e as { code?: string }).code;
  return undefined;
}

describe("模型能力门禁强断言", { skip: !process.env.DATABASE_URL }, () => {
  const PROV = "prov_gate_" + randomUUID();
  const MODEL_EMPTY = "m_empty_" + randomUUID();
  const MODEL_TEXTGEN = "m_textgen_" + randomUUID();
  const MODEL_SMALLCTX = "m_smallctx_" + randomUUID();
  const WS = "ws_gate_" + randomUUID();

  before(async () => {
    // 仅为让 buildDatabasePlan 走完「计划解析」分支（能力门禁在它之前已执行）；
    // 真实模型调用由其他测试覆盖，此处不发起 HTTP。
    process.env.MODEL_GATE_MOCK_KEY = "sk-mock-gate";
    await prisma.modelprovider.create({
      data: {
        id: randomUUID(),
        name: PROV,
        protocol: "OPENAI_COMPATIBLE",
        baseUrl: "http://127.0.0.1:9/v1",
        apiKeyEnv: "MODEL_GATE_MOCK_KEY",
        enabled: true,
      },
    });
    await prisma.modeldeployment.createMany({
      data: [
        { id: randomUUID(), providerId: PROV, modelId: MODEL_EMPTY, upstreamModel: "u", contextLimit: 32000, capabilities: [], enabled: true },
        { id: randomUUID(), providerId: PROV, modelId: MODEL_TEXTGEN, upstreamModel: "u-textgen", contextLimit: 32000, capabilities: ["TEXT_GENERATION"], enabled: true },
        { id: randomUUID(), providerId: PROV, modelId: MODEL_SMALLCTX, upstreamModel: "u-ctx", contextLimit: 100, capabilities: ["TEXT_GENERATION"], enabled: true },
      ],
    });
  });

  after(async () => {
    delete process.env.MODEL_GATE_MOCK_KEY;
    await prisma.modeldeployment.deleteMany({ where: { providerId: PROV } }).catch(() => {});
    await prisma.modelprovider.deleteMany({ where: { name: PROV } }).catch(() => {});
  });

  test("① 部署能力为空 + 合同要求 TEXT_GENERATION → MODEL_CAPABILITY_NOT_SUPPORTED（不调用模型、不消费算力点）", async () => {
    await assert.rejects(
      () =>
        resolveModelExecutionPlan({
          contractProviderId: PROV,
          contractModelId: MODEL_EMPTY,
          workspaceId: WS,
          requiredCapabilities: ["TEXT_GENERATION"],
        }),
      (e: unknown) => codeOf(e) === "MODEL_CAPABILITY_NOT_SUPPORTED",
      "能力缺失必须在门禁处拒绝，且不进入模型调用",
    );
  });

  test("② 部署声明 TEXT_GENERATION + 合同要求 TEXT_GENERATION → 解析成功（DB 唯一裁决，providerId/modelId/upstreamModelId 正确）", async () => {
    const plan = await resolveModelExecutionPlan({
      contractProviderId: PROV,
      contractModelId: MODEL_TEXTGEN,
      workspaceId: WS,
      requiredCapabilities: ["TEXT_GENERATION"],
    });
    assert.equal(plan.source, "DATABASE", "必须经数据库注册表裁决，不得回落环境变量");
    assert.equal(plan.providerId, PROV);
    assert.equal(plan.modelId, MODEL_TEXTGEN);
    assert.equal(plan.upstreamModelId, "u-textgen", "请求下发模型名必须等于 deployment.upstreamModel");
  });

  test("③ 合同要求 VISION 但部署未声明 VISION → MODEL_CAPABILITY_NOT_SUPPORTED（不扣点）", async () => {
    await assert.rejects(
      () =>
        resolveModelExecutionPlan({
          contractProviderId: PROV,
          contractModelId: MODEL_TEXTGEN,
          workspaceId: WS,
          requiredCapabilities: ["VISION"],
        }),
      (e: unknown) => codeOf(e) === "MODEL_CAPABILITY_NOT_SUPPORTED",
      "越权能力必须拒绝",
    );
  });

  test("④ 合同上下文预算超过部署 contextLimit → MODEL_CONTEXT_LIMIT_EXCEEDED（不扣点）", async () => {
    await assert.rejects(
      () =>
        resolveModelExecutionPlan({
          contractProviderId: PROV,
          contractModelId: MODEL_SMALLCTX,
          workspaceId: WS,
          requiredCapabilities: ["TEXT_GENERATION"],
          requiredContextTokens: 200,
        }),
      (e: unknown) => codeOf(e) === "MODEL_CONTEXT_LIMIT_EXCEEDED",
      "上下文超限必须拒绝",
    );
  });

  test("⑤ 部署被禁用 → MODEL_NOT_ALLOWED（能力校验不被绕过）", async () => {
    const dep = await prisma.modeldeployment.findFirstOrThrow({ where: { providerId: PROV, modelId: MODEL_TEXTGEN } });
    await prisma.modeldeployment.update({ where: { id: dep.id }, data: { enabled: false } });
    try {
      await assert.rejects(
        () =>
          resolveModelExecutionPlan({
            contractProviderId: PROV,
            contractModelId: MODEL_TEXTGEN,
            workspaceId: WS,
            requiredCapabilities: ["TEXT_GENERATION"],
          }),
        (e: unknown) => codeOf(e) === "MODEL_NOT_ALLOWED",
      );
    } finally {
      await prisma.modeldeployment.update({ where: { id: dep.id }, data: { enabled: true } });
    }
  });

  test("⑥ 供应商被禁用 → MODEL_NOT_ALLOWED（能力校验不被绕过）", async () => {
    await prisma.modelprovider.update({ where: { name: PROV }, data: { enabled: false } });
    try {
      await assert.rejects(
        () =>
          resolveModelExecutionPlan({
            contractProviderId: PROV,
            contractModelId: MODEL_TEXTGEN,
            workspaceId: WS,
            requiredCapabilities: ["TEXT_GENERATION"],
          }),
        (e: unknown) => codeOf(e) === "MODEL_NOT_ALLOWED",
      );
    } finally {
      await prisma.modelprovider.update({ where: { name: PROV }, data: { enabled: true } });
    }
  });

  test("⑦ C07 真实执行前置：真实 MagicAI/gpt-5.5 部署能力 ⊇ C07 激活合同 requiredCapabilities 且解析成功", async () => {
    const c07 = await prisma.componentcatalog.findUnique({ where: { id: "C07" }, select: { activeContractId: true } });
    assert.ok(c07?.activeContractId, "C07 必须存在激活合同");
    const ac = await prisma.componentcontract.findUnique({
      where: { id: c07!.activeContractId! },
      select: { lifecycle: true, contract: true },
    });
    assert.equal(ac?.lifecycle, "PUBLISHED", "C07 激活合同必须为 PUBLISHED");
    const cj: any = ac?.contract;
    const steps: any[] = cj?.executionPlan?.steps || [];
    const reqCaps: string[] = Array.from(new Set(steps.flatMap((s) => (s.requiredCapabilities || []) as string[])));
    assert.deepEqual(reqCaps, ["TEXT_GENERATION"], "C07 当前仅要求 TEXT_GENERATION");

    const dep = await prisma.modeldeployment.findFirstOrThrow({
      where: { providerId: "MagicAI", modelId: "gpt-5.5" },
      select: { id: true, providerId: true, modelId: true, upstreamModel: true, enabled: true, capabilities: true },
    });
    const declared = Array.isArray(dep.capabilities) ? (dep.capabilities as unknown[]).map(String) : [];
    assert.ok(reqCaps.every((c) => declared.includes(c)), "真实部署必须声明 C07 所需全部能力");

    // 能力门禁必须放行 C07：解析时若仅因运行期缺密钥（MODEL_NOT_CONFIGURED）而失败，
    // 属部署 apiKeyEnv 配置范畴，不在能力门禁范围；但绝不能是 MODEL_CAPABILITY_NOT_SUPPORTED。
    try {
      const plan = await resolveModelExecutionPlan({
        contractProviderId: "MagicAI",
        contractModelId: "gpt-5.5",
        workspaceId: WS,
        requiredCapabilities: reqCaps,
      });
      assert.equal(plan.source, "DATABASE");
      assert.equal(plan.providerId, "MagicAI");
      assert.equal(plan.modelId, "gpt-5.5");
      assert.equal(plan.upstreamModelId, "gpt-5.5");
    } catch (e) {
      assert.notEqual(
        codeOf(e),
        "MODEL_CAPABILITY_NOT_SUPPORTED",
        "C07 能力门禁不得拒绝；若失败只能因运行期密钥未配置（MODEL_NOT_CONFIGURED）",
      );
    }
  });
});
