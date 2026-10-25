import * as XLSX from "xlsx-js-style";
import { getAuthToken } from "@/utils/auth";

/** 导出留痕信息：文件成功下载后由工具自动 POST 到审计接口（fire-and-forget） */
export interface ExportTrace {
  /** 导出数据类型中文名，如「用户清单」「算力点流水」 */
  exportType: string;
  /** 当前筛选条件（脱敏后的查询参数） */
  filters?: Record<string, any>;
  /** 导出条数 */
  rowCount: number;
  /** 来源页面路径，如 "/admin/users"，用于判断写入管理员端还是用户端留痕 */
  page: string;
  /** 文件基础名（不含时间戳后缀），便于审计回溯 */
  fileName?: string;
}

export interface ExcelColumn<T = any> {
  /** Excel 单元格中文表头名称 */
  header: string;
  /** 对应对象字段属性名（支持直接读取，也可通过 formatter 处理） */
  key?: keyof T | string;
  /** 自定义单元格值格式化函数 */
  formatter?: (val: any, row: T) => string | number | boolean | null | undefined;
  /** 推荐列宽（字符数） */
  width?: number;
}

export interface ExportToExcelOptions<T = any> {
  /** 导出业务类型名（不含「知阁」前缀与时间戳，工具自动拼为 知阁_{type}_{日期}.xlsx，如「用户清单」） */
  filename: string;
  /** Excel 工作表名称，默认为 Sheet1 */
  sheetName?: string;
  /** 列映射配置清单 */
  columns: ExcelColumn<T>[];
  /** 待导出的全量数据集合 */
  data: T[];
  /** 导出条数上限：达到上限时文件末尾追加提示行（默认 5000，见 EXPORT_MAX_ROWS） */
  maxRows?: number;
  /** 时间区间筛选（可选）：传入后文件名追加 _(起-止)_ 段，并在表头标注查询时间范围 */
  dateRange?: { start?: string | null; end?: string | null };
  /** 导出留痕：传入后文件下载成功自动上报审计（失败仅告警，绝不阻塞用户） */
  trace?: ExportTrace;
  /** 导出人展示名（缺省时自动取当前登录用户名，接口不可用时回退令牌邮箱） */
  exportedBy?: string;
  /** 表格大标题（缺省取 filename，如「用户清单」） */
  title?: string;
  /** 自定义筛选条件可读文案；不传则回退尝试 trace.filters */
  filterLabels?: string[];
}

/**
 * 将日期统一规范为 8 位 YYYYMMDD（接受 Date / 字符串 / YYYY-MM-DD 等），非法返回空串。
 */
function normalizeDate8(v?: string | Date | null): string {
  if (!v) return "";
  const s =
    typeof v === "string" ? v : new Date(v).toISOString().slice(0, 10);
  const cleaned = s.replace(/[-/]/g, "").trim();
  return /^\d{8}$/.test(cleaned) ? cleaned : "";
}

/**
 * 将日期区间入参规范为可读文本：日期段显示 YYYY-MM-DD，含具体时刻则显示 YYYY-MM-DD HH:mm:ss。
 */
function formatRangeDate(v?: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (!isNaN(d.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const hasTime = d.getHours() || d.getMinutes() || d.getSeconds();
    return hasTime
      ? `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      : date;
  }
  const d8 = normalizeDate8(v);
  return d8 ? `${d8.slice(0, 4)}-${d8.slice(4, 6)}-${d8.slice(6, 8)}` : String(v);
}

/**
 * 从登录 JWT 中解析导出人（优先邮箱，回退账号/当前用户）。仅用于展示，不校验签名。
 */
async function resolveExportedBy(override?: string): Promise<string> {
  if (override) return override;
  // 优先展示用户名（如 admin）：调 /api/auth/me 取当前登录用户名
  try {
    const token = getAuthToken();
    if (token) {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const name = data?.user?.name || data?.user?.email;
        if (name) return String(name);
      }
    }
  } catch {
    // 接口不可用时回退到令牌解析
  }
  try {
    const token = getAuthToken();
    if (!token) return "当前用户";
    const payload = token.split(".")[1];
    if (!payload) return "当前用户";
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    const name = json.email || json.name || json.username || json.preferred_username || json.sub || json.userId;
    return name ? String(name) : "当前用户";
  } catch {
    return "当前用户";
  }
}

/**
 * 解析本次导出应展示的筛选条件文案：优先使用调用方显式传入的 filterLabels，
 * 否则回退从 trace.filters（原始查询参数）生成可读条目，跳过分页/排序/令牌等噪音字段。
 */
function resolveFilterLabels(opts: ExportToExcelOptions): string[] {
  if (opts.filterLabels && opts.filterLabels.length > 0) return opts.filterLabels;
  const f = opts.trace?.filters;
  if (f && typeof f === "object") {
    const skip = new Set([
      "page",
      "pagenum",
      "pagesize",
      "pages",
      "sortby",
      "sortorder",
      "sort",
      "order",
      "limit",
      "offset",
      "_t",
      "token",
      "authorization",
    ]);
    return Object.entries(f)
      .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !skip.has(k.toLowerCase()))
      .map(([k, v]) => `${k}：${Array.isArray(v) ? v.join("、") : String(v)}`);
  }
  return [];
}

/** 统一标准格式化时间工具 */
export function formatExcelDateTime(dateStr?: string | Date | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`;
}

/**
 * 统一构建导出文件名：
 * - 无时间区间：知阁_{type}_{导出日期YYYYMMDD}.xlsx
 * - 有时间区间：知阁_{type}_({起YYYYMMDD}-{止YYYYMMDD})_{导出日期YYYYMMDD}.xlsx
 * @param type 业务类型名（不含「知阁」前缀，如「用户清单」「操作审计日志」）
 * @param opts.dateRange 可选时间区间筛选（起止为 YYYY-MM-DD 或 YYYYMMDD）
 * @param opts.ext 扩展名，默认 .xlsx
 */
export function buildExportFileName(
  type: string,
  opts: { dateRange?: { start?: string | null; end?: string | null }; ext?: string } = {},
): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const start = normalizeDate8(opts.dateRange?.start);
  const end = normalizeDate8(opts.dateRange?.end);
  const range = start || end ? `_(${start}-${end})` : "";
  const ext = opts.ext ? (opts.ext.startsWith(".") ? opts.ext : `.${opts.ext}`) : ".xlsx";
  return `知阁_${type}${range}_${date}${ext}`;
}

// ===================== 视觉样式常量（6 位 RRGGBB） =====================
const COLOR = {
  titleBg: "1F4E79", // 深蓝
  headerBg: "2E75B6", // 中蓝
  infoBg: "EAF1F8", // 浅蓝
  noteBg: "FFF2CC", // 浅黄（上限提示）
  border: "BFBFBF",
  dataBorder: "D9D9D9",
  white: "FFFFFF",
  text: "333333",
};

function borderStyle(style: "thin" | "medium" = "thin", color = COLOR.dataBorder) {
  return {
    top: { style, color: { rgb: color } },
    bottom: { style, color: { rgb: color } },
    left: { style, color: { rgb: color } },
    right: { style, color: { rgb: color } },
  };
}

/** 给单元格设置样式（不存在则补空单元格） */
function setCellStyle(ws: XLSX.WorkSheet, r: number, c: number, style: any) {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws[addr];
  if (!cell) ws[addr] = { t: "s", v: "" };
  ws[addr].s = style;
}

/** 给矩形区域批量设置样式 */
function styleBlock(ws: XLSX.WorkSheet, r1: number, c1: number, r2: number, c2: number, style: any) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) setCellStyle(ws, r, c, style);
  }
}

/**
 * 统一将数据导出为标准 Excel 表格 (.xlsx)，并在顶部追加合并单元格表头信息区，
 * 同时统一字体 / 对齐 / 边框 / 配色 / 行高列宽，提升可读性与信息完整性。
 * 数据内容与字段顺序保持不变。
 */
export async function exportToExcel<T extends Record<string, any>>(options: ExportToExcelOptions<T>) {
  const { filename, sheetName = "Sheet1", columns, data, trace, maxRows, dateRange } = options;

  if (!data || data.length === 0) {
    throw new Error("当前筛选条件下暂无数据可导出");
  }

  // 将数据按照列配置映射为中文表头键值对（逻辑保持原样）
  const mappedData = data.map((row) => {
    const item: Record<string, any> = {};
    columns.forEach((col) => {
      let rawVal: any;
      if (col.key) {
        // 支持类似 "owner.name" 或 "quota.tokenBalance" 的路径取值
        const keyStr = String(col.key);
        if (keyStr.includes(".")) {
          rawVal = keyStr.split(".").reduce((acc, part) => acc?.[part], row);
        } else {
          rawVal = row[keyStr];
        }
      }

      const formattedVal = col.formatter ? col.formatter(rawVal, row) : (rawVal ?? "");
      item[col.header] = formattedVal;
    });
    return item;
  });

  const colCount = columns.length;

  // ===== 构建顶部表头信息区（合并单元格文本行） =====
  const exportedBy = await resolveExportedBy(options.exportedBy);
  const exportedAt = formatExcelDateTime(new Date());
  const reportTitle = options.title ?? filename;

  const infoRows: string[] = [];
  infoRows.push(reportTitle);
  infoRows.push(`导出人：${exportedBy}`);
  infoRows.push(`导出时间：${exportedAt}`);
  const startDisp = dateRange ? formatRangeDate(dateRange.start ?? null) : "";
  const endDisp = dateRange ? formatRangeDate(dateRange.end ?? null) : "";
  if (startDisp || endDisp) {
    infoRows.push(`查询时间范围：${startDisp || "不限"} 至 ${endDisp || "不限"}`);
  }
  const filterLabels = resolveFilterLabels(options);
  if (filterLabels.length > 0) {
    infoRows.push(`筛选条件（共 ${filterLabels.length} 项）：`);
    filterLabels.forEach((f) => infoRows.push(`　• ${f}`));
  }

  // ===== 组装 AOA（表头信息区 + 空行 + 列头 + 数据） =====
  const aoa: any[][] = [];
  infoRows.forEach((t) => aoa.push([t]));
  aoa.push([]); // 表头信息区与数据表之间的空行
  const headerRow = columns.map((c) => c.header);
  aoa.push(headerRow);
  mappedData.forEach((item) => aoa.push(columns.map((c) => item[c.header])));

  // 导出上限提示：当数据量触达配置上限时，文件末尾追加一行说明，引导缩小筛选范围
  const hasNote = !!(maxRows && data.length >= maxRows);
  if (hasNote) {
    aoa.push([`已达导出上限 ${maxRows} 条，请缩小筛选范围`]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  // ===== 列宽（汉字占宽约为英文的 2 倍） =====
  const colWidths = columns.map((col) => {
    if (col.width) return { wch: col.width };

    let maxLen = 0;
    for (let i = 0; i < col.header.length; i++) {
      maxLen += col.header.charCodeAt(i) > 255 ? 2 : 1;
    }
    const sampleRows = mappedData.slice(0, 50);
    sampleRows.forEach((r) => {
      const valStr = String(r[col.header] ?? "");
      let rowLen = 0;
      for (let i = 0; i < valStr.length; i++) {
        rowLen += valStr.charCodeAt(i) > 255 ? 2 : 1;
      }
      if (rowLen > maxLen) maxLen = rowLen;
    });
    return { wch: Math.min(Math.max(maxLen + 4, 12), 60) };
  });
  worksheet["!cols"] = colWidths;

  // ===== 行高 =====
  const blankRowIndex = infoRows.length;
  const headerRowIndex = infoRows.length + 1;
  const firstDataRow = headerRowIndex + 1;
  const lastDataRow = aoa.length - 1;
  const rowsMeta: { hpx: number }[] = [];
  rowsMeta[0] = { hpx: 30 }; // 大标题
  for (let i = 1; i <= infoRows.length - 1; i++) rowsMeta[i] = { hpx: 18 };
  rowsMeta[blankRowIndex] = { hpx: 6 };
  rowsMeta[headerRowIndex] = { hpx: 26 };
  for (let r = firstDataRow; r <= lastDataRow; r++) rowsMeta[r] = { hpx: 18 };
  worksheet["!rows"] = rowsMeta;

  // ===== 合并单元格（表头信息区每行横跨全部列；上限提示行横跨全部列） =====
  const merges: any[] = [];
  for (let i = 0; i < infoRows.length; i++) {
    merges.push({ s: { r: i, c: 0 }, e: { r: i, c: colCount - 1 } });
  }
  if (hasNote) {
    merges.push({ s: { r: lastDataRow, c: 0 }, e: { r: lastDataRow, c: colCount - 1 } });
  }
  worksheet["!merges"] = merges;

  // ===== 样式 =====
  const titleStyle = {
    font: { bold: true, size: 16, color: { rgb: COLOR.white } },
    fill: { fgColor: { rgb: COLOR.titleBg } },
    alignment: { horizontal: "center", vertical: "center" },
    border: borderStyle("thin", COLOR.border),
  };
  const infoStyle = {
    font: { size: 10, color: { rgb: COLOR.text } },
    fill: { fgColor: { rgb: COLOR.infoBg } },
    alignment: { horizontal: "left", vertical: "center", wrapText: true },
    border: borderStyle("thin", COLOR.border),
  };
  const headerStyle = {
    font: { bold: true, size: 11, color: { rgb: COLOR.white } },
    fill: { fgColor: { rgb: COLOR.headerBg } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: borderStyle("medium", COLOR.border),
  };
  const noteStyle = {
    font: { bold: true, size: 10, color: { rgb: COLOR.text } },
    fill: { fgColor: { rgb: COLOR.noteBg } },
    alignment: { horizontal: "left", vertical: "center" },
    border: borderStyle("thin", COLOR.border),
  };

  // 表头信息区
  styleBlock(worksheet, 0, 0, 0, colCount - 1, titleStyle);
  for (let i = 1; i < infoRows.length; i++) {
    styleBlock(worksheet, i, 0, i, colCount - 1, infoStyle);
  }
  // 列头
  styleBlock(worksheet, headerRowIndex, 0, headerRowIndex, colCount - 1, headerStyle);
  // 数据区（数字右对齐，其余左对齐）
  for (let r = firstDataRow; r <= lastDataRow; r++) {
    for (let c = 0; c < colCount; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = worksheet[addr];
      const isNum = typeof cell?.v === "number";
      setCellStyle(worksheet, r, c, {
        font: { size: 10, color: { rgb: COLOR.text } },
        alignment: { horizontal: isNum ? "right" : "left", vertical: "center", wrapText: false },
        border: borderStyle("thin", COLOR.dataBorder),
      });
    }
  }
  // 上限提示行
  if (hasNote) {
    styleBlock(worksheet, lastDataRow, 0, lastDataRow, colCount - 1, noteStyle);
  }

  // 创建工作簿并追加 Sheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // 生成文件名：知阁_{业务类型}_{[ (起-止)_ ]}{导出日期YYYYMMDD}.xlsx
  const outName = buildExportFileName(filename, { dateRange, ext: "xlsx" });

  // 触发浏览器直接下载 .xlsx
  XLSX.writeFile(workbook, outName);

  // 导出留痕：文件已成功触发下载，异步上报审计（fire-and-forget，失败仅告警，绝不阻塞用户）
  if (trace && typeof window !== "undefined" && typeof fetch !== "undefined") {
    const endpoint = trace.page.startsWith("/admin") ? "/api/admin/export-log" : "/api/user/export-log";
    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken()}` },
      body: JSON.stringify({ ...trace, fileName: outName }),
    }).catch((e) => console.warn("导出留痕上报失败（不影响导出）:", e));
  }
}
