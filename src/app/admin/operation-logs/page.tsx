"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
  ArrowLeft,
  Search,
  Activity,
  User,
  Calendar,
  FileText,
  Cpu,
  Database,
  Settings,
  LogOut,
  Upload,
  Download,
  Trash,
  Edit,
  Plus,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface OperationLog {
  id: string;
  userId: string;
  workspaceId: string | null;
  action: string;
  resource: string | null;
  details: any;
  ipAddress: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
    avatar: string | null;
    role: string;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminOperationLogsPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [filters, setFilters] = useState({
    action: "",
    userId: "",
  });

  useEffect(() => {
    loadLogs();
  }, [pagination.page, filters]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        ...(filters.action && { action: filters.action }),
        ...(filters.userId && { userId: filters.userId }),
      });

      const res = await fetch(`/api/admin/operation-logs?${params}`, {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.data.logs);
        setPagination(data.data.pagination || data.data);
      } else {
        const error = await res.json();
        console.error("Load logs error:", error);
        toast.error(error.message || "加载日志失败");
      }
    } catch (error) {
      console.error("Load logs error:", error);
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (action: string) => {
    const iconMap: Record<string, any> = {
      CREATE: Plus,
      UPDATE: Edit,
      DELETE: Trash,
      LOGIN: LogOut,
      LOGOUT: LogOut,
      UPLOAD: Upload,
      DOWNLOAD: Download,
      EXPORT: Download,
      IMPORT: Upload,
      APPROVE: CheckCircle,
      REJECT: XCircle,
    };
    return iconMap[action] || Activity;
  };

  const getActionColor = (action: string) => {
    const colorMap: Record<string, string> = {
      CREATE: "text-green-600 bg-green-50",
      UPDATE: "text-blue-600 bg-blue-50",
      DELETE: "text-red-600 bg-red-50",
      LOGIN: "text-purple-600 bg-purple-50",
      LOGOUT: "text-gray-600 bg-gray-50",
      UPLOAD: "text-orange-600 bg-orange-50",
      DOWNLOAD: "text-cyan-600 bg-cyan-50",
      EXPORT: "text-indigo-600 bg-indigo-50",
      IMPORT: "text-pink-600 bg-pink-50",
      APPROVE: "text-emerald-600 bg-emerald-50",
      REJECT: "text-rose-600 bg-rose-50",
    };
    return colorMap[action] || "text-slate-600 bg-slate-50";
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

  const getResourceIcon = (resource: string | null) => {
    if (!resource) return FileText;
    if (resource.includes("user")) return User;
    if (resource.includes("workspace")) return Settings;
    if (resource.includes("component")) return Cpu;
    if (resource.includes("data")) return Database;
    return FileText;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff]">
      {/* 顶部导航 */}
      <div className="bg-white/80 backdrop-blur-xl border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-colors font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              返回
            </button>
            <h1 className="text-xl font-bold text-slate-800">操作日志</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-500 font-semibold mb-1">
                  总日志数
                </div>
                <div className="text-3xl font-black text-slate-800">
                  {pagination.total}
                </div>
              </div>
              <Activity className="w-12 h-12 text-[#3182ce] opacity-20" />
            </div>
          </div>
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-500 font-semibold mb-1">
                  今日操作
                </div>
                <div className="text-3xl font-black text-slate-800">
                  {
                    logs.filter(
                      (log) =>
                        new Date(log.createdAt).toDateString() ===
                        new Date().toDateString(),
                    ).length
                  }
                </div>
              </div>
              <Calendar className="w-12 h-12 text-green-600 opacity-20" />
            </div>
          </div>
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-slate-500 font-semibold mb-1">
                  当前页
                </div>
                <div className="text-3xl font-black text-slate-800">
                  {pagination.page} / {pagination.totalPages}
                </div>
              </div>
              <FileText className="w-12 h-12 text-purple-600 opacity-20" />
            </div>
          </div>
        </div>

        {/* 筛选栏 */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm p-6 mb-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="搜索操作类型..."
                value={filters.action}
                onChange={(e) =>
                  setFilters({ ...filters, action: e.target.value })
                }
                className="w-full px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="搜索用户 ID..."
                value={filters.userId}
                onChange={(e) =>
                  setFilters({ ...filters, userId: e.target.value })
                }
                className="w-full px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
              />
            </div>
            <button
              onClick={() => {
                setFilters({ action: "", userId: "" });
                setPagination({ ...pagination, page: 1 });
              }}
              className="px-6 h-11 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
            >
              重置
            </button>
          </div>
        </div>

        {/* 日志列表 */}
        {loading ? (
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm p-12 overflow-hidden">
            <div className="flex items-center justify-center">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-slate-600 font-medium">加载日志数据中...</p>
              </div>
            </div>
          </div>
        ) : logs.length === 0 ? (
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm p-12 overflow-hidden">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <Activity className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-500 font-medium text-sm">暂无日志数据</p>
            </div>
          </div>
        ) : (
          <>
            <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full table-auto">
                  <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        操作类型
                      </th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                        用户
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.map((log) => {
                      const ActionIcon = getActionIcon(log.action);
                      const ResourceIcon = getResourceIcon(log.resource);
                      const actionColor = getActionColor(log.action);

                      return (
                        <tr
                          key={log.id}
                          className="group hover:bg-white/60 transition-all duration-300"
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center ${actionColor}`}
                              >
                                <ActionIcon className="w-5 h-5" />
                              </div>
                              <div>
                                <div className="font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                                  {log.action}
                                </div>
                                {log.details && (
                                  <div className="text-xs text-slate-500 mt-1 font-medium truncate max-w-[200px]">
                                    {JSON.stringify(log.details).slice(0, 50)}
                                    {JSON.stringify(log.details).length > 50
                                      ? "..."
                                      : ""}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 shrink-0 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold text-xs">
                                {log.user.name?.[0]?.toUpperCase() || "U"}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold text-slate-800 text-sm truncate max-w-[150px]">
                                  {log.user.name || "匿名用户"}
                                </div>
                                <div className="text-xs text-slate-500 font-medium truncate max-w-[150px]">
                                  {log.user.email || "无邮箱"}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <ResourceIcon className="w-4 h-4 shrink-0" />
                              <span className="truncate max-w-[200px]">
                                {log.resource || "-"}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 font-mono">
                            {log.ipAddress || "-"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Calendar className="w-4 h-4 shrink-0" />
                              <span>{formatTimeAgo(log.createdAt)}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 分页 */}
            {pagination.totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm px-6 py-4">
                <div className="text-sm text-slate-500 font-medium">
                  共 {pagination.total} 条记录，第 {pagination.page} /{" "}
                  {pagination.totalPages} 页
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      setPagination({
                        ...pagination,
                        page: Math.max(1, pagination.page - 1),
                      })
                    }
                    disabled={pagination.page === 1}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() =>
                      setPagination({
                        ...pagination,
                        page: Math.min(
                          pagination.totalPages,
                          pagination.page + 1,
                        ),
                      })
                    }
                    disabled={pagination.page === pagination.totalPages}
                    className="px-4 py-2 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white rounded-xl text-sm font-semibold hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
