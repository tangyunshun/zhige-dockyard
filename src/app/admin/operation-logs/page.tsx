"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
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
} from "lucide-react";

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
const ACTION_META: Record<string, { label: string; color: string }> = {
  // 用户相关
  "user:create": { label: "创建用户", color: "bg-emerald-100 text-emerald-700" },
  "user:update": { label: "更新用户", color: "bg-blue-100 text-blue-700" },
  "user:delete": { label: "删除用户", color: "bg-red-100 text-red-700" },
  "user:ban": { label: "封禁用户", color: "bg-red-100 text-red-700" },
  "user:unban": { label: "解封用户", color: "bg-emerald-100 text-emerald-700" },
  "user:reset_session": { label: "重置会话", color: "bg-orange-100 text-orange-700" },
  // 组件相关
  "component:create": { label: "创建组件", color: "bg-emerald-100 text-emerald-700" },
  "component:update": { label: "更新组件", color: "bg-blue-100 text-blue-700" },
  "component:delete": { label: "删除组件", color: "bg-red-100 text-red-700" },
  "component:execute": { label: "执行组件", color: "bg-purple-100 text-purple-700" },
  "BIND_COMPONENT": { label: "绑定组件", color: "bg-blue-100 text-blue-700" },
  "UNBIND_COMPONENT": { label: "解绑组件", color: "bg-orange-100 text-orange-700" },
  // 工作空间相关
  "workspace:create": { label: "创建空间", color: "bg-emerald-100 text-emerald-700" },
  "workspace:update": { label: "更新空间", color: "bg-blue-100 text-blue-700" },
  "workspace:delete": { label: "删除空间", color: "bg-red-100 text-red-700" },
  "JOIN_WORKSPACE": { label: "加入空间", color: "bg-emerald-100 text-emerald-700" },
  "CREATE_ENTERPRISE_WORKSPACE": { label: "创建企业空间", color: "bg-indigo-100 text-indigo-700" },
  "LEAVE_WORKSPACE": { label: "退出空间", color: "bg-orange-100 text-orange-700" },
  // 系统 / 认证
  "system:settings": { label: "系统设置", color: "bg-indigo-100 text-indigo-700" },
  "auth:login": { label: "登录", color: "bg-purple-100 text-purple-700" },
  "auth:logout": { label: "登出", color: "bg-slate-100 text-slate-700" },
};

// 未知英文 action 的兜底翻译（避免直接暴露原始英文串）
const ACTION_FALLBACK_LABELS: Record<string, string> = {
  BIND_COMPONENT: "绑定组件",
  UNBIND_COMPONENT: "解绑组件",
  JOIN_WORKSPACE: "加入空间",
  LEAVE_WORKSPACE: "退出空间",
  CREATE_ENTERPRISE_WORKSPACE: "创建企业空间",
  CREATE_WORKSPACE: "创建空间",
  INVITE_MEMBER: "邀请成员",
  REMOVE_MEMBER: "移除成员",
};

// 筛选下拉与真实 action 值一一对应
const ACTION_OPTIONS = [
  { value: "", label: "全部操作类型" },
  { value: "user:create", label: "创建用户" },
  { value: "user:update", label: "更新用户" },
  { value: "user:delete", label: "删除用户" },
  { value: "user:ban", label: "封禁用户" },
  { value: "user:unban", label: "解封用户" },
  { value: "user:reset_session", label: "重置会话" },
  { value: "component:create", label: "创建组件" },
  { value: "component:update", label: "更新组件" },
  { value: "component:delete", label: "删除组件" },
  { value: "component:execute", label: "执行组件" },
  { value: "BIND_COMPONENT", label: "绑定组件" },
  { value: "UNBIND_COMPONENT", label: "解绑组件" },
  { value: "JOIN_WORKSPACE", label: "加入空间" },
  { value: "CREATE_ENTERPRISE_WORKSPACE", label: "创建企业空间" },
  { value: "LEAVE_WORKSPACE", label: "退出空间" },
  { value: "workspace:create", label: "创建空间" },
  { value: "workspace:update", label: "更新空间" },
  { value: "workspace:delete", label: "删除空间" },
  { value: "system:settings", label: "系统设置" },
  { value: "auth:login", label: "登录" },
  { value: "auth:logout", label: "登出" },
];

const RESOURCE_OPTIONS = [
  { value: "", label: "全部资源类型" },
  { value: "user", label: "用户" },
  { value: "workspace", label: "工作空间" },
  { value: "component", label: "组件" },
  { value: "system", label: "系统" },
];

function actionMeta(action: string) {
  if (ACTION_META[action]) return ACTION_META[action];
  // 未收录的英文 action 一律给出中文兜底，绝不原样显示英文
  const label = ACTION_FALLBACK_LABELS[action] || "其他操作";
  return { label, color: "bg-slate-100 text-slate-700" };
}

function resourceIcon(resource: string | null) {
  const r = (resource || "").toLowerCase();
  if (r.includes("user")) return UserIcon;
  if (r.includes("workspace") || r.includes("space")) return LayoutDashboard;
  if (r.includes("component") || r.includes("comp")) return Box;
  if (r.includes("data") || r.includes("log")) return Database;
  return Box;
}

const RESOURCE_LABELS: Record<string, string> = {
  user: "用户",
  workspace: "工作空间",
  component: "组件",
  system: "系统",
};

function resourceLabel(resource: string | null) {
  const r = (resource || "").toLowerCase();
  if (RESOURCE_LABELS[r]) return RESOURCE_LABELS[r];
  // resource 可能是原始 ID（如 BIND_COMPONENT 存的是 componentId），按前缀/格式判断归类
  if (r.includes("workspace")) return "工作空间";
  if (r.includes("user")) return "用户";
  if (r.includes("component") || /^[0-9a-f]{8}-/.test(r)) return "组件";
  if (r.includes("system")) return "系统";
  return "其他";
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
  // 工作空间成员角色（含大小写变体）
  member: "成员",
  owner: "拥有者",
  viewer: "访客",
  component_manager: "组件管理员",
  knowledge_manager: "知识库管理员",
  componentmanager: "组件管理员",
  knowledgemanager: "知识库管理员",
};

const SYSTEM_ACTION_LABELS: Record<string, string> = {
  CONFIGURE_ADMIN_PERMISSIONS: "配置管理员权限",
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
        label = "系统动作"; value = SYSTEM_ACTION_LABELS[val as string] || String(val);
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
      case "boundAt":
        label = "绑定时间"; value = formatTime(String(val));
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
    case "JOIN_WORKSPACE":
      return `加入工作空间「${get("工作空间")}」${get("角色") ? `（角色：${get("角色")}）` : ""}`;
    case "LEAVE_WORKSPACE":
      return `退出工作空间${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "CREATE_ENTERPRISE_WORKSPACE":
      return `创建企业工作空间「${get("工作空间")}」${get("套餐") ? `（套餐：${get("套餐")}）` : ""}`;
    case "BIND_COMPONENT":
      return `将组件绑定到工作空间${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "UNBIND_COMPONENT":
      return `将组件从工作空间解绑${get("工作空间") ? `「${get("工作空间")}」` : ""}`;
    case "system:settings":
      return get("系统动作") || "系统设置变更";
    case "auth:login":
      return "管理员登录";
    case "auth:logout":
      return "管理员登出";
    default:
      return resourceLabel(log.resource) + "相关操作";
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

export default function OperationLogsPage() {
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, today: 0, highRisk: 0 });

  // 筛选条件
  const [action, setAction] = useState("");
  const [userKeyword, setUserKeyword] = useState("");
  const [resource, setResource] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // 展开的详情行
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "15");
      if (action) params.set("action", action);
      if (userKeyword.trim()) params.set("user", userKeyword.trim());
      if (resource) params.set("resource", resource);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);

      const response = await fetch(
        `/api/admin/operation-logs?${params.toString()}`,
      );
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "获取操作日志失败");
      }

      const data = result.data;
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
      setStats(data.stats || { total: 0, today: 0, highRisk: 0 });
    } catch (err: any) {
      setError(err.message || "获取操作日志失败");
    } finally {
      setLoading(false);
    }
  }, [page, action, userKeyword, resource, startDate, endDate]);

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

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const statsCards = [
    {
      label: "日志总量",
      value: stats.total,
      icon: ScrollText,
      accent: "bg-[#3182ce]/10",
      iconColor: "text-[#3182ce]",
    },
    {
      label: "今日操作",
      value: stats.today,
      icon: Clock,
      accent: "bg-[#10b981]/10",
      iconColor: "text-[#10b981]",
    },
    {
      label: "高危删除",
      value: stats.highRisk,
      icon: Trash2,
      accent: "bg-[#ef4444]/10",
      iconColor: "text-[#ef4444]",
    },
  ];

  return (
    <div className="space-y-6 pb-8">
      {/* 页面标题 */}
      <div className="mb-2">
        <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">
          审计日志
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          记录平台所有高危与管理操作，便于安全审计与追溯
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statsCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
            >
              <div
                className={`absolute -right-4 -top-4 w-24 h-24 rounded-full ${card.accent} opacity-20 blur-2xl`}
              ></div>
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-slate-500 font-semibold">
                    {card.label}
                  </div>
                  <Icon className={`w-6 h-6 ${card.iconColor}`} />
                </div>
                <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                  {loading ? "—" : card.value}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 筛选栏 + 表格 卡片 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
        <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>

        {/* 筛选栏 */}
        <div className="relative p-6 border-b border-slate-200">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 操作类型 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 font-medium">
                操作类型
              </label>
              <div className="relative">
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="w-full appearance-none border border-slate-200 rounded-xl px-4 py-2.5 pr-9 text-sm text-slate-700 bg-white/80 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
                >
                  {ACTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 操作用户 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 font-medium">
                操作人（用户名 / 邮箱）
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userKeyword}
                  onChange={(e) => setUserKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="输入用户名或邮箱搜索"
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 bg-white/80 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
                />
              </div>
            </div>

            {/* 资源类型 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 font-medium">
                资源类型
              </label>
              <div className="relative">
                <select
                  value={resource}
                  onChange={(e) => setResource(e.target.value)}
                  className="w-full appearance-none border border-slate-200 rounded-xl px-4 py-2.5 pr-9 text-sm text-slate-700 bg-white/80 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
                >
                  {RESOURCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* 开始日期 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 font-medium">
                开始日期
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 bg-white/80 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
                />
              </div>
            </div>

            {/* 结束日期 */}
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 font-medium">
                结束日期
              </label>
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-700 bg-white/80 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="flex items-center gap-1.5 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:shadow-md hover:-translate-y-0.5 disabled:opacity-50 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all"
            >
              <Search className="w-4 h-4" />
              查询
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-medium px-5 py-2.5 rounded-xl transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              重置
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3">
            {error}
          </div>
        )}

        {/* 表格 */}
        <div className="relative overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  操作类型
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  操作人
                </th>
                <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
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
                <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  详情
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
                    <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600 font-medium">加载中...</p>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-20 text-center">
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
                  const isExpanded = expandedId === log.id;
                  return (
                    <Fragment key={log.id}>
                      <tr
                        className={`group hover:bg-white/60 transition-all duration-300 ${
                          isExpanded ? "bg-white/60" : ""
                        }`}
                      >
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold ${meta.color}`}
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
                              <div className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate">
                                {log.user?.name || "未知用户"}
                              </div>
                              <div className="text-xs text-slate-500 font-medium truncate">
                                {log.user?.email || "—"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                          <div className="flex items-center gap-1.5">
                            <ResIcon className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="truncate">
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
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => toggleExpand(log.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#3182ce] bg-[#3182ce]/10 hover:bg-[#3182ce]/20 transition-colors"
                          >
                            {isExpanded ? "收起" : "查看"}
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={7} className="px-6 py-5">
                            <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-sm">
                              <span className="text-slate-400">
                                操作人：
                                <span className="text-slate-700 font-medium">
                                  {log.user?.name || "未知用户"}
                                </span>
                              </span>
                              <span className="text-slate-400">
                                操作时间：
                                <span className="text-slate-700">
                                  {formatTime(log.createdAt)}
                                </span>
                              </span>
                              {log.workspaceId && (
                                <span className="text-slate-400">
                                  工作空间 ID：
                                  <span className="text-slate-700 font-mono text-xs">
                                    {log.workspaceId}
                                  </span>
                                </span>
                              )}
                            </div>

                            <span className="text-slate-400 block mb-2 text-sm">
                              操作详情：
                            </span>
                            {(() => {
                              const rows = parseDetails(log.details);
                              if (rows.length === 0) {
                                return (
                                  <div className="text-sm text-slate-500">
                                    本次操作未记录更多详情
                                  </div>
                                );
                              }
                              return (
                                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                                  {rows.map((row, idx) => (
                                    <div
                                      key={idx}
                                      className="flex gap-4 px-4 py-2.5 text-sm"
                                    >
                                      <span className="w-28 shrink-0 text-slate-400">
                                        {row.label}
                                      </span>
                                      <span className="text-slate-700 break-all">
                                        {row.value}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })()}
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

        {/* 分页 */}
        {!loading && totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-gradient-to-r from-slate-50/50 to-transparent">
            <div className="text-sm text-slate-500">
              共 {total} 条记录，第 {page} / {totalPages} 页
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
              >
                上一页
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
              >
                下一页
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
