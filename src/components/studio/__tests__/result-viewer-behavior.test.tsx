/**
 * ResultViewer 行为测试（纯渲染断言，非 HTTP/集成测试，使用 fake 任务对象）
 *
 * 证据性质：本文件仅对 ResultViewer 组件做服务端字符串渲染（renderToString），
 * 验证其执行元数据与成果物“来源单轨、缺失不猜测、失败禁用”的可见行为；
 * 不调用真实模型、真实数据库、真实扣点或生产业务验收。
 *
 * 覆盖（CORE-3-R3.6 / R3.7 前端回归）：
 * 1. 无 task.execution → 显示执行信息缺失，不猜测真实/模拟。
 * 2. 只有顶层旧字段（无 task.execution）→ 不得显示顶层旧 provider/model/合同版本。
 * 3. contractView 为 null 且不带成果物 → 不渲染成功文档正文；带成果物时正常渲染。
 * 4. 失败任务（status FAILED，无成果物）→ 复制/导出按钮禁用。
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import ResultViewer, { type ResultViewerTask } from "@/components/studio/ResultViewer";
import { ToastProvider } from "@/components/Toast";

function render(task: ResultViewerTask): string {
  return renderToString(
    <ToastProvider>
      <ResultViewer task={task} />
    </ToastProvider>,
  );
}

describe("ResultViewer 行为（来源单轨 + 失败禁用，纯渲染断言）", () => {
  it("无 task.execution 时显示执行信息缺失，不猜测真实/模拟", () => {
    const html = render({ id: "t1", status: "SUCCESS", name: "x", componentId: "C01", execution: undefined } as unknown as ResultViewerTask);
    assert.ok(html.includes("执行信息缺失"), "缺失 execution 应显示执行信息缺失（EMPTY_EXECUTION，不猜测真实/模拟）");
  });

  it("只有顶层旧字段（无 task.execution）时，不得显示顶层旧 provider/model/合同版本", () => {
    // 顶层旧字段（应被忽略，不得回退显示）：用 Record 中间变量绕过字面量多余属性检查
    const legacyHtmlTask: Record<string, unknown> = {
      id: "t2",
      status: "SUCCESS",
      name: "x",
      componentId: "C01",
      execution: undefined,
      executionMode: "REAL_MODEL",
      provider: { id: "legacy-provider-x" },
      model: "legacy-model-x",
      contractVersion: "legacy-v-x",
      billingMode: "ESTIMATED",
    };
    const html = render(legacyHtmlTask as unknown as ResultViewerTask);
    assert.ok(!html.includes("legacy-provider-x"), "不得回退显示顶层旧 provider");
    assert.ok(!html.includes("legacy-model-x"), "不得回退显示顶层旧 model");
    assert.ok(!html.includes("legacy-v-x"), "不得回退显示顶层旧合同版本");
    assert.ok(html.includes("执行信息缺失"), "仍应显示执行信息缺失（来自 EMPTY_EXECUTION）");
  });

  it("contractView 为 null 且不带成果物 → 不渲染成功文档正文；带成果物时正常渲染", () => {
    const missing = render({
      id: "t3",
      status: "SUCCESS",
      name: "x",
      componentId: "C01",
      execution: undefined,
      contractView: null,
      artifacts: [],
    });
    assert.ok(!missing.includes("合规结论-缺失对照"), "无成果物时不得渲染成功文档正文");

    const present = render({
      id: "t3b",
      status: "SUCCESS",
      name: "x",
      componentId: "C01",
      execution: undefined,
      contractView: { outputKind: "DOCUMENT", artifactMime: "text/markdown", rendererType: "MARKDOWN_DOCUMENT" },
      artifacts: [{ id: "a1", type: "DOCUMENT", title: "合规结论-测试", mimeType: "text/markdown", content: "合规结论-测试正文" }],
    });
    assert.ok(present.includes("合规结论-测试正文"), "带成果物时应正常渲染成功文档正文");
  });

  it("失败任务（status FAILED，无成果物）复制与导出按钮禁用", () => {
    const html = render({
      id: "t4",
      status: "FAILED",
      errorCode: "MODEL_UPSTREAM_ERROR",
      errorMessage: "上游模型失败",
      name: "x",
      componentId: "C01",
      execution: undefined,
      contractView: null,
      artifacts: [],
    });
    assert.ok(html.includes("disabled"), "失败任务复制/导出按钮应禁用");
  });

  it("C07 当前合同 requireHumanReview=false 且未下发免责声明：页面不得显示人工复核要求", () => {
    const html = render({
      id: "t7",
      status: "SUCCESS",
      name: "C07 会议纪要转需求",
      componentId: "C07",
      execution: undefined,
      // C07 当前激活合同：requireHumanReview=false，无 disclaimerPolicy（与 DB 只读核对一致）
      contractView: { requireHumanReview: false },
      artifacts: [{ id: "a1", type: "DOCUMENT", title: "需求纪要", mimeType: "text/markdown", content: "需求纪要正文" }],
    });
    assert.strictEqual(html.includes("人工复核"), false, "C07 requireHumanReview=false 不得显示人工复核声明");
    assert.strictEqual(html.includes("需人工复核"), false, "C07 不得显示需人工复核");
    assert.ok(html.includes("该任务绑定合同未下发专用免责声明文本"), "C07 无免责声明时显示中性提示");
  });
});
