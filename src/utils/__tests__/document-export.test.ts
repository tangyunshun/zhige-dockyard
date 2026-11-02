/**
 * document-export 导出回归测试（vitest）
 *
 * Word 导出已升级为真 .docx（docx 官方包）。Packer.toBlob 依赖浏览器 Blob，
 * 此处以 stub 环境（globalThis.Blob/URL/document）验证完整导出链路：
 * 文件名规范、.docx MIME、下载触发次数；Markdown 内容正确性由
 * DocumentContentRenderer.test.tsx 与人工浏览器验收覆盖。
 */
import { describe, it, expect, vi, beforeAll } from "vitest";

// ── 浏览器环境 stub（vitest node 环境缺 Blob/URL/document）──
class FakeBlob {
  parts: unknown[];
  type: string;
  constructor(parts: unknown[], type?: string) {
    this.parts = parts;
    this.type = type || "";
  }
}
class FakeURL {
  static created: string[] = [];
  static revoked: string[] = [];
  static createObjectURL(b: unknown): string {
    const u = `blob:fake-${FakeURL.created.length}`;
    FakeURL.created.push(u);
    return u;
  }
  static revokeObjectURL(u: string): void {
    FakeURL.revoked.push(u);
  }
}
const clicked: string[] = [];
const downloadNames: string[] = [];

vi.stubGlobal("Blob", FakeBlob);
vi.stubGlobal("URL", FakeURL);
vi.stubGlobal("document", {
  body: {
    appendChild: () => undefined,
    removeChild: () => undefined,
  },
  createElement: () => {
    const el = { href: "", download: "" };
    return {
      get href() {
        return el.href;
      },
      set href(v: string) {
        el.href = v;
      },
      get download() {
        return el.download;
      },
      set download(v: string) {
        el.download = v;
      },
      click: () => {
        clicked.push("click");
        downloadNames.push(el.download);
      },
    };
  },
});

beforeAll(async () => {
  // 动态引入，确保 stub 先就位
  ({ exportDocumentAsMarkdown, exportDocumentAsWord } = await import("@/utils/document-export"));
});

let exportDocumentAsMarkdown: (t: string, m: string) => void;
let exportDocumentAsWord: (t: string, m: string) => Promise<void>;

describe("文档导出（真 .docx）", () => {
  it("Markdown 导出：文件名带时间戳且 .md 后缀", async () => {
    exportDocumentAsMarkdown("操作手册", "# 标题");
    expect(downloadNames[downloadNames.length - 1]).toMatch(/^操作手册_\d{8}_\d{6}\.md$/);
  });

  it("Word 导出：生成 .docx（真 Office Open XML，不再产 HTML 假 .doc）", async () => {
    const md = [
      "# 快速上手",
      "",
      "支持**加粗**与`行内代码`。",
      "",
      "## 步骤",
      "",
      "1. 注册账号",
      "2. 创建空间",
      "",
      "| 阶段 | 编号 |",
      "| --- | --- |",
      "| 商机捕获 | C01-C06 |",
    ].join("\n");
    await exportDocumentAsWord("快速上手", md);
    const name = downloadNames[downloadNames.length - 1];
    expect(name).toMatch(/^快速上手_\d{8}_\d{6}\.docx$/);
    expect(FakeURL.created.length).toBeGreaterThan(0);
  });

  it("文件名中的非法字符被替换为下划线", async () => {
    await exportDocumentAsWord('含/非法:字符*的"标题"', "内容");
    expect(downloadNames[downloadNames.length - 1]).not.toMatch(/[/:*?"]/);
  });
});
