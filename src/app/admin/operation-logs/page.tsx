"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import Link from "next/link";
import Pagination from "@/components/Pagination";
import { OperationLogDetails } from "@/app/admin/components/OperationLogDetails";
import { getAuthToken } from "@/utils/auth";
import {
  Search,
  RefreshCw,
  ScrollText,
  Clock,
  Trash2,
  User as UserIcon,
  LayoutDashboard,
  Box,
  Database,
  Calendar,
  ChevronDown,
  FileText,
  ArrowLeft,
  Copy,
  Check,
  Download,
  CheckSquare,
  Square,
  X,
  ShieldCheck,
  AlertTriangle,
  FileJson,
  FileSpreadsheet,
  LogOut,
  KeyRound,
  Ban,
  MapPin,
  Monitor,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { exportToExcel } from "@/utils/excel-export";
import { sanitizeAuditDetails, resolveAuditSummary, formatDetailValue } from "@/lib/log-details";
import {
  setAuditDicts,
  lookupFieldLabel,
  lookupValueLabel,
  lookupWordLabel,
} from "@/lib/audit-dictionaries";

interface OperationLog {
  id: string;
  action: string;
  resource: string | null;
  details: any;
  createdAt: string;
  userId: string;
  workspaceId: string | null;
  ipAddress: string | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatar: string | null;
    role: string | null;
  } | null;
  /**
   * 关联目标用户 / 目标组件：
   * 由后端审计字典按需回填，部分日志为空，故声明为可选字段（补齐类型定义，不改任何展示逻辑）。
   */
  targetUser?: { id?: string; name?: string | null; email?: string | null } | null;
  targetComponent?: { id?: string; name?: string | null } | null;
  // 后端审计字典返回的中文语义字段（与 /admin/logs 完全一致）
  actionZh?: string | null;
  actionBadge?: { label: string; bg: string; text: string; border: string } | null;
  resourceZh?: string | null;
}

// 操作类型中文与配色全部来自后端数据库字典（auditDicts.actions + actionBadge）。
// 此处仅保留「后端未返回时的兜底转译」，前端不再内置任何 action 字典。
function translateActionToChinese(action: string): string {
  if (!action) return "系统常规操作";

  const lower = action.toLowerCase().replace(/[-_:]/g, "");

  // 业务域中文解析
  let domain = "系统";
  if (lower.includes("appeal")) domain = "申诉工单";
  else if (lower.includes("user") || lower.includes("account")) domain = "用户";
  else if (lower.includes("workspace") || lower.includes("space")) domain = "工作空间";
  else if (lower.includes("member")) domain = "空间成员";
  else if (lower.includes("component") || lower.includes("comp")) domain = "研发组件";
  else if (lower.includes("asset") || lower.includes("doc") || lower.includes("file")) domain = "资料资产";
  else if (lower.includes("auth") || lower.includes("login") || lower.includes("session")) domain = "身份认证";
  else if (lower.includes("quota") || lower.includes("token")) domain = "算力配额";
  else if (lower.includes("task")) domain = "协同任务";
  else if (lower.includes("knowledge")) domain = "知识条目";
  else if (lower.includes("role") || lower.includes("perm")) domain = "权限管理";
  else if (lower.includes("audit") || lower.includes("log")) domain = "审计日志";
  else if (lower.includes("export")) domain = "数据导出";

  // 4. 动作意图中文解析
  let op = "操作";
  if (lower.includes("create") || lower.includes("add") || lower.includes("new")) op = "创建";
  else if (lower.includes("update") || lower.includes("edit") || lower.includes("modify") || lower.includes("change")) op = "更新";
  else if (lower.includes("delete") || lower.includes("remove") || lower.includes("purge") || lower.includes("clean") || lower.includes("clear")) op = "删除";
  else if (lower.includes("ban")) op = "封禁";
  else if (lower.includes("unban")) op = "解封";
  else if (lower.includes("approve")) op = "审核通过";
  else if (lower.includes("reject")) op = "审核驳回";
  else if (lower.includes("publish")) op = "发布公开";
  else if (lower.includes("restore")) op = "恢复归档";
  else if (lower.includes("recycle")) op = "回收";
  else if (lower.includes("login")) op = "登录";
  else if (lower.includes("kick")) op = "强制下线";
  else if (lower.includes("logout")) op = "退出登录";
  else if (lower.includes("export")) op = "导出";
  else if (lower.includes("import")) op = "导入";
  else if (lower.includes("execute") || lower.includes("run")) op = "执行调用";

  return `${domain}${op}`;
}

function actionMeta(action: string, rawDetails?: any) {
  let details = rawDetails;
  if (typeof rawDetails === "string") {
    try {
      details = JSON.parse(rawDetails);
    } catch {}
  }

  // 批量用户操作精准识别（杜绝解封却标成封禁，或批量封禁误标为单封的失真现象）
  const isBatch =
    action.startsWith("user:batch") ||
    action === "users:batch-action" ||
    action === "user:batch_action" ||
    action === "user:batch" ||
    details?.totalSelected !== undefined ||
    details?.processedCount !== undefined;

  if (isBatch) {
    const act = details?.action || details?.op || action.replace("user:batch_", "");
    if (act === "unban" || details?.updates?.status === "active") {
      return { label: "批量解封用户", color: "bg-emerald-100 text-emerald-600" };
    }
    if (act === "ban" || details?.updates?.status === "banned" || String(act).includes("ban")) {
      return { label: "批量封禁用户", color: "bg-red-100 text-red-600" };
    }
    if (act === "kick") {
      return { label: "批量强制下线", color: "bg-red-100 text-red-600" };
    }
    return { label: "批量处理用户", color: "bg-blue-100 text-[#2b6cb0]" };
  }

  // 智能细化用户操作（杜绝笼统的“更新用户/修改用户资料”，明确区分封禁、解封、停用、改角色等真实业务动作）
  if (action === "user:ban") {
    if (details?.action === "unban" || details?.status === "active") {
      return { label: "解封用户账号", color: "bg-emerald-100 text-emerald-600" };
    }
    return { label: "封禁用户账号", color: "bg-red-100 text-red-600" };
  }
  if (action === "user:unban") {
    return { label: "解封用户账号", color: "bg-emerald-100 text-emerald-600" };
  }
  if (action === "user:update" || action.startsWith("user:status")) {
    const targetStatus = details?.updates?.status || details?.status;
    if (targetStatus === "inactive" || targetStatus === "suspended") {
      return { label: "停用用户账号", color: "bg-amber-100 text-amber-700" };
    }
    if (targetStatus === "active") {
      return { label: "启用用户账号", color: "bg-emerald-100 text-emerald-600" };
    }
    const isBan =
      targetStatus === "banned" ||
      Boolean(details?.bannedUntil) ||
      Boolean(details?.banReason) ||
      (typeof details?.reason === "string" && (details.reason.includes("封禁") || details.reason.includes("违规") || details.reason.includes("警告")));
    if (isBan) {
      return { label: "封禁用户账号", color: "bg-red-100 text-red-600" };
    }
    if (details?.role || details?.newRole || details?.updates?.role) {
      return { label: "调整用户角色", color: "bg-blue-100 text-[#2b6cb0]" };
    }
    if (details?.points || details?.amount || details?.updates?.points) {
      return { label: "调整用户积分", color: "bg-blue-100 text-[#2b6cb0]" };
    }
    return { label: "修改用户资料", color: "bg-blue-100 text-[#2b6cb0]" };
  }

  if (action === "auth:logout") {
    if (details?.type === "TIMEOUT" || details?.reason === "timeout" || details?.message?.includes("超时")) {
      return { label: "超时自动退出", color: "bg-amber-100 text-amber-700" };
    }
    return { label: "退出登录", color: "bg-slate-100 text-slate-700" };
  }
  if (action === "SESSION_TIMEOUT_LOGOUT") {
    return { label: "超时自动退出", color: "bg-amber-100 text-amber-700" };
  }
  if (action === "DEVICE_KICKED_OFFLINE" || action === "SESSION_CONFLICT_LOGOUT") {
    // 明确属于账号或设备自动退出，绝不误导写成“在其他设备登录”
    return { label: "账号自动退出登录", color: "bg-amber-100 text-amber-700" };
  }
  if (action === "ADMIN_FORCE_LOGOUT") {
    return { label: "管理员强制下线", color: "bg-red-100 text-red-600" };
  }
  if (action === "user:batch_kick") {
    return { label: "管理员批量下线", color: "bg-red-100 text-red-600" };
  }
  return { label: translateActionToChinese(action), color: "bg-slate-100 text-slate-700" };
}

function resourceIcon(resource: string | null) {
  const r = (resource || "").toLowerCase();
  if (r.includes("user") || r.includes("account")) return UserIcon;
  if (r.includes("workspace") || r.includes("space")) return LayoutDashboard;
  if (r.includes("component") || r.includes("comp")) return Box;
  if (r.includes("knowledge") || r.includes("task") || r.includes("asset")) return FileText;
  if (r.includes("data") || r.includes("log")) return Database;
  return ShieldCheck;
}

// 资源归类标准化为通俗明确的系统业务域，杜绝“用户治理”等 AI 黑话
function resourceLabel(resource: string | null) {
  const r = (resource || "").toLowerCase();
  if (r.includes("user") || r.includes("account")) return "用户与账号";
  if (r.includes("password") || r.includes("security") || r.includes("apike") || r.includes("session") || r.includes("auth") || r.includes("device")) return "安全与登录";
  if (r.includes("workspace") || r.includes("space") || r.includes("member")) return "工作空间";
  if (r.includes("component") || r.includes("comp")) return "组件中心";
  if (r.includes("knowledge") || r.includes("task") || r.includes("asset") || r.includes("doc")) return "资料与知识库";
  if (r.includes("system") || r.includes("permission") || r.includes("setting") || r.includes("solution")) return "系统设置";
  if (r.includes("membership") || r.includes("billing") || r.includes("plan") || r.includes("order")) return "会员与计费";
  if (/^[0-9a-f]{8}-/.test(r)) return "业务数据";
  return "系统";
}

// 后端字典驱动（与 /admin/logs 完全一致）：优先使用数据库返回的 actionZh / actionBadge / resourceZh，
// 前端不得以内置字典覆盖后端语义，保证展示一致。
function renderActionLabel(log: OperationLog): string {
  return log.actionZh || actionMeta(log.action, log.details).label;
}
function renderActionMeta(
  log: OperationLog
): { label: string; color: string; badge?: { label: string; bg: string; text: string; border: string } } {
  const label = log.actionZh || actionMeta(log.action, log.details).label;
  const badge = log.actionBadge ?? undefined;
  const color = badge
    ? `${badge.bg} ${badge.text} ${badge.border}`
    : "bg-slate-100 text-slate-700";
  return { label, color, badge };
}
function renderResourceLabel(log: OperationLog): string {
  return log.resourceZh || resourceLabel(log.resource);
}

// 字段名 / 字段值 / 词根的中文映射全部来自数据库字典（system_config.audit_display_dict），
// 由 /api/admin/operation-logs 的 auditDicts 下发；前端不再内置任何业务字典。

// 字段值 → 中文：完全来自数据库字典（system_config.audit_display_dict.values）
function transStatus(v: any) {
  if (v === null || v === undefined) return "—";
  return lookupValueLabel(v) || String(v);
}
function transRole(v: any) {
  if (v === null || v === undefined) return "—";
  return lookupValueLabel(v) || String(v);
}
function transPlan(v: any) {
  if (v === null || v === undefined) return "—";
  return lookupValueLabel(v) || String(v);
}
function transVisibility(v: any) {
  if (v === null || v === undefined) return "—";
  return lookupValueLabel(v) || String(v);
}
function transWorkspaceType(v: any) {
  if (v === null || v === undefined) return "—";
  return lookupValueLabel(v) || String(v);
}

// 智能键名通用转译器：优先查数据库字段字典（audit_display_dict.fields），
// 查不到时基于驼峰/下划线分词并匹配数据库词根字典（audit_display_dict.words），
// 彻底杜绝英文键名裸露，且不在前端内置任何业务词条。
function translateFieldKeyToChinese(rawKey: string): string {
  if (!rawKey) return "业务参数";
  const mappedField = lookupFieldLabel(rawKey);
  if (mappedField) return mappedField;

  // 1. 去除常见前后缀并按驼峰/下划线分词
  const rawWords = rawKey
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .split(/[-_:]/)
    .filter(Boolean);

  if (rawWords.length === 0) return "业务参数";

  // 单复数归一化与词根标准化（彻底消除由于复数导致的查无词条）
  const words = rawWords.map((w) => {
    if (w === "ids") return "id";
    if (w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.endsWith("ses") && w !== "status") return w.slice(0, -2);
    if (w.endsWith("s") && !["status", "tokens", "pass", "sms"].includes(w)) return w.slice(0, -1);
    return w;
  });

  const normKey = words.join("_");
  if (normKey === "appeal_id" || normKey === "appeal") return "申诉工单编号";
  if (normKey === "business_type") return "申诉业务类型";
  if (normKey === "target_user_id" || normKey === "target_user") return "目标用户";
  if (normKey === "status") return "当前工单状态";
  if (normKey === "operator_id" || normKey === "operator") return "经办人账号";

  const hasSessionWord = words.includes("session");
  const translatedParts: string[] = [];
  for (const w of words) {
    if (w === "id") continue; // 忽略末尾单纯的技术 ID 词根
    // 若属于会话上下文，token 翻译为"凭证/令牌"，绝不误译为算力点
    if (hasSessionWord && (w === "token" || w === "tokens")) {
      translatedParts.push("凭据");
      continue;
    }
    // 词根中文来自数据库字典（audit_display_dict.words）
    const wordLabel = lookupWordLabel(w);
    if (wordLabel) translatedParts.push(wordLabel);
  }

  if (translatedParts.length > 0) {
    const deduplicated = translatedParts.filter((p, i) => i === 0 || p !== translatedParts[i - 1]);
    return deduplicated.join("");
  }

  // 未知键统一显示为「业务参数」，杜绝裸露英文键名
  return "业务参数";
}

// 智能值通用转译器：优先查数据库字典（audit_display_dict.values），
// 查不到再基于业务规则、枚举、实体关联进行格式化，彻底杜绝英文暴露与机器乱码，前端不内置任何业务词条。
function translateValueToChinese(key: string, val: any, fullLog?: any): string {
  if (val === null || val === undefined || val === "") return "—";

  // 1. 数组与对象解析（彻底消灭 [object Object]，且对每个标量元素进行递归转译）
  if (Array.isArray(val)) {
    if (val.length === 0) return "无相关记录";
    const sample = val[0];
    if (typeof sample === "object" && sample !== null) {
      const texts = val
        .map((item: any) => item?.name || item?.title || item?.label || item?.reason || item?.message)
        .filter(Boolean);
      if (texts.length > 0) return texts.join("、");
      return `共包含 ${val.length} 项记录`;
    }
    // 标量数组：对每一项递归调用转译，彻底解决 statuses: ["archived"] 或 targetUserIds: ["cm..."] 无法汉化的问题
    return val
      .map((item) => translateValueToChinese(key, item, fullLog))
      .join("、");
  }

  if (typeof val === "object") {
    try {
      const entries = Object.entries(val);
      if (entries.length === 0) return "无扩展参数";
      return entries
        .map(([k, v]) => `${translateFieldKeyToChinese(k)}: ${translateValueToChinese(k, v, fullLog)}`)
        .join("；");
    } catch {
      return "业务配置数据";
    }
  }

  // 2. 布尔类型智能转译
  if (typeof val === "boolean" || val === "true" || val === "false") {
    const boolVal = val === true || val === "true";
    const lk = key.toLowerCase();
    if (lk.includes("publish") || lk.includes("public")) {
      return boolVal ? "已公开上架 (全网可见)" : "未公开 (私密保密)";
    }
    if (lk.includes("enable") || lk.includes("active")) {
      return boolVal ? "已启用生效" : "已停用下线";
    }
    if (lk.includes("maintain")) {
      return boolVal ? "系统维护中" : "正常服务对外开放";
    }
    if (lk.includes("current")) {
      return boolVal ? "是（本机当前使用）" : "否（其他远端设备）";
    }
    if (lk.includes("kickall")) {
      return boolVal ? "是（注销其他全部会话）" : "否";
    }
    if (lk.includes("renew")) {
      return boolVal ? "开启自动续费" : "不自动续费";
    }
    return boolVal ? "是" : "否";
  }

  // 3. 日期时间智能格式化
  if (typeof val === "string" && (/^\d{4}-\d{2}-\d{2}T/.test(val) || /^\d{4}\/\d{2}\/\d{2}/.test(val))) {
    return formatTime(val);
  }
  const lk = key.toLowerCase();
  if (lk.endsWith("at") || lk.includes("time") || lk.includes("date")) {
    const str = String(val);
    if (!isNaN(Date.parse(str)) && (str.includes("-") || str.includes("/") || str.includes("T"))) {
      return formatTime(str);
    }
  }

  // 4. 数字单位修饰
  if (typeof val === "number") {
    if (lk.includes("token") || lk.includes("amount") || lk.includes("quota") || lk.includes("threshold")) {
      return `${val} 算力点`;
    }
    if (lk.includes("count") || lk.includes("total") || lk.includes("processed") || lk.includes("skipped") || lk.includes("failed")) {
      return `${val} 项`;
    }
    if (lk.includes("price") || lk.includes("fee") || lk.includes("cost") || lk.includes("discount")) {
      return `¥${val.toFixed(2)}`;
    }
  }

  // 5. 数据库实体关联与机器 ID 脱敏转译（全面支持单复数 targetUserId / targetUserIds）
  if (lk.includes("user") && (lk.endsWith("id") || lk.endsWith("ids") || lk === "user")) {
    const strVal = String(val).trim();
    // 优先从全量关联用户列表中按 ID 精准匹配
    if (fullLog?.targetUsers && Array.isArray(fullLog.targetUsers)) {
      const matched = fullLog.targetUsers.find((u: any) => u.id === strVal);
      if (matched) {
        return `${matched.name || "目标用户"} (${matched.email || "未留邮箱"})`;
      }
    }
    // 其次使用单体关联 targetUser
    if (fullLog?.targetUser) {
      return `${fullLog.targetUser.name || "目标用户"} (${fullLog.targetUser.email || "未留邮箱"})`;
    }
    // 兜底：若仅有机器长 ID，进行友好脱敏标注，严禁裸露纯英文数字机器 ID
    if (/^[a-z0-9]{16,}$/i.test(strVal)) {
      return `目标用户 (${strVal.slice(-4)})`;
    }
    return "目标用户账号";
  }
  if (lk.includes("component") && (lk.endsWith("id") || lk.endsWith("ids") || lk === "component")) {
    if (fullLog?.targetComponent) return fullLog.targetComponent.name;
    return "关联研发组件";
  }
  if ((lk.includes("document") || lk.includes("knowledge") || lk.includes("asset")) && (lk.endsWith("id") || lk.endsWith("ids") || lk === "asset")) {
    if (fullLog?.targetDocument) return fullLog.targetDocument.title;
    return "系统资料文档";
  }
  if (lk.includes("workspace") && (lk.endsWith("id") || lk.endsWith("ids"))) {
    if (fullLog?.workspace) return fullLog.workspace.name;
    return val === "SYSTEM" ? "平台全局系统域" : "所属工作空间";
  }
  if (lk.includes("task") && (lk.endsWith("id") || lk.endsWith("ids"))) {
    return "空间协同研发任务";
  }

  const strVal = String(val).trim();

  // 6. 数据库字典精确翻译（登录方式 / 状态 / 角色 / 套餐 / 可见性 / 支付 / 类型 / 处理态等）
  const mappedValue = lookupValueLabel(strVal);
  if (mappedValue) return mappedValue;

  // 7. 技术型字段（路径 / 规则 / 资源 / 模块标识）：技术路径→系统路径，其余内部标识→内部标识
  const lkLower = String(key || "").toLowerCase();
  if (lkLower === "pathprefix" || lkLower === "path" || lkLower === "filepath") {
    return "系统路径";
  }
  if (["ruleid", "resourcekey", "moduleid", "fingerprint", "requestid", "traceid", "correlationid"].includes(lkLower)) {
    if (/^[\\/]/.test(strVal) || strVal.includes("/")) return "系统路径";
    return "内部标识";
  }

  // 9. 若为超长机器 ID（纯英数，18 位以上），转为人类易读说明，杜绝直接暴露裸机器长串
  if (/^[a-z0-9]{18,}$/i.test(strVal)) {
    return "系统业务唯一标识";
  }

  // 10. 未知全大写枚举 / 拉丁技术值统一脱敏为「系统内部标识」，杜绝裸露英文
  if (/^[A-Z][A-Z0-9_]{1,}$/.test(strVal)) return "系统内部标识";

  // 11. 路径 / URL 形态统一中性化为「系统路径」，避免裸露内部路径
  if (/^https?:\/\//i.test(strVal) || /^[\\/][\w./\\-]+$/.test(strVal)) return "系统路径";

  // 12. 兜底统一交由共享脱敏规则处理：未知拉丁技术值中性化，同时保护用户内容 / IP / 日期，
  //     确保 /admin/logs 与 /admin/operation-logs 对同一 details 展示完全一致
  return formatDetailValue(strVal, key);
}

// 把 details 解析为全量纯中文 [中文标签, 中文值] 列表（支持关联数据库实体）
function parseDetails(details: any, fullLog?: any): { label: string; value: string }[] {
  // 统一脱敏：任何展示入口都基于脱敏后的 details
  const safeDetails = sanitizeAuditDetails(details);
  let obj: any = safeDetails;
  if (typeof safeDetails === "string") {
    if (!safeDetails.trim()) return [];
    try {
      obj = JSON.parse(safeDetails);
    } catch {
      return [{ label: "记录内容", value: safeDetails }];
    }
  }
  if (obj === null || obj === undefined) return [];
  if (typeof obj !== "object") return [{ label: "记录内容", value: String(obj) }];

  // 历史语义纠正：本地 IP 却写成“异地登录”的错误 message 不得继续展示
  if (typeof obj.message === "string") {
    const { summary: neutralSummary } = resolveAuditSummary({
      action: fullLog?.action,
      ipAddress: fullLog?.ipAddress,
      details: obj,
    });
    if (neutralSummary && neutralSummary !== obj.message) {
      obj = { ...obj, message: neutralSummary };
    }
  }

  // 1. 批量操作智能收敛：杜绝零碎无意义的计数器堆叠与 [object Object]，输出两到三项清晰明了的业务结论
  const isBatch =
    obj.totalSelected !== undefined ||
    obj.processedCount !== undefined ||
    fullLog?.action?.includes("batch") ||
    fullLog?.action === "users:batch-action";

  if (isBatch) {
    const rows: { label: string; value: string }[] = [];
    const total = obj.totalSelected ?? (obj.processedCount ?? 1);
    const processed = obj.processedCount ?? 0;
    const skipped = obj.skippedCount ?? 0;
    const failed = obj.failedCount ?? 0;

    // 卡片 1：处理结果总结
    let resultText = `共勾选 ${total} 项：成功处理 ${processed} 项`;
    if (skipped > 0) resultText += `，跳过 ${skipped} 项`;
    if (failed > 0) resultText += `，失败 ${failed} 项`;
    if (skipped === 0 && failed === 0 && processed > 0) {
      resultText = `共勾选 ${total} 项：全部成功处理`;
    }
    rows.push({ label: "批量处理结果", value: resultText });

    // 卡片 2：跳过说明（彻底解析 skippedSample，严禁出现 [object Object]）
    if (skipped > 0 && obj.skippedSample) {
      let skipDesc = "";
      if (Array.isArray(obj.skippedSample)) {
        const reasons = Array.from(
          new Set(
            obj.skippedSample
              .map((item: any) => {
                if (typeof item === "string") return item;
                return item?.reason || item?.message || "";
              })
              .filter(Boolean)
          )
        );
        if (reasons.length > 0) {
          skipDesc = `${reasons.join("、")}（共 ${skipped} 项无需重复处理）`;
        }
      } else if (typeof obj.skippedSample === "string" && obj.skippedSample.trim()) {
        skipDesc = obj.skippedSample;
      }
      if (!skipDesc) {
        skipDesc = `目标已处于该状态，系统自动跳过（共 ${skipped} 项）`;
      }
      rows.push({ label: "跳过处理说明", value: skipDesc });
    }

    // 卡片 3：操作执行范围
    if (obj.scope) {
      rows.push({
        label: "执行范围模式",
        value: obj.scope === "all" ? "全选当前列表所有目标" : "管理员手动勾选指定目标",
      });
    }

    // 卡片 4：操作原因（若有明确填写的理由）
    const reason = obj.reason || obj.banReason;
    if (reason && reason !== "—" && reason !== "未填写") {
      rows.push({ label: "操作原因", value: reason });
    }

    return rows;
  }

  // 2. 单条普通操作解析
  const rows: { label: string; value: string }[] = [];

  for (const [key, val] of Object.entries(obj)) {
    // 隐藏无实际业务意义的技术底层随机 ID、网络底层字段及空字段
    if (
      key === "deviceId" ||
      key === "sessionId" ||
      key === "ip" ||
      key === "ipAddress" ||
      key === "userAgent" ||
      key === "endpoint" ||
      key === "method" ||
      key === "skippedSample" ||
      key === "totalSelected" ||
      key === "processedCount" ||
      key === "skippedCount" ||
      key === "failedCount" ||
      // 严禁展示会话令牌类敏感字段（UUID session token / refresh token）
      key === "oldSessionToken" ||
      key === "newSessionToken" ||
      key === "sessionToken" ||
      key === "refreshToken" ||
      key === "token" ||
      (key === "id" && (obj.name || obj.componentName || obj.title || obj.componentId || obj.targetComponentId))
    ) {
      continue;
    }

    // 针对 updates 深入解构：杜绝“业务变更内容：业务状态：未激活”这类生硬嵌套
    if (key === "updates" && val && typeof val === "object") {
      for (const [subKey, subVal] of Object.entries(val as Record<string, any>)) {
        if (subKey === "status") {
          let statusText = transStatus(subVal);
          if (subVal === "inactive") statusText = "已停用 (未激活)";
          else if (subVal === "active") statusText = "正常活跃 (已启用)";
          else if (subVal === "banned") statusText = "违规封禁";
          else if (subVal === "suspended") statusText = "已冻结停用";
          rows.push({ label: "变更后账号状态", value: statusText });
        } else if (subKey === "role") {
          rows.push({ label: "变更后用户角色", value: transRole(subVal) });
        } else if (subKey === "isPublic" || subKey === "isPublished" || subKey === "published") {
          rows.push({
            label: "公开上架状态",
            value: subVal ? "已公开上架 (全网可见)" : "未公开 (私密保密)",
          });
        } else {
          let subLabel = translateFieldKeyToChinese(subKey);
          if (!subLabel.startsWith("变更后") && !subLabel.startsWith("新")) {
            subLabel = `变更后${subLabel}`;
          }
          const subText = translateValueToChinese(subKey, subVal, fullLog);
          rows.push({ label: subLabel, value: subText });
        }
      }
      continue;
    }

    const label = translateFieldKeyToChinese(key);
    const value = translateValueToChinese(key, val, fullLog);

    rows.push({ label, value });
  }

  return rows;
}

// 列表行内的一句话可读摘要（让管理员无需展开即看懂）
function describeLog(log: OperationLog): string {
  const meta = renderActionMeta(log);
  const d = parseDetails(log.details, log);
  const get = (k: string) => d.find((r) => r.label === k)?.value || "";

  let detailsObj: any = log.details;
  if (typeof detailsObj === "string") {
    try {
      detailsObj = JSON.parse(detailsObj);
    } catch {}
  }

  // 统一摘要字段：优先采用后端写入的 message，确保 /admin/logs 与 /admin/operation-logs
  // 对同一条日志展示完全一致的描述；对历史「本地 IP 却写成异地登录」的错误语义做中性化纠正。
  const { summary: unifiedSummary } = resolveAuditSummary({
    action: log.action,
    ipAddress: log.ipAddress,
    details: log.details,
  });
  if (unifiedSummary) return unifiedSummary;

  switch (log.action) {
    case "users:batch-action":
    case "user:batch_action": {
      const act = detailsObj?.action || detailsObj?.op;
      const count = detailsObj?.processedCount || detailsObj?.totalSelected || 1;
      if (act === "unban") return `管理员批量解除 ${count} 名用户的账号封禁`;
      if (act === "ban") return `管理员批量封禁 ${count} 名违规用户账号`;
      if (act === "kick") return `管理员批量强制下线 ${count} 名用户会话`;
      return `管理员批量处理 ${count} 名用户业务`;
    }
    case "user:ban": {
      if (detailsObj?.totalSelected !== undefined || detailsObj?.processedCount !== undefined) {
        const count = detailsObj?.processedCount || detailsObj?.totalSelected || 1;
        if (detailsObj?.action === "unban") return `管理员批量解除 ${count} 名用户的账号封禁`;
        return `管理员批量封禁 ${count} 名违规用户账号`;
      }
      if (detailsObj?.action === "unban") {
        const count = detailsObj?.processedCount || detailsObj?.totalSelected || 1;
        return `管理员批量解除 ${count} 名用户的账号封禁`;
      }
      let target = get("目标用户") || (log.targetUser ? (log.targetUser.name || log.targetUser.email) : "");
      if (target && target.length > 15 && target.startsWith("cm")) target = "目标用户";
      const until = get("封禁截止时间") ? `（截止 ${get("封禁截止时间")}）` : "";
      const r = get("操作原因") || get("封禁案由") || "";
      const cleanR = r && r !== "—" ? `，原因：${r}` : "";
      return `管理员封禁用户${target ? `「${target}」` : ""}${until}${cleanR}`;
    }
    case "user:unban": {
      let target = get("目标用户") || (log.targetUser ? (log.targetUser.name || log.targetUser.email) : "");
      if (target && target.length > 15 && target.startsWith("cm")) target = "目标用户";
      return `管理员解封用户${target ? `「${target}」` : ""}`;
    }
    case "user:update": {
      const targetStatus = detailsObj?.updates?.status || detailsObj?.status;
      let target = get("目标用户") || (log.targetUser ? (log.targetUser.name || log.targetUser.email) : "");
      if (target && target.length > 15 && target.startsWith("cm")) target = "目标用户";

      if (targetStatus === "inactive" || targetStatus === "suspended") {
        return `管理员停用用户${target ? `「${target}」` : ""}账号`;
      }
      if (targetStatus === "active") {
        return `管理员启用用户${target ? `「${target}」` : ""}账号`;
      }
      const isBan =
        targetStatus === "banned" ||
        Boolean(detailsObj?.bannedUntil) ||
        Boolean(detailsObj?.banReason) ||
        (typeof detailsObj?.reason === "string" && (detailsObj.reason.includes("封禁") || detailsObj.reason.includes("违规") || detailsObj.reason.includes("警告")));
      if (isBan) {
        const until = get("封禁截止时间") ? `（截止 ${get("封禁截止时间")}）` : "";
        const r = get("操作原因") || get("封禁案由") || "";
        const cleanR = r && r !== "—" ? `，原因：${r}` : "";
        return `管理员封禁用户${target ? `「${target}」` : ""}${until}${cleanR}`;
      }
      if (detailsObj?.role || detailsObj?.newRole || detailsObj?.updates?.role) {
        const r = get("变更后用户角色") || get("变更后角色") || get("账号角色") || "";
        return `调整用户${target ? `「${target}」` : ""}角色${r ? `为「${r}」` : ""}`;
      }
      if (detailsObj?.points || detailsObj?.amount || detailsObj?.updates?.points) {
        return `调整用户${target ? `「${target}」` : ""}积分额度`;
      }
      return `更新用户资料${target ? `「${target}」` : ""}`;
    }
    case "appeal:deleted":
      return "管理员清理删除已归档的申诉工单";
    case "appeal:account_unban_approved":
      return "管理员审核通过账号解封申诉";
    case "appeal:account_unban_rejected":
      return "管理员审核驳回账号解封申诉";
    case "appeal:workspace_unban_approved":
      return "管理员审核通过空间解封申诉";
    case "appeal:workspace_unban_rejected":
      return "管理员审核驳回空间解封申诉";
    case "user:delete":
      return "删除用户";
    case "user:reset_session":
      return "重置该用户登录会话";
    case "user:force_logout":
      return "管理员特权强制用户安全下线";
    case "user:reset_password":
      return "管理员特权重置用户登录密码";
    case "user:batch_kick":
      return "管理员批量强制下线多名用户会话";
    case "ACCOUNT_DELETION_REQUESTED":
      return "用户提交账号注销申请";
    case "ACCOUNT_DELETED":
      return "账号已彻底销毁（冷静期届满）";
    case "component:create":
      return `创建研发组件「${get("名称") || (log.targetComponent?.name || "新组件")}」`;
    case "component:update":
      return `更新研发组件${get("名称") || log.targetComponent?.name ? `「${get("名称") || log.targetComponent?.name}」` : ""}${get("变更内容") ? `（${get("变更内容")}）` : ""}`;
    case "component:delete":
      return `删除研发组件「${get("名称") || (log.targetComponent?.name || "组件")}」`;
    case "component:publish":
      return `将研发组件「${get("名称") || (log.targetComponent?.name || "组件")}」公开上架`;
    case "component:request_publish":
      return `提交研发组件「${get("名称") || (log.targetComponent?.name || "组件")}」公开上架审核申请`;
    case "component:approve":
      return `审核通过研发组件「${get("名称") || (log.targetComponent?.name || "组件")}」公开申请`;
    case "component:reject":
      return `驳回研发组件「${get("名称") || (log.targetComponent?.name || "组件")}」公开申请${get("审核意见") || get("操作原因") ? `（原因：${get("审核意见") || get("操作原因")}）` : ""}`;
    case "component:execute":
      return `调用运行组件（消耗额度 ${get("消耗算力点") || get("消耗额度") || "—"}）`;
    case "workspace:create":
      return `创建工作空间${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "workspace:update":
      return `更新工作空间${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "workspace:delete":
      return `删除工作空间${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "workspace:recycle":
      return "系统合规自动回收闲置空间算力配额";
    case "CREATE_ENTERPRISE_WORKSPACE":
      return `创建企业工作空间「${get("工作空间")}」${get("套餐") ? `（套餐：${get("套餐")}）` : ""}`;
    case "JOIN_WORKSPACE":
      return `加入工作空间「${get("工作空间")}」${get("角色") ? `（角色：${get("角色")}）` : ""}`;
    case "LEAVE_WORKSPACE":
    case "member:leave":
      return `退出工作空间${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "UPDATE_MEMBER_ROLE":
      return `调整成员角色${get("新角色") ? `→ ${get("新角色")}` : ""}`;
    case "WORKSPACE_KICK":
      return `将成员移出工作空间`;
    case "UPGRADE_WORKSPACE":
      return `升级工作空间${get("原类型") && get("目标类型") ? `（${get("原类型")}→${get("目标类型")}）` : ""}`;
    case "UPGRADE_WORKSPACE_PLAN":
      return `变更空间套餐${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "CONFIGURE_SOLUTION":
      return `配置解决方案「${get("解决方案")}」`;
    case "SET_RESTRICTED_COMPONENTS":
      return "设置受限组件白名单";
    case "SAVE_CUSTOM_POSITIONS":
      return "保存组件自定义布局";
    case "BIND_COMPONENT":
      return `将组件绑定到工作空间${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "UNBIND_COMPONENT":
      return `将组件从工作空间解绑${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "quota:recycle":
      return `回收工作空间算力配额${get("配额数值") ? `（${get("配额数值")}）` : ""}`;
    case "quota:pool_threshold":
    case "quota:threshold":
      return "调整工作空间算力池报警阈值";
    case "asset:upload":
      return `上传资料资产「${get("资料标题") || get("名称") || "新资料"}」`;
    case "asset:approve":
      return `审核通过公开资料「${get("资料标题") || "资料"}」`;
    case "asset:reject":
      return `驳回公开资料申请「${get("资料标题") || "资料"}」${get("审核意见") ? `（原因：${get("审核意见")}）` : ""}`;
    case "asset:remove_private":
      return `治理隔离私密资料「${get("资料标题") || "资料"}」`;
    case "asset:remove":
      return `下架移除公开资料「${get("资料标题") || "资料"}」`;
    case "asset:restore":
      return `恢复已下架资料「${get("资料标题") || "资料"}」`;
    case "asset:restore_request":
      return `提交资料恢复申请「${get("资料标题") || "资料"}」`;
    case "asset:publish_direct":
      return `直接发布资料「${get("资料标题") || "资料"}」为全员公开`;
    case "asset:request_publish":
      return `提交资料「${get("资料标题") || "资料"}」公开上架申请`;
    case "asset:batch_delete":
      return `批量彻底删除资料资产（共 ${get("影响数量") || "多项"}）`;
    case "asset:batch_remove":
      return `批量下架移除公开资料（共 ${get("影响数量") || "多项"}）`;
    case "asset:batch_publish_direct":
      return `批量发布资料资产为公开（共 ${get("影响数量") || "多项"}）`;
    case "asset:batch_request_publish":
      return `批量提交资料公开申请（共 ${get("影响数量") || "多项"}）`;
    case "sso:revoke":
      return `解除第三方授权绑定（${get("认证源") || "三方账号"}）`;
    case "stepup:issued":
      return `完成二次敏感身份凭证签发（${get("敏感操作") || "特权操作"}）`;
    case "KNOWLEDGE_PUBLISH":
      return "发布知识至知识库";
    case "KNOWLEDGE_SUBMIT":
      return "提交知识审核";
    case "KNOWLEDGE_APPROVE":
      return "审核通过知识条目";
    case "KNOWLEDGE_REJECT":
      return "驳回知识条目";
    case "ARCHIVE_TASK":
      return `归档任务${get("任务 ID") ? `（${get("任务 ID")}）` : ""}`;
    case "DELETE_TASK":
      return "删除任务";
    case "system:settings":
      return "系统配置变更";
    case "auth:login":
      return log.user?.role === "superadmin" || log.user?.role === "admin"
        ? "管理员登录系统"
        : "账号成功登录系统";
    case "auth:logout":
      if (log.details?.type === "TIMEOUT" || log.details?.reason === "timeout" || get("原因")?.includes("超时")) {
        return "长时间无操作，系统自动退出登录";
      }
      if (log.details?.reason === "password_changed") {
        return "密码修改成功，系统自动退出登录";
      }
      return "用户退出登录";
    case "SESSION_TIMEOUT_LOGOUT":
      return "长时间无操作，系统自动退出登录";
    case "Password:Change":
      return "用户修改登录密码";
    case "SecuritySetting:Update":
      return "修改账号安全设置";
    case "ADMIN_FORCE_LOGOUT":
      return "管理员强制将该账号下线";
    case "user:batch_kick":
      return `管理员批量将用户下线${get("受影响用户数") ? `（共 ${get("受影响用户数")} 人）` : ""}`;
    case "SESSION_CONFLICT_LOGOUT":
      // 旧会话被新登录顶替（真实跨设备/跨网冲突），原因明确到设备或网络
      return "账号在另一设备或网络登录，原会话被新登录顶替下线";
    case "DEVICE_KICKED_OFFLINE":
      // 设备数量达到上限，系统替换最旧设备会话
      return "设备数量达到上限，最旧设备会话被自动替换下线";
    case "SECURITY_DIAGNOSIS":
      return "执行账户安全诊断评估";
    case "APIKey:Create":
      return "创建 API 访问密钥";
    case "APIKey:Delete":
      return "删除 API 访问密钥";
    case "CONFIGURE_ADMIN_PERMISSIONS":
      return "配置管理员后台权限";
    case "MEMBERSHIP_UPGRADE":
      return `会员等级升级${get("目标等级") ? `→ ${get("目标等级")}` : ""}`;
    case "PING_TEST":
      return "系统网络连通性测试";
    case "audit:clean_expired":
      return "定期合规清理 3 年前操作审计日志";
    case "audit:delete":
      return "管理员特权删除单条操作审计日志";
    case "export:excel":
      return "导出操作审计报表为 Excel 文件";
    case "export:json":
      return "导出操作审计数据为 JSON 备份文件";
    default:
      // 兜底也绝不出现“其他”或英文，直接采用智能中文转译
      return `执行${meta.label}操作`;
  }
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// 触发浏览器下载
function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(v: string) {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsv(rows: OperationLog[]): string {
  const header = ["时间", "操作类型", "资源域", "操作描述", "操作人", "邮箱", "IP 地址", "原始详情(JSON)"];
  const lines = [header.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(
      [
        formatTime(r.createdAt),
        renderActionLabel(r),
        renderResourceLabel(r),
        describeLog(r),
        r.user?.name || "未知用户",
        r.user?.email || "—",
        r.ipAddress || "—",
        JSON.stringify(sanitizeAuditDetails(r.details ?? {})),
      ]
        .map(csvEscape)
        .join(",")
    );
  }
  // BOM 头，保证 Excel 正确识别中文
  return "﻿" + lines.join("\r\n");
}

const PAGE_SIZE = 10;

export default function OperationLogsPage() {
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, today: 0, highRisk: 0, activeUsers: 0 });
  // 操作类型下拉选项：完全来自数据库字典（audit_action_dict）
  const [actionOptions, setActionOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [retention, setRetention] = useState<{ years: number; days: number; description: string } | null>(null);

  // 筛选条件
  const [action, setAction] = useState("");
  const [userKeyword, setUserKeyword] = useState("");
  const [resource, setResource] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // 复选框批量选择
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  // 详情弹窗（支持数据库实时深度关联查询）
  const [detailLog, setDetailLog] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  // 融合原「系统日志」页面：Tab 切换（操作审计流水 / 登录安全历史）+ 行内展开详情
  const [activeTab, setActiveTab] = useState<"operation" | "login">("operation");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 登录安全历史（原「系统日志」页面能力，仅新增不改动）
  const [histories, setHistories] = useState<any[]>([]);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginPage, setLoginPage] = useState(1);
  const [loginTotal, setLoginTotal] = useState(0);
  const [loginKeyword, setLoginKeyword] = useState("");
  const [loginStartDate, setLoginStartDate] = useState("");
  const [loginEndDate, setLoginEndDate] = useState("");

  // 打开详情并实时从数据库查询单条完整数据（含关联实体）
  const openDetailModal = async (log: OperationLog) => {
    setDetailLog(log);
    setDetailLoading(true);
    setShowRawJson(false);
    try {
      const res = await fetch(`/api/admin/operation-logs?id=${log.id}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setDetailLog(json.data);
        }
      }
    } catch (err) {
      console.error("从数据库加载操作审计详情失败:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  // 危险操作确认弹窗（单删 / 批量删）
  const [confirm, setConfirm] = useState<null | {
    kind: "single" | "batch";
    ids?: string[];
    title: string;
    message: string;
  }>(null);

  // 处理中 / 提示（使用系统标准 Toast）
  const [busy, setBusy] = useState(false);
  const { success: showSuccess, error: showError } = useToast();

  const buildQuery = useCallback(
    (extra: Record<string, string> = {}) => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      if (action) params.set("action", action);
      if (userKeyword.trim()) params.set("user", userKeyword.trim());
      if (resource) params.set("resource", resource);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      for (const [k, v] of Object.entries(extra)) params.set(k, v);
      return params.toString();
    },
    [page, action, userKeyword, resource, startDate, endDate]
  );

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/operation-logs?${buildQuery()}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "获取操作日志失败");

      const data = result.data;
      // 审计字典全部来自数据库（system_config: audit_action_dict / audit_resource_dict / audit_display_dict）
      if (data.auditDicts) setAuditDicts(data.auditDicts);
      if (Array.isArray(data.actionOptions)) setActionOptions(data.actionOptions);
      setTotal(data.total || 0);
      const tp = Math.max(1, Number(data.totalPages) || 1);
      if (page > tp) {
        setPage(tp);
        return;
      }
      setLogs(data.logs || []);
      setStats(data.stats || { total: 0, today: 0, highRisk: 0, activeUsers: 0 });
      if (data.retentionPolicy) setRetention(data.retentionPolicy);
      // 数据刷新后修正选中状态
      setSelectedIds((prev) => prev.filter((id) => (data.logs || []).some((l: OperationLog) => l.id === id)));
      setSelectAll(false);
    } catch (err: any) {
      setError(err.message || "获取操作日志失败");
    } finally {
      setLoading(false);
    }
  }, [buildQuery, page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSearch = () => {
    setPage(1);
    fetchLogs();
  };

  const handleReset = () => {
    setAction("");
    setUserKeyword("");
    setResource("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  // 快捷复制详情
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const handleCopyDetails = (id: string, details: any) => {
    try {
      const safe = sanitizeAuditDetails(details);
      const text = typeof safe === "string" ? safe : JSON.stringify(safe, null, 2);
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // 忽略复制异常
    }
  };

  // 快捷时间范围填充
  const handleSetQuickDate = (days: number | null) => {
    if (days === null) {
      setStartDate("");
      setEndDate("");
      return;
    }
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days);
    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
    setPage(1);
  };

  // —— 登录安全历史：加载与操作（融合原「系统日志」页面能力） ——
  const loadLoginHistories = async (
    p: number = loginPage,
    keyword: string = loginKeyword,
    start: string = loginStartDate,
    end: string = loginEndDate,
  ) => {
    setLoginLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(PAGE_SIZE) });
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (start) params.set("startDate", start);
      if (end) params.set("endDate", end);
      const res = await fetch(`/api/admin/login-histories?${params}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("加载登录历史失败");
      const result = await res.json();
      if (result.success && result.data) {
        const rows = result.data.histories || [];
        setHistories(rows);
        setLoginTotal(result.data.total || 0);
        setSelectedIds((prev) => prev.filter((id) => rows.some((h: any) => h.id === id)));
      }
    } catch {
      showError("加载登录历史失败");
    } finally {
      setLoginLoading(false);
    }
  };

  // Tab 切换：清空选择/展开态，登录 Tab 首次进入自动加载
  const switchTab = (tab: "operation" | "login") => {
    setActiveTab(tab);
    setSelectedIds([]);
    setSelectAll(false);
    setExpandedId(null);
    if (tab === "login") {
      setLoginPage(1);
      loadLoginHistories(1);
    }
  };

  // —— 复选框逻辑（按当前 Tab 的行集合选择） ——
  const currentRows: Array<{ id: string }> = activeTab === "operation" ? logs : histories;
  const allPageSelected = currentRows.length > 0 && currentRows.every((r) => selectedIds.includes(r.id));

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setSelectAll(false);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !currentRows.some((r) => r.id === id)));
      setSelectAll(false);
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...currentRows.map((r) => r.id)])));
      setSelectAll(true);
    }
  };

  // —— 删除：单条 / 批量（按当前 Tab 路由到对应接口；3 年超期由系统自动出清，不提供手动操作） ——
  const executeDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const endpoint =
        activeTab === "operation"
          ? "/api/admin/operation-logs"
          : "/api/admin/login-histories";
      const body: any = {};
      if (confirm.kind === "single" && confirm.ids) body.id = confirm.ids[0];
      else if (confirm.kind === "batch") body.ids = confirm.ids;

      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "删除失败");
      showSuccess(result.message || "操作成功");
      setConfirm(null);
      setSelectedIds([]);
      setSelectAll(false);

      if (activeTab === "operation") {
        fetchLogs();
      } else {
        loadLoginHistories(loginPage);
      }
    } catch (err: any) {
      showError(err.message || "删除失败");
    } finally {
      setBusy(false);
    }
  };

  // —— 导出：选中 / 当前筛选（支持标准 Excel 与结构化 JSON） ——
  const handleExport = async (format: "excel" | "json", scope: "selected" | "filtered") => {
    setBusy(true);
    try {
      let rows: OperationLog[] = [];
      if (scope === "selected") {
        rows = logs.filter((l) => selectedIds.includes(l.id));
        if (rows.length === 0) {
          showError("请先勾选要导出的审计日志");
          setBusy(false);
          return;
        }
      } else {
        // 拉取当前筛选条件下的全量数据（后端支持大 limit）
        const res = await fetch(`/api/admin/operation-logs?${buildQuery({ page: "1", limit: "100000" })}`);
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "获取导出数据失败");
        rows = result.data?.logs || [];
      }

      if (rows.length === 0) {
        showError("当前筛选条件下暂无审计日志可导出");
        setBusy(false);
        return;
      }

      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

      if (format === "excel") {
        exportToExcel({
          filename: `知阁平台操作审计日志_${stamp}`,
          sheetName: "操作审计日志",
          columns: [
            { header: "操作时间", formatter: (_, r) => formatTime(r.createdAt), width: 22 },
            { header: "操作类型", formatter: (_, r) => renderActionLabel(r), width: 16 },
            { header: "涉及资源域", formatter: (_, r) => renderResourceLabel(r), width: 14 },
            { header: "操作描述", formatter: (_, r) => describeLog(r), width: 36 },
            { header: "操作人姓名", formatter: (_, r) => r.user?.name || "未知用户", width: 16 },
            { header: "操作人邮箱", formatter: (_, r) => r.user?.email || "—", width: 24 },
            { header: "操作人角色", formatter: (_, r) => transRole(r.user?.role), width: 14 },
            { header: "操作人UID", key: "userId", width: 28 },
            { header: "源IP地址", formatter: (_, r) => r.ipAddress || "—", width: 22 },
            {
              header: "详细参数(JSON)",
              formatter: (_, r) => JSON.stringify(sanitizeAuditDetails(r.details ?? {}), null, 2),
              width: 38,
            },
          ],
          data: rows,
        });
      } else {
        triggerDownload(
          `知阁平台操作审计日志_${stamp}.json`,
          JSON.stringify(
            rows.map((r) => ({
              操作时间: formatTime(r.createdAt),
              操作类型: renderActionLabel(r),
              涉及资源域: renderResourceLabel(r),
              操作描述: describeLog(r),
              操作人姓名: r.user?.name || "未知用户",
              操作人邮箱: r.user?.email || "—",
              操作人角色: transRole(r.user?.role),
              操作人UID: r.userId,
              源IP地址: r.ipAddress || "—",
              详细参数: sanitizeAuditDetails(r.details ?? {}),
            })),
            null,
            2
          ),
          "application/json"
        );
      }
      showSuccess(`已成功导出 ${rows.length} 条审计日志（${format === "excel" ? "Excel 表格" : "JSON 文件"}）`);
    } catch (err: any) {
      showError(err.message || "导出失败");
    } finally {
      setBusy(false);
    }
  };

  const statsCards = [
    {
      label: "日志存量总额",
      value: stats.total,
      icon: ScrollText,
      accent: "bg-[#3182ce]/10",
      iconColor: "text-[#3182ce]",
      sub: "全站审计不可篡改底账",
    },
    {
      label: "今日实时操作",
      value: stats.today,
      icon: Clock,
      accent: "bg-[#10b981]/10",
      iconColor: "text-[#10b981]",
      sub: "今日新增的动态指令",
    },
    {
      label: "高危删除指令",
      value: stats.highRisk,
      icon: Trash2,
      accent: "bg-[#ef4444]/10",
      iconColor: "text-[#ef4444]",
      sub: "涉及用户/数据销毁记录",
    },
    {
      label: "参与操作人员",
      value: stats.activeUsers,
      icon: UserIcon,
      accent: "bg-[#805ad5]/10",
      iconColor: "text-[#805ad5]",
      sub: "当前筛选范围内去重操作人数",
    },
  ];

  const allActionOptions = actionOptions;
  // 导出范围：已勾选则导出勾选项，否则导出当前筛选结果（单一导出口，避免功能重复）
  const exportScope: "selected" | "filtered" = selectedIds.length > 0 ? "selected" : "filtered";

  return (
    <div className="space-y-6 pb-12 text-left font-sans">
      {/* 顶部 Bento 标头导航区 */}
      <div className="bg-white/80 backdrop-blur-xl border border-white/80 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center shadow-xs">
                <ScrollText className="w-5 h-5" />
              </span>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                全平台操作审计日志中枢
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-[#3182ce] border border-blue-200/80 select-none">
                真实实时溯源
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              全方位追踪记录平台所有特权指令、高危删除、用户处罚与配置变更，并统一留存登录安全历史，保障系统合规与责任闭环
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => {
                if (activeTab === "operation") fetchLogs();
                else loadLoginHistories(loginPage);
              }}
              disabled={loading || loginLoading || busy}
              className="h-10 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading || loginLoading ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
              <span>刷新</span>
            </button>
            <Link
              href="/admin"
              className="h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>返回大盘</span>
            </Link>
          </div>
        </div>
      </div>

      {/* 4 大 Bento 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-white/80 backdrop-blur-xl p-5 rounded-2xl border border-white/90 shadow-sm relative overflow-hidden group hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">{card.label}</span>
                <div className={`w-8 h-8 rounded-lg ${card.accent} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${card.iconColor}`} />
                </div>
              </div>
              <div className="text-3xl font-black text-slate-800 mt-2 tracking-tight">
                {loading ? "—" : card.value}
              </div>
              <div className="text-[11px] text-slate-400 font-medium mt-1">
                {card.sub}
              </div>
            </div>
          );
        })}
      </div>

      {/* 合规生命周期策略卡片 */}
      <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] rounded-2xl p-5 shadow-sm text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-7 h-7 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-black">网络安全合规生命周期策略</div>
            <div className="text-[12px] text-white/80 mt-0.5 leading-relaxed">
              {retention?.description ||
                "根据《网络安全法》审计要求，操作日志自动保留最近 3 年，超期数据系统自动物理出清。"}
            </div>
          </div>
        </div>
      </div>

      {/* 筛选栏 + 表格 卡片 */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
        {/* Tab 切换：操作审计流水 / 登录安全历史 */}
        <div className="px-5 sm:px-6 pt-5">
          <div className="flex items-center gap-1.5 p-1 bg-slate-200/50 rounded-xl w-fit">
            <button
              onClick={() => switchTab("operation")}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                activeTab === "operation" ? "bg-white text-[#2b6cb0] shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <ScrollText className="w-3.5 h-3.5 text-[#2b6cb0]" />
              <span>操作审计流水</span>
            </button>
            <button
              onClick={() => switchTab("login")}
              className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer select-none ${
                activeTab === "login" ? "bg-white text-[#2b6cb0] shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-[#2b6cb0]" />
              <span>登录安全历史</span>
            </button>
          </div>
        </div>

        {/* 筛选栏（操作审计流水） */}
        {activeTab === "operation" && (
        <div className="p-5 sm:p-6 border-b border-slate-100 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* 操作类型 */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                操作类型过滤
              </label>
              <div className="relative">
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="w-full appearance-none border border-slate-200 rounded-xl px-3.5 py-2.5 pr-8 text-xs font-bold text-slate-700 bg-slate-50/60 focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none transition-all cursor-pointer"
                >
                  <option value="">全部操作类型</option>
                  {allActionOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 操作用户 */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                操作人检索
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userKeyword}
                  onChange={(e) => setUserKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="按用户名或邮箱搜索..."
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs font-medium text-slate-700 bg-slate-50/60 focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none transition-all"
                />
              </div>
            </div>

            {/* 资源类型 */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">
                涉及资源类型
              </label>
              <div className="relative">
                <select
                  value={resource}
                  onChange={(e) => setResource(e.target.value)}
                  className="w-full appearance-none border border-slate-200 rounded-xl px-3.5 py-2.5 pr-8 text-xs font-bold text-slate-700 bg-slate-50/60 focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none transition-all cursor-pointer"
                >
                  <option value="">全部资源类型</option>
                  <option value="user">用户与账号</option>
                  <option value="account">安全与登录</option>
                  <option value="workspace">工作空间</option>
                  <option value="component">组件中心</option>
                  <option value="knowledge">资料与知识库</option>
                  <option value="task">协同任务</option>
                  <option value="system">系统设置</option>
                  <option value="membership">会员与计费</option>
                  <option value="asset">资料资产</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 时间区间选择与快捷标签 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-600">查询时间</label>
                <div className="flex items-center gap-1 text-[10px] font-bold">
                  <button onClick={() => handleSetQuickDate(0)} className="text-[#3182ce] hover:underline cursor-pointer">今日</button>
                  <span className="text-slate-300">·</span>
                  <button onClick={() => handleSetQuickDate(7)} className="text-[#3182ce] hover:underline cursor-pointer">近7天</button>
                  <span className="text-slate-300">·</span>
                  <button onClick={() => handleSetQuickDate(30)} className="text-[#3182ce] hover:underline cursor-pointer">近30天</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-50/60 focus:bg-white focus:border-[#3182ce] outline-none"
                />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-50/60 focus:bg-white focus:border-[#3182ce] outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={handleSearch}
                disabled={loading || busy}
                className="flex items-center gap-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:opacity-50 text-white text-xs font-bold px-5 h-9 rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
              >
                <Search className="w-3.5 h-3.5" />
                <span>执行查询</span>
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold px-4 h-9 rounded-xl shadow-2xs transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>重置条件</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">
                共检索到 <span className="font-bold text-slate-700">{total}</span> 条日志
              </span>
              <div className="h-4 w-px bg-slate-200" />
              {/* 统一导出口：有勾选则导出勾选项，否则导出当前筛选结果（避免重复入口） */}
              <button
                onClick={() => handleExport("excel", exportScope)}
                disabled={busy || loading}
                className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200/90 hover:bg-emerald-100/80 text-emerald-700 text-xs font-bold px-3.5 h-9 rounded-xl transition-all cursor-pointer disabled:opacity-50 shadow-2xs active:scale-95"
                title={exportScope === "selected" ? "导出勾选的记录为 Excel 表格 (.xlsx)" : "导出当前筛选结果为 Excel 表格 (.xlsx)"}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>{exportScope === "selected" ? `导出选中 Excel (${selectedIds.length})` : "导出 Excel"}</span>
              </button>
              <button
                onClick={() => handleExport("json", exportScope)}
                disabled={busy || loading}
                className="flex items-center gap-1.5 bg-blue-50 border border-blue-200/90 hover:bg-blue-100/80 text-[#2b6cb0] text-xs font-bold px-3.5 h-9 rounded-xl transition-all cursor-pointer disabled:opacity-50 shadow-2xs active:scale-95"
                title={exportScope === "selected" ? "导出勾选的记录为 JSON 文件 (.json)" : "导出当前筛选结果为 JSON 结构化数据 (.json)"}
              >
                <FileJson className="w-3.5 h-3.5 text-[#3182ce]" />
                <span>{exportScope === "selected" ? `导出选中 JSON (${selectedIds.length})` : "导出 JSON"}</span>
              </button>
            </div>
          </div>
        </div>
        )}

        {/* 筛选栏（登录安全历史） */}
        {activeTab === "login" && (
          <div className="p-5 sm:p-6 border-b border-slate-100 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
              <div className="lg:col-span-2">
                <label className="block text-xs font-bold text-slate-600 mb-1.5">登录用户检索</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={loginKeyword}
                    onChange={(e) => setLoginKeyword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (setLoginPage(1), loadLoginHistories(1, loginKeyword, loginStartDate, loginEndDate))}
                    placeholder="按用户名或邮箱搜索..."
                    className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-xs font-medium text-slate-700 bg-slate-50/60 focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-600">查询时间</label>
                  <div className="flex items-center gap-1 text-[10px] font-bold">
                    <button
                      onClick={() => {
                        const end = new Date();
                        const start = new Date();
                        start.setDate(end.getDate());
                        setLoginStartDate(start.toISOString().split("T")[0]);
                        setLoginEndDate(end.toISOString().split("T")[0]);
                      }}
                      className="text-[#3182ce] hover:underline cursor-pointer"
                    >
                      今日
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      onClick={() => {
                        const end = new Date();
                        const start = new Date();
                        start.setDate(end.getDate() - 7);
                        setLoginStartDate(start.toISOString().split("T")[0]);
                        setLoginEndDate(end.toISOString().split("T")[0]);
                      }}
                      className="text-[#3182ce] hover:underline cursor-pointer"
                    >
                      近7天
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      onClick={() => {
                        const end = new Date();
                        const start = new Date();
                        start.setDate(end.getDate() - 30);
                        setLoginStartDate(start.toISOString().split("T")[0]);
                        setLoginEndDate(end.toISOString().split("T")[0]);
                      }}
                      className="text-[#3182ce] hover:underline cursor-pointer"
                    >
                      近30天
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    type="date"
                    value={loginStartDate}
                    onChange={(e) => setLoginStartDate(e.target.value)}
                    className="border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-50/60 focus:bg-white focus:border-[#3182ce] outline-none"
                  />
                  <input
                    type="date"
                    value={loginEndDate}
                    onChange={(e) => setLoginEndDate(e.target.value)}
                    className="border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-50/60 focus:bg-white focus:border-[#3182ce] outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setLoginPage(1); loadLoginHistories(1, loginKeyword, loginStartDate, loginEndDate); }}
                  disabled={loginLoading || busy}
                  className="flex items-center gap-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:opacity-50 text-white text-xs font-bold px-5 h-9 rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>执行查询</span>
                </button>
                <button
                  onClick={() => { setLoginKeyword(""); setLoginStartDate(""); setLoginEndDate(""); setLoginPage(1); loadLoginHistories(1, "", "", ""); }}
                  className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold px-4 h-9 rounded-xl shadow-2xs transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>重置条件</span>
                </button>
              </div>
              <span className="text-xs text-slate-400 font-medium">
                共检索到 <span className="font-bold text-slate-700">{loginTotal}</span> 条登录记录
              </span>
            </div>
          </div>
        )}

        {/* 错误提示（操作审计） */}
        {activeTab === "operation" && error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3">
            {error}
          </div>
        )}

        {/* 批量操作浮动栏 */}
        {selectedIds.length > 0 && (
          <div className="mx-6 mt-4 bg-[#3182ce]/5 border border-[#3182ce]/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#2b6cb0]">
              <CheckSquare className="w-4 h-4" />
              已勾选 <span className="text-[#3182ce]">{selectedIds.length}</span> 条
              {activeTab === "operation" ? "审计记录" : "登录记录"}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setConfirm({
                    kind: "batch",
                    ids: selectedIds,
                    title: activeTab === "operation" ? "批量删除审计日志" : "批量删除登录历史",
                    message: `即将永久删除选中的 ${selectedIds.length} 条${
                      activeTab === "operation" ? "操作审计日志" : "登录安全历史记录"
                    }，此操作不可恢复。是否继续？`,
                  })
                }
                disabled={busy}
                className="flex items-center gap-1.5 bg-red-600 border border-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 h-8 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>批量删除</span>
              </button>
              <button
                onClick={() => {
                  setSelectedIds([]);
                  setSelectAll(false);
                }}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                取消选择
              </button>
            </div>
          </div>
        )}

        {/* 表格（操作审计流水） */}
        {activeTab === "operation" ? (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[1320px]">
            <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
              <tr>
                <th className="sticky left-0 z-20 bg-slate-50/90 px-4 py-4 text-left text-xs font-bold text-slate-500 whitespace-nowrap w-12">
                  <button onClick={toggleSelectAll} className="cursor-pointer" title="全选当前页">
                    {selectAll || (selectedIds.length === logs.length && logs.length > 0) ? (
                      <CheckSquare className="w-4 h-4 text-[#3182ce]" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[110px]">
                  操作类型
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  操作人
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[110px]">
                  资源
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  操作描述
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  IP 地址
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  操作时间
                </th>
                <th className="sticky right-0 z-20 bg-slate-50/90 px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[120px] shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.08)]">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center">
                    <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600 font-medium">加载中...</p>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                      <FileText className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-slate-500 font-medium text-sm">
                      暂无符合条件的审计日志
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const meta = renderActionMeta(log);
                  const ResIcon = resourceIcon(log.resource);
                  const checked = selectedIds.includes(log.id);
                  return (
                    <Fragment key={log.id}>
                    <tr
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                      className={`group cursor-pointer hover:bg-white/60 transition-all duration-300 ${
                        checked ? "bg-[#3182ce]/5" : ""
                      }`}
                    >
                      <td className="sticky left-0 z-10 bg-white px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => toggleSelect(log.id)} className="cursor-pointer" title="选择此条">
                          {checked ? (
                            <CheckSquare className="w-4 h-4 text-[#3182ce]" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold whitespace-nowrap shrink-0 ${meta.color}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {log.user?.avatar ? (
                            <img
                              src={log.user.avatar}
                              alt={log.user.name || ""}
                              className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-xs font-black shadow-xs shrink-0">
                              {(log.user?.name || "U").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 max-w-[150px]">
                            <Link
                              href={`/admin/users?search=${encodeURIComponent(log.user?.email || log.user?.name || log.userId)}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-sm font-bold text-slate-800 hover:text-[#3182ce] hover:underline transition-colors truncate block"
                              title="前往用户画像中心查看该用户"
                            >
                              {log.user?.name || "未知用户"}
                            </Link>
                            <div className="text-xs text-slate-500 font-medium truncate">
                              {log.user?.email || "未留邮箱"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                        <div className="flex items-center gap-1.5">
                          <ResIcon className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="truncate whitespace-nowrap">
                            {renderResourceLabel(log)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700 font-medium max-w-xs">
                        <span className="truncate block" title={describeLog(log)}>
                          {describeLog(log)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-medium whitespace-nowrap">
                        {log.ipAddress || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-medium whitespace-nowrap">
                        {formatTime(log.createdAt)}
                      </td>
                      <td className="sticky right-0 z-10 bg-white px-6 py-4 text-right min-w-[120px] shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.08)]" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                          <button
                            onClick={() => openDetailModal(log)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 text-[#3182ce] bg-[#3182ce]/10 hover:bg-[#3182ce]/20 transition-colors cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            查看
                          </button>
                          <button
                            onClick={() =>
                              setConfirm({
                                kind: "single",
                                ids: [log.id],
                                title: "删除该条审计日志",
                                message: "即将永久删除这条操作审计日志，此操作不可恢复。是否继续？",
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-all active:scale-95 cursor-pointer bg-red-600 hover:bg-red-700 text-white border border-red-600 shadow-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-white" />
                            <span>删除</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === log.id && (
                      <tr className="bg-slate-50/40">
                        <td colSpan={8} className="p-0">
                          <OperationLogDetails log={log} />
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        ) : (
          /* 登录安全历史表格（融合原「系统日志」页面） */
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[1100px]">
              <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-4 text-left text-xs font-bold text-slate-500 whitespace-nowrap w-12">
                    <button onClick={toggleSelectAll} className="cursor-pointer" title="全选当前页">
                      {allPageSelected ? (
                        <CheckSquare className="w-4 h-4 text-[#3182ce]" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">登录用户</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">登录时间</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">真实登录 IP</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">地理归属地</th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">客户端设备与系统</th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap min-w-[100px]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loginLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center">
                      <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-slate-600 font-medium">加载中...</p>
                    </td>
                  </tr>
                ) : histories.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center">
                      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                        <Clock className="w-8 h-8 text-slate-400" />
                      </div>
                      <p className="text-slate-500 font-medium text-sm">暂无登录安全历史记录</p>
                    </td>
                  </tr>
                ) : (
                  histories.map((history) => {
                    const checked = selectedIds.includes(history.id);
                    return (
                      <tr
                        key={history.id}
                        className={`hover:bg-white/60 transition-all duration-300 ${
                          checked ? "bg-[#3182ce]/5" : ""
                        }`}
                      >
                        <td className="px-4 py-4">
                          <button onClick={() => toggleSelect(history.id)} className="cursor-pointer" title="选择此条">
                            {checked ? (
                              <CheckSquare className="w-4 h-4 text-[#3182ce]" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {history.user?.avatar ? (
                              <img src={history.user.avatar} alt="" className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200" />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-xs font-black shadow-xs shrink-0">
                                {(history.user?.name || "U").charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0 max-w-[150px]">
                              <div className="text-sm font-bold text-slate-800 truncate">{history.user?.name || "未知用户"}</div>
                              <div className="text-xs text-slate-500 font-medium truncate">{history.user?.email || "未留邮箱"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 font-medium whitespace-nowrap">
                          {formatTime(history.loginAt)}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 font-medium whitespace-nowrap">
                          {!history.ipAddress || history.ipAddress.includes("127.0.0.1")
                            ? "127.0.0.1 (本地局域网)"
                            : history.ipAddress.replace(/^::ffff:/, "")}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700 font-medium whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{history.location || "本地局域专网"}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700 font-medium whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Monitor className="w-3.5 h-3.5 text-[#2b6cb0] shrink-0" />
                            <span>{history.device || "Windows 终端 · Web 浏览器"}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <button
                            onClick={() =>
                              setConfirm({
                                kind: "single",
                                ids: [history.id],
                                title: "删除该条登录历史",
                                message: "即将永久删除这条登录安全历史记录，此操作不可恢复。是否继续？",
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-all active:scale-95 cursor-pointer bg-red-600 hover:bg-red-700 text-white border border-red-600 shadow-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-white" />
                            <span>删除</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {activeTab === "operation"
          ? (!loading && total > 0 && (
              <div className="px-6 py-4 border-t border-slate-200 bg-gradient-to-r from-slate-50/50 to-transparent">
                <Pagination
                  currentPage={page}
                  totalItems={total}
                  pageSize={PAGE_SIZE}
                  onPageChange={(p) => setPage(p)}
                  itemLabel="条操作日志"
                />
              </div>
            ))
          : (!loginLoading && loginTotal > 0 && (
              <div className="px-6 py-4 border-t border-slate-200 bg-gradient-to-r from-slate-50/50 to-transparent">
                <Pagination
                  currentPage={loginPage}
                  totalItems={loginTotal}
                  pageSize={PAGE_SIZE}
                  onPageChange={(p) => { setLoginPage(p); loadLoginHistories(p); }}
                  itemLabel="条登录记录"
                />
              </div>
            ))}
      </div>

      {/* 详情模态框：与系统标准审计弹窗统一 */}
      {detailLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setDetailLog(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶栏：知阁知性蓝渐变 */}
            <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5 text-white">
                <ScrollText className="w-5 h-5" />
                <div>
                  <div className="text-base font-black">操作审计详情</div>
                  <div className="text-[11px] text-white/75 flex items-center gap-1.5">
                    <span>审计流水详情 · {renderActionLabel(detailLog)}</span>
                    {detailLoading && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-white/20 px-1.5 py-0.5 rounded text-white font-medium">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        数据库实时查询中...
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setDetailLog(null)} className="text-white/80 hover:text-white transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {/* 基本信息 */}
              <Section title="基本信息">
                <Field label="操作类型" value={renderActionLabel(detailLog)} />
                <Field label="资源域" value={renderResourceLabel(detailLog)} />
                <Field label="发生时刻" value={formatTime(detailLog.createdAt)} />
                {detailLog.workspace && (
                  <Field
                    label="所属空间"
                    value={`${detailLog.workspace.name} (${transWorkspaceType(detailLog.workspace.type)} / ${transPlan(detailLog.workspace.plan)})`}
                  />
                )}
                {!detailLog.workspace && detailLog.workspaceId && (
                  <Field
                    label="所属空间"
                    value={detailLog.workspaceId === "SYSTEM" ? "平台全局系统域" : "独立业务工作空间"}
                  />
                )}
                {!detailLog.workspaceId && (
                  <Field label="所属空间" value="平台全局系统域" />
                )}
              </Section>

              {/* 操作人详情 */}
              <Section title="操作人画像">
                <div className="flex items-center gap-3 mb-3">
                  {detailLog.user?.avatar ? (
                    <img src={detailLog.user.avatar} alt="" className="w-11 h-11 rounded-full object-cover border border-slate-200" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold">
                      {(detailLog.user?.name || "U").charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <div className="text-sm font-bold text-slate-800">{detailLog.user?.name || "未知用户"}</div>
                    <div className="text-xs text-slate-500">{detailLog.user?.email || "未留邮箱"}</div>
                  </div>
                  {detailLog.user?.role && (
                    <span className="ml-auto px-2.5 py-1 rounded-md text-xs font-bold bg-[#3182ce]/10 text-[#3182ce]">
                      {transRole(detailLog.user.role)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                  <span className="text-slate-500">
                    账号状态：<span className="font-bold text-emerald-600">{transStatus(detailLog.user?.status || "active")}</span>
                    {detailLog.user?.phone ? ` · 手机号：${detailLog.user.phone}` : ""}
                  </span>
                  <Link
                    href={`/admin/users?search=${encodeURIComponent(detailLog.user?.email || detailLog.user?.name || detailLog.userId)}`}
                    className="inline-flex items-center gap-1 font-bold text-[#3182ce] hover:underline"
                  >
                    反查操作人画像 →
                  </Link>
                </div>
              </Section>

              {/* 客户端 / 网络环境 */}
              <Section title="客户端与网络环境">
                <Field label="源 IP" value={detailLog.ipAddress || "127.0.0.1 (本地局域网)"} mono />
                <Field label="操作账号" value={`${detailLog.user?.name || "系统未知"} (${detailLog.user?.email || "未留邮箱"})`} />
              </Section>

              {/* 操作参数与业务变更明细（全局唯一，拒绝重复拼凑堆叠） */}
              <Section
                title="操作参数与业务变更明细"
                action={
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowRawJson(!showRawJson)}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-[#3182ce] bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-lg transition-all cursor-pointer"
                    >
                      {showRawJson ? "切换为业务参数解析" : "查看原始 JSON"}
                    </button>
                    <button
                      onClick={() => handleCopyDetails(detailLog.id, detailLog.details)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-[#3182ce] bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-lg transition-all cursor-pointer"
                    >
                      {copiedId === detailLog.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-600">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>复制数据</span>
                        </>
                      )}
                    </button>
                  </div>
                }
              >
                {detailLoading ? (
                  <div className="p-4 bg-slate-50 rounded-xl flex items-center justify-center gap-2 text-xs text-slate-500">
                    <RefreshCw className="w-4 h-4 animate-spin text-[#3182ce]" />
                    <span>正在调取关联业务实体与参数解析...</span>
                  </div>
                ) : showRawJson ? (
                  <pre className="text-[11px] leading-relaxed bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-all">
{(() => {
  const safe = sanitizeAuditDetails(detailLog.details ?? {});
  return typeof safe === "string" ? safe : JSON.stringify(safe, null, 2);
})()}
                  </pre>
                ) : (
                  (() => {
                    const rows = parseDetails(detailLog.details, detailLog);
                    if (rows.length === 0) {
                      return (
                        <div className="text-xs text-slate-500 p-3.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-slate-300"></span>
                          本次操作为系统单向直接触发，无额外业务变更参数记录
                        </div>
                      );
                    }
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {rows.map((row, idx) => {
                          const isReason = row.label.includes("原因") || row.label.includes("案由");
                          const isEmptyVal = !row.value || row.value.trim() === "—" || row.value === "未填写";
                          // 空原因不占卡片空间
                          if (isReason && isEmptyVal) return null;

                          // 仅对实质性较长的详细描述、驳回原因、变更明细采用通栏展示
                          const isLong =
                            (isReason && !isEmptyVal && row.value.length > 12) ||
                            row.label.includes("意见") ||
                            row.label.includes("详细说明") ||
                            (row.label.includes("内容") && row.value.length > 20) ||
                            row.value.length > 28;

                          if (isLong) {
                            return (
                              <div
                                key={idx}
                                className="col-span-1 sm:col-span-2 p-3 bg-slate-50/90 border border-slate-200/70 rounded-xl text-xs flex flex-col sm:flex-row sm:items-start gap-2"
                              >
                                <div className="text-slate-500 font-medium shrink-0 pt-0.5 flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#3182ce]"></span>
                                  <span>{row.label}</span>
                                </div>
                                <div className="text-slate-800 font-bold text-left leading-relaxed break-words flex-1 bg-white/80 p-2.5 rounded-lg border border-slate-200/60">
                                  {row.value}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50/90 border border-slate-100 rounded-xl text-xs">
                              <span className="text-slate-500 font-medium shrink-0 mr-3">{row.label}</span>
                              <span className="text-slate-800 font-bold break-all text-right">{row.value}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()
                )}
              </Section>
            </div>
          </div>
        </div>
      )}

      {/* 危险操作二次确认弹窗 */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => !busy && setConfirm(null)}>
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 flex items-start gap-3 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <div className="text-base font-black text-slate-800">{confirm.title}</div>
                <div className="text-xs text-slate-500 mt-1 leading-relaxed">{confirm.message}</div>
              </div>
            </div>
            <div className="px-6 py-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirm(null)}
                disabled={busy}
                className="px-4 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={executeDelete}
                disabled={busy}
                className="px-4 h-9 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {busy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>确认删除</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// —— 模态框内部小组件 ——
function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">{title}</h4>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 font-medium shrink-0 mr-4">{label}</span>
      <span className={`text-xs text-slate-800 font-bold text-right ${mono ? "font-mono text-[11px] break-all" : "break-all"}`}>
        {value}
      </span>
    </div>
  );
}
