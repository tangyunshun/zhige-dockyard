/**
 * 任务查询与契约视图领域纯辅助函数全面单元测试 (CORE-3-R3)
 *
 * 遵循原则：
 * 1. 严格测试真实生产导出的函数（serializeTaskListItem, deriveCatalogContractView, buildTaskWorkspacePermissionFilter, extractTaskListExecutionMeta）；
 * 2. 验证任务列表响应数据最小化与安全脱敏红线；
 * 3. 验证合同安全视图统一性。
 */

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  serializeTaskListItem,
  deriveCatalogContractView,
  buildTaskWorkspacePermissionFilter,
} from "@/lib/task-query-helpers";
import { extractTaskListExecutionMeta, extractTaskExecutionMeta } from "@/lib/task-execution-meta";
import type { ComponentContract } from "@/lib/component-contract/types";

describe("任务列表安全序列化与数据最小化守卫 (serializeTaskListItem & extractTaskListExecutionMeta)", () => {
  const mockTask = {
    id: "task-test-001",
    name: "C01 招标文件解析测试",
    type: "C01",
    status: "SUCCESS",
    createdAt: "2026-09-24T12:00:00.000Z",
    tenantId: "ws-auth-100",
    config: {
      contractVersion: "1.0.0",
      inputMaterial: "【机密招标材料正文】包含客户内部商务条款与敏感核心代码",
      prompt: "你是一名资深评标专家，请严格审查...",
      providerId: "platform-qwen",
      modelId: "qwen-max",
      apiKey: "sk-secret-key-must-never-leak",
      baseURL: "https://api.internal.corp/v1",
      tokenCost: 15,
      actualPoints: 15,
      billingMode: "REAL_SETTLEMENT_ELIGIBLE",
      // 不可变合同快照（版本与 contractVersion 一致，用于验证“已验证版本”路径）
      contractSnapshot: { output: { kind: "DOCUMENT" }, contractVersion: "1.0.0" },
    },
    result: {
      contractVersion: "1.0.0",
      executionMode: "REAL_MODEL",
      summary: "成功提取招标文件关键要素",
      outputData: "# 评标分析报告\n\n已成功解析合规与偏离要素...",
      provider: {
        id: "platform-qwen",
        modelId: "qwen-max",
        secret: "super-secret-do-not-leak",
      },
      usage: {
        inputTokens: 1200,
        outputTokens: 450,
        totalTokens: 1650,
      },
      artifacts: [
        {
          id: "art-1",
          kind: "DOCUMENT",
          content: "【完整成果物大文本内容】",
          storagePath: "/storage/arts/art-1.md",
        },
      ],
      internalStack: "Error at internal/worker.ts:42",
    },
  };

  const wsInfo = { name: "主干研发空间", type: "TEAM" };
  const refundMeta = {
    refundStatus: "NO_CHARGE" as const,
    refundedPoints: null,
    chargeAttempted: false,
  };

  test("1. 列表响应绝对不包含 inputMaterial / 原始材料", () => {
    const serialized = serializeTaskListItem(mockTask, wsInfo, "招标文件解析", refundMeta);
    assert.equal((serialized as any).inputMaterial, undefined);
    assert.equal((serialized as any).config, undefined);
    assert.equal(JSON.stringify(serialized).includes("机密招标材料正文"), false);
  });

  test("2. 列表响应绝对不包含完整 artifacts 或 artifact.content", () => {
    const serialized = serializeTaskListItem(mockTask, wsInfo, "招标文件解析", refundMeta);
    assert.equal((serialized as any).artifacts, undefined);
    assert.equal((serialized as any).artifact, undefined);
    assert.equal((serialized.execution as any).artifacts, undefined);
    assert.equal(JSON.stringify(serialized).includes("完整成果物大文本内容"), false);
  });

  test("3. 列表响应绝对不包含内部 prompt 与内部错误堆栈", () => {
    const serialized = serializeTaskListItem(mockTask, wsInfo, "招标文件解析", refundMeta);
    assert.equal((serialized as any).prompt, undefined);
    assert.equal(JSON.stringify(serialized).includes("你是一名资深评标专家"), false);
    assert.equal(JSON.stringify(serialized).includes("internalStack"), false);
  });

  test("4. 列表响应绝对不包含 provider 密钥或 baseURL", () => {
    const serialized = serializeTaskListItem(mockTask, wsInfo, "招标文件解析", refundMeta);
    assert.equal(JSON.stringify(serialized).includes("sk-secret-key-must-never-leak"), false);
    assert.equal(JSON.stringify(serialized).includes("super-secret-do-not-leak"), false);
    assert.equal(JSON.stringify(serialized).includes("https://api.internal.corp"), false);
    // 列表的 provider 仅为安全字符串标识
    assert.equal(serialized.execution.provider, "platform-qwen");
  });

  test("5. 列表响应正确包含合同版本、执行模式、Token 统计与明确退款状态", () => {
    const serialized = serializeTaskListItem(mockTask, wsInfo, "招标文件解析", refundMeta);
    assert.equal(serialized.contractVersion, "1.0.0");
    assert.equal(serialized.execution.contractVersion, "1.0.0");
    assert.equal(serialized.execution.executionMode, "REAL_MODEL");
    assert.equal(serialized.refundStatus, "NO_CHARGE");
    assert.equal(serialized.execution.usage?.totalTokens, 1650);
    assert.equal(serialized.execution.model, "qwen-max");
  });

  test("6. 独立验证 extractTaskListExecutionMeta 与 extractTaskExecutionMeta 的职责拆分", () => {
    const listMeta = extractTaskListExecutionMeta(mockTask.config, mockTask.result, mockTask.createdAt);
    const detailMeta = extractTaskExecutionMeta(mockTask.config, mockTask.result, mockTask.createdAt);

    // 列表元数据严禁包含 artifacts
    assert.equal((listMeta as any).artifacts, undefined);
    // 详情元数据可携带安全 artifacts 容器（供详情按需过滤）
    assert.ok(Array.isArray(detailMeta.artifacts));

    // 列表 provider 为字符串标识，详情 provider 为结构对象
    assert.equal(typeof listMeta.provider, "string");
    assert.equal(typeof detailMeta.provider, "object");
  });

  test("7. 列表顶层 contractVersion 不得采信 config/result 裸合同版本：无不可变合同快照时必须为 null", () => {
    const noSnapshotTask = {
      ...mockTask,
      config: { ...mockTask.config, contractSnapshot: undefined, contractVersion: "FAKE-9.9.9" },
      result: { ...mockTask.result, contractVersion: "FAKE-9.9.9" },
    };
    const serialized = serializeTaskListItem(noSnapshotTask as any, wsInfo, "招标文件解析", refundMeta);
    assert.equal(serialized.contractVersion, null, "无合同快照时不得采信 config/result 裸版本");
    assert.equal(serialized.execution.hasContractSnapshot, false);
  });

  test("8. 合同快照版本与 config 裸版本冲突时，列表 contractVersion 必须为 null（不采信任一）", () => {
    const mismatchTask = {
      ...mockTask,
      config: {
        ...mockTask.config,
        contractVersion: "FAKE-9.9.9",
        contractSnapshot: { output: { kind: "DOCUMENT" }, contractVersion: "1.0.0" },
      },
    };
    const serialized = serializeTaskListItem(mismatchTask as any, wsInfo, "招标文件解析", refundMeta);
    assert.equal(serialized.contractVersion, null, "快照与 config 版本冲突时不得采信");
  });
});

describe("目录合同安全视图纯函数测试 (deriveCatalogContractView)", () => {
  const sampleContract: ComponentContract = {
    componentId: "C01",
    contractVersion: "1.0.0",
    lifecycle: "PUBLISHED",
    publishedAt: "2026-09-20T00:00:00Z",
    publishedBy: "system",
    input: {
      kind: "FILE",
      fileConstraints: {
        required: true,
        maxCount: 1,
        acceptedMimes: [".pdf", ".docx"],
        maxSingleFileBytes: 10485760,
        maxTotalBytes: 10485760,
      },
    },
    materialPipeline: { steps: [] },
    executionPlan: {
      steps: [
        {
          stepId: "s1",
          name: "分析",
          promptTemplateVersion: "v1",
          promptTemplate: "prompt text",
          inputMapping: {},
          outputKey: "out",
          contextBudgetTokens: 4096,
          maxOutputTokens: 2048,
          timeoutMs: 30000,
          requiredCapabilities: ["TEXT_GENERATION"],
        },
      ],
    },
    output: {
      kind: "DOCUMENT",
      artifactMime: "text/markdown",
      schemaVersion: "1.0",
      rendererType: "MARKDOWN_DOCUMENT",
      previewable: true,
      downloadable: true,
    },
    qualityPolicy: {
      allowAutoRetry: false,
      requireHumanReview: true,
      disclaimerPolicy: {
        required: true,
        template: "本报告由 AI 自动生成，仅供参考，不作为最终法律依据。",
      },
    },
    billingPolicy: {
      mode: "ESTIMATED_COMPATIBILITY",
    },
  };

  test("1. deriveCatalogContractView 正确派生 disclaimer 字段", () => {
    const view = deriveCatalogContractView(sampleContract, ["必须包含偏离分析"]);
    assert.ok(view);
    assert.equal(view.disclaimer, "本报告由 AI 自动生成，仅供参考，不作为最终法律依据。");
    assert.equal(view.requireHumanReview, true);
    assert.equal(view.outputKind, "DOCUMENT");
    assert.equal(view.rendererType, "MARKDOWN_DOCUMENT");
    assert.deepEqual(view.qualityHints, ["必须包含偏离分析"]);
  });

  test("2. 合同无 disclaimerPolicy 时，disclaimer 明确为 null 而非抛错或默认兜底", () => {
    const contractWithoutDisclaimer = {
      ...sampleContract,
      qualityPolicy: {
        allowAutoRetry: false,
        requireHumanReview: false,
      },
    };
    const view = deriveCatalogContractView(contractWithoutDisclaimer);
    assert.ok(view);
    assert.equal(view.disclaimer, null);
  });
});

describe("工作空间任务权限构建过滤条件 (buildTaskWorkspacePermissionFilter)", () => {
  test("1. 严禁信任未授权的 lastWorkspaceId 候选", () => {
    const validIds = ["ws-1", "ws-2"];
    const untrustedCandidate = "ws-hacker-999";
    const filter = buildTaskWorkspacePermissionFilter(validIds, untrustedCandidate);

    assert.deepEqual(filter.tenantId.in.sort(), ["ws-1", "ws-2"].sort());
    assert.equal(filter.tenantId.in.includes("ws-hacker-999"), false);
  });

  test("2. 仅当候选工作空间确实在有效列表中时才纳入", () => {
    const validIds = ["ws-1", "ws-2"];
    const legitimateCandidate = "ws-2";
    const filter = buildTaskWorkspacePermissionFilter(validIds, legitimateCandidate);

    assert.ok(filter.tenantId.in.includes("ws-2"));
  });
});
