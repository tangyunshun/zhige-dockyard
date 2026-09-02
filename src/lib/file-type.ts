/**
 * 文件类型与容量工具库
 *
 * 职责：
 *  1. 依据「扩展名 + 业务 type + 内容特征」判定文件的真实格式，并输出中文类型名
 *     （如「Word 文档」「Excel 表格」「图片」「PDF 文档」），供资料列表与预览展示。
 *  2. 把真实字节数格式化为人类可读容量（B / KB / MB / GB）。
 *
 * 判定优先级：扩展名 > 业务 type 字段 > 内容特征（dataURL / 代码特征）。
 * 扩展名最可信，因为它在上传时由原始文件直接取得。
 */

/** 扩展名 → 中文类型名映射表 */
const EXT_TYPE_LABELS: Record<string, string> = {
  // Word 文档
  doc: "Word 文档",
  docx: "Word 文档",
  wps: "Word 文档",
  rtf: "Word 文档",
  odt: "Word 文档",
  // Excel 表格
  xls: "Excel 表格",
  xlsx: "Excel 表格",
  csv: "Excel 表格",
  ods: "Excel 表格",
  // PPT 演示
  ppt: "PPT 演示文稿",
  pptx: "PPT 演示文稿",
  odp: "PPT 演示文稿",
  // PDF
  pdf: "PDF 文档",
  // 图片
  png: "图片",
  jpg: "图片",
  jpeg: "图片",
  gif: "图片",
  bmp: "图片",
  webp: "图片",
  svg: "矢量图片",
  ico: "图片",
  tif: "图片",
  tiff: "图片",
  // 文本
  txt: "文本文件",
  log: "日志文件",
  md: "Markdown 文档",
  markdown: "Markdown 文档",
  // 数据交换
  json: "JSON 数据",
  yaml: "YAML 配置",
  yml: "YAML 配置",
  xml: "XML 数据",
  // 代码
  ts: "TypeScript 代码",
  tsx: "TypeScript 代码",
  js: "JavaScript 代码",
  jsx: "JavaScript 代码",
  java: "Java 代码",
  py: "Python 代码",
  go: "Go 代码",
  sql: "SQL 脚本",
  sh: "Shell 脚本",
  html: "HTML 网页",
  css: "CSS 样式",
  // 压缩包
  zip: "压缩包",
  rar: "压缩包",
  "7z": "压缩包",
  gz: "压缩包",
  tar: "压缩包",
  jar: "压缩包",
  apk: "压缩包",
  // 电子书
  epub: "电子书",
  mobi: "电子书",
};

/** 业务 type 字段 → 中文类型名（扩展名缺失时的兜底） */
const BUSINESS_TYPE_LABELS: Record<string, string> = {
  pdf: "PDF 文档",
  word: "Word 文档",
  excel: "Excel 表格",
  ppt: "PPT 演示文稿",
  image: "图片",
  markdown: "Markdown 文档",
  json: "JSON 数据",
  code: "源代码文件",
  txt: "文本文件",
  doc: "文档资料",
  knowledge: "知识规约",
};

/** 从文件名/标题中抽取扩展名（小写、无点） */
export function getFileExtension(name?: string | null): string {
  if (!name) return "";
  const lower = name.toLowerCase();
  const idx = lower.lastIndexOf(".");
  if (idx <= 0 || idx === lower.length - 1) return "";
  const ext = lower.slice(idx + 1);
  // 扩展名过长或含非法字符则视为无扩展名
  if (ext.length > 10 || !/^[a-z0-9]+$/.test(ext)) return "";
  return ext;
}

/**
 * 判定文件类型并输出中文类型名。
 * @param type  业务 type 字段（pdf/word/excel/image/code/...）
 * @param ext   原始扩展名（优先）
 * @param title 文件名/标题（用于兜底抽扩展名）
 * @param content 文件内容（用于识别图片 dataURL）
 */
export function getFileTypeLabel(params: {
  type?: string | null;
  ext?: string | null;
  title?: string | null;
  content?: string | null;
}): string {
  const { type, title, content } = params;

  // 1. 优先用显式扩展名
  const rawExt = params.ext || getFileExtension(title);
  if (rawExt && EXT_TYPE_LABELS[rawExt]) {
    return EXT_TYPE_LABELS[rawExt];
  }
  // 有扩展名但不在映射表内：回显大写的扩展名，保证「由文件类型决定」而非硬编码
  if (rawExt) return rawExt.toUpperCase();

  // 2. 内容是图片 dataURL → 图片
  if (content && /^data:image\//i.test(content.trim())) return "图片";

  // 3. 业务 type 兜底
  const bizType = (type || "").toLowerCase();
  if (bizType && BUSINESS_TYPE_LABELS[bizType]) {
    return BUSINESS_TYPE_LABELS[bizType];
  }

  // 4. 未知
  return "未知格式";
}

/**
 * 把字节数格式化为人类可读容量。
 * 采用 1024 进制，保留合理小数位；小于 1KB 时以 B 为单位。
 */
export function formatFileSize(bytes?: number | null): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "—";
  if (bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024;
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${mb < 10 ? mb.toFixed(2) : mb.toFixed(1)} MB`;
  }
  const gb = bytes / (1024 * 1024 * 1024);
  return `${gb.toFixed(2)} GB`;
}

/**
 * 显示资料容量大小。
 * 优先使用真实字节数 fileSize；历史数据缺失时回退为按 UTF-8 字节数估算内容体积，
 * 绝不返回无意义的固定占位值。
 */
export function resolveAssetSize(params: {
  fileSize?: number | null;
  content?: string | null;
}): string {
  const { fileSize, content } = params;
  if (typeof fileSize === "number" && fileSize > 0) {
    return formatFileSize(fileSize);
  }
  // 回退：按 UTF-8 编码估算内容字节数（中文约 3 字节/字）
  if (content) {
    const bytes = new TextEncoder().encode(content).length;
    return `≈${formatFileSize(bytes)}`;
  }
  return "—";
}
