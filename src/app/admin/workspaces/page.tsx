"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Filter,
  Building2,
  Users,
  Trash2,
  Eye,
  AlertCircle,
} from "lucide-react";

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  ownerId: string;
  description: string | null;
  logo: string | null;
  createdAt: string;
  members: Array<{
    id: string;
    role: string;
    user: { name: string | null; email: string | null };
  }>;
  _count: { members: number };
}

interface WorkspaceData {
  workspaces: Workspace[];
  total: number;
  page: number;
  totalPages: number;
}

export default function AdminWorkspacesPage() {
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadWorkspaces(currentPage);
  }, [currentPage, filterType]);

  const loadWorkspaces = async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "20",
        ...(searchQuery && { search: searchQuery }),
        ...(filterType !== "all" && { type: filterType }),
      });

      const res = await fetch(`/api/admin/workspaces?${params}`, {
        headers: {
          Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("userId") : ""}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "加载工作空间列表失败");
      }

      const result = await res.json();
      setWorkspaceData(result.data);
    } catch (error) {
      console.error("Load workspaces error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    loadWorkspaces(1);
  };

  const handleDelete = async (workspaceId: string) => {
    if (!confirm("确定要删除该工作空间吗？此操作不可恢复！")) return;

    try {
      setDeletingId(workspaceId);
      const res = await fetch(
        `/api/admin/workspaces?workspaceId=${workspaceId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("userId") : ""}`,
          },
        },
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "删除失败");
      }

      showToast("工作空间已删除", "success");
      loadWorkspaces(currentPage);
    } catch (error) {
      console.error("Delete workspace error:", error);
      showToast("删除失败", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const handleView = (workspace: Workspace) => {
    router.push(`/workspace/${workspace.id}`);
  };

  const showToast = (message: string, type: "success" | "error") => {
    const container = document.getElementById("zg-toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `zg-toast ${type === "success" ? "show" : ""}`;
    toast.innerHTML = `
      <span class="${type === "success" ? "text-green-600" : "text-red-600"} font-bold">
        ${type === "success" ? "✓" : "✕"}
      </span>
      <span class="text-sm font-medium text-slate-700">${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "刚刚";
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  };

  return (
    <div className="space-y-6">
      {/* Toast 容器 */}
      <div
        id="zg-toast-container"
        className="fixed top-24 left-1/2 -translate-x-1/2 z-50"
      ></div>

      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">工作空间管理</h1>
        <p className="text-sm text-slate-500">
          审核工作空间、管理资源配额、查看空间统计
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-[#3182ce]/10 flex items-center justify-center">
              <Building2 className="w-6 h-6 text-[#3182ce]" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800 mb-1">
            {workspaceData?.total || 0}
          </div>
          <div className="text-sm text-slate-500 font-medium">总工作空间数</div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-[#10b981]/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-[#10b981]" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800 mb-1">
            {workspaceData?.workspaces.reduce(
              (sum, ws) => sum + ws._count.members,
              0,
            ) || 0}
          </div>
          <div className="text-sm text-slate-500 font-medium">总成员数</div>
        </div>

        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 rounded-lg bg-[#f59e0b]/10 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-[#f59e0b]" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-800 mb-1">0</div>
          <div className="text-sm text-slate-500 font-medium">待审核空间</div>
        </div>
      </div>

      {/* 筛选工具栏 */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="搜索工作空间名称..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none text-sm"
          >
            <option value="all">所有类型</option>
            <option value="PERSONAL">个人空间</option>
            <option value="ENTERPRISE">企业空间</option>
          </select>
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-[#3182ce] text-white rounded-lg hover:bg-[#2563eb] transition-colors flex items-center gap-2"
          >
            <Filter className="w-4 h-4" />
            筛选
          </button>
        </div>
      </div>

      {/* 工作空间列表 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      工作空间
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      类型
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                      成员数
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
                  {workspaceData?.workspaces.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-6 py-20 text-center text-slate-400"
                      >
                        暂无工作空间数据
                      </td>
                    </tr>
                  ) : (
                    workspaceData?.workspaces.map((workspace) => (
                      <tr
                        key={workspace.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <div className="text-sm font-bold text-slate-800">
                                {workspace.name}
                              </div>
                              <div className="text-xs text-slate-500">
                                {workspace.description || "无描述"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {workspace.type === "PERSONAL" ? (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                              个人空间
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-bold rounded-full">
                              企业空间
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Users className="w-4 h-4" />
                            {workspace._count.members} 人
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600">
                          {formatTimeAgo(workspace.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleView(workspace)}
                              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                              title="查看空间"
                            >
                              <Eye className="w-4 h-4 text-slate-600" />
                            </button>
                            <button
                              onClick={() => handleDelete(workspace.id)}
                              disabled={deletingId === workspace.id}
                              className="p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              title="删除空间"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* 分页 */}
            {workspaceData && workspaceData.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between">
                <div className="text-sm text-slate-500">
                  共 {workspaceData.total} 个空间，第 {workspaceData.page}/
                  {workspaceData.totalPages} 页
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    上一页
                  </button>
                  <button
                    onClick={() =>
                      setCurrentPage((p) =>
                        Math.min(workspaceData.totalPages, p + 1),
                      )
                    }
                    disabled={currentPage === workspaceData.totalPages}
                    className="px-4 py-2 bg-[#3182ce] text-white rounded-lg text-sm hover:bg-[#2563eb] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
