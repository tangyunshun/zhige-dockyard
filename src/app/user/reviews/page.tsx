"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  Award,
  Building2,
  CheckCircle2,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  ExternalLink,
  Eye,
  Loader2,
  MessageSquareQuote,
  Plus,
  Quote,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Tag,
  Trash2,
  TrendingUp,
  User,
  X,
  XCircle,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { useAppContext } from "@/contexts/AppContext";
import { getAuthToken } from "@/utils/auth";

interface MyTestimonial {
  id: string;
  groupNo: number;
  category: "personal" | "enterprise" | string;
  name: string;
  role: string | null;
  org: string | null;
  avatar: string | null;
  rating: number;
  content: string;
  tags: string[];
  highlightLabel: string | null;
  highlightValue: string | null;
  status: "pending" | "active" | "hidden" | "rejected" | string;
  reviewNote: string | null;
  submittedAt: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface RotationState {
  mode: "auto" | "manual";
  activeGroup: number;
  lastRotatedAt: string | null;
  nextRotateAt: string | null;
}

interface UserReviewContext {
  name: string;
  avatar?: string | null;
  email?: string;
  defaultRole: string;
  enterpriseOrg: string;
  personalWorkspaceName: string;
  completedTasksCount: number;
}

type StatusFilter = "ALL" | "active" | "pending" | "rejected" | "hidden";
type SortAndCategoryMode = "NEWEST" | "RATING_DESC" | "PERSONAL_ONLY" | "ENTERPRISE_ONLY";

const STATUS_META: Record<
  string,
  { label: string; style: string; icon: typeof Clock; desc: string }
> = {
  pending: {
    label: "待审核",
    style: "bg-amber-50 text-amber-700 border-amber-200/80",
    icon: Clock,
    desc: "已提交至运营后台，等待管理员审核归组",
  },
  active: {
    label: "已展示",
    style: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    icon: CheckCircle2,
    desc: "审核通过，已编入官网首页用户评价轮换组",
  },
  hidden: {
    label: "已下架",
    style: "bg-slate-100 text-slate-600 border-slate-200/80",
    icon: XCircle,
    desc: "当前处于后台归档或暂停展示状态",
  },
  rejected: {
    label: "未通过",
    style: "bg-red-50 text-red-600 border-red-200/80",
    icon: XCircle,
    desc: "未通过审核，可根据审核备注编辑后重新提交",
  },
};

const CATEGORY_LABEL: Record<string, string> = {
  personal: "个人用户",
  enterprise: "企业客户",
};

const RATING_TEXT_MAP: Record<number, string> = {
  5: "非常满意 · 强烈推荐给同行团队",
  4: "整体满意 · 显著提升研发与交付效率",
  3: "体验良好 · 满足核心业务场景需求",
  2: "有待改进 · 部分流程仍需优化",
  1: "体验不佳 · 存在明显阻碍问题",
};



function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { hour12: false });
}

export default function UserReviewsPage() {
  const toast = useToast();
  const { userState } = useAppContext();
  const formSectionRef = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rows, setRows] = useState<MyTestimonial[]>([]);
  const [rotationState, setRotationState] = useState<RotationState>({
    mode: "auto",
    activeGroup: 1,
    lastRotatedAt: null,
    nextRotateAt: null,
  });
  // 数据库驱动的能力标签库、标准岗位库与已收录成效指标库（初始全空，100% 数据库实时拉取）
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [rolePresets, setRolePresets] = useState<string[]>([]);
  const [highlightPresets, setHighlightPresets] = useState<{ label: string; value: string }[]>([]);

  const [userContext, setUserContext] = useState<UserReviewContext>({
    name: "",
    avatar: null,
    email: "",
    defaultRole: "",
    enterpriseOrg: "",
    personalWorkspaceName: "",
    completedTasksCount: 0,
  });

  const currentUserAvatar = useMemo(
    () => userContext.avatar || userState.userInfo?.avatar || null,
    [userContext.avatar, userState.userInfo?.avatar],
  );

  // 编辑模式状态（null 表示新建评价；非空表示正在修改某条已有评价）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customTagInput, setCustomTagInput] = useState("");

  const [form, setForm] = useState({
    category: "personal" as "personal" | "enterprise",
    name: "",
    role: "",
    org: "",
    rating: 5,
    content: "",
    tags: [] as string[],
    highlightLabel: "",
    highlightValue: "",
  });

  // 表单校验错误：内联展示在输入框下方
  const [formErrors, setFormErrors] = useState<{
    name?: string;
    content?: string;
    highlight?: string;
  }>({});

  // 历史评价列表：筛选、排序、搜索、多选、分页、删除与预览
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortMode, setSortMode] = useState<SortAndCategoryMode>("NEWEST");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<5 | 10 | 20 | 50>(5);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    kind: "single" | "batch";
    ids: string[];
    title: string;
    message: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewRow, setPreviewRow] = useState<MyTestimonial | null>(null);

  const authHeaders = useCallback((): HeadersInit => {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const loadMine = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      try {
        const res = await fetch("/api/testimonials/mine", {
          headers: authHeaders(),
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        if (res.ok && data?.success) {
          const list: MyTestimonial[] = Array.isArray(data.testimonials)
            ? data.testimonials
            : [];
          setRows(list);
          setSelectedIds((prev) => prev.filter((id) => list.some((r) => r.id === id)));

          if (data.rotationState) {
            setRotationState(data.rotationState);
          }
          if (Array.isArray(data.availableTags) && data.availableTags.length > 0) {
            setAvailableTags(data.availableTags);
          }
          if (Array.isArray(data.rolePresets) && data.rolePresets.length > 0) {
            setRolePresets(data.rolePresets);
          }
          if (Array.isArray(data.highlightPresets) && data.highlightPresets.length > 0) {
            setHighlightPresets(data.highlightPresets);
          }
          if (data.userContext) {
            setUserContext(data.userContext);
            setForm((prev) => ({
              ...prev,
              name: prev.name || data.userContext.name || userState.userInfo?.name || "",
              role: prev.role || data.userContext.defaultRole || "",
              org:
                prev.org ||
                (prev.category === "enterprise"
                  ? data.userContext.enterpriseOrg
                  : data.userContext.personalWorkspaceName) ||
                "",
              tags:
                prev.tags.length > 0
                  ? prev.tags
                  : Array.isArray(data.availableTags) && data.availableTags.length > 0
                    ? data.availableTags.slice(0, 2)
                    : [],
            }));
          }
          if (isManual) {
            toast.success("评价数据与审核进度已从数据库同步刷新");
          }
        } else {
          toast.error(data?.error || "加载评价记录失败");
        }
      } catch (error) {
        console.error("Load my testimonials error:", error);
        toast.error("加载评价记录失败，请稍后刷新重试");
      } finally {
        setLoading(false);
        if (isManual) setRefreshing(false);
      }
    },
    [authHeaders, toast, userState.userInfo?.name]
  );

  useEffect(() => {
    setMounted(true);
    void loadMine(false);
  }, [loadMine]);

  useEffect(() => {
    if (userState.userInfo?.name) {
      setForm((prev) => ({ ...prev, name: prev.name || userState.userInfo?.name || "" }));
    }
  }, [userState.userInfo?.name]);

  // 弹窗打开时锁定背景滚动
  const hasModal = !!(deleteConfirm || previewRow);
  useEffect(() => {
    if (!hasModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [hasModal]);

  // 统计指标计算
  const stats = useMemo(() => {
    const total = rows.length;
    const active = rows.filter((r) => r.status === "active").length;
    const pending = rows.filter((r) => r.status === "pending").length;
    const rejected = rows.filter((r) => r.status === "rejected").length;
    const hidden = rows.filter((r) => r.status === "hidden").length;
    const personal = rows.filter((r) => r.category === "personal").length;
    const enterprise = rows.filter((r) => r.category === "enterprise").length;
    const avgRating =
      total > 0
        ? (rows.reduce((acc, r) => acc + (Number(r.rating) || 5), 0) / total).toFixed(1)
        : "5.0";
    const fiveStarCount = rows.filter((r) => Number(r.rating) === 5).length;

    return {
      total,
      active,
      pending,
      rejected,
      hidden,
      personal,
      enterprise,
      avgRating,
      fiveStarCount,
    };
  }, [rows]);

  const pendingRow = useMemo(
    () => rows.find((r) => r.status === "pending") || null,
    [rows]
  );

  const editingRow = useMemo(
    () => (editingId ? rows.find((r) => r.id === editingId) || null : null),
    [rows, editingId]
  );

  // 一键带入当前账号与空间上下文信息
  const handleFillUserContext = (targetCategory?: "personal" | "enterprise") => {
    const cat = targetCategory || form.category;
    const nextName = userContext.name || userState.userInfo?.name || form.name;
    const nextRole = userContext.defaultRole || form.role || rolePresets[0] || "";
    const nextOrg =
      cat === "enterprise"
        ? userContext.enterpriseOrg || ""
        : userContext.personalWorkspaceName || "";

    setForm((prev) => ({
      ...prev,
      category: cat,
      name: nextName,
      role: nextRole,
      org: nextOrg,
    }));
    setFormErrors((prev) => ({ ...prev, name: undefined }));
    toast.success(`已自动带入您的${cat === "enterprise" ? "企业客户" : "个人用户"}身份信息`);
  };

  // 候选能力标签展开/收起状态
  const [isTagsExpanded, setIsTagsExpanded] = useState(false);

  // 移除已选中的能力标签
  const removeSelectedTag = (tagToRemove: string) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tagToRemove),
    }));
  };

  // 从候选标签库中删除该标签（支持用户自主清理不需要的标签）
  const handleDeleteTag = (tagToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAvailableTags((prev) => prev.filter((t) => t !== tagToDelete));
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((t) => t !== tagToDelete),
    }));
    toast.info(`已从标签库移除「${tagToDelete}」`);
  };

  // 切换或添加能力标签（最多 6 个）
  const toggleTag = (tag: string) => {
    setForm((prev) => {
      if (prev.tags.includes(tag)) {
        return { ...prev, tags: prev.tags.filter((t) => t !== tag) };
      }
      if (prev.tags.length >= 6) {
        toast.warning("每条评价最多可选择 6 个能力标签");
        return prev;
      }
      return { ...prev, tags: [...prev.tags, tag] };
    });
  };

  const handleAddCustomTag = () => {
    const val = customTagInput.trim();
    if (!val) return;
    if (val.length > 16) {
      toast.warning("单个能力标签不超过 16 个字符");
      return;
    }
    if (form.tags.includes(val)) {
      setCustomTagInput("");
      return;
    }
    if (form.tags.length >= 6) {
      toast.warning("每条评价最多可添加 6 个能力标签");
      return;
    }
    if (!availableTags.includes(val)) {
      setAvailableTags((prev) => [val, ...prev]);
    }
    setForm((prev) => ({ ...prev, tags: [...prev.tags, val] }));
    setCustomTagInput("");
    toast.success(`已添加并选中标签「${val}」`);
  };

  // 进入某条评价的编辑模式
  const startEditRow = (row: MyTestimonial) => {
    setEditingId(row.id);
    setForm({
      category: row.category === "enterprise" ? "enterprise" : "personal",
      name: row.name,
      role: row.role || "",
      org: row.org || "",
      rating: row.rating || 5,
      content: row.content,
      tags: Array.isArray(row.tags) ? row.tags : [],
      highlightLabel: row.highlightLabel || "",
      highlightValue: row.highlightValue || "",
    });
    setFormErrors({});
    formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({
      category: "personal",
      name: userContext.name || userState.userInfo?.name || "",
      role: userContext.defaultRole || "",
      org: userContext.personalWorkspaceName || "",
      rating: 5,
      content: "",
      tags: ["需求梳理与 PRD 生成", "标准化组件拼装"],
      highlightLabel: "",
      highlightValue: "",
    });
    setFormErrors({});
  };

  const handleSubmit = async () => {
    const errors: { name?: string; content?: string; highlight?: string } = {};
    if (!form.name.trim()) errors.name = "请填写您的姓名或称呼";
    if (form.content.trim().length < 10) {
      errors.content = `评价内容至少需要 10 个字符（当前 ${form.content.trim().length} 字）`;
    }
    const hasLabel = !!form.highlightLabel.trim();
    const hasVal = !!form.highlightValue.trim();
    if ((hasLabel && !hasVal) || (!hasLabel && hasVal)) {
      errors.highlight = "量化成效指标的「指标名称」与「指标数值」需同时填写或同时留空";
    }
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const isEditing = !!editingId;
      const endpoint = isEditing ? "/api/testimonials/mine" : "/api/testimonials/submit";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({
          id: editingId || undefined,
          category: form.category,
          name: form.name.trim(),
          role: form.role.trim(),
          org: form.org.trim(),
          rating: form.rating,
          content: form.content.trim(),
          tags: form.tags,
          highlightLabel: form.highlightLabel.trim() || null,
          highlightValue: form.highlightValue.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.error || "提交失败，请稍后重试");
        return;
      }
      toast.success(
        data.message || (isEditing ? "评价修改已保存并重新提交审核" : "评价已提交，感谢您的反馈！")
      );
      setEditingId(null);
      setForm((prev) => ({
        ...prev,
        content: "",
        highlightLabel: "",
        highlightValue: "",
      }));
      await loadMine(false);
    } catch (error) {
      console.error("Submit testimonial error:", error);
      toast.error("网络异常，提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  // 历史记录过滤与排序
  const filteredRows = useMemo(() => {
    const list = rows.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (sortMode === "PERSONAL_ONLY" && r.category !== "personal") return false;
      if (sortMode === "ENTERPRISE_ONLY" && r.category !== "enterprise") return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.trim().toLowerCase();
      const tagsStr = Array.isArray(r.tags) ? r.tags.join(" ").toLowerCase() : "";
      return (
        r.name.toLowerCase().includes(q) ||
        (r.role || "").toLowerCase().includes(q) ||
        (r.org || "").toLowerCase().includes(q) ||
        r.content.toLowerCase().includes(q) ||
        tagsStr.includes(q) ||
        (r.highlightLabel || "").toLowerCase().includes(q) ||
        (r.highlightValue || "").toLowerCase().includes(q) ||
        (r.reviewNote || "").toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortMode === "RATING_DESC") {
        if (b.rating !== a.rating) return b.rating - a.rating;
      }
      const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return tb - ta;
    });
  }, [rows, statusFilter, sortMode, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, sortMode, searchQuery, pageSize]);

  // 多选与批量删除逻辑
  const allPageSelected =
    pagedRows.length > 0 && pagedRows.every((r) => selectedIds.includes(r.id));

  const toggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllPage = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pagedRows.some((r) => r.id === id)));
    } else {
      setSelectedIds((prev) =>
        Array.from(new Set([...prev, ...pagedRows.map((r) => r.id)]))
      );
    }
  };

  const executeDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/testimonials/mine", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        credentials: "include",
        body: JSON.stringify({ ids: deleteConfirm.ids }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "删除评价记录失败");
      }
      if (editingId && deleteConfirm.ids.includes(editingId)) {
        cancelEdit();
      }
      toast.success(data.message || "评价记录已成功删除");
      setDeleteConfirm(null);
      setSelectedIds([]);
      await loadMine(false);
    } catch (err: any) {
      toast.error(err?.message || "删除评价记录失败");
    } finally {
      setDeleting(false);
    }
  };

  // 右侧实时预览卡片数据源（若处于待审核且未开启编辑，则预览该待审核记录；否则实时预览当前表单）
  const livePreviewData = useMemo(() => {
    if (pendingRow && !editingId) {
      return {
        category: pendingRow.category,
        name: pendingRow.name,
        role: pendingRow.role || "全栈研发架构师",
        org: pendingRow.org || "",
        avatar: pendingRow.avatar || currentUserAvatar,
        rating: pendingRow.rating || 5,
        content: pendingRow.content,
        tags: Array.isArray(pendingRow.tags) ? pendingRow.tags : [],
        highlightLabel: pendingRow.highlightLabel || "",
        highlightValue: pendingRow.highlightValue || "",
        isPendingView: true,
      };
    }
    return {
      category: form.category,
      name: form.name.trim() || userContext.name || userState.userInfo?.name || "评价用户",
      role: form.role.trim() || userContext.defaultRole || (rolePresets[0] || "研发工程师"),
      org: form.org.trim(),
      avatar: currentUserAvatar,
      rating: form.rating,
      content:
        form.content.trim() ||
        "请在左侧表单填写您的真实使用体验，右侧将实时呈现官网首页「用户评价」专区的 1:1 展示效果……",
      tags: form.tags,
      highlightLabel: form.highlightLabel.trim(),
      highlightValue: form.highlightValue.trim(),
      isPendingView: false,
    };
  }, [pendingRow, editingId, form, userContext, currentUserAvatar, rolePresets, userState.userInfo?.name]);

  return (
    <div className="space-y-6 font-sans text-left">
      {/* ============ 顶部标准页头 ============ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-sm shadow-blue-500/20 shrink-0">
              <MessageSquareQuote className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight whitespace-nowrap">
              我的使用评价
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#3182ce] border border-blue-200/60 whitespace-nowrap">
              口碑见证 · 门户联动展示
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1.5 ml-10">
            分享您在工作空间进行组件装配、文档解析与团队协同的真实体验；审核通过后将编入官网首页「用户评价」专区轮换展示。
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto ml-10 sm:ml-0 shrink-0">
          <button
            type="button"
            onClick={() => void loadMine(true)}
            disabled={refreshing}
            className="zg-btn zg-btn-default text-xs h-9 px-3.5 gap-1.5 font-bold whitespace-nowrap"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                refreshing ? "animate-spin text-[#3182ce]" : "text-slate-500"
              }`}
            />
            <span>{refreshing ? "刷新中…" : "刷新数据"}</span>
          </button>
          <Link
            href="/#testimonials"
            className="zg-btn zg-btn-primary text-xs h-9 px-4 gap-1.5 font-bold whitespace-nowrap inline-flex items-center"
          >
            <span>查看门户展示专区</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* ============ 4 卡 Bento 核心指标概览 ============ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 卡 1：累计提交评价 */}
        <div className="zg-card p-5 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-[#3182ce]/6 blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">累计提交评价</span>
            <span className="w-7 h-7 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0">
              <MessageSquareQuote className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="flex items-baseline gap-2 my-1">
            <span className="text-2xl font-black font-mono text-slate-800">{stats.total}</span>
            <span className="text-xs text-slate-400 font-bold whitespace-nowrap">条历史反馈</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold mt-2 pt-2 border-t border-slate-100 whitespace-nowrap">
            <span className="text-[#2b6cb0]">个人评价 {stats.personal}</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-600">企业评价 {stats.enterprise}</span>
          </div>
        </div>

        {/* 卡 2：已上架首页展示 */}
        <div className="zg-card p-5 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-emerald-500/6 blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">已上架首页展示</span>
            <span className="w-7 h-7 rounded-lg bg-emerald-50 text-[#38a169] flex items-center justify-center shrink-0">
              <Award className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="flex items-baseline gap-2 my-1">
            <span className="text-2xl font-black font-mono text-[#38a169]">{stats.active}</span>
            <span className="text-xs text-slate-400 font-bold whitespace-nowrap">条入选口碑</span>
          </div>
          <div className="text-[11px] text-slate-500 font-medium mt-2 pt-2 border-t border-slate-100 truncate">
            门户当前轮换：第 <strong className="font-mono text-[#2b6cb0]">{rotationState.activeGroup}</strong> 展示组（共 5 组）
          </div>
        </div>

        {/* 卡 3：审核进度追踪 */}
        <div className="zg-card p-5 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-amber-500/6 blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">审核与修订状态</span>
            <span className="w-7 h-7 rounded-lg bg-amber-50 text-[#dd6b20] flex items-center justify-center shrink-0">
              <Clock className="w-3.5 h-3.5" />
            </span>
          </div>
          <div className="flex items-baseline gap-2 my-1">
            <span className="text-2xl font-black font-mono text-[#dd6b20]">{stats.pending}</span>
            <span className="text-xs text-slate-400 font-bold whitespace-nowrap">条待审核</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-semibold mt-2 pt-2 border-t border-slate-100 whitespace-nowrap">
            <span className={stats.rejected > 0 ? "text-[#e53e3e]" : "text-slate-400"}>
              需修改重提 {stats.rejected}
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-400">已下架 {stats.hidden}</span>
          </div>
        </div>

        {/* 卡 4：综合满意度评分 */}
        <div className="zg-card p-5 relative overflow-hidden flex flex-col justify-between">
          <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full bg-[#3182ce]/6 blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">我的平均满意度</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-[#dd6b20] border border-amber-200/60 whitespace-nowrap shrink-0">
              5 星好评 {stats.fiveStarCount} 条
            </span>
          </div>
          <div className="flex items-center gap-2 my-1">
            <span className="text-2xl font-black font-mono text-[#2b6cb0]">{stats.avgRating}</span>
            <div className="flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`w-3.5 h-3.5 ${
                    s <= Math.round(Number(stats.avgRating))
                      ? "text-amber-400 fill-amber-400"
                      : "text-slate-200"
                  }`}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mt-2 pt-2 border-t border-slate-100 whitespace-nowrap overflow-hidden">
            <ShieldCheck className="w-3.5 h-3.5 text-[#38a169] shrink-0" />
            <span className="truncate">真实原话保护 · 后台严禁篡改评价正文</span>
          </div>
        </div>
      </div>

      {/* ============ 区块一：评价撰写/编辑工作台 + 门户首页卡片实时预览（左 7 右 5 双栏 Bento） ============ */}
      <div ref={formSectionRef} className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* 左侧 7 列：提交或编辑表单 / 待审核状态管理卡 */}
        <div className="lg:col-span-7">
          {pendingRow && !editingId ? (
            <div className="zg-card p-6 h-full flex flex-col justify-between space-y-5 border-amber-200/80 bg-gradient-to-br from-amber-50/40 via-white to-white">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-[#dd6b20] flex items-center justify-center shrink-0">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-black text-slate-800">
                        您有一条使用评价正在等待运营团队审核
                      </h2>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        提交时间：{formatTime(pendingRow.submittedAt)} · 审核期间您可随时修改内容或撤回
                      </p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200/80 whitespace-nowrap">
                    待审核归组
                  </span>
                </div>

                <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-800">{pendingRow.name}</span>
                      <span className="text-xs text-slate-500">
                        {pendingRow.org
                          ? `${pendingRow.org} · ${pendingRow.role || "研发成员"}`
                          : pendingRow.role || "个人用户"}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200/60">
                        {CATEGORY_LABEL[pendingRow.category] || pendingRow.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-amber-500 text-xs font-bold">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span>{pendingRow.rating}.0 分</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed bg-white p-3.5 rounded-lg border border-slate-200/60">
                    “{pendingRow.content}”
                  </p>

                  {(pendingRow.highlightLabel ||
                    (Array.isArray(pendingRow.tags) && pendingRow.tags.length > 0)) && (
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                      <div className="flex flex-wrap gap-1.5">
                        {pendingRow.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-white text-slate-600 border border-slate-200/80"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                      {pendingRow.highlightLabel && pendingRow.highlightValue && (
                        <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200/60">
                          {pendingRow.highlightLabel}：{pendingRow.highlightValue}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-3 pt-4 border-t border-slate-100">
                <span className="text-[11px] text-slate-500">
                  审核通过后系统将通过站内信通知您，并可继续提交新的评价体验。
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEditRow(pendingRow)}
                    className="zg-btn zg-btn-primary !h-8 !px-3.5 !text-xs gap-1.5 font-bold"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>修改待审评价</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteConfirm({
                        kind: "single",
                        ids: [pendingRow.id],
                        title: `${pendingRow.name}（待审核评价）`,
                        message: "确认撤回并删除这条待审核评价吗？撤回后您可以立即重新撰写新评价。",
                      })
                    }
                    className="zg-btn !bg-red-50 hover:!bg-red-100 !text-[#e53e3e] !border-red-200 !h-8 !px-3.5 !text-xs gap-1.5 font-bold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>撤回并删除</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="zg-card p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2 pb-3.5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full" />
                  <h2 className="text-sm font-black text-slate-800">
                    {editingId ? "编辑评价并重新提交审核" : "写下您的真实使用评价"}
                  </h2>
                  {editingId && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200/70">
                      正在修改历史记录
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleFillUserContext()}
                    className="zg-btn zg-btn-default !h-7 !px-2.5 !text-[11px] gap-1 font-bold"
                    title="从数据库自动带入当前账号姓名、岗位与工作空间单位"
                  >
                    <Sparkles className="w-3 h-3 text-[#3182ce]" />
                    <span>一键带入账号与空间信息</span>
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="zg-btn zg-btn-default !h-7 !px-2.5 !text-[11px] gap-1 font-bold text-slate-600"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>取消编辑</span>
                    </button>
                  )}
                </div>
              </div>

              {/* 若正在修改一条被驳回的评价，顶部醒目提示管理员审核备注 */}
              {editingRow && editingRow.status === "rejected" && editingRow.reviewNote && (
                <div className="rounded-xl bg-red-50/80 border border-red-200/80 p-3.5 flex items-start gap-2.5 text-xs">
                  <AlertCircle className="w-4 h-4 text-[#e53e3e] shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <div className="font-black text-red-700">管理员审核修订建议：</div>
                    <div className="text-red-600 leading-relaxed">{editingRow.reviewNote}</div>
                  </div>
                </div>
              )}

              {/* 当前评价关联的真实用户账号与头像展示 */}
              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/70 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {currentUserAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={currentUserAvatar}
                      alt={form.name || userContext.name || "用户头像"}
                      className="w-10 h-10 rounded-full object-cover shrink-0 border border-slate-200 shadow-2xs"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4299e1] to-[#2b6cb0] text-white text-xs font-black flex items-center justify-center shrink-0 shadow-2xs">
                      {(form.name || userContext.name || userState.userInfo?.name || "用").trim().charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-800 truncate">
                        {form.name || userContext.name || userState.userInfo?.name || "知阁用户"}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 shrink-0">
                        已关联真实头像
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">
                      审核通过后将携带此真实头像在官网首页「真实用户评价」专区轮换展示
                    </p>
                  </div>
                </div>
              </div>

              {/* 第一行：评价身份 + 满意度星级 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-0.5">
                <div>
                  <span className="text-xs font-bold text-slate-700 block mb-1.5">
                    评价展示身份
                  </span>
                  <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 border border-slate-200/70">
                    {(["personal", "enterprise"] as const).map((key) => {
                      const active = form.category === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setForm((p) => ({
                              ...p,
                              category: key,
                              org:
                                key === "enterprise"
                                  ? p.org || userContext.enterpriseOrg
                                  : p.org || userContext.personalWorkspaceName,
                            }));
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                            active
                              ? "bg-[#3182ce] text-white shadow-2xs"
                              : "text-slate-600 hover:text-slate-800"
                          }`}
                        >
                          {key === "personal" ? (
                            <User className="w-3.5 h-3.5" />
                          ) : (
                            <Building2 className="w-3.5 h-3.5" />
                          )}
                          <span>{CATEGORY_LABEL[key]}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className="text-xs font-bold text-slate-700 block mb-1.5">
                    综合满意度星级
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <div className="flex items-center gap-0.5">
                      {[1, 2, 3, 4, 5].map((r) => (
                        <button
                          key={r}
                          type="button"
                          aria-label={`${r} 星`}
                          onClick={() => setForm((p) => ({ ...p, rating: r }))}
                          className="p-1 rounded-md hover:bg-amber-50 transition-colors cursor-pointer"
                        >
                          <Star
                            className={`w-5 h-5 transition-transform hover:scale-110 ${
                              r <= form.rating
                                ? "text-amber-400 fill-amber-400"
                                : "text-slate-200"
                            }`}
                          />
                        </button>
                      ))}
                    </div>
                    <span className="text-xs font-black font-mono text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/70">
                      {form.rating}.0 分
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium truncate">
                      {RATING_TEXT_MAP[form.rating]}
                    </span>
                  </div>
                </div>
              </div>

              {/* 第二行：姓名 + 职位 + 机构单位（平整三列自适应排布，底部完美平齐） */}
              <div className="space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 items-start">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5 zg-required">
                      姓名 / 称呼
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, name: e.target.value }));
                        if (formErrors.name) setFormErrors((p) => ({ ...p, name: undefined }));
                      }}
                      placeholder="如：林一帆 / 王总监"
                      className={`zg-input !h-9 text-xs w-full ${formErrors.name ? "is-error" : ""}`}
                    />
                    {formErrors.name && (
                      <span className="mt-1 block text-[11px] font-bold text-red-500">
                        {formErrors.name}
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      身份 / 岗位角色
                    </label>
                    <input
                      type="text"
                      value={form.role}
                      onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                      placeholder="如：全栈研发架构师 / 项目经理"
                      className="zg-input !h-9 text-xs w-full"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      所属机构 / 空间单位（选填）
                    </label>
                    <input
                      type="text"
                      value={form.org}
                      onChange={(e) => setForm((p) => ({ ...p, org: e.target.value }))}
                      placeholder="如：某某软件科技 / 个人研发空间"
                      className="zg-input !h-9 text-xs w-full"
                    />
                  </div>
                </div>

                {/* 岗位角色快捷候选栏（平整排在三列下方，完全解决中间列突出、两边凹陷的错位） */}
                {rolePresets.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-[11px] text-slate-400">
                    <span className="shrink-0 font-medium text-slate-500">快捷填入岗位：</span>
                    {rolePresets.slice(0, 6).map((preset) => {
                      const isCurrent = form.role === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setForm((p) => ({ ...p, role: preset }))}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer border ${
                            isCurrent
                              ? "bg-blue-50 text-[#3182ce] border-blue-200 font-bold"
                              : "bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-[#2b6cb0] border-transparent"
                          }`}
                        >
                          {preset}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 第三行：能力标签选择（重构：支持删除标签、已选卡片栏与折叠展开，告别混乱平铺） */}
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2.5 pb-2.5 border-b border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-[#3182ce]" />
                    <span className="text-xs font-bold text-slate-800">关联能力标签</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#2b6cb0] border border-blue-200/60 font-mono">
                      已选 {form.tags.length} / 6 项
                    </span>
                    <span className="text-[11px] text-slate-400 hidden sm:inline">（选填，展示于首页评价卡片底部）</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={customTagInput}
                      onChange={(e) => setCustomTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCustomTag();
                        }
                      }}
                      placeholder="自定义新标签…"
                      className="zg-input !h-7.5 !w-32 !px-2.5 !py-0 !text-xs bg-white rounded-lg border-slate-200"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomTag}
                      className="zg-btn zg-btn-primary !h-7.5 !px-2.5 !text-xs gap-1 font-bold rounded-lg cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>添加</span>
                    </button>
                  </div>
                </div>

                {/* 1. 已选标签区域（直观删除 / 取消选择） */}
                {form.tags.length > 0 && (
                  <div className="p-2.5 bg-blue-50/50 rounded-lg border border-blue-100 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] font-bold text-[#2b6cb0] shrink-0 mr-1">已选标签：</span>
                      {form.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-bold bg-[#3182ce] text-white shadow-2xs group animate-in fade-in duration-150"
                        >
                          <span>{tag}</span>
                          <button
                            type="button"
                            onClick={() => removeSelectedTag(tag)}
                            className="w-4 h-4 rounded-full flex items-center justify-center bg-white/20 hover:bg-white/35 text-white transition-colors cursor-pointer"
                            title="删除此标签"
                          >
                            <X className="w-2.5 h-2.5 stroke-[3]" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, tags: [] }))}
                      className="text-[11px] text-slate-400 hover:text-rose-600 font-bold transition-colors cursor-pointer shrink-0 ml-auto"
                    >
                      清空已选
                    </button>
                  </div>
                )}

                {/* 2. 候选能力标签库（支持单项删除 × 与展开/收起） */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span className="font-medium">点击可选标签加入评价（悬停点击 × 可从标签库删除）：</span>
                    {availableTags.length > 15 && (
                      <button
                        type="button"
                        onClick={() => setIsTagsExpanded((v) => !v)}
                        className="text-[11px] font-bold text-[#3182ce] hover:underline cursor-pointer"
                      >
                        {isTagsExpanded ? "收起标签池 ▴" : `展开全部 (${availableTags.length}) ▾`}
                      </button>
                    )}
                  </div>

                  <div className={`flex flex-wrap gap-1.5 transition-all ${isTagsExpanded ? "max-h-60 overflow-y-auto pr-1" : ""}`}>
                    {availableTags.length === 0 ? (
                      <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#3182ce]" />
                        <span>正在从数据库加载已发布组件与能力标签…</span>
                      </div>
                    ) : (
                      (isTagsExpanded ? availableTags : availableTags.slice(0, 15)).map((tag) => {
                        const selected = form.tags.includes(tag);
                        return (
                          <div
                            key={tag}
                            onClick={() => toggleTag(tag)}
                            className={`group/tag inline-flex items-center pl-2.5 pr-2 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer select-none ${
                              selected
                                ? "bg-[#3182ce] text-white border-[#3182ce] shadow-2xs ring-2 ring-[#3182ce]/20"
                                : "bg-white text-slate-600 border-slate-200/80 hover:border-[#3182ce]/60 hover:text-[#2b6cb0] hover:bg-blue-50/30"
                            }`}
                          >
                            <span>{selected ? `✓ ${tag}` : `+ ${tag}`}</span>
                            {/* 标签物理删除按钮（满足“支持删除”） */}
                            <button
                              type="button"
                              onClick={(e) => handleDeleteTag(tag, e)}
                              className={`ml-1.5 w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                                selected
                                  ? "hover:bg-white/30 text-white/70 hover:text-white"
                                  : "opacity-40 group-hover/tag:opacity-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600"
                              }`}
                              title="删除此标签"
                            >
                              <X className="w-2.5 h-2.5 stroke-[2.5]" />
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* 第四行：可量化成效指标（知阁标准卡片重构，消除截断与杂乱） */}
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[#3182ce]" />
                    <span className="text-xs font-bold text-slate-800">量化提效指标</span>
                    <span className="text-[11px] text-slate-400">（选填，用于在官网评价中展示突出成效）</span>
                  </div>

                  {(form.highlightLabel || form.highlightValue) && (
                    <button
                      type="button"
                      onClick={() => {
                        setForm((p) => ({ ...p, highlightLabel: "", highlightValue: "" }));
                        setFormErrors((p) => ({ ...p, highlight: undefined }));
                      }}
                      className="text-[11px] font-bold text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                      清空成效
                    </button>
                  )}
                </div>

                {/* 推荐指标预设胶囊池 */}
                {highlightPresets.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-medium text-slate-500">点击套用推荐成效：</div>
                    <div className="flex flex-wrap gap-1.5">
                      {highlightPresets.map((hp) => {
                        const isSelected = form.highlightLabel === hp.label && form.highlightValue === hp.value;
                        return (
                          <button
                            key={hp.label}
                            type="button"
                            onClick={() => {
                              setForm((p) => ({
                                ...p,
                                highlightLabel: hp.label,
                                highlightValue: hp.value,
                              }));
                              setFormErrors((p) => ({ ...p, highlight: undefined }));
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                              isSelected
                                ? "bg-[#3182ce] text-white border-[#3182ce] shadow-2xs"
                                : "bg-white hover:bg-blue-50 text-slate-600 hover:text-[#2b6cb0] border-slate-200 hover:border-blue-300"
                            }`}
                          >
                            <span>{hp.label}</span>
                            <span className={`ml-1 font-mono ${isSelected ? "text-blue-100" : "text-[#3182ce]"}`}>
                              {hp.value}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 双输入框（无截断、充分宽度） */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">成效指标名称</label>
                    <input
                      type="text"
                      value={form.highlightLabel}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, highlightLabel: e.target.value }));
                        if (formErrors.highlight)
                          setFormErrors((p) => ({ ...p, highlight: undefined }));
                      }}
                      placeholder="如：项目交付周期 / 需求与接口设计耗时"
                      className="zg-input !h-9 text-xs bg-white w-full rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 block mb-1">成效提升数值</label>
                    <input
                      type="text"
                      value={form.highlightValue}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, highlightValue: e.target.value }));
                        if (formErrors.highlight)
                          setFormErrors((p) => ({ ...p, highlight: undefined }));
                      }}
                      placeholder="如：-65% / 一次通过率 100% / 缩短至半天"
                      className="zg-input !h-9 text-xs font-mono bg-white w-full rounded-lg"
                    />
                  </div>
                </div>
                {formErrors.highlight && (
                  <span className="block text-[11px] font-bold text-red-500">
                    {formErrors.highlight}
                  </span>
                )}
              </div>

              {/* 第五行：评价正文 */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 zg-required">
                    评价反馈正文
                  </label>
                  <span className="text-[11px] font-medium text-slate-400">
                    已输入 <strong className="font-mono text-slate-600">{form.content.trim().length}</strong> / 1000 字（不少于 10 字）
                  </span>
                </div>
                <textarea
                  value={form.content}
                  onChange={(e) => {
                    setForm((p) => ({ ...p, content: e.target.value }));
                    if (formErrors.content)
                      setFormErrors((p) => ({ ...p, content: undefined }));
                  }}
                  rows={4}
                  maxLength={1000}
                  placeholder="请结合您实际使用的功能模块（如：标书智能解析、需求设计、组件拼装、空间算力管理等），分享真实的业务提效感受……"
                  className={`zg-input text-xs resize-none leading-relaxed ${
                    formErrors.content ? "is-error" : ""
                  }`}
                />
                {formErrors.content && (
                  <span className="mt-1 block text-[11px] font-bold text-red-500">
                    {formErrors.content}
                  </span>
                )}
              </div>

              {/* 提交操作栏 */}
              <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-slate-100">
                <span className="text-[11px] text-slate-400">
                  提交后进入运营审核队列，右侧可实时预览门户首页展示效果
                </span>
                <div className="flex items-center gap-2">
                  {editingId && (
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="zg-btn zg-btn-default text-xs h-9 px-4 font-bold"
                    >
                      取消修改
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => void handleSubmit()}
                    className="zg-btn zg-btn-primary text-xs h-9 px-5 gap-1.5 font-bold"
                  >
                    {submitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {submitting
                        ? "正在提交…"
                        : editingId
                          ? "保存修改并重新提交审核"
                          : "提交评价反馈"}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 右侧 5 列：官网首页展示卡片 1:1 实时预览 + 审核与轮换机制说明 */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-4">
          <div className="zg-card p-5 space-y-4 flex-1 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#3182ce]" />
                  <h3 className="text-xs font-black text-slate-800">
                    门户首页「用户评价」卡片实时预览
                  </h3>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200/60">
                  {livePreviewData.isPendingView ? "当前待审内容预览" : "1:1 实时渲染"}
                </span>
              </div>

              {/* 模拟门户首页 TestimonialsSection 卡片 */}
              <div className="rounded-xl border border-slate-200/90 bg-white p-5 relative shadow-xs flex flex-col justify-between min-h-[240px]">
                <Quote className="absolute top-4 right-4 w-8 h-8 text-blue-100 pointer-events-none" />

                <div>
                  {/* 星级与身份标签 */}
                  <div className="flex items-center justify-between gap-2 mb-3 pr-8">
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3.5 h-3.5 ${
                            i < livePreviewData.rating
                              ? "text-amber-400 fill-amber-400"
                              : "text-slate-200"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-[#2b6cb0] border border-blue-200/60">
                      {CATEGORY_LABEL[livePreviewData.category] || "个人用户"}
                    </span>
                  </div>

                  {/* 评价正文 */}
                  <p className="text-xs text-slate-700 leading-relaxed break-words">
                    “{livePreviewData.content}”
                  </p>

                  {/* 成效指标高亮条 */}
                  {livePreviewData.highlightLabel && livePreviewData.highlightValue && (
                    <div className="mt-3.5 flex items-center justify-between rounded-lg bg-[#ebf8ff] border border-blue-200/70 px-3 py-2">
                      <span className="text-[11px] font-bold text-[#2b6cb0]">
                        {livePreviewData.highlightLabel}
                      </span>
                      <span className="text-xs font-black text-[#2b6cb0] font-mono">
                        {livePreviewData.highlightValue}
                      </span>
                    </div>
                  )}

                  {/* 能力标签 */}
                  {livePreviewData.tags.length > 0 && (
                    <div className="mt-3.5 flex flex-wrap gap-1.5">
                      {livePreviewData.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 底部评价人信息 */}
                <div className="mt-4 pt-3.5 border-t border-slate-100 flex items-center gap-3">
                  {livePreviewData.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={livePreviewData.avatar}
                      alt={livePreviewData.name}
                      className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200 shadow-2xs"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4299e1] to-[#2b6cb0] text-white text-xs font-black flex items-center justify-center shrink-0">
                      {livePreviewData.name.trim().charAt(0) || "评"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-800 truncate">
                      {livePreviewData.name}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {livePreviewData.org
                        ? `${livePreviewData.org} · ${livePreviewData.role}`
                        : livePreviewData.role}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 评价展示与审核合规说明 */}
            <div className="rounded-xl bg-slate-50/80 border border-slate-200/70 p-3.5 space-y-2 text-[11px] text-slate-600">
              <div className="font-black text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#38a169]" />
                <span>口碑展示与原话保护规范</span>
              </div>
              <ul className="space-y-1 text-slate-500 leading-relaxed list-disc list-inside">
                <li>
                  <strong className="text-slate-700">原话防篡改：</strong>
                  您提交的评价正文、星级与身份受系统保护，后台审核仅分配展示分组，不可篡改原话。
                </li>
                <li>
                  <strong className="text-slate-700">5 组周轮换机制：</strong>
                  门户首页共设 5 个展示组（当前展示第 {rotationState.activeGroup} 组），默认每周自动轮换。
                </li>
                <li>
                  <strong className="text-slate-700">自主可控：</strong>
                  您可随时在下方历史记录中修改重提、导出存档，或单条/批量删除已提交的评价。
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ============ 区块二：历史提交评价记录（支持状态筛选、搜索、编辑重提、导出、单条删除与批量删除） ============ */}
      <div className="zg-card p-0 overflow-hidden">
        {/* 第一行：标题概览与状态筛选胶囊 */}
        <div className="px-5 py-3.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/40">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-1 h-4 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full shrink-0" />
            <h2 className="text-sm font-black text-slate-800 whitespace-nowrap">
              历史提交评价记录
            </h2>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-[#2b6cb0] border border-blue-200/60 whitespace-nowrap shrink-0">
              共 {filteredRows.length} / {rows.length} 条
            </span>
          </div>

          {/* 状态筛选胶囊 */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-slate-100/90 border border-slate-200/60 text-xs shrink-0 self-start sm:self-auto overflow-x-auto max-w-full">
            {(
              [
                { key: "ALL", label: `全部 (${stats.total})` },
                { key: "active", label: `已展示 (${stats.active})` },
                { key: "pending", label: `待审核 (${stats.pending})` },
                { key: "rejected", label: `未通过 (${stats.rejected})` },
                { key: "hidden", label: `已下架 (${stats.hidden})` },
              ] as { key: StatusFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === tab.key
                    ? "bg-white text-[#2b6cb0] shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 第二行：操作工具条（全选/批量删除 + 排序与检索） */}
        <div
          className={`px-5 py-2.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors ${
            selectedIds.length > 0
              ? "bg-blue-50/85 border-blue-200/80"
              : "bg-slate-50/60 border-slate-100"
          }`}
        >
          {/* 左侧：全选本页与批量删除 */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={toggleSelectAllPage}
              disabled={filteredRows.length === 0}
              className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-[#2b6cb0] cursor-pointer disabled:opacity-40"
            >
              {allPageSelected ? (
                <CheckSquare className="w-4 h-4 text-[#3182ce]" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>全选本页 ({pagedRows.length} 条)</span>
            </button>

            {selectedIds.length > 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-slate-300">|</span>
                <span className="font-bold text-[#2b6cb0]">
                  已勾选 {selectedIds.length} 条
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setDeleteConfirm({
                      kind: "batch",
                      ids: selectedIds,
                      title: `已勾选的 ${selectedIds.length} 条历史评价记录`,
                      message: `确认批量删除已勾选的 ${selectedIds.length} 条使用评价记录吗？删除后将从数据库与首页展示组中永久移除。`,
                    })
                  }
                  className="zg-btn !bg-red-50 hover:!bg-red-100 !text-[#e53e3e] !border-red-200 !h-7 !px-3 !text-xs gap-1 font-bold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>批量删除 ({selectedIds.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="zg-btn zg-btn-default !h-7 !px-2.5 !text-xs font-bold"
                >
                  取消选择
                </button>
              </div>
            ) : (
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                提示：勾选左侧复选框可执行批量删除
              </span>
            )}
          </div>

          {/* 右侧：排序与关键词检索（无任何导出功能） */}
          <div className="flex items-center gap-2 self-end sm:self-auto w-full sm:w-auto">
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortAndCategoryMode)}
              className="zg-input !h-8 !w-auto !py-0 !px-2.5 !text-xs font-bold text-slate-700 cursor-pointer shrink-0 bg-white"
              title="切换排序或身份过滤维度"
            >
              <option value="NEWEST">按最新提交排序</option>
              <option value="RATING_DESC">按满意度评分最高</option>
              <option value="PERSONAL_ONLY">仅看个人用户身份</option>
              <option value="ENTERPRISE_ONLY">仅看企业客户身份</option>
            </select>

            <div className="relative flex-1 sm:w-56 shrink-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索正文、单位、标签或备注…"
                className="zg-input !h-8 !pl-8 !pr-7 !text-xs bg-white w-full"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 列表主体 */}
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 zg-skeleton rounded-xl" />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-14 px-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#3182ce] border border-blue-200/60 flex items-center justify-center mx-auto mb-3">
              <MessageSquareQuote className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-black text-slate-800 mb-1">
              {rows.length === 0 ? "暂未提交过任何使用评价记录" : "未找到匹配的评价记录"}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">
              {rows.length === 0
                ? "欢迎在上方表单写下您的真实使用体验，审核通过后将在官网首页展示。"
                : "请尝试调整搜索关键词或切换上方的审核状态筛选条件。"}
            </p>
            {rows.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter("ALL");
                  setSortMode("NEWEST");
                  setSearchQuery("");
                }}
                className="zg-btn zg-btn-default text-xs h-8 px-3.5 font-bold"
              >
                重置筛选条件
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {pagedRows.map((row) => {
                const meta = STATUS_META[row.status] ?? STATUS_META.pending;
                const StatusIcon = meta.icon;
                const checked = selectedIds.includes(row.id);
                const isBeingEdited = editingId === row.id;
                const isLiveOnHome =
                  row.status === "active" && row.groupNo === rotationState.activeGroup;

                return (
                  <div
                    key={row.id}
                    className={`p-5 transition-colors flex items-start gap-3.5 ${
                      checked
                        ? "bg-blue-50/35"
                        : isBeingEdited
                          ? "bg-amber-50/30"
                          : "hover:bg-slate-50/70"
                    }`}
                  >
                    {/* 左侧多选复选框 */}
                    <button
                      type="button"
                      onClick={() => toggleSelectRow(row.id)}
                      className="mt-1 text-slate-400 hover:text-[#3182ce] shrink-0 cursor-pointer"
                      title="勾选该条评价记录"
                    >
                      {checked ? (
                        <CheckSquare className="w-4 h-4 text-[#3182ce]" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>

                    {/* 中间主体信息 */}
                    <div className="flex-1 min-w-0 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {row.avatar || currentUserAvatar ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={row.avatar || currentUserAvatar || ""}
                              alt={row.name}
                              className="w-7 h-7 rounded-full object-cover shrink-0 border border-slate-200 shadow-2xs"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#4299e1] to-[#2b6cb0] text-white text-xs font-black flex items-center justify-center shrink-0">
                              {row.name.trim().charAt(0) || "评"}
                            </div>
                          )}
                          <span className="text-sm font-black text-slate-800">{row.name}</span>
                          <span className="text-xs font-medium text-slate-500">
                            {row.org ? `${row.org} · ${row.role || "研发成员"}` : row.role || ""}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${
                              row.category === "enterprise"
                                ? "bg-blue-50 text-[#2b6cb0] border-blue-200/70"
                                : "bg-slate-100 text-slate-700 border-slate-200/80"
                            }`}
                          >
                            {CATEGORY_LABEL[row.category] || row.category}
                          </span>
                          <div className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-amber-50 border border-amber-200/60 text-amber-600 text-[11px] font-bold whitespace-nowrap">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            <span>{row.rating}.0 分</span>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${meta.style}`}
                            title={meta.desc}
                          >
                            <StatusIcon className="w-3 h-3" />
                            <span>{meta.label}</span>
                          </span>
                          {row.status === "active" && (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border whitespace-nowrap ${
                                isLiveOnHome
                                  ? "bg-emerald-50 text-[#38a169] border-emerald-200/80"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                              }`}
                            >
                              {isLiveOnHome
                                ? `第 ${row.groupNo} 组 · 首页正在轮换展示`
                                : `首页第 ${row.groupNo} 轮换组`}
                            </span>
                          )}
                        </div>

                        {/* 右侧操作按钮组 */}
                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start pt-0.5">
                          <button
                            type="button"
                            onClick={() => setPreviewRow(row)}
                            className="zg-btn zg-btn-default !h-7 !px-2.5 !text-[11px] gap-1 font-bold whitespace-nowrap"
                            title="预览该条评价在门户首页的展示卡片效果"
                          >
                            <Eye className="w-3 h-3 text-slate-500" />
                            <span>预览卡片</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditRow(row)}
                            className="zg-btn !bg-blue-50/80 hover:!bg-blue-100/80 !text-[#2b6cb0] !border-blue-200/80 !h-7 !px-2.5 !text-[11px] gap-1 font-bold whitespace-nowrap"
                            title="修改评价内容、标签或成效指标并重新提交"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>{row.status === "rejected" ? "编辑重提" : "编辑"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDeleteConfirm({
                                kind: "single",
                                ids: [row.id],
                                title: `${row.name}（${CATEGORY_LABEL[row.category] || "用户评价"} · ${row.rating}.0 分）`,
                                message: "确认删除这条历史评价记录吗？删除后不可恢复。",
                              })
                            }
                            className="zg-btn !bg-red-50/80 hover:!bg-red-100/80 !text-[#e53e3e] !border-red-200/80 !h-7 !px-2.5 !text-[11px] gap-1 font-bold whitespace-nowrap"
                            title="删除该条评价记录"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>删除</span>
                          </button>
                        </div>
                      </div>

                      {/* 评价正文 */}
                      <p className="text-xs text-slate-700 leading-relaxed">{row.content}</p>

                      {/* 能力标签与量化成效指标展示 */}
                      {((Array.isArray(row.tags) && row.tags.length > 0) ||
                        (row.highlightLabel && row.highlightValue)) && (
                        <div className="flex items-center flex-wrap gap-2 pt-0.5">
                          {row.highlightLabel && row.highlightValue && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#ebf8ff] text-[#2b6cb0] border border-blue-200/70 text-[11px] font-bold">
                              <TrendingUp className="w-3 h-3" />
                              <span>
                                {row.highlightLabel}：<strong>{row.highlightValue}</strong>
                              </span>
                            </span>
                          )}
                          {Array.isArray(row.tags) &&
                            row.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200/60"
                              >
                                {tag}
                              </span>
                            ))}
                        </div>
                      )}

                      {/* 审核备注提示框 */}
                      {row.reviewNote && (
                        <div
                          className={`px-3 py-2 rounded-lg border text-[11px] flex items-center justify-between flex-wrap gap-2 ${
                            row.status === "rejected"
                              ? "bg-red-50/70 border-red-200/80 text-red-700"
                              : "bg-slate-50 border-slate-200/70 text-slate-600"
                          }`}
                        >
                          <span>
                            <strong className="font-bold">
                              {row.status === "rejected" ? "未通过原因与建议：" : "运营审核备注："}
                            </strong>
                            {row.reviewNote}
                          </span>
                          {row.status === "rejected" && (
                            <button
                              type="button"
                              onClick={() => startEditRow(row)}
                              className="text-[11px] font-black text-[#2b6cb0] hover:underline cursor-pointer shrink-0"
                            >
                              立即修改并重新提交 →
                            </button>
                          )}
                        </div>
                      )}

                      {/* 底部时间元信息 */}
                      <div className="text-[11px] text-slate-400 flex items-center gap-4 flex-wrap">
                        <span>提交时间：{formatTime(row.submittedAt)}</span>
                        {row.updatedAt && row.updatedAt !== row.submittedAt && (
                          <span>最后更新：{formatTime(row.updatedAt)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 底部常驻分页控制栏 */}
            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
              <div className="flex items-center gap-2 flex-wrap">
                <span>
                  共 <strong className="font-black text-slate-700">{filteredRows.length}</strong> 条评价记录 · 当前显示第{" "}
                  <strong className="font-mono text-slate-700">
                    {(safePage - 1) * pageSize + 1}–
                    {Math.min(safePage * pageSize, filteredRows.length)}
                  </strong>{" "}
                  条
                </span>
                <span className="text-slate-300">|</span>
                <label className="inline-flex items-center gap-1.5">
                  <span>每页显示</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value) as 5 | 10 | 20 | 50);
                      setPage(1);
                    }}
                    className="zg-input !h-7 !w-auto !py-0 !px-2 !text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    <option value={5}>5 条</option>
                    <option value={10}>10 条</option>
                    <option value={20}>20 条</option>
                    <option value={50}>50 条</option>
                  </select>
                </label>
              </div>

              <div className="flex items-center gap-1.5 self-end sm:self-auto">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage(1)}
                  className="zg-btn zg-btn-default !h-7 !px-2.5 !text-xs gap-1 disabled:opacity-40"
                >
                  <span>首页</span>
                </button>
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="zg-btn zg-btn-default !h-7 !px-2.5 !text-xs gap-1 disabled:opacity-40"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>上一页</span>
                </button>
                <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200/80 font-mono text-[11px] font-bold text-slate-700">
                  第 {safePage} / {totalPages} 页
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="zg-btn zg-btn-default !h-7 !px-2.5 !text-xs gap-1 disabled:opacity-40"
                >
                  <span>下一页</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(totalPages)}
                  className="zg-btn zg-btn-default !h-7 !px-2.5 !text-xs gap-1 disabled:opacity-40"
                >
                  <span>末页</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ============ 弹窗 1：单条/批量删除确认弹窗（Portal 挂载至 document.body） ============ */}
      {mounted &&
        deleteConfirm &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-[1000] p-4">
            <div className="bg-white/98 backdrop-blur-xl rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-200/80 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200/80 flex items-center justify-center text-[#e53e3e] shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">
                    {deleteConfirm.kind === "batch"
                      ? "确认批量删除历史评价"
                      : "确认删除历史评价"}
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {deleteConfirm.message}
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1 mb-4">
                <div className="font-bold text-slate-800">{deleteConfirm.title}</div>
                <div className="text-[11px] text-slate-500">
                  共涉及 <strong className="font-mono text-[#e53e3e]">{deleteConfirm.ids.length}</strong> 条评价记录
                </div>
              </div>

              <div className="flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  disabled={deleting}
                  className="zg-btn zg-btn-default text-xs h-8 px-4"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void executeDelete()}
                  disabled={deleting}
                  className="zg-btn zg-btn-danger text-xs h-8 px-4 font-bold"
                >
                  {deleting ? "正在删除…" : "确认删除"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ============ 弹窗 2：单条评价门户卡片效果预览弹窗（Portal 挂载至 document.body） ============ */}
      {mounted &&
        previewRow &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-[1000] p-4">
            <div className="bg-white/98 backdrop-blur-xl rounded-2xl shadow-2xl max-w-md w-full p-6 relative border border-slate-200/80 animate-in fade-in zoom-in-95 duration-150">
              <button
                type="button"
                onClick={() => setPreviewRow(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 text-slate-400" />
              </button>

              <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-slate-100">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">门户首页卡片展示预览</h3>
                  <p className="text-[11px] text-slate-500">
                    状态：{STATUS_META[previewRow.status]?.label || previewRow.status} · 归属第 {previewRow.groupNo} 轮换组
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-5 relative">
                <Quote className="absolute top-4 right-4 w-8 h-8 text-blue-100 pointer-events-none" />
                <div className="flex items-center gap-0.5 mb-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-3.5 h-3.5 ${
                        i < previewRow.rating
                          ? "text-amber-400 fill-amber-400"
                          : "text-slate-200"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">“{previewRow.content}”</p>

                {previewRow.highlightLabel && previewRow.highlightValue && (
                  <div className="mt-4 flex items-center justify-between rounded-lg bg-[#ebf8ff] border border-blue-200/70 px-3 py-2">
                    <span className="text-[11px] font-bold text-[#2b6cb0]">
                      {previewRow.highlightLabel}
                    </span>
                    <span className="text-xs font-black text-[#2b6cb0] font-mono">
                      {previewRow.highlightValue}
                    </span>
                  </div>
                )}

                {Array.isArray(previewRow.tags) && previewRow.tags.length > 0 && (
                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    {previewRow.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-600 border border-slate-200/80"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 pt-3.5 border-t border-slate-200/70 flex items-center gap-3">
                  {previewRow.avatar || currentUserAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewRow.avatar || currentUserAvatar || ""}
                      alt={previewRow.name}
                      className="w-9 h-9 rounded-full object-cover shrink-0 border border-slate-200 shadow-2xs"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#4299e1] to-[#2b6cb0] text-white text-xs font-black flex items-center justify-center shrink-0">
                      {previewRow.name.trim().charAt(0) || "评"}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-black text-slate-800 truncate">
                      {previewRow.name}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {previewRow.org
                        ? `${previewRow.org} · ${previewRow.role || "研发成员"}`
                        : previewRow.role || "个人用户"}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    const target = previewRow;
                    setPreviewRow(null);
                    startEditRow(target);
                  }}
                  className="zg-btn zg-btn-default text-xs h-8 px-3.5 gap-1 font-bold"
                >
                  <Edit3 className="w-3.5 h-3.5 text-[#3182ce]" />
                  <span>编辑此评价</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewRow(null)}
                  className="zg-btn zg-btn-primary text-xs h-8 px-4 font-bold"
                >
                  关闭预览
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
