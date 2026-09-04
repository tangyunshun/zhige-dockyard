"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
  X,
  ExternalLink,
} from "lucide-react";

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
  estimatedTokens?: number;
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
  estimatedTokens: number;
  config?: any;
}

const categoryCNMap: Record<string, string> = {
  BID_PREP: "商机售前",
  REQ_DESIGN: "需求与设计",
  BACKEND_CORE: "后端核心",
  DATABASE_ENG: "数据库工程",
  FRONTEND_DEV: "前端与交互",
  TEST_QA: "测试与质量",
  DEVOPS: "DevOps构建",
  SECURITY: "安全合规",
  PROJ_MGMT: "效能管理",
  KNOWLEDGE: "知识沉淀",
  REQUIREMENTS: "需求分析",
  DATA_BI: "数据工程",
  DOCUMENTATION: "研报文档",
  AI_AGENTS: "AI智能算力",
  COMMON: "通用研发",
};

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

export default function AdminComponentsPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [components, setComponents] = useState<Component[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(null);
  const [detailComp, setDetailComp] = useState<Component | null>(null);

  const [filters, setFilters] = useState({
    search: "",
    stage: "",
    status: "",
    published: "",
    startDate: "",
    endDate: "",
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
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
    estimatedTokens: 5,
    errors: {},
  });

  const [submitting, setSubmitting] = useState(false);
  // 批量操作：当前页选中的组件 ID 集合
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    published: 0,
    stages: 0,
    totalUsage: 0,
  });

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

  // 渲染图标 Helper
  const renderIcon = (iconName?: string) => {
    const found = AVAILABLE_ICONS.find((i) => i.name === iconName?.toLowerCase());
    const IconComp = found ? found.icon : PackageIcon;
    return <IconComp className="w-5 h-5 text-white" />;
  };

  // 渲染阶段中文 Label
  const getStageCNLabel = (key?: string) => {
    if (!key) return "通用组件";
    const upperKey = key.toUpperCase();
    return categoryCNMap[upperKey] || (upperKey.includes("_") ? upperKey : key);
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

  // 上架 / 下架 状态切换处理
  const handleTogglePublished = async (
    id: string,
    currentPublished: boolean,
  ) => {
    const actionText = currentPublished ? "下架" : "上架";
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

  // 物理删除组件处理
  const handleDelete = async (id: string) => {
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
            toast.error(error.message || "删除失败");
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
      estimatedTokens: 5,
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
      estimatedTokens: component.estimatedTokens || 5,
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
    }

    if (!formData.description || !formData.description.trim()) {
      newErrors.description = "请输入组件功能职责描述";
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

  const handleBatchAction = (
    endpoint: "batch-publish" | "batch-unpublish" | "batch-delete",
    label: string,
    needsConfirm: boolean,
  ) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toast.error("请先勾选要操作的组件");
      return;
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
              href="/components"
              target="_blank"
              className="inline-flex items-center gap-1.5 px-4 h-9 bg-white hover:bg-slate-50 text-[#3182ce] border border-[#3182ce]/30 hover:border-[#3182ce] rounded-xl text-xs font-bold transition-all shadow-2xs group"
              title="前往用户前台组件中心查看实际展示与调度情况"
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
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  全库组件总数
                </div>
                <PackageIcon className="w-6 h-6 text-[#3182ce]" />
              </div>
              <div className="text-3xl font-black text-slate-800 tracking-tight">
                {stats.total} <span className="text-xs font-normal text-slate-400">个</span>
              </div>
            </div>
          </div>

          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  已上架发布组件
                </div>
                <Eye className="w-6 h-6 text-[#10b981]" />
              </div>
              <div className="text-3xl font-black text-slate-800 tracking-tight">
                {stats.published} <span className="text-xs font-normal text-slate-400">个</span>
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
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                <div className="relative flex-1">
                  <input
                    type="text"
                    placeholder="搜索组件名称或功能描述..."
                    value={filters.search}
                    onChange={(e) =>
                      setFilters({ ...filters, search: e.target.value })
                    }
                    className="w-full pl-10 pr-4 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-medium transition-all bg-white/80"
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                </div>

                <select
                  value={filters.stage}
                  onChange={(e) =>
                    setFilters({ ...filters, stage: e.target.value })
                  }
                  className="px-3 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-bold transition-all bg-white/80 whitespace-nowrap"
                >
                  <option value="">全部领域阶段</option>
                  {types.map((stage) => (
                    <option key={stage} value={stage}>
                      {getStageCNLabel(stage)}
                    </option>
                  ))}
                </select>

                <select
                  value={filters.published}
                  onChange={(e) =>
                    setFilters({ ...filters, published: e.target.value })
                  }
                  className="px-3 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-bold transition-all bg-white/80 whitespace-nowrap"
                >
                  <option value="">全部状态</option>
                  <option value="true">🟢 已上架</option>
                  <option value="false">⚪ 已下架</option>
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

                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-1.5 px-5 h-10 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white font-bold rounded-xl text-xs hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>新增组件</span>
                </button>
              </div>
            </div>

            {/* 快捷领域分类标签栏 */}
            <div className="flex items-center gap-1.5 pt-2.5 border-t border-slate-100 overflow-x-auto pb-0.5 text-xs">
              <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap mr-1">快捷分类:</span>
              <button
                type="button"
                onClick={() => {
                  setFilters({ ...filters, stage: "" });
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  filters.stage === ""
                    ? "bg-[#3182ce] text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                全部阶段 ({stats.total})
              </button>
              {types.slice(0, 8).map((stage) => (
                <button
                  key={stage}
                  type="button"
                  onClick={() => {
                    setFilters({ ...filters, stage });
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                    filters.stage === stage
                      ? "bg-[#3182ce] text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {getStageCNLabel(stage)}
                </button>
              ))}
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
          <div className="text-center py-16 bg-white/80 rounded-2xl border border-slate-200/60">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <PackageIcon className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-xs text-slate-500 font-bold">暂无匹配的数据库组件记录</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 批量操作浮动工具栏：仅当选中项 > 0 时显示 */}
            {selectedIds.size > 0 && (() => {
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
                  {hasUnpublished && (
                    <button
                      type="button"
                      onClick={() =>
                        handleBatchAction("batch-publish", "上架", false)
                      }
                      disabled={batchLoading}
                      className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-colors shadow-2xs"
                    >
                      <Eye className="w-3.5 h-3.5" /> 批量上架
                    </button>
                  )}
                  {hasPublished && (
                    <button
                      type="button"
                      onClick={() =>
                        handleBatchAction("batch-unpublish", "下架", false)
                      }
                      disabled={batchLoading}
                      className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-colors shadow-2xs"
                    >
                      <EyeOff className="w-3.5 h-3.5" /> 批量下架
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      handleBatchAction("batch-delete", "删除", true)
                    }
                    disabled={batchLoading}
                    className="px-3 py-1.5 bg-red-50 border border-red-100 text-red-600 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-colors shadow-2xs"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> 批量删除
                  </button>
                  <button
                    type="button"
                    onClick={clearSelection}
                    disabled={batchLoading}
                    className="px-3 py-1.5 bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-colors shadow-2xs"
                  >
                    <X className="w-3.5 h-3.5" /> 取消
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
                      <th className="py-3.5 px-4 whitespace-nowrap font-extrabold w-[25%]">组件名称与标识代码</th>
                      <th className="py-3.5 px-3 whitespace-nowrap font-extrabold w-[14%]">领域分类</th>
                      <th className="py-3.5 px-3 whitespace-nowrap font-extrabold w-[14%]">所需算力点数</th>
                      <th className="py-3.5 px-3 whitespace-nowrap font-extrabold w-[10%]">状态</th>
                      <th className="py-3.5 px-3 whitespace-nowrap font-extrabold w-[12%]">全网调度次数</th>
                      <th className="py-3.5 px-4 whitespace-nowrap font-extrabold w-[15%]">创建时间</th>
                      <th className="py-3.5 px-4 text-right whitespace-nowrap font-extrabold w-[160px]">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-600 bg-white">
                    {components.map((component) => {
                      const isPub = component.isPublished;
                      const estimatedTokens = component.estimatedTokens || 5;

                      return (
                        <tr
                          key={component.id}
                          className={`hover:bg-blue-50/20 transition-all group ${
                            selectedIds.has(component.id)
                              ? "bg-blue-50/40"
                              : ""
                          }`}
                        >
                          <td className="py-3.5 px-3 w-[40px]">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(component.id)}
                              onChange={() => toggleSelectOne(component.id)}
                              className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]/30 cursor-pointer"
                            />
                          </td>
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
                              {getStageCNLabel(component.category || component.type)}
                            </span>
                          </td>

                          <td className="py-3.5 px-3 font-mono font-black text-slate-800 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-700 rounded-lg border border-amber-100 text-[11px]">
                              <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                              {estimatedTokens} 算力点 (¥{(estimatedTokens * 0.01).toFixed(2)})
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

                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
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
                                <button
                                  type="button"
                                  onClick={() => handleTogglePublished(component.id, true)}
                                  className="px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1 bg-amber-50 text-amber-700 hover:bg-amber-500 hover:text-white"
                                  title="下架该组件（下架后解除保护，方可重新编辑）"
                                >
                                  下架
                                </button>
                              ) : (
                                <>
                                  {/* 未上架状态：允许【上架】、【编辑】与【删除】 */}
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePublished(component.id, false)}
                                    className="px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white"
                                    title="上架发布该组件"
                                  >
                                    上架
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => openEditModal(component)}
                                    className="px-2.5 py-1 bg-blue-50 text-[#3182ce] hover:bg-[#3182ce] hover:text-white rounded-lg font-bold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1"
                                    title="修改组件配置与算力点"
                                  >
                                    <Edit className="w-3 h-3" />
                                    <span>编辑</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDelete(component.id)}
                                    className="px-2 py-1 bg-red-50 text-red-600 hover:bg-red-600 hover:text-white rounded-lg font-bold text-[11px] transition-all cursor-pointer"
                                    title="物理删除"
                                  >
                                    <Trash2 className="w-3 h-3" />
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
                  <div className="text-xs font-black text-slate-800">{getStageCNLabel(detailComp.category || detailComp.type)}</div>
                </div>
                <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl space-y-0.5">
                  <div className="text-[10px] font-bold text-amber-600 uppercase">分配所需算力点数</div>
                  <div className="text-xs font-black text-slate-800">{detailComp.estimatedTokens || 5} 算力点 (折合 ¥{((detailComp.estimatedTokens || 5) * 0.01).toFixed(2)} 元)</div>
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
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="如：后端数据接口自动化开发组件"
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs font-bold transition-all bg-slate-50/50 focus:bg-white"
                  />
                  {formData.errors?.name && (
                    <p className="mt-1 text-[11px] text-red-500 font-bold">{formData.errors.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    功能职责描述 <span className="text-red-500">*</span>
                  </label>
                  <textarea
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
                  {formData.errors?.description && (
                    <p className="mt-1 text-[11px] text-red-500 font-bold">{formData.errors.description}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      所属领域分类（阶段） <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          category: e.target.value,
                          type: e.target.value,
                          errors: { ...(formData.errors || {}), category: "" },
                        })
                      }
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl focus:border-[#3182ce] outline-none text-xs font-bold transition-all bg-slate-50/50 focus:bg-white"
                    >
                      <option value="">请选择领域分类</option>
                      {categories.map((cat) => (
                        <option key={cat.key} value={cat.key}>
                          {cat.name} ({getStageCNLabel(cat.key)})
                        </option>
                      ))}
                    </select>
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
                      value={formData.estimatedTokens}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          estimatedTokens: parseInt(e.target.value) || 1,
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
                    当前配置：{formData.estimatedTokens || 0} 点 = ¥{((formData.estimatedTokens || 0) * 0.01).toFixed(2)} 元 / 次
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
