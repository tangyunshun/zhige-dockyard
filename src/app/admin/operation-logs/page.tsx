"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import Link from "next/link";
import Pagination from "@/components/Pagination";
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
} from "lucide-react";
import { useToast } from "@/components/Toast";

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
}

// 操作类型（真实 action 值）→ 中文文案 / 配色（简洁 Badge，与主系统一致）
// 已覆盖全系统所有真实落库 action，彻底消除“其他操作 / 其他”失真
const ACTION_META: Record<string, { label: string; color: string }> = {
  // —— 用户治理 ——
  "user:create": { label: "创建用户", color: "bg-emerald-100 text-emerald-600" },
  "user:update": { label: "更新用户", color: "bg-blue-100 text-[#2b6cb0]" },
  "user:delete": { label: "删除用户", color: "bg-red-100 text-red-600" },
  "user:ban": { label: "封禁用户", color: "bg-red-100 text-red-600" },
  "user:unban": { label: "解封用户", color: "bg-emerald-100 text-emerald-600" },
  "user:reset_session": { label: "重置会话", color: "bg-amber-100 text-amber-600" },
  "ACCOUNT_DELETION_REQUESTED": { label: "注销申请", color: "bg-amber-100 text-amber-600" },
  "ACCOUNT_DELETED": { label: "账号销毁", color: "bg-red-100 text-red-600" },
  // —— 认证与安全 ——
  "auth:login": { label: "登录", color: "bg-purple-100 text-[#805ad5]" },
  "auth:logout": { label: "登出", color: "bg-slate-100 text-slate-700" },
  "Password:Change": { label: "修改密码", color: "bg-blue-100 text-[#2b6cb0]" },
  "SecuritySetting:Update": { label: "安全设置变更", color: "bg-blue-100 text-[#2b6cb0]" },
  "ADMIN_FORCE_LOGOUT": { label: "强制下线", color: "bg-red-100 text-red-600" },
  "SESSION_CONFLICT_LOGOUT": { label: "会话冲突登出", color: "bg-amber-100 text-amber-600" },
  "DEVICE_KICKED_OFFLINE": { label: "设备被踢下线", color: "bg-amber-100 text-amber-600" },
  "cross_region_verify": { label: "跨区域验证", color: "bg-blue-100 text-[#2b6cb0]" },
  "SECURITY_DIAGNOSIS": { label: "安全诊断", color: "bg-indigo-100 text-[#5a67d8]" },
  "APIKey:Create": { label: "创建密钥", color: "bg-emerald-100 text-emerald-600" },
  "APIKey:Delete": { label: "删除密钥", color: "bg-red-100 text-red-600" },
  "CONFIGURE_ADMIN_PERMISSIONS": { label: "配置管理员权限", color: "bg-indigo-100 text-[#5a67d8]" },
  "RESET_ALL_DEFAULT_PERMISSIONS_IN_DB": { label: "重置默认权限", color: "bg-amber-100 text-amber-600" },
  "DELETE_PERMISSIONS_FROM_DB": { label: "删除权限配置", color: "bg-red-100 text-red-600" },
  // —— 工作空间协同 ——
  "workspace:create": { label: "创建空间", color: "bg-emerald-100 text-emerald-600" },
  "workspace:update": { label: "更新空间", color: "bg-blue-100 text-[#2b6cb0]" },
  "workspace:delete": { label: "删除空间", color: "bg-red-100 text-red-600" },
  "CREATE_ENTERPRISE_WORKSPACE": { label: "创建企业空间", color: "bg-indigo-100 text-[#5a67d8]" },
  "JOIN_WORKSPACE": { label: "加入空间", color: "bg-emerald-100 text-emerald-600" },
  "LEAVE_WORKSPACE": { label: "退出空间", color: "bg-amber-100 text-amber-600" },
  "UPDATE_MEMBER_ROLE": { label: "调整成员角色", color: "bg-blue-100 text-[#2b6cb0]" },
  "WORKSPACE_KICK": { label: "移出成员", color: "bg-red-100 text-red-600" },
  "UPGRADE_WORKSPACE": { label: "升级空间", color: "bg-indigo-100 text-[#5a67d8]" },
  "UPGRADE_WORKSPACE_PLAN": { label: "变更空间套餐", color: "bg-indigo-100 text-[#5a67d8]" },
  "CONFIGURE_SOLUTION": { label: "配置解决方案", color: "bg-blue-100 text-[#2b6cb0]" },
  "SET_RESTRICTED_COMPONENTS": { label: "设置受限组件", color: "bg-blue-100 text-[#2b6cb0]" },
  "SAVE_CUSTOM_POSITIONS": { label: "保存自定义布局", color: "bg-blue-100 text-[#2b6cb0]" },
  // —— 研发组件中心 ——
  "component:create": { label: "创建组件", color: "bg-emerald-100 text-emerald-600" },
  "component:update": { label: "更新组件", color: "bg-blue-100 text-[#2b6cb0]" },
  "component:delete": { label: "删除组件", color: "bg-red-100 text-red-600" },
  "component:execute": { label: "执行组件", color: "bg-purple-100 text-[#805ad5]" },
  "BIND_COMPONENT": { label: "绑定组件", color: "bg-blue-100 text-[#2b6cb0]" },
  "UNBIND_COMPONENT": { label: "解绑组件", color: "bg-amber-100 text-amber-600" },
  // —— 知识库 ——
  "KNOWLEDGE_PUBLISH": { label: "发布知识", color: "bg-emerald-100 text-emerald-600" },
  "KNOWLEDGE_SUBMIT": { label: "提交知识", color: "bg-blue-100 text-[#2b6cb0]" },
  "KNOWLEDGE_APPROVE": { label: "审核通过知识", color: "bg-emerald-100 text-emerald-600" },
  "KNOWLEDGE_REJECT": { label: "驳回知识", color: "bg-amber-100 text-amber-600" },
  // —— 任务 ——
  "ARCHIVE_TASK": { label: "归档任务", color: "bg-amber-100 text-amber-600" },
  "DELETE_TASK": { label: "删除任务", color: "bg-red-100 text-red-600" },
  // —— 资料资产 ——
  "asset:remove_private": { label: "移除私密资料", color: "bg-red-100 text-red-600" },
  "asset:remove": { label: "移除公开资料", color: "bg-red-100 text-red-600" },
  "asset:removal_request": { label: "资料删除申请", color: "bg-amber-100 text-amber-600" },
  "asset:removal_approve": { label: "删除申请通过", color: "bg-emerald-100 text-emerald-600" },
  "asset:removal_reject": { label: "删除申请驳回", color: "bg-amber-100 text-amber-600" },
  "asset:removal_record_delete": { label: "彻底删除资料", color: "bg-red-100 text-red-600" },
  "asset:private_review_request": { label: "私密资料治理要求", color: "bg-blue-100 text-[#2b6cb0]" },
  "asset:upload": { label: "上传资料", color: "bg-cyan-100 text-cyan-600" },
  "asset:approve": { label: "审核通过公开资料", color: "bg-emerald-100 text-emerald-600" },
  "asset:reject": { label: "审核驳回公开申请", color: "bg-amber-100 text-amber-600" },
  "asset:restore": { label: "恢复已移除资料", color: "bg-blue-100 text-[#2b6cb0]" },
  // —— 会员与计费 ——
  "MEMBERSHIP_UPGRADE": { label: "会员升级", color: "bg-indigo-100 text-[#5a67d8]" },
  "system:settings": { label: "系统设置", color: "bg-indigo-100 text-[#5a67d8]" },
  "PING_TEST": { label: "网关连通测试", color: "bg-slate-100 text-slate-700" },
};

// 未知 action 的兜底：绝不显示“其他”，而是把原始串美化为可读标签
function prettifyAction(action: string): string {
  return action
    .replace(/[:_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function actionMeta(action: string) {
  if (ACTION_META[action]) return ACTION_META[action];
  return { label: prettifyAction(action), color: "bg-slate-100 text-slate-700" };
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

// 资源归类标准化为 6 大业务域，杜绝无意义的“其他”
function resourceLabel(resource: string | null) {
  const r = (resource || "").toLowerCase();
  if (r.includes("user") || r.includes("account")) return "用户治理";
  if (r.includes("password") || r.includes("security") || r.includes("apike") || r.includes("session") || r.includes("auth")) return "认证与安全";
  if (r.includes("workspace") || r.includes("space") || r.includes("member") || r.includes("component") || r.includes("knowledge") || r.includes("task")) return "空间协同";
  if (r.includes("system") || r.includes("permission") || r.includes("setting") || r.includes("solution")) return "系统配置";
  if (r.includes("membership") || r.includes("billing") || r.includes("plan")) return "会员与计费";
  if (/^[0-9a-f]{8}-/.test(r)) return "业务记录";
  return "系统";
}

// 枚举值 → 中文（状态 / 角色 / 系统动作等）
const STATUS_LABELS: Record<string, string> = {
  active: "正常",
  banned: "已封禁",
  suspended: "已停用",
  inactive: "未激活",
  deleted: "已删除",
};

const ROLE_LABELS: Record<string, string> = {
  user: "普通用户",
  admin: "运营管理员",
  super_admin: "超级管理员",
  member: "成员",
  owner: "拥有者",
  viewer: "访客",
  component_manager: "组件管理员",
  knowledge_manager: "知识库管理员",
  componentmanager: "组件管理员",
  knowledgemanager: "知识库管理员",
};

const PLAN_LABELS: Record<string, string> = {
  STANDARD: "标准版",
  ENTERPRISE: "企业版",
  PRO: "专业版",
  FREE: "免费版",
};

const VISIBILITY_LABELS: Record<string, string> = {
  PRIVATE: "私有",
  PUBLIC: "公开",
  INTERNAL: "内部可见",
};

const WORKSPACE_TYPE_LABELS: Record<string, string> = {
  ENTERPRISE: "企业型",
  STANDARD: "标准型",
};

function transStatus(v: any) {
  if (v === null || v === undefined) return "—";
  return STATUS_LABELS[String(v).toLowerCase()] || String(v);
}
function transRole(v: any) {
  if (v === null || v === undefined) return "—";
  return ROLE_LABELS[String(v).toLowerCase()] || String(v);
}
function transPlan(v: any) {
  if (v === null || v === undefined) return "—";
  return PLAN_LABELS[String(v).toUpperCase()] || String(v);
}
function transVisibility(v: any) {
  if (v === null || v === undefined) return "—";
  return VISIBILITY_LABELS[String(v).toUpperCase()] || String(v);
}
function transWorkspaceType(v: any) {
  if (v === null || v === undefined) return "—";
  return WORKSPACE_TYPE_LABELS[String(v).toUpperCase()] || String(v);
}

// 把 details 解析为可读的 [中文标签, 值] 列表（隐藏无意义 ID，翻译枚举值）
function parseDetails(details: any): { label: string; value: string }[] {
  let obj: any = details;
  if (typeof details === "string") {
    if (!details.trim()) return [];
    try {
      obj = JSON.parse(details);
    } catch {
      return [{ label: "内容", value: details }];
    }
  }
  if (obj === null || obj === undefined) return [];
  if (typeof obj !== "object") return [{ label: "内容", value: String(obj) }];

  const rows: { label: string; value: string }[] = [];
  for (const [key, val] of Object.entries(obj)) {
    let label: string;
    let value: string;

    switch (key) {
      case "targetUserId":
        label = "目标用户 ID"; value = String(val);
        break;
      case "bannedUntil":
        label = "封禁截止"; value = formatTime(String(val));
        break;
      case "reason":
        label = "封禁原因"; value = String(val || "—");
        break;
      case "name":
        label = "名称"; value = String(val);
        break;
      case "tokens":
        label = "消耗额度"; value = `${val} 点`;
        break;
      case "componentId":
        label = "组件 ID"; value = String(val);
        break;
      case "action":
        label = "系统动作"; value = String(val);
        break;
      case "workspaceName":
        label = "工作空间"; value = String(val);
        break;
      case "workspacePlan":
        label = "套餐"; value = transPlan(val);
        break;
      case "workspaceType":
        label = "空间类型"; value = transWorkspaceType(val);
        break;
      case "workspaceVisibility":
        label = "可见性"; value = transVisibility(val);
        break;
      case "invitationCode":
        label = "邀请码"; value = String(val);
        break;
      case "role":
        label = "角色"; value = transRole(val);
        break;
      case "newRole":
        label = "新角色"; value = transRole(val);
        break;
      case "fromType":
        label = "原类型"; value = transWorkspaceType(val);
        break;
      case "toType":
        label = "目标类型"; value = transWorkspaceType(val);
        break;
      case "fromLevel":
        label = "原等级"; value = String(val);
        break;
      case "toLevel":
        label = "目标等级"; value = String(val);
        break;
      case "boundAt":
        label = "绑定时间"; value = formatTime(String(val));
        break;
      case "restrictedIds":
        label = "受限组件"; value = Array.isArray(val) ? val.join("、") : String(val);
        break;
      case "positions":
        label = "自定义布局"; value = Array.isArray(val) ? `${val.length} 项` : String(val);
        break;
      case "knowledgeId":
        label = "知识 ID"; value = String(val);
        break;
      case "taskId":
        label = "任务 ID"; value = String(val);
        break;
      case "kickedUserId":
        label = "被移出用户 ID"; value = String(val);
        break;
      case "solution":
        label = "解决方案"; value = String(val);
        break;
      case "type":
        label = "类型"; value = String(val);
        break;
      case "updates": {
        label = "变更内容";
        if (val && typeof val === "object") {
          value = Object.entries(val as Record<string, any>)
            .map(([k, v]) => {
              const kl = k === "status" ? "状态" : k === "role" ? "角色" : k;
              const vl = k === "status" ? transStatus(v) : k === "role" ? transRole(v) : String(v);
              return `${kl}：${vl}`;
            })
            .join("，");
        } else {
          value = String(val);
        }
        break;
      }
      default:
        // 未知字段（如原始 id）直接忽略，避免暴露无意义技术串
        continue;
    }
    rows.push({ label, value });
  }
  return rows;
}

// 列表行内的一句话可读摘要（让管理员无需展开即看懂）
function describeLog(log: OperationLog): string {
  const meta = actionMeta(log.action);
  const d = parseDetails(log.details);
  const get = (k: string) => d.find((r) => r.label === k)?.value || "";

  switch (log.action) {
    case "user:ban":
      return `封禁用户${get("封禁原因") ? `（原因：${get("封禁原因")}）` : ""}`;
    case "user:unban":
      return "解封用户";
    case "user:update":
      return `更新用户${get("变更内容") ? `（${get("变更内容")}）` : ""}`;
    case "user:delete":
      return "删除用户";
    case "user:reset_session":
      return "重置该用户登录会话";
    case "ACCOUNT_DELETION_REQUESTED":
      return "用户提交账号注销申请";
    case "ACCOUNT_DELETED":
      return "账号已彻底销毁（冷静期届满）";
    case "component:create":
      return `创建组件「${get("名称")}」`;
    case "component:update":
      return `更新组件${get("名称") ? `「${get("名称")}」` : ""}${get("变更内容") ? `（${get("变更内容")}）` : ""}`;
    case "component:delete":
      return `删除组件${get("名称") ? `「${get("名称")}」` : ""}`;
    case "component:execute":
      return `执行组件（消耗额度 ${get("消耗额度") || "—"}）`;
    case "workspace:create":
      return `创建工作空间${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "workspace:update":
      return `更新工作空间${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "workspace:delete":
      return `删除工作空间${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "CREATE_ENTERPRISE_WORKSPACE":
      return `创建企业工作空间「${get("工作空间")}」${get("套餐") ? `（套餐：${get("套餐")}）` : ""}`;
    case "JOIN_WORKSPACE":
      return `加入工作空间「${get("工作空间")}」${get("角色") ? `（角色：${get("角色")}）` : ""}`;
    case "LEAVE_WORKSPACE":
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
      return "管理员登录";
    case "auth:logout":
      return "管理员登出";
    case "Password:Change":
      return "用户主动修改登录密码";
    case "SecuritySetting:Update":
      return "更新账户安全设置";
    case "ADMIN_FORCE_LOGOUT":
      return "管理员强制将用户踢出当前会话";
    case "SESSION_CONFLICT_LOGOUT":
      return "会话冲突自动登出";
    case "DEVICE_KICKED_OFFLINE":
      return "设备被强制踢下线";
    case "SECURITY_DIAGNOSIS":
      return "执行账户安全诊断评分";
    case "APIKey:Create":
      return "创建 API 访问密钥";
    case "APIKey:Delete":
      return "删除 API 访问密钥";
    case "CONFIGURE_ADMIN_PERMISSIONS":
      return "配置管理员后台权限";
    case "MEMBERSHIP_UPGRADE":
      return `会员等级升级${get("目标等级") ? `→ ${get("目标等级")}` : ""}`;
    case "PING_TEST":
      return "网关连通性探测";
    default:
      // 兜底也绝不出现“其他”，直接复用语义字典标签
      return `${meta.label}操作`;
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
        actionMeta(r.action).label,
        resourceLabel(r.resource),
        describeLog(r),
        r.user?.name || "未知用户",
        r.user?.email || "—",
        r.ipAddress || "—",
        JSON.stringify(r.details ?? {}),
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
  const [stats, setStats] = useState({ total: 0, today: 0, highRisk: 0 });
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

  // 详情弹窗
  const [detailLog, setDetailLog] = useState<OperationLog | null>(null);

  // 危险操作确认弹窗（单删 / 批量删 / 合规出清）
  const [confirm, setConfirm] = useState<null | {
    kind: "single" | "batch" | "purge";
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
      setTotal(data.total || 0);
      const tp = Math.max(1, Number(data.totalPages) || 1);
      if (page > tp) {
        setPage(tp);
        return;
      }
      setLogs(data.logs || []);
      setStats(data.stats || { total: 0, today: 0, highRisk: 0 });
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
      const text = typeof details === "string" ? details : JSON.stringify(details, null, 2);
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

  // —— 复选框逻辑 ——
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setSelectAll(false);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === logs.length ? [] : logs.map((l) => l.id)));
    setSelectAll((p) => !p);
  };

  // —— 删除：单条 / 批量 / 合规出清 ——
  const executeDelete = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const body: any = {};
      if (confirm.kind === "single" && confirm.ids) body.id = confirm.ids[0];
      else if (confirm.kind === "batch") body.ids = confirm.ids;
      else if (confirm.kind === "purge") body.cleanExpired = true;

      const res = await fetch("/api/admin/operation-logs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "删除失败");
      showSuccess(result.message || "操作成功");
      setConfirm(null);
      setSelectedIds([]);
      setSelectAll(false);
      fetchLogs();
    } catch (err: any) {
      showError(err.message || "删除失败");
    } finally {
      setBusy(false);
    }
  };

  // —— 导出：选中 / 当前筛选 ——
  const handleExport = async (format: "csv" | "json", scope: "selected" | "filtered") => {
    setBusy(true);
    try {
      let rows: OperationLog[] = [];
      if (scope === "selected") {
        rows = logs.filter((l) => selectedIds.includes(l.id));
        if (rows.length === 0) {
          showError("请先勾选要导出的日志");
          setBusy(false);
          return;
        }
      } else {
        // 拉取当前筛选条件下的全部数据（后端支持大 limit）
        const res = await fetch(`/api/admin/operation-logs?${buildQuery({ page: "1", limit: "100000" })}`);
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "导出失败");
        rows = result.data?.logs || [];
      }
      const stamp = new Date().toISOString().slice(0, 10);
      if (format === "csv") {
        triggerDownload(`operation-logs-${stamp}.csv`, buildCsv(rows), "text/csv;charset=utf-8");
      } else {
        triggerDownload(
          `operation-logs-${stamp}.json`,
          JSON.stringify(
            rows.map((r) => ({
              时间: formatTime(r.createdAt),
              操作类型: actionMeta(r.action).label,
              资源域: resourceLabel(r.resource),
              操作描述: describeLog(r),
              操作人: r.user?.name || "未知用户",
              邮箱: r.user?.email || "—",
              IP: r.ipAddress || "—",
              原始详情: r.details ?? {},
            })),
            null,
            2
          ),
          "application/json"
        );
      }
      showSuccess(`已导出 ${rows.length} 条日志（${format.toUpperCase()}）`);
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
      label: "当前页追溯数",
      value: logs.length,
      icon: Database,
      accent: "bg-[#805ad5]/10",
      iconColor: "text-[#805ad5]",
      sub: `当前呈现第 ${page} 页记录`,
    },
  ];

  const allActionOptions = Object.entries(ACTION_META).map(([value, m]) => ({ value, label: m.label }));

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
                全平台操作审计日志中枢 (Audit & Security Logs)
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-[#3182ce] border border-blue-200/80 select-none">
                真实实时溯源
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              全方位追踪记录平台所有特权指令、高危删除、用户处罚与配置变更，保障系统合规与责任闭环
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={fetchLogs}
              disabled={loading || busy}
              className="h-10 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
              <span>刷新审计流</span>
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
        <button
          onClick={() =>
            setConfirm({
              kind: "purge",
              title: "执行 3 年合规出清",
              message:
                "将立即物理删除所有超过 3 年（1095 天）的历史操作审计日志，此操作不可恢复。是否继续？",
            })
          }
          disabled={busy}
          className="shrink-0 h-10 px-4 bg-white/15 hover:bg-white/25 border border-white/30 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>一键执行 3 年合规出清</span>
        </button>
      </div>

      {/* 筛选栏 + 表格 卡片 */}
      <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
        {/* 筛选栏 */}
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
                  <option value="user">用户治理</option>
                  <option value="account">账号安全</option>
                  <option value="workspace">工作空间</option>
                  <option value="component">组件</option>
                  <option value="knowledge">知识库</option>
                  <option value="task">任务</option>
                  <option value="system">系统</option>
                  <option value="membership">会员计费</option>
                  <option value="asset">资料资产</option>
                </select>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 时间区间选择与快捷标签 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-600">时间窗口</label>
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
              <button
                onClick={() => handleExport("csv", "filtered")}
                disabled={busy || loading}
                className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold px-3 h-9 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                title="导出当前筛选结果为 CSV"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>导出CSV</span>
              </button>
              <button
                onClick={() => handleExport("json", "filtered")}
                disabled={busy || loading}
                className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold px-3 h-9 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                title="导出当前筛选结果为 JSON"
              >
                <FileJson className="w-3.5 h-3.5 text-[#3182ce]" />
                <span>导出JSON</span>
              </button>
            </div>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl p-3">
            {error}
          </div>
        )}

        {/* 批量操作浮动栏 */}
        {selectedIds.length > 0 && (
          <div className="mx-6 mt-4 bg-[#3182ce]/5 border border-[#3182ce]/20 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-bold text-[#2b6cb0]">
              <CheckSquare className="w-4 h-4" />
              已勾选 <span className="text-[#3182ce]">{selectedIds.length}</span> 条审计记录
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExport("csv", "selected")}
                disabled={busy}
                className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold px-3 h-8 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>导出选中(CSV)</span>
              </button>
              <button
                onClick={() =>
                  setConfirm({
                    kind: "batch",
                    ids: selectedIds,
                    title: "批量删除审计日志",
                    message: `即将永久删除选中的 ${selectedIds.length} 条操作审计日志，此操作不可恢复。是否继续？`,
                  })
                }
                disabled={busy}
                className="flex items-center gap-1.5 bg-red-50 border border-red-200 hover:bg-red-100 text-red-600 text-xs font-bold px-3 h-8 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>批量删除</span>
              </button>
              <button
                onClick={() => {
                  setSelectedIds([]);
                  setSelectAll(false);
                }}
                className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 text-xs font-bold px-3 h-8 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>取消</span>
              </button>
            </div>
          </div>
        )}

        {/* 表格 */}
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
                  const meta = actionMeta(log.action);
                  const ResIcon = resourceIcon(log.resource);
                  const checked = selectedIds.includes(log.id);
                  return (
                    <tr
                      key={log.id}
                      className={`group hover:bg-white/60 transition-all duration-300 ${
                        checked ? "bg-[#3182ce]/5" : ""
                      }`}
                    >
                      <td className="sticky left-0 z-10 bg-white px-4 py-4">
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
                              className="w-9 h-9 rounded-full"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-xs font-bold shadow-sm">
                              {(log.user?.name || "U").charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <Link
                              href={`/admin/users?search=${encodeURIComponent(log.user?.email || log.user?.name || log.userId)}`}
                              className="text-sm font-bold text-slate-800 hover:text-[#3182ce] hover:underline transition-colors truncate block"
                              title="反查操作人画像"
                            >
                              {log.user?.name || "未知用户"}
                            </Link>
                            <div className="text-xs text-slate-500 font-medium truncate">
                              {log.user?.email || "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                        <div className="flex items-center gap-1.5">
                          <ResIcon className="w-4 h-4 text-slate-400 shrink-0" />
                          <span className="truncate whitespace-nowrap">
                            {resourceLabel(log.resource)}
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
                      <td className="sticky right-0 z-10 bg-white px-6 py-4 text-right min-w-[120px] shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.08)]">
                        <div className="flex items-center justify-end gap-1.5 flex-nowrap">
                          <button
                            onClick={() => setDetailLog(log)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 text-[#3182ce] bg-[#3182ce]/10 hover:bg-[#3182ce]/20 transition-colors"
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
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 分页 */}
        {!loading && total > 0 && (
          <div className="px-6 py-4 border-t border-slate-200 bg-gradient-to-r from-slate-50/50 to-transparent">
            <Pagination
              currentPage={page}
              totalItems={total}
              pageSize={PAGE_SIZE}
              onPageChange={(p) => setPage(p)}
              itemLabel="条操作日志"
            />
          </div>
        )}
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
                  <div className="text-[11px] text-white/75">Audit Trail Detail · {actionMeta(detailLog.action).label}</div>
                </div>
              </div>
              <button onClick={() => setDetailLog(null)} className="text-white/80 hover:text-white transition-colors cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {/* 基本信息 */}
              <Section title="基本信息">
                <Field label="操作类型" value={actionMeta(detailLog.action).label} />
                <Field label="资源域" value={resourceLabel(detailLog.resource)} />
                <Field label="发生时刻" value={formatTime(detailLog.createdAt)} />
                {detailLog.workspaceId && (
                  <Field label="空间标识" value={detailLog.workspaceId} mono />
                )}
              </Section>

              {/* 操作人详情 */}
              <Section title="操作人画像">
                <div className="flex items-center gap-3 mb-3">
                  {detailLog.user?.avatar ? (
                    <img src={detailLog.user.avatar} alt="" className="w-11 h-11 rounded-full" />
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
                <Link
                  href={`/admin/users?search=${encodeURIComponent(detailLog.user?.email || detailLog.user?.name || detailLog.userId)}`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#3182ce] hover:underline"
                >
                  反查操作人画像 →
                </Link>
              </Section>

              {/* 客户端 / 网络环境 */}
              <Section title="客户端与网络环境">
                <Field label="源 IP" value={detailLog.ipAddress || "内网回环 / 未记录"} mono />
                <Field label="操作账号" value={`${detailLog.user?.name || "系统未知"} (${detailLog.user?.email || "未留邮箱"})`} />
              </Section>

              {/* 业务变更字段对比 */}
              <Section title="业务变更字段">
                {(() => {
                  const rows = parseDetails(detailLog.details);
                  if (rows.length === 0) {
                    return <div className="text-xs text-slate-400 p-3 bg-slate-50 rounded-lg">本次操作未记录额外参数</div>;
                  }
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {rows.map((row, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50/80 border border-slate-100 rounded-lg text-xs">
                          <span className="text-slate-400 font-medium shrink-0 mr-3">{row.label}</span>
                          <span className="text-slate-800 font-bold break-all text-right">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </Section>

              {/* 原始请求 JSON */}
              <Section
                title="原始请求 JSON"
                action={
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
                        <span>复制</span>
                      </>
                    )}
                  </button>
                }
              >
                <pre className="text-[11px] leading-relaxed bg-slate-900 text-slate-100 rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-all">
{typeof detailLog.details === "string" ? detailLog.details : JSON.stringify(detailLog.details ?? {}, null, 2)}
                </pre>
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
