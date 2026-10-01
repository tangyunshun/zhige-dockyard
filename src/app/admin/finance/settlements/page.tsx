"use client";

import { useCallback, useEffect, useState } from "react";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import Pagination from "@/components/Pagination";
import {
  Scale,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  RotateCcw,
  ShieldAlert,
  FileCheck,
  Building,
  User,
  Trash2,
  Copy,
  Check,
  Eye,
  ChevronRight,
  X,
  AlertTriangle,
  Coins,
  Database,
  Layers,
  SlidersHorizontal,
  Info,
  CheckSquare,
  Square,
  Sparkles,
  Cpu,
} from "lucide-react";
import type { SettlementDictPayload } from "@/lib/settlement-dict";

interface SettlementRecord {
  id: string;
  taskId: string;
  userId: string;
  workspaceId: string;
  status: "HOLD" | "SETTLED" | "RELEASED" | "REQUIRES_REVIEW";
  holdPoints: number;
  actualPricePoints: number;
  releasedPoints: number;
  supplementPoints: number;
  monthlyTokenUsedIncremented: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costMicros?: number | null;
  userPriceMicros?: number | null;
  pricingSnapshot?: any;
  errorCode: string | null;
  errorCodeName?: string;
  auditMessage: string | null;
  auditMessageDisplay?: string;
  statusName?: string;
  statusStyle?: string;
  statusDot?: string;
  statusDesc?: string;
  settlementVersion: number;
  settledAt?: string | null;
  releasedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SettlementStats {
  totalRecords: number;
  requiresReviewCount: number;
  settledCount: number;
  releasedCount: number;
  heldCount: number;
}

// 状态图标映射（仅作为视觉组件映射，不写死任何业务文本，业务文本与配置 100% 来自数据库 system_config）
const STATUS_ICON_MAP: Record<string, typeof ShieldAlert> = {
  REQUIRES_REVIEW: ShieldAlert,
  ALL: Scale,
  SETTLED: CheckCircle2,
  RELEASED: RotateCcw,
  HOLD: Clock,
};

/** 详情键值行（与财务板块其他页面弹窗一致） */
function Row({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 text-xs py-1 border-b border-slate-50 last:border-none">
      <span className="text-slate-400 font-bold shrink-0">{label}</span>
      <span className={`text-slate-700 font-medium text-right break-all ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

export default function AdminTokenSettlementsPage() {
  const toast = useToast();

  const [records, setRecords] = useState<SettlementRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<SettlementStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  // 数据库持久化配置字典：100% 从数据库 system_config 查询返回，拒绝前端代码写死
  const [dictionary, setDictionary] = useState<SettlementDictPayload | null>(null);

  // 筛选与分页
  const [statusFilter, setStatusFilter] = useState<string>("REQUIRES_REVIEW");
  const [searchTaskId, setSearchTaskId] = useState("");
  const [searchUserId, setSearchUserId] = useState("");
  const [searchWorkspaceId, setSearchWorkspaceId] = useState("");
  // 默认固定每页展示 10 条数据
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: PAGE_SIZE, total: 0, totalPages: 1 });

  // 批量勾选状态
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  // 弹窗状态
  const [selectedRecord, setSelectedRecord] = useState<SettlementRecord | null>(null);
  const [resolveAction, setResolveAction] = useState<"SETTLE" | "RELEASE">("RELEASE");
  const [actualPointsInput, setActualPointsInput] = useState<string>("");
  const [auditRemarkInput, setAuditRemarkInput] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // 结算单全量明细弹窗
  const [detailRecord, setDetailRecord] = useState<SettlementRecord | null>(null);

  // 复制反馈标识
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // 全局统一二次确认框状态
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    warnings?: string[];
    type: "danger" | "warning" | "info";
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "danger",
    confirmText: "确认执行清理",
    cancelText: "取消",
    onConfirm: () => {},
  });

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
    toast.success("已复制到剪贴板");
  };

  // 获取统计大盘数据
  const loadStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const token = getAuthToken();
      const res = await fetch("/api/admin/token-settlements/stats", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok && json.success && json.data) {
        const s = json.data.settlementStatusCounts || {};
        const total = (s.requiresReview || 0) + (s.settled || 0) + (s.released || 0) + (s.hold || 0);
        setStats({
          totalRecords: json.data.totalRecords ?? total,
          requiresReviewCount: json.data.requiresReviewCount ?? s.requiresReview ?? 0,
          settledCount: json.data.settledCount ?? s.settled ?? 0,
          releasedCount: json.data.releasedCount ?? s.released ?? 0,
          heldCount: json.data.heldCount ?? s.hold ?? 0,
        });
      }
    } catch {
      // 容错静默
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // 获取结算列表
  const loadRecords = useCallback(async () => {
    try {
      setLoading(true);
      const token = getAuthToken();
      const sp = new URLSearchParams({
        status: statusFilter,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      if (searchTaskId.trim()) sp.set("taskId", searchTaskId.trim());
      if (searchUserId.trim()) sp.set("userId", searchUserId.trim());
      if (searchWorkspaceId.trim()) sp.set("workspaceId", searchWorkspaceId.trim());

      const res = await fetch(`/api/admin/token-settlements?${sp.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setRecords(json.data.records || []);
        setPagination(json.data.pagination || pagination);
        if (json.data.dictionary) {
          setDictionary(json.data.dictionary);
        }
      } else {
        toast.error(json.error || "获取结算单列表失败");
      }
    } catch {
      toast.error("网络请求异常，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, searchTaskId, searchUserId, searchWorkspaceId, toast]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // 全局键盘与滚动穿透防护：支持 ESC 键关闭顶层弹窗，且打开模态框时锁定背景滚动
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (confirmDialog.isOpen) {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        } else if (selectedRecord) {
          setSelectedRecord(null);
        } else if (detailRecord) {
          setDetailRecord(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmDialog.isOpen, selectedRecord, detailRecord]);

  useEffect(() => {
    if (selectedRecord || detailRecord) {
      document.body.style.overflow = "hidden";
    } else if (!confirmDialog.isOpen) {
      document.body.style.overflow = "unset";
    }
  }, [selectedRecord, detailRecord, confirmDialog.isOpen]);

  // 重置筛选
  const handleResetFilters = () => {
    setSearchTaskId("");
    setSearchUserId("");
    setSearchWorkspaceId("");
    setStatusFilter("ALL");
    setPage(1);
  };

  // 全选/反选
  const handleSelectAll = () => {
    if (selectedTaskIds.length === records.length) {
      setSelectedTaskIds([]);
    } else {
      setSelectedTaskIds(records.map((r) => r.taskId));
    }
  };

  // 单选一行
  const handleSelectRow = (taskId: string) => {
    setSelectedTaskIds((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  // 打开裁决弹窗
  const openResolveModal = (record: SettlementRecord, action: "SETTLE" | "RELEASE") => {
    setSelectedRecord(record);
    setResolveAction(action);
    setActualPointsInput(String(record.holdPoints));
    setAuditRemarkInput("");
  };

  // 提交人工复核裁决
  const handleResolveSubmit = async () => {
    if (!selectedRecord) return;
    if (!auditRemarkInput.trim()) {
      toast.error("请录入人工复核审核备注");
      return;
    }

    let actualPoints: number | undefined = undefined;
    if (resolveAction === "SETTLE") {
      const parsed = Number(actualPointsInput);
      if (isNaN(parsed) || parsed < 0) {
        toast.error("实际核定点数必须为非负数值");
        return;
      }
      actualPoints = parsed;
    }

    try {
      setSubmitting(true);
      const token = getAuthToken();
      const res = await fetch(`/api/admin/token-settlements/${selectedRecord.taskId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({
          action: resolveAction,
          actualPoints,
          auditRemark: auditRemarkInput.trim(),
        }),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        toast.success(`任务 ${selectedRecord.taskId} 成功裁决为 ${json.data.status}`);
        setSelectedRecord(null);
        loadRecords();
        loadStats();
      } else {
        toast.error(json.error || "复核裁决处理失败");
      }
    } catch {
      toast.error("网络提交异常，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  // 单条删除
  const handleDeleteSingle = (record: SettlementRecord) => {
    if (record.status === "REQUIRES_REVIEW") {
      setConfirmDialog({
        isOpen: true,
        title: "无法直接删除待复核结算单",
        message: `结算单【${record.taskId}】当前处于【待人工复核】状态，代表该任务因计费争议或模型异常正处于资金裁决流程中。\n\n根据系统资金安全防破坏规则，处于复核中的单据严禁直接删除。请先在列表操作栏点击【按实扣费】结清，或点击【全额退款】原路释放预扣资金。完成裁决后即可安全清理该归档记录。`,
        type: "warning",
        confirmText: "我知道了",
        cancelText: "关闭",
        onConfirm: () => setConfirmDialog((prev) => ({ ...prev, isOpen: false })),
      });
      return;
    }
    if (record.status === "HOLD") {
      setConfirmDialog({
        isOpen: true,
        title: "无法直接删除预扣中结算单",
        message: `结算单【${record.taskId}】当前处于【资金预扣执行中】状态，代表该任务正在调用模型或尚未完成最终对账。\n\n根据资金安全防破坏规则，预扣中单据禁止直接删除。请等待任务执行完成自动结清，或执行释放后再进行清理。`,
        type: "warning",
        confirmText: "我知道了",
        cancelText: "关闭",
        onConfirm: () => setConfirmDialog((prev) => ({ ...prev, isOpen: false })),
      });
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: "确认删除结算单",
      message: `确定要物理清理任务标识为 【${record.taskId}】 的已归档结算记录吗？\n该操作将同时清理关联的预扣流水与系统快照，操作不可逆，请谨慎确认。`,
      type: "danger",
      confirmText: "确认执行清理",
      cancelText: "取消",
      onConfirm: async () => {
        try {
          const token = getAuthToken();
          const res = await fetch("/api/admin/token-settlements", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            credentials: "include",
            body: JSON.stringify({ taskIds: [record.taskId] }),
          });
          const json = await res.json();
          if (res.ok && json.success) {
            toast.success(json.message || "删除结算单成功");
            setSelectedTaskIds((prev) => prev.filter((id) => id !== record.taskId));
            loadRecords();
            loadStats();
          } else {
            toast.error(json.error || "删除结算单失败");
          }
        } catch {
          toast.error("网络请求异常，删除失败");
        } finally {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  // 批量删除
  const handleBatchDelete = () => {
    if (selectedTaskIds.length === 0) {
      toast.error("请先勾选需要删除的结算单记录");
      return;
    }

    const selectedRecords = records.filter((r) => selectedTaskIds.includes(r.taskId));
    const riskyCount = selectedRecords.filter(
      (r) => r.status === "REQUIRES_REVIEW" || r.status === "HOLD"
    ).length;

    const warnings: string[] = [];
    if (riskyCount > 0) {
      warnings.push(
        `您选中的 ${selectedTaskIds.length} 条单据中，包含 ${riskyCount} 条处于“待人工复核”或“预扣中”的高风险单据。根据资金安全红线，系统将【自动保护并跳过】这部分单据，仅清理已终态单据。`
      );
    }

    setConfirmDialog({
      isOpen: true,
      title: `确认批量删除结算单 (${selectedTaskIds.length} 项)`,
      message: `确定要对当前勾选的 ${selectedTaskIds.length} 条结算单据执行批量清理吗？\n清理后关联的数据库底表数据将被物理移除。`,
      warnings,
      type: "danger",
      confirmText: "确认批量删除",
      cancelText: "取消",
      onConfirm: async () => {
        try {
          const token = getAuthToken();
          const res = await fetch("/api/admin/token-settlements", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            credentials: "include",
            body: JSON.stringify({ taskIds: selectedTaskIds }),
          });
          const json = await res.json();
          if (res.ok && json.success) {
            toast.success(json.message || `成功删除 ${json.deletedCount} 条结算单`);
            setSelectedTaskIds([]);
            loadRecords();
            loadStats();
          } else {
            toast.error(json.error || "批量删除失败");
          }
        } catch {
          toast.error("网络请求异常，批量删除失败");
        } finally {
          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
        }
      },
    });
  };

  return (
    <div className="space-y-6 font-sans">
      {/* 页面标题 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-2 min-w-0">
          <Scale className="w-5 h-5 text-[#3182ce] mt-0.5 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-xl font-black text-slate-800">Token 真实结算人工复核</h2>
            <p className="text-xs text-slate-500 mt-1">
              针对高风险挂起、模型失败释放异常或差额补扣待裁决单据，由管理员在银行级事务隔离下执行权威裁决与资金对账。
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => {
              loadRecords();
              loadStats();
            }}
            disabled={loading || statsLoading}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 font-bold text-xs rounded-xl flex items-center gap-1.5 disabled:opacity-50 cursor-pointer transition-all shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : ""}`} />
            刷新数据
          </button>
        </div>
      </div>

      {/* 运营态势指标卡片 (Metrics Overview) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* 卡片 1: 待人工复核 */}
        <div
          onClick={() => {
            setStatusFilter("REQUIRES_REVIEW");
            setPage(1);
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            statusFilter === "REQUIRES_REVIEW"
              ? "bg-gradient-to-br from-amber-50 to-orange-50/60 border-amber-300 ring-2 ring-amber-400/20 shadow-sm"
              : "bg-white hover:bg-amber-50/30 border-slate-200/80 hover:border-amber-200"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-amber-800/80 flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              待人工复核
            </span>
            {stats && stats.requiresReviewCount > 0 && (
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
            )}
          </div>
          <div className="text-2xl font-black text-amber-900 tracking-tight font-mono">
            {statsLoading ? "..." : stats?.requiresReviewCount ?? 0}
          </div>
          <p className="text-[11px] text-amber-700/70 mt-1 font-medium whitespace-nowrap">高风险挂起与裁决争议单据</p>
        </div>

        {/* 卡片 2: 已成功结算 */}
        <div
          onClick={() => {
            setStatusFilter("SETTLED");
            setPage(1);
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            statusFilter === "SETTLED"
              ? "bg-gradient-to-br from-emerald-50 to-teal-50/60 border-emerald-300 ring-2 ring-emerald-400/20 shadow-sm"
              : "bg-white hover:bg-emerald-50/30 border-slate-200/80 hover:border-emerald-200"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-emerald-800/80 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              已核定结算
            </span>
          </div>
          <div className="text-2xl font-black text-emerald-900 tracking-tight font-mono">
            {statsLoading ? "..." : stats?.settledCount ?? 0}
          </div>
          <p className="text-[11px] text-emerald-700/70 mt-1 font-medium whitespace-nowrap">完成实际扣减与对账结清</p>
        </div>

        {/* 卡片 3: 已全额释放 */}
        <div
          onClick={() => {
            setStatusFilter("RELEASED");
            setPage(1);
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            statusFilter === "RELEASED"
              ? "bg-gradient-to-br from-slate-100 to-slate-200/60 border-slate-300 ring-2 ring-slate-400/20 shadow-sm"
              : "bg-white hover:bg-slate-50/60 border-slate-200/80 hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <RotateCcw className="w-4 h-4 text-slate-500" />
              已原路退款
            </span>
          </div>
          <div className="text-2xl font-black text-slate-800 tracking-tight font-mono">
            {statsLoading ? "..." : stats?.releasedCount ?? 0}
          </div>
          <p className="text-[11px] text-slate-500 mt-1 font-medium whitespace-nowrap">任务失败或全额退还释放</p>
        </div>

        {/* 卡片 4: 预扣锁定中 */}
        <div
          onClick={() => {
            setStatusFilter("HOLD");
            setPage(1);
          }}
          className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
            statusFilter === "HOLD"
              ? "bg-gradient-to-br from-blue-50 to-indigo-50/60 border-blue-300 ring-2 ring-blue-400/20 shadow-sm"
              : "bg-white hover:bg-blue-50/30 border-slate-200/80 hover:border-blue-200"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-blue-800/80 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#3182ce]" />
              预扣执行中
            </span>
          </div>
          <div className="text-2xl font-black text-blue-900 tracking-tight font-mono">
            {statsLoading ? "..." : stats?.heldCount ?? 0}
          </div>
          <p className="text-[11px] text-blue-700/70 mt-1 font-medium whitespace-nowrap">流式生成执行中尚未对账</p>
        </div>
      </div>

      {/* 状态标签栏与多维检索栏 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {/* 状态标签（100% 由数据库 system_config 字典动态驱动，支持库内热更新） */}
        <div className="flex items-center gap-2 p-3.5 border-b border-slate-100 flex-wrap">
          {dictionary?.statuses ? (
            Object.entries(dictionary.statuses).map(([key, meta]) => {
              const Icon = STATUS_ICON_MAP[key] || Scale;
              const active = statusFilter === key;
              const label = typeof meta === "object" ? meta.label : meta;

              return (
                <button
                  key={key}
                  onClick={() => {
                    setStatusFilter(key);
                    setPage(1);
                    setSelectedTaskIds([]);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                    active
                      ? "bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white shadow-sm"
                      : "bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              );
            })
          ) : (
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-7 w-20 bg-slate-100 animate-pulse rounded-xl" />
              ))}
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 whitespace-nowrap">
              当前视图共 <span className="text-slate-700 font-mono font-black">{pagination.total}</span> 条
            </span>
          </div>
        </div>

        {/* 多维检索输入区域 */}
        <div className="p-3.5 bg-slate-50/50 border-b border-slate-100 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="按任务 ID 检索..."
              value={searchTaskId}
              onChange={(e) => setSearchTaskId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadRecords()}
              className="w-full pl-9 pr-3 h-9 text-xs border border-slate-200 rounded-xl bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none text-slate-800 transition-all"
            />
          </div>

          <div className="relative">
            <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="按用户 ID 检索..."
              value={searchUserId}
              onChange={(e) => setSearchUserId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadRecords()}
              className="w-full pl-9 pr-3 h-9 text-xs border border-slate-200 rounded-xl bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none text-slate-800 transition-all"
            />
          </div>

          <div className="relative">
            <Building className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="按空间 ID 检索..."
              value={searchWorkspaceId}
              onChange={(e) => setSearchWorkspaceId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadRecords()}
              className="w-full pl-9 pr-3 h-9 text-xs border border-slate-200 rounded-xl bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none text-slate-800 transition-all"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setPage(1);
                loadRecords();
              }}
              className="px-4 h-9 text-xs font-bold text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs whitespace-nowrap"
            >
              <Search className="w-3.5 h-3.5" />
              搜索
            </button>
            <button
              onClick={handleResetFilters}
              title="重置所有搜索条件"
              className="px-3.5 h-9 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              重置
            </button>
          </div>
        </div>

        {/* 批量操作工具栏（与其他管理后台页面保持 100% 一致：嵌入在列表上方） */}
        {selectedTaskIds.length > 0 && (
          <div className="relative bg-gradient-to-r from-[#3182ce]/10 to-[#8b5cf6]/10 border-b border-slate-200/80 px-6 py-3 flex items-center justify-between flex-wrap gap-3 animate-in fade-in duration-150">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
                已选择 <span className="text-[#3182ce] font-mono text-sm font-black">{selectedTaskIds.length}</span> 项结算单
              </span>
              <button
                onClick={() => setSelectedTaskIds([])}
                className="px-2.5 py-1 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-2xs whitespace-nowrap"
              >
                取消选择
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleBatchDelete}
                className="px-3.5 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-95 whitespace-nowrap"
              >
                <Trash2 className="w-3.5 h-3.5" />
                批量删除
              </button>
            </div>
          </div>
        )}

        {/* 结算单列表主体（全字段不换行 + 紧凑单行排版 + Sticky 固化操作列） */}
        <div className="overflow-x-auto relative">
          {loading && records.length === 0 ? (
            <div className="py-20 text-center text-xs font-bold text-slate-400">
              <RefreshCw className="w-7 h-7 animate-spin text-[#3182ce] mx-auto mb-3 opacity-80" />
              正在读取银行级结算流水...
            </div>
          ) : records.length === 0 ? (
            <div className="py-20 text-center text-xs font-bold text-slate-400">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
                <FileCheck className="w-6 h-6" />
              </div>
              暂无符合条件的结算单记录
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-extrabold text-[11px]">
                  <th className="py-3.5 px-3.5 w-10 text-center whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={records.length > 0 && selectedTaskIds.length === records.length}
                      onChange={handleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce] cursor-pointer accent-[#3182ce]"
                    />
                  </th>
                  <th className="py-3.5 px-4 whitespace-nowrap">任务标识 / 状态</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">归属主体 (用户 · 空间)</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">财务点数 (预扣 · 实扣 · 差额)</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Token 消耗吞吐</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">审计与异常备注</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">更新时间</th>
                  {/* Sticky 吸附在最右侧的操作列头 */}
                  <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-20 px-4.5 py-3.5 text-right whitespace-nowrap font-extrabold shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200/80">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => {
                  const isReview = r.status === "REQUIRES_REVIEW";
                  const SIcon = STATUS_ICON_MAP[r.status] || FileCheck;
                  const isSelected = selectedTaskIds.includes(r.taskId);

                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-slate-50/80 transition-colors group ${
                        isSelected ? "bg-blue-50/40" : ""
                      }`}
                    >
                      {/* 复选框 */}
                      <td className="py-3 px-3.5 text-center whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectRow(r.taskId)}
                          className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce] cursor-pointer accent-[#3182ce]"
                        />
                      </td>

                      {/* 任务标识与状态 */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-800 text-xs group-hover:text-[#3182ce] transition-colors">
                            {r.taskId}
                          </span>
                          <button
                            onClick={() => copyText(r.taskId, `task-${r.id}`)}
                            title="复制任务 ID"
                            className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer transition-colors"
                          >
                            {copiedKey === `task-${r.id}` ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                          </button>
                          <span
                            className={`px-2.5 py-1 rounded-md text-[10px] font-black border inline-flex items-center gap-1.5 shadow-2xs transition-all ${
                              r.statusStyle || "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${r.statusDot || "bg-slate-400"}`}></span>
                            <SIcon className="w-3 h-3" />
                            {r.statusName || r.status}
                          </span>
                        </div>
                      </td>

                      {/* 归属主体 */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1 text-slate-700 font-medium">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono text-xs">{r.userId}</span>
                            <button
                              onClick={() => copyText(r.userId, `user-${r.id}`)}
                              title="复制用户 ID"
                              className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
                            >
                              {copiedKey === `user-${r.id}` ? (
                                <Check className="w-2.5 h-2.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100" />
                              )}
                            </button>
                          </div>
                          <div className="flex items-center gap-1 text-slate-400">
                            <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono text-xs">{r.workspaceId}</span>
                          </div>
                        </div>
                      </td>

                      {/* 财务点数核算流向 */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-slate-600">
                            预扣: <b className="font-mono font-bold text-slate-800">{r.holdPoints}</b> 点
                          </span>
                          <span className="text-slate-300">/</span>
                          <span className="text-slate-600">
                            应扣: <b className="font-mono font-bold text-slate-800">{r.actualPricePoints}</b> 点
                          </span>
                          {r.releasedPoints > 0 && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded">
                              退还 {r.releasedPoints} 点
                            </span>
                          )}
                          {r.supplementPoints > 0 && (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 rounded">
                              补扣 {r.supplementPoints} 点
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Token 消耗量 */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 font-mono text-xs text-slate-700">
                          <span>入: <b className="text-slate-900">{r.inputTokens.toLocaleString()}</b></span>
                          <span className="text-slate-300">/</span>
                          <span>出: <b className="text-slate-900">{r.outputTokens.toLocaleString()}</b></span>
                          {(r.cacheReadTokens || 0) > 0 && (
                            <span className="text-[10px] font-sans text-[#3182ce] bg-blue-50 border border-blue-200/60 px-1.5 py-0.5 rounded font-bold">
                              读缓存 {r.cacheReadTokens?.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 审计 / 异常追踪 */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {r.auditMessage || r.errorCode ? (
                          <div
                            className="max-w-[220px] truncate text-xs text-amber-800 bg-amber-50/80 border border-amber-200/60 px-2 py-1 rounded-lg"
                            title={r.auditMessageDisplay || r.auditMessage || (r.errorCodeName ? `[${r.errorCodeName}]` : r.errorCode || "")}
                          >
                            <span className="font-bold mr-1">
                              {r.errorCodeName ? `[${r.errorCodeName}]` : r.errorCode ? `[${r.errorCode}]` : ""}
                            </span>
                            {r.auditMessageDisplay || r.auditMessage || "异常记录"}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 font-medium">正常结清</span>
                        )}
                      </td>

                      {/* 更新时间（纯时间显示，不混合版本号） */}
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500 font-mono text-xs">
                        <span>{new Date(r.updatedAt).toLocaleString("zh-CN", { hour12: false })}</span>
                      </td>

                      {/* Sticky 吸附在最右侧的数据行操作列 */}
                      <td className="sticky right-0 bg-white/95 group-hover:bg-slate-50/95 backdrop-blur-xs z-10 px-4.5 py-3 text-right whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-100 transition-colors">
                        <div className="inline-flex items-center gap-2 justify-end">
                          {/* 查看详情 */}
                          <button
                            onClick={() => setDetailRecord(r)}
                            className="px-2.5 py-1.5 text-slate-600 hover:text-[#3182ce] hover:bg-blue-50 border border-slate-200/80 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs"
                            title="查看完整快照明细"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-400" />
                            详情
                          </button>

                          {/* 待人工复核单据专属操作 */}
                          {isReview && (
                            <>
                              <button
                                onClick={() => openResolveModal(r, "RELEASE")}
                                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg font-bold text-xs inline-flex items-center gap-1 cursor-pointer transition-colors border border-rose-200 shadow-2xs"
                                title="将预扣资金全额原路退款"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                全额退款
                              </button>
                              <button
                                onClick={() => openResolveModal(r, "SETTLE")}
                                className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#3182ce] rounded-lg font-bold text-xs inline-flex items-center gap-1 cursor-pointer transition-colors border border-blue-200 shadow-2xs"
                                title="按实际调用点数执行扣费并结清"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                按实扣费
                              </button>
                            </>
                          )}

                          {/* 单条删除 */}
                          <button
                            onClick={() => handleDeleteSingle(r)}
                            className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs active:scale-95"
                            title="删除此结算单"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 分页控制：固定采用标准 Pagination 组件 */}
        {pagination.total > 0 && (
          <div className="p-3 border-t border-slate-100 bg-white">
            <Pagination
              currentPage={page}
              totalItems={pagination.total}
              pageSize={PAGE_SIZE}
              onPageChange={(p) => setPage(p)}
              itemLabel="条结算单"
            />
          </div>
        )}
      </div>

      {/* 弹窗 1：人工复核裁决弹窗 */}
      {selectedRecord && (
        <div
          onClick={() => setSelectedRecord(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] p-6 flex flex-col gap-4 overflow-hidden border border-slate-100"
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 shrink-0">
              <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                {resolveAction === "RELEASE" ? (
                  <>
                    <RotateCcw className="w-5 h-5 text-rose-500" /> 核销并全额退款
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-[#3182ce]" /> 确认按实扣费结算
                  </>
                )}
              </h4>
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 text-sm pr-1">
              <Row label="任务标识" value={selectedRecord.taskId} mono />
              <Row label="归属用户" value={selectedRecord.userId} mono />
              <Row label="空间标识" value={selectedRecord.workspaceId} mono />
              <Row label="已预扣锁定" value={`${selectedRecord.holdPoints} 点`} />

              {resolveAction === "RELEASE" ? (
                <div className="p-3 bg-rose-50/80 border border-rose-100 rounded-xl text-rose-700 text-[11px] leading-relaxed">
                  <div className="font-bold flex items-center gap-1.5 mb-1 text-xs">
                    <ShieldAlert className="w-4 h-4 text-rose-500" /> 全额原路退款确认
                  </div>
                  本次裁决将把预扣的 <strong>{selectedRecord.holdPoints} 点</strong>{" "}
                  资金原路退回至用户原分桶与钱包，全额回滚成员月度用量，并生成【原路退款】审计流水，同时将单据置为【已全额退款】终态。
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-700">
                    <span className="text-rose-500 mr-1 font-bold">*</span>实际应扣结算点数
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={actualPointsInput}
                    onChange={(e) => setActualPointsInput(e.target.value)}
                    className="w-full h-10 px-3 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none font-mono text-sm bg-white"
                    placeholder="输入实际应扣减结算的点数"
                  />
                  <p className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Info className="w-3 h-3 text-[#3182ce]" />
                    输入本次任务实际应扣减的点数。若小于原预扣，系统自动将差额退还给用户；若大于原预扣，将从用户账户追加补扣。
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">
                  <span className="text-rose-500 mr-1 font-bold">*</span>复核审核备注
                </label>
                <textarea
                  rows={3}
                  value={auditRemarkInput}
                  onChange={(e) => setAuditRemarkInput(e.target.value)}
                  placeholder="请输入本次人工复核的审批结论与争议处置原因..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/15 outline-none text-xs text-slate-800 bg-white"
                />
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2.5 justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setSelectedRecord(null)}
                className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-bold text-xs cursor-pointer transition-colors disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleResolveSubmit}
                className={`px-5 py-2.5 text-white font-black rounded-xl text-xs shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95 transition-all disabled:opacity-50 ${
                  resolveAction === "RELEASE"
                    ? "bg-gradient-to-r from-rose-500 to-rose-600"
                    : "bg-gradient-to-r from-[#2b6cb0] to-[#3182ce]"
                }`}
              >
                {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                确认扣费并提交
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 弹窗 2：结算单全量明细弹窗 */}
      {detailRecord && (
        <div
          onClick={() => setDetailRecord(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] p-6 flex flex-col gap-4 overflow-hidden border border-slate-100"
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-[#3182ce]">
                  <FileCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900">结算单全量明细与定价快照</h4>
                  <p className="text-[11px] text-slate-400 font-mono">{detailRecord.taskId}</p>
                </div>
              </div>
              <button
                onClick={() => setDetailRecord(null)}
                className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1 text-xs">
              {/* 基础信息卡片 */}
              <div className="bg-slate-50/70 rounded-xl p-3 border border-slate-100 space-y-1.5">
                <div className="font-black text-slate-700 text-xs mb-1 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-[#3182ce]" /> 核心主体与账期状态
                </div>
                <Row label="内部主键" value={detailRecord.id} mono />
                <Row label="任务标识" value={detailRecord.taskId} mono />
                <Row label="归属用户" value={detailRecord.userId} mono />
                <Row label="工作空间" value={detailRecord.workspaceId} mono />
                <Row
                  label="当前终态"
                  value={
                    <span
                      className={`px-2.5 py-1 rounded-md text-[10px] font-black border inline-flex items-center gap-1.5 shadow-2xs ${
                        detailRecord.statusStyle || "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${detailRecord.statusDot || "bg-slate-400"}`}
                      ></span>
                      {detailRecord.statusName || detailRecord.status}
                    </span>
                  }
                />
                <Row label="单据版本" value={`第 ${detailRecord.settlementVersion} 版`} mono />
                <Row
                  label="创建时间"
                  value={new Date(detailRecord.createdAt).toLocaleString("zh-CN", { hour12: false })}
                />
                <Row
                  label="更新时间"
                  value={new Date(detailRecord.updatedAt).toLocaleString("zh-CN", { hour12: false })}
                />
              </div>

              {/* 点数核算卡片 */}
              <div className="bg-slate-50/70 rounded-xl p-3 border border-slate-100 space-y-1.5">
                <div className="font-black text-slate-700 text-xs mb-1 flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-amber-500" /> 财务点数结算与差额流向
                </div>
                <Row label="预扣锁定点数" value={`${detailRecord.holdPoints} 点`} />
                <Row label="实际应扣点数" value={`${detailRecord.actualPricePoints} 点`} />
                <Row
                  label="释放退还点数"
                  value={
                    <span className="text-emerald-600 font-bold">{detailRecord.releasedPoints} 点</span>
                  }
                />
                <Row
                  label="差额补扣点数"
                  value={
                    <span className="text-amber-600 font-bold">{detailRecord.supplementPoints} 点</span>
                  }
                />
                <Row
                  label="月度累计递增"
                  value={`${detailRecord.monthlyTokenUsedIncremented || 0} Tokens`}
                />
              </div>

              {/* Token 消耗明细 */}
              <div className="bg-slate-50/70 rounded-xl p-3 border border-slate-100 space-y-1.5">
                <div className="font-black text-slate-700 text-xs mb-1 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-[#3182ce]" /> 真实 Token 吞吐指标
                </div>
                <Row label="输入 Tokens (提示词)" value={detailRecord.inputTokens.toLocaleString()} mono />
                <Row label="输出 Tokens (模型补全)" value={detailRecord.outputTokens.toLocaleString()} mono />
                <Row
                  label="缓存读取 Tokens"
                  value={(detailRecord.cacheReadTokens || 0).toLocaleString()}
                  mono
                />
                <Row
                  label="缓存写入 Tokens"
                  value={(detailRecord.cacheWriteTokens || 0).toLocaleString()}
                  mono
                />
              </div>

              {/* 审计日志与异常 */}
              {(detailRecord.auditMessage || detailRecord.errorCode) && (
                <div className="bg-amber-50/70 rounded-xl p-3 border border-amber-100 space-y-1">
                  <div className="font-bold text-amber-900 text-xs flex items-center gap-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-600" /> 审计原因与异常排查
                  </div>
                  {(detailRecord.errorCodeName || detailRecord.errorCode) && (
                    <div className="text-[11px] text-amber-800">
                      异常类型: <strong>{detailRecord.errorCodeName || detailRecord.errorCode}</strong>
                    </div>
                  )}
                  {(detailRecord.auditMessageDisplay || detailRecord.auditMessage) && (
                    <div className="text-[11px] text-amber-800 leading-relaxed">
                      {detailRecord.auditMessageDisplay || detailRecord.auditMessage}
                    </div>
                  )}
                </div>
              )}

              {/* 任务定价快照 JSON */}
              {detailRecord.pricingSnapshot && (
                <div className="space-y-1">
                  <div className="font-bold text-slate-700 text-xs flex items-center gap-1.5">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" /> 历史定价快照 (不可变)
                  </div>
                  <pre className="p-3 bg-slate-900 text-slate-200 rounded-xl text-[10px] font-mono overflow-x-auto max-h-40">
                    {JSON.stringify(detailRecord.pricingSnapshot, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="shrink-0 flex items-center justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDetailRecord(null)}
                className="px-5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 弹窗 3：全局二次确认弹窗 (ConfirmDialog) */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        warnings={confirmDialog.warnings}
        type={confirmDialog.type}
        onConfirm={async () => {
          try {
            await confirmDialog.onConfirm();
          } finally {
            setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
          }
        }}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
        confirmText={confirmDialog.confirmText || "确认执行清理"}
        cancelText={confirmDialog.cancelText || "取消"}
      />
    </div>
  );
}
