"use client";

import React, { useState, useMemo } from "react";
import {
  Code,
  Check,
  Copy,
  Terminal,
  FileCode,
  FileText,
  Bookmark,
  AlertTriangle,
  Info,
  ChevronRight,
  Hash,
} from "lucide-react";

interface DocumentContentRendererProps {
  content: string;
  title?: string;
  category?: string;
  codeSample?: string;
}

/** 语法关键词染色（支持 Python、SQL、JavaScript 等常见语言） */
function syntaxHighlight(code: string, language: string = "python"): string {
  // 简易安全逃逸，防止 XSS
  let escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 1. 注释高亮 (如 # 注释 或 // 注释)
  escaped = escaped.replace(
    /(#[^\n]*|\/\/[^\n]*)/g,
    '<span class="text-slate-400 italic font-normal">$1</span>'
  );

  // 2. 字符串高亮 (支持单双引号)
  escaped = escaped.replace(
    /(".*?"|'.*?'|`.*?`)/g,
    '<span class="text-emerald-400">$1</span>'
  );

  // 3. 常见关键字微高亮
  const keywords = [
    "from", "import", "def", "class", "return", "if", "elif", "else",
    "for", "while", "try", "except", "finally", "with", "as", "in", "is",
    "not", "and", "or", "None", "True", "False", "async", "await", "lambda",
    "SELECT", "FROM", "WHERE", "INSERT", "UPDATE", "DELETE", "JOIN", "LEFT",
    "RIGHT", "INNER", "GROUP BY", "ORDER BY", "HAVING", "LIMIT", "TABLE",
    "CREATE", "DROP", "ALTER", "const", "let", "var", "function", "export", "default"
  ];

  const keywordRegex = new RegExp(`\\b(${keywords.join("|")})\\b`, "g");
  escaped = escaped.replace(
    keywordRegex,
    '<span class="text-sky-300 font-bold">$1</span>'
  );

  // 4. 数字高亮
  escaped = escaped.replace(
    /\b(\d+(\.\d+)?)\b/g,
    '<span class="text-amber-300">$1</span>'
  );

  return escaped;
}

/** 判断文本是否本质上是一段纯代码/脚本文件 */
function isCodeScript(content: string, title?: string): boolean {
  if (!content) return false;
  const lowerTitle = (title || "").toLowerCase();
  if (
    lowerTitle.endsWith(".py") ||
    lowerTitle.endsWith(".sql") ||
    lowerTitle.endsWith(".sh") ||
    lowerTitle.endsWith(".js") ||
    lowerTitle.endsWith(".ts") ||
    lowerTitle.endsWith(".json")
  ) {
    return true;
  }

  const lines = content.trim().split("\n").filter(Boolean);
  if (lines.length === 0) return false;

  // 代码特征嗅探
  const codeKeywords = [
    "import ",
    "from ",
    "def ",
    "class ",
    "SELECT ",
    "CREATE TABLE",
    "pypdfium2",
    "openpyxl",
    "require(",
    "module.exports",
    "export default",
    "#!/bin/bash",
  ];

  let codeMatches = 0;
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const l = lines[i].trim();
    if (codeKeywords.some((k) => l.startsWith(k) || l.includes(k))) {
      codeMatches++;
    }
  }

  return codeMatches >= 2 || (lines.length > 3 && codeMatches >= 1 && !content.includes("# ") && !content.includes("## "));
}

/** 推断代码语言类型 */
function detectLanguage(content: string, title?: string): string {
  const lowerTitle = (title || "").toLowerCase();
  if (lowerTitle.endsWith(".py") || content.includes("def ") || content.includes("import openpyxl") || content.includes("import pypdfium2")) {
    return "python";
  }
  if (lowerTitle.endsWith(".sql") || content.includes("SELECT ") || content.includes("CREATE TABLE")) {
    return "sql";
  }
  if (lowerTitle.endsWith(".sh") || content.startsWith("#!/bin/")) {
    return "bash";
  }
  if (lowerTitle.endsWith(".json")) {
    return "json";
  }
  if (lowerTitle.endsWith(".ts") || lowerTitle.endsWith(".tsx")) {
    return "typescript";
  }
  return "text";
}

/** 行内 Markdown 基础样式解析（支持加粗、行内代码、<br/>换行、HTML实体换行） */
function parseInlineMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];

  // 将 <br/>、<br> 或 HTML 实体换行 &#10; 拆分为换行元素
  const lines = text.split(/(?:<br\s*\/?>|&#10;|&#13;|\r?\n)/gi);
  const renderedLines: React.ReactNode[] = [];

  lines.forEach((lineText, lineIdx) => {
    if (lineIdx > 0) {
      renderedLines.push(<br key={`br-${lineIdx}`} />);
    }

    const parts: React.ReactNode[] = [];
    const regex = /(\*\*.*?\*\*|`.*?`)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(lineText)) !== null) {
      if (match.index > lastIndex) {
        parts.push(lineText.slice(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith("**") && token.endsWith("**")) {
        parts.push(
          <strong key={`b-${lineIdx}-${match.index}`} className="font-black text-slate-900 bg-amber-50/50 px-0.5 rounded">
            {token.slice(2, -2)}
          </strong>
        );
      } else if (token.startsWith("`") && token.endsWith("`")) {
        parts.push(
          <code
            key={`c-${lineIdx}-${match.index}`}
            className="px-1.5 py-0.5 rounded bg-slate-100 text-[#2b6cb0] font-mono text-[11px] font-semibold border border-slate-200/80 mx-0.5"
          >
            {token.slice(1, -1)}
          </code>
        );
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < lineText.length) {
      parts.push(lineText.slice(lastIndex));
    }

    renderedLines.push(...parts);
  });

  return renderedLines;
}

/** Markdown 表格专用解析器与大厂规范样式渲染 */
function renderMarkdownTable(lines: string[], keyPrefix: string) {
  if (lines.length < 2) return null;

  const parseRow = (line: string) => {
    return line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  };

  const headerCells = parseRow(lines[0]);
  // 严格过滤掉第二行分割线（如 | :---: | --- |）
  const rows = lines.slice(1).filter((l) => !/^[\|\s:\-]+$/.test(l)).map((l) => parseRow(l));

  return (
    <div key={keyPrefix} className="my-4 overflow-x-auto rounded-xl border border-slate-200/90 shadow-2xs bg-white max-w-full">
      <table className="w-full text-left border-collapse min-w-[680px]">
        <thead>
          <tr className="bg-slate-100/95 border-b border-slate-200 sticky top-0 z-1 shadow-2xs">
            {headerCells.map((header, i) => (
              <th
                key={i}
                className="px-3.5 py-2.5 text-xs font-black text-slate-700 tracking-wide whitespace-nowrap border-r border-slate-200/60 last:border-r-0 bg-slate-100/95"
              >
                {parseInlineMarkdown(header)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((row, rIdx) => (
            <tr
              key={rIdx}
              className={`hover:bg-blue-50/50 transition-colors ${
                rIdx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
              }`}
            >
              {row.map((cell, cIdx) => (
                <td
                  key={cIdx}
                  className="px-3.5 py-2.5 text-xs text-slate-600 font-medium leading-relaxed border-r border-slate-200/40 last:border-r-0 align-top"
                >
                  {parseInlineMarkdown(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 单个代码块容器（带行号、复制、语言标签与微语法高亮） */
function CodeBlockView({
  code,
  language = "python",
  title,
}: {
  code: string;
  language?: string;
  title?: string;
}) {
  const [copied, setCopied] = useState(false);
  const codeLines = useMemo(() => code.trim().split("\n"), [code]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-2xl border border-slate-800 bg-[#0d1117] text-slate-200 overflow-hidden shadow-xl text-left">
      {/* 顶部控制栏 */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#161b22] border-b border-slate-800">
        <div className="flex items-center gap-2">
          {/* Mac 风格三色圆点 */}
          <div className="flex items-center gap-1.5 mr-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block"></span>
          </div>
          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-sky-400 font-mono text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 border border-slate-700/60">
            <Code className="w-3 h-3" />
            {language}
          </span>
          {title && (
            <span className="text-[11px] font-mono text-slate-400 font-medium truncate max-w-[280px]">
              {title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-mono text-slate-500 hidden sm:inline">
            {codeLines.length} 行 · {code.length} 字符
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-[11px] font-bold flex items-center gap-1 transition-colors border border-slate-700 cursor-pointer shadow-xs active:scale-95"
            title="复制代码到剪贴板"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">已复制</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-slate-400" />
                <span>复制代码</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 代码内容区域（带行号） */}
      <div className="p-4 font-mono text-xs leading-relaxed overflow-x-auto custom-scrollbar flex">
        {/* 行号列 */}
        <div className="select-none pr-4 text-right text-slate-600 font-mono text-xs shrink-0 border-r border-slate-800/80 mr-4">
          {codeLines.map((_, i) => (
            <div key={i} className="leading-6">
              {i + 1}
            </div>
          ))}
        </div>

        {/* 语法高亮代码体 */}
        <pre className="flex-1 font-mono text-xs leading-6 overflow-x-auto custom-scrollbar whitespace-pre text-slate-200">
          <code
            dangerouslySetInnerHTML={{
              __html: codeLines
                .map((line) => syntaxHighlight(line, language))
                .join("\n"),
            }}
          />
        </pre>
      </div>
    </div>
  );
}

/** 主文档渲染组件 */
export default function DocumentContentRenderer({
  content,
  title,
  category,
  codeSample,
}: DocumentContentRendererProps) {
  // 1. 判断是否为纯代码脚本类文档（如截图 2、3）
  const isPureScript = useMemo(
    () => isCodeScript(content, title),
    [content, title]
  );
  const detectedLang = useMemo(
    () => detectLanguage(content, title),
    [content, title]
  );

  // 如果整篇文档就是一段可执行脚本/代码，直接以专业级代码编辑器视图渲染！
  if (isPureScript) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-3.5 rounded-full bg-[#3182ce]" />
            <span className="text-xs font-black text-slate-800">
              🛠️ 脚本源文件与运行规范
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-medium">
            可直接复制并在本地沙箱或终端中执行
          </span>
        </div>
        <CodeBlockView
          code={content}
          language={detectedLang}
          title={title}
        />
      </div>
    );
  }

  // 2. 针对 Markdown 技术规范、SOP、法律条款文档进行智能流式结构化排版
  const parsedElements = useMemo(() => {
    if (!content) return [];

    // 智能预处理：如果一段很长的条款中包含连续的“第一章... 第二章...”，自动在其前面注入换行符
    let normalized = content;
    normalized = normalized.replace(/([^\n])\s*(第[一二三四五六七八九十]+章)/g, "$1\n\n$2");
    normalized = normalized.replace(/([^\n])\s*(【(?:核心提示|重要提示|严禁红线|违规处理|用户成果所有权|AI 生成内容权利归属|数据保密承诺)】)/g, "$1\n\n$2");
    normalized = normalized.replace(/([^\n])\s*(##\s+)/g, "$1\n\n$2");
    normalized = normalized.replace(/([^\n])\s*(#\s+)/g, "$1\n\n$2");

    const rawLines = normalized.split("\n");
    const elements: React.ReactNode[] = [];

    let tableBuffer: string[] = [];
    let inCodeBlock = false;
    let codeBuffer: string[] = [];
    let codeLang = "bash";

    const flushTable = (keyIdx: number) => {
      if (tableBuffer.length >= 2) {
        elements.push(renderMarkdownTable(tableBuffer, `tbl-${keyIdx}`));
      }
      tableBuffer = [];
    };

    const flushCodeBlock = (keyIdx: number) => {
      if (codeBuffer.length > 0) {
        elements.push(
          <CodeBlockView
            key={`code-block-${keyIdx}`}
            code={codeBuffer.join("\n")}
            language={codeLang || "python"}
          />
        );
      }
      codeBuffer = [];
      inCodeBlock = false;
    };

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();

      // 代码块围栏 ```
      if (trimmed.startsWith("```")) {
        if (inCodeBlock) {
          flushCodeBlock(i);
        } else {
          flushTable(i);
          inCodeBlock = true;
          codeLang = trimmed.slice(3).trim() || "python";
        }
        continue;
      }

      if (inCodeBlock) {
        codeBuffer.push(line);
        continue;
      }

      // 表格行判断（以 | 开头且包含 |）
      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        tableBuffer.push(trimmed);
        continue;
      } else if (tableBuffer.length > 0) {
        flushTable(i);
      }

      // 空行跳过
      if (!trimmed) {
        continue;
      }

      // 法律章节标题（如“第一章 导言与协议生效”）
      if (/^第[一二三四五六七八九十]+章/.test(trimmed)) {
        elements.push(
          <div
            key={`chapter-${i}`}
            className="mt-6 mb-3 p-3 bg-gradient-to-r from-blue-50/90 via-indigo-50/40 to-white rounded-xl border-l-4 border-[#3182ce] shadow-2xs flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-[#3182ce]" />
              <h3 className="text-xs sm:text-sm font-black text-slate-800 tracking-tight">
                {trimmed}
              </h3>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100/60 text-[#2b6cb0] font-bold font-mono">
              条款章节
            </span>
          </div>
        );
        continue;
      }

      // 一级 Markdown 标题 `# 标题`
      if (trimmed.startsWith("# ")) {
        elements.push(
          <div
            key={`h1-${i}`}
            className="mt-6 mb-3 pb-2 border-b border-slate-200/90 flex items-center gap-2"
          >
            <div className="w-2.5 h-4 rounded-full bg-[#3182ce]" />
            <h2 className="text-sm sm:text-base font-black text-slate-800 tracking-tight">
              {trimmed.slice(2)}
            </h2>
          </div>
        );
        continue;
      }

      // 二级 Markdown 标题 `## 标题`
      if (trimmed.startsWith("## ")) {
        elements.push(
          <div
            key={`h2-${i}`}
            className="mt-5 mb-2.5 flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-blue-50/60 border-l-3 border-[#3182ce]"
          >
            <Hash className="w-3.5 h-3.5 text-[#3182ce]" />
            <h3 className="text-xs sm:text-sm font-extrabold text-slate-800 tracking-tight">
              {trimmed.slice(3)}
            </h3>
          </div>
        );
        continue;
      }

      // 三级 Markdown 标题 `### 标题`
      if (trimmed.startsWith("### ")) {
        elements.push(
          <h4
            key={`h3-${i}`}
            className="mt-4 mb-2 text-xs font-bold text-slate-800 flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#3182ce]"></span>
            <span>{trimmed.slice(4)}</span>
          </h4>
        );
        continue;
      }

      // 核心警示 / 提示高亮卡片
      if (
        trimmed.includes("【核心提示") ||
        trimmed.includes("【严禁红线】") ||
        trimmed.includes("【违规处理") ||
        trimmed.includes("【重要提示】")
      ) {
        elements.push(
          <div
            key={`warn-${i}`}
            className="my-3 p-3 bg-amber-50/90 rounded-xl border border-amber-200 text-amber-900 text-xs font-medium leading-relaxed flex items-start gap-2 shadow-2xs"
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">{parseInlineMarkdown(trimmed)}</div>
          </div>
        );
        continue;
      }

      // 有序步骤列表（如 `1. 标题`）
      const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
      if (orderedMatch) {
        elements.push(
          <div
            key={`ordered-${i}`}
            className="my-1.5 flex items-start gap-2.5 pl-1 text-xs text-slate-700 leading-relaxed group"
          >
            <span className="w-5 h-5 rounded-full bg-blue-50 border border-blue-200/80 text-[#3182ce] font-mono font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-[#3182ce] group-hover:text-white transition-colors">
              {orderedMatch[1]}
            </span>
            <div className="flex-1 font-medium">
              {parseInlineMarkdown(orderedMatch[2])}
            </div>
          </div>
        );
        continue;
      }

      // 无序列表（如 `- 事项` 或 `* 事项`）
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        elements.push(
          <div
            key={`unordered-${i}`}
            className="my-1.5 flex items-start gap-2.5 pl-2 text-xs text-slate-700 leading-relaxed"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-[#3182ce] shrink-0 mt-2"></div>
            <div className="flex-1 font-medium">
              {parseInlineMarkdown(trimmed.slice(2))}
            </div>
          </div>
        );
        continue;
      }

      // 引用块（如 `> 提示`）
      if (trimmed.startsWith("> ")) {
        elements.push(
          <div
            key={`quote-${i}`}
            className="my-3 p-3 bg-blue-50/50 rounded-xl border-l-4 border-[#3182ce] text-slate-700 text-xs font-medium leading-relaxed"
          >
            {parseInlineMarkdown(trimmed.slice(2))}
          </div>
        );
        continue;
      }

      // 普通段落正文
      elements.push(
        <p
          key={`p-${i}`}
          className="my-2 text-xs text-slate-700 leading-relaxed font-normal tracking-wide"
        >
          {parseInlineMarkdown(trimmed)}
        </p>
      );
    }

    if (tableBuffer.length > 0) {
      flushTable(rawLines.length);
    }
    if (inCodeBlock && codeBuffer.length > 0) {
      flushCodeBlock(rawLines.length);
    }

    return elements;
  }, [content]);

  const isSpreadsheetDoc = useMemo(() => {
    const lowerTitle = (title || "").toLowerCase();
    return (
      lowerTitle.endsWith(".xlsx") ||
      lowerTitle.endsWith(".xls") ||
      lowerTitle.endsWith(".csv") ||
      (content && (content.match(/\|\s*:?---+:?\s*\|/g) || []).length >= 2)
    );
  }, [title, content]);

  return (
    <div className="space-y-1 text-left">
      {/* 电子表格与数据报表专属提示横幅 */}
      {isSpreadsheetDoc && (
        <div className="mb-4 p-3 bg-gradient-to-r from-emerald-50/90 via-teal-50/40 to-white rounded-xl border border-emerald-200/80 shadow-2xs flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2 h-3.5 rounded-full bg-emerald-600" />
            <span className="font-bold text-slate-800">
              📊 结构化数据报表与履约考核矩阵
            </span>
          </div>
          <span className="text-[11px] text-emerald-700 font-mono font-medium hidden sm:inline">
            表格支持横向平滑滚动查阅全部指标列
          </span>
        </div>
      )}

      {parsedElements}

      {/* 如果额外提供了独立的代码示例，单独渲染 IDE 代码视图 */}
      {codeSample && (
        <div className="mt-5 pt-4 border-t border-slate-200/80">
          <div className="flex items-center gap-2 mb-2">
            <Terminal className="w-4 h-4 text-indigo-600" />
            <h4 className="text-xs font-black text-slate-800">
              开发者 API & Webhook 专属调用脚本示例
            </h4>
          </div>
          <CodeBlockView
            code={codeSample}
            language={detectLanguage(codeSample, "api_example.py")}
            title="api_example.py"
          />
        </div>
      )}
    </div>
  );
}
