"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  X, ShieldCheck, History, RotateCcw, Inbox, CheckCircle2,
  Loader2, ChevronRight, Undo2, Clock, Send, Trash2, AlertTriangle, Lock, FileText,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getAuthToken } from "@/utils/auth";

type TabKey = "removals" | "requests" | "privateGovernance" | "logs";

const ACTION_LABELS: Record<string, string> = {
  "asset:upload": "上传资料",
  "asset:approve": "审核通过公开资料",
  "asset:reject": "审核驳回公开申请",
  "asset:remove": "移除公开资料",
  "asset:remove_private": "移除私密资料",
  "asset:removal_request": "资料删除申请",
  "asset:removal_approve": "删除申请通过",
  "asset:removal_reject": "删除申请驳回",
  "asset:restore": "恢复已移除资料",
  "asset:restore_request": "申请恢复资料",
  "asset:request_publish": "申请公开资料",
  "asset:publish_direct": "直接公开资料",
  "asset:batch_delete": "批量删除资料",
  "asset:batch_remove": "批量移除资料",
  "asset:batch_publish_direct": "批量公开资料",
  "asset:batch_request_publish": "批量申请公开",
  "asset:removal_record_delete": "资料彻底删除",
  "asset:private_review_request": "私密资料治理要求",
  "asset:permission:grant": "授予资料权限",
  "asset:permission:revoke": "撤销资料权限",
  "asset:comment": "评论资料",
  "asset:share": "创建分享链接",
  "asset:share:revoke": "吊销分享链接",
  "asset:version:rollback": "版本回滚",
  "asset:view": "查看资料",
  "asset:download": "下载资料",
  "asset:edit": "编辑资料",
  "component:execute": "执行组件任务",
  "component:bind": "装配效能组件",
  "component:unbind": "解绑效能组件",
  "component:toggle-active": "启用/停用组件",
  "component:set-restricted": "设置受限组件",
  "workspace:update": "更新空间配置",
  "JOIN_WORKSPACE": "加入工作空间",
  "WORKSPACE_KICK": "移出空间成员",
  "UPDATE_MEMBER_ROLE": "变更成员角色",
  "member:leave": "退出工作空间",
  "KNOWLEDGE_PUBLISH": "发布知识规约",
  "KNOWLEDGE_SUBMIT": "提交知识审核",
  "KNOWLEDGE_APPROVE": "知识审核通过",
  "KNOWLEDGE_REJECT": "知识审核驳回",
  "stepup:issued": "二次身份验证",
  "sso:revoke": "解绑第三方账号",
  "user:update": "更新账号信息",
  "user:delete": "删除账号",
  "user:reset_session": "重置会话",
  "system:settings": "更新安全设置",
};

const REMOVAL_REASONS: Record<string, string> = {
  VIOLATION: "违规内容",
  EXPIRED: "资料过期",
  COPYRIGHT: "版权问题",
  OTHER: "其他原因",
};

function actionBadgeClass(action: string): string {
  if (action.includes("remove") || action.includes("delete")) return "bg-red-50 text-red-700 border-red-200";
  if (action.includes("restore")) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (action.includes("approve")) return "bg-blue-50 text-blue-700 border-blue-200";
  if (action.includes("reject")) return "bg-amber-50 text-amber-700 border-amber-200";
  if (action.includes("upload")) return "bg-purple-50 text-purple-700 border-purple-200";
  if (action.includes("publish")) return "bg-cyan-50 text-cyan-700 border-cyan-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function formatDetails(details: any): { lines: string[]; extra: Record<string, any> } {
  if (!details || typeof details !== "object") return { lines: [], extra: {} };
  const lines: string[] = [];
  const shown = new Set<string>();

  if (details.title) {
    lines.push(`资料：《${details.title}》`);
    shown.add("title");
  }
  if (details.reasonCode) {
    const reason = REMOVAL_REASONS[details.reasonCode] || details.reasonCode;
    const detail = details.reasonDetail ? ` — ${details.reasonDetail}` : "";
    lines.push(`原因：${reason}${detail}`);
    shown.add("reasonCode");
    shown.add("reasonDetail");
  }
  if (details.comment) {
    lines.push(`审核意见：${details.comment}`);
    shown.add("comment");
  }
  if (typeof details.count === "number") {
    lines.push(`批量数量：${details.count} 项`);
    shown.add("count");
  }
  if (details.message) {
    lines.push(`申请说明：${details.message}`);
    shown.add("message");
  }
  if (details.permission) {
    lines.push(`分享权限：${details.permission === "download" ? "可下载" : "仅查看"}`);
    shown.add("permission");
  }
  if (details.status) {
    lines.push(`状态：${details.status}`);
    shown.add("status");
  }

  const extra: Record<string, any> = {};
  Object.keys(details).forEach((k) => {
    if (!shown.has(k)) extra[k] = details[k];
  });
  return { lines, extra };
}

function fmt(dt?: string | Date): string {
  if (!dt) return "—";
  const d = typeof dt === "string" ? new Date(dt) : dt;
  if (isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function fmtBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** 移除后 7 日恢复窗口的截止时间 */
function plus7Days(d?: string | Date): Date | null {
  if (!d) return null;
  const t = typeof d === "string" ? new Date(d) : d;
  if (isNaN(t.getTime())) return null;
  return new Date(t.getTime() + 7 * 24 * 60 * 60 * 1000);
}

async function postStudio(body: Record<string, unknown>) {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch("/api/studio", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) throw new Error(data.error || "操作失败");
  return data;
}

interface AssetGovernancePanelProps {
  isOpen: boolean;
  workspaceId: string;
  currentUserId?: string | null;
  isManager: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
}

/**
 * 资料治理中心（P0 移除记录 / P1 操作日志）
 */
export default function AssetGovernancePanel({
  isOpen,
  workspaceId,
  currentUserId,
  isManager,
  onClose,
  onDataChanged,
}: AssetGovernancePanelProps) {
  const toast = useToast();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("removals");
  const [loading, setLoading] = useState(false);

  // 移除记录
  const [removals, setRemovals] = useState<any[]>([]);
  // 操作日志
  const [logs, setLogs] = useState<any[]>([]);
  const [logFilters, setLogFilters] = useState({
    action: "",
    userKeyword: "",
    startDate: "",
    endDate: "",
    titleKeyword: "",
  });
  const [logPagination, setLogPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());
  const [adminDeletedCount, setAdminDeletedCount] = useState<number>(0);
  // 成员申请恢复
  const [requestTarget, setRequestTarget] = useState<any | null>(null);
  const [requestMsg, setRequestMsg] = useState("");
  const [requesting, setRequesting] = useState(false);

  // 删除申请（普通成员删除自己资料，待管理员审核）
  const [deletionRequests, setDeletionRequests] = useState<any[]>([]);
  // 成员私密资料治理台账（仅元数据，不含内容）
  const [privateGovernanceRows, setPrivateGovernanceRows] = useState<any[]>([]);
  const [privateReviewTarget, setPrivateReviewTarget] = useState<any | null>(null);
  const [privateReviewMsg, setPrivateReviewMsg] = useState("");
  const [privateReviewing, setPrivateReviewing] = useState(false);
  // 驳回删除申请的意见弹窗
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectMsg, setRejectMsg] = useState("");
  const [rejecting, setRejecting] = useState(false);
  // 危险操作二次确认：彻底删除资料 / 删除日志
  const [deleteConfirm, setDeleteConfirm] = useState<
    | { mode: "removal"; removalId: string; title: string }
    | { mode: "logs"; ids: string[] }
    | null
  >(null);



  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const loadingRef = useRef(false);

  const loadRemovals = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const d = await postStudio({ action: "list_removals", workspaceId });
      setRemovals(d.data || []);
    } catch (e: any) {
      toast.error(e.message || "加载移除记录失败");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [workspaceId, toast]);

  const loadDeletionRequests = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const d = await postStudio({ action: "list_deletion_requests", workspaceId });
      setDeletionRequests(d.data || []);
    } catch (e: any) {
      toast.error(e.message || "加载删除申请失败");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [workspaceId, toast]);

  const loadPrivateGovernance = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const d = await postStudio({ action: "list_private_governance", workspaceId });
      setPrivateGovernanceRows(d.data || []);
    } catch (e: any) {
      toast.error(e.message || "加载私密治理台账失败");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [workspaceId, toast]);

  const loadLogs = useCallback(async (page = 1, filtersToUse?: typeof logFilters) => {
    setLoading(true);
    try {
      const f = filtersToUse || logFilters;
      const params = new URLSearchParams({ limit: "10", page: String(page) });
      if (f.action) params.set("action", f.action);
      if (f.userKeyword.trim()) params.set("user", f.userKeyword.trim());
      if (f.startDate) params.set("startDate", f.startDate);
      if (f.endDate) params.set("endDate", f.endDate);
      if (f.titleKeyword.trim()) params.set("titleKeyword", f.titleKeyword.trim());

      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const r = await fetch(`/api/workspace/${encodeURIComponent(workspaceId)}/logs?${params.toString()}`, {
        headers,
        credentials: "include",
      });
      const j = await r.json().catch(() => ({}));
      const all = j?.data?.logs || [];
      const total = j?.data?.total || 0;
      const totalPages = j?.data?.totalPages || 1;
      const deletedCount = j?.data?.adminDeletedLogCount || 0;

      setLogs(all);
      setAdminDeletedCount(deletedCount);
      setLogPagination({ page, total, totalPages });
      setExpandedLogs(new Set());
    } catch {
      toast.error("加载操作日志失败");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, toast, logFilters]);

  // 面板打开或切 Tab 时精准加载一次，防二次闪烁
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === "removals") loadRemovals();
    else if (activeTab === "logs") loadLogs(1);
    else if (activeTab === "requests") loadDeletionRequests();
    else if (activeTab === "privateGovernance") loadPrivateGovernance();
  }, [isOpen, activeTab, workspaceId]);

  // 普通成员不可停留在删除申请 Tab，避免打开面板时误调管理员接口
  useEffect(() => {
    if (!isManager && (activeTab === "requests" || activeTab === "privateGovernance")) {
      setActiveTab("removals");
    }
  }, [isManager, activeTab]);

  if (!isOpen || !mounted) return null;

  const handleRestore = async (assetId: string, title: string) => {
    try {
      await postStudio({ action: "restore_asset", workspaceId, assetId });
      toast.success(`已恢复《${title}》，成员将收到通知`);
      loadRemovals();
      onDataChanged?.();
    } catch (e: any) {
      toast.error(e.message || "恢复失败");
    }
  };

  const performDeleteRemoval = async (removalId: string, titleSnapshot?: string) => {
    try {
      await postStudio({ action: "delete_removal_record", workspaceId, removalId });
      toast.success(`已彻底删除《${titleSnapshot || "未命名资料"}》，原文件与移除记录已清理`);
      setRemovals((prev) => prev.filter((r) => r.id !== removalId));
      setDeletionRequests((prev) => prev.filter((r) => r.id !== removalId));
      onDataChanged?.();
    } catch (e: any) {
      toast.error(e.message || "彻底删除失败");
    }
  };

  const handleDeleteRemoval = (removalId: string, titleSnapshot?: string) => {
    if (!removalId) return;
    setDeleteConfirm({
      mode: "removal",
      removalId,
      title: titleSnapshot || "该资料",
    });
  };

  // 确认已读/已知：消去红点与消息数字提醒（红点递减/清空）
  const handleConfirmRead = async (removal: any) => {
    try {
      await postStudio({ action: "confirm_removed_asset", workspaceId, assetId: removal.documentId });
      toast.success("已标为已读，治理提醒标示已减 1");
      loadRemovals();
      onDataChanged?.();
    } catch (e: any) {
      toast.error(e.message || "确认失败");
    }
  };

  const performDeleteLogs = async (ids: string[]) => {
    const targetIds = Array.isArray(ids) ? ids : [ids];
    if (targetIds.length === 0) return;
    try {
      await postStudio(
        targetIds.length === 1
          ? { action: "delete_operation_log", workspaceId, logId: targetIds[0] }
          : { action: "delete_operation_log", workspaceId, logIds: targetIds }
      );
      toast.success(targetIds.length === 1 ? "该条变更记录已删除" : `已删除 ${targetIds.length} 条变更记录`);
      const idSet = new Set(targetIds);
      setSelectedLogIds((prev) => {
        const next = new Set(prev);
        targetIds.forEach((id) => next.delete(id));
        return next;
      });
      setLogs((prev) => prev.filter((l) => !idSet.has(l.id)));
      setLogPagination((prev) => ({ ...prev, total: Math.max(0, prev.total - targetIds.length) }));
    } catch (e: any) {
      toast.error(e.message || "删除变更记录失败");
    }
  };

  const handleDeleteLog = (logId: string) => {
    setDeleteConfirm({ mode: "logs", ids: [logId] });
  };

  const handleBatchDeleteLogs = () => {
    const ids = Array.from(selectedLogIds);
    if (ids.length === 0) return;
    setDeleteConfirm({ mode: "logs", ids });
  };

  const runDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    if (deleteConfirm.mode === "removal") {
      await performDeleteRemoval(deleteConfirm.removalId, deleteConfirm.title);
    } else {
      await performDeleteLogs(deleteConfirm.ids);
    }
    setDeleteConfirm(null);
  };

  const closeDeleteConfirm = () => setDeleteConfirm(null);

  // 成员申请恢复：在 7 日窗口内向管理员发起申请（管理员在移除记录中审核恢复）
  const openRequest = (row: any) => {
    setRequestTarget(row);
    setRequestMsg("");
  };
  const submitRequest = async () => {
    if (!requestTarget) return;
    setRequesting(true);
    try {
      await postStudio({
        action: "request_restore_asset",
        workspaceId,
        assetId: requestTarget.documentId,
        message: requestMsg.trim(),
      });
      toast.success("已向空间管理员发送恢复申请，请留意通知中心");
      setRequestTarget(null);
      setRequestMsg("");
    } catch (e: any) {
      toast.error(e.message || "申请失败");
    } finally {
      setRequesting(false);
    }
  };

  const submitPrivateReview = async () => {
    if (!privateReviewTarget) return;
    const reason = privateReviewMsg.trim();
    if (reason.length < 5) {
      toast.error("请填写不少于 5 个字的处理要求说明");
      return;
    }
    setPrivateReviewing(true);
    try {
      await postStudio({
        action: "notify_private_review",
        workspaceId,
        assetId: privateReviewTarget.id,
        message: reason,
      });
      toast.success("已向资料上传人发送处理要求，系统不会读取该私密资料内容");
      setPrivateReviewTarget(null);
      setPrivateReviewMsg("");
    } catch (e: any) {
      toast.error(e.message || "发送处理要求失败");
    } finally {
      setPrivateReviewing(false);
    }
  };

  const toggleLogExpand = (id: string) => {
    setExpandedLogs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetLogFilters = () => {
    setLogFilters({ action: "", userKeyword: "", startDate: "", endDate: "", titleKeyword: "" });
  };

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: "removals", label: "移除记录", icon: History },
    ...(isManager ? [{ key: "requests" as TabKey, label: "删除申请", icon: Inbox }] : []),
    ...(isManager ? [{ key: "privateGovernance" as TabKey, label: "私密治理", icon: Lock }] : []),
    { key: "logs", label: isManager ? "操作日志" : "变更记录", icon: ShieldCheck },
  ];

  // 渲染单条移除记录的操作区（恢复/申请恢复/状态标识），抽离为函数避免深层 IIFE 括号嵌套
  const renderRemovalActions = (r: any) => {
    const dl = plus7Days(r.removedAt);
    const canRequest = dl && Date.now() <= dl.getTime();
    const isOwn = Boolean(r.uploaderId && currentUserId && r.uploaderId === currentUserId);

    if (r.restoredAt) {
      return (
        <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-black border border-emerald-200">
          已于 {fmt(r.restoredAt)} 恢复
        </span>
      );
    }
    if (isManager) {
      return (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {!r.restoredAt && (
            <button
              type="button"
              onClick={() => handleRestore(r.documentId, r.titleSnapshot)}
              className="px-3 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-[11px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 active:scale-95"
              title="将资料恢复到空间资料库"
            >
              <Undo2 className="w-3 h-3" /> 恢复资料
            </button>
          )}
          <button
            type="button"
            onClick={() => handleDeleteRemoval(r.id, r.titleSnapshot)}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[11px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 active:scale-95"
            title="彻底删除：资料文件与移除记录一并清理，仅保留审计留痕，不可恢复"
          >
            <Trash2 className="w-3 h-3" /> 彻底删除
          </button>
        </div>
      );
    }
    if (!isOwn) {
      return (
        <span className="px-2.5 py-1 rounded-lg bg-red-50 text-red-600 text-[10px] font-black border border-red-200">
          已移除
        </span>
      );
    }
    if (!canRequest) {
      return (
        <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 text-[10px] font-black border border-slate-200">
          已移除（超 7 日恢复期）
        </span>
      );
    }
    const isUnconfirmed = !r.confirmedAt;
    return (
      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2">
          {isUnconfirmed && (
            <button
              type="button"
              onClick={() => handleConfirmRead(r)}
              className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 active:scale-95"
              title="标为已读，治理提醒标示减 1"
            >
              <CheckCircle2 className="w-3 h-3" /> 标为已读
            </button>
          )}
          <button
            type="button"
            onClick={() => openRequest(r)}
            className="px-3 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-[11px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 active:scale-95"
          >
            <Undo2 className="w-3 h-3" /> 申请恢复
          </button>
        </div>
        <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
          <Clock className="w-2.5 h-2.5" /> 可于 {fmt(dl!)} 前申请
        </span>
      </div>
    );
  };

  // ===== 管理员同意删除申请 → 正式移除并通知成员 =====
  const handleApproveDeletion = async (r: any) => {
    try {
      await postStudio({ action: "approve_deletion", workspaceId, removalId: r.id });
      toast.success(`已同意删除《${r.titleSnapshot}》，资料已正式移除并通知成员`);
      loadDeletionRequests();
      onDataChanged?.();
    } catch (e: any) {
      toast.error(e.message || "同意删除失败");
    }
  };

  // ===== 管理员驳回删除申请（必须填写意见） =====
  const submitReject = async () => {
    if (!rejectTarget) return;
    const reason = rejectMsg.trim();
    if (!reason) {
      toast.error("请填写驳回意见");
      return;
    }
    setRejecting(true);
    try {
      await postStudio({ action: "reject_deletion", workspaceId, removalId: rejectTarget.id, rejectReason: reason });
      toast.success("已驳回该删除申请，申请人将收到驳回意见");
      setRejectTarget(null);
      setRejectMsg("");
      loadDeletionRequests();
      onDataChanged?.();
    } catch (e: any) {
      toast.error(e.message || "驳回删除失败");
    } finally {
      setRejecting(false);
    }
  };

  return (
    <>
      {createPortal(
    <div className="fixed inset-0 w-screen h-screen bg-slate-900/70 backdrop-blur-md z-[9999998] flex items-center justify-center p-4 font-sans animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[88vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#3182ce]" /> 变更日志
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              移除记录可追溯与恢复 · 操作全程留痕
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex items-center gap-1 px-6 pt-4">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`px-3.5 py-2 rounded-t-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer border-b-2 ${
                  active
                    ? "text-[#3182ce] border-[#3182ce] bg-blue-50/60"
                    : "text-slate-500 border-transparent hover:text-slate-700 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-6 py-5 border-t border-slate-100">
          {/* ===== 移除记录 ===== */}
          {activeTab === "removals" && (
            <div className="space-y-3">
              {loading && removals.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...
                </div>
              ) : removals.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-10">暂无移除记录</p>
              ) : (
                removals.map((r) => {
                  const isOwn = Boolean(r.uploaderId && currentUserId && r.uploaderId === currentUserId);
                  return (
                    <div key={r.id} className={`p-3.5 border border-slate-200 rounded-2xl flex items-start justify-between gap-3 ${isOwn ? "bg-white" : "bg-slate-50 opacity-80"}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className={`text-sm font-black truncate ${isOwn ? "text-slate-900" : "text-slate-500"}`}>{r.titleSnapshot}</div>
                          {!isOwn && !isManager && (
                            <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-600 text-[10px] font-black border border-red-200">
                              已移除
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium mt-1">
                          原因：<span className="text-red-600 font-bold">{r.reasonLabel}</span>
                          {r.reasonDetail ? ` — ${r.reasonDetail}` : ""}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          移除人：{r.removedByName} · 时间：{fmt(r.removedAt)} · 已通知 {r.notifiedCount} 人
                          {!isOwn && r.uploaderId && <span className="ml-1 text-slate-400">· 上传人可见可操作</span>}
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {renderRemovalActions(r)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
          {/* 移除记录结束 */}

          {/* ===== 删除申请（仅空间管理员可见） ===== */}
          {activeTab === "requests" && (
            <div className="space-y-3">
              <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-2xl text-[11px] text-slate-600 font-medium">
                普通成员申请删除自己上传的公开资料后会进入此列表。同意后将正式移除资料并通知成员，资料仍可在移除记录中恢复；驳回需要填写明确意见。
              </div>
              {loading && deletionRequests.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...
                </div>
              ) : deletionRequests.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-10">暂无待审核的删除申请</p>
              ) : (
                deletionRequests.map((r) => (
                  <div key={r.id} className="p-3.5 bg-white border border-slate-200 rounded-2xl flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-black text-slate-900 truncate">{r.titleSnapshot}</div>
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-black border border-amber-200">
                          待审核
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-1">
                        申请人：<span className="text-slate-800 font-bold">{r.requesterName || "空间成员"}</span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        原因：<span className="text-red-600 font-bold">{r.reasonLabel}</span>
                        {r.reasonDetail ? ` — ${r.reasonDetail}` : ""}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">提交时间：{fmt(r.removedAt)}</div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleApproveDeletion(r)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                      >
                        <CheckCircle2 className="w-3 h-3" /> 同意删除
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRejectTarget(r);
                          setRejectMsg("");
                        }}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                      >
                        <X className="w-3 h-3" /> 驳回
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {/* 删除申请结束 */}

          {/* ===== 成员私密治理台账（仅元数据，管理员不可查看内容/文件） ===== */}
          {activeTab === "privateGovernance" && (
            <div className="space-y-3">
              <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-[11px] text-slate-600 font-medium leading-relaxed">
                私密资料严格归上传人本人所有，本台账仅展示标题、上传人、类型与时间等元数据，不返回内容、总结或文件预览。需要治理时向上传人发送处理要求，由其自行修改、删除或提交公开审核。
              </div>
              {loading && privateGovernanceRows.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...
                </div>
              ) : privateGovernanceRows.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  当前没有需要治理的其他成员私密资料
                </div>
              ) : (
                privateGovernanceRows.map((r) => (
                  <div key={r.id} className="p-3.5 bg-white border border-slate-200 rounded-2xl flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="text-sm font-black text-slate-900 truncate">{r.title}</div>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-black border border-slate-200">
                          仅元数据
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-medium mt-1">
                        上传人：<span className="text-slate-800 font-bold">{r.uploaderName || "空间成员"}</span>
                        <span className="mx-1.5 text-slate-300">·</span>
                        类型：{r.fileTypeLabel || r.type || "文档"}
                        <span className="mx-1.5 text-slate-300">·</span>
                        大小：{fmtBytes(r.fileSize)}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">上传时间：{fmt(r.createdAt)}</div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPrivateReviewTarget(r);
                          setPrivateReviewMsg("");
                        }}
                        className="px-3 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-[11px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                      >
                        <Send className="w-3 h-3" /> 发送处理要求
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          {/* 私密治理台账结束 */}

          {/* ===== 操作日志 / 变更记录 ===== */}
          {activeTab === "logs" && (
            <div className="space-y-3">
              {/* 筛选栏 */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={logFilters.action}
                    onChange={(e) => setLogFilters((f) => ({ ...f, action: e.target.value }))}
                    className="min-w-[110px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                  >
                    <option value="">全部操作</option>
                    {Object.entries(ACTION_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={logFilters.userKeyword}
                    onChange={(e) => setLogFilters((f) => ({ ...f, userKeyword: e.target.value }))}
                    placeholder="操作人姓名/邮箱"
                    className="min-w-[120px] flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                  />
                  <input
                    type="date"
                    value={logFilters.startDate}
                    onChange={(e) => setLogFilters((f) => ({ ...f, startDate: e.target.value }))}
                    className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                  />
                  <span className="text-[11px] text-slate-400 font-medium">至</span>
                  <input
                    type="date"
                    value={logFilters.endDate}
                    onChange={(e) => setLogFilters((f) => ({ ...f, endDate: e.target.value }))}
                    className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={logFilters.titleKeyword}
                    onChange={(e) => setLogFilters((f) => ({ ...f, titleKeyword: e.target.value }))}
                    placeholder="搜索资料名称、原因、审核意见、申请说明..."
                    className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-medium text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce]"
                  />
                  <button
                    type="button"
                    onClick={resetLogFilters}
                    className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold text-[11px] rounded-lg transition-all cursor-pointer active:scale-95"
                  >
                    重置
                  </button>
                </div>
              </div>

              {/* 管理员删除记录说明卡片：仅提示非管理员成员，管理员自身无需提示 */}
              {adminDeletedCount > 0 && !isManager && (
                <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-900 font-bold">
                    <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>说明：空间管理员已累计删除/清理了 <span className="font-black text-red-600">{adminDeletedCount}</span> 条历史变更记录</span>
                  </div>
                  <span className="text-[10px] text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full font-black">治理清理历史</span>
                </div>
              )}

              {/* 统计提示与批量删除工具栏 */}
              {(() => {
                const deletableLogs = logs.filter((l: any) => {
                  const det = l.details && typeof l.details === "object" ? l.details : {};
                  const isPrivateLog = det.visibility === "PRIVATE" || det.isPrivate === true;
                  const isSelfLog = l.userId === currentUserId || det.uploaderId === currentUserId;
                  return isManager || (isPrivateLog && isSelfLog);
                });
                const deletableIds = deletableLogs.map((l: any) => l.id);
                const isAllSelected = deletableIds.length > 0 && deletableIds.every((id: string) => selectedLogIds.has(id));

                return (
                  <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                    <div className="flex items-center gap-3">
                      {deletableIds.length > 0 && (
                        <label className="flex items-center gap-1.5 cursor-pointer text-slate-700 font-bold hover:text-slate-900 transition-colors">
                          <input
                            type="checkbox"
                            checked={isAllSelected}
                            onChange={() => {
                              if (isAllSelected) {
                                setSelectedLogIds(new Set());
                              } else {
                                setSelectedLogIds(new Set(deletableIds));
                              }
                            }}
                            className="w-3.5 h-3.5 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]"
                          />
                          全选
                        </label>
                      )}
                      <span>
                        共 <span className="font-black text-slate-900">{logPagination.total}</span> 条记录
                        {isManager ? "，含操作人、IP、详情" : "，仅展示与您相关的记录"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedLogIds.size > 0 && (
                        <button
                          type="button"
                          onClick={handleBatchDeleteLogs}
                          className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] rounded-lg transition-all cursor-pointer flex items-center gap-1 active:scale-95 shadow-sm"
                        >
                          <Trash2 className="w-3 h-3" /> 批量删除 ({selectedLogIds.size})
                        </button>
                      )}
                      {logPagination.totalPages > 1 && (
                        <span>
                          第 {logPagination.page} / {logPagination.totalPages} 页
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 日志列表 */}
              {loading && logs.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> 加载中...
                </div>
              ) : logs.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-10">暂无记录</p>
              ) : (
                logs.map((l: any) => {
                  const { lines, extra } = formatDetails(l.details);
                  const hasExtra = Object.keys(extra).length > 0;
                  const isExpanded = expandedLogs.has(l.id);
                  const userInitial = (l.user?.name || l.user?.email || "成")[0];

                  const det = l.details && typeof l.details === "object" ? l.details : {};
                  const isPrivateLog = det.visibility === "PRIVATE" || det.isPrivate === true;
                  const isSelfLog = l.userId === currentUserId || det.uploaderId === currentUserId;
                  const canDeleteLog = isManager || (isPrivateLog && isSelfLog);

                  return (
                    <div key={l.id} className="p-3.5 bg-white border border-slate-200 rounded-2xl flex items-start gap-3">
                      {canDeleteLog && (
                        <input
                          type="checkbox"
                          checked={selectedLogIds.has(l.id)}
                          onChange={() => {
                            setSelectedLogIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(l.id)) next.delete(l.id);
                              else next.add(l.id);
                              return next;
                            });
                          }}
                          className="w-3.5 h-3.5 mt-2.5 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce] shrink-0 cursor-pointer"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2.5 min-w-0">
                          {l.user?.avatar ? (
                            <img
                              src={l.user.avatar}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[11px] font-black text-slate-500 shrink-0 border border-slate-200">
                              {userInitial}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-black text-slate-900">
                                {l.user?.name || l.user?.email || "成员"}
                              </span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-bold ${actionBadgeClass(l.action)}`}>
                                {ACTION_LABELS[l.action] || l.action}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {l.user?.email ? `${l.user.email} · ` : ""}
                              {fmt(l.createdAt)}
                            </div>
                            {lines.length > 0 && (
                              <div className="mt-2 space-y-1">
                                {lines.map((line, i) => (
                                  <div key={i} className="text-[11px] text-slate-600 font-medium leading-relaxed">
                                    {line}
                                  </div>
                                ))}
                              </div>
                            )}
                            {hasExtra && (
                              <button
                                type="button"
                                onClick={() => toggleLogExpand(l.id)}
                                className="mt-2 text-[10px] font-bold text-[#3182ce] hover:text-[#2b6cb0] transition-colors cursor-pointer"
                              >
                                {isExpanded ? "收起完整详情" : "展开完整详情"}
                              </button>
                            )}
                            {isExpanded && hasExtra && (
                              <div className="mt-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-mono text-slate-600 overflow-x-auto">
                                <pre className="whitespace-pre-wrap break-all">
                                  {JSON.stringify(extra, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* 右侧 IP 与 变更记录删除按钮（权限防越权） */}
                        <div className="shrink-0 flex items-center gap-2">
                          {isManager && l.ipAddress && (
                            <span className="text-[10px] text-slate-400 font-medium hidden sm:inline">
                              IP：{l.ipAddress}
                            </span>
                          )}
                          {canDeleteLog ? (
                            <button
                              type="button"
                              onClick={() => handleDeleteLog(l.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="删除此条变更记录"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled
                              className="p-1.5 text-slate-200 cursor-not-allowed opacity-40"
                              title="仅空间管理员可删除公开资料的变更记录，普通成员仅可删本人私密资料记录"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
                })
              )}

              {/* 分页 */}
              {logPagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-1.5 pt-2">
                  <button
                    type="button"
                    disabled={logPagination.page <= 1}
                    onClick={() => loadLogs(logPagination.page - 1, logFilters)}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 font-bold text-[11px] rounded-lg transition-all cursor-pointer active:scale-95"
                  >
                    上一页
                  </button>
                  <span className="text-[11px] font-bold text-slate-600 px-2">
                    {logPagination.page} / {logPagination.totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={logPagination.page >= logPagination.totalPages}
                    onClick={() => loadLogs(logPagination.page + 1, logFilters)}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 font-bold text-[11px] rounded-lg transition-all cursor-pointer active:scale-95"
                  >
                    下一页
                  </button>
                </div>
              )}
            </div>
          )}



        </div>

        {/* 底部 */}
        <div className="flex items-center justify-end px-6 py-3 border-t border-slate-100 bg-slate-50/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1 active:scale-95"
          >
            关闭 <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 危险操作二次确认 */}
        {deleteConfirm && (
          <ConfirmDialog
            isOpen={!!deleteConfirm}
            title={deleteConfirm.mode === "removal" ? "彻底删除已移除资料？" : "删除变更记录？"}
            message={
              deleteConfirm.mode === "removal"
                ? `《${deleteConfirm.title}》的原文件、数据库资料与移除记录将被一并清理，该操作不可恢复。`
                : `将删除 ${deleteConfirm.ids.length} 条变更记录。删除后仅保留“已清理”统计提示，操作详情不再可查。`
            }
            warnings={
              deleteConfirm.mode === "removal"
                ? ["彻底删除不等于资料移除，无法再通过“恢复资料”找回", "系统会保留一条审计日志用于留痕"]
                : ["删除变更记录会影响后续审计追溯，请谨慎操作"]
            }
            type="danger"
            confirmText={deleteConfirm.mode === "removal" ? "确认彻底删除" : "确认删除"}
            cancelText="取消"
            onConfirm={runDeleteConfirm}
            onCancel={closeDeleteConfirm}
          />
        )}
      </div>
    </div>,
    document.body
  )}

      {/* 成员申请恢复弹窗 */}
      {requestTarget &&
        createPortal(
          <div className="fixed inset-0 w-screen h-screen bg-slate-900/70 backdrop-blur-md z-[9999999] flex items-center justify-center p-4 font-sans animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-blue-50/60">
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Undo2 className="w-5 h-5 text-[#3182ce]" /> 申请恢复资料
                </h3>
                <button
                  type="button"
                  onClick={() => setRequestTarget(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-3">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
                  <div className="text-[11px] font-black text-slate-400 mb-1">目标资料</div>
                  <div className="text-sm font-bold text-slate-900 truncate">{requestTarget.titleSnapshot}</div>
                  <div className="text-[11px] text-slate-400 mt-1">移除时间：{fmt(requestTarget.removedAt)}</div>
                </div>

                <div className="p-2.5 bg-amber-50/80 border border-amber-200/70 rounded-xl flex items-start gap-2">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-900 font-medium leading-relaxed">
                    恢复申请将发送给空间管理员/所有者，由其在「变更日志 → 移除记录」中审核处理。
                    仅移除后 <strong>7 日内</strong>可申请，请尽快提交。
                  </div>
                </div>

                <textarea
                  value={requestMsg}
                  onChange={(e) => setRequestMsg(e.target.value)}
                  placeholder="补充说明（选填）：为何需要恢复该资料、资料用途等，便于管理员快速审核"
                  rows={4}
                  className="w-full p-3 text-xs border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] resize-none font-medium text-slate-800 bg-slate-50"
                />
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/60">
                <button
                  type="button"
                  onClick={() => setRequestTarget(null)}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer active:scale-95"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={submitRequest}
                  disabled={requesting}
                  className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white font-black text-xs rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-60"
                >
                  <Send className="w-3.5 h-3.5" /> {requesting ? "提交中..." : "提交申请"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 管理员驳回删除申请弹窗 */}
      {rejectTarget &&
        createPortal(
          <div className="fixed inset-0 w-screen h-screen bg-slate-900/70 backdrop-blur-md z-[9999999] flex items-center justify-center p-4 font-sans animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-red-50/60">
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <X className="w-5 h-5 text-red-600" /> 驳回删除申请
                </h3>
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-3">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
                  <div className="text-[11px] font-black text-slate-400 mb-1">目标资料</div>
                  <div className="text-sm font-bold text-slate-900 truncate">{rejectTarget.titleSnapshot}</div>
                  <div className="text-[11px] text-slate-400 mt-1">申请人：{rejectTarget.requesterName || "空间成员"}</div>
                </div>

                <div className="p-2.5 bg-red-50/80 border border-red-200/70 rounded-xl flex items-start gap-2">
                  <X className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-red-900 font-medium leading-relaxed">
                    驳回后该资料不会被删除、仍保留在空间资料库中。请填写明确的驳回意见，将直接通知申请人。
                  </div>
                </div>

                <textarea
                  value={rejectMsg}
                  onChange={(e) => setRejectMsg(e.target.value)}
                  placeholder="请填写驳回意见（必填）：说明为何不同意删除，便于申请人理解"
                  rows={4}
                  className="w-full p-3 text-xs border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 resize-none font-medium text-slate-800 bg-slate-50"
                />
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/60">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer active:scale-95"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={submitReject}
                  disabled={rejecting}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-black text-xs rounded-xl shadow-md shadow-red-500/20 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-60"
                >
                  <X className="w-3.5 h-3.5" /> {rejecting ? "提交中..." : "确认驳回"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* 发送私密资料处理要求弹窗（只通知上传人，不读取内容） */}
      {privateReviewTarget &&
        createPortal(
          <div className="fixed inset-0 w-screen h-screen bg-slate-900/70 backdrop-blur-md z-[9999999] flex items-center justify-center p-4 font-sans animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-blue-50/60">
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#3182ce]" /> 发送私密资料处理要求
                </h3>
                <button
                  type="button"
                  onClick={() => setPrivateReviewTarget(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-3">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
                  <div className="text-[11px] font-black text-slate-400 mb-1">目标资料（仅元数据）</div>
                  <div className="text-sm font-bold text-slate-900 truncate">{privateReviewTarget.title}</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    上传人：{privateReviewTarget.uploaderName || "空间成员"} · 上传时间：{fmt(privateReviewTarget.createdAt)}
                  </div>
                </div>

                <div className="p-2.5 bg-amber-50/80 border border-amber-200/70 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-900 font-medium leading-relaxed">
                    系统不会向您返回该私密资料的正文、总结或文件预览。要求发送给上传人后，由其自行修改、删除或提交公开审核。
                  </div>
                </div>

                <textarea
                  value={privateReviewMsg}
                  onChange={(e) => setPrivateReviewMsg(e.target.value)}
                  placeholder="请填写处理要求（不少于 5 个字）：如要求自查合规、限期处理、提交公开审核等"
                  rows={4}
                  className="w-full p-3 text-xs border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] resize-none font-medium text-slate-800 bg-slate-50"
                />
              </div>

              <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/60">
                <button
                  type="button"
                  onClick={() => setPrivateReviewTarget(null)}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer active:scale-95"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={submitPrivateReview}
                  disabled={privateReviewing || privateReviewMsg.trim().length < 5}
                  className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white font-black text-xs rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Send className="w-3.5 h-3.5" /> {privateReviewing ? "发送中..." : "发送处理要求"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

    </>
  );
}
