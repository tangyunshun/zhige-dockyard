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
  "user:create": { label: "创建用户", color: "bg-emerald-100 text-emerald-700" },
  "user:update": { label: "更新用户", color: "bg-blue-100 text-blue-700" },
  "user:delete": { label: "删除用户", color: "bg-red-100 text-red-700" },
  "user:ban": { label: "封禁用户", color: "bg-red-100 text-red-700" },
  "user:unban": { label: "解封用户", color: "bg-emerald-100 text-emerald-700" },
  "user:reset_session": { label: "重置会话", color: "bg-orange-100 text-orange-700" },
  "component:create": { label: "创建组件", color: "bg-emerald-100 text-emerald-700" },
  "component:update": { label: "更新组件", color: "bg-blue-100 text-blue-700" },
  "component:delete": { label: "删除组件", color: "bg-red-100 text-red-700" },
  "component:execute": { label: "执行组件", color: "bg-purple-100 text-purple-700" },
  "workspace:create": { label: "创建空间", color: "bg-emerald-100 text-emerald-700" },
  "workspace:update": { label: "更新空间", color: "bg-blue-100 text-blue-700" },
  "workspace:delete": { label: "删除空间", color: "bg-red-100 text-red-700" },
  "system:settings": { label: "系统设置", color: "bg-indigo-100 text-indigo-700" },
  "auth:login": { label: "登录", color: "bg-purple-100 text-purple-700" },
  "auth:logout": { label: "登出", color: "bg-slate-100 text-slate-700" },
};

// 筛选下拉与真实 action 值一一对应
const ACTION_OPTIONS = [
  { value: "", label: "全部操作类型" },
  { value: "user:create", label: "创建用户" },
  { value: "user:update", label: "更新用户" },
  { value: "user:delete", label: "删除用户" },
  { value: "user:ban", label: "封禁用户" },
  { value: "user:reset_session", label: "重置会话" },
  { value: "component:create", label: "创建组件" },
  { value: "component:update", label: "更新组件" },
  { value: "component:delete", label: "删除组件" },
  { value: "component:execute", label: "执行组件" },
  { value: "workspace:create", label: "创建空间" },
  { value: "workspace:delete", label: "删除空间" },
  { value: "system:settings", label: "系统设置" },
];

const RESOURCE_OPTIONS = [
  { value: "", label: "全部资源类型" },
  { value: "user", label: "用户" },
  { value: "workspace", label: "工作空间" },
  { value: "component", label: "组件" },
  { value: "system", label: "系统" },
];

// details 字段 → 中文标签（避免暴露无意义的技术字段）
const DETAIL_KEY_LABELS: Record<string, string> = {
  targetUserId: "目标用户 ID",
  id: "ID",
  name: "名称",
  updates: "变更内容",
  reason: "封禁原因",
  bannedUntil: "封禁截止",
  componentId: "组件 ID",
  tokens: "消耗额度",
  updateData: "变更内容",
  status: "状态",
  role: "角色",
};

function actionMeta(action: string) {
  return (
    ACTION_META[action] || {
      label: action || "未知操作",
      color: "bg-slate-100 text-slate-700",
    }
  );
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
  return RESOURCE_LABELS[r] || resource || "—";
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

// 将 details 解析为可读的 [中文标签, 值] 列表，隐藏无意义的技术字段
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
    const label = DETAIL_KEY_LABELS[key] || key;
    let value: string;
    if (val === null || val === undefined) {
      value = "—";
    } else if (typeof val === "object") {
      // 对象（如 updates）展开为子项，便于直接看懂变更
      try {
        value = Object.entries(val as Record<string, any>)
          .map(([k, v]) => `${DETAIL_KEY_LABELS[k] || k}：${formatScalar(v)}`)
          .join("，");
      } catch {
        value = JSON.stringify(val);
      }
    } else {
      value = formatScalar(val);
    }
    rows.push({ label, value });
  }
  return rows;
}

// 标量值格式化（布尔/日期等）
function formatScalar(val: any): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "是" : "否";
  if (val instanceof Date) return formatTime(val.toISOString());
  return String(val);
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
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-slate-600 font-medium">加载中...</p>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
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
                          <td colSpan={6} className="px-6 py-5">
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
