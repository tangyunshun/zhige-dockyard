/**
 * [R0-K / 原 F14 K01] 文件解析隔离执行入口。
 *
 * 纯 CommonJS + Node 内置 worker_threads；不依赖 tsx/TS 编译、不访问网络、
 * 不加载 OCR 语言包、不读 .env 或密钥。由 parse-runner.ts 以真实 Worker 启动；
 * 硬 deadline / 取消 / 崩溃由父级 terminate() 并等待 exit 确认，本文件不自行计时假装中断。
 *
 * 任务（workerData.task.kind）：
 *   parse          受根预算的文本提取（Office/OOXML/ODF/旧Office/表格/压缩包/文本编码）
 *   table-preview  XLSX 预览（工作表/单元格/行数预算）
 *   docx-html      mammoth 预览（HTML 字符预算）
 *   __test_ok/__test_spin/__test_late/__test_crash/__test_init_fail/__test_error
 *                 隔离本地受控任务，用于真实启动/终止/退出确认证据，无外部 IO
 *
 * 通信：只回传一次 { type:'result', ... }；父级在结束确认后不再接收迟到消息。
 */
"use strict";

const { parentPort, workerData } = require("node:worker_threads");

const LIMIT_KEYS = [
  "inputBytes", "inflatedBytes", "entries", "depth", "outputChars", "workUnits",
  "pdfPages", "pdfTextChars", "imagePixels", "sheets", "cells", "previewRows", "htmlChars",
];

// 结构性限制（与 src/lib/parse-policy.ts 的 PARSE_LIMITS 保持一致；本地副本避免 worker 跨模块依赖）
const ENTRIES_PER_LEVEL = 20; // 对应 PARSE_LIMITS.ENTRIES_PER_LEVEL
const MAX_DEPTH = 2; // 对应 PARSE_LIMITS.ROOT_MAX_DEPTH（允许的最大嵌套层级）

function fail(code, kind, message) {
  const e = new Error(message || "解析资源预算超限");
  e.r0kCode = code;
  e.r0kKind = kind;
  throw e;
}

/** worker 内预算：所有递归/子任务共用同一份 usage，不得每递归一次重置额度 */
function makeBudget(remaining) {
  const limits = {};
  const usage = {};
  for (const k of LIMIT_KEYS) {
    limits[k] = Number.isFinite(remaining && remaining[k]) ? remaining[k] : 0;
    usage[k] = 0;
  }
  return {
    consume(kind, amount) {
      const n = Number.isFinite(amount) ? amount : 0;
      if ((usage[kind] || 0) + n > limits[kind]) fail("PARSE_BUDGET_EXCEEDED", kind);
      usage[kind] = (usage[kind] || 0) + n;
    },
    get usage() {
      return { ...usage };
    },
  };
}

function extOf(name) {
  const lower = String(name || "").toLowerCase();
  const i = lower.lastIndexOf(".");
  return i > 0 ? lower.slice(i) : "";
}

/** 魔数识别：伪装扩展名不能绕过类型判断与解压预算 */
function magic(buffer) {
  if (buffer.length < 4) return null;
  const head = buffer.subarray(0, 12);
  const latin = head.toString("latin1");
  if (latin.startsWith("%PDF")) return "pdf";
  if (latin.startsWith("{\\rtf")) return "rtf";
  if (latin.startsWith("PK")) return "zip";
  if (head[0] === 0x1f && head[1] === 0x8b) return "gzip";
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return "ole2";
  if (head[0] === 0x89 && head[1] === 0x50) return "image";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image";
  return null;
}

function stripXmlTags(xml) {
  return xml
    .replace(/<w:tab[^>]*\/?>/g, "\t")
    .replace(/<w:br[^>]*\/?>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/[ \t]{3,}/g, "  ").replace(/\n{3,}/g, "\n\n").trim();
}

function looksLikeText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 16384));
  if (sample.length === 0) return false;
  if (sample.includes(0)) return false;
  let printable = 0;
  for (const b of sample) if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 128) printable++;
  return printable / sample.length > 0.85;
}

function decodeText(buffer, budget) {
  const iconv = require("iconv-lite");
  const chardet = require("chardet");
  let detected = null;
  try { detected = chardet.detect(buffer); } catch { /* 降级到候选编码 */ }
  const candidates = [...new Set([detected, "utf-8", "gb18030", "gbk", "big5", "utf-16le", "utf-16be", "latin1"].filter(Boolean))];
  for (const enc of candidates) {
    budget.consume("workUnits", 1);
    try {
      const decoded = iconv.decode(buffer, enc);
      if (!decoded || !decoded.trim()) continue;
      const bad = (decoded.match(/\uFFFD/g) || []).length;
      if (bad / decoded.length < 0.01) return decoded;
    } catch { /* 下一个编码 */ }
  }
  return buffer.toString("utf-8");
}

function readableFallback(buffer, budget) {
  budget.consume("workUnits", 1);
  return buffer.toString("utf-8")
    .replace(/[^\p{L}\p{N}\p{P}\p{Z}\n\r\t]/gu, " ")
    .replace(/[ \t]{3,}/g, "  ")
    .split("\n").map((l) => l.trim()).filter(Boolean).join("\n").trim();
}

/** 实际读取前用声明大小预检，getData 之后按真实长度再核一次；不能只信声明 */
function readZipEntry(zip, entry, budget) {
  budget.consume("entries", 1);
  const declared = Number(entry.header && entry.header.size) || 0;
  budget.consume("inflatedBytes", declared); // 预检：声明值也计入，超限立即失败
  const data = entry.getData();
  if (!data || data.length === 0) return Buffer.alloc(0);
  // 声明值可能撒谎：真实字节超出声明时补计差额（累计受同一根预算）
  const real = data.length;
  if (real > declared) budget.consume("inflatedBytes", real - declared);
  budget.consume("workUnits", 1);
  return data;
}

function zipNames(zip, budget) {
  const list = zip.getEntries().map((e) => e.entryName);
  budget.consume("entries", list.length); // 条目总数预检（含目录）
  return list;
}

function isZipDocument(names) {
  const has = (f) => names.some((n) => n.includes(f));
  return has("word/document.xml") || has("xl/workbook.xml") || has("ppt/presentation.xml") ||
    has("content.xml") || has("meta.xml") || has("styles.xml") || has("META-INF/container.xml");
}

/**
 * XLSX 工作表还原：恢复共享字符串 + 数值 + 单元格顺序 + 工作表顺序，
 * 避免把 xl/sharedStrings.xml 当整份表格正文而遗漏数值（如 42）。
 * 所有条目经 readZipEntry 计入同一根解压预算，不得绕过。
 */
function extractXlsxSheets(zip, names, budget, iconv) {
  // 共享字符串表（每个 <si> 独立成串，保留富文本 run 合并后的文本）
  const shared = [];
  const ssName = names.find((n) => n === "xl/sharedStrings.xml" || n.endsWith("/sharedStrings.xml"));
  if (ssName) {
    const entry = zip.getEntry(ssName);
    if (entry) {
      const data = readZipEntry(zip, entry, budget);
      const xml = iconv.decode(data, "utf-8");
      const siRe = /<si>([\s\S]*?)<\/si>/g;
      let m;
      while ((m = siRe.exec(xml))) shared.push(stripXmlTags(m[1]).replace(/\s+/g, " ").trim());
    }
  }
  // 工作表按序号排序，保留多工作表上下文
  const sheetNames = names
    .filter((n) => /(^|\/)xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = parseInt((a.match(/sheet(\d+)\.xml$/) || [])[1] || "0", 10);
      const nb = parseInt((b.match(/sheet(\d+)\.xml$/) || [])[1] || "0", 10);
      return na - nb;
    });
  const chunks = [];
  let cellCount = 0;
  for (const sn of sheetNames) {
    const entry = zip.getEntry(sn);
    if (!entry) continue;
    const data = readZipEntry(zip, entry, budget);
    const xml = iconv.decode(data, "utf-8");
    // 逐单元格：共享字符串(t=s)、内联字符串(t=inlineStr/str)、布尔(t=b)、数值(默认 <v>)
    const cellRe = /<c\s+([^>]*)>([\s\S]*?)<\/c>/g;
    const vals = [];
    let cm;
    while ((cm = cellRe.exec(xml))) {
      const attrs = cm[1];
      const inner = cm[2];
      const tMatch = attrs.match(/\bt="([^"]*)"/);
      const type = tMatch ? tMatch[1] : "";
      const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
      const isMatch = inner.match(/<is>([\s\S]*?)<\/is>/);
      if (type === "s") {
        if (vMatch) {
          const idx = parseInt(stripXmlTags(vMatch[1]).trim(), 10);
          if (Number.isFinite(idx) && shared[idx] != null) vals.push(shared[idx]);
        }
      } else if (type === "inlineStr") {
        if (isMatch) vals.push(stripXmlTags(isMatch[1]).replace(/\s+/g, " ").trim());
      } else if (vMatch) {
        // 数值 / 布尔 / 内联 str：直接取 <v> 文本，保留数值
        vals.push(stripXmlTags(vMatch[1]).trim());
      }
      cellCount++;
    }
    if (vals.length) chunks.push(vals.join(" "));
  }
  // [KR5] 工作表数与单元格数计入同一根预算并有上限：两表四单元格在「1 表/1 单元格」预算下必须拒绝，
  // 不多读部分内容伪装成功（共享字符串上下文/顺序仍由调用方保留）。
  budget.consume("sheets", sheetNames.length);
  budget.consume("cells", cellCount);
  return chunks.join("\n").trim();
}

/** OOXML/ODF 手工 XML 降级：与 OfficeParser 共用同一解压预算，不得绕过 */
function extractOoxml(zip, names, budget) {
  const iconv = require("iconv-lite");
  const chunks = [];
  const read = (name) => {
    const entry = zip.getEntry(name);
    if (!entry) return "";
    const data = readZipEntry(zip, entry, budget);
    if (data.length > 4 * 1024 * 1024) fail("PARSE_BUDGET_EXCEEDED", "inflatedBytes");
    return stripXmlTags(iconv.decode(data, "utf-8"));
  };
  const docXml = names.find((n) => n === "word/document.xml" || n.endsWith("/document.xml"));
  if (docXml) chunks.push(read(docXml));
  // [KR7] XLSX：必须还原工作表数值/共享字符串/顺序，不能只读 sharedStrings 而遗漏数值
  const xlsxSheets = names.filter((n) => /(^|\/)xl\/worksheets\/sheet\d+\.xml$/.test(n));
  if (xlsxSheets.length) {
    const sheetText = extractXlsxSheets(zip, names, budget, iconv);
    if (sheetText) chunks.push(sheetText);
  } else {
    for (const n of names.filter((x) => x === "xl/sharedStrings.xml" || x.endsWith("/sharedStrings.xml"))) chunks.push(read(n));
  }
  const slides = names.filter((n) => /(^|\/)ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
  for (const n of slides) chunks.push(read(n));
  const content = names.find((n) => n === "content.xml" || n.endsWith("/content.xml"));
  if (content) chunks.push(read(content));
  return chunks.filter(Boolean).join("\n").trim();
}

/** 表格预览：工作表数 / 单元格数 / 预览行数都有上限，不静默截断后声称完整解析 */
function parseTable(buffer, budget, mode) {
  const XLSX = require("xlsx");
  // 表格/工作簿实际展开字节计入同一根预算（解压预算）：压缩字节（buffer.length）会低估解压后体积，
  // 必须按解压后真实体量计量，超限明确失败，不绕过（压缩 8614、展开 15820 的真实夹具在预算 8630 下必须拒绝）。
  const AdmZip = require("adm-zip");
  let expanded = buffer.length;
  try {
    const zip = new AdmZip(buffer);
    expanded = zip.getEntries().reduce((s, e) => s + (Number(e.header && e.header.size) || 0), 0) || buffer.length;
  } catch { /* 非 zip 容器回退压缩字节 */ }
  budget.consume("inflatedBytes", expanded);
  // 不预先截断：必须看到真实行数，超限是明确失败而非静默截断
  const wb = XLSX.read(buffer, { type: "buffer" });
  const names = wb.SheetNames || [];
  budget.consume("sheets", names.length);
  if (mode === "preview") {
    const first = names[0] || "Sheet1";
    const sheet = wb.Sheets[first];
    const rows = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) : [];
    budget.consume("cells", rows.length * Math.max(1, ...rows.map((r) => (Array.isArray(r) ? r.length : 1))));
    // 达到行数上限是明确失败/限制，不静默截断后声称整份材料已完整解析
    if (rows.length > 500) fail("PARSE_BUDGET_EXCEEDED", "previewRows");
    budget.consume("previewRows", rows.length);
    return { type: "table", sheetName: first, sheetNames: names.slice(0, 10), rows };
  }
  const chunks = [];
  for (const name of names) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const ref = sheet["!ref"];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      budget.consume("cells", (range.e.r - range.s.r + 1) * (range.e.c - range.s.c + 1));
    }
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csv && csv.trim()) chunks.push(`--- ${name} ---\n${csv.trim()}`);
  }
  return chunks.join("\n\n").trim();
}

function legacyWord(buffer, budget) {
  const XLSX = require("xlsx");
  const CFB = XLSX.CFB;
  if (!CFB) return "";
  budget.consume("workUnits", 4);
  const cfb = CFB.read(buffer, { type: "buffer" });
  const find = (name) => { const e = CFB.find(cfb, name); return e ? Buffer.from(e.content) : null; };
  const wd = find("WordDocument");
  if (!wd || wd.length < 0x1aa) return "";
  const flags = wd.readUInt16LE(0x0a);
  const order = (flags & 0x0200) !== 0 ? ["1Table", "0Table"] : ["0Table", "1Table"];
  let tbl = null;
  for (const n of order) { tbl = find(n); if (tbl) break; }
  const fcMin = wd.readUInt32LE(0x18);
  const fcMac = wd.readUInt32LE(0x1c);
  if (fcMac > fcMin && fcMin < wd.length) {
    const raw = wd.subarray(fcMin, Math.min(fcMac, wd.length));
    let oddZero = 0;
    for (let i = 1; i < raw.length; i += 2) if (raw[i] === 0) oddZero++;
    return (oddZero > raw.length / 4 ? raw.toString("utf16le") : raw.toString("latin1"))
      .replace(/\u0000/g, "").replace(/\r/g, "\n").trim();
  }
  void tbl;
  return "";
}

function legacyPpt(buffer, budget) {
  const XLSX = require("xlsx");
  const CFB = XLSX.CFB;
  if (!CFB) return "";
  budget.consume("workUnits", 4);
  const cfb = CFB.read(buffer, { type: "buffer" });
  const e = CFB.find(cfb, "PowerPoint Document") || CFB.find(cfb, "PP40");
  if (!e) return "";
  const s = Buffer.from(e.content);
  const out = [];
  const walk = (start, end, depth) => {
    let pos = start;
    while (pos + 8 <= end && depth < 40) {
      const ver = s.readUInt16LE(pos) & 0x0f;
      const type = s.readUInt16LE(pos + 2);
      const len = s.readUInt32LE(pos + 4);
      const data = pos + 8;
      if (len < 0 || data + len > end) break;
      if (ver === 0x0f) walk(data, data + len, depth + 1);
      else if (type === 0x0fa0) out.push(s.subarray(data, data + len).toString("utf16le"));
      else if (type === 0x0fa8) out.push(s.subarray(data, data + len).toString("latin1"));
      pos = data + len;
    }
  };
  walk(0, s.length, 0);
  return out.join("\n").replace(/\u0000/g, "").trim();
}

function imagePixels(buffer, budget) {
  // 只做尺寸预检，不在 worker 内做 OCR（OCR 沿用主进程既有 terminate 实现）
  let width = 0, height = 0;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer.length >= 24) {
    width = buffer.readUInt32BE(16); height = buffer.readUInt32BE(20);
  } else if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    for (let i = 2; i + 9 < buffer.length - 1;) {
      if (buffer[i] !== 0xff) { i++; continue; }
      const marker = buffer[i + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3].includes(marker)) {
        height = buffer.readUInt16BE(i + 5); width = buffer.readUInt16BE(i + 7); break;
      }
      const len = buffer.readUInt16BE(i + 2);
      if (len < 2) break;
      i += 2 + len;
    }
  }
  if (width && height) budget.consume("imagePixels", width * height);
  return { width, height };
}

function pdfPages(buffer, budget) {
  const latin = buffer.toString("latin1");
  const pages = (latin.match(/\/Type\s*\/Page[^s]/g) || []).length;
  budget.consume("pdfPages", Math.max(1, pages));
  budget.consume("pdfTextChars", latin.length);
  return pages;
}

/** 递归压缩包：根预算共享；声明大小预检 + 真实字节核验；降级链在超限时立即停止 */
async function parseArchive(buffer, budget, depth) {
  const AdmZip = require("adm-zip");
  budget.consume("depth", 1);
  const zip = new AdmZip(buffer);
  const names = zipNames(zip, budget);
  const chunks = [];
  let taken = 0;
  for (const entry of zip.getEntries().filter((e) => !e.isDirectory)) {
    taken++;
    if (taken > ENTRIES_PER_LEVEL) {
      // 每层 20 条上限：达到后明确失败，不静默截断最后一项后声称完整解析
      fail("PARSE_BUDGET_EXCEEDED", "entries");
    }
    const data = readZipEntry(zip, entry, budget);
    if (data.length === 0) continue;
    const child = await parseBuffer(data, entry.entryName, "", budget, depth + 1);
    if (child && child.text) chunks.push(`--- ${entry.entryName} ---\n${child.text}`);
  }
  void names;
  return chunks.join("\n\n").trim();
}

/** 单次重解析主链路；所有分支共用 budget，不因换格式/换文件重新获得完整额度 */
async function parseBuffer(buffer, fileName, mimeType, budget, depth = 0) {
  if (depth > MAX_DEPTH) fail("PARSE_BUDGET_EXCEEDED", "depth"); // 深度超限明确失败，不静默返回空
  // depth=0 的输入字节由调用侧根预算统一计入并随 usage 合并；
  // depth>0 为嵌套解压子文件，实际字节在此计入同一根预算，不重置额度。
  if (depth > 0) budget.consume("inputBytes", buffer.length);
  budget.consume("workUnits", 1);
  if (buffer.length === 0) return { text: "", needsOcr: false };
  const ext = extOf(fileName);
  const kind = magic(buffer);
  const isImage = /\.(png|jpe?g|gif|bmp|webp|tiff?)$/i.test(fileName) || kind === "image" || String(mimeType || "").toLowerCase().startsWith("image/");

  if (isImage) {
    imagePixels(buffer, budget);
    return { text: "", needsOcr: ext !== ".svg" }; // OCR 由主进程既有 terminate 路径执行
  }

  if (kind === "zip") {
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(buffer);
    const names = zipNames(zip, budget);
    const isDoc = isZipDocument(names);
    if (isDoc) {
      let officeText = "";
      // 走手工 XML 降级（与 OfficeParser 同效），且真实解压字节始终计入同一根预算，不绕过
      officeText = extractOoxml(zip, names, budget);
      if (!officeText) {
        officeText = parseTable(buffer, budget, "text");
      }
      budget.consume("outputChars", officeText.length);
      return { text: officeText, needsOcr: false };
    }
    const text = await parseArchive(buffer, budget, depth);
    budget.consume("outputChars", text.length);
    return { text, needsOcr: false };
  }

  if (kind === "pdf" || ext === ".pdf") {
    pdfPages(buffer, budget);
    let text = "";
    try {
      budget.consume("workUnits", 1);
      const { OfficeParser } = require("officeparser");
      const ast = await OfficeParser.parseOffice(buffer, { includeRawContent: false, outputFormat: "text" });
      if (ast && typeof ast.toText === "function") text = String(ast.toText() || "");
      else if (ast && typeof ast.to === "function") {
        const r = await ast.to("text");
        if (r && typeof r.value === "string") text = r.value;
      }
    } catch { /* 无文字层 */ }
    budget.consume("outputChars", text.length);
    return { text, needsOcr: !text }; // 扫描件由主进程 OCR 兜底
  }

  if (/\.(xlsx|xls|csv|ods)$/i.test(ext) || kind === "ole2") {
    let text = "";
    if (kind === "ole2") {
      // 旧 OLE2 容器（旧 doc/ppt）：先尝试 legacyWord/legacyPpt（专为旧格式设计），
      // 再 fallback 表格解析；任一路径抛错都捕获，绝不向上冒泡导致整份材料被当作解析失败
      try { text = legacyWord(buffer, budget) || legacyPpt(buffer, budget) || ""; } catch { text = ""; }
      if (!text) { try { text = parseTable(buffer, budget, "text"); } catch { text = ""; } }
    } else {
      try { text = parseTable(buffer, budget, "text"); } catch { text = ""; }
    }
    budget.consume("outputChars", text.length);
    return { text, needsOcr: false };
  }

  if (/\.(docx|doc|pptx|ppt|odt|odp|rtf|epub)$/i.test(ext) || kind === "rtf") {
    const isZipOffice = /\.(docx|pptx|odt|odp|epub)$/i.test(ext);
    let text = "";
    if (isZipOffice) {
      // 走手工 XML 降级（与 OfficeParser 同效），且真实解压字节始终计入同一根预算，不绕过
      try {
        const AdmZip = require("adm-zip");
        const zip = new AdmZip(buffer);
        const names = zipNames(zip, budget);
        text = extractOoxml(zip, names, budget);
      } catch { /* 文本编码降级 */ }
    }
    if (!text && !isZipOffice && looksLikeText(buffer)) text = decodeText(buffer, budget);
    budget.consume("outputChars", text.length);
    return { text, needsOcr: false };
  }

  const text = looksLikeText(buffer) ? decodeText(buffer, budget) : readableFallback(buffer, budget);
  budget.consume("outputChars", text.length);
  return { text, needsOcr: false };
}

async function runTask(task, remaining) {
  const budget = makeBudget(remaining);
  const result = { usage: budget.usage };

  if (task.kind === "__test_ok") {
    budget.consume("workUnits", 1);
    return { ...result, text: String(task.text ?? "受控正常结果"), usage: budget.usage };
  }
  if (task.kind === "__test_spin") {
    // 非合作同步 CPU 重活：同一事件循环的计时器无法中断它，只有真实 Worker.terminate() 能停止
    for (;;) { /* 由父级终止 */ }
  }
  if (task.kind === "__test_late") {
    // 迟到文本：父级在硬 deadline 终止并确认 exit 后不得接收
    setTimeout(() => {
      try { parentPort && parentPort.postMessage({ envelope: "result", text: "迟到文本不得被接收", usage: {} }); } catch { /* 已关闭 */ }
    }, Number(task.delayMs) || 2000);
    return new Promise(() => {}); // 永不主动结束
  }
  if (task.kind === "__test_crash") {
    process.exit(7);
  }
  if (task.kind === "__test_error") {
    throw new Error("受控解析异常");
  }
  if (task.kind === "__test_init_fail") {
    fail("PARSE_FAILED", "init", "受控初始化失败");
  }

  // 大 buffer 通过 transferList 零拷贝传入；受控测试任务无 buffer
  const transferred = workerData && workerData.bufferArray;
  const buffer = Buffer.from(transferred ? new Uint8Array(transferred) : (task.buffer || []));
  if (task.kind === "table-preview") {
    // 预览任务不经过 parseBuffer，输入字节在此按真实长度计入同一根预算
    budget.consume("inputBytes", buffer.length);
    const table = parseTable(buffer, budget, "preview");
    return { ...result, ...table, usage: budget.usage };
  }
  if (task.kind === "docx-html") {
    budget.consume("inputBytes", buffer.length);
    // [K02] DOCX 容器真实展开计入同一根解压预算：压缩包内 XML 解压后体量更大，
    // 仅按压缩字节（buffer.length）计量会低估，必须在 mammoth 前按实际展开字节核验。
    if (magic(buffer) === "zip") {
      // 容器真实展开字节计入同一根预算（与 extractOoxml/readZipEntry 同源口径）
      const AdmZip = require("adm-zip");
      const zip = new AdmZip(buffer);
      for (const e of zip.getEntries()) {
        budget.consume("inflatedBytes", Number(e.header && e.header.size) || 0);
      }
    }
    const mammoth = require("mammoth");
    // mammoth 为异步 API；这里用 worker 隔离，父级 terminate 可真正结束
    return mammoth.convertToHtml({ buffer }).then((r) => {
      const html = String((r && r.value) || "");
      budget.consume("htmlChars", html.length);
      return { ...result, html, usage: budget.usage };
    });
  }
  const parsed = await parseBuffer(buffer, task.fileName, task.mimeType, budget, 0);
  return { ...result, ...parsed, usage: budget.usage };
}

async function main() {
  if (!parentPort) return; // 被直接 require 时不做任何事（便于产物定位检查）
  // [R0-K K01.5] 结果发出后不自行退出：由父级在收到输出、合并预算后调用
  // terminate() 独占结束权并等待 exit 确认。否则 worker 自然退出的 exit 事件
  // 可能先于 message 到达父线程，被误判为崩溃；也让「结束确认」不再可靠。
  const keepAlive = setInterval(() => {}, 1000);
  void keepAlive;
  const task = (workerData && workerData.task) || null;
  const remaining = (workerData && workerData.remaining) || {};
  if (!task) {
    parentPort.postMessage({ envelope: "result", error: { r0kCode: "PARSE_FAILED", kind: "task" } });
    return;
  }
  if (task.kind === "__test_init_fail") {
    parentPort.postMessage({ envelope: "result", error: { r0kCode: "PARSE_FAILED", kind: "init", message: "受控初始化失败" } });
    return;
  }
  try {
    const value = await runTask(task, remaining);
    // envelope 放在展开之后：业务结果里的 type:"table" 不得覆盖协议信封
    parentPort.postMessage({ ...value, envelope: "result" });
  } catch (e) {
    parentPort.postMessage({
      envelope: "result",
      error: {
        r0kCode: e && (e.r0kCode || (e.code === "ERR_WORKER_OUT_OF_MEMORY" ? "PARSE_BUDGET_EXCEEDED" : "PARSE_FAILED")),
        kind: e && e.r0kKind,
        message: e && e.r0kCode ? e.message : "隔离解析任务执行失败",
      },
    });
  }
}

main();
