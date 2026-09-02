"use client";

import { useState, useMemo, useEffect } from "react";
import Pagination from "@/components/Pagination";
import { CheckCircle2, Search, RefreshCw, Layers, LayoutGrid, Clock, AlertTriangle, ArrowUpRight, BookOpen, Eye, Calendar, CheckSquare, Square, Archive, Trash2 } from "lucide-react";
import { formatYuanFromPoints, POINT_RATE_TEXT } from "@/lib/point-rate";
import { useToast } from "@/components/Toast";

interface TaskRecord {
  id: string;
  name: string;
  componentId: string;
  componentName: string;
  tokenUsed: number;
  status: "SUCCESS" | "FAILED" | "RUNNING" | "UNKNOWN";
  time: string;
  outputData?: any;
}

interface TasksTabProps {
  recentTasks: TaskRecord[];
  tasksFilterTab: string;
  setTasksFilterTab: (tab: string) => void;
  openStructurePreview: (task: TaskRecord) => void;
  handleSaveToKnowledge: (task: TaskRecord) => void;
  allComponents: any[];
  handleComponentClick: (comp: any) => void;
  workspaceId?: string;
  targetTaskId?: string | null;
  knowledges?: any[];
  onNavigateToKnowledge?: () => void;
  onDeleteTask?: (taskId: string) => void;
  onBatchDeleteTasks?: (taskIds: string[]) => void;
}

// 标准化与格式化时间字符串 (彻底清除 2026-08-23T06:15:28.129Z 之后带 Z 的暴露，展现为标准 YYYY-MM-DD HH:mm:ss)
function formatTaskTime(rawTime?: string): string {
  if (!rawTime) return "近期创建";
  try {
    const d = new Date(rawTime);
    if (isNaN(d.getTime())) return rawTime;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const seconds = String(d.getSeconds()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return rawTime;
  }
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

function getResolvedComponentName(componentId: string, rawName?: string, allComps?: any[]): string {
  const cleanId = (componentId || "").trim().toUpperCase();
  const cleanRaw = (rawName || "").trim();

  if (cleanRaw && cleanRaw.toUpperCase() !== cleanId && !categoryCNMap[cleanRaw.toUpperCase()]) {
    return cleanRaw;
  }

  if (allComps && Array.isArray(allComps)) {
    const found = allComps.find((c) => (c.id || "").toString().toUpperCase() === cleanId);
    if (found && found.name && found.name.toUpperCase() !== cleanId) {
      return found.name;
    }
  }

  if (categoryCNMap[cleanId]) {
    return categoryCNMap[cleanId];
  }

  return cleanRaw || componentId;
}

function getCleanComponentDisplay(componentId: string, rawName?: string, allComps?: any[]) {
  const cleanId = (componentId || "").trim().toUpperCase();
  const resolvedName = getResolvedComponentName(componentId, rawName, allComps);
  
  const realComp = allComps?.find(c => (c.id || "").toString().toUpperCase() === cleanId);
  const catKey = (realComp?.category || cleanId).toUpperCase();
  const categoryCN = categoryCNMap[catKey] || categoryCNMap[cleanId] || "通用核心";

  return {
    categoryCN,
    fullName: resolvedName,
  };
}

export default function TasksTab({
  recentTasks,
  tasksFilterTab,
  setTasksFilterTab,
  openStructurePreview,
  handleSaveToKnowledge,
  allComponents,
  handleComponentClick,
  workspaceId,
  targetTaskId,
  knowledges,
  onNavigateToKnowledge,
  onDeleteTask,
  onBatchDeleteTasks,
}: TasksTabProps) {
  const toast = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFilter, setDateFilter] = useState("ALL"); // ALL, TODAY, WEEK, MONTH, CUSTOM
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // 系统二次确认模态框状态
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  // 过滤逻辑
  const filteredTasks = useMemo(() => {
    return recentTasks.filter(task => {
      // 状态选项卡过滤
      if (tasksFilterTab === "SUCCESS" && task.status !== "SUCCESS") return false;
      if (tasksFilterTab === "FAILED" && task.status !== "FAILED") return false;
      if (tasksFilterTab === "RUNNING" && task.status !== "RUNNING") return false;

      // 关键字搜索过滤
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchName = task.name.toLowerCase().includes(query);
        const matchComp = (task.componentName || "").toLowerCase().includes(query) || (task.componentId || "").toLowerCase().includes(query);
        if (!matchName && !matchComp) return false;
      }

      // 时间日期过滤 (支持今日、近7天、近30天及自定义时间段)
      if (dateFilter !== "ALL" && task.time) {
        const taskDate = new Date(task.time);
        const now = new Date();
        if (dateFilter === "TODAY") {
          const isToday = taskDate.toDateString() === now.toDateString();
          if (!isToday) return false;
        } else if (dateFilter === "WEEK") {
          const diffDays = (now.getTime() - taskDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 7) return false;
        } else if (dateFilter === "MONTH") {
          const diffDays = (now.getTime() - taskDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 30) return false;
        } else if (dateFilter === "CUSTOM") {
          if (customStartDate) {
            const start = new Date(`${customStartDate} 00:00:00`).getTime();
            if (!isNaN(start) && taskDate.getTime() < start) return false;
          }
          if (customEndDate) {
            const end = new Date(`${customEndDate} 23:59:59`).getTime();
            if (!isNaN(end) && taskDate.getTime() > end) return false;
          }
        }
      }

      return true;
    });
  }, [recentTasks, tasksFilterTab, searchQuery, dateFilter, customStartDate, customEndDate]);

  // 当搜索或筛选条件发生变化时，自动重置页码为第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [tasksFilterTab, searchQuery, dateFilter, customStartDate, customEndDate]);

  // 分页截取数据
  const totalPages = Math.ceil(filteredTasks.length / pageSize) || 1;
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTasks.slice(start, start + pageSize);
  }, [filteredTasks, currentPage, pageSize]);

  const totalCount = recentTasks.length;
  const successCount = recentTasks.filter(t => t.status === "SUCCESS").length;
  const runningCount = recentTasks.filter(t => t.status === "RUNNING").length;
  const failedCount = recentTasks.filter(t => t.status === "FAILED").length;

  // 当前页包含的所有任务 ID 列表（支持全面勾选进行批量删除与批量沉淀）
  const pageAvailableTaskIds = useMemo(() => {
    return paginatedTasks.map(t => t.id);
  }, [paginatedTasks]);

  const isAllSelected = useMemo(() => {
    return pageAvailableTaskIds.length > 0 && pageAvailableTaskIds.every(id => selectedTaskIds.includes(id));
  }, [pageAvailableTaskIds, selectedTaskIds]);

  const isSomeSelected = useMemo(() => {
    return pageAvailableTaskIds.some(id => selectedTaskIds.includes(id));
  }, [pageAvailableTaskIds, selectedTaskIds]);

  const toggleSelectAll = () => {
    if (pageAvailableTaskIds.length === 0) return;
    if (isAllSelected) {
      setSelectedTaskIds(prev => prev.filter(id => !pageAvailableTaskIds.includes(id)));
    } else {
      setSelectedTaskIds(prev => Array.from(new Set([...prev, ...pageAvailableTaskIds])));
    }
  };

  const toggleSelectTask = (taskId: string) => {
    setSelectedTaskIds(prev =>
      prev.includes(taskId) ? prev.filter(id => id !== taskId) : [...prev, taskId]
    );
  };

  // 选中的集合中符合“批量沉淀至知识库”条件的任务
  const savableTasksInSelected = useMemo(() => {
    return recentTasks.filter(t => {
      if (!selectedTaskIds.includes(t.id)) return false;
      const isSuccess = t.status === "SUCCESS";
      const alreadyInKnowledge = knowledges && Array.isArray(knowledges) && knowledges.some(k => 
        (k.sourceTaskId && k.sourceTaskId === t.id) || (k.title && k.title === t.name)
      );
      return isSuccess && !alreadyInKnowledge;
    });
  }, [recentTasks, selectedTaskIds, knowledges]);

  // 批量沉淀至知识库核心操作处理函数
  const handleBatchSaveToKnowledge = () => {
    if (savableTasksInSelected.length === 0) {
      toast.warning("选中的任务中暂无符合沉淀条件的成功分析成果");
      return;
    }

    let successCountNum = 0;
    savableTasksInSelected.forEach(task => {
      handleSaveToKnowledge(task);
      successCountNum++;
    });

    toast.success(`🎉 已成功将 ${successCountNum} 笔分析结果批量沉淀至团队知识库！`);
    setSelectedTaskIds([]);
  };

  // 单笔任务删除处理
  const handleSingleDelete = (task: TaskRecord) => {
    setConfirmModal({
      open: true,
      title: "确认删除该笔任务分析结果？",
      description: `删除后，分析记录《${task.name}》将从系统中被物理删除，该操作不可恢复。`,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem("zhige_token") || localStorage.getItem("token") || "";
          const res = await fetch(`/api/tasks?id=${encodeURIComponent(task.id)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          if (res.ok && data.success) {
            toast.success(`🎉 已成功物理删除分析任务《${task.name}》`);
            setSelectedTaskIds(prev => prev.filter(id => id !== task.id));
            if (onDeleteTask) onDeleteTask(task.id);
          } else {
            toast.error(data.error || "删除任务分析记录失败");
          }
        } catch (e) {
          toast.error("网络异常，删除失败");
        }
      },
    });
  };

  // 批量任务删除处理
  const handleBatchDelete = () => {
    if (selectedTaskIds.length === 0) {
      toast.warning("请先勾选需要批量删除的任务分析结果记录");
      return;
    }

    setConfirmModal({
      open: true,
      title: `确认批量删除选中的 ${selectedTaskIds.length} 笔任务分析结果？`,
      description: `此操作将从数据库中物理删除选中的 ${selectedTaskIds.length} 笔任务成果记录，不可恢复，请确认。`,
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, open: false }));
        try {
          const token = localStorage.getItem("zhige_token") || localStorage.getItem("token") || "";
          const res = await fetch("/api/tasks", {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ taskIds: selectedTaskIds }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            toast.success(`🎉 已成功批量删除 ${data.count || selectedTaskIds.length} 笔任务分析记录`);
            const deletedIds = [...selectedTaskIds];
            setSelectedTaskIds([]);
            if (onBatchDeleteTasks) onBatchDeleteTasks(deletedIds);
          } else {
            toast.error(data.error || "批量删除失败");
          }
        } catch (e) {
          toast.error("网络异常，批量删除失败");
        }
      },
    });
  };

  return (
    <div className="bg-white/80 backdrop-blur-xl border border-slate-200/80 p-6 rounded-3xl shadow-sm space-y-6 text-left font-sans">
      {/* 顶部标题与简要说明 */}
      <div className="border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[#3182ce]" /> 自动化任务流水看板
          </h3>
          <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-50 text-[#3182ce] border border-blue-100/80">任务监控</span>
        </div>
        <p className="text-xs text-slate-500 font-medium mt-1">
          全量监控历次任务的运行状态与处理进度，支持勾选任务结果一键【批量沉淀至知识库】归档；提供失败重试、日志排查与导出任务报告能力。
        </p>
      </div>

      {/* 搜索与多维度筛选及批量操作栏 */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-50/70 p-3 rounded-2xl border border-slate-200/60">
        <div className="flex items-center gap-2 flex-1 min-w-[280px]">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="搜索任务名称、组件标识..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#3182ce] focus:ring-1 focus:ring-[#3182ce] transition-all"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>

          {/* 勾选任务后显示的【批量沉淀至知识库】与【批量删除】动作按钮（放置于工具栏中） */}
          {selectedTaskIds.length > 0 && (
            <div className="flex items-center gap-2">
              {savableTasksInSelected.length > 0 && (
                <button
                  type="button"
                  onClick={handleBatchSaveToKnowledge}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-500/20 transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 animate-in fade-in duration-150 shrink-0 whitespace-nowrap"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>批量沉淀至知识库 ({savableTasksInSelected.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleBatchDelete}
                className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200/80 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 animate-in fade-in duration-150 shrink-0 whitespace-nowrap shadow-2xs"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
                <span>批量删除 ({selectedTaskIds.length})</span>
              </button>
            </div>
          )}

          {/* 时间范围筛选与自定义时间段组件 (与全站标准样式 100% 保持一致) */}
          <div className="flex flex-wrap items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 shrink-0">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-[#3182ce]" />
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="bg-transparent font-bold outline-none cursor-pointer text-slate-800"
              >
                <option value="ALL">🗓️ 全部创建时间</option>
                <option value="TODAY">今日新运行</option>
                <option value="WEEK">近 7 天内</option>
                <option value="MONTH">近 30 天内</option>
                <option value="CUSTOM">📅 自定义时间段...</option>
              </select>
            </div>

            {/* 当选择【自定义时间段...】时，展开展示开始与结束日期选择框 */}
            {dateFilter === "CUSTOM" && (
              <div className="flex items-center gap-1.5 pl-2 border-l border-slate-200 animate-in fade-in duration-200">
                <span className="text-[11px] text-slate-500 font-bold">开始:</span>
                <input 
                  type="date" 
                  value={customStartDate} 
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="p-0.5 px-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:outline-none focus:border-[#3182ce] bg-white text-slate-800"
                />
                <span className="text-slate-400 font-bold">至</span>
                <span className="text-[11px] text-slate-500 font-bold">结束:</span>
                <input 
                  type="date" 
                  value={customEndDate} 
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="p-0.5 px-1.5 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:outline-none focus:border-[#3182ce] bg-white text-slate-800"
                />
                {(customStartDate || customEndDate) && (
                  <button 
                    type="button" 
                    onClick={() => { setCustomStartDate(""); setCustomEndDate(""); }}
                    className="p-0.5 text-slate-400 hover:text-red-500 font-bold cursor-pointer transition-colors"
                    title="清空自定义时间"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 状态快捷 Tab */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => setTasksFilterTab("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tasksFilterTab === "ALL" ? "bg-[#3182ce] text-white shadow-2xs" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            全部 ({recentTasks.length})
          </button>
          <button
            type="button"
            onClick={() => setTasksFilterTab("SUCCESS")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tasksFilterTab === "SUCCESS" ? "bg-emerald-600 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            成功 ({successCount})
          </button>
          <button
            type="button"
            onClick={() => setTasksFilterTab("FAILED")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tasksFilterTab === "FAILED" ? "bg-red-600 text-white shadow-2xs" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            失败 ({failedCount})
          </button>
        </div>
      </div>

      {/* 结构化任务列表表格 (包含复选框与批量沉淀) */}
      {filteredTasks.length === 0 ? (
        <div className="py-16 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
          <AlertTriangle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-medium">未找到符合筛选条件的任务成果记录</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto border border-slate-200/80 rounded-2xl bg-white shadow-2xs">
            <table className="w-full text-xs text-left text-slate-500 border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50/90 text-slate-700 border-b border-slate-200 text-xs font-extrabold">
                  <th className="py-3.5 px-4 w-[48px] text-center">
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className={`p-1.5 rounded-lg transition-all cursor-pointer inline-flex items-center justify-center ${
                        isAllSelected
                          ? "bg-[#3182ce] text-white shadow-xs ring-2 ring-[#3182ce]/30 scale-105"
                          : isSomeSelected
                          ? "bg-blue-100 text-[#3182ce] border border-[#3182ce]/40"
                          : "text-slate-400 hover:text-[#3182ce] hover:bg-slate-200/60"
                      }`}
                      title={isAllSelected ? "取消全选当前页任务" : "全选当前页任务"}
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-white" />
                      ) : isSomeSelected ? (
                        <CheckSquare className="w-4 h-4 text-[#3182ce]" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3.5 px-4 w-[24%]">任务名称</th>
                  <th className="py-3.5 px-3 w-[28%]">调度组件</th>
                  <th className="py-3.5 px-3 w-[10%]">算力消耗</th>
                  <th className="py-3.5 px-3 w-[11%]">执行状态</th>
                  <th className="py-3.5 px-3 w-[18%]">创建任务时间</th>
                  <th className="py-3.5 px-4 w-[220px] text-right whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-600 bg-white">
                {paginatedTasks.map(task => {
                  const compDisp = getCleanComponentDisplay(task.componentId, task.componentName, allComponents);
                  const isChecked = selectedTaskIds.includes(task.id);
                  const isSuccess = task.status === "SUCCESS";

                  // 校验该任务成果是否已沉淀在团队知识库中
                  const alreadyInKnowledge = knowledges && Array.isArray(knowledges) && knowledges.some(k => 
                    (k.sourceTaskId && k.sourceTaskId === task.id) || (k.title && k.title === task.name)
                  );

                  return (
                    <tr 
                      key={task.id} 
                      className={`transition-all duration-150 border-b border-slate-100 ${
                        isChecked
                          ? "bg-blue-50/90 hover:bg-blue-100/70 border-l-4 border-l-[#3182ce] shadow-2xs font-semibold text-slate-900"
                          : "hover:bg-slate-50/80 border-l-4 border-l-transparent"
                      }`}
                    >
                      {/* 复选框多选列 (支持全量勾选物理删除) */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => toggleSelectTask(task.id)}
                          className={`p-1 rounded-md transition-all cursor-pointer inline-flex items-center justify-center ${
                            isChecked 
                              ? "bg-[#3182ce] text-white shadow-2xs ring-2 ring-[#3182ce]/20 active:scale-95" 
                              : "text-slate-300 hover:text-[#3182ce] hover:bg-blue-50/60"
                          }`}
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-white" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* 任务名称 */}
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="truncate" title={task.name}>
                          {task.name}
                        </div>
                      </td>

                      {/* 调度组件 (标准 [分类|组件名] 格式) */}
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-1.5 min-w-0 pr-2">
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
                            {compDisp.categoryCN}
                          </span>
                          <span className="truncate text-slate-800 font-extrabold text-xs" title={compDisp.fullName}>
                            {compDisp.fullName}
                          </span>
                        </div>
                      </td>

                      {/* 算力消耗 */}
                      <td className="py-3.5 px-3 font-mono font-black text-slate-700">
                        {task.tokenUsed || 100} 点
                      </td>

                      {/* 执行状态 */}
                      <td className="py-3.5 px-3">
                        {task.status === "SUCCESS" && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> 成功
                          </span>
                        )}
                        {task.status === "FAILED" && (
                          <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 text-[10px] font-bold inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> 失败
                          </span>
                        )}
                        {task.status === "RUNNING" && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold inline-flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" /> 运行中
                          </span>
                        )}
                      </td>

                      {/* 创建时间 */}
                      <td className="py-3.5 px-3 font-mono text-slate-500 text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{formatTaskTime(task.time)}</span>
                        </div>
                      </td>

                      {/* 操作 (包含查看结果、沉淀知识及单笔删除) */}
                      <td className="py-3.5 px-4 text-right font-black text-xs whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openStructurePreview(task)}
                            className="text-[#3182ce] hover:text-[#2b6cb0] hover:underline cursor-pointer inline-flex items-center gap-0.5 font-bold"
                          >
                            <Eye className="w-3.5 h-3.5" /> 查看结果
                          </button>
                          
                          {/* 仅针对未沉淀的成功任务展示【沉淀知识】动作 */}
                          {!alreadyInKnowledge && isSuccess && (
                            <>
                              <span className="text-slate-300">|</span>
                              <button
                                type="button"
                                onClick={() => handleSaveToKnowledge(task)}
                                className="text-[#3182ce] hover:text-[#2b6cb0] hover:underline cursor-pointer inline-flex items-center gap-1 font-black"
                                title="将本笔分析结果独立沉淀至团队知识库"
                              >
                                <BookOpen className="w-3.5 h-3.5 text-[#3182ce] shrink-0" /> 沉淀知识
                              </button>
                            </>
                          )}

                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => handleSingleDelete(task)}
                            className="text-red-500 hover:text-red-700 hover:underline cursor-pointer inline-flex items-center gap-1 font-bold"
                            title="从数据库中物理删除本笔任务分析记录"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500 shrink-0" /> 删除
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={currentPage}
            totalItems={filteredTasks.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      {/* 物理删除二次确认模态框 (统一使用 .zg-modal 规范) */}
      {confirmModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4 text-left font-sans animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900">{confirmModal.title}</h4>
                <p className="text-xs text-slate-500 font-medium mt-0.5">{confirmModal.description}</p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, open: false }))}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black shadow-md shadow-red-500/20 transition-all cursor-pointer active:scale-95"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
