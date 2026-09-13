import * as XLSX from "xlsx";

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
  /** 导出文件基础名称（不带后缀，系统会自动附加时间戳） */
  filename: string;
  /** Excel 工作表名称，默认为 Sheet1 */
  sheetName?: string;
  /** 列映射配置清单 */
  columns: ExcelColumn<T>[];
  /** 待导出的全量数据集合 */
  data: T[];
}

/**
 * 统一将数据导出为标准 Excel 表格 (.xlsx)
 */
export function exportToExcel<T extends Record<string, any>>(options: ExportToExcelOptions<T>) {
  const { filename, sheetName = "Sheet1", columns, data } = options;

  if (!data || data.length === 0) {
    throw new Error("当前筛选条件下暂无数据可导出");
  }

  // 将数据按照列配置映射为中文表头键值对
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

  // 生成工作表
  const worksheet = XLSX.utils.json_to_sheet(mappedData);

  // 自动计算优化列宽（汉字占宽约为英文的 2 倍）
  const colWidths = columns.map((col) => {
    if (col.width) return { wch: col.width };

    // 计算表头宽度
    let maxLen = 0;
    for (let i = 0; i < col.header.length; i++) {
      maxLen += col.header.charCodeAt(i) > 255 ? 2 : 1;
    }

    // 采样前 50 行内容计算数据最大宽度
    const sampleRows = mappedData.slice(0, 50);
    sampleRows.forEach((r) => {
      const valStr = String(r[col.header] ?? "");
      let rowLen = 0;
      for (let i = 0; i < valStr.length; i++) {
        rowLen += valStr.charCodeAt(i) > 255 ? 2 : 1;
      }
      if (rowLen > maxLen) {
        maxLen = rowLen;
      }
    });

    return { wch: Math.min(Math.max(maxLen + 4, 12), 60) };
  });

  worksheet["!cols"] = colWidths;

  // 创建工作簿并追加 Sheet
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // 拼接年月日时分秒时间戳，例如: 20260912_182030
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const timeStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  // 触发浏览器直接下载 .xlsx
  XLSX.writeFile(workbook, `${filename}_${timeStr}.xlsx`);
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
