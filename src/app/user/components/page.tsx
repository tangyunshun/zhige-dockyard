"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Box,
  Search,
  Plus,
  Star,
  X,
  Zap,
  Copy,
  Eye,
  LayoutGrid,
  List,
  RefreshCw,
  FolderOpen,
  Building2,
  ArrowRight,
  Layers,
  CheckCircle2,
} from "lucide-react";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import { useAppContext } from "@/contexts/AppContext";
import ComponentDispatcherPanel from "@/components/studio/ComponentDispatcherPanelNew";

interface Component {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  categoryKey?: string | null;
  categoryName?: string | null;
  categoryColor?: string | null;
  categoryRange?: string | null;
  icon?: string | null;
  contract?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  usageCount?: number;
  workspaceId?: string | null;
  workspaceName?: string | null;
  workspaceType?: string | null;
  workspaceTaskCount?: number;
  enabledInWorkspace?: boolean;
  // 合同就绪状态（数据库唯一真源，来自 /api/user/components）
  activeContractLifecycle?: string | null;
  hasActiveContract?: boolean;
  contractReady?: boolean;
  hasPublishedContract?: boolean;
}

interface WorkspaceComponentGroup {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  role: string;
  isOwner: boolean;
  status: string;
  componentCount: number;
  totalUsageCount: number;
  totalWorkspaceTasks: number;
  components: Component[];
}

interface CategoryItem {
  key: string;
  name: string;
  color: string;
  range: string;
  sortOrder: number;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "空间所有者",
  ADMIN: "空间管理员",
  MEMBER: "协同成员",
};

type SortBy = "UPDATED_DESC" | "USAGE_DESC" | "CREATED_DESC" | "NAME_ASC";
type ViewMode = "grid" | "list";

// 预设系统级业务领域分类标准中文名称字典（兜底映射，杜绝出现英文代码）
const STANDARD_CATEGORY_NAMES: Record<string, string> = {
  BID_PREP: "投标招采解析",
  REQ_DESIGN: "需求梳理设计",
  BACKEND_CORE: "后端接口逻辑",
  DATABASE_ENG: "数据库与建模",
  FRONTEND_DEV: "前端交互开发",
  TEST_QA: "测试质量保障",
  DEVOPS: "运维与云原生",
  SECURITY: "安全合规体检",
  PROJ_MGMT: "项目协同管理",
  KNOWLEDGE: "知识资产文档",
};

export default function UserComponentsPage() {
  const toast = useToast();
  const router = useRouter();
  const { componentCatalog, componentCategories, refreshComponentCatalog } = useAppContext();

  const [workspaces, setWorkspaces] = useState<WorkspaceComponentGroup[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>("");
  const [dbCategories, setDbCategories] = useState<CategoryItem[]>([]);
  const [fallbackComponents, setFallbackComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mounted, setMounted] = useState(false);

  // 检索、分类、排序、视图与分页状态（移除无意义的发布状态筛选，按工作空间独立展示）
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [onlyReady, setOnlyReady] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<SortBy>("UPDATED_DESC");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(6);

  // 复用全系统统一的组件详情弹窗 (ComponentDispatcherPanel)
  const [dispatcherCompId, setDispatcherCompId] = useState<string | null>(null);
  const [isDispatcherOpen, setIsDispatcherOpen] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    void loadComponents(false);
    if (!componentCatalog || componentCatalog.length === 0) {
      void refreshComponentCatalog();
    }
  }, []);

  const loadComponents = async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      else setLoading(true);
      const authToken = getAuthToken();

      const res = await fetch("/api/user/components", {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (res.ok) {
        const data = await res.json();
        const wsList: WorkspaceComponentGroup[] = Array.isArray(data.workspaces) ? data.workspaces : [];
        setWorkspaces(wsList);
        setDbCategories(Array.isArray(data.categories) ? data.categories : []);
        setFallbackComponents(Array.isArray(data.data) ? data.data : []);
        setSelectedWorkspaceId((prev) => {
          if (prev && wsList.some((w) => w.id === prev)) return prev;
          return wsList[0]?.id || "";
        });
        if (isManual) toast.success("空间组件列表已刷新");
      }
    } catch (error) {
      console.error("Load components error:", error);
      toast.error("加载空间组件列表失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // 数据库分类中文字典（优先取接口返回的数据库 component_category 表，辅以 AppContext 分类字典）
  const categoryNameMap = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    dbCategories.forEach((c) => {
      if (c.key && c.name) {
        map.set(c.key.trim().toUpperCase(), { name: c.name, color: c.color || "#3182ce" });
      }
    });
    Object.entries(componentCategories || {}).forEach(([k, v]) => {
      if (k && v?.name && !map.has(k.trim().toUpperCase())) {
        map.set(k.trim().toUpperCase(), { name: v.name, color: v.color || "#3182ce" });
      }
    });
    return map;
  }, [dbCategories, componentCategories]);

  const resolveChineseCategory = (comp: Component): string => {
    // 1. 如果已有明确的中文分类名且不是英文代号，直接使用
    const rawKey = (comp.categoryKey || comp.category || "").trim().toUpperCase();
    if (comp.categoryName) {
      const upper = comp.categoryName.trim().toUpperCase();
      if (categoryNameMap.has(upper)) return categoryNameMap.get(upper)!.name;
      if (STANDARD_CATEGORY_NAMES[upper]) return STANDARD_CATEGORY_NAMES[upper];
      // 若 categoryName 恰好不是英文代号（含中文字符），直接返回
      if (/[\u4e00-\u9fa5]/.test(comp.categoryName)) return comp.categoryName;
    }

    // 2. 从数据库分类字典查找
    if (rawKey && categoryNameMap.has(rawKey)) {
      return categoryNameMap.get(rawKey)!.name;
    }

    // 3. 从预设标准分类映射查找
    if (rawKey && STANDARD_CATEGORY_NAMES[rawKey]) {
      return STANDARD_CATEGORY_NAMES[rawKey];
    }

    // 4. 若为未分类或完全无对应
    if (!rawKey) return "通用组件";
    return STANDARD_CATEGORY_NAMES[rawKey] || "业务组件";
  };

  const resolveCategoryColor = (comp: Component): string => {
    if (comp.categoryColor) return comp.categoryColor;
    const raw = (comp.categoryKey || comp.category || "").trim().toUpperCase();
    return categoryNameMap.get(raw)?.color || "#3182ce";
  };

  // 当前选中的工作空间及其配置组件
  const currentWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedWorkspaceId) || workspaces[0] || null,
    [workspaces, selectedWorkspaceId],
  );

  const components = useMemo(
    () => (currentWorkspace ? currentWorkspace.components : fallbackComponents),
    [currentWorkspace, fallbackComponents],
  );

  // 动态聚合当前工作空间下组件的真实中文分类及数量
  const categoryStats = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of components) {
      const cat = resolveChineseCategory(c);
      map[cat] = (map[cat] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [components, categoryNameMap]);

  // 多维检索、中文分类筛选、就绪筛选与排序
  const filteredComponents = useMemo(() => {
    const kw = searchTerm.trim().toLowerCase();
    const list = components.filter((component) => {
      const zhCat = resolveChineseCategory(component);
      const matchesSearch =
        !kw ||
        component.id.toLowerCase().includes(kw) ||
        component.name.toLowerCase().includes(kw) ||
        (component.description || "").toLowerCase().includes(kw) ||
        zhCat.toLowerCase().includes(kw);
      const matchesCat = filterCategory === "ALL" || zhCat === filterCategory;
      const matchesReady = !onlyReady || component.contractReady === true;
      return matchesSearch && matchesCat && matchesReady;
    });

    list.sort((a, b) => {
      if (sortBy === "USAGE_DESC") {
        return Number(b.usageCount || 0) - Number(a.usageCount || 0);
      }
      if (sortBy === "CREATED_DESC") {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === "NAME_ASC") {
        return a.name.localeCompare(b.name, "zh-CN");
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    return list;
  }, [components, searchTerm, filterCategory, onlyReady, sortBy, categoryNameMap]);

  const totalPages = Math.max(Math.ceil(filteredComponents.length / pageSize), 1);
  const safePage = Math.min(page, totalPages);
  const pagedComponents = useMemo(
    () => filteredComponents.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredComponents, safePage, pageSize],
  );

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "刚刚";
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  };

  // 打开全系统统一组件详情面板 (ComponentDispatcherPanel)
  const handleViewDetail = (component: Component) => {
    setDispatcherCompId(component.id);
    setIsDispatcherOpen(true);
  };

  const copyComponentId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success("组件 ID 已复制到剪贴板");
  };

  // 合同就绪徽章：仅展示真实可执行性
  const getContractBadge = (component: Component) => {
    if (component.contractReady === true) {
      return (
        <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-[#38a169] border border-emerald-200/70">
          <CheckCircle2 className="w-2.5 h-2.5" />
          <span>已装配可用</span>
        </span>
      );
    }
    const label = !component.activeContractLifecycle
      ? "待配置"
      : component.activeContractLifecycle === "DRAFT"
        ? "即将上线"
        : "暂不可执行";
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200/60">
        {label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="p-5 rounded-xl border border-blue-100/60 bg-blue-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2.5">
            <div className="h-7 w-48 zg-skeleton rounded-md" />
            <div className="h-4 w-96 zg-skeleton rounded-md" />
          </div>
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-20 zg-skeleton rounded-lg" />
            <div className="h-9 w-36 zg-skeleton rounded-lg" />
            <div className="h-9 w-40 zg-skeleton rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 zg-skeleton rounded-2xl" />
          ))}
        </div>
        <div className="h-96 zg-skeleton rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* 页面标题与操作顶栏（大厂高质感卡片布局，右侧操作按钮单行自适应对齐，拒绝断层折行） */}
      <div className="p-4.5 sm:p-5 rounded-xl bg-gradient-to-r from-blue-50/70 via-indigo-50/25 to-white border border-blue-100/80 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="w-10 h-10 rounded-xl bg-white border border-blue-200/80 text-[#3182ce] flex items-center justify-center font-bold shadow-2xs shrink-0 ring-4 ring-blue-50/60">
              <Box className="w-5 h-5" />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">我的组件</h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100/70 text-[#2b6cb0] border border-blue-200/60 shrink-0">
                按工作空间配置隔离
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-500 font-medium mt-2 leading-relaxed">
            按工作空间独立查看平台已上架并配置到各空间的业务组件与调用统计，支持一键进入对应工作空间运行或前往组件大厅装配新组件。
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 self-start lg:self-auto flex-wrap sm:flex-nowrap">
          <button
            type="button"
            onClick={() => void loadComponents(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 rounded-lg border border-slate-200 hover:border-slate-300 shadow-2xs transition-all cursor-pointer shrink-0 active:scale-95 disabled:opacity-60"
            title="刷新空间组件列表"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#3182ce]" : "text-slate-400"}`} />
            <span>{refreshing ? "刷新中…" : "刷新"}</span>
          </button>

          {currentWorkspace && (
            <button
              type="button"
              onClick={() => router.push(`/workspace/${currentWorkspace.id}?tab=components`)}
              className="inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 hover:text-[#3182ce] rounded-lg border border-slate-200 hover:border-[#3182ce]/50 shadow-2xs transition-all cursor-pointer shrink-0 active:scale-95"
              title={`进入工作空间「${currentWorkspace.name}」`}
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#3182ce]" />
              <span>进入当前工作空间</span>
            </button>
          )}

          <button
            type="button"
            onClick={() =>
              router.push(
                currentWorkspace ? `/studio?workspaceId=${currentWorkspace.id}` : "/studio",
              )
            }
            className="inline-flex items-center gap-1.5 h-9 px-4 text-xs font-bold text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:from-[#2b6cb0] hover:to-[#23568c] rounded-lg shadow-sm hover:shadow transition-all cursor-pointer shrink-0 active:scale-95"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>前往组件大厅装配</span>
          </button>
        </div>
      </div>

      {/* 3 维指标 Bento 统计网格 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* 当前空间已装配组件 */}
        <div className="zg-card relative overflow-hidden p-5 flex flex-col justify-between group hover:border-[#3182ce]/50 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">当前空间已配置组件</span>
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center group-hover:scale-105 transition-transform">
              <Box className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black font-mono text-slate-800 tracking-tight">
              {components.length}
              <span className="text-xs font-bold text-slate-400 ml-1.5 font-sans">个</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-1 truncate">
              {currentWorkspace ? `所属空间：${currentWorkspace.name}` : `覆盖 ${categoryStats.length} 个业务领域分类`}
            </div>
          </div>
          <div className="absolute right-0 bottom-0 w-24 h-24 bg-gradient-to-tl from-[#3182ce]/5 to-transparent rounded-tl-full pointer-events-none" />
        </div>

        {/* 关联工作空间与分类覆盖 */}
        <div className="zg-card relative overflow-hidden p-5 flex flex-col justify-between group hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">覆盖业务阶段分类</span>
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black font-mono text-emerald-600 tracking-tight">
              {categoryStats.length}
              <span className="text-xs font-bold text-slate-400 ml-1.5 font-sans">大阶段</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-1">
              共管理 {workspaces.length} 个工作空间 · {components.filter((c) => c.contractReady === true).length} 个可执行就绪
            </div>
          </div>
          <div className="absolute right-0 bottom-0 w-24 h-24 bg-gradient-to-tl from-emerald-500/5 to-transparent rounded-tl-full pointer-events-none" />
        </div>

        {/* 累计引用装配 */}
        <div className="zg-card relative overflow-hidden p-5 flex flex-col justify-between group hover:border-amber-300 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">当前空间组件累计被调用</span>
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black font-mono text-amber-600 tracking-tight">
              {components.reduce((sum, c) => sum + (c.usageCount || 0), 0).toLocaleString()}
              <span className="text-xs font-bold text-slate-400 ml-1.5 font-sans">次</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium mt-1">
              本空间内已执行任务 {(currentWorkspace?.totalWorkspaceTasks || 0).toLocaleString()} 次
            </div>
          </div>
          <div className="absolute right-0 bottom-0 w-24 h-24 bg-gradient-to-tl from-amber-500/5 to-transparent rounded-tl-full pointer-events-none" />
        </div>
      </div>

      {/* 按工作空间分开显示切换栏（数据库真实空间与独立组件装配映射） */}
      {workspaces.length > 0 && (
        <div className="zg-card p-4 space-y-3 border-t-2 border-t-[#3182ce]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <FolderOpen className="w-4 h-4 text-[#3182ce]" />
              <h2 className="text-sm font-black text-slate-800">所属工作空间联动切换</h2>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#f0f7ff] text-[#2b6cb0] border border-[#bee3f8]">
                共 {workspaces.length} 个工作空间 · 组件独立配置
              </span>
            </div>
            {currentWorkspace && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">
                  当前空间：<strong className="text-slate-700">{currentWorkspace.name}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => router.push(`/workspace/${currentWorkspace.id}?tab=components`)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold text-[#2b6cb0] bg-[#f0f7ff] hover:bg-[#3182ce] hover:text-white border border-[#bee3f8] hover:border-[#3182ce] transition-all cursor-pointer"
                >
                  <span>管理此空间组件库</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 no-scrollbar">
            {workspaces.map((ws) => {
              const active = ws.id === (currentWorkspace?.id || "");
              const isEnt = ws.type === "ENTERPRISE";
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => {
                    setSelectedWorkspaceId(ws.id);
                    setFilterCategory("ALL");
                    setPage(1);
                  }}
                  className={`px-3.5 py-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 shrink-0 ${
                    active
                      ? "bg-[#f0f7ff] border-[#3182ce] ring-1 ring-[#3182ce]/25 shadow-2xs"
                      : "bg-white hover:bg-slate-50 border-slate-200/80 hover:border-[#3182ce]/40"
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      active
                        ? "bg-[#3182ce] text-white"
                        : isEnt
                          ? "bg-emerald-50 text-[#38a169]"
                          : "bg-blue-50 text-[#3182ce]"
                    }`}
                  >
                    {isEnt ? <Building2 className="w-3.5 h-3.5" /> : <FolderOpen className="w-3.5 h-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-slate-800 truncate max-w-[130px]">{ws.name}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          isEnt
                            ? "bg-emerald-50 text-[#38a169] border border-emerald-200/70"
                            : "bg-blue-50 text-[#2b6cb0] border border-blue-200/70"
                        }`}
                      >
                        {isEnt ? "企业" : "个人"}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                      已配 <strong className={active ? "text-[#2b6cb0]" : "text-slate-600"}>{ws.componentCount}</strong> 个组件
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 当前工作空间已配置组件矩阵（支持多维过滤、排序、网格/紧凑列表双视图切换、定高滚动与分页控制） */}
      <div className="zg-card p-6 space-y-4">
        {/* 顶栏：当前空间标题 + 可执行开关 + 视图模式切换 */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="w-1 h-3.5 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full" />
            <h2 className="text-sm font-black text-slate-800">
              {currentWorkspace ? `${currentWorkspace.name} · 已配置组件列表` : "空间已配置组件列表"}
            </h2>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#2b6cb0] border border-blue-200/60">
              匹配 {filteredComponents.length} / 当前空间共 {components.length} 项
            </span>
          </div>

          {/* 右侧：可执行就绪开关 + 网格/列表视图切换 */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setOnlyReady((v) => !v);
                setPage(1);
              }}
              className={`h-8 px-3 rounded text-xs font-bold border transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                onlyReady
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300 shadow-2xs"
                  : "bg-white text-slate-600 border-slate-200 hover:border-[#3182ce]/40"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  onlyReady ? "bg-emerald-500" : "bg-slate-300"
                }`}
              />
              <span>仅看可执行就绪</span>
            </button>

            <div className="inline-flex items-center p-0.5 rounded bg-slate-100 border border-slate-200/70">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === "grid"
                    ? "bg-white text-[#2b6cb0] shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                title="卡片网格视图"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>网格</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`px-2.5 py-1 rounded text-xs font-bold inline-flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === "list"
                    ? "bg-white text-[#2b6cb0] shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
                title="高密度紧凑列表视图（适合组件数量极多时快速浏览）"
              >
                <List className="w-3.5 h-3.5" />
                <span>列表</span>
              </button>
            </div>
          </div>
        </div>

        {/* 第二栏：关键词检索 + 排序选择器（已移除不合理的发布状态筛选器） */}
        <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="按组件编号、中文名称、所属阶段分类或功能描述搜索当前空间组件…"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="zg-input !h-9 pl-9 pr-8 text-xs"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as SortBy);
                setPage(1);
              }}
              className="zg-input !h-9 text-xs !w-auto font-semibold text-slate-700 cursor-pointer"
            >
              <option value="UPDATED_DESC">按最近更新排序</option>
              <option value="USAGE_DESC">按装配调用量最高</option>
              <option value="CREATED_DESC">按创建时间最新</option>
              <option value="NAME_ASC">按组件名称排序</option>
            </select>
          </div>
        </div>

        {/* 第三栏：数据库真实中文阶段分类胶囊条 */}
        {categoryStats.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <span className="text-[11px] font-bold text-slate-400 shrink-0 mr-1">
              领域分类：
            </span>
            <button
              type="button"
              onClick={() => {
                setFilterCategory("ALL");
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer shrink-0 ${
                filterCategory === "ALL"
                  ? "bg-[#3182ce] text-white border-transparent shadow-2xs"
                  : "bg-slate-50 text-slate-600 border-slate-200/80 hover:border-[#3182ce]/40"
              }`}
            >
              全部类别 ({components.length})
            </button>
            {categoryStats.map(([cat, count]) => {
              const active = filterCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setFilterCategory(cat);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold border transition-all cursor-pointer shrink-0 ${
                    active
                      ? "bg-[#3182ce] text-white border-transparent shadow-2xs"
                      : "bg-slate-50 text-slate-600 border-slate-200/80 hover:border-[#3182ce]/40"
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* 组件展示主体区（自然网格展开，配合底部分页控制，彻底告别臃肿压抑感） */}
        {filteredComponents.length > 0 ? (
          <>
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {pagedComponents.map((component) => {
                  const zhCat = resolveChineseCategory(component);
                  const catColor = resolveCategoryColor(component);
                  const targetWsId = component.workspaceId || currentWorkspace?.id || "";
                  return (
                    <div
                      key={`${targetWsId}-${component.id}`}
                      className="group p-4 rounded-xl bg-white/90 hover:bg-white border border-slate-200/80 hover:border-[#3182ce]/50 transition-all shadow-2xs hover:shadow-xs flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2.5 mb-2">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                              <Box className="w-4 h-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <h3
                                  className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate"
                                  title={component.name}
                                >
                                  {component.name}
                                </h3>
                                <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded shrink-0">
                                  {component.id}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                {getContractBadge(component)}
                                <span
                                  className="text-[10px] font-bold px-2 py-0.5 rounded border"
                                  style={{
                                    backgroundColor: `${catColor}12`,
                                    borderColor: `${catColor}30`,
                                    color: catColor,
                                  }}
                                >
                                  {zhCat}
                                </span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleViewDetail(component)}
                            className="inline-flex items-center gap-1 h-7 px-2 text-[11px] font-bold text-slate-600 hover:text-[#3182ce] bg-slate-50 hover:bg-blue-50 rounded border border-slate-200/80 hover:border-blue-200 transition-colors cursor-pointer shrink-0"
                            title="查看组件详细规格与契约说明"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>详情</span>
                          </button>
                        </div>

                        <p className="text-xs text-slate-500 line-clamp-2 mt-2 mb-3 leading-relaxed min-h-[34px]">
                          {component.description || "暂无组件描述信息。"}
                        </p>
                      </div>

                      <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                        <span className="text-[11px] font-medium text-slate-400 truncate">
                          调用 <strong className="font-mono text-slate-700">{component.usageCount || 0}</strong> 次 ·{" "}
                          {formatTimeAgo(component.updatedAt)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              targetWsId
                                ? `/workspace/${targetWsId}?componentId=${component.id}`
                                : `/studio?componentId=${component.id}`,
                            )
                          }
                          className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-bold text-[#2b6cb0] bg-[#f0f7ff] hover:bg-[#3182ce] hover:text-white rounded border border-[#bee3f8] hover:border-[#3182ce] shadow-2xs transition-all cursor-pointer shrink-0"
                        >
                          <span>进入工作空间使用</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* 高密度紧凑列表视图：适合数十至上百个组件快速扫视与管理，固定操作列于右侧 */
              <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white shadow-2xs">
                <table className="w-full text-left text-xs min-w-[960px] border-collapse">
                  <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur-xs border-b border-slate-200/80 text-[11px] text-slate-500 font-bold">
                    <tr>
                      <th className="py-3 px-4 whitespace-nowrap min-w-[180px]">组件名称 / 编号</th>
                      <th className="py-3 px-3 whitespace-nowrap min-w-[130px]">所属工作空间</th>
                      <th className="py-3 px-3 whitespace-nowrap min-w-[120px]">领域分类</th>
                      <th className="py-3 px-3 whitespace-nowrap min-w-[100px]">装配状态</th>
                      <th className="py-3 px-3 whitespace-nowrap min-w-[200px]">功能摘要</th>
                      <th className="py-3 px-3 whitespace-nowrap min-w-[90px]">累计调用</th>
                      <th className="sticky right-0 z-10 py-3 px-4 text-right whitespace-nowrap min-w-[190px] bg-slate-50/95 border-l border-slate-200/80 shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)]">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                    {pagedComponents.map((component) => {
                      const zhCat = resolveChineseCategory(component);
                      const catColor = resolveCategoryColor(component);
                      const targetWsId = component.workspaceId || currentWorkspace?.id || "";
                      const targetWsName = component.workspaceName || currentWorkspace?.name || "个人空间";
                      return (
                        <tr
                          key={`${targetWsId}-${component.id}`}
                          className="hover:bg-blue-50/25 transition-colors group"
                        >
                          <td className="py-2.5 px-4 whitespace-nowrap max-w-[220px]">
                            <div className="font-bold text-slate-800 truncate" title={component.name}>
                              {component.name}
                            </div>
                            <button
                              type="button"
                              onClick={() => copyComponentId(component.id)}
                              className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-400 hover:text-[#3182ce] cursor-pointer mt-0.5"
                              title="点击复制组件编号"
                            >
                              <span>{component.id}</span>
                              <Copy className="w-2.5 h-2.5" />
                            </button>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                              {targetWsName}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className="text-[11px] font-bold px-2 py-0.5 rounded border"
                              style={{
                                backgroundColor: `${catColor}12`,
                                borderColor: `${catColor}30`,
                                color: catColor,
                              }}
                            >
                              {zhCat}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            {getContractBadge(component)}
                          </td>
                          <td
                            className="py-2.5 px-3 text-slate-500 max-w-[260px] truncate"
                            title={component.description || ""}
                          >
                            {component.description || "—"}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap font-mono font-bold text-slate-800">
                            {(component.usageCount || 0).toLocaleString()} 次
                          </td>
                          <td className="sticky right-0 z-10 py-2.5 px-4 text-right whitespace-nowrap bg-white group-hover:bg-[#f6f9fe] border-l border-slate-200/80 shadow-[-8px_0_12px_-4px_rgba(0,0,0,0.06)]">
                            <div className="inline-flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleViewDetail(component)}
                                className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-bold text-slate-600 hover:text-[#3182ce] bg-slate-50 hover:bg-blue-50 rounded border border-slate-200/80 hover:border-blue-200 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-2xs"
                                title="查看组件详细规格与契约说明"
                              >
                                <Eye className="w-3.5 h-3.5 shrink-0" />
                                <span className="whitespace-nowrap">详情</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  router.push(
                                    targetWsId
                                      ? `/workspace/${targetWsId}?componentId=${component.id}`
                                      : `/studio?componentId=${component.id}`,
                                  )
                                }
                                className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-bold text-[#2b6cb0] bg-[#f0f7ff] hover:bg-[#3182ce] hover:text-white rounded border border-[#bee3f8] hover:border-[#3182ce] shadow-2xs transition-all cursor-pointer whitespace-nowrap shrink-0"
                              >
                                <span className="whitespace-nowrap">进入工作空间</span>
                                <ArrowRight className="w-3 h-3 shrink-0" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* 常驻底部分页与每页容量控制栏 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3.5 border-t border-slate-100 text-xs text-slate-500">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span>
                  当前空间共 <strong className="font-mono text-slate-700">{filteredComponents.length}</strong> 项组件 · 第{" "}
                  <strong className="font-mono text-slate-700">{safePage}</strong> / {totalPages} 页
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value) || 6);
                    setPage(1);
                  }}
                  className="h-7.5 px-2.5 rounded border border-slate-200 bg-white text-[11px] font-semibold text-slate-600 outline-none focus:border-[#3182ce] cursor-pointer"
                >
                  <option value={6}>每页 6 项</option>
                  <option value={12}>每页 12 项</option>
                  <option value={24}>每页 24 项</option>
                  <option value={48}>每页 48 项</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage(1)}
                  disabled={safePage <= 1}
                  className="zg-btn zg-btn-default !text-xs !h-7.5 !px-2.5 disabled:opacity-40"
                >
                  首页
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  className="zg-btn zg-btn-default !text-xs !h-7.5 !px-3 disabled:opacity-40"
                >
                  上一页
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  className="zg-btn zg-btn-default !text-xs !h-7.5 !px-3 disabled:opacity-40"
                >
                  下一页
                </button>
                <button
                  type="button"
                  onClick={() => setPage(totalPages)}
                  disabled={safePage >= totalPages}
                  className="zg-btn zg-btn-default !text-xs !h-7.5 !px-2.5 disabled:opacity-40"
                >
                  末页
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-14">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2.5 text-slate-400">
              <Box className="w-6 h-6" />
            </div>
            <h3 className="text-xs font-bold text-slate-700 mb-1">
              {components.length > 0 ? "未找到匹配的组件" : "当前工作空间暂未配置组件"}
            </h3>
            <p className="text-[11px] text-slate-400 mb-4">
              {components.length > 0
                ? "请尝试清空搜索词或切换上方领域分类筛选条件"
                : "您可以前往组件大厅挑选并将已上架组件装配至当前工作空间"}
            </p>
            {components.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm("");
                  setFilterCategory("ALL");
                  setOnlyReady(false);
                  setPage(1);
                }}
                className="zg-btn zg-btn-default text-xs h-8 px-3.5 font-bold"
              >
                重置全部筛选条件
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  router.push(
                    currentWorkspace ? `/studio?workspaceId=${currentWorkspace.id}` : "/studio",
                  )
                }
                className="zg-btn zg-btn-primary text-xs h-8 px-3.5 gap-1.5 font-bold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>前往组件大厅装配</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 复用全系统统一的组件详情弹窗 (ComponentDispatcherPanel)，通过 createPortal 挂载至 document.body */}
      {mounted &&
        createPortal(
          <ComponentDispatcherPanel
            isOpen={isDispatcherOpen}
            onClose={() => setIsDispatcherOpen(false)}
            componentId={dispatcherCompId}
            onNavigateToWorkspace={(wsId, compId) => {
              setIsDispatcherOpen(false);
              router.push(`/workspace/${wsId}?componentId=${compId}`);
            }}
          />,
          document.body,
        )}
    </div>
  );
}
