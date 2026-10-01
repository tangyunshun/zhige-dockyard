/**
 * JSON 安全化工具
 * ----------------------------------------------------------------------------
 * 背景：数据库多处使用 BigInt（如 workspacemember.monthlyTokenLimit /
 * monthlyTokenUsed / tokenBalance，workspacequota.* 等），而 `NextResponse.json`
 * 底层 JSON.stringify 遇到 BigInt 会抛 "Do not know how to serialize a BigInt"，
 * 表现为接口 500。
 *
 * 本工具递归转换：
 *   - bigint  -> number（在 Number 安全整数范围内）或 string（超出范围，避免精度丢失）
 *   - Date    -> 原样保留（交给 JSON.stringify 转 ISO 字符串）
 *   - Array   -> 逐项转换
 *   - Object  -> 逐字段转换
 *   - 其它     -> 原样返回
 */
export function toJsonSafe<T>(value: T): T {
  if (typeof value === "bigint") {
    return (
      value <= BigInt(Number.MAX_SAFE_INTEGER) && value >= BigInt(Number.MIN_SAFE_INTEGER)
        ? Number(value)
        : value.toString()
    ) as unknown as T;
  }

  // Date 必须在普通对象判断之前返回，否则会被拆成 {} 丢失时间
  if (value instanceof Date) return value;

  if (Array.isArray(value)) {
    return value.map((item) => toJsonSafe(item)) as unknown as T;
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = toJsonSafe(item);
    }
    return output as unknown as T;
  }

  return value;
}
