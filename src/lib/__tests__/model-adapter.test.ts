import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { ModelAdapterError } from "../model-adapter";
// 环境变量形态的入口已隔离为测试专用模块，生产路径不得引用
import {
  readRealModelEnv,
  getRealModelAdapter,
  resetModelAdapterCache,
} from "../model-adapter-env-compat";

function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

function mockFetch(status: number, body: unknown) {
  (globalThis as any).fetch = async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
}

describe("model-adapter", () => {
  beforeEach(() => {
    resetModelAdapterCache();
    setEnv({
      MODEL_PROVIDER_ID: "openai-compatible",
      MODEL_BASE_URL: "https://1.1.1.1/v1",
      MODEL_API_KEY: "sk-test-123",
      MODEL_ID: "gpt-4o-mini",
    });
  });

  afterEach(() => {
    (globalThis as any).fetch = undefined;
  });

  test("缺失环境变量时返回 MODEL_NOT_CONFIGURED (503)", () => {
    setEnv({ MODEL_API_KEY: undefined, MODEL_ID: undefined });
    assert.throws(
      () => readRealModelEnv(),
      (err: unknown) => {
        const e = err as ModelAdapterError;
        return e instanceof ModelAdapterError && e.code === "MODEL_NOT_CONFIGURED" && e.status === 503;
      },
    );
  });

  test("环境变量完整时返回配置", () => {
    const env = readRealModelEnv();
    assert.equal(env.providerId, "openai-compatible");
    assert.equal(env.modelId, "gpt-4o-mini");
    assert.equal(env.apiKey, "sk-test-123");
  });

  test("401 映射为 MODEL_AUTH_ERROR", async () => {
    mockFetch(401, "");
    const adapter = getRealModelAdapter();
    await assert.rejects(
      () => adapter.execute({ providerId: "p", modelId: "m", userPrompt: "hi" }),
      (err: unknown) => {
        const e = err as ModelAdapterError;
        return e instanceof ModelAdapterError && e.code === "MODEL_AUTH_ERROR" && e.status === 401;
      },
    );
  });

  test("429 映射为 MODEL_RATE_LIMITED", async () => {
    mockFetch(429, "");
    const adapter = getRealModelAdapter();
    await assert.rejects(
      () => adapter.execute({ providerId: "p", modelId: "m", userPrompt: "hi" }),
      (err: unknown) => {
        const e = err as ModelAdapterError;
        return e instanceof ModelAdapterError && e.code === "MODEL_RATE_LIMITED" && e.status === 429;
      },
    );
  });

  test("5xx 映射为 MODEL_UPSTREAM_ERROR", async () => {
    mockFetch(500, "");
    const adapter = getRealModelAdapter();
    await assert.rejects(
      () => adapter.execute({ providerId: "p", modelId: "m", userPrompt: "hi" }),
      (err: unknown) => {
        const e = err as ModelAdapterError;
        return e instanceof ModelAdapterError && e.code === "MODEL_UPSTREAM_ERROR" && e.status === 502;
      },
    );
  });

  test("成功返回文本，usage 缺失时标记为 null", async () => {
    mockFetch(200, {
      id: "req-1",
      choices: [{ message: { content: "这是 PRD 内容" } }],
    });
    const adapter = getRealModelAdapter();
    const res = await adapter.execute({ providerId: "p", modelId: "m", userPrompt: "会议纪要" });
    assert.equal(res.text, "这是 PRD 内容");
    assert.equal(res.providerRequestId, "req-1");
    assert.equal(res.usage.inputTokens, null);
    assert.equal(res.usage.outputTokens, null);
    assert.equal(res.usage.totalTokens, null);
  });

  test("成功返回文本，usage 存在时读取真实 Token", async () => {
    mockFetch(200, {
      id: "req-2",
      choices: [{ message: { content: "内容" } }],
      usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 },
    });
    const adapter = getRealModelAdapter();
    const res = await adapter.execute({ providerId: "p", modelId: "m", userPrompt: "x" });
    assert.equal(res.usage.inputTokens, 120);
    assert.equal(res.usage.outputTokens, 45);
    assert.equal(res.usage.totalTokens, 165);
  });

  test("空响应内容映射为 MODEL_UPSTREAM_ERROR", async () => {
    mockFetch(200, { choices: [{ message: { content: "" } }] });
    const adapter = getRealModelAdapter();
    await assert.rejects(
      () => adapter.execute({ providerId: "p", modelId: "m", userPrompt: "x" }),
      (err: unknown) => (err as ModelAdapterError).code === "MODEL_UPSTREAM_ERROR",
    );
  });
});
