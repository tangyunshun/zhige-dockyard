import { getAuthToken } from "@/utils/auth";

/**
 * 文本内容工具集：用于前端文件读取与后端输入清洗，确保入库内容都是合法 UTF-8 文本，
 * 避免 PDF/Word/Excel 等二进制文件被误当作文本读出导致乱码。
 */

/**
 * 将二进制文件上传到服务端 /api/studio/extract-text 解析为纯文本。
 * 支持 PDF / Word / Excel / CSV。
 */
import { scanSensitiveWords } from "@/lib/sensitive-words";

export async function uploadAndExtractText(file: File): Promise<{ 
  text: string; 
  fileName: string; 
  fileSize: number;
  hasSensitive?: boolean;
  foundWords?: string[];
  sanitizedText?: string;
}> {
  const formData = new FormData();
  formData.append("file", file);

  const headers: Record<string, string> = {};
  const token = typeof window !== "undefined" ? getAuthToken() : "";
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch("/api/studio/extract-text", {
    method: "POST",
    body: formData,
    credentials: "include",
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || "文件解析失败，请重试");
  }

  const rawText = data.text || "";
  const sensitivity = scanSensitiveWords(rawText);

  return {
    text: sensitivity.hasSensitive ? sensitivity.sanitizedText : rawText,
    fileName: data.fileName || file.name,
    fileSize: data.fileSize || file.size,
    hasSensitive: sensitivity.hasSensitive,
    foundWords: sensitivity.foundWords,
    sanitizedText: sensitivity.sanitizedText,
  };
}

/** 支持通过服务端解析为文本后使用的二进制文件扩展名 */
export const EXTRACTABLE_BINARY_EXTENSIONS = new Set([
  ".pdf",
  ".docx",
  ".doc",
  ".xlsx",
  ".xls",
  ".csv",
]);

/** 已知可安全使用 readAsText 读取的纯文本文件扩展名 */
export const SAFE_TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  ".sql",
  ".log",
  ".html",
  ".htm",
  ".xml",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".c",
  ".cpp",
  ".cc",
  ".cxx",
  ".h",
  ".hpp",
  ".css",
  ".scss",
  ".less",
  ".sass",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".conf",
  ".config",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
  ".bat",
  ".cmd",
  ".vue",
  ".svelte",
  ".php",
  ".rb",
  ".pl",
  ".lua",
  ".r",
]);

/** 已知可安全读取的 MIME type 前缀/完整值 */
export const SAFE_TEXT_MIME_PREFIXES = [
  "text/",
  "application/json",
  "application/javascript",
  "application/typescript",
  "application/xml",
  "application/sql",
  "application/x-sql",
  "application/yaml",
  "application/x-yaml",
  "application/toml",
  "application/x-toml",
];

/** 明确不尝试解析的文件类型（可执行文件、音视频等无文本内容） */
const BLOCKED_EXTENSIONS = new Set([
  ".exe", ".dll", ".so", ".dylib", ".bin", ".iso",
  ".mp4", ".avi", ".mkv", ".mov", ".mp3", ".wav", ".flac",
]);

/**
 * 判断文件是否应交给服务端解析。
 * 服务端解析层已支持文档/表格/演示/压缩包/图片/文本等绝大多数格式，
 * 因此这里默认放行，仅拦截无文本内容的可执行文件与音视频文件。
 */
export function isExtractableFile(fileName: string, mimeType = ""): boolean {
  const lowerName = fileName.toLowerCase();
  const idx = lowerName.lastIndexOf(".");
  const ext = idx > 0 ? lowerName.slice(idx) : "";
  if (BLOCKED_EXTENSIONS.has(ext)) return false;
  const lowerMime = mimeType.toLowerCase();
  if (lowerMime.startsWith("video/") || lowerMime.startsWith("audio/")) return false;
  return true;
}

/**
 * 根据文件名和 MIME type 判断是否为可安全 readAsText 读取的纯文本文件，
 * 或需要服务端解析为文本的二进制文件（PDF/Word/Excel/CSV）。
 * 注意：扩展名可被伪造，读取后还会进行二次二进制特征校验。
 */
export function isAllowedTextFile(fileName: string, mimeType = ""): boolean {
  const lowerName = fileName.toLowerCase();
  const ext = lowerName.slice(lowerName.lastIndexOf(".") > 0 ? lowerName.lastIndexOf(".") : 0);
  if (SAFE_TEXT_EXTENSIONS.has(ext)) return true;
  const lowerMime = mimeType.toLowerCase();
  return SAFE_TEXT_MIME_PREFIXES.some((p) => lowerMime.startsWith(p));
}

/**
 * 判断一段字符串是否大概率是二进制内容被误读成文本。
 * 检测维度：
 * 1. 常见的二进制文件魔数（PDF、PNG、ZIP/DOCX/XLSX、JPG、GIF 等）
 2. 空字节（\\x00）密度
 * 3. Unicode 替换字符（�）密度（编码失败标志）
 * 4. 不可打印控制字符比例
 */
export function isProbablyBinaryContent(content: string | null | undefined): boolean {
  if (!content || typeof content !== "string") return false;

  // 空内容无需判定
  const len = content.length;
  if (len === 0) return false;

  const sample = content.slice(0, 4096);
  const lowerSample = sample.toLowerCase();

  // 1. 二进制文件魔数（文本文件绝不可能以这些开头）
  const binarySignatures = [
    "%pdf",
    "\u0089PNG",
    "PK\u0003\u0004",
    "PK\u0005\u0006",
    "PK\u0007\u0008",
    "\u00ff\u00d8\u00ff", // JPEG
    "GIF87a",
    "GIF89a",
    "\u0042\u004d", // BMP
    "\u007fELF",
    "\u00d0\u00cf\u0011\u00e0", // OLE2 / old Office
  ];
  for (const sig of binarySignatures) {
    if (sample.startsWith(sig)) return true;
  }

  // 2. 空字节密度：文本文件不应包含 \\x00
  const nullCount = (sample.match(/\u0000/g) || []).length;
  if (nullCount > 0) return true;

  // 3. Unicode 替换字符密度（文件编码不是 UTF-8 时会出现）
  const replacementCount = (sample.match(/\uFFFD/g) || []).length;
  if (replacementCount > 0 && replacementCount / sample.length > 0.001) return true;

  // 4. 不可打印控制字符比例（除常见换行、制表符外）
  const controlChars = sample.match(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g) || [];
  if (controlChars.length / sample.length > 0.01) return true;

  return false;
}

/**
 * 清理文本中可能导致展示乱码或安全隐患的字符：
 * - 空字节
 * - 除换行/制表符外的控制字符
 * - 首尾空白
 */
export function sanitizeTextContent(content: string | null | undefined): string {
  if (!content || typeof content !== "string") return "";
  return content
    .replace(/\u0000/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .trim();
}
