"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  Search,
  Plus,
  ArrowLeft,
  Package as PackageIcon,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Eye,
  EyeOff,
  Filter,
  Layers,
  Award,
  Star,
  FileText,
  ShieldCheck,
  TrendingUp,
  Languages,
  Calculator,
  Lightbulb,
  MessageSquare,
  AlertTriangle,
  Heart,
  Database,
  Palette,
  Accessibility,
  Image,
  LayoutTemplate,
  Activity,
  Scissors,
  FileSpreadsheet,
  GitMerge,
  Key,
  FileCode,
  Braces,
  Plug,
  SearchCheck,
  Bug,
  TestTube2,
  Wind,
  ImageMinus,
  Wrench,
  Cloud,
  Scale,
  FileWarning,
  Settings,
  Package,
  Shirt,
  Phone,
  Signature,
  Smile,
  Users,
  Network,
  Server,
  Terminal,
  CreditCard,
  FolderLock,
  MonitorPlay,
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
  config?: any;
}

export default function AdminComponentsPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [components, setComponents] = useState<Component[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingComponent, setEditingComponent] = useState<Component | null>(
    null,
  );
  const [filters, setFilters] = useState({
    search: "",
    stage: "",
    status: "",
    published: "",
    startDate: "",
    endDate: "",
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedComponents, setSelectedComponents] = useState<ComponentTask[]>(
    [],
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [types, setTypes] = useState<string[]>([]);
  const [formData, setFormData] = useState<
    ComponentFormData & { errors?: Record<string, string> }
  >({
    name: "",
    description: "",
    type: "",
    icon: "",
    category: "",
    tags: "",
    sortOrder: 0,
    isPublished: true,
    errors: {},
  });
  const [submitting, setSubmitting] = useState(false);
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

  // 加载组件数据
  const loadComponents = async () => {
    try {
      setLoading(true);
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: "10", // 每页 10 条
        ...(filters.search && { search: filters.search }),
        ...(filters.stage && { stage: filters.stage }),
        ...(filters.published && { published: filters.published }),
        ...(filters.startDate && { startDate: filters.startDate }),
        ...(filters.endDate && { endDate: filters.endDate }),
      });

      const res = await fetch(`/api/admin/components?${params}`, {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setComponents(data.data.components);
        setTypes(data.data.stages || []);
        setTotalPages(data.data.totalPages);
        setTotal(data.data.total);
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

  // 加载全局统计数据（不受筛选影响）
  const loadStats = async () => {
    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const res = await fetch("/api/admin/components/stats", {
        headers: {
          Authorization: `Bearer ${userId}`,
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

  // 批量操作函数
  const handleBatchPublish = async () => {
    if (selectedIds.length === 0) return;

    setConfirmDialog({
      isOpen: true,
      title: "批量上架组件",
      message: `确定要批量上架选中的 ${selectedIds.length} 个组件吗？`,
      type: "warning",
      onConfirm: async () => {
        try {
          const userId =
            typeof window !== "undefined" ? localStorage.getItem("userId") : "";

          const res = await fetch("/api/admin/components/batch-publish", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${userId}`,
            },
            body: JSON.stringify({ ids: selectedIds }),
          });

          if (res.ok) {
            toast.success("批量上架成功");
            setSelectedIds([]);
            setSelectedComponents([]);
            loadComponents();
            loadStats();
          } else {
            const error = await res.json();
            toast.error(error.message || "批量上架失败");
          }
        } catch (error) {
          console.error("Batch publish error:", error);
          toast.error("批量上架失败");
        }
      },
    });
  };

  const handleBatchUnpublish = async () => {
    if (selectedIds.length === 0) return;

    setConfirmDialog({
      isOpen: true,
      title: "批量下架组件",
      message: `确定要批量下架选中的 ${selectedIds.length} 个组件吗？`,
      type: "warning",
      onConfirm: async () => {
        try {
          const userId =
            typeof window !== "undefined" ? localStorage.getItem("userId") : "";

          const res = await fetch("/api/admin/components/batch-unpublish", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${userId}`,
            },
            body: JSON.stringify({ ids: selectedIds }),
          });

          if (res.ok) {
            toast.success("批量下架成功");
            setSelectedIds([]);
            setSelectedComponents([]);
            loadComponents();
            loadStats();
          } else {
            const error = await res.json();
            toast.error(error.message || "批量下架失败");
          }
        } catch (error) {
          console.error("Batch unpublish error:", error);
          toast.error("批量下架失败");
        }
      },
    });
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;

    setConfirmDialog({
      isOpen: true,
      title: "批量删除组件",
      message: `确定要批量删除选中的 ${selectedIds.length} 个组件吗？此操作不可恢复！`,
      type: "danger",
      onConfirm: async () => {
        try {
          const userId =
            typeof window !== "undefined" ? localStorage.getItem("userId") : "";

          const res = await fetch("/api/admin/components/batch-delete", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${userId}`,
            },
            body: JSON.stringify({ ids: selectedIds }),
          });

          if (res.ok) {
            toast.success("批量删除成功");
            setSelectedIds([]);
            setSelectedComponents([]);
            loadComponents();
            loadStats();
          } else {
            const error = await res.json();
            toast.error(error.message || "批量删除失败");
          }
        } catch (error) {
          console.error("Batch delete error:", error);
          toast.error("批量删除失败");
        }
      },
    });
  };

  // 智能批量操作按钮显示逻辑
  const renderBatchActions = () => {
    if (selectedIds.length === 0) return null;

    const hasPublished =
      selectedComponents?.some((c) => c.isPublished) || false;
    const hasUnpublished =
      selectedComponents?.some((c) => !c.isPublished) || false;
    // 检查是否有未上架且未被使用的组件（可以删除的）
    const hasDeletable = selectedComponents?.some(
      (c) => !c.isPublished && c.usageCount === 0,
    ) || false;

    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-slate-600 whitespace-nowrap">
          已选择 {selectedIds.length} 项
        </span>
        {/* 批量上架：只有存在未上架组件时显示 */}
        {hasUnpublished && (
          <button
            onClick={handleBatchPublish}
            className="px-4 h-10 bg-[#10b981]/10 text-[#10b981] font-semibold rounded-xl hover:bg-[#10b981]/20 transition-all duration-300 whitespace-nowrap"
          >
            批量上架
          </button>
        )}
        {/* 批量下架：只有存在已上架组件时显示 */}
        {hasPublished && (
          <button
            onClick={handleBatchUnpublish}
            className="px-4 h-10 bg-[#f59e0b]/10 text-[#f59e0b] font-semibold rounded-xl hover:bg-[#f59e0b]/20 transition-all duration-300 whitespace-nowrap"
          >
            批量下架
          </button>
        )}
        {/* 批量删除：只有存在未上架且未使用的组件时显示 */}
        {hasDeletable && (
          <button
            onClick={handleBatchDelete}
            className="px-4 h-10 bg-[#ef4444]/10 text-[#ef4444] font-semibold rounded-xl hover:bg-[#ef4444]/20 transition-all duration-300 whitespace-nowrap"
          >
            批量删除
          </button>
        )}
      </div>
    );
  };

  useEffect(() => {
    loadComponents();
    loadStats();
  }, []);

  // 筛选条件变化时重新加载数据
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      setCurrentPage(1); // 重置到第一页
      loadComponents();
    }, 300); // 300ms 防抖

    return () => clearTimeout(debounceTimer);
  }, [
    filters.search,
    filters.stage,
    filters.published,
    filters.startDate,
    filters.endDate,
  ]);

  // 页码变化时重新加载数据
  useEffect(() => {
    loadComponents();
  }, [currentPage]);

  // 图标映射表 - 确保与前端 studio 页面一致
  const iconMap: Record<string, any> = {
    FileText,
    ShieldCheck,
    TrendingUp,
    Languages,
    Calculator,
    Lightbulb,
    MessageSquare,
    AlertTriangle,
    Heart,
    Database,
    Palette,
    Accessibility,
    Image,
    LayoutTemplate,
    Activity,
    Scissors,
    FileSpreadsheet,
    GitMerge,
    Key,
    FileCode,
    Braces,
    Plug,
    SearchCheck,
    Bug,
    TestTube2,
    Wind,
    ImageMinus,
    Wrench,
    Cloud,
    Scale,
    FileWarning,
    Settings,
    Package,
    Shirt,
    Phone,
    Signature,
    Smile,
    Users,
    Network,
    Server,
    Terminal,
    CreditCard,
    FolderLock,
    MonitorPlay,
  };

  // 渲染组件图标
  const renderComponentIcon = (iconName: string) => {
    const IconComponent = iconMap[iconName];
    if (IconComponent) {
      return <IconComponent className="w-6 h-6 text-white" />;
    }
    // 默认图标
    return <PackageIcon className="w-6 h-6 text-white" />;
  };

  const handleTogglePublished = async (id: string, isPublished: boolean) => {
    // 二次确认 - 使用自定义对话框
    const action = isPublished ? "下架" : "上架";
    setConfirmModal({
      isOpen: true,
      title: `${action}确认`,
      message: `${action}后，用户将${isPublished ? "无法" : "可以"}使用此组件。\n\n请确认是否继续？`,
      type: "info",
      onConfirm: async () => {
        try {
          const userId =
            typeof window !== "undefined" ? localStorage.getItem("userId") : "";

          console.log("Toggle published - userId:", userId);
          console.log("Toggle published - component id:", id);
          console.log("Toggle published - isPublished:", isPublished);

          const res = await fetch(`/api/admin/components?id=${id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${userId}`,
            },
            body: JSON.stringify({
              id,
              isPublished: !isPublished,
            }),
          });

          console.log("Toggle published - response status:", res.status);
          console.log("Toggle published - response ok:", res.ok);

          let data;
          try {
            const text = await res.text();
            console.log("Toggle published - response text:", text);
            data = text ? JSON.parse(text) : { error: "空响应" };
          } catch (parseError) {
            console.error("Response parse error:", parseError);
            data = { error: "服务器响应格式错误" };
          }

          if (res.ok) {
            toast.success(isPublished ? "已下架" : "已上架");
            loadComponents();
          } else {
            const errorMsg = data?.error || "操作失败";
            toast.error(errorMsg);
            console.log("Toggle published error:", data);
          }
        } catch (error) {
          console.error("Toggle published error:", error);
          toast.error(
            "操作失败：" +
              (error instanceof Error ? error.message : String(error)),
          );
        }
      },
    });
  };

  const handleDelete = async (id: string) => {
    const component = components.find((c) => c.id === id);
    if (!component) {
      toast.error("组件不存在");
      return;
    }

    if (component.isPublished) {
      toast.error("已上架的组件不支持删除，请先下架后再删除");
      return;
    }

    // 二次确认 - 使用自定义对话框
    setConfirmModal({
      isOpen: true,
      title: "⚠️ 删除确认",
      message: `组件名称：${component.name}\n\n此操作不可恢复，删除后将无法找回！\n\n请确认是否继续？`,
      type: "danger",
      onConfirm: async () => {
        try {
          const userId =
            typeof window !== "undefined" ? localStorage.getItem("userId") : "";

          const res = await fetch(`/api/admin/components?id=${id}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${userId}`,
            },
          });

          if (res.ok) {
            toast.success("删除成功");
            loadComponents();
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

  const openCreateModal = () => {
    setFormData({
      name: "",
      description: "",
      type: "",
      icon: "",
      category: "",
      tags: "",
      sortOrder:
        components.length > 0
          ? Math.max(...components.map((c) => c.sortOrder)) + 1
          : 1,
      isPublished: true,
    });
    setShowCreateModal(true);
  };

  const openEditModal = (component: Component) => {
    if (component.isPublished) {
      toast.error("已上架的组件不支持编辑，请先下架后再编辑");
      return;
    }

    // 二次确认 - 使用自定义对话框
    setConfirmModal({
      isOpen: true,
      title: "编辑确认",
      message: `组件名称：${component.name}\n\n编辑后需要重新上架才能被用户看到使用。\n\n请确认是否继续？`,
      type: "info",
      onConfirm: () => {
        setFormData({
          name: component.name,
          description: component.description || "",
          type: component.type,
          icon: component.icon || "",
          category: component.category || "",
          tags: component.tags || "",
          sortOrder: component.sortOrder,
          isPublished: component.isPublished,
          errors: {},
        });
        setEditingComponent(component);
        setShowCreateModal(true);
      },
    });
  };

  const handleSubmit = async () => {
    // 验证必填字段
    const newErrors: Record<string, string> = {};

    if (!formData.name || !formData.name.trim()) {
      newErrors.name = "请输入组件名称";
    }

    if (!formData.type || !formData.type.trim()) {
      newErrors.type = "请输入组件阶段";
    }

    if (Object.keys(newErrors).length > 0) {
      setFormData({ ...formData, errors: newErrors });
      return;
    }

    setSubmitting(true);

    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      const url = editingComponent
        ? `/api/admin/components?id=${editingComponent.id}`
        : "/api/admin/components";

      const method = editingComponent ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(editingComponent ? "更新成功" : "创建成功");
        setShowCreateModal(false);
        loadComponents();
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff] pb-8">
      {/* 顶部标题区 */}
      <div className="bg-white/50 backdrop-blur-sm border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="mb-2">
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">
              组件管理
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-1">
              审核组件、上架下架管理、查看组件统计
            </p>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#3182ce]/10 opacity-20 blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-500 font-semibold">
                  总组件数
                </div>
                <PackageIcon className="w-6 h-6 text-[#3182ce]" />
              </div>
              <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                {stats.total}
              </div>
            </div>
          </div>
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#10b981]/10 opacity-20 blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-500 font-semibold">
                  已上架
                </div>
                <Eye className="w-6 h-6 text-[#10b981]" />
              </div>
              <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                {stats.published}
              </div>
            </div>
          </div>
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#8b5cf6]/10 opacity-20 blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-500 font-semibold">
                  组件阶段
                </div>
                <Layers className="w-6 h-6 text-[#8b5cf6]" />
              </div>
              <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                {stats.stages}
              </div>
            </div>
          </div>
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#f59e0b]/10 opacity-20 blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-500 font-semibold">
                  总使用次数
                </div>
                <Star className="w-6 h-6 text-[#f59e0b]" />
              </div>
              <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                {stats.totalUsage}
              </div>
            </div>
          </div>
        </div>

        {/* 操作栏 */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-5 border border-white/90 shadow-sm overflow-hidden mb-6">
          <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#8b5cf6]/10 opacity-50 blur-3xl"></div>

          <div className="relative space-y-3">
            {/* 第一行：搜索框和新增按钮 */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="搜索组件名称..."
                  value={filters.search}
                  onChange={(e) =>
                    setFilters({ ...filters, search: e.target.value })
                  }
                  className="w-full pl-10 pr-4 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-5 h-10 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white font-semibold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>新增组件</span>
              </button>
            </div>

            {/* 第二行：筛选条件和批量操作 */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1">
                <select
                  value={filters.stage}
                  onChange={(e) =>
                    setFilters({ ...filters, stage: e.target.value })
                  }
                  className="px-4 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80 whitespace-nowrap"
                >
                  <option value="">全部阶段</option>
                  {types.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
                <select
                  value={filters.published}
                  onChange={(e) =>
                    setFilters({ ...filters, published: e.target.value })
                  }
                  className="px-4 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80 whitespace-nowrap"
                >
                  <option value="">全部状态</option>
                  <option value="true">已上架</option>
                  <option value="false">未上架</option>
                </select>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={filters.startDate}
                    onChange={(e) =>
                      setFilters({ ...filters, startDate: e.target.value })
                    }
                    className="px-3 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80"
                    title="开始日期"
                  />
                  <span className="text-slate-400 font-medium">-</span>
                  <input
                    type="date"
                    value={filters.endDate}
                    onChange={(e) =>
                      setFilters({ ...filters, endDate: e.target.value })
                    }
                    className="px-3 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80"
                    title="结束日期"
                  />
                </div>
              </div>

              {/* 批量操作按钮 */}
              {renderBatchActions()}
            </div>
          </div>
        </div>

        {/* 组件列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 font-medium">加载组件列表中...</p>
            </div>
          </div>
        ) : components.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <PackageIcon className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-500 font-medium text-sm">暂无组件数据</p>
          </div>
        ) : (
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
            <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>

            <div className="relative overflow-x-auto">
              <table className="w-full table-auto">
                <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-center whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={
                          components.length > 0 &&
                          components.every((c) => selectedIds.includes(c.id))
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            // 选中当前页面的所有组件
                            const newIds = Array.from(
                              new Set([...selectedIds, ...components.map((c) => c.id)]),
                            );
                            setSelectedIds(newIds);
                            setSelectedComponents([
                              ...selectedComponents,
                              ...components.filter(
                                (c) => !selectedIds.includes(c.id),
                              ),
                            ]);
                          } else {
                            // 取消选中当前页面的所有组件
                            setSelectedIds(
                              selectedIds.filter((id) => !components.map((c) => c.id).includes(id)),
                            );
                            setSelectedComponents(
                              selectedComponents.filter(
                                (c) => !components.map((comp) => comp.id).includes(c.id),
                              ),
                            );
                          }
                        }}
                        className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]"
                      />
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      组件信息
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      组件阶段
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      上架状态
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      使用次数
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      创建时间
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {components.map((component) => (
                    <tr
                      key={component.id}
                      className={`group transition-all duration-300 ${
                        selectedIds.includes(component.id)
                          ? "bg-blue-50/60"
                          : "hover:bg-white/60"
                      }`}
                    >
                      <td className="py-4 px-6 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(component.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds([...selectedIds, component.id]);
                              setSelectedComponents([
                                ...selectedComponents,
                                component,
                              ]);
                            } else {
                              setSelectedIds(
                                selectedIds.filter((id) => id !== component.id),
                              );
                              setSelectedComponents(
                                selectedComponents.filter(
                                  (c) => c.id !== component.id,
                                ),
                              );
                            }
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-[#3182ce] focus:ring-[#3182ce]"
                        />
                      </td>
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 shrink-0 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-sm">
                            {renderComponentIcon(component.icon)}
                          </div>
                          <div className="min-w-0">
                            <div
                              className="font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate"
                              title={component.name}
                            >
                              {component.name}
                            </div>
                            <div
                              className="text-xs text-slate-500 font-medium truncate"
                              title={component.description || "-"}
                            >
                              {component.description || "-"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="text-sm text-slate-600 font-medium">
                          <div className="font-bold text-slate-800 whitespace-nowrap">
                            {component.type || "-"}
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {component.isPublished ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#10b981]/10 text-[#10b981] whitespace-nowrap">
                              <Eye className="w-3.5 h-3.5 shrink-0" />
                              已上架
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500 whitespace-nowrap">
                              <EyeOff className="w-3.5 h-3.5 shrink-0" />
                              未上架
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="text-sm font-bold text-slate-800">
                          {component.usageCount || 0}
                        </div>
                      </td>
                      <td className="py-4 px-6 whitespace-nowrap">
                        <div className="text-sm text-slate-600 font-medium">
                          {new Date(component.createdAt).toLocaleDateString(
                            "zh-CN",
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {!component.isPublished && (
                            <button
                              onClick={() => openEditModal(component)}
                              className="p-2.5 hover:bg-[#3182ce]/10 rounded-xl transition-all duration-300 group/btn"
                              title="编辑"
                            >
                              <Edit className="w-4.5 h-4.5 text-slate-600 group-hover/btn:text-[#3182ce]" />
                            </button>
                          )}
                          {!component.isPublished && (
                            <button
                              onClick={() => handleDelete(component.id)}
                              className="p-2.5 hover:bg-red-50 rounded-xl transition-all duration-300 group/btn"
                              title="删除"
                            >
                              <Trash2 className="w-4.5 h-4.5 text-red-600 group-hover/btn:text-red-700" />
                            </button>
                          )}
                          {component.isPublished && (
                            <button
                              onClick={() =>
                                handleTogglePublished(
                                  component.id,
                                  component.isPublished,
                                )
                              }
                              className="p-2.5 hover:bg-[#f59e0b]/10 rounded-xl transition-all duration-300 group/btn"
                              title="下架"
                            >
                              <EyeOff className="w-4.5 h-4.5 text-[#f59e0b] group-hover/btn:text-[#d97706]" />
                            </button>
                          )}
                          {!component.isPublished && (
                            <button
                              onClick={() =>
                                handleTogglePublished(
                                  component.id,
                                  component.isPublished,
                                )
                              }
                              className="p-2.5 hover:bg-[#10b981]/10 rounded-xl transition-all duration-300 group/btn"
                              title="上架"
                            >
                              <Eye className="w-4.5 h-4.5 text-[#10b981] group-hover/btn:text-[#059669]" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 分页组件 */}
        {totalPages > 1 && (
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-4 border border-white/90 shadow-sm mt-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-600 font-medium">
                共 {total} 条数据，第 {currentPage} / {totalPages} 页
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setCurrentPage(1);
                  }}
                  disabled={currentPage === 1}
                  className="px-3 h-9 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-all"
                >
                  首页
                </button>
                <button
                  onClick={() => {
                    setCurrentPage(currentPage - 1);
                  }}
                  disabled={currentPage === 1}
                  className="px-3 h-9 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-all"
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
                        onClick={() => setCurrentPage(pageNum)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                          currentPage === pageNum
                            ? "bg-[#3182ce] text-white"
                            : "hover:bg-slate-50 border border-slate-200"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => {
                    setCurrentPage(currentPage + 1);
                  }}
                  disabled={currentPage === totalPages}
                  className="px-3 h-9 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-all"
                >
                  下一页
                </button>
                <button
                  onClick={() => {
                    setCurrentPage(totalPages);
                  }}
                  disabled={currentPage === totalPages}
                  className="px-3 h-9 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-all"
                >
                  末页
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 创建/编辑弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800">
                {editingComponent ? "编辑组件" : "新增组件"}
              </h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* 基本信息 */}
              <div>
                <h3 className="text-lg font-bold text-slate-800 mb-4">
                  基本信息
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      组件名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      placeholder="如：标书智能解析"
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce] ${
                        formData.errors?.name
                          ? "border-red-500"
                          : "border-slate-200"
                      }`}
                    />
                    {formData.errors?.name && (
                      <p className="mt-1 text-xs text-red-500">
                        {formData.errors.name}
                      </p>
                    )}
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      描述
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
                      placeholder="组件功能描述"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      类型/阶段 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.type}
                      onChange={(e) =>
                        setFormData({ ...formData, type: e.target.value })
                      }
                      placeholder="如：第一阶段：商机捕获与售前打单"
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce] ${
                        formData.errors?.type
                          ? "border-red-500"
                          : "border-slate-200"
                      }`}
                    />
                    {formData.errors?.type && (
                      <p className="mt-1 text-xs text-red-500">
                        {formData.errors.type}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      分类
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) =>
                        setFormData({ ...formData, category: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    >
                      <option value="">请选择分类</option>
                      <option value="分析类">分析类</option>
                      <option value="生成类">生成类</option>
                      <option value="工具类">工具类</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      图标
                    </label>
                    <input
                      type="text"
                      value={formData.icon}
                      onChange={(e) =>
                        setFormData({ ...formData, icon: e.target.value })
                      }
                      placeholder="📦"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      标签（逗号分隔）
                    </label>
                    <input
                      type="text"
                      value={formData.tags}
                      onChange={(e) =>
                        setFormData({ ...formData, tags: e.target.value })
                      }
                      placeholder="标书，解析，分析"
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      排序权重
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
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce]"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isPublished}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            isPublished: e.target.checked,
                          })
                        }
                        className="w-4 h-4 text-[#3182ce] rounded focus:ring-[#3182ce]"
                      />
                      <span className="text-sm font-medium text-slate-700">
                        已上架
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-6 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white rounded-lg font-bold hover:shadow-lg hover:shadow-[#3182ce]/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {submitting && (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                {editingComponent ? "更新" : "创建"}
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
