// 操作日志细节字段（details）前端中文翻译、格式化与安全脱敏工具。
// 纯函数、无 prisma 依赖，可在客户端组件安全引用。
// 说明：字段名 / 字段值 / 词根的中文映射全部来自数据库字典（system_config.audit_display_dict，
// 经 /api/admin/operation-logs 的 auditDicts 下发），本模块不再内置任何业务字典。

import { lookupFieldLabel, lookupValueLabel } from "@/lib/audit-dictionaries";

// 读取、复制、查看原始 JSON、导出时必须统一脱敏的敏感字段（大小写不敏感匹配）
export const SENSITIVE_DETAIL_KEYS = [
  "oldSessionToken",
  "newSessionToken",
  "sessionToken",
  "refreshToken",
  "token",
  "password",
  "secret",
] as const;

const SENSITIVE_KEY_SET = new Set<string>(
  SENSITIVE_DETAIL_KEYS.map((k) => k.toLowerCase()),
);

export function isSensitiveDetailKey(key: string): boolean {
  return SENSITIVE_KEY_SET.has((key || "").trim().toLowerCase());
}

// 对无法解析为 JSON 的纯文本，兜底抹除「键值形态」的敏感凭证
function scrubSensitiveText(text: string): string {
  return text.replace(
    /("?(?:oldSessionToken|newSessionToken|sessionToken|refreshToken|token|password|secret)"?\s*[:=]\s*)("?)([^",}\s]+)\2/gi,
    '$1"[已脱敏]"',
  );
}

/**
 * 统一脱敏审计 details（对象 / 数组 / JSON 字符串 / 纯文本）。
 * 所有详情展示、复制、原始 JSON 查看、Excel / JSON 导出入口必须调用。
 */
export function sanitizeAuditDetails(details: unknown): unknown {
  if (details === null || details === undefined) return details;

  if (typeof details === "string") {
    const trimmed = details.trim();
    if (!trimmed) return details;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") return sanitizeAuditDetails(parsed);
    } catch {
      // 非 JSON 文本：走键值形态脱敏
    }
    return scrubSensitiveText(details);
  }

  if (Array.isArray(details)) return details.map((item) => sanitizeAuditDetails(item));

  if (typeof details === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(details as Record<string, unknown>)) {
      if (isSensitiveDetailKey(k)) continue; // 敏感字段直接剔除，绝不进入展示/导出
      out[k] = sanitizeAuditDetails(v);
    }
    return out;
  }

  return details;
}

// 判断是否本地 / 内网 IP（用于识别历史“异地登录”误标语义）
export function isLocalIpAddress(ip?: string | null): boolean {
  if (!ip) return true;
  const s = String(ip).trim().replace(/^::ffff:/, "");
  if (!s || s === "127.0.0.1" || s === "::1" || s === "localhost") return true;
  if (s.startsWith("192.168.") || s.startsWith("10.") || s.startsWith("127.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(s)) return true;
  return false;
}

// 把 details（对象或 JSON 字符串）安全解析为对象；无法解析时返回 null
export function parseLogDetails(details: unknown): Record<string, unknown> | string | null {
  if (details === null || details === undefined) return null;
  if (typeof details === "string") {
    try {
      const parsed = JSON.parse(details);
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : details;
    } catch {
      return details; // 纯文本细节，原样返回
    }
  }
  if (typeof details === "object") return details as Record<string, unknown>;
  return String(details);
}

export interface AuditSummaryResult {
  summary: string | null;
  // 旧记录存在“本地 IP 却写成异地登录”的错误语义，需在前端标注为历史数据待复核
  historicalSemanticsUnverified: boolean;
}

/**
 * 统一生成日志摘要：优先使用后端 message；对历史 SESSION_CONFLICT_LOGOUT 中
 * 「本地 IP 却写成异地登录」的错误语义，改用中性描述并标注待复核。
 */
export function resolveAuditSummary(log: {
  action?: string | null;
  ipAddress?: string | null;
  details?: unknown;
}): AuditSummaryResult {
  const parsed = parseLogDetails(log?.details);
  const obj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  let summary = typeof obj?.message === "string" ? obj.message.trim() : null;
  let unverified = false;

  const action = (log?.action || "").trim();

  if (action === "SESSION_CONFLICT_LOGOUT" && summary && /异地/.test(summary)) {
    const detailIp = typeof obj?.ipAddress === "string" ? (obj.ipAddress as string) : null;
    if (isLocalIpAddress(log?.ipAddress) || isLocalIpAddress(detailIp)) {
      // 本地 IP 不可能构成异地登录，纠正为中性描述并标注待复核
      summary = "账号会话被新登录顶替下线（历史数据语义待复核）";
      unverified = true;
    }
  }

  // 缺失 message 时补中性描述，杜绝未证实的“异地登录”文案
  if (action === "SESSION_CONFLICT_LOGOUT" && !summary) {
    summary = "账号在另一台设备或网络登录，原会话被新登录顶替下线";
  }
  if (action === "DEVICE_KICKED_OFFLINE" && !summary) {
    summary = "设备数量达到上限，最旧设备会话被自动替换下线";
  }

  return { summary, historicalSemanticsUnverified: unverified };
}

// 字段名 → 中文标签（数据库字典）；未知键统一显示为「业务参数」，杜绝裸露英文
export function translateDetailKey(key: string): string {
  return lookupFieldLabel(key) || "业务参数";
}

// 内容型键：其值多为用户可读文本，禁止技术性脱敏误伤姓名、标题等正常内容
const CONTENT_VALUE_KEYS = new Set<string>([
  "username",
  "name",
  "title",
  "filename",
  "email",
  "comment",
  "reason",
  "message",
  "detail",
  "summary",
  "workspacename",
  "componentname",
  "assetname",
  "solution",
  "nickname",
  "operatorname",
  "reviewcomment",
  "description",
  "banreason",
]);

// 技术型键：其值多为内部标识 / 路径，统一中性化
const TECHNICAL_ID_KEYS = new Set<string>([
  "pathprefix",
  "ruleid",
  "resourcekey",
  "moduleid",
  "reasoncode",
  "fingerprint",
  "deviceid",
  "requestid",
  "traceid",
  "correlationid",
]);

const IP_LIKE_RE = /^(?:\d{1,3}\.){3}\d{1,3}(?:\s*\(.*\))?$/;
const DATE_LIKE_RE = /^\d{4}[-/]\d{2}[-/]\d{2}(?:[T\s].*)?$/;
const URL_LIKE_RE = /^https?:\/\//i;
const PATH_LIKE_RE = /^[\\/][\w./\\-]+$/;
const LONG_ID_RE = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9]{20,})$/i;

export function formatDetailValue(value: unknown, key?: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "是" : "否";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((v) => formatDetailValue(v, key)).join("、");
  }
  if (typeof value === "object") return JSON.stringify(sanitizeAuditDetails(value));

  const s = String(value).trim();
  const k = (key || "").trim().toLowerCase();

  // 1) 数据库字典已知业务值中文化（登录方式 / 三方来源 / 设备类型 / 文件类型 / 状态 / 执行范围等）
  const mappedValue = lookupValueLabel(s);
  if (mappedValue) return mappedValue;

  // 2) 技术型键：路径类显示为“系统路径”，其余标识类显示为“内部标识”
  if (TECHNICAL_ID_KEYS.has(k)) {
    if (k === "pathprefix" || PATH_LIKE_RE.test(s) || URL_LIKE_RE.test(s) || s.includes("/")) {
      return "系统路径";
    }
    return "内部标识";
  }

  // 3) 内容型键：正常用户内容原样返回，避免误伤姓名 / 标题
  if (CONTENT_VALUE_KEYS.has(k)) return s;

  // 4) 正常技术值（IP / 日期）不脱敏
  if (IP_LIKE_RE.test(s) || DATE_LIKE_RE.test(s)) return s;

  // 5) 设备名称「Browser on OS」形态：按数据库字典词条中文化，避免裸露英文
  const devMatch = s.match(/^([A-Za-z]+)\s+on\s+([A-Za-z]+)$/);
  if (devMatch) {
    const b = lookupValueLabel(devMatch[1]) || "未知";
    const o = lookupValueLabel(devMatch[2]) || "未知";
    return `${b} / ${o}`;
  }

  // 6) 未知全大写枚举 → 系统内部标识
  if (/^[A-Z][A-Z0-9_]{1,}$/.test(s)) return "系统内部标识";

  // 7) UUID / 超长无分隔标识 → 内部标识
  if (LONG_ID_RE.test(s)) return "内部标识";

  // 8) 路径 / URL 形态 → 系统路径
  if (URL_LIKE_RE.test(s) || PATH_LIKE_RE.test(s)) return "系统路径";

  // 9) 技术型字段不得直接返回 Latin 原字符串：其余含拉丁字符且无中文的未知值统一中性化
  if (!/[\u4e00-\u9fff]/.test(s) && /[A-Za-z]/.test(s)) return "系统内部标识";

  return s;
}
