import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "net";
import { randomUUID } from "crypto";
import { prisma } from "../prisma";
import { resolveModelExecutionPlan } from "../model-registry";
import { createModelAdapter, ModelAdapterError } from "../model-adapter";
import { buildRegistryPricingSnapshot } from "../model-pricing";

/**
 * ⚠️ 重要说明：本测试使用的是**本地 mock HTTP 供应商**（自建 Node HTTP 服务），
 * 仅用于验证「数据库注册表 → 策略裁决 → 适配器构造 → 真实 HTTP 请求 → 记录元数据与价格快照」
 * 的完整链路，**不得作为真实外部模型验收结论**。
 *
 * 覆盖点：
 *  - 必须经过数据库 provider/deployment 策略；
 *  - 请求体必须使用 deployment.upstreamModel；
 *  - 任务元数据记录平台内 providerId/modelId；
 *  - 保存注册表价格快照；
 *  - 模型失败时抛出明确的适配器错误（退款闭环由 refund-recovery 测试覆盖）。
 */
const MOCK_KEY_ENV = "MODEL_CHAIN_MOCK_KEY";
const MOCK_UPSTREAM = "mock-upstream-model-v1";

let server: http.Server;
let port = 0;
let failMode = false;
const received: { model?: string; auth?: string } = {};

function startMockServer(): Promise<void> {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body || "{}");
        received.model = parsed?.model;
        received.auth = String(req.headers.authorization || "");
      } catch {
        // ignore
      }
      if (failMode) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "mock upstream failure" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "chatcmpl-mock",
          choices: [{ message: { content: "MOCK_MODEL_OUTPUT_TEXT" } }],
          usage: { prompt_tokens: 11, output_tokens: 22, total_tokens: 33 },
        }),
      );
    });
  });
  return new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      port = (server.address() as AddressInfo).port;
      resolve();
    });
  });
}

after(() => {
  try {
    server?.close();
  } catch {
    // ignore
  }
  delete process.env.MODEL_ALLOW_INSECURE_LOCAL;
  delete process.env[MOCK_KEY_ENV];
});

describe("Phase 1 真实调用链路（本地 mock 供应商，非真实外部模型）", { skip: !process.env.DATABASE_URL }, () => {
  test("经数据库策略 → 构造适配器 → 发起真实 HTTP → 记录元数据与价格快照", async () => {
    process.env.MODEL_ALLOW_INSECURE_LOCAL = "true"; // 仅测试环境允许回环 http
    process.env[MOCK_KEY_ENV] = "sk-mock-local";
    await startMockServer();

    const providerName = "mp_chain_" + randomUUID();
    const modelKey = "md_chain_" + randomUUID();
    const ws = "ws_chain_" + randomUUID();
    try {
      await prisma.modelprovider.create({
        data: {
          id: randomUUID(),
          name: providerName,
          protocol: "OPENAI_COMPATIBLE",
          baseUrl: `http://127.0.0.1:${port}/v1`,
          apiKeyEnv: MOCK_KEY_ENV,
          enabled: true,
        },
      });
      const dep = await prisma.modeldeployment.create({
        data: {
          id: randomUUID(),
          providerId: providerName,
          modelId: modelKey,
          upstreamModel: MOCK_UPSTREAM,
          contextLimit: 32000,
          enabled: true,
        },
      });

      // 1. 数据库策略解析
      const plan = await resolveModelExecutionPlan({
        contractProviderId: providerName,
        contractModelId: modelKey,
        workspaceId: ws,
      });
      assert.equal(plan.source, "DATABASE");
      assert.equal(plan.deploymentId, dep.id);
      assert.equal(plan.upstreamModelId, MOCK_UPSTREAM);
      assert.equal(plan.pricing, null, "价格唯一真源为 modelpricing（未配置时为 null）");

      // 2. 真实 HTTP 调用（本地 mock）
      const adapter = await createModelAdapter(plan);
      const result = await adapter.execute({
        providerId: plan.providerId,
        modelId: plan.upstreamModelId,
        userPrompt: "请生成 PRD 骨架",
      });

      // 3. 请求必须使用 deployment.upstreamModel，且密钥来自环境变量
      assert.equal(received.model, MOCK_UPSTREAM, "请求必须使用部署配置的上游模型名");
      assert.equal(received.auth, "Bearer sk-mock-local", "密钥来自环境变量，不入库");
      assert.equal(result.text, "MOCK_MODEL_OUTPUT_TEXT");
      assert.equal(result.usage.totalTokens, 33);

      // 4. 任务元数据记录平台内 providerId/modelId
      assert.equal(result.providerId, providerName);

      // 5. 价格快照来自 modelpricing（未配置 → UNCONFIGURED，不得臆造价格）
      const snapshot = buildRegistryPricingSnapshot({
        providerId: plan.providerId,
        modelId: plan.modelId,
        pricing: plan.pricing,
      });
      assert.equal(snapshot.pricingSource, "MODEL_REGISTRY");
      assert.equal(snapshot.supplierCostStatus, "UNCONFIGURED");
      assert.equal(snapshot.userPriceStatus, "UNCONFIGURED");
      assert.equal(snapshot.userPrice.inputMicrosPerMillion, null, "未配置价格必须是 null，不得臆造");
      assert.equal(snapshot.billingMode, "ESTIMATED_COMPATIBILITY");
      assert.equal(snapshot.settlementEnabled, false);

      // 6. 模型失败 → 明确错误（退款恢复闭环见 refund-recovery 集成测试）
      failMode = true;
      await assert.rejects(
        () =>
          adapter.execute({
            providerId: plan.providerId,
            modelId: plan.upstreamModelId,
            userPrompt: "触发失败",
          }),
        (e: unknown) => e instanceof ModelAdapterError && e.code === "MODEL_UPSTREAM_ERROR",
      );
    } finally {
      failMode = false;
      await prisma.modeldeployment.deleteMany({ where: { providerId: providerName } }).catch(() => {});
      await prisma.modelprovider.deleteMany({ where: { name: providerName } }).catch(() => {});
    }
  });
});
