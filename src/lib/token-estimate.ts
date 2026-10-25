/**
 * 轻量 Token 估算（执行前输入闸门用）。
 *
 * 目的：在调用模型之前，判断本次实际输入是否远超组件配置的「预估输入 Token」，
 * 超限直接拒绝执行（不扣点、不调模型），堵住「上传超大材料刷爆平台模型额度」的路径。
 *
 * 口径（保守、确定性、无外部依赖）：
 *  - CJK（中日韩）字符：1 字符 ≈ 1 token；
 *  - 其余字符（英文/数字/符号/空白）：约 4 字符 ≈ 1 token；
 * 与主流分词器的量级接近，用于 3 倍阈值的闸门判定足够（宁可略高估，不可漏放）。
 */

/** 粗略判断是否 CJK 表意字符（含扩展区与日文假名按 1 字符 1 token 计） */
function isCjkLike(codePoint: number): boolean {
  return (
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) || // CJK 统一表意
    (codePoint >= 0x3400 && codePoint <= 0x4dbf) || // 扩展 A
    (codePoint >= 0xf900 && codePoint <= 0xfaff) || // 兼容表意
    (codePoint >= 0x3040 && codePoint <= 0x30ff) || // 日文假名
    (codePoint >= 0xac00 && codePoint <= 0xd7af) // 韩文音节
  );
}

/** 估算一段文本的 Token 数量（正整数） */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (isCjkLike(cp)) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

/** 估算多段文本（如 systemPrompt + userPrompt）合计的 Token 数量 */
export function estimateCombinedTokenCount(...texts: Array<string | null | undefined>): number {
  let total = 0;
  for (const t of texts) {
    if (typeof t === "string" && t.length > 0) total += estimateTokenCount(t);
  }
  return total;
}
