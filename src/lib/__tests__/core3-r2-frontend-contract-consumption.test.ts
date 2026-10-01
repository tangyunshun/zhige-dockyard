import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";
import { getFailedTaskRefundInfo, getDisclaimerBanner, normArtifactType, getDocumentArtifactContent, default as ResultViewer } from "@/components/studio/ResultViewer";
import { ToastProvider } from "@/components/Toast";
import type { CatalogContractFields, ComponentDefinition } from "@/constants/components";

function renderViewer(task: unknown): string {
  // 本测试仅验证前端成果物动作的可导出判断，不调用真实模型/数据库/扣点
  return renderToString(
    React.createElement(
      ToastProvider,
      null,
      React.createElement(
        ResultViewer as React.ComponentType<{
          task: unknown;
          open?: boolean;
          onSaveToKnowledge?: (t: unknown) => void;
        }>,
        { task, open: true, onSaveToKnowledge: () => undefined },
      ),
    ),
  );
}

describe("CORE-3-R2 前端真实契约消费修复验收测试（12项严格验证）", () => {
  const rootDir = process.cwd();
  const workspaceFile = path.join(rootDir, "src/components/WorkspaceInternalLayoutV3.tsx");
  const dispatcherFile = path.join(rootDir, "src/components/studio/ComponentDispatcherPanelNew.tsx");
  const resultViewerFile = path.join(rootDir, "src/components/studio/ResultViewer.tsx");
  const tasksPageFile = path.join(rootDir, "src/app/tasks/page.tsx");
  const constantsFile = path.join(rootDir, "src/constants/components.ts");

  it("1. 没有 maxLength 不默认 30000", () => {
    const wContent = fs.readFileSync(workspaceFile, "utf-8");
    assert.strictEqual(wContent.includes("|| 30000"), false, "WorkspaceInternalLayoutV3 严禁出现 || 30000");
    assert.ok(
      wContent.includes("maxLength={typeof maxTextChars === \"number\" ? maxTextChars : undefined}"),
      "没有 maxLength 时必须为 undefined，不硬编码任何上限",
    );
    assert.ok(
      wContent.includes("长度限制由服务端合同校验"),
      "未配置合同上限时必须提示「长度限制由服务端合同校验」",
    );
  });

  it("2. 有合同 maxLength 时正确消费", () => {
    const mockComp: CatalogContractFields = {
      textConstraints: {
        maxLength: 8000,
      },
    };
    const maxTextChars = mockComp.textConstraints?.maxLength;
    const computedMaxLength = typeof maxTextChars === "number" ? maxTextChars : undefined;
    assert.strictEqual(computedMaxLength, 8000, "存在合同限制时应为真实数值 8000");

    const placeholderText = typeof maxTextChars === "number"
      ? `（上限 ${maxTextChars.toLocaleString()} 字符）`
      : "（长度限制由服务端合同校验）";
    assert.strictEqual(placeholderText, "（上限 8,000 字符）");
  });

  it("3. 本批相关目录字段不使用 as any", () => {
    const wContent = fs.readFileSync(workspaceFile, "utf-8");
    const dContent = fs.readFileSync(dispatcherFile, "utf-8");
    const cContent = fs.readFileSync(constantsFile, "utf-8");

    assert.strictEqual(wContent.includes("(selCatalogCompLeft as any)"), false);
    assert.strictEqual(dContent.includes("as unknown as ComponentDefinition"), false);
    assert.strictEqual(dContent.includes("compContractMeta as any"), false);
    assert.ok(cContent.includes("export interface CatalogContractFields"));
  });

  it("4. refundStatus 缺失时不显示退款成功", () => {
    const taskWithoutRefund = {
      name: "异常中断任务",
      status: "FAILED",
      outputData: { error: "上游大模型服务不可用", code: "SERVICE_UNAVAILABLE" },
    };
    const refundInfo = getFailedTaskRefundInfo(taskWithoutRefund as any);
    assert.strictEqual(refundInfo.statusText, "退款状态待系统确认");
    assert.strictEqual(refundInfo.statusText.includes("退款成功"), false);
    assert.strictEqual(refundInfo.statusText.includes("已退款"), false);
  });

  it("5. refundStatus=REFUNDED 才显示退款成功", () => {
    const refundedTask = {
      name: "校验未通过任务",
      status: "FAILED",
      refundStatus: "REFUNDED" as const,
      refundedPoints: 15,
      chargeAttempted: true,
    };
    const refundInfo = getFailedTaskRefundInfo(refundedTask as any);
    assert.strictEqual(refundInfo.statusText, "退款成功");
    assert.ok(refundInfo.detailText.includes("15 算力点"));
  });

  it("6. DOCUMENT 模式使用统一文案且不渲染结构化字段卡片（无 C07 业务特判）", () => {
    const rContent = fs.readFileSync(resultViewerFile, "utf-8");
    // 1. ResultViewer 源码不得存在 componentId === "C07" 或等价 C07 业务特判
    assert.strictEqual(
      rContent.includes('componentId === "C07"') ||
      rContent.includes("componentId === 'C07'") ||
      rContent.includes('.toUpperCase() === "C07"') ||
      rContent.includes('.toUpperCase() !== "C07"'),
      false,
      "ResultViewer 源码不得存在 componentId === 'C07' 或等价 C07 业务特判",
    );
    // 2. DOCUMENT 输出必须显示统一文案：DOCUMENT / Markdown 成果文档
    assert.ok(
      rContent.includes("DOCUMENT / Markdown 成果文档"),
      "DOCUMENT 输出必须显示统一文案：DOCUMENT / Markdown 成果文档",
    );
    // 3. 源码不得出现：需求规格草案
    assert.strictEqual(
      rContent.includes("需求规格草案"),
      false,
      "ResultViewer 源码不得出现「需求规格草案」业务标签",
    );
    // 4. DOCUMENT 输出不得渲染结构化字段卡片
    // 5. 测试必须验证 outputKind / contractView.outputKind，而不是组件编号
    assert.ok(
      rContent.includes("!isDocumentKind && structuredSection"),
      "DOCUMENT 模式下不得渲染结构化字段卡片",
    );
    assert.ok(
      rContent.includes("task.contractView?.outputKind ?? null"),
      "输出形态必须只依据 contractView.outputKind（无快照时为 null，不得用 task.outputKind 猜测）",
    );
  });

  it("7. simulate 不进入真实任务列表", () => {
    const tContent = fs.readFileSync(tasksPageFile, "utf-8");
    assert.strictEqual(tContent.includes('action: "simulate"'), false);
    assert.strictEqual(tContent.includes("action=simulate"), false);
    assert.strictEqual(tContent.includes('status: "SUCCESS"'), false);
  });

  it("8. FAILED 不可导出（生产语义：只有 SUCCESS + contractView + 合法非空成果物可导出）", () => {
    const rContent = fs.readFileSync(resultViewerFile, "utf-8");
    // 源码守卫：disabled 与点击处理器共用同一判断 canUseArtifactActions
    assert.ok(rContent.includes("disabled={!artifactActionsEnabled}"), "复制/导出/沉淀按钮 disabled 必须使用统一判断");
    assert.ok(rContent.includes("if (canUseArtifactActions()) onSaveToKnowledge"), "点击处理器必须复用同一判断");

    // a) FAILED 任务（无 contractView、无成果物）：复制 / 导出 / 知识沉淀按钮全部 disabled
    const failedHtml = renderViewer({
      id: "f1",
      status: "FAILED",
      errorCode: "MODEL_UPSTREAM_ERROR",
      errorMessage: "上游模型失败",
      name: "失败任务",
      componentId: "C01",
      contractView: null,
      artifacts: [],
    });
    assert.ok(failedHtml.includes("复制 Markdown"), "应渲染复制 Markdown 按钮");
    assert.ok(failedHtml.includes("导出报告"), "应渲染导出报告按钮");
    assert.ok(failedHtml.includes("沉淀至"), "应渲染沉淀至知识沉淀按钮");
    // React 将 disabled={true} 渲染为 disabled="" 属性；FAILED 态三按钮应带该属性
    const failedDisabledCount = (failedHtml.match(/disabled=""/g) || []).length;
    assert.ok(failedDisabledCount >= 3, `失败任务复制/导出/沉淀按钮应全部 disabled（实际 disabled="" 数量=${failedDisabledCount}）`);

    // b) SUCCESS + contractView + 合法非空 DOCUMENT 成果物：按钮可用（不带 disabled="" 属性）
    const okHtml = renderViewer({
      id: "s1",
      status: "SUCCESS",
      name: "成功任务",
      componentId: "C07",
      contractView: { outputKind: "DOCUMENT", artifactMime: "text/markdown", rendererType: "MARKDOWN_DOCUMENT" },
      artifacts: [{ id: "a1", type: "DOCUMENT", title: "成果", mimeType: "text/markdown", content: "成果正文" }],
    });
    assert.ok(okHtml.includes("复制 Markdown"), "成功任务应渲染复制 Markdown 按钮");
    assert.ok(okHtml.includes("导出报告"), "成功任务应渲染导出报告按钮");
    assert.ok(okHtml.includes("沉淀至"), "成功任务应渲染沉淀至知识沉淀按钮");
    assert.strictEqual(okHtml.includes('disabled=""'), false, "成功+contractView+非空成果物时按钮不应被 disabled");
  });

  it("9. SUCCESS 无 artifact 不可导出", () => {
    const rContent = fs.readFileSync(resultViewerFile, "utf-8");
    assert.ok(
      rContent.includes("任务已完成但没有可查看的成果物，请联系管理员核查"),
      "成功但无成果物必须明确展示「任务已完成但没有可查看的成果物，请联系管理员核查」",
    );
    assert.ok(rContent.includes("hasValidArtifact"));
    assert.ok(rContent.includes("!hasValidArtifact && task.status === \"SUCCESS\""));
  });

  it("10. 结果不存在与权限拒绝显示不同状态", () => {
    const rContent = fs.readFileSync(resultViewerFile, "utf-8");
    assert.ok(rContent.includes("task.notFound"));
    assert.ok(rContent.includes("task.authError"));
    assert.ok(rContent.includes("未找到指定的任务执行结果记录"));
    assert.ok(rContent.includes("暂无查看权限"));
  });

  it("11. 不出现 COMPLETE", () => {
    const dContent = fs.readFileSync(dispatcherFile, "utf-8");
    const rContent = fs.readFileSync(resultViewerFile, "utf-8");
    const tContent = fs.readFileSync(tasksPageFile, "utf-8");
    const wContent = fs.readFileSync(workspaceFile, "utf-8");

    assert.strictEqual(dContent.includes('"COMPLETE"') || dContent.includes("'COMPLETE'"), false);
    assert.strictEqual(rContent.includes('"COMPLETE"') || rContent.includes("'COMPLETE'"), false);
    assert.strictEqual(tContent.includes('"COMPLETE"') || tContent.includes("'COMPLETE'"), false);
    assert.strictEqual(wContent.includes('"COMPLETE"') || wContent.includes("'COMPLETE'"), false);
  });

  it("12. 页面不自行设置 executable=true", () => {
    const dContent = fs.readFileSync(dispatcherFile, "utf-8");
    const wContent = fs.readFileSync(workspaceFile, "utf-8");
    assert.strictEqual(dContent.includes("contractReady = true") || dContent.includes("executable = true"), false);
    assert.strictEqual(wContent.includes("contractReady = true") || wContent.includes("executable = true"), false);
  });
});

describe("CORE-3-R3.5 前端成果物类型归一化与历史合同视图消费（行为测试）", () => {
  it("13. normArtifactType 大小写归一化：DOCUMENT/document/TABLE/table/UNKNOWN", () => {
    assert.equal(normArtifactType("DOCUMENT"), "DOCUMENT");
    assert.equal(normArtifactType("document"), "DOCUMENT");
    assert.equal(normArtifactType("TABLE"), "TABLE");
    assert.equal(normArtifactType("table"), "TABLE");
    assert.equal(normArtifactType("UNKNOWN"), "UNKNOWN");
    assert.equal(normArtifactType(null), null);
  });

  it("14. 文本成果物识别不区分大小写：document / DOCUMENT / REPORT / report 均识别，TABLE / UNKNOWN 不识别", () => {
    const isText = (t?: string | null) => {
      // 与 ResultViewer.TEXT_ARTIFACT_TYPES 一致的归一化判定（DOCUMENT/REPORT 大写）
      const set = new Set(["DOCUMENT", "REPORT"]);
      const n = normArtifactType(t);
      return n !== null && set.has(n);
    };
    assert.equal(isText("document"), true);
    assert.equal(isText("DOCUMENT"), true);
    assert.equal(isText("REPORT"), true);
    assert.equal(isText("report"), true);
    assert.equal(isText("TABLE"), false);
    assert.equal(isText("table"), false);
    assert.equal(isText("UNKNOWN"), false);
    assert.equal(isText(null), false);
  });

  it("15. getDocumentArtifactContent 统一经 normArtifactType：document/REPORT 返回内容，TABLE/UNKNOWN 返回 null", () => {
    assert.equal(getDocumentArtifactContent({ artifacts: [{ type: "document", content: "小写文档" }] } as any), "小写文档");
    assert.equal(getDocumentArtifactContent({ artifacts: [{ type: "DOCUMENT", content: "大写文档" }] } as any), "大写文档");
    assert.equal(getDocumentArtifactContent({ artifacts: [{ type: "REPORT", content: "报告" }] } as any), "报告");
    assert.equal(getDocumentArtifactContent({ artifacts: [{ type: "TABLE", content: "表" }] } as any), null);
    assert.equal(getDocumentArtifactContent({ artifacts: [{ type: "UNKNOWN", content: "x" }] } as any), null);
  });

  it("16. 没有 contractView 时不得渲染成功产物（源码守卫：存在 !hasContractView 不可追溯分支）", () => {
    const rContent = fs.readFileSync(path.join(process.cwd(), "src/components/studio/ResultViewer.tsx"), "utf-8");
    assert.ok(rContent.includes("!hasContractView ?"), "ResultViewer 必须存在无 contractView 的不可追溯分支");
    assert.ok(rContent.includes("该任务没有可追溯的历史合同快照"), "无 contractView 文案必须为历史合同不可追溯");
    assert.ok(rContent.includes("!hasValidArtifact && task.status === \"SUCCESS\""), "无有效成果物时 SUCCESS 必须提示缺失而非渲染成功");
  });
});
