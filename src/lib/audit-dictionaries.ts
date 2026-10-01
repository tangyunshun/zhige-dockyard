// 审计日志「显示字典」运行时仓库（纯客户端安全，无任何内置业务字典）。
//
// 数据来源：数据库 system_config 的 audit_action_dict / audit_resource_dict / audit_display_dict，
// 经 /api/admin/operation-logs 的 auditDicts 下发；管理员可在库内直接维护，无需改代码。
// 前端只负责查询与兜底格式化，不内置任何业务映射。

export interface AuditDicts {
  /** 操作动作 → 中文 */
  actions: Record<string, string>;
  /** 业务资源 → 中文 */
  resources: Record<string, string>;
  /** 字段名 → 中文标签 */
  fields: Record<string, string>;
  /** 字段值 → 中文（保留原始键大小写，另见 lookupValueLabel 的大小写兜底） */
  values: Record<string, string>;
  /** 通用词根 → 中文（用于未知键名的智能兜底翻译） */
  words: Record<string, string>;
}

const EMPTY: AuditDicts = {
  actions: {},
  resources: {},
  fields: {},
  values: {},
  words: {},
};

let store: AuditDicts = { ...EMPTY };

/** 写入（覆盖）当前运行时字典；通常由页面在接口返回后调用一次。 */
export function setAuditDicts(next?: Partial<AuditDicts> | null): void {
  store = {
    actions: next?.actions || {},
    resources: next?.resources || {},
    fields: next?.fields || {},
    values: next?.values || {},
    words: next?.words || {},
  };
}

export function getAuditDicts(): AuditDicts {
  return store;
}

/** 字段名精确查表（数据库字典） */
export function lookupFieldLabel(key: string): string | null {
  if (!key) return null;
  return store.fields[key] ?? null;
}

/** 通用词根查表（数据库字典，按小写匹配） */
export function lookupWordLabel(word: string): string | null {
  if (!word) return null;
  return store.words[word] ?? store.words[word.toLowerCase()] ?? null;
}

/**
 * 字段值查表（数据库字典）：
 * 依次尝试「原样 / 小写 / 大写」，兼容历史字典里大小写混用的键。
 */
export function lookupValueLabel(value: unknown): string | null {
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
