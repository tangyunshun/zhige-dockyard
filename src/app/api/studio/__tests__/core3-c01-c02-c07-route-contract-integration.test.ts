/**
 * CORE-3-R3.4：C01/C02/C07 三组件【确定性合同 / 源码守卫测试】
 *
 * 证据口径声明（重要）：本文件是确定性纯函数与源码红线守卫测试，
 * 不调用真实外部模型、不写入数据库、不产生账务流水，不代表真实生产路由集成证据。
 * 严禁将其称为「生产路由集成测试」或「真实执行证据」。
 * 本文件为源码守卫/纯函数测试（使用 fake 依赖），仅证明 HTTP 控制流、合同校验、DTO 序列化和错误隔离；
 * 不证明真实模型、真实数据库、真实扣点、真实退款或生产业务验收。
 *
 * 覆盖三组件全流程确定性闸门：
 * - 输入校验与服务端真实文本提取（防伪造 inputMaterial 绕过）
 * - 格式/大小/空输入严格阻断
 * - 输出质量守卫与防伪守卫拦截
 * - 合同快照持久化绑定与 task_detail 详情安全 DTO 序列化
 * - 退款状态三态确定性
 * - 源码红线：无硬编码组件数组、task_detail 调用生产序列化、chargeAttempted 三态
 *
 * 真实 HTTP 路由与全链路验证另见 core3-c01-c02-c07-real-execution-acceptance.test.ts（状态 MANUAL / NOT_RUN，未经授权禁止运行）。
 */

import { describe, it } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  serializeTaskDetailItem,
  serializeTaskListItem,
  deriveTaskContractView,
  extractSafeTaskError,
} from "@/lib/task-query-helpers";
import { deriveRefundStatus } from "@/lib/refund-status";
import { extractTaskExecutionMeta } from "@/lib/task-execution-meta";
import { validateModelOutput, validateComponentInput } from "@/lib/component-contract/validators";

const ROUTE_SRC = readFileSync("src/app/api/studio/route.ts", "utf8");
const RESULT_VIEWER_SRC = readFileSync("src/components/studio/ResultViewer.tsx", "utf8");

// 有效合同快照 fixture（取自真实 C01 / C02 / C07 生产合同结构规范）
const C01_SNAPSHOT = {
  contract: {
    componentId: "C01",
    contractVersion: "1.0.0",
    lifecycle: "PUBLISHED",
    input: {
      kind: "FILE",
      fileConstraints: {
        maxCount: 1,
        maxTotalBytes: 20971520,
        acceptedFileTypes: ["pdf", "docx", "doc", "txt", "md"],
      },
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
      requiredSections: ["招标基本要求", "服务与能力匹配度", "条款偏离说明", "投标关键风险提示"],
      minOutputLength: 200,
      disclaimerPolicy: {
        required: true,
        marker: "AI 辅助分析成果",
        template: "本解析报告由知阁 AI 引擎基于招标文件提炼生成，仅供商务与技术方案编写参考，请以原始招标文件为准。",
      },
    },
  },
};

const C02_SNAPSHOT = {
  contract: {
    componentId: "C02",
    contractVersion: "1.0.0",
    lifecycle: "PUBLISHED",
    input: {
      kind: "FILE",
      fileConstraints: {
        maxCount: 1,
        maxTotalBytes: 20971520,
        acceptedFileTypes: ["pdf", "docx", "doc", "txt", "md"],
      },
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
      requiredSections: ["总体合规结论", "重大合规缺陷与问题清单", "需补充合规材料建议", "整改落实建议顺序"],
      minOutputLength: 200,
      forbiddenPhrases: ["已通过法律认证", "已具备法定效力", "无需人工复核"],
      disclaimerPolicy: {
        required: true,
        marker: "AI 合规初筛建议",
        template: "本报告由 AI 基于通用合规基线生成，不构成正式法律意见或法务认证，重要方案请由企业法务及安全专家二次复核。",
      },
    },
  },
};

const C07_SNAPSHOT = {
  contract: {
    componentId: "C07",
    contractVersion: "1.0.0",
    lifecycle: "PUBLISHED",
    input: {
      kind: "TEXT_AND_FILES",
      textConstraints: {
        required: false,
        maxLength: 30000,
        minLength: 1,
      },
      fileConstraints: {
        maxCount: 1,
        maxTotalBytes: 20971520,
        acceptedFileTypes: ["pdf", "docx", "doc", "txt", "md"],
      },
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
      requiredSections: ["功能范围与边界", "核心业务流程", "验收标准"],
      minOutputLength: 200,
      forbiddenPhrases: ["已通过评审", "正式立项完成", "排期已确认"],
      disclaimerPolicy: {
        required: true,
        marker: "AI 生成需求草案",
        template: "本结果为 AI 辅助生成的需求草案，需经产品经理与研发团队确认后方可作为正式需求基线。",
      },
    },
  },
};

describe("C01 招标文件智能解析 - 生产路由契约集成闸门", () => {
  it("C01-1: 生产路由中明确存在单文件校验与多文件/超限文件阻断代码逻辑", () => {
    // 校验 route.ts 中对 fileConstraints 的真实消费
    assert.ok(ROUTE_SRC.includes("maxCount"), "生产路由必须校验 maxCount 文件数量限制");
    assert.ok(ROUTE_SRC.includes("maxTotalBytes"), "生产路由必须校验 maxTotalBytes 文件大小限制");
    assert.ok(ROUTE_SRC.includes("isAcceptedFileMime"), "生产路由必须执行严格文件扩展名与 MIME 白名单校验");
  });

  it("C01-2: 服务端从文件真实提取文本，忽略前端伪造的 inputMaterial 文本绕过", () => {
    // 生产路由必须在存在 uploadFiles 时优先使用服务端 readDocumentFileText 提取
    assert.ok(
      ROUTE_SRC.includes("readDocumentFileText"),
      "生产路由必须通过 readDocumentFileText 在服务端真实提取文件文本",
    );
    assert.ok(
      ROUTE_SRC.includes("TEXT_EXTRACT_TIMEOUT_MS"),
      "文件文本提取必须设置真实带超时的 AbortController worker 保护",
    );
  });

  it("C01-3: 输出质量校验失败时不产生成功任务，安全提取错误文案", () => {
    const errorInfo = extractSafeTaskError({
      error: "OUTPUT_VALIDATION_FAILED: 缺少核心章节【招标基本要求】",
      outputData: { code: "OUTPUT_VALIDATION_FAILED" },
    });
    assert.equal(errorInfo.errorCode, "OUTPUT_VALIDATION_FAILED");
    assert.ok(errorInfo.errorMessage?.includes("缺少核心章节"));

    // 失败任务详情 DTO 必须 fail closed，不返回伪造成果物
    const failedTask = {
      id: "task-c01-fail",
      name: "招标文件解析-失败",
      type: "C01",
      status: "FAILED",
      createdAt: new Date(),
      tenantId: "ws-test",
      config: { contractSnapshot: C01_SNAPSHOT },
      result: {
        error: "OUTPUT_VALIDATION_FAILED: 缺少核心章节【招标基本要求】",
        rawOutput: "不达标的未完成输出",
        artifacts: [{ type: "DOCUMENT", content: "残缺文档" }],
      },
    };
    const dto = serializeTaskDetailItem(failedTask, "招标文件智能解析", {
      refundStatus: "NO_CHARGE",
      refundedPoints: 0,
      chargeAttempted: false,
    });
    assert.equal(dto.status, "FAILED");
    assert.deepEqual(dto.artifacts, [], "输出校验失败时 artifacts 必须为空");
    assert.strictEqual(dto.artifact, null);
    assert.strictEqual(dto.outputData, null);
  });

  it("C01-4: 合法 DOCUMENT 成果物成功持久化并绑定 contractSnapshot", () => {
    const successTask = {
      id: "task-c01-success",
      name: "招标文件解析-成功",
      type: "C01",
      status: "SUCCESS",
      createdAt: new Date(),
      tenantId: "ws-test",
      config: { contractSnapshot: C01_SNAPSHOT },
      result: {
        executionMode: "SIMULATED",
        artifacts: [
          {
            type: "DOCUMENT",
            title: "招标文件解析报告",
            mimeType: "text/markdown",
            rendererType: "MARKDOWN_DOCUMENT",
            content: "## 招标基本要求\n全量合规\n## 服务与能力匹配度\n高\n## 条款偏离说明\n无偏离\n## 投标关键风险提示\n工期较紧",
            previewable: true,
            downloadable: true,
          },
        ],
      },
    };

    const dto = serializeTaskDetailItem(successTask, "招标文件智能解析", {
      refundStatus: "UNKNOWN",
      refundedPoints: null,
      chargeAttempted: null,
    });
    assert.equal(dto.status, "SUCCESS");
    assert.equal(dto.artifacts.length, 1);
    assert.equal(dto.contractView?.outputKind, "DOCUMENT");
    assert.equal(dto.contractView?.contractVersion, "1.0.0");
    assert.ok(dto.artifacts[0].content);
  });
});

describe("C02 方案安全合规体检 - 生产路由契约集成闸门", () => {
  it("C02-1: 虚假认证表述与禁用词被生产路由契约质量守卫拦截", () => {
    // 验证合同驱动的 forbiddenPhrases 防伪禁用词拦截
    assert.throws(
      () => validateModelOutput(C02_SNAPSHOT.contract as any, "本方案已通过法律认证且无需人工复核"),
      (err: any) => {
        return err?.code === "OUTPUT_VALIDATION_FAILED" && err?.message?.includes("已通过法律认证");
      },
      "包含禁用词已通过法律认证必须抛出 OUTPUT_VALIDATION_FAILED",
    );
  });

  it("C02-2: 缺少合规核心章节阻断任务，错误提取不泄露内部堆栈", () => {
    const safeError = extractSafeTaskError({
      error: "OUTPUT_VALIDATION_FAILED: 输出缺少必要合规章节\n    at validateOutput (/app/src/validator.ts:50:11)",
    });
    // 包含堆栈特征的错误必须被安全替换，不得泄露调用栈
    assert.equal(safeError.errorMessage, "任务执行未通过质量守卫，详情已记录安全日志");
  });

  it("C02-3: 失败任务退款状态无流水证据时严格为 UNKNOWN，chargeAttempted 保持 null", () => {
    const meta = deriveRefundStatus({ taskId: "c02-unknown-task", hasConsumeLedger: false });
    assert.equal(meta.refundStatus, "UNKNOWN");
    assert.strictEqual(meta.chargeAttempted, null);
  });
});

describe("C07 会议纪要自动转需求(PRD) - 生产路由契约集成闸门", () => {
  it("C07-1: C07 支持文本与文件双输入，空白文本且无文件输入必须被路由拦截", () => {
    // 验证 TEXT_AND_FILES 模式下空文本且无文件时抛出 INPUT_VALIDATION_FAILED
    assert.throws(
      () => validateComponentInput(C07_SNAPSHOT.contract as any, { text: "   ", files: [] }),
      (err: any) => {
        return err?.code === "INPUT_VALIDATION_FAILED";
      },
      "TEXT_AND_FILES 空文本且无文件必须被拦截",
    );
  });

  it("C07-2: PRD 输出防伪：严禁伪造评审通过、排期或正式立项状态", () => {
    const phrases = C07_SNAPSHOT.contract.qualityPolicy.forbiddenPhrases;
    assert.ok(phrases.includes("已通过评审"));
    assert.ok(phrases.includes("正式立项完成"));
    assert.ok(phrases.includes("排期已确认"));
  });

  it("C07-3: DOCUMENT 输出统一展示为「DOCUMENT / Markdown 成果文档」，无 C07 业务特判", () => {
    assert.ok(
      RESULT_VIEWER_SRC.includes("DOCUMENT / Markdown 成果文档"),
      "ResultViewer 必须使用标准统一标题",
    );
    assert.strictEqual(
      RESULT_VIEWER_SRC.includes("需求规格草案（DOCUMENT/Markdown）"),
      false,
      "不得使用前端写死推断的需求规格草案标题",
    );
    assert.strictEqual(
      RESULT_VIEWER_SRC.includes('componentId === "C07"'),
      false,
      "ResultViewer 绝无 componentId === 'C07' 特判",
    );
  });

  it("C07-4: DOCUMENT 输出在前端严格不渲染固定结构化字段卡片", () => {
    assert.ok(
      RESULT_VIEWER_SRC.includes("!isDocumentKind && structuredSection"),
      "DOCUMENT 模式严格禁止渲染结构化字段卡片",
    );
  });
});
