/**
 * 模型抽象能力的展示名（全站唯一真源）。
 *
 * - 运行期以 systemsetting 表的 model_capability_labels（JSON）为准，管理员可在后台调整、无需发版；
 * - 数据库未配置时才回退本文件的内置值（仅作兜底，不是业务数据源）；
 * - 能力键与合同白名单（src/lib/component-contract/types.ts 的 RequiredModelCapability）保持一致，
 *   另兼容历史数据中出现的扩展键。
 */
export const MODEL_CAPABILITY_LABELS: Record<string, string> = {
  TEXT_GENERATION: "文本生成",
  STRUCTURED_OUTPUT: "结构化输出",
  VISION: "视觉理解",
  IMAGE_INPUT: "图像理解",
  LONG_CONTEXT: "长上下文",
  FILE_ANALYSIS: "文件分析",
  FILE_INPUT: "文件解析",
  FUNCTION_CALL: "函数调用",
  CODE_GENERATION: "代码生成",
  REASONING: "深度推理",
  EMBEDDING: "向量化",
};

/** 能力展示名的数据库配置键（systemsetting.key） */
export const MODEL_CAPABILITY_LABELS_KEY = "model_capability_labels";

/**
 * 合并数据库配置与内置字典：数据库优先，内置兜底。
 * 非法 JSON / 非对象 / 空值一律忽略，保证不会因脏配置把界面打崩。
 */
export function mergeCapabilityLabels(raw: string | null | undefined): Record<string, string> {
  const merged: Record<string, string> = { ...MODEL_CAPABILITY_LABELS };
  if (!raw) return merged;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return merged;
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim().length > 0) merged[k] = v.trim();
    }
  } catch {
    /* 脏配置忽略，沿用内置字典 */
  }
  return merged;
}
