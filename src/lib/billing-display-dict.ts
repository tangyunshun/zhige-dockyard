// 账单 / 算力点流水「显示字典」运行时仓库（纯客户端安全，无任何内置业务字典）。
//
// 数据来源：数据库 system_config 的 billing_display_dict，经 /api/user/billing-dict 下发；
// 管理员可在库内直接维护，无需改代码。前端只负责查询与兜底格式化，不内置任何业务映射。

export interface BillingDicts {
  /** 字段名 → 中文（如 type → 类型） */
  fields: Record<string, string>;
  /** 字段值 → 中文（如 CONSUME → 组件执行扣点） */
  values: Record<string, string>;
  /** 通用词根 → 中文（用于未知键名的智能兜底翻译） */
  words: Record<string, string>;
}

const EMPTY: BillingDicts = {
  fields: {},
  values: {},
  words: {},
};

let store: BillingDicts = { ...EMPTY };

/** 写入（覆盖）当前运行时字典；通常由页面在接口返回后调用一次。 */
export function setBillingDicts(next?: Partial<BillingDicts> | null): void {
  store = {
    fields: next?.fields || {},
    values: next?.values || {},
    words: next?.words || {},
  };
}

export function getBillingDicts(): BillingDicts {
  return store;
}

/** 字段名精确查表（数据库字典） */
export function lookupBillingFieldLabel(key: string): string | null {
  if (!key) return null;
  return store.fields[key] ?? store.fields[key.toLowerCase()] ?? null;
}

/**
 * 字段值查表（数据库字典）：
 * 依次尝试「原样 / 小写 / 大写」，兼容历史字典里大小写混用的键。
 */
export function lookupBillingValueLabel(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  return (
    store.values[raw] ??
    store.values[raw.toLowerCase()] ??
    store.values[raw.toUpperCase()] ??
    null
  );
}
