"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import Pagination from "@/components/Pagination";
import {
  FileText, Search, ShieldCheck, RefreshCw, Boxes, Cpu, BookOpen, UploadCloud,
  Users, Settings2, LogOut, UserPlus, UserMinus, Zap, Network, AlertTriangle, Calendar, Clock, Filter, ChevronDown, CheckSquare, Square, Trash2, CheckCircle2, ShieldAlert
} from "lucide-react";
import { useAppContext } from "@/contexts/AppContext";
import { useToast } from "@/components/Toast";
import { getAuthToken } from "@/utils/auth";

export interface OperationLogItem {
  id: string;
  userId: string;
  workspaceId?: string | null;
  action: string;
  resource?: string | null;
  details?: any;
  ipAddress?: string | null;
  createdAt?: string;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
    avatar?: string | null;
    role?: string | null;
  } | null;
}

interface LogsTabProps {
  logs: OperationLogItem[];
  workspaceId?: string;
  isWorkspaceAdmin?: boolean;
}

// 操作动作 → 展示元数据（中文标签 / 分类 / 主题色 / 图标）
const ACTION_META: Record<string, { label: string; category: string; color: string; icon: any }> = {
  "component:execute": { label: "组件任务执行", category: "任务执行", color: "blue", icon: Cpu },
  "component:bind": { label: "效能组件装配", category: "组件装配", color: "indigo", icon: Boxes },
  "component:unbind": { label: "效能组件解绑", category: "组件装配", color: "indigo", icon: Boxes },
  "component:toggle-active": { label: "组件启用/停用", category: "组件装配", color: "indigo", icon: Boxes },
  "component:set-restricted": { label: "岗位权限矩阵配置", category: "组件装配", color: "indigo", icon: ShieldCheck },
  "component:save-positions": { label: "岗位授权配置", category: "组件装配", color: "indigo", icon: Settings2 },
  "SAVE_CUSTOM_POSITIONS": { label: "岗位矩阵配置", category: "组件装配", color: "indigo", icon: ShieldCheck },
  "SAVE_POSITIONS": { label: "岗位授权配置", category: "组件装配", color: "indigo", icon: Settings2 },
  "task:archive": { label: "任务归档", category: "任务执行", color: "blue", icon: Zap },
  "task:delete": { label: "任务删除", category: "任务执行", color: "blue", icon: Zap },
  "KNOWLEDGE_PUBLISH": { label: "知识沉淀发布", category: "知识沉淀", color: "emerald", icon: BookOpen },
  "KNOWLEDGE_SUBMIT": { label: "知识提交审核", category: "知识沉淀", color: "emerald", icon: BookOpen },
  "KNOWLEDGE_APPROVE": { label: "知识审核通过", category: "知识沉淀", color: "emerald", icon: BookOpen },
  "KNOWLEDGE_REJECT": { label: "知识审核驳回", category: "知识沉淀", color: "emerald", icon: BookOpen },
  "asset:upload": { label: "资料文档上传", category: "资料管理", color: "cyan", icon: UploadCloud },
  "asset:remove_private": { label: "私密资料移除", category: "资料管理", color: "cyan", icon: UploadCloud },
  "asset:remove": { label: "公开资料移除", category: "资料管理", color: "cyan", icon: UploadCloud },
  "asset:approve": { label: "公开申请通过", category: "资料管理", color: "cyan", icon: UploadCloud },
  "asset:reject": { label: "公开申请驳回", category: "资料管理", color: "cyan", icon: UploadCloud },
  "asset:removal_request": { label: "资料删除申请", category: "资料管理", color: "cyan", icon: UploadCloud },
  "asset:removal_approve": { label: "删除申请通过", category: "资料管理", color: "cyan", icon: UploadCloud },
  "asset:removal_reject": { label: "删除申请驳回", category: "资料管理", color: "cyan", icon: UploadCloud },
  "asset:restore": { label: "资料恢复归档", category: "资料管理", color: "cyan", icon: UploadCloud },
  "asset:restore_request": { label: "资料恢复申请", category: "资料管理", color: "cyan", icon: UploadCloud },
  "asset:request_publish": { label: "资料申请公开", category: "资料管理", color: "cyan", icon: UploadCloud },
  "asset:publish_direct": { label: "资料直接公开", category: "资料管理", color: "cyan", icon: UploadCloud },
  "asset:batch_delete": { label: "资料批量删除", category: "资料管理", color: "cyan", icon: UploadCloud },
  "asset:batch_remove": { label: "资料批量移除", category: "资料管理", color: "cyan", icon: UploadCloud },
  "asset:batch_publish_direct": { label: "资料批量公开", category: "资料管理", color: "cyan", icon: UploadCloud },
  "asset:batch_request_publish": { label: "资料批量申请公开", category: "资料管理", color: "cyan", icon: UploadCloud },
  "asset:removal_record_delete": { label: "资料彻底删除", category: "资料管理", color: "cyan", icon: UploadCloud },
  "asset:private_review_request": { label: "私密资料治理要求", category: "资料管理", color: "cyan", icon: UploadCloud },
  "workspace:update": { label: "空间配置变更", category: "成员与配置", color: "violet", icon: Settings2 },
  "UPDATE_MEMBER_ROLE": { label: "成员角色变更", category: "成员与配置", color: "violet", icon: Users },
  "WORKSPACE_KICK": { label: "成员移出空间", category: "成员与配置", color: "violet", icon: UserMinus },
  "JOIN_WORKSPACE": { label: "成员加入空间", category: "成员与配置", color: "violet", icon: UserPlus },
  "member:leave": { label: "成员退出空间", category: "成员与配置", color: "violet", icon: LogOut },
};

const CATEGORY_COLOR: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cyan: "bg-cyan-50 text-cyan-700 border-cyan-200",
  violet: "bg-violet-50 text-violet-700 border-violet-200",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};

const CATEGORY_LIST = ["组件装配", "任务执行", "知识沉淀", "资料管理", "成员与配置", "其他"];

function resolveMeta(action: string) {
  return ACTION_META[action] || { label: action, category: "其他", color: "slate", icon: Network };
}

// 精准格式化具体时间（格式：YYYY-MM-DD HH:mm:ss，严禁出现“近期”）
function formatTime(raw?: string): string {
  if (!raw) {
    const dt = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
  }
  try {
    const dt = new Date(raw);
    if (isNaN(dt.getTime())) return raw;
    const p = (n: number) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
  } catch {
    return raw;
  }
}

function actorName(log: OperationLogItem): string {
  if (log.user?.name) return log.user.name;
  if (log.user?.email) return log.user.email!;
  return "空间成员";
}

export default function LogsTab({ logs, workspaceId, isWorkspaceAdmin = false }: LogsTabProps) {
  const toast = useToast();
  const { componentCatalog } = useAppContext();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // 本地日志列表状态（删除操作后即时本地响应）
  const [localLogs, setLocalLogs] = useState<OperationLogItem[]>(logs);
  useEffect(() => {
    setLocalLogs(logs);
  }, [logs]);

  // 复选框多选状态
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 模态确认框
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: "single" | "batch" | "purge_expired";
    targetLogId?: string;
    targetCount?: number;
    title: string;
    message: string;
  }>({
    isOpen: false,
    type: "single",
    title: "",
    message: ""
  });

  const [searchQuery, setSearchQuery] = useState("");
  
  // 多选分类下拉组件控制
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 时间范围筛选（预置快捷天数 OR 自定义日期范围）
  const [dateMode, setDateMode] = useState<"preset" | "custom">("preset");
  const [presetDays, setPresetDays] = useState<number>(0); // 0 为全部，7为7天，30为30天
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // 组件 ID → 中文名称映射表
  const componentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (componentCatalog || []).forEach((c: any) => {
      if (c && c.id) {
        map.set(String(c.id).toUpperCase(), c.name || c.id);
      }
    });
    return map;
  }, [componentCatalog]);

  // 监听点击外部自动关闭多选下拉
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowCategoryDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 智能格式化类型名称（避免在日志文本中裸露 (CODE) / (IMAGE) / (DOCUMENT) 等英文枚举代码）
  const formatTypeLabel = (rawType?: string): string => {
    if (!rawType) return "资料文档";
    const t = String(rawType).toUpperCase();
    if (t === "CODE" || t === "PYTHON" || t === "JS" || t === "TS" || t === "PY") return "代码文件";
    if (t === "IMAGE" || t === "PNG" || t === "JPG" || t === "JPEG") return "图片素材";
    if (t === "SPREADSHEET" || t === "XLSX" || t === "XLS" || t === "EXCEL") return "Excel 表格";
    if (t === "DOCUMENT" || t === "DOCX" || t === "DOC" || t === "WORD") return "Word 文档";
    if (t === "PDF") return "PDF 电子书/文档";
    if (t === "TXT" || t === "TEXT" || t === "MD") return "文本文档";
    return `${rawType} 格式`;
  };

  // 智能角色/岗位 label 转换（避免将 BACKEND_ENGINEER / ADMIN 等暴露在日志中）
  const formatRoleLabel = (rawRole?: string): string => {
    if (!rawRole) return "普通岗位";
    const r = String(rawRole).trim().toUpperCase();
    const ROLE_MAP: Record<string, string> = {
      OWNER: "空间所有者",
      ADMIN: "空间管理员",
      MEMBER: "普通成员",
      BACKEND_ENGINEER: "后端工程师",
      FRONTEND_ENGINEER: "前端工程师",
      PRODUCT_MANAGER: "产品经理",
      TEST_ENGINEER: "测试工程师",
      DEVOPS_ENGINEER: "运维工程师",
      DATA_ENGINEER: "数据工程师",
      DESIGNER: "UI/UX 设计师",
      ARCHITECT: "系统架构师",
    };
    return ROLE_MAP[r] || rawRole;
  };

  // 智能解析用户展示名称（避免直接向用户裸露长串随机用户 ID 标识符如 cmtee69...）
  const formatTargetUser = (idOrName?: string, dObj?: any): string => {
    if (dObj && (dObj.targetName || dObj.userName || dObj.targetEmail || dObj.userEmail)) {
      return dObj.targetName || dObj.userName || dObj.targetEmail || dObj.userEmail;
    }
    if (!idOrName) return "相关成员";
    // 若匹配标准 ID 标识符（如以 cm/usr/cl 开头且较长）
    if (/^[a-z0-9]{12,}$/i.test(idOrName) || idOrName.startsWith("cm") || idOrName.startsWith("usr")) {
      return "对应成员";
    }
    return idOrName;
  };

  // 依据 action + details 智能生成完整且专业的人类可读中文摘要
  const summarizeDetails = (action: string, details: any): string => {
    if (!details || typeof details !== "object") return "执行通用空间协同操作";
    const d = details as any;
    const compId = d.componentId ? String(d.componentId).trim().toUpperCase() : "";
    const compName = compId ? (componentNameMap.get(compId) || `组件 ${compId}`) : "";

    switch (action) {
      case "component:execute":
        return `成功运行【${compName || compId || "自动化组件"}】· 扣减 ${d.tokens ?? 100} 算力点`;
      case "component:bind":
        return `已在当前工作空间装配新组件【${compName || compId}】`;
      case "component:unbind":
        return `移除卸载组件【${compName || compId}】`;
      case "component:toggle-active":
        return `调整组件【${compName || compId}】启用运行状态`;
      case "asset:upload": {
        const typeStr = formatTypeLabel(d.type);
        return `成功导入${typeStr}《${d.title || "未命名文档"}》`;
      }
      case "asset:remove_private":
        return d.title ? `移除个人私密资料《${d.title}》` : "移除个人私密资料";
      case "asset:remove":
        return d.title ? `移除空间公开资料《${d.title}》` : "移除空间公开资料";
      case "asset:approve":
        return d.title ? `审核通过公开申请《${d.title}》` : "审核通过公开申请";
      case "asset:reject":
        return d.title ? `审核驳回公开申请《${d.title}》` : "审核驳回公开申请";
      case "asset:removal_request":
        return d.title ? `提交删除申请《${d.title}》` : "提交资料删除申请";
      case "asset:removal_approve":
        return d.title ? `管理员同意删除申请并移除《${d.title}》` : "管理员同意删除申请";
      case "asset:removal_reject":
        return d.title ? `驳回删除申请《${d.title}》${d.rejectReason ? `：${d.rejectReason}` : ""}` : "驳回资料删除申请";
      case "asset:restore":
        return d.title ? `恢复已被移除资料《${d.title}》` : "恢复已被移除资料";
      case "asset:request_publish":
        return d.title ? `提交公开申请《${d.title}》` : "提交公开申请";
      case "asset:publish_direct":
        return d.title ? `直接公开发布资料《${d.title}》` : "直接公开发布资料";
      case "asset:batch_remove":
        return `批量移除 ${d.count || 0} 项资料`;
      case "asset:batch_delete":
        return `批量彻底删除 ${d.count || 0} 项资料`;
      case "asset:private_review_request":
        return d.title ? `向《${d.title}》上传人发送私密资料处理要求` : "发送私密资料处理要求";
      case "asset:removal_record_delete":
        return d.title ? `彻底删除已移除资料《${d.title}》，审计留痕保留` : "彻底删除已移除资料";
      case "JOIN_WORKSPACE":
        return d.memberName ? `成员【${d.memberName}】受邀加入工作空间` : "新成员受邀加入工作空间";
      case "WORKSPACE_KICK":
        return `管理人员发起成员移除操作`;
      case "SAVE_CUSTOM_POSITIONS":
      case "SAVE_POSITIONS":
      case "component:save-positions":
        return "更新并保存空间岗位授权配置矩阵";
      case "UPDATE_MEMBER_ROLE": {
        const userLabel = d.targetUserName || formatTargetUser(d.targetUserId, d);
        const roleLabel = d.newRoleName || d.roleName || formatRoleLabel(d.newRole || d.role);
        return `更新成员岗位权限：${userLabel} →【${roleLabel}】`;
      }
      case "member:leave":
        return `成员退出团队工作空间`;
      case "KNOWLEDGE_PUBLISH":
      case "KNOWLEDGE_SUBMIT":
      case "KNOWLEDGE_APPROVE":
      case "KNOWLEDGE_REJECT":
        return d.title ? `沉淀与归档团队知识《${d.title}》` : "沉淀知识库规约项";
      default:
        return d.message || "完成空间协同事务";
    }
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
    setCurrentPage(1);
  };

  const filtered = useMemo(() => {
    const now = Date.now();
    const q = searchQuery.trim().toLowerCase();

    return localLogs.filter((log) => {
      const meta = resolveMeta(log.action);
      
      // 1. 模块分类多选过滤
      if (selectedCategories.length > 0 && !selectedCategories.includes(meta.category)) {
        return false;
      }

      // 2. 时间维度筛选
      if (log.createdAt) {
        const logTime = new Date(log.createdAt).getTime();
        if (!isNaN(logTime)) {
          if (dateMode === "preset" && presetDays > 0) {
            const limitMs = presetDays * 24 * 60 * 60 * 1000;
            if (now - logTime > limitMs) return false;
          } else if (dateMode === "custom") {
            if (startDate) {
              const startMs = new Date(`${startDate}T00:00:00`).getTime();
              if (!isNaN(startMs) && logTime < startMs) return false;
            }
            if (endDate) {
              const endMs = new Date(`${endDate}T23:59:59`).getTime();
              if (!isNaN(endMs) && logTime > endMs) return false;
            }
          }
        }
      }

      // 3. 全局模糊文本关键字搜索
      if (q) {
        const hay = `${actorName(log)} ${log.action} ${meta.label} ${meta.category} ${summarizeDetails(log.action, log.details)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [localLogs, searchQuery, selectedCategories, dateMode, presetDays, startDate, endDate]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, safePage, pageSize]);

  // 全选/取消全选处理（仅针对当前已筛选列）
  const allCurrentIds = useMemo(() => filtered.map((l) => l.id), [filtered]);
  const isAllSelected = allCurrentIds.length > 0 && allCurrentIds.every((id) => selectedIds.includes(id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds((prev) => prev.filter((id) => !allCurrentIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...allCurrentIds])));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // 后端提交删除请求处理
  const executeDeleteLogs = async (actionType: "single" | "batch" | "purge_expired", logId?: string) => {
    if (!workspaceId) {
      toast.error("错误：缺失 workspaceId 参数，无法操作");
      return;
    }
    setIsSubmitting(true);
    try {
      let body: any = { workspaceId };
      if (actionType === "single" && logId) {
        body.action = "delete_operation_log";
        body.logId = logId;
      } else if (actionType === "batch") {
        body.action = "delete_operation_log";
        body.logIds = selectedIds;
      } else if (actionType === "purge_expired") {
        body.action = "clear_expired_logs";
      }

      const res = await fetch("/api/studio", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || "删除失败，请稍后重试");
      }

      if (actionType === "single" && logId) {
        setLocalLogs((prev) => prev.filter((l) => l.id !== logId));
        setSelectedIds((prev) => prev.filter((id) => id !== logId));
        toast.success("日志记录已删除");
      } else if (actionType === "batch") {
        setLocalLogs((prev) => prev.filter((l) => !selectedIds.includes(l.id)));
        const count = selectedIds.length;
        setSelectedIds([]);
        toast.success(`成功批量删除 ${count} 条安全日志`);
      } else if (actionType === "purge_expired") {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        setLocalLogs((prev) => prev.filter((l) => {
          if (!l.createdAt) return true;
          return new Date(l.createdAt).getTime() >= oneYearAgo.getTime();
        }));
        toast.success(data.message || `定期清理完成，共物理清除 1 年以前的历史日志`);
      }
      setConfirmModal({ isOpen: false, type: "single", title: "", message: "" });
    } catch (err: any) {
      toast.error(err.message || "删除日志出现错误，请检查网络后再试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. 顶部 Header：组件标题与定期清理说明 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-white border border-slate-200/80 rounded-2xl shadow-2xs">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#3182ce]/10 rounded-lg text-[#3182ce]">
              <FileText className="w-5 h-5" />
            </div>
            <h2 className="text-base font-extrabold text-slate-900 tracking-tight">
              空间操作安全审计日志
            </h2>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#3182ce] border border-blue-100">
              全维应归档
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            完整记录空间内所有成员在组件装配、任务执行、资料上传、知识沉淀及权限变更中的真实操作；<strong className="text-slate-700">管理员可依据治理规范清理历史记录，清理动作单独统计留痕。</strong>
          </p>
        </div>

        {/* 管理员专属：清理 1 年前历史日志 */}
        {isWorkspaceAdmin && (
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => {
                setConfirmModal({
                  isOpen: true,
                  type: "purge_expired",
                  title: "定期物理清理历史日志",
                  message: "确认清除当前空间中满 1 年（365 天）以上的所有早期历史审计日志？保留 1 年内的安全记录，物理删除不可恢复。"
                });
              }}
              className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/80 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-2xs"
              title="定期清除满 1 年的早期历史日志，确保数据合规与沙箱性能"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-500" />
              <span>清理 1 年前历史日志</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. 多条件组合筛选栏 */}
      <div className="p-4 bg-white border border-slate-200/80 rounded-2xl shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* 搜索框 */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="搜索操作人、行为名称、组件或关键信息..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50/50 border border-slate-200/80 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#3182ce] focus:bg-white transition-all"
            />
          </div>

          {/* 模块分类多选下拉控制 */}
          <div className="relative shrink-0 w-full sm:w-auto" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
              className={`w-full sm:w-auto px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center justify-between gap-2 transition-all cursor-pointer ${
                selectedCategories.length > 0
                  ? "bg-blue-50/80 text-[#3182ce] border-blue-200"
                  : "bg-slate-50/50 text-slate-700 border-slate-200/80 hover:bg-slate-100/60"
              }`}
            >
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-slate-500" />
                <span>
                  {selectedCategories.length === 0
                    ? "全部操作模块 (可多选)"
                    : `已选 ${selectedCategories.length} 个模块`}
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {showCategoryDropdown && (
              <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 space-y-1 animate-in zoom-in-95 duration-150">
                <div className="flex justify-between items-center px-2 py-1 border-b border-slate-100 mb-1">
                  <span className="text-[11px] font-black text-slate-500">多选操作模块</span>
                  {selectedCategories.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedCategories([])}
                      className="text-[10px] text-[#3182ce] hover:underline font-bold cursor-pointer"
                    >
                      重置
                    </button>
                  )}
                </div>
                {CATEGORY_LIST.map((cat) => {
                  const isChecked = selectedCategories.includes(cat);
                  return (
                    <div
                      key={cat}
                      onClick={() => toggleCategory(cat)}
                      className={`px-2.5 py-1.5 rounded-xl cursor-pointer text-xs flex items-center justify-between transition-all ${
                        isChecked ? "bg-blue-50/80 text-[#3182ce] font-bold" : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <span>{cat}</span>
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-[#3182ce]" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 时间维度快捷按钮 */}
          <div className="flex items-center gap-1 bg-slate-50/80 p-1 rounded-xl border border-slate-200/80 shrink-0 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setDateMode("preset");
                setPresetDays(0);
                setCurrentPage(1);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                dateMode === "preset" && presetDays === 0 ? "bg-[#3182ce] text-white shadow-2xs" : "text-slate-600 hover:bg-slate-200/60"
              }`}
            >
              全部时间
            </button>
            <button
              type="button"
              onClick={() => {
                setDateMode("preset");
                setPresetDays(7);
                setCurrentPage(1);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                dateMode === "preset" && presetDays === 7 ? "bg-[#3182ce] text-white shadow-2xs" : "text-slate-600 hover:bg-slate-200/60"
              }`}
            >
              近 7 天
            </button>
            <button
              type="button"
              onClick={() => {
                setDateMode("preset");
                setPresetDays(30);
                setCurrentPage(1);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                dateMode === "preset" && presetDays === 30 ? "bg-[#3182ce] text-white shadow-2xs" : "text-slate-600 hover:bg-slate-200/60"
              }`}
            >
              近 30 天
            </button>
            <button
              type="button"
              onClick={() => {
                setDateMode("custom");
                setCurrentPage(1);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                dateMode === "custom" ? "bg-[#3182ce] text-white shadow-2xs" : "text-slate-600 hover:bg-slate-200/60"
              }`}
            >
              <Calendar className="w-3.5 h-3.5" /> 自定义范围
            </button>
          </div>
        </div>

        {/* 自定义日期区间面板 */}
        {dateMode === "custom" && (
          <div className="w-full flex items-center gap-2 pt-1 animate-in fade-in duration-150">
            <span className="text-slate-500 text-[11px] font-bold">时间区间:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:border-[#3182ce]"
            />
            <span className="text-slate-400">至</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:border-[#3182ce]"
            />
          </div>
        )}

        {/* 批量操作控制浮栏（管理员勾选选中项目后出现） */}
        {isWorkspaceAdmin && selectedIds.length > 0 && (
          <div className="flex items-center justify-between px-3.5 py-2 bg-blue-50/80 border border-blue-200 rounded-xl animate-in fade-in duration-150">
            <div className="flex items-center gap-2 text-xs font-bold text-[#3182ce]">
              <CheckSquare className="w-4 h-4 text-[#3182ce]" />
              <span>已选中 <strong className="text-slate-900 font-extrabold">{selectedIds.length}</strong> 条日志记录</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setConfirmModal({
                  isOpen: true,
                  type: "batch",
                  targetCount: selectedIds.length,
                  title: "批量删除安全日志",
                  message: `确认删除当前选中的 ${selectedIds.length} 条日志记录？删除后将无法恢复。`
                });
              }}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer flex items-center gap-1 active:scale-95"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>批量删除日志</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. 内容表格 (支持全筛选与动态响应) */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 space-y-3">
          <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-700">未检索到符合条件的安全审计日志</p>
            <p className="text-[11px] text-slate-400">请尝试清除多选模块分类或调整日期筛选范围。</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white shadow-2xs">
            <table className="w-full text-xs text-left text-slate-500 border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50/90 text-slate-700 border-b border-slate-200 text-xs font-extrabold">
                  {isWorkspaceAdmin && (
                    <th className="py-3.5 px-3 w-10 text-center">
                      <button
                        type="button"
                        onClick={toggleSelectAll}
                        className="cursor-pointer text-slate-400 hover:text-[#3182ce]"
                        title={isAllSelected ? "取消全选" : "全选当前筛选页"}
                      >
                        {isAllSelected ? <CheckSquare className="w-4 h-4 text-[#3182ce]" /> : <Square className="w-4 h-4" />}
                      </button>
                    </th>
                  )}
                  <th className="py-3.5 px-4 w-[20%]">操作人与角色</th>
                  <th className="py-3.5 px-3 w-[15%]">模块分类</th>
                  <th className="py-3.5 px-3 w-[18%]">行为类型</th>
                  <th className="py-3.5 px-4 w-[30%]">具体业务操作与详情成果</th>
                  <th className="py-3.5 px-4 w-[17%] text-right">精准时间</th>
                  {isWorkspaceAdmin && (
                    <th className="py-3.5 px-4 w-[10%] text-center">操作</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-600 bg-white">
                {paginated.map((log) => {
                  const meta = resolveMeta(log.action);
                  const IconComp = meta.icon;
                  const colorCls = CATEGORY_COLOR[meta.color] || CATEGORY_COLOR.slate;
                  const roleName = log.user?.role === "Owner" || log.user?.role === "Admin" ? "管理员" : "空间成员";
                  const isSelected = selectedIds.includes(log.id);

                  return (
                    <tr key={log.id} className={`hover:bg-blue-50/20 transition-all ${isSelected ? "bg-blue-50/30" : ""}`}>
                      {/* 复选框列（仅管理员可见） */}
                      {isWorkspaceAdmin && (
                        <td className="py-3.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleSelect(log.id)}
                            className="cursor-pointer text-slate-400 hover:text-[#3182ce]"
                          >
                            {isSelected ? <CheckSquare className="w-4 h-4 text-[#3182ce]" /> : <Square className="w-4 h-4" />}
                          </button>
                        </td>
                      )}

                      {/* 操作人与角色 */}
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#3182ce] to-indigo-600 text-white font-extrabold text-[11px] flex items-center justify-center shrink-0 shadow-2xs">
                            {actorName(log).slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <span className="block truncate text-slate-900 font-extrabold">{actorName(log)}</span>
                            <span className="text-[10px] text-slate-400 font-normal block">{roleName}</span>
                          </div>
                        </div>
                      </td>

                      {/* 模块分类 Badge */}
                      <td className="py-3.5 px-3">
                        <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-bold inline-flex items-center gap-1 ${colorCls}`}>
                          <IconComp className="w-3 h-3 shrink-0" />
                          <span>{meta.category}</span>
                        </span>
                      </td>

                      {/* 行为类型 */}
                      <td className="py-3.5 px-3 font-bold text-slate-800">
                        {meta.label}
                      </td>

                      {/* 具体业务操作与详情成果 */}
                      <td className="py-3.5 px-4 text-slate-700 font-medium leading-relaxed">
                        <span className="line-clamp-2" title={summarizeDetails(log.action, log.details)}>
                          {summarizeDetails(log.action, log.details)}
                        </span>
                      </td>

                      {/* 精准时间 (YYYY-MM-DD HH:mm:ss) */}
                      <td className="py-3.5 px-4 text-right font-mono text-slate-500 text-[11px]">
                        <div className="flex items-center justify-end gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{formatTime(log.createdAt)}</span>
                        </div>
                      </td>

                      {/* 管理员单条删除操作入口 */}
                      {isWorkspaceAdmin && (
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                type: "single",
                                targetLogId: log.id,
                                title: "删除安全日志",
                                message: "确认删除此条操作安全日志？物理删除后不可恢复。"
                              });
                            }}
                            className="text-red-500 hover:text-red-700 hover:underline font-bold text-xs inline-flex items-center gap-0.5 cursor-pointer active:scale-95"
                            title="管理员直接物理删除此条记录"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>删除</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 标准分页器 */}
          <Pagination
            currentPage={safePage}
            totalItems={filtered.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {/* 确认删除二次确认 Modal 弹窗（使用 createPortal 挂载到 document.body 顶级节点，确保 100% 覆盖包括 Header 在内的全部 Viewport） */}
      {mounted && confirmModal.isOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden space-y-4 p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-50 text-red-600 rounded-xl shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">{confirmModal.title}</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{confirmModal.message}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmModal({ isOpen: false, type: "single", title: "", message: "" })}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                disabled={isSubmitting}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => executeDeleteLogs(confirmModal.type, confirmModal.targetLogId)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-xs disabled:opacity-50"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>处理中...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>确认删除</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
