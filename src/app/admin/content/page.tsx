"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/Toast";
import Pagination from "@/components/Pagination";
import { getAuthToken } from "@/utils/auth";
import {
  Search,
  Plus,
  Layers,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  CheckCircle2,
  XCircle,
  Package,
  Calendar,
  RotateCcw,
  X,
  ExternalLink,
  TrendingUp,
  BarChart3,
  Lock,
  ArrowRight,
  CalendarDays,
  AlertTriangle,
  ShieldAlert,
  Info,
  Sparkles,
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

interface StageSummary {
  totalStages: number;
  activeStages: number;
  inactiveStages: number;
  totalComponents: number;
}

interface StageDistributionItem {
  stageId: string;
  stageName: string;
  description?: string;
  sortOrder?: number;
  componentCount: number;
  percentage: number;
  isActive: boolean;
  activityLevel?: "HIGH" | "NORMAL" | "IDLE";
}

interface TrendPoint {
  label: string;
  total: number;
  [stageName: string]: any;
}

interface AnalyticsMetrics {
  activeRate: number;
  topStageName: string;
  topStageCount: number;
  topStagePercentage: number;
  emptyStageCount: number;
  avgComponentsPerStage: number;
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
  const [summary, setSummary] = useState<StageSummary>({
    totalStages: 0,
    activeStages: 0,
    inactiveStages: 0,
    totalComponents: 0,
  });

  // 页面 Tab 切换：'list' 为阶段管理列表，'analytics' 为阶段使用趋势与分布
  const [activeTab, setActiveTab] = useState<"list" | "analytics">("list");

  // 趋势分析的时间跨度筛选：'week' | 'month' | 'halfYear' | 'year' | 'custom'
  const [timeRange, setTimeRange] = useState<"week" | "month" | "halfYear" | "year" | "custom">("halfYear");
  const [analyticsCustomStart, setAnalyticsCustomStart] = useState("");
  const [analyticsCustomEnd, setAnalyticsCustomEnd] = useState("");
  const [distributionData, setDistributionData] = useState<StageDistributionItem[]>([]);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [metrics, setMetrics] = useState<AnalyticsMetrics>({
    activeRate: 0,
    topStageName: "暂无",
    topStageCount: 0,
    topStagePercentage: 0,
    emptyStageCount: 0,
    avgComponentsPerStage: 0,
  });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingStage, setEditingStage] = useState<Stage | null>(null);

  // 列表筛选条件
  const [filters, setFilters] = useState({
    search: "",
    status: "", // "active" | "inactive" | ""
    createDateStart: "",
    createDateEnd: "",
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
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

  // 统一的高级业务操作弹窗状态（涵盖：禁用确认、启用确认、删除确认、安全阻断提示）
  const [actionModal, setActionModal] = useState<{
    isOpen: boolean;
    type: "disable" | "enable" | "delete" | "blocked";
    stage: Stage | null;
  }>({
    isOpen: false,
    type: "disable",
    stage: null,
  });
  const [actionSubmitting, setActionSubmitting] = useState(false);

  // 加载数据
  const loadStages = async () => {
    try {
      setLoading(true);
      const authToken = getAuthToken();

      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: pageSize.toString(),
        timeRange,
        ...(filters.search && { search: filters.search.trim() }),
        ...(filters.status && { status: filters.status }),
        ...(filters.createDateStart && { createDateStart: filters.createDateStart }),
        ...(filters.createDateEnd && { createDateEnd: filters.createDateEnd }),
        ...(timeRange === "custom" && analyticsCustomStart && { analyticsStart: analyticsCustomStart }),
        ...(timeRange === "custom" && analyticsCustomEnd && { analyticsEnd: analyticsCustomEnd }),
      });

      const res = await fetch(`/api/admin/stages?${params}`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (res.ok) {
        const result = await res.json();
        const stageData = result.data.stages || [];
        setStages(stageData);
        setTotalPages(result.data.totalPages || 1);
        setTotal(result.data.total || 0);

        if (result.data.summary) {
          setSummary(result.data.summary);
        } else {
          setSummary({
            totalStages: result.data.total || stageData.length,
            activeStages: stageData.filter((s: Stage) => s.isActive).length,
            inactiveStages: stageData.filter((s: Stage) => !s.isActive).length,
            totalComponents: stageData.reduce((acc: number, s: Stage) => acc + (s.componentCount || 0), 0),
          });
        }

        if (result.data.analytics) {
          setDistributionData(result.data.analytics.distribution || []);
          setTrendData(result.data.analytics.trend || []);
          if (result.data.analytics.metrics) {
            setMetrics(result.data.analytics.metrics);
          }
        }
      } else {
        const error = await res.json();
        toast.error(error.message || "加载阶段数据失败");
      }
    } catch (error) {
      console.error("Load stages error:", error);
      toast.error("网络异常，加载阶段列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStages();
  }, [currentPage, filters, timeRange, analyticsCustomStart, analyticsCustomEnd]);

  // 启停切换（含严密前置业务判断：有在用组件禁止直接禁用）
  const handleToggleActive = (stage: Stage) => {
    // 若当前是已启用，准备禁用
    if (stage.isActive) {
      // 核心业务规则：如果该阶段名下有正在使用的组件，全面阻断拦截
      if (stage.componentCount > 0) {
        setActionModal({
          isOpen: true,
          type: "blocked",
          stage,
        });
        return;
      }

      // 名下无组件，打开禁用确认弹窗
      setActionModal({
        isOpen: true,
        type: "disable",
        stage,
      });
    } else {
      // 当前是已停用，打开启用确认弹窗
      setActionModal({
        isOpen: true,
        type: "enable",
        stage,
      });
    }
  };

  const doToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const authToken = getAuthToken();

      const res = await fetch(`/api/admin/stages?id=${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          id,
          isActive: !currentActive,
        }),
      });

      if (res.ok) {
        toast.success(`阶段分类已成功${currentActive ? "禁用" : "启用"}`);
        loadStages();
      } else {
        const error = await res.json();
        toast.error(error.message || "更新状态失败");
      }
    } catch (error) {
      console.error("Toggle active error:", error);
      toast.error("请求失败，请稍后重试");
    }
  };

  // 删除阶段（核心业务规则：只有禁用的阶段才能删除，且有组件禁止删除）
  const handleDelete = (stage: Stage) => {
    if (stage.isActive) {
      toast.error("已启用的阶段不可直接删除，请先停用该阶段");
      return;
    }

    if (stage.componentCount > 0) {
      toast.error(`该阶段尚有 ${stage.componentCount} 个组件在使用，必须先清空关联组件后再删除`);
      return;
    }

    setActionModal({
      isOpen: true,
      type: "delete",
      stage,
    });
  };

  // 确认执行高级弹窗操作（禁用 / 启用 / 删除）
  const handleExecuteAction = async () => {
    if (!actionModal.stage) return;
    setActionSubmitting(true);
    try {
      if (actionModal.type === "disable") {
        await doToggleActive(actionModal.stage.id, true);
        setActionModal((prev) => ({ ...prev, isOpen: false }));
      } else if (actionModal.type === "enable") {
        await doToggleActive(actionModal.stage.id, false);
        setActionModal((prev) => ({ ...prev, isOpen: false }));
      } else if (actionModal.type === "delete") {
        const authToken = getAuthToken();
        const res = await fetch(`/api/admin/stages?id=${actionModal.stage.id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        });

        if (res.ok) {
          toast.success("阶段分类已成功删除");
          setActionModal((prev) => ({ ...prev, isOpen: false }));
          if (stages.length === 1 && currentPage > 1) {
            setCurrentPage(currentPage - 1);
          } else {
            loadStages();
          }
        } else {
          const error = await res.json();
          toast.error(error.message || "删除阶段失败");
        }
      }
    } catch (err) {
      console.error("Execute action error:", err);
      toast.error("操作执行出现异常");
    } finally {
      setActionSubmitting(false);
    }
  };

  // 打开创建模态框
  const openCreateModal = () => {
    const nextOrder =
      stages.length > 0
        ? Math.max(...stages.map((s) => s.sortOrder)) + 1
        : 1;

    setFormData({
      name: "",
      description: "",
      sortOrder: nextOrder,
      isActive: true,
      errors: {},
    });
    setEditingStage(null);
    setShowCreateModal(true);
  };

  // 打开编辑模态框（核心业务规则：启用的阶段不能编辑！只有禁用的阶段才能编辑）
  const openEditModal = (stage: Stage) => {
    if (stage.isActive) {
      toast.error("已启用的阶段不可直接编辑！请先将该阶段禁用后再编辑");
      return;
    }

    setFormData({
      name: stage.name,
      description: stage.description || "",
      sortOrder: stage.sortOrder,
      isActive: stage.isActive,
      errors: {},
    });
    setEditingStage(stage);
    setShowCreateModal(true);
  };

  // 验证表单合法性（名称 1-10 字必填，职责说明最多 50 字）
  const isNameValid = Boolean(formData.name && formData.name.trim().length > 0 && formData.name.trim().length <= 10);
  const isDescValid = (formData.description || "").trim().length <= 50;
  const isFormValid = isNameValid && isDescValid;

  // 提交保存
  const handleSubmit = async () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name || !formData.name.trim()) {
      newErrors.name = "请输入阶段分类名称";
    } else if (formData.name.trim().length > 10) {
      newErrors.name = "阶段分类名称不能超过 10 个字";
    }

    if (formData.description && formData.description.trim().length > 50) {
      newErrors.description = "分类职责说明不能超过 50 个字";
    }

    if (Object.keys(newErrors).length > 0) {
      setFormData({ ...formData, errors: newErrors });
      return;
    }

    setSubmitting(true);
    try {
      const authToken = getAuthToken();
      const url = editingStage
        ? `/api/admin/stages?id=${editingStage.id}`
        : "/api/admin/stages";

      const method = editingStage ? "PATCH" : "POST";

      const payload = {
        name: formData.name.trim(),
        description: formData.description?.trim() || "",
        sortOrder: Number(formData.sortOrder) || 0,
        isActive: formData.isActive,
      };

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (res.ok) {
        toast.success(editingStage ? "阶段配置已更新" : "新建阶段分类成功");
        setShowCreateModal(false);
        loadStages();
      } else {
        toast.error(data.error || "保存失败，请检查输入");
      }
    } catch (error) {
      console.error("Submit stage error:", error);
      toast.error("提交保存出现异常");
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

  // 计算趋势图表的最大高度基准
  const maxTrendTotal = Math.max(1, ...trendData.map((t) => t.total || 0));

  return (
    <div className="min-h-screen bg-[#f0f8ff] text-slate-800 pb-12 font-sans text-left">
      {/* 顶部标题区 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                  组件阶段管理
                </h1>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  维护系统组件的分类标准与生命周期阶段，为平台组件库提供统一的归属大纲
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/admin/components"
              className="h-9 px-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors inline-flex items-center gap-1.5"
              title="前往组件矩阵查看全量组件列表"
            >
              <Package className="w-4 h-4 text-[#3182ce]" />
              <span>查看组件矩阵</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </Link>
            <button
              onClick={openCreateModal}
              className="h-9 px-4 bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold rounded-xl shadow-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>新增阶段分类</span>
            </button>
          </div>
        </div>

        {/* 4 大标准指标统计卡片（小巧规整，数字不溢出） */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-bold mb-1">阶段分类总数</div>
              <div className="text-2xl font-black font-mono text-[#3182ce]">
                {summary.totalStages} <span className="text-xs font-normal text-slate-400">个</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold">
              <Layers className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-bold mb-1">正常启用分类</div>
              <div className="text-2xl font-black font-mono text-emerald-600">
                {summary.activeStages} <span className="text-xs font-normal text-slate-400">个</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-bold mb-1">已停用分类</div>
              <div className="text-2xl font-black font-mono text-amber-600">
                {summary.inactiveStages} <span className="text-xs font-normal text-slate-400">个</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
              <XCircle className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500 font-bold mb-1">已纳管组件总计</div>
              <div className="text-2xl font-black font-mono text-slate-800">
                {summary.totalComponents} <span className="text-xs font-normal text-slate-400">个</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
              <Package className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* 页面主 Tab 切换栏（阶段管理列表 VS 阶段使用趋势） */}
        <div className="flex items-center gap-2 border-b border-slate-200 mb-6 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("list")}
            className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 inline-flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === "list"
                ? "border-[#3182ce] text-[#3182ce]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Layers className="w-4 h-4" />
            <span className="whitespace-nowrap">阶段管理列表</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-600 font-mono whitespace-nowrap">
              {summary.totalStages}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("analytics")}
            className={`pb-3 px-4 text-xs font-bold transition-all border-b-2 inline-flex items-center gap-2 cursor-pointer whitespace-nowrap ${
              activeTab === "analytics"
                ? "border-[#3182ce] text-[#3182ce]"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span className="whitespace-nowrap">阶段使用趋势与分布分析</span>
          </button>
        </div>

        {/* ===================== TAB 1：阶段管理列表 ===================== */}
        {activeTab === "list" ? (
          <div>
            {/* 搜索与筛选工具栏 */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between mb-6">
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="搜索阶段分类名称或说明..."
                  value={filters.search}
                  onChange={(e) => {
                    setFilters({ ...filters, search: e.target.value });
                    setCurrentPage(1);
                  }}
                  className="w-full h-10 pl-9 pr-4 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:bg-white focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/10 outline-none transition-all"
                />
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={filters.status}
                  onChange={(e) => {
                    setFilters({ ...filters, status: e.target.value });
                    setCurrentPage(1);
                  }}
                  className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <option value="">全部状态</option>
                  <option value="active">已启用</option>
                  <option value="inactive">已禁用</option>
                </select>

                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-3 h-10">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="date"
                    value={filters.createDateStart}
                    onChange={(e) => {
                      setFilters({ ...filters, createDateStart: e.target.value });
                      setCurrentPage(1);
                    }}
                    className="border-none outline-none text-xs font-bold text-slate-700 bg-transparent p-0 w-28"
                    title="起始创建日期"
                  />
                  <span className="text-slate-300">-</span>
                  <input
                    type="date"
                    value={filters.createDateEnd}
                    onChange={(e) => {
                      setFilters({ ...filters, createDateEnd: e.target.value });
                      setCurrentPage(1);
                    }}
                    className="border-none outline-none text-xs font-bold text-slate-700 bg-transparent p-0 w-28"
                    title="截止创建日期"
                  />
                </div>

                {(filters.search || filters.status || filters.createDateStart || filters.createDateEnd) && (
                  <button
                    onClick={resetFilters}
                    className="h-10 px-3 bg-slate-100 hover:bg-slate-200/80 text-slate-600 text-xs font-bold rounded-xl transition-colors cursor-pointer inline-flex items-center gap-1"
                    title="清空所有筛选条件"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>重置</span>
                  </button>
                )}
              </div>
            </div>

            {/* 表格内容展示区 */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              {loading ? (
                <div className="p-16 text-center">
                  <div className="w-8 h-8 border-3 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-xs font-bold text-slate-500">正在加载阶段分类列表...</p>
                </div>
              ) : stages.length === 0 ? (
                <div className="p-16 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#3182ce] flex items-center justify-center mx-auto mb-3 border border-blue-100">
                    <Layers className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-700 mb-1">未找到匹配的阶段分类</h3>
                  <p className="text-xs text-slate-400 mb-4">
                    当前暂无符合条件的阶段数据，您可以点击新增阶段分类
                  </p>
                  <button
                    onClick={openCreateModal}
                    className="h-9 px-4 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-xs font-bold transition-all shadow-xs inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增阶段分类</span>
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[780px]">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                        {/* 列 1：阶段名称与描述（排第一） */}
                        <th className="py-3.5 px-5 whitespace-nowrap">阶段分类名称与说明</th>
                        {/* 列 2：包含组件数量 */}
                        <th className="py-3.5 px-5 whitespace-nowrap">关联组件数</th>
                        {/* 列 3：排序权重（后移） */}
                        <th className="py-3.5 px-5 whitespace-nowrap text-center">排序权重</th>
                        {/* 列 4：当前状态 */}
                        <th className="py-3.5 px-5 whitespace-nowrap">当前状态</th>
                        {/* 列 5：创建时间 */}
                        <th className="py-3.5 px-5 whitespace-nowrap">创建时间</th>
                        {/* 列 6：操作（固定在最右侧） */}
                        <th className="py-3.5 px-5 whitespace-nowrap text-right sticky right-0 bg-slate-50/95 backdrop-blur-xs border-l border-slate-200/80 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.05)]">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {stages.map((stage) => (
                        <tr
                          key={stage.id}
                          className="hover:bg-blue-50/30 transition-colors group"
                        >
                          {/* 列 1：阶段分类名称与说明（彻底消除折行/竖排） */}
                          <td className="py-3.5 px-5 whitespace-nowrap">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#3182ce] border border-blue-100 flex items-center justify-center shrink-0">
                                <Layers className="w-4 h-4" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-2 whitespace-nowrap">
                                  <span className="font-bold text-slate-900 text-sm group-hover:text-[#3182ce] transition-colors whitespace-nowrap">
                                    {stage.name}
                                  </span>
                                  {stage.isActive && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80 whitespace-nowrap shrink-0 inline-flex items-center">
                                      可添加组件
                                    </span>
                                  )}
                                </div>
                                {stage.description ? (
                                  <span
                                    className="text-[11px] text-slate-500 font-medium mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-xs block"
                                    title={stage.description}
                                  >
                                    {stage.description}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-400 italic mt-0.5 whitespace-nowrap block">
                                    暂无说明
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 列 2：关联组件数 */}
                          <td className="py-3.5 px-5 whitespace-nowrap">
                            <Link
                              href={`/admin/components?stage=${encodeURIComponent(stage.name)}`}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-[#3182ce] border border-slate-200/80 hover:border-[#3182ce]/30 font-bold transition-all text-xs"
                              title="点击查看归属此阶段的所有组件"
                            >
                              <Package className="w-3.5 h-3.5 text-[#3182ce]" />
                              <span>{stage.componentCount || 0} 个组件</span>
                              <ExternalLink className="w-3 h-3 text-slate-400" />
                            </Link>
                          </td>

                          {/* 列 3：排序权重（后移） */}
                          <td className="py-3.5 px-5 whitespace-nowrap text-center">
                            <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg bg-slate-100 text-slate-700 font-mono font-bold text-xs border border-slate-200">
                              {stage.sortOrder}
                            </span>
                          </td>

                          {/* 列 4：当前状态 */}
                          <td className="py-3.5 px-5 whitespace-nowrap">
                            {stage.isActive ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200/70">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>正常启用</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200/80">
                                <XCircle className="w-3.5 h-3.5" />
                                <span>已停用</span>
                              </span>
                            )}
                          </td>

                          {/* 列 5：创建时间 */}
                          <td className="py-3.5 px-5 whitespace-nowrap text-slate-500 font-medium text-xs font-mono">
                            {new Date(stage.createdAt).toLocaleDateString("zh-CN", {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                            })}
                          </td>

                          {/* 列 6：操作列（按用户指令：启用状态下直接隐藏编辑和删除，只保留禁用；停用状态下展示编辑、启用、删除） */}
                          <td className="py-3.5 px-5 whitespace-nowrap text-right sticky right-0 bg-white/95 group-hover:bg-blue-50/95 backdrop-blur-xs border-l border-slate-200/80 shadow-[-6px_0_10px_-4px_rgba(0,0,0,0.05)] transition-colors">
                            <div className="flex items-center justify-end gap-2">
                              {stage.isActive ? (
                                /* 启用状态下：直接隐藏编辑与删除，只显示【禁用】按钮 */
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(stage)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white transition-all duration-200 cursor-pointer shadow-2xs border border-amber-200/60 hover:border-amber-500"
                                  title="禁用此阶段分类（名下有在用组件时会前置拦截保护）"
                                >
                                  <ToggleRight className="w-3.5 h-3.5" />
                                  <span>禁用</span>
                                </button>
                              ) : (
                                /* 停用状态下：展示编辑、启用、删除 */
                                <>
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(stage)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-blue-50 text-[#3182ce] hover:bg-[#3182ce] hover:text-white transition-all duration-200 cursor-pointer shadow-2xs border border-blue-200/60 hover:border-[#3182ce]"
                                    title="编辑阶段信息与职责说明"
                                  >
                                    <Edit className="w-3.5 h-3.5" />
                                    <span>编辑</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleToggleActive(stage)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all duration-200 cursor-pointer shadow-2xs border border-emerald-200/60 hover:border-emerald-600"
                                    title="恢复启用此阶段分类"
                                  >
                                    <ToggleLeft className="w-3.5 h-3.5" />
                                    <span>启用</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDelete(stage)}
                                    disabled={stage.componentCount > 0}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition-all duration-200 shadow-2xs ${
                                      stage.componentCount > 0
                                        ? "bg-slate-100 text-slate-300 cursor-not-allowed border border-slate-200"
                                        : "bg-red-50 text-red-600 hover:bg-red-600 hover:text-white cursor-pointer border border-red-200/60 hover:border-red-600"
                                    }`}
                                    title={
                                      stage.componentCount > 0
                                        ? `该分类下仍有 ${stage.componentCount} 个组件，不可删除`
                                        : "永久删除该阶段分类"
                                    }
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>删除</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* 分页组件 */}
              {total > 0 && (
                <div className="p-4 border-t border-slate-200/80 bg-slate-50/50">
                  <Pagination
                    currentPage={currentPage}
                    totalItems={total}
                    pageSize={pageSize}
                    onPageChange={(page) => setCurrentPage(page)}
                    itemLabel="个阶段分类"
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ===================== TAB 2：阶段使用趋势与分布分析 ===================== */
          <div className="space-y-6">
            {/* 时间跨度筛选控制栏 */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 whitespace-nowrap">
                  <CalendarDays className="w-4 h-4 text-[#3182ce]" />
                  <span>统计时间周期：</span>
                </span>
                <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTimeRange("week")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      timeRange === "week"
                        ? "bg-white text-[#3182ce] shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    本周
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeRange("month")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      timeRange === "month"
                        ? "bg-white text-[#3182ce] shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    本月
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeRange("halfYear")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      timeRange === "halfYear"
                        ? "bg-white text-[#3182ce] shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    近半年
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeRange("year")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      timeRange === "year"
                        ? "bg-white text-[#3182ce] shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    本年度
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimeRange("custom")}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      timeRange === "custom"
                        ? "bg-white text-[#3182ce] shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    自定义日期
                  </button>
                </div>
              </div>

              {/* 自定义日期区间输入 */}
              {timeRange === "custom" && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-3 h-9">
                    <input
                      type="date"
                      value={analyticsCustomStart}
                      onChange={(e) => setAnalyticsCustomStart(e.target.value)}
                      className="border-none outline-none text-xs font-bold text-slate-700 bg-transparent p-0 w-28"
                    />
                    <span className="text-slate-300">-</span>
                    <input
                      type="date"
                      value={analyticsCustomEnd}
                      onChange={(e) => setAnalyticsCustomEnd(e.target.value)}
                      className="border-none outline-none text-xs font-bold text-slate-700 bg-transparent p-0 w-28"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 4 大多维全景分析指标卡片 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-bold mb-1 whitespace-nowrap">阶段分类就绪率</div>
                  <div className="text-2xl font-black font-mono text-emerald-600">
                    {metrics.activeRate} <span className="text-xs font-normal text-slate-400">%</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium mt-1 whitespace-nowrap">
                    已启用 {summary.activeStages} / 共 {summary.totalStages} 个阶段
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-bold mb-1 whitespace-nowrap">组件最高集中阶段</div>
                  <div className="text-lg font-black text-slate-800 truncate max-w-[140px] whitespace-nowrap" title={metrics.topStageName}>
                    {metrics.topStageName}
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium mt-1 whitespace-nowrap">
                    纳管 <strong className="text-slate-700 font-mono">{metrics.topStageCount}</strong> 个 (占比 {metrics.topStagePercentage}%)
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-bold mb-1 whitespace-nowrap">平均纳管组件负载</div>
                  <div className="text-2xl font-black font-mono text-[#3182ce]">
                    {metrics.avgComponentsPerStage} <span className="text-xs font-normal text-slate-400">个/阶段</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium mt-1 whitespace-nowrap">
                    全周期平均阶段挂载密度
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold shrink-0">
                  <Package className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-bold mb-1 whitespace-nowrap">待挂载空闲阶段</div>
                  <div className="text-2xl font-black font-mono text-amber-600">
                    {metrics.emptyStageCount} <span className="text-xs font-normal text-slate-400">个</span>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium mt-1 whitespace-nowrap">
                    当前暂未关联组件的阶段
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* 趋势图与分布图双排布局 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 左侧 2 栏：阶段组件新增与使用趋势折线图/面积图 */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-4 rounded-full bg-[#3182ce]" />
                      <h3 className="text-sm font-black text-slate-800 whitespace-nowrap">
                        组件归属与使用增长趋势
                      </h3>
                    </div>
                    <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
                      单位：组件数量 (个)
                    </span>
                  </div>

                  {/* 柱状/趋势曲线模拟展示区 */}
                  <div className="h-64 flex items-end justify-between gap-3 pt-8 px-4 pb-2 border-b border-slate-100 relative">
                    {/* 背景网格线 */}
                    <div className="absolute inset-x-4 top-8 border-b border-dashed border-slate-100 pointer-events-none" />
                    <div className="absolute inset-x-4 top-24 border-b border-dashed border-slate-100 pointer-events-none" />
                    <div className="absolute inset-x-4 top-40 border-b border-dashed border-slate-100 pointer-events-none" />

                    {trendData.map((pt, idx) => {
                      const heightPercent = Math.max(8, Math.round(((pt.total || 0) / maxTrendTotal) * 85));
                      return (
                        <div
                          key={idx}
                          className="flex-1 flex flex-col items-center gap-2 h-full justify-end group relative"
                        >
                          {/* 悬浮提示框 */}
                          <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-slate-900 text-white text-[11px] py-1 px-2.5 rounded-lg shadow-lg whitespace-nowrap z-20">
                            {pt.label} : <strong>{pt.total || 0}</strong> 个组件
                          </div>

                          {/* 柱体与数值 */}
                          <span className="text-[11px] font-bold font-mono text-slate-500 group-hover:text-[#3182ce] transition-colors whitespace-nowrap">
                            {pt.total || 0}
                          </span>
                          <div
                            style={{ height: `${heightPercent}%` }}
                            className="w-full max-w-[42px] bg-gradient-to-t from-[#2b6cb0] to-[#4299e1] rounded-t-xl group-hover:from-[#3182ce] group-hover:to-[#63b3ed] transition-all duration-300 shadow-2xs"
                          />
                          <span className="text-[11px] text-slate-400 font-mono font-medium mt-1 whitespace-nowrap">
                            {pt.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-4 flex items-center justify-between text-xs text-slate-500 flex-wrap gap-2">
                  <span className="font-medium whitespace-nowrap">
                    当前周期内累计挂载与更新组件：<strong className="text-slate-800 font-bold font-mono">{summary.totalComponents}</strong> 个
                  </span>
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">
                    数据来源：全生命周期组件任务配置表
                  </span>
                </div>
              </div>

              {/* 右侧 1 栏：各阶段组件数量占比与分布进度 */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs flex flex-col">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-4 rounded-full bg-purple-500" />
                    <h3 className="text-sm font-black text-slate-800 whitespace-nowrap">
                      各阶段组件数量与占比分布
                    </h3>
                  </div>
                  <span className="text-xs text-slate-400 font-medium font-mono whitespace-nowrap">
                    共 {distributionData.length} 个阶段
                  </span>
                </div>

                {distributionData.length === 0 ? (
                  <div className="py-16 text-center text-xs text-slate-400 whitespace-nowrap">
                    暂无阶段分布数据
                  </div>
                ) : (
                  <div className="space-y-4 flex-1 overflow-y-auto max-h-[380px] pr-1">
                    {distributionData.map((item) => (
                      <div key={item.stageId} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs whitespace-nowrap">
                          <span className="font-bold text-slate-800 flex items-center gap-1.5 whitespace-nowrap">
                            <span className="truncate max-w-[130px]" title={item.stageName}>{item.stageName}</span>
                            {!item.isActive && (
                              <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 whitespace-nowrap shrink-0">
                                已停用
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-slate-500 whitespace-nowrap">
                            <strong>{item.componentCount}</strong> 个 ({item.percentage}%)
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            style={{ width: `${Math.min(100, Math.max(item.percentage, item.componentCount > 0 ? 5 : 0))}%` }}
                            className={`h-full rounded-full transition-all duration-500 ${
                              item.isActive ? "bg-[#3182ce]" : "bg-slate-400"
                            }`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 底部全景矩阵：各阶段全生命周期健康度与纳管明细表格 */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-4 rounded-full bg-emerald-500" />
                  <h3 className="text-sm font-black text-slate-800 whitespace-nowrap">
                    各阶段生命周期健康度与组件纳管明细矩阵
                  </h3>
                </div>
                <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
                  用于评估组件在各个开发阶段的流动均衡性与覆盖度
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[760px]">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                      <th className="py-3 px-5 whitespace-nowrap">阶段分类名称</th>
                      <th className="py-3 px-5 whitespace-nowrap">当前状态</th>
                      <th className="py-3 px-5 whitespace-nowrap">纳管组件数</th>
                      <th className="py-3 px-5 whitespace-nowrap">全平台占比</th>
                      <th className="py-3 px-5 whitespace-nowrap">活跃负载等级</th>
                      <th className="py-3 px-5 whitespace-nowrap text-right">快捷直达</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {distributionData.map((item) => (
                      <tr key={item.stageId} className="hover:bg-blue-50/30 transition-colors">
                        <td className="py-3 px-5 whitespace-nowrap">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center font-bold shrink-0">
                              <Layers className="w-3.5 h-3.5" />
                            </div>
                            <div>
                              <span className="font-bold text-slate-900 whitespace-nowrap">{item.stageName}</span>
                              {item.description && (
                                <p className="text-[11px] text-slate-400 truncate max-w-xs whitespace-nowrap" title={item.description}>
                                  {item.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-5 whitespace-nowrap">
                          {item.isActive ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200/70">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>正常启用</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200/80">
                              <XCircle className="w-3 h-3" />
                              <span>已停用</span>
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-5 whitespace-nowrap font-mono font-bold text-slate-700">
                          {item.componentCount} 个组件
                        </td>

                        <td className="py-3 px-5 whitespace-nowrap">
                          <div className="flex items-center gap-2 max-w-[140px]">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${Math.min(100, item.percentage)}%` }}
                                className={`h-full rounded-full ${item.isActive ? "bg-[#3182ce]" : "bg-slate-400"}`}
                              />
                            </div>
                            <span className="font-mono text-slate-500 text-[11px] font-bold w-10 text-right">
                              {item.percentage}%
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-5 whitespace-nowrap">
                          {item.componentCount > 5 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-blue-50 text-[#3182ce] border border-blue-200/60">
                              高密度核心
                            </span>
                          ) : item.componentCount > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                              均衡运行
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-400 border border-slate-200/60">
                              待挂载
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-5 whitespace-nowrap text-right">
                          <Link
                            href={`/admin/components?stage=${encodeURIComponent(item.stageName)}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-[#3182ce] text-xs font-bold transition-colors"
                          >
                            <span>查看组件</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ==================== 1. 新增 / 编辑阶段分类模态框 (全系统统一大厂设计规范) ==================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden text-left font-sans animate-in zoom-in-95 duration-200">
            {/* 对话框头部：知阁专属知性蓝渐变 */}
            <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] p-5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center shadow-xs">
                  {editingStage ? <Edit className="w-5 h-5 text-white" /> : <Plus className="w-5 h-5 text-white" />}
                </div>
                <div>
                  <h3 className="font-black text-sm tracking-tight text-white flex items-center gap-2">
                    <span>{editingStage ? `编辑阶段分类配置` : "新增阶段分类"}</span>
                    {editingStage && (
                      <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-normal">
                        {editingStage.name}
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-blue-100 font-medium mt-0.5">
                    {editingStage
                      ? "维护生命周期阶段大纲与排序规范，变更后即刻同步至全生命周期任务矩阵"
                      : "定义系统全生命周期阶段大纲，为平台组件提供标准归属规范"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer transition-colors text-white"
                title="关闭"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 表单内容区：Bento 卡片分组 */}
            <div className="p-6 space-y-4 flex-1 min-h-0 overflow-y-auto bg-slate-50/40">
              {/* 卡片 1：核心基本信息 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <div className="w-2 h-3.5 rounded-full bg-[#3182ce]" />
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    核心基本信息
                  </h4>
                </div>

                {/* 分类名称 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                      <span>阶段分类名称</span>
                      <span className="text-red-500 font-bold">*</span>
                    </label>
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded-md ${
                        formData.name.trim().length > 10
                          ? "bg-red-50 text-red-600 font-bold border border-red-200"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {formData.name.trim().length} / 10 字
                    </span>
                  </div>
                  <input
                    type="text"
                    maxLength={10}
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        name: e.target.value,
                        errors: { ...formData.errors, name: "" },
                      })
                    }
                    placeholder="如：需求分析、核心开发、质量回归、发布上线（最多10字）"
                    className={`w-full px-3.5 h-10 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 text-xs font-bold text-slate-800 transition-all bg-slate-50/50 focus:bg-white ${
                      formData.errors?.name
                        ? "border-red-400 focus:border-red-500"
                        : "border-slate-200 focus:border-[#3182ce]"
                    }`}
                  />
                  {formData.errors?.name && (
                    <p className="mt-1 text-[11px] text-red-500 font-bold">
                      {formData.errors.name}
                    </p>
                  )}
                </div>

                {/* 分类职责说明 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      分类职责说明
                    </label>
                    <span
                      className={`text-[11px] font-mono px-2 py-0.5 rounded-md ${
                        (formData.description || "").trim().length > 50
                          ? "bg-red-50 text-red-600 font-bold border border-red-200"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {(formData.description || "").trim().length} / 50 字
                    </span>
                  </div>
                  <textarea
                    value={formData.description}
                    maxLength={50}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        description: e.target.value,
                      })
                    }
                    rows={3}
                    placeholder="简述该阶段所涵盖的工作范围，帮助创作者在发布组件时准确归类（最多50字）..."
                    className="w-full p-3 bg-slate-50/50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] text-xs font-medium text-slate-700 transition-all resize-none focus:bg-white leading-relaxed"
                  />
                </div>
              </div>

              {/* 卡片 2：生命周期调度与状态 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
                  <div className="w-2 h-3.5 rounded-full bg-emerald-500" />
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    编排顺序与状态控制
                  </h4>
                </div>

                {/* 排序权重 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      排序权重 (数值越小越靠前)
                    </label>
                    <span className="text-[11px] text-slate-400 font-medium">
                      默认按权重正序排列展示
                    </span>
                  </div>
                  <input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sortOrder: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    className="w-full px-3.5 h-10 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#3182ce]/20 focus:border-[#3182ce] text-xs font-bold text-slate-800 transition-all bg-slate-50/50 focus:bg-white font-mono"
                  />
                </div>

                {/* 启用状态切换卡片 */}
                <div className="pt-1">
                  <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 cursor-pointer transition-colors select-none">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                        formData.isActive ? "bg-emerald-50 text-emerald-600 border border-emerald-200" : "bg-slate-100 text-slate-400"
                      }`}>
                        {formData.isActive ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      </div>
                      <div>
                        <span className="text-xs font-bold text-slate-800 block">
                          设为正常启用状态
                        </span>
                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                          启用后创作者在发布新组件时即可选择归属于该分类
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          isActive: e.target.checked,
                        })
                      }
                      className="w-4 h-4 text-[#3182ce] rounded border-slate-300 focus:ring-[#3182ce]"
                    />
                  </label>
                </div>
              </div>

              {/* 业务规范提示卡片 */}
              <div className="p-3.5 bg-blue-50/80 border border-blue-100/80 rounded-xl flex items-start gap-2.5 text-xs text-blue-900">
                <Info className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong>规范提醒：</strong>
                  阶段分类作为组件生命周期的顶层纲目，一旦设为启用，建议保持其命名与职责稳定。名下纳管有线上组件时将受到系统级安全保护，不可随意废弃。
                </div>
              </div>
            </div>

            {/* 对话框操作按钮区 */}
            <div className="sticky bottom-0 bg-white border-t border-slate-200/80 px-6 py-4 flex items-center justify-between shrink-0">
              <div className="text-xs font-medium">
                {!isNameValid ? (
                  <span className="text-amber-600 flex items-center gap-1 text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>请输入 1-10 字的阶段分类名称</span>
                  </span>
                ) : !isDescValid ? (
                  <span className="text-amber-600 flex items-center gap-1 text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>分类职责说明不能超过 50 字</span>
                  </span>
                ) : (
                  <span className="text-emerald-600 flex items-center gap-1 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>表单填写符合规范要求</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 h-9 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  取消
                </button>
                <div
                  title={
                    !isFormValid
                      ? "信息未按要求填写完整，请填写阶段分类名称（1-10字内）"
                      : editingStage
                      ? "点击保存阶段分类更新"
                      : "点击确认创建阶段分类"
                  }
                >
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!isFormValid || submitting}
                    className={`px-5 h-9 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                      !isFormValid || submitting
                        ? "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed shadow-none"
                        : "bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] hover:from-[#3182ce] hover:to-[#4299e1] text-white shadow-xs hover:shadow-md cursor-pointer"
                    }`}
                  >
                    {submitting && (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    <span>{editingStage ? "保存更新" : "确认创建"}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 2. 高级业务操作确认与安全阻断模态框 (ActionModal) ==================== */}
      {actionModal.isOpen && actionModal.stage && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden text-left font-sans animate-in zoom-in-95 duration-200">
            {/* 头部：根据场景区分色系与视觉 */}
            {actionModal.type === "blocked" ? (
              <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-5 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center">
                    <ShieldAlert className="w-5 h-5 text-amber-300" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-white">安全保护拦截</h3>
                    <p className="text-[11px] text-blue-200 font-medium mt-0.5">该阶段仍有正在使用的线上组件</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActionModal({ ...actionModal, isOpen: false })}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer transition-colors text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : actionModal.type === "disable" ? (
              <div className="bg-gradient-to-r from-amber-500 to-amber-600 p-5 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center">
                    <ToggleRight className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-white">禁用阶段分类确认</h3>
                    <p className="text-[11px] text-amber-100 font-medium mt-0.5">下线后前台创作者将无法归类新组件</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActionModal({ ...actionModal, isOpen: false })}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer transition-colors text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : actionModal.type === "enable" ? (
              <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] p-5 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center">
                    <CheckCircle2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-white">恢复启用阶段分类</h3>
                    <p className="text-[11px] text-blue-100 font-medium mt-0.5">激活后前台创作者可重新选择归属于该阶段</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActionModal({ ...actionModal, isOpen: false })}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer transition-colors text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-red-500 to-red-600 p-5 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center">
                    <Trash2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-sm text-white">永久删除阶段分类</h3>
                    <p className="text-[11px] text-red-100 font-medium mt-0.5">此操作将彻底物理移除，不可撤回</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActionModal({ ...actionModal, isOpen: false })}
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer transition-colors text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* 内容区 */}
            <div className="p-6 space-y-4 text-xs bg-slate-50/40">
              {/* 阶段关键信息卡片 */}
              <div className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">目标阶段分类</span>
                  <span className="text-xs font-mono font-bold text-slate-500">排序权重：{actionModal.stage.sortOrder}</span>
                </div>
                <div className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#3182ce]" />
                  <span>{actionModal.stage.name}</span>
                </div>
                {actionModal.stage.description && (
                  <p className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                    {actionModal.stage.description}
                  </p>
                )}
              </div>

              {/* 针对 4 种业务场景的详细提示说明 */}
              {actionModal.type === "blocked" ? (
                <div className="space-y-3">
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 space-y-1.5">
                    <div className="font-bold flex items-center gap-1.5 text-xs text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>当前仍纳管 {actionModal.stage.componentCount} 个组件</span>
                    </div>
                    <p className="text-[11px] leading-relaxed text-amber-700">
                      为了保障系统运行与业务闭环稳定，平台严禁直接禁用仍有组件依赖的阶段分类。
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">
                    💡 建议方案：请先前往<strong>组件矩阵</strong>，将名下正在使用的组件批量转移或归档至其他有效阶段，清空依赖后再执行禁用。
                  </p>
                </div>
              ) : actionModal.type === "disable" ? (
                <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-amber-800 space-y-1 text-xs">
                  <p className="font-bold text-amber-900">确定要禁用此分类吗？</p>
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    禁用后，创作者发布新组件时将无法选择此分类。名下历史数据不受破坏，您后续可在停用状态下对该分类进行<strong>编辑</strong>或<strong>删除</strong>。
                  </p>
                </div>
              ) : actionModal.type === "enable" ? (
                <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl text-blue-800 space-y-1 text-xs">
                  <p className="font-bold text-blue-900">确定要重新启用此阶段吗？</p>
                  <p className="text-[11px] text-blue-700 leading-relaxed">
                    重新启用后，该阶段将立即公开展示，创作者即可在组件库与任务编排中正常归类并发布组件。
                  </p>
                </div>
              ) : (
                <div className="p-3.5 bg-red-50/80 border border-red-200 rounded-xl text-red-800 space-y-1 text-xs">
                  <p className="font-bold text-red-900">高危操作提示：</p>
                  <p className="text-[11px] text-red-700 leading-relaxed">
                    该阶段当前名下无挂载组件，可执行物理删除。删除后该分类将从数据库中彻底抹除，不可撤销与恢复。请谨慎确认！
                  </p>
                </div>
              )}
            </div>

            {/* 底部操作区 */}
            <div className="p-4 bg-white border-t border-slate-100 flex items-center justify-end gap-2.5">
              {actionModal.type === "blocked" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setActionModal({ ...actionModal, isOpen: false })}
                    className="px-4 h-9 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    我知道了
                  </button>
                  <Link
                    href={`/admin/components?stage=${encodeURIComponent(actionModal.stage.name)}`}
                    onClick={() => setActionModal({ ...actionModal, isOpen: false })}
                    className="px-4 h-9 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-xs font-bold shadow-xs inline-flex items-center gap-1.5 transition-colors"
                  >
                    <span>前往组件矩阵转移</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </>
              ) : actionModal.type === "disable" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setActionModal({ ...actionModal, isOpen: false })}
                    className="px-4 h-9 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteAction}
                    disabled={actionSubmitting}
                    className="px-4 h-9 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold shadow-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {actionSubmitting && (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    <span>确认禁用</span>
                  </button>
                </>
              ) : actionModal.type === "enable" ? (
                <>
                  <button
                    type="button"
                    onClick={() => setActionModal({ ...actionModal, isOpen: false })}
                    className="px-4 h-9 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteAction}
                    disabled={actionSubmitting}
                    className="px-4 h-9 bg-[#3182ce] hover:bg-[#2b6cb0] text-white rounded-xl text-xs font-bold shadow-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {actionSubmitting && (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    <span>确认启用</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setActionModal({ ...actionModal, isOpen: false })}
                    className="px-4 h-9 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteAction}
                    disabled={actionSubmitting}
                    className="px-4 h-9 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {actionSubmitting && (
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    <span>确认永久删除</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



