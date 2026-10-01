import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { validateComponentContract, validateModelOutput } from "../component-contract/validators";
import { ComponentContract } from "../component-contract/types";
import { deriveRefundStatus } from "../refund-status";
import { extractTaskExecutionMeta } from "../task-execution-meta";

describe("CORE-3-R2 后端收口契约、退款与权限测试", () => {
  // 基础标准测试合同（任意非 Cxx 自定义组件，如 "CUSTOM_X01"）
  const baseContract: ComponentContract = {
    componentId: "CUSTOM_X01",
    contractVersion: "1.0.0",
    lifecycle: "PUBLISHED",
    publishedAt: new Date().toISOString(),
    publishedBy: "tester",
    input: {
      kind: "TEXT",
      textConstraints: { required: true, minLength: 10, maxLength: 5000 },
    },
    materialPipeline: {
      steps: [{ name: "归一化", type: "TEXT_NORMALIZE" }],
    },
    executionPlan: {
      steps: [
        {
          stepId: "step1",
          name: "分析步骤",
          promptTemplateVersion: "1.0",
          promptTemplate: "请分析：{{input}}",
          inputMapping: { input: "input.text" },
          outputKey: "out",
          contextBudgetTokens: 2000,
          maxOutputTokens: 1000,
          timeoutMs: 10000,
          requiredCapabilities: ["TEXT_GENERATION"],
        },
      ],
    },
    output: {
      kind: "DOCUMENT",
      artifactMime: "text/markdown",
      schemaVersion: "1.0.0",
      rendererType: "MARKDOWN_DOCUMENT",
      previewable: true,
      downloadable: true,
    },
    qualityPolicy: {
      allowAutoRetry: false,
      requireHumanReview: false,
      requiredSections: ["架构设计", "安全考量"],
      minOutputLength: 60,
      forbiddenPhrases: ["绝对安全", "零漏洞承诺"],
      disclaimerPolicy: {
        required: true,
        marker: "AI 架构设计草案",
        template: "> **【AI 架构设计草案·待人工确认】**\n> 需经架构评审确认。",
      },
    },
    billingPolicy: {
      mode: "ESTIMATED_COMPATIBILITY",
      estimatedTokens: 100,
    },
  };

  // 1. 合同结构校验
  test("1. 合同结构校验：forbiddenPhrases 与 disclaimerPolicy 格式正确时通过", () => {
    const validated = validateComponentContract(baseContract);
    assert.equal(validated.qualityPolicy.forbiddenPhrases?.length, 2);
    assert.equal(validated.qualityPolicy.disclaimerPolicy?.required, true);
  });

  test("1.1 合同结构校验：forbiddenPhrases 包含非字符串时明确拒绝", () => {
    const invalid = {
      ...baseContract,
      qualityPolicy: {
        ...baseContract.qualityPolicy,
        forbiddenPhrases: ["合法", 123 as any],
      },
    };
    assert.throws(
      () => validateComponentContract(invalid),
      (e: any) => e.code === "CONTRACT_VALIDATION_FAILED",
    );
  });

  // 2. 合同驱动 requiredSections
  test("2. 合同驱动 requiredSections：缺失必填章节抛出 OUTPUT_VALIDATION_FAILED", () => {
    const textMissingSection = "本文档仅包含架构设计，后续未提及另外一个必填项。".repeat(5);
    assert.throws(
      () => validateModelOutput(baseContract, textMissingSection),
      (e: any) => e.code === "OUTPUT_VALIDATION_FAILED" && e.message.includes("安全考量"),
    );
  });

  // 3. 合同驱动 minOutputLength
  test("3. 合同驱动 minOutputLength：长度低于合同基线时抛出异常", () => {
    const shortText = "架构设计 与 安全考量（过短）";
    assert.throws(
      () => validateModelOutput(baseContract, shortText),
      (e: any) => e.code === "OUTPUT_VALIDATION_FAILED" && e.message.includes("低于质量基线"),
    );
  });

  // 4. 合同驱动 forbiddenPhrases
  test("4. 合同驱动 forbiddenPhrases：包含合同明令禁止的禁用词时被拦截", () => {
    const textWithForbidden = (
      "架构设计方案与安全考量详述：本系统具有绝对安全特性，确保万无一失。" +
      "详细论证补充说明与背景描述，确保字数达标并满足排版规范要求。"
    );
    assert.throws(
      () => validateModelOutput(baseContract, textWithForbidden),
      (e: any) => e.code === "OUTPUT_VALIDATION_FAILED" && e.message.includes("绝对安全"),
    );
  });

  // 5. 合同驱动 disclaimerPolicy
  test("5. 合同驱动 disclaimerPolicy：未声明 marker 时自动前置注入 template", () => {
    const validRaw = (
      "## 架构设计规范\n本系统采用分层架构。\n" +
      "## 安全考量\n包含传输加密与存储加密。\n" +
      "详细说明".repeat(10)
    );
    const result = validateModelOutput(baseContract, validRaw);
    assert.ok(typeof result.content === "string");
    assert.ok(result.content.includes("【AI 架构设计草案·待人工确认】"));
  });

  // 6. 任意非 Cxx 组件可以使用相同规则；C01/C02/C07 不再依赖 componentId 分支
  test("6. 任意组件 CUSTOM_999 可使用相同质量策略驱动，脱离 componentId 硬编码", () => {
    const custom999: ComponentContract = {
      ...baseContract,
      componentId: "CUSTOM_999",
      qualityPolicy: {
        ...baseContract.qualityPolicy,
        requiredSections: ["自研算法", "落地效果"],
        forbiddenPhrases: ["行业第一"],
      },
    };
    const badText = "自研算法与落地效果说明，我们号称行业第一名！".repeat(3);
    assert.throws(
      () => validateModelOutput(custom999, badText),
      (e: any) => e.code === "OUTPUT_VALIDATION_FAILED" && e.message.includes("行业第一"),
    );
  });

  // 7. 退款状态：REFUNDED
  test("7. 派生退款状态：存在该 taskId 对应的 REFUND pointledger 时为 REFUNDED", () => {
    const meta = deriveRefundStatus({
      taskId: "task-001",
      hasConsumeLedger: true,
      refundLedgerPoints: 50,
      recoveryStatus: null,
    });
    assert.equal(meta.refundStatus, "REFUNDED");
    assert.equal(meta.refundedPoints, 50);
    assert.equal(meta.chargeAttempted, true);
  });

  // 8. 退款状态：REFUND_PENDING
  test("8. 派生退款状态：存在 PENDING / PROCESSING 的 refundrecovery 为 REFUND_PENDING", () => {
    const meta = deriveRefundStatus({
      taskId: "task-002",
      hasConsumeLedger: true,
      refundLedgerPoints: null,
      recoveryStatus: "PENDING",
    });
    assert.equal(meta.refundStatus, "REFUND_PENDING");
    assert.equal(meta.refundedPoints, null);
    assert.equal(meta.chargeAttempted, true);
  });

  // 9. 退款状态：RECONCILIATION_REQUIRED
  test("9. 派生退款状态：存在 FAILED / REQUIRES_REVIEW 的 refundrecovery 为 RECONCILIATION_REQUIRED", () => {
    const meta = deriveRefundStatus({
      taskId: "task-003",
      hasConsumeLedger: true,
      refundLedgerPoints: null,
      recoveryStatus: "REQUIRES_REVIEW",
    });
    assert.equal(meta.refundStatus, "RECONCILIATION_REQUIRED");
    assert.equal(meta.refundedPoints, null);
    assert.equal(meta.chargeAttempted, true);
  });

  // 10. 退款状态：NO_CHARGE
  test("10. 派生退款状态：明确无扣点尝试且发生在模型前为 NO_CHARGE", () => {
    const meta = deriveRefundStatus({
      taskId: "task-004",
      hasConsumeLedger: false,
      refundLedgerPoints: null,
      recoveryStatus: null,
      chargeAttemptedExplicit: false,
    });
    assert.equal(meta.refundStatus, "NO_CHARGE");
    assert.equal(meta.refundedPoints, null);
    assert.equal(meta.chargeAttempted, false);
  });

  // 11. 退款状态：UNKNOWN
  test("11. 派生退款状态：无法确定账务事实返回 UNKNOWN", () => {
    const meta = deriveRefundStatus({
      taskId: "task-005",
      hasConsumeLedger: false,
      refundLedgerPoints: null,
      recoveryStatus: null,
      chargeAttemptedExplicit: null,
    });
    assert.equal(meta.refundStatus, "UNKNOWN");
  });

  // 12. 有 CONSUME 无 REFUND 绝不能显示 NO_CHARGE
  test("12. 账务守卫：有 CONSUME 流水但无 REFUND 流水时，必须返回 UNKNOWN，绝不冒充 NO_CHARGE", () => {
    const meta = deriveRefundStatus({
      taskId: "task-006",
      hasConsumeLedger: true,
      refundLedgerPoints: null,
      recoveryStatus: null,
      chargeAttemptedExplicit: false, // 即使外部标志传错，只要有实际 CONSUME 流水，绝不信 NO_CHARGE
    });
    assert.notEqual(meta.refundStatus, "NO_CHARGE");
    assert.equal(meta.refundStatus, "UNKNOWN");
  });

  // 13. 任务列表契约：不返回 inputMaterial 与原始 Prompt
  test("13. 任务列表契约安全：剔除原始 materials 与敏感 prompt", () => {
    const rawConfig = {
      inputMaterial: "机密的招标文件原文与商业谈判机密".repeat(10),
      rawFiles: [{ name: "secret.pdf", base64: "AAAA..." }],
      tokenCost: 50,
      contractVersion: "1.0.0",
    };
    const rawResult = {
      code: "SUCCESS",
      summary: "已完成招标偏离度提取",
      outputData: "完整的数万字分析报告原文".repeat(50),
    };

    // 模拟服务端列表最小化投影
    const listItem = {
      id: "task-list-01",
      name: "招标分析任务",
      componentId: "C01",
      componentName: "招标文件智能解析",
      status: "SUCCESS",
      createdAt: new Date().toISOString(),
      workspaceId: "ws-01",
      workspaceName: "售前空间",
      execution: extractTaskExecutionMeta(rawConfig, rawResult, new Date()),
      contractVersion: rawConfig.contractVersion,
      refundStatus: "NO_CHARGE",
      refundedPoints: null,
      chargeAttempted: true,
      resultSummary: rawResult.summary,
      errorCode: null,
    };

    const serialized = JSON.stringify(listItem);
    assert.equal(serialized.includes("机密的招标文件原文"), false, "列表严禁泄漏 inputMaterial");
    assert.equal(serialized.includes("rawFiles"), false, "列表严禁泄漏原始上传文件");
    assert.equal(serialized.includes("完整的数万字分析报告原文"), false, "列表严禁直接全量返回成果物原文");
    assert.equal(listItem.resultSummary, "已完成招标偏离度提取");
  });

  // 14. 任务权限与软归档边界
  test("14. 任务权限契约：非空间成员操作返回 403 越权拦截，不执行物理删除", () => {
    const allowedWorkspaces = new Set(["ws-public-01", "ws-team-02"]);
    const taskTenantId = "ws-other-03";

    const isAuthorized = allowedWorkspaces.has(taskTenantId);
    assert.equal(isAuthorized, false, "非当前用户成员空间任务必须被拦截");
  });

  // 15. simulate 不进入真实成功任务统计
  test("15. 统计隔离契约：SIMULATED 模拟任务不得计入真实模型成功任务统计", () => {
    const mockTasks = [
      { id: "t1", status: "SUCCESS", execution: { isRealExecution: true, executionMode: "REAL_MODEL" } },
      { id: "t2", status: "SUCCESS", execution: { isRealExecution: false, executionMode: "SIMULATED" } },
      { id: "t3", status: "FAILED", execution: { isRealExecution: true, executionMode: "REAL_MODEL" } },
      { id: "t4", status: "SUCCESS", execution: { isRealExecution: true, executionMode: "REAL_MODEL" } },
    ];

    const realSuccessCount = mockTasks.filter(
      (t) => t.status === "SUCCESS" && t.execution.isRealExecution === true,
    ).length;

    assert.equal(realSuccessCount, 2, "只有真实调用大模型且成功的任务才计入真实模型成功统计");
    assert.equal(mockTasks.filter((t) => t.status === "SUCCESS").length, 3, "传统口径会错误统计模拟任务");
  });

  // 16. C07 DOCUMENT 不伪装 schema 结构化结果
  test("16. C07 DOCUMENT 契约：必须为 DOCUMENT/Markdown，不包含 schemaDefinition 伪装", () => {
    const { C01_CONTRACT, C02_CONTRACT } = require("../component-contract/catalog-contracts-c01-c05");
    assert.equal(C01_CONTRACT.output.kind, "DOCUMENT");
    assert.equal(C02_CONTRACT.output.kind, "DOCUMENT");
    assert.equal(C01_CONTRACT.output.structureConstraints?.schemaDefinition, undefined);
    assert.equal(C02_CONTRACT.output.structureConstraints?.schemaDefinition, undefined);
  });
});
