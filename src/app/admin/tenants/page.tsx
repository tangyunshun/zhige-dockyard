"use client";

import { useState, useEffect } from "react";
import { Building2, Users, FileText, Search, Activity, CheckCircle, XCircle } from "lucide-react";

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
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}小时前`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}天前`;
    return date.toLocaleDateString("zh-CN");
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">租户管理</h1>
        <p className="text-sm text-slate-500">多租户系统管理与监控</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 font-medium">总租户数</div>
            <Building2 className="w-5 h-5 text-[#3182ce]" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {tenantData?.total || 0}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 font-medium">活跃租户</div>
            <CheckCircle className="w-5 h-5 text-[#10b981]" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {tenantData?.tenants.filter((t) => t.status === "active").length || 0}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 font-medium">总用户数</div>
            <Users className="w-5 h-5 text-[#f59e0b]" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {tenantData?.tenants.reduce((sum, t) => sum + t._count.user, 0) || 0}
          </div>
        </div>
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-slate-500 font-medium">总任务数</div>
            <FileText className="w-5 h-5 text-[#8b5cf6]" />
          </div>
          <div className="text-2xl font-bold text-slate-800">
            {tenantData?.tenants.reduce((sum, t) => sum + t._count.componenttask, 0) || 0}
          </div>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="搜索租户名称..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none"
          >
            <option value="all">全部状态</option>
            <option value="active">活跃</option>
            <option value="inactive">停用</option>
          </select>
        </div>
      </div>

      {/* 列表 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 font-medium">加载租户列表中...</p>
            </div>
          </div>
        ) : tenantData?.tenants.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <Building2 className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p>暂无租户数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    租户信息
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    状态
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    用户数
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    任务数
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                    创建时间
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {tenantData?.tenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {tenant.logo ? (
                          <img
                            src={tenant.logo}
                            alt={tenant.name}
                            className="w-10 h-10 rounded-lg"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-sm font-bold">
                            {tenant.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-bold text-slate-800">
                            {tenant.name}
                          </div>
                          {tenant.description && (
                            <div className="text-xs text-slate-500">
                              {tenant.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(tenant.status)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Users className="w-4 h-4 text-slate-400" />
                        {tenant._count.user}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <FileText className="w-4 h-4 text-slate-400" />
                        {tenant._count.componenttask}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {formatTimeAgo(tenant.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {tenant.status === "active" ? (
                          <button
                            onClick={() => handleStatusChange(tenant.id, "inactive")}
                            className="px-3 py-1 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            停用
                          </button>
                        ) : (
                          <button
                            onClick={() => handleStatusChange(tenant.id, "active")}
                            className="px-3 py-1 text-xs border border-green-200 text-green-600 rounded-lg hover:bg-green-50 transition-colors"
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
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
            <div className="text-sm text-slate-500">
              共 {tenantData.total} 条记录，第 {tenantData.page} /{" "}
              {tenantData.totalPages} 页
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
                  setCurrentPage((p) => Math.min(tenantData.totalPages, p + 1))
                }
                disabled={currentPage === tenantData.totalPages}
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
