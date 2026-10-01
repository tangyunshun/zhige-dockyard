/**
 * 组件算力成本与历史用量展示的纯函数工具。
 *
 * 原则：
 *  - 非法 / 缺失一律回退 0，绝不使用固定兜底值（如 5）；
 *  - componentcatalog.estimatedModelTokens 是「Token 用量估算」，不是算力点、更不是扣费金额；
 *    实际扣点一律由算账中心（src/lib/billing/pricing-center.ts）换算，
 *    历史已发生消耗以 pointledger 的 CONSUME 流水为准，禁止再用本字段当点数累加展示；
 *  - 当前阶段（组件迁移未完成前）仅允许单一主材料，文件输入只保留第一个。
 */

/** 历史任务 / 成本展示：返回合法正数成本，否则 0（绝不显示 5） */
export function resolveTokenCostDisplay(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 组件成本是否为可保存的合法正整数（用于后台新增 / 编辑校验）。
 *
 * 严格类型校验，仅接受：
 *  - number 类型的安全正整数；
 *  - string 类型且内容为「纯十进制数字」的正整数（如 "5"、"05"）。
 * 显式拒绝布尔值、数组、对象、空白字符串，以及小数 / 负数 / 0 / NaN / Infinity /
 * 科学计数法 / 十六进制 / 含其他字符的字符串（避免 Number() 隐式转换误通过）。
 */
export function isValidComponentCost(raw: unknown): boolean {
  if (typeof raw === "number") {
    return Number.isSafeInteger(raw) && raw > 0;
  }
  if (typeof raw === "string") {
    // 必须整体为纯十进制数字，不接受空白、符号、小数点、指数等任何其他字符
    if (!/^\d+$/.test(raw)) return false;
    const n = Number(raw);
    return Number.isSafeInteger(n) && n > 0;
  }
  return false;
}

export type ComponentCostDecision =
  | { ok: true; provided: boolean; value: number }
  | { ok: false; message: string };

/**
 * 组件成本校验与落库决策：
 *  - 新建（isUpdate=false）：必须提供合法正整数，缺失 / 0 / 负数 / 小数 / NaN / 非法字符串一律拒绝；
 *  - 更新（isUpdate=true）：显式提供则必须合法；未提供则保持数据库原值（provided=false，不写入）。
 */
export function resolveComponentCost(input: unknown, isUpdate: boolean): ComponentCostDecision {
  const provided = input !== undefined && input !== null && input !== "";
  if (!provided) {
    if (!isUpdate) return { ok: false, message: "请配置真实算力成本（合法正整数）" };
    return { ok: true, provided: false, value: 0 };
  }
  if (!isValidComponentCost(input)) {
    return { ok: false, message: "请配置真实算力成本（合法正整数）" };
  }
  return { ok: true, provided: true, value: Number(input) };
}

/** 当前阶段仅允许单一主材料：文件输入最多保留 1 个 */
export const MAX_SINGLE_MATERIAL_FILES = 1;

export type SingleMaterialFileDecision =
  | { ok: true; file: File | null }
  | { ok: false; code: "INPUT_MULTIPLE_NOT_SUPPORTED"; message: string };

/**
 * 服务端 multipart 文件校验：当前阶段仅允许一个主文件，多文件一律拒绝
 * （前端限制不能替代服务端校验）。
 */
export function selectSingleMaterialFile(files: File[]): SingleMaterialFileDecision {
  if (files.length > MAX_SINGLE_MATERIAL_FILES) {
    return {
      ok: false,
      code: "INPUT_MULTIPLE_NOT_SUPPORTED",
      message: "当前阶段仅支持单一主材料，不支持一次上传多个文件。",
    };
  }
  return { ok: true, file: files[0] ?? null };
}
