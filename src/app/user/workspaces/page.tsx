"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { onWorkspaceLogoUpdated } from "@/lib/workspace-events";
import {
  FolderOpen,
  Building2,
  Users,
  ArrowRight,
  Search,
  Edit,
  Trash2,
  X,
  ExternalLink,
  Box,
  Coins,
  HardDrive,
  RotateCw,
  AlertCircle,
  LayoutGrid,
  List,
  Copy,
  Check,
  LogOut,
  ShieldAlert,
  FileText,
  ArrowUpRight,
  Loader2,
  Settings,
} from "lucide-react";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import StepUpAuthModal from "@/components/StepUpAuthModal";
import { DissolveWorkspaceCheckModal } from "@/components/workspace/DissolveWorkspaceCheckModal";
import { DissolvePersonalWorkspaceModal } from "@/components/workspace/DissolvePersonalWorkspaceModal";
import WorkspaceAppealModal from "@/components/workspace-hub/WorkspaceAppealModal";

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  ownerId?: string;
  description?: string | null;
  plan?: string;
  planExpiresAt?: string | null;
  planBillingCycle?: string | null;
  extraSeats?: number;
  status?: "ACTIVE" | "DISABLED" | "ARCHIVED" | string;
  industry?: string | null;
  teamSize?: string | null;
  lastActiveAt?: string | null;
  createdAt: string;
  updatedAt: string;
  joinedAt?: string;
  memberCount?: number;
  logo?: string;
  componentCount?: number;
  taskCount?: number;
  documentCount?: number;
  tokenBalance?: number;
  memberAvailableTokens?: number;
  monthlyTokenLimit?: number | null;
  monthlyTokenUsed?: number;
  storageUsed?: number;
  storageLimit?: number;
  apiCallsUsed?: number;
  apiCallsLimit?: number;
  isOwner?: boolean;
  role?: "OWNER" | "ADMIN" | "COMPONENT_MANAGER" | "KNOWLEDGE_MANAGER" | "MEMBER" | "VIEWER" | string;
  posts?: Array<{ name: string; color: string }>;
  disabledUntil?: string | null;
  disabledReason?: string | null;
  disabledDuration?: string | null;
  appealStatus?: "none" | "pending" | "approved" | "rejected" | string;
  appealCount?: number;
  workspacemember?: Array<{
    user: { name: string | null; email: string | null };
  }>;
}

interface WorkspaceSummary {
  membershipLevel: string;
  membershipNameZh: string;
  maxEnterpriseWorkspaces: number;
  ownedEnterpriseCount: number;
  joinedEnterpriseCount: number;
  maxCollaborateWorkspaces: number;
  walletBalance: number;
  personalTokens: number;
  ownedEnterpriseTokens: number;
  memberAllocatedTokens: number;
  totalAvailableTokens: number;
}

type FilterCategory = "ALL" | "PERSONAL" | "ENTERPRISE_OWNED" | "ENTERPRISE_JOINED";
type SortField = "updatedAt" | "tokenBalance" | "componentCount" | "storageUsed" | "createdAt";

const ROLE_META: Record<string, { label: string; style: string }> = {
  OWNER: {
    label: "空间所有者",
    style: "bg-amber-50 text-amber-700 border-amber-200/70",
  },
  ADMIN: {
    label: "空间管理员",
    style: "bg-purple-50 text-purple-700 border-purple-200/70",
  },
  COMPONENT_MANAGER: {
    label: "组件管理员",
    style: "bg-emerald-50 text-emerald-700 border-emerald-200/70",
  },
  KNOWLEDGE_MANAGER: {
    label: "知识管理员",
    style: "bg-cyan-50 text-cyan-700 border-cyan-200/70",
  },
  MEMBER: {
    label: "普通成员",
    style: "bg-slate-100 text-slate-600 border-slate-200/80",
  },
  VIEWER: {
    label: "只读访客",
    style: "bg-slate-100 text-slate-500 border-slate-200/80",
  },
};

const PLAN_LABELS: Record<string, string> = {
  STANDARD: "标准版",
  PRO: "专业版",
  TEAM: "团队版",
  ENTERPRISE: "企业版",
  FREE: "基础版",
};

export default function UserWorkspacesPage() {
  const toast = useToast();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<FilterCategory>("ALL");
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // 编辑模态框状态
  const [showEditModal, setShowEditModal] = useState(false);
  // 删除确认与前置合规盘点模态框状态
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [dissolveCheckEnterprise, setDissolveCheckEnterprise] = useState<Workspace | null>(null);
  const [dissolveCheckPersonal, setDissolveCheckPersonal] = useState<Workspace | null>(null);
  // 删除空间二次身份验证（后端 delete_workspace 场景强制校验）
  const [showDeleteStepUp, setShowDeleteStepUp] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [editFormData, setEditFormData] = useState({ name: "", description: "" });
  const [editNameError, setEditNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 停用管控申诉模态框状态
  const [appealWorkspace, setAppealWorkspace] = useState<Workspace | null>(null);

  // 协同成员退出企业空间状态（与空间中枢一致）
  const [leavingWorkspace, setLeavingWorkspace] = useState<Workspace | null>(null);
  const [scanningLeaveStats, setScanningLeaveStats] = useState(false);
  const [leaveStats, setLeaveStats] = useState<{ taskCount: number; assetCount: number } | null>(null);
  const [submittingLeave, setSubmittingLeave] = useState(false);

  useEffect(() => {
    loadWorkspaces();
  }, []);

  // 空间 Logo 变更时即时重拉（其他页面改了 Logo 回到这里也是最新）
  useEffect(() => onWorkspaceLogoUpdated(() => void loadWorkspaces()), []);

  const loadWorkspaces = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      const authToken = getAuthToken();
      const headers: Record<string, string> = {};
      if (authToken) {
        headers["Authorization"] = authToken.startsWith("Bearer ")
          ? authToken
          : `Bearer ${authToken}`;
      }

      const res = await fetch("/api/user/workspaces", {
        headers,
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data.data || []);
        if (data.summary) {
          setSummary(data.summary);
        }
        if (isManualRefresh) {
          toast.success("工作空间列表已刷新");
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        console.warn("Load workspaces failed:", res.status, errData);
        toast.error(errData.error || "加载工作空间列表失败");
      }
    } catch (error) {
      console.error("Load workspaces error:", error);
      toast.error("加载工作空间列表异常，请重试");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // 各分类空间计数
  const categoryCounts = useMemo(() => {
    const personal = workspaces.filter((w) => w.type === "PERSONAL").length;
    const enterpriseOwned = workspaces.filter((w) => w.type === "ENTERPRISE" && (w.isOwner || w.role === "OWNER")).length;
    const enterpriseJoined = workspaces.filter((w) => w.type === "ENTERPRISE" && !w.isOwner && w.role !== "OWNER").length;
    return {
      all: workspaces.length,
      personal,
      enterpriseOwned,
      enterpriseJoined,
      enterpriseTotal: enterpriseOwned + enterpriseJoined,
    };
  }, [workspaces]);

  // 过滤与排序后的工作空间列表
  const filteredWorkspaces = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    const list = workspaces.filter((workspace) => {
      const matchesSearch =
        !keyword ||
        workspace.name.toLowerCase().includes(keyword) ||
        workspace.id.toLowerCase().includes(keyword) ||
        (workspace.description && workspace.description.toLowerCase().includes(keyword)) ||
        (workspace.posts && workspace.posts.some((p) => p.name.toLowerCase().includes(keyword)));

      let matchesCategory = true;
      if (filterCategory === "PERSONAL") {
        matchesCategory = workspace.type === "PERSONAL";
      } else if (filterCategory === "ENTERPRISE_OWNED") {
        matchesCategory = workspace.type === "ENTERPRISE" && Boolean(workspace.isOwner || workspace.role === "OWNER");
      } else if (filterCategory === "ENTERPRISE_JOINED") {
        matchesCategory = workspace.type === "ENTERPRISE" && !workspace.isOwner && workspace.role !== "OWNER";
      }
      return matchesSearch && matchesCategory;
    });

    return [...list].sort((a, b) => {
      // 个人空间在同等条件下保持置顶，方便快速定位默认沙箱
      if (sortField === "updatedAt") {
        const tA = new Date(a.lastActiveAt || a.updatedAt || a.createdAt).getTime();
        const tB = new Date(b.lastActiveAt || b.updatedAt || b.createdAt).getTime();
        return tB - tA;
      }
      if (sortField === "tokenBalance") {
        const balA = a.isOwner || a.role === "OWNER" ? (a.tokenBalance || 0) : (a.memberAvailableTokens || 0);
        const balB = b.isOwner || b.role === "OWNER" ? (b.tokenBalance || 0) : (b.memberAvailableTokens || 0);
        return balB - balA;
      }
      if (sortField === "componentCount") {
        return (b.componentCount || 0) - (a.componentCount || 0);
      }
      if (sortField === "storageUsed") {
        return (b.storageUsed || 0) - (a.storageUsed || 0);
      }
      const cA = new Date(a.createdAt).getTime();
      const cB = new Date(b.createdAt).getTime();
      return cB - cA;
    });
  }, [workspaces, searchTerm, filterCategory, sortField]);

  // 客户端分页状态管理（网格与列表视图统一生效）
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(6);

  // 筛选条件或搜索关键词变更时重置至第 1 页
  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterCategory, sortField]);

  const totalPages = Math.max(1, Math.ceil(filteredWorkspaces.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pagedWorkspaces = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredWorkspaces.slice(start, start + pageSize);
  }, [filteredWorkspaces, safePage, pageSize]);

  const formatTimeAgo = (dateString?: string | null) => {
    if (!dateString) return "刚刚";
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "刚刚";
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} 天前`;
    return date.toLocaleDateString("zh-CN");
  };

  const formatStorage = (bytes?: number) => {
    if (!bytes || bytes <= 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
  };

  const totalTokens =
    summary?.totalAvailableTokens ??
    workspaces.reduce(
      (sum, ws) =>
        sum + (ws.isOwner || ws.role === "OWNER" ? (ws.tokenBalance || 0) : (ws.memberAvailableTokens || 0)),
      0
    );

  const handleCopyWorkspaceId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success("空间 ID 已复制到剪贴板");
    setTimeout(() => {
      setCopiedId((prev) => (prev === id ? null : prev));
    }, 2000);
  };

  const handleEdit = (workspace: Workspace) => {
    setSelectedWorkspace(workspace);
    setEditFormData({
      name: workspace.name,
      description: workspace.description || "",
    });
    setEditNameError(null);
    setShowEditModal(true);
  };

  // 删除/解散空间：先走合规资产与成员盘点（与空间中枢一致），通过后再进入确认与二次身份验证
  const handleDelete = (workspace: Workspace) => {
    setSelectedWorkspace(workspace);
    if (workspace.type === "ENTERPRISE") {
      setDissolveCheckEnterprise(workspace);
    } else {
      setDissolveCheckPersonal(workspace);
    }
  };

  const handleDissolveCheckPassed = (workspaceId: string) => {
    const target = workspaces.find((w) => w.id === workspaceId) || selectedWorkspace;
    setDissolveCheckEnterprise(null);
    setDissolveCheckPersonal(null);
    if (target) {
      setSelectedWorkspace(target);
      setShowDeleteConfirm(true);
    }
  };

  // 协同成员点击退出协作空间：拉取退出前个人任务与资产统计
  const handleInitiateLeave = async (workspace: Workspace) => {
    setLeavingWorkspace(workspace);
    setScanningLeaveStats(true);
    setLeaveStats(null);
    try {
      const authToken = getAuthToken();
      const res = await fetch(`/api/workspace/member-stats?workspaceId=${encodeURIComponent(workspace.id)}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setLeaveStats(data.stats || { taskCount: 0, assetCount: 0 });
      } else {
        setLeaveStats({ taskCount: 0, assetCount: 0 });
      }
    } catch {
      setLeaveStats({ taskCount: 0, assetCount: 0 });
    } finally {
      setScanningLeaveStats(false);
    }
  };

  const handleConfirmLeave = async () => {
    if (!leavingWorkspace) return;
    setSubmittingLeave(true);
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/workspace/leave", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ workspaceId: leavingWorkspace.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        toast.success(data.message || `已退出企业空间 [${leavingWorkspace.name}]`);
        setLeavingWorkspace(null);
        loadWorkspaces();
      } else {
        toast.error(data.error || data.message || "退出空间失败，请稍后重试");
      }
    } catch {
      toast.error("网络异常，退出空间失败");
    } finally {
      setSubmittingLeave(false);
    }
  };

  const confirmDelete = async (verifyToken?: string) => {
    if (!selectedWorkspace) return;

    try {
      setSubmitting(true);
      const authToken = getAuthToken();
      const res = await fetch(`/api/user/workspaces?id=${selectedWorkspace.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ verifyToken: verifyToken || "" }),
      });

      if (res.ok) {
        toast.success(`工作空间 [${selectedWorkspace.name}] 已删除`);
        loadWorkspaces();
        setShowDeleteConfirm(false);
        setSelectedWorkspace(null);
      } else {
        const error = await res.json();
        // 高危操作需二次身份验证：确认弹窗通过后拉起密码验证
        if (error.error === "SEC_AUTH_REQUIRED" || error.error === "SEC_AUTH_INVALID") {
          setShowDeleteConfirm(false);
          setShowDeleteStepUp(true);
          return;
        }
        toast.error(error.message || error.error || "删除空间失败");
      }
    } catch (error) {
      console.error("Delete workspace error:", error);
      toast.error("删除空间异常，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkspace) return;
    if (!editFormData.name.trim()) {
      setEditNameError("工作空间名称不能为空");
      return;
    }

    try {
      setSubmitting(true);
      const authToken = getAuthToken();
      const res = await fetch(`/api/user/workspaces?id=${selectedWorkspace.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(editFormData),
      });

      if (res.ok) {
        toast.success("工作空间信息修改成功");
        loadWorkspaces();
        setShowEditModal(false);
        setSelectedWorkspace(null);
        setEditNameError(null);
      } else {
        const error = await res.json();
        const msg = error.message || error.error || "更新空间信息失败";
        if (msg.includes("名称") || msg.includes("工作空间")) {
          setEditNameError(msg);
        } else {
          toast.error(msg);
        }
      }
    } catch (error) {
      console.warn("Update workspace error:", error);
      toast.error("网络异常，更新空间信息失败");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 font-sans">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          <div className="space-y-2">
            <div className="h-7 w-48 zg-skeleton rounded-lg" />
            <div className="h-4 w-96 max-w-full zg-skeleton rounded-md" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-20 zg-skeleton rounded-lg" />
            <div className="h-9 w-32 zg-skeleton rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 zg-skeleton rounded-2xl" />
          ))}
        </div>
        <div className="h-14 zg-skeleton rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-64 zg-skeleton rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* 1. 页面标题栏及全局快捷入口 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
              <FolderOpen className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">我的工作空间</h1>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1.5 ml-10">
            查看和管理您的个人空间与企业空间，包括成员、已安装组件、算力点余额和存储用量。
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 ml-10 sm:ml-0">
          <button
            type="button"
            onClick={() => loadWorkspaces(true)}
            disabled={refreshing}
            className="zg-btn zg-btn-default text-xs h-9 px-3.5 gap-1.5"
            title="刷新空间数据"
          >
            <RotateCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
            <span>刷新</span>
          </button>
          <button
            type="button"
            onClick={() => router.push("/workspace-hub")}
            className="zg-btn zg-btn-primary text-xs h-9 px-4 gap-1.5 font-bold"
          >
            <span>前往空间中枢</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-90" />
          </button>
        </div>
      </div>

      {/* 2. 4 项核心数据指标统计卡片（可交互快筛） */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 全部空间 */}
        <div
          onClick={() => setFilterCategory("ALL")}
          className={`zg-card p-4.5 cursor-pointer transition-all flex items-center justify-between group ${
            filterCategory === "ALL" ? "ring-2 ring-[#3182ce] shadow-sm" : "hover:border-[#3182ce]/40"
          }`}
        >
          <div>
            <div className="text-[11px] text-slate-400 font-bold mb-1 flex items-center gap-1.5">
              <span>全部空间</span>
              {filterCategory === "ALL" && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#3182ce] animate-pulse" />
              )}
            </div>
            <div className="text-2xl font-black text-slate-800 tracking-tight">
              {categoryCounts.all}
              <span className="text-xs font-normal text-slate-400 ml-1">个</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">包含个人空间与企业空间</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#3182ce]/10 text-[#3182ce] flex items-center justify-center group-hover:scale-105 transition-transform">
            <FolderOpen className="w-5 h-5" />
          </div>
        </div>

        {/* 个人空间 */}
        <div
          onClick={() => setFilterCategory("PERSONAL")}
          className={`zg-card p-4.5 cursor-pointer transition-all flex items-center justify-between group ${
            filterCategory === "PERSONAL" ? "ring-2 ring-[#2b6cb0] shadow-sm" : "hover:border-[#2b6cb0]/40"
          }`}
        >
          <div>
            <div className="text-[11px] text-slate-400 font-bold mb-1 flex items-center gap-1.5">
              <span>个人空间</span>
              {filterCategory === "PERSONAL" && (
                <span className="w-1.5 h-1.5 rounded-full bg-[#2b6cb0] animate-pulse" />
              )}
            </div>
            <div className="text-2xl font-black text-[#2b6cb0] tracking-tight">
              {categoryCounts.personal}
              <span className="text-xs font-normal text-slate-400 ml-1">个</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">个人日常独立使用</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#2b6cb0]/10 text-[#2b6cb0] flex items-center justify-center group-hover:scale-105 transition-transform">
            <Users className="w-5 h-5" />
          </div>
        </div>

        {/* 企业空间 */}
        <div
          onClick={() => setFilterCategory(categoryCounts.enterpriseOwned > 0 ? "ENTERPRISE_OWNED" : "ENTERPRISE_JOINED")}
          className={`zg-card p-4.5 cursor-pointer transition-all flex items-center justify-between group ${
            filterCategory.startsWith("ENTERPRISE") ? "ring-2 ring-emerald-500 shadow-sm" : "hover:border-emerald-500/40"
          }`}
        >
          <div>
            <div className="text-[11px] text-slate-400 font-bold mb-1 flex items-center gap-1.5">
              <span>企业空间</span>
              {filterCategory.startsWith("ENTERPRISE") && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </div>
            <div className="text-2xl font-black text-emerald-600 tracking-tight">
              {categoryCounts.enterpriseTotal}
              <span className="text-xs font-normal text-slate-400 ml-1">个</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              创建 {categoryCounts.enterpriseOwned} 个 · 加入 {categoryCounts.enterpriseJoined} 个
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Building2 className="w-5 h-5" />
          </div>
        </div>

        {/* 可用算力点 */}
        <div
          onClick={() => router.push("/user/points")}
          className="zg-card p-4.5 cursor-pointer transition-all flex items-center justify-between group hover:border-[#dd6b20]/40"
          title="点击进入我的算力中心"
        >
          <div>
            <div className="text-[11px] text-[#dd6b20] font-bold mb-1 flex items-center gap-1">
              <span>可用算力点</span>
              <ArrowUpRight className="w-3 h-3 text-[#dd6b20] opacity-70 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="text-2xl font-black font-mono text-[#dd6b20] tracking-tight">
              {totalTokens.toLocaleString()}
              <span className="text-xs font-bold text-[#dd6b20]/80 ml-1 font-sans">点</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              个人钱包 {summary?.walletBalance ? summary.walletBalance.toLocaleString() : "0"} · 空间额度 {(totalTokens - (summary?.walletBalance || 0) > 0 ? totalTokens - (summary?.walletBalance || 0) : 0).toLocaleString()}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#dd6b20]/10 text-[#dd6b20] flex items-center justify-center group-hover:scale-105 transition-transform">
            <Coins className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. 分类筛选、排序与搜索工具栏 */}
      <div className="zg-card p-4 space-y-3 sm:space-y-0 sm:flex sm:items-center sm:justify-between gap-3">
        {/* 分类切换 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { key: "ALL", label: "全部", count: categoryCounts.all },
            { key: "PERSONAL", label: "个人空间", count: categoryCounts.personal },
            { key: "ENTERPRISE_OWNED", label: "我创建的", count: categoryCounts.enterpriseOwned },
            { key: "ENTERPRISE_JOINED", label: "我加入的", count: categoryCounts.enterpriseJoined },
          ].map((tab) => {
            const active = filterCategory === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterCategory(tab.key as FilterCategory)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  active
                    ? "bg-[#3182ce] text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    active ? "bg-white/20 text-white" : "bg-slate-200/80 text-slate-500"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 搜索框、排序与视图切换 */}
        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
          {/* 实时搜索输入框 */}
          <div className="relative min-w-[200px] flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="按空间名、ID或岗位搜索..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="zg-input pl-8.5 text-xs h-8.5"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* 排序选择 */}
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="zg-input text-xs h-8.5 w-auto px-2.5 bg-white text-slate-700 font-medium cursor-pointer"
          >
            <option value="updatedAt">按最近使用排序</option>
            <option value="tokenBalance">按算力点从多到少</option>
            <option value="componentCount">按组件数从多到少</option>
            <option value="storageUsed">按存储用量从大到小</option>
            <option value="createdAt">按创建时间从新到旧</option>
          </select>

          {/* 视图模式切换 */}
          <div className="inline-flex items-center rounded-lg border border-slate-200/80 p-0.5 bg-slate-50">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === "grid" ? "bg-white text-[#3182ce] shadow-2xs" : "text-slate-400 hover:text-slate-600"
              }`}
              title="卡片视图"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === "list" ? "bg-white text-[#3182ce] shadow-2xs" : "text-slate-400 hover:text-slate-600"
              }`}
              title="列表视图"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 4. 空间列表展示容器 */}
      <div className="zg-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full" />
            <h2 className="text-sm font-bold text-slate-800">工作空间列表</h2>
            {summary && (
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100/90 px-2 py-0.5 rounded-md ml-1">
                已创建企业空间: {summary.ownedEnterpriseCount} / {summary.maxEnterpriseWorkspaces}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
            <span>
              共显示 <strong className="text-slate-700 font-mono">{filteredWorkspaces.length}</strong> / {workspaces.length} 个空间
            </span>
          </div>
        </div>

        {filteredWorkspaces.length > 0 ? (
          <>
            {viewMode === "grid" ? (
              /* 网格视图 */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4.5">
                {pagedWorkspaces.map((workspace) => {
                const roleInfo = ROLE_META[workspace.role || (workspace.isOwner ? "OWNER" : "MEMBER")] || ROLE_META.MEMBER;
                const isDisabled = workspace.status === "DISABLED";
                const isArchived = workspace.status === "ARCHIVED";
                const isOwner = workspace.isOwner || workspace.role === "OWNER";
                const isAdmin = workspace.role === "ADMIN";

                return (
                  <div
                    key={workspace.id}
                    className={`group relative p-5 rounded-xl border transition-all duration-200 flex flex-col justify-between ${
                      isDisabled
                        ? "bg-rose-50/20 border-rose-200/80 hover:border-rose-300"
                        : isArchived
                        ? "bg-slate-50/80 border-slate-200/80"
                        : "bg-slate-50/60 hover:bg-white border-slate-200/80 hover:border-[#3182ce]/40 hover:shadow-sm"
                    }`}
                  >
                    <div>
                      {/* 顶栏：Logo、名称、ID复制、角色/状态徽章、操作按钮 */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden shadow-2xs ${
                              isDisabled
                                ? "bg-rose-100 text-rose-600"
                                : workspace.type === "ENTERPRISE"
                                ? "bg-emerald-50 text-emerald-600 border border-emerald-200/60"
                                : "bg-blue-50 text-[#2b6cb0] border border-blue-200/60"
                            }`}
                          >
                            {workspace.logo ? (
                              <img
                                src={workspace.logo}
                                alt={workspace.name}
                                className="w-11 h-11 rounded-xl object-cover"
                              />
                            ) : workspace.type === "ENTERPRISE" ? (
                              <Building2 className="w-5 h-5" />
                            ) : (
                              <FolderOpen className="w-5 h-5" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3
                                className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate max-w-[200px]"
                                title={workspace.name}
                              >
                                {workspace.name}
                              </h3>
                              {/* 空间 ID 快速复制 */}
                              <button
                                type="button"
                                onClick={() => handleCopyWorkspaceId(workspace.id)}
                                className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 hover:text-slate-600 px-1 py-0.5 rounded hover:bg-slate-200/60 transition-colors"
                                title="点击复制工作空间唯一 ID"
                              >
                                <span>{workspace.id.length > 14 ? `${workspace.id.slice(0, 8)}...` : workspace.id}</span>
                                {copiedId === workspace.id ? (
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-2.5 h-2.5 opacity-60" />
                                )}
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {/* 空间类型徽章 */}
                              <span
                                className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                  workspace.type === "ENTERPRISE"
                                    ? "bg-emerald-50 text-emerald-600 border border-emerald-200/60"
                                    : "bg-blue-50 text-[#2b6cb0] border border-blue-200/60"
                                }`}
                              >
                                {workspace.type === "ENTERPRISE" ? "企业空间" : "个人空间"}
                              </span>

                              {/* 角色徽章 */}
                              <span
                                className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold border ${roleInfo.style}`}
                              >
                                {roleInfo.label}
                              </span>

                              {/* 套餐徽章 */}
                              {workspace.type === "ENTERPRISE" && (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
                                  {PLAN_LABELS[workspace.plan || "STANDARD"] || workspace.plan}
                                </span>
                              )}

                              {/* 状态徽章 */}
                              {isDisabled && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                  <AlertCircle className="w-2.5 h-2.5" />
                                  管控中
                                </span>
                              )}
                              {isArchived && (
                                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                  只读归档
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* 顶栏操作：编辑、退出、删除 */}
                        <div className="flex items-center gap-1 shrink-0">
                          {(isOwner || isAdmin) && !isDisabled && !isArchived && (
                            <button
                              type="button"
                              onClick={() => handleEdit(workspace)}
                              className="p-1.5 text-slate-400 hover:text-[#3182ce] hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                              title="编辑空间信息"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!isOwner && workspace.type === "ENTERPRISE" && !isDisabled && !isArchived && (
                            <button
                              type="button"
                              onClick={() => handleInitiateLeave(workspace)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title="退出企业空间"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isOwner && (
                            <button
                              type="button"
                              onClick={() => handleDelete(workspace)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title={workspace.type === "ENTERPRISE" ? "解散企业空间" : "删除个人空间"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 停用管控横幅 */}
                      {isDisabled && (
                        <div className="mb-3 p-2.5 rounded-lg bg-rose-50/90 border border-rose-200 text-xs text-rose-800 space-y-1">
                          <div className="flex items-center justify-between flex-wrap gap-1">
                            <span className="font-bold flex items-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                              <span>
                                管控截止：{workspace.disabledUntil ? new Date(workspace.disabledUntil).toLocaleString("zh-CN") : "永久管控"}
                              </span>
                            </span>
                            {workspace.appealStatus === "pending" && (
                              <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.2 rounded border border-purple-200">
                                申诉审核中
                              </span>
                            )}
                            {workspace.appealStatus === "rejected" && (
                              <span className="text-[10px] font-bold text-slate-600 bg-slate-200 px-1.5 py-0.2 rounded">
                                申诉已驳回
                              </span>
                            )}
                          </div>
                          {workspace.disabledReason && (
                            <div className="text-[11px] text-rose-700 font-medium line-clamp-1" title={workspace.disabledReason}>
                              原因：{workspace.disabledReason}
                            </div>
                          )}
                          {isOwner && workspace.appealStatus !== "pending" && (
                            <div className="pt-1 flex justify-end">
                              <button
                                type="button"
                                onClick={() => setAppealWorkspace(workspace)}
                                className="text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 px-2.5 py-1 rounded-md transition-colors cursor-pointer inline-flex items-center gap-1"
                              >
                                <ShieldAlert className="w-3 h-3" />
                                去申诉解封
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* 空间简介 */}
                      <p className="text-xs text-slate-500 line-clamp-2 mt-1 mb-3.5 min-h-[32px] leading-relaxed">
                        {workspace.description || "暂无空间简介，点击右上角编辑按钮可添加说明。"}
                      </p>

                      {/* 4 项核心数据统计 */}
                      <div className="grid grid-cols-4 gap-1.5 p-2 rounded-lg bg-white border border-slate-100 mb-3 text-center">
                        <div>
                          <div className="text-[10px] text-slate-400 font-bold flex items-center justify-center gap-0.5 mb-0.5">
                            <Box className="w-3 h-3 text-[#3182ce]" />
                            已装组件
                          </div>
                          <div className="text-xs font-black text-slate-700">
                            {workspace.componentCount || 0}
                            <span className="text-[10px] font-normal text-slate-400 ml-0.5">项</span>
                          </div>
                        </div>

                        <div className="border-l border-slate-100">
                          <div className="text-[10px] text-slate-400 font-bold flex items-center justify-center gap-0.5 mb-0.5">
                            <Users className="w-3 h-3 text-emerald-600" />
                            成员人数
                          </div>
                          <div className="text-xs font-black text-slate-700">
                            {workspace.memberCount || 1}
                            <span className="text-[10px] font-normal text-slate-400 ml-0.5">人</span>
                          </div>
                        </div>

                        <div className="border-l border-slate-100">
                          <div className="text-[10px] text-slate-400 font-bold flex items-center justify-center gap-0.5 mb-0.5">
                            <FileText className="w-3 h-3 text-cyan-600" />
                            累计任务
                          </div>
                          <div className="text-xs font-black text-slate-700">
                            {workspace.taskCount || 0}
                            <span className="text-[10px] font-normal text-slate-400 ml-0.5">次</span>
                          </div>
                        </div>

                        <div className="border-l border-slate-100">
                          <div className="text-[10px] text-[#dd6b20] font-bold flex items-center justify-center gap-0.5 mb-0.5">
                            <Coins className="w-3 h-3 text-[#dd6b20]" />
                            {isOwner ? "空间算力点" : "可用算力点"}
                          </div>
                          <div className="text-xs font-black text-[#dd6b20] font-mono">
                            {(isOwner ? (workspace.tokenBalance || 0) : (workspace.memberAvailableTokens || 0)).toLocaleString()}
                            <span className="text-[10px] font-normal text-[#dd6b20]/70 ml-0.5 font-sans">点</span>
                          </div>
                        </div>
                      </div>

                      {/* 岗位徽章（若有） */}
                      {workspace.posts && workspace.posts.length > 0 && (
                        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                          <span className="text-[10px] text-slate-400 font-medium">我的岗位:</span>
                          {workspace.posts.map((p, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] font-bold px-2 py-0.2 rounded-md border"
                              style={{
                                backgroundColor: `${p.color}10`,
                                color: p.color,
                                borderColor: `${p.color}30`,
                              }}
                            >
                              {p.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* 存储空间进度条 */}
                      <div className="mb-2">
                        <div className="flex items-center justify-between text-[11px] mb-1">
                          <span className="text-slate-400 flex items-center gap-1">
                            <HardDrive className="w-3 h-3 text-slate-400" />
                            存储空间
                          </span>
                          <span className="text-slate-600 font-medium font-mono text-[10px]">
                            {formatStorage(workspace.storageUsed)} / {formatStorage(workspace.storageLimit)}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-[#3182ce] to-[#10b981] rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(
                                  4,
                                  ((workspace.storageUsed || 0) / (workspace.storageLimit || 1073741824)) * 100
                                )
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* 卡片底栏操作与快捷入口 */}
                    <div className="pt-3 border-t border-slate-100 mt-2 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>最近更新：{formatTimeAgo(workspace.lastActiveAt || workspace.updatedAt)}</span>
                        {workspace.type === "ENTERPRISE" && isOwner && (
                          <button
                            type="button"
                            onClick={() => router.push(`/user/billing-center?workspaceId=${workspace.id}`)}
                            className="text-[11px] font-bold text-[#3182ce] hover:text-[#2b6cb0] flex items-center gap-0.5 cursor-pointer"
                          >
                            <span>升级套餐</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1.5">
                        {/* 快捷操作按钮组 */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => router.push(`/workspace/${workspace.id}?tab=components`)}
                            className="inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-bold text-[#2b6cb0] bg-[#f0f7ff] hover:bg-[#3182ce] hover:text-white rounded border border-[#bee3f8] hover:border-[#3182ce] shadow-2xs transition-all cursor-pointer active:scale-95"
                            title="前往管理空间已安装组件"
                          >
                            <Box className="w-3 h-3 shrink-0" />
                            <span>组件</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => router.push(`/workspace/${workspace.id}?tab=tasks`)}
                            className="inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-bold text-[#2b6cb0] bg-[#f0f7ff] hover:bg-[#3182ce] hover:text-white rounded border border-[#bee3f8] hover:border-[#3182ce] shadow-2xs transition-all cursor-pointer active:scale-95"
                            title="前往查看空间任务执行历史"
                          >
                            <FileText className="w-3 h-3 shrink-0" />
                            <span>任务</span>
                          </button>
                          {workspace.type === "ENTERPRISE" && (isOwner || isAdmin) && (
                            <button
                              type="button"
                              onClick={() => router.push(`/workspace/${workspace.id}?tab=members`)}
                              className="inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-bold text-[#2b6cb0] bg-[#f0f7ff] hover:bg-[#3182ce] hover:text-white rounded border border-[#bee3f8] hover:border-[#3182ce] shadow-2xs transition-all cursor-pointer active:scale-95"
                              title="前往管理企业成员与岗位权限"
                            >
                              <Users className="w-3 h-3 shrink-0" />
                              <span>成员</span>
                            </button>
                          )}
                          {(isOwner || isAdmin) && (
                            <button
                              type="button"
                              onClick={() => router.push(`/workspace/${workspace.id}?tab=settings`)}
                              className="inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-bold text-[#2b6cb0] bg-[#f0f7ff] hover:bg-[#3182ce] hover:text-white rounded border border-[#bee3f8] hover:border-[#3182ce] shadow-2xs transition-all cursor-pointer active:scale-95"
                              title="前往配置空间参数与安全策略"
                            >
                              <Settings className="w-3 h-3 shrink-0" />
                              <span>设置</span>
                            </button>
                          )}
                        </div>

                        {/* 进入空间主按钮 */}
                        {isDisabled ? (
                          <span className="px-3 py-1.5 rounded text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200">
                            空间受限
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => router.push(`/workspace/${workspace.id}`)}
                            className="inline-flex items-center gap-1.5 h-7 px-3 text-xs font-bold text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:brightness-105 rounded shadow-2xs transition-all cursor-pointer active:scale-95 shrink-0"
                          >
                            <span>{isArchived ? "查看（只读）" : "进入工作台"}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* 列表视图：对齐管理员后台标准数据表格，彻底杜绝换行挤压 */
            <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-2xs">
              <table className="w-full text-left text-xs min-w-[980px] border-collapse">
                <thead className="bg-slate-50/95 backdrop-blur-xs border-b border-slate-200/80 text-[11px] text-slate-500 font-bold sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-3.5 whitespace-nowrap min-w-[200px]">空间名称 / ID</th>
                    <th className="py-3 px-3 whitespace-nowrap min-w-[110px]">空间类型</th>
                    <th className="py-3 px-3 whitespace-nowrap min-w-[110px]">我的角色</th>
                    <th className="py-3 px-3 text-center whitespace-nowrap min-w-[80px]">已装组件</th>
                    <th className="py-3 px-3 text-center whitespace-nowrap min-w-[80px]">成员人数</th>
                    <th className="py-3 px-3 text-right whitespace-nowrap min-w-[100px]">可用算力点</th>
                    <th className="py-3 px-3 text-center whitespace-nowrap min-w-[90px]">已用存储</th>
                    <th className="py-3 px-3 whitespace-nowrap min-w-[100px]">最近更新</th>
                    <th className="py-3 px-4 text-right whitespace-nowrap min-w-[230px] sticky right-0 z-10 bg-slate-50/95 border-l border-slate-200/80 shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)]">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                  {pagedWorkspaces.map((workspace) => {
                    const roleInfo = ROLE_META[workspace.role || (workspace.isOwner ? "OWNER" : "MEMBER")] || ROLE_META.MEMBER;
                    const isDisabled = workspace.status === "DISABLED";
                    const isOwner = workspace.isOwner || workspace.role === "OWNER";
                    const isAdmin = workspace.role === "ADMIN";

                    return (
                      <tr key={workspace.id} className="hover:bg-blue-50/25 transition-colors group">
                        <td className="py-3 px-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                workspace.type === "ENTERPRISE" ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-[#3182ce]"
                              }`}
                            >
                              {workspace.type === "ENTERPRISE" ? <Building2 className="w-4 h-4" /> : <FolderOpen className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-800 truncate max-w-[190px]" title={workspace.name}>
                                {workspace.name}
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopyWorkspaceId(workspace.id)}
                                className="text-[10px] font-mono text-slate-400 hover:text-slate-600 flex items-center gap-0.5 cursor-pointer mt-0.5"
                                title="点击复制工作空间唯一 ID"
                              >
                                <span>{workspace.id.length > 16 ? `${workspace.id.slice(0, 10)}...` : workspace.id}</span>
                                {copiedId === workspace.id ? (
                                  <Check className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                ) : (
                                  <Copy className="w-2.5 h-2.5 opacity-50 shrink-0" />
                                )}
                              </button>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 whitespace-nowrap">
                              {workspace.type === "ENTERPRISE" ? "企业空间" : "个人空间"}
                            </span>
                            {workspace.type === "ENTERPRISE" && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 whitespace-nowrap">
                                {PLAN_LABELS[workspace.plan || "STANDARD"] || workspace.plan}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${roleInfo.style}`}>
                            {roleInfo.label}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap font-bold text-slate-700">
                          {workspace.componentCount || 0}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap font-bold text-slate-700">
                          {workspace.memberCount || 1}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap font-mono font-bold text-[#dd6b20]">
                          {(isOwner ? (workspace.tokenBalance || 0) : (workspace.memberAvailableTokens || 0)).toLocaleString()} 点
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap font-mono text-[11px] text-slate-500">
                          {formatStorage(workspace.storageUsed)}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap text-slate-400 text-[11px]">
                          {formatTimeAgo(workspace.lastActiveAt || workspace.updatedAt)}
                        </td>
                        <td className="sticky right-0 z-10 py-3 px-4 text-right whitespace-nowrap bg-white group-hover:bg-[#f6f9fe] border-l border-slate-200/80 shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)]">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => router.push(`/workspace/${workspace.id}?tab=components`)}
                              className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-bold text-[#2b6cb0] bg-[#f0f7ff] hover:bg-[#3182ce] hover:text-white rounded border border-[#bee3f8] hover:border-[#3182ce] shadow-2xs transition-all cursor-pointer whitespace-nowrap shrink-0"
                              title="前往管理空间已安装组件"
                            >
                              <Box className="w-3.5 h-3.5 shrink-0" />
                              <span className="whitespace-nowrap">组件</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => router.push(`/workspace/${workspace.id}?tab=tasks`)}
                              className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-bold text-[#2b6cb0] bg-[#f0f7ff] hover:bg-[#3182ce] hover:text-white rounded border border-[#bee3f8] hover:border-[#3182ce] shadow-2xs transition-all cursor-pointer whitespace-nowrap shrink-0"
                              title="前往查看空间任务执行历史"
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span className="whitespace-nowrap">任务</span>
                            </button>
                            {(isOwner || isAdmin) && (
                              <button
                                type="button"
                                onClick={() => router.push(`/workspace/${workspace.id}?tab=settings`)}
                                className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-bold text-[#2b6cb0] bg-[#f0f7ff] hover:bg-[#3182ce] hover:text-white rounded border border-[#bee3f8] hover:border-[#3182ce] shadow-2xs transition-all cursor-pointer whitespace-nowrap shrink-0"
                                title="前往配置空间参数与安全策略"
                              >
                                <Settings className="w-3.5 h-3.5 shrink-0" />
                                <span className="whitespace-nowrap">设置</span>
                              </button>
                            )}
                            {(isOwner || isAdmin) && !isDisabled && (
                              <button
                                type="button"
                                onClick={() => handleEdit(workspace)}
                                className="p-1.5 text-slate-400 hover:text-[#3182ce] rounded hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                                title="编辑空间信息"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => router.push(`/workspace/${workspace.id}`)}
                              className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-bold text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:brightness-105 rounded shadow-2xs transition-all cursor-pointer whitespace-nowrap shrink-0"
                            >
                              <span className="whitespace-nowrap">进入</span>
                              <ArrowRight className="w-3 h-3 shrink-0" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 常驻底部分页控制栏（网格与列表视图统一对齐系统规范） */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-5 mt-2 border-t border-slate-100 text-xs text-slate-500">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span>
                共 <strong className="font-mono font-bold text-slate-700">{filteredWorkspaces.length}</strong> 个空间 · 第{" "}
                <strong className="font-mono font-bold text-slate-700">{safePage}</strong> / {totalPages} 页
              </span>
              <span className="text-slate-300">|</span>
              <label className="inline-flex items-center gap-1.5">
                <span>每页显示</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value) || 6);
                    setPage(1);
                  }}
                  className="h-7.5 px-2.5 rounded border border-slate-200 bg-white text-[11px] font-semibold text-slate-700 outline-none focus:border-[#3182ce] cursor-pointer"
                >
                  <option value={6}>6 个</option>
                  <option value={10}>10 个</option>
                  <option value={20}>20 个</option>
                  <option value={50}>50 个</option>
                </select>
              </label>
            </div>

            <div className="flex items-center gap-1.5 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setPage(1)}
                disabled={safePage <= 1}
                className="zg-btn zg-btn-default !text-xs !h-7.5 !px-2.5 disabled:opacity-40"
              >
                首页
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="zg-btn zg-btn-default !text-xs !h-7.5 !px-3 disabled:opacity-40"
              >
                上一页
              </button>
              <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200/80 font-mono text-[11px] font-bold text-slate-700">
                第 {safePage} / {totalPages} 页
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="zg-btn zg-btn-default !text-xs !h-7.5 !px-3 disabled:opacity-40"
              >
                下一页
              </button>
              <button
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={safePage >= totalPages}
                className="zg-btn zg-btn-default !text-xs !h-7.5 !px-2.5 disabled:opacity-40"
              >
                末页
              </button>
            </div>
          </div>
        </>
      ) : (
          <div className="text-center py-14">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <FolderOpen className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-700 mb-1">
              {searchTerm || filterCategory !== "ALL" ? "未找到符合条件的工作空间" : "暂无可用的工作空间"}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4 leading-relaxed">
              {searchTerm || filterCategory !== "ALL"
                ? "请尝试更换搜索词或切换分类筛选"
                : "如需创建新的企业空间或个人空间，请前往空间中枢办理。"}
            </p>
            <div className="flex items-center justify-center gap-2">
              {(searchTerm || filterCategory !== "ALL") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("");
                    setFilterCategory("ALL");
                  }}
                  className="zg-btn zg-btn-default text-xs h-8.5 px-3.5"
                >
                  重置筛选
                </button>
              )}
              <button
                type="button"
                onClick={() => router.push("/workspace-hub")}
                className="zg-btn zg-btn-primary text-xs h-8.5 px-4 font-bold"
              >
                <span>前往空间中枢</span>
                <ExternalLink className="w-3.5 h-3.5 ml-1" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 编辑模态框 */}
      {showEditModal && selectedWorkspace && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 relative border border-slate-100">
            <button
              onClick={() => setShowEditModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="text-base font-bold text-slate-800 mb-4">编辑工作空间信息</h3>
            <form onSubmit={handleUpdateWorkspace}>
              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-700 font-bold mb-1">
                    <span className="zg-required">工作空间名称</span>
                  </label>
                  <input
                    type="text"
                    value={editFormData.name}
                    onChange={(e) => {
                      setEditFormData({ ...editFormData, name: e.target.value });
                      if (editNameError) setEditNameError(null);
                    }}
                    className={`w-full px-3 py-2 text-xs rounded-lg border outline-none transition-all ${
                      editNameError
                        ? "border-red-500 bg-red-50/15 text-red-900 focus:border-red-500 focus:ring-2 focus:ring-red-500/15"
                        : "border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                    }`}
                    placeholder="请输入工作空间名称"
                  />
                  {editNameError && (
                    <p className="text-xs text-red-600 flex items-center gap-1 mt-1 font-medium animate-in fade-in">
                      <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      <span>{editNameError}</span>
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-slate-700 font-bold mb-1">空间简介</label>
                  <textarea
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    className="w-full p-3 text-xs rounded-lg border border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none transition-all resize-none"
                    rows={3}
                    placeholder="请输入工作空间简介..."
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] rounded-lg transition-colors disabled:opacity-50"
                >
                  {submitting ? "正在保存..." : "保存修改"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5.1 企业空间解散前置合规检测弹窗 */}
      {dissolveCheckEnterprise && (
        <DissolveWorkspaceCheckModal
          isOpen={Boolean(dissolveCheckEnterprise)}
          workspaceId={dissolveCheckEnterprise.id}
          workspaceName={dissolveCheckEnterprise.name}
          onClose={() => setDissolveCheckEnterprise(null)}
          onPassed={handleDissolveCheckPassed}
        />
      )}

      {/* 5.2 个人空间删除前置检测弹窗 */}
      {dissolveCheckPersonal && (
        <DissolvePersonalWorkspaceModal
          isOpen={Boolean(dissolveCheckPersonal)}
          workspaceId={dissolveCheckPersonal.id}
          workspaceName={dissolveCheckPersonal.name}
          onClose={() => setDissolveCheckPersonal(null)}
          onPassed={handleDissolveCheckPassed}
        />
      )}

      {/* 5.3 成员退出企业空间确认弹窗 */}
      {leavingWorkspace && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 relative border border-slate-100">
            <button
              onClick={() => setLeavingWorkspace(null)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-2">
                <LogOut className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">确认退出企业空间</h3>
              <p className="text-xs text-slate-500 mt-1">
                确定要退出企业空间 <span className="font-bold text-slate-800">[{leavingWorkspace.name}]</span> 吗？
              </p>
            </div>

            {/* 退出前个人数据说明 */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 mb-4 text-xs space-y-2">
              <div className="font-bold text-slate-700 flex items-center justify-between">
                <span>退出说明</span>
                {scanningLeaveStats && (
                  <span className="text-[11px] text-slate-400 flex items-center gap-1 font-normal">
                    <Loader2 className="w-3 h-3 animate-spin text-[#3182ce]" />
                    正在查询数据...
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                退出后，您在该空间内的任务记录与上传文件将保留在空间内由所有者管理，您将无法继续访问该空间。
              </p>
              {leaveStats && !scanningLeaveStats && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="p-2 rounded-lg bg-white border border-slate-100 text-center">
                    <div className="text-[10px] text-slate-400 font-medium">我的任务记录</div>
                    <div className="text-sm font-bold text-slate-700 font-mono">{leaveStats.taskCount} 项</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-slate-100 text-center">
                    <div className="text-[10px] text-slate-400 font-medium">我的上传文件</div>
                    <div className="text-sm font-bold text-slate-700 font-mono">{leaveStats.assetCount} 份</div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setLeavingWorkspace(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmLeave}
                disabled={submittingLeave || scanningLeaveStats}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {submittingLeave ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>{submittingLeave ? "正在退出..." : "确认退出空间"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5.4 删除空间二次确认模态框 */}
      {showDeleteConfirm && selectedWorkspace && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 relative border border-slate-100">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-2">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                确认{selectedWorkspace.type === "ENTERPRISE" ? "解散企业空间" : "删除个人空间"}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                确定要删除工作空间 <span className="font-bold text-slate-800">[{selectedWorkspace.name}]</span> 吗？
              </p>
              <div className="mt-2.5 p-2.5 rounded-lg bg-rose-50/80 border border-rose-100 text-[11px] text-rose-600 leading-relaxed text-left flex items-start gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
                <span>
                  删除后将清空该空间的组件配置与成员权限，且无法恢复。继续操作需<strong>验证账号密码</strong>。
                </span>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => confirmDelete()}
                disabled={submitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting ? "正在处理..." : "进入安全验证"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5.5 删除空间二次身份验证弹窗 */}
      <StepUpAuthModal
        isOpen={showDeleteStepUp}
        title="删除空间身份验证"
        message="删除工作空间属于高危且不可逆的操作，请输入账号密码完成验证。"
        action="delete_workspace"
        onConfirm={(token) => {
          setShowDeleteStepUp(false);
          confirmDelete(token);
        }}
        onCancel={() => setShowDeleteStepUp(false)}
      />

      {/* 5.6 空间管控解封申诉模态框 */}
      <WorkspaceAppealModal
        isOpen={Boolean(appealWorkspace)}
        workspace={appealWorkspace}
        onClose={() => setAppealWorkspace(null)}
        onSuccess={() => {
          setAppealWorkspace(null);
          loadWorkspaces();
        }}
      />
    </div>
  );
}

