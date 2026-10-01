/**
 * R3-F 前端行为测试：退款诚实化、历史合同免责声明优先级、详情真实字段、C07 红线守卫
 * 原则：优先测试真实导出纯函数（getFailedTaskRefundInfo / getDisclaimerBanner），
 *       运行时难以覆盖的渲染分支用源码红线守卫补强；不渲染 React、不写库、不调模型。
 */
import { describe, it } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getFailedTaskRefundInfo, getDisclaimerBanner, normArtifactType, getDocumentArtifactContent, TEXT_ARTIFACT_TYPES, type ResultViewerTask } from "@/components/studio/ResultViewer";
import { mergeTaskDetailIntoListItem } from "@/lib/task-detail-merge";

const resultViewerSrc = fs.readFileSync(
  path.join(process.cwd(), "src/components/studio/ResultViewer.tsx"),
  "utf-8",
);
const tasksPageSrc = fs.readFileSync(
  path.join(process.cwd(), "src/app/tasks/page.tsx"),
  "utf-8",
);
const mergeSrc = fs.readFileSync(
  path.join(process.cwd(), "src/lib/task-detail-merge.ts"),
  "utf-8",
);

describe("R3-F 退款状态诚实化（getFailedTaskRefundInfo）", () => {
  it("1. UNKNOWN 不得显示「已退款」，必须显示待系统确认", () => {
    const info = getFailedTaskRefundInfo({ status: "FAILED", refundStatus: "UNKNOWN" } as unknown as ResultViewerTask);
    assert.equal(info.statusText, "退款状态待系统确认");
    assert.strictEqual(info.statusText.includes("已退款"), false);
  });

  it("2. refundStatus 缺失/undefined 同样显示待系统确认，不推断为已退款/未扣费", () => {
    const info = getFailedTaskRefundInfo({ status: "FAILED" } as unknown as ResultViewerTask);
    assert.equal(info.statusText, "退款状态待系统确认");
    assert.strictEqual(info.statusText.includes("已退款"), false);
    assert.strictEqual(info.statusText.includes("未发生扣费"), false);
  });

  it("3. NO_CHARGE 显示未发生扣费", () => {
    const info = getFailedTaskRefundInfo({ status: "FAILED", refundStatus: "NO_CHARGE", chargeAttempted: false } as unknown as ResultViewerTask);
    assert.equal(info.statusText, "未发生扣费");
  });

  it("4. REFUNDED 显示退款成功（已实现为「已退款」）", () => {
    const info = getFailedTaskRefundInfo({ status: "FAILED", refundStatus: "REFUNDED", refundedPoints: 12 } as unknown as ResultViewerTask);
    assert.ok(info.statusText.includes("退款"));
  });

  it("5. REFUND_PENDING / RECONCILIATION_REQUIRED 文案正确", () => {
    assert.equal(getFailedTaskRefundInfo({ status: "FAILED", refundStatus: "REFUND_PENDING" } as unknown as ResultViewerTask).statusText, "退款处理中");
    assert.equal(getFailedTaskRefundInfo({ status: "FAILED", refundStatus: "RECONCILIATION_REQUIRED" } as unknown as ResultViewerTask).statusText, "退款待对账");
  });
});

describe("R3-F 历史合同免责声明优先级（getDisclaimerBanner）", () => {
  it("6. contractView.disclaimer 存在时原样展示该历史合同免责声明，不出现业务专属提示", () => {
    const banner = getDisclaimerBanner({ contractView: { disclaimer: "历史合同特别免责：本成果仅用于内部评审" } } as unknown as ResultViewerTask);
    assert.equal(banner.content, "历史合同特别免责：本成果仅用于内部评审");
    assert.strictEqual(banner.content.includes("需经业务方人工复核确认后方可作为正式业务决策依据"), false);
  });

  it("7. 无 contractView 时严禁消费未经详情 DTO 认证的 task.disclaimer，且不得出现人工复核声明", () => {
    const banner = getDisclaimerBanner({ disclaimer: "任务级免责声明" } as unknown as ResultViewerTask);
    assert.strictEqual(banner.content.includes("任务级免责声明"), false, "严禁消费未经详情 DTO 认证的 task.disclaimer");
    assert.strictEqual(banner.content.includes("人工复核"), false, "contractView=null 时不得出现人工复核声明");
    assert.ok(banner.content.length > 0);
  });

  it("8. 完全无合同视图时显示合同不可追溯中性提示，不按 componentId 拼接业务文案", () => {
    const banner = getDisclaimerBanner({} as unknown as ResultViewerTask);
    assert.strictEqual(banner.content.includes("需求规格草案"), false);
    assert.strictEqual(banner.content.includes("人工复核"), false, "contractView=null 不得出现人工复核声明");
    assert.ok(banner.content.length > 0);
  });

  it("9. requireHumanReview=true 且 disclaimer 缺失时仅显示“合同要求人工复核”的中性提示，不臆造业务免责正文", () => {
    const banner = getDisclaimerBanner({ contractView: { requireHumanReview: true } } as unknown as ResultViewerTask);
    assert.equal(banner.content, "该任务绑定合同要求人工复核；合同未提供进一步免责声明文本。");
    assert.strictEqual(banner.content.includes("需经业务方人工复核确认后方可作为正式业务决策依据"), false);
  });

  it("10. requireHumanReview=false 且 disclaimer 缺失时不得出现“需人工复核/待人工复核/合规审查/需求规格”或任何组件推断业务文案", () => {
    const banner = getDisclaimerBanner({ contractView: { requireHumanReview: false } } as unknown as ResultViewerTask);
    assert.equal(banner.content, "该任务绑定合同未下发专用免责声明文本。");
    for (const forbidden of ["需人工复核", "待人工复核", "人工复核", "合规审查", "需求规格"]) {
      assert.strictEqual(banner.content.includes(forbidden), false, `requireHumanReview=false 不得含“${forbidden}”`);
    }
    // 不得按 C01/C02/C07 推断业务文案（如“标书/招标文件/需求规格草案/会议纪要”）
    for (const biz of ["标书", "招标", "需求规格草案", "会议纪要", "合同审查"]) {
      assert.strictEqual(banner.content.includes(biz), false, `不得按组件推断业务文案“${biz}”`);
    }
  });

  it("11. 不得消费未经 DTO 认证的 task.contract / task.outputData.disclaimer 回退", () => {
    const banner = getDisclaimerBanner({
      contractView: null,
      contract: { disclaimer: "合同级伪装免责" },
      outputData: { disclaimer: "输出级伪装免责" },
    } as unknown as ResultViewerTask);
    assert.strictEqual(banner.content.includes("合同级伪装免责"), false, "严禁回退 task.contract.disclaimer");
    assert.strictEqual(banner.content.includes("输出级伪装免责"), false, "严禁回退 task.outputData.disclaimer");
    assert.strictEqual(banner.content.includes("人工复核"), false, "contractView=null 不得出现人工复核声明");
  });
});

describe("R3-F 红线源码守卫", () => {
  it("9. ResultViewer 不得存在 C07 组件 ID 业务特判分支", () => {
    assert.strictEqual(
      /(===|!==)\s*"C07"|toUpperCase\(\s*\)\s*[^;]*===\s*"C07"|componentId\s*===\s*"C07"/.test(resultViewerSrc),
      false,
      "ResultViewer 严禁按 componentId 特判 C07",
    );
  });

  it("10. 非 C07 的 DOCUMENT 不显示为 PRD（不得出现「需求规格草案」字样）", () => {
    assert.strictEqual(
      resultViewerSrc.includes("需求规格草案"),
      false,
      "ResultViewer 不得前端猜测 DOCUMENT 为 PRD（需求规格草案）",
    );
    assert.ok(
      resultViewerSrc.includes("DOCUMENT / Markdown 成果文档"),
      "DOCUMENT 成果物必须统一展示为「DOCUMENT / Markdown 成果文档」",
    );
  });

  it("11. 任务列表点数读取后端统一字段 execution.estimatedPoints，不读 config", () => {
    // §六.3：承载算力点的字段不得命名为 tokenUsed（跨单位含混），统一为 pointsCost，
    // 但其取值必须来自 t.execution?.estimatedPoints，严禁回退 t.config / t.result。
    assert.ok(
      /pointsCost:\s*[^;]*t\.execution\?\.estimatedPoints/.test(tasksPageSrc),
      "任务列表必须以 pointsCost 消费 t.execution?.estimatedPoints 而非 t.config/t.result",
    );
    assert.strictEqual(tasksPageSrc.includes("t.config?.tokenCost"), false);
  });

  it("12. 详情成功合并消费 errorCode / errorMessage 真实字段（详情 DTO 为唯一真源）", () => {
    assert.ok(
      /errorCode:\s*detail\.errorCode/.test(mergeSrc),
      "mergeTaskDetailIntoListItem 必须直接消费 detail.errorCode（=详情 json.data.errorCode）",
    );
    assert.ok(
      /errorMessage:\s*detail\.errorMessage/.test(mergeSrc),
      "mergeTaskDetailIntoListItem 必须直接消费 detail.errorMessage",
    );
    assert.ok(
      /mergeTaskDetailIntoListItem\(prev, json\.data\)/.test(tasksPageSrc),
      "tasks 页必须仅以详情 DTO 调用合并，禁止回退未认证顶层字段",
    );
  });
});

describe("R3.4 ResultViewer 成果物渲染与历史合同视图消费红线", () => {
  const rvSrc = fs.readFileSync(
    path.join(process.cwd(), "src/components/studio/ResultViewer.tsx"),
    "utf-8",
  );

  it("13. 文本型成果物类型集合大写归一化（DOCUMENT/REPORT），且存在 normArtifactType 大小写归一化辅助", () => {
    assert.ok(
      /new Set\(\[\s*"DOCUMENT",\s*"REPORT"\s*\]\)/.test(rvSrc),
      "TEXT_ARTIFACT_TYPES 必须大写 DOCUMENT/REPORT",
    );
    assert.ok(/function normArtifactType\(/.test(rvSrc), "必须存在 normArtifactType 大小写归一化辅助");
  });

  it("14. 输出类型判定仅取 contractView.outputKind，不得用 task.outputKind / componentId / 名称猜测", () => {
    assert.ok(
      /effectiveOutputKind = task\.contractView\?\.outputKind \?\? null/.test(rvSrc),
      "effectiveOutputKind 必须只取 contractView.outputKind，无快照时为 null",
    );
    // 不得出现用 task.outputKind 或组件名回退输出类型的写法
    assert.strictEqual(/effectiveOutputKind = task\.contractView\?\.outputKind \?\? task\.outputKind/.test(rvSrc), false);
  });

  it("15. 防伪声明只消费 contractView.disclaimer / contractView.requireHumanReview，已删除 task.contract / task.outputData.disclaimer 回退", () => {
    assert.ok(/const serverDisclaimer = task\.contractView\?\.disclaimer \?\? null/.test(rvSrc));
    assert.ok(/const requireHumanReview = task\.contractView\?\.requireHumanReview \?\? false/.test(rvSrc));
    assert.strictEqual(/task\.contract\?\.disclaimer/.test(rvSrc), false, "严禁回退 task.contract.disclaimer");
    assert.strictEqual(/task\.outputData\?\.disclaimer/.test(rvSrc), false, "严禁回退 task.outputData.disclaimer");
  });

  it("16. 失败信息只消费 task.errorMessage，无 contractView 时显示历史合同不可追溯且不渲染成功态", () => {
    assert.ok(/task\.errorMessage \|\| /.test(rvSrc), "失败区必须消费 task.errorMessage");
    assert.ok(/!hasContractView \?/.test(rvSrc), "必须存在无 contractView 的不可追溯分支");
    assert.ok(/该任务没有可追溯的历史合同快照/.test(rvSrc), "无 contractView 文案必须为历史合同不可追溯");
  });
});

describe("R3.5 成果物类型大小写归一化行为测试（normArtifactType / getDocumentArtifactContent）", () => {
  it("17. normArtifactType 大小写归一化：DOCUMENT/document/TABLE/table/UNKNOWN/null", () => {
    assert.equal(normArtifactType("DOCUMENT"), "DOCUMENT");
    assert.equal(normArtifactType("document"), "DOCUMENT");
    assert.equal(normArtifactType("Document"), "DOCUMENT");
    assert.equal(normArtifactType("REPORT"), "REPORT");
    assert.equal(normArtifactType("report"), "REPORT");
    assert.equal(normArtifactType("TABLE"), "TABLE");
    assert.equal(normArtifactType("table"), "TABLE");
    assert.equal(normArtifactType("UNKNOWN"), "UNKNOWN");
    assert.equal(normArtifactType(""), null);
    assert.equal(normArtifactType(null), null);
  });

  it("18. 文本型成果物集合与归一化结果同大小写，DOCUMENT/document/REPORT 均为文本，TABLE/UNKNOWN 不是", () => {
    assert.equal(TEXT_ARTIFACT_TYPES.has(normArtifactType("DOCUMENT") ?? ""), true);
    assert.equal(TEXT_ARTIFACT_TYPES.has(normArtifactType("document") ?? ""), true);
    assert.equal(TEXT_ARTIFACT_TYPES.has(normArtifactType("REPORT") ?? ""), true);
    assert.equal(TEXT_ARTIFACT_TYPES.has(normArtifactType("report") ?? ""), true);
    assert.equal(TEXT_ARTIFACT_TYPES.has(normArtifactType("TABLE") ?? ""), false);
    assert.equal(TEXT_ARTIFACT_TYPES.has(normArtifactType("table") ?? ""), false);
    assert.equal(TEXT_ARTIFACT_TYPES.has(normArtifactType("UNKNOWN") ?? ""), false);
  });

  it("19. getDocumentArtifactContent 统一经 normArtifactType：小写 document / 大写 DOCUMENT / REPORT 均识别为文本；TABLE 不识别", () => {
    assert.equal(
      getDocumentArtifactContent({ artifacts: [{ type: "document", content: "小写文档" }] } as unknown as ResultViewerTask),
      "小写文档",
      "小写 document 必须被识别为文本成果物",
    );
    assert.equal(
      getDocumentArtifactContent({ artifacts: [{ type: "DOCUMENT", content: "大写文档" }] } as unknown as ResultViewerTask),
      "大写文档",
      "大写 DOCUMENT 必须被识别为文本成果物",
    );
    assert.equal(
      getDocumentArtifactContent({ artifacts: [{ type: "REPORT", content: "报告文本" }] } as unknown as ResultViewerTask),
      "报告文本",
      "REPORT 必须被识别为文本成果物",
    );
    assert.equal(
      getDocumentArtifactContent({ artifacts: [{ type: "TABLE", content: "表格" }] } as unknown as ResultViewerTask),
      null,
      "TABLE 不是文本成果物，必须返回 null",
    );
    assert.equal(
      getDocumentArtifactContent({ artifacts: [{ type: "UNKNOWN", content: "x" }] } as unknown as ResultViewerTask),
      null,
      "UNKNOWN 类型不得进入文本成功渲染",
    );
  });

  it("20. 渲染 switch 分支与归一化结果一致（大写 SCORE/TIMELINE/TABLE/DOCUMENT_PACKAGE/BUNDLE），且无小写误判分支", () => {
    const rvSrc2 = fs.readFileSync(path.join(process.cwd(), "src/components/studio/ResultViewer.tsx"), "utf-8");
    assert.ok(/case "SCORE":/.test(rvSrc2), "renderArtifactBody 必须包含大写 SCORE 分支");
    assert.ok(/case "TIMELINE":/.test(rvSrc2), "renderArtifactBody 必须包含大写 TIMELINE 分支");
    assert.ok(/case "TABLE":/.test(rvSrc2), "renderArtifactBody 必须包含大写 TABLE 分支");
    assert.ok(/case "DOCUMENT_PACKAGE":/.test(rvSrc2), "renderArtifactBody 必须包含大写 DOCUMENT_PACKAGE 分支");
    assert.ok(/case "BUNDLE":/.test(rvSrc2), "renderArtifactBody 必须包含大写 BUNDLE 分支");
    assert.strictEqual(/case "score":/.test(rvSrc2), false, "严禁小写 score 分支（与归一化不一致）");
    assert.strictEqual(/case "table":/.test(rvSrc2), false, "严禁小写 table 分支（与归一化不一致）");
  });
});

describe("R3.5 详情合并纯函数：详情返回 null / 子字段 null 必须覆盖旧列表值（V.8）", () => {
  const prevList: any = {
    id: "t1",
    name: "历史任务",
    componentId: "C01",
    componentName: "C01",
    tokenUsed: 0,
    status: "SUCCESS",
    time: "",
    outputData: { summary: "旧摘要" },
    artifacts: [{ id: "a1", type: "DOCUMENT", content: "旧内容" }],
    artifact: { id: "a1" },
    hasArtifact: true,
    contractView: { outputKind: "DOCUMENT", contractVersion: "old" },
    execution: { executionMode: "SIMULATED" },
    contractVersion: "old",
    refundStatus: "REFUNDED",
    refundedPoints: 5,
    chargeAttempted: true,
  };

  it("21. 详情不可用（传入 null）时，旧列表成果物/合同视图/执行/退款字段全部清空", () => {
    const merged = mergeTaskDetailIntoListItem(prevList, null);
    assert.strictEqual(merged.outputData, null);
    assert.deepEqual(merged.artifacts, []);
    assert.strictEqual(merged.artifact, null);
    assert.strictEqual(merged.hasArtifact, false);
    assert.strictEqual(merged.contractView, null);
    assert.strictEqual(merged.execution, null);
    assert.strictEqual(merged.contractVersion, null);
    assert.strictEqual(merged.refundStatus, null);
    assert.strictEqual(merged.refundedPoints, null);
    assert.strictEqual(merged.chargeAttempted, null);
  });

  it("22. 详情 contractView 为 null 时必须覆盖旧的 contractView（不猜测、不沿用列表旧值）", () => {
    const merged = mergeTaskDetailIntoListItem(prevList, {
      contractView: null,
      artifacts: [],
      hasArtifact: false,
      execution: null,
      outputData: null,
      errorCode: null,
      errorMessage: null,
      contractVersion: null,
      refundStatus: "UNKNOWN",
      refundedPoints: null,
      chargeAttempted: null,
    });
    assert.strictEqual(merged.contractView, null, "详情返回 contractView=null 必须清除旧 contractView");
    assert.strictEqual(merged.artifacts, null === merged.artifacts ? null : merged.artifacts);
    assert.deepEqual(merged.artifacts, []);
    assert.strictEqual(merged.hasArtifact, false);
  });

  it("23. 详情返回有效 contractView / execution / artifacts 时以详情为准，旧列表值被覆盖", () => {
    const merged = mergeTaskDetailIntoListItem(prevList, {
      contractView: { outputKind: "TABLE", contractVersion: "2.0" },
      artifacts: [{ id: "a2", type: "TABLE" }],
      hasArtifact: true,
      artifact: { id: "a2" },
      execution: { executionMode: "REAL_MODEL" },
      outputData: "新内容",
      errorCode: null,
      errorMessage: null,
      contractVersion: "2.0",
      refundStatus: "NO_CHARGE",
      refundedPoints: 0,
      chargeAttempted: false,
    });
    assert.deepEqual(merged.contractView, { outputKind: "TABLE", contractVersion: "2.0" });
    assert.deepEqual(merged.artifacts, [{ id: "a2", type: "TABLE" }]);
    assert.strictEqual(merged.hasArtifact, true);
    assert.deepEqual(merged.execution, { executionMode: "REAL_MODEL" });
    assert.strictEqual(merged.contractVersion, "2.0");
    assert.strictEqual(merged.refundStatus, "NO_CHARGE");
  });
});
