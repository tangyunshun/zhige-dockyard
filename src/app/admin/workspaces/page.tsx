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
  EyeOff,
  CheckCircle,
  XCircle,
  X,
} from "lucide-react";

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  ownerId: string;
  description: string | null;
  logo: string | null;
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
  componentCount: number;
  members: Array<{
    id: string;
    role: string;
    user: { name: string | null; email: string | null };
  }>;
  _count: { members: number };
}

interface WorkspaceComponent {
  id: string;
  name: string;
  icon: string | null;
  usageCount: number;
}

interface WorkspaceData {
  workspaces: Workspace[];
  total: number;
  page: number;
  totalPages: number;
  stats?: {
    totalComponentCount: number;
    pendingCount: number;
  };
}

export default function AdminWorkspacesPage() {
  const router = useRouter();
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterComponentCount, setFilterComponentCount] =
    useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [viewingWorkspace, setViewingWorkspace] = useState<Workspace | null>(
    null,
  );
  const [viewingWorkspaceComponents, setViewingWorkspaceComponents] = useState<
    WorkspaceComponent[]
  >([]);
  const [loadingComponents, setLoadingComponents] = useState(false);
  const [activeTab, setActiveTab] = useState<"members" | "components">(
    "members",
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedWorkspaces, setSelectedWorkspaces] = useState<Set<string>>(
    new Set(),
  );
  const [showBatchActions, setShowBatchActions] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmMessage, setConfirmMessage] = useState("");

  useEffect(() => {
    // 获取当前用户 ID
    if (typeof window !== "undefined") {
      setCurrentUserId(localStorage.getItem("userId"));
    }
  }, []);

  useEffect(() => {
    loadWorkspaces(currentPage);
  }, [currentPage, filterType, filterComponentCount]);

  const loadWorkspaces = async (page: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "10",
        ...(searchQuery && { search: searchQuery }),
        ...(filterType !== "all" && { type: filterType }),
        ...(filterComponentCount !== "all" && {
          componentCount: filterComponentCount,
        }),
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
    showConfirm("确定要删除该工作空间吗？此操作不可恢复！", async () => {
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
    });
  };

  const handleView = async (workspace: Workspace) => {
    setViewingWorkspace(workspace);
    setActiveTab("members"); // 重置为成员列表 Tab
    setLoadingComponents(true);

    try {
      const res = await fetch(`/api/admin/workspaces/${workspace.id}`, {
        headers: {
          Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("userId") : ""}`,
        },
      });

      if (res.ok) {
        const result = await res.json();
        setViewingWorkspaceComponents(result.data.workspace.components || []);
      }
    } catch (error) {
      console.error("Load components error:", error);
    } finally {
      setLoadingComponents(false);
    }
  };

  const handleToggleStatus = async (workspace: Workspace) => {
    const newStatus = workspace.status === "ACTIVE" ? "DISABLED" : "ACTIVE";

    // 检查是否是自己的空间
    if (workspace.ownerId === currentUserId) {
      showToast("不能禁用自己创建的空间", "error");
      return;
    }

    // 检查是否是管理员空间（owner 是 admin 或 super_admin）
    if (workspace.type === "PERSONAL") {
      if (workspace.name.includes("admin")) {
        showToast("不能禁用管理员的个人空间", "error");
        return;
      }
    }

    showConfirm(
      `确定要${newStatus === "ACTIVE" ? "启用" : "禁用"}该空间吗？`,
      async () => {
        try {
          setTogglingId(workspace.id);
          const res = await fetch(
            `/api/admin/workspaces/toggle-status?workspaceId=${workspace.id}&status=${newStatus}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("userId") : ""}`,
              },
            },
          );

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || "操作失败");
          }

          showToast(
            `空间已${newStatus === "ACTIVE" ? "启用" : "禁用"}`,
            "success",
          );
          loadWorkspaces(currentPage);
        } catch (error) {
          console.error("Toggle workspace status error:", error);
          showToast("操作失败", "error");
        } finally {
          setTogglingId(null);
        }
      },
    );
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

  const showConfirm = (message: string, action: () => void) => {
    setConfirmMessage(message);
    setConfirmAction(() => action);
    setShowConfirmModal(true);
  };

  const handleConfirm = () => {
    if (confirmAction) {
      confirmAction();
    }
    setShowConfirmModal(false);
    setConfirmAction(null);
  };

  const toggleSelectWorkspace = (workspaceId: string) => {
    const newSelected = new Set(selectedWorkspaces);

    // 如果已经选中，直接取消选中
    if (newSelected.has(workspaceId)) {
      newSelected.delete(workspaceId);
      setSelectedWorkspaces(newSelected);
      setShowBatchActions(newSelected.size > 0);
      return;
    }

    // 如果是第一个选中的，直接添加
    if (newSelected.size === 0) {
      newSelected.add(workspaceId);
      setSelectedWorkspaces(newSelected);
      setShowBatchActions(true);
      return;
    }

    // 检查新选中的工作空间状态是否与已选中的状态一致
    const selectedItems =
      workspaceData?.workspaces.filter((ws) => newSelected.has(ws.id)) || [];
    const firstStatus = selectedItems[0]?.status;
    const newWorkspace = workspaceData?.workspaces.find(
      (ws) => ws.id === workspaceId,
    );

    if (firstStatus && newWorkspace && newWorkspace.status !== firstStatus) {
      // 状态不一致，提示用户
      const statusText = firstStatus === "ACTIVE" ? "已审核" : "待审核";
      showToast(
        `只能选择相同状态的工作空间，当前已选择${statusText}的空间`,
        "error",
      );
      return;
    }

    // 状态一致，添加选中
    newSelected.add(workspaceId);
    setSelectedWorkspaces(newSelected);
    setShowBatchActions(true);
  };

  const toggleSelectAll = () => {
    // 如果当前已经全选，取消全选
    if (selectedWorkspaces.size === workspaceData?.workspaces.length) {
      setSelectedWorkspaces(new Set());
      setShowBatchActions(false);
      return;
    }

    // 获取当前页面的所有工作空间
    const allWorkspaces = workspaceData?.workspaces || [];

    // 如果当前没有选中的，默认全选所有 ACTIVE 状态的
    if (selectedWorkspaces.size === 0) {
      const activeIds = new Set(
        allWorkspaces.filter((ws) => ws.status === "ACTIVE").map((ws) => ws.id),
      );

      if (activeIds.size === 0) {
        // 如果没有 ACTIVE 的，选择所有 DISABLED 的
        const disabledIds = new Set(
          allWorkspaces
            .filter((ws) => ws.status === "DISABLED")
            .map((ws) => ws.id),
        );
        setSelectedWorkspaces(disabledIds);
        setShowBatchActions(disabledIds.size > 0);
      } else {
        setSelectedWorkspaces(activeIds);
        setShowBatchActions(true);
      }
      return;
    }

    // 如果已经有选中的，获取当前选中项的状态
    const selectedItems = allWorkspaces.filter((ws) =>
      selectedWorkspaces.has(ws.id),
    );
    const currentStatus = selectedItems[0]?.status;

    // 只选择相同状态的所有工作空间
    const sameStatusIds = new Set(
      allWorkspaces
        .filter((ws) => ws.status === currentStatus)
        .map((ws) => ws.id),
    );

    setSelectedWorkspaces(sameStatusIds);
    setShowBatchActions(sameStatusIds.size > 0);
  };

  const handleBatchDisable = async () => {
    if (selectedWorkspaces.size === 0) return;

    showConfirm(
      `确定要禁用选中的 ${selectedWorkspaces.size} 个工作空间吗？`,
      async () => {
        try {
          const res = await fetch("/api/admin/workspaces/batch-toggle", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("userId") : ""}`,
            },
            body: JSON.stringify({
              workspaceIds: Array.from(selectedWorkspaces),
              status: "DISABLED",
            }),
          });

          if (!res.ok) throw new Error("批量操作失败");

          showToast(`已禁用 ${selectedWorkspaces.size} 个工作空间`, "success");
          setSelectedWorkspaces(new Set());
          setShowBatchActions(false);
          loadWorkspaces(currentPage);
        } catch (error) {
          showToast("批量操作失败", "error");
        }
      },
    );
  };

  const handleBatchEnable = async () => {
    if (selectedWorkspaces.size === 0) return;

    showConfirm(
      `确定要启用选中的 ${selectedWorkspaces.size} 个工作空间吗？`,
      async () => {
        try {
          const res = await fetch("/api/admin/workspaces/batch-toggle", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("userId") : ""}`,
            },
            body: JSON.stringify({
              workspaceIds: Array.from(selectedWorkspaces),
              status: "ACTIVE",
            }),
          });

          if (!res.ok) throw new Error("批量操作失败");

          showToast(`已启用 ${selectedWorkspaces.size} 个工作空间`, "success");
          setSelectedWorkspaces(new Set());
          setShowBatchActions(false);
          loadWorkspaces(currentPage);
        } catch (error) {
          showToast("批量操作失败", "error");
        }
      },
    );
  };

  // 根据选中项判断需要显示哪些批量操作按钮
  const getBatchActionButtons = () => {
    if (selectedWorkspaces.size === 0)
      return { showDisable: false, showEnable: false };

    const selectedItems =
      workspaceData?.workspaces.filter((ws) => selectedWorkspaces.has(ws.id)) ||
      [];
    const firstStatus = selectedItems[0]?.status;

    // 由于不允许混合选择，所以只会显示一种操作的按钮
    return {
      showDisable: firstStatus === "ACTIVE",
      showEnable: firstStatus === "DISABLED",
    };
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
    <div className="space-y-6 pb-8">
      {/* Toast 容器 */}
      <div
        id="zg-toast-container"
        className="fixed top-24 left-1/2 -translate-x-1/2 z-50"
      ></div>

      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">
          工作空间管理
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          审核工作空间、管理资源配额、查看空间统计
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#3182ce]/10 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-xl bg-[#3182ce]/10 flex items-center justify-center shadow-sm">
                <Building2 className="w-7 h-7 text-[#3182ce]" />
              </div>
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
              {workspaceData?.total || 0}
            </div>
            <div className="text-sm text-slate-500 font-semibold">
              总工作空间数
            </div>
          </div>
        </div>

        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#10b981]/10 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-xl bg-[#10b981]/10 flex items-center justify-center shadow-sm">
                <Users className="w-7 h-7 text-[#10b981]" />
              </div>
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
              {workspaceData?.workspaces.reduce(
                (sum, ws) => sum + ws._count.members,
                0,
              ) || 0}
            </div>
            <div className="text-sm text-slate-500 font-semibold">总成员数</div>
          </div>
        </div>

        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#8b5cf6]/10 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-xl bg-[#8b5cf6]/10 flex items-center justify-center shadow-sm">
                <Building2 className="w-7 h-7 text-[#8b5cf6]" />
              </div>
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
              {workspaceData?.stats?.totalComponentCount || 0}
            </div>
            <div className="text-sm text-slate-500 font-semibold">组件总数</div>
          </div>
        </div>

        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
          <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#f59e0b]/10 opacity-20 blur-2xl"></div>
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="w-14 h-14 rounded-xl bg-[#f59e0b]/10 flex items-center justify-center shadow-sm">
                <AlertCircle className="w-7 h-7 text-[#f59e0b]" />
              </div>
            </div>
            <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
              {workspaceData?.stats?.pendingCount || 0}
            </div>
            <div className="text-sm text-slate-500 font-semibold">
              待审核空间
            </div>
          </div>
        </div>
      </div>

      {/* 筛选工具栏 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-5 border border-white/90 shadow-sm overflow-hidden">
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#8b5cf6]/10 opacity-50 blur-3xl"></div>

        <div className="relative flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="搜索工作空间名称..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="w-full pl-11 pr-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-sm font-medium transition-all bg-white/80"
            >
              <option value="all">所有类型</option>
              <option value="PERSONAL">个人空间</option>
              <option value="ENTERPRISE">企业空间</option>
            </select>
            <select
              value={filterComponentCount}
              onChange={(e) => setFilterComponentCount(e.target.value)}
              className="px-4 h-11 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-sm font-medium transition-all bg-white/80"
            >
              <option value="all">所有数量</option>
              <option value="0">0 个组件</option>
              <option value="1-10">1-10 个组件</option>
              <option value="11-50">11-50 个组件</option>
              <option value="51-100">51-100 个组件</option>
              <option value="100+">100+ 个组件</option>
            </select>
            <button
              onClick={handleSearch}
              className="inline-flex items-center px-5 h-11 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white font-semibold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
            >
              <Filter className="w-4 h-4 mr-2" />
              筛选
            </button>
          </div>
        </div>
      </div>

      {/* 工作空间列表 */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* 批量操作工具栏 */}
        {showBatchActions &&
          (() => {
            const { showDisable, showEnable } = getBatchActionButtons();

            // 如果没有需要显示的按钮，不显示工具栏
            if (!showDisable && !showEnable) return null;

            return (
              <div className="relative bg-gradient-to-r from-[#3182ce]/10 to-[#8b5cf6]/10 border-b border-white/50 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold text-slate-700">
                    已选择{" "}
                    <span className="text-[#3182ce]">
                      {selectedWorkspaces.size}
                    </span>{" "}
                    个工作空间
                  </span>
                  <button
                    onClick={() => {
                      setSelectedWorkspaces(new Set());
                      setShowBatchActions(false);
                    }}
                    className="text-sm text-slate-600 hover:text-slate-800 font-medium"
                  >
                    取消选择
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {showDisable && (
                    <button
                      onClick={handleBatchDisable}
                      className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold hover:bg-orange-600 transition-colors flex items-center gap-2"
                    >
                      <EyeOff className="w-4 h-4" />
                      批量禁用
                    </button>
                  )}
                  {showEnable && (
                    <button
                      onClick={handleBatchEnable}
                      className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-bold hover:bg-green-600 transition-colors flex items-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      批量启用
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full table-auto">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={
                          selectedWorkspaces.size ===
                            workspaceData?.workspaces.length &&
                          workspaceData?.workspaces.length > 0
                        }
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      工作空间
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      类型
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      成员数
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      组件数量
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      审核状态
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      创建时间
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {workspaceData?.workspaces.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
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
                          <input
                            type="checkbox"
                            checked={selectedWorkspaces.has(workspace.id)}
                            onChange={() => toggleSelectWorkspace(workspace.id)}
                            className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-white" />
                            </div>
                            <div className="min-w-0">
                              <div
                                className="text-sm font-bold text-slate-800 truncate"
                                title={workspace.name}
                              >
                                {workspace.name}
                              </div>
                              <div
                                className="text-xs text-slate-500 truncate"
                                title={workspace.description || "无描述"}
                              >
                                {workspace.description || "无描述"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
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
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <Users className="w-4 h-4 shrink-0" />
                            <span>{workspace._count.members} 人</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-bold">
                              {workspace.componentCount} 个
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {workspace.status === "ACTIVE" ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold flex items-center gap-1 w-fit">
                              <CheckCircle className="w-3 h-3 shrink-0" />
                              已审核
                            </span>
                          ) : (
                            <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold flex items-center gap-1 w-fit">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              待审核
                            </span>
                          )}
                        </td>
                        <td
                          className="px-6 py-4 text-sm text-slate-600 whitespace-nowrap"
                          title={formatTimeAgo(workspace.createdAt)}
                        >
                          {formatTimeAgo(workspace.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleView(workspace)}
                              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                              title="查看空间"
                            >
                              <Eye className="w-4 h-4 text-slate-600" />
                            </button>

                            {/* 个人空间和企业空间都显示封禁按钮，但有自己的限制 */}
                            <>
                              {/* 根据状态显示不同按钮 */}
                              {workspace.status === "ACTIVE" ? (
                                // 活跃状态：显示禁用按钮
                                <button
                                  onClick={() => handleToggleStatus(workspace)}
                                  disabled={togglingId === workspace.id}
                                  className="p-2 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-50"
                                  title="禁用空间"
                                >
                                  <EyeOff className="w-4 h-4 text-orange-600" />
                                </button>
                              ) : (
                                // 已禁用状态：显示启用和删除按钮
                                <>
                                  <button
                                    onClick={() =>
                                      handleToggleStatus(workspace)
                                    }
                                    disabled={togglingId === workspace.id}
                                    className="p-2 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50"
                                    title="启用空间"
                                  >
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                  </button>
                                  <button
                                    onClick={() => handleDelete(workspace.id)}
                                    disabled={deletingId === workspace.id}
                                    className="p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                    title="删除空间"
                                  >
                                    <Trash2 className="w-4 h-4 text-red-600" />
                                  </button>
                                </>
                              )}
                            </>

                            {/* 状态标识 */}
                            {workspace.status === "DISABLED" && (
                              <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full flex items-center gap-1">
                                <XCircle className="w-3 h-3" />
                                已禁用
                              </span>
                            )}
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

      {/* 查看详情弹窗 */}
      {viewingWorkspace && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-xl font-bold text-slate-800">工作空间详情</h2>
              <button
                onClick={() => setViewingWorkspace(null)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 基本信息 */}
              <div>
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">
                  基本信息
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="text-xs text-slate-500 mb-1">空间名称</div>
                    <div className="text-sm font-bold text-slate-800">
                      {viewingWorkspace.name}
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="text-xs text-slate-500 mb-1">空间类型</div>
                    <div className="text-sm font-bold">
                      {viewingWorkspace.type === "PERSONAL" ? (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs">
                          个人空间
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs">
                          企业空间
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="text-xs text-slate-500 mb-1">成员数量</div>
                    <div className="text-sm font-bold text-slate-800">
                      {viewingWorkspace._count.members} 人
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="text-xs text-slate-500 mb-1">组件数量</div>
                    <div className="text-sm font-bold text-green-600">
                      {viewingWorkspace.componentCount} 个
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="text-xs text-slate-500 mb-1">创建时间</div>
                    <div className="text-sm font-bold text-slate-800">
                      {new Date(viewingWorkspace.createdAt).toLocaleString(
                        "zh-CN",
                      )}
                    </div>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <div className="text-xs text-slate-500 mb-1">状态</div>
                    <div className="text-sm font-bold">
                      {viewingWorkspace.status === "ACTIVE" ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs flex items-center gap-1 w-fit">
                          <CheckCircle className="w-3 h-3" />
                          活跃
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs flex items-center gap-1 w-fit">
                          <XCircle className="w-3 h-3" />
                          已禁用
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 描述信息 */}
              <div>
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">
                  描述信息
                </h3>
                <div className="p-4 bg-slate-50 rounded-xl">
                  <div className="text-sm text-slate-700">
                    {viewingWorkspace.description || "暂无描述"}
                  </div>
                </div>
              </div>

              {/* 成员列表和组件列表 Tab 切换 */}
              <div>
                {/* Tab 标签页 */}
                <div className="flex border-b border-slate-200 mb-4">
                  <button
                    onClick={() => setActiveTab("members")}
                    className={`px-4 py-2 text-sm font-bold transition-colors relative ${
                      activeTab === "members"
                        ? "text-[#3182ce] border-b-2 border-[#3182ce]"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    成员列表
                    <span className="ml-2 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs">
                      {viewingWorkspace._count.members}
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab("components")}
                    className={`px-4 py-2 text-sm font-bold transition-colors relative ${
                      activeTab === "components"
                        ? "text-[#3182ce] border-b-2 border-[#3182ce]"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    组件列表
                    <span className="ml-2 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs">
                      {viewingWorkspaceComponents.length}
                    </span>
                  </button>
                </div>

                {/* Tab 内容 */}
                {activeTab === "members" ? (
                  <div className="space-y-2">
                    {viewingWorkspace.members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white text-sm font-bold">
                            {member.user.name?.charAt(0).toUpperCase() ||
                              member.user.email?.charAt(0).toUpperCase() ||
                              "U"}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-800">
                              {member.user.name || "未命名用户"}
                            </div>
                            <div className="text-xs text-slate-500">
                              {member.user.email || "无邮箱"}
                            </div>
                          </div>
                        </div>
                        <div className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-bold">
                          {member.role === "OWNER"
                            ? "空间所有者"
                            : member.role === "ADMIN"
                              ? "管理员"
                              : "成员"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div>
                    {loadingComponents ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-[#3182ce] border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    ) : viewingWorkspaceComponents.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-sm">
                        暂无组件
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {viewingWorkspaceComponents.map((component) => (
                          <div
                            key={component.id}
                            className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center">
                                {component.icon ? (
                                  <img
                                    src={component.icon}
                                    alt={component.name}
                                    className="w-6 h-6 object-cover rounded"
                                  />
                                ) : (
                                  <Building2 className="w-5 h-5 text-white" />
                                )}
                              </div>
                              <div>
                                <div className="text-sm font-bold text-slate-800">
                                  {component.name}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-slate-500">
                                使用次数：
                              </span>
                              <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">
                                {component.usageCount} 次
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
              <button
                onClick={() => setViewingWorkspace(null)}
                className="px-5 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-100 transition-colors font-semibold text-sm"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 自定义确认弹窗 */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-orange-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">确认操作</h3>
              </div>
              <p className="text-slate-600 mb-6">{confirmMessage}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowConfirmModal(false);
                    setConfirmAction(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors font-semibold text-sm"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex-1 px-4 py-2.5 bg-[#3182ce] text-white rounded-xl hover:bg-[#2563eb] transition-colors font-semibold text-sm"
                >
                  确认
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
