// 统一文档导出工具：Markdown + Word（真 .docx，docx 官方包生成）
//
// 设计说明：
// 1. Word 导出为真正的 .docx（Office Open XML），任何版本的 Word / WPS 均可直接打开，
//    废弃此前"HTML 包裹 + .doc 后缀"的假格式（Word 打不开 / 提示内容有问题）。
// 2. Markdown 块级解析支持：1~6 级标题、段落、无序/有序列表、引用、表格、代码块、水平线；
//    行内支持加粗 / 斜体 / 行内代码。
// 3. 本模块仅在导出函数被点击时触碰浏览器 API（Blob / URL），可在客户端组件中安全 import。

import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

// ── 行内解析：把 **加粗** *斜体* `代码` 拆成 TextRun ──

interface RunStyle {
  bold?: boolean;
  italics?: boolean;
}

function parseInlineRuns(text: string, base: RunStyle = {}): TextRun[] {
  const runs: TextRun[] = [];
  // 先按行内代码切分，再在普通文本里按 **加粗** / *斜体* 切分
  const codeParts = text.split(/(`[^`]+`)/g);
  for (const part of codeParts) {
    if (!part) continue;
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      runs.push(
        new TextRun({
          text: part.slice(1, -1),
          font: "Consolas",
          color: "B91C1C",
          size: 20,
          bold: base.bold,
        }),
      );
      continue;
    }
    const boldParts = part.split(/(\*\*[^*]+\*\*)/g);
    for (const bp of boldParts) {
      if (!bp) continue;
      if (bp.startsWith("**") && bp.endsWith("**") && bp.length > 4) {
        runs.push(new TextRun({ text: bp.slice(2, -2), bold: true }));
      } else {
        const italParts = bp.split(/(\*[^*]+\*)/g);
        for (const ip of italParts) {
          if (!ip) continue;
          if (ip.startsWith("*") && ip.endsWith("*") && ip.length > 2) {
            runs.push(new TextRun({ text: ip.slice(1, -1), italics: true }));
          } else {
            runs.push(new TextRun({ text: ip, bold: base.bold, italics: base.italics }));
          }
        }
      }
    }
  }
  return runs.length ? runs : [new TextRun({ text: "" })];
}

// ── 块级解析：Markdown 行 → docx 子元素 ──

const HEADING_MAP = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6,
];

function codeParagraphs(codeLines: string[]): Paragraph[] {
  return codeLines.map(
    (line) =>
      new Paragraph({
        children: [new TextRun({ text: line || " ", font: "Consolas", size: 18, color: "E6EDF3" })],
        shading: { type: ShadingType.CLEAR, fill: "0D1117", color: "auto" },
        spacing: { after: 0, line: 260 },
      }),
  );
}

function buildTable(header: string[], rows: string[][]): Table {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "CBD5E0" };
  const cellBorders = { top: border, bottom: border, left: border, right: border };
  const headerRow = new TableRow({
    tableHeader: true,
    children: header.map(
      (h) =>
        new TableCell({
          borders: cellBorders,
          shading: { type: ShadingType.CLEAR, fill: "EBF8FF", color: "auto" },
          children: [new Paragraph({ children: parseInlineRuns(h, { bold: true }) })],
        }),
    ),
  });
  const bodyRows = rows.map(
    (r) =>
      new TableRow({
        children: r.map(
          (c) =>
            new TableCell({
              borders: cellBorders,
              children: [new Paragraph({ children: parseInlineRuns(c) })],
            }),
        ),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...bodyRows],
  });
}

function markdownToDocxChildren(markdown: string): (Paragraph | Table)[] {
  const lines = (markdown || "").replace(/\r\n/g, "\n").split("\n");
  const children: (Paragraph | Table)[] = [];
  let i = 0;

  let inCode = false;
  let codeBuf: string[] = [];
  let tableBuf: string[] = [];

  const cellsOf = (l: string) => {
    let cells = l.split("|").map((c) => c.trim());
    if (cells.length && cells[0] === "") cells.shift();
    if (cells.length && cells[cells.length - 1] === "") cells.pop();
    return cells;
  };
  const flushTable = () => {
    if (tableBuf.length >= 2) {
      const header = cellsOf(tableBuf[0]);
      const rows = tableBuf
        .slice(1)
        .filter((l) => !/^[\s|:\-]+$/.test(l))
        .map(cellsOf);
      if (header.length) children.push(buildTable(header, rows));
    }
    tableBuf = [];
  };
  const flushCode = () => {
    if (codeBuf.length) children.push(...codeParagraphs(codeBuf));
    codeBuf = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 代码围栏 ```
    if (trimmed.startsWith("```")) {
      if (!inCode) {
        flushTable();
        inCode = true;
        codeBuf = [];
      } else {
        inCode = false;
        flushCode();
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i++;
      continue;
    }

    // 表格行
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      tableBuf.push(trimmed);
      i++;
      continue;
    }
    flushTable();

    // 空行
    if (!trimmed) {
      i++;
      continue;
    }

    // 标题（1~6 级）
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      children.push(
        new Paragraph({
          text: headingMatch[2],
          heading: HEADING_MAP[headingMatch[1].length - 1],
        }),
      );
      i++;
      continue;
    }

    // 水平线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      children.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CBD5E0" } },
          spacing: { after: 120 },
        }),
      );
      i++;
      continue;
    }

    // 无序列表
    if (/^[-*]\s+/.test(trimmed)) {
      children.push(
        new Paragraph({
          children: parseInlineRuns(trimmed.replace(/^[-*]\s+/, "")),
          bullet: { level: 0 },
        }),
      );
      i++;
      continue;
    }

    // 有序列表（保留编号文本 + 缩进，避免全局 numbering 配置）
    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (orderedMatch) {
      children.push(
        new Paragraph({
          children: parseInlineRuns(`${orderedMatch[1]}. ${orderedMatch[2]}`),
          indent: { left: 360 },
        }),
      );
      i++;
      continue;
    }

    // 引用
    if (trimmed.startsWith("> ")) {
      children.push(
        new Paragraph({
          children: parseInlineRuns(trimmed.slice(2)),
          indent: { left: 360 },
          border: { left: { style: BorderStyle.SINGLE, size: 12, color: "3182CE" } },
          spacing: { after: 80 },
        }),
      );
      i++;
      continue;
    }

    // 普通段落
    children.push(new Paragraph({ children: parseInlineRuns(trimmed), spacing: { after: 100 } }));
    i++;
  }

  flushTable();
  flushCode();
  return children;
}

// ── 复制到剪贴板（富文本 + 纯文本双通道）──

/** 把 Markdown 降为无符号的成文纯文本：标题/表格/列表均去掉井号、星号、竖线等标记 */
export function markdownToPlainText(markdown: string): string {
  const lines = (markdown || "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inCode = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      inCode = !inCode;
      out.push(inCode ? "" : "");
      continue;
    }
    if (inCode) {
      out.push(line);
      continue;
    }
    if (!trimmed) {
      out.push("");
      continue;
    }
    // 标题：去井号，加"【 】"强调（替代 Markdown 的层级视觉）
    const h = trimmed.match(/^#{1,6}\s+(.*)$/);
    if (h) {
      out.push(`【${h[1]}】`);
      continue;
    }
    // 表格行：竖线换成空格分隔，分隔行跳过
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      if (/^[\s|:\-]+$/.test(trimmed)) continue;
      const cells = trimmed.split("|").map((c) => c.trim()).filter((c, i, arr) => !(i === 0 && c === "") && !(i === arr.length - 1 && c === ""));
      out.push(cells.join("    "));
      continue;
    }
    // 水平线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      out.push("————————");
      continue;
    }
    // 引用
    if (trimmed.startsWith("> ")) {
      out.push(trimmed.slice(2));
      continue;
    }
    // 无序/有序列表：保留可读符号
    const plain = trimmed.replace(/^[-*]\s+/, "· ").replace(/^(\d+)\.\s+/, "$1. ");
    // 行内符号清除：加粗/斜体/行内代码
    out.push(
      plain
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1")
        .replace(/`([^`]+)`/g, "$1"),
    );
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * 复制富文本到剪贴板：text/html（Word 粘贴带排版）+ text/plain（无符号成文）双通道。
 * 环境不支持 ClipboardItem 时回退为纯文本复制。
 */
export async function copyRichText(html: string, plainText: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        }),
      ]);
      return true;
    }
  } catch {
    /* 回退纯文本 */
  }
  try {
    await navigator.clipboard.writeText(plainText);
    return true;
  } catch {
    return false;
  }
}


// ── Markdown → 自包含 HTML（供"复制全文"富文本通道；样式全部内联，粘贴进 Word 带排版）──

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function inlineMdHtml(text: string): string {
  let h = escapeHtml(text);
  h = h.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  h = h.replace(
    /`([^`]+)`/g,
    '<code style="font-family:Consolas,Menlo,monospace;background:#f1f5f9;padding:1px 4px;border-radius:3px;font-size:0.9em;color:#b91c1c;">$1</code>',
  );
  return h;
}

const WORD_CODE_STYLE =
  "background:#0d1117;color:#e6edf3;font-family:Consolas,'Courier New',monospace;padding:12px 14px;white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.55;";

function mdTableHtml(header: string[], rows: string[][]): string {
  const head =
    '<tr style="background:#ebf8ff;color:#2b6cb0;text-align:left;">' +
    header.map((c) => `<th style="border:1px solid #cbd5e0;padding:6px 10px;">${inlineMdHtml(c)}</th>`).join("") +
    "</tr>";
  const body = rows
    .map(
      (r) =>
        "<tr>" +
        r.map((c) => `<td style="border:1px solid #cbd5e0;padding:6px 10px;">${inlineMdHtml(c)}</td>`).join("") +
        "</tr>",
    )
    .join("");
  return `<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;font-size:13px;margin:10px 0;">${head}${body}</table>`;
}

const WORD_HEADING_STYLE: Record<number, string> = {
  1: "color:#1a365d;font-size:22px;margin:18px 0 10px;border-bottom:2px solid #3182ce;padding-bottom:6px;",
  2: "color:#2b6cb0;font-size:18px;margin:16px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;",
  3: "color:#2d3748;font-size:15px;margin:14px 0 6px;",
  4: "color:#2d3748;font-size:13px;margin:12px 0 4px;",
  5: "color:#4a5568;font-size:12px;margin:10px 0 4px;",
  6: "color:#4a5568;font-size:12px;margin:8px 0 4px;",
};

function isMdBlockStart(t: string): boolean {
  return (
    /^(#{1,6}\s|[-*]\s|\d+\.\s|>\s|```)/.test(t) ||
    t.startsWith("|") ||
    /^(-{3,}|\*{3,}|_{3,})$/.test(t)
  );
}

/** 将 Markdown 转换为自包含内联样式的 HTML 片段（不含 html/body 壳，粘贴与导出均可用） */
export function markdownToWordHtml(markdown: string): string {
  const lines = (markdown || "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let inCode = false;
  let codeBuf: string[] = [];
  let tableBuf: string[] = [];
  let paraBuf: string[] = [];

  const flushPara = () => {
    if (paraBuf.length) {
      out.push(`<p style="margin:0 0 10px;line-height:1.7;">${inlineMdHtml(paraBuf.join(" "))}</p>`);
      paraBuf = [];
    }
  };
  const cellsOf = (l: string) => {
    let cells = l.split("|").map((c) => c.trim());
    if (cells.length && cells[0] === "") cells.shift();
    if (cells.length && cells[cells.length - 1] === "") cells.pop();
    return cells;
  };
  const flushTable = () => {
    if (tableBuf.length >= 2) {
      const header = cellsOf(tableBuf[0]);
      const rows = tableBuf
        .slice(1)
        .filter((l) => !/^[\s|:\-]+$/.test(l))
        .map(cellsOf);
      if (header.length) out.push(mdTableHtml(header, rows));
    }
    tableBuf = [];
  };
  const flushCode = () => {
    if (codeBuf.length) {
      out.push(`<pre style="${WORD_CODE_STYLE}">${escapeHtml(codeBuf.join("\n"))}</pre>`);
    }
    codeBuf = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushPara();
      flushTable();
      if (!inCode) {
        inCode = true;
        codeBuf = [];
      } else {
        inCode = false;
        flushCode();
      }
      i++;
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      i++;
      continue;
    }
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushPara();
      tableBuf.push(trimmed);
      i++;
      continue;
    }
    flushTable();

    if (!trimmed) {
      flushPara();
      i++;
      continue;
    }

    const h = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      const level = h[1].length;
      out.push(`<h${level} style="${WORD_HEADING_STYLE[level]}">${inlineMdHtml(h[2])}</h${level}>`);
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flushPara();
      out.push('<hr style="border:none;border-top:1px solid #cbd5e0;margin:14px 0;">');
      i++;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushPara();
      out.push(`<p style="margin:0 0 6px 18px;line-height:1.7;">• ${inlineMdHtml(trimmed.replace(/^[-*]\s+/, ""))}</p>`);
      i++;
      continue;
    }

    const om = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (om) {
      flushPara();
      out.push(`<p style="margin:0 0 6px 18px;line-height:1.7;">${om[1]}. ${inlineMdHtml(om[2])}</p>`);
      i++;
      continue;
    }

    if (trimmed.startsWith("> ")) {
      flushPara();
      out.push(
        `<p style="margin:0 0 8px 18px;padding-left:10px;border-left:3px solid #3182ce;color:#4a5568;line-height:1.7;">${inlineMdHtml(trimmed.slice(2))}</p>`,
      );
      i++;
      continue;
    }

    paraBuf.push(trimmed);
    i++;
  }

  flushPara();
  flushTable();
  flushCode();
  return out.join("\n");
}

// ── 下载触发 ──

function sanitizeFilename(title: string): string {
  return (title || "文档").replace(/[\\/:*?"<>|\n\r]/g, "_").slice(0, 60);
}

function fileTimestamp(): string {
  const n = new Date();
  const p = (v: number) => String(v).padStart(2, "0");
  return `${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}_${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}`;
}

async function triggerBlobDownload(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── 对外 API ──

/** 导出为 Markdown 文件（.md）。 */
export function exportDocumentAsMarkdown(title: string, markdown: string): void {
  triggerBlobDownload(
    new Blob([markdown], { type: "text/markdown;charset=utf-8;" }),
    `${sanitizeFilename(title)}_${fileTimestamp()}.md`,
  );
}

/**
 * 导出为真正的 Word 文档（.docx，Office Open XML）。
 * 兼容所有版本的 Word / WPS，无需格式转换提示。
 */
export async function exportDocumentAsWord(title: string, markdown: string): Promise<void> {
  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Microsoft YaHei", size: 21 } },
      },
    },
    sections: [
      {
        properties: {},
        children: markdownToDocxChildren(markdown),
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  await triggerBlobDownload(blob, `${sanitizeFilename(title)}_${fileTimestamp()}.docx`);
}
