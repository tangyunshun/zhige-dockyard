"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import ConfirmModal from "@/components/ConfirmModal";
import {
  Search,
  Plus,
  ArrowLeft,
  Layers,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  CheckCircle,
  XCircle,
  SortAsc,
  Package,
  Filter,
  Calendar,
  BarChart3,
} from "lucide-react";

interface Stage {
  id: string;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  componentCount: number;
  createdAt: string;
  updatedAt: string;
}

interface StageFormData {
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
}

export default function AdminStagesPage() {
  const router = useRouter();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState<Stage[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  // 筛选条件
  const [filters, setFilters] = useState({
    search: "",
    status: "", // "active" | "inactive" | ""
    createDateStart: "",
    createDateEnd: "",
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  const [formData, setFormData] = useState<
    StageFormData & { errors?: Record<string, string> }
  >({
    name: "",
    description: "",
    sortOrder: 0,
    isActive: true,
    errors: {},
  });
  const [submitting, setSubmitting] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: "info" | "warning" | "danger";
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    type: "info",
    onConfirm: () => {},
  });

  const loadStages = async () => {
    try {
      setLoading(true);
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: "10", // 每页显示 10 条
        ...(filters.search && { search: filters.search }),
        ...(filters.status && { status: filters.status }),
        ...(filters.createDateStart && { createDateStart: filters.createDateStart }),
        ...(filters.createDateEnd && { createDateEnd: filters.createDateEnd }),
      });

      const res = await fetch(`/api/admin/stages?${params}`, {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setStages(data.data.stages);
        setTotalPages(data.data.totalPages);
        setTotal(data.data.total);
      } else {
        const error = await res.json();
        toast.error(error.message || "加载阶段失败");
      }
    } catch (error) {
      console.error("Load stages error:", error);
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStages();
  }, [currentPage, filters]);

  const handleToggleActive = async (id: string, isActive: boolean) => {
    const stage = stages.find((s) => s.id === id);
    if (!stage) {
      toast.error("阶段不存在");
      return;
    }

    const action = isActive ? "禁用" : "启用";
    
    // 如果是禁用操作，需要检查是否有组件
    if (isActive && stage.componentCount > 0) {
      setConfirmModal({
        isOpen: true,
        title: "⚠️ 禁用确认",
        message: `阶段名称：${stage.name}\n\n该阶段下已有 ${stage.componentCount} 个组件。\n\n禁用该阶段后，阶段下的所有组件将自动被禁用。\n\n请确认是否继续？`,
        type: "warning",
        onConfirm: async () => {
          await doToggleActive(id, isActive);
        },
      });
    } else {
      setConfirmModal({
        isOpen: true,
        title: `${action}确认`,
        message: `${action}该阶段后，${isActive ? "将不能" : "可以"}在该阶段下创建新组件。\n\n请确认是否继续？`,
        type: "info",
        onConfirm: async () => {
          await doToggleActive(id, isActive);
        },
      });
    }
  };

  const doToggleActive = async (id: string, isActive: boolean) => {
    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const res = await fetch(`/api/admin/stages?id=${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userId}`,
        },
        body: JSON.stringify({
          id,
          isActive: !isActive,
        }),
      });

      if (res.ok) {
        toast.success(isActive ? "已禁用" : "已启用");
        loadStages();
      } else {
        const error = await res.json();
        toast.error(error.message || "操作失败");
      }
    } catch (error) {
      console.error("Toggle active error:", error);
      toast.error("操作失败");
    }
  };

  const handleDelete = async (id: string) => {
    const stage = stages.find((s) => s.id === id);
    if (!stage) {
      toast.error("阶段不存在");
      return;
    }

    if (stage.componentCount > 0) {
      toast.error(`该阶段下已有 ${stage.componentCount} 个组件，请先移除所有组件后再删除阶段`);
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "⚠️ 删除确认",
      message: `阶段名称：${stage.name}\n\n此操作不可恢复，删除后将无法找回！\n\n请确认是否继续？`,
      type: "danger",
      onConfirm: async () => {
        try {
          const userId =
            typeof window !== "undefined" ? localStorage.getItem("userId") : "";

          const res = await fetch(`/api/admin/stages?id=${id}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${userId}`,
            },
          });

          if (res.ok) {
            toast.success("删除成功");
            setCurrentPage(1); // 删除后回到第 1 页，会自动触发 loadStages
          } else {
            const error = await res.json();
            toast.error(error.message || "删除失败");
          }
        } catch (error) {
          console.error("Delete stage error:", error);
          toast.error("删除失败");
        }
      },
    });
  };

  const openCreateModal = () => {
    setFormData({
      name: "",
      description: "",
      sortOrder:
        stages.length > 0
          ? Math.max(...stages.map((s) => s.sortOrder)) + 1
          : 1,
      isActive: true,
      errors: {},
    });
    setShowCreateModal(true);
  };

  const openEditModal = (stage: Stage) => {
    if (stage.isActive) {
      toast.error("请先禁用阶段才能编辑");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: "编辑确认",
      message: `阶段名称：${stage.name}\n\n编辑后会影响该阶段下的所有组件。\n\n请确认是否继续？`,
      type: "info",
      onConfirm: () => {
        setFormData({
          name: stage.name,
          description: stage.description || "",
          sortOrder: stage.sortOrder,
          isActive: stage.isActive,
          errors: {},
        });
        setEditingStage(stage);
        setShowCreateModal(true);
      },
    });
  };

  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name || !formData.name.trim()) {
      newErrors.name = "请输入阶段名称";
    }

    if (Object.keys(newErrors).length > 0) {
      setFormData({ ...formData, errors: newErrors });
      return;
    }

    setSubmitting(true);

    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      const url = editingStage
        ? `/api/admin/stages?id=${editingStage.id}`
        : "/api/admin/stages";

      const method = editingStage ? "PATCH" : "POST";

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
        toast.success(editingStage ? "更新成功" : "创建成功");
        setShowCreateModal(false);
        loadStages();
      } else {
        toast.error(data.error || "操作失败");
      }
    } catch (error) {
      console.error("Submit stage error:", error);
      toast.error("操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const resetFilters = () => {
    setFilters({
      search: "",
      status: "",
      createDateStart: "",
      createDateEnd: "",
    });
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff] pb-8">
      {/* 顶部标题区 */}
      <div className="bg-white/50 backdrop-blur-sm border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="mb-2">
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">
              阶段管理
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-1">
              管理组件的开发阶段、阶段排序、启用/停用
            </p>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#3182ce]/10 opacity-20 blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-500 font-semibold">
                  总阶段数
                </div>
                <Layers className="w-6 h-6 text-[#3182ce]" />
              </div>
              <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                {total}
              </div>
              <div className="text-xs text-slate-500 font-medium">
                包含标准和自定义阶段
              </div>
            </div>
          </div>
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#10b981]/10 opacity-20 blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-500 font-semibold">
                  已启用
                </div>
                <CheckCircle className="w-6 h-6 text-[#10b981]" />
              </div>
              <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                {stages.filter((s) => s.isActive).length}
              </div>
              <div className="text-xs text-slate-500 font-medium">
                可创建新组件
              </div>
            </div>
          </div>
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#f59e0b]/10 opacity-20 blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-500 font-semibold">
                  已禁用
                </div>
                <XCircle className="w-6 h-6 text-[#f59e0b]" />
              </div>
              <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                {stages.filter((s) => !s.isActive).length}
              </div>
              <div className="text-xs text-slate-500 font-medium">
                不可创建新组件
              </div>
            </div>
          </div>
        </div>

        {/* 操作栏和筛选 */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-5 border border-white/90 shadow-sm overflow-hidden mb-6">
          <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#8b5cf6]/10 opacity-50 blur-3xl"></div>

          <div className="relative space-y-4">
            {/* 第一行：搜索框和新增按钮 */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="搜索阶段名称..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="w-full pl-10 pr-4 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center gap-2 px-5 h-10 bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white font-semibold rounded-xl hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                <span>新增阶段</span>
              </button>
            </div>

            {/* 第二行：筛选条件 */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <Filter className="w-4 h-4" />
                <span>筛选：</span>
              </div>
              
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="px-4 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80 whitespace-nowrap"
              >
                <option value="">全部状态</option>
                <option value="active">已启用</option>
                <option value="inactive">已禁用</option>
              </select>

              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={filters.createDateStart}
                  onChange={(e) => setFilters({ ...filters, createDateStart: e.target.value })}
                  className="px-3 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80"
                  placeholder="开始日期"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="date"
                  value={filters.createDateEnd}
                  onChange={(e) => setFilters({ ...filters, createDateEnd: e.target.value })}
                  className="px-3 h-10 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-sm font-medium transition-all bg-white/80"
                  placeholder="结束日期"
                />
              </div>

              {(filters.status || filters.createDateStart || filters.createDateEnd || filters.search) && (
                <button
                  onClick={resetFilters}
                  className="px-4 h-10 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  重置
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 阶段列表 */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 font-medium">加载阶段列表中...</p>
            </div>
          </div>
        ) : stages.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <Layers className="w-8 h-8 text-slate-400" />
            </div>
            <p className="text-slate-500 font-medium text-sm">暂无阶段数据</p>
          </div>
        ) : (
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 shadow-sm overflow-hidden">
            <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>

            <div className="relative overflow-x-auto">
              <table className="w-full table-auto">
                <thead className="bg-gradient-to-r from-slate-50/80 to-slate-50/50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      阶段信息
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      排序
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      组件数量
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      状态
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
                  {stages.map((stage) => (
                    <tr
                      key={stage.id}
                      className="group hover:bg-white/60 transition-all duration-300"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <Layers className="w-5 h-5 text-[#3182ce]" />
                            <span className="font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                              {stage.name}
                            </span>
                          </div>
                          {stage.description && (
                            <div className="text-xs text-slate-500 font-medium ml-7">
                              {stage.description}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <SortAsc className="w-4 h-4 text-slate-400" />
                          <span className="font-medium">{stage.sortOrder}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-slate-400" />
                          <span className="text-sm font-bold text-slate-800">
                            {stage.componentCount || 0}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {stage.isActive ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-[#10b981]/10 text-[#10b981]">
                            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                            已启用
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500">
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                            已禁用
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-sm text-slate-600 font-medium">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          {new Date(stage.createdAt).toLocaleDateString(
                            "zh-CN",
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          {/* 编辑按钮：只有已禁用的阶段才显示 */}
                          {!stage.isActive && (
                            <button
                              onClick={() => openEditModal(stage)}
                              className="p-2.5 hover:bg-[#3182ce]/10 rounded-xl transition-all duration-300 group/btn"
                              title="编辑"
                            >
                              <Edit className="w-4.5 h-4.5 text-slate-600 group-hover/btn:text-[#3182ce]" />
                            </button>
                          )}
                          {/* 启用/禁用切换按钮：始终显示 */}
                          <button
                            onClick={() =>
                              handleToggleActive(stage.id, stage.isActive)
                            }
                            className="p-2.5 hover:bg-[#f59e0b]/10 rounded-xl transition-all duration-300 group/btn"
                            title={stage.isActive ? "禁用" : "启用"}
                          >
                            {stage.isActive ? (
                              <ToggleRight className="w-4.5 h-4.5 text-[#f59e0b] group-hover/btn:text-[#d97706]" />
                            ) : (
                              <ToggleLeft className="w-4.5 h-4.5 text-[#10b981] group-hover/btn:text-[#059669]" />
                            )}
                          </button>
                          {/* 删除按钮：只有已禁用且无组件的阶段才显示 */}
                          {!stage.isActive && stage.componentCount === 0 && (
                            <button
                              onClick={() => handleDelete(stage.id)}
                              className="p-2.5 hover:bg-red-50 rounded-xl transition-all duration-300 group/btn"
                              title="删除"
                            >
                              <Trash2 className="w-4.5 h-4.5 text-red-600 group-hover/btn:text-red-700" />
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
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 h-9 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-all"
                >
                  首页
                </button>
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-3 h-9 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-all"
                >
                  上一页
                </button>
                <div className="flex items-center gap-1">
                  {Array.from(
                    { length: Math.min(5, totalPages) },
                    (_, i) => {
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
                    },
                  )}
                </div>
                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-3 h-9 rounded-lg border border-slate-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-all"
                >
                  下一页
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
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
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-800">
                {editingStage ? "编辑阶段" : "新增阶段"}
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  阶段名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  placeholder="如：需求分析阶段"
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#3182ce] ${
                    formData.errors?.name ? "border-red-500" : "border-slate-200"
                  }`}
                />
                {formData.errors?.name && (
                  <p className="mt-1 text-xs text-red-500">
                    {formData.errors.name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  阶段描述
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
                  placeholder="阶段功能描述"
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
                <p className="mt-1 text-xs text-slate-500">
                  数值越小越靠前，默认为 1
                </p>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        isActive: e.target.checked,
                      })
                    }
                    className="w-4 h-4 text-[#3182ce] rounded focus:ring-[#3182ce]"
                  />
                  <span className="text-sm font-medium text-slate-700">
                    已启用
                  </span>
                </label>
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
                {editingStage ? "更新" : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 确认对话框 */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        type={confirmModal.type}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />
    </div>
  );
}
