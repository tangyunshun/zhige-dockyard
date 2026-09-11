"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import Pagination from "@/components/Pagination";
import { getAuthToken } from "@/utils/auth";
import {
  FileText,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  Copy,
  Filter,
  Eye,
  AlertTriangle,
  X,
  RotateCcw,
  Lock,
  Layers,
  Zap,
  Award,
  Phone,
  Mail,
  Building2,
  Download,
  Trash2,
} from "lucide-react";

interface Appeal {
  id: string;
  userId: string;
  userAccount: string;
  userName: string;
  userPhone?: string;
  userEmail?: string;
  banReason: string;
  appealReason: string;
  appealEvidence?: string;
  contactInfo?: string;
  status: "pending" | "approved" | "rejected" | "ban_recorded" | "canceled";
  businessType?: string;
  user?: { status?: string; banReason?: string | null; avatar?: string | null; phone?: string | null; email?: string | null };
  userAvatar?: string | null;
  adminId?: string;
  adminName?: string;
  adminComment?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface AppealData {
  appeals: Appeal[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const PAGE_SIZE = 10;

export default function AdminAccountAppealsPage() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [appealData, setAppealData] = useState<AppealData | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [userStatusFilter, setUserStatusFilter] = useState<string>("all");
  const [dateRangeFilter, setDateRangeFilter] = useState<string>("all");
  const [businessTypeFilter, setBusinessTypeFilter] = useState<string>("all");
  const [searchAccount, setSearchAccount] = useState("");
  const [detailModalAppeal, setDetailModalAppeal] = useState<Appeal | null>(null);
  const [showWorkspacesPanel, setShowWorkspacesPanel] = useState(false);
  const [userWorkspacesLoading, setUserWorkspacesLoading] = useState(false);
  const [userWorkspacesData, setUserWorkspacesData] = useState<{
    user: any;
    workspaces: Array<{
      id: string;
      name: string;
      type: string;
      memberRole: string;
      memberCount: number;
      joinedAt: string;
      createdAt: string;
    }>;
    totalWorkspaces: number;
  } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const toggleUserWorkspaces = async (userId: string) => {
    if (showWorkspacesPanel) {
      setShowWorkspacesPanel(false);
      return;
    }
    setShowWorkspacesPanel(true);
    if (!userWorkspacesData) {
      setUserWorkspacesLoading(true);
      try {
        const res = await fetch(`/api/admin/account-appeals/user-workspaces?userId=${userId}`, {
          headers: { Authorization: `Bearer ${getAuthToken()}` },
        });
        const result = await res.json();
        if (result.success && result.data) {
          setUserWorkspacesData(result.data);
        } else {
          toast.error(result.error || "获取关联空间失败");
        }
      } catch (err) {
        toast.error("网络请求失败");
      } finally {
        setUserWorkspacesLoading(false);
      }
    }
  };

  const openDetailModal = (appeal: Appeal) => {
    setDetailModalAppeal(appeal);
    setShowWorkspacesPanel(false);
    setUserWorkspacesData(null);
  };

  const closeDetailModal = () => {
    setDetailModalAppeal(null);
    setShowWorkspacesPanel(false);
    setUserWorkspacesData(null);
  };

  const [adminComment, setAdminComment] = useState("");

  // 快捷审核理由模板
  const QUICK_AUDIT_TEMPLATES = {
    approved: [
      "经核验无异常违规行为，予以即刻解封并恢复算力。",
      "安全策略误拦截，现已解除限制并更新白名单。",
      "用户已补充合规材料并通过身份核验，予以解封。",
    ],
    rejected: [
      "经技术团队排查，违规滥用事实明确，申诉不予支持。",
      "提交的申诉说明与事实不符，维持当前封禁状态。",
      "申诉材料不足，请在工单中心提供完整业务凭证后重新提交。",
    ],
  };

  // 批量审批：仅「待处理」工单可勾选
  const [selectedAppealIds, setSelectedAppealIds] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "danger" | "warning" | "info";
    appealContext?: {
      userAccount: string;
      appealReason: string;
      banReason?: string;
      appealEvidence?: any;
      onPreviewImage?: (url: string) => void;
    };
    input?: {
      label: string;
      placeholder: string;
      required: boolean;
      value: string;
      onChange: (val: string) => void;
    };
    onConfirm: (val?: string) => void | boolean | Promise<void | boolean>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "warning",
    onConfirm: () => {},
  });

  // 加载列表数据
  const loadAppeals = async (
    page: number,
    status?: string,
    userStatus?: string,
    dateRange?: string,
    businessType?: string,
    search?: string
  ) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));
      if (status && status !== "all") params.set("status", status);
      if (userStatus && userStatus !== "all") params.set("userStatus", userStatus);
      if (dateRange && dateRange !== "all") params.set("dateRange", dateRange);
      if (businessType && businessType !== "all") params.set("businessType", businessType);
      if (search && search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/admin/account-appeals?${params}`, {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      if (res.ok) {
        const json = await res.json();
        setAppealData(json);
      } else {
        toast.error(res.status === 403 ? "权限不足，无法查看申诉数据" : "获取申诉列表失败");
      }
    } catch (e) {
      console.error("Load appeals error:", e);
      toast.error("加载申诉列表时发生网络错误");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppeals(currentPage, statusFilter, userStatusFilter, dateRangeFilter, businessTypeFilter, searchAccount);
  }, [currentPage, statusFilter, userStatusFilter, dateRangeFilter, businessTypeFilter]);

  // 翻页 / 改筛选条件后清空批量勾选，避免跨页残留选中态
  useEffect(() => {
    setSelectedAppealIds(new Set());
  }, [currentPage, statusFilter, userStatusFilter, dateRangeFilter, businessTypeFilter, searchAccount]);

  // 处理申诉（同意解封 / 驳回申诉）
  const doProcessAppeal = async (appealId: string, action: "approved" | "rejected", comment?: string) => {
    try {
      setProcessing(appealId);
      const res = await fetch("/api/admin/account-appeals/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({
          appealId,
          status: action,
          adminComment: comment || undefined,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        const isWs = detailModalAppeal?.businessType === "空间解封申诉";
        toast.success(
          action === "approved"
            ? (isWs ? "工作空间已成功解封，已向全员推送恢复通知！" : "已解封账号，状态恢复正常！")
            : (isWs ? "已驳回空间解封申诉，结果已通知申诉人！" : "已驳回申诉！")
        );
        // 通知侧边栏刷新待办角标（无需刷新页面）
        window.dispatchEvent(new Event("admin-pending-tasks-changed"));
        if (detailModalAppeal?.id === appealId) {
          setDetailModalAppeal(null);
        }
        await loadAppeals(currentPage, statusFilter, userStatusFilter, dateRangeFilter, businessTypeFilter, searchAccount);
        return true;
      } else {
        toast.error(json.message || "处理失败，请重试");
        if (json.message === "该申诉已被处理") {
          window.dispatchEvent(new Event("admin-pending-tasks-changed"));
          if (detailModalAppeal?.id === appealId) {
            setDetailModalAppeal(null);
          }
          await loadAppeals(currentPage, statusFilter, userStatusFilter, dateRangeFilter, businessTypeFilter, searchAccount);
          return true;
        }
        return false;
      }
    } catch (e) {
      console.error("Process appeal error:", e);
      toast.error("处理失败，请重试");
      return false;
    } finally {
      setProcessing(null);
    }
  };

  // ============ 批量审批（批量同意解封 / 批量驳回）与批量删除 ============
  // 当前页全部工单均可勾选；能否执行某动作由各自的状态规则决定：
  // - 审批：仅 pending 可审批
  // - 删除：仅已处理（非 pending）可删除
  const isAppealDeletable = (appeal: Appeal) => appeal.status !== "pending";

  const currentPageAppeals = appealData?.appeals || [];
  const selectedAppeals = currentPageAppeals.filter((a) => selectedAppealIds.has(a.id));
  const selectedPendingAppeals = selectedAppeals.filter((a) => a.status === "pending");
  const selectedDeletableAppeals = selectedAppeals.filter(isAppealDeletable);
  const allSelected =
    currentPageAppeals.length > 0 &&
    currentPageAppeals.every((a) => selectedAppealIds.has(a.id));

  const toggleSelectAppeal = (appeal: Appeal) => {
    setSelectedAppealIds((prev) => {
      const next = new Set(prev);
      if (next.has(appeal.id)) next.delete(appeal.id);
      else next.add(appeal.id);
      return next;
    });
  };

  const toggleSelectAllAppeals = () => {
    setSelectedAppealIds(
      allSelected ? new Set() : new Set(currentPageAppeals.map((a) => a.id)),
    );
  };

  /** 逐条调用既有审批接口，统计成功/失败并刷新列表与待办角标 */
  const runBatchAppeal = async (action: "approved" | "rejected", comment: string) => {
    const targets = selectedPendingAppeals;
    if (targets.length === 0) {
      toast.error("所选工单中没有待处理项，仅「待处理」工单可审批");
      return false;
    }
    setBatchProcessing(true);
    let successCount = 0;
    const failedAccounts: string[] = [];
    for (const appeal of targets) {
      try {
        const res = await fetch("/api/admin/account-appeals/process", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken()}`,
          },
          body: JSON.stringify({
            appealId: appeal.id,
            status: action,
            adminComment: comment || undefined,
          }),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success) successCount += 1;
        else failedAccounts.push(appeal.userName || appeal.userAccount || appeal.id);
      } catch {
        failedAccounts.push(appeal.userName || appeal.userAccount || appeal.id);
      }
    }
    setBatchProcessing(false);

    if (successCount > 0) {
      toast.success(
        `已${action === "approved" ? "同意解封" : "驳回"} ${successCount} 条申诉${
          failedAccounts.length ? `，${failedAccounts.length} 条处理失败` : ""
        }`,
      );
      // 通知侧边栏刷新待办角标（无需刷新页面）
      window.dispatchEvent(new Event("admin-pending-tasks-changed"));
    } else {
      toast.error("批量审批失败，请刷新后重试");
    }
    setSelectedAppealIds(new Set());
    await loadAppeals(
      currentPage,
      statusFilter,
      userStatusFilter,
      dateRangeFilter,
      businessTypeFilter,
      searchAccount,
    );
    return successCount > 0;
  };

  // 批量审批确认弹窗（复用 ConfirmDialog，驳回必须填写统一理由）
  const openBatchProcessModal = (action: "approved" | "rejected") => {
    const targets = selectedPendingAppeals;
    if (targets.length === 0) {
      toast.error("所选工单中没有待处理项，仅「待处理」工单可审批");
      return;
    }
    const wsCount = targets.filter((a) => a.businessType === "空间解封申诉").length;
    const accCount = targets.length - wsCount;
    const breakdown = [
      accCount > 0 ? `账号解封 ${accCount} 条` : null,
      wsCount > 0 ? `空间解封 ${wsCount} 条` : null,
    ]
      .filter(Boolean)
      .join("、");

    setAdminComment(action === "approved" ? "同意" : "");
    setConfirmDialog({
      isOpen: true,
      title:
        action === "approved"
          ? `批量同意解封（共 ${targets.length} 条）`
          : `批量驳回申诉（共 ${targets.length} 条）`,
      message: `本次将处理 ${targets.length} 条待审工单（${breakdown}）。${
        action === "approved"
          ? "同意后对应账号 / 工作空间将立即恢复正常运行，并推送系统通知；"
          : "驳回后将向每位申诉人推送统一驳回理由，"
      }${action === "rejected" ? "请务必填写具体理由。" : "可填写统一审核意见。"}`,
      type: action === "approved" ? "info" : "danger",
      input: {
        label:
          action === "approved"
            ? "统一审核意见（选填，默认“同意”）"
            : "统一驳回理由与整改要求（必填）",
        placeholder:
          action === "approved"
            ? "默认审核意见：同意（无需输入，可直接点击确认）"
            : "请填写统一驳回理由，将作为系统通知发送给每位申诉人",
        required: action === "rejected",
        value: action === "approved" ? "同意" : "",
        onChange: setAdminComment,
      },
      onConfirm: (typedComment?: string) => {
        const raw = (typedComment ?? adminComment).trim();
        if (action === "rejected" && !raw) {
          toast.error("批量驳回必须填写统一的驳回理由与整改要求");
          return false;
        }
        return runBatchAppeal(action, action === "approved" ? raw || "同意" : raw);
      },
    });
  };

  /** 执行删除（单个 / 批量共用）；不符合删除规则的工单由后端跳过并返回原因 */
  const runDeleteAppeals = async (ids: string[]) => {
    if (ids.length === 0) {
      toast.error("没有可删除的工单，待处理工单需先完成审批");
      return false;
    }
    setBatchProcessing(true);
    try {
      const res = await fetch("/api/admin/account-appeals/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify({ appealIds: ids }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.success) {
        toast.error(json?.message || "删除申诉工单失败");
        return false;
      }
      if (json.deletedCount > 0) {
        toast.success(json.message || `已删除 ${json.deletedCount} 条申诉工单`);
        window.dispatchEvent(new Event("admin-pending-tasks-changed"));
      } else if (json.skippedCount > 0) {
        toast.error(json.skipped?.[0]?.reason || "所选工单不可删除");
      }

      setSelectedAppealIds(new Set());
      await loadAppeals(
        currentPage,
        statusFilter,
        userStatusFilter,
        dateRangeFilter,
        businessTypeFilter,
        searchAccount,
      );
      return json.deletedCount > 0;
    } catch (error) {
      console.error("Delete appeals error:", error);
      toast.error("网络异常，删除失败");
      return false;
    } finally {
      setBatchProcessing(false);
    }
  };

  // 单条删除入口：仅「已处理」工单可删（与后端规则一致，待处理必须先审批）
  const openDeleteAppealModal = (appeal: Appeal) => {
    if (!isAppealDeletable(appeal)) {
      toast.error("待处理工单不可删除，请先完成审批");
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: "删除申诉工单",
      message: `确认删除「${appeal.userName || appeal.userAccount}」的这条申诉工单吗？删除后记录将从列表与合规留存中移除，且操作会写入审计日志，无法恢复。`,
      type: "danger",
      onConfirm: () => runDeleteAppeals([appeal.id]),
    });
  };

  // 批量删除入口：自动跳过「待处理」工单
  const openBatchDeleteModal = () => {
    const targets = selectedDeletableAppeals;
    if (targets.length === 0) {
      toast.error("所选工单中没有可删除项，待处理工单需先完成审批");
      return;
    }
    const pendingSkipped = selectedPendingAppeals.length;
    setConfirmDialog({
      isOpen: true,
      title: `批量删除申诉工单（共 ${targets.length} 条）`,
      message: `确认删除已选中的 ${targets.length} 条已处理工单吗？${
        pendingSkipped > 0
          ? `所选中的另外 ${pendingSkipped} 条「待处理」工单将被自动跳过（需先完成审批）。`
          : ""
      }删除后记录将从列表与合规留存中移除，且操作会写入审计日志，无法恢复。`,
      type: "danger",
      onConfirm: () => runDeleteAppeals(targets.map((a) => a.id)),
    });
  };

  // 打开确认处理弹窗
  const openProcessModal = (appeal: Appeal, action: "approved" | "rejected") => {
    const initialComment = action === "approved" ? "同意" : "";
    setAdminComment(initialComment);
    const isWs = appeal.businessType === "空间解封申诉";
    let wsName = "工作空间";
    let rawEvidence: any = null;
    try {
      if (appeal.appealEvidence) {
        const p = JSON.parse(appeal.appealEvidence);
        if (p.workspaceName) wsName = p.workspaceName;
        if (isWs) rawEvidence = p.extraEvidence || null;
        else rawEvidence = appeal.appealEvidence;
      }
    } catch {
      rawEvidence = appeal.appealEvidence || null;
    }

    setConfirmDialog({
      isOpen: true,
      title: isWs
        ? (action === "approved" ? "同意解封工作空间" : "驳回空间解封申诉")
        : (action === "approved" ? "同意解封账号" : "驳回申诉申请"),
      message: isWs
        ? (action === "approved"
            ? `确认同意「${appeal.userName || appeal.userAccount}」关于工作空间【${wsName}】的解封申诉吗？同意后空间将即刻恢复正常运行，并向全体空间成员推送系统通知。`
            : `确认驳回工作空间【${wsName}】的解封申诉吗？每个空间仅限 1 次申诉机会，驳回后将向申诉人发送系统通知。请必须填写具体的驳回理由。`)
        : (action === "approved"
            ? `确认同意「${appeal.userName || appeal.userAccount}」的解封申诉吗？同意后账号将恢复正常登录，并推送系统通知。`
            : `确认驳回「${appeal.userName || appeal.userAccount}」的解封申诉吗？请必须填写具体的驳回理由。`),
      type: action === "approved" ? "info" : "danger",
      appealContext: {
        userAccount: appeal.userAccount,
        appealReason: appeal.appealReason || "暂无具体陈述",
        banReason: appeal.banReason,
        appealEvidence: rawEvidence,
        onPreviewImage: (url: string) => setPreviewImage(url),
      },
      input: {
        label: action === "approved" ? "审核处理意见（选填，默认“同意”）" : "驳回理由与整改要求（必填）",
        placeholder:
          action === "approved"
            ? "默认审核意见：同意（无需输入，可直接点击确认）"
            : "必须详细说明驳回理由，将作为系统通知明确发送给用户",
        required: action === "rejected",
        value: initialComment,
        onChange: setAdminComment,
      },
      onConfirm: (typedComment?: string) => {
        const raw = (typedComment ?? adminComment).trim();
        if (action === "rejected" && !raw) {
          toast.error("驳回申诉必须填写具体的驳回理由与整改要求");
          return false;
        }
        const finalComment = action === "approved" ? (raw || "同意") : raw;
        return doProcessAppeal(appeal.id, action, finalComment);
      },
    });
  };

  // 状态 Badge（直白自然的中文）
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100/90 text-amber-800 rounded-lg text-xs font-bold border border-amber-200 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            待处理
          </span>
        );
      case "approved":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100/90 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-200 shadow-2xs">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
            已解封
          </span>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-100/90 text-red-800 rounded-lg text-xs font-bold border border-red-200 shadow-2xs">
            <XCircle className="w-3.5 h-3.5 text-red-600" />
            已驳回
          </span>
        );
      case "ban_recorded":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 shadow-2xs">
            <Shield className="w-3.5 h-3.5 text-slate-500" />
            封禁记录
          </span>
        );
      case "canceled":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold border border-slate-200 shadow-2xs">
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            用户已撤销
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded text-xs">
            {status}
          </span>
        );
    }
  };

  const stats = appealData
    ? {
        total: appealData.pagination.total,
        pending: appealData.appeals.filter((a) => a.status === "pending").length,
        approved: appealData.appeals.filter((a) => a.status === "approved").length,
        rejected: appealData.appeals.filter((a) => a.status === "rejected").length,
        canceled: appealData.appeals.filter((a) => a.status === "canceled").length,
      }
    : { total: 0, pending: 0, approved: 0, rejected: 0, canceled: 0 };

  const formatDateTime = (s: string) => {
    try {
      return new Date(s).toLocaleString("zh-CN", { hour12: false });
    } catch {
      return s;
    }
  };

  const copyAccount = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制到剪贴板");
    } catch {
      toast.error("复制失败");
    }
  };

  return (
    <div className="space-y-6 font-sans">
      {/* 1. 头部 Banner（符合知阁设计系统规范的亮色科技感控制台） */}
      <div className="bg-white/85 backdrop-blur-md p-6 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-40 h-40 bg-[#3182ce]/5 rounded-full blur-2xl pointer-events-none" />
        <div className="space-y-1.5 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white flex items-center justify-center border border-blue-400/30 shadow-xs">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-black text-slate-900 tracking-tight">风控与审核中枢</h1>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-[#2b6cb0] border border-blue-100">
                  Risk & Audit Center
                </span>
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50/90 text-[#2b6cb0] border border-blue-200/60">
                  <Lock className="w-3 h-3 text-[#2b6cb0]" />
                  申诉流水保留 3 年 · 清理操作全程留痕
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                实时监管平台账号封禁记录、处置工单与在线解封申诉仲裁流程 · 合规留存 3 年，已处理工单可由管理员清理（写入审计日志）
              </p>
            </div>
          </div>
        </div>

        {/* 顶部核心指标 */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0 relative z-10">
          <div className="bg-slate-50/90 px-3.5 py-2 rounded-xl border border-slate-200/70 text-center min-w-[76px] shadow-2xs">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">总申诉</div>
            <div className="text-lg font-black text-slate-800 mt-0.5 font-mono">{stats.total}</div>
          </div>
          <div className="bg-amber-50/80 px-3.5 py-2 rounded-xl border border-amber-200/80 text-center min-w-[76px] shadow-2xs">
            <div className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">待处理</div>
            <div className="text-lg font-black text-amber-600 mt-0.5 font-mono">{stats.pending}</div>
          </div>
          <div className="bg-emerald-50/80 px-3.5 py-2 rounded-xl border border-emerald-200/80 text-center min-w-[76px] shadow-2xs">
            <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">已解封</div>
            <div className="text-lg font-black text-emerald-600 mt-0.5 font-mono">{stats.approved}</div>
          </div>
          <div className="bg-red-50/80 px-3.5 py-2 rounded-xl border border-red-200/80 text-center min-w-[76px] shadow-2xs">
            <div className="text-[10px] text-red-600 font-bold uppercase tracking-wider">已驳回</div>
            <div className="text-lg font-black text-red-600 mt-0.5 font-mono">{stats.rejected}</div>
          </div>
          <div className="bg-slate-100/80 px-3.5 py-2 rounded-xl border border-slate-200 text-center min-w-[76px] shadow-2xs">
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">已撤销</div>
            <div className="text-lg font-black text-slate-600 mt-0.5 font-mono">{stats.canceled}</div>
          </div>
        </div>
      </div>

      {/* 2. 筛选控制面板 */}
      <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:flex-wrap items-start lg:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3">
            {/* 申诉状态 */}
            <div className="flex items-center gap-2 w-full sm:flex-1 sm:min-w-[200px]">
              <label className="text-xs text-slate-500 font-bold flex items-center gap-1 shrink-0 whitespace-nowrap">
                <Filter className="w-3.5 h-3.5 text-[#3182ce]" />
                申诉状态:
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="flex-1 min-w-0 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none cursor-pointer"
              >
                <option value="all">全部申诉状态</option>
                <option value="pending">⏳ 待处理</option>
                <option value="approved">✓ 已解封</option>
                <option value="rejected">✕ 已驳回</option>
                <option value="canceled">↩ 用户已撤销</option>
              </select>
            </div>

            {/* 账号状态 */}
            <div className="flex items-center gap-2 w-full sm:flex-1 sm:min-w-[200px]">
              <label className="text-xs text-slate-500 font-bold shrink-0 whitespace-nowrap">账号状态:</label>
              <select
                value={userStatusFilter}
                onChange={(e) => {
                  setUserStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="flex-1 min-w-0 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none cursor-pointer"
              >
                <option value="all">全部账号状态</option>
                <option value="banned">⛔ 封禁中</option>
                <option value="inactive">🚫 已禁用登录</option>
                <option value="active">✓ 正常账号</option>
              </select>
            </div>

            {/* 提交时间 */}
            <div className="flex items-center gap-2 w-full sm:flex-1 sm:min-w-[200px]">
              <label className="text-xs text-slate-500 font-bold shrink-0 whitespace-nowrap">提交时间:</label>
              <select
                value={dateRangeFilter}
                onChange={(e) => {
                  setDateRangeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="flex-1 min-w-0 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none cursor-pointer"
              >
                <option value="all">全部时间段</option>
                <option value="today">📅 今天</option>
                <option value="7days">📅 近 7 天</option>
                <option value="30days">📅 近 30 天</option>
              </select>
            </div>

            {/* 审核业务类型 */}
            <div className="flex items-center gap-2 w-full sm:flex-1 sm:min-w-[200px]">
              <label className="text-xs text-slate-500 font-bold shrink-0 whitespace-nowrap">业务类型:</label>
              <select
                value={businessTypeFilter}
                onChange={(e) => {
                  setBusinessTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="flex-1 min-w-0 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none cursor-pointer"
              >
                <option value="all">全部业务类型</option>
                <option value="账号解封申诉">🔓 账号解封申诉</option>
                <option value="空间解封申诉">🏢 空间解封申诉</option>
              </select>
            </div>
          </div>

          {/* 关键字搜索（加长输入区域，宽阔舒展且不被挤压截断） */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2.5 pt-1">
            <div className="relative w-full sm:w-96 lg:w-[420px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchAccount}
                onChange={(e) => {
                  setSearchAccount(e.target.value);
                  setCurrentPage(1);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    loadAppeals(currentPage, statusFilter, userStatusFilter, dateRangeFilter, businessTypeFilter, e.currentTarget.value);
                  }
                }}
                placeholder="搜索账号 / 用户名 / 关键词..."
                className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all shadow-2xs"
              />
              {searchAccount && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchAccount("");
                    setCurrentPage(1);
                    loadAppeals(1, statusFilter, userStatusFilter, dateRangeFilter, businessTypeFilter, "");
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center rounded-full bg-slate-200/70 hover:bg-slate-300 text-slate-500 transition-colors"
                  title="清空搜索"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <button
              onClick={() => {
                setCurrentPage(1);
                loadAppeals(1, statusFilter, userStatusFilter, dateRangeFilter, businessTypeFilter, searchAccount);
              }}
              className="px-4 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0"
            >
              搜索
            </button>
            <button
              type="button"
              onClick={() => {
                loadAppeals(currentPage, statusFilter, userStatusFilter, dateRangeFilter, businessTypeFilter, searchAccount);
              }}
              disabled={loading}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer shrink-0 flex items-center gap-1.5 border border-slate-200/80 active:scale-95 disabled:opacity-50"
              title="点击刷新当前页最新数据"
            >
              <RotateCcw className={`w-3.5 h-3.5 text-[#3182ce] ${loading ? "animate-spin" : ""}`} />
              <span>刷新数据</span>
            </button>
            {(searchAccount || statusFilter !== "all" || userStatusFilter !== "all" || dateRangeFilter !== "all" || businessTypeFilter !== "all") && (
              <button
                onClick={() => {
                  setSearchAccount("");
                  setStatusFilter("all");
                  setUserStatusFilter("all");
                  setDateRangeFilter("all");
                  setBusinessTypeFilter("all");
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-colors cursor-pointer shrink-0"
              >
                重置
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. 干练利落的数据表格 */}
      <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden shadow-2xs">
        {/* 批量操作栏：勾选任意工单后出现（审批只作用于待处理项，删除只作用于已处理项） */}
        {selectedAppeals.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 bg-slate-50 border-b border-slate-200">
            <div className="text-xs font-bold text-slate-600">
              已选择
              <span className="mx-1 px-2 py-0.5 rounded-lg bg-[#3182ce] text-white font-black">
                {selectedAppeals.length}
              </span>
              条
              <span className="ml-1 text-slate-400 font-medium">
                （待处理 {selectedPendingAppeals.length} · 已处理 {selectedDeletableAppeals.length}）
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedAppealIds(new Set())}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                取消选择
              </button>
              <button
                type="button"
                onClick={() => openBatchProcessModal("approved")}
                disabled={batchProcessing || selectedPendingAppeals.length === 0}
                title={
                  selectedPendingAppeals.length === 0
                    ? "所选工单中没有待处理项，仅「待处理」工单可审批"
                    : `将同意解封 ${selectedPendingAppeals.length} 条待处理工单`
                }
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                {batchProcessing ? "处理中..." : "批量同意解封"}
              </button>
              <button
                type="button"
                onClick={() => openBatchProcessModal("rejected")}
                disabled={batchProcessing || selectedPendingAppeals.length === 0}
                title={
                  selectedPendingAppeals.length === 0
                    ? "所选工单中没有待处理项，仅「待处理」工单可审批"
                    : `将驳回 ${selectedPendingAppeals.length} 条待处理工单`
                }
                className="px-4 py-1.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-xl text-xs font-bold border border-red-200 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" />
                批量驳回
              </button>
              <button
                type="button"
                onClick={openBatchDeleteModal}
                disabled={batchProcessing || selectedDeletableAppeals.length === 0}
                title={
                  selectedDeletableAppeals.length === 0
                    ? "所选工单中没有可删除项，待处理工单需先完成审批"
                    : `将删除 ${selectedDeletableAppeals.length} 条已处理工单`
                }
                className={`px-4 py-1.5 rounded-xl text-xs font-black shadow-2xs transition-all flex items-center gap-1.5 ${
                  batchProcessing || selectedDeletableAppeals.length === 0
                    ? "bg-red-100/40 border border-red-200 text-red-300 cursor-not-allowed"
                    : "bg-red-600 hover:bg-red-700 text-white cursor-pointer"
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                批量删除
              </button>
            </div>
          </div>
        )}
        {loading ? (
          <div className="text-center py-16">
            <div className="w-9 h-9 border-3 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-500 font-bold">正在加载申诉列表...</p>
          </div>
        ) : !appealData || appealData.appeals.length === 0 ? (
          <div className="text-center py-16 bg-slate-50/50">
            <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-600 font-bold">暂无申诉数据</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[1000px]">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                <tr>
                  <th className="w-10 px-4.5 py-3.5 text-left whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAllAppeals}
                      disabled={currentPageAppeals.length === 0}
                      title="全选当前页工单"
                      className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]/30 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </th>
                  <th className="px-4.5 py-3.5 text-left whitespace-nowrap">申诉用户 / 账号</th>
                  <th className="px-4.5 py-3.5 text-left whitespace-nowrap">审核业务类型</th>
                  <th className="px-4.5 py-3.5 text-left whitespace-nowrap">提交时间</th>
                  <th className="px-4.5 py-3.5 text-center whitespace-nowrap">状态</th>
                  <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4.5 py-3.5 text-right whitespace-nowrap font-bold shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200/80">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {appealData.appeals.map((appeal) => {
                  const isBanned = appeal.user?.status === "banned";

                  return (
                    <tr
                      key={appeal.id}
                      className={`group hover:bg-slate-50/80 transition-colors items-center ${
                        selectedAppealIds.has(appeal.id) ? "bg-blue-50/40" : ""
                      }`}
                    >
                      {/* 批量操作勾选（待处理 → 可批量审批；已处理 → 可批量删除） */}
                      <td className="px-4.5 py-3.5">
                        <input
                          type="checkbox"
                          checked={selectedAppealIds.has(appeal.id)}
                          onChange={() => toggleSelectAppeal(appeal)}
                          title={
                            appeal.status === "pending"
                              ? "待处理工单：可批量审批"
                              : "已处理工单：可批量删除"
                          }
                          className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]/30 cursor-pointer"
                        />
                      </td>
                      {/* 用户账号与手机号/邮箱展示 */}
                      <td className="px-4.5 py-3.5">
                        <div className="flex items-center gap-3">
                          {appeal.userAvatar ? (
                            <img
                              src={appeal.userAvatar}
                              alt={appeal.userName || appeal.userAccount}
                              className="w-9 h-9 rounded-xl object-cover border border-slate-200/80 shadow-2xs shrink-0"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-black text-xs shrink-0 shadow-2xs">
                              {(appeal.userName || appeal.userAccount)?.charAt(0)?.toUpperCase() || "U"}
                            </div>
                          )}
                          <div className="min-w-0 space-y-1">
                            {/* 第一行：优先显示用户名，无用户名时显示账号 + 复制按钮 + 状态 */}
                            {(() => {
                              const displayName =
                                appeal.userName ||
                                (appeal.userAccount && !appeal.userAccount.includes("@") ? appeal.userAccount : null) ||
                                appeal.userAccount ||
                                "未知用户";
                              return (
                                <div className="flex items-center gap-1.5">
                                  <span className="font-black text-slate-900 text-xs truncate max-w-[150px]" title={displayName}>
                                    {displayName}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => copyAccount(displayName)}
                                    className="text-slate-400 hover:text-[#3182ce] transition-colors cursor-pointer shrink-0"
                                    title="复制用户名"
                                  >
                                    <Copy className="w-3 h-3" />
                                  </button>
                                  {isBanned ? (
                                    <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-black rounded border border-red-200 shrink-0">
                                      封禁中
                                    </span>
                                  ) : appeal.user?.status === "inactive" ? (
                                    <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black rounded border border-amber-200 shrink-0">
                                      已禁用登录
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded border border-emerald-200 shrink-0">
                                      正常
                                    </span>
                                  )}
                                </div>
                              );
                            })()}

                            {/* 第二行：有手机号优先显示手机号，如果没有手机号优先显示邮箱 */}
                            {(() => {
                              const phone = appeal.userPhone || appeal.user?.phone;
                              const email = appeal.userEmail || appeal.user?.email || (appeal.userAccount?.includes("@") ? appeal.userAccount : null);
                              const contact = appeal.contactInfo;

                              if (phone) {
                                return (
                                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
                                    <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span className="truncate max-w-[160px]" title={phone}>{phone}</span>
                                    <button
                                      type="button"
                                      onClick={() => copyAccount(phone)}
                                      className="text-slate-400 hover:text-[#3182ce] transition-colors cursor-pointer shrink-0"
                                      title="复制手机号"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                );
                              }

                              if (email) {
                                return (
                                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
                                    <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span className="truncate max-w-[160px]" title={email}>{email}</span>
                                    <button
                                      type="button"
                                      onClick={() => copyAccount(email)}
                                      className="text-slate-400 hover:text-[#3182ce] transition-colors cursor-pointer shrink-0"
                                      title="复制邮箱"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                );
                              }

                              if (contact) {
                                return (
                                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
                                    <span className="truncate max-w-[160px]" title={contact}>{contact}</span>
                                    <button
                                      type="button"
                                      onClick={() => copyAccount(contact)}
                                      className="text-slate-400 hover:text-[#3182ce] transition-colors cursor-pointer shrink-0"
                                      title="复制联系方式"
                                    >
                                      <Copy className="w-3 h-3" />
                                    </button>
                                  </div>
                                );
                              }

                              return (
                                <div className="text-[10px] text-slate-400 italic">
                                  未绑定手机/邮箱
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </td>

                      {/* 审核业务类型 */}
                      <td className="px-4.5 py-3.5">
                        {appeal.businessType === "空间解封申诉" ? (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.8 bg-purple-50 text-purple-700 rounded-lg text-[10px] font-black border border-purple-200/80 shadow-2xs">
                              <Building2 className="w-3 h-3 text-purple-600" />
                              空间解封申诉
                            </span>
                            {(() => {
                              try {
                                if (appeal.appealEvidence) {
                                  const p = JSON.parse(appeal.appealEvidence);
                                  if (p.workspaceName) {
                                    return (
                                      <div className="text-[11px] font-bold text-slate-700 truncate max-w-[160px]" title={p.workspaceName}>
                                        🏢 {p.workspaceName}
                                      </div>
                                    );
                                  }
                                }
                              } catch {}
                              return null;
                            })()}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-black border border-blue-200">
                            <Shield className="w-3 h-3" />
                            {appeal.businessType || "账号解封申诉"}
                          </span>
                        )}
                      </td>

                      {/* 提交时间 */}
                      <td className="px-4.5 py-3.5 whitespace-nowrap font-mono text-xs font-bold text-slate-600">
                        {formatDateTime(appeal.createdAt)}
                      </td>

                      {/* 状态 */}
                      <td className="px-4.5 py-3.5 text-center whitespace-nowrap">
                        {getStatusBadge(appeal.status)}
                      </td>

                      {/* 操作 */}
                      <td className="sticky right-0 bg-white/95 group-hover:bg-slate-50/95 backdrop-blur-xs z-10 px-4.5 py-3.5 text-right whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-100 transition-colors">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openDetailModal(appeal)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#3182ce]" />
                            查看详情
                          </button>

                          {appeal.status === "pending" && (
                            <>
                              <button
                                type="button"
                                onClick={() => openProcessModal(appeal, "approved")}
                                disabled={processing === appeal.id}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs transition-all shadow-2xs cursor-pointer disabled:opacity-50 flex items-center gap-1"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                同意解封
                              </button>
                              <button
                                type="button"
                                onClick={() => openProcessModal(appeal, "rejected")}
                                disabled={processing === appeal.id}
                                className="px-3 py-1.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white font-bold rounded-xl text-xs border border-red-200 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                驳回
                              </button>
                            </>
                          )}

                          {/* 删除工单：仅「已处理」工单可删除（待处理必须先完成审批）；选中态鲜红、未选中态灰红 */}
                          {isAppealDeletable(appeal) && (
                            <button
                              type="button"
                              onClick={() => openDeleteAppealModal(appeal)}
                              disabled={batchProcessing}
                              title="删除该申诉工单（操作将写入审计日志）"
                              className={`px-3 py-1.5 font-bold text-xs rounded-xl shadow-2xs transition-all inline-flex items-center gap-1 ${
                                selectedAppealIds.has(appeal.id)
                                  ? "bg-red-600 border border-red-600 hover:bg-red-700 text-white cursor-pointer"
                                  : "bg-red-100/40 border border-red-200 text-red-300 cursor-pointer hover:bg-red-100/70 hover:ring-2 hover:ring-red-300/40"
                              } disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              删除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页 */}
        {appealData && appealData.pagination.total > 0 && (
          <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100">
            <Pagination
              currentPage={appealData.pagination.page || currentPage}
              totalItems={appealData.pagination.total}
              pageSize={PAGE_SIZE}
              onPageChange={(p) => setCurrentPage(p)}
              itemLabel="条申诉"
            />
          </div>
        )}
      </div>

      {/* 4. 详情 Modal（简单直白的真正大厂办公界面） */}
      {detailModalAppeal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-5 border border-slate-100 max-h-[90vh] overflow-y-auto">
            {/* Modal 标题 */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center border border-blue-100">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">申诉详情</h3>
                  <p className="text-xs text-slate-500 font-medium">查看详细的封禁原因、申诉说明与处理记录</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDetailModal}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 账号信息 */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">申诉用户:</span>
                <span className="font-black text-slate-900 font-mono flex items-center gap-2">
                  {detailModalAppeal.userAvatar ? (
                    <img
                      src={detailModalAppeal.userAvatar}
                      alt={detailModalAppeal.userName || detailModalAppeal.userAccount}
                      className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0"
                    />
                  ) : null}
                  {detailModalAppeal.userName || detailModalAppeal.userAccount}
                  {detailModalAppeal.userAccount &&
                    detailModalAppeal.userAccount !== detailModalAppeal.userName &&
                    !detailModalAppeal.userAccount.includes("@") && (
                      <span className="text-slate-500 font-normal">({detailModalAppeal.userAccount})</span>
                    )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">联系方式:</span>
                <span className="font-mono text-slate-800 font-bold flex items-center gap-1.5">
                  {(detailModalAppeal.userPhone || detailModalAppeal.user?.phone) ? (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {detailModalAppeal.userPhone || detailModalAppeal.user?.phone}
                    </span>
                  ) : (detailModalAppeal.userEmail || detailModalAppeal.user?.email) ? (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      {detailModalAppeal.userEmail || detailModalAppeal.user?.email}
                    </span>
                  ) : detailModalAppeal.contactInfo ? (
                    detailModalAppeal.contactInfo
                  ) : (
                    <span className="text-slate-400 font-normal italic">未登记联系方式</span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">审核业务类型:</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[10px] font-black border border-blue-200">
                  <Shield className="w-3 h-3" />
                  {detailModalAppeal.businessType || "账号解封申诉"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold">提交时间:</span>
                <span className="font-mono font-bold text-slate-700">{formatDateTime(detailModalAppeal.createdAt)}</span>
              </div>
            </div>

            {/* 空间解封申诉专属：目标空间管控档案卡片 */}
            {detailModalAppeal.businessType === "空间解封申诉" && (() => {
              try {
                if (detailModalAppeal.appealEvidence) {
                  const wsData = JSON.parse(detailModalAppeal.appealEvidence);
                  return (
                    <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200/80 space-y-2.5 text-xs">
                      <div className="font-black text-purple-900 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-sm">
                          <Building2 className="w-4 h-4 text-purple-600" />
                          <span>申诉解封的目标工作空间</span>
                        </div>
                        <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold">
                          严格仅限 1 次申诉
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                        <div>
                          <span className="text-slate-500 font-bold">空间名称: </span>
                          <span className="font-black text-slate-900 text-sm">{wsData.workspaceName || "未知空间"}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-bold">空间编号: </span>
                          <span className="font-mono text-slate-600 font-bold">{wsData.workspaceId}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-bold">管控期限: </span>
                          <span className="font-bold text-amber-700">
                            {wsData.disabledUntil
                              ? `至 ${new Date(wsData.disabledUntil).toLocaleString("zh-CN", { hour12: false })} 自动解封`
                              : "永久管控（需人工审核解封）"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 font-bold">管控原因: </span>
                          <span className="font-bold text-slate-800">{wsData.disabledReason || "违反合规规范"}</span>
                        </div>
                      </div>
                    </div>
                  );
                }
              } catch {}
              return null;
            })()}

            {/* 封禁原因 */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-red-800 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                管理员判定的管控/封禁原因:
              </label>
              <div className="bg-red-50/80 p-3.5 rounded-2xl border border-red-200/80 text-xs text-red-900 leading-relaxed font-sans whitespace-pre-wrap">
                {detailModalAppeal.user?.banReason || detailModalAppeal.banReason || "系统自动封禁"}
              </div>
            </div>

            {/* 用户申诉说明 */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700">
                用户申诉理由与说明:
              </label>
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 text-xs text-slate-800 leading-relaxed font-sans whitespace-pre-wrap">
                {detailModalAppeal.appealReason || "暂无说明"}
              </div>
            </div>

            {/* 证明材料与附件 */}
            {(() => {
              let actualEvidence: any = null;
              if (detailModalAppeal.businessType === "空间解封申诉") {
                try {
                  const p = JSON.parse(detailModalAppeal.appealEvidence || "{}");
                  actualEvidence = p.extraEvidence || null;
                } catch {
                  actualEvidence = detailModalAppeal.appealEvidence || null;
                }
              } else {
                actualEvidence = detailModalAppeal.appealEvidence || null;
              }

              // 解析多附件数组（支持直接为数组或 JSON 字符串数组）
              let attachmentsList: Array<{ id: string; name: string; size: number; type: string; url: string }> = [];
              if (Array.isArray(actualEvidence)) {
                attachmentsList = actualEvidence;
              } else if (typeof actualEvidence === "string" && actualEvidence.trim().startsWith("[")) {
                try {
                  const parsed = JSON.parse(actualEvidence);
                  if (Array.isArray(parsed)) attachmentsList = parsed;
                } catch {}
              }

              return (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    证明材料与附件:
                  </label>

                  {attachmentsList.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {attachmentsList.map((att, idx) => {
                        const isImg =
                          att.type?.startsWith("image/") ||
                          /\.(jpg|jpeg|png|webp|gif)$/i.test(att.name || att.url || "");
                        return (
                          <div
                            key={att.id || idx}
                            className="bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80 hover:border-blue-300 transition-all flex flex-col justify-between group shadow-2xs"
                          >
                            <div className="flex items-start gap-2 mb-2">
                              {isImg ? (
                                <div
                                  className="w-10 h-10 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200 cursor-zoom-in group-hover:opacity-90 relative"
                                  onClick={() => setPreviewImage(att.url)}
                                  title="点击放大查看图片"
                                >
                                  <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                                </div>
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                                  <FileText className="w-5 h-5" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-slate-800 truncate" title={att.name}>
                                  {att.name}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {att.size > 0
                                    ? att.size < 1024 * 1024
                                      ? `${(att.size / 1024).toFixed(1)} KB`
                                      : `${(att.size / (1024 * 1024)).toFixed(1)} MB`
                                    : "未知大小"}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-1.5 pt-1.5 border-t border-slate-200/60">
                              {isImg && (
                                <button
                                  type="button"
                                  onClick={() => setPreviewImage(att.url)}
                                  className="text-[11px] text-blue-600 hover:text-blue-700 font-medium px-2 py-0.5 rounded hover:bg-blue-50 transition-colors flex items-center gap-1 cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" /> 预览
                                </button>
                              )}
                              <a
                                href={att.url}
                                download={att.name || `材料附件-${idx + 1}`}
                                className="text-[11px] text-slate-600 hover:text-blue-600 font-medium px-2 py-0.5 rounded hover:bg-slate-200/60 transition-colors flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" /> 下载
                              </a>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : actualEvidence && typeof actualEvidence === "string" ? (
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-xs font-mono text-slate-700 leading-relaxed break-all">
                      {actualEvidence}
                      {/\.(jpg|jpeg|png|webp|gif)/i.test(actualEvidence) && (
                        <div className="mt-2.5">
                          <span className="text-[10px] text-slate-400 font-bold block mb-1">图片预览（点击放大查看）：</span>
                          <img
                            src={actualEvidence}
                            alt="申诉证明"
                            onClick={() => setPreviewImage(actualEvidence || null)}
                            className="max-h-36 rounded-lg border border-slate-200 object-cover cursor-zoom-in hover:opacity-90 transition-opacity"
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-200/60 text-xs text-slate-400 italic">
                      用户未提交补充证明材料与附件
                    </div>
                  )}
                </div>
              );
            })()}

            {/* 处理说明 */}
            {detailModalAppeal.status !== "pending" && detailModalAppeal.adminComment && (
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700">管理员处理说明:</label>
                <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-100 text-xs font-medium text-blue-900 leading-relaxed">
                  {detailModalAppeal.adminComment}
                </div>
              </div>
            )}

            {/* 申诉人关联工作空间与资源画像（内嵌展开，绝不跳出弹窗） */}
            {showWorkspacesPanel && (
              <div className="bg-slate-50/90 p-4 rounded-2xl border border-blue-100 space-y-3 transition-all animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-blue-100 text-[#2b6cb0] flex items-center justify-center">
                      <Layers className="w-3.5 h-3.5" />
                    </div>
                    <span className="text-xs font-bold text-slate-800">
                      申诉人资产核查与关联空间
                    </span>
                    {userWorkspacesData && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#2b6cb0] border border-blue-200">
                        共 {userWorkspacesData.totalWorkspaces} 个空间
                      </span>
                    )}
                  </div>
                  {userWorkspacesData?.user && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-500 font-medium">会员等级:</span>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-[#3182ce] bg-white px-2.5 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                        <Award className="w-3 h-3 text-[#3182ce]" />
                        {userWorkspacesData.user.membershipLevelZh || "非会员"}
                      </span>
                    </div>
                  )}
                </div>

                {userWorkspacesLoading ? (
                  <div className="py-5 text-center">
                    <div className="w-5 h-5 border-2 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-1.5" />
                    <span className="text-xs font-medium text-slate-400">正在调取申诉人名下空间及资源...</span>
                  </div>
                ) : !userWorkspacesData?.workspaces || userWorkspacesData.workspaces.length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-400 font-medium bg-white rounded-xl border border-dashed border-slate-200">
                    该申诉人目前名下暂无关联的工作空间
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {userWorkspacesData.workspaces.map((ws) => (
                      <div
                        key={ws.id}
                        className="bg-white p-2.5 rounded-xl border border-slate-200/80 hover:border-blue-200 transition-colors flex items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="min-w-0 flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#2b6cb0] border border-blue-100 flex items-center justify-center font-bold text-xs shrink-0">
                            {ws.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-800 truncate" title={ws.name}>
                              {ws.name}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                              <span>加入: {formatDateTime(ws.joinedAt).split(" ")[0]}</span>
                              <span>·</span>
                              <span>成员: {ws.memberCount} 人</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center shrink-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            ws.type === "ENTERPRISE"
                              ? "bg-purple-50 text-purple-700 border border-purple-200"
                              : "bg-blue-50 text-blue-700 border border-blue-200"
                          }`}>
                            {ws.type === "ENTERPRISE" ? "企业空间" : "个人空间"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 底部按钮区 */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => toggleUserWorkspaces(detailModalAppeal.userId)}
                className={`px-3.5 py-2 rounded-xl font-bold text-xs border transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                  showWorkspacesPanel
                    ? "bg-[#3182ce] text-white border-[#3182ce] shadow-2xs"
                    : "bg-blue-50 hover:bg-blue-100 text-[#2b6cb0] border-blue-200"
                }`}
                title="在当前弹窗中直接核查该申诉人关联的工作空间、身份角色与算力资产"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{showWorkspacesPanel ? "收起关联空间与资源" : "查看关联空间与资源"}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeDetailModal}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                >
                  关闭
                </button>
                {detailModalAppeal.status === "pending" && (
                  <>
                    <button
                      type="button"
                      onClick={() => openProcessModal(detailModalAppeal, "rejected")}
                      className="px-4 py-2 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-xl font-bold text-xs border border-red-200 transition-all cursor-pointer"
                    >
                      驳回申诉
                    </button>
                    <button
                      type="button"
                      onClick={() => openProcessModal(detailModalAppeal, "approved")}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition-all shadow-2xs cursor-pointer"
                    >
                      同意解封
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 证明材料大图预览 Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in"
        >
          <div className="relative max-w-4xl max-h-[90vh] bg-white rounded-2xl p-2 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage} alt="证明大图" className="max-h-[85vh] max-w-full rounded-xl object-contain" />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/60 text-white hover:bg-black flex items-center justify-center cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 确认/处理 Modal */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        appealContext={confirmDialog.appealContext}
        input={confirmDialog.input}
        onConfirm={async (value) => {
          const res = await confirmDialog.onConfirm(value);
          if (res !== false) {
            setConfirmDialog({ ...confirmDialog, isOpen: false });
          }
        }}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
    </div>
  );
}
