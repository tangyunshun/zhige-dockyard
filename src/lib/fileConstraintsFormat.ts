/**
 * 将合同 fileConstraints.acceptedMimes 中的 MIME 类型 / 扩展名映射为终端用户可读的中文标签。
 * 目的：避免组件大厅 / 调度面板把 application/vnd.openxmlformats-officedocument.wordprocessingml.document
 * 这类原始代码字符直接暴露给普通用户。
 *
 * 输出规则：
 * 1. 同类文件聚合并附扩展名提示，如「Excel 表格（.xls / .xlsx）」，让用户知道上传时能选什么文件；
 * 2. 新旧格式归并到同一中文标签（application/vnd.ms-excel 与 .xlsx 都显示为「Excel 表格」）；
 * 3. 未知类型按 application/xxx → 「xxx 类型文件」兜底，绝不把看不懂的原始编码直接丢给用户。
 */

interface MimeDisplayInfo {
  /** 用户可读的文件类型中文名 */
  label: string;
  /** 对应的文件扩展名（用于聚合提示） */
  ext: string;
}

const MIME_INFO_MAP: Record<string, MimeDisplayInfo> = {
  // 纯文本 / 标记语言
  "text/plain": { label: "纯文本", ext: ".txt" },
  "text/markdown": { label: "Markdown", ext: ".md" },
  "text/csv": { label: "CSV 表格", ext: ".csv" },
  "text/tab-separated-values": { label: "TSV 表格", ext: ".tsv" },
  "text/html": { label: "HTML 网页", ext: ".html" },
  // 文档
  "application/pdf": { label: "PDF 文档", ext: ".pdf" },
  "application/msword": { label: "Word 文档", ext: ".doc" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    label: "Word 文档",
    ext: ".docx",
  },
  // 表格（新旧 Excel 归并为同一标签）
  "application/vnd.ms-excel": { label: "Excel 表格", ext: ".xls" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
    label: "Excel 表格",
    ext: ".xlsx",
  },
  // 演示（新旧 PPT 归并）
  "application/vnd.ms-powerpoint": { label: "PPT 演示", ext: ".ppt" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    label: "PPT 演示",
    ext: ".pptx",
  },
  // 结构化数据
  "application/json": { label: "JSON 文件", ext: ".json" },
  "application/xml": { label: "XML 文件", ext: ".xml" },
  "text/xml": { label: "XML 文件", ext: ".xml" },
  "application/x-yaml": { label: "YAML 文件", ext: ".yml" },
  "text/yaml": { label: "YAML 文件", ext: ".yml" },
  // 图片
  "image/png": { label: "PNG 图片", ext: ".png" },
  "image/jpeg": { label: "JPG 图片", ext: ".jpg" },
  "image/gif": { label: "GIF 图片", ext: ".gif" },
  "image/webp": { label: "WebP 图片", ext: ".webp" },
  "image/svg+xml": { label: "SVG 矢量图", ext: ".svg" },
  // 压缩包
  "application/zip": { label: "ZIP 压缩包", ext: ".zip" },
  "application/x-zip-compressed": { label: "ZIP 压缩包", ext: ".zip" },
  "application/gzip": { label: "GZ 压缩包", ext: ".gz" },
  // 其它常见
  "application/octet-stream": { label: "二进制文件", ext: "" },
};

const EXT_INFO_MAP: Record<string, MimeDisplayInfo> = {
  ".txt": { label: "纯文本", ext: ".txt" },
  ".md": { label: "Markdown", ext: ".md" },
  ".markdown": { label: "Markdown", ext: ".md" },
  ".csv": { label: "CSV 表格", ext: ".csv" },
  ".tsv": { label: "TSV 表格", ext: ".tsv" },
  ".html": { label: "HTML 网页", ext: ".html" },
  ".htm": { label: "HTML 网页", ext: ".html" },
  ".pdf": { label: "PDF 文档", ext: ".pdf" },
  ".doc": { label: "Word 文档", ext: ".doc" },
  ".docx": { label: "Word 文档", ext: ".docx" },
  ".xls": { label: "Excel 表格", ext: ".xls" },
  ".xlsx": { label: "Excel 表格", ext: ".xlsx" },
  ".ppt": { label: "PPT 演示", ext: ".ppt" },
  ".pptx": { label: "PPT 演示", ext: ".pptx" },
  ".json": { label: "JSON 文件", ext: ".json" },
  ".xml": { label: "XML 文件", ext: ".xml" },
  ".yml": { label: "YAML 文件", ext: ".yml" },
  ".yaml": { label: "YAML 文件", ext: ".yml" },
  ".png": { label: "PNG 图片", ext: ".png" },
  ".jpg": { label: "JPG 图片", ext: ".jpg" },
  ".jpeg": { label: "JPG 图片", ext: ".jpg" },
  ".gif": { label: "GIF 图片", ext: ".gif" },
  ".webp": { label: "WebP 图片", ext: ".webp" },
  ".svg": { label: "SVG 矢量图", ext: ".svg" },
  ".zip": { label: "ZIP 压缩包", ext: ".zip" },
  ".gz": { label: "GZ 压缩包", ext: ".gz" },
  ".log": { label: "日志文件", ext: ".log" },
};

/**
 * 归一化单条配置：兼容 MIME 类型与扩展名两种写法，
 * 容忍大小写差异与分号后的参数（如 text/csv; charset=utf-8）。
 */
function normalizeEntry(raw: string): MimeDisplayInfo | null {
  const value = raw.trim().toLowerCase().split(";")[0].trim();
  if (!value) return null;
  if (MIME_INFO_MAP[value]) return MIME_INFO_MAP[value];
  if (value.startsWith(".")) {
    return EXT_INFO_MAP[value] ?? { label: value, ext: value };
  }
  // 未知 MIME 兜底：application/xxx → 「xxx 类型文件」，避免原始编码直达用户
  const subtype = value.includes("/") ? value.split("/")[1] : value;
  return { label: `${subtype} 类型文件`, ext: "" };
}

/**
 * 把 acceptedMimes 数组转成用户可读的一句话说明。
 * 例：["application/json", "text/csv", "application/vnd.ms-excel",
 *      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]
 *  → "JSON 文件（.json） / CSV 表格（.csv） / Excel 表格（.xls / .xlsx）"
 */
export function describeAcceptedMimes(mimes: string[] | undefined | null): string {
  if (!mimes || mimes.length === 0) return "";
  const groups = new Map<string, Set<string>>();
  for (const raw of mimes) {
    const info = normalizeEntry(raw);
    if (!info) continue;
    const exts = groups.get(info.label) ?? new Set<string>();
    if (info.ext) exts.add(info.ext);
    groups.set(info.label, exts);
  }
  return Array.from(groups.entries())
    .map(([label, exts]) =>
      exts.size > 0 ? `${label}（${Array.from(exts).join(" / ")}）` : label
    )
    .join(" / ");
}

/**
 * 单个 MIME / 扩展名 → 用户可读中文标签（不带扩展名聚合提示）。
 * 供成果物卡片、合同输出 MIME 等单值展示复用；未知类型按「xxx 类型文件」兜底，绝不暴露原始编码。
 */
export function describeMimeType(mime?: string | null): string {
  if (!mime) return "—";
  const info = normalizeEntry(mime);
  return info ? info.label : mime;
}

/**
 * 判断一个文件是否被组件合同的白名单允许（前端上传前拦截用，后端仍会再次强校验）。
 * 匹配规则：
 * 1) 浏览器报告的 MIME（去参数、小写）精确命中白名单；
 * 2) 文件扩展名（.pdf 等）直接出现在白名单中；
 * 3) 白名单条目本身是扩展名时，与文件扩展名比对；
 * 4) 浏览器 MIME 缺失（Windows 上 .md/.csv 常为空）时，用扩展名反查标准 MIME 再比对；
 * 5) 白名单支持主类型通配（如 image/*）。
 */
export function isFileAcceptedByContract(
  file: { name: string; type?: string },
  acceptedMimes: string[] | undefined | null,
): boolean {
  if (!acceptedMimes || acceptedMimes.length === 0) return true; // 合同未声明白名单 → 不做组件级拦截（交由全局解析能力约束）
  const normalized = acceptedMimes
    .map((m) => m.trim().toLowerCase().split(";")[0].trim())
    .filter(Boolean);
  if (normalized.length === 0) return true;

  const name = file.name.toLowerCase();
  const dotIdx = name.lastIndexOf(".");
  const ext = dotIdx >= 0 ? name.slice(dotIdx) : "";
  const mime = (file.type || "").toLowerCase().split(";")[0].trim();

  const match = (entry: string): boolean => {
    if (entry === mime && mime) return true;
    if (entry === ext && ext) return true;
    // 主类型通配：image/* 命中 image/png 等
    if (entry.endsWith("/*") && mime.startsWith(entry.slice(0, -1))) return true;
    // 浏览器未报告 MIME：用扩展名反查标准 MIME 再比对
    if (!mime && ext) {
      const guess = EXT_INFO_MAP[ext];
      if (guess) {
        const guessMimes = Object.entries(MIME_INFO_MAP)
          .filter(([, v]) => v.label === guess.label)
          .map(([k]) => k);
        if (guessMimes.includes(entry)) return true;
      }
      if (MIME_INFO_MAP[entry]?.ext === ext) return true;
    }
    return false;
  };

  return normalized.some(match);
}

/**
 * 生成 <input type="file" accept> 的值：MIME 与对应典型扩展名一起放入，
 * 让系统文件选择器按组件合同白名单预过滤（用户仍可切「所有文件」，执行前还有校验兜底）。
 */
export function buildFileAcceptAttr(acceptedMimes: string[] | undefined | null): string {
  if (!acceptedMimes || acceptedMimes.length === 0) return "";
  const values = new Set<string>();
  for (const raw of acceptedMimes) {
    const info = normalizeEntry(raw);
    if (!info) continue;
    // 反查该条目原始写法（MIME 原样放入 accept）；扩展名写法直接放扩展名
    const normalized = raw.trim().toLowerCase().split(";")[0].trim();
    if (normalized.startsWith(".")) {
      values.add(normalized);
    } else {
      values.add(normalized);
      if (info.ext) values.add(info.ext);
    }
  }
  return Array.from(values).join(",");
}
