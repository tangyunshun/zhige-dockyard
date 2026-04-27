"use client";

import { useState, useEffect } from "react";
import {
  Building2,
  Users,
  FileText,
  Search,
  Activity,
  CheckCircle,
  XCircle,
} from "lucide-react";

interface Tenant {
  id: string;
  name: string;
  description?: string | null;
  logo?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count: {
    user: number;
    componenttask: number;
  };
}

interface TenantData {
  tenants: Tenant[];
  total: number;
  page: number;
  totalPages: number;
}

export default function AdminTenantsPage() {
  const [tenantData, setTenantData] = useState<TenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadTenants(currentPage);
  }, [currentPage, filterStatus]);

  const loadTenants = async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        ...(filterStatus !== "all" && { status: filterStatus }),
      });

      const res = await fetch(`/api/admin/tenants?${params}`, {
        headers: {
          Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("userId") : ""}`,
        },
      });

      if (!res.ok) throw new Error("加载租户失败");

      const result = await res.json();
      setTenantData(result.data);
    } catch (error) {
      console.error("Load tenants error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("userId") : ""}`,
        },
        body: JSON.stringify({ id, status }),
      });

      if (!res.ok) throw new Error("更新失败");

      await loadTenants(currentPage);
    } catch (error) {
      console.error("Update tenant error:", error);
      alert("更新失败，请重试");
    }
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, string> = {
      active: "bg-green-100 text-green-700",
      inactive: "bg-slate-100 text-slate-700",
    };

    const labels: Record<string, string> = {
      active: "活跃",
      inactive: "停用",
    };

    return (
      <span
        className={`px-3 py-1 rounded-full text-xs font-bold ${badges[status] || "bg-slate-100 text-slate-700"}`}
      >
        {labels[status] || status}
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
    <div className="min-h-screen bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff] pb-8">
      {/* 页面标题 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm p-6 overflow-hidden">
        <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>
        <div className="relative">
          <h1 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">
            租户管理
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            多租户系统管理与监控
          </p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#3182ce]/10 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <Activity className="w-5 h-5 text-[#3182ce]" />
            </div>
            <div className="text-sm text-slate-500 font-semibold mb-1">
              总租户数
            </div>
            <div className="text-3xl font-black text-slate-800 tracking-tight">
              {tenantData?.total || 0}
            </div>
          </div>
        </div>
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#10b981]/10 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-sm">
                <CheckCircle className="w-6 h-6 text-white" />
              </div>
              <Activity className="w-5 h-5 text-[#10b981]" />
            </div>
            <div className="text-sm text-slate-500 font-semibold mb-1">
              活跃租户
            </div>
            <div className="text-3xl font-black text-slate-800 tracking-tight">
              {tenantData?.tenants.filter((t) => t.status === "active")
                .length || 0}
            </div>
          </div>
        </div>
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#f59e0b]/10 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-sm">
                <Users className="w-6 h-6 text-white" />
              </div>
              <Activity className="w-5 h-5 text-[#f59e0b]" />
            </div>
            <div className="text-sm text-slate-500 font-semibold mb-1">
              总用户数
            </div>
            <div className="text-3xl font-black text-slate-800 tracking-tight">
              {tenantData?.tenants.reduce((sum, t) => sum + t._count.user, 0) ||
                0}
            </div>
          </div>
        </div>
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#8b5cf6]/10 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-sm">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <Activity className="w-5 h-5 text-[#8b5cf6]" />
            </div>
            <div className="text-sm text-slate-500 font-semibold mb-1">
              总任务数
            </div>
            <div className="text-3xl font-black text-slate-800 tracking-tight">
              {tenantData?.tenants.reduce(
                (sum, t) => sum + t._count.componenttask,
                0,
              ) || 0}
            </div>
          </div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm p-6 overflow-hidden">
        <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>
        <div className="relative flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索租户名称..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
          >
            <option value="all">全部状态</option>
            <option value="active">活跃</option>
            <option value="inactive">停用</option>
          </select>
        </div>
      </div>

      {/* 列表 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
        <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 font-medium">加载租户列表中...</p>
            </div>
          </div>
        ) : tenantData?.tenants.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Building2 className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-500 font-medium text-sm">暂无租户数据</p>
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    租户信息
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    状态
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    用户数
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    任务数
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    创建时间
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tenantData?.tenants.map((tenant) => (
                  <tr
                    key={tenant.id}
                    className="group hover:bg-white/60 transition-all duration-300"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {tenant.logo ? (
                          <img
                            src={tenant.logo}
                            alt={tenant.name}
                            className="w-10 h-10 rounded-xl shadow-sm group-hover:scale-110 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-sm font-bold shadow-sm group-hover:scale-110 transition-transform duration-300">
                            {tenant.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                            {tenant.name}
                          </div>
                          {tenant.description && (
                            <div className="text-xs text-slate-500 font-medium mt-0.5">
                              {tenant.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                          tenant.status === "active"
                            ? "bg-gradient-to-r from-[#10b981]/10 to-[#059669]/10 text-[#10b981] shadow-sm"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {tenant.status === "active" ? "活跃" : "停用"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                        <Users className="w-4 h-4 text-slate-400" />
                        <span className="font-bold text-slate-700">
                          {tenant._count.user}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                        <FileText className="w-4 h-4 text-slate-400" />
                        <span className="font-bold text-slate-700">
                          {tenant._count.componenttask}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600 font-medium">
                      {formatTimeAgo(tenant.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {tenant.status === "active" ? (
                          <button
                            onClick={() =>
                              handleStatusChange(tenant.id, "inactive")
                            }
                            className="px-4 h-10 text-xs font-bold border border-red-200 text-red-600 rounded-xl hover:bg-red-50 hover:border-red-300 transition-all duration-300"
                          >
                            停用
                          </button>
                        ) : (
                          <button
                            onClick={() =>
                              handleStatusChange(tenant.id, "active")
                            }
                            className="px-4 h-10 text-xs font-bold border border-green-200 text-green-600 rounded-xl hover:bg-green-50 hover:border-green-300 transition-all duration-300"
                          >
                            激活
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {tenantData && tenantData.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between">
            <div className="text-sm text-slate-600 font-medium">
              共{" "}
              <span className="font-bold text-[#3182ce]">
                {tenantData.total}
              </span>{" "}
              条记录，第{" "}
              <span className="font-bold text-[#3182ce]">
                {tenantData.page}
              </span>{" "}
              / {tenantData.totalPages} 页
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 h-10 text-sm font-bold border border-slate-200 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 hover:border-[#3182ce] transition-all duration-300"
              >
                上一页
              </button>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(tenantData.totalPages, p + 1))
                }
                disabled={currentPage === tenantData.totalPages}
                className="px-4 h-10 text-sm font-bold border border-slate-200 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 hover:border-[#3182ce] transition-all duration-300"
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
