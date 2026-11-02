/**
 * DocumentContentRenderer 回归测试（纯渲染断言，使用 renderToString）
 *
 * 证据性质：本文件仅对 DocumentContentRenderer 组件做服务端字符串渲染，
 * 验证两个已修复的渲染 bug：
 *   (A) 多级标题预处理不再把连续的井号拆出孤立“#”段落、也不再把 ### 降级；
 *   (B) isSpreadsheetDoc 按“行”统计真正的表格分隔行，含一个真表格的文档
 *       只挂一次“结构化数据报表”横幅，不再误判。
 * 不调用真实模型 / 数据库 / 生产业务验收。
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToString } from "react-dom/server";
import DocumentContentRenderer from "@/components/docs/DocumentContentRenderer";

function render(content: string, title = "平台介绍与核心概念"): string {
  return renderToString(<DocumentContentRenderer content={content} title={title} />);
}

// 混合内容：# / ## / ### / #### / 正文后紧贴标题 / 表格 / 代码块
const MIXED = [
  "# 一级总览",
  "",
  "## 二级能力",
  "",
  "### 三级细节",
  "",
  "#### 四级说明",
  "",
  "正文段落：下面紧跟## 跟随正文的二级标题，应被补换行而非拆成孤立井号。",
  "",
  "普通正文另一段。",
  "",
  "| 指标 | 数值 |",
  "| --- | --- |",
  "| CPU 使用率 | 90% |",
  "| 内存占用 | 60% |",
  "",
  "```python",
  "def hello():",
  "    print('hi')",
  "```",
].join("\n");

describe("DocumentContentRenderer 标题预处理与报表横幅（DOC-FIX-1）", () => {
  it("混合内容：不存在仅含 # 的孤立段落节点", () => {
    const html = render(MIXED);
    // 旧 bug：## / # 被拆成单独成行的“##”/“#”，落入普通段落渲染为仅含井号的 <p>。
    assert.ok(
      !/<p[^>]*>\s*#+\s*<\/p>/.test(html),
      "不应存在仅含 # 的孤立段落节点（如 <p>##</p>）",
    );
  });

  it("## 命中二级标题样式分支，且未被降级", () => {
    const html = render(MIXED);
    assert.ok(
      html.includes("bg-blue-50/60 border-l-3 border-[#3182ce]"),
      "## 应渲染二级标题分支（bg-blue-50/60 border-l-3）",
    );
    assert.ok(html.includes("二级能力"), "应出现二级标题文本");
    assert.ok(html.includes("跟随正文的二级标题"), "正文后紧贴的 ## 应补换行并命中二级分支");
  });

  it("### 命中三级标题样式分支（未被降级为二级/一级）", () => {
    const html = render(MIXED);
    assert.ok(
      html.includes('<h4 class="mt-4 mb-2 text-xs font-bold text-slate-800 flex items-center gap-1.5">'),
      "### 应渲染三级标题分支（<h4 ...>）",
    );
    assert.ok(html.includes("三级细节"), "应出现三级标题文本");
  });

  it("#### 作为未分级标题落入普通段落，但不产生孤立井号段落", () => {
    const html = render(MIXED);
    assert.ok(html.includes("四级说明"), "#### 标题文本应出现在输出中");
    assert.ok(!/<p[^>]*>\s*#+\s*<\/p>/.test(html), "#### 不应产生仅含井号的孤立段落");
  });

  it("表格正常渲染，且报表横幅只出现一次", () => {
    const html = render(MIXED);
    assert.ok(html.includes("<table"), "含表格的文档应正常渲染 <table>");
    const bannerCount = html.split("结构化数据报表与履约考核矩阵").length - 1;
    assert.equal(bannerCount, 1, "报表横幅应恰好出现一次");
  });

  it("无表格的纯文档不应挂报表横幅", () => {
    const noTable = [
      "# 一级总览",
      "",
      "## 二级能力",
      "",
      "### 三级细节",
      "",
      "普通正文段落。",
    ].join("\n");
    const html = render(noTable);
    assert.ok(
      !html.includes("结构化数据报表与履约考核矩阵"),
      "无表格文档不应挂“结构化数据报表”横幅",
    );
    assert.ok(html.includes("<table") === false, "无表格文档不应渲染 <table>");
  });
});
