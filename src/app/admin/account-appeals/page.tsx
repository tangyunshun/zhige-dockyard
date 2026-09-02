"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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
  user?: { status?: string; banReason?: string | null; avatar?: string | null };
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

  const [adminComment, setAdminComment] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "danger" | "warning" | "info";
    appealContext?: {
      userAccount: string;
      appealReason: string;
      banReason?: string;
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
      params.set("limit", "10");
      if (status && status !== "all") params.set("status", status);
      if (userStatus && userStatus !== "all") params.set("userStatus", userStatus);
      if (dateRange && dateRange !== "all") params.set("dateRange", dateRange);
      if (businessType && businessType !== "all") params.set("businessType", businessType);
      if (search && search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/admin/account-appeals?${params}`);
      if (res.ok) {
        const json = await res.json();
        setAppealData(json);
      } else {
        toast.error("获取申诉列表失败");
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

  // 处理申诉（同意解封 / 驳回申诉）
  const doProcessAppeal = async (appealId: string, action: "approved" | "rejected", comment?: string) => {
    try {
      setProcessing(appealId);
      const res = await fetch("/api/admin/account-appeals/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appealId,
          status: action,
          adminComment: comment || undefined,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(action === "approved" ? "已解封账号，状态恢复正常！" : "已驳回申诉！");
        if (detailModalAppeal?.id === appealId) {
          setDetailModalAppeal(null);
        }
        await loadAppeals(currentPage, statusFilter, userStatusFilter, dateRangeFilter, businessTypeFilter, searchAccount);
        return true;
      } else {
        toast.error(json.message || "处理失败，请重试");
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

  // 打开确认处理弹窗
  const openProcessModal = (appeal: Appeal, action: "approved" | "rejected") => {
    setAdminComment("");
    setConfirmDialog({
      isOpen: true,
      title: action === "approved" ? "同意解封账号" : "驳回申诉申请",
      message:
        action === "approved"
          ? `确认同意「${appeal.userName || appeal.userAccount}」的解封申诉吗？同意后账号将恢复正常登录。`
          : `确认驳回「${appeal.userName || appeal.userAccount}」的解封申诉吗？请填写具体的驳回理由。`,
      type: action === "approved" ? "info" : "danger",
      appealContext: {
        userAccount: appeal.userAccount,
        appealReason: appeal.appealReason || "暂无具体陈述",
        banReason: appeal.banReason,
      },
      input: {
        label: action === "approved" ? "解封说明（选填）" : "驳回理由（必填）",
        placeholder:
          action === "approved"
            ? "可填写解封说明，留空则使用默认系统通知"
            : "请详细说明驳回理由，将展示给用户查看",
        required: action === "rejected",
        value: adminComment,
        onChange: setAdminComment,
      },
      onConfirm: (typedComment?: string) => doProcessAppeal(appeal.id, action, (typedComment ?? adminComment).trim()),
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
    <div className="p-6 space-y-6 font-sans">
      {/* 1. 头部 Banner */}
      <div className="bg-gradient-to-r from-[#1a365d] via-[#2b6cb0] to-[#3182ce] p-6 rounded-3xl text-white shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-md">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">风控与审核</h1>
              <p className="text-xs text-blue-100/80 font-medium mt-0.5">
                账号封禁记录管理与在线解封申诉审核
              </p>
            </div>
          </div>
        </div>

        {/* 顶部指标 */}
        <div className="flex items-center gap-3.5 shrink-0">
          <div className="bg-white/15 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-white/20 text-center min-w-[85px] shadow-sm">
            <div className="text-[11px] text-blue-100 font-bold uppercase tracking-wider">总申诉数</div>
            <div className="text-xl font-black text-white mt-0.5">{stats.total}</div>
          </div>
          <div className="bg-amber-500/20 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-amber-300/30 text-center min-w-[85px] shadow-sm">
            <div className="text-[11px] text-amber-200 font-bold uppercase tracking-wider">待处理</div>
            <div className="text-xl font-black text-amber-300 mt-0.5">{stats.pending}</div>
          </div>
          <div className="bg-emerald-500/20 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-emerald-300/30 text-center min-w-[85px] shadow-sm">
            <div className="text-[11px] text-emerald-200 font-bold uppercase tracking-wider">已解封</div>
            <div className="text-xl font-black text-emerald-300 mt-0.5">{stats.approved}</div>
          </div>
          <div className="bg-red-500/20 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-red-300/30 text-center min-w-[85px] shadow-sm">
            <div className="text-[11px] text-red-200 font-bold uppercase tracking-wider">已驳回</div>
            <div className="text-xl font-black text-red-300 mt-0.5">{stats.rejected}</div>
          </div>
          <div className="bg-slate-500/20 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-slate-300/30 text-center min-w-[85px] shadow-sm">
            <div className="text-[11px] text-slate-200 font-bold uppercase tracking-wider">已撤销</div>
            <div className="text-xl font-black text-slate-300 mt-0.5">{stats.canceled}</div>
          </div>
        </div>
      </div>

      {/* 2. 筛选控制面板 */}
      <div className="bg-white p-4.5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* 申诉状态 */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 font-bold flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-[#3182ce]" />
                申诉状态:
              </label>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none cursor-pointer"
              >
                <option value="all">全部申诉状态</option>
                <option value="pending">⏳ 待处理</option>
                <option value="approved">✓ 已解封</option>
                <option value="rejected">✕ 已驳回</option>
                <option value="canceled">↩ 用户已撤销</option>
              </select>
            </div>

            {/* 账号状态 */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 font-bold">账号状态:</label>
              <select
                value={userStatusFilter}
                onChange={(e) => {
                  setUserStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none cursor-pointer"
              >
                <option value="all">全部账号状态</option>
                <option value="banned">⛔ 封禁中</option>
                <option value="active">✓ 正常账号</option>
              </select>
            </div>

            {/* 提交时间 */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 font-bold">提交时间:</label>
              <select
                value={dateRangeFilter}
                onChange={(e) => {
                  setDateRangeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none cursor-pointer"
              >
                <option value="all">全部时间段</option>
                <option value="today">📅 今天</option>
                <option value="7days">📅 近 7 天</option>
                <option value="30days">📅 近 30 天</option>
              </select>
            </div>

            {/* 审核业务类型 */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500 font-bold">业务类型:</label>
              <select
                value={businessTypeFilter}
                onChange={(e) => {
                  setBusinessTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none cursor-pointer"
              >
                <option value="all">全部业务类型</option>
                <option value="账号解封申诉">🔓 账号解封申诉</option>
              </select>
            </div>
          </div>

          {/* 关键字搜索 */}
          <div className="flex items-center gap-2 flex-1 max-w-xs min-w-[200px]">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
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
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none transition-all"
              />
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
                toast.success("数据已成功刷新！");
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
            <table className="w-full text-xs">
              <thead className="bg-slate-50/90 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-4.5 py-3.5 text-left whitespace-nowrap">申诉用户 / 账号</th>
                  <th className="px-4.5 py-3.5 text-left whitespace-nowrap">审核业务类型</th>
                  <th className="px-4.5 py-3.5 text-left whitespace-nowrap">提交时间</th>
                  <th className="px-4.5 py-3.5 text-center whitespace-nowrap">状态</th>
                  <th className="px-4.5 py-3.5 text-right whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {appealData.appeals.map((appeal) => {
                  const isBanned = appeal.user?.status === "banned";

                  return (
                    <tr key={appeal.id} className="hover:bg-slate-50/80 transition-colors items-center">
                      {/* 用户账号与真实头像 */}
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
                              {appeal.userName?.charAt(0) || appeal.userAccount?.charAt(0) || "U"}
                            </div>
                          )}
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-900 text-xs truncate max-w-[160px]">
                                {appeal.userName || appeal.userAccount}
                              </span>
                              {isBanned ? (
                                <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-black rounded border border-red-200 shrink-0">
                                  封禁中
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded border border-emerald-200 shrink-0">
                                  正常
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono">
                              <span className="truncate max-w-[180px]">{appeal.userAccount}</span>
                              <button
                                type="button"
                                onClick={() => copyAccount(appeal.userAccount)}
                                className="text-slate-400 hover:text-[#3182ce] transition-colors cursor-pointer shrink-0"
                                title="复制账号"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 审核业务类型 */}
                      <td className="px-4.5 py-3.5">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-black border border-blue-200">
                          <Shield className="w-3 h-3" />
                          {appeal.businessType || "账号解封申诉"}
                        </span>
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
                      <td className="px-4.5 py-3.5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setDetailModalAppeal(appeal)}
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
        {appealData && appealData.pagination.totalPages > 1 && (
          <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
            <div className="text-xs text-slate-500 font-bold">
              共 {appealData.pagination.total} 条记录，第 {appealData.pagination.page} / {appealData.pagination.totalPages} 页
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer transition-all shadow-2xs"
              >
                上一页
              </button>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(appealData.pagination.totalPages, p + 1))}
                disabled={currentPage === appealData.pagination.totalPages}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50 cursor-pointer transition-all shadow-2xs"
              >
                下一页
              </button>
            </div>
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
                onClick={() => setDetailModalAppeal(null)}
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
                  {detailModalAppeal.userName} ({detailModalAppeal.userAccount})
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
              {detailModalAppeal.contactInfo && (
                <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                  <span className="text-slate-500 font-bold">联系方式:</span>
                  <span className="font-mono text-slate-800 font-bold">{detailModalAppeal.contactInfo}</span>
                </div>
              )}
            </div>

            {/* 封禁原因 */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-red-800 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                管理员判定的封禁原因:
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

            {/* 证明材料 */}
            {detailModalAppeal.appealEvidence && (
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">证明材料:</label>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-xs font-mono text-slate-700 leading-relaxed">
                  {detailModalAppeal.appealEvidence}
                </div>
              </div>
            )}

            {/* 处理说明 */}
            {detailModalAppeal.status !== "pending" && detailModalAppeal.adminComment && (
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700">管理员处理说明:</label>
                <div className="bg-blue-50/60 p-3 rounded-xl border border-blue-100 text-xs font-medium text-blue-900 leading-relaxed">
                  {detailModalAppeal.adminComment}
                </div>
              </div>
            )}

            {/* 底部按钮 */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDetailModalAppeal(null)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition-colors cursor-pointer"
              >
                关闭
              </button>
              {detailModalAppeal.status === "pending" && (
                <>
                  <button
                    type="button"
                    onClick={() => openProcessModal(detailModalAppeal, "rejected")}
                    className="px-5 py-2.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white rounded-xl font-bold text-xs border border-red-200 transition-all cursor-pointer"
                  >
                    驳回申诉
                  </button>
                  <button
                    type="button"
                    onClick={() => openProcessModal(detailModalAppeal, "approved")}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition-all shadow-2xs cursor-pointer"
                  >
                    同意解封
                  </button>
                </>
              )}
            </div>
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
