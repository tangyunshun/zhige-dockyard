import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import { ContractValidationError } from "../component-execution-profile";
import { resolveModelExecutionPlan } from "../model-registry";

/**
 * 架构回归：生产路径**不存在**环境变量兜底。
 * 即使 MODEL_PROVIDER_ID / MODEL_ID / MODEL_BASE_URL 与合同完全一致，
 * 只要未在数据库模型注册表注册，就必须返回 MODEL_NOT_ALLOWED。
 */
describe("模型注册收口：未注册模型不得靠环境变量执行", { skip: !process.env.DATABASE_URL }, () => {
  test("环境变量与合同一致但未注册 → MODEL_NOT_ALLOWED", async () => {
    const providerId = "env_only_provider_" + randomUUID();
    const modelId = "env_only_model_" + randomUUID();

    const prev = {
      provider: process.env.MODEL_PROVIDER_ID,
      model: process.env.MODEL_ID,
      base: process.env.MODEL_BASE_URL,
      key: process.env.MODEL_API_KEY,
    };
    process.env.MODEL_PROVIDER_ID = providerId;
    process.env.MODEL_ID = modelId;
    process.env.MODEL_BASE_URL = "https://api.example.com/v1";
    process.env.MODEL_API_KEY = "sk-env-only";

    try {
      await assert.rejects(
        () =>
          resolveModelExecutionPlan({
            contractProviderId: providerId,
            contractModelId: modelId,
            workspaceId: "ws_env_only_" + randomUUID(),
          }),
        (e: unknown) =>
          e instanceof ContractValidationError &&
          e.code === "MODEL_NOT_ALLOWED" &&
          e.status === 403,
        "未注册模型即使环境变量一致也必须拒绝",
      );
    } finally {
      if (prev.provider === undefined) delete process.env.MODEL_PROVIDER_ID;
      else process.env.MODEL_PROVIDER_ID = prev.provider;
      if (prev.model === undefined) delete process.env.MODEL_ID;
      else process.env.MODEL_ID = prev.model;
      if (prev.base === undefined) delete process.env.MODEL_BASE_URL;
      else process.env.MODEL_BASE_URL = prev.base;
      if (prev.key === undefined) delete process.env.MODEL_API_KEY;
      else process.env.MODEL_API_KEY = prev.key;
    }
  });
});
