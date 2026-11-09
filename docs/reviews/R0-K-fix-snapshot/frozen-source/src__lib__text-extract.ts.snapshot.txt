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

/**
 * 第 1.6 层：旧版表格二进制（.xls，OLE2/BIFF8）→ SheetJS。
 * officeparser 对旧版二进制 Office 格式可能拿不到内容，此时用 SheetJS 兜底，
 * 避免退化成二进制乱码。仅在确实需要时才动态加载 xlsx。
 */
async function extractSpreadsheetWithSheetJs(buffer: Buffer): Promise<string> {
  try {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const chunks: string[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      if (!sheet) continue;
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
      if (csv && csv.trim()) chunks.push(`--- ${name} ---\n${csv.trim()}`);
    }
    return chunks.join("\n\n").trim();
  } catch {
    return "";
  }
}

/** SheetJS 的 CFB（OLE2 复合文档）容器读取能力（xlsx 已内置，无需额外依赖） */
type CfbEntry = { content: Uint8Array } | null | undefined;
type CfbApi = {
  read: (buffer: Buffer, opts: { type: "buffer" }) => unknown;
  find: (cfb: unknown, name: string) => CfbEntry;
};

async function loadCfb(): Promise<CfbApi | null> {
  try {
    // xlsx 为 CJS 包：动态 import 的命名空间可能不暴露 CFB，需兼容 default 导出
    const mod = (await import("xlsx")) as unknown as { CFB?: CfbApi; default?: { CFB?: CfbApi } };
    return mod.CFB ?? mod.default?.CFB ?? null;
  } catch {
    return null;
  }
}

/** 无分片表时的单区段解码：奇数字节多为 0x00 视为 UTF-16LE，否则按单字节解码 */
function decodeWordChunk(raw: Buffer): string {
  if (raw.length === 0) return "";
  let oddZero = 0;
  for (let i = 1; i < raw.length; i += 2) if (raw[i] === 0) oddZero++;
  return oddZero > raw.length / 4 ? raw.toString("utf16le") : raw.toString("latin1");
}

/**
 * 旧版 Word（.doc / .dot，Word 97-2003 二进制）。
 * 通过 OLE2 容器读取 WordDocument 流与 Table 流（0Table/1Table），
 * 解析 FIB 中的 fcClx/lcbClx 得到分片表（CLX→PlcPcd），按分片还原正文
 * （分片压缩标记 fCompressed → CP1252 单字节，否则 UTF-16LE）。
 */
async function extractLegacyWordDoc(buffer: Buffer): Promise<string> {
  const cfbApi = await loadCfb();
  if (!cfbApi) return "";
  try {
    const cfb = cfbApi.read(buffer, { type: "buffer" });
    const wdEntry = cfbApi.find(cfb, "WordDocument");
    if (!wdEntry) return "";
    const wd = Buffer.from(wdEntry.content);
    if (wd.length < 0x1aa) return "";

    const flags = wd.readUInt16LE(0x0a);
    const tableOrder = (flags & 0x0200) !== 0 ? ["1Table", "0Table"] : ["0Table", "1Table"];
    let tbl: Buffer | null = null;
    for (const name of tableOrder) {
      const e = cfbApi.find(cfb, name);
      if (e) {
        tbl = Buffer.from(e.content);
        break;
      }
    }

    const fcClx = wd.readUInt32LE(0x1a2);
    const lcbClx = wd.readUInt32LE(0x1a6);
    let plcPcd: Buffer | null = null;
    if (tbl && fcClx + 5 <= tbl.length) {
      let pos = fcClx;
      const end = Math.min(fcClx + lcbClx, tbl.length);
      while (pos + 5 <= end) {
        const tag = tbl[pos];
        if (tag === 0x01) {
          // Prc：跳过 cbGrpprl
          pos += 3 + tbl.readUInt16LE(pos + 1);
        } else if (tag === 0x02) {
          // Pcdt → PlcPcd
          const lcb = tbl.readUInt32LE(pos + 1);
          plcPcd = tbl.subarray(pos + 5, Math.min(pos + 5 + lcb, tbl.length));
          break;
        } else break;
      }
    }

    const pieces: string[] = [];
    if (!plcPcd || plcPcd.length < 16) {
      // 非快速保存文档：正文为 fcMin..fcMac 连续区段
      const fcMin = wd.readUInt32LE(0x18);
      const fcMac = wd.readUInt32LE(0x1c);
      if (fcMac <= fcMin || fcMin >= wd.length) return "";
      pieces.push(decodeWordChunk(wd.subarray(fcMin, Math.min(fcMac, wd.length))));
    } else {
      const n = Math.floor((plcPcd.length - 4) / 12);
      const cps: number[] = [];
      for (let i = 0; i <= n; i++) cps.push(plcPcd.readUInt32LE(i * 4));
      for (let i = 0; i < n; i++) {
        const fcRaw = plcPcd.readUInt32LE(4 * (n + 1) + i * 8 + 2);
        const compressed = (fcRaw & 0x40000000) !== 0;
        const fc = compressed ? (fcRaw & 0x3fffffff) / 2 : fcRaw & 0x3fffffff;
        const len = cps[i + 1] - cps[i];
        if (len <= 0 || fc >= wd.length) continue;
        pieces.push(
          compressed
            ? wd.subarray(fc, Math.min(fc + len, wd.length)).toString("latin1")
            : wd.subarray(fc, Math.min(fc + len * 2, wd.length)).toString("utf16le"),
        );
      }
    }
    return pieces.join("").replace(/\u0000/g, "").replace(/\r/g, "\n").trim();
  } catch {
    return "";
  }
}

/**
 * 旧版 PowerPoint（.ppt / .pps，PowerPoint 97-2003 二进制）。
 * PowerPoint Document 流为记录树（recVer=0xF 为容器），
 * 提取 TextCharsAtom(0x0FA0, UTF-16LE) 与 TextBytesAtom(0x0FA8, 单字节) 文本原子。
 */
async function extractLegacyPpt(buffer: Buffer): Promise<string> {
  const cfbApi = await loadCfb();
  if (!cfbApi) return "";
  try {
    const cfb = cfbApi.read(buffer, { type: "buffer" });
    const entry = cfbApi.find(cfb, "PowerPoint Document") ?? cfbApi.find(cfb, "PP40");
    if (!entry) return "";
    const s = Buffer.from(entry.content);
    const out: string[] = [];
    const walk = (start: number, end: number, depth: number): void => {
      let pos = start;
      while (pos + 8 <= end && depth < 40) {
        const recVer = s.readUInt16LE(pos) & 0x000f;
        const recType = s.readUInt16LE(pos + 2);
        const recLen = s.readUInt32LE(pos + 4);
        const dataStart = pos + 8;
        if (recLen < 0 || dataStart + recLen > end) break;
        if (recVer === 0x0f) {
          walk(dataStart, dataStart + recLen, depth + 1);
        } else if (recType === 0x0fa0) {
          out.push(s.subarray(dataStart, dataStart + recLen).toString("utf16le"));
        } else if (recType === 0x0fa8) {
          out.push(s.subarray(dataStart, dataStart + recLen).toString("latin1"));
        }
        pos = dataStart + recLen;
      }
    };
    walk(0, s.length, 0);
    return out.join("\n").replace(/\u0000/g, "").trim();
  } catch {
    return "";
  }
}

/** 第 2 层：普通压缩包，解包后递归解析内部文件 */
async function extractFromArchive(buffer: Buffer, depth = 0, signal?: AbortSignal): Promise<string> {
  if (depth > 2) return "";
  if (signal?.aborted) return "";
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries().filter((e) => !e.isDirectory);
  const chunks: string[] = [];
  // 最多处理 20 个内部文件，避免超大压缩包拖垮服务
  for (const entry of entries.slice(0, 20)) {
    if (signal?.aborted) break;
    try {
      const data = entry.getData();
      if (!data || data.length === 0) continue;
      const text = await extractTextFromBuffer(data, entry.entryName, "", depth + 1, signal);
      if (text && text.trim()) {
        chunks.push(`--- ${entry.entryName} ---\n${text.trim()}`);
      }
    } catch {
      // 单个内部文件解析失败不阻断整体
    }
  }
  return chunks.join("\n\n").trim();
}

type OcrWorker = {
  setParameters: (params: Record<string, unknown>) => Promise<unknown>;
  recognize: (buffer: Buffer) => Promise<{ data?: { text?: string } }>;
  terminate: () => Promise<unknown>;
};

export type { OcrWorker };

// 仅用于测试的可注入钩子：避免测试依赖真实 tesseract 二进制。生产代码不设置。
let ocrWorkerFactoryOverride: (() => Promise<OcrWorker>) | null = null;
let ocrTimeoutMsOverride: number | null = null;

/** 仅用于测试：注入 OCR worker 工厂 / 超时；传 null 恢复默认 */
export function __setOcrTestHooks(hooks: {
  factory?: (() => Promise<OcrWorker>) | null;
  timeoutMs?: number | null;
}): void {
  if (hooks.factory !== undefined) ocrWorkerFactoryOverride = hooks.factory;
  if (hooks.timeoutMs !== undefined) ocrTimeoutMsOverride = hooks.timeoutMs;
}

/**
 * 第 3 层：图片 OCR。
 * 支持 AbortSignal 取消：超时 / 调用方中止时立即 terminate worker，
 * 真正停止后台解析任务并释放资源（不仅仅是停止等待）。
 */
async function extractFromImage(buffer: Buffer, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) return "";
  // 测试钩子：仅用于「无文字图片」路径的确定性验证（真实路由 + 确定性 OCR 测试替身）。
  // 开启后不创建 OCR worker、不产生网络/环境噪声，直接视为无文本。禁止在生产开启。
  if (process.env.TEXT_EXTRACT_TEST_OCR_EMPTY === "true") return "";
  let worker: OcrWorker | null = null;
  let cancelled = false;

  // 标记取消并终止当前 worker；可重复调用，且能终止「稍后才创建」的 worker（避免 createWorker 未返回时超时的竞态泄漏）
  const terminateWorker = async () => {
    cancelled = true;
    const w = worker;
    worker = null;
    if (!w) return;
    try {
      await w.terminate();
    } catch {
      // 忽略终止异常
    }
  };

  if (signal) {
    signal.addEventListener("abort", () => { void terminateWorker(); }, { once: true });
  }

  const workerPromise = (async () => {
    try {
      const createWorkerFn =
        ocrWorkerFactoryOverride ??
        (async () => {
          const { createWorker } = await import("tesseract.js");
          return (await createWorker("chi_sim+eng")) as unknown as OcrWorker;
        });
      worker = await createWorkerFn();
      // createWorker 期间可能已超时/中止：此时必须终止刚创建的 worker，否则它会继续在后台运行
      if (cancelled || signal?.aborted) {
        await terminateWorker();
        return "";
      }
      try {
        const w = worker;
        // 先按自动分块识别
        await w.setParameters({ tessedit_pageseg_mode: 3 });
        let result = await w.recognize(buffer);
        let text = result?.data?.text || "";
        // 未识别到内容时切换为稀疏文本模式再试一次
        if (!text || !text.trim()) {
          await w.setParameters({ tessedit_pageseg_mode: 11 });
          result = await w.recognize(buffer);
          text = result?.data?.text || "";
        }
        return text;
      } finally {
        await terminateWorker();
      }
    } catch {
      await terminateWorker();
      return "";
    }
  })();

  const timeoutMs = ocrTimeoutMsOverride ?? OCR_TIMEOUT_MS;
  const timeoutPromise = new Promise<string>((resolve) => {
    const timer = setTimeout(() => {
      // 超时：终止 OCR worker，停止后台解析后再结束等待
      void terminateWorker().finally(() => resolve(""));
    }, timeoutMs);
    workerPromise.finally(() => clearTimeout(timer)).catch(() => {});
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
  depth = 0,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) return "";
  const raw = await extractTextFromBufferRaw(buffer, fileName, mimeType, depth, signal);
  return hasReadableText(raw) ? raw.trim() : "";
}

/**
 * 统一「可取消超时」入口：内部使用 AbortController，超时/外部中止时会真正取消底层解析
 * （如 terminate OCR worker），而非仅停止等待。
 * 文件任务与资料上传（upload_doc）共用此入口，避免各自实现 Promise.race。
 */
export async function extractTextFromBufferWithTimeout(
  buffer: Buffer,
  fileName: string,
  mimeType = "",
  timeoutMs: number = OCR_TIMEOUT_MS,
  externalSignal?: AbortSignal,
): Promise<string> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  const timer = setTimeout(onAbort, timeoutMs);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    return await extractTextFromBuffer(buffer, fileName, mimeType, 0, controller.signal);
  } catch {
    // 解析失败 / 超时 / 已中止：统一视为无文本
    return "";
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onAbort);
  }
}

async function extractTextFromBufferRaw(
  buffer: Buffer,
  fileName: string,
  mimeType = "",
  depth = 0,
  signal?: AbortSignal,
): Promise<string> {
  if (!buffer || buffer.length === 0) return "";
  if (signal?.aborted) return "";

  const ext = getExtension(fileName);
  const magic = detectByMagicBytes(buffer);

  // 1. 文档格式：PDF / Word / Excel / PowerPoint / ODF / RTF / EPUB
  const isDocument =
    DOCUMENT_EXTENSIONS.has(ext) ||
    magic === "pdf" ||
    magic === "rtf" ||
    (magic === "zip" && getZipDocumentKind(buffer) === "document");
  if (isDocument) {
    if (signal?.aborted) return "";
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
    // 扫描件 PDF：officeparser 拿不到文字层时回落 OCR
    if (magic === "pdf") {
      if (signal?.aborted) return "";
      const ocrText = await extractFromImage(buffer, signal);
      if (ocrText && ocrText.trim()) return ocrText.trim();
      // PDF 原始字节不是正文：OCR 亦无结果时必须判定为「无文本」，
      // 绝不能继续降级到「文本类文件 / 二进制兜底」而把 %PDF 二进制当内容返回。
      return "";
    }
    // 旧版二进制 Office（.doc/.xls/.ppt，OLE2 复合文档）：officeparser 无法解析时按格式专用还原；
    // 仍无结果则判定为「无文本」，绝不返回二进制乱码。
    if (magic === "ole2") {
      if (signal?.aborted) return "";
      const tryWord = ext === ".doc" || ext === ".dot";
      const tryPpt = ext === ".ppt" || ext === ".pps";
      const trySheet = ext === ".xls" || ext === ".xlsx";
      const unknownExt = !tryWord && !tryPpt && !trySheet;

      if (trySheet) {
        const sheetText = await extractSpreadsheetWithSheetJs(buffer);
        if (sheetText.trim()) return sheetText.trim();
      }
      if (tryWord || unknownExt) {
        const docText = await extractLegacyWordDoc(buffer);
        if (docText.trim()) return docText.trim();
      }
      if (tryPpt || unknownExt) {
        const pptText = await extractLegacyPpt(buffer);
        if (pptText.trim()) return pptText.trim();
      }
      if (unknownExt) {
        const sheetText = await extractSpreadsheetWithSheetJs(buffer);
        if (sheetText.trim()) return sheetText.trim();
      }
      return "";
    }
  }

  // 2. 普通压缩包：递归解包解析
  const isArchive = magic === "zip" || ARCHIVE_EXTENSIONS.has(ext);
  if (isArchive && !(magic === "zip" && getZipDocumentKind(buffer) === "document")) {
    try {
      const text = await extractFromArchive(buffer, depth, signal);
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
    if (signal?.aborted) return "";
    const ocrText = await extractFromImage(buffer, signal);
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
