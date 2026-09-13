"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { getAuthToken } from "@/utils/auth";
import {
  Search,
  Plus,
  Package as PackageIcon,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Layers,
  Star,
  RotateCcw,
  BookOpen,
  Zap,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Database,
  Terminal,
  FileCode,
  Braces,
  Settings,
  Package,
  Wrench,
  Cloud,
  Code,
  Boxes,
  Cpu,
  Workflow,
  Clock,
  Coins,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
} from "lucide-react";
import { createPortal } from "react-dom";
import { exportToExcel, formatExcelDateTime } from "@/utils/excel-export";
import { useAdminPermission } from "@/contexts/AdminPermissionContext";

interface Component {
  id: string;
  name: string;
  description: string;
  type: string;
  status: string;
  icon: string;
  category: string;
  tags: string;
  sortOrder: number;
  isPublished: boolean;
  usageCount: number;
  estimatedModelTokens?: number;
  contract?: string;
  hint?: string;
  createdAt: string;
  updatedAt: string;
}

interface ComponentFormData {
  name: string;
  description: string;
  type: string;
  icon: string;
  category: string;
  tags: string;
  sortOrder: number;
  isPublished: boolean;
  estimatedModelTokens: number;
  config?: any;
}

const MAX_COMPONENT_NAME_LENGTH = 50;
const MAX_COMPONENT_DESCRIPTION_LENGTH = 190; // 与数据库当前 VARCHAR(191) 保持一致，避免入库截断



const AVAILABLE_ICONS = [
  { name: "package", label: "组件包", icon: Package },
  { name: "layers", label: "分层架构", icon: Layers },
  { name: "database", label: "数据库", icon: Database },
  { name: "terminal", label: "终端控制", icon: Terminal },
  { name: "file-code", label: "代码规范", icon: FileCode },
  { name: "braces", label: "契约接口", icon: Braces },
  { name: "shield-check", label: "安全合规", icon: ShieldCheck },
  { name: "zap", label: "算力引擎", icon: Zap },
  { name: "wrench", label: "辅助工具", icon: Wrench },
  { name: "cloud", label: "云原生", icon: Cloud },
  { name: "code", label: "核心算法", icon: Code },
  { name: "boxes", label: "模块容器", icon: Boxes },
  { name: "cpu", label: "算力芯片", icon: Cpu },
  { name: "workflow", label: "工作流", icon: Workflow },
];

interface CategoryItem {
  key: string;
  name: string;
}

function CategorySelect({
  categories,
  value,
  onChange,
  onCreate,
  placeholder = "请选择领域分类",
}: {
  categories: CategoryItem[];
  value: string;
  onChange: (key: string) => void;
  onCreate: (name: string) => Promise<string>;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const updatePos = () => {
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        setPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
      }
    };
    const handleDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handleDocClick);
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      document.removeEventListener("mousedown", handleDocClick);
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open]);

  const filtered = categories.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.key.toLowerCase().includes(q);
  });

  const selected = categories.find((c) => c.key === value);

  const startAdd = () => {
    setAdding(true);
    setNewName(query.trim());
    setErr("");
  };

  const confirmAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setErr("");
    try {
      const key = await onCreate(name);
      setQuery("");
      setAdding(false);
      setNewName("");
      setOpen(false);
      onChange(key);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "创建阶段失败");
    } finally {
      setBusy(false);
    }
  };

  const dropdown = (
    <div
      ref={dropdownRef}
      style={pos ? { top: pos.top, left: pos.left, width: pos.width } : undefined}
      className="fixed z-[100] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col max-h-80 overflow-hidden"
    >
      <div className="p-2 border-b border-slate-100 sticky top-0 bg-white z-10">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索阶段名称或标识..."
            className="w-full pl-8 pr-3 py-2 text-xs font-medium border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none transition-all"
          />
        </div>
      </div>

      <div className="overflow-y-auto flex-1 p-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-5 text-xs text-slate-400 text-center">无匹配分类</div>
        ) : (
          filtered.map((cat) => {
            const isActive = cat.key === value;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => {
                  onChange(cat.key);
                  setOpen(false);
                  setQuery("");
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors flex items-center justify-between ${
                  isActive
                    ? "bg-blue-50 text-[#3182ce]"
                    : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="truncate">{cat.name}</span>
                {isActive && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
              </button>
            );
          })
        )}
      </div>

      <div className="border-t border-slate-100 bg-slate-50 p-2">
        {adding ? (
          <div className="space-y-2">
            <input
              autoFocus
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmAdd();
                if (e.key === "Escape") {
                  setAdding(false);
                  setErr("");
                }
              }}
              placeholder="输入新阶段名称"
              className="w-full px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg focus:border-[#3182ce] outline-none"
            />
            {err && <div className="text-[10px] text-red-500 leading-tight">{err}</div>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={confirmAdd}
                disabled={busy || !newName.trim()}
                className="flex-1 px-3 py-1.5 rounded-lg bg-[#3182ce] text-white text-[11px] font-bold hover:bg-[#2b6cb0] disabled:opacity-50 transition-colors"
              >
                {busy ? "创建中..." : "确认新增"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setErr("");
                }}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 text-[11px] font-bold hover:bg-slate-100 transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={startAdd}
            className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded-lg border border-dashed border-[#3182ce] text-[#3182ce] text-xs font-bold hover:bg-blue-50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            新增阶段
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full px-3.5 py-2.5 border rounded-xl text-left text-xs font-bold transition-all flex items-center justify-between gap-2 ${
          open
            ? "border-[#3182ce] bg-white ring-1 ring-[#3182ce]/20"
            : "border-slate-200 bg-slate-50/50 hover:bg-slate-100"
        }`}
      >
        <span className="truncate">{selected?.name || placeholder}</span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && typeof window !== "undefined" && createPortal(dropdown, document.body)}
    </div>
  );
}

export default function AdminComponentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();

  // 统一平台 RBAC 细粒度权限受控校验（无权直接隐藏，杜绝 403 页面）
  const { hasPermission, isSuperAdmin } = useAdminPermission();
  const canCreate = isSuperAdmin || hasPermission("component:create");
  const canUpdate = isSuperAdmin || hasPermission("component:update");
  const canPublish = isSuperAdmin || hasPermission("component:publish");
  const canDelete = isSuperAdmin || hasPermission("component:delete");
  const canBatchOperate = canPublish || canDelete;

  const [loading, setLoading] = useState(true);
  const [components, setComponents] = useState<Component[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(null);
  const [detailComp, setDetailComp] = useState<Component | null>(null);

  const initialStage = searchParams.get("stage") || "";
  const [filters, setFilters] = useState({
    search: "",
    stage: initialStage,
    status: "",
    published: "",
    startDate: "",
    endDate: "",
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [total, setTotal] = useState(0);
  const [types, setTypes] = useState<string[]>([]);
  const [categories, setCategories] = useState<
    Array<{ key: string; name: string; color?: string }>
  >([]);
  
  const [formData, setFormData] = useState<
    ComponentFormData & { errors?: Record<string, string> }
  >({
    name: "",
    description: "",
    type: "",
    icon: "package",
    category: "",
    tags: "",
    sortOrder: 0,
    isPublished: true,
    estimatedModelTokens: 5,
    errors: {},
  });

  const [submitting, setSubmitting] = useState(false);
  // 批量操作：当前页选中的组件 ID 集合
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    published: number;
    unpublished?: number;
    stages: number;
    totalUsage: number;
    stageCounts?: Record<string, number>;
    publishedStageCounts?: Record<string, number>;
    unpublishedStageCounts?: Record<string, number>;
  }>({
    total: 0,
    published: 0,
    unpublished: 0,
    stages: 0,
    totalUsage: 0,
    stageCounts: {},
    publishedStageCounts: {},
    unpublishedStageCounts: {},
  });

  // 快捷分类横向滚动容器与左右推进控制
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollButtons = () => {
    const el = categoryScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  };

  useEffect(() => {
    checkScrollButtons();
    window.addEventListener("resize", checkScrollButtons);
    return () => window.removeEventListener("resize", checkScrollButtons);
  }, [types]);

  const handleScroll = (direction: "left" | "right") => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const scrollAmount = 240;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
    setTimeout(checkScrollButtons, 320);
  };

  // 确认对话框状态
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "danger" | "warning" | "info";
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "warning",
    onConfirm: () => {},
  });

  // 强制下架与空间通知模态框状态
  const [forceUnpublishModal, setForceUnpublishModal] = useState<{
    isOpen: boolean;
    componentIds: string[];
    components: Array<{ id: string; name: string }>;
    loadedCount: number;
    personalCount: number;
    enterpriseCount: number;
    workspaces: Array<{ id: string; name: string; type: string }>;
    noticeReason: string;
    submitting: boolean;
  }>({
    isOpen: false,
    componentIds: [],
    components: [],
    loadedCount: 0,
    personalCount: 0,
    enterpriseCount: 0,
    workspaces: [],
    noticeReason: "因平台核心组件矩阵升级与维护规划调整，该组件即日起下架停用。请各空间及时调整业务工作流与组件装配。",
    submitting: false,
  });

  // 渲染图标 Helper
  const renderIcon = (iconName?: string) => {
    const found = AVAILABLE_ICONS.find((i) => i.name === iconName?.toLowerCase());
    const IconComp = found ? found.icon : PackageIcon;
    return <IconComp className="w-5 h-5 text-white" />;
  };

  // 从接口返回的真实分类数据中查找阶段中文名
  const getCategoryName = (key?: string) => {
    if (!key) return "通用组件";
    return categories.find((c) => c.key === key)?.name || key;
  };

  // 加载真实组件数据 (从数据库读取，带分页)
  const loadComponents = async () => {
    try {
      setLoading(true);
      const authToken = getAuthToken();

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: "10", // 固定单页 10 条
        ...(filters.search && { search: filters.search }),
        ...(filters.stage && { stage: filters.stage }),
        ...(filters.published && { published: filters.published }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
      });

      const res = await fetch(`/api/admin/components?${params}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setComponents(data.data.components || []);
        setTypes(data.data.stages || []);
        setCategories(data.data.categories || []);
        setTotalPages(data.data.totalPages || 1);
        setTotal(data.data.total || 0);
      } else {
        const error = await res.json();
        toast.error(error.message || "加载组件失败");
      }
    } catch (error) {
      console.error("Load components error:", error);
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  };

  /** 导出当前筛选条件下的全量组件为 Excel 表格 */
  const handleExportExcel = async () => {
    if (exporting) return;
    try {
      setExporting(true);
      const authToken = getAuthToken();
      const params = new URLSearchParams({
        page: "1",
        limit: "5000",
        ...(filters.search && { search: filters.search }),
        ...(filters.stage && { stage: filters.stage }),
        ...(filters.published && { published: filters.published }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
      });

      const res = await fetch(`/api/admin/components?${params}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!res.ok) {
        throw new Error("拉取组件导出数据失败");
      }

      const data = await res.json();
      const exportList: Component[] = data.components || [];

      if (exportList.length === 0) {
        toast.error("当前筛选条件下暂无组件数据可导出");
        return;
      }

      exportToExcel({
        filename: "知阁组件清单",
        sheetName: "组件数据",
        columns: [
          { header: "组件ID", key: "id", width: 28 },
          { header: "组件名称", key: "name", width: 24 },
          {
            header: "领域分类",
            key: "category",
            width: 18,
            formatter: (val) => getCategoryName(val),
          },
          {
            header: "发布状态",
            key: "isPublished",
            width: 12,
            formatter: (val) => (val ? "已上架" : "已下架"),
          },
          { header: "累计调用", key: "usageCount", width: 12, formatter: (val) => val ?? 0 },
          { header: "综合评分", key: "rating", width: 12, formatter: (val) => val ?? 5 },
          { header: "排序权重", key: "sortOrder", width: 12, formatter: (val) => val ?? 0 },
          { header: "组件简介", key: "description", width: 36, formatter: (val) => val || "-" },
          { header: "创建时间", key: "createdAt", width: 20, formatter: formatExcelDateTime },
        ],
        data: exportList,
      });

      toast.success(`已成功导出 ${exportList.length} 个组件数据为 Excel 表格！`);
    } catch (e: any) {
      console.error("Export components error:", e);
      toast.error(e.message || "导出组件数据失败");
    } finally {
      setExporting(false);
    }
  };

  // 新建阶段分类（用于表单下拉中直接新增）
  const createCategory = async (name: string) => {
    const authToken = getAuthToken();
    const res = await fetch("/api/admin/stages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || "创建阶段分类失败");
    }

    const data = await res.json();
    await loadComponents();
    return data.data.key as string;
  };

  // 加载真实全局统计数据
  const loadStats = async () => {
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/components/stats", {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setStats(data.data);
      }
    } catch (error) {
      console.error("Load stats error:", error);
    }
  };

  useEffect(() => {
    loadComponents();
    loadStats();
  }, [currentPage, filters]);

  // 切换筛选/分页时清空批量选中，避免脏数据
  useEffect(() => {
    clearSelection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, filters]);

  // 上架 / 下架 状态切换处理（下架前必须检测是否被空间载入）
  const handleTogglePublished = async (
    id: string,
    currentPublished: boolean,
  ) => {
    const actionText = currentPublished ? "下架" : "上架";

    // 若当前为上架状态，正在尝试执行【下架】，必须前置检测该组件是否被空间（个人空间或企业空间）载入
    if (currentPublished) {
      try {
        const authToken = getAuthToken();
        const checkRes = await fetch(`/api/admin/components/unpublish-check?id=${id}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          // 若已被空间载入，常规下架必须拦截，弹出强制下架与空间通知模态框
          if (checkData.totalLoadedCount > 0) {
            const targetComp = components.find((c) => c.id === id);
            setForceUnpublishModal({
              isOpen: true,
              componentIds: [id],
              components: targetComp ? [{ id: targetComp.id, name: targetComp.name }] : [],
              loadedCount: checkData.totalLoadedCount,
              personalCount: checkData.personalCount,
              enterpriseCount: checkData.enterpriseCount,
              workspaces: checkData.workspaces || [],
              noticeReason: "因平台核心组件矩阵升级与维护规划调整，该组件即日起下架停用。请各空间及时调整业务工作流与组件装配。",
              submitting: false,
            });
            return;
          }
        }
      } catch (e) {
        console.error("检测组件载入状态异常", e);
      }
    }

    // 未被空间载入，或执行上架操作：走常规确认弹窗
    setConfirmDialog({
      isOpen: true,
      title: `${actionText}组件确认`,
      message: `确定要${actionText}该组件吗？${currentPublished ? "下架后组件将进入维护状态，并解除已上架锁定保护。" : "上架发布后前台空间将可立即分配调度该组件。"}`,
      type: currentPublished ? "warning" : "info",
      onConfirm: async () => {
        try {
          const authToken = getAuthToken();
          const res = await fetch(`/api/admin/components?id=${id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ isPublished: !currentPublished }),
          });

          if (res.ok) {
            toast.success(`组件已成功${actionText}`);
            loadComponents();
            loadStats();
          } else {
            const error = await res.json();
            toast.error(error.message || `${actionText}失败`);
          }
        } catch (error) {
          console.error("Toggle publish error:", error);
          toast.error(`${actionText}失败`);
        }
      },
    });
  };

  // 执行强制下架并向受影响空间分发通知
  const handleExecuteForceUnpublish = async () => {
    if (forceUnpublishModal.componentIds.length === 0) return;
    setForceUnpublishModal((prev) => ({ ...prev, submitting: true }));
    try {
      const authToken = getAuthToken();
      const res = await fetch("/api/admin/components/unpublish-check", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          ids: forceUnpublishModal.componentIds,
          force: true,
          noticeReason: forceUnpublishModal.noticeReason.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || "组件已强制下架并已分发空间通知");
        setForceUnpublishModal((prev) => ({ ...prev, isOpen: false }));
        clearSelection();
        loadComponents();
        loadStats();
      } else {
        toast.error(data.error || "强制下架失败");
      }
    } catch (err) {
      console.error("Force unpublish error:", err);
      toast.error("网络异常，强制下架失败");
    } finally {
      setForceUnpublishModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  // 物理删除组件处理（已上架组件严禁删除，必须下架后方可删除）
  const handleDelete = async (id: string) => {
    const comp = components.find((c) => c.id === id);
    if (comp?.isPublished) {
      toast.warning(`组件【${comp.name}】当前处于已上架状态，系统严格保护不可直接删除！请先将其【下架】，再进行删除。`);
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: "物理删除组件",
      message: "危险警告：该操作将永久性从系统字典库中物理抹除该组件。确定继续？",
      type: "danger",
      onConfirm: async () => {
        try {
          const authToken = getAuthToken();
          const res = await fetch(`/api/admin/components?id=${id}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${authToken}`,
            },
          });

          if (res.ok) {
            toast.success("组件删除成功");
            loadComponents();
            loadStats();
          } else {
            const error = await res.json();
            toast.error(error.error || error.message || "删除失败");
          }
        } catch (error) {
          console.error("Delete component error:", error);
          toast.error("删除失败");
        }
      },
    });
  };

  // 直达打开新增弹窗
  const openCreateModal = () => {
    setEditingComponent(null);
    setFormData({
      name: "",
      description: "",
      type: categories[0]?.key || "REQ_DESIGN",
      icon: "package",
      category: categories[0]?.key || "REQ_DESIGN",
      tags: "需求, 自动化",
      sortOrder: 0,
      isPublished: true,
      estimatedModelTokens: 5,
      errors: {},
    });
    setShowCreateModal(true);
  };

  // 直达打开编辑弹窗（只有未上架组件可触发）
  const openEditModal = (component: Component) => {
    if (component.isPublished) {
      toast.warning("已上架组件已被系统保护不可直接修改！请先将其【下架】，再进行编辑。");
      return;
    }

    setFormData({
      name: component.name,
      description: component.description || "",
      type: component.category || component.type || "",
      icon: component.icon || "package",
      category: component.category || "",
      tags: component.tags || "",
      sortOrder: component.sortOrder,
      isPublished: component.isPublished,
      estimatedModelTokens: component.estimatedModelTokens || 5,
      errors: {},
    });
    setEditingComponent(component);
    setShowCreateModal(true);
  };

  // 提交新建或修改
  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name || !formData.name.trim()) {
      newErrors.name = "请输入组件名称";
    } else if (formData.name.trim().length > MAX_COMPONENT_NAME_LENGTH) {
      newErrors.name = `组件名称最多 ${MAX_COMPONENT_NAME_LENGTH} 字`;
    }

    if (!formData.description || !formData.description.trim()) {
      newErrors.description = "请输入组件功能职责描述";
    } else if (formData.description.trim().length > MAX_COMPONENT_DESCRIPTION_LENGTH) {
      newErrors.description = `功能职责描述最多 ${MAX_COMPONENT_DESCRIPTION_LENGTH} 字`;
    }

    if (!formData.category || !formData.category.trim()) {
      newErrors.category = "请选择领域分类";
    }

    if (Object.keys(newErrors).length > 0) {
      setFormData({ ...formData, errors: newErrors });
      return;
    }

    setSubmitting(true);

    try {
      const authToken = getAuthToken();
      const url = editingComponent
        ? `/api/admin/components?id=${editingComponent.id}`
        : "/api/admin/components";

      const method = editingComponent ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(editingComponent ? "组件配置更新成功！" : "新增组件成功！");
        setShowCreateModal(false);
        loadComponents();
        loadStats();
      } else {
        toast.error(data.error || "操作失败");
      }
    } catch (error) {
      console.error("Submit component error:", error);
      toast.error("操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  // ============== 批量操作 ==============
  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const allOnPage = components.map((c) => c.id);
      const allSelected = allOnPage.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(allOnPage);
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const executeBatch = async (
    endpoint: "batch-publish" | "batch-unpublish" | "batch-delete",
    ids: string[],
  ) => {
    try {
      setBatchLoading(true);
      const authToken = getAuthToken();
      const res = await fetch(`/api/admin/components/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || "批量操作成功");
        clearSelection();
        loadComponents();
        loadStats();
      } else {
        toast.error(data.error || "批量操作失败");
      }
    } catch (err) {
      console.error(`Batch ${endpoint} error:`, err);
      toast.error("网络错误，请稍后重试");
    } finally {
      setBatchLoading(false);
    }
  };

  const handleBatchAction = async (
    endpoint: "batch-publish" | "batch-unpublish" | "batch-delete",
    label: string,
    needsConfirm: boolean,
  ) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toast.error("请先勾选要操作的组件");
      return;
    }

    // 1. 批量删除强拦截：已上架组件严禁直接删除，必须先下架
    if (endpoint === "batch-delete") {
      const selectedComponents = components.filter((c) => selectedIds.has(c.id));
      const publishedComps = selectedComponents.filter((c) => c.isPublished);
      if (publishedComps.length > 0) {
        const names = publishedComps.map((c) => `【${c.name}】`).slice(0, 3).join("、");
        const more = publishedComps.length > 3 ? ` 等共 ${publishedComps.length} 个组件` : "";
        toast.warning(
          `选中的组件中包含已上架组件（${names}${more}），系统禁止直接删除！请先下架后再执行批量删除。`
        );
        return;
      }
    }

    // 2. 批量下架前置空间载入检测与强制下架空间通知
    if (endpoint === "batch-unpublish") {
      try {
        const authToken = getAuthToken();
        const checkRes = await fetch(`/api/admin/components/unpublish-check?ids=${ids.join(",")}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.totalLoadedCount > 0) {
            const selectedComponents = components.filter((c) => selectedIds.has(c.id));
            setForceUnpublishModal({
              isOpen: true,
              componentIds: ids,
              components: selectedComponents.map((c) => ({ id: c.id, name: c.name })),
              loadedCount: checkData.totalLoadedCount,
              personalCount: checkData.personalCount,
              enterpriseCount: checkData.enterpriseCount,
              workspaces: checkData.workspaces || [],
              noticeReason:
                "因平台核心组件矩阵升级与维护规划调整，所涉及组件即日起下架停用。请各空间及时调整业务工作流与组件装配。",
              submitting: false,
            });
            return;
          }
        }
      } catch (e) {
        console.error("批量检测组件空间载入异常", e);
      }
    }

    if (needsConfirm) {
      setConfirmDialog({
        isOpen: true,
        title: `确认批量${label}`,
        message: `将对 ${ids.length} 个组件执行「${label}」操作，此操作${
          endpoint === "batch-delete" ? "不可恢复" : "可重新上架"
        }，是否继续？`,
        type: "danger",
        onConfirm: () => executeBatch(endpoint, ids),
      });
    } else {
      executeBatch(endpoint, ids);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#ebf8ff] via-[#f0f8ff] to-[#ffffff] pb-12 font-sans">
      {/* 顶部标题区 */}
      <div className="bg-white/70 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
        <div className="py-6 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">
                组件管理中枢
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-[#3182ce] border border-blue-200/80">
                真实数据库引擎
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-1">
              管理全平台核心组件矩阵、算力消耗配额、上架发布控制与全网使用监控
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/studio"
              target="_blank"
              className="inline-flex items-center gap-1.5 px-4 h-9 bg-white hover:bg-slate-50 text-[#3182ce] border border-[#3182ce]/30 hover:border-[#3182ce] rounded-xl text-xs font-bold transition-all shadow-2xs group"
              title="前往用户前台组件工坊查看实际展示与调度情况"
            >
              <span>直达前台组件集市</span>
              <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <main className="py-8">
        {/* 真实统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div
            onClick={() => {
              setFilters((prev) => ({ ...prev, published: "", stage: "", search: "" }));
              setCurrentPage(1);
            }}
            className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden cursor-pointer group"
            title="点击查看全库所有状态组件"
          >
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-[#3182ce] transition-colors">
                  全库组件总数
                </div>
                <PackageIcon className="w-6 h-6 text-[#3182ce]" />
              </div>
              <div className="text-3xl font-black text-slate-800 tracking-tight">
                {stats.total} <span className="text-xs font-normal text-slate-400">个</span>
              </div>
            </div>
          </div>

          <div
            className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
          >
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  已上架发布组件
                </div>
                <Eye className="w-6 h-6 text-[#10b981]" />
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <div
                  onClick={() => {
                    setFilters((prev) => ({ ...prev, published: "true" }));
                    setCurrentPage(1);
                  }}
                  className="text-3xl font-black text-slate-800 tracking-tight cursor-pointer hover:text-emerald-600 transition-colors"
                  title="点击仅查看已上架发布组件"
                >
                  {stats.published} <span className="text-xs font-normal text-slate-400">个</span>
                </div>
                {/* 快捷呈现并筛选已下架组件 */}
                <button
                  type="button"
                  onClick={() => {
                    setFilters((prev) => ({ ...prev, published: "false", stage: "" }));
                    setCurrentPage(1);
                  }}
                  className="px-2.5 py-1 rounded-lg text-xs font-black bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800 border border-slate-200 transition-colors cursor-pointer shadow-2xs flex items-center gap-1 active:scale-95"
                  title="点击直达查看所有已下架组件"
                >
                  <EyeOff className="w-3 h-3 text-amber-600" />
                  <span>已下架 {stats.unpublished ?? Math.max(0, stats.total - stats.published)}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  领域覆盖阶段
                </div>
                <Layers className="w-6 h-6 text-[#8b5cf6]" />
              </div>
              <div className="text-3xl font-black text-slate-800 tracking-tight">
                {stats.stages} <span className="text-xs font-normal text-slate-400">个</span>
              </div>
            </div>
          </div>

          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  全网聚合调度次数
                </div>
                <Star className="w-6 h-6 text-[#f59e0b]" />
              </div>
              <div className="text-3xl font-black text-slate-800 tracking-tight">
                {stats.totalUsage} <span className="text-xs font-normal text-slate-400">次</span>
              </div>
            </div>
          </div>
        </div>

        {/* 操作工具栏 */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-5 border border-white/90 shadow-sm overflow-hidden mb-6">
          <div className="relative space-y-3">
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 w-full sm:flex-1 min-w-0">
                <div className="relative w-full sm:flex-1">
                  <input
                    type="text"
                    placeholder="搜索组件名称或功能描述..."
                    value={filters.search}
                    onChange={(e) => {
                      setFilters((prev) => ({ ...prev, search: e.target.value }));
                      setCurrentPage(1);
                    }}
                    className="w-full pl-10 pr-4 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all bg-white/80"
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                </div>

                <select
                  value={filters.published}
                  onChange={(e) => {
                    const newPublished = e.target.value;
                    setFilters((prev) => {
                      // 若切换为“已下架”且当前阶段分类下并无下架组件，则自动切回“全部阶段”，避免页面无结果
                      const shouldResetStage =
                        newPublished === "false" &&
                        Boolean(prev.stage) &&
                        (stats.unpublishedStageCounts?.[prev.stage] ?? 0) === 0;
                      return {
                        ...prev,
                        published: newPublished,
                        ...(shouldResetStage ? { stage: "" } : {}),
                      };
                    });
                    setCurrentPage(1);
                  }}
                  className="w-full sm:w-auto px-3 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-bold transition-all bg-white/80 whitespace-nowrap cursor-pointer"
                >
                  <option value="">全部状态 ({stats.total})</option>
                  <option value="true">🟢 已上架 ({stats.published})</option>
                  <option value="false">⚪ 已下架 ({stats.unpublished ?? Math.max(0, stats.total - stats.published)})</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    loadComponents();
                    loadStats();
                    toast.success("已成功从数据库同步最新真实组件数据！");
                  }}
                  disabled={loading}
                  className="inline-flex items-center px-4 h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all duration-200 cursor-pointer shadow-2xs border border-slate-200/80 active:scale-95 disabled:opacity-50 whitespace-nowrap"
                >
                  <RotateCcw className={`w-3.5 h-3.5 mr-1.5 text-[#3182ce] ${loading ? "animate-spin" : ""}`} />
                  刷新数据
                </button>

                {/* 导出 Excel 表格 */}
                <button
                  type="button"
                  onClick={handleExportExcel}
                  disabled={exporting}
                  className="inline-flex items-center gap-1.5 px-4 h-10 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-xl text-xs transition-all duration-200 cursor-pointer shadow-2xs border border-emerald-200/80 active:scale-95 disabled:opacity-50 whitespace-nowrap"
                  title="导出当前筛选条件下的全量组件为 Excel 表格 (.xlsx)"
                >
                  <Download className={`w-3.5 h-3.5 text-emerald-600 ${exporting ? "animate-spin" : ""}`} />
                  <span>导出 Excel</span>
                </button>

                {canCreate && (
                  <button
                    onClick={openCreateModal}
                    className="inline-flex items-center gap-1.5 px-5 h-10 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white font-bold rounded-xl text-xs hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 whitespace-nowrap cursor-pointer active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>新增组件</span>
                  </button>
                )}
              </div>
            </div>

            {/* 快捷领域分类标签栏（左右平滑推拉 + 当前状态下各分类真实数量动态联动） */}
            <div className="flex items-center gap-2 pt-2.5 border-t border-slate-100 text-xs min-w-0">
              <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap shrink-0">快捷分类:</span>

              {/* 左翻页推拉按钮 */}
              <button
                type="button"
                onClick={() => handleScroll("left")}
                disabled={!canScrollLeft}
                className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                  canScrollLeft
                    ? "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-[#3182ce] shadow-2xs cursor-pointer active:scale-95"
                    : "border-slate-100 bg-slate-50 text-slate-300 opacity-40 cursor-not-allowed"
                }`}
                title="向左推进滚动分类"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              {/* 横向滚动分类容器 */}
              <div
                ref={categoryScrollRef}
                onScroll={checkScrollButtons}
                className="flex items-center gap-1.5 overflow-x-auto py-0.5 min-w-0 flex-1 scroll-smooth"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {(() => {
                  const currentTotalCount =
                    filters.published === "true"
                      ? stats.published
                      : filters.published === "false"
                      ? stats.unpublished ?? Math.max(0, stats.total - stats.published)
                      : stats.total;

                  const getStageCount = (stageKey: string) => {
                    if (filters.published === "true") {
                      return stats.publishedStageCounts?.[stageKey] ?? 0;
                    }
                    if (filters.published === "false") {
                      return stats.unpublishedStageCounts?.[stageKey] ?? 0;
                    }
                    return stats.stageCounts?.[stageKey] ?? 0;
                  };

                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setFilters((prev) => ({ ...prev, stage: "" }));
                          setCurrentPage(1);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                          filters.stage === ""
                            ? "bg-[#3182ce] text-white shadow-xs"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        全部阶段 ({currentTotalCount})
                      </button>
                      {types.map((stage) => {
                        const stageCount = getStageCount(stage);
                        const isZeroUnderFilter = filters.published !== "" && stageCount === 0;
                        return (
                          <button
                            key={stage}
                            type="button"
                            onClick={() => {
                              setFilters((prev) => ({ ...prev, stage }));
                              setCurrentPage(1);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                              filters.stage === stage
                                ? "bg-[#3182ce] text-white shadow-xs"
                                : isZeroUnderFilter
                                ? "bg-slate-50 text-slate-400 hover:bg-slate-100"
                                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                            }`}
                          >
                            {getCategoryName(stage)} ({stageCount})
                          </button>
                        );
                      })}
                    </>
                  );
                })()}
              </div>

              {/* 右翻页推拉按钮 */}
              <button
                type="button"
                onClick={() => handleScroll("right")}
                disabled={!canScrollRight}
                className={`w-6 h-6 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                  canScrollRight
                    ? "border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-[#3182ce] shadow-2xs cursor-pointer active:scale-95"
                    : "border-slate-100 bg-slate-50 text-slate-300 opacity-40 cursor-not-allowed"
                }`}
                title="向右推进滚动分类"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* 数据库组件列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-20 bg-white/60 rounded-2xl border border-slate-100">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-xs text-slate-500 font-bold">正在从数据库加载真实组件数据...</p>
            </div>
          </div>
        ) : components.length === 0 ? (
          <div className="text-center py-16 bg-white/80 rounded-2xl border border-slate-200/60 p-6 space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-1">
              <PackageIcon className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-sm font-black text-slate-700">暂无匹配的数据库组件记录</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              {filters.stage && filters.published === "false"
                ? `当前阶段【${getCategoryName(filters.stage)}】下暂无已下架组件，下架组件可能分布在其他阶段分类中。`
                : filters.stage
                ? `当前阶段【${getCategoryName(filters.stage)}】下暂无符合条件的组件。`
                : filters.published === "false"
                ? "全库当前暂无已下架的组件记录，所有组件均处于正常上架分发状态。"
                : "当前筛选条件下暂无组件记录，您可以尝试更换关键词或清除筛选条件。"}
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              {filters.stage && (
                <button
                  type="button"
                  onClick={() => {
                    setFilters((prev) => ({ ...prev, stage: "" }));
                    setCurrentPage(1);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#3182ce] text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                >
                  查看全部阶段下的组件
                </button>
              )}
              {(filters.search || filters.published || filters.stage) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilters({ search: "", stage: "", status: "", published: "", startDate: "", endDate: "" });
                    setCurrentPage(1);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-colors cursor-pointer"
                >
                  重置所有筛选
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 批量操作浮动工具栏：仅当有批量权限且选中项 > 0 时显示 */}
            {canBatchOperate && selectedIds.size > 0 && (() => {
              const selectedComponents = components.filter((c) => selectedIds.has(c.id));
              const hasPublished = selectedComponents.some((c) => c.isPublished);
              const hasUnpublished = selectedComponents.some((c) => !c.isPublished);
              return (
              <div className="sticky top-2 z-20 flex items-center justify-between gap-3 px-4 py-3 bg-white rounded-2xl shadow-md border border-[#3182ce]/30">
                <div className="flex items-center gap-2 text-xs font-bold text-[#2b6cb0]">
                  <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#4299e1] to-[#3182ce] text-white flex items-center justify-center">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <span>已选中 {selectedIds.size} 个组件</span>
                </div>
                <div className="flex items-center gap-2">
                  {canPublish && hasUnpublished && (
                    <button
                      type="button"
                      onClick={() =>
                        handleBatchAction("batch-publish", "上架", false)
                      }
                      disabled={batchLoading}
                      className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" /> 批量上架
                    </button>
                  )}
                  {canPublish && hasPublished && (
                    <button
                      type="button"
                      onClick={() =>
                        handleBatchAction("batch-unpublish", "下架", false)
                      }
                      disabled={batchLoading}
                      className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                    >
                      <EyeOff className="w-3.5 h-3.5" /> 批量下架
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() =>
                        handleBatchAction("batch-delete", "删除", true)
                      }
                      disabled={batchLoading || hasPublished}
                      title={
                        hasPublished
                          ? "选中的组件中包含已上架组件，已上架组件不可删除，请先将其【下架】"
                          : "批量删除选中的未上架组件"
                      }
                      style={hasPublished ? { cursor: "not-allowed" } : undefined}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-colors shadow-2xs ${
                        hasPublished
                          ? "bg-red-100/60 border border-red-200 text-red-300"
                          : "bg-red-600 border border-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> 批量删除
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={batchLoading}
                    className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    取消选择
                  </button>
                </div>
              </div>
              );
            })()}
            <div className="relative bg-white/90 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
              <div className="relative overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-50/90 border-b border-slate-200 font-black text-slate-700">
                    <tr>
                      {canBatchOperate && (
                        <th className="py-3.5 px-3 whitespace-nowrap font-extrabold w-[40px]">
                          <input
                            type="checkbox"
                            checked={
                              components.length > 0 &&
                              components.every((c) => selectedIds.has(c.id))
                            }
                            onChange={toggleSelectAll}
                            className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]/30 cursor-pointer"
                            title="全选/取消全选"
                          />
                        </th>
                      )}
                      <th className="py-3.5 px-4 whitespace-nowrap font-extrabold w-[25%]">组件名称与标识代码</th>
                      <th className="py-3.5 px-3 whitespace-nowrap font-extrabold w-[14%]">领域分类</th>
                      <th className="py-3.5 px-3 whitespace-nowrap font-extrabold w-[14%]">所需算力点数</th>
                      <th className="py-3.5 px-3 whitespace-nowrap font-extrabold w-[10%]">状态</th>
                      <th className="py-3.5 px-3 whitespace-nowrap font-extrabold w-[12%]">全网调度次数</th>
                      <th className="py-3.5 px-4 whitespace-nowrap font-extrabold w-[15%]">创建时间</th>
                      <th className="sticky right-0 bg-slate-50/95 backdrop-blur-xs z-20 py-3.5 px-4 text-right whitespace-nowrap font-extrabold shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-200/80">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-600 bg-white">
                    {components.map((component) => {
                      const isPub = component.isPublished;
                      const estimatedModelTokens = component.estimatedModelTokens || 5;

                      return (
                        <tr
                          key={component.id}
                          className={`hover:bg-blue-50/20 transition-all group ${
                            selectedIds.has(component.id)
                              ? "bg-blue-50/40"
                              : ""
                          }`}
                        >
                          {canBatchOperate && (
                            <td className="py-3.5 px-3 w-[40px]">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(component.id)}
                                onChange={() => toggleSelectOne(component.id)}
                                className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]/30 cursor-pointer"
                              />
                            </td>
                          )}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-xs">
                                {renderIcon(component.icon)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">
                                    {component.id}
                                  </span>
                                  <span className="font-extrabold text-slate-900 truncate" title={component.name}>
                                    {component.name}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5" title={component.description}>
                                  {component.description || "暂无详细描述"}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="py-3.5 px-3 whitespace-nowrap font-bold">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px]">
                              {getCategoryName(component.category || component.type)}
                            </span>
                          </td>

                          <td className="py-3.5 px-3 font-mono font-black text-slate-800 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg border border-amber-100 text-[11px]">
                              <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              {estimatedModelTokens} 算力点 (¥{(estimatedModelTokens * 0.01).toFixed(2)})
                            </span>
                          </td>

                          <td className="py-3.5 px-3 whitespace-nowrap">
                            {isPub ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-600 border border-emerald-200/60">
                                🟢 已上架
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-slate-100 text-slate-500 border border-slate-200/60">
                                ⚪ 已下架
                              </span>
                            )}
                          </td>

                          <td className="py-3.5 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">
                            {component.usageCount || 0} 次
                          </td>

                          <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                            {new Date(component.createdAt).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })}
                          </td>

                          <td className="sticky right-0 bg-white/95 group-hover:bg-slate-50/95 backdrop-blur-xs z-10 py-3.5 px-4 text-right whitespace-nowrap shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)] border-l border-slate-100 transition-colors">
                            {(() => {
                              const hasPublish = canPublish;
                              const hasEdit = !isPub && canUpdate;
                              const hasDelete = !isPub && canDelete;
                              const hasAnyAction = hasPublish || hasEdit || hasDelete;

                              return (
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* 查看详情 👁️ (与其他页面统一) */}
                                  <button
                                    type="button"
                                    onClick={() => setDetailComp(component)}
                                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1"
                                    title="查看组件契约说明与结构化参数"
                                  >
                                    <Eye className="w-3 h-3 text-slate-500" />
                                    <span>详情</span>
                                  </button>

                                  {/* 已上架状态：仅允许【下架】！严格禁止上架状态直接编辑 */}
                                  {isPub ? (
                                    canPublish && (
                                      <button
                                        type="button"
                                        onClick={() => handleTogglePublished(component.id, true)}
                                        className="px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1 bg-amber-50 text-amber-700 hover:bg-amber-500 hover:text-white"
                                        title="下架该组件（下架后解除保护，方可重新编辑）"
                                      >
                                        <EyeOff className="w-3 h-3" />
                                        <span>下架</span>
                                      </button>
                                    )
                                  ) : (
                                    <>
                                      {/* 未上架状态：允许【上架】、【编辑】与【删除】 */}
                                      {canPublish && (
                                        <button
                                          type="button"
                                          onClick={() => handleTogglePublished(component.id, false)}
                                          className="px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white"
                                          title="上架发布该组件"
                                        >
                                          <Eye className="w-3 h-3" />
                                          <span>上架</span>
                                        </button>
                                      )}

                                      {canUpdate && (
                                        <button
                                          type="button"
                                          onClick={() => openEditModal(component)}
                                          className="px-2.5 py-1 bg-blue-50 text-[#3182ce] hover:bg-[#3182ce] hover:text-white rounded-lg font-bold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1"
                                          title="修改组件配置与算力点"
                                        >
                                          <Edit className="w-3 h-3" />
                                          <span>编辑</span>
                                        </button>
                                      )}

                                      {canDelete && (
                                        <button
                                          type="button"
                                          onClick={() => handleDelete(component.id)}
                                          className="px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white border border-red-600 shadow-xs hover:shadow active:scale-95"
                                          title="物理删除该未上架组件"
                                        >
                                          <Trash2 className="w-3 h-3 text-white" />
                                          <span>删除</span>
                                        </button>
                                      )}
                                    </>
                                  )}

                                  {!hasAnyAction && (
                                    <span className="text-[10px] text-slate-400 font-medium px-1">只读</span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 恢复并加回标准的 Pagination 分页器 */}
            {totalPages > 1 && (
              <div className="relative bg-white/90 backdrop-blur-xl rounded-2xl p-4 border border-white/90 shadow-sm flex items-center justify-between font-sans text-xs">
                <div className="text-slate-600 font-bold">
                  数据库全量共 <span className="text-[#3182ce] font-mono font-black">{total}</span> 条组件，当前第 <span className="font-mono font-black text-slate-800">{currentPage}</span> / <span className="font-mono font-black text-slate-800">{totalPages}</span> 页
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="px-2.5 h-8 rounded-lg border border-slate-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    首页
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="px-2.5 h-8 rounded-lg border border-slate-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    上一页
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setCurrentPage(pageNum)}
                          className={`w-8 h-8 rounded-lg font-mono font-black text-xs transition-all cursor-pointer ${
                            currentPage === pageNum
                              ? "bg-[#3182ce] text-white shadow-xs"
                              : "hover:bg-slate-100 border border-slate-200 text-slate-700"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="px-2.5 h-8 rounded-lg border border-slate-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    下一页
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="px-2.5 h-8 rounded-lg border border-slate-200 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-all cursor-pointer"
                  >
                    末页
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 权威组件详情 Modal (全景全方位补充) */}
      {detailComp && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-white/90 overflow-hidden animate-in zoom-in-95 duration-200 text-left font-sans">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] text-white flex items-center justify-center font-bold text-sm shadow-xs">
                  {renderIcon(detailComp.icon)}
                </div>
                <div>
                  <div className="text-xs font-mono font-bold text-slate-500">{detailComp.id}</div>
                  <div className="text-sm font-black text-slate-900">{detailComp.name}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailComp(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">组件功能职责说明</div>
                <div className="text-xs font-medium text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">{detailComp.description || "暂无详细描述"}</div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl space-y-0.5">
                  <div className="text-[10px] font-bold text-blue-500 uppercase">领域分类阶段</div>
                  <div className="text-xs font-black text-slate-800">{getCategoryName(detailComp.category || detailComp.type)}</div>
                </div>
                <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl space-y-0.5">
                  <div className="text-[10px] font-bold text-amber-600 uppercase">分配所需算力点数</div>
                  <div className="text-xs font-black text-slate-800">{detailComp.estimatedModelTokens || 5} 算力点 (折合 ¥{((detailComp.estimatedModelTokens || 5) * 0.01).toFixed(2)} 元)</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl space-y-0.5">
                  <div className="text-[10px] font-bold text-emerald-600 uppercase">发布状态</div>
                  <div className="text-xs font-black text-emerald-700">{detailComp.isPublished ? "🟢 已上架" : "⚪ 已下架"}</div>
                </div>
                <div className="p-3 bg-purple-50/60 border border-purple-100 rounded-xl space-y-0.5">
                  <div className="text-[10px] font-bold text-purple-600 uppercase">数据库全网调度总数</div>
                  <div className="text-xs font-black text-slate-800">{detailComp.usageCount || 0} 次</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl space-y-0.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">组件创建时间</div>
                  <div className="text-xs font-mono font-bold text-slate-700">{new Date(detailComp.createdAt).toLocaleString("zh-CN")}</div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl space-y-0.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">最近更新维护时间</div>
                  <div className="text-xs font-mono font-bold text-slate-700">{new Date(detailComp.updatedAt || detailComp.createdAt).toLocaleString("zh-CN")}</div>
                </div>
              </div>

              {detailComp.tags && (
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">业务领域标签</div>
                  <div className="flex flex-wrap gap-1">
                    {detailComp.tags.split(",").filter(Boolean).map((t, i) => (
                      <span key={i} className="px-2.5 py-0.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold">{t.trim()}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <Link
                href={`/components?search=${encodeURIComponent(detailComp.name)}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-[#3182ce] rounded-xl text-xs font-bold border border-blue-200/70 transition-all cursor-pointer shadow-2xs"
                title="在新标签页中打开前台集市查看实际展示效果"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>前往前台集市查看</span>
              </Link>
              <button
                type="button"
                onClick={() => setDetailComp(null)}
                className="px-5 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl cursor-pointer transition-all"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 创建 / 编辑弹窗 (仅未上架状态可编辑；算力/金额对比提示与蓝色高亮) */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-white/90 text-left font-sans animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h2 className="text-base font-black text-slate-800 flex items-center gap-2">
                <Settings className="w-4 h-4 text-[#3182ce]" />
                <span>{editingComponent ? `编辑下架组件 [${editingComponent.id}]` : "新增空间组件"}</span>
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5 text-xs">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    组件名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    maxLength={MAX_COMPONENT_NAME_LENGTH}
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="如：后端数据接口自动化开发组件"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold transition-all bg-slate-50/50 focus:bg-white"
                  />
                  <div className="mt-1 flex items-center justify-between">
                    {formData.errors?.name && (
                      <p className="text-[11px] text-red-500 font-bold">{formData.errors.name}</p>
                    )}
                    <span className={`ml-auto text-[10px] font-medium ${formData.name.length >= MAX_COMPONENT_NAME_LENGTH ? "text-red-500" : "text-slate-400"}`}>
                      {formData.name.length}/{MAX_COMPONENT_NAME_LENGTH}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    功能职责描述 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    maxLength={MAX_COMPONENT_DESCRIPTION_LENGTH}
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        description: e.target.value,
                      })
                    }
                    rows={3}
                    placeholder="请输入该组件在自动化任务流中的核心功能与预期产出..."
                    className={`w-full px-3.5 py-2.5 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 text-xs font-medium transition-all leading-relaxed resize-none ${
                      formData.errors?.description ? "border-red-500 bg-red-50/30" : "border-slate-200 bg-slate-50/50 focus:bg-white"
                    }`}
                  />
                  <div className="mt-1 flex items-center justify-between">
                    {formData.errors?.description && (
                      <p className="text-[11px] text-red-500 font-bold">{formData.errors.description}</p>
                    )}
                    <span className={`ml-auto text-[10px] font-medium ${formData.description.length >= MAX_COMPONENT_DESCRIPTION_LENGTH ? "text-red-500" : "text-slate-400"}`}>
                      {formData.description.length}/{MAX_COMPONENT_DESCRIPTION_LENGTH}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      所属领域分类（阶段） <span className="text-red-500">*</span>
                    </label>
                    <CategorySelect
                      categories={categories}
                      value={formData.category}
                      onChange={(key) =>
                        setFormData({
                          ...formData,
                          category: key,
                          type: key,
                          errors: { ...(formData.errors || {}), category: "" },
                        })
                      }
                      onCreate={createCategory}
                      placeholder="请选择领域分类"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                      <span>分配所需算力点数</span>
                      <span className="text-amber-600 font-mono font-bold">⚡ 算力点</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={formData.estimatedModelTokens}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          estimatedModelTokens: parseInt(e.target.value) || 1,
                        })
                      }
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-mono font-bold transition-all bg-slate-50/50 focus:bg-white"
                    />
                  </div>
                </div>

                {/* 算力点与人民币对比换算提示栏 */}
                <div className="bg-gradient-to-r from-blue-50/80 via-amber-50/50 to-blue-50/80 p-3 rounded-xl border border-blue-100/90 flex items-center justify-between font-bold text-[11px] text-slate-700">
                  <div className="flex items-center gap-1.5 text-blue-700">
                    <Coins className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>算力点与人民币换算规则：1 算力点 = ¥0.01 元</span>
                  </div>
                  <div className="font-mono text-amber-700 bg-white px-2.5 py-1 rounded-lg border border-amber-200 shadow-2xs">
                    当前配置：{formData.estimatedModelTokens || 0} 点 = ¥{((formData.estimatedModelTokens || 0) * 0.01).toFixed(2)} 元 / 次
                  </div>
                </div>

                {/* 可视化图标选择框 */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    挑选组件可视化图标
                  </label>
                  <div className="grid grid-cols-7 gap-2">
                    {AVAILABLE_ICONS.map((item) => {
                      const IconC = item.icon;
                      const isSelected = formData.icon === item.name;
                      return (
                        <button
                          key={item.name}
                          type="button"
                          onClick={() => setFormData({ ...formData, icon: item.name })}
                          className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition-all cursor-pointer ${
                            isSelected
                              ? "bg-blue-50 border-[#3182ce] text-[#3182ce] shadow-xs"
                              : "bg-slate-50/60 border-slate-200/60 text-slate-600 hover:bg-slate-100"
                          }`}
                        >
                          <IconC className="w-4 h-4" />
                          <span className="text-[10px] font-bold truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      标签 (逗号隔开)
                    </label>
                    <input
                      type="text"
                      value={formData.tags}
                      onChange={(e) =>
                        setFormData({ ...formData, tags: e.target.value })
                      }
                      placeholder="如：后端，接口，代码分析"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-medium transition-all bg-slate-50/50 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      排序权重 (小数字靠前)
                    </label>
                    <input
                      type="number"
                      value={formData.sortOrder}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          sortOrder: parseInt(e.target.value) || 0,
                        })
                      }
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-mono font-bold transition-all bg-slate-50/50 focus:bg-white"
                    />
                  </div>
                </div>

                {/* 蓝色主题高亮勾选框 */}
                <div className="pt-2">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none bg-blue-50/70 p-3 rounded-xl border border-blue-100">
                    <input
                      type="checkbox"
                      checked={formData.isPublished}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isPublished: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-[#3182ce] rounded border-blue-300 focus:ring-[#3182ce] cursor-pointer"
                    />
                    <span className="text-xs font-extrabold text-[#2b6cb0]">
                      创建/更新保存后立即上架发布（前台空间可立即调度）
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="px-6 py-2 bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] text-white rounded-xl text-xs font-bold shadow-md transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {submitting && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                <span>{editingComponent ? "保存配置更新" : "确认创建组件"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 强制下架与空间通知模态框（当组件已被空间载入时弹出，严格遵循知阁设计系统） */}
      {forceUnpublishModal.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-white/90 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 text-left font-sans">
            {/* 弹窗头部 */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                    <span>组件下架安全拦截与空间站内信闭环</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200/80">
                      装配强保护
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                    目标组件当前正被 <strong className="text-amber-600 font-mono font-bold">{forceUnpublishModal.loadedCount}</strong> 个空间（含 {forceUnpublishModal.enterpriseCount} 个企业空间、{forceUnpublishModal.personalCount} 个个人空间）载入装配中
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={forceUnpublishModal.submitting}
                onClick={() => setForceUnpublishModal((prev) => ({ ...prev, isOpen: false }))}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-400 flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 弹窗主滚动内容区（防截断） */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
              {/* 安全拦截提示横幅 */}
              <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-900 text-xs">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  <span>平台运行安全准则：禁止静默下架已装配使用的业务组件</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  检测到目标组件已被相关工作空间装配在业务流中。常规下架已被系统自动阻断！如必须执行下架，管理员必须填写下架说明，系统将自动向所有受影响空间的所有者（Owner）及装配使用用户推送<strong>高优先级系统站内信通知</strong>（设置登录弹窗强提醒），引导其调整业务流水线。
                </p>
              </div>

              {/* 涉及下架组件标签 */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-600 block">
                  待下架组件（共 {forceUnpublishModal.components.length || forceUnpublishModal.componentIds.length} 个）：
                </span>
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50/80 rounded-xl border border-slate-100">
                  {forceUnpublishModal.components.map((c) => (
                    <span
                      key={c.id}
                      className="px-2.5 py-1 rounded-lg text-xs font-black bg-white text-slate-800 border border-slate-200/80 shadow-2xs flex items-center gap-1.5"
                    >
                      <PackageIcon className="w-3.5 h-3.5 text-[#3182ce]" />
                      <span>{c.name}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* 涉及装配载入的工作空间列表 */}
              {forceUnpublishModal.workspaces.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-600">
                      受影响工作空间明细清单（共 {forceUnpublishModal.workspaces.length} 个）：
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      下架通知将直达各空间管理者与所有者
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-2 bg-slate-50/80 rounded-xl border border-slate-100">
                    {forceUnpublishModal.workspaces.map((ws) => (
                      <div
                        key={ws.id}
                        className="px-3 py-2 rounded-xl bg-white text-slate-700 border border-slate-200/80 shadow-2xs flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="font-extrabold text-xs text-slate-800 truncate" title={ws.name}>
                            {ws.name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono truncate">
                            ID: {ws.id}
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-black shrink-0 ${
                            ws.type === "PERSONAL"
                              ? "bg-blue-50 text-blue-700 border border-blue-100"
                              : "bg-purple-50 text-purple-700 border border-purple-100"
                          }`}
                        >
                          {ws.type === "PERSONAL" ? "个人自主空间" : "企业协同空间"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 下架通知站内信配置 */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    站内信通知说明 <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">
                    将以系统站内信推送给受影响空间的所有者与管理者
                  </span>
                </div>

                {/* 快捷理由预设胶囊 */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold text-slate-400">快捷理由预设:</span>
                  {[
                    "核心算法矩阵升级整合，组件下架维护",
                    "业务流水线重构，该组件即日起下架停用",
                    "安全合规策略例行调整，组件进入归档状态",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        setForceUnpublishModal((prev) => ({
                          ...prev,
                          noticeReason: preset,
                        }))
                      }
                      className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-[#3182ce] rounded-lg text-[10px] font-bold transition-all border border-slate-200/60 cursor-pointer active:scale-95"
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={3}
                  required
                  value={forceUnpublishModal.noticeReason}
                  onChange={(e) =>
                    setForceUnpublishModal((prev) => ({
                      ...prev,
                      noticeReason: e.target.value,
                    }))
                  }
                  className="w-full px-3.5 py-2.5 text-xs font-medium border border-slate-200 rounded-xl focus:outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 resize-none transition-all placeholder:text-slate-400 bg-slate-50/50 focus:bg-white leading-relaxed"
                  placeholder="请输入下架说明，告知各空间管理者下架原因及后续操作建议..."
                />
              </div>

              {/* 派发结果预览提示 */}
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 flex items-center gap-2 text-[11px] text-[#2b6cb0]">
                <ShieldCheck className="w-4 h-4 text-[#3182ce] shrink-0" />
                <span>
                  确认后，系统将把组件状态变更为【已下架】，并自动向受影响用户派发登录强提醒弹窗站内信。
                </span>
              </div>
            </div>

            {/* 弹窗底部操作条 */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={forceUnpublishModal.submitting}
                onClick={() => setForceUnpublishModal((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                取消操作
              </button>
              <button
                type="button"
                disabled={forceUnpublishModal.submitting || !forceUnpublishModal.noticeReason.trim()}
                onClick={handleExecuteForceUnpublish}
                className="px-6 py-2.5 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
              >
                {forceUnpublishModal.submitting ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <EyeOff className="w-3.5 h-3.5" />
                )}
                <span>
                  {forceUnpublishModal.submitting
                    ? "正在强制下架并分发通知..."
                    : "确认强制下架并向空间发送通知"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 确认对话框 */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        onConfirm={() => {
          confirmDialog.onConfirm();
          setConfirmDialog({ ...confirmDialog, isOpen: false });
        }}
        onCancel={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
      />
    </div>
  );
}
