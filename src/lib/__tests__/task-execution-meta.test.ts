import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { extractTaskExecutionMeta, EXEC_META_CUTOFF_ISO } from "../task-execution-meta";

describe("extractTaskExecutionMeta 真实/模拟/未知状态透传", () => {
  test("REAL_MODEL 完整元数据：提取 provider/model/usage/billingMode/artifacts/contractVersion", () => {
    const m = extractTaskExecutionMeta(
      {
        executionMode: "REAL_MODEL",
        tokenCost: 100,
        billingMode: "ESTIMATED_COMPATIBILITY",
        estimatedPoints: 100,
        actualPoints: null,
        providerId: "MagicAI",
        modelId: "gpt-5.5",
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3,
        contractVersion: "v1",
      },
      {
        executionMode: "REAL_MODEL",
        provider: { id: "MagicAI", modelId: "gpt-5.5" },
        usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
        artifacts: [{ type: "document" }],
        contractVersion: "v1",
      },
    );
    assert.equal(m.executionMode, "REAL_MODEL");
    assert.equal(m.anomaly, null);
    assert.equal(m.provider?.id, "MagicAI");
    assert.equal(m.usage?.totalTokens, 3);
    assert.equal(m.billingMode, "ESTIMATED_COMPATIBILITY");
    assert.equal(m.estimatedPoints, 100);
    assert.equal(m.contractVersion, "v1");
  });

  test("SIMULATED：无 provider/usage，billingMode=SIMULATED", () => {
    const m = extractTaskExecutionMeta(
      { executionMode: "SIMULATED", tokenCost: 10 },
      { executionMode: "SIMULATED", outputData: {} },
    );
    assert.equal(m.executionMode, "SIMULATED");
    assert.equal(m.anomaly, null);
    assert.equal(m.provider, null);
    assert.equal(m.billingMode, "SIMULATED");
  });

  test("缺失 executionMode → UNKNOWN（不得默认为 SIMULATED），标记 EXECUTION_META_MISSING", () => {
    const m = extractTaskExecutionMeta({ tokenCost: 5 }, {});
    assert.equal(m.executionMode, "UNKNOWN");
    assert.equal(m.metaMissing, true);
    assert.equal(m.anomaly, "EXECUTION_META_MISSING");
    assert.notEqual(m.executionMode, "SIMULATED");
  });

  test("REAL_MODEL 但缺 provider/usage/contractVersion → 标记数据异常", () => {
    const m = extractTaskExecutionMeta({ executionMode: "REAL_MODEL", tokenCost: 100 }, { executionMode: "REAL_MODEL" });
    assert.equal(m.executionMode, "REAL_MODEL");
    assert.equal(m.anomaly, "REAL_MODEL_META_INCOMPLETE");
  });

  test("旧历史任务（早于元数据引入时间）缺失元数据 → legacy=true", () => {
    const before = new Date(new Date(EXEC_META_CUTOFF_ISO).getTime() - 86400000).toISOString();
    const m = extractTaskExecutionMeta({}, {}, before);
    assert.equal(m.executionMode, "UNKNOWN");
    assert.equal(m.legacy, true);
  });

  test("合同快照直接结构能准确派生提示，标记 hasContractSnapshot=true", () => {
    const directContract = {
      componentId: "C15",
      contractVersion: "1.0.0",
      output: {
        kind: "JSON",
        structureConstraints: {
          schemaDefinition: {
            type: "object",
            properties: {
              cacheKey: { type: "string" },
              ttlSeconds: { type: "integer", minimum: 1 },
            },
          },
        },
      },
    };
    const m = extractTaskExecutionMeta(
      { executionMode: "REAL_MODEL", contractVersion: "1.0.0", contractSnapshot: directContract },
      { executionMode: "REAL_MODEL" }
    );
    assert.equal(m.hasContractSnapshot, true);
    assert.ok(m.qualityHints.some((h) => h.includes("未经实际压测")));
    assert.equal(m.contractVersion, "1.0.0");
  });

  test("{ contract: {...} } 包装结构能准确派生提示，标记 hasContractSnapshot=true", () => {
    const wrappedSnapshot = {
      snapshotId: "snap-123",
      snapshotCreatedAt: "2026-09-24T00:00:00.000Z",
      contract: {
        componentId: "C13",
        contractVersion: "2.1.0",
        output: {
          kind: "DOCUMENT",
          structureConstraints: {
            requiredProperties: ["code", "ddl"],
          },
        },
      },
    };
    const m = extractTaskExecutionMeta(
      { executionMode: "REAL_MODEL", contractVersion: "2.1.0", contractSnapshot: wrappedSnapshot },
      { executionMode: "REAL_MODEL" }
    );
    assert.equal(m.hasContractSnapshot, true);
    assert.ok(m.qualityHints.some((h) => h.includes("未经目标工程编译")));
    assert.equal(m.contractVersion, "2.1.0");
  });

  test("快照缺失返回空提示，标记 hasContractSnapshot=false（绝不回填目录提示）", () => {
    const m = extractTaskExecutionMeta(
      { executionMode: "REAL_MODEL", contractVersion: "1.0.0" },
      { executionMode: "REAL_MODEL" }
    );
    assert.equal(m.hasContractSnapshot, false);
    assert.deepEqual(m.qualityHints, []);
    assert.equal(m.contractVersion, "1.0.0");
  });

  test("快照损坏（缺少 contract 本体或类型非法）不会冒充有效快照", () => {
    // 损坏快照 1: 缺少 output
    const corrupted1 = { snapshotId: "invalid-snap-1", notAContract: true };
    const m1 = extractTaskExecutionMeta(
      { executionMode: "REAL_MODEL", contractSnapshot: corrupted1 },
      { executionMode: "REAL_MODEL" }
    );
    assert.equal(m1.hasContractSnapshot, false);
    assert.deepEqual(m1.qualityHints, []);

    // 损坏快照 2: 包装结构但 contract 值为非法字符串
    const corrupted2 = { snapshotId: "invalid-snap-2", contract: "malformed" };
    const m2 = extractTaskExecutionMeta(
      { executionMode: "REAL_MODEL", contractSnapshot: corrupted2 },
      { executionMode: "REAL_MODEL" }
    );
    assert.equal(m2.hasContractSnapshot, false);
    assert.deepEqual(m2.qualityHints, []);
  });

  test("旧历史任务不使用当前目录提示，快照缺失时提示严格为空", () => {
    const beforeCutoff = new Date(new Date(EXEC_META_CUTOFF_ISO).getTime() - 86400000).toISOString();
    const m = extractTaskExecutionMeta(
      { componentId: "C15", tokenCost: 10 },
      { outputData: {} },
      beforeCutoff
    );
    assert.equal(m.legacy, true);
    assert.equal(m.hasContractSnapshot, false);
    assert.deepEqual(m.qualityHints, []);
  });

  test("版本一致性校验：任务版本与快照版本一致时保留，冲突时置为 null 且记录 anomaly", () => {
    const snapshot = {
      contract: {
        componentId: "C14",
        contractVersion: "1.0.0",
        output: { kind: "JSON" },
      },
    };
    const baseConfig = {
      executionMode: "REAL_MODEL",
      providerId: "MagicAI",
      modelId: "gpt-5.5",
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
    };
    // 1. 冲突情形：任务记录为 "2.0.0"，快照为 "1.0.0"
    const mismatch = extractTaskExecutionMeta(
      { ...baseConfig, contractVersion: "2.0.0", contractSnapshot: snapshot },
      { executionMode: "REAL_MODEL" }
    );
    assert.equal(mismatch.contractVersion, null, "版本冲突时不得作为可信版本展示");
    assert.equal(mismatch.anomaly, "CONTRACT_VERSION_MISMATCH");

    // 2. 一致情形：任务记录与快照均为 "1.0.0"
    const match = extractTaskExecutionMeta(
      { ...baseConfig, contractVersion: "1.0.0", contractSnapshot: snapshot },
      { executionMode: "REAL_MODEL" }
    );
    assert.equal(match.contractVersion, "1.0.0", "版本一致时可信展示");
    assert.equal(match.anomaly, null);
  });
});


