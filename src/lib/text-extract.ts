import { OfficeParser } from "officeparser";
import * as chardet from "chardet";
import * as iconv from "iconv-lite";
import AdmZip from "adm-zip";

/**
 * 通用文件文本提取器
 *
 * 设计原则：尽量不拒绝任何文件。采用分层降级策略，
 * 即使遇到未知格式也会尝试抽取可读文本，避免直接提示"不支持"。
 *
 * 层级：
 *  1. 文档格式（docx/xlsx/pptx/odt/ods/odp/pdf/rtf/epub）→ officeparser
 *  2. 压缩包（zip，非 OOXML）→ 解包后递归解析内部文件
 *  3. 图片（png/jpg/gif/bmp/webp/tiff）→ tesseract.js OCR
 *  4. 文本类文件 → chardet 编码识别 + iconv-lite 解码（支持 GBK/Big5 等中文编码）
 *  5. 兜底 → 二进制可读字符串抽取
 */

const DOCUMENT_EXTENSIONS = new Set([
  ".docx", ".xlsx", ".pptx", ".odt", ".ods", ".odp", ".pdf", ".rtf", ".epub", ".doc", ".xls", ".ppt",
]);
const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tif", ".tiff",
]);
const ARCHIVE_EXTENSIONS = new Set([".zip", ".jar", ".apk"]);
const OCR_TIMEOUT_MS = 60000;

function getExtension(fileName: string): string {
  const lower = fileName.toLowerCase();
  const idx = lower.lastIndexOf(".");
  return idx > 0 ? lower.slice(idx) : "";
}

/** 通过魔数识别文件真实类型，避免仅依赖扩展名 */
function detectByMagicBytes(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;
  const head = buffer.slice(0, 12);
  const latin = head.toString("latin1");

  if (latin.startsWith("%PDF")) return "pdf";
  if (latin.startsWith("{\\rtf")) return "rtf";
  if (latin.startsWith("PK")) return "zip"; // docx/xlsx/pptx/odt/ods/odp/epub/zip
  if (latin.startsWith("Rar!")) return "rar";
  if (head[0] === 0x1f && head[1] === 0x8b) return "gzip";
  if (head[0] === 0x37 && head[1] === 0x7a && head[2] === 0xbc) return "7z";
  if (head[0] === 0x89 && latin.startsWith("\u0089PNG")) return "image";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image";
  if (latin.startsWith("GIF8")) return "image";
  if (head[0] === 0x42 && head[1] === 0x4d) return "image";
  if (latin.startsWith("RIFF") && latin.slice(8, 12) === "WEBP") return "image";
  if (head[0] === 0x49 && head[1] === 0x49 && head[2] === 0x2a) return "image"; // TIFF LE
  if (head[0] === 0x4d && head[1] === 0x4d) return "image"; // TIFF BE
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return "ole2"; // 旧版 doc/xls/ppt
  return null;
}

/** 判断 zip 包是否为 OOXML / ODF / EPUB（由 officeparser 解析），还是普通压缩包 */
function getZipDocumentKind(buffer: Buffer): "document" | "archive" {
  try {
    const zip = new AdmZip(buffer);
    const names = zip.getEntries().map((e) => e.entryName);
    const has = (frag: string) => names.some((n) => n.includes(frag));
    if (has("word/document.xml") || has("xl/workbook.xml") || has("ppt/presentation.xml")) return "document";
    if (has("content.xml") || has("meta.xml") || has("styles.xml")) return "document";
    if (has("META-INF/container.xml")) return "document";
    return "archive";
  } catch {
    return "archive";
  }
}

/** 是否为文本类文件（无空字节，且可打印字符占绝大多数） */
function looksLikeText(buffer: Buffer): boolean {
  const sample = buffer.slice(0, Math.min(buffer.length, 16384));
  if (sample.length === 0) return false;
  if (sample.includes(0)) return false;
  let printable = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte < 127) || byte >= 128) printable++;
  }
  return printable / sample.length > 0.85;
}

/** 第 1 层：officeparser 解析文档格式 */
async function extractWithOfficeParser(buffer: Buffer): Promise<string> {
  const ast = await OfficeParser.parseOffice(buffer, {
    includeRawContent: false,
    outputFormat: "text",
  } as any);
  const anyAst = ast as any;
  if (typeof anyAst?.to === "function") {
    const result = await anyAst.to("text");
    if (result && typeof result.value === "string" && result.value.trim()) return result.value;
  }
  if (typeof anyAst?.toText === "function") {
    return anyAst.toText() || "";
  }
  return "";
}

/** 去掉 XML 标签，还原 OOXML / ODF 中的正文文本 */
function stripXmlTags(xml: string): string {
  return xml
    .replace(/<w:tab[^>]*\/?>/g, "\t")
    .replace(/<w:br[^>]*\/?>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]{3,}/g, "  ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * 第 1.5 层：officeparser 未产出结果时，直接从 OOXML / ODF 包内读取正文 XML 并去标签。
 * 避免因单个解析器异常而退化成压缩包二进制乱码。
 */
function extractFromOoxmlManually(buffer: Buffer): string {
  const zip = new AdmZip(buffer);
  const names = zip.getEntries().map((e) => e.entryName);
  const chunks: string[] = [];

  const read = (name: string): string => {
    try {
      const data = zip.readFile(name);
      if (!data) return "";
      return stripXmlTags(iconv.decode(data, "utf-8"));
    } catch {
      return "";
    }
  };

  // Word 正文
  const docXml = names.find((n) => n === "word/document.xml" || n.endsWith("/document.xml"));
  if (docXml) {
    const t = read(docXml);
    if (t) chunks.push(t);
  }
  // Excel 共享字符串
  names
    .filter((n) => n === "xl/sharedStrings.xml" || n.endsWith("/sharedStrings.xml"))
    .forEach((n) => {
      const t = read(n);
      if (t) chunks.push(t);
    });
  // PowerPoint 幻灯片（按序号排序）
  names
    .filter((n) => /(^|\/)ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ""), 10) || 0;
      const nb = parseInt(b.replace(/\D/g, ""), 10) || 0;
      return na - nb;
    })
    .forEach((n) => {
      const t = read(n);
      if (t) chunks.push(t);
    });
  // OpenDocument 正文
  const contentXml = names.find((n) => n === "content.xml" || n.endsWith("/content.xml"));
  if (contentXml) {
    const t = read(contentXml);
    if (t) chunks.push(t);
  }

  return chunks.join("\n").trim();
}

/** 第 2 层：普通压缩包，解包后递归解析内部文件 */
async function extractFromArchive(buffer: Buffer, depth = 0): Promise<string> {
  if (depth > 2) return "";
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  const chunks: string[] = [];
  // 最多处理 20 个内部文件，避免超大压缩包拖垮服务
  for (const entry of entries.slice(0, 20)) {
    try {
      const data = entry.getData();
      if (!data || data.length === 0) continue;
      const text = await extractTextFromBuffer(data, entry.entryName, "", depth + 1);
      if (text && text.trim()) {
        chunks.push(`--- ${entry.entryName} ---\n${text.trim()}`);
      }
    } catch {
      // 单个内部文件解析失败不阻断整体
    }
  }
  return chunks.join("\n\n").trim();
}

/** 第 3 层：图片 OCR（带超时保护，失败时返回空串由上层兜底） */
async function extractFromImage(buffer: Buffer): Promise<string> {
  const workerPromise = (async () => {
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("chi_sim+eng");
      try {
        // 先按自动分块识别
        await worker.setParameters({ tessedit_pageseg_mode: 3 as any });
        let result = await worker.recognize(buffer);
        let text = (result as any)?.data?.text || "";
        // 未识别到内容时切换为稀疏文本模式再试一次
        if (!text || !text.trim()) {
          await worker.setParameters({ tessedit_pageseg_mode: 11 as any });
          result = await worker.recognize(buffer);
          text = (result as any)?.data?.text || "";
        }
        return text;
      } finally {
        await worker.terminate().catch(() => {});
      }
    } catch {
      return "";
    }
  })();
  const timeoutPromise = new Promise<string>((resolve) => {
    setTimeout(() => resolve(""), OCR_TIMEOUT_MS);
  });
  return Promise.race([workerPromise, timeoutPromise]);
}

/** 第 4 层：文本类文件，自动识别编码后解码 */
function extractTextWithEncoding(buffer: Buffer): string {
  let detected: string | null = null;
  try {
    detected = chardet.detect(buffer);
  } catch {
    detected = null;
  }

  const candidates = Array.from(
    new Set([
      detected,
      "utf-8",
      "gb18030",
      "gbk",
      "big5",
      "utf-16le",
      "utf-16be",
      "latin1",
    ].filter((c): c is string => Boolean(c))),
  );

  for (const enc of candidates) {
    try {
      const decoded = iconv.decode(buffer, enc);
      if (!decoded || !decoded.trim()) continue;
      const replacementCount = (decoded.match(/\uFFFD/g) || []).length;
      const ratio = decoded.length > 0 ? replacementCount / decoded.length : 1;
      if (ratio < 0.01) return decoded;
    } catch {
      // 尝试下一个编码
    }
  }
  return buffer.toString("utf-8");
}

/** 第 5 层兜底：从任意二进制中抽取可读文本 */
function extractReadableFallback(buffer: Buffer): string {
  const raw = buffer.toString("utf-8");
  // 保留各语言字符、数字、标点与空白，其余替换为空格
  const cleaned = raw
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}\n\r\t]/gu, " ")
    .replace(/[ \t]{3,}/g, "  ")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
  return cleaned.trim();
}

/** 判断提取结果是否包含真正可读的文字（中文/英文/数字），过滤乱码与纯符号噪声 */
function hasReadableText(text: string): boolean {
  if (!text || !text.trim()) return false;
  if (text.includes("\uFFFD")) return false;
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const digits = (text.match(/[0-9]/g) || []).length;
  const meaningful = cjk + latin + digits;
  if (meaningful === 0) return false;
  const total = text.replace(/\s+/g, "").length || 1;
  return meaningful / total >= 0.08 || meaningful >= 3;
}

/**
 * 从文件 Buffer 中提取纯文本。
 * 采用分层降级策略，尽量保证任何文件都能得到可用的文本结果。
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileName: string,
  mimeType = "",
  depth = 0
): Promise<string> {
  const raw = await extractTextFromBufferRaw(buffer, fileName, mimeType, depth);
  return hasReadableText(raw) ? raw.trim() : "";
}

async function extractTextFromBufferRaw(
  buffer: Buffer,
  fileName: string,
  mimeType = "",
  depth = 0
): Promise<string> {
  if (!buffer || buffer.length === 0) return "";

  const ext = getExtension(fileName);
  const magic = detectByMagicBytes(buffer);

  // 1. 文档格式：PDF / Word / Excel / PowerPoint / ODF / RTF / EPUB
  const isDocument =
    DOCUMENT_EXTENSIONS.has(ext) ||
    magic === "pdf" ||
    magic === "rtf" ||
    (magic === "zip" && getZipDocumentKind(buffer) === "document");
  if (isDocument) {
    try {
      const text = await extractWithOfficeParser(buffer);
      if (text && text.trim()) return text.trim();
    } catch {
      // 解析失败则继续走降级链路
    }
    // officeparser 未产出有效文本时，直接从 OOXML/ODF 包内读取正文 XML 去标签
    if (magic === "zip") {
      try {
        const manual = extractFromOoxmlManually(buffer);
        if (manual && manual.trim()) return manual.trim();
      } catch {
        // 继续
      }
    }
    // 文本型 PDF（扫描件）officeparser 可能拿不到文字，尝试 OCR
    if (magic === "pdf") {
      const ocrText = await extractFromImage(buffer);
      if (ocrText && ocrText.trim()) return ocrText.trim();
    }
  }

  // 2. 普通压缩包：递归解包解析
  const isArchive = magic === "zip" || ARCHIVE_EXTENSIONS.has(ext);
  if (isArchive && !(magic === "zip" && getZipDocumentKind(buffer) === "document")) {
    try {
      const text = await extractFromArchive(buffer, depth);
      if (text && text.trim()) return text;
    } catch {
      // 解包失败继续降级
    }
  }

  // 3. 图片：仅 OCR 识别（SVG 为矢量图，直接视为无可提取文字）
  const isImage =
    IMAGE_EXTENSIONS.has(ext) ||
    magic === "image" ||
    (mimeType || "").toLowerCase().startsWith("image/");
  if (isImage) {
    if (ext === ".svg") return "";
    const ocrText = await extractFromImage(buffer);
    return ocrText && ocrText.trim() ? ocrText.trim() : "";
  }

  // 4. 文本类文件（含各类代码/配置/标记语言）
  if (looksLikeText(buffer)) {
    const text = extractTextWithEncoding(buffer);
    if (text && text.trim()) return text.trim();
  }

  // 5. 兜底：抽取二进制中的可读内容
  return extractReadableFallback(buffer);
}

/** 判断是否为受支持的常见文件（用于前端提示，实际解析不依赖此判断） */
export function isExtractableFile(fileName: string, mimeType = ""): boolean {
  // 解析层已支持全部常见格式，这里仅拦截明显的超大风险类型
  const lower = fileName.toLowerCase();
  const ext = getExtension(lower);
  const blocked = new Set([".exe", ".dll", ".so", ".dylib", ".bin", ".iso", ".mp4", ".avi", ".mkv", ".mp3", ".wav"]);
  if (blocked.has(ext)) return false;
  return true;
}
