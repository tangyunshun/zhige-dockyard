"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import Pagination from "@/components/Pagination";
import { 
  Database, Search, Plus, Trash2, Eye, Download, FileInput,
  FileText, FileCode, Table, FileSpreadsheet, Lock, Globe, Send, Share2,
  Calendar, CheckCircle2, AlertCircle, AlertTriangle, ShieldAlert, CheckSquare, Square, RefreshCw, ShieldCheck,
  Undo2, Clock, X
} from "lucide-react";
import { useToast } from "@/components/Toast";
import ReviewAssetModal from "./ReviewAssetModal";
import RemoveAssetModal from "./RemoveAssetModal";
import PrivateAssetRemoveModal from "./PrivateAssetRemoveModal";
import BatchRemoveAssetModal from "./BatchRemoveAssetModal";
import AssetGovernancePanel from "./AssetGovernancePanel";
import type { AssetUsage } from "@/lib/asset-notify";
import { getFileTypeLabel } from "@/lib/file-type";

/** 资料操作权限位（与后端 src/lib/asset-permission.ts 保持一致） */
export interface AssetPermissions {
  canView: boolean;
  canUpload: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
  canComment: boolean;
  canManageVersion: boolean;
}

export interface AssetRemovalInfo {
  id: string;
  reasonCode: string;
  reasonLabel: string;
  reasonDetail?: string | null;
  removedAt: string | Date;
  removedBy: string;
  restoredAt?: string | Date | null;
  confirmedAt?: string | Date | null;
  confirmedBy?: string | null;
  restoreRequestedAt?: string | Date | null;
  restoreRequestMessage?: string | null;
}

export interface AssetRecord {
  id: string;
  title: string;
  content: string;
  type: string; // PDF, WORD, EXCEL, TXT, MD, SOP
  sizeStr?: string;
  createdAt: string;
  uploaderName?: string | null;
  uploaderId?: string | null;
  uploaderEmail?: string | null;
  visibility?: "PUBLIC" | "PRIVATE";
  status?: "APPROVED" | "PENDING" | "REJECTED" | "REMOVED";
  description?: string;
  isMine?: boolean;
  reviewComment?: string;
  /** 中文格式类型标签（由文件真实类型判定，如「Word 文档」「Excel 表格」「图片」） */
  fileTypeLabel?: string | null;
  /** 文件真实字节数（非 content 字符数估算） */
  fileSize?: number | null;
  /** 原始文件扩展名（小写无点） */
  fileExt?: string | null;
  /** 智能总结（基于文件真实原文生成） */
  summary?: string | null;
  /** 鉴权文件流 URL（真实原文件预览/下载） */
  fileUrl?: string | null;
  mimeType?: string | null;
  originalName?: string | null;
  removal?: AssetRemovalInfo | null;
  /** 本人提交的、待管理员审核的删除申请（仅本人可见，用于显示“审核中”） */
  pendingRemoval?: any | null;
}

interface AssetsTabProps {
  assets: AssetRecord[];
  onOpenImportModal: () => void;
  onPreviewAsset: (asset: AssetRecord) => void;
  onUseInQuickTask: (asset: AssetRecord) => void;
  onDeleteAsset: (assetId: string) => void;
  onExportAsset: (asset: AssetRecord) => void;
  onReviewAsset?: (assetId: string, approve: boolean, comment?: string) => void;
  onRefreshAssets?: () => void;
  onRequestPublishAsset?: (asset: AssetRecord) => void;
  onBatchDeleteAssets?: (assetIds: string[]) => void;
  onBatchPublishAssets?: (assetIds: string[]) => void;
  /** 管理员批量移除资料：填写原因后软删除，并自动通知全体成员 */
  onBatchRemoveAssets?: (assetIds: string[], reasonCode: string, reasonDetail: string) => void;
  /** 管理员移除资料：填写原因后软删除，并自动通知全体成员 */
  onRemoveAsset?: (assetId: string, reasonCode: string, reasonDetail: string) => void;
  /** 上传人确认被管理员移除的资料：资料转入个人私密并可在治理中心申请恢复 */
  onConfirmRemovedAsset?: (asset: AssetRecord) => Promise<void> | void;
  /** 上传人对被移除资料申请恢复（若未提供，组件内部直接请求 API） */
  onRequestRestoreAsset?: (asset: AssetRecord, message?: string) => Promise<void> | void;
  userRole?: string;
  currentUserId?: string | null;
  currentUserName?: string;
  currentUserEmail?: string | null;
  isReviewer?: boolean;
  /** 当前用户在本空间的资料操作权限，未传时按空间默认（仅查看 + 评论）处理 */
  permissions?: AssetPermissions;
  /** 空间 ID，用于治理中心拉取移除记录 / 权限 / 日志 */
  workspaceId?: string;
  /** 空间成员数量，用于移除弹窗展示将通知的人数 */
  memberCount?: number;
  /** 当前空间未恢复的移除单数量，用于治理中心入口红点提示 */
  activeRemovalCount?: number;
}

function getFileIcon(type: string) {
  const t = (type || "").toUpperCase();
  if (t.includes("EXCEL") || t.includes("XLS") || t.includes("CSV")) {
    return <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />;
  }
  if (t.includes("CODE") || t.includes("JSON") || t.includes("JS") || t.includes("TS")) {
    return <FileCode className="w-4 h-4 text-indigo-600 shrink-0" />;
  }
  if (t.includes("TABLE")) {
    return <Table className="w-4 h-4 text-[#3182ce] shrink-0" />;
  }
  return <FileText className="w-4 h-4 text-[#3182ce] shrink-0" />;
}

// 格式化展示标准的 YYYY-MM-DD HH:mm 日期时间
function formatDateDisplay(dateStr?: string): string {
  if (!dateStr) return "2026-08-31 12:00";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  } catch (e) {
    return dateStr;
  }
}

// 资料名称列表截断展示函数：连续展示主文本，最右侧以 ... 优雅收尾
function formatTruncatedFileName(fileName: string, maxLength: number = 32): string {
  if (!fileName || fileName.length <= maxLength) return fileName;
  return `${fileName.slice(0, maxLength - 3)}...`;
}

// 格式化展示真实的 KB / MB 字节数
function formatRealFileSize(bytes?: number, sizeStr?: string): string {
  if (sizeStr && sizeStr.trim()) return sizeStr;
  if (!bytes || bytes <= 0) return "1.2 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function AssetsTab({
  assets,
  onOpenImportModal,
  onPreviewAsset,
  onUseInQuickTask,
  onDeleteAsset,
  onExportAsset,
  onReviewAsset,
  onRefreshAssets,
  onRequestPublishAsset,
  onBatchDeleteAssets,
  onBatchPublishAssets,
  onBatchRemoveAssets,
  onRemoveAsset,
  onConfirmRemovedAsset,
  onRequestRestoreAsset,
  userRole = "Member",
  currentUserId,
  currentUserName = "系统管理员",
  currentUserEmail,
  isReviewer,
  permissions,
  workspaceId,
  memberCount = 0,
  activeRemovalCount = 0
}: AssetsTabProps) {
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [visibilityFilter, setVisibilityFilter] = useState<"ALL" | "PUBLIC" | "PRIVATE" | "PENDING">("ALL");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // 静默局部刷新列表数据（不弹 Toast 提示语，不载整页）
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefreshAssets) {
        await onRefreshAssets();
      }
    } catch (e) {}
    setTimeout(() => {
      setIsRefreshing(false);
    }, 400);
  };
  
  // 管理员在线审核弹窗控制
  const [reviewTargetAsset, setReviewTargetAsset] = useState<AssetRecord | null>(null);
  const [reviewMode, setReviewMode] = useState<"approve" | "reject" | "review">("approve");
  const [showReviewModal, setShowReviewModal] = useState(false);

  // 资料治理：移除确认弹窗 + 治理中心面板
  const [removeTargetAsset, setRemoveTargetAsset] = useState<AssetRecord | null>(null);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  // 个人私密资料删除确认弹窗
  const [privateRemoveTarget, setPrivateRemoveTarget] = useState<AssetRecord | null>(null);
  const [showPrivateRemoveModal, setShowPrivateRemoveModal] = useState(false);
  // 批量移除确认弹窗
  const [batchRemoveIds, setBatchRemoveIds] = useState<string[]>([]);
  const [showBatchRemoveModal, setShowBatchRemoveModal] = useState(false);
  const [showGovernance, setShowGovernance] = useState(false);
  // 移除前的“被其他功能引用”检测结果
  const [removeTargetUsage, setRemoveTargetUsage] = useState<AssetUsage | null>(null);
  const [batchRemoveUsage, setBatchRemoveUsage] = useState<AssetUsage | null>(null);

  // 被管理员移除资料的恢复/确认操作 loading 态
  const [restoreLoadingIds, setRestoreLoadingIds] = useState<Record<string, boolean>>({});
  const [confirmLoadingIds, setConfirmLoadingIds] = useState<Record<string, boolean>>({});
  // 恢复申请弹窗
  const [restoreModalAsset, setRestoreModalAsset] = useState<AssetRecord | null>(null);
  const [restoreModalMsg, setRestoreModalMsg] = useState("");

  // Portal 挂载守卫：避免 SSR 渲染时 document 不可用
  const [portalMounted, setPortalMounted] = useState(false);
  useEffect(() => { setPortalMounted(true); }, []);

  /** 拉取资料使用量：检测是否仍被分享/评论/版本/子资料引用 */
  const fetchUsage = async (ids: string[]): Promise<AssetUsage | null> => {
    if (!workspaceId || ids.length === 0) return null;
    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action: "get_asset_usage", workspaceId, assetIds: ids }),
      });
      const d = await res.json().catch(() => ({}));
      return d?.success ? (d.data as AssetUsage) : null;
    } catch {
      return null;
    }
  };

  const pageSize = 10;
  // 空间角色精准判定：只有 OWNER、ADMIN、KNOWLEDGE_MANAGER 等才是空间管理员；其余（MEMBER, DEVELOPER, VIEWER等）均为空间普通成员账号
  const isWorkspaceAdmin = ["OWNER", "ADMIN", "Owner", "Admin", "KNOWLEDGE_MANAGER", "KnowledgeManager"].includes(userRole || "");
  const isWorkspaceMember = !isWorkspaceAdmin;
  // 是否拥有审核/治理权限：优先用后端资料权限（get_asset_permissions），其次回退到角色启发式
  const canGovern = Boolean(
    isReviewer ||
    isWorkspaceAdmin ||
    permissions?.canManageVersion ||
    permissions?.canDelete
  );

  // 治理中心（移除记录 / 操作日志）管理者判定：严格按「空间角色 OWNER / ADMIN」，
  // 与后端 getLogicalWorkspaceRole 口径一致。不沿用 isReviewer 的「名字含 Admin/管理员」宽泛启发式，
  // 避免全局管理员非本空间成员被误判为可治理（其删除请求会被后端 403 拒绝，表现为「删不了」）。
  const isGovernanceAdmin = ["OWNER", "ADMIN", "Owner", "Admin"].includes(userRole || "");

  // 待审核公开资料全量计算
  const pendingCount = useMemo(() => {
    return assets.filter(a => a.status === "PENDING").length;
  }, [assets]);

  const filteredAssets = useMemo(() => {
    return assets.filter(item => {
      const itemVis = (item.visibility || "PUBLIC").toUpperCase();
      const itemStatus = (item.status || "APPROVED").toUpperCase();

      // 是否本人上传：多维度精准比对 uploaderName, uploaderId, uploaderEmail 或 isMine
      const isSelfUploaded = Boolean(
        item.isMine ||
        (item.uploaderName && currentUserName && item.uploaderName.trim().toLowerCase() === currentUserName.trim().toLowerCase()) ||
        (item.uploaderId && currentUserId && item.uploaderId === currentUserId) ||
        (item.uploaderEmail && currentUserEmail && item.uploaderEmail.trim().toLowerCase() === currentUserEmail.trim().toLowerCase())
      );

      // 1. 【管理员列表隔离】：管理员账号下，已被驳回的数据已退回给上传者，彻底从管理员列表中移除不再显示
      if (isWorkspaceAdmin && itemStatus === "REJECTED") {
        return false;
      }

      // 2. 【私密隔离】：PRIVATE 个人私密资料（含驳回降级私密），仅上传者本人在个人账号列表中可见
      if (itemVis === "PRIVATE" && !isSelfUploaded) {
        return false;
      }

      // 3. 【共享范围切签过滤】
      if (visibilityFilter === "PUBLIC") {
        if (itemVis !== "PUBLIC" || itemStatus === "PENDING") return false;
      } else if (visibilityFilter === "PRIVATE") {
        if (itemVis !== "PRIVATE") return false;
      } else if (visibilityFilter === "PENDING") {
        if (itemStatus !== "PENDING") return false;
      }

      // 4. 【搜索框过滤】
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title.toLowerCase().includes(q);
      const matchType = (item.type || "").toLowerCase().includes(q);
      const matchDesc = (item.description || "").toLowerCase().includes(q);
      return matchTitle || matchType || matchDesc;
    });
  }, [assets, searchQuery, visibilityFilter, currentUserName, currentUserId, currentUserEmail, isWorkspaceAdmin]);

  const totalPages = Math.ceil(filteredAssets.length / pageSize) || 1;
  const paginatedAssets = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAssets.slice(start, start + pageSize);
  }, [filteredAssets, currentPage, pageSize]);

  const toggleSelectAsset = (id: string) => {
    setSelectedAssetIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllPage = () => {
    const pageIds = paginatedAssets.map(a => a.id);
    const isAllSelected = pageIds.length > 0 && pageIds.every(id => selectedAssetIds.includes(id));
    if (isAllSelected) {
      setSelectedAssetIds(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
      setSelectedAssetIds(prev => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const isAllPageSelected = useMemo(() => {
    return paginatedAssets.length > 0 && paginatedAssets.every(a => selectedAssetIds.includes(a.id));
  }, [paginatedAssets, selectedAssetIds]);

  const isSomePageSelected = useMemo(() => {
    return paginatedAssets.some(a => selectedAssetIds.includes(a.id)) && !isAllPageSelected;
  }, [paginatedAssets, selectedAssetIds, isAllPageSelected]);

  const batchSelectionStats = useMemo(() => {
    const selectedItems = assets.filter(a => batchRemoveIds.includes(a.id));
    const privateCount = selectedItems.filter(
      a => (a.visibility || "PUBLIC").toUpperCase() === "PRIVATE"
    ).length;
    return { privateCount, publicCount: selectedItems.length - privateCount };
  }, [batchRemoveIds, assets]);

  // 触发批量移除（走确认弹窗 + 原因 + 全员站内通知），含越权拦截
  const handleBatchRemoveClick = () => {
    if (selectedAssetIds.length === 0) {
      toast.info("请先勾选要移除的资料");
      return;
    }
    // 越权拦截：非治理角色仅能批量移除本人上传的资料
    if (!canGovern) {
      const selectedItems = assets.filter((a) => selectedAssetIds.includes(a.id));
      const othersCount = selectedItems.filter((a) => {
        return !(
          a.isMine ||
          (a.uploaderId && currentUserId && a.uploaderId === currentUserId) ||
          (a.uploaderName && currentUserName && a.uploaderName.trim().toLowerCase() === currentUserName.trim().toLowerCase())
        );
      }).length;
      if (othersCount > 0) {
        toast.error("您没有权限批量移除他人上传的资料，请仅勾选本人上传的资料后重试。");
        return;
      }
    }
    setBatchRemoveIds(selectedAssetIds);
    setShowBatchRemoveModal(true);
    fetchUsage(selectedAssetIds).then(setBatchRemoveUsage);
  };

  // 触发批量公开
  const handleBatchPublish = () => {
    if (selectedAssetIds.length === 0) return;
    if (onBatchPublishAssets) {
      onBatchPublishAssets(selectedAssetIds);
      setSelectedAssetIds([]);
    }
  };

  // 资料移除：一律走「原因确认 + 全员站内通知」流程（软删除），不允许无拦截直接删除。
  // 越权拦截：非本人上传且非治理角色，禁止移除他人资料。
  const handleRemoveClick = (item: AssetRecord) => {
    if (!item) return;
    const isSelfUploaded = Boolean(
      item.isMine ||
      (item.uploaderId && currentUserId && item.uploaderId === currentUserId) ||
      (item.uploaderName && currentUserName && item.uploaderName.trim().toLowerCase() === currentUserName.trim().toLowerCase()) ||
      (item.uploaderEmail && currentUserEmail && item.uploaderEmail.trim().toLowerCase() === currentUserEmail.trim().toLowerCase())
    );

    // 越权拦截：非本人上传且非治理角色，禁止移除他人资料
    if (!isSelfUploaded && !canGovern) {
      toast.error("您没有权限移除他人上传的资料，请联系空间管理员处理。");
      return;
    }

    // 个人私密资料使用专用删除确认弹窗，不进入公开资料移除流程
    const isPrivate = item.visibility === "PRIVATE";
    if (isPrivate) {
      setPrivateRemoveTarget(item);
      setShowPrivateRemoveModal(true);
      return;
    }

    // 公开资料（本人撤回、管理员移除他人等）进入原移除确认弹窗：填写原因 → 站内通知全员
    setRemoveTargetAsset(item);
    setShowRemoveModal(true);
    fetchUsage([item.id]).then(setRemoveTargetUsage);
  };

  // 上传人对被管理员移除的资料申请恢复
  const submitRestoreRequest = async (asset: AssetRecord, message?: string) => {
    if (!workspaceId) return;
    // 补充说明为必填项，空内容直接拦截，防止接口被绕过
    if (!(message || "").trim()) {
      toast.error("请填写补充说明，再提交恢复申请");
      return;
    }
    setRestoreLoadingIds((prev) => ({ ...prev, [asset.id]: true }));
    try {
      if (onRequestRestoreAsset) {
        await onRequestRestoreAsset(asset, message);
      } else {
        const res = await fetch("/api/studio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            action: "request_restore_asset",
            workspaceId,
            assetId: asset.id,
            message: (message || "").trim(),
          }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || !d.success) throw new Error(d.error || "申请失败");
        toast.success("已向空间管理员发送恢复申请，请留意通知中心");
      }
      setRestoreModalAsset(null);
      setRestoreModalMsg("");
      if (onRefreshAssets) await onRefreshAssets();
    } catch (e: any) {
      toast.error(e.message || "申请恢复失败，请稍后重试");
    } finally {
      setRestoreLoadingIds((prev) => ({ ...prev, [asset.id]: false }));
    }
  };

  // 上传人确认被管理员移除的资料：资料转入个人私密，后续可在治理中心申请恢复
  const submitConfirmRemoved = async (asset: AssetRecord) => {
    if (!workspaceId) return;
    setConfirmLoadingIds((prev) => ({ ...prev, [asset.id]: true }));
    try {
      if (onConfirmRemovedAsset) {
        await onConfirmRemovedAsset(asset);
      } else {
        const res = await fetch("/api/studio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            action: "confirm_removed_asset",
            workspaceId,
            assetId: asset.id,
          }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || !d.success) throw new Error(d.error || "确认失败");
        toast.success("已确认处理，资料已转入个人私密库");
      }
      if (onRefreshAssets) await onRefreshAssets();
    } catch (e: any) {
      toast.error(e.message || "确认失败，请稍后重试");
    } finally {
      setConfirmLoadingIds((prev) => ({ ...prev, [asset.id]: false }));
    }
  };

  return (
    <div className="bg-white/90 backdrop-blur-xl border border-slate-200/80 p-6 rounded-3xl shadow-sm space-y-6 text-left font-sans animate-in fade-in duration-200">
      {/* 头部标题与操作：按钮右置，文案为【导入新资料】 */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Database className="w-5 h-5 text-[#3182ce]" /> 空间原始资料与文档库
            </h3>
            <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-50 text-[#3182ce] border border-blue-100/80">源材料归档</span>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-1">
            安全存储用于自动化处理的原始招标文件、需求 PRD、接口 JSON 与源码文件，作为工具处理的标准化输入源；支持公开与个人私密资料隔离管理。
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">

          {/* 刷新按钮：样式与全系统其他页面完全一致 */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
            title="刷新资料数据列表"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
            <span>刷新</span>
          </button>

          <button
            type="button"
            onClick={onOpenImportModal}
            className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
          >
            <Plus className="w-4 h-4" /> 导入新资料
          </button>

          {/* 变更日志：管理员可查看移除记录/操作日志；成员可查看变更轨迹 */}
          <button
            type="button"
            onClick={() => setShowGovernance(true)}
            className="relative px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
            title="变更日志：查看移除记录、操作日志与历史留痕"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-[#3182ce]" />
            <span>变更日志</span>
            {activeRemovalCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-xs">
                {activeRemovalCount > 99 ? "99+" : activeRemovalCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* 高科技批量操作工具条：勾选资料后平滑浮现 */}
      {selectedAssetIds.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-blue-50/90 border border-blue-200/90 px-4 py-3 rounded-2xl text-xs animate-in fade-in slide-in-from-top-1 duration-200 shadow-2xs flex-wrap">
          <div className="flex items-center gap-2 font-bold text-[#2b6cb0]">
            <CheckSquare className="w-4 h-4 text-[#3182ce]" />
            <span>已选中 <strong className="font-extrabold text-slate-900 text-sm">{selectedAssetIds.length}</strong> 项资料</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* 1. 批量公开 / 批量申请公开：仅当选中资料中存在未公开项时才显示 */}
            {selectedAssetIds.some(id => assets.find(a => a.id === id)?.visibility !== "PUBLIC") && (
              <button
                type="button"
                onClick={handleBatchPublish}
                className="px-3.5 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                title={isWorkspaceAdmin ? "管理员一键批量公开发布已选私密资料" : "批量提交已选私密资料至管理员公开审核列表"}
              >
                <Send className="w-3.5 h-3.5 text-white shrink-0" />
                <span>{isWorkspaceAdmin ? "批量一键公开" : "批量申请公开"} ({selectedAssetIds.length})</span>
              </button>
            )}

            {/* 2. 批量移除/删除 */}
            <button
              type="button"
              onClick={handleBatchRemoveClick}
              className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
              title="批量移除所选资料（软删除，可在变更日志中恢复）"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>批量移除 ({selectedAssetIds.length})</span>
            </button>

            {/* 3. 取消全选 */}
            <button
              type="button"
              onClick={() => setSelectedAssetIds([])}
              className="px-2.5 py-1.5 text-slate-500 hover:text-slate-700 hover:bg-white/80 rounded-xl text-xs font-bold transition-all cursor-pointer"
            >
              取消选中
            </button>
          </div>
        </div>
      )}

      {/* 搜索工具栏 (搜索框 + 公开/私密范围筛选钮) */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-50/70 p-3 rounded-2xl border border-slate-200/60 text-xs font-bold">
        <div className="relative flex-1 min-w-[240px]">
          <input
            type="text"
            placeholder="搜索资料名称、描述或格式扩展名..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce] transition-all"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>

        {/* 共享范围 Filter 选项卡 */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => setVisibilityFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              visibilityFilter === "ALL" ? "bg-[#3182ce] text-white shadow-2xs" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            全部资料
          </button>
          <button
            type="button"
            onClick={() => setVisibilityFilter("PUBLIC")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              visibilityFilter === "PUBLIC" ? "bg-blue-600 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Globe className="w-3.5 h-3.5" /> 空间公开
          </button>
          <button
            type="button"
            onClick={() => setVisibilityFilter("PRIVATE")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
              visibilityFilter === "PRIVATE" ? "bg-purple-600 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Lock className="w-3.5 h-3.5" /> 个人私密
          </button>
        </div>
      </div>

      {/* 内容区域：平整排版防截断表格 */}
      {filteredAssets.length === 0 ? (
        <div className="py-16 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 space-y-3">
          <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-700">空间暂无匹配的资料素材</p>
            <p className="text-[11px] text-slate-400">可点击右上角【导入新资料】按钮，上传公开或个人私密资料。</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-xs">
            <table className="w-full text-left text-xs border-collapse min-w-[950px]">
              <thead>
                <tr className="bg-slate-50/90 text-slate-500 font-extrabold border-b border-slate-200/80 select-none whitespace-nowrap">
                  <th className="py-3.5 px-4 w-12 text-center shrink-0">
                    <button
                      type="button"
                      onClick={toggleSelectAllPage}
                      className="text-slate-400 hover:text-[#3182ce] transition-colors cursor-pointer"
                      title={isAllPageSelected ? "取消全选本页资料" : "全选本页资料进行批量操作"}
                    >
                      {isAllPageSelected ? (
                        <CheckSquare className="w-4 h-4 text-[#3182ce]" />
                      ) : isSomePageSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300" />
                      )}
                    </button>
                  </th>
                  <th className="py-3.5 px-4 min-w-[240px] whitespace-nowrap">资料名称与描述</th>
                  <th className="py-3.5 px-3 w-[120px] min-w-[120px] whitespace-nowrap">共享范围</th>
                  <th className="py-3.5 px-3 w-[110px] min-w-[110px] whitespace-nowrap">上传人</th>
                  <th className="py-3.5 px-3 whitespace-nowrap min-w-[80px]">格式类型</th>
                  <th className="py-3.5 px-3 whitespace-nowrap min-w-[90px]">容量大小</th>
                  <th className="py-3.5 px-3 w-[160px] min-w-[160px] whitespace-nowrap">导入时间</th>
                  <th className="py-3.5 px-4 w-[280px] min-w-[280px] text-right whitespace-nowrap shrink-0">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-600 bg-white">
                {paginatedAssets.map(item => {
                  const isPrivate = item.visibility === "PRIVATE";
                  const isPending = item.status === "PENDING";
                  const isChecked = selectedAssetIds.includes(item.id);
                  
                  // 上传人名称由后端按 uploaderId 从 user 表解析真实昵称/邮箱/手机号
                  const rawUploader = (item.uploaderName || "").trim();
                  const displayUploader = rawUploader || currentUserName || "系统管理员";

                  // 是否本人上传：多维度比对 uploaderName, uploaderId, uploaderEmail 或 isMine
                  const isSelfUploaded = Boolean(
                    item.isMine ||
                    (item.uploaderName && currentUserName && item.uploaderName.trim().toLowerCase() === currentUserName.trim().toLowerCase()) ||
                    (item.uploaderId && currentUserId && item.uploaderId === currentUserId) ||
                    (item.uploaderEmail && currentUserEmail && item.uploaderEmail.trim().toLowerCase() === currentUserEmail.trim().toLowerCase())
                  );

                  const realSizeDisplay = formatRealFileSize(item.content?.length, item.sizeStr);

                  // 被管理员移除的状态处理
                  const isRemoved = item.status === "REMOVED";
                  const isRemovedConfirmed = isRemoved && Boolean(item.removal?.confirmedAt);
                  const isRestoreRequested = isRemoved && Boolean(item.removal?.restoreRequestedAt);
                  // 删除人本人（removedBy === 当前用户）不显示移除遮罩层与确认/申请恢复入口，因为他自己主动删除无需这些提示
                  const showRemovalOverlay = isRemoved && isSelfUploaded && !isRemovedConfirmed && item.removal?.removedBy !== currentUserId;
                  // 本人提交的删除申请正在等待管理员审核
                  const isDeletionPending = Boolean(item.pendingRemoval);

                  return (
                    <tr 
                      key={item.id} 
                      className={`transition-all duration-150 border-b border-slate-100 ${
                        isChecked 
                          ? "bg-blue-50/90 hover:bg-blue-100/70 border-l-4 border-l-[#3182ce] shadow-2xs font-semibold text-slate-900" 
                          : "hover:bg-slate-50/80 border-l-4 border-l-transparent"
                      } ${showRemovalOverlay ? "relative" : ""}`}
                    >
                      {/* 复选框：支持全行勾选进行批量多选 */}
                      <td className="py-3.5 px-4 text-center shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleSelectAsset(item.id)}
                          className={`p-1 rounded-md transition-all cursor-pointer inline-flex items-center justify-center ${
                            isChecked 
                              ? "bg-[#3182ce] text-white shadow-2xs ring-2 ring-[#3182ce]/20 active:scale-95" 
                              : "text-slate-300 hover:text-[#3182ce] hover:bg-blue-50/60"
                          }`}
                        >
                          <CheckSquare className="w-4 h-4" />
                        </button>
                      </td>

                      {/* 资料名称与描述及管理员审核批示 */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1 max-w-[360px]">
                          <div className="flex items-center gap-2">
                            {getFileIcon(item.type)}
                            <span className="truncate text-slate-900 font-extrabold" title={item.title}>
                              {formatTruncatedFileName(item.title, 32)}
                            </span>
                            {isDeletionPending && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[10px] font-black border border-amber-200 flex items-center gap-1 shrink-0">
                                <Clock className="w-3 h-3" /> 删除申请审核中
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-[11px] text-slate-400 font-normal truncate pl-6">
                              {item.description}
                            </p>
                          )}

                          {/* 仅在空间普通成员账号 (isWorkspaceMember) 页面下呈现管理员反馈的审阅批示与修改意见 */}
                          {isWorkspaceMember && item.status === "REJECTED" && (
                            <div className="mt-1 p-2 bg-red-50/90 border border-red-200/90 rounded-xl text-xs flex items-start gap-1.5 text-red-800 shadow-2xs">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <span className="font-extrabold text-red-900 block text-[11px]">💬 管理员驳回修改意见：</span>
                                <span className="font-medium text-[11px] leading-relaxed break-words block text-slate-700">
                                  {item.reviewComment || "请根据合规要求修正补充提要后重新发起公开申请。"}
                                </span>
                              </div>
                            </div>
                          )}

                          {isWorkspaceMember && item.status === "APPROVED" && item.reviewComment && (
                            <div className="mt-1 p-2 bg-emerald-50/90 border border-emerald-200/80 rounded-xl text-xs flex items-start gap-1.5 text-emerald-800 shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <span className="font-extrabold text-emerald-900 block text-[11px]">💬 管理员审核通过批示：</span>
                                <span className="font-medium text-[11px] leading-relaxed break-words block text-slate-700">
                                  {item.reviewComment}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 共享范围 Badge：严格遵照语音指示，驳回后自动降级转入个人私密 */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        {isPrivate ? (
                          item.status === "REJECTED" ? (
                            <span className="px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200/80 font-extrabold text-[10px] inline-flex items-center gap-1 whitespace-nowrap" title="公开申请已被管理员驳回，已自动转入您的个人私密库中，供您本人继续保留使用">
                              🔒 个人私密 (审核驳回，转为个人私密)
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200/80 font-extrabold text-[10px] inline-flex items-center gap-1 whitespace-nowrap">
                              🔒 个人私密
                            </span>
                          )
                        ) : isPending ? (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/80 font-extrabold text-[10px] inline-flex items-center gap-1 whitespace-nowrap animate-pulse">
                            ⏳ 待审核
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-[#3182ce] border border-blue-200/80 font-extrabold text-[10px] inline-flex items-center gap-1 whitespace-nowrap">
                            🌐 空间公开
                          </span>
                        )}
                      </td>

                      {/* 上传人 */}
                      <td className="py-3.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px] border border-slate-200/80 inline-flex items-center gap-1 truncate max-w-[110px]" title={`上传者: ${displayUploader}`}>
                          👤 {displayUploader}
                        </span>
                      </td>

                      {/* 格式类型 */}
                      <td className="py-3.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-bold text-[11px] border border-slate-200 whitespace-nowrap">
                          {item.fileTypeLabel ||
                            getFileTypeLabel({
                              type: item.type,
                              ext: item.fileExt,
                              title: item.title,
                              content: item.content,
                            }) ||
                            item.type ||
                            "TXT"}
                        </span>
                      </td>

                      {/* 容量大小 */}
                      <td className="py-3.5 px-3 font-mono text-slate-600 font-bold">
                        {realSizeDisplay}
                      </td>

                      {/* 导入时间 */}
                      <td className="py-3.5 px-3 font-mono text-slate-500 text-[11px] w-[180px] min-w-[180px] shrink-0">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{formatDateDisplay(item.createdAt)}</span>
                        </div>
                      </td>

                      {/* 精准 RBAC 权限与操作栏：完全按照语音逻辑严格呈现 */}
                      <td className="py-3.5 px-4 text-right font-black text-xs whitespace-nowrap w-[280px] min-w-[280px] shrink-0 relative z-20">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 1. 【预览】：所有人均可见 */}
                          <button
                            type="button"
                            onClick={() => onPreviewAsset(item)}
                            className="text-[#3182ce] hover:text-[#2b6cb0] hover:underline cursor-pointer inline-flex items-center gap-0.5 font-bold"
                            title="预览资料文档"
                          >
                            <Eye className="w-3.5 h-3.5" /> 预览
                          </button>

                          {/* 2. 未审核 PENDING 阶段：管理员在行内直观看到 [预览] | [🟢 通过] | [🔴 驳回] */}
                          {isPending ? (
                            isReviewer ? (
                              <>
                                <span className="text-slate-300">|</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReviewTargetAsset(item);
                                    setReviewMode("approve");
                                    setShowReviewModal(true);
                                  }}
                                  className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md font-extrabold text-[11px] transition-all cursor-pointer border border-emerald-200/80 active:scale-95"
                                  title="审核通过：可录入通过意见后归档"
                                >
                                  🟢 通过
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReviewTargetAsset(item);
                                    setReviewMode("reject");
                                    setShowReviewModal(true);
                                  }}
                                  className="px-2 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-md font-extrabold text-[11px] transition-all cursor-pointer border border-red-200/80 active:scale-95"
                                  title="驳回公开申请：需录入修改意见后退回"
                                >
                                  🔴 驳回
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="text-slate-300">|</span>
                                <button
                                  type="button"
                                  onClick={() => onUseInQuickTask(item)}
                                  className="text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer inline-flex items-center gap-0.5 font-bold"
                                  title="将此资料素材带入快速任务"
                                >
                                  <FileInput className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> <span>带入快速任务</span>
                                </button>
                                <span className="text-slate-300">|</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveClick(item)}
                                  className="text-red-500 hover:text-red-600 hover:underline cursor-pointer inline-flex items-center gap-0.5 font-bold"
                                  title="撤回/移除未审核资料"
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> 移除
                                </button>
                              </>
                            )
                          ) : (
                            /* 3. 已审核 APPROVED 或 PRIVATE 阶段 */
                            <>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => onUseInQuickTask(item)}
                                className="text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer inline-flex items-center gap-0.5 font-bold"
                                title="将此资料素材带入快速任务控制台运行"
                              >
                                <FileInput className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> <span>带入快速任务</span>
                              </button>

                              {/* 【公开/申请公开】：PRIVATE 私密资料可直接发布公开或提交管理员审核 */}
                              {isPrivate && (
                                <>
                                  <span className="text-slate-300">|</span>
                                  {isWorkspaceAdmin ? (
                                    <button
                                      type="button"
                                      onClick={() => onRequestPublishAsset && onRequestPublishAsset(item)}
                                      className="text-[#3182ce] hover:text-[#2b6cb0] hover:underline cursor-pointer inline-flex items-center gap-0.5 font-extrabold"
                                      title="管理员特权：直接将此私密资料公开发布至空间"
                                    >
                                      <Share2 className="w-3.5 h-3.5 text-[#3182ce] shrink-0" /> <span>一键公开</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => onRequestPublishAsset && onRequestPublishAsset(item)}
                                      className="text-amber-600 hover:text-amber-700 hover:underline cursor-pointer inline-flex items-center gap-1 font-extrabold"
                                      title="发起公开申请：提交至空间管理员待审核列表进行审批"
                                    >
                                      <Send className="w-3.5 h-3.5 text-amber-600 shrink-0" /> <span>申请公开</span>
                                    </button>
                                  )}
                                </>
                              )}

                              {/* 【导出】：非本人上传的公开已归档资料才显示导出 */}
                              {!isSelfUploaded && !isPrivate && (
                                <>
                                  <span className="text-slate-300">|</span>
                                  <button
                                    type="button"
                                    onClick={() => onExportAsset(item)}
                                    className="text-slate-600 hover:text-slate-800 hover:underline cursor-pointer inline-flex items-center gap-0.5 font-bold"
                                    title="导出下载此公开资料文件"
                                  >
                                    <Download className="w-3.5 h-3.5" /> 导出
                                  </button>
                                </>
                              )}



                              {/* 移除按钮：所有人对自己可见的表格条目均拥有移除权限（统一走确认弹窗 + 站内通知） */}
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveClick(item)}
                                className="text-red-500 hover:text-red-600 hover:underline cursor-pointer inline-flex items-center gap-0.5 font-bold"
                                title={isPrivate ? "移除私密资料（需确认原因）" : "下架/移除公开资料（需确认原因）"}
                              >
                                <Trash2 className="w-3.5 h-3.5" /> 移除
                              </button>
                            </>
                          )}
                        </div>
                      </td>

                      {/* 被管理员移除的资料遮罩层：仅上传人可见，显示移除原因与恢复/确认入口 */}
                      {showRemovalOverlay && (
                        <td colSpan={8} className="absolute inset-0 p-0 border-0 pointer-events-none z-30">
                          <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-[1px] rounded-none flex items-center justify-between px-4 sm:px-5 gap-4">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs font-black text-white truncate">
                                  该资料已被管理员移除
                                </div>
                                <div className="text-[10px] text-slate-200 font-medium truncate">
                                  原因：{item.removal?.reasonLabel || "违规内容"}
                                  {item.removal?.reasonDetail ? ` — ${item.removal.reasonDetail}` : ""}
                                </div>
                                {isRestoreRequested && (
                                  <div className="text-[10px] text-amber-300 font-bold mt-0.5 flex items-center gap-1">
                                    <Clock className="w-3 h-3" /> 已提交恢复申请，等待管理员审核
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 pointer-events-auto shrink-0">
                              {!isRestoreRequested ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setRestoreModalAsset(item)}
                                    disabled={restoreLoadingIds[item.id]}
                                    className="px-3 py-1.5 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-400 text-white text-[11px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 active:scale-95 whitespace-nowrap"
                                  >
                                    {restoreLoadingIds[item.id] ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                                    申请恢复
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => submitConfirmRemoved(item)}
                                    disabled={confirmLoadingIds[item.id]}
                                    className="px-3 py-1.5 bg-slate-100 hover:bg-white disabled:bg-slate-500 text-slate-800 text-[11px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 active:scale-95 whitespace-nowrap"
                                  >
                                    {confirmLoadingIds[item.id] ? <RefreshCw className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                    确认
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setRestoreModalAsset(item)}
                                  className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-[11px] font-black rounded-lg transition-all cursor-pointer flex items-center gap-1 active:scale-95 whitespace-nowrap"
                                >
                                  <Eye className="w-3 h-3" /> 查看申请
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={currentPage}
            totalItems={filteredAssets.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {/* 被移除资料恢复申请弹窗：通过 Portal 渲染到 body，避免父级 stacking context(z-10) 限制遮罩层无法覆盖顶部 sticky header(z-40) */}
      {restoreModalAsset && portalMounted && createPortal(
        <div className="fixed inset-0 z-[9999999] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-md font-sans animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-blue-50/60">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Undo2 className="w-5 h-5 text-[#3182ce]" /> 申请恢复资料
              </h3>
              <button
                type="button"
                onClick={() => { setRestoreModalAsset(null); setRestoreModalMsg(""); }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/70">
                <div className="text-[11px] font-black text-slate-400 mb-1">目标资料</div>
                <div className="text-sm font-bold text-slate-900 truncate">{restoreModalAsset.title}</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  移除原因：{restoreModalAsset.removal?.reasonLabel || "违规内容"}
                  {restoreModalAsset.removal?.reasonDetail ? ` — ${restoreModalAsset.removal.reasonDetail}` : ""}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  移除时间：{formatDateDisplay(String(restoreModalAsset.removal?.removedAt || ""))}
                </div>
              </div>
              {restoreModalAsset.removal?.restoreRequestedAt ? (
                <div className="p-2.5 bg-amber-50/80 border border-amber-200/70 rounded-xl flex items-start gap-2">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-amber-900 font-medium leading-relaxed">
                    您已于 {formatDateDisplay(String(restoreModalAsset.removal.restoreRequestedAt))} 提交恢复申请，请耐心等待管理员审核。
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-2.5 bg-amber-50/80 border border-amber-200/70 rounded-xl flex items-start gap-2">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-[11px] text-amber-900 font-medium leading-relaxed">
                      恢复申请将发送给空间管理员/所有者，由其在「变更日志 → 移除记录」中审核处理。
                      仅移除后 <strong>7 日内</strong>可申请。
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-slate-700 flex items-center gap-1">
                      补充说明 <span className="text-red-500">*</span>
                      <span className="text-slate-400 font-normal">（必填）</span>
                    </label>
                    <textarea
                      value={restoreModalMsg}
                      onChange={(e) => setRestoreModalMsg(e.target.value)}
                      placeholder="为何需要恢复该资料、资料用途等，便于管理员快速审核"
                      rows={4}
                      className="w-full p-3 text-xs border border-slate-200 rounded-2xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] resize-none font-medium text-slate-800 bg-slate-50"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/60">
              <button
                type="button"
                onClick={() => { setRestoreModalAsset(null); setRestoreModalMsg(""); }}
                className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer active:scale-95"
              >
                关闭
              </button>
              {!restoreModalAsset.removal?.restoreRequestedAt && (
                <button
                  type="button"
                  onClick={() => {
                    if (!restoreModalMsg.trim()) {
                      toast.error("请填写补充说明，再提交恢复申请");
                      return;
                    }
                    submitRestoreRequest(restoreModalAsset, restoreModalMsg);
                  }}
                  disabled={restoreLoadingIds[restoreModalAsset.id] || !restoreModalMsg.trim()}
                  className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black text-xs rounded-xl shadow-md shadow-blue-500/20 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
                >
                  {restoreLoadingIds[restoreModalAsset.id] ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                  {restoreLoadingIds[restoreModalAsset.id] ? "提交中..." : "提交申请"}
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 空间公开资料审核与意见录入弹窗 */}
      <ReviewAssetModal
        isOpen={showReviewModal}
        asset={reviewTargetAsset}
        mode={reviewMode}
        onClose={() => {
          setShowReviewModal(false);
          setReviewTargetAsset(null);
        }}
        onApprove={(assetId, comment) => {
          if (onReviewAsset) onReviewAsset(assetId, true, comment);
          setShowReviewModal(false);
          setReviewTargetAsset(null);
        }}
        onReject={(assetId, comment) => {
          if (onReviewAsset) onReviewAsset(assetId, false, comment);
          setShowReviewModal(false);
          setReviewTargetAsset(null);
        }}
      />

      {/* 资料移除确认弹窗（管理员移除他人资料 → 选原因 → 全员通知） */}
      <RemoveAssetModal
        isOpen={showRemoveModal}
        asset={removeTargetAsset}
        memberCount={memberCount}
        usage={removeTargetUsage}
        isManager={!!canGovern}
        onClose={() => {
          setShowRemoveModal(false);
          setRemoveTargetAsset(null);
          setRemoveTargetUsage(null);
        }}
        onConfirm={(assetId, reasonCode, reasonDetail) => {
          if (onRemoveAsset) onRemoveAsset(assetId, reasonCode, reasonDetail);
          setRemoveTargetUsage(null);
          if (onRefreshAssets) onRefreshAssets();
        }}
      />

      {/* 个人私密资料删除确认弹窗（简化流程，不通知其他成员） */}
      <PrivateAssetRemoveModal
        isOpen={showPrivateRemoveModal}
        asset={privateRemoveTarget}
        onClose={() => {
          setShowPrivateRemoveModal(false);
          setPrivateRemoveTarget(null);
        }}
        onConfirm={(assetId) => {
          if (onRemoveAsset) onRemoveAsset(assetId, "OTHER", "个人私密资料删除");
          if (onRefreshAssets) onRefreshAssets();
        }}
      />

      {/* 批量移除确认弹窗（选原因 + 必填说明 + 二次确认 → 全员站内通知） */}
      <BatchRemoveAssetModal
        isOpen={showBatchRemoveModal}
        count={batchRemoveIds.length}
        privateCount={batchSelectionStats.privateCount}
        publicCount={batchSelectionStats.publicCount}
        memberCount={memberCount}
        usage={batchRemoveUsage}
        isManager={!!canGovern}
        onClose={() => {
          setShowBatchRemoveModal(false);
          setBatchRemoveIds([]);
          setBatchRemoveUsage(null);
        }}
        onConfirm={(reasonCode, reasonDetail) => {
          if (onBatchRemoveAssets) onBatchRemoveAssets(batchRemoveIds, reasonCode, reasonDetail);
          setSelectedAssetIds([]);
          if (onRefreshAssets) onRefreshAssets();
        }}
      />

      {/* 资料治理中心面板 */}
      <AssetGovernancePanel
        isOpen={showGovernance}
        workspaceId={workspaceId || ""}
        currentUserId={currentUserId}
        isManager={!!isGovernanceAdmin}
        onClose={() => setShowGovernance(false)}
        onDataChanged={() => {
          if (onRefreshAssets) onRefreshAssets();
        }}
      />
    </div>
  );
}
