"use client";

import type { ReactNode } from "react";
import { Info, ArrowRight, CheckCircle2, Layers, Compass, ScanSearch, Cpu, History, Activity, FileText, Database, BookOpen, AlertTriangle, Rocket, Lock, Zap, Box, Clock } from "lucide-react";
import type { ComponentCategory } from "@/constants/components";
import { useAppContext } from "@/contexts/AppContext";
import { iconMap } from "@/components/ComponentShowcase";
import { formatYuanFromPoints } from "@/lib/point-rate";

interface TaskRecord {
  id: string;
  name: string;
  componentId: string;
  componentName: string;
  tokenUsed: number;
  status: "SUCCESS" | "FAILED" | "RUNNING" | "UNKNOWN";
  time: string;
}

interface OverviewTabProps {
  workspaceId: string;
  userRole?: string;
  workspaceToken?: number;
  setShowRechargeModal?: (show: boolean) => void;
  boundComponentIds: string[];
  recentTasks: TaskRecord[];
  assets: any[];
  knowledges: any[];
  documents?: any[] | null;
  documentStats?: {
    publicCount: number;
    ownPrivateCount?: number;
    otherPrivateCount?: number;
    privateCount?: number;
    pendingCount?: number;
    total: number;
    isManager: boolean;
    scope: string;
  } | null;
  allowedComponentIds: string[];
  restrictedComponentIds?: string[];
  allComponents: any[];
  setActiveTab: (tab: string) => void;
  onViewAllComponents?: () => void;
  onViewTaskDetail?: (taskId: string) => void;
  setQuickSubStep: (step: "select" | "material") => void;
  handleComponentClick: (comp: any) => void;
  router: any;
}

export default function OverviewTab({
  workspaceId,
  userRole = "MEMBER",
  workspaceToken = 10000,
  setShowRechargeModal,
  boundComponentIds,
  recentTasks,
  assets,
  knowledges,
  documents,
  documentStats,
  allowedComponentIds,
  restrictedComponentIds = [],
  allComponents,
  setActiveTab,
  onViewAllComponents,
  onViewTaskDetail,
  setQuickSubStep,
  handleComponentClick,
  router
}: OverviewTabProps) {
  // 分类颜色/名称来自数据库表（经 AppContext 全局加载，非重复网络请求）
  const { componentCategories, componentCatalog } = useAppContext();

  // 数据一律来自父布局 props（父布局是当前空间数据的唯一数据源），
  // 不再在子 Tab 内重复请求，避免重复网络请求与数据不一致。
  const finalBoundComponentIds = boundComponentIds;
  const finalTasks = recentTasks;
  // 资料与知识库彻底分离：资料只来自 documents，知识库只来自 knowledges，
  // 禁止用知识库回退伪装成资料。documents === null 表示请求失败/未知，显示显式失败态。
  const documentsLoaded = documents !== null && documents !== undefined;
  const finalDocuments: any[] = documents ?? [];

  // 已装配组件数以实时绑定列表为唯一真相（与组件页 ComponentsTab 保持一致，不再叠加权限白名单过滤）
  const boundCount = finalBoundComponentIds.length;
  const runningCount = finalTasks.filter(t => t.status === "RUNNING").length;
  const successCount = finalTasks.filter(t => t.status === "SUCCESS").length;
  const failedCount = finalTasks.filter(t => t.status === "FAILED").length;
  const recentList = finalTasks.slice(0, 3);
  const allCommonComps = boundCount === 0 ? [] : allComponents.filter(c => finalBoundComponentIds.some(id => id.trim().toUpperCase() === c.id.trim().toUpperCase()));
  const commonComps = allCommonComps.slice(0, 3);

  // “查看全部组件”：优先跳转组件页并重置阶段过滤（由父组件保证显示全部已装配）
  const viewAllComponents = () => {
    if (onViewAllComponents) onViewAllComponents();
    else setActiveTab("components");
  };

  // ============ 状态驱动的行动指南（功能流程优化） ============
  // 按优先级推导当前空间最该执行的下一步动作，给出明确可点击入口
  const guide = (() => {
    if (boundCount === 0) {
      return {
        tone: "blue" as const,
        icon: <Compass className="w-4 h-4" />,
        title: "装配你的第一个效能组件",
        desc: "当前工作空间尚未装配任何组件。先去组件大厅挑选并装配研发效能工具，即可开始自动化任务处理。",
        actionLabel: "进入挑选大厅",
        onAction: () => router.push(`/studio?workspaceId=${workspaceId}`),
      };
    }
    if (finalTasks.length === 0) {
      return {
        tone: "blue" as const,
        icon: <Rocket className="w-4 h-4" />,
        title: "提交材料，发起首次自动化任务",
        desc: "空间已装配基础研发组件，选择组件并提交源材料即可一键生成偏离报告、契约数据等成果。",
        actionLabel: "查看已配组件",
        onAction: () => setActiveTab("components"),
      };
    }
    if (failedCount > 0) {
      return {
        tone: "rose" as const,
        icon: <AlertTriangle className="w-4 h-4" />,
        title: `有 ${failedCount} 个任务处理失败，建议重试`,
        desc: "检测到最近有自动化任务处理失败，可进入任务看板查看失败原因并重试，避免阻塞后续研发。",
        actionLabel: "前往任务看板",
        onAction: () => setActiveTab("tasks"),
      };
    }
    if (assets.length > 0) {
      return {
        tone: "emerald" as const,
        icon: <FileText className="w-4 h-4" />,
        title: "已有本地资料，可直接创建任务",
        desc: "检测到您上传了原始文档资料，可查阅资料详情或随时发起自动化分析。",
        actionLabel: "查看资料库",
        onAction: () => setActiveTab("assets"),
      };
    }
    return {
      tone: "slate" as const,
      icon: <CheckCircle2 className="w-4 h-4" />,
      title: "空间状态良好，按需继续使用",
      desc: "组件、任务与资料均已就绪。可在下方快速入口切换操作组件、查阅资料与空间知识库。",
      actionLabel: "浏览全部组件",
      onAction: viewAllComponents,
    };
  })();

  const guideToneMap: Record<string, string> = {
    blue: "from-blue-50/70 via-blue-50/40 to-white/40 border-blue-100/60",
    rose: "from-red-50/70 via-red-50/40 to-white/40 border-red-100/60",
    emerald: "from-emerald-50/70 via-emerald-50/40 to-white/40 border-emerald-100/60",
    slate: "from-slate-50/70 via-slate-100/40 to-white/40 border-slate-200/60",
  };
  const guideIconTone: Record<string, string> = {
    blue: "bg-[#3182ce]/10 text-[#3182ce]",
    rose: "bg-red-500/10 text-red-500",
    emerald: "bg-emerald-500/10 text-emerald-600",
    slate: "bg-slate-500/10 text-slate-500",
  };

  // 三个核心操作入口（功能完整性：覆盖选择组件 / 智能识别 / 效能大盘）
  const entryCards = [
    {
      icon: <Layers className="w-5 h-5" />,
      iconBg: "bg-[#059669]/10 text-[#059669]",
      title: "选择组件，开始任务",
      desc: "从已装配的研发效能列表中任意选择核心组件，立即处理源文件。",
      action: "选择组件开始",
      onClick: () => { setActiveTab("quick"); setQuickSubStep("select"); },
    },
    {
      icon: <ScanSearch className="w-5 h-5" />,
      iconBg: "bg-[#3182ce]/10 text-[#3182ce]",
      title: "材料匹配推荐组件",
      desc: "输入原始文本或诉求，系统自动识别类型并推荐匹配的效能组件。",
      action: "去自动识别",
      onClick: () => { setActiveTab("quick"); setQuickSubStep("material"); },
    },
    {
      icon: <Activity className="w-5 h-5" />,
      iconBg: "bg-indigo-500/10 text-indigo-600",
      title: "空间效能与资源大盘",
      desc: "查看组件调用频次、资源额度抵扣走势与沙箱物理存储占用。",
      action: "查看统计大盘",
      onClick: () => setActiveTab("stats"),
    },
  ];

  // 计算受限组件数量
  const restrictedSet = new Set(restrictedComponentIds || []);
  const restrictedCount = boundCount === 0 ? 0 : allCommonComps.filter(c => restrictedSet.has(c.id)).length;

  const handleRecharge = () => {
    if (setShowRechargeModal) {
      setShowRechargeModal(true);
    } else {
      setActiveTab("quota");
    }
  };

  // 指标卡（空间总算力点 / 已装配 / 受限组件数量 / 执行中 / 成功报告 / 资料数量 / 知识库数量）
  const metrics: Array<{ label: string; count: number | string; subtext?: string; desc?: string; color: string; icon: ReactNode; iconBg: string; onClick?: () => void }> = [
    { 
      label: "空间总算力点", 
      count: typeof workspaceToken === "number" ? `${workspaceToken.toLocaleString()} 点` : workspaceToken, 
      subtext: typeof workspaceToken === "number" ? `折合 ¥${(workspaceToken / 100).toFixed(2)}` : undefined,
      color: "text-[#3182ce]", 
      icon: <Zap className="w-4 h-4 fill-[#3182ce]" />, 
      iconBg: "bg-[#3182ce]/15 text-[#3182ce]",
      onClick: handleRecharge
    },
    { label: "已装配组件", count: boundCount, color: "text-[#3182ce]", icon: <Layers className="w-4 h-4" />, iconBg: "bg-[#3182ce]/10 text-[#3182ce]" },
    { label: "受限组件数量", count: restrictedCount, color: "text-amber-600", icon: <Lock className="w-4 h-4" />, iconBg: "bg-amber-500/10 text-amber-600" },
    { label: "成功报告", count: successCount, color: "text-emerald-500", icon: <CheckCircle2 className="w-4 h-4" />, iconBg: "bg-emerald-500/10 text-emerald-500" },
    {
      label: "资料数量",
      count: documentStats ? documentStats.total : finalDocuments.filter((d) => d.status !== "REMOVED").length,
      subtext: documentStats
        ? (() => {
            const parts = [`公开 ${documentStats.publicCount}`];
            if (documentStats.isManager) {
              parts.push(`本人私密 ${documentStats.ownPrivateCount ?? 0}`);
              if (documentStats.pendingCount) parts.push(`待审核 ${documentStats.pendingCount}`);
            } else {
              parts.push(`本人私密 ${documentStats.ownPrivateCount ?? documentStats.privateCount ?? 0}`);
              if (documentStats.pendingCount) parts.push(`本人待审核 ${documentStats.pendingCount}`);
            }
            return parts.join(" · ");
          })()
        : undefined,
      desc: documentStats
        ? documentStats.isManager
          ? "空间公开资料、您的个人私密资料及待审核大盘；成员私密内容仅本人可见"
          : "空间公开资料、您的个人私密资料及待审核申请"
        : undefined,
      color: "text-purple-500",
      icon: <FileText className="w-4 h-4" />,
      iconBg: "bg-purple-500/10 text-purple-500",
    },
    { label: "知识库数量", count: knowledges.length, color: "text-indigo-500", icon: <BookOpen className="w-4 h-4" />, iconBg: "bg-indigo-500/10 text-indigo-500" },
  ];

  const statusBadge = (status: TaskRecord["status"]) => {
    if (status === "SUCCESS") return "text-emerald-600 bg-emerald-50 border-emerald-100/60";
    if (status === "RUNNING") return "text-[#3182ce] bg-blue-50 border-blue-100/60";
    if (status === "UNKNOWN") return "text-slate-500 bg-slate-50 border-slate-200/70";
    return "text-red-600 bg-red-50 border-red-100/60";
  };
  const statusText = (status: TaskRecord["status"]) =>
    status === "SUCCESS" ? "成功" : status === "RUNNING" ? "运行中" : status === "UNKNOWN" ? "未知状态" : "失败";

  // 任务标题去重/简化：避免组件名与默认任务名重复堆叠
  const isDefaultTaskName = (name: string, componentId: string) => {
    const normalized = name.trim();
    return normalized === `${componentId} 运行任务` || normalized === "未命名任务" || normalized === `${componentId}任务`;
  };
  const formatTaskTitle = (task: TaskRecord) => {
    const compName = task.componentName || task.componentId;
    const taskName = task.name?.trim();
    if (!taskName || isDefaultTaskName(taskName, task.componentId)) return compName;
    if (taskName === compName || taskName === task.componentId) return compName;
    if (compName && taskName.includes(compName)) return taskName;
    return `${compName} › ${taskName}`;
  };

  // 具体时间格式化 (显示标准年月日时分秒)
  const formatTaskTime = (raw: string) => {
    if (!raw) return "—";
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return raw;
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      const seconds = String(d.getSeconds()).padStart(2, "0");
      return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch {
      return raw;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* ============ 状态驱动行动指南 (精美知性蓝微光 Banner) ============ */}
      <div className={`bg-gradient-to-r ${guideToneMap[guide.tone]} p-5 sm:p-6 rounded-xl border text-left shadow-sm backdrop-blur-sm transition-all`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${guideIconTone[guide.tone]}`}>
              {guide.icon}
            </span>
            <div className="min-w-0">
              <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Info className="w-4 h-4 text-[#3182ce] shrink-0" /> {guide.title}
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 font-medium leading-relaxed mt-1 max-w-2xl">{guide.desc}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={guide.onAction}
            className="zg-btn zg-btn-primary h-9 px-4 text-xs font-black shrink-0 flex items-center justify-center gap-1.5 shadow-sm hover:shadow transition-all cursor-pointer"
          >
            {guide.actionLabel} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ============ 三个核心操作入口 ============ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {entryCards.map(card => (
          <div key={card.title} className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs text-left flex flex-col justify-between min-h-[170px] pb-4 hover:-translate-y-0.5 hover:shadow-md hover:border-[#3182ce]/40 transition-all duration-200">
            <div>
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-2xs ${card.iconBg}`}>{card.icon}</span>
              <h4 className="font-extrabold text-slate-900 text-sm mt-3.5">{card.title}</h4>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mt-1.5">{card.desc}</p>
            </div>
            <button type="button" onClick={card.onClick} className="text-xs text-[#3182ce] hover:text-[#2b6cb0] font-black text-left flex items-center gap-1.5 mt-4 cursor-pointer group">
              <span>{card.action}</span>
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        ))}
      </div>

      {/* ============ 空间指标摘要 (6 宫格) ============ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {metrics.map(m => {
          const isRechargeCard = !!m.onClick;

          return (
            <div 
              key={m.label} 
              onClick={m.onClick}
              className={`p-3.5 rounded-xl border shadow-xs text-left transition-all duration-200 relative ${
                isRechargeCard 
                  ? "bg-gradient-to-br from-blue-50/50 via-white to-blue-50/20 border-blue-200/80 cursor-pointer hover:border-[#3182ce] hover:shadow-md hover:-translate-y-0.5 group" 
                  : "bg-white border-slate-200/80 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${m.iconBg}`}>{m.icon}</span>
                {m.onClick && (
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      m.onClick?.();
                    }}
                    className="px-2 py-0.5 text-[10px] font-black text-white bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] rounded-md shadow-2xs group-hover:shadow-xs group-hover:scale-105 transition-all flex items-center gap-0.5 cursor-pointer"
                  >
                    <Zap className="w-2.5 h-2.5 fill-white text-white" />
                    <span>充值</span>
                  </button>
                )}
              </div>
              <span className={`text-lg sm:text-xl font-black font-mono tracking-tight block mt-2.5 truncate ${m.color}`}>{m.count}</span>
              <div className="flex items-center justify-between mt-1">
                <span className={`text-xs font-bold block truncate ${isRechargeCard ? "text-[#2b6cb0]" : "text-slate-500"}`}>{m.label}</span>
              </div>
              {m.subtext && <span className="text-[10px] font-bold text-slate-400 block mt-0.5">{m.subtext}</span>}
              {m.desc && <span className="text-[10px] font-medium text-slate-400 block mt-0.5 leading-tight">{m.desc}</span>}
            </div>
          );
        })}
      </div>

      {/* ============ 最近任务记录 ============ */}
      <div className="bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs space-y-4 text-left">
        <div className="flex justify-between items-center pb-3 border-b border-slate-100">
          <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#059669]" /> 最近任务处理记录
          </h4>
          <button type="button" onClick={() => setActiveTab("tasks")} className="text-xs text-[#3182ce] hover:underline font-bold cursor-pointer transition-colors">
            查看全部任务 ➔
          </button>
        </div>
        {recentList.length === 0 ? (
          <div className="text-center py-8">
            <History className="w-7 h-7 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-semibold">暂无任务运行记录，前往“快速任务”发起首次处理。</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {recentList.map(task => {
              const compDef = allComponents.find(c => c.id.trim().toUpperCase() === (task.componentId || "").trim().toUpperCase());
              const catName = compDef 
                ? (componentCategories[compDef.category as ComponentCategory]?.name || compDef.category || "研发组件")
                : "通用任务";
              const Ico = iconMap[compDef?.icon || ""] || Box;

              return (
                <div 
                  key={task.id} 
                  className="p-3.5 bg-slate-50/70 border border-slate-200/70 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs hover:bg-white hover:border-[#3182ce]/40 hover:shadow-xs transition-all cursor-pointer group" 
                  onClick={() => {
                    if (onViewTaskDetail) onViewTaskDetail(task.id);
                    else setActiveTab("tasks");
                  }}
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    {/* 组件商务 Icon 盒子 */}
                    <div className="w-9 h-9 rounded-lg bg-blue-50/80 text-[#3182ce] flex items-center justify-center shrink-0 border border-blue-100/80 shadow-2xs group-hover:bg-[#3182ce] group-hover:text-white transition-colors">
                      <Ico className="w-4 h-4" />
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* 任务名称 */}
                        <span className="font-black text-slate-800 text-xs truncate group-hover:text-[#3182ce] transition-colors" title={formatTaskTitle(task)}>
                          {formatTaskTitle(task)}
                        </span>
                        {/* 组件 ID 编码 (若为大写下划线英文 Key 则隐藏，不露英文硬代码) */}
                        {task.componentId && !task.componentId.includes("_") && (
                          <span className="text-[10px] font-mono text-slate-400 font-bold shrink-0">
                            [{task.componentId}]
                          </span>
                        )}
                        {/* 中文分类 Badge */}
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-600 border border-indigo-100/80 shrink-0">
                          {catName}
                        </span>
                      </div>

                      {/* 时间与算力消耗 */}
                      <div className="flex items-center gap-3.5 text-[11px] text-slate-400 font-medium flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {formatTaskTime(task.time)}
                        </span>
                        {typeof task.tokenUsed === "number" && (
                          <span className="flex items-center gap-1 font-mono font-bold text-slate-500">
                            <Zap className="w-3 h-3 text-amber-500" />
                            {task.tokenUsed} 算力点
                            <span className="text-slate-400 font-normal">({formatYuanFromPoints(task.tokenUsed)})</span>
                          </span>
                        )}
                        {compDef?.name && (
                          <span className="text-slate-400 font-semibold truncate hidden md:inline">
                            · 组件: {compDef.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 右侧状态 Badge 与 查看结果指示 */}
                  <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${statusBadge(task.status)}`}>
                      {statusText(task.status)}
                    </span>
                    <span className="text-xs text-[#3182ce] font-black group-hover:translate-x-1 transition-transform flex items-center gap-0.5">
                      查看报告 ➔
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ============ 常用效能组件 ============ */}
      <div className="bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs space-y-4 text-left">
        <div className="flex justify-between items-center pb-3 border-b border-slate-100">
          <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#3182ce]" /> 已装配效能组件 <span className="text-[#3182ce] font-mono">({allCommonComps.length})</span>
          </h4>
          <button type="button" onClick={viewAllComponents} className="text-xs text-[#3182ce] hover:underline font-bold cursor-pointer transition-colors">
            查看全部组件 ➔
          </button>
        </div>
        {allCommonComps.length === 0 ? (
          <div className="text-center py-8">
            <Layers className="w-7 h-7 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500 font-semibold">当前空间没有装配组件，请去大厅挑选。</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {commonComps.map(c => {
              // 从 componentCatalog 数据库字典中按组件 ID 精准查找最权威数据
              const dbCatalogComp = componentCatalog.find(cat => cat.id.trim().toUpperCase() === c.id.trim().toUpperCase());

              const iconKey = dbCatalogComp?.icon || c.icon || "";
              const compDescription = dbCatalogComp?.description || c.description || "";
              const categoryKey = dbCatalogComp?.category || c.category || "";
              const compName = dbCatalogComp?.name || c.name || c.title || c.id;

              const stage = componentCategories[categoryKey as ComponentCategory];
              const catName = stage?.name || categoryKey || "研发效能组件";
              const isManager = ["OWNER", "ADMIN", "Owner", "Admin"].includes(userRole);
              const isRestricted = restrictedComponentIds.includes(c.id);
              const isRestrictedForCurrentUser = !isManager && isRestricted;
              const Ico = iconMap[iconKey] || Box;

              return (
                <div
                  onClick={() => {
                    if (!isRestrictedForCurrentUser) {
                      handleComponentClick(c);
                    }
                  }}
                  key={c.id}
                  className={`p-4.5 rounded-xl text-left transition-all relative group flex flex-col justify-between ${
                    isRestrictedForCurrentUser
                      ? "bg-slate-100/60 border border-slate-200/80 cursor-not-allowed opacity-90"
                      : "bg-slate-50/70 hover:bg-white border border-slate-200/70 cursor-pointer hover:shadow-md hover:border-[#3182ce]/40"
                  }`}
                >
                  <div>
                    {/* 头部图标与状态 Badge */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <div className={`w-8.5 h-8.5 rounded-lg flex items-center justify-center shrink-0 border shadow-2xs ${
                        isRestrictedForCurrentUser 
                          ? "bg-slate-200 text-slate-400 border-slate-300" 
                          : "bg-blue-50/90 text-[#3182ce] border-blue-100/80"
                      }`}>
                        <Ico className="w-4 h-4" />
                      </div>

                      {isRestricted ? (
                        <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border shrink-0 ${
                          isManager ? "bg-blue-50 text-[#2b6cb0] border-blue-200" : "bg-amber-50 text-amber-600 border-amber-200"
                        }`}>
                          {isManager ? "🛡️ 特权放行" : "🔒 岗位受限"}
                        </span>
                      ) : (
                        <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200 shrink-0">
                          🟢 正常运行
                        </span>
                      )}
                    </div>

                    {/* 组件名称与编码 */}
                    <h5 className={`font-black text-xs truncate ${isRestrictedForCurrentUser ? "text-slate-500" : "text-slate-900"}`}>
                      {compName} <span className="font-mono text-[10px] text-slate-400 font-bold">({c.id})</span>
                    </h5>

                    {/* 所属分类名称 Badge */}
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded border inline-block"
                        style={
                          isRestrictedForCurrentUser
                            ? { backgroundColor: "#e2e8f0", color: "#64748b", borderColor: "#cbd5e1" }
                            : stage?.color 
                              ? { color: stage.color, backgroundColor: `${stage.color}14`, border: `1px solid ${stage.color}33` }
                              : { color: "#3182ce", backgroundColor: "#ebf8ff", border: "1px solid #bee3f8" }
                        }
                      >
                        {catName}
                      </span>
                    </div>

                    {/* 数据库真实功能介绍描述 */}
                    <p className="text-xs text-slate-500 font-medium leading-relaxed line-clamp-2 mt-2 min-h-[32px] select-none" title={compDescription}>
                      {compDescription || "暂无组件描述"}
                    </p>
                  </div>

                  {/* 底部按钮 */}
                  <div className="mt-3.5 pt-2.5 border-t border-slate-100/80">
                    {isRestrictedForCurrentUser ? (
                      <button disabled className="w-full py-1 px-2 bg-slate-200 text-slate-500 text-[11px] font-bold rounded cursor-not-allowed text-center block">
                        🔒 岗位受限 (不可用)
                      </button>
                    ) : (
                      <span className="text-[11px] text-[#3182ce] font-black flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                        {isManager && isRestricted ? "⚡ 特权执行 ➔" : "开始使用 ➔"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
