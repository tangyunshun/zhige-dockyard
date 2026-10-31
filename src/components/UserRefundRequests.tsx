"use client";

/**
 * 「算力点退回申请」（用户自助）
 *
 * 用途：当任务扣了算力点、但结果不可用（解析错误 / 输出不符合预期）时，给用户一个正规申诉入口。
 * 说明：这里退的是「算力点」，不是现金；提交后需管理员审批，同意才会真正退回并生成退回流水。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import {
  RotateCcw,
  Inbox,
  Search,
  X,
  Copy,
  Check,
  Box,
  Building2,
  Wallet,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  ExternalLink,
  Trash2,
  Loader2,
} from "lucide-react";

interface Candidate {
  taskId: string;
  taskName?: string | null;
  taskStatus?: string | null;
  points: number;
  scope?: string;
  componentId: string | null;
  componentName: string | null;
  workspaceId: string | null;
  workspaceName?: string | null;
  chargedAt: string;
}

interface RefundRequest {
  id: string;
  taskId: string;
  taskName?: string | null;
  points: number;
  scope?: string;
  componentId: string | null;
  componentName?: string | null;
  workspaceId?: string | null;
  workspaceName?: string | null;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  adminRemark: string | null;
  refundLedgerId: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

interface RefundSummary {
  candidateCount: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalRefundedPoints: number;
}

const STATUS_META: Record<
  string,
  { text: string; cls: string; hint: string }
> = {
  PENDING: {
    text: "待审批",
    cls: "text-amber-700 bg-amber-50 border-amber-200",
    hint: "已提交申请，等待平台管理员审核",
  },
  APPROVED: {
    text: "已退回",
    cls: "text-emerald-700 bg-emerald-50 border-emerald-200",
    hint: "算力点已原路退回，可在上方流水明细查看「退回」记录",
  },
  REJECTED: {
    text: "已驳回",
    cls: "text-slate-600 bg-slate-100 border-slate-200",
    hint: "管理员未通过该申请，请查看下方处理说明",
  },
};

const SCOPE_LABELS: Record<string, string> = {
  WALLET: "个人钱包",
  WORKSPACE: "企业空间池",
  PERSONAL_GIFT: "个人赠送额度",
  PERSONAL_DEDUCTION: "个人空间额度",
};

const QUICK_REASONS = [
  "组件执行报错，未生成有效结果",
  "解析结果与上传原文档内容不符",
  "模型输出内容中断或空白",
  "网络超时重试导致重复扣点",
  "生成文件格式异常，无法正常导出使用",
];

const PAGE_SIZE = 6;

export default function UserRefundRequests({
  onChanged,
}: {
  onChanged?: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [summary, setSummary] = useState<RefundSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 视图与筛选状态
  const [activeTab, setActiveTab] = useState<"candidates" | "requests">("candidates");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");
  const [sortBy, setSortBy] = useState<"TIME_DESC" | "POINTS_DESC">("TIME_DESC");
  const [pageSize, setPageSize] = useState<number>(6);
  const [searchTerm, setSearchTerm] = useState("");
  const [candidatePage, setCandidatePage] = useState(1);
  const [requestPage, setRequestPage] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // 申请退款模态框状态（替代原 window.prompt）
  const [applyingCandidate, setApplyingCandidate] = useState<Candidate | null>(null);
  const [reasonInput, setReasonInput] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submittingApply, setSubmittingApply] = useState(false);

  // 撤销申请确认模态框状态
  const [cancellingRequest, setCancellingRequest] = useState<RefundRequest | null>(null);
  const [submittingCancel, setSubmittingCancel] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 打开模态框时锁定背景页面滚动
  useEffect(() => {
    if (!mounted) return;
    if (applyingCandidate || cancellingRequest) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mounted, applyingCandidate, cancellingRequest]);

  const authFetch = useCallback(async (url: string, init?: RequestInit) => {
    const res = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
        ...(init?.headers || {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || `请求失败(${res.status})`);
    return body;
  }, []);

  const load = useCallback(
    async (isManual = false) => {
      if (isManual) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      try {
        const res = await authFetch("/api/user/refund-requests");
        setRequests(res?.data?.requests || []);
        setCandidates(res?.data?.candidates || []);
        if (res?.data?.summary) {
          setSummary(res.data.summary);
        }
        if (isManual) {
          toast.success("退点申请与任务列表已刷新");
        }
      } catch (e) {
        toast.error((e as Error)?.message || "加载退款申请信息失败");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [authFetch, toast]
  );

  useEffect(() => {
    void load(false);
  }, [load]);

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    toast.success(`${label}已复制到剪贴板`);
    setTimeout(() => {
      setCopiedId((prev) => (prev === text ? null : prev));
    }, 2000);
  };

  // 打开申请退点弹窗
  const openApplyModal = (c: Candidate) => {
    setApplyingCandidate(c);
    setReasonInput("");
    setReasonError(null);
  };

  // 快捷填入/追加原因
  const handleSelectQuickReason = (tag: string) => {
    setReasonError(null);
    setReasonInput((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return tag;
      if (trimmed.includes(tag)) return prev;
      return `${trimmed}；${tag}`;
    });
  };

  // 提交退点申请
  const handleConfirmApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyingCandidate) return;

    const trimmed = reasonInput.trim();
    if (trimmed.length < 5) {
      setReasonError("请填写至少 5 个字的退点原因说明");
      return;
    }
    if (trimmed.length > 500) {
      setReasonError("退点原因说明不能超过 500 个字");
      return;
    }

    setSubmittingApply(true);
    try {
      await authFetch("/api/user/refund-requests", {
        method: "POST",
        body: JSON.stringify({
          taskId: applyingCandidate.taskId,
          reason: trimmed,
        }),
      });
      toast.success("算力点退回申请已提交，请等待管理员审批");
      setApplyingCandidate(null);
      setReasonInput("");
      setReasonError(null);
      setActiveTab("requests");
      setRequestPage(1);
      await load(false);
      onChanged?.();
    } catch (err) {
      const msg = (err as Error)?.message || "提交退款申请失败";
      setReasonError(msg);
      toast.error(msg);
    } finally {
      setSubmittingApply(false);
    }
  };

  // 确认撤销待审批的退点申请
  const handleConfirmCancel = async () => {
    if (!cancellingRequest) return;
    setSubmittingCancel(true);
    try {
      await authFetch(
        `/api/user/refund-requests?id=${encodeURIComponent(cancellingRequest.id)}`,
        { method: "DELETE" }
      );
      toast.success("已撤销该笔退点申请，对应任务已恢复至可申请列表");
      setCancellingRequest(null);
      await load(false);
      onChanged?.();
    } catch (err) {
      toast.error((err as Error)?.message || "撤销申请失败");
    } finally {
      setSubmittingCancel(false);
    }
  };

  // 搜索与排序后的候选任务
  const filteredCandidates = useMemo(() => {
    const kw = searchTerm.trim().toLowerCase();
    const list = !kw
      ? [...candidates]
      : candidates.filter(
          (c) =>
            (c.taskName && c.taskName.toLowerCase().includes(kw)) ||
            (c.componentName && c.componentName.toLowerCase().includes(kw)) ||
            (c.workspaceName && c.workspaceName.toLowerCase().includes(kw)) ||
            c.taskId.toLowerCase().includes(kw)
        );
    if (sortBy === "POINTS_DESC") {
      list.sort((a, b) => Number(b.points || 0) - Number(a.points || 0));
    } else {
      list.sort(
        (a, b) => new Date(b.chargedAt).getTime() - new Date(a.chargedAt).getTime()
      );
    }
    return list;
  }, [candidates, searchTerm, sortBy]);

  // 搜索、状态过滤与排序后的申请记录
  const filteredRequests = useMemo(() => {
    const kw = searchTerm.trim().toLowerCase();
    const list = requests.filter((r) => {
      const matchesStatus = statusFilter === "ALL" || r.status === statusFilter;
      const matchesKw =
        !kw ||
        (r.taskName && r.taskName.toLowerCase().includes(kw)) ||
        (r.componentName && r.componentName.toLowerCase().includes(kw)) ||
        (r.workspaceName && r.workspaceName.toLowerCase().includes(kw)) ||
        r.taskId.toLowerCase().includes(kw) ||
        r.reason.toLowerCase().includes(kw) ||
        (r.adminRemark && r.adminRemark.toLowerCase().includes(kw));
      return matchesStatus && matchesKw;
    });
    if (sortBy === "POINTS_DESC") {
      list.sort((a, b) => Number(b.points || 0) - Number(a.points || 0));
    } else {
      list.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
    return list;
  }, [requests, statusFilter, searchTerm, sortBy]);

  const candidateTotalPages = Math.max(Math.ceil(filteredCandidates.length / pageSize), 1);
  const requestTotalPages = Math.max(Math.ceil(filteredRequests.length / pageSize), 1);

  const pagedCandidates = filteredCandidates.slice(
    (candidatePage - 1) * pageSize,
    candidatePage * pageSize
  );
  const pagedRequests = filteredRequests.slice(
    (requestPage - 1) * pageSize,
    requestPage * pageSize
  );

  const pendingCount =
    summary?.pendingCount ?? requests.filter((r) => r.status === "PENDING").length;
  const totalRefundedPoints =
    summary?.totalRefundedPoints ??
    requests
      .filter((r) => r.status === "APPROVED")
      .reduce((s, r) => s + Number(r.points || 0), 0);

  return (
    <>
    <div className="zg-card p-6 space-y-5">
      {/* 1. 顶部标题栏与统计概览 */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0">
              <RotateCcw className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">算力点退回申请</h3>
            <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
              任务已扣点但结果异常时可申请退回；仅退还算力点，需管理员审批
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium mt-1 sm:hidden">
            任务已扣点但结果异常时可申请退回；仅退还算力点，需管理员审批
          </p>
        </div>

        {/* 右侧汇总数据与刷新 */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200/70 text-xs">
            <span className="text-slate-400 font-medium">可申请任务</span>
            <span className="font-bold font-mono text-slate-700">{candidates.length}</span>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-50/70 border border-amber-200/60 text-xs">
            <span className="text-amber-700/80 font-medium">待审批</span>
            <span className="font-bold font-mono text-amber-700">{pendingCount}</span>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50/70 border border-emerald-200/60 text-xs">
            <span className="text-emerald-700/80 font-medium">累计已退回</span>
            <span className="font-bold font-mono text-emerald-700">
              {totalRefundedPoints.toLocaleString()} 点
            </span>
          </div>
          <button
            type="button"
            onClick={() => void load(true)}
            disabled={loading || refreshing}
            className="zg-btn zg-btn-default text-xs h-8 px-3 gap-1.5"
          >
            <RotateCcw
              className={`w-3.5 h-3.5 ${
                refreshing ? "animate-spin text-[#3182ce]" : "text-slate-500"
              }`}
            />
            <span>刷新</span>
          </button>
        </div>
      </div>

      {/* 2. 页签切换与搜索过滤栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* 主视图切换 */}
          <div className="inline-flex p-1 rounded-xl bg-slate-100/90 border border-slate-200/60">
            <button
              type="button"
              onClick={() => {
                setActiveTab("candidates");
                setCandidatePage(1);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "candidates"
                  ? "bg-white text-[#3182ce] shadow-2xs"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              <span>可申请退点的任务</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeTab === "candidates"
                    ? "bg-blue-50 text-[#3182ce]"
                    : "bg-slate-200/70 text-slate-500"
                }`}
              >
                {candidates.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("requests");
                setRequestPage(1);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === "requests"
                  ? "bg-white text-[#3182ce] shadow-2xs"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              <span>我的申请记录</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeTab === "requests"
                    ? "bg-blue-50 text-[#3182ce]"
                    : pendingCount > 0
                    ? "bg-amber-100 text-amber-700"
                    : "bg-slate-200/70 text-slate-500"
                }`}
              >
                {requests.length}
              </span>
            </button>
          </div>

          {/* 当在“我的申请记录”页签时，提供审批状态筛选 */}
          {activeTab === "requests" && (
            <div className="flex items-center gap-1">
              {(
                [
                  { key: "ALL", label: "全部" },
                  { key: "PENDING", label: "待审批" },
                  { key: "APPROVED", label: "已退回" },
                  { key: "REJECTED", label: "已驳回" },
                ] as const
              ).map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => {
                    setStatusFilter(st.key);
                    setRequestPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                    statusFilter === st.key
                      ? "bg-[#3182ce]/10 text-[#3182ce] border border-[#3182ce]/30"
                      : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 排序切换与搜索框 */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as "TIME_DESC" | "POINTS_DESC");
              setCandidatePage(1);
              setRequestPage(1);
            }}
            className="zg-input !w-auto !h-8.5 !px-2.5 !text-xs font-semibold text-slate-600 cursor-pointer shrink-0"
            title="选择列表排序规则"
          >
            <option value="TIME_DESC">按时间最新排序</option>
            <option value="POINTS_DESC">按扣点从高到低</option>
          </select>

          <div className="relative min-w-[220px] flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCandidatePage(1);
                setRequestPage(1);
              }}
              placeholder={
                activeTab === "candidates"
                  ? "搜索任务名、组件、空间或编号..."
                  : "搜索任务名、编号或退点原因..."
              }
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
        </div>
      </div>

      {/* 3. 内容列表区（带最大高度滚动保护 + 常驻分页与每页条数控制栏） */}
      {loading ? (
        <div className="space-y-2.5 py-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 zg-skeleton rounded-xl" />
          ))}
        </div>
      ) : activeTab === "candidates" ? (
        /* 3A. 可申请退点的任务列表 */
        <div className="space-y-3">
          {filteredCandidates.length === 0 ? (
            <div className="py-10 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200/80">
              <Inbox className="w-7 h-7 mx-auto mb-2 text-slate-300" />
              <div className="text-xs font-bold text-slate-600">
                {searchTerm ? "未找到匹配的可申请任务" : "暂无可申请退点的任务"}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {searchTerm
                  ? "请尝试更换搜索词或清空筛选条件"
                  : "已扣除算力点且尚未提交过申请的任务会自动显示在此处"}
              </div>
            </div>
          ) : (
            <>
              <div className="max-h-[380px] overflow-y-auto pr-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                {pagedCandidates.map((c) => {
                  const displayTitle =
                    c.taskName || c.componentName || c.componentId || "组件执行任务";
                  const scopeLabel = SCOPE_LABELS[c.scope || "WALLET"] || "个人钱包";

                  return (
                    <div
                      key={c.taskId}
                      className="group flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50/60 hover:bg-white border border-slate-200/80 hover:border-[#3182ce]/40 hover:shadow-2xs transition-all"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        {/* 第一行：任务标题与组件/空间标签 */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="text-xs font-bold text-slate-800 truncate max-w-[220px]"
                            title={displayTitle}
                          >
                            {displayTitle}
                          </span>
                          {c.componentName && c.componentName !== displayTitle && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-50 text-[#2b6cb0] border border-blue-200/60">
                              <Box className="w-2.5 h-2.5" />
                              {c.componentName}
                            </span>
                          )}
                          {c.workspaceName && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200/70">
                              <Building2 className="w-2.5 h-2.5 text-slate-400" />
                              {c.workspaceName}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-medium bg-amber-50/80 text-amber-700 border border-amber-200/60">
                            <Wallet className="w-2.5 h-2.5" />
                            {scopeLabel}
                          </span>
                        </div>

                        {/* 第二行：时间、任务编号复制与跳转 */}
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {new Date(c.chargedAt).toLocaleString("zh-CN", {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })}
                          </span>
                          <span>·</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(c.taskId, "任务编号")}
                            className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-500 hover:text-[#3182ce] transition-colors cursor-pointer"
                            title={`点击复制完整任务编号: ${c.taskId}`}
                          >
                            <span>编号 {c.taskId.slice(0, 8)}</span>
                            {copiedId === c.taskId ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3 opacity-60" />
                            )}
                          </button>
                          {c.workspaceId && (
                            <button
                              type="button"
                              onClick={() =>
                                router.push(`/workspace/${c.workspaceId}?tab=tasks`)
                              }
                              className="inline-flex items-center gap-0.5 text-[11px] text-[#3182ce] hover:text-[#2b6cb0] font-medium cursor-pointer"
                              title="前往所在空间查看任务"
                            >
                              <span>查看任务</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 右侧：扣点数与申请按钮 */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-sm font-black font-mono text-slate-800">
                            -{c.points.toLocaleString()}
                            <span className="text-[10px] font-normal text-slate-400 ml-0.5 font-sans">
                              点
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400">可退额度</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openApplyModal(c)}
                          className="zg-btn zg-btn-primary text-xs h-8.5 px-3.5 font-bold shrink-0"
                        >
                          申请退点
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 常驻候选列表分页与每页容量控制栏（数据量大时自动分页 + 滚动保护） */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs text-slate-500">
                <div className="flex items-center gap-2 flex-wrap">
                  <span>
                    共 <strong className="font-mono text-slate-700">{filteredCandidates.length}</strong> 项可申请任务 · 第{" "}
                    <strong className="font-mono text-slate-700">{candidatePage}</strong> / {candidateTotalPages} 页
                  </span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value) || 6);
                      setCandidatePage(1);
                      setRequestPage(1);
                    }}
                    className="h-7 px-2 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 outline-none focus:border-[#3182ce] cursor-pointer"
                  >
                    <option value={6}>每页 6 项</option>
                    <option value={12}>每页 12 项</option>
                    <option value={24}>每页 24 项</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCandidatePage((p) => Math.max(1, p - 1))}
                    disabled={candidatePage <= 1}
                    className="zg-btn zg-btn-default !text-xs !h-7.5 !px-3 disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setCandidatePage((p) => Math.min(candidateTotalPages, p + 1))
                    }
                    disabled={candidatePage >= candidateTotalPages}
                    className="zg-btn zg-btn-default !text-xs !h-7.5 !px-3 disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        /* 3B. 我的申请记录列表 */
        <div className="space-y-3">
          {filteredRequests.length === 0 ? (
            <div className="py-10 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200/80">
              <Inbox className="w-7 h-7 mx-auto mb-2 text-slate-300" />
              <div className="text-xs font-bold text-slate-600">
                {searchTerm || statusFilter !== "ALL"
                  ? "未找到符合筛选条件的申请记录"
                  : "您还没有提交过退点申请"}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {searchTerm || statusFilter !== "ALL"
                  ? "请尝试切换状态筛选或清空搜索关键词"
                  : "如遇任务扣点但执行结果异常，可在「可申请退点的任务」中发起申请"}
              </div>
            </div>
          ) : (
            <>
              <div className="max-h-[420px] overflow-y-auto pr-1 space-y-2.5">
                {pagedRequests.map((r) => {
                  const meta = STATUS_META[r.status] || STATUS_META.PENDING;
                  const displayTitle =
                    r.taskName || r.componentName || r.componentId || "组件执行任务";

                  return (
                    <div
                      key={r.id}
                      className="p-4 rounded-xl bg-slate-50/50 hover:bg-white border border-slate-200/80 transition-all space-y-2.5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${meta.cls}`}
                          >
                            {r.status === "APPROVED" && (
                              <CheckCircle2 className="w-3 h-3" />
                            )}
                            {r.status === "REJECTED" && <XCircle className="w-3 h-3" />}
                            {r.status === "PENDING" && <Clock className="w-3 h-3" />}
                            {meta.text}
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            {displayTitle}
                          </span>
                          {r.componentName && r.componentName !== displayTitle && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-50 text-[#2b6cb0] border border-blue-200/60">
                              {r.componentName}
                            </span>
                          )}
                          {r.workspaceName && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200/70">
                              {r.workspaceName}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleCopy(r.taskId, "任务编号")}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-400 hover:text-[#3182ce] cursor-pointer"
                            title="点击复制任务编号"
                          >
                            <span>任务 #{r.taskId.slice(0, 8)}</span>
                            {copiedId === r.taskId ? (
                              <Check className="w-2.5 h-2.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-2.5 h-2.5 opacity-60" />
                            )}
                          </button>
                        </div>

                        <div className="flex items-center gap-3 self-end sm:self-auto">
                          <span className="text-xs font-black font-mono text-[#dd6b20]">
                            申请退还 {r.points.toLocaleString()} 点
                          </span>
                          {r.status === "PENDING" && (
                            <button
                              type="button"
                              onClick={() => setCancellingRequest(r)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200/70 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              撤销申请
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 申请原因与审批回复 */}
                      <div className="p-2.5 rounded-lg bg-white border border-slate-100 text-xs space-y-1.5">
                        <div className="text-slate-600">
                          <span className="font-bold text-slate-500">申请原因：</span>
                          {r.reason}
                        </div>
                        {r.adminRemark && (
                          <div
                            className={`pt-1.5 border-t border-slate-100 ${
                              r.status === "REJECTED"
                                ? "text-rose-600"
                                : "text-emerald-700"
                            }`}
                          >
                            <span className="font-bold">管理员审批说明：</span>
                            {r.adminRemark}
                          </div>
                        )}
                      </div>

                      {/* 底部时间与退回流水号 */}
                      <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] text-slate-400">
                        <span>
                          提交于{" "}
                          {new Date(r.createdAt).toLocaleString("zh-CN", {
                            hour12: false,
                          })}
                          {r.resolvedAt
                            ? ` · 审批于 ${new Date(r.resolvedAt).toLocaleString(
                                "zh-CN",
                                { hour12: false }
                              )}`
                            : ` · ${meta.hint}`}
                        </span>
                        {r.refundLedgerId && (
                          <button
                            type="button"
                            onClick={() => handleCopy(r.refundLedgerId!, "退回流水号")}
                            className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/70 hover:bg-emerald-100 transition-colors cursor-pointer"
                          >
                            <FileText className="w-3 h-3" />
                            <span>退回流水号：{r.refundLedgerId.slice(0, 12)}...</span>
                            {copiedId === r.refundLedgerId ? (
                              <Check className="w-2.5 h-2.5 text-emerald-700" />
                            ) : (
                              <Copy className="w-2.5 h-2.5 opacity-70" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 常驻申请记录分页与每页容量控制栏 */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t border-slate-100 text-xs text-slate-500">
                <div className="flex items-center gap-2 flex-wrap">
                  <span>
                    共 <strong className="font-mono text-slate-700">{filteredRequests.length}</strong> 条申请记录 · 第{" "}
                    <strong className="font-mono text-slate-700">{requestPage}</strong> / {requestTotalPages} 页
                  </span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value) || 6);
                      setCandidatePage(1);
                      setRequestPage(1);
                    }}
                    className="h-7 px-2 rounded-lg border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 outline-none focus:border-[#3182ce] cursor-pointer"
                  >
                    <option value={6}>每页 6 条</option>
                    <option value={12}>每页 12 条</option>
                    <option value={24}>每页 24 条</option>
                  </select>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRequestPage((p) => Math.max(1, p - 1))}
                    disabled={requestPage <= 1}
                    className="zg-btn zg-btn-default !text-xs !h-7.5 !px-3 disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setRequestPage((p) => Math.min(requestTotalPages, p + 1))
                    }
                    disabled={requestPage >= requestTotalPages}
                    className="zg-btn zg-btn-default !text-xs !h-7.5 !px-3 disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>

      {/* 4. 发起退点申请模态框（通过 createPortal 挂载至 document.body，彻底脱离 .zg-card 的 backdrop-filter 局部坐标系） */}
      {mounted &&
        applyingCandidate &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 relative border border-slate-100">
              <button
                type="button"
                onClick={() => setApplyingCandidate(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    申请退还算力点
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    请说明任务结果异常的具体情况，管理员核实后将原路退回算力点
                  </p>
                </div>
              </div>

              {/* 所选任务信息概览卡 */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 mb-4 text-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800 truncate">
                    {applyingCandidate.taskName ||
                      applyingCandidate.componentName ||
                      "组件执行任务"}
                  </span>
                  <span className="font-black font-mono text-sm text-[#3182ce] shrink-0">
                    申请退回 {applyingCandidate.points.toLocaleString()} 点
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                  {applyingCandidate.componentName && (
                    <span>组件：{applyingCandidate.componentName}</span>
                  )}
                  {applyingCandidate.workspaceName && (
                    <span>· 空间：{applyingCandidate.workspaceName}</span>
                  )}
                  <span>
                    · 扣费时间：
                    {new Date(applyingCandidate.chargedAt).toLocaleString("zh-CN", {
                      hour12: false,
                    })}
                  </span>
                  <span className="font-mono text-slate-400">
                    · 编号：{applyingCandidate.taskId.slice(0, 12)}
                  </span>
                </div>
              </div>

              <form onSubmit={handleConfirmApply} className="space-y-4">
                {/* 常见问题快捷标签 */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1.5">
                    常见原因快捷选择（点击可快速填入）：
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_REASONS.map((tag) => {
                      const selected = reasonInput.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleSelectQuickReason(tag)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all cursor-pointer ${
                            selected
                              ? "bg-blue-50 text-[#3182ce] border-[#3182ce]/40 font-bold"
                              : "bg-slate-50 text-slate-600 border-slate-200/80 hover:bg-slate-100"
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 详细原因输入 */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      <span className="zg-required">退点原因说明</span>
                    </label>
                    <span className="text-[11px] font-mono text-slate-400">
                      {reasonInput.trim().length} / 500
                    </span>
                  </div>
                  <textarea
                    value={reasonInput}
                    onChange={(e) => {
                      setReasonInput(e.target.value);
                      if (reasonError) setReasonError(null);
                    }}
                    rows={4}
                    maxLength={500}
                    placeholder="请描述任务结果不可用的具体表现（至少 5 个字，例如：上传 PDF 后组件解析结果为空白）..."
                    className={`w-full p-3 text-xs rounded-lg border outline-none transition-all resize-none ${
                      reasonError
                        ? "border-red-500 bg-red-50/15 text-red-900 focus:border-red-500 focus:ring-2 focus:ring-red-500/15"
                        : "border-slate-200 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15"
                    }`}
                  />
                  {reasonError && (
                    <p className="text-xs text-red-600 mt-1 font-medium">
                      {reasonError}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-[11px] text-slate-400">
                    每个任务仅限申请一次，未审批前可随时撤销
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setApplyingCandidate(null)}
                      className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      disabled={submittingApply}
                      className="zg-btn zg-btn-primary text-xs h-9 px-4 font-bold disabled:opacity-50"
                    >
                      {submittingApply ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                          提交中...
                        </>
                      ) : (
                        "提交申请"
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* 5. 撤销待审批退点申请确认模态框（通过 createPortal 挂载至 document.body） */}
      {mounted &&
        cancellingRequest &&
        createPortal(
          <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-xs flex items-center justify-center z-[1000] p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 relative border border-slate-100">
              <button
                type="button"
                onClick={() => setCancellingRequest(null)}
                className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
              <div className="text-center mb-4">
                <div className="w-11 h-11 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-2.5">
                  <Trash2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-800">
                  确认撤销退点申请
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  确定要撤销任务{" "}
                  <span className="font-bold text-slate-800">
                    [{cancellingRequest.taskName || cancellingRequest.componentName || "组件执行任务"}]
                  </span>{" "}
                  的 <span className="font-bold text-[#dd6b20]">{cancellingRequest.points} 点</span> 退回申请吗？撤销后您仍可重新发起申请。
                </p>
              </div>
              <div className="flex justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setCancellingRequest(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  保留申请
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={submittingCancel}
                  className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
                >
                  {submittingCancel && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{submittingCancel ? "正在撤销..." : "确认撤销"}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
