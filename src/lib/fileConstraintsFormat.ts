/**
 * 将合同 fileConstraints.acceptedMimes 中的 MIME 类型 / 扩展名映射为终端用户可读的中文标签。
 * 目的：避免组件大厅 / 调度面板把 application/vnd.openxmlformats-officedocument.wordprocessingml.document
 * 这类原始代码字符直接暴露给普通用户。
 */
const MIME_LABEL_MAP: Record<string, string> = {
  "text/plain": "纯文本",
  "text/markdown": "Markdown",
  "application/pdf": "PDF",
  "application/msword": "Word 文档",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word 文档",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel 表格",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PPT 演示",
  "image/png": "PNG 图片",
  "image/jpeg": "JPEG 图片",
  "image/gif": "GIF 图片",
  ".pdf": "PDF",
  ".doc": "Word 文档",
  ".docx": "Word 文档",
  ".txt": "纯文本",
  ".md": "Markdown",
  ".xls": "Excel 表格",
  ".xlsx": "Excel 表格",
  ".ppt": "PPT 演示",
  ".pptx": "PPT 演示",
};

export function describeAcceptedMimes(mimes: string[] | undefined | null): string {
  if (!mimes || mimes.length === 0) return "";
  return Array.from(new Set(mimes.map((m) => MIME_LABEL_MAP[m] ?? m))).join(" / ");
}
