"use client";

import { useState, useMemo, useEffect } from "react";
import { CheckCircle2, Search, RefreshCw, Layers, LayoutGrid, Clock, AlertTriangle, ArrowUpRight, BookOpen, Eye, Calendar } from "lucide-react";

// 全量标准组件库元数据字典 (用于在 componentName 与 ID 重复时，从数据库/字典精准反查真实组件名称)
const SYSTEM_COMPONENT_NAME_MAP: Record<string, string> = {
  C01: "招投标标书自动生成引擎",
  C02: "商务条款偏离度自动比对",
  C03: "竞品优劣深度对比分析",
  C04: "工作汇报白话文翻译",
  C05: "开发工时与成本估算",
  C06: "项目投资回报ROI分析",
  C07: "产品需求文档PRD智能分析",
  C08: "原型设计与交互节点生成",
  C09: "用户旅程与需求变更追踪",
  C13: "即时消息WebSocket开发",
  C15: "RESTful API接口定义生成",
  C18: "数据表结构与关系图设计",
  C20: "跨数据库无缝导入与迁移",
  C21: "网页面积木生成(React)",
  C25: "大前端UI响应式组件库生成",
  C31: "Docker/K8s容器化部署编排",
  C32: "自动化测试用例与脚本生成",
  C36: "数据库防黑客窃取扫描",
  C37: "网页防非法木马与广告植入",
  C40: "企业物理安全隔离审计网关",
  C41: "需求架构偏离度审计",
  C42: "单元测试用例自动补充",
  C43: "代码安全漏洞扫描与修复",
};

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

// 获取真实优雅的组件名称 (消除 C01 | C01 这类因 componentName 等于 ID 造成的尴尬重复)
function getResolvedComponentName(componentId: string, rawName?: string, allComps?: any[]): string {
  const cleanId = (componentId || "").trim().toUpperCase();
  const cleanRaw = (rawName || "").trim();

  // 1. 如果 rawName 存在且不与 ID 相同，直接使用 rawName
  if (cleanRaw && cleanRaw.toUpperCase() !== cleanId) {
    return cleanRaw;
  }

  // 2. 尝试在父级 allComps 中查找
  if (allComps && Array.isArray(allComps)) {
    const found = allComps.find((c) => (c.id || "").toString().toUpperCase() === cleanId);
    if (found && found.name && found.name.toUpperCase() !== cleanId) {
      return found.name;
    }
  }

  // 3. 在系统字典映射中查找
  if (SYSTEM_COMPONENT_NAME_MAP[cleanId]) {
    return SYSTEM_COMPONENT_NAME_MAP[cleanId];
  }

  return cleanRaw || componentId;
}

export default function TasksTab({
  recentTasks,
  tasksFilterTab,
  setTasksFilterTab,
  openStructurePreview,
  handleSaveToKnowledge,
  allComponents,
  handleComponentClick,
  workspaceId
}: TasksTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [timeRangeFilter, setTimeRangeFilter] = useState<"ALL" | "TODAY" | "7DAYS" | "30DAYS" | "CUSTOM">("ALL");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  const [currentPage, setCurrentPage] = useState<number>(1);

  const finalTasks = recentTasks;

  // 搜索或筛选变化时自动重置为第 1 页
  useEffect(() => {
    setCurrentPage(1);
  }, [tasksFilterTab, searchQuery, timeRangeFilter, customStartDate, customEndDate]);

  // 多维综合过滤：状态 Filter + 时间范围 Filter + 自定义时间段 + 关键词 Query
  const filtered = useMemo(() => {
    const now = Date.now();
    return finalTasks.filter(t => {
      // 1. 状态匹配
      const matchesStatus = tasksFilterTab === "ALL" || t.status === tasksFilterTab;
      
      // 2. 关键词匹配
      const q = searchQuery.trim().toLowerCase();
      const resolvedName = getResolvedComponentName(t.componentId, t.componentName, allComponents);
      const matchesQuery = !q || 
        (t.name || "").toLowerCase().includes(q) || 
        resolvedName.toLowerCase().includes(q) ||
        (t.componentId || "").toLowerCase().includes(q);

      // 3. 创建时间范围匹配
      let matchesTime = true;
      if (t.time) {
        const taskTimestamp = new Date(t.time).getTime();
        if (!isNaN(taskTimestamp)) {
          if (timeRangeFilter === "TODAY") {
            matchesTime = now - taskTimestamp <= 24 * 3600 * 1000;
          } else if (timeRangeFilter === "7DAYS") {
            matchesTime = now - taskTimestamp <= 7 * 24 * 3600 * 1000;
          } else if (timeRangeFilter === "30DAYS") {
            matchesTime = now - taskTimestamp <= 30 * 24 * 3600 * 1000;
          } else if (timeRangeFilter === "CUSTOM") {
            if (customStartDate) {
              const startTs = new Date(`${customStartDate} 00:00:00`).getTime();
              if (!isNaN(startTs) && taskTimestamp < startTs) matchesTime = false;
            }
            if (customEndDate) {
              const endTs = new Date(`${customEndDate} 23:59:59`).getTime();
              if (!isNaN(endTs) && taskTimestamp > endTs) matchesTime = false;
            }
          }
        }
      }

      return matchesStatus && matchesQuery && matchesTime;
    });
  }, [finalTasks, tasksFilterTab, searchQuery, timeRangeFilter, customStartDate, customEndDate, allComponents]);

  // 5 条/页 分页切片
  const pageSize = 5;
  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage]);

  const successCount = finalTasks.filter(t => t.status === "SUCCESS").length;
  const failedCount = finalTasks.filter(t => t.status === "FAILED").length;
  const runningCount = finalTasks.filter(t => t.status === "RUNNING").length;
  const totalPointsUsed = finalTasks.reduce((acc, t) => acc + (t.tokenUsed || 5), 0);

  return (
    <div className="bg-white/90 backdrop-blur-xl border border-slate-200/80 p-6 rounded-2xl shadow-sm space-y-6 text-left animate-in fade-in duration-200 font-sans">
      {/* 1. 顶部 Header 统计卡片与标题 */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] shadow-md shadow-[#3182ce]/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 tracking-tight">全空间自动化任务调度中心</h3>
            <p className="text-xs text-slate-500 font-semibold mt-0.5 flex items-center gap-2">
              <span>全量共 {finalTasks.length} 运行记录</span>
              <span>·</span>
              <span className="text-emerald-600 font-bold">{successCount} 成功</span>
              <span>·</span>
              <span className="text-amber-600 font-bold">{runningCount} 运行中</span>
              <span>·</span>
              <span className="text-red-600 font-bold">{failedCount} 失败</span>
              <span>·</span>
              <span className="text-blue-600 font-bold">累计消耗 {totalPointsUsed} 算力点</span>
            </p>
          </div>
        </div>

        {/* 状态 Tab 筛选项 */}
        <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl text-xs font-bold border border-slate-200/60 shrink-0">
          {[
            { key: "ALL", label: "全部任务" },
            { key: "SUCCESS", label: "🟢 已完成" },
            { key: "RUNNING", label: "⚡ 运行中" },
            { key: "FAILED", label: "🔴 处理失败" }
          ].map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setTasksFilterTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
                tasksFilterTab === tab.key 
                  ? "bg-white text-slate-900 shadow-sm font-black scale-[1.02]" 
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 2. 搜索与多维控制面板 (支持关键词、创建时间预设段与自定义 [开始-结束] 日期筛选) */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* 关键字搜索 */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="搜索任务名称、组件标识..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs font-bold bg-slate-50 border border-slate-200/80 rounded-xl focus:bg-white focus:border-[#3182ce] outline-none transition-all placeholder:text-slate-400"
            />
          </div>

          {/* 创建时间范围筛选 Dropdown */}
          <select
            value={timeRangeFilter}
            onChange={(e) => setTimeRangeFilter(e.target.value as any)}
            className="h-9 px-3 text-xs font-extrabold bg-slate-50 border border-slate-200/80 rounded-xl outline-none text-slate-700 cursor-pointer focus:border-[#3182ce]"
          >
            <option value="ALL">🗓️ 全部创建时间</option>
            <option value="TODAY">⚡ 今天创建的任务</option>
            <option value="7DAYS">📅 近 7 天创建</option>
            <option value="30DAYS">📆 近 30 天创建</option>
            <option value="CUSTOM">📅 自定义时间段...</option>
          </select>

          {/* 自定义时间段输入控件 */}
          {timeRangeFilter === "CUSTOM" && (
            <div className="flex items-center gap-1.5 bg-blue-50/60 border border-blue-100 p-1 rounded-xl text-xs animate-in fade-in duration-200">
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-7 px-2 bg-white border border-slate-200 rounded-lg text-xs font-mono outline-none text-slate-700 cursor-pointer"
                title="选择开始日期"
              />
              <span className="text-slate-400 font-bold">至</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-7 px-2 bg-white border border-slate-200 rounded-lg text-xs font-mono outline-none text-slate-700 cursor-pointer"
                title="选择结束日期"
              />
            </div>
          )}
        </div>

        <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5 self-end sm:self-auto shrink-0">
          <span>展示 {filtered.length} / {finalTasks.length} 条记录 (每页 5 条)</span>
        </div>
      </div>

      {/* 3. 任务数据表格与卡片视窗 (优化列宽比例与右向平移，抹平空白) */}
      {filtered.length === 0 ? (
        <div className="text-center py-14 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-white border border-slate-200 flex items-center justify-center mb-3 text-slate-400 shadow-xs">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <p className="text-xs font-bold text-slate-600">暂无符合条件的自动化任务记录</p>
          <p className="text-[11px] text-slate-400 font-semibold mt-1">请尝试更换筛选条件，或前往 Header 【+ 开始新任务】发起一次组件调度处理</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200/70">
            <table className="w-full text-xs text-left text-slate-500 border-collapse table-fixed">
              <thead>
                <tr className="bg-slate-50/90 text-slate-700 border-b border-slate-200 text-xs font-extrabold">
                  <th className="py-3.5 px-4 w-[24%]">任务名称</th>
                  <th className="py-3.5 px-3 w-[30%]">调度组件</th>
                  <th className="py-3.5 px-3 w-[10%]">算力消耗</th>
                  <th className="py-3.5 px-3 w-[11%]">执行状态</th>
                  <th className="py-3.5 px-3 w-[18%]">创建任务时间</th>
                  <th className="py-3.5 px-4 w-[170px] text-right whitespace-nowrap">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-600 bg-white">
                {paginatedTasks.map(task => {
                  const resolvedCompName = getResolvedComponentName(task.componentId, task.componentName, allComponents);

                  return (
                    <tr key={task.id} className="hover:bg-blue-50/20 transition-colors group">
                      {/* 1. 任务名称 (干净不显示 ID) */}
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="truncate" title={task.name}>
                          {task.name}
                        </div>
                      </td>

                      {/* 2. 调度组件 (显示编号与名称) */}
                      <td className="py-3.5 px-3 font-bold text-slate-700">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-[11px] border border-slate-200/60 max-w-full truncate">
                          <Layers className="w-3 h-3 text-[#3182ce] shrink-0" />
                          <span className="font-mono text-slate-900 font-black shrink-0">{task.componentId}</span>
                          <span className="text-slate-300 shrink-0">|</span>
                          <span className="truncate" title={resolvedCompName}>{resolvedCompName}</span>
                        </span>
                      </td>

                      {/* 3. 算力消耗 */}
                      <td className="py-3.5 px-3 font-mono font-black text-slate-800">
                        {task.tokenUsed || 5} <span className="text-[10px] text-slate-400 font-normal">算力点</span>
                      </td>

                      {/* 4. 执行状态 */}
                      <td className="py-3.5 px-3">
                        <span className={`px-2.5 py-1 rounded-lg border text-[11px] font-black inline-flex items-center gap-1.5 ${
                          task.status === "SUCCESS" ? "text-emerald-700 bg-emerald-50 border-emerald-200/80" :
                          task.status === "RUNNING" ? "text-amber-700 bg-amber-50 border-amber-200/80" :
                          task.status === "UNKNOWN" ? "text-slate-600 bg-slate-100 border-slate-200" :
                          "text-red-600 bg-red-50 border-red-200/80"
                        }`}>
                          {task.status === "RUNNING" && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />}
                          {task.status === "SUCCESS" ? "🟢 成功" : task.status === "RUNNING" ? "⚡ 运行中" : task.status === "UNKNOWN" ? "未知状态" : "🔴 失败"}
                        </span>
                      </td>

                      {/* 5. 创建任务时间 (标准化格式) */}
                      <td className="py-3.5 px-3 font-mono text-slate-600 text-[11px] font-semibold whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{formatTaskTime(task.time)}</span>
                        </div>
                      </td>

                      {/* 6. 操作 (强制单行 100% 优雅并排，绝对不折行) */}
                      <td className="py-3.5 px-4 text-right font-black text-xs whitespace-nowrap w-[170px]">
                        {task.status === "SUCCESS" ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => openStructurePreview(task)}
                              className="text-[#3182ce] hover:text-[#2b6cb0] hover:underline cursor-pointer inline-flex items-center gap-0.5"
                            >
                              <Eye className="w-3.5 h-3.5" /> 查看结果
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={() => handleSaveToKnowledge(task)}
                              className="text-amber-600 hover:text-amber-700 hover:underline cursor-pointer inline-flex items-center gap-0.5"
                            >
                              <BookOpen className="w-3.5 h-3.5" /> 保存沉淀
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-300 font-normal">无操作</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 4. 5 条/页 分页控制 Bar (标准齐平对齐) */}
          <div className="pt-3 border-t border-slate-100 px-1 shrink-0 flex items-center justify-between h-9">
            <span className="text-[11px] text-slate-400 font-bold">
              第 {currentPage} / {totalPages} 页 (共 {filtered.length} 条记录，每页 5 条)
            </span>
            {totalPages > 1 ? (
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  ◀ 上一页
                </button>
                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1 text-xs font-bold rounded-md bg-slate-100 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  下一页 ▶
                </button>
              </div>
            ) : (
              <span className="text-[11px] text-slate-300 font-medium font-mono">1/1 单页全量</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
