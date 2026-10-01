/**
 * CORE-3-R3：任务详情合同视图与安全 DTO 收口测试
 *
 * 全部测试真实生产导出的函数与实际源码序列化约束：
 *  - 不调用真实模型、不创建真实任务、不写库、不写账务；
 *  - 不使用 mock 成功结果冒充详情验证。
 */

import { describe, test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  deriveTaskContractView,
  serializeTaskDetailItem,
  extractSafeTaskError,
} from "@/lib/task-query-helpers";
import { deriveRefundStatus } from "@/lib/refund-status";
import { mapDefaultCatalogRecordsToIds } from "@/lib/workspaceInit";

const ROUTE_SRC = readFileSync("src/app/api/studio/route.ts", "utf8");

/** 带完整 disclaimerPolicy 的有效历史快照 */
const VALID_SNAPSHOT = {
  contract: {
    componentId: "C07",
    contractVersion: "1.0.0",
    lifecycle: "PUBLISHED",
    publishedAt: null,
    publishedBy: null,
    input: { kind: "TEXT", textConstraints: { required: true, minLength: 20, maxLength: 20000 } },
    materialPipeline: { steps: [] },
    executionPlan: { steps: [] },
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
        marker: "AI 生成需求规格草案",
        template: "本结果为 AI 生成的需求规格草案，需经产品、业务和研发人员确认。",
      },
    },
    billingPolicy: { mode: "ESTIMATED_COMPATIBILITY" },
  },
};

describe("deriveTaskContractView：历史合同安全视图", () => {
  test("1. 有效快照返回 outputKind / artifactMime / rendererType / contractVersion", () => {
    const view = deriveTaskContractView(VALID_SNAPSHOT, ["提示 A"]);
    assert.ok(view, "有效快照必须返回安全视图");
    assert.equal(view!.outputKind, "DOCUMENT");
    assert.equal(view!.artifactMime, "text/markdown");
    assert.equal(view!.rendererType, "MARKDOWN_DOCUMENT");
    assert.equal(view!.contractVersion, "1.0.0");
    assert.deepEqual(view!.qualityHints, ["提示 A"]);
    assert.equal(view!.requireHumanReview, true);
  });

  test("2. 有效快照返回 disclaimer（严格取 qualityPolicy.disclaimerPolicy.template）", () => {
    const view = deriveTaskContractView(VALID_SNAPSHOT, []);
    assert.equal(view!.disclaimer, "本结果为 AI 生成的需求规格草案，需经产品、业务和研发人员确认。");
  });

  test("3. 快照无 disclaimerPolicy 时 disclaimer 为 null（不做 marker 兜底）", () => {
    const noDisclaimer = {
      contract: {
        ...(VALID_SNAPSHOT.contract as Record<string, unknown>),
        qualityPolicy: { allowAutoRetry: false, requireHumanReview: false },
      },
    };
    const view = deriveTaskContractView(noDisclaimer, []);
    assert.ok(view);
    assert.strictEqual(view!.disclaimer, null);
  });

  test("4. 无效快照（null / 空对象 / 字符串 / 无合同体）一律返回 contractView: null", () => {
    for (const invalid of [null, undefined, {}, "not-an-object", 123, { contract: null }, []]) {
      assert.strictEqual(deriveTaskContractView(invalid, []), null, `无效快照 ${String(invalid)} 必须返回 null`);
    }
  });

  test("5. 不按 componentId 补写业务标签：视图字段全部来自快照本身", () => {
    const view = deriveTaskContractView(VALID_SNAPSHOT, []);
    const serialized = JSON.stringify(view);
    assert.ok(!serialized.includes("componentId"), "安全视图严禁携带 componentId");
    assert.equal(view!.outputKind, "DOCUMENT", "C07 快照声明 DOCUMENT，不得猜测为其它类型");
  });
});

describe("退款事实：chargeAttempted 三态", () => {
  test("6. 缺少账务事实时 chargeAttempted 严格为 null（不得推断为已扣费/未扣费）", () => {
    const meta = deriveRefundStatus({ taskId: "t1", hasConsumeLedger: false });
    assert.equal(meta.refundStatus, "UNKNOWN");
    assert.strictEqual(meta.chargeAttempted, null);
  });

  test("7. 存在退款流水时由账务事实决定：REFUNDED 且 chargeAttempted=true", () => {
    const meta = deriveRefundStatus({
      taskId: "t2",
      hasConsumeLedger: true,
      refundLedgerPoints: 100,
    });
    assert.equal(meta.refundStatus, "REFUNDED");
    assert.equal(meta.chargeAttempted, true);
  });

  test("8. 有扣费流水但无退款证据时必须是 UNKNOWN，不得显示为已退款", () => {
    const meta = deriveRefundStatus({ taskId: "t3", hasConsumeLedger: true });
    assert.equal(meta.refundStatus, "UNKNOWN");
    assert.notEqual(meta.refundStatus, "REFUNDED");
  });
});

describe("serializeTaskDetailItem：真实详情安全 DTO 序列化行为", () => {
  test("9. 白名单字段严格限制为 21 个，execution 严禁包含 artifacts/prompt/apiKey/堆栈", () => {
    const sampleTask = {
      id: "task-001",
      name: "测试任务",
      type: "C01",
      status: "SUCCESS",
      createdAt: new Date("2026-09-01T10:00:00Z"),
      tenantId: "ws-123",
      config: {
        prompt: "内部系统提示词",
        apiKey: "sk-secret-key-12345",
        baseURL: "https://api.internal.com",
        headers: { Authorization: "Bearer xxx" },
        contractSnapshot: VALID_SNAPSHOT,
      },
      result: {
        executionMode: "REAL_MODEL",
        provider: { id: "openai", modelId: "gpt-4o" },
        usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
        artifacts: [{ type: "DOCUMENT", title: "需求规范", content: "# 标题内容" }],
      },
    };

    const dto = serializeTaskDetailItem(sampleTask, "招标文件解析", {
      refundStatus: "UNKNOWN",
      refundedPoints: null,
      chargeAttempted: null,
    });

    const expectedKeys = [
      "id", "name", "componentId", "componentName", "status", "createdAt",
      "workspaceId", "execution", "contractVersion", "hasContractSnapshot",
      "contractView", "qualityHints", "refundStatus", "refundedPoints",
      "chargeAttempted", "errorCode", "errorMessage", "outputData",
      "artifacts", "artifact", "hasArtifact",
    ];

    assert.deepEqual(Object.keys(dto).sort(), expectedKeys.sort(), "DTO 顶层字段必须与白名单严格一致");
    const execKeys = Object.keys(dto.execution);
    assert.strictEqual(execKeys.includes("artifacts"), false, "execution 绝不能包含 artifacts");
    assert.strictEqual(execKeys.includes("config"), false, "execution 绝不能包含 config");
    assert.strictEqual(execKeys.includes("prompt"), false, "execution 绝不能包含 prompt");
    assert.strictEqual(execKeys.includes("apiKey"), false, "execution 绝不能包含 apiKey");

    const execJson = JSON.stringify(dto.execution);
    assert.ok(!execJson.includes("sk-secret"), "execution 绝不能泄露密钥");
    assert.ok(!execJson.includes("内部系统提示词"), "execution 绝不能泄露 Prompt");
  });

  test("10. 失败任务：artifacts 为空数组，artifact 为 null，outputData 不透传原始数据", () => {
    const failedTask = {
      id: "task-failed-001",
      name: "失败测试",
      type: "C02",
      status: "FAILED",
      createdAt: new Date("2026-09-01T11:00:00Z"),
      tenantId: "ws-123",
      config: { prompt: "私密提示词" },
      result: {
        error: "模型调用超时中断",
        stack: "Error: connect ECONNREFUSED at line 999",
        rawOutput: "不合法的模型原始流式数据",
        artifacts: [{ type: "DOCUMENT", content: "部分产物" }],
        outputData: { error: "内部堆栈信息", rawResponse: { code: 504 } },
      },
    };

    const dto = serializeTaskDetailItem(failedTask, "安全合规体检", {
      refundStatus: "NO_CHARGE",
      refundedPoints: 0,
      chargeAttempted: false,
    });

    assert.equal(dto.status, "FAILED");
    assert.deepEqual(dto.artifacts, [], "失败任务 artifacts 必须为空数组");
    assert.strictEqual(dto.artifact, null, "失败任务 artifact 必须为 null");
    assert.strictEqual(dto.hasArtifact, false);
    assert.strictEqual(dto.outputData, null, "失败任务 outputData 不得透传原始模型输出");
    assert.equal(dto.errorMessage, "模型调用超时中断");
    assert.ok(!JSON.stringify(dto).includes("ECONNREFUSED"), "失败任务 DTO 不得返回内部调用堆栈");
    assert.ok(!JSON.stringify(dto).includes("rawResponse"), "不得返回原始供应商响应");
  });

  test("11. 成功任务：递归安全过滤深度嵌套键与数组，无法确认安全结构时设为 null 且不可预览/下载", () => {
    const successTask = {
      id: "task-success-002",
      name: "成功任务",
      type: "C07",
      status: "SUCCESS",
      createdAt: new Date("2026-09-01T12:00:00Z"),
      tenantId: "ws-123",
      config: { contractSnapshot: VALID_SNAPSHOT },
      result: {
        artifacts: [
          {
            type: "DOCUMENT",
            title: "报告",
            mimeType: "text/markdown",
            rendererType: "MARKDOWN_DOCUMENT",
            content: "## 需求规格分析",
            previewable: true,
            downloadable: true,
          },
          {
            type: "DOCUMENT",
            title: "含有敏感Token值的文档",
            mimeType: "text/markdown",
            rendererType: "MARKDOWN_DOCUMENT",
            content: "报告正常内容，但携带了 Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxx 凭证",
            previewable: true,
            downloadable: true,
          },
        ],
      },
    };

    const dto = serializeTaskDetailItem(successTask, "会议纪要转需求", {
      refundStatus: "UNKNOWN",
      refundedPoints: null,
      chargeAttempted: null,
    });

    assert.equal(dto.status, "SUCCESS");
    assert.equal(dto.artifacts.length, 2);
    // 第一项为纯净字符串，保留
    assert.equal(dto.artifacts[0].content, "## 需求规格分析");
    assert.equal(dto.artifacts[0].previewable, true);
    // 第二项包含 Bearer 敏感特征，content 自动置为 null，previewable/downloadable 为 false
    assert.strictEqual(dto.artifacts[1].content, null);
    assert.strictEqual(dto.artifacts[1].previewable, false);
    assert.strictEqual(dto.artifacts[1].downloadable, false);
  });

  test("11b. 结构化成果物：递归剔除嵌套对象与数组中的 apiKey/storagePath/prompt 变体", () => {
    const structuredSnapshot = {
      contract: {
        ...VALID_SNAPSHOT.contract,
        output: {
          kind: "JSON",
          schemaVersion: "1.0",
          previewable: true,
          downloadable: true,
        },
      },
    };

    const taskWithNested = {
      id: "task-nested-003",
      name: "结构化测试",
      type: "C11",
      status: "SUCCESS",
      createdAt: new Date("2026-09-01T12:00:00Z"),
      tenantId: "ws-123",
      config: { contractSnapshot: structuredSnapshot },
      result: {
        artifacts: [
          {
            type: "JSON",
            content: {
              safeField: "合法数据",
              deepMeta: {
                apiKey: "sk-secret-nested",
                storagePath: "/vol/app/path",
                validInner: "保留的内部字段",
              },
              deepArray: [
                { id: "1", prompt: "敏感Prompt", label: "项1" },
                { id: "2", Authorization: "敏感Auth", label: "项2" },
              ],
            },
          },
          {
            type: "JSON",
            content: {
              apiKey: "sk-all-sensitive",
              secret: "top-secret",
              password: "pwd",
            },
          },
        ],
      },
    };

    const dto = serializeTaskDetailItem(taskWithNested, "原型图设计", {
      refundStatus: "UNKNOWN",
      refundedPoints: null,
      chargeAttempted: null,
    });

    assert.equal(dto.status, "SUCCESS");
    const art0 = dto.artifacts[0].content as Record<string, unknown>;
    assert.ok(art0);
    assert.equal(art0.safeField, "合法数据");
    const deepMeta = art0.deepMeta as Record<string, unknown>;
    assert.strictEqual(deepMeta.apiKey, undefined);
    assert.strictEqual(deepMeta.storagePath, undefined);
    assert.equal(deepMeta.validInner, "保留的内部字段");

    const deepArr = art0.deepArray as Array<Record<string, unknown>>;
    assert.equal(deepArr[0].label, "项1");
    assert.strictEqual(deepArr[0].prompt, undefined);
    assert.equal(deepArr[1].label, "项2");
    assert.strictEqual(deepArr[1].Authorization, undefined);

    // 第二项全部由敏感键组成：判为不安全，content=null 且 previewable/downloadable=false
    assert.strictEqual(dto.artifacts[1].content, null);
    assert.strictEqual(dto.artifacts[1].previewable, false);
    assert.strictEqual(dto.artifacts[1].downloadable, false);
  });

  test("11c. 快照缺失或未知 outputKind 时 fail closed，不伪造成果物", () => {
    const unknownKindTask = {
      id: "task-unknown-kind",
      name: "未知合同类型任务",
      type: "CXX",
      status: "SUCCESS",
      createdAt: new Date("2026-09-01T12:00:00Z"),
      tenantId: "ws-123",
      // 无快照
      result: {
        artifacts: [{ type: "DOCUMENT", content: "冒充产物" }],
        outputData: "冒充原始输出",
      },
    };

    const dto = serializeTaskDetailItem(unknownKindTask, "未知组件", {
      refundStatus: "UNKNOWN",
      refundedPoints: null,
      chargeAttempted: null,
    });

    assert.equal(dto.status, "SUCCESS");
    assert.deepEqual(dto.artifacts, [], "无有效快照时 artifacts 必须 fail-closed 为空数组");
    assert.strictEqual(dto.artifact, null);
    assert.strictEqual(dto.hasArtifact, false);
    assert.strictEqual(dto.outputData, null, "无有效快照时 outputData 不得透传");
  });

  test("12. extractSafeTaskError：提取优先级稳定（顶层优先）且清洗堆栈与敏感关键词", () => {
    // 优先级：error > message > outputData.error > outputData.message
    const e1 = extractSafeTaskError({ error: "顶层错误", message: "次要信息" });
    assert.equal(e1.errorMessage, "顶层错误");

    const e2 = extractSafeTaskError({ message: "顶层提示", outputData: { error: "嵌套错误" } });
    assert.equal(e2.errorMessage, "顶层提示");

    const e3 = extractSafeTaskError({ outputData: { error: "嵌套错误内容", message: "嵌套消息" } });
    assert.equal(e3.errorMessage, "嵌套错误内容");

    const e4 = extractSafeTaskError({ outputData: { message: "仅有嵌套消息" } });
    assert.equal(e4.errorMessage, "仅有嵌套消息");

    // 含有 stack / 堆栈的错误信息被安全降级，不泄露调用栈
    const e5 = extractSafeTaskError({ error: "Error: fail\n    at Object.<anonymous> (/app/src/index.ts:12:34)" });
    assert.equal(e5.errorMessage, "任务执行未通过质量守卫，详情已记录安全日志");

    // 含有内部 prompt / 密钥的错误信息被安全降级
    const e6 = extractSafeTaskError({ error: "调用失败: sk-1234567890abcdef123456" });
    assert.equal(e6.errorMessage, "任务执行未通过质量守卫，详情已记录安全日志");
  });
});

describe("serializeTaskDetailItem：严格合同兼容校验（artifact.type / mime / renderer 与历史合同 fail-closed）", () => {
  const okRefund = { refundStatus: "UNKNOWN" as const, refundedPoints: null, chargeAttempted: null };

  test("A. artifact.type 缺失时不得用合同 output.kind 掩盖，成果物 fail-closed 不计入", () => {
    const dto = serializeTaskDetailItem(
      {
        id: "t-a", name: "缺 type", type: "C07", status: "SUCCESS",
        createdAt: new Date("2026-09-01T12:00:00Z"), tenantId: "ws-1",
        config: { contractSnapshot: VALID_SNAPSHOT },
        result: { artifacts: [{ title: "无 type 冒充", mimeType: "text/markdown", rendererType: "MARKDOWN_DOCUMENT", content: "正文" }] },
      },
      "纪要", okRefund,
    );
    assert.deepEqual(dto.artifacts, [], "缺失 artifact.type 必须 fail-closed，不计入成果物");
    assert.strictEqual(dto.hasArtifact, false);
  });

  test("B. artifact.type 未知（与合同 output.kind 不符）fail-closed", () => {
    const dto = serializeTaskDetailItem(
      {
        id: "t-b", name: "错 type", type: "C07", status: "SUCCESS",
        createdAt: new Date("2026-09-01T12:00:00Z"), tenantId: "ws-1",
        config: { contractSnapshot: VALID_SNAPSHOT },
        result: { artifacts: [{ type: "TABLE", mimeType: "text/markdown", rendererType: "MARKDOWN_DOCUMENT", content: "x" }] },
      },
      "纪要", okRefund,
    );
    assert.deepEqual(dto.artifacts, [], "未知 artifact.type 必须 fail-closed");
  });

  test("C. artifact.type 大小写归一化匹配（document === DOCUMENT）通过", () => {
    const dto = serializeTaskDetailItem(
      {
        id: "t-c", name: "小写", type: "C07", status: "SUCCESS",
        createdAt: new Date("2026-09-01T12:00:00Z"), tenantId: "ws-1",
        config: { contractSnapshot: VALID_SNAPSHOT },
        result: { artifacts: [{ type: "document", mimeType: "text/markdown", rendererType: "MARKDOWN_DOCUMENT", content: "# 小写匹配" }] },
      },
      "纪要", okRefund,
    );
    assert.equal(dto.artifacts.length, 1, "大小写归一化后 type 应匹配");
    assert.equal(dto.artifacts[0].content, "# 小写匹配");
  });

  test("D. 合同声明 artifactMime 但 artifact.mimeType 缺失时 fail-closed", () => {
    const dto = serializeTaskDetailItem(
      {
        id: "t-d", name: "缺 mime", type: "C07", status: "SUCCESS",
        createdAt: new Date("2026-09-01T12:00:00Z"), tenantId: "ws-1",
        config: { contractSnapshot: VALID_SNAPSHOT },
        result: { artifacts: [{ type: "DOCUMENT", rendererType: "MARKDOWN_DOCUMENT", content: "正文" }] },
      },
      "纪要", okRefund,
    );
    assert.deepEqual(dto.artifacts, [], "缺失 mimeType 必须 fail-closed");
  });

  test("E. 合同声明 artifactMime 但 artifact.mimeType 不匹配时 fail-closed", () => {
    const dto = serializeTaskDetailItem(
      {
        id: "t-e", name: "错 mime", type: "C07", status: "SUCCESS",
        createdAt: new Date("2026-09-01T12:00:00Z"), tenantId: "ws-1",
        config: { contractSnapshot: VALID_SNAPSHOT },
        result: { artifacts: [{ type: "DOCUMENT", mimeType: "text/html", rendererType: "MARKDOWN_DOCUMENT", content: "正文" }] },
      },
      "纪要", okRefund,
    );
    assert.deepEqual(dto.artifacts, [], "mimeType 不匹配必须 fail-closed");
  });

  test("F. 合同声明 rendererType 但 artifact.rendererType 缺失时 fail-closed", () => {
    const dto = serializeTaskDetailItem(
      {
        id: "t-f", name: "缺 renderer", type: "C07", status: "SUCCESS",
        createdAt: new Date("2026-09-01T12:00:00Z"), tenantId: "ws-1",
        config: { contractSnapshot: VALID_SNAPSHOT },
        result: { artifacts: [{ type: "DOCUMENT", mimeType: "text/markdown", content: "正文" }] },
      },
      "纪要", okRefund,
    );
    assert.deepEqual(dto.artifacts, [], "缺失 rendererType 必须 fail-closed");
  });

  test("G. 合同声明 rendererType 但 artifact.rendererType 不匹配时 fail-closed", () => {
    const dto = serializeTaskDetailItem(
      {
        id: "t-g", name: "错 renderer", type: "C07", status: "SUCCESS",
        createdAt: new Date("2026-09-01T12:00:00Z"), tenantId: "ws-1",
        config: { contractSnapshot: VALID_SNAPSHOT },
        result: { artifacts: [{ type: "DOCUMENT", mimeType: "text/markdown", rendererType: "TABLE_VIEW", content: "正文" }] },
      },
      "纪要", okRefund,
    );
    assert.deepEqual(dto.artifacts, [], "rendererType 不匹配必须 fail-closed");
  });

  test("H. DOCUMENT content 为空字符串时内容被清空且不可预览/下载（fail-closed）", () => {
    const dto = serializeTaskDetailItem(
      {
        id: "t-h", name: "空文档", type: "C07", status: "SUCCESS",
        createdAt: new Date("2026-09-01T12:00:00Z"), tenantId: "ws-1",
        config: { contractSnapshot: VALID_SNAPSHOT },
        result: { artifacts: [{ type: "DOCUMENT", mimeType: "text/markdown", rendererType: "MARKDOWN_DOCUMENT", content: "   " }] },
      },
      "纪要", okRefund,
    );
    assert.equal(dto.artifacts.length, 1, "空 DOCUMENT 条目保留但内容必须 fail-closed");
    assert.strictEqual(dto.artifacts[0].content, null, "空字符串 DOCUMENT content 必须为 null");
    assert.strictEqual(dto.artifacts[0].previewable, false);
    assert.strictEqual(dto.artifacts[0].downloadable, false);
  });

  test("I. 仅 type 匹配（合同未声明 mime）时 artifact 可保留且 mimeType 不得回退填充", () => {
    const noMimeSnapshot = {
      contract: {
        ...VALID_SNAPSHOT.contract,
        output: { kind: "DOCUMENT", schemaVersion: "1.0", rendererType: "MARKDOWN_DOCUMENT", previewable: true, downloadable: true },
      },
    };
    const dto = serializeTaskDetailItem(
      {
        id: "t-i", name: "仅 type 匹配", type: "C07", status: "SUCCESS",
        createdAt: new Date("2026-09-01T12:00:00Z"), tenantId: "ws-1",
        config: { contractSnapshot: noMimeSnapshot },
        result: { artifacts: [{ type: "DOCUMENT", rendererType: "MARKDOWN_DOCUMENT", content: "安全正文" }] },
      },
      "纪要", okRefund,
    );
    assert.equal(dto.artifacts.length, 1);
    assert.equal(dto.artifacts[0].content, "安全正文");
    assert.equal(dto.artifacts[0].previewable, true);
    assert.equal(dto.artifacts[0].downloadable, true);
    assert.strictEqual(dto.artifacts[0].mimeType, null, "未声明合同 artifactMime 时 artifact.mimeType 不得回退填充");
  });

  test("J. 无合法 contractSnapshot 时严格 fail-closed，不猜测 DOCUMENT/PRD/TABLE/JSON", () => {
    const dto = serializeTaskDetailItem(
      {
        id: "t-j", name: "无快照", type: "C07", status: "SUCCESS",
        createdAt: new Date("2026-09-01T12:00:00Z"), tenantId: "ws-1",
        result: { artifacts: [{ type: "DOCUMENT", content: "冒充" }], outputData: "冒充原始" },
      },
      "纪要", okRefund,
    );
    assert.strictEqual(dto.contractView, null);
    assert.deepEqual(dto.artifacts, []);
    assert.strictEqual(dto.artifact, null);
    assert.strictEqual(dto.hasArtifact, false);
    assert.strictEqual(dto.outputData, null);
  });
});

describe("mapDefaultCatalogRecordsToIds：默认组件数据源纯函数与装配收口", () => {
  test("13. 仅保留 isDefault=true 且 isPublished=true 的组件，去重并修剪空白", () => {
    const sampleRecords = [
      { id: "C01", isDefault: true, isPublished: true },
      { id: " c01 ", isDefault: true, isPublished: true }, // 重复项
      { id: "C02", isDefault: true, isPublished: false }, // 未发布
      { id: "C07", isDefault: false, isPublished: true }, // 非默认
      { id: "C11", isDefault: true, isPublished: true },
      { id: "C12", isDefault: true, isPublished: true },
      { id: "", isDefault: true, isPublished: true }, // 空ID
    ];

    const result = mapDefaultCatalogRecordsToIds(sampleRecords);
    assert.deepEqual(result, ["C01", "C11", "C12"]);
  });

  test("13b. 缺少已批准默认数据源时抛出稳定错误码 DEFAULT_COMPONENT_SOURCE_MISSING", () => {
    const emptyRecords: Array<{ id: string; isDefault?: boolean | null; isPublished?: boolean | null }> = [
      { id: "C01", isDefault: false, isPublished: true },
      { id: "C02", isDefault: true, isPublished: false },
    ];
    const ids = mapDefaultCatalogRecordsToIds(emptyRecords);
    assert.strictEqual(ids.length, 0);
  });

  test("14. route.ts 已消除硬编码默认组件数组，且调用 getDefaultCatalogComponentIds", () => {
    assert.ok(
      !ROUTE_SRC.includes('["C01", "C02", "C07", "C11", "C12"]'),
      "route.ts 严禁出现 [\"C01\", \"C02\", \"C07\", \"C11\", \"C12\"] 硬编码数组",
    );
    assert.ok(
      ROUTE_SRC.includes("getDefaultCatalogComponentIds()"),
      "route.ts 必须调用 getDefaultCatalogComponentIds() 从数据库读取默认组件",
    );
  });

  test("15. route.ts 的 task_detail 分支已统一调用 serializeTaskDetailItem 生产函数", () => {
    assert.ok(
      ROUTE_SRC.includes("serializeTaskDetailItem(task,"),
      "route.ts 必须调用 serializeTaskDetailItem 生产纯函数实现任务详情 DTO 序列化",
    );
  });

  test("16. route.ts 全局严禁出现 chargeAttempted 兜底或推断式（缺失必须为 null）", () => {
    // 仅禁止「未知即取 true」的兜底/推断写法（?? true / || true / === false ? false : true）。
    // 分支内显式且事实成立的 chargeAttempted: true（成功路径已扣点、幂等未知但已存在 CONSUME 流水）
    // 属账务事实赋值，不属兜底推断，不在此禁令范围内（与「缺失必须为 null」意图一致）。
    assert.ok(
      !/chargeAttempted\s*:[^,\n]*\?\?\s*true/.test(ROUTE_SRC) &&
        !/chargeAttempted\s*:[^,\n]*\|\|\s*true/.test(ROUTE_SRC),
      "route.ts 严禁出现 chargeAttempted 兜底推断为 true（缺失必须为 null）",
    );
    assert.ok(
      !/chargeAttempted\s*===\s*false\s*\?\s*false\s*:\s*true/.test(ROUTE_SRC),
      "严禁 chargeAttempted === false ? false : true 推断式",
    );
  });
});
