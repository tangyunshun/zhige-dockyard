"use client";

import { useState, useEffect, Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Briefcase,
  Plus,
  Edit2,
  Trash2,
  Save,
  Check,
  X,
  Search,
  RefreshCw,
  Building2,
  Layers,
  CheckCircle2,
  AlertCircle,
  Users,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
  Power,
  ExternalLink,
  Sparkles,
  Eye,
  Calendar,
  Code2,
  ShieldAlert,
  Hash,
} from "lucide-react";
import {
  PostIcon,
  POST_ICON_MAP,
  DEFAULT_POST_ICON,
} from "@/components/studio/PostIcon";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import Link from "next/link";
import { StandardPostDetailModal } from "@/components/studio/StandardPostDetailModal";

interface UsedWorkspaceInfo {
  id: string;
  name: string;
  type?: string;
  memberCount: number;
}

interface UsageRow {
  id: string;
  postName: string;
  postCode: string;
  postColor: string;
  workspaceId: string;
  workspaceName: string;
  workspaceType: string;
  memberCount: number;
}

export interface SubmittedPostItem {
  id: string;
  workspacePostId: string;
  name: string;
  code: string;
  description: string;
  color: string;
  icon?: string;
  workspaceId: string;
  workspaceName: string;
  submittedByUserId: string;
  submittedByUserName?: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  adminNote?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface StandardPost {
  id: string;
  name: string;
  code: string;
  description: string;
  color: string;
  icon?: string | null;
  status: "ACTIVE" | "DISABLED";
  sortOrder: number;
  usageCount: number;
  totalAssignedMembers?: number;
  usedWorkspaces?: UsedWorkspaceInfo[];
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceItem {
  id: string;
  name: string;
  description?: string;
}

const PRESET_COLORS = [
  { name: "知性蓝", value: "#3182ce" },
  { name: "深海蓝", value: "#2b6cb0" },
  { name: "青空蓝", value: "#00b4d8" },
  { name: "紫罗兰", value: "#805ad5" },
  { name: "翡翠绿", value: "#38a169" },
  { name: "琥珀橙", value: "#dd6b20" },
  { name: "赤焰红", value: "#e53e3e" },
  { name: "曜石黑", value: "#4a5568" },
];

// 每页严格显示 12 条数据（按用户指定要求）
const PAGE_SIZE = 12;

function AdminPostsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  // 当前标签页: standard (平台标准岗位库) | workspace (企业空间岗位引用一览) | submissions (空间提报岗位审核)
  const [activeTab, setActiveTab] = useState<"standard" | "workspace" | "submissions">("standard");

  // 标准岗位状态
  const [standardPosts, setStandardPosts] = useState<StandardPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "DISABLED">("ALL");

  // 企业空间提报岗位状态
  const [submissions, setSubmissions] = useState<SubmittedPostItem[]>([]);
  const [submissionFilter, setSubmissionFilter] = useState<"ALL" | "PENDING" | "ACCEPTED" | "REJECTED">("ALL");
  const [reviewingSubmissionId, setReviewingSubmissionId] = useState<string | null>(null);
  // 审核操作（接收 / 不接收）二次确认模态框状态
  const [confirmReview, setConfirmReview] = useState<{
    submission: SubmittedPostItem;
    action: "ACCEPT" | "REJECT";
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [viewingSubmission, setViewingSubmission] = useState<SubmittedPostItem | null>(null);


  // 分页状态
  const [currentPage, setCurrentPage] = useState<number>(1);

  // 统计指标
  const [stats, setStats] = useState({
    totalPosts: 0,
    activePosts: 0,
    disabledPosts: 0,
    totalWorkspaces: 0,
    workspacesWithPosts: 0,
    totalWorkspacePosts: 0,
    totalAssignedMembers: 0,
  });

  // 弹窗状态：新建/编辑
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [submitting, setSubmitting] = useState(false);

  // 表单状态
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    color: "#3182ce",
    icon: DEFAULT_POST_ICON,
    status: "ACTIVE" as "ACTIVE" | "DISABLED",
    sortOrder: 1,
  });

  // 平台岗位商务图标库（来自数据库 posticonlibrary，供新建/编辑标准岗位时选择）
  const [iconLibrary, setIconLibrary] = useState<{ iconKey: string; name: string; category: string }[]>([]);

  // 查看详情弹窗状态
  const [viewingPost, setViewingPost] = useState<StandardPost | null>(null);

  // 全平台企业空间岗位引用透视列表与搜索词（Tab 2 使用）
  const [workspaceUsages, setWorkspaceUsages] = useState<UsageRow[]>([]);
  const [usageSearchTerm, setUsageSearchTerm] = useState<string>("");
  const [usageCurrentPage, setUsageCurrentPage] = useState<number>(1);
  const USAGE_PAGE_SIZE = 10;

  // 删除确认弹窗
  const [deletingPost, setDeletingPost] = useState<StandardPost | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // 工作空间列表（供辅助展示）
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);

  // 初始化加载
  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "workspace") {
      setActiveTab("workspace");
    }
    loadStandardPosts();
    loadWorkspaceList();
  }, [searchParams]);

  // 加载平台岗位商务图标库（posticonlibrary），供新建/编辑标准岗位时选择图标
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/user/workspace-hub/post-icons", {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
          credentials: "include",
        });
        const data = await res.json();
        if (alive && res.ok && data.success) {
          setIconLibrary(Array.isArray(data.icons) ? data.icons : []);
        }
      } catch (err) {
        console.error("加载岗位商务图标库失败", err);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 当搜索词或状态筛选变动时，重置分页到第 1 页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  // 当 Tab 2 搜索词变动时，重置其分页到第 1 页
  useEffect(() => {
    setUsageCurrentPage(1);
  }, [usageSearchTerm]);

  // 加载标准岗位及全网空间引用数据
  const loadStandardPosts = async () => {
    setLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/admin/posts/standard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStandardPosts(data.posts || []);
          if (data.usages) {
            setWorkspaceUsages(data.usages || []);
          }
          if (data.submissions) {
            setSubmissions(data.submissions || []);
          }
          if (data.stats) {
            setStats(data.stats);
          }
        }
      } else {
        toast.error("加载标准岗位库失败");
      }
    } catch (error) {
      console.error("Load standard posts error:", error);
      toast.error("网络异常，未能获取标准岗位数据");
    } finally {
      setLoading(false);
    }
  };

  // 加载工作空间列表（修复数据解析，确保下拉框选项100%渲染）
  const loadWorkspaceList = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch("/api/admin/workspaces", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const list: WorkspaceItem[] = data.data?.workspaces || data.workspaces || [];
        setWorkspaces(list);
      }
    } catch (err) {
      console.error("Load workspace list error:", err);
    }
  };

  // 打开新建弹窗
  const handleOpenCreate = () => {
    setModalMode("create");
    setEditingPostId(null);
    setFormData({
      name: "",
      code: "",
      description: "",
      color: "#3182ce",
      icon: DEFAULT_POST_ICON,
      status: "ACTIVE",
      sortOrder: standardPosts.length + 1,
    });
    setShowModal(true);
  };

  // 打开编辑弹窗
  const handleOpenEdit = (post: StandardPost) => {
    setModalMode("edit");
    setEditingPostId(post.id);
    setFormData({
      name: post.name,
      code: post.code,
      description: post.description || "",
      color: post.color || "#3182ce",
      icon: post.icon || DEFAULT_POST_ICON,
      status: post.status,
      sortOrder: post.sortOrder || 1,
    });
    setShowModal(true);
  };

  // 提交新建/编辑
  const handleSaveStandardPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error("请输入标准岗位名称");
      return;
    }

    setSubmitting(true);
    try {
      const token = getAuthToken();
      const url = "/api/admin/posts/standard";
      const method = modalMode === "create" ? "POST" : "PATCH";
      const body =
        modalMode === "create"
          ? formData
          : { id: editingPostId, ...formData };

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(modalMode === "create" ? "标准岗位创建成功" : "标准岗位更新成功");
        setShowModal(false);
        loadStandardPosts();
      } else {
        toast.error(data.error || "保存失败，请检查输入");
      }
    } catch (error) {
      console.error("Save standard post error:", error);
      toast.error("网络异常，操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  // 切换启用/禁用状态
  const handleToggleStatus = async (post: StandardPost) => {
    const newStatus = post.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    try {
      const token = getAuthToken();
      const res = await fetch("/api/admin/posts/standard", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          id: post.id,
          status: newStatus,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(`岗位已${newStatus === "ACTIVE" ? "启用" : "停用"}`);
        // 乐观更新列表
        setStandardPosts((prev) =>
          prev.map((p) => (p.id === post.id ? { ...p, status: newStatus } : p))
        );
        // 若当前正在查看详情，同步更新详情对象
        if (viewingPost && viewingPost.id === post.id) {
          setViewingPost((prev) => (prev ? { ...prev, status: newStatus } : null));
        }
        setStats((prev) => ({
          ...prev,
          activePosts: newStatus === "ACTIVE" ? prev.activePosts + 1 : prev.activePosts - 1,
          disabledPosts: newStatus === "DISABLED" ? prev.disabledPosts + 1 : prev.disabledPosts - 1,
        }));
      } else {
        toast.error(data.error || "状态更新失败");
      }
    } catch (err) {
      console.error("Toggle status error:", err);
      toast.error("状态更新失败");
    }
  };

  // 确认删除标准岗位
  const handleConfirmDelete = async () => {
    if (!deletingPost) return;
    setDeleteSubmitting(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/admin/posts/standard?id=${deletingPost.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success("标准岗位已安全移除");
        if (viewingPost && viewingPost.id === deletingPost.id) {
          setViewingPost(null);
        }
        setDeletingPost(null);
        loadStandardPosts();
      } else {
        toast.error(data.error || "删除失败");
      }
    } catch (err) {
      console.error("Delete post error:", err);
      toast.error("网络异常，删除失败");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // 超级管理员审核空间提报岗位：接收（纳入系统标准库）或 不接收（拒绝纳入并反馈意见）
  const handleReviewSubmission = async (
    submission: SubmittedPostItem,
    action: "ACCEPT" | "REJECT",
    adminNote?: string
  ) => {
    setReviewingSubmissionId(submission.id);
    try {
      const token = getAuthToken();
      const res = await fetch("/api/admin/posts/submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          submissionId: submission.id,
          action,
          adminNote: adminNote?.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message);
        loadStandardPosts();
      } else {
        toast.error(data.error || "审核操作失败");
      }
    } catch (err) {
      console.error("Review submission error:", err);
      toast.error("网络异常，审核操作失败");
    } finally {
      setReviewingSubmissionId(null);
    }
  };




  // 过滤标准岗位
  const filteredStandardPosts = useMemo(() => {
    return standardPosts.filter((post) => {
      const matchesSearch =
        post.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        post.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (post.description && post.description.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesStatus =
        statusFilter === "ALL" || post.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [standardPosts, searchQuery, statusFilter]);

  // 分页数据切片（每页严格 12 条）
  const totalItems = filteredStandardPosts.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));

  const paginatedPosts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredStandardPosts.slice(start, start + PAGE_SIZE);
  }, [filteredStandardPosts, currentPage]);

  // 计算全平台装配引用总数
  const totalUsages = standardPosts.reduce((acc, p) => acc + (p.usageCount || 0), 0);

  // 过滤企业空间岗位引用透视列表（Tab 2 使用）
  const filteredUsages = useMemo(() => {
    if (!usageSearchTerm.trim()) return workspaceUsages;
    const q = usageSearchTerm.toLowerCase();
    return workspaceUsages.filter(
      (u) =>
        (u.postName && u.postName.toLowerCase().includes(q)) ||
        (u.postCode && u.postCode.toLowerCase().includes(q)) ||
        (u.workspaceName && u.workspaceName.toLowerCase().includes(q))
    );
  }, [workspaceUsages, usageSearchTerm]);

  // Tab 2 企业空间岗位引用数据分页切片（每页严格 10 条）
  const totalUsageItems = filteredUsages.length;
  const totalUsagePages = Math.max(1, Math.ceil(totalUsageItems / USAGE_PAGE_SIZE));

  const paginatedUsages = useMemo(() => {
    const start = (usageCurrentPage - 1) * USAGE_PAGE_SIZE;
    return filteredUsages.slice(start, start + USAGE_PAGE_SIZE);
  }, [filteredUsages, usageCurrentPage]);

  return (
    <div className="min-h-screen bg-[#f0f8ff] p-6 space-y-6">
      {/* 顶部标题与 Tab 导航 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
              <Briefcase className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-black text-slate-800 tracking-tight">
                  岗位管理中枢
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-[#3182ce] border border-blue-200/60">
                  全平台官方标准库
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                维护全平台官方研发与业务标准岗位，支持企业空间一键批量装配导入，实现跨空间规范治理
              </p>
            </div>
          </div>

          {/* 右侧动作 */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => loadStandardPosts()}
              className="px-3.5 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              <span>刷新数据</span>
            </button>
            {activeTab === "standard" && (
              <button
                onClick={handleOpenCreate}
                className="px-4 py-2 text-xs font-bold text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>新建标准岗位</span>
              </button>
            )}
          </div>
        </div>

        {/* 标签页切换：管理员全局视角 */}
        <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-100">
          <button
            onClick={() => setActiveTab("standard")}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              activeTab === "standard"
                ? "bg-[#3182ce] text-white shadow-xs"
                : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>全平台官方标准岗位库</span>
            <span
              className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                activeTab === "standard"
                  ? "bg-white/20 text-white"
                  : "bg-slate-200/80 text-slate-600"
              }`}
            >
              {standardPosts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("workspace")}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              activeTab === "workspace"
                ? "bg-[#3182ce] text-white shadow-xs"
                : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>企业空间岗位引用一览</span>
            {workspaceUsages.length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                  activeTab === "workspace"
                    ? "bg-white/20 text-white"
                    : "bg-slate-200/80 text-slate-600"
                }`}
              >
                {workspaceUsages.length} 条引用
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab("submissions")}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              activeTab === "submissions"
                ? "bg-[#3182ce] text-white shadow-xs"
                : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>企业空间提报岗位审核</span>
            {submissions.length > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === "submissions"
                    ? "bg-white/20 text-white"
                    : submissions.some((s) => s.status === "PENDING")
                    ? "bg-amber-500 text-white animate-pulse"
                    : "bg-slate-200/80 text-slate-600"
                }`}
              >
                {submissions.filter((s) => s.status === "PENDING").length > 0
                  ? `${submissions.filter((s) => s.status === "PENDING").length} 待审`
                  : `${submissions.length}`}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ======================= TAB 1: 平台官方标准岗位库 ======================= */}
      {activeTab === "standard" && (
        <div className="space-y-6">
          {/* 四大核心指标卡片 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">官方标准岗位</span>
                <span className="p-2 rounded-lg bg-blue-50 text-[#3182ce]">
                  <Briefcase className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-800">{stats.totalPosts}</span>
                <span className="text-xs font-medium text-slate-400">个基准岗位</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2 font-medium">预置全链路研发与业务角色模版</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">已启用分发</span>
                <span className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-600">{stats.activePosts}</span>
                <span className="text-xs font-medium text-slate-400">个推荐岗位</span>
              </div>
              <p className="text-[11px] text-emerald-600/80 mt-2 font-medium">企业空间一键导入立即可用</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">空间装配引用总数</span>
                <span className="p-2 rounded-lg bg-purple-50 text-purple-600">
                  <Users className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black text-purple-600">
                  {stats.totalWorkspacePosts > 0 ? stats.totalWorkspacePosts : totalUsages}
                </span>
                <span className="text-xs font-medium text-slate-400">次岗位落地</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2 font-medium">
                覆盖 {stats.workspacesWithPosts || 0} 个实际装配空间
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">全平台在编成员</span>
                <span className="p-2 rounded-lg bg-amber-50 text-amber-600">
                  <Building2 className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-2xl font-black text-amber-600">
                  {stats.totalAssignedMembers || 0}
                </span>
                <span className="text-xs font-medium text-slate-400">位岗位成员</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-2 font-medium">
                跨 {stats.totalWorkspaces || workspaces.length} 个企业空间协同赋能
              </p>
            </div>
          </div>

          {/* 搜索与过滤工具栏 */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索标准岗位名称、代号或职责..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#3182ce] focus:bg-white transition-all"
              />
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
                <button
                  onClick={() => setStatusFilter("ALL")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    statusFilter === "ALL"
                      ? "bg-white text-slate-800 shadow-2xs"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  全部 ({standardPosts.length})
                </button>
                <button
                  onClick={() => setStatusFilter("ACTIVE")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    statusFilter === "ACTIVE"
                      ? "bg-white text-emerald-600 shadow-2xs"
                      : "text-slate-500 hover:text-emerald-600"
                  }`}
                >
                  已启用 ({stats.activePosts})
                </button>
                <button
                  onClick={() => setStatusFilter("DISABLED")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${
                    statusFilter === "DISABLED"
                      ? "bg-white text-slate-700 shadow-2xs"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  已停用 ({stats.disabledPosts})
                </button>
              </div>

              <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
                共 <strong className="text-slate-700 font-bold">{totalItems}</strong> 条
              </span>
            </div>
          </div>

          {/* 标准岗位卡片网格列表（优化排版：3 列布局，每个卡片拥有充裕宽度，杜绝换行挤压） */}
          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-16 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 text-[#3182ce] animate-spin mb-3" />
              <p className="text-xs font-bold text-slate-500">正在同步全平台标准岗位库...</p>
            </div>
          ) : filteredStandardPosts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center">
              <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3 stroke-[1.5]" />
              <h3 className="text-sm font-bold text-slate-700">未检索到匹配的标准岗位</h3>
              <p className="text-xs text-slate-400 mt-1">
                您可以尝试更换关键词搜索，或点击右上角新建标准岗位
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {paginatedPosts.map((post) => {
                const isActive = post.status === "ACTIVE";
                return (
                  <div
                    key={post.id}
                    className={`bg-white rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col justify-between group shadow-2xs hover:shadow-md ${
                      isActive
                        ? "border-slate-200/90 hover:border-blue-300"
                        : "border-slate-200/60 bg-slate-50/50 opacity-80"
                    }`}
                  >
                    {/* 卡片主体内容区域（仅作内容展示，不可随意点击弹窗，只有点击底部【详情】按钮才弹出） */}
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      {/* 顶部：头像徽标、标题、状态胶囊 */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
                            style={{ backgroundColor: post.color }}
                          >
                            <PostIcon iconKey={post.icon} className="w-5 h-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            {/* 岗位标题：设置 whitespace-nowrap 与 truncate，结合 3 列充裕宽度彻底杜绝折行 */}
                            <h3
                              className="text-sm font-black text-slate-800 transition-colors whitespace-nowrap truncate"
                              title={post.name}
                            >
                              {post.name}
                            </h3>
                            <span className="text-[10px] font-bold text-slate-400 font-mono block mt-0.5 tracking-tight truncate">
                              {post.code}
                            </span>
                          </div>
                        </div>

                        {/* 状态切换徽章（独立轻巧布局，阻止冒泡） */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleStatus(post);
                          }}
                          title={isActive ? "点击停用分发" : "点击启用分发"}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all shrink-0 ${
                            isActive
                              ? "bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isActive ? "bg-emerald-500" : "bg-slate-400"
                            }`}
                          />
                          <span>{isActive ? "启用中" : "已停用"}</span>
                        </button>
                      </div>

                      {/* 岗位职责描述 */}
                      <p className="text-xs text-slate-500 mt-3.5 line-clamp-2 leading-relaxed h-10 font-medium">
                        {post.description || "暂未填写职责描述与定位说明"}
                      </p>

                      {/* 空间装配引用数据（点击直接平滑切换到企业空间岗位引用一览Tab） */}
                      <div className="mt-4 pt-3.5 border-t border-slate-100 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400 font-medium text-[11px]">装配空间统计:</span>
                          <div className="flex items-center gap-1.5">
                            {post.usageCount > 0 ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setUsageSearchTerm(post.name);
                                  setActiveTab("workspace");
                                }}
                                title="点击直接切换至【企业空间岗位引用一览】查看明细"
                                className="px-2.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80 font-black text-xs transition-all cursor-pointer flex items-center gap-1 active:scale-95 group/btn shadow-2xs"
                              >
                                <span>已装配 {post.usageCount} 个空间</span>
                                <ChevronRight className="w-3 h-3 text-emerald-600 group-hover/btn:translate-x-0.5 transition-transform" />
                              </button>
                            ) : (
                              <span className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-400 font-bold text-[11px]">
                                暂无空间装配
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 卡片底部操作栏：包含【详情】、【编辑】、【删除】三大完整闭环 */}
                    <div className="px-5 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-mono">
                        排序: {post.sortOrder || 1}
                      </span>

                      <div className="flex items-center gap-1">
                        {/* 查看详情按钮 */}
                        <button
                          type="button"
                          onClick={() => setViewingPost(post)}
                          className="px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-[#3182ce] hover:bg-blue-50/80 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                          title="查看岗位详情"
                        >
                          <Eye className="w-3.5 h-3.5 text-[#3182ce]" />
                          <span>详情</span>
                        </button>

                        {/* 编辑按钮 */}
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(post)}
                          className="px-2.5 py-1 text-xs font-bold text-[#3182ce] hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>编辑</span>
                        </button>

                        {/* 删除按钮 */}
                        <button
                          type="button"
                          onClick={() => setDeletingPost(post)}
                          className="px-2.5 py-1 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>删除</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ======================= 分页组件（每页严格 12 条） ======================= */}
          {totalItems > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-slate-500 font-medium">
                显示第 <strong className="text-slate-800 font-bold">{(currentPage - 1) * PAGE_SIZE + 1}</strong> 到{" "}
                <strong className="text-slate-800 font-bold">
                  {Math.min(currentPage * PAGE_SIZE, totalItems)}
                </strong>{" "}
                条，共 <strong className="text-slate-800 font-bold">{totalItems}</strong> 个标准岗位（每页 12 条）
              </div>

              {/* 页码控制区 */}
              <div className="flex items-center gap-1.5">
                {/* 首页 */}
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="首页"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>

                {/* 上一页 */}
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 h-8 rounded-lg flex items-center gap-1 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-slate-200/60"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>上一页</span>
                </button>

                {/* 数字页码 */}
                <div className="flex items-center gap-1 mx-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${
                        currentPage === pageNum
                          ? "bg-[#3182ce] text-white shadow-2xs scale-105"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                </div>

                {/* 下一页 */}
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 h-8 rounded-lg flex items-center gap-1 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-slate-200/60"
                >
                  <span>下一页</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                {/* 末页 */}
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="末页"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB 2: 企业空间岗位引用一览（极简纯粹透视） ======================= */}
      {activeTab === "workspace" && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-2xs space-y-5 text-left">
          {/* 头部与检索工具条 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#3182ce]" />
                <span>全平台企业空间岗位引用一览</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 font-medium">
                透视全网企业空间（如西安云舜科技等）对官方标准岗位的装配采纳与成员在编现状（仅作数据呈现）
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* 搜索框（支持快捷筛选与一键清空） */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={usageSearchTerm}
                  onChange={(e) => setUsageSearchTerm(e.target.value)}
                  placeholder="搜索岗位名称或企业空间..."
                  className="pl-8 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-[#3182ce] w-64"
                />
                {usageSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setUsageSearchTerm("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-300 flex items-center justify-center text-[10px] cursor-pointer transition-colors"
                    title="清空筛选"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>

              {/* 刷新按钮 */}
              <button
                type="button"
                onClick={loadStandardPosts}
                className="p-2 text-slate-500 hover:text-[#3182ce] hover:bg-slate-100 rounded-xl transition-colors border border-slate-200 cursor-pointer"
                title="刷新数据"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* 引用清单表格 */}
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 text-[#3182ce] animate-spin mb-3" />
              <p className="text-xs font-bold text-slate-500">正在查询全网企业空间岗位引用数据...</p>
            </div>
          ) : filteredUsages.length === 0 ? (
            <div className="py-16 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-2 stroke-[1.5]" />
              <h4 className="text-sm font-bold text-slate-700">暂无匹配的企业空间岗位引用记录</h4>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                空间成员可在其空间内部自行导入并配置官方标准岗位
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-black text-slate-500">
                    <th className="py-3 px-4">标准岗位</th>
                    <th className="py-3 px-4">岗位唯一代号</th>
                    <th className="py-3 px-4">引用的企业空间</th>
                    <th className="py-3 px-4">空间类型</th>
                    <th className="py-3 px-4 text-right">在编成员人数</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium">
                  {paginatedUsages.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                      {/* 标准岗位 */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: u.postColor || "#3182ce" }}
                          />
                          <span className="font-black text-slate-800">{u.postName}</span>
                        </div>
                      </td>

                      {/* 岗位代号 */}
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {u.postCode}
                      </td>

                      {/* 引用的企业空间 */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-[#3182ce] shrink-0" />
                          <div>
                            <span className="font-black text-slate-800 block">
                              {u.workspaceName}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              ID: {u.workspaceId.substring(0, 12)}...
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* 空间类型 */}
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                            u.workspaceType === "PERSONAL"
                              ? "bg-slate-100 text-slate-500"
                              : "bg-blue-50 text-[#3182ce] border border-blue-100"
                          }`}
                        >
                          {u.workspaceType === "PERSONAL" ? "个人自主空间" : "企业协同空间"}
                        </span>
                      </td>

                      {/* 在编成员人数 */}
                      <td className="py-3 px-4 text-right">
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-bold text-xs">
                          {u.memberCount} 位在编成员
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ======================= Tab 2 分页组件（每页严格 10 条） ======================= */}
          {totalUsageItems > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
              <div className="text-xs text-slate-500 font-medium">
                显示第 <strong className="text-slate-800 font-bold">{(usageCurrentPage - 1) * USAGE_PAGE_SIZE + 1}</strong> 到{" "}
                <strong className="text-slate-800 font-bold">
                  {Math.min(usageCurrentPage * USAGE_PAGE_SIZE, totalUsageItems)}
                </strong>{" "}
                条，共 <strong className="text-slate-800 font-bold">{totalUsageItems}</strong> 条企业空间岗位引用（每页 10 条）
              </div>

              {/* 页码控制区 */}
              <div className="flex items-center gap-1.5">
                {/* 首页 */}
                <button
                  type="button"
                  disabled={usageCurrentPage === 1}
                  onClick={() => setUsageCurrentPage(1)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="首页"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>

                {/* 上一页 */}
                <button
                  type="button"
                  disabled={usageCurrentPage === 1}
                  onClick={() => setUsageCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 h-8 rounded-lg flex items-center gap-1 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-slate-200/60"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>上一页</span>
                </button>

                {/* 数字页码 */}
                <div className="flex items-center gap-1 mx-1">
                  {Array.from({ length: totalUsagePages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setUsageCurrentPage(pageNum)}
                      className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${
                        usageCurrentPage === pageNum
                          ? "bg-[#3182ce] text-white shadow-2xs scale-105"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                </div>

                {/* 下一页 */}
                <button
                  type="button"
                  disabled={usageCurrentPage === totalUsagePages}
                  onClick={() => setUsageCurrentPage((p) => Math.min(totalUsagePages, p + 1))}
                  className="px-2.5 h-8 rounded-lg flex items-center gap-1 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-slate-200/60"
                >
                  <span>下一页</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>

                {/* 末页 */}
                <button
                  type="button"
                  disabled={usageCurrentPage === totalUsagePages}
                  onClick={() => setUsageCurrentPage(totalUsagePages)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="末页"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB 3: 企业空间提报岗位审核与纳管中枢 ======================= */}
      {activeTab === "submissions" && (
        <div className="space-y-6 animate-in fade-in-50 duration-200">
          {/* 顶部过滤工具栏 */}
          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-slate-800">
                  企业空间提报岗位审核
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200/80">
                  空间自定义提报
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                审阅各企业空间（如西安云舜科技等）自主新建并同意同步至系统的专有岗位；超管可选择【接收】将其晋升为全网官方标准岗位，或【不接收】仅保留空间自治。
              </p>
            </div>

            {/* 状态筛选胶囊 */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl border border-slate-200/60 shrink-0">
              {[
                { label: "全部提报", value: "ALL", count: submissions.length },
                {
                  label: "待审阅",
                  value: "PENDING",
                  count: submissions.filter((s) => s.status === "PENDING").length,
                  highlight: true,
                },
                {
                  label: "已接收入库",
                  value: "ACCEPTED",
                  count: submissions.filter((s) => s.status === "ACCEPTED").length,
                },
                {
                  label: "已拒绝(仅空间自治)",
                  value: "REJECTED",
                  count: submissions.filter((s) => s.status === "REJECTED").length,
                },
              ].map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => setSubmissionFilter(tab.value as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                    submissionFilter === tab.value
                      ? "bg-white text-slate-800 shadow-2xs font-black"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                      tab.highlight && tab.count > 0
                        ? "bg-amber-500 text-white font-black"
                        : "bg-slate-200/70 text-slate-600"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 提报卡片列表 */}
          {submissions.filter(
            (s) => submissionFilter === "ALL" || s.status === submissionFilter
          ).length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 p-16 text-center shadow-2xs">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#3182ce] flex items-center justify-center mx-auto mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-700">
                暂无符合筛选条件的企业空间提报岗位
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                当企业空间用户新建系统内置库中没有的岗位并选择【同意同步至系统岗位集】后，将在此实时呈现等待超级管理员审核。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {submissions
                .filter((s) => submissionFilter === "ALL" || s.status === submissionFilter)
                .map((sub) => {
                  const isPending = sub.status === "PENDING";
                  const isAccepted = sub.status === "ACCEPTED";
                  const isRejected = sub.status === "REJECTED";

                  return (
                    <div
                      key={sub.id}
                      className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-4"
                    >
                      <div>
                        {/* 顶部标牌与状态 */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs shrink-0"
                              style={{ backgroundColor: sub.color || "#3182ce" }}
                            >
                              <PostIcon iconKey={sub.icon} className="w-5 h-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-black text-slate-800 truncate">
                                  {sub.name}
                                </h3>
                                {/* 核心用户明确要求标识：用户新增/空间提报 */}
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200/80 shrink-0">
                                  <Building2 className="w-2.5 h-2.5" />
                                  <span>空间提报 / 用户新增岗位</span>
                                </span>
                              </div>
                              <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                                代码: {sub.code}
                              </span>
                            </div>
                          </div>

                          {/* 状态徽章 */}
                          <div className="shrink-0">
                            {isPending && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-100/80 text-amber-800 border border-amber-300/60 animate-pulse">
                                待超管审阅
                              </span>
                            )}
                            {isAccepted && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>已接收（纳入标准库）</span>
                              </span>
                            )}
                            {isRejected && (
                              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                已拒绝 (仅空间自治)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 提报来源信息条 */}
                        <div className="mt-3.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs flex items-center justify-between text-slate-600">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[11px] text-slate-400 font-bold shrink-0">提报空间:</span>
                            <span className="font-bold text-slate-800 truncate" title={sub.workspaceName}>
                              🏢 {sub.workspaceName}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                            提报人: {sub.submittedByUserName || "空间管理员"}
                          </span>
                        </div>

                        {/* 职责定位描述 */}
                        <p className="text-xs text-slate-500 mt-3 line-clamp-2 leading-relaxed font-medium">
                          {sub.description || "提报人暂未提供详细定位说明"}
                        </p>

                        {sub.adminNote && (
                          <div className="mt-2 text-[11px] text-slate-400 italic bg-blue-50/40 p-2 rounded-lg border border-blue-100/50">
                            审阅批注: {sub.adminNote}
                          </div>
                        )}
                      </div>

                      {/* 底部 4 大操作按钮 */}
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <div className="flex flex-col gap-0.5 text-[10px]">
                          <span className="text-slate-400 font-medium">
                            提报时间：{(() => {
                              const d = new Date(sub.createdAt);
                              return isNaN(d.getTime())
                                ? sub.createdAt
                                : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
                            })()}
                          </span>
                          {isAccepted && (
                            <span className="text-emerald-600 font-bold flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-emerald-500" />
                              <span>
                                接收时间：{(() => {
                                  const d = new Date(sub.reviewedAt || sub.updatedAt || sub.createdAt);
                                  return isNaN(d.getTime())
                                    ? ""
                                    : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
                                })()}
                              </span>
                            </span>
                          )}
                          {isRejected && (
                            <span className="text-slate-500 font-medium flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-slate-400" />
                              <span>
                                审核时间：{(() => {
                                  const d = new Date(sub.reviewedAt || sub.updatedAt || sub.createdAt);
                                  return isNaN(d.getTime())
                                    ? ""
                                    : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
                                })()}
                              </span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5">
                          {/* 1. 查看详情 */}
                          <button
                            type="button"
                            onClick={() => setViewingSubmission(sub)}
                            className="px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-[#3182ce] hover:bg-blue-50/80 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                            title="查看提报岗位全息详情"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#3182ce]" />
                            <span>详情</span>
                          </button>

                          {/* 仅在待审阅（PENDING）状态下显示【接收】和【不接收】 */}
                          {sub.status === "PENDING" && (
                            <>
                              <button
                                type="button"
                                disabled={reviewingSubmissionId === sub.id}
                                onClick={() => {
                                  setRejectReason("");
                                  setConfirmReview({ submission: sub, action: "ACCEPT" });
                                }}
                                className="px-3 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 shadow-2xs bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                                title="直接接收该岗位并将其正式升级为全平台官方标准岗位（发送通过提醒）"
                              >
                                {reviewingSubmissionId === sub.id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3.5 h-3.5" />
                                )}
                                <span>接收</span>
                              </button>

                              {/* 不接收（拒绝纳入系统标准库并附带审核意见反馈用户） */}
                              <button
                                type="button"
                                disabled={reviewingSubmissionId === sub.id}
                                onClick={() => {
                                  setRejectReason("");
                                  setConfirmReview({ submission: sub, action: "REJECT" });
                                }}
                                className="px-2.5 py-1 text-xs font-bold rounded-lg transition-all flex items-center gap-1 text-red-600 hover:bg-red-50 border border-red-200/70 cursor-pointer"
                                title="拒绝纳入全平台官方库并输入审核意见通知提报用户（保留空间内部自治使用）"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>不接收</span>
                              </button>
                            </>
                          )}

                          {/* 已接收状态：仅展示已入库标记，不展示任何不接收或冗余操作 */}
                          {isAccepted && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/70 rounded-lg">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>已纳入标准库</span>
                            </span>
                          )}

                          {/* 已拒绝状态：仅展示空间自治标记，不展示接收操作 */}
                          {isRejected && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-lg">
                              <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                              <span>已留存空间自治</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ======================= MODAL: 查看岗位全息详情（复用公共 StandardPostDetailModal 组件） ======================= */}
      {viewingPost && (
        <StandardPostDetailModal
          post={viewingPost}
          onClose={() => setViewingPost(null)}
          onToggleStatus={(target) => handleToggleStatus(target as any)}
          onEdit={(target) => {
            setViewingPost(null);
            handleOpenEdit(target as any);
          }}
        />
      )}

      {/* ======================= MODAL: 新建 / 编辑标准岗位 ======================= */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in-50 duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
            {/* 弹窗头部 */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-[#3182ce]" />
                <h3 className="text-base font-black text-slate-800">
                  {modalMode === "create" ? "新建官方标准岗位" : "编辑官方标准岗位"}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 弹窗表单 */}
            <form onSubmit={handleSaveStandardPost} className="p-6 space-y-4">
              {/* 岗位名称 */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  岗位名称 <span className="text-red-500 font-bold ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：系统架构师、前端开发工程师"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#3182ce] focus:bg-white"
                />
              </div>

              {/* 岗位代号 */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  英文唯一标识代号 <span className="text-red-500 font-bold ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toUpperCase() })
                  }
                  placeholder="例如：SYSTEM_ARCHITECT、FRONTEND_DEV"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-[#3182ce] focus:bg-white"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  大写英文英文字符与下划线，用于系统底层识别
                </span>
              </div>

              {/* 主题配色选择 */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  标识主题配色
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, color: c.value })}
                      className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                        formData.color === c.value
                          ? "ring-2 ring-offset-2 ring-[#3182ce] scale-110"
                          : "hover:scale-105"
                      }`}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    >
                      {formData.color === c.value && (
                        <span className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* 岗位商务图标选择（可选集合来自数据库 posticonlibrary） */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1.5">
                  岗位商务图标
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-xs shrink-0"
                    style={{ backgroundColor: formData.color || "#3182ce" }}
                  >
                    <PostIcon iconKey={formData.icon} className="w-4 h-4" />
                  </span>
                  <span className="text-[11px] font-bold text-slate-500 truncate">
                    {iconLibrary.find((i) => i.iconKey === formData.icon)?.name || formData.icon}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-0.5">
                  {iconLibrary.filter((i) => i.iconKey in POST_ICON_MAP).length === 0 ? (
                    <div className="py-2 text-[11px] text-slate-400 font-semibold">
                      商务图标库加载中或暂无可选图标，保存后将使用默认图标
                    </div>
                  ) : (
                    iconLibrary
                      .filter((i) => i.iconKey in POST_ICON_MAP)
                      .map((item) => (
                        <button
                          key={item.iconKey}
                          type="button"
                          title={item.name || item.iconKey}
                          onClick={() => setFormData({ ...formData, icon: item.iconKey })}
                          className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all cursor-pointer ${
                            formData.icon === item.iconKey
                              ? "bg-blue-50 border-[#3182ce] shadow-xs scale-105"
                              : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          <PostIcon iconKey={item.iconKey} className="w-4 h-4 text-slate-600" />
                        </button>
                      ))
                  )}
                </div>
              </div>

              {/* 职责与定位说明 */}
              <div>
                <label className="block text-xs font-black text-slate-700 mb-1">
                  职责描述与定位说明
                </label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="简述该标准岗位的职责范围，企业空间导入时将展示此说明..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:border-[#3182ce] focus:bg-white"
                />
              </div>

              {/* 启用状态与排序 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">
                    启用分发状态
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        status: e.target.value as "ACTIVE" | "DISABLED",
                      })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                  >
                    <option value="ACTIVE">已启用 (推荐导入)</option>
                    <option value="DISABLED">已停用 (暂停分发)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1">
                    排序权重
                  </label>
                  <input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) =>
                      setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 1 })
                    }
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700"
                  />
                </div>
              </div>

              {/* 弹窗操作 */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {submitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>保存标准岗位</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================= MODAL: 删除二次确认 ======================= */}
      {deletingPost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in-50 duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800">
                  确认删除标准岗位【{deletingPost.name}】？
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  全平台已有 <strong className="text-red-500">{deletingPost.usageCount || 0}</strong> 个企业空间引用此岗位
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
              删除后，新企业空间将无法再一键导入该岗位。已有空间中已存在的岗位数据将保留不会受损。确定要从官方标准库移除吗？
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingPost(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={deleteSubmitting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {deleteSubmitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>确认删除</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================= MODAL: 查看空间提报岗位全息详情 ======================= */}
      {viewingSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in-50 duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs"
                  style={{ backgroundColor: viewingSubmission.color || "#3182ce" }}
                >
                  <PostIcon iconKey={viewingSubmission.icon} className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-black text-slate-800">
                      【{viewingSubmission.name}】提报详情
                    </h3>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-bold border border-slate-200">
                      {viewingSubmission.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    来自空间：<strong>{viewingSubmission.workspaceName}</strong>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingSubmission(null)}
                className="w-8 h-8 rounded-lg hover:bg-slate-200/70 text-slate-400 hover:text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-bold">提报企业空间:</span>
                  <span className="font-black text-slate-800">🏢 {viewingSubmission.workspaceName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-bold">空间唯一ID:</span>
                  <span className="font-mono text-slate-600">{viewingSubmission.workspaceId}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-bold">提报人:</span>
                  <span className="text-slate-700">{viewingSubmission.submittedByUserName || "空间管理员"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-bold">提报时间:</span>
                  <span className="text-slate-700 font-mono">{new Date(viewingSubmission.createdAt).toLocaleString()}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">岗位职责定位说明</label>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 text-slate-700 leading-relaxed">
                  {viewingSubmission.description || "提报人未提供详细定位说明"}
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">当前审核状态</label>
                <div className="flex items-center gap-2">
                  {viewingSubmission.status === "PENDING" && (
                    <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-800 border border-amber-300">
                      待超级管理员审阅处理
                    </span>
                  )}
                  {viewingSubmission.status === "ACCEPTED" && (
                    <span className="px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                      已接收并成功晋升为平台官方标准岗位（全网空间可见）
                    </span>
                  )}
                  {viewingSubmission.status === "REJECTED" && (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-300">
                      已拒绝纳入系统标准集（仅在提报空间内部自治使用）
                    </span>
                  )}
                </div>
              </div>

              {viewingSubmission.adminNote && (
                <div>
                  <label className="block text-slate-500 font-bold mb-1">审核批注历史</label>
                  <div className="p-2.5 rounded-lg bg-blue-50 text-[#2b6cb0] border border-blue-100">
                    {viewingSubmission.adminNote}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setViewingSubmission(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/70 rounded-xl transition-colors"
              >
                关闭
              </button>

              <div className="flex items-center gap-2">
                {/* 仅在待审阅（PENDING）状态下才提供审核决策按钮 */}
                {viewingSubmission.status === "PENDING" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const target = viewingSubmission;
                        setViewingSubmission(null);
                        setRejectReason("");
                        setConfirmReview({ submission: target, action: "ACCEPT" });
                      }}
                      className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>接收并入库</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const target = viewingSubmission;
                        setViewingSubmission(null);
                        setRejectReason("");
                        setConfirmReview({ submission: target, action: "REJECT" });
                      }}
                      className="px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-50 border border-red-200 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>不接收</span>
                    </button>
                  </>
                ) : viewingSubmission.status === "ACCEPTED" ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>已纳入标准库</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded-xl">
                    <AlertCircle className="w-4 h-4 text-slate-400" />
                    <span>已留存空间自治</span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================= MODAL: 审核操作二次确认（接收 / 不接收与审核意见反馈） ======================= */}
      {confirmReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in-50 duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden">
            <div className="p-6 text-left space-y-4">
              <div className="flex items-start gap-3.5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                    confirmReview.action === "ACCEPT"
                      ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                      : "bg-red-50 text-red-600 border-red-100"
                  }`}
                >
                  {confirmReview.action === "ACCEPT" ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <AlertCircle className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-800">
                    {confirmReview.action === "ACCEPT"
                      ? "确认接收并纳入系统官方标准库？"
                      : "不接收该岗位提报（附审核意见反馈）"}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    岗位：<strong>{confirmReview.submission.name}</strong>（代号：
                    <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-slate-700">
                      {confirmReview.submission.code}
                    </code>
                    ）· 提报自：<strong>{confirmReview.submission.workspaceName}</strong>
                  </p>
                </div>
              </div>

              {confirmReview.action === "ACCEPT" ? (
                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200/60 text-xs text-emerald-800 leading-relaxed space-y-1.5">
                  <p className="font-bold flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    <span>便捷接收模式（自动同意并推送站内提醒）：</span>
                  </p>
                  <p className="text-emerald-700">
                    无需单独输入意见。接收后，该岗位将正式晋升为<strong>全平台官方标准岗位</strong>，面向所有企业空间开放使用，并在系统岗位库中统一维护；同时系统将自动向提报用户发送“审核通过”消息提醒。
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 text-xs text-amber-800 leading-relaxed">
                    <p>
                      不接收后，该岗位将<strong>仅保留在提报空间内部自治使用</strong>，不会向平台其他空间开放。请输入不接收原因，系统将以消息提醒形式通知提报人。
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      审核意见 / 驳回原因 <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      required
                      placeholder="请输入不予纳入全平台标准库的具体理由或改进建议（将以站内信同步通知提报用户）..."
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/20 resize-none transition-all placeholder:text-slate-400"
                    />

                    {/* 快捷理由预设胶囊 */}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="text-[11px] text-slate-600 font-bold self-center">快捷填入：</span>
                      {[
                        "已有相似功能的平台官方标准岗位",
                        "岗位职责界定不充分，建议在空间内完善",
                        "偏企业内部定制业务，暂不具备全平台通用性",
                        "岗位代号或命名规范需调整",
                      ].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setRejectReason(preset)}
                          className="px-2 py-0.5 text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-md transition-colors cursor-pointer"
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={reviewingSubmissionId === confirmReview.submission.id}
                  onClick={() => setConfirmReview(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={
                    reviewingSubmissionId === confirmReview.submission.id ||
                    (confirmReview.action === "REJECT" && !rejectReason.trim())
                  }
                  onClick={async () => {
                    const target = confirmReview;
                    if (target.action === "REJECT" && !rejectReason.trim()) {
                      toast.error("请输入不接收的审核意见 / 驳回理由");
                      return;
                    }
                    setConfirmReview(null);
                    await handleReviewSubmission(
                      target.submission,
                      target.action,
                      target.action === "REJECT" ? rejectReason.trim() : undefined
                    );
                  }}
                  className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer ${
                    confirmReview.action === "ACCEPT"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  }`}
                >
                  {reviewingSubmissionId === confirmReview.submission.id ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>处理中...</span>
                    </>
                  ) : (
                    <>
                      {confirmReview.action === "ACCEPT" ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <X className="w-3.5 h-3.5" />
                      )}
                      <span>{confirmReview.action === "ACCEPT" ? "确认直接接收" : "确认不接收并通知提报人"}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminPostsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-10 h-10 text-[#3182ce] animate-spin" />
        </div>
      }
    >
      <AdminPostsContent />
    </Suspense>
  );
}
