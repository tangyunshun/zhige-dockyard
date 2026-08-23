"use client";

import type { ReactNode } from "react";
import { Info, ArrowRight, CheckCircle2, Layers, Compass, ScanSearch, Cpu, History, Activity, FileText, Database, BookOpen, AlertTriangle, Rocket, Lock } from "lucide-react";
import type { ComponentCategory } from "@/constants/components";
import { useAppContext } from "@/contexts/AppContext";

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
  boundComponentIds: string[];
  recentTasks: TaskRecord[];
  assets: any[];
  knowledges: any[];
  documents?: any[] | null;
  allowedComponentIds: string[];
  restrictedComponentIds?: string[];
  allComponents: any[];
  setActiveTab: (tab: string) => void;
  onViewAllComponents?: () => void;
  setQuickSubStep: (step: "select" | "material") => void;
  handleComponentClick: (comp: any) => void;
  router: any;
}

export default function OverviewTab({
  workspaceId,
  userRole = "MEMBER",
  boundComponentIds,
  recentTasks,
  assets,
  knowledges,
  documents,
  allowedComponentIds,
  restrictedComponentIds = [],
  allComponents,
  setActiveTab,
  onViewAllComponents,
  setQuickSubStep,
  handleComponentClick,
  router
}: OverviewTabProps) {
  // 分类颜色/名称来自数据库 component_category 表（经 AppContext 全局加载，非重复网络请求）
  const { componentCategories } = useAppContext();

  // 数据一律来自父布局 props（父布局是当前空间数据的唯一数据源），
  // 不再在子 Tab 内重复请求，避免重复网络请求与数据不一致。
  const finalBoundComponentIds = boundComponentIds;
  const finalTasks = recentTasks;
  // 资料与知识库彻底分离：资料只来自 documents，知识库只来自 knowledges，
  // 禁止用知识库回退伪装成资料。documents === null 表示请求失败/未知，显示显式失败态。
  const documentsLoaded = documents !== null && documents !== undefined;
  const finalDocuments = documents ?? [];

  // 已装配组件数以实时绑定列表为唯一真相（与组件页 ComponentsTab 保持一致，不再叠加权限白名单过滤）
  const boundCount = finalBoundComponentIds.length;
  const runningCount = finalTasks.filter(t => t.status === "RUNNING").length;
  const successCount = finalTasks.filter(t => t.status === "SUCCESS").length;
  const failedCount = finalTasks.filter(t => t.status === "FAILED").length;
  const recentList = finalTasks.slice(0, 4);
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

  // 三个核心操作入口（功能完整性：覆盖智能识别 / 选择组件 / 效能大盘）
  const entryCards = [
    {
      icon: <ScanSearch className="w-5 h-5" />,
      iconBg: "bg-[#3182ce]/10 text-[#3182ce]",
      title: "材料匹配推荐组件",
      desc: "输入原始文本或诉求，系统自动识别类型并推荐匹配的效能组件。",
      action: "去自动识别",
      onClick: () => { setActiveTab("quick"); setQuickSubStep("material"); },
    },
    {
      icon: <Cpu className="w-5 h-5" />,
      iconBg: "bg-[#059669]/10 text-[#059669]",
      title: "选择组件，开始任务",
      desc: "从已装配的研发效能列表中任意选择核心组件，立即处理源文件。",
      action: "选择组件开始",
      onClick: () => { setActiveTab("quick"); setQuickSubStep("select"); },
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

  // 指标卡（已装配 / 受限组件数量 / 执行中 / 成功报告 / 资料数量 / 知识库数量）
  // 资料数量只统计 documents，知识库数量只统计 knowledges；资料请求失败时显式显示“未知”，绝不用知识库伪装。
  const metrics: Array<{ label: string; count: number | string; color: string; icon: ReactNode; iconBg: string }> = [
    { label: "已装配组件", count: boundCount, color: "text-[#3182ce]", icon: <Layers className="w-4 h-4" />, iconBg: "bg-[#3182ce]/10 text-[#3182ce]" },
    { label: "受限组件数量", count: restrictedCount, color: "text-amber-600", icon: <Lock className="w-4 h-4" />, iconBg: "bg-amber-500/10 text-amber-600" },
    { label: "执行中任务", count: runningCount, color: "text-[#059669]", icon: <Activity className="w-4 h-4" />, iconBg: "bg-[#059669]/10 text-[#059669]" },
    { label: "成功报告", count: successCount, color: "text-emerald-500", icon: <CheckCircle2 className="w-4 h-4" />, iconBg: "bg-emerald-500/10 text-emerald-500" },
    { label: "资料数量", count: documentsLoaded ? finalDocuments.length : "未知", color: "text-purple-500", icon: <FileText className="w-4 h-4" />, iconBg: "bg-purple-500/10 text-purple-500" },
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

  // 相对时间格式化
  const formatTaskTime = (raw: string) => {
    if (!raw) return "—";
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return raw;
      const now = Date.now();
      const diffMs = now - d.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);
      if (diffMins < 1) return "刚刚";
      if (diffMins < 60) return `${diffMins}分钟前`;
      if (diffHours < 24) return `${diffHours}小时前`;
      if (diffDays < 7) return `${diffDays}天前`;
      return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
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

      {/* ============ 空间指标摘要 ============ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {metrics.map(m => (
          <div key={m.label} className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs text-left hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300 transition-all duration-200">
            <div className="flex items-center justify-between">
              <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${m.iconBg}`}>{m.icon}</span>
            </div>
            <span className={`text-2xl sm:text-3xl font-black font-mono tracking-tight block mt-3 ${m.color}`}>{m.count}</span>
            <span className="text-xs font-bold text-slate-500 block tracking-wide mt-1">{m.label}</span>
          </div>
        ))}
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
            {recentList.map(task => (
              <div key={task.id} className="p-3 bg-slate-50/70 border border-slate-200/70 rounded-xl flex items-center justify-between gap-3 text-xs hover:bg-white hover:border-[#3182ce]/30 hover:shadow-xs transition-all cursor-pointer" onClick={() => setActiveTab("tasks")}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">{task.componentId}</span>
                    <span className="font-bold text-slate-800 text-xs truncate" title={formatTaskTitle(task)}>{formatTaskTitle(task)}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400 font-medium">
                    <span className="flex items-center gap-1"><History className="w-3 h-3" />{formatTaskTime(task.time)}</span>
                    {typeof task.tokenUsed === "number" && <span className="flex items-center gap-1"><Database className="w-3 h-3" />{task.tokenUsed} 点</span>}
                  </div>
                </div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded border shrink-0 ${statusBadge(task.status)}`}>{statusText(task.status)}</span>
              </div>
            ))}
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
              const stage = componentCategories[c.category as ComponentCategory];
              const isManager = ["OWNER", "ADMIN", "Owner", "Admin"].includes(userRole);
              const isRestricted = restrictedComponentIds.includes(c.id);
              const isRestrictedForCurrentUser = !isManager && isRestricted;

              return (
                <div
                  onClick={() => {
                    if (!isRestrictedForCurrentUser) {
                      handleComponentClick(c);
                    }
                  }}
                  key={c.id}
                  className={`p-4 rounded-xl text-left transition-all relative group ${
                    isRestrictedForCurrentUser
                      ? "bg-slate-100/60 border border-slate-200/80 cursor-not-allowed opacity-90"
                      : "bg-slate-50/70 hover:bg-white border border-slate-200/70 cursor-pointer hover:shadow-sm hover:border-[#3182ce]/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-2xl ${isRestrictedForCurrentUser ? "grayscale" : ""}`}>{c.icon}</span>
                    {isRestricted ? (
                      <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${
                        isManager ? "bg-blue-50 text-[#2b6cb0] border-blue-200" : "bg-amber-50 text-amber-600 border-amber-200"
                      }`}>
                        {isManager ? "🛡️ 特权放行" : "🔒 岗位受限"}
                      </span>
                    ) : (
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-200">
                        🟢 正常运行
                      </span>
                    )}
                  </div>

                  <h5 className={`font-bold text-xs mt-2.5 truncate ${isRestrictedForCurrentUser ? "text-slate-500" : "text-slate-900"}`}>{c.title} <span className="font-mono text-[10px] text-slate-400 font-normal">({c.id})</span></h5>
                  {stage && (
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded mt-1.5 inline-block"
                      style={
                        isRestrictedForCurrentUser
                          ? { backgroundColor: "#e2e8f0", color: "#64748b" }
                          : { color: stage.color, backgroundColor: `${stage.color}14`, border: `1px solid ${stage.color}33` }
                      }
                    >
                      {c.category}
                    </span>
                  )}

                  {isRestrictedForCurrentUser ? (
                    <button disabled className="w-full mt-2.5 py-1 px-2 bg-slate-200 text-slate-500 text-[11px] font-bold rounded cursor-not-allowed text-center block">
                      🔒 岗位受限 (不可用)
                    </button>
                  ) : (
                    <span className="text-[11px] text-[#3182ce] font-black block mt-2.5 group-hover:translate-x-1 transition-transform">
                      {isManager && isRestricted ? "⚡ 特权执行 ➔" : "开始使用 ➔"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
