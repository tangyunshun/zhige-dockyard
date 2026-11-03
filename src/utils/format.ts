// 后台数据展示格式化统一工具（自查清单指令一 1d）
// 约定：所有函数对 null/undefined/NaN/空串返回 "-"，严禁页面出现空白或 undefined

/** 精确时刻：YYYY-MM-DD HH:mm:ss（订单/流水/操作/审计等） */
export function formatDateTime(v: string | Date | null | undefined): string {
  if (!v) return "-";
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" + pad(d.getMonth() + 1) +
    "-" + pad(d.getDate()) +
    " " + pad(d.getHours()) +
    ":" + pad(d.getMinutes()) +
    ":" + pad(d.getSeconds())
  );
}

/** 纯日期语义：YYYY-MM-DD（生效日/过期日/仅日期列） */
export function formatDate(v: string | Date | null | undefined): string {
  if (!v) return "-";
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return "-";
  const pad = (n: number) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

/** 数值千分位；小数位原样保留；无效返回 "-" */
export function formatNumber(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "-";
  const num = typeof n === "string" ? Number(n) : n;
  if (typeof num !== "number" || isNaN(num)) return "-";
  // toLocaleString 保留小数（最多 2 位防浮点尾差，整数不受影响）
  return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** 金额（分转元 + 千分位，两位小数）；无效返回 "-" */
export function formatMoney(cents: number | string | null | undefined): string {
  if (cents === null || cents === undefined || cents === "") return "-";
  const num = typeof cents === "string" ? Number(cents) : cents;
  if (typeof num !== "number" || isNaN(num)) return "-";
  return (num / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 手机号脱敏：182****1234；非 11 位保留前 3 后 2 打码；空返回 "-" */
export function maskPhone(p: string | null | undefined): string {
  if (!p) return "-";
  const s = String(p).trim();
  if (s.length === 11) return s.slice(0, 3) + "****" + s.slice(7);
  if (s.length > 5) return s.slice(0, 3) + "****" + s.slice(-2);
  return "****";
}

/** 邮箱脱敏：a***@domain.com；空返回 "-" */
export function maskEmail(e: string | null | undefined): string {
  if (!e) return "-";
  const s = String(e).trim();
  const at = s.indexOf("@");
  if (at <= 0) return "***";
  return s.slice(0, 1) + "***" + s.slice(at);
}
