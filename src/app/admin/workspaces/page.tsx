"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";
import {
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
  RotateCcw,
  Zap,
  Search,
  Clock,
} from "lucide-react";
import Pagination from "@/components/Pagination";

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  ownerId: string;
  plan?: string;
  description: string | null;
  logo: string | null;
  status: "ACTIVE" | "DISABLED";
  createdAt: string;
  componentCount: number;
  memberCount?: number;
  isProtected?: boolean;
  owner?: { id: string; name: string; email?: string; role?: string } | null;
  disabledUntil?: string | null;
  disabledReason?: string | null;
  disabledDuration?: string | null;
  appealStatus?: string;
  appealCount?: number;
  quota?: {
    tokenBalance: number | string;
    membershipLevelId?: string;
    storageUsed?: number;
    storageLimit?: number;
    apiCallsUsed?: number;
    apiCallsLimit?: number;
  };
  members: Array<{
    id: string;
    role: string;
    monthlyTokenLimit?: number | null;
    monthlyTokenUsed?: number;
    user: { name: string | null; email: string | null };
  }>;
  _count: { members?: number; workspacemember?: number };
}

const WORKSPACE_PLAN_BADGES: Record<string, { label: string; badge: string }> = {
  STANDARD: { label: "标准版", badge: "bg-slate-50 text-slate-600 border-slate-200" },
  PRO: { label: "专业版", badge: "bg-blue-50 text-[#2b6cb0] border-blue-200 font-black" },
  ENTERPRISE: { label: "旗舰版", badge: "bg-purple-50 text-purple-700 border-purple-200 font-black" },
  CUSTOM: { label: "定制版", badge: "bg-amber-50 text-amber-700 border-amber-200 font-black" },
};

function formatWorkspaceBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
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
    totalMembers: number;
  };
}

const PAGE_SIZE = 10;

export default function AdminWorkspacesPage() {
  const toast = useToast();
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

  // 工作空间停用管控弹窗状态
  const [disablingWorkspace, setDisablingWorkspace] = useState<Workspace | null>(null);
  const [disableReason, setDisableReason] = useState<string>("违反平台运营与合规规范");
  const [disableDuration, setDisableDuration] = useState<string>("7d");
  const [disableSubmitting, setDisableSubmitting] = useState<boolean>(false);

  useEffect(() => {
    // 获取当前用户 ID
    if (typeof window !== "undefined") {
      setCurrentUserId(localStorage.getItem("userId"));
    }
  }, []);

  useEffect(() => {
    loadWorkspaces(currentPage);
  }, [currentPage, filterType, filterComponentCount]);

  const loadWorkspaces = async (page: number, searchValue?: string) => {
    try {
      setLoading(true);
      const currentSearch =
        searchValue !== undefined ? searchValue : searchQuery;
      const params = new URLSearchParams({
        page: page.toString(),
        limit: String(PAGE_SIZE),
        ...(currentSearch && { search: currentSearch }),
        ...(filterType !== "all" && { type: filterType }),
        ...(filterComponentCount !== "all" && {
          componentCount: filterComponentCount,
        }),
      });

      const res = await fetch(`/api/admin/workspaces?${params}`, {
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
      });

      if (!res.ok) {
        // 不显示错误，ActivityMonitor 会处理超时跳转
        console.error("Load workspaces failed:", res.status);
        return;
      }

      const result = await res.json();
      console.log("API 返回的数据:", result.data);
      console.log("统计数据:", result.data.stats);
      console.log("总数:", result.data.total);
      setWorkspaceData(result.data);
    } catch (error) {
      console.error("Load workspaces error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = useCallback(
    (searchValue: string = searchQuery) => {
      setCurrentPage(1);
      loadWorkspaces(1, searchValue);
    },
    [searchQuery],
  );

  // 实时搜索处理函数（带防抖）
  const handleRealTimeSearch = useCallback((value: string) => {
    setCurrentPage(1);
    loadWorkspaces(1, value);
  }, []);

  const handleDelete = async (workspaceId: string) => {
    showConfirm("确定要删除该工作空间吗？此操作不可恢复！", async () => {
      try {
        setDeletingId(workspaceId);
        const res = await fetch(
          `/api/admin/workspaces?workspaceId=${workspaceId}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${getAuthToken()}`,
            },
          },
        );

        if (!res.ok) {
          // 不显示错误，ActivityMonitor 会处理超时跳转
          console.error("Delete workspace failed:", res.status);
          return;
        }

        showToast("工作空间已删除", "success");
        setCurrentPage(1);
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
          Authorization: `Bearer ${getAuthToken()}`,
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

  // 唤起工作空间停用管控弹窗
  const handleOpenDisableModal = (workspace: Workspace) => {
    // 再次前置防护：如果是受保护的超级管理员/管理员空间，直接拦截提示
    if (workspace.isProtected || workspace.ownerId === currentUserId) {
      showToast("超级管理员与系统管理员的工作空间受系统安全保护，不可停用", "error");
      return;
    }
    setDisablingWorkspace(workspace);
    setDisableReason("违反平台运营与合规规范");
    setDisableDuration("7d");
  };

  // 确认执行停用管控操作（携带理由调用 API 并向成员发送站内信通知）
  const handleConfirmDisable = async () => {
    if (!disablingWorkspace) return;
    if (!disableReason.trim()) {
      showToast("请填写或选择停用管控原因", "error");
      return;
    }

    try {
      setDisableSubmitting(true);
      const res = await fetch("/api/admin/workspaces/toggle-status", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        credentials: "include",
        body: JSON.stringify({
          workspaceId: disablingWorkspace.id,
          status: "DISABLED",
          reason: disableReason.trim(),
          duration: disableDuration,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showToast(data.error || data.message || "停用工作空间失败", "error");
        return;
      }

      showToast(`工作空间【${disablingWorkspace.name}】已停用管控，已向所有成员推送系统通知`, "success");
      setDisablingWorkspace(null);
      loadWorkspaces(currentPage);
    } catch (err) {
      console.error("停用工作空间出错:", err);
      showToast("操作失败，请稍后重试", "error");
    } finally {
      setDisableSubmitting(false);
    }
  };

  // 解除管控并恢复启用工作空间
  const handleEnableWorkspace = async (workspace: Workspace) => {
    showConfirm(
      `确定要解除对工作空间【${workspace.name}】的管控并恢复启用吗？解除后系统将自动向所有成员发送服务恢复通知。`,
      async () => {
        try {
          setTogglingId(workspace.id);
          const res = await fetch("/api/admin/workspaces/toggle-status", {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${getAuthToken()}`,
            },
            body: JSON.stringify({
              workspaceId: workspace.id,
              status: "ACTIVE",
            }),
          });

          const data = await res.json();
          if (!res.ok || !data.success) {
            showToast(data.error || "恢复启用失败", "error");
            return;
          }

          showToast(`工作空间【${workspace.name}】已恢复启用，通知已推送`, "success");
          loadWorkspaces(currentPage);
        } catch (error) {
          console.error("恢复启用工作空间出错:", error);
          showToast("操作失败", "error");
        } finally {
          setTogglingId(null);
        }
      },
    );
  };

  const showToast = (message: string, type: "success" | "error") => {
    if (type === "success") {
      toast.success(message);
    } else {
      toast.error(message);
    }
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
              Authorization: `Bearer ${getAuthToken()}`,
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
              Authorization: `Bearer ${getAuthToken()}`,
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

      {/* 统计卡片 (与全站管理后台标准指标卡片规格保持 100% 一致) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between hover:shadow-md transition-all">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">总工作空间数</div>
            <div className="text-2xl font-black font-mono text-slate-800 tracking-tight">
              {workspaceData?.total || 0}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100/80 text-[#3182ce] flex items-center justify-center font-bold shrink-0 shadow-2xs">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between hover:shadow-md transition-all">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">总成员数</div>
            <div className="text-2xl font-black font-mono text-emerald-600 tracking-tight">
              {workspaceData?.stats?.totalMembers || 0}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100/80 text-emerald-600 flex items-center justify-center font-bold shrink-0 shadow-2xs">
            <Users className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between hover:shadow-md transition-all">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">组件总数</div>
            <div className="text-2xl font-black font-mono text-purple-600 tracking-tight">
              {workspaceData?.stats?.totalComponentCount || 0}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100/80 text-purple-600 flex items-center justify-center font-bold shrink-0 shadow-2xs">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between hover:shadow-md transition-all">
          <div>
            <div className="text-xs text-slate-500 font-bold mb-1">待审核空间</div>
            <div className="text-2xl font-black font-mono text-amber-600 tracking-tight">
              {workspaceData?.stats?.pendingCount || 0}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100/80 text-amber-600 flex items-center justify-center font-bold shrink-0 shadow-2xs">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 筛选工具栏 (圆润 16px 规范卡片 + 双行清晰分治架构) */}
      <div className="bg-white/90 backdrop-blur-md p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
        {/* 第一行：多维分类筛选标签下拉框 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-bold">空间类型:</span>
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none cursor-pointer"
            >
              <option value="all">全部类型</option>
              <option value="PERSONAL">👤 个人空间</option>
              <option value="ENTERPRISE">🏢 企业空间</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-bold">组件装配:</span>
            <select
              value={filterComponentCount}
              onChange={(e) => {
                setFilterComponentCount(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none cursor-pointer"
            >
              <option value="all">全部数量</option>
              <option value="0">0 个组件</option>
              <option value="1-10">1-10 个组件</option>
              <option value="11-50">11-50 个组件</option>
              <option value="51-100">51-100 个组件</option>
              <option value="100+">100+ 个组件</option>
            </select>
          </div>
        </div>

        {/* 第二行：加长舒展搜索框与快捷操作 */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1 border-t border-slate-100">
          <div className="relative w-80 sm:w-96 lg:w-[420px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSearch();
                }
              }}
              placeholder="搜索工作空间名称 / 关键词..."
              className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setCurrentPage(1);
                  loadWorkspaces(1, "");
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-500 transition-colors cursor-pointer"
                title="清空搜索"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => handleSearch()}
            className="px-4 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0"
          >
            搜索
          </button>

          <button
            type="button"
            onClick={() => loadWorkspaces(currentPage)}
            disabled={loading}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0 flex items-center gap-1.5 border border-slate-200/80 active:scale-95 disabled:opacity-50"
            title="点击刷新空间列表最新数据"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-[#3182ce] ${loading ? "animate-spin" : ""}`} />
            <span>刷新数据</span>
          </button>

          {(searchQuery || filterType !== "all" || filterComponentCount !== "all") && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setFilterType("all");
                setFilterComponentCount("all");
                setCurrentPage(1);
                loadWorkspaces(1, "");
              }}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
            >
              重置
            </button>
          )}
        </div>
      </div>

      {/* 工作空间列表 (圆润 16px 卡片 + 操作列粘性固定) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
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
                      className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-bold hover:bg-amber-600 transition-colors flex items-center gap-2"
                    >
                      <EyeOff className="w-4 h-4" />
                      批量禁用
                    </button>
                  )}
                  {showEnable && (
                    <button
                      onClick={handleBatchEnable}
                      className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-bold hover:bg-emerald-600 transition-colors flex items-center gap-2"
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
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-10 h-10 border-3 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mb-3"></div>
            <p className="text-xs text-slate-500 font-bold">正在加载工作空间数据...</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto min-h-[300px]">
              <table className="w-full text-xs">
                <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                  <tr>
                    <th className="px-4.5 py-3.5 text-left whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={
                          workspaceData?.workspaces.length !== undefined &&
                          workspaceData.workspaces.length > 0 &&
                          workspaceData.workspaces.every((ws) =>
                            selectedWorkspaces.has(ws.id),
                          )
                        }
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]"
                      />
                    </th>
                    <th className="px-4.5 py-3.5 text-left whitespace-nowrap">
                      工作空间
                    </th>
                    <th className="px-4.5 py-3.5 text-left whitespace-nowrap">
                      类型
                    </th>
                    <th className="px-4.5 py-3.5 text-left whitespace-nowrap">
                      套餐档位
                    </th>
                    <th className="px-4.5 py-3.5 text-left whitespace-nowrap">
                      成员数
                    </th>
                    <th className="px-4.5 py-3.5 text-left whitespace-nowrap">
                      组件数量
                    </th>
                    <th className="px-4.5 py-3.5 text-left whitespace-nowrap">
                      可用算力
                    </th>
                    <th className="px-4.5 py-3.5 text-left whitespace-nowrap">
                      创建时间
                    </th>
                    {/* 操作列：粘性吸附在最右侧，无论横向怎么滚动均可见 */}
                    <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4.5 py-3.5 text-right whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200/80">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {workspaceData?.workspaces.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-6 py-20 text-center text-slate-400"
                      >
                        暂无工作空间数据
                      </td>
                    </tr>
                  ) : (
                    workspaceData?.workspaces.map((workspace) => (
                      <tr
                        key={workspace.id}
                        className="group hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="px-4.5 py-3.5 whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={selectedWorkspaces.has(workspace.id)}
                            onChange={() => toggleSelectWorkspace(workspace.id)}
                            className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]"
                          />
                        </td>
                        <td className="px-4.5 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center text-white shadow-2xs">
                              <Building2 className="w-4.5 h-4.5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="text-xs font-black text-slate-800 truncate max-w-[150px]"
                                  title={workspace.name}
                                >
                                  {workspace.name}
                                </span>
                                {workspace.status === "DISABLED" && (
                                  <span className="shrink-0 px-1.5 py-0.2 rounded text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200/80">
                                    管控中
                                  </span>
                                )}
                                {workspace.appealStatus === "pending" && (
                                  <span className="shrink-0 px-1.5 py-0.2 rounded text-[10px] font-black bg-purple-50 text-purple-700 border border-purple-200/80 animate-pulse">
                                    申诉待审
                                  </span>
                                )}
                              </div>
                              <div
                                className="text-[11px] text-slate-400 truncate max-w-[180px]"
                                title={workspace.description || "无描述"}
                              >
                                {workspace.description || "无描述"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4.5 py-3.5 whitespace-nowrap">
                          {workspace.type === "PERSONAL" ? (
                            <span className="px-2 py-0.5 bg-blue-50 text-[#2b6cb0] border border-blue-200 text-[10px] font-black rounded-lg">
                              个人空间
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-black rounded-lg">
                              企业空间
                            </span>
                          )}
                        </td>
                        <td className="px-4.5 py-3.5 whitespace-nowrap">
                          {(() => {
                            const planKey = (workspace.plan || "STANDARD").toUpperCase();
                            const meta = WORKSPACE_PLAN_BADGES[planKey] || { label: planKey, badge: "bg-slate-50 text-slate-600 border-slate-200" };
                            return (
                              <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-black ${meta.badge}`}>
                                {meta.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4.5 py-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-xs text-slate-700 font-bold font-mono">
                            <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{(workspace as any).memberCount ?? workspace._count?.workspacemember ?? workspace._count?.members ?? workspace.members?.length ?? 0} 人</span>
                          </div>
                        </td>
                        <td className="px-4.5 py-3.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black font-mono">
                            {workspace.componentCount} 个
                          </span>
                        </td>
                        <td className="px-4.5 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200/70 text-[#3182ce] text-[11px] font-black font-mono shadow-2xs">
                            <Zap className="w-3 h-3 fill-[#3182ce]" />
                            <span>
                              {workspace.quota?.tokenBalance !== undefined && workspace.quota?.tokenBalance !== null
                                ? `${Number(workspace.quota.tokenBalance).toLocaleString()} 点`
                                : workspace.type === "ENTERPRISE" ? "0 点" : "100 点"}
                            </span>
                          </span>
                        </td>
                        {/* 创建时间：年月日上面，时分秒在下面 */}
                        <td className="px-4.5 py-3.5 whitespace-nowrap">
                          {(() => {
                            const d = new Date(workspace.createdAt);
                            const isValid = !isNaN(d.getTime());
                            const datePart = isValid
                              ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
                              : workspace.createdAt;
                            const timePart = isValid
                              ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`
                              : "";
                            return (
                              <div className="flex flex-col font-mono leading-tight">
                                <span className="text-xs font-bold text-slate-700">{datePart}</span>
                                <span className="text-[11px] text-slate-400 font-medium mt-0.5">{timePart}</span>
                              </div>
                            );
                          })()}
                        </td>
                        {/* 操作列：粘性吸附在最右侧，无论横向怎么滚动均触手可及 */}
                        <td className="sticky right-0 bg-white/95 group-hover:bg-slate-50/95 backdrop-blur-xs z-10 px-4.5 py-3.5 text-right whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-100 transition-colors">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleView(workspace)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-[#3182ce] hover:bg-[#3182ce] hover:text-white rounded-xl font-bold text-xs transition-all duration-200 cursor-pointer shadow-2xs"
                              title="查看工作空间成员与资产详情"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>详情</span>
                            </button>

                            {workspace.status === "ACTIVE" ? (
                              // 用户核心批注：受管理员安全保护的工作空间（超级管理员/系统管理员）直接隐藏停用按钮
                              workspace.isProtected ? null : (
                                <button
                                  onClick={() => handleOpenDisableModal(workspace)}
                                  disabled={togglingId === workspace.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white rounded-xl font-bold text-xs transition-all duration-200 cursor-pointer shadow-2xs disabled:opacity-50"
                                  title="停用管控该工作空间"
                                >
                                  <EyeOff className="w-3.5 h-3.5" />
                                  <span>停用</span>
                                </button>
                              )
                            ) : (
                              <>
                                <span
                                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 bg-amber-50/95 text-amber-700 border border-amber-200/80 rounded-lg shadow-2xs whitespace-nowrap"
                                  title={`【工作空间管控中】\n管控截止：${workspace.disabledUntil ? new Date(workspace.disabledUntil).toLocaleString("zh-CN") : "永久管控"}\n停用原因：${workspace.disabledReason || "未登记"}\n说明：到达截止时间后，系统将自动解除管控恢复正常启用。`}
                                >
                                  <Clock className="w-3 h-3 text-amber-500 shrink-0" />
                                  <span>
                                    {workspace.disabledUntil
                                      ? `停用至 ${new Date(workspace.disabledUntil).getMonth() + 1}月${new Date(workspace.disabledUntil).getDate()}日`
                                      : "永久管控"}
                                  </span>
                                </span>
                                <button
                                  onClick={() => handleEnableWorkspace(workspace)}
                                  disabled={togglingId === workspace.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white rounded-xl font-bold text-xs transition-all duration-200 cursor-pointer shadow-2xs disabled:opacity-50"
                                  title="恢复启用该工作空间"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  <span>启用</span>
                                </button>
                                <button
                                  onClick={() => handleDelete(workspace.id)}
                                  disabled={deletingId === workspace.id}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-xl font-bold text-xs transition-all duration-200 cursor-pointer shadow-2xs disabled:opacity-50"
                                  title="解散并彻底删除该工作空间"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>解散</span>
                                </button>
                              </>
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
            {workspaceData && workspaceData.total > 0 && (
              <div className="px-6 py-4 border-t border-slate-200">
                <Pagination
                  currentPage={workspaceData.page || currentPage}
                  totalItems={workspaceData.total}
                  pageSize={PAGE_SIZE}
                  onPageChange={(p) => setCurrentPage(p)}
                  itemLabel="个工作空间"
                />
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
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider">
                    基本信息与业务归属
                  </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[11px] text-slate-400 font-bold mb-1">空间名称</div>
                    <div className="text-xs font-black text-slate-800 truncate" title={viewingWorkspace.name}>
                      {viewingWorkspace.name}
                    </div>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[11px] text-slate-400 font-bold mb-1">空间类型</div>
                    <div className="text-xs font-bold">
                      {viewingWorkspace.type === "PERSONAL" ? (
                        <span className="px-2 py-0.5 bg-blue-50 text-[#2b6cb0] border border-blue-200 rounded text-[10px] font-bold">
                          个人空间
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded text-[10px] font-bold">
                          企业空间
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[11px] text-slate-400 font-bold mb-1">套餐档位</div>
                    <div className="text-xs font-bold flex items-center justify-between">
                      {(() => {
                        const planKey = (viewingWorkspace.plan || "STANDARD").toUpperCase();
                        const meta = WORKSPACE_PLAN_BADGES[planKey] || { label: planKey, badge: "bg-slate-50 text-slate-600 border-slate-200" };
                        return (
                          <span className={`px-2 py-0.5 rounded border text-[10px] ${meta.badge}`}>
                            {meta.label}
                          </span>
                        );
                      })()}
                      <button
                        onClick={() => window.open(`/user/billing-center?workspaceId=${viewingWorkspace.id}`, "_blank")}
                        className="text-[10px] font-bold text-[#3182ce] hover:underline"
                        title="查看/调整该空间的套餐与配额"
                      >
                        配置
                      </button>
                    </div>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[11px] text-slate-400 font-bold mb-1">成员规模</div>
                    <div className="text-xs font-bold text-slate-800 font-mono">
                      {(viewingWorkspace as any).memberCount ?? viewingWorkspace._count?.workspacemember ?? viewingWorkspace._count?.members ?? viewingWorkspace.members?.length ?? 0} 人
                    </div>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[11px] text-slate-400 font-bold mb-1">已装配组件</div>
                    <div className="text-xs font-bold text-emerald-600">
                      {viewingWorkspace.componentCount} 个
                    </div>
                  </div>
                  <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="text-[11px] text-slate-400 font-bold mb-1">运营状态</div>
                    <div className="text-xs font-bold">
                      {viewingWorkspace.status === "ACTIVE" ? (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded text-[10px] font-bold inline-flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          活跃中
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded text-[10px] font-bold inline-flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          已禁用
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 核心配额与水位监控（全流程数据闭环） */}
              <div>
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3 flex items-center justify-between">
                  <span>空间资源配额与水位监控</span>
                  <span className="text-[10px] font-bold text-slate-400">实时数据库聚合</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold mb-1">
                      <span>云端存储</span>
                      <span>
                        {viewingWorkspace.quota?.storageLimit === -1 ? "无限制" : formatWorkspaceBytes(viewingWorkspace.quota?.storageLimit)}
                      </span>
                    </div>
                    <div className="text-xs font-black text-slate-800 font-mono">
                      {formatWorkspaceBytes(viewingWorkspace.quota?.storageUsed)}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold mb-1">
                      <span>API 调用频次</span>
                      <span>
                        {viewingWorkspace.quota?.apiCallsLimit === -1 ? "无限制" : `${(viewingWorkspace.quota?.apiCallsLimit || 0).toLocaleString()} 次`}
                      </span>
                    </div>
                    <div className="text-xs font-black text-slate-800 font-mono">
                      {(viewingWorkspace.quota?.apiCallsUsed || 0).toLocaleString()} 次
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-100">
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold mb-1">
                      <span>可用算力余额</span>
                      <span className="text-emerald-600 font-bold">生效中</span>
                    </div>
                    <div className="text-xs font-black text-[#2b6cb0] font-mono">
                      {(Number(viewingWorkspace.quota?.tokenBalance) || 0).toLocaleString()} Tokens
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
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-sm font-bold">
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
                        <div className="px-2 py-1 bg-blue-100 text-[#2b6cb0] rounded text-xs font-bold">
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
                              <span className="px-2 py-1 bg-emerald-100 text-emerald-600 rounded text-xs font-bold">
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
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-amber-600" />
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
                  className="flex-1 px-4 py-2.5 bg-[#3182ce] text-white rounded-xl hover:bg-[#3182ce] transition-colors font-semibold text-sm"
                >
                  确认
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 工作空间停用管控确认模态弹窗（带原因录入、全员站内信推送与防截断架构） */}
      {disablingWorkspace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in-50 duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            {/* 头部 */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/40 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">工作空间停用管控确认</h3>
                  <p className="text-xs text-slate-500 mt-0.5">请谨慎评估，停用后将冻结空间组件与算力</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDisablingWorkspace(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 内容滚动区 */}
            <div className="p-6 space-y-4 flex-1 min-h-0 overflow-y-auto">
              {/* 空间基本信息概要卡片 */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">目标工作空间:</span>
                  <span className="font-black text-slate-800 text-sm">{disablingWorkspace.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">所属拥有者:</span>
                  <span className="font-bold text-slate-700">
                    {disablingWorkspace.owner?.name || "空间管理员"}
                    {disablingWorkspace.owner?.email ? ` (${disablingWorkspace.owner.email})` : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-bold">空间规模:</span>
                  <span className="font-bold text-slate-700">
                    {(disablingWorkspace as any).memberCount ?? disablingWorkspace.members?.length ?? 0} 位成员 · {disablingWorkspace.componentCount} 个组件
                  </span>
                </div>
              </div>

              {/* 停用期限选择（1天、3天、7天、1个月、1年、永久） */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-black text-slate-700">
                    停用期限 <span className="text-red-500 font-bold ml-0.5">*</span>
                  </label>
                  <span className="text-[11px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                    到期系统将自动解除管控
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-2">
                  {[
                    { key: "1d", label: "1 天", desc: "短时管控" },
                    { key: "3d", label: "3 天", desc: "合规核验" },
                    { key: "7d", label: "7 天", desc: "标准整改" },
                    { key: "30d", label: "1 个月", desc: "严肃惩戒" },
                    { key: "365d", label: "1 年", desc: "长期管控" },
                    { key: "permanent", label: "永久", desc: "永久封禁" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setDisableDuration(item.key)}
                      className={`px-1.5 py-2 rounded-xl border text-center transition-all cursor-pointer whitespace-nowrap ${
                        disableDuration === item.key
                          ? "bg-amber-500 text-white border-amber-600 shadow-sm font-black scale-[1.02]"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300 font-bold"
                      }`}
                    >
                      <div className="text-xs font-black">{item.label}</div>
                      <div className={`text-[10px] mt-0.5 font-medium ${disableDuration === item.key ? "text-amber-100 font-bold" : "text-slate-400"}`}>
                        {item.desc}
                      </div>
                    </button>
                  ))}
                </div>

                {/* 预计自动解封时间展示 */}
                <div className="p-2.5 rounded-xl bg-blue-50/60 border border-blue-200/60 text-xs flex items-center justify-between">
                  <span className="text-slate-600 font-medium">预计自动解封节点：</span>
                  <span className="font-mono font-bold text-[#2b6cb0]">
                    {(() => {
                      if (disableDuration === "permanent") return "永久封禁（无自动解封节点，须提交申诉经风控审核）";
                      const daysMap: Record<string, number> = { "1d": 1, "3d": 3, "7d": 7, "30d": 30, "365d": 365 };
                      const days = daysMap[disableDuration] || 7;
                      const target = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
                      return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")} ${String(target.getHours()).padStart(2, "0")}:${String(target.getMinutes()).padStart(2, "0")} (${days}天后)`;
                    })()}
                  </span>
                </div>
              </div>

              {/* 停用原因选择 */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  停用管控原因 <span className="text-red-500 font-bold ml-0.5">*</span>
                </label>

                {/* 快捷原因胶囊 */}
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {[
                    "违反平台运营与合规规范",
                    "涉嫌数据违规爬取或接口滥用",
                    "空间安全与风控合规审查",
                    "长期闲置沉睡空间清理",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDisableReason(preset)}
                      className={`px-2.5 py-1 text-xs rounded-lg border font-bold transition-all cursor-pointer ${
                        disableReason === preset
                          ? "bg-amber-500 text-white border-amber-500 shadow-2xs"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={3}
                  required
                  value={disableReason}
                  onChange={(e) => setDisableReason(e.target.value)}
                  placeholder="请输入详细的停用管控理由（该理由将以站内信通知该空间的全体在编成员）..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-amber-500 focus:bg-white resize-none transition-all placeholder:text-slate-400"
                />
              </div>

              {/* 管控影响警示 */}
              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-xs text-amber-800 leading-relaxed space-y-1">
                <div className="font-black flex items-center gap-1 text-amber-900">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>执行停用管控后的系统联动效果：</span>
                </div>
                <p>1. 系统将自动向该工作空间的所有者及全体成员发送系统安全管控通知；</p>
                <p>2. 前台中枢将对该空间高亮标红「已停用管控」，阻断进入和敏感配置；</p>
                <p>3. 空间内所有组件算力调用与数据写入操作将被冻结，直至管理员解除管控。</p>
              </div>
            </div>

            {/* 底部操作常驻条 */}
            <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3 bg-slate-50/80 shrink-0">
              <button
                type="button"
                disabled={disableSubmitting}
                onClick={() => setDisablingWorkspace(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                disabled={disableSubmitting || !disableReason.trim()}
                onClick={handleConfirmDisable}
                className="px-5 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {disableSubmitting ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
                <span>确认实施停用管控</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
