import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  extractTaskExecutionMeta,
  extractTaskListExecutionMeta,
} from "@/lib/task-execution-meta";
import {
  serializeTaskDetailItem,
  serializeTaskListItem,
} from "@/lib/task-query-helpers";

describe("MODEL-SELECT-E2: 模型来源标注与执行元数据收尾增强测试套件", () => {
  const dummyRefundMeta = {
    refundStatus: "NO_CHARGE" as const,
    refundedPoints: null,
    chargeAttempted: true,
  };

  test("1. 显式指定 deploymentId 时，extractTaskExecutionMeta 判定 isExplicitDeployment 为 true", () => {
    const configWithDeployment = {
      executionMode: "REAL_MODEL",
      deploymentId: "dep-deepseek-flash",
      contractVersion: "1.0.0",
      providerId: "SiliconFlow",
      modelId: "DeepSeek-V3",
    };
    const result = {
      provider: { id: "SiliconFlow", modelId: "DeepSeek-V3" },
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
      artifacts: [],
    };

    const meta = extractTaskExecutionMeta(configWithDeployment, result);
    assert.equal(meta.isExplicitDeployment, true, "指定了 deploymentId 时必须判定为 true");
    assert.equal(meta.model, "DeepSeek-V3");
  });

  test("2. 未指定 deploymentId 或传 auto 时，判定 isExplicitDeployment 为 false", () => {
    const configAuto = {
      executionMode: "REAL_MODEL",
      deploymentId: "auto",
      contractVersion: "1.0.0",
    };
    const configNone = {
      executionMode: "REAL_MODEL",
      contractVersion: "1.0.0",
    };
    const result = {
      provider: { id: "SiliconFlow", modelId: "DeepSeek-V3" },
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    };

    const metaAuto = extractTaskExecutionMeta(configAuto, result);
    assert.equal(metaAuto.isExplicitDeployment, false, "deploymentId 为 auto 时必须为 false");

    const metaNone = extractTaskExecutionMeta(configNone, result);
    assert.equal(metaNone.isExplicitDeployment, false, "未传 deploymentId 时必须为 false");
  });

  test("3. extractTaskListExecutionMeta 列表脱敏元数据完整继承 isExplicitDeployment 布尔值", () => {
    const configExplicit = {
      executionMode: "REAL_MODEL",
      deploymentId: "dep-deepseek-v3",
    };
    const listMeta = extractTaskListExecutionMeta(configExplicit, {});
    assert.equal(listMeta.isExplicitDeployment, true);

    const configDefault = {
      executionMode: "REAL_MODEL",
    };
    const listMetaDefault = extractTaskListExecutionMeta(configDefault, {});
    assert.equal(listMetaDefault.isExplicitDeployment, false);
  });

  test("4. serializeTaskDetailItem 详情 DTO 包含 execution.isExplicitDeployment", () => {
    const mockTask = {
      id: "task-test-e2-1",
      name: "C07 接口契约生成",
      type: "C07",
      status: "SUCCESS",
      createdAt: new Date(),
      tenantId: "ws-test",
      config: {
        executionMode: "REAL_MODEL",
        deploymentId: "dep-deepseek-flash",
        contractSnapshot: {
          contractVersion: "1.0.0",
          output: { kind: "DOCUMENT" },
        },
      },
      result: {
        provider: { id: "SiliconFlow", modelId: "deepseek-ai/DeepSeek-V3" },
        usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
        artifacts: [{ type: "DOCUMENT", title: "契约文档", content: "契约内容" }],
      },
    };

    const detailDto = serializeTaskDetailItem(mockTask, "接口契约生成", dummyRefundMeta);
    assert.equal(detailDto.execution.isExplicitDeployment, true, "详情 DTO 的 execution 必须携带 isExplicitDeployment: true");
    assert.equal(detailDto.execution.model, "deepseek-ai/DeepSeek-V3");
  });

  test("5. serializeTaskListItem 列表 DTO 包含 execution.isExplicitDeployment", () => {
    const mockTask = {
      id: "task-test-e2-2",
      name: "C01 招标文件解析",
      type: "C01",
      status: "SUCCESS",
      createdAt: new Date(),
      tenantId: "ws-test",
      config: {
        executionMode: "REAL_MODEL",
        contractSnapshot: {
          contractVersion: "1.0.0",
          output: { kind: "DOCUMENT" },
        },
      },
      result: {
        provider: { id: "Aliyun", modelId: "qwen-max" },
        usage: { inputTokens: 50, outputTokens: 100, totalTokens: 150 },
      },
    };

    const listDto = serializeTaskListItem(
      mockTask,
      { name: "测试空间", type: "PERSONAL" },
      "招标文件解析",
      dummyRefundMeta,
    );
    assert.equal(listDto.execution.isExplicitDeployment, false, "未指定部署时列表 DTO 必须为 false");
    assert.equal(listDto.execution.model, "qwen-max");
  });
});
