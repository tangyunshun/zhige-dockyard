import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validateModelBaseUrl,
  validateModelBaseUrlForRequest,
  isSupportedModelProtocol,
} from "../model-endpoint";
import { createModelAdapter, ModelAdapterError } from "../model-adapter";

describe("模型服务 Base URL 防 SSRF 校验", () => {
  test("正常 https 地址允许", () => {
    const r = validateModelBaseUrl("https://api.example.com/v1");
    assert.equal(r.ok, true);
  });

  test("本机 / 回环 / 私网 / 链路本地 / 元数据地址一律拒绝", () => {
    const blocked = [
      "https://localhost/v1",
      "https://127.0.0.1/v1",
      "https://127.0.0.1:8080/v1",
      "https://169.254.169.254/latest/meta-data",
      "https://10.0.0.5/v1",
      "https://172.16.0.1/v1",
      "https://192.168.1.1/v1",
      "https://[::1]/v1",
      "https://metadata.google.internal/v1",
      "https://[::ffff:127.0.0.1]/v1",
      "https://[::ffff:10.0.0.1]/v1",
      "https://[::ffff:169.254.169.254]/v1",
    ];
    for (const url of blocked) {
      const r = validateModelBaseUrl(url);
      assert.equal(r.ok, false, `应拒绝：${url}`);
    }
  });

  test("域名解析到内网地址时，连接前校验拒绝", async () => {
    const r = await validateModelBaseUrlForRequest("https://127.0.0.1.nip.io/v1");
    assert.equal(r.ok, false);
  });

  test("非 https（http）默认拒绝", () => {
    assert.equal(validateModelBaseUrl("http://api.example.com/v1").ok, false);
  });

  test("测试开关开启时允许本地/私网 http（含回环与私网段，便于 Ollama/vLLM 等自托管模型联调）", () => {
    process.env.MODEL_ALLOW_INSECURE_LOCAL = "true";
    try {
      assert.equal(validateModelBaseUrl("http://127.0.0.1:9911/v1").ok, true);
      assert.equal(validateModelBaseUrl("http://localhost:11434/v1").ok, true);
      assert.equal(validateModelBaseUrl("http://10.0.0.5/v1").ok, true, "测试模式允许私网地址（自托管模型）");
      assert.equal(validateModelBaseUrl("http://192.168.1.100:8000/v1").ok, true, "测试模式允许私网地址（自托管模型）");
      // 公网 http 仍强制拒绝
      assert.equal(validateModelBaseUrl("http://api.example.com/v1").ok, false, "公网 http 仍应拒绝");
      // 云元数据地址始终拒绝
      assert.equal(validateModelBaseUrl("http://169.254.169.254/latest/meta-data").ok, false, "云元数据地址始终拒绝");
    } finally {
      delete process.env.MODEL_ALLOW_INSECURE_LOCAL;
    }
  });

  test("携带凭据或非法格式的地址拒绝", () => {
    assert.equal(validateModelBaseUrl("https://user:pwd@api.example.com/v1").ok, false);
    assert.equal(validateModelBaseUrl("not-a-url").ok, false);
    assert.equal(validateModelBaseUrl("").ok, false);
  });
});

describe("协议与适配器创建校验", () => {
  test("仅 OPENAI_COMPATIBLE 受支持", () => {
    assert.equal(isSupportedModelProtocol("OPENAI_COMPATIBLE"), true);
    assert.equal(isSupportedModelProtocol("openai_compatible"), true);
    assert.equal(isSupportedModelProtocol("ANTHROPIC"), false);
    assert.equal(isSupportedModelProtocol(""), false);
  });

  test("未知协议创建适配器 → MODEL_PROTOCOL_UNSUPPORTED，不得静默当作 OpenAI 兼容", async () => {
    await assert.rejects(
      () =>
        createModelAdapter({
          providerId: "p",
          modelId: "m",
          upstreamModelId: "m",
          baseUrl: "https://1.1.1.1/v1",
          apiKey: "sk-test",
          protocol: "ANTHROPIC",
        }),
      (e: unknown) => e instanceof ModelAdapterError && e.code === "MODEL_PROTOCOL_UNSUPPORTED",
    );
  });

  test("不安全的 Base URL 创建适配器 → MODEL_ENDPOINT_BLOCKED", async () => {
    await assert.rejects(
      () =>
        createModelAdapter({
          providerId: "p",
          modelId: "m",
          upstreamModelId: "m",
          baseUrl: "https://169.254.169.254/v1",
          apiKey: "sk-test",
          protocol: "OPENAI_COMPATIBLE",
        }),
      (e: unknown) => e instanceof ModelAdapterError && e.code === "MODEL_ENDPOINT_BLOCKED",
    );
  });

  test("合法协议与地址 → 创建成功", async () => {
    const adapter = await createModelAdapter({
      providerId: "p",
      modelId: "m",
      upstreamModelId: "m-upstream",
      baseUrl: "https://1.1.1.1/v1",
      apiKey: "sk-test",
      protocol: "OPENAI_COMPATIBLE",
    });
    assert.equal(adapter.providerId, "p");
    assert.equal(adapter.modelId, "m-upstream");
  });
});
