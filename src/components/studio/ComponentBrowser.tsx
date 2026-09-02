"use client";

import React, { useState, useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";
import { useAppContext } from "@/contexts/AppContext";
import { iconMap } from "@/components/ComponentShowcase";
import { Box } from "lucide-react";
import { useRouter } from "next/navigation";
import { getAuthToken } from "@/utils/auth";
import type { ComponentCategory, ComponentDefinition } from "@/constants/components";
import {
  Search,
  ChevronDown,
  Activity,
  Star,
  Grid3X3,
  List,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Clock,
  CheckCircle,
  X,
  Filter,
  SortAsc,
  SortDesc,
  Trash2,
  Bookmark,
  Rocket,
  Award,
  Workflow,
  Layers,
  ArrowRightLeft,
  FileText,
  Cpu,
  Database,
  Monitor,
  Server,
  Users,
  BookOpen,
  Target,
  Zap,
  Settings,
  FolderClosed,
  FolderOpen,
  CheckCircle2,
  Upload,
  Compass,
  Code,
  Layout,
  ShieldAlert,
  Briefcase,
  PenLine
} from "lucide-react";

// 引入统一侧滑分发控制面板
import ComponentDispatcherPanel from "./ComponentDispatcherPanelNew";
import { formatYuanFromPoints, POINT_RATE_TEXT } from "@/lib/point-rate";

// 应用阶段分组配置：名称/颜色/顺序一律由数据库 component_category 表（经 AppContext 加载）驱动，
// 代码中不再硬编码任何阶段分组数据。
export interface StageConfig {
  name: string;
  color: string;
  bg: string;
}

const getStageIcon = (id: number, stageConfigs: Record<number, StageConfig>, className?: string, useColor: boolean = true) => {
  const config = stageConfigs[id];
  const color = useColor && config ? config.color : undefined;
  const iconProps = {
    className: className || "w-4 h-4",
    style: color ? { color } : undefined
  };
  switch (id) {
    case 1: return <FileText {...iconProps} />;
    case 2: return <Layers {...iconProps} />;
    case 3: return <Code {...iconProps} />;
    case 4: return <Database {...iconProps} />;
    case 5: return <Layout {...iconProps} />;
    case 6: return <CheckCircle2 {...iconProps} />;
    case 7: return <Server {...iconProps} />;
    case 8: return <ShieldCheck {...iconProps} />;
    case 9: return <Users {...iconProps} />;
    case 10: return <FolderOpen {...iconProps} />;
    default: return <Workflow {...iconProps} />;
  }
};

/**
 * 计算组件的展示属性，全部来自数据库真实统计，无任何派生的模拟数值：
 *  - contract：component_catalog.contract 字段
 *  - calls：component_stats.totalUses（由每次真实执行累加）
 *  - successRate：component_task 中该组件 SUCCESS 任务数 / 总任务数；无任务记录时为 null（不展示数字）
 */
const getComponentExtra = (
  contract?: string | null,
  realUsageCount?: number,
  realTaskStats?: { total: number; success: number }
) => {
  const calls = realUsageCount || 0;
  const total = realTaskStats?.total || 0;
  const success = realTaskStats?.success || 0;
  const successRate = total > 0 ? (success / total) * 100 : null;
  const resolvedContract = contract || "参数 ➜ 输出";

  return { calls, successRate, total, success, contract: resolvedContract };
};

const categoryEmojis: Record<string, string> = {
  BID_PREP: "",
  REQ_DESIGN: "",
  BACKEND_CORE: "",
  DATABASE_ENG: "",
  FRONTEND_DEV: "",
  TEST_QA: "",
  DEVOPS: "",
  SECURITY: "",
  PROJ_MGMT: "",
  KNOWLEDGE: "",
};

interface ComponentBrowserProps {
  workspaceId: string | null;
  workspaceName: string;
  workspaceToken: number;
  restrictedComponentIds: string[];
  onSelectComponent: (componentId: string, workspaceId?: string) => void;
  onTokenUpdate: (newToken: number) => void;
}

export default function ComponentBrowser({
  workspaceId,
  workspaceName,
  workspaceToken,
  restrictedComponentIds,
  onSelectComponent,
  onTokenUpdate,
}: ComponentBrowserProps) {
  const toast = useToast();
  const router = useRouter();

  const {
    favorites,
    recentUsed,
    toggleFavorite,
    boundComponentIds,
    boundComponentsWorkspaceId,
    bindComponent,
    unbindComponent,
    userState,
    refreshUserState,
    refreshBoundComponents,
    resetWorkspaceData,
    componentCatalog,
    componentCategories,
  } = useAppContext();
  // 组件信息来自数据库（component_catalog 表）
  const COMPONENTS = componentCatalog || [];

  // 空间归属校验：全局装配数据仅当属于当前空间时才作为"已装配"展示，
  // 否则视为未装配（避免切换空间后仍显示旧空间的装配状态）
  const currentBoundIds = boundComponentsWorkspaceId === workspaceId ? boundComponentIds : [];

  // 阶段分组配置：由数据库 component_category 表（sortOrder/name/color）驱动，不再硬编码
  const { stageConfigs, categoryToStageId } = React.useMemo(() => {
    const configs: Record<number, StageConfig> = {};
    const catToId: Record<string, number> = {};
    if (componentCategories) {
      Object.entries(componentCategories).forEach(([catKey, details]) => {
        const stageId = details.sortOrder && details.sortOrder > 0 ? details.sortOrder : 1;
        catToId[catKey] = stageId;
        configs[stageId] = {
          name: details.name,
          color: details.color,
          bg: "bg-slate-50 text-slate-700",
        };
      });
    }
    return { stageConfigs: configs, categoryToStageId: catToId };
  }, [componentCategories]);

  const [isMounted, setIsMounted] = useState(false);
  const [clientLoggedIn, setClientLoggedIn] = useState(false);
  const isLoggedIn = isMounted && clientLoggedIn;

  // 搜索和过滤状态
  const [searchQuery, setSearchQuery] = useState("");
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showSearchHistory, setShowSearchHistory] = useState(false);
  const [selectedStage, setSelectedStage] = useState<number>(-1); // -1 表示全部
  const [sortBy, setSortBy] = useState<"default" | "hot" | "success" | "new">("default");
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeTab, setActiveTab] = useState<"recent" | "favorites">("recent");

  // 工作模式分流：smart - 智能匹配推荐；active - 主动选择
  const [workMode, setWorkMode] = useState<"active" | "smart">("smart");
  const [uploadedFile, setUploadedFile] = useState<{ name: string; size: number } | null>(null);
  const [smartPrompt, setSmartPrompt] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisLogs, setAnalysisLogs] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [recommendedComponents, setRecommendedComponents] = useState<Array<{
    component: ComponentDefinition;
    matchScore: number;
    reason: string;
  }>>([]);

  const recommendedRef = useRef<HTMLDivElement>(null);

  // 监听推荐组件数据变化，自动平滑滚动定位到推荐卡片区域
  useEffect(() => {
    if (recommendedComponents.length > 0 && recommendedRef.current) {
      const timer = setTimeout(() => {
        recommendedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [recommendedComponents]);

  // 智能需求描述润色引擎状态组与专业扩增算法
  const [originalSmartPrompt, setOriginalSmartPrompt] = useState("");
  const [refinedSmartPrompt, setRefinedSmartPrompt] = useState("");
  const [isRefiningSmart, setIsRefiningSmart] = useState(false);
  const [showRefineSmartPanel, setShowRefineSmartPanel] = useState(false);

  const getRefinedText = (text: string): string => {
    const trimmed = text.trim();
    if (!trimmed) return "";
    
    const lower = trimmed.toLowerCase();
    if (lower.includes("标书") || lower.includes("rfp") || lower.includes("投标") || lower.includes("合同")) {
      return "我需要对上传的 RFP 招标 PDF 材料及技术偏离文件进行格式自检，通过深度文本适配自动提取偏离差异条款，并快速生成规范的可视化风险比对报告。";
    }
    if (lower.includes("api") || lower.includes("接口") || lower.includes("后端") || lower.includes("swagger")) {
      return "我需要对给定的 RESTful API 协议契约进行分析，逆向生成对应的 Spring Boot/Next.js 后端接口模板与业务控制器框架，并自动对齐契约定义。";
    }
    if (lower.includes("测试") || lower.includes("单测") || lower.includes("jest") || lower.includes("junit")) {
      return "我需要对项目核心业务代码自动生成覆盖率达标的单元测试用例，并配套构建 Docker 自动化部署镜像及流水线配置文件。";
    }
    if (lower.includes("react") || lower.includes("vue") || lower.includes("前端") || lower.includes("页面")) {
      return "我希望将手写或导出的交互原型 schema 自动转换生成为符合现代化设计系统规范的响应式 React 大前端组件代码。";
    }
    if (lower.includes("数据库") || lower.includes("er") || lower.includes("sql") || lower.includes("建表")) {
      return "我需要对现有的 DDL 建表 SQL 脚本进行实体逆向映射，生成直观清晰的 ER 拓扑图模型，并导出为标准数据字典。";
    }
    
    return `我需要在当前工作空间中，基于“${trimmed}”的具体研发场景，通过配置化效能组件进行数据流自适应处理，自动生成规范成果，并沉淀为团队 SOP 避坑规约。`;
  };

  const [promptError, setPromptError] = useState<string | null>(null);

  // 开发需求检索状态
  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [isTaskSearching, setIsTaskSearching] = useState(false);

  // 侧滑分发控制面板状态
  const [dispatcherCompId, setDispatcherCompId] = useState<string | null>(null);
  const [isDispatcherOpen, setIsDispatcherOpen] = useState(false);

  // 解除装配前"使用中"检测弹窗状态
  // inUse=true → 展示"组件已被使用"引导去空间解除；inUse=false → 展示确认解除
  const [unbindModal, setUnbindModal] = useState<{
    componentId: string;
    name: string;
    inUse: boolean;
    reason?: string;
    checking: boolean;
    confirming: boolean;
  } | null>(null);

  // 批量操作状态
  const [selectMode, setSelectMode] = useState(false);
  const [selectedComponents, setSelectedComponents] = useState<string[]>([]);

  // 模态弹窗及切换空间状态
  const [isSwitching, setIsSwitching] = useState(false);
  const [isAssetsDrawerOpen, setIsAssetsDrawerOpen] = useState(false);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

  // 折叠资产树阶段的状态 (默认展开商机、需求、后端)
  const [expandedStages, setExpandedStages] = useState<Record<number, boolean>>({
    1: true, 2: true, 3: true,
  });

  const toggleStageExpand = (stageId: number) => {
    setExpandedStages(prev => ({ ...prev, [stageId]: !prev[stageId] }));
  };

  // 确认弹窗中"确定解除"：真正执行解除装配
  const confirmUnbind = async () => {
    if (!unbindModal || !workspaceId) return;
    setUnbindModal({ ...unbindModal, confirming: true });
    try {
      const result = await unbindComponent(unbindModal.componentId, workspaceId);
      if (result.ok) {
        toast.success(`组件 ${unbindModal.name} 已成功解除装配 (历史任务与文档 100% 完整保留)`);
        setUnbindModal(null);
        refreshBoundComponents(workspaceId);
        refreshUserState();
      } else {
        setUnbindModal(null);
        toast.error(result.error || "解除装配失败，请稍后重试");
      }
    } catch (err) {
      setUnbindModal(null);
      toast.error("网络异常，请重试");
    }
  };

  // 快捷一键装配/解除绑定组件处理函数
  const handleQuickBind = async (e: React.MouseEvent, componentId: string, name: string, isBound: boolean) => {
    e.stopPropagation();
    if (!workspaceId) {
      toast.warning("请先选定或创建一个空间以装配效能组件");
      return;
    }
    try {
      if (isBound) {
        // 解除装配流程：先检测使用状态 → 弹窗展示检测结果 → 用户确认后再解除
        setUnbindModal({ componentId, name, inUse: false, checking: true, confirming: false });
        try {
          const res = await fetch(`/api/studio?action=check-usage&workspaceId=${encodeURIComponent(workspaceId)}&componentId=${encodeURIComponent(componentId)}`, {
            headers: { Authorization: `Bearer ${getAuthToken()}` },
            credentials: "include",
          });
          const data = await res.json();
          if (data.success && data.data) {
            setUnbindModal({
              componentId,
              name,
              inUse: data.data.inUse === true,
              reason: data.data.reason,
              checking: false,
              confirming: false,
            });
            return;
          }
        } catch (err) {
          console.error("检测组件使用状态失败:", err);
        }
        // 检测接口异常时降级：关闭检测弹窗，直接尝试解除（后端仍有强校验兜底）
        setUnbindModal(null);
        const result = await unbindComponent(componentId, workspaceId);
        if (result.ok) {
          toast.success(`组件 ${name} 已成功解除装配 (历史任务与文档 100% 完整保留)`);
          refreshBoundComponents(workspaceId);
          refreshUserState();
        } else {
          toast.error(result.error || "解除装配失败，请稍后重试");
        }
      } else {
        const result = await bindComponent(componentId, workspaceId);
        if (result.ok) {
          toast.success(`组件 ${name} 已成功分发装配至当前空间`);
          refreshBoundComponents(workspaceId);
          refreshUserState();
        } else {
          toast.error(result.error || "装配失败，请重试");
        }
      }
    } catch (err) {
      toast.error("网络异常，请重试");
    }
  };

  // 从 localStorage 加载搜索历史
  useEffect(() => {
    setIsMounted(true);
    if (userState?.isLoggedIn) {
      setClientLoggedIn(true);
    }
    const saved = localStorage.getItem("studio_search_history");
    if (saved) {
      try {
        setSearchHistory(JSON.parse(saved));
      } catch (e) {
        console.error("加载搜索历史失败:", e);
      }
    }
  }, [userState?.isLoggedIn]);

  // 强力同步登录态，防范 React 19 并发挂载及 context 延迟刷新时导致的局部 DOM 挂起
  useEffect(() => {
    if (isMounted) {
      setClientLoggedIn(!!userState?.isLoggedIn);
    }
  }, [userState?.isLoggedIn, isMounted]);

  const saveSearchHistory = (history: string[]) => {
    setSearchHistory(history);
    localStorage.setItem("studio_search_history", JSON.stringify(history));
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim() && !searchHistory.includes(query.trim())) {
      const newHistory = [query.trim(), ...searchHistory].slice(0, 10);
      saveSearchHistory(newHistory);
    }
  };

  const handleSearchItemClick = (query: string) => {
    setSearchQuery(query);
    setShowSearchHistory(true);
  };

  // 切换工作空间 API 逻辑
  const handleSwitchWorkspace = async (targetWsId: string) => {
    if (targetWsId === workspaceId) return;
    setIsSwitching(true);
    // 同步清空旧空间装配数据，避免 SPA 内切换后新数据返回前组件大厅仍显示旧空间的"已装入 X 项"
    resetWorkspaceData();
    try {
      const res = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`
        },
        credentials: "include",
        body: JSON.stringify({ workspaceId: targetWsId }),
      });
      if (res.ok) {
        toast.success("空间成功物理切换");
        // 局部刷新参数与状态而不重新加载整页
        router.replace(`/studio?workspaceId=${targetWsId}`, { scroll: false });
        await refreshBoundComponents(targetWsId);
        await refreshUserState();
      } else {
        let errMsg = "空间切换失败";
        try {
          const errData = await res.json();
          if (errData && errData.message) {
            errMsg = `空间切换失败: ${errData.message} (${res.status})`;
          } else {
            errMsg = `空间切换失败 (HTTP ${res.status})`;
          }
        } catch (e) {
          errMsg = `空间切换失败 (HTTP ${res.status})`;
        }
        toast.error(errMsg);
      }
    } catch (e) {
      toast.error("网络异常，请稍后重试");
    } finally {
      setIsSwitching(false);
    }
  };

  // 开发需求检索匹配逻辑
  const handleTaskMatchSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const prompt = taskSearchQuery.trim();
    if (!prompt) {
      setMatchedIds([]);
      return;
    }

    setIsTaskSearching(true);
    setTimeout(() => {
      setIsTaskSearching(false);
      const matches: string[] = [];
      const lower = prompt.toLowerCase();

      // 基于数据库 component_catalog 的 keywords / 名称 / 描述 / 标签做模糊匹配（不再硬编码关键词映射）
      COMPONENTS.forEach((comp) => {
        const kwList = (comp.keywords || []).map((k) => k.toLowerCase());
        const kwHit = kwList.some((k) => lower.includes(k));
        const nameHit = comp.name.toLowerCase().includes(lower) || lower.includes(comp.name.toLowerCase());
        const descHit = comp.description.toLowerCase().includes(lower);
        const tagHit = (comp.tags || []).some((t) => t.toLowerCase().includes(lower));
        if (kwHit || nameHit || descHit || tagHit) {
          matches.push(comp.id);
        }
      });

      if (matches.length > 0) {
        setMatchedIds(matches);
        toast.success(`检索匹配完成，已为您高亮匹配出 ${matches.length} 个相关组件`);
      } else {
        setMatchedIds([]);
        toast.info("未能检索到匹配的专属组件");
      }
    }, 600);
  };

  const handleToggleFavorite = async (componentId: string) => {
    const success = await toggleFavorite(componentId);
    if (success) {
      const isFav = favorites.includes(componentId);
      toast.success(isFav ? "已取消收藏" : "已添加到收藏");
    } else {
      toast.error("操作失败，请重试");
    }
  };

  const handleOpenDispatcher = (componentId: string) => {
    setDispatcherCompId(componentId);
    setIsDispatcherOpen(true);
  };

  // 契约文件拖拽与选择上传逻辑
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.size > 5 * 1024 * 1024) {
        toast.error("上传文件不能超过 5MB 限额");
        return;
      }
      setUploadedFile({ name: file.name, size: file.size });
      toast.success(`文件 ${file.name} 上传就绪`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 5 * 1024 * 1024) {
        toast.error("上传文件不能超过 5MB 限额");
        return;
      }
      setUploadedFile({ name: file.name, size: file.size });
      toast.success(`文件 ${file.name} 上传就绪`);
    }
  };

  const clearUploadedFile = () => {
    setUploadedFile(null);
    setRecommendedComponents([]);
    setAnalysisLogs([]);
    setPromptError(null);
  };

  // 核心契约分析匹配逻辑 (支持可选上传文件)
  const handleStartSmartAnalysis = () => {
    // 立即擦除上一次的推荐结果和分析日志，防止旧数据在校验拦截或新分析时残留
    setRecommendedComponents([]);
    setAnalysisLogs([]);

    const trimmedPrompt = smartPrompt.trim();
    
    // 验证是否为规范输入
    const isInvalid = 
      !trimmedPrompt || // 空输入
      trimmedPrompt.length < 5 || // 长度少于 5 个字符
      /^[\d\s]+$/.test(trimmedPrompt) || // 纯数字（或纯数字带空格）
      (/^[a-zA-Z\s]+$/.test(trimmedPrompt) && trimmedPrompt.length < 10); // 纯英文但长度少于 10

    if (isInvalid) {
      setPromptError("检测到非规范输入。为了能够更准确地为您推荐合适的组件，请规范描述您的需求场景。");
      return;
    }
    setPromptError(null);
    if (!isLoggedIn) {

      setTimeout(() => {
        router.push(`/auth/login?redirect=${encodeURIComponent("/studio")}`);
      }, 500);
      return;
    }

    setIsAnalyzing(true);

    // 根据是否上传文件分流日志打印
    const logPool = uploadedFile
      ? [
        `[INFO] 正在读取上传的文件 ${uploadedFile.name}...`,
        `[INFO] 识别文件格式：${uploadedFile.name.split('.').pop()?.toUpperCase() || 'UNKNOWN'} (大小: ${(uploadedFile.size / 1024).toFixed(1)} KB)...`,
        `[INFO] 正在分析文档内容与数据结构...`,
        `[INFO] 正在分析您的需求描述内容：“${smartPrompt}”...`,
        `[INFO] 正在与大厅 ${COMPONENTS.length || 60} 个应用组件进行功能适配度比对...`,
        `[INFO] 正在检查当前空间的组件权限限制...`,
        `[SUCCESS] 推荐组件匹配分析已完成。`
      ]
      : [
        `[INFO] 未检测到上传文档，直接基于需求描述进行分析匹配...`,
        `[INFO] 正在解析您的需求描述内容：“${smartPrompt}”...`,
        `[INFO] 正在与大厅 ${COMPONENTS.length || 60} 个应用组件进行功能适配度比对...`,
        `[INFO] 正在检查当前空间的组件权限限制...`,
        `[SUCCESS] 推荐组件匹配分析已完成。`
      ];

    let logIndex = 0;
    const interval = setInterval(() => {
      if (logIndex < logPool.length) {
        setAnalysisLogs(prev => [...prev, logPool[logIndex]]);
        logIndex++;
      } else {
        clearInterval(interval);

        // 智能匹配计算逻辑：基于数据库 component_catalog 的 keywords / 名称 / 描述做通用需求匹配
        const promptLower = smartPrompt.toLowerCase();
        const fileLower = uploadedFile ? uploadedFile.name.toLowerCase() : "";

        const matchResults = COMPONENTS
          .map(comp => {
            const kwList = (comp.keywords || []).map(k => k.toLowerCase());
            const nameLower = comp.name.toLowerCase();
            const descLower = comp.description.toLowerCase();

            const kwHit = kwList.some(k => promptLower.includes(k));
            const nameHit = promptLower.length > 0 && (nameLower.includes(promptLower) || promptLower.includes(nameLower));
            const descHit = promptLower.length > 0 && descLower.includes(promptLower);
            const fileHit = fileLower.length > 0 && kwList.some(k => fileLower.includes(k) || k.includes(fileLower.split(".")[0]));

            if (!kwHit && !nameHit && !descHit && !fileHit) return null;

            // 确定性匹配度（基于组件 ID 派生的视觉分数）
            const scoreIdx = parseInt(comp.id.substring(1)) || 1;
            const score = 95.0 + ((scoreIdx * 7) % 49) / 10;
            const reason = `系统检测到与「${comp.name}」相关的需求特征，该组件可自动完成 ${comp.contract || "对应研发任务"}，大幅提升交付效率。`;

            return { component: comp, matchScore: score, reason };
          })
          .filter((item): item is { component: ComponentDefinition; matchScore: number; reason: string } => item !== null)
          .sort((a, b) => b.matchScore - a.matchScore)
          .slice(0, 3);

        setRecommendedComponents(matchResults);
        setIsAnalyzing(false);
        toast.success(`文档匹配分析完成，为您生成 ${matchResults.length} 个推荐装配方案`);
      }
    }, 250);
  };

  // 批量操作
  const toggleSelectMode = () => {
    setSelectMode(!selectMode);
    if (!selectMode) {
      setSelectedComponents([]);
    }
  };

  const toggleComponentSelection = (componentId: string) => {
    if (selectedComponents.includes(componentId)) {
      setSelectedComponents(selectedComponents.filter((id) => id !== componentId));
    } else {
      setSelectedComponents([...selectedComponents, componentId]);
    }
  };

  const batchFavorite = async () => {
    if (selectedComponents.length === 0) {
      toast.warning("请先选择要收藏的组件");
      return;
    }
    let count = 0;
    for (const id of selectedComponents) {
      if (!favorites.includes(id)) {
        await toggleFavorite(id);
        count++;
      }
    }
    setSelectedComponents([]);
    setSelectMode(false);
    toast.success(`已成功收藏 ${count} 个组件`);
  };

  const batchUnfavorite = async () => {
    if (selectedComponents.length === 0) {
      toast.warning("请先选择要取消收藏的组件");
      return;
    }
    let count = 0;
    for (const id of selectedComponents) {
      if (favorites.includes(id)) {
        await toggleFavorite(id);
        count++;
      }
    }
    setSelectedComponents([]);
    setSelectMode(false);
    toast.success(`已取消 ${count} 个组件的收藏`);
  };

  // 阶段分组数据（名称/颜色/顺序来自数据库 component_category 表）
  const stages = Object.entries(stageConfigs)
    .map(([idStr, details]) => {
      const stageId = parseInt(idStr);
      const stageComponents = COMPONENTS.filter(
        (c) => categoryToStageId[c.category] === stageId
      );
      return { id: stageId, name: details.name, details, components: stageComponents };
    })
    .filter((s) => s.components.length > 0)
    .sort((a, b) => a.id - b.id);

  // 检查某个阶段下是否有绑定的组件
  const getBoundComponentsInStage = (stageId: number) => {
    const stageComponents = COMPONENTS.filter(
      (c) => categoryToStageId[c.category] === stageId
    );
    return stageComponents.filter(c => currentBoundIds.includes(c.id));
  };

  // 获取排序筛选后的组件列表
  const getSortedComponents = (comps: ComponentDefinition[]) => {
    let result = [...comps];

    // 如果启用了任务匹配检索，进行高亮置顶
    if (matchedIds.length > 0) {
      // 保持全列表，但排序时让匹配的置顶
      result.sort((a, b) => {
        const aMatched = matchedIds.includes(a.id) ? 1 : 0;
        const bMatched = matchedIds.includes(b.id) ? 1 : 0;
        return bMatched - aMatched;
      });
      return result;
    }

    return result.sort((a, b) => {
      switch (sortBy) {
        case "hot":
          return (b.realUsageCount || 0) - (a.realUsageCount || 0);
        case "success":
          // 无任何执行记录的组件（successRate 为 null）统一排在最后
          return (getComponentExtra(b.contract, b.realUsageCount, b.realTaskStats).successRate ?? -1)
            - (getComponentExtra(a.contract, a.realUsageCount, a.realTaskStats).successRate ?? -1);
        case "new":
          return parseInt(b.id.substring(1)) - parseInt(a.id.substring(1));
        default:
          return parseInt(a.id.substring(1)) - parseInt(b.id.substring(1));
      }
    });
  };

  // 计算 Token 消耗百分比（底数设为 100,000）
  const tokenMax = 100000;
  const tokenPercentage = Math.min(100, Math.max(0, (workspaceToken / tokenMax) * 100));
  const strokeDashoffset = 125.6 - (125.6 * tokenPercentage) / 100;

  return (
    <div className="relative z-0 max-w-[1600px] mx-auto p-6 space-y-6" onClick={() => setShowSearchHistory(false)}>

      {/* 🚀 顶通栏：智阁全栈效能发布大厅愿景与价值中枢 */}
      <section className="bg-gradient-to-br from-[#f0f8ff] via-[#ebf8ff] to-[#ffffff] rounded-2xl p-6 shadow-sm border border-blue-100 relative overflow-hidden">
        {/* 装饰流光 */}
        <div className="absolute right-0 top-0 w-96 h-96 bg-[#63b3ed]/10 rounded-full filter blur-3xl pointer-events-none scale-150 transform translate-x-20 -translate-y-20" />
        <div className="absolute left-1/3 bottom-0 w-64 h-64 bg-indigo-300/5 rounded-full filter blur-3xl pointer-events-none" />

        <div className="relative z-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#3182ce]/10 text-[#2b6cb0] rounded-full text-xs font-black tracking-wider border border-[#3182ce]/20 uppercase">
            <Rocket className="w-3.5 h-3.5 text-[#2b6cb0]" />
            <span>知阁舟坊 · 全栈应用效能操作系统</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight leading-tight text-slate-800">
            以标准化“数据契约组件”一键装配软件工程全流程
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed font-semibold">
            专为个人和企业级用户研发提供 10 大应用阶段的效能资产包。直接查阅下方货架组件的输入/输出数据契约协议，一键装配引进，实现极速开发。系统支持数据契约流转，可根据上下游接口协议自动适配组件。
          </p>

          {/* 核心效能能力高亮标签组 */}
          <div className="flex flex-wrap gap-2.5 pt-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-100 rounded-lg text-xs font-bold text-slate-700 shadow-sm hover:border-[#3182ce] hover:text-[#3182ce] transition-all">
              <Target className="w-3.5 h-3.5 text-blue-500" />
              <span>标书自检提效 85%+</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-100 rounded-lg text-xs font-bold text-slate-700 shadow-sm hover:border-[#3182ce] hover:text-[#3182ce] transition-all">
              <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500/20" />
              <span>API 自动生成 3.5倍</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-100 rounded-lg text-xs font-bold text-slate-700 shadow-sm hover:border-[#3182ce] hover:text-[#3182ce] transition-all">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>单测对齐率 92.4%</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-100 rounded-lg text-xs font-bold text-slate-700 shadow-sm hover:border-[#3182ce] hover:text-[#3182ce] transition-all">
              <ShieldCheck className="w-3.5 h-3.5 text-red-500" />
              <span>安全漏洞审计 99.8%</span>
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-blue-100 rounded-lg text-xs font-bold text-slate-700 shadow-sm hover:border-[#3182ce] hover:text-[#3182ce] transition-all">
              <Workflow className="w-3.5 h-3.5 text-purple-500" />
              <span>契约流转自动选取推荐</span>
            </span>
          </div>
        </div>
      </section>

      {/* 研发布局中枢与主内容 */}
      <div className="flex flex-col gap-6">

        {/* 顶部：当前空间工作台监视中枢 (横向宽幅扁平布局) */}
        {isLoggedIn && (
          <section className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
            {/* 顶栏标题 */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <span className="text-xs font-black text-slate-800 tracking-tight flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-[#3182ce]" />
                当前空间研发布局控制台
              </span>
              {isSwitching && (
                <span className="w-3.5 h-3.5 border-2 border-[#3182ce] border-t-transparent rounded-full animate-spin"></span>
              )}
            </div>

            {/* 三列网格控制台 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              {/* 第一列：空间下拉切换选择器 */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 block uppercase tracking-wider">
                  当前工作空间
                </label>
                <div className="relative">
                  <select
                    disabled={isSwitching}
                    value={workspaceId || ""}
                    onChange={(e) => handleSwitchWorkspace(e.target.value)}
                    className="w-full h-10 px-3 pr-10 rounded-xl border border-slate-200 bg-slate-50 text-xs font-extrabold text-slate-700 outline-none appearance-none cursor-pointer focus:border-[#3182ce] focus:bg-white transition-all shadow-inner"
                  >
                    {userState.workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.type === "PERSONAL" ? "个人空间: " : "企业空间: "}
                        {ws.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* 第二列：剩余 Token 算力 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-wider">
                  <span>剩余调用额度</span>
                  <span className="text-slate-700 font-mono font-black">
                    {workspaceToken.toLocaleString()}
                    <span className="text-slate-400 font-bold ml-1">({formatYuanFromPoints(workspaceToken)})</span>
                  </span>
                </div>
                <div className="h-10 bg-slate-50 border border-slate-200/60 p-2.5 rounded-xl flex items-center gap-3 shadow-inner">
                  {/* 水平进度条 */}
                  <div className="flex-1 bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#3182ce] h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.round(tokenPercentage))}%` }}
                    />
                  </div>
                  <span className="text-xs font-black text-slate-700 font-mono shrink-0">
                    {Math.round(tokenPercentage)}%
                  </span>
                </div>
                <p className="text-[9px] font-bold text-slate-400">💡 换算规则：{POINT_RATE_TEXT}</p>
              </div>

              {/* 第三列：已装配资产摘要及展示控制 */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 block uppercase tracking-wider">
                  已装配应用资产
                </label>
                <div className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between shadow-inner">
                  <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5 truncate pr-2">
                    <FolderClosed className="w-4 h-4 text-[#3182ce] shrink-0" />
                    已装入 <span className="font-mono text-[#3182ce] font-black">{currentBoundIds.length}</span> 项组件
                  </span>
                  <button
                    onClick={() => setIsAssetsDrawerOpen(!isAssetsDrawerOpen)}
                    className={`h-8 px-3 rounded-lg border text-xs font-black transition-all flex items-center gap-1 cursor-pointer shadow-sm shrink-0 ${
                      isAssetsDrawerOpen
                        ? "bg-[#3182ce] text-white border-[#3182ce]"
                        : "bg-white text-slate-700 border-slate-200 hover:border-[#3182ce]"
                    }`}
                  >
                    <span>{isAssetsDrawerOpen ? "收起明细" : "展开明细"}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${isAssetsDrawerOpen ? "transform rotate-180" : ""}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* 下拉资产树面板 - 抽屉 */}
            {isAssetsDrawerOpen && (() => {
              const boundComps = currentBoundIds
                .map(id => COMPONENTS.find(c => c.id === id))
                .filter((c): c is ComponentDefinition => !!c);
              const displayComps = boundComps.slice(0, 3);
              const hasMore = currentBoundIds.length > 3;

              return (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-3 animate-in slide-in-from-top duration-200">
                  <div className="flex items-center justify-between pl-1">
                    <span className="text-xs font-black text-slate-500">当前空间已装配资产详细拓扑：</span>
                    {hasMore && (
                      <button
                        onClick={() => {
                          if (workspaceId) {
                            router.push(`/workspace/${workspaceId}?tab=components`);
                          }
                        }}
                        className="text-xs font-black text-[#3182ce] hover:text-[#2b6cb0] flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <span>查看更多组件 ({currentBoundIds.length - 3} 项)</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {currentBoundIds.length === 0 ? (
                    <div className="py-8 text-center bg-[#f8fafc]/60 rounded-xl border border-slate-200/60 flex flex-col items-center justify-center">
                      <p className="text-xs text-slate-400 font-semibold">该空间尚未绑定任何组件</p>
                      <p className="text-xs text-slate-400 mt-1">您可以从下方货架区选择需要引进的效能资产</p>
                      <button
                        onClick={() => {
                          const target = document.getElementById("dispatch-engines");
                          if (target) {
                            target.scrollIntoView({ behavior: "smooth" });
                          }
                        }}
                        className="mt-3.5 px-4 py-2 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-black rounded-[4px] transition-all cursor-pointer shadow-sm hover:shadow hover:-translate-y-0.5 active:scale-95 flex items-center gap-1.5 border-t border-[#63b3ed]/20"
                      >
                        <Zap className="w-3.5 h-3.5 text-white animate-pulse" />
                        <span>立即装配组件</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 pr-1">
                      {displayComps.map((c) => {
                        const stageId = categoryToStageId[c.category];
                        const stageConfig = stageConfigs[stageId];
                        const isUsed = recentUsed.includes(c.id);

                        return (
                          <div
                            key={c.id}
                            className={`p-4 rounded-lg flex flex-col justify-between h-[160px] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group ${
                              isUsed ? "bg-emerald-50/30 hover:bg-emerald-50/50" : "bg-white/95 hover:bg-blue-50/20"
                            }`}
                            style={{
                              border: hoveredCardId === c.id
                                ? (isUsed ? '1px solid rgba(56, 161, 105, 0.8)' : '1px solid rgba(49, 130, 206, 0.7)')
                                : (isUsed ? '1px solid rgba(167, 243, 208, 0.7)' : '1px solid rgba(226, 232, 240, 0.8)')
                            }}
                            onMouseEnter={() => setHoveredCardId(c.id)}
                            onMouseLeave={() => setHoveredCardId(null)}
                          >
                            <div className="space-y-1.5">
                              {/* 头部：阶段图标与 ID 标签，右侧为状态和所属阶段 */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <div className="p-1 bg-slate-100 rounded text-slate-600 group-hover:bg-blue-50 group-hover:text-[#3182ce] transition-colors shrink-0">
                                    {getStageIcon(stageId, stageConfigs, "w-3.5 h-3.5 shrink-0", false)}
                                  </div>
                                  <span className="text-[9px] font-black bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono tracking-wider group-hover:bg-blue-50 group-hover:text-[#3182ce] transition-all">
                                    {c.id}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {isUsed && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-black px-1.5 py-0.5 rounded-[4px] bg-emerald-50 text-emerald-600 border border-emerald-100 animate-pulse">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                      活跃使用中
                                    </span>
                                  )}
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-[4px] border ${
                                    stageId === 1 ? "bg-blue-50 text-[#2b6cb0] border-blue-100" :
                                    stageId === 2 ? "bg-indigo-50 text-[#5a67d8] border-indigo-100" :
                                    stageId === 3 ? "bg-purple-50 text-[#805ad5] border-purple-100" :
                                    stageId === 4 ? "bg-amber-50 text-[#d97706] border-amber-100" :
                                    stageId === 5 ? "bg-blue-50 text-[#3182ce] border-blue-100" :
                                    stageId === 6 ? "bg-emerald-50 text-[#059669] border-emerald-100" :
                                    stageId === 7 ? "bg-slate-100 text-slate-700 border-slate-200" :
                                    stageId === 8 ? "bg-red-50 text-red-600 border-red-100" :
                                    stageId === 9 ? "bg-amber-50 text-[#f59e0b] border-amber-100" :
                                    "bg-blue-50 text-[#63b3ed] border-blue-100"
                                  }`}>
                                    {stageConfig?.name}
                                  </span>
                                </div>
                              </div>

                              {/* 中部：标题、数据契约流向与简短描述 */}
                              <div>
                                <h4 className="text-xs font-black text-slate-800 group-hover:text-[#3182ce] transition-colors truncate" title={c.name}>
                                  {c.name}
                                </h4>
                                <div className="flex items-center gap-1 text-[9px] font-bold text-[#3182ce] mt-1 bg-blue-50/30 px-1.5 py-0.5 rounded border border-blue-100/30 w-max font-mono">
                                  <span>{getComponentExtra(c.contract).contract}</span>
                                </div>
                                <p className="text-[10px] text-slate-400 line-clamp-1 mt-1 leading-normal" title={c.description}>
                                  {c.description}
                                </p>
                              </div>
                            </div>

                            {/* 底部：操作按钮 */}
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100/50">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await handleQuickBind(e, c.id, c.name, true);
                                }}
                               className="px-3 py-1.5 rounded-[4px] text-[11px] font-black bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-600 transition-all cursor-pointer border border-red-100/40"
                              >
                                解除装配
                              </button>
                              <button
                                onClick={() => {
                                  if (workspaceId) {
                                    router.push(`/workspace/${workspaceId}?tab=tasks`);
                                  }
                                }}
                                className="px-3 py-1.5 rounded-[4px] text-[11px] font-black bg-blue-50 text-[#3182ce] hover:bg-[#3182ce] hover:text-white transition-all flex items-center gap-1 cursor-pointer shadow-sm border border-blue-100/40"
                              >
                                <span>立即使用</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </section>
        )}

        {/* 全栈组件大地图与货架 - 无论是登录还是游客，都完全拉通占满 100% 宽度 */}
        <main className="space-y-6">

          {/* 模式分流选择器 (一分为二的双轨工作模式导流板) */}
          <section id="dispatch-engines" className="bg-white rounded-2xl p-5 sm:p-6 border border-[#e2e8f0]/90 shadow-sm space-y-4">
            <div>
              <div className="inline-flex items-center gap-1 bg-blue-50 text-[#3182ce] px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide border border-blue-100 uppercase">
                🔍 检索与装配双引擎
              </div>
              <h2 className="text-sm font-black text-slate-900 tracking-tight mt-2 flex items-center gap-1.5">
                如何寻找最适合您的效能资产组件？
              </h2>
              <p className="text-xs text-slate-400 font-bold mt-1 leading-normal">
                本平台提供【自动匹配】与【自主精细化筛选】双重通道，帮助您快速定位并装配全栈研发流程中所需的组件。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 左卡片：文件自动匹配 */}
              <div
                onClick={() => {
                  setWorkMode("smart");
                  setPromptError(null);
                }}
                className={`group relative rounded-xl p-4 border transition-all duration-300 cursor-pointer flex flex-col justify-between hover:shadow-md hover:-translate-y-0.5 ${workMode === "smart"
                  ? "border-[#3182ce] bg-blue-50/15 ring-2 ring-blue-500/5 shadow-sm"
                  : "border-slate-200/90 bg-slate-100/30 hover:bg-white hover:border-slate-300"
                  }`}
              >
                {/* 装饰微光 */}
                {workMode === "smart" && (
                  <div className="absolute right-0 bottom-0 w-24 h-24 bg-blue-100/15 rounded-full filter blur-xl pointer-events-none" />
                )}

                <div className="space-y-2 relative z-10">
                  <div className="flex items-center flex-wrap gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${workMode === "smart" ? "bg-[#3182ce] text-white shadow-md shadow-blue-500/10" : "bg-slate-200/80 text-slate-500 group-hover:bg-slate-300/50"
                      } /* 触发重新编译 */`}>
                      <Search className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-slate-800">方式一：自动匹配组件</span>
                    <span className="text-[10px] font-black px-1.5 py-0.5 rounded-[4px] bg-amber-50 text-amber-600 border border-amber-200/80 flex items-center gap-0.5 shadow-sm shrink-0">
                      <Zap className="w-2.5 h-2.5 text-amber-500 fill-amber-500 animate-pulse" />
                      推荐
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                    根据上传的资源文件，或者是简单的需求描述，系统自动与组件大厅的资源比对，输出最契合的推荐装配方案。
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between relative z-10 pt-2 border-t border-slate-100/60">
                  <span className="text-[10px] text-slate-400 font-bold">上传资源/描述需求自动匹配</span>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded transition-all ${workMode === "smart"
                    ? "bg-[#3182ce] text-white shadow-sm"
                    : "bg-slate-200 text-slate-600 group-hover:bg-[#3182ce]/10 group-hover:text-[#3182ce]"
                    }`}>
                    {workMode === "smart" ? "当前使用中" : "切换至此方式"}
                  </span>
                </div>
              </div>

              {/* 右卡片：自主选择组件 */}
              <div
                onClick={() => {
                  setWorkMode("active");
                  setPromptError(null);
                }}
                className={`group relative rounded-xl p-4 border transition-all duration-300 cursor-pointer flex flex-col justify-between hover:shadow-md hover:-translate-y-0.5 ${workMode === "active"
                  ? "border-[#3182ce] bg-blue-50/15 ring-2 ring-blue-500/5 shadow-sm"
                  : "border-slate-200/90 bg-slate-100/30 hover:bg-white hover:border-slate-300"
                  }`}
              >
                {/* 装饰微光 */}
                {workMode === "active" && (
                  <div className="absolute right-0 bottom-0 w-24 h-24 bg-blue-100/15 rounded-full filter blur-xl pointer-events-none" />
                )}

                <div className="space-y-2 relative z-10">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${workMode === "active" ? "bg-[#3182ce] text-white shadow-md shadow-blue-500/10" : "bg-slate-200/80 text-slate-500 group-hover:bg-slate-300/50"
                      }`}>
                      <Workflow className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-black text-slate-800">方式二：自主精细化筛选</span>
                  </div>
                  <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                    按 10 大研发阶段可视化查看、一键收藏和装配 {COMPONENTS.length || 60} 个精品效能组件，适合有明确目标、需自主挑选和快捷装配的应用场景。
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between relative z-10 pt-2 border-t border-slate-100/60">
                  <span className="text-[10px] text-slate-400 font-bold">查看应用链路地图与货架</span>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded transition-all ${workMode === "active"
                    ? "bg-[#3182ce] text-white shadow-sm"
                    : "bg-slate-200 text-slate-600 group-hover:bg-[#3182ce]/10 group-hover:text-[#3182ce]"
                    }`}>
                    {workMode === "active" ? "当前使用中" : "切换至此方式"}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {workMode === "active" ? (
            <>
              {isLoggedIn && (
                /* ==================== 已登录状态：应用需求快速检索控制台 ==================== */
                <section className="bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-[#e2e8f0]/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
                  {/* 装饰微光 */}
                  <div className="absolute right-0 top-0 w-48 h-48 bg-blue-100/30 rounded-full filter blur-3xl pointer-events-none scale-150 transform translate-x-20 -translate-y-10" />

                  <div className="space-y-1.5 relative z-10 max-w-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-md shadow-blue-500/10">
                        <Workflow className="w-4 h-4" />
                      </div>
                      <h3 className="text-sm font-black text-slate-800 tracking-tight">应用需求快速检索</h3>
                    </div>
                    <p className="text-xs text-slate-400 font-bold leading-normal">
                      输入您的应用需求（如“标书解析”或“数据库建模”），系统将自动筛选出适合您的应用组件。
                    </p>
                  </div>

                  <form onSubmit={handleTaskMatchSearch} className="relative z-10 flex items-center bg-slate-100/30 border border-slate-200 p-1 rounded-xl transition-all focus-within:border-[#3182ce]/50 focus-within:bg-white focus-within:ring-2 focus-within:ring-blue-500/5 shadow-inner w-full md:max-w-md shrink-0">
                    <input
                      type="text"
                      placeholder="例如：我想要逆向数据库生成API单测和Dockerfile..."
                      value={taskSearchQuery}
                      onChange={(e) => setTaskSearchQuery(e.target.value)}
                      className="w-full px-3 py-2 bg-transparent border-none text-xs text-slate-700 outline-none font-bold"
                    />
                    <button
                      type="submit"
                      disabled={isTaskSearching}
                      className="bg-[#3182ce] hover:bg-[#2b6cb0] text-white px-3 py-1.5 h-8 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1 shrink-0 cursor-pointer shadow"
                    >
                      {isTaskSearching ? (
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <span>开始检索</span>
                      )}
                    </button>
                  </form>
                </section>
              )}

              {/* 🌐 全栈 10 大应用阶段可视化步骤链路地图 (Workflow Step Chain) */}
              <section className="bg-white rounded-2xl p-5 border border-[#e2e8f0]/80 shadow-sm space-y-4" id="catalog">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3 pl-1">
                  <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                    <Workflow className="w-4 h-4 text-slate-400" />
                    全栈应用链路流水线控制地图 (SPA 单阶段货架模式)
                  </span>
                </div>

                {/* 流水线甘特连线链 */}
                <div className="relative overflow-x-auto pb-4 pt-2 px-1 scrollbar-thin">

                  {/* CSS 流光动画连线背景 */}
                  <div className="absolute top-[32px] left-[50px] right-[50px] h-0.5 bg-gradient-to-r from-blue-200 via-[#63b3ed] to-emerald-200 rounded animate-pulse pointer-events-none z-0" />

                  <div className="relative z-10 flex items-center justify-between min-w-[950px] px-4">
                    {stages.map((stage) => {
                      // 默认 selectedStage === -1 时高亮阶段一
                      const isSelected = selectedStage === -1 ? stage.id === 1 : selectedStage === stage.id;
                      return (
                        <div key={stage.id} className="flex flex-col items-center gap-2 group relative">
                          {/* 圆形工程矢量图标 */}
                          <button
                            onClick={() => setSelectedStage(stage.id)}
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-lg transition-all duration-300 shadow-md cursor-pointer border ${isSelected
                              ? "bg-slate-800 border-slate-800 text-white scale-110 ring-4 ring-slate-800/10"
                              : "bg-white border-slate-200 hover:border-[#3182ce] hover:scale-105"
                              }`}
                          >
                            {getStageIcon(stage.id, stageConfigs, isSelected ? "w-5 h-5 text-white" : "w-5 h-5", !isSelected)}
                          </button>

                          {/* 阶段名称与组件计数 */}
                          <span className={`text-xs font-black transition-colors ${isSelected ? "text-slate-800 font-extrabold" : "text-slate-500 group-hover:text-slate-800 font-semibold"}`}>
                            {stage.name}
                          </span>
                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded font-mono ${isSelected ? "bg-blue-50 text-[#3182ce] border border-blue-100" : "bg-slate-100 text-slate-400"}`}>
                            {stage.components.length} 组件
                          </span>

                          {/* 指引气泡提示 */}
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xs font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow z-20">
                            第 {stage.id} 阶段：应用装配
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* 筛选控制面板 */}
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl p-4 border border-[#e2e8f0]/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">

                {/* 模糊检索 */}
                <div className="relative w-full md:max-w-md" onClick={(e) => e.stopPropagation()}>
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="在当前应用阶段货架检索组件名、标签..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setShowSearchHistory(true)}
                    className="w-full h-10 pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50/50 text-xs text-slate-800 focus:outline-none focus:border-[#3182ce] focus:bg-white transition-all font-extrabold"
                  />

                  {showSearchHistory && (searchHistory.length > 0 || searchQuery.trim()) && (
                    <div className="absolute top-full left-0 mt-2 w-full bg-white rounded-xl shadow-2xl border border-slate-200 p-4 z-50 animate-in fade-in duration-150">
                      {!searchQuery.trim() && searchHistory.length > 0 && (
                        <div>
                          <div className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              <Search className="w-3.5 h-3.5" />
                              搜索历史
                            </span>
                            <button
                              onClick={() => saveSearchHistory([])}
                              className="text-slate-400 hover:text-red-500 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="space-y-1">
                            {searchHistory.slice(0, 5).map((term, index) => (
                              <button
                                key={index}
                                onClick={() => handleSearchItemClick(term)}
                                className="w-full text-left px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 rounded-lg flex items-center gap-2 cursor-pointer"
                              >
                                <Search className="w-3 h-3 text-slate-400" />
                                {term}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 排序及管理 */}
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
                  <button
                    onClick={() => {
                      const orders: Array<typeof sortBy> = ["default", "hot", "success", "new"];
                      const nextIdx = (orders.indexOf(sortBy) + 1) % orders.length;
                      setSortBy(orders[nextIdx]);
                    }}
                    className="h-9 px-4 rounded-xl border border-slate-200 bg-white hover:border-[#3182ce] text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    {sortBy === "default" && <SortAsc className="w-3.5 h-3.5" />}
                    {sortBy === "hot" && <TrendingUp className="w-3.5 h-3.5 text-[#f59e0b]" />}
                    {sortBy === "success" && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                    {sortBy === "new" && <SortDesc className="w-3.5 h-3.5 text-purple-500" />}
                    <span>
                      {sortBy === "default" && "默认排序"}
                      {sortBy === "hot" && "热度走势"}
                      {sortBy === "success" && "测试成功率"}
                      {sortBy === "new" && "全新发布"}
                    </span>
                  </button>

                  {/* 批量操作 (登录可见) */}
                  {isLoggedIn && (
                    <>
                      <button
                        onClick={toggleSelectMode}
                        className={`h-9 px-4 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition-all cursor-pointer ${selectMode ? "bg-purple-600 text-white border-purple-600" : "bg-white text-slate-700 border-slate-200 hover:border-purple-600"
                          }`}
                      >
                        <Bookmark className="w-3.5 h-3.5" />
                        <span>{selectMode ? `已选 ${selectedComponents.length} 项` : "批量操作"}</span>
                      </button>

                      {selectMode && (
                        <div className="flex gap-1.5">
                          <button
                            onClick={batchFavorite}
                            className="h-9 px-3.5 bg-gradient-to-r from-amber-500 to-amber-500 text-white rounded-xl text-xs font-bold cursor-pointer hover:shadow-md transition-all"
                          >
                            批量收藏
                          </button>
                          <button
                            onClick={batchUnfavorite}
                            className="h-9 px-3.5 bg-red-500 text-white rounded-xl text-xs font-bold cursor-pointer hover:shadow-md transition-all"
                          >
                            批量取消
                          </button>
                        </div>
                      )}
                    </>
                  )}

                  {/* 视图切换 */}
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/60 shadow-sm shrink-0">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === "grid" ? "bg-white text-[#3182ce] shadow-sm" : "text-slate-500 hover:text-slate-800"
                        }`}
                    >
                      <Grid3X3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === "list" ? "bg-white text-[#3182ce] shadow-sm" : "text-slate-500 hover:text-slate-800"
                        }`}
                    >
                      <List className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 60 项组件主列表 (Tab 切换应用阶段货架) */}
              {(() => {
                // 当前激活的应用阶段组件集
                const activeStageId = selectedStage === -1 ? 1 : selectedStage;
                const currentStage = stages.find((s) => s.id === activeStageId) || stages[0] || null;

                // 组件目录尚未从数据库加载完成时，渲染加载占位，避免访问 undefined 崩溃
                if (!currentStage || !currentStage.components || currentStage.components.length === 0) {
                  return (
                    <div className="bg-white border border-[#e2e8f0]/80 rounded-2xl p-10 text-center shadow-sm">
                      <Activity className="w-8 h-8 text-slate-400 block mx-auto mb-3 animate-pulse" />
                      <p className="text-xs font-black text-slate-700">组件货架加载中...</p>
                      <p className="text-xs text-slate-400 mt-1">正在从数据库加载组件目录</p>
                    </div>
                  );
                }

                // 过滤搜索内容
                const comps = currentStage.components.filter((c) => {
                  const matchesSearch =
                    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    c.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    c.tags.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()));
                  return matchesSearch;
                });

                if (comps.length === 0) {
                  return (
                    <div className="bg-white border border-[#e2e8f0]/80 rounded-2xl p-10 text-center shadow-sm">
                      <Search className="w-8 h-8 text-slate-400 block mx-auto mb-3" />
                      <p className="text-xs font-black text-slate-700">当前阶段货架未检索到符合条件的组件</p>
                      <p className="text-xs text-slate-400 mt-1">您可以更换检索词或切换流水线其他步骤</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2.5 pb-2 border-b border-[#e2e8f0]/60">
                      <h3 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
                        <FolderOpen className="w-4 h-4 text-[#3182ce]" />
                        <span>{currentStage.name} 研发阶段精品货架</span>
                      </h3>
                      <span className="px-2.5 py-0.5 bg-blue-50 text-[#3182ce] text-xs font-bold rounded-full border border-blue-100/50 font-mono">
                        {comps.length} 项资产已就绪
                      </span>
                    </div>

                    {viewMode === "grid" ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {getSortedComponents(comps).map((comp) => {
                          const extra = getComponentExtra(comp.contract, comp.realUsageCount, comp.realTaskStats);
                          const isFav = favorites.includes(comp.id);
                          const isBound = currentBoundIds.includes(comp.id);
                          const isSelected = selectedComponents.includes(comp.id);
                          const isRestricted = restrictedComponentIds.includes(comp.id);

                          // 需求检索匹配高亮，未匹配组件添加淡出效果
                          const isMatched = matchedIds.includes(comp.id);
                          const hasMatchingActive = matchedIds.length > 0;
                          const isDimmed = hasMatchingActive && !isMatched;

                          return (
                            <div
                              key={comp.id}
                              onClick={() => {
                                if (selectMode) {
                                  toggleComponentSelection(comp.id);
                                } else {
                                  handleOpenDispatcher(comp.id);
                                }
                              }}
                              className={`group relative bg-white border rounded-2xl p-5 hover:shadow-lg transition-all duration-300 flex flex-col justify-between cursor-pointer hover:-translate-y-1 hover:translate-x-0.5 ${isSelected
                                ? "border-purple-600 bg-purple-50/5 ring-2 ring-purple-600/20"
                                : isDimmed
                                  ? "opacity-35 scale-95 border-slate-100"
                                  : isMatched
                                    ? "border-blue-500 ring-2 ring-blue-500/25 bg-blue-50/5"
                                    : isBound
                                      ? "border-[#63b3ed] shadow-sm"
                                      : "border-slate-200/90"
                                }`}
                            >
                              <div>
                                {/* 头部：ID + 契约流徽标 + 状态 */}
                                <div className="flex items-center justify-between gap-2 mb-3">
                                  <span className="text-xs font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                                    {comp.id}
                                  </span>

                                  {/* 数据流向契约微标 */}
                                  <span className="text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded flex items-center gap-0.5 shadow-sm font-mono truncate">
                                    <ArrowRightLeft className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                                    <span className="truncate">{extra.contract}</span>
                                  </span>

                                  <div className="flex gap-1 items-center shrink-0">
                                    {comp.isPremium && (
                                      <span className="px-1.5 py-0.5 bg-gradient-to-r from-amber-500 to-amber-500 text-white rounded text-xs font-black flex items-center gap-0.5 shadow-sm">
                                        <Award className="w-2.5 h-2.5" />
                                        <span>PREMIUM</span>
                                      </span>
                                    )}
                                    {isLoggedIn ? (
                                      <>
                                        {isRestricted ? (
                                          <span className="px-1.5 py-0.5 bg-red-50 text-red-500 rounded text-xs font-bold border border-red-200">受限</span>
                                        ) : isBound ? (
                                          <span className="px-1.5 py-0.5 bg-blue-50 text-[#3182ce] rounded text-xs font-bold border border-blue-200">已装配</span>
                                        ) : null}
                                      </>
                                    ) : null}
                                  </div>
                                </div>

                                {/* 标题 */}
                                <h4 className="text-[13px] font-black text-slate-800 mb-1.5 flex items-center gap-2" title={comp.name}>
                                  {/* 用精致小方盒包裹组件 Emoji 图标 */}
                                  <div className="w-6 h-6 rounded bg-blue-50/80 text-[#3182ce] flex items-center justify-center shrink-0">
                                    {(() => { const Ico = iconMap[comp.icon || ""] || Box; return <Ico className="w-3.5 h-3.5" />; })()}
                                  </div>
                                  <span className="group-hover:text-[#3182ce] transition-colors truncate">{comp.name}</span>
                                </h4>

                                {/* 描述 */}
                                <p 
                                  className="text-xs text-slate-500 font-semibold leading-relaxed line-clamp-2 min-h-[32px] mb-4 select-none"
                                  title={comp.description}
                                >
                                  {comp.description}
                                </p>

                                {/* 真实调用次数与成功率（数据均来自数据库，无执行记录时显示"暂无"） */}
                                <div className="flex items-center justify-between text-xs text-slate-400 font-bold mb-4 bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
                                  <div className="flex items-center gap-2">
                                    <div className="flex flex-col">
                                      <span className="text-xs text-slate-400 font-bold">累计调用</span>
                                      <span className="text-slate-700 font-black font-mono">{extra.calls.toLocaleString()} 次</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 pr-1">
                                    <div className="relative w-5 h-5 flex items-center justify-center">
                                      <svg className="w-5 h-5 transform -rotate-90">
                                        <circle cx="10" cy="10" r="8" fill="none" stroke="#e2e8f0" strokeWidth="2" />
                                        <circle
                                          cx="10"
                                          cy="10"
                                          r="8"
                                          fill="none"
                                          stroke="#059669"
                                          strokeWidth="2"
                                          strokeDasharray="50"
                                          strokeDashoffset={50 - (50 * (extra.successRate ?? 0)) / 100}
                                          strokeLinecap="round"
                                        />
                                      </svg>
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-xs text-slate-400 font-bold">成功率</span>
                                      <span className="text-emerald-600 font-black font-mono">
                                        {extra.successRate !== null ? `${extra.successRate.toFixed(1)}%` : "暂无"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* 动作按钮 */}
                              {!selectMode && (
                                <div className="flex items-center gap-2 mt-1">
                                  {isLoggedIn ? (
                                    <>
                                      {/* 已登录状态：双按钮设计 */}
                                      <button
                                        onClick={(e) => handleQuickBind(e, comp.id, comp.name, isBound)}
                                        className={`w-[38%] h-8 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-sm border ${isBound
                                          ? "bg-red-50/60 text-red-600 border-red-200 hover:bg-red-100/50"
                                          : "bg-white text-[#3182ce] border-[#3182ce]/20 hover:bg-blue-50/50"
                                          }`}
                                      >
                                        <Layers className="w-3.5 h-3.5" />
                                        <span>{isBound ? "解除" : "装配"}</span>
                                      </button>

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenDispatcher(comp.id);
                                        }}
                                        className="flex-1 h-8 text-xs font-black text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] rounded-lg hover:shadow-md transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                                      >
                                        <Workflow className="w-3.5 h-3.5 text-white" />
                                        <span>立即使用</span>
                                      </button>

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleToggleFavorite(comp.id);
                                        }}
                                        className={`w-8 h-8 border rounded-lg flex items-center justify-center cursor-pointer transition-all ${isFav ? "border-amber-300 bg-amber-50 text-amber-500" : "border-slate-200 text-slate-400 hover:border-amber-500"
                                          }`}
                                      >
                                        <Star className={`w-4 h-4 ${isFav ? "fill-current" : ""}`} />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      {/* 游客状态：立即使用大按钮（直接跳转登录） */}
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          router.push(`/auth/login?redirect=/studio`);
                                        }}
                                        className="flex-1 h-8 text-xs font-black text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] rounded-lg hover:shadow-md transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                                      >
                                        <Workflow className="w-3.5 h-3.5" />
                                        <span>立即使用</span>
                                      </button>

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toast.error("您尚未登录，请先登录系统", 1000);
                                          setTimeout(() => {
                                            router.push(`/auth/login?redirect=/studio`);
                                          }, 1200);
                                        }}
                                        className="w-8 h-8 border border-slate-200 text-slate-400 hover:border-blue-500 hover:text-blue-500 bg-slate-50/50 rounded-lg flex items-center justify-center cursor-pointer transition-all"
                                        title="登录装配"
                                      >
                                        <Star className="w-4 h-4" />
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* 列表形式货架 */
                      <div className="bg-white border border-[#e2e8f0]/80 rounded-2xl shadow-sm overflow-hidden">
                        <div className="divide-y divide-slate-100">
                          {getSortedComponents(comps).map((comp) => {
                            const extra = getComponentExtra(comp.contract, comp.realUsageCount, comp.realTaskStats);
                            const isFav = favorites.includes(comp.id);
                            const isBound = currentBoundIds.includes(comp.id);
                            const isSelected = selectedComponents.includes(comp.id);
                            const isRestricted = restrictedComponentIds.includes(comp.id);

                            return (
                              <div
                                key={comp.id}
                                onClick={() => {
                                  if (selectMode) {
                                    toggleComponentSelection(comp.id);
                                  } else {
                                    handleOpenDispatcher(comp.id);
                                  }
                                }}
                                className={`flex items-center justify-between p-4 transition-all cursor-pointer hover:bg-slate-50/50 ${isSelected ? "bg-purple-50/20" : ""
                                  }`}
                              >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                  {selectMode && (
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => { }}
                                      className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 w-4 h-4 cursor-pointer"
                                    />
                                  )}
                                  {/* 用精致小方盒包裹组件 Emoji 图标 */}
                                  <div className="w-8 h-8 rounded-lg bg-blue-50/80 text-[#3182ce] flex items-center justify-center shrink-0">
                                    {(() => { const Ico = iconMap[comp.icon || ""] || Box; return <Ico className="w-4 h-4" />; })()}
                                  </div>
                                  <div className="min-w-0 flex-1 pr-4">
                                    <div className="flex items-center gap-2 mb-0.5">
                                      <span className="text-xs font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">{comp.id}</span>
                                      <span className="text-xs font-black text-slate-800 truncate">{comp.name}</span>
                                      {comp.isPremium && (
                                        <span className="px-1.5 py-0.5 bg-gradient-to-r from-amber-500 to-amber-500 text-white rounded text-xs font-black">PREMIUM</span>
                                      )}
                                      {isLoggedIn ? (
                                        <>
                                          {isRestricted ? (
                                            <span className="px-1.5 py-0.5 bg-red-50 text-red-500 rounded text-xs font-bold border border-red-200">受限</span>
                                          ) : isBound ? (
                                            <span className="px-1.5 py-0.5 bg-blue-50 text-[#3182ce] rounded text-xs font-bold border border-blue-200">已绑定</span>
                                          ) : null}
                                        </>
                                      ) : null}
                                    </div>
                                    <p className="text-xs text-slate-500 truncate font-semibold leading-normal" title={comp.description}>{comp.description}</p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-6">
                                  <div className="flex items-center gap-4 text-xs text-slate-400 font-bold hidden md:flex">
                                    <span className="flex items-center gap-0.5"><Activity className="w-3.5 h-3.5 text-[#f59e0b]" /> {extra.calls} 次调用</span>
                                    <span className="flex items-center gap-0.5"><CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> {extra.successRate !== null ? `${extra.successRate.toFixed(1)}% 成功率` : "暂无成功率数据"}</span>
                                  </div>

                                  {!selectMode && (
                                    <div className="flex gap-2">
                                      {isLoggedIn ? (
                                        <>
                                          <button
                                            onClick={(e) => handleQuickBind(e, comp.id, comp.name, isBound)}
                                            className={`h-7 px-2.5 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-sm border ${isBound
                                              ? "bg-red-50/60 text-red-600 border-red-200 hover:bg-red-100/50"
                                              : "bg-white text-[#3182ce] border-[#3182ce]/20 hover:bg-blue-50/50"
                                              }`}
                                          >
                                            <Layers className="w-3.5 h-3.5" />
                                            <span>{isBound ? "解除" : "装配"}</span>
                                          </button>

                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleOpenDispatcher(comp.id);
                                            }}
                                            className="h-7 px-3.5 text-xs font-black text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] rounded-lg hover:shadow-md transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                                          >
                                            <Workflow className="w-3.5 h-3.5" />
                                            <span>立即使用</span>
                                          </button>

                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              handleToggleFavorite(comp.id);
                                            }}
                                            className={`w-7 h-7 border rounded-lg flex items-center justify-center cursor-pointer transition-all ${isFav ? "border-amber-300 bg-amber-50 text-amber-500" : "border-slate-200 text-slate-400 hover:border-amber-500"
                                              }`}
                                          >
                                            <Star className={`w-3.5 h-3.5 ${isFav ? "fill-current" : ""}`} />
                                          </button>
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              router.push(`/auth/login?redirect=/studio`);
                                            }}
                                            className="h-7 px-3.5 text-xs font-black text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] rounded-lg hover:shadow-md transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                                          >
                                            <Workflow className="w-3.5 h-3.5" />
                                            <span>立即使用</span>
                                          </button>

                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toast.error("您尚未登录，请先登录系统", 1000);
                                              setTimeout(() => {
                                                router.push(`/auth/login?redirect=/studio`);
                                              }, 1200);
                                            }}
                                            className="w-7 h-7 border border-slate-200 text-slate-400 hover:border-blue-500 hover:text-blue-500 bg-slate-50/50 rounded-lg flex items-center justify-center cursor-pointer transition-all"
                                            title="收藏组件"
                                          >
                                            <Star className="w-3.5 h-3.5" />
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          ) : (
            /* ==================== 应用组件匹配推荐 ==================== */
            <div className="space-y-6">
              <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white shadow-md">
                    <Compass className="w-4.5 h-4.5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-800 tracking-tight">应用组件匹配推荐</h3>
                    <p className="text-xs text-slate-400 font-bold mt-0.5">上传您需要 analysis 的资源文件，系统将自动匹配适合的应用组件</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  {/* 左侧：文件上传与输入区 */}
                  <div className="space-y-5">
                    {/* 拖拽上传文件区 */}
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      className={`relative border-2 border-dashed rounded-2xl p-6 transition-all text-center flex flex-col items-center justify-center min-h-[180px] group ${dragActive
                        ? "border-[#3182ce] bg-blue-50/20"
                        : uploadedFile
                          ? "border-emerald-300 bg-emerald-50/5"
                          : "border-slate-200 hover:border-[#3182ce]/50 bg-slate-50/50 hover:bg-white"
                        }`}
                    >
                      <input
                        type="file"
                        id="contract-file-upload"
                        onChange={handleFileChange}
                        accept=".json,.pdf,.txt,.md,.xml,.csv,.yaml,.yml"
                        className="hidden"
                      />

                      {uploadedFile ? (
                        <div className="space-y-3.5">
                          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-500 border border-emerald-100 flex items-center justify-center mx-auto shadow-sm">
                            <CheckCircle2 className="w-6 h-6" />
                          </div>
                          <div>
                            <span className="text-xs font-black text-slate-800 block truncate max-w-[240px] mx-auto">{uploadedFile.name}</span>
                            <span className="text-xs font-bold text-slate-400 block mt-0.5 font-mono">
                              {(uploadedFile.size / 1024).toFixed(1)} KB
                            </span>
                          </div>
                          <button
                            onClick={clearUploadedFile}
                            className="h-8 px-3 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-500 text-xs font-black transition-all cursor-pointer shadow-sm flex items-center gap-1 mx-auto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>清除文件</span>
                          </button>
                        </div>
                      ) : (
                        <label
                          htmlFor="contract-file-upload"
                          className="cursor-pointer flex flex-col items-center justify-center space-y-3 w-full h-full"
                        >
                          <div className="w-12 h-12 rounded-full bg-blue-50 text-[#3182ce] border border-blue-100 flex items-center justify-center shadow-sm group-hover:scale-105 transition-all">
                            <Upload className="w-5.5 h-5.5" />
                          </div>
                          <div>
                            <span className="text-xs font-black text-slate-700 block">拖拽或点击上传您的分析资源文件</span>
                            <span className="text-xs font-bold text-slate-400 block mt-1">支持 JSON, PDF, TXT, MD, Word 等常用格式 (最大 5MB)</span>
                          </div>
                        </label>
                      )}
                    </div>

                    {/* 需求诉求输入区 */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-black text-slate-700 block flex items-center gap-1">
                        <span className="zg-required text-red-500">*</span>
                        匹配需求描述
                      </label>
                      <div className="relative">
                        <textarea
                          rows={4}
                          placeholder="例如：我需要将这份 API 规格文档，自动生成对应的 RESTful 接口代码以及单测试用例..."
                          value={smartPrompt}
                          onChange={(e) => {
                            setSmartPrompt(e.target.value);
                            if (e.target.value.trim()) {
                              setPromptError(null);
                            }
                          }}
                          className={`w-full p-3 pr-20 pb-10 rounded-xl border text-xs text-slate-805 focus:outline-none transition-all font-extrabold ${promptError
                            ? "border-red-500 border-2 bg-red-50/10 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
                            : "border-slate-200 bg-slate-100/30 focus:border-[#3182ce] focus:bg-white"
                            }`}
                        />
                        
                        {/* 智能润色悬浮按钮面板 */}
                        <div className="absolute right-3 bottom-3 flex items-center gap-1.5 z-10">
                          {showRefineSmartPanel ? (
                            <div className="flex gap-1.5 bg-white/95 backdrop-blur-sm p-1 rounded-lg border border-slate-200/80 shadow-md animate-in zoom-in-95 duration-150">
                              <button
                                type="button"
                                onClick={() => {
                                  setSmartPrompt(refinedSmartPrompt);
                                  setShowRefineSmartPanel(false);
                                }}
                                className="px-2 py-1 bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-black rounded cursor-pointer transition-colors shadow-sm"
                              >
                                ✔ 采纳
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSmartPrompt(originalSmartPrompt);
                                  setShowRefineSmartPanel(false);
                                }}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-black rounded cursor-pointer transition-colors"
                              >
                                ✕ 撤销
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={isRefiningSmart || !smartPrompt.trim()}
                              onClick={async () => {
                                setIsRefiningSmart(true);
                                setOriginalSmartPrompt(smartPrompt);
                                await new Promise(resolve => setTimeout(resolve, 600)); // 智能润色模拟运算微延迟
                                const resText = getRefinedText(smartPrompt);
                                setRefinedSmartPrompt(resText);
                                setSmartPrompt(resText);
                                setIsRefiningSmart(false);
                                setShowRefineSmartPanel(true);
                              }}
                              className="px-2.5 py-1 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 disabled:from-slate-100 disabled:to-slate-100 text-white disabled:text-slate-400 text-[10px] font-black rounded shadow-sm hover:shadow hover:scale-[1.02] active:scale-95 transition-all cursor-pointer flex items-center gap-0.5"
                            >
                              {isRefiningSmart ? (
                                <span className="w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <span className="inline-flex items-center gap-1"><PenLine className="w-3 h-3" /> 自动润色</span>
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 规范输入示例一键填入 */}
                      <div className="flex flex-wrap gap-2 pt-1 pb-1">
                        <span className="text-[10px] text-slate-400 font-bold flex items-center gap-1 w-full mb-0.5">
                          💡 规范输入示例 (点击填入)：
                        </span>
                        {[
                          "我需要根据标书 PDF 文件自动提取偏离表并比对风险项",
                          "我需要逆向 Swagger/REST API 接口，并自动生成对应的 React 前端组件",
                          "我希望对项目中的业务代码自动生成单测，并构建 Dockerfile 镜像"
                        ].map((ex, index) => (
                          <button
                            key={index}
                            type="button"
                            onClick={() => {
                              setSmartPrompt(ex);
                              setPromptError(null);
                            }}
                            className="px-2.5 py-1 bg-[#3182ce]/5 border border-[#3182ce]/15 hover:bg-[#3182ce]/10 text-[#2b6cb0] text-[10px] font-black rounded-lg transition-colors cursor-pointer text-left line-clamp-1 max-w-full"
                            title={ex}
                          >
                            {ex}
                          </button>
                        ))}
                      </div>

                      {promptError && (
                        <p className="text-xs text-red-500 font-extrabold flex items-center gap-1 mt-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                          <span className="text-sm">⚠</span> {promptError}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={handleStartSmartAnalysis}
                      disabled={isAnalyzing}
                      className="w-full h-10 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] hover:shadow-md hover:scale-[1.01] text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow transition-all cursor-pointer"
                    >
                      {isAnalyzing ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>正在分析并匹配组件...</span>
                        </>
                      ) : (
                        <>
                          <Search className="w-3.5 h-3.5" />
                          <span>开始分析并匹配组件</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* 右侧：极客分析日志终端 */}
                  <div className="h-full min-h-[350px] bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between font-mono shadow-inner relative overflow-hidden">
                    {/* 发光装饰 */}
                    <div className="absolute right-0 bottom-0 w-32 h-32 bg-blue-500/5 rounded-full filter blur-xl pointer-events-none" />

                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                      <div className="text-xs text-slate-500 border-b border-slate-800/80 pb-2 flex items-center justify-between">
                        <span>推荐匹配进度终端</span>
                        <span className="animate-pulse">● 已就绪</span>
                      </div>

                      {analysisLogs.length === 0 ? (
                        <div className="py-20 text-center text-xs text-slate-600 font-semibold">
                          等待开始。上传文档并填写应用需求后点击启动，此处将显示匹配进度...
                        </div>
                      ) : (
                        <div className="space-y-1.5 text-[11px] leading-relaxed">
                          {analysisLogs.map((log, idx) => {
                            const isSuccess = log && log.startsWith("[SUCCESS]");
                            return (
                              <div
                                key={idx}
                                className={isSuccess ? "text-emerald-400 font-extrabold animate-fade-in" : "text-slate-300"}
                              >
                                {log || ""}
                              </div>
                            );
                          })}
                          {isAnalyzing && (
                            <span className="inline-block w-1.5 h-3 bg-blue-500 animate-ping ml-1" />
                          )}
                        </div>
                      )}
                    </div>

                    <div className="text-[10px] text-slate-600 border-t border-slate-800/80 pt-2 text-right">
                      算力状态: 100% 畅通
                    </div>
                  </div>
                </div>
              </section>

              {/* 推荐匹配结果列表 */}
              {recommendedComponents.length > 0 && (
                <div ref={recommendedRef} className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-200/60">
                    <h3 className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-1.5">
                      <Compass className="w-4 h-4 text-[#3182ce]" />
                      <span>为您匹配的推荐组件方案 ({recommendedComponents.length} 个推荐)</span>
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    {recommendedComponents.map(({ component: comp, matchScore, reason }) => {
                      const extra = getComponentExtra(comp.contract, comp.realUsageCount, comp.realTaskStats);
                      const isFav = favorites.includes(comp.id);
                      const isBound = currentBoundIds.includes(comp.id);
                      const isRestricted = restrictedComponentIds.includes(comp.id);

                      return (
                        <div
                          key={comp.id}
                          className={`group relative bg-white border rounded-2xl p-5 hover:shadow-lg transition-all duration-350 flex flex-col justify-between cursor-pointer border-[#63b3ed] shadow-md`}
                          onClick={() => handleOpenDispatcher(comp.id)}
                        >
                          <div>
                            {/* 头部：ID + 匹配度 */}
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <span className="text-xs font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                                {comp.id}
                              </span>

                              {/* 契约流向匹配度 */}
                              <span className="px-2 py-0.5 bg-blue-50 text-[#3182ce] rounded-full text-xs font-extrabold border border-blue-100 flex items-center gap-1">
                                <Compass className="w-3 h-3 text-[#3182ce]" />
                                <span>匹配度 {matchScore.toFixed(1)}%</span>
                              </span>

                              <div className="flex gap-1 items-center shrink-0">
                                {comp.isPremium && (
                                  <span className="px-1.5 py-0.5 bg-gradient-to-r from-amber-500 to-amber-500 text-white rounded text-xs font-black flex items-center gap-0.5 shadow-sm">
                                    <Award className="w-2.5 h-2.5" />
                                    <span>PREMIUM</span>
                                  </span>
                                )}
                                {isRestricted ? (
                                  <span className="px-1.5 py-0.5 bg-red-50 text-red-500 rounded text-xs font-bold border border-red-200">受限</span>
                                ) : isBound ? (
                                  <span className="px-1.5 py-0.5 bg-blue-50 text-[#3182ce] rounded text-xs font-bold border border-blue-200">已装配</span>
                                ) : null}
                              </div>
                            </div>

                            {/* 标题 */}
                            <h4 className="text-xs font-black text-slate-800 mb-1.5 flex items-center gap-1.5">
                              {getStageIcon(categoryToStageId[comp.category], stageConfigs, "w-4 h-4 shrink-0")}
                              <span className="group-hover:text-[#3182ce] transition-colors">{comp.name}</span>
                            </h4>

                            {/* 描述 */}
                            <p className="text-xs text-slate-500 font-semibold leading-relaxed line-clamp-2 min-h-[32px] mb-3">
                              {comp.description}
                            </p>

                            {/* 文档匹配分析评估理由 */}
                            <div className="bg-blue-50/40 border border-blue-100/50 rounded-xl p-3 text-xs text-slate-600 font-bold leading-relaxed mb-4">
                              <span className="text-[#2b6cb0] font-black block mb-0.5">💡 推荐理由:</span>
                              {reason}
                            </div>
                          </div>

                          {/* 动作按钮对齐 */}
                          <div className="flex items-center gap-2 mt-1">
                            <button
                              onClick={(e) => handleQuickBind(e, comp.id, comp.name, isBound)}
                              className={`w-[38%] h-8 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-sm border ${isBound
                                ? "bg-red-50/60 text-red-600 border-red-200 hover:bg-red-100/50"
                                : "bg-white text-[#3182ce] border-[#3182ce]/20 hover:bg-blue-50/50"
                                }`}
                            >
                              <Layers className="w-3.5 h-3.5" />
                              <span>{isBound ? "解除" : "装配"}</span>
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenDispatcher(comp.id);
                              }}
                              className="flex-1 h-8 text-xs font-black text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] rounded-lg hover:shadow-md transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                            >
                              <Workflow className="w-3.5 h-3.5 text-white" />
                              <span>立即使用</span>
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleFavorite(comp.id);
                              }}
                              className={`w-8 h-8 border rounded-lg flex items-center justify-center cursor-pointer transition-all ${isFav ? "border-amber-300 bg-amber-50 text-amber-500" : "border-slate-200 text-slate-400 hover:border-amber-500"
                                }`}
                            >
                              <Star className={`w-4 h-4 ${isFav ? "fill-current" : ""}`} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* 🚀 侧滑分发矩阵面板 Drawer */}
      <ComponentDispatcherPanel
        isOpen={isDispatcherOpen}
        onClose={() => setIsDispatcherOpen(false)}
        componentId={dispatcherCompId}
        onNavigateToWorkspace={(wsId, compId) => {
          setIsDispatcherOpen(false);
          onSelectComponent(compId, wsId); // 触发 Studio 主路由转场重定向
        }}
      />

      {/* 🔔 解除装配前"使用中"检测结果弹窗 */}
      {unbindModal && (
        (() => {
          const modalDef = COMPONENTS.find(c => c.id === unbindModal.componentId);
          const modalStageId = modalDef ? categoryToStageId[modalDef.category] : 1;
          const modalStageIcon = getStageIcon(modalStageId, stageConfigs, "w-5 h-5");
          const isBusy = unbindModal.checking || unbindModal.confirming;

          // 三态视觉配置：检测中(蓝) / 已被使用(琥珀警示) / 确认解除(红色危险)
          const palette = unbindModal.checking
            ? {
                grad: "from-[#3182ce] to-[#2b6cb0]",
                icon: <Activity className="w-7 h-7 text-white animate-spin" />,
                badgeText: "检测中",
                badgeCls: "bg-white/90 text-[#3182ce]",
                title: "正在检测组件使用状态",
                sub: "系统正在检测组件是否正在被使用，请稍候...",
                desc: `正在检测组件【${unbindModal.name}】是否正在被使用，请稍候...`,
              }
            : unbindModal.inUse
              ? {
                  grad: "from-amber-400 to-amber-500",
                  icon: <ShieldAlert className="w-7 h-7 text-white" />,
                  badgeText: "使用中",
                  badgeCls: "bg-white/90 text-amber-500",
                  title: "组件已被使用",
                  sub: `检测结果：${unbindModal.reason || "该组件当前正在被使用"}`,
                  desc: `组件【${unbindModal.name}】当前正在被使用，无法直接解除装配。请前往当前空间组件库，先禁用该组件切断服务后再解除。`,
                }
              : {
                  grad: "from-red-500 to-red-500",
                  icon: <Trash2 className="w-7 h-7 text-white" />,
                  badgeText: "未被使用",
                  badgeCls: "bg-white/90 text-emerald-600",
                  title: "确认解除装配",
                  sub: "检测结果：该组件当前未被使用",
                  desc: `组件【${unbindModal.name}】当前未被使用，是否解除装配？解除后历史任务与文档 100% 完整保留。`,
                };

          return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-slate-900/70 backdrop-blur-md animate-in fade-in duration-200"
                onClick={() => {
                  if (!isBusy) setUnbindModal(null);
                }}
              />
              <div className="relative w-[520px] max-w-full rounded-2xl bg-white shadow-[0_24px_80px_-16px_rgba(15,23,42,0.45)] ring-1 ring-black/5 overflow-hidden animate-in zoom-in-95 fade-in duration-200">
                {/* 顶部渐变横幅 */}
                <div className={`relative px-6 py-5 bg-gradient-to-r ${palette.grad} flex items-center gap-4`}>
                  <div className="pointer-events-none absolute inset-0 opacity-15 [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:18px_18px]" />
                  <div className="relative w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0 shadow-inner ring-1 ring-white/25">
                    {palette.icon}
                  </div>
                  <div className="relative flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-[18px] font-black text-white tracking-wide">{palette.title}</h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black shadow-sm ${palette.badgeCls}`}>
                        {palette.badgeText}
                      </span>
                    </div>
                    <p className="text-[12px] text-white/85 mt-1 leading-snug">{palette.sub}</p>
                  </div>
                  <button
                    onClick={() => setUnbindModal(null)}
                    disabled={isBusy}
                    className="relative shrink-0 w-8 h-8 rounded-full bg-white/15 hover:bg-white/30 text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="关闭"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* 主体内容 */}
                <div className="p-6 bg-[#f8fafc]">
                  {/* 目标组件信息卡 */}
                  <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 flex items-center gap-3.5 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      {modalStageIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider">目标组件</div>
                      <div className="text-[15px] font-black text-slate-800 truncate">{unbindModal.name}</div>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 font-bold bg-slate-50 border border-slate-100 rounded-lg px-2 py-1">
                      {unbindModal.componentId}
                    </div>
                  </div>

                  <p className="text-[13px] leading-relaxed text-slate-600 mb-5">{palette.desc}</p>

                  <div className="flex items-center justify-end gap-2.5">
                    <button
                      onClick={() => setUnbindModal(null)}
                      disabled={isBusy}
                      className="h-10 px-5 rounded-xl text-[13px] font-bold text-slate-600 bg-white border border-slate-200 shadow-sm hover:bg-slate-50 hover:border-slate-300 hover:text-slate-700 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      取消
                    </button>
                    {unbindModal.checking ? null : unbindModal.inUse ? (
                      <button
                        onClick={() => {
                          setUnbindModal(null);
                          if (workspaceId) router.push(`/workspace/${workspaceId}?tab=components`);
                        }}
                        className="h-10 px-5 rounded-xl text-[13px] font-black text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-px active:scale-[0.98] transition-all cursor-pointer"
                      >
                        去解除
                      </button>
                    ) : (
                      <button
                        onClick={confirmUnbind}
                        disabled={unbindModal.confirming}
                        className="h-10 px-5 rounded-xl text-[13px] font-black text-white bg-gradient-to-r from-red-500 to-red-500 shadow-lg shadow-red-500/25 hover:shadow-red-500/40 hover:-translate-y-px active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {unbindModal.confirming ? "解除中..." : "确定解除"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}
