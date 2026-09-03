"use client";

import { useState, useEffect } from "react";
import { getAuthToken } from "@/utils/auth";
import {
  Search,
  FileText,
  Shield,
  Activity,
  Clock,
  MapPin,
  Monitor,
  AlertCircle,
} from "lucide-react";

interface OperationLog {
  id: string;
  userId: string;
  workspaceId?: string | null;
  action: string;
  resource?: string | null;
  details?: any;
  ipAddress?: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatar?: string | null;
    role: string;
  };
}

interface LoginHistory {
  id: string;
  userId: string;
  loginAt: string;
  ipAddress?: string | null;
  location?: string | null;
  device?: string | null;
  userAgent?: string | null;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatar?: string | null;
    role: string;
  };
}

interface LogData {
  logs?: OperationLog[];
  histories?: LoginHistory[];
  total: number;
  page: number;
  totalPages: number;
}

export default function AdminLogsPage() {
  const [logData, setLogData] = useState<LogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"operation" | "login">(
    "operation",
  );

  useEffect(() => {
    if (activeTab === "operation") {
      loadOperationLogs(currentPage);
    } else {
      loadLoginHistories(currentPage);
    }
  }, [currentPage, filterAction, activeTab]);

  const loadOperationLogs = async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        ...(filterAction !== "all" && { action: filterAction }),
      });

      const res = await fetch(`/api/admin/operation-logs?${params}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: "include",
      });

      if (!res.ok) throw new Error("加载日志失败");

      const result = await res.json();
      setLogData(result.data);
    } catch (error) {
      console.error("Load logs error:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadLoginHistories = async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
      });

      const res = await fetch(`/api/admin/login-histories?${params}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: "include",
      });

      if (!res.ok) throw new Error("加载登录历史失败");

      const result = await res.json();
      setLogData(result.data);
    } catch (error) {
      console.error("Load login histories error:", error);
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action: string) => {
    const colors: Record<string, string> = {
      CREATE: "bg-emerald-100 text-emerald-600",
      UPDATE: "bg-blue-100 text-[#2b6cb0]",
      DELETE: "bg-red-100 text-red-600",
      LOGIN: "bg-purple-100 text-[#805ad5]",
      LOGOUT: "bg-gray-100 text-gray-700",
    };

    const colorClass = colors[action] || "bg-slate-100 text-slate-700";
    return (
      <span className={`px-2 py-1 rounded-md text-xs font-bold ${colorClass}`}>
        {action}
      </span>
    );
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return "刚刚";
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}分钟前`;
    if (diffInSeconds < 86400)
      return `${Math.floor(diffInSeconds / 3600)}小时前`;
    if (diffInSeconds < 604800)
      return `${Math.floor(diffInSeconds / 86400)}天前`;
    return date.toLocaleDateString("zh-CN");
  };

  return (
    <div className="space-y-6 pb-8">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">
          系统日志
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          用户操作记录、登录历史、安全审计 · 知阁·舟坊
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#3182ce]/10 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-500 font-semibold">
                总操作数
              </div>
              <Activity className="w-6 h-6 text-[#3182ce]" />
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
              {logData?.total || 0}
            </div>
          </div>
        </div>
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#10b981]/10 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-500 font-semibold">
                今日操作
              </div>
              <FileText className="w-6 h-6 text-[#10b981]" />
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
              --
            </div>
          </div>
        </div>
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#ef4444]/10 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-500 font-semibold">
                异常操作
              </div>
              <AlertCircle className="w-6 h-6 text-[#ef4444]" />
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
              0
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
        <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>

        <div className="relative flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab("operation")}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all ${
              activeTab === "operation"
                ? "text-[#3182ce] border-b-2 border-[#3182ce] bg-[#3182ce]/5"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Shield className="w-4 h-4" />
            操作日志
          </button>
          <button
            onClick={() => setActiveTab("login")}
            className={`flex items-center gap-2 px-6 py-4 text-sm font-bold transition-all ${
              activeTab === "login"
                ? "text-[#3182ce] border-b-2 border-[#3182ce] bg-[#3182ce]/5"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Clock className="w-4 h-4" />
            登录历史
          </button>
        </div>

        {/* 筛选栏 */}
        <div className="relative p-6 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="搜索用户、操作..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
              />
            </div>
            {activeTab === "operation" && (
              <select
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                className="px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80"
              >
                <option value="all">全部操作</option>
                <option value="CREATE">创建</option>
                <option value="UPDATE">更新</option>
                <option value="DELETE">删除</option>
                <option value="LOGIN">登录</option>
                <option value="LOGOUT">登出</option>
              </select>
            )}
          </div>
        </div>

        {/* 表格 */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 font-medium">加载日志中...</p>
            </div>
          </div>
        ) : activeTab === "operation" ? (
          <div className="relative overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    用户
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    操作类型
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    资源
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    IP 地址
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    时间
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logData?.logs?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-20 text-center">
                      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                        <FileText className="w-8 h-8 text-slate-400" />
                      </div>
                      <p className="text-slate-500 font-medium text-sm">
                        暂无操作日志
                      </p>
                    </td>
                  </tr>
                ) : (
                  logData?.logs?.map((log) => (
                    <tr
                      key={log.id}
                      className="group hover:bg-white/60 transition-all duration-300"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {log.user.avatar ? (
                            <img
                              src={log.user.avatar}
                              alt={log.user.name || ""}
                              className="w-9 h-9 rounded-full"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-xs font-bold shadow-sm">
                              {log.user.name?.charAt(0) ||
                                log.user.email?.charAt(0) ||
                                "?"}
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                              {log.user.name || "未知用户"}
                            </div>
                            <div className="text-xs text-slate-500 font-medium">
                              {log.user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getActionBadge(log.action)}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                        {log.resource || "-"}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                        {log.ipAddress || "-"}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                        {formatTimeAgo(log.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    用户
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    登录时间
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    IP 地址
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    地点
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    设备
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logData?.histories?.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-20 text-center">
                      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                        <Clock className="w-8 h-8 text-slate-400" />
                      </div>
                      <p className="text-slate-500 font-medium text-sm">
                        暂无登录历史
                      </p>
                    </td>
                  </tr>
                ) : (
                  logData?.histories?.map((history: any) => (
                    <tr
                      key={history.id}
                      className="group hover:bg-white/60 transition-all duration-300"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          {history.user.avatar ? (
                            <img
                              src={history.user.avatar}
                              alt={history.user.name || ""}
                              className="w-8 h-8 rounded-full"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-xs font-bold">
                              {history.user.name?.charAt(0) ||
                                history.user.email?.charAt(0) ||
                                "?"}
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-bold text-slate-800">
                              {history.user.name || "未知用户"}
                            </div>
                            <div className="text-xs text-slate-500">
                              {history.user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-400" />
                          {formatTimeAgo(history.loginAt)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {history.ipAddress || "-"}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-slate-400" />
                          {history.location || "未知"}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        <div className="flex items-center gap-2">
                          <Monitor className="w-4 h-4 text-slate-400" />
                          {history.device || "未知"}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {logData && logData.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <div className="text-sm text-slate-500">
              共 {logData.total} 条记录，第 {logData.page} /{" "}
              {logData.totalPages} 页
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                上一页
              </button>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(logData.totalPages, p + 1))
                }
                disabled={currentPage === logData.totalPages}
                className="px-4 py-2 text-sm border border-slate-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
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
