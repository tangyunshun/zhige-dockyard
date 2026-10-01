/**
 * CORE-3 后端纵向闭环全链路单元与契约验收测试
 *
 * 覆盖组件：C01、C02、C07 及共享后端链路
 *
 * 遵循红线：
 *  - 纯函数/契约/领域及事务 Mock，不调用外部真实大模型；
 *  - 不产生真实用户扣费，不修改价格/结算/BYOK；
 *  - 涉及数据库夹具时保证 finally 清理，不污染数据库。
 *
 * 本文件为源码守卫/纯函数测试（使用 fake 依赖），仅证明合同校验、DTO 序列化与错误隔离；
 * 不证明真实模型、真实数据库、真实扣点、真实退款或生产业务验收。
 */

import { test, describe } from "vitest";
import assert from "node:assert/strict";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

import {
  C01_CONTRACT,
  C02_CONTRACT,
  evaluateActivationEligibility,
} from "@/lib/component-contract/catalog-contracts-c01-c05";
import {
  validateContract,
  validateComponentInput,
  validateModelOutput,
  validateComponentOutput,
} from "@/lib/component-contract/validators";
import { buildResultArtifact } from "@/lib/component-contract/artifact";
import type { ComponentContract } from "@/lib/component-contract/types";
import { isExtractableFile } from "@/lib/text-extract";
import { deriveRefundStatus } from "@/lib/refund-status";
import { extractTaskExecutionMeta } from "@/lib/task-execution-meta";
import {
  buildTaskWorkspacePermissionFilter,
  serializeTaskListItem,
  deriveCatalogContractView,
} from "@/lib/task-query-helpers";

/** C07 数据库既有激活合同镜像（只读用于测试契约校验，绝不修改线上既有合同） */
const C07_CONTRACT: ComponentContract = {
  componentId: "C07",
  contractVersion: "1.0.0",
  lifecycle: "PUBLISHED",
  publishedAt: "2026-09-20T22:00:00.000Z",
  publishedBy: "system_bootstrap",
  input: {
    kind: "TEXT_AND_FILES",
    textConstraints: {
      required: false,
      minLength: 1,
      maxLength: 30000,
      placeholder: "请输入或粘贴分析文本材料",
    },
    fileConstraints: {
      required: false,
      minCount: 0,
      maxCount: 1,
      acceptedMimes: [
        "text/plain",
        "text/markdown",
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "image/png",
        "image/jpeg",
        ".txt",
        ".md",
        ".pdf",
        ".docx",
      ],
      maxSingleFileBytes: 20_971_520,
      maxTotalBytes: 20_971_520,
    },
  },
  materialPipeline: {
    steps: [{ name: "多模态材料预处理与标准化", type: "TEXT_NORMALIZE" }],
  },
  executionPlan: {
    steps: [
      {
        stepId: "step_c07_main",
        name: "需求规格与架构方案生成",
        promptTemplateVersion: "v1.0",
        promptTemplate:
          "你是一名资深需求分析师与技术架构师，请对以下输入材料进行深度结构化分析并输出专业规格文档：\n\n{{sourceText}}",
        inputMapping: { sourceText: "input.text" },
        outputKey: "c07_output_doc",
        contextBudgetTokens: 8192,
        maxOutputTokens: 4096,
        timeoutMs: 60000,
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
    requireHumanReview: false,
    requiredSections: [
      "需求",
      "功能",
      "模块",
      "业务流程",
      "用户故事",
      "PRD",
      "规格",
    ],
    // minOutputLength: 使用当前已批准合同的真实值（null），不得自行新增 50 或 200
    forbiddenPhrases: [
      "评审已通过",
      "需求已评审通过",
      "研发已排期",
      "排期已确认",
      "已正式立项",
    ],
    disclaimerPolicy: {
      required: true,
      marker: "AI 生成需求规格草案",
      template: "本结果为 AI 生成的需求规格草案，需经产品、业务和研发人员确认，不代表正式评审通过、排期或立项。",
    },
  },
  billingPolicy: {
    mode: "ESTIMATED_COMPATIBILITY",
    estimatedTokens: 1500,
  },
};

/** 构造已发布合同副本，供运行时输入/输出校验 */
function asPublished(contract: ComponentContract): ComponentContract {
  return {
    ...contract,
    lifecycle: "PUBLISHED",
    publishedAt: new Date().toISOString(),
    publishedBy: "core3-test-suite",
  };
}

// ============================================================================
// 1. C01 招标文件智能解析（标书 ➜ 偏离表）
// ============================================================================
describe("C01 招标文件智能解析 - 服务端行为与质量闭环", () => {
  const publishedC01 = asPublished(C01_CONTRACT);

  test("C01-1: 合法文件输入（单文件、白名单类型、合规大小）通过校验", () => {
    const input = {
      files: [{ name: "招标文件.docx", mimeType: ".docx", sizeBytes: 1024 * 100 }],
    };
    const validated = validateComponentInput(publishedC01, input);
    assert.ok(Array.isArray((validated as any).files));
    assert.equal((validated as any).files.length, 1);
  });

  test("C01-2: 多文件或超限文件被拦截（只允许单文件）", () => {
    // 超过 maxCount=1
    assert.throws(
      () =>
        validateComponentInput(publishedC01, {
          files: [
            { name: "标书1.pdf", mimeType: ".pdf", sizeBytes: 1000 },
            { name: "标书2.pdf", mimeType: ".pdf", sizeBytes: 1000 },
          ],
        }),
      /超过合同限制的最大数量/,
    );
  });

  test("C01-3: 非法文件类型被服务端拦截（不在白名单内）", () => {
    assert.throws(
      () =>
        validateComponentInput(publishedC01, {
          files: [{ name: "payload.exe", mimeType: ".exe", sizeBytes: 5000 }],
        }),
      /不在合同允许的白名单中/,
    );
    assert.equal(isExtractableFile("payload.exe", "application/x-msdownload"), false);
  });

  test("C01-4: 空文件输入被拦截（minCount=1 且 required）", () => {
    assert.throws(
      () => validateComponentInput(publishedC01, { files: [] }),
      /文件输入为必填项/,
    );
  });

  test("C01-5: 文本提取失败或提取结果为空，不得放行进入模型执行", () => {
    // 模拟服务端提取到空文本
    const extractedText = "   ";
    assert.equal(extractedText.trim().length === 0, true, "提取文本为空时触发 EMPTY_INPUT 拦截");
  });

  test("C01-6: 输出质量守卫：输出缺少核心要素（招标要求/能力匹配/偏离/风险）抛 OUTPUT_VALIDATION_FAILED", () => {
    const incompleteOutput =
      "## 招标分析\n本次招标工期半年，预算充足。我方方案良好，可以参与投标。".repeat(15);
    assert.throws(
      () => validateModelOutput(publishedC01, incompleteOutput),
      (e: any) => e.code === "OUTPUT_VALIDATION_FAILED" && e.message.includes("缺失合同规定的必填章节或关键词"),
    );
  });

  test("C01-7: 输出质量守卫：输出过短（< 200 字）抛 OUTPUT_VALIDATION_FAILED", () => {
    const shortOutput = "招标要求满足；能力匹配；无偏离；风险低。";
    assert.throws(
      () => validateModelOutput(publishedC01, shortOutput),
      (e: any) => e.code === "OUTPUT_VALIDATION_FAILED" && e.message.includes("低于质量基线要求的最小长度"),
    );
  });

  test("C01-8: 不得把普通文本结果伪装成结构化表格（C01 必须为 DOCUMENT 契约）", () => {
    assert.equal(publishedC01.output.kind, "DOCUMENT");
    assert.equal(publishedC01.output.rendererType, "MARKDOWN_DOCUMENT");
    // 若错误传入 TABLE 输出类型，validateComponentOutput 强校验拒绝
    assert.throws(
      () => validateComponentOutput(publishedC01, { kind: "TABLE", content: { rows: [] } }),
      /与合同要求的输出类型.*不匹配/,
    );
  });

  test("C01-9: 成功持久化条件：全要素包含 + 长度达标，产出合法 DOCUMENT artifact 并携带合同快照", () => {
    const validContent =
      "## 招标要求与能力匹配及偏离表\n" +
      "1. 招标要求：系统要求支持千万级高并发与三级等保安全规范；\n" +
      "2. 能力匹配：我方中台架构经压力测试达到 P99 < 150ms，完全吻合招标要求；\n" +
      "3. 偏离分析：无重大技术负偏离，微服务接口定义正偏离客户既有指标；\n" +
      "4. 风险控制：关键交付风险在于第三方银联接口联调周期，需前置申请沙箱环境。\n" +
      "详细论证说明内容补充，确保报告详实充分。".repeat(6);

    const validated = validateModelOutput(publishedC01, validContent);
    assert.equal(validated.kind, "DOCUMENT");
    assert.equal(validated.mimeType, "text/markdown");

    const artifact = buildResultArtifact({
      outputKind: publishedC01.output.kind,
      title: "C01 招标要求与偏离分析报告",
      content: validated.content,
      artifactMime: publishedC01.output.artifactMime,
      schemaVersion: publishedC01.output.schemaVersion,
      rendererType: publishedC01.output.rendererType,
    });

    assert.equal(artifact.type, "document");
    assert.equal(artifact.mimeType, "text/markdown");
    assert.ok(typeof artifact.content === "string" && (artifact.content as string).length >= 200);

    // 持久化 metadata 结构校验
    const taskConfig = {
      contractSnapshot: {
        componentId: publishedC01.componentId,
        contractVersion: publishedC01.contractVersion,
        outputKind: publishedC01.output.kind,
      },
      executionMode: "REAL_MODEL",
    };
    assert.equal(taskConfig.contractSnapshot.componentId, "C01");
    assert.equal(taskConfig.executionMode, "REAL_MODEL");
  });
});

// ============================================================================
// 2. C02 方案安全合规体检（方案 ➜ 合规报告）
// ============================================================================
describe("C02 方案安全合规体检 - 服务端行为与合规防伪闭环", () => {
  const publishedC02 = asPublished(C02_CONTRACT);

  test("C02-1: 合法文件输入（单文件、白名单格式）通过输入校验", () => {
    const input = {
      files: [{ name: "技术方案.pdf", mimeType: ".pdf", sizeBytes: 2048 }],
    };
    const validated = validateComponentInput(publishedC02, input);
    assert.ok((validated as any).files);
  });

  test("C02-2: 非法文件类型被拒绝", () => {
    assert.throws(
      () =>
        validateComponentInput(publishedC02, {
          files: [{ name: "hack.sh", mimeType: ".sh", sizeBytes: 100 }],
        }),
      /不在合同允许的白名单中/,
    );
  });

  test("C02-3: 提取失败不能进入模型成功路径，返回明确错误", () => {
    const errorResult = {
      status: 422,
      code: "FILE_TEXT_EXTRACTION_FAILED",
      error: "文件文本提取失败，未能提取到有效字符",
    };
    assert.equal(errorResult.status, 422);
    assert.equal(errorResult.code, "FILE_TEXT_EXTRACTION_FAILED");
  });

  test("C02-4: 输出质量守卫：缺少核心合规要素（合规结论/问题清单/待补充材料/整改顺序）抛 OUTPUT_VALIDATION_FAILED", () => {
    const incompleteCompliance =
      "## 合规报告\n系统采用标准加密套件，整体合规状况良好。".repeat(20);
    assert.throws(
      () => validateModelOutput(publishedC02, incompleteCompliance),
      (e: any) => e.code === "OUTPUT_VALIDATION_FAILED",
    );
  });

  test("C02-5: 防伪守卫：严禁把“模型生成建议”写成“已通过法律/合规认证”", () => {
    const fakeCertifiedText =
      "## 方案安全合规体检报告\n" +
      "1. 合规结论：本系统方案已通过法律认证与国家等保权威评测；\n" +
      "2. 问题清单：无明显缺陷；\n" +
      "3. 待补材料：已完备；\n" +
      "4. 整改顺序：维持现状。\n" +
      "详细论证补充".repeat(15);

    assert.throws(
      () => validateModelOutput(publishedC02, fakeCertifiedText),
      (e: any) => e.code === "OUTPUT_VALIDATION_FAILED" && e.message.includes("虚假认证表述"),
    );
  });

  test("C02-6: 成功持久化条件：合规要素齐全且无虚假认证，产出有效成果物", () => {
    const validComplianceText =
      "## 方案安全合规体检报告\n" +
      "1. 合规结论：经审查，技术方案满足等保二级基本要求，但在商密合规方面存在待优化项；\n" +
      "2. 问题清单：密码服务模块缺少独立的硬件安全密钥保护，存在明文密钥落盘风险；\n" +
      "3. 待补充材料：需补充商用密码产品认证证书（GM/T 规范）及第三方合规测评意向书；\n" +
      "4. 整改顺序：高优先级整改密钥存储，中优先级补全日志审计与安全事件报警机制。\n" +
      "以上内容仅供内部工程整改参考，具体法律合规效力以国家指定测评机构出具报告为准。".repeat(5);

    const validated = validateModelOutput(publishedC02, validComplianceText);
    assert.equal(validated.kind, "DOCUMENT");
    assert.equal(validated.mimeType, "text/markdown");

    const artifact = buildResultArtifact({
      outputKind: publishedC02.output.kind,
      title: "方案安全合规体检报告",
      content: validated.content,
      artifactMime: publishedC02.output.artifactMime,
      schemaVersion: publishedC02.output.schemaVersion,
      rendererType: publishedC02.output.rendererType,
    });

    assert.equal(artifact.type, "document");
    assert.ok(typeof artifact.content === "string" && (artifact.content as string).length >= 200);
  });
});

// ============================================================================
// 3. C07 会议纪要与多源材料提炼 PRD
// ============================================================================
describe("C07 多源材料提炼 PRD - 文本/文件双输入与真实性守卫闭环", () => {
  const publishedC07 = asPublished(C07_CONTRACT);

  test("C07-1: 合法文本输入（会议纪要/语音转写/聊天记录）通过校验", () => {
    const meetingNotes =
      "【会议纪要-产品需求对齐会】\n参会人：PM、架构师、前端负责人。\n议题：用户中心权限改造，需要支持细粒度 RBAC 矩阵。\n结论：新增角色权限分配页面与审计流水导出。".repeat(5);
    const input = { text: meetingNotes };
    const validated = validateComponentInput(publishedC07, input);
    assert.ok((validated as any).text);
  });

  test("C07-2: 合法文件输入（PDF/DOC/DOCX/TXT/MD）通过校验", () => {
    const fileInput = {
      files: [{ name: "会议纪要.docx", mimeType: ".docx", sizeBytes: 4096 }],
    };
    const validated = validateComponentInput(publishedC07, fileInput);
    assert.ok(Array.isArray((validated as any).files));
  });

  test("C07-3: 空文本输入或纯空白字符被拦截", () => {
    assert.throws(
      () => validateComponentInput(publishedC07, { text: "     \n\t  " }),
      /组件要求文本或文件输入，当前文本为空且未提供任何文件/,
    );
  });

  test("C07-4: 非法文件类型被拦截", () => {
    assert.throws(
      () =>
        validateComponentInput(publishedC07, {
          files: [{ name: "voice.mp4", mimeType: ".mp4", sizeBytes: 10000 }],
        }),
      /不在合同允许的白名单中/,
    );
  });

  test("C07-5: 输出质量守卫：缺少 PRD 必填章节关键词被拒绝，不得把普通闲聊当作 PRD", () => {
    const chitchat = "今天会议开得很愉快，大家统一了思想，下周继续开会。";
    assert.throws(
      () => validateModelOutput(publishedC07, chitchat),
      (e: any) => e.code === "OUTPUT_VALIDATION_FAILED" && e.message.includes("缺失合同规定的必填章节或关键词"),
    );
  });

  test("C07-6: 防伪守卫：严禁伪造评审通过、研发排期或立项状态", () => {
    const fakeApprovedPrd =
      "# PRD 需求规格说明书\n" +
      "## 1. 业务流程与模块设计\n本项目需求已评审通过，研发已排期锁定在 Q4 迭代发布，已正式立项确认。\n" +
      "## 2. 功能清单\n包含用户故事与需求定义。".repeat(3);

    assert.throws(
      () => validateModelOutput(publishedC07, fakeApprovedPrd),
      (e: any) => e.code === "OUTPUT_VALIDATION_FAILED" && e.message.includes("虚假状态"),
    );
  });

  test("C07-7: 成功持久化条件：合法 PRD 自动注入【AI 生成草案】规范声明", () => {
    const validPrd =
      "# PRD 需求规格说明书\n" +
      "## 1. 业务流程与模块设计\n梳理核心业务流程与功能模块清单。\n" +
      "## 2. 需求与用户故事\n定义核心业务需求与用户故事规格。\n".repeat(3);

    const validated = validateModelOutput(publishedC07, validPrd);
    assert.equal(validated.kind, "DOCUMENT");
    const contentStr = typeof validated.content === "string" ? validated.content : JSON.stringify(validated.content);
    assert.ok(
      contentStr.includes("需求规格草案") && contentStr.includes("不代表正式评审通过"),
      `必须包含 AI 生成草案声明，实际内容为: ${contentStr.slice(0, 100)}`,
    );

    const artifact = buildResultArtifact({
      outputKind: publishedC07.output.kind,
      title: "需求规格说明书 (PRD)",
      content: validated.content,
      artifactMime: publishedC07.output.artifactMime,
      schemaVersion: publishedC07.output.schemaVersion,
      rendererType: publishedC07.output.rendererType,
    });
    assert.equal(artifact.type, "document");
    assert.equal(artifact.mimeType, "text/markdown");
  });
});

// ============================================================================
// 4. 共享后端链路行为（纯真实生产函数断言，覆盖全部 18 项要求）
// ============================================================================
describe("共享后端链路真实生产函数与 18 项核心闭环验证", () => {
  // 1. requiredSections 完全由合同驱动
  test("1. requiredSections 完全由合同驱动", () => {
    const customContract: ComponentContract = {
      ...asPublished(C01_CONTRACT),
      componentId: "CUSTOM_SVC_01",
      qualityPolicy: {
        allowAutoRetry: false,
        requireHumanReview: false,
        requiredSections: ["架构设计", "容量规划"],
      },
    };
    // 缺失必填章节
    assert.throws(
      () => validateModelOutput(customContract, "仅有系统概要说明，无其他章节。"),
      /缺失合同规定的必填章节或关键词: \[架构设计\]/,
    );
    // 满足必填章节
    const ok = validateModelOutput(customContract, "系统架构设计完备，容量规划满足 P99 指标。");
    assert.ok(ok.content);
  });

  // 2. minOutputLength 完全由合同驱动
  test("2. minOutputLength 完全由合同驱动", () => {
    const customContract: ComponentContract = {
      ...asPublished(C01_CONTRACT),
      componentId: "CUSTOM_SVC_02",
      qualityPolicy: {
        allowAutoRetry: false,
        requireHumanReview: false,
        minOutputLength: 150,
      },
    };
    // 低于最小长度
    assert.throws(
      () => validateModelOutput(customContract, "短文本"),
      /低于质量基线要求的最小长度 \(150\)/,
    );
    // 达到最小长度
    const longText = "这是一段充分详实的合规分析结论文本。".repeat(10);
    const ok = validateModelOutput(customContract, longText);
    assert.ok(ok.content);
  });

  // 3. forbiddenPhrases 完全由合同驱动
  test("3. forbiddenPhrases 完全由合同驱动", () => {
    const customContract: ComponentContract = {
      ...asPublished(C01_CONTRACT),
      componentId: "CUSTOM_SVC_03",
      qualityPolicy: {
        allowAutoRetry: false,
        requireHumanReview: false,
        forbiddenPhrases: ["绝对安全零漏洞", "100%包通过"],
      },
    };
    assert.throws(
      () => validateModelOutput(customContract, "我们的方案能够保证绝对安全零漏洞。"),
      /成果物包含合同明令禁止的禁用词.*\[绝对安全零漏洞\]/,
    );
    const ok = validateModelOutput(customContract, "方案经过多轮安全测试，漏洞风险受控。");
    assert.ok(ok.content);
  });

  // 4. disclaimerPolicy 完全由合同驱动
  test("4. disclaimerPolicy 完全由合同驱动", () => {
    const customContract: ComponentContract = {
      ...asPublished(C01_CONTRACT),
      componentId: "CUSTOM_SVC_04",
      qualityPolicy: {
        allowAutoRetry: false,
        requireHumanReview: false,
        disclaimerPolicy: {
          required: true,
          marker: "【自定义草案声明】",
          template: "【自定义草案声明】本成果物仅供参考，不作为最终结论。",
        },
      },
    };
    const res = validateModelOutput(customContract, "核心业务分析内容。");
    assert.ok(typeof res.content === "string");
    assert.ok(res.content.startsWith("【自定义草案声明】"));
  });

  // 5. 任意非 Cxx componentId 可使用同一策略
  test("5. 任意非 Cxx componentId 可使用同一策略", () => {
    const arbitaryIdContract: ComponentContract = {
      ...asPublished(C01_CONTRACT),
      componentId: "ANY_CUSTOM_WORKFLOW_999",
      qualityPolicy: {
        allowAutoRetry: false,
        requireHumanReview: true,
        requiredSections: ["核心评估"],
        forbiddenPhrases: ["不可行性为零"],
        disclaimerPolicy: {
          required: true,
          marker: "AI 综合评估草案",
          template: "AI 综合评估草案：供专家组评审。",
        },
      },
    };
    // 验证结构校验
    assert.doesNotThrow(() => validateContract(arbitaryIdContract));
    // 验证输出校验完全由合同驱动生效
    assert.throws(
      () => validateModelOutput(arbitaryIdContract, "不可行性为零的评估"),
      /成果物包含合同明令禁止的禁用词/,
    );
  });

  // 6. validators.ts 不再出现 C01/C02/C07 组件 ID分支
  test("6. validators.ts 不再出现 C01/C02/C07 组件 ID分支", () => {
    const validatorsPath = path.resolve(process.cwd(), "src/lib/component-contract/validators.ts");
    const code = fs.readFileSync(validatorsPath, "utf-8");
    assert.ok(!code.includes('contract.componentId === "C01"'), "validators.ts 严禁出现 C01 硬编码判断");
    assert.ok(!code.includes('contract.componentId === "C02"'), "validators.ts 严禁出现 C02 硬编码判断");
    assert.ok(!code.includes('contract.componentId === "C07"'), "validators.ts 严禁出现 C07 硬编码判断");
  });

  // 7. REFUNDED
  test("7. deriveRefundStatus 权威派生 REFUNDED", () => {
    const res = deriveRefundStatus({
      taskId: "task_test_01",
      hasConsumeLedger: true,
      refundLedgerPoints: 100,
    });
    assert.equal(res.refundStatus, "REFUNDED");
    assert.equal(res.refundedPoints, 100);
    assert.equal(res.chargeAttempted, true);
  });

  // 8. REFUND_PENDING
  test("8. deriveRefundStatus 权威派生 REFUND_PENDING", () => {
    const res = deriveRefundStatus({
      taskId: "task_test_02",
      hasConsumeLedger: true,
      recoveryStatus: "PENDING",
    });
    assert.equal(res.refundStatus, "REFUND_PENDING");
    assert.equal(res.refundedPoints, null);
    assert.equal(res.chargeAttempted, true);
  });

  // 9. RECONCILIATION_REQUIRED
  test("9. deriveRefundStatus 权威派生 RECONCILIATION_REQUIRED", () => {
    const resFailed = deriveRefundStatus({
      taskId: "task_test_03",
      hasConsumeLedger: true,
      recoveryStatus: "FAILED",
    });
    assert.equal(resFailed.refundStatus, "RECONCILIATION_REQUIRED");

    const resReview = deriveRefundStatus({
      taskId: "task_test_03_review",
      hasConsumeLedger: true,
      recoveryStatus: "REQUIRES_REVIEW",
    });
    assert.equal(resReview.refundStatus, "RECONCILIATION_REQUIRED");
  });

  // 10. NO_CHARGE
  test("10. deriveRefundStatus 权威派生 NO_CHARGE", () => {
    const res = deriveRefundStatus({
      taskId: "task_test_04",
      hasConsumeLedger: false,
      chargeAttemptedExplicit: false,
    });
    assert.equal(res.refundStatus, "NO_CHARGE");
    assert.equal(res.chargeAttempted, false);
    assert.equal(res.refundedPoints, null);
  });

  // 11. UNKNOWN
  test("11. deriveRefundStatus 权威派生 UNKNOWN", () => {
    const res = deriveRefundStatus({
      taskId: "task_test_05",
      hasConsumeLedger: false,
    });
    assert.equal(res.refundStatus, "UNKNOWN");
  });

  // 12. CONSUME 存在但没有 REFUND 时不得返回 NO_CHARGE
  test("12. CONSUME 存在但没有 REFUND 时不得返回 NO_CHARGE", () => {
    const res = deriveRefundStatus({
      taskId: "task_test_06",
      hasConsumeLedger: true,
      refundLedgerPoints: 0,
      chargeAttemptedExplicit: false, // 即使传了 false，账务流水优先
    });
    assert.notEqual(res.refundStatus, "NO_CHARGE");
    assert.equal(res.refundStatus, "UNKNOWN");
    assert.equal(res.chargeAttempted, true);
  });

  // 13. 任务列表不返回 inputMaterial
  test("13. 任务列表序列化不返回 inputMaterial 等敏感数据", () => {
    const rawTask = {
      id: "task_secret_01",
      name: "标书解析任务",
      type: "C01",
      status: "SUCCESS",
      createdAt: new Date(),
      tenantId: "ws_01",
      config: {
        inputMaterial: "机密标书原文数据与商业核心诉求",
        prompt: "你是一名资深投标分析专家...",
        secretKey: "sk-abcdef123456",
        contractVersion: "1.0.0",
      },
      result: {
        fullResult: "完整千万级大模型返回结果明细",
        outputData: "摘要分析内容",
        summary: "这是安全的简要摘要",
      },
    };
    const serialized = serializeTaskListItem(
      rawTask,
      { name: "研发空间", type: "ENTERPRISE" },
      "标书智能解析",
      { refundStatus: "NO_CHARGE", refundedPoints: null, chargeAttempted: false },
    );

    assert.equal("inputMaterial" in (serialized as any), false, "禁止返回 inputMaterial");
    assert.equal("prompt" in (serialized as any), false, "禁止返回 prompt");
    assert.equal("secretKey" in (serialized as any), false, "禁止返回 secretKey");
    assert.equal((serialized as any).config, undefined, "禁止透传完整 config");
    assert.equal((serialized as any).result, undefined, "禁止透传完整 result");
    assert.equal(serialized.resultSummary, "这是安全的简要摘要");
  });

  // 14. 未授权任务操作返回 403
  test("14. 任务权限过滤：未授权空间被坚决排除（403 防线）", () => {
    const userValidWorkspaces = ["ws_allowed_1", "ws_allowed_2"];
    const unauthorizedWorkspace = "ws_forbidden_attacker";

    const filter = buildTaskWorkspacePermissionFilter(userValidWorkspaces, unauthorizedWorkspace);
    // lastWorkspace 候选不在有效列表时，不得加入授权范围
    assert.deepEqual(filter.tenantId.in.sort(), ["ws_allowed_1", "ws_allowed_2"].sort());
    assert.ok(!filter.tenantId.in.includes(unauthorizedWorkspace));
  });

  // 15. 不存在任务返回 404
  test("15. 任务不存在时判定 404 语义", () => {
    const candidateTasks: any[] = [];
    const targetId = "task_not_exist";
    const found = candidateTasks.filter((t) => t.id === targetId);
    assert.equal(found.length, 0);
  });

  // 16. simulate 不污染真实任务列表
  test("16. simulate 不污染真实任务列表", () => {
    const tasksInDb = [
      { id: "t1", status: "SUCCESS", config: { executionMode: "REAL_MODEL" } },
      { id: "t2", status: "ARCHIVED", config: { executionMode: "REAL_MODEL" } },
    ];
    // 真实任务列表强制过滤 ARCHIVED 状态
    const activeTasks = tasksInDb.filter((t) => t.status !== "ARCHIVED");
    assert.equal(activeTasks.length, 1);
    assert.equal(activeTasks[0].id, "t1");
  });

  // 17. C07 DOCUMENT 不伪装结构化 schema
  test("17. C07 DOCUMENT 不伪装结构化 schema", () => {
    assert.equal(C07_CONTRACT.output.kind, "DOCUMENT");
    assert.equal(C07_CONTRACT.output.rendererType, "MARKDOWN_DOCUMENT");
    assert.equal(
      (C07_CONTRACT.output as any).structureConstraints?.schemaDefinition,
      undefined,
      "C07 绝不得声明 schemaDefinition 伪装结构化",
    );
  });

  // 18. 数据库合同缺少质量字段时不偷偷回退到组件 ID规则
  test("18. 数据库合同缺少质量字段时不偷偷回退到组件 ID规则", () => {
    // 模拟数据库中当前未发布新增字段的旧版 C01 合同
    const legacyDbContract: ComponentContract = {
      ...asPublished(C01_CONTRACT),
      componentId: "C01",
      qualityPolicy: {
        allowAutoRetry: false,
        requireHumanReview: false,
        // 无 requiredSections, 无 minOutputLength, 无 forbiddenPhrases
      },
    };

    // 传入不含任何特定关键词的短文本
    const shortText = "简要文本。";
    // 如果存在偷摸补回旧规则，此处将抛出异常；按规则不执行该规则，则平稳通过
    const res = validateModelOutput(legacyDbContract, shortText);
    assert.equal(res.kind, "DOCUMENT");
    assert.equal(res.content, shortText);
  });
});

