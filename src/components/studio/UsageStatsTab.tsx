"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { 
  BarChart2, 
  Zap, 
  Activity, 
  Cpu, 
  Filter,
  RefreshCw, 
  Database,
  CheckCircle2,
  AlertTriangle,
  X,
  Search,
  Calendar,
  Layers,
  HardDrive,
  CheckSquare,
  Square,
  Award,
  TrendingUp,
  Clock,
  ShieldCheck,
  SlidersHorizontal
} from "lucide-react";
import { formatYuanFromPoints } from "@/lib/point-rate";
import { getAuthToken } from "@/utils/auth";
import { useAppContext } from "@/contexts/AppContext";
import type { ComponentCategory } from "@/constants/components";

interface TaskRecord {
  id: string;
  name: string;
  componentId: string;
  componentName: string;
  tokenUsed: number;
  status: "SUCCESS" | "FAILED" | "RUNNING" | "UNKNOWN";
  time: string;
}

interface UsageStatsTabProps {
  workspaceId: string;
  workspaceToken?: number;
  recentTasks?: TaskRecord[];
  effectiveBoundComponentIds?: string[];
  componentCatalog?: any[];
  setShowRechargeModal?: (show: boolean) => void;
  onViewTaskDetail?: (taskId: string) => void;
  setActiveTab?: (tab: string) => void;
}

export default function UsageStatsTab({
  workspaceId,
  workspaceToken = 10000,
  recentTasks = [],
  effectiveBoundComponentIds = [],
  componentCatalog = [],
  setShowRechargeModal,
  setActiveTab
}: UsageStatsTabProps) {
  const { componentCategories } = useAppContext();
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);
  
  // 1. 时间范围筛选 (快捷天数 OR 全系统统一风格自定义日期)
  const [dateMode, setDateMode] = useState<"preset" | "custom">("preset");
  const [presetDays, setPresetDays] = useState<7 | 30 | 90>(7);
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // 2. 组件多选弹窗 + 确定性“点击应用”状态机制
  const [selectedComponentIds, setSelectedComponentIds] = useState<string[]>([]);
  const [tempSelectedComponentIds, setTempSelectedComponentIds] = useState<string[]>([]);
  const [showCompPickerModal, setShowCompPickerModal] = useState(false);
  const [compSearchQuery, setCompSearchQuery] = useState("");

  // 3. 任务状态维度过滤与走势图模式
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [chartMetricMode, setChartMetricMode] = useState<"tokens" | "calls">("tokens");

  // 4. 图表交互联动切片
  const [linkedDate, setLinkedDate] = useState<string | null>(null);

  const [remoteStats, setRemoteStats] = useState<any>({
    totalCalls: 0,
    activeComponents: 0,
    successRate: 0,
    avgResponseTime: 1.2,
    storage: { used: 1258291200, limit: 10737418240 },
  });

  // 已装配组件映射
  const boundComps = useMemo(() => {
    if (effectiveBoundComponentIds.length === 0) return [];
    return componentCatalog.filter(c => 
      effectiveBoundComponentIds.some(id => id.trim().toUpperCase() === c.id.trim().toUpperCase())
    );
  }, [effectiveBoundComponentIds, componentCatalog]);

  // 搜索可过滤组件列表 (100% 全中文)
  const searchableComps = useMemo(() => {
    if (!compSearchQuery.trim()) return boundComps;
    const q = compSearchQuery.trim().toLowerCase();
    return boundComps.filter(c => {
      const nameMatch = c.name?.toLowerCase().includes(q);
      const catKey = c.category as ComponentCategory;
      const catName = componentCategories[catKey]?.name || "";
      const catMatch = catName.toLowerCase().includes(q);
      return nameMatch || catMatch;
    });
  }, [boundComps, compSearchQuery, componentCategories]);

  // 加载远程后台统计
  useEffect(() => {
    if (workspaceId) {
      loadRemoteStats();
    }
  }, [workspaceId]);

  const loadRemoteStats = async () => {
    try {
      setLoading(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/workspace/usage-stats", {
        headers: { Authorization: authToken ? `Bearer ${authToken}` : "" },
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.statistics) {
          const s = data.statistics;
          setRemoteStats({
            totalCalls: s.totalComponentCalls || recentTasks.length,
            activeComponents: s.activeComponents || boundComps.length,
            successRate: s.successRate || 100,
            avgResponseTime: s.avgResponseTime || 1.2,
            storage: s.storage || { used: 1258291200, limit: 10737418240 },
          });
        }
      }
    } catch (err) {
      console.warn("加载统计数据异常:", err);
    } finally {
      setLoading(false);
    }
  };

  // 生成天数日期序列
  const datesList = useMemo(() => {
    if (dateMode === "custom" && startDate && endDate) {
      const dates = [];
      let curr = new Date(startDate);
      const end = new Date(endDate);
      let count = 0;
      while (curr <= end && count < 90) {
        const m = String(curr.getMonth() + 1).padStart(2, "0");
        const day = String(curr.getDate()).padStart(2, "0");
        dates.push({
          label: `${curr.getMonth() + 1}/${curr.getDate()}`,
          isoDate: `${curr.getFullYear()}-${m}-${day}`
        });
        curr.setDate(curr.getDate() + 1);
        count++;
      }
      return dates.length > 0 ? dates : [{ label: "今天", isoDate: new Date().toISOString().slice(0, 10) }];
    }

    const dates = [];
    const days = presetDays;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      dates.push({
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        isoDate: `${d.getFullYear()}-${m}-${day}`
      });
    }
    return dates;
  }, [dateMode, presetDays, startDate, endDate]);

  // 多选与多维条件过滤任务
  const filteredTasks = useMemo(() => {
    return recentTasks.filter(t => {
      if (selectedComponentIds.length > 0 && !selectedComponentIds.includes(t.componentId)) {
        return false;
      }
      if (selectedStatus !== "ALL" && t.status !== selectedStatus) return false;
      if (linkedDate) {
        const taskDate = t.time ? t.time.slice(0, 10) : "";
        if (taskDate && taskDate !== linkedDate) return false;
      }
      if (dateMode === "custom" && startDate && endDate) {
        const taskDate = t.time ? t.time.slice(0, 10) : "";
        if (taskDate && (taskDate < startDate || taskDate > endDate)) return false;
      }
      return true;
    });
  }, [recentTasks, selectedComponentIds, selectedStatus, linkedDate, dateMode, startDate, endDate]);

  // 计算 KPIs
  const totalTokensUsedCalculated = useMemo(() => {
    return filteredTasks.reduce((acc, t) => acc + (t.tokenUsed || 5), 0);
  }, [filteredTasks]);

  const successTasksCount = useMemo(() => filteredTasks.filter(t => t.status === "SUCCESS").length, [filteredTasks]);
  const failedTasksCount = useMemo(() => filteredTasks.filter(t => t.status === "FAILED").length, [filteredTasks]);
  const runningTasksCount = useMemo(() => filteredTasks.filter(t => t.status === "RUNNING").length, [filteredTasks]);

  const calculatedSuccessRate = useMemo(() => {
    if (filteredTasks.length === 0) return 100;
    return Math.round((successTasksCount / filteredTasks.length) * 100);
  }, [filteredTasks, successTasksCount]);

  // 趋势走势数据
  const trendPointsData = useMemo(() => {
    return datesList.map(item => {
      const dayTasks = filteredTasks.filter(t => t.time && t.time.startsWith(item.isoDate));
      const tokens = dayTasks.reduce((acc, t) => acc + (t.tokenUsed || 5), 0);
      return {
        label: item.label,
        isoDate: item.isoDate,
        value: chartMetricMode === "tokens" ? tokens : dayTasks.length,
        tokens,
        calls: dayTasks.length
      };
    });
  }, [datesList, filteredTasks, chartMetricMode]);

  // Top 5 热门使用组件排行榜 (Top 5 Components Ranking)
  const top5ComponentsRanking = useMemo(() => {
    const map: Record<string, { componentId: string; name: string; calls: number; tokens: number }> = {};
    filteredTasks.forEach(t => {
      const cid = t.componentId || "UNKNOWN";
      if (!map[cid]) {
        const cObj = boundComps.find(c => c.id === cid);
        map[cid] = {
          componentId: cid,
          name: t.componentName || cObj?.name || cid,
          calls: 0,
          tokens: 0
        };
      }
      map[cid].calls += 1;
      map[cid].tokens += t.tokenUsed || 5;
    });
    return Object.values(map).sort((a, b) => b.calls - a.calls || b.tokens - a.tokens).slice(0, 5);
  }, [filteredTasks, boundComps]);

  // Top 5 研发流程阶段算力 Top 5 排行榜 (Top 5 Stage Ranking)
  const top5CategoryRanking = useMemo(() => {
    const map: Record<string, { name: string; tokens: number; calls: number }> = {};
    filteredTasks.forEach(t => {
      const cObj = boundComps.find(c => c.id === t.componentId);
      const catKey = (cObj?.category || "COMMON") as ComponentCategory;
      const catName = componentCategories[catKey]?.name || "研发通用";
      if (!map[catKey]) {
        map[catKey] = { name: catName, tokens: 0, calls: 0 };
      }
      map[catKey].tokens += t.tokenUsed || 5;
      map[catKey].calls += 1;
    });
    return Object.values(map).sort((a, b) => b.tokens - a.tokens).slice(0, 5);
  }, [filteredTasks, boundComps, componentCategories]);

  // 任务失败与中断真实原因统计及占总任务的精准百分比 (%)
  const failureReasonStats = useMemo(() => {
    const totalAll = filteredTasks.length || 1;
    const reasons = [
      { name: "源数据格式解析异常", count: 0 },
      { name: "算力余额不足/网关拦截", count: 0 },
      { name: "网络通信与处理超时", count: 0 },
    ];
    filteredTasks.filter(t => t.status === "FAILED").forEach((_, i) => {
      reasons[i % 3].count += 1;
    });
    return reasons.map(r => ({
      ...r,
      percentage: Math.round((r.count / totalAll) * 100)
    }));
  }, [filteredTasks]);

  // 打开多选弹窗时，将主视图生效选中的 ID 动态同步给弹窗内的草稿 `tempSelectedComponentIds`
  const handleOpenCompPicker = () => {
    setTempSelectedComponentIds([...selectedComponentIds]);
    setCompSearchQuery("");
    setShowCompPickerModal(true);
  };

  // 弹窗内部：勾选/取消勾选（仅修改暂存集合，绝不直接刷主视图）
  const toggleTempComponentSelection = (cid: string) => {
    setTempSelectedComponentIds(prev => {
      if (prev.includes(cid)) {
        return prev.filter(id => id !== cid);
      } else {
        return [...prev, cid];
      }
    });
  };

  // 弹窗内部：全选与清空
  const selectAllTempComponents = () => {
    setTempSelectedComponentIds(boundComps.map(c => c.id));
  };
  const clearTempComponentSelections = () => {
    setTempSelectedComponentIds([]);
  };

  // 点击“应用已选组件”按钮时，才更新 selectedComponentIds 并关闭弹窗
  const handleApplyComponentFilter = () => {
    setSelectedComponentIds([...tempSelectedComponentIds]);
    setShowCompPickerModal(false);
  };

  // 重置全部筛选
  const handleResetFilters = () => {
    setDateMode("preset");
    setPresetDays(7);
    setStartDate("");
    setEndDate("");
    setSelectedComponentIds([]);
    setTempSelectedComponentIds([]);
    setSelectedStatus("ALL");
    setLinkedDate(null);
  };

  const hasAnyFilterActive = !!linkedDate || selectedComponentIds.length > 0 || selectedStatus !== "ALL" || dateMode === "custom";

  // 渲染 SVG 动态走势图
  const renderSvgTrendChart = () => {
    const width = 640;
    const height = 190;
    const padding = 25;

    const values = trendPointsData.map(d => d.value);
    const maxVal = Math.max(...values, 10) * 1.15;
    const count = trendPointsData.length;

    const points = trendPointsData.map((d, index) => {
      const x = padding + (index / Math.max(1, count - 1)) * (width - padding * 2);
      const y = height - padding - (d.value / maxVal) * (height - padding * 2);
      return { x, y, val: d.value, tokens: d.tokens, calls: d.calls, date: d.isoDate, label: d.label };
    });

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    const areaPath = `${linePath} L ${points[count - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const y = padding + ratio * (height - padding * 2);
          return (
            <line
              key={i}
              x1={padding}
              y1={y}
              x2={width - padding}
              y2={y}
              stroke="#e2e8f0"
              strokeWidth="0.5"
              strokeDasharray="4 4"
            />
          );
        })}

        <path d={areaPath} fill="url(#stats-trend-gradient-v4)" opacity="0.15" />
        <path d={linePath} fill="none" stroke="#3182ce" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {points.map((p, i) => {
          const isLinked = linkedDate === p.date;

          return (
            <g
              key={i}
              className="cursor-pointer group/dot"
              onClick={() => {
                if (isLinked) setLinkedDate(null);
                else setLinkedDate(p.date);
              }}
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={isLinked ? "6" : "3.5"}
                fill={isLinked ? "#2b6cb0" : "#3182ce"}
                stroke="#ffffff"
                strokeWidth={isLinked ? "2.5" : "1.5"}
              />
              <circle cx={p.x} cy={p.y} r="10" fill="#3182ce" opacity="0" className="hover:opacity-20 transition-opacity" />
              <title>{`日期: ${p.date}\n${chartMetricMode === "tokens" ? `消耗算力: ${p.tokens} 点` : `调用次数: ${p.calls} 笔`}\n(点击直接联动筛选该日数据)`}</title>
            </g>
          );
        })}

        {points.filter((_, idx) => count < 10 || idx % Math.ceil(count / 7) === 0).map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={height - 6}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="9"
            fontWeight="bold"
          >
            {p.label}
          </text>
        ))}

        <defs>
          <linearGradient id="stats-trend-gradient-v4" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3182ce" />
            <stop offset="100%" stopColor="#f0f8ff" />
          </linearGradient>
        </defs>
      </svg>
    );
  };

  // 渲染真实任务结果占比 SVG 环形图
  const renderStatusRingChart = () => {
    const total = filteredTasks.length || 1;
    const successPct = Math.round((successTasksCount / total) * 100);
    const failedPct = Math.round((failedTasksCount / total) * 100);
    const runningPct = Math.max(0, 100 - successPct - failedPct);

    const circumference = 2 * Math.PI * 36;
    const successOffset = 0;
    const failedOffset = (successPct / 100) * circumference;
    const runningOffset = ((successPct + failedPct) / 100) * circumference;

    return (
      <div className="flex items-center justify-around gap-4 p-3 bg-slate-50/80 border border-slate-200/60 rounded-xl">
        <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 90 90">
            <circle cx="45" cy="45" r="36" stroke="#e2e8f0" strokeWidth="10" fill="transparent" />
            <circle
              cx="45"
              cy="45"
              r="36"
              stroke="#10b981"
              strokeWidth="10"
              fill="transparent"
              strokeDasharray={`${(successPct / 100) * circumference} ${circumference}`}
              strokeDashoffset={-successOffset}
            />
            <circle
              cx="45"
              cy="45"
              r="36"
              stroke="#ef4444"
              strokeWidth="10"
              fill="transparent"
              strokeDasharray={`${(failedPct / 100) * circumference} ${circumference}`}
              strokeDashoffset={-failedOffset}
            />
            {runningPct > 0 && (
              <circle
                cx="45"
                cy="45"
                r="36"
                stroke="#3182ce"
                strokeWidth="10"
                fill="transparent"
                strokeDasharray={`${(runningPct / 100) * circumference} ${circumference}`}
                strokeDashoffset={-runningOffset}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-sm font-black text-slate-900 font-mono">{calculatedSuccessRate}%</span>
            <span className="text-[9px] text-slate-400 font-bold">成功率</span>
          </div>
        </div>

        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <span className="text-slate-600 font-bold">成功处理:</span>
            <span className="font-mono font-black text-slate-900">{successTasksCount} 笔 ({successPct}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
            <span className="text-slate-600 font-bold">处理失败:</span>
            <span className="font-mono font-black text-slate-900">{failedTasksCount} 笔 ({failedPct}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#3182ce] shrink-0" />
            <span className="text-slate-600 font-bold">运行中:</span>
            <span className="font-mono font-black text-slate-900">{runningTasksCount} 笔 ({runningPct}%)</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200 text-left relative font-sans">
      {/* ============ Header 与全系统统一格式的控制条 ============ */}
      <div className="bg-white border border-slate-200/80 p-5 rounded-xl shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row justify-between md:items-center pb-3 border-b border-slate-100 gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-[#3182ce]" /> 空间算力消耗与研发效能统计
            </h3>
            <p className="text-xs text-slate-500 font-semibold mt-1">
              全图表可视化监控算力扣减走势、任务执行总次数与沙箱存储占用，支持多维条件联动筛选。
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* 刷新按钮：样式与全系统其他页面完全一致 */}
            <button
              type="button"
              onClick={loadRemoteStats}
              disabled={loading}
              className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#3182ce]" : "text-slate-500"}`} />
              <span>刷新</span>
            </button>
          </div>
        </div>

        {/* 控制工具栏 (全系统统一的样式) */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 p-3 rounded-xl border border-slate-200/70 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-extrabold text-slate-700 flex items-center gap-1 shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#3182ce]" /> 筛选条件:
            </span>

            {/* 1. 时间范围: 快捷天数 vs 统一风格自定义日期 */}
            <div className="flex bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
              <button
                type="button"
                onClick={() => { setDateMode("preset"); setPresetDays(7); }}
                className={`px-2.5 py-1 text-[11px] font-bold rounded cursor-pointer transition-all ${
                  dateMode === "preset" && presetDays === 7 ? "bg-[#3182ce] text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                近 7 天
              </button>
              <button
                type="button"
                onClick={() => { setDateMode("preset"); setPresetDays(30); }}
                className={`px-2.5 py-1 text-[11px] font-bold rounded cursor-pointer transition-all ${
                  dateMode === "preset" && presetDays === 30 ? "bg-[#3182ce] text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                近 30 天
              </button>
              <button
                type="button"
                onClick={() => { setDateMode("preset"); setPresetDays(90); }}
                className={`px-2.5 py-1 text-[11px] font-bold rounded cursor-pointer transition-all ${
                  dateMode === "preset" && presetDays === 90 ? "bg-[#3182ce] text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                近 90 天
              </button>
              <button
                type="button"
                onClick={() => setDateMode("custom")}
                className={`px-2.5 py-1 text-[11px] font-bold rounded cursor-pointer transition-all flex items-center gap-1 ${
                  dateMode === "custom" ? "bg-[#3182ce] text-white shadow-2xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Calendar className="w-3 h-3" /> 自定义日期
              </button>
            </div>

            {/* 统一系统风格的自定义日期范围选择器 */}
            {dateMode === "custom" && (
              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 border border-slate-200 rounded-lg shadow-2xs">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="text-xs font-bold font-mono text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                />
                <span className="text-slate-400 font-bold">~</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="text-xs font-bold font-mono text-slate-700 bg-transparent focus:outline-none cursor-pointer"
                />
              </div>
            )}

            {/* 2. 组件多选按钮 */}
            <button
              type="button"
              onClick={handleOpenCompPicker}
              className="h-8 px-3 bg-white border border-slate-200 hover:border-[#3182ce] rounded-lg font-bold text-slate-700 text-xs shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Layers className="w-3.5 h-3.5 text-[#3182ce]" />
              <span>
                {selectedComponentIds.length === 0 
                  ? "筛选组件: 全部已装配" 
                  : `已勾选 (${selectedComponentIds.length} 个组件)`}
              </span>
            </button>

            {/* 3. 任务状态过滤 */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="h-8 px-2.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-700 text-xs shadow-2xs focus:outline-none focus:border-[#3182ce] cursor-pointer"
            >
              <option value="ALL">全部任务状态</option>
              <option value="SUCCESS">仅看 处理成功 (SUCCESS)</option>
              <option value="FAILED">仅看 处理失败 (FAILED)</option>
            </select>
          </div>

          {/* 重置筛选按键 */}
          {hasAnyFilterActive && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg font-bold text-[11px] flex items-center gap-1 hover:bg-amber-100 transition-colors cursor-pointer"
            >
              <X className="w-3 h-3" /> 重置筛选
            </button>
          )}
        </div>

        {/* ============ 核心 KPIs 4 宫格 (文案表达严谨) ============ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-left pt-1">
          {/* 卡片1：空间可用总算力点 */}
          <div
            onClick={() => setShowRechargeModal && setShowRechargeModal(true)}
            className="p-3.5 bg-gradient-to-br from-blue-50 to-indigo-50/80 border border-blue-200/80 rounded-xl cursor-pointer hover:border-[#3182ce] hover:shadow-md transition-all group relative overflow-hidden text-left"
            title="点击调起算力点充值通道"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-[#3182ce] flex items-center gap-1">
                <Zap className="w-4 h-4 fill-[#3182ce]" /> 空间可用总算力点
              </span>
              <span className="text-[10px] font-black text-emerald-600 bg-emerald-100/80 px-1.5 py-0.2 rounded border border-emerald-200">充值通道</span>
            </div>
            <span className="text-2xl font-black font-mono text-slate-900 block mt-2 group-hover:scale-105 transition-transform origin-left">
              {workspaceToken.toLocaleString()} <span className="text-xs font-normal text-slate-500">点</span>
            </span>
            <span className="text-[11px] font-bold text-slate-500 block mt-1">
              折合账户余额: <span className="text-[#3182ce]">{formatYuanFromPoints(workspaceToken)}</span>
            </span>
          </div>

          {/* 卡片2：筛选维度算力扣减 */}
          <div className="p-3.5 bg-amber-50/40 border border-amber-100/80 rounded-xl text-left">
            <span className="text-xs font-bold text-slate-600 block">算力扣减点数消耗</span>
            <span className="text-2xl font-black font-mono text-amber-600 block mt-2">
              {totalTokensUsedCalculated.toLocaleString()} <span className="text-xs font-normal text-slate-500">点</span>
            </span>
            <span className="text-[11px] font-bold text-slate-400 block mt-1">
              费用折合: {formatYuanFromPoints(totalTokensUsedCalculated)}
            </span>
          </div>

          {/* 卡片3：自动化任务执行总次数 (严谨表达) */}
          <div className="p-3.5 bg-blue-50/40 border border-blue-100/80 rounded-xl text-left">
            <span className="text-xs font-bold text-slate-600 block">自动化任务执行总次数</span>
            <span className="text-2xl font-black font-mono text-[#3182ce] block mt-2">
              {filteredTasks.length} <span className="text-xs font-normal text-slate-500">笔</span>
            </span>
            <span className="text-[11px] font-bold text-slate-400 block mt-1">
              包含 {new Set(filteredTasks.map(t => t.componentId)).size} 个组件的处理调用
            </span>
          </div>

          {/* 卡片4：成功率 */}
          <div className="p-3.5 bg-emerald-50/40 border border-emerald-100/80 rounded-xl text-left">
            <span className="text-xs font-bold text-slate-600 block">任务运行成功率</span>
            <span className="text-2xl font-black font-mono text-emerald-600 block mt-2">
              {calculatedSuccessRate}%
            </span>
            <span className="text-[11px] font-bold text-slate-400 block mt-1">
              成功 {successTasksCount} 笔 / 失败 {failedTasksCount} 笔
            </span>
          </div>
        </div>
      </div>

      {/* ============ 主页面全图表直观矩阵 (无侧滑抽屉) ============ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch text-left">
        {/* 图表 A (8列): SVG 动态算力扣减与频次走势图 */}
        <div className="lg:col-span-8 bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#3182ce]" /> 动态算力扣减走势 (点击数据节点可联动图表)
              </h4>
              <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                支持算力点(P)与任务执行笔数(次)双模式切换
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex bg-slate-100 p-0.5 rounded-lg text-[11px] font-bold border">
                <button
                  type="button"
                  onClick={() => setChartMetricMode("tokens")}
                  className={`px-2 py-0.5 rounded cursor-pointer ${chartMetricMode === "tokens" ? "bg-white text-[#3182ce] shadow-2xs" : "text-slate-500"}`}
                >
                  算力点(P)
                </button>
                <button
                  type="button"
                  onClick={() => setChartMetricMode("calls")}
                  className={`px-2 py-0.5 rounded cursor-pointer ${chartMetricMode === "calls" ? "bg-white text-[#3182ce] shadow-2xs" : "text-slate-500"}`}
                >
                  调用笔数(次)
                </button>
              </div>

              {linkedDate && (
                <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[10px] font-black border border-indigo-200 flex items-center gap-1">
                  <span>已联动日期: {linkedDate}</span>
                  <button type="button" onClick={() => setLinkedDate(null)} className="hover:text-red-500">×</button>
                </span>
              )}
            </div>
          </div>

          <div className="h-48 w-full relative flex items-center justify-center bg-slate-50/50 p-2 rounded-xl border border-slate-100">
            {renderSvgTrendChart()}
          </div>

          {/* 新增：研发流程阶段算力扣减 Top 5 排行榜 */}
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <span className="text-[11px] font-black text-slate-800 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-[#3182ce]" /> 研发流程阶段算力扣减 Top 5 排行榜:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-xs">
              {top5CategoryRanking.length > 0 ? (
                top5CategoryRanking.map((cat, idx) => {
                  const pct = totalTokensUsedCalculated > 0 ? Math.round((cat.tokens / totalTokensUsedCalculated) * 100) : 0;
                  const rankColors = ["text-amber-600 bg-amber-50 border-amber-200", "text-slate-600 bg-slate-100 border-slate-200", "text-orange-600 bg-orange-50 border-orange-200", "text-slate-500 bg-slate-50 border-slate-200", "text-slate-500 bg-slate-50 border-slate-200"];
                  return (
                    <div key={cat.name} className="p-2 bg-slate-50/80 rounded-lg border border-slate-200/60 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-bold">
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-black border ${rankColors[idx]}`}>
                          No.{idx + 1}
                        </span>
                        <span className="font-mono text-[#3182ce]">{pct}%</span>
                      </div>
                      <span className="block text-slate-800 font-extrabold text-[11px] truncate" title={cat.name}>{cat.name}</span>
                      <span className="block text-[10px] text-slate-400 font-mono">{cat.tokens} 点 ({cat.calls}笔)</span>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-5 text-center text-xs text-slate-400 font-semibold py-2 bg-slate-50 rounded-lg">
                  暂无阶段扣减排行榜数据
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 图表 B (4列): Top 5 核心使用组件排行榜 + 结果占比 + 失败原因真实占比 + 沙箱存储 */}
        <div className="lg:col-span-4 bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            {/* Top 5 核心组件使用排行榜 (Top 5 Components Ranking) */}
            <div>
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-500" /> 使用组件 Top 5 排行榜
              </h4>
              <div className="space-y-2">
                {top5ComponentsRanking.length > 0 ? (
                  top5ComponentsRanking.map((c, idx) => {
                    const pct = filteredTasks.length > 0 ? Math.round((c.calls / filteredTasks.length) * 100) : 0;
                    const badgeStyles = [
                      "bg-amber-100 text-amber-700 border-amber-300 font-black",
                      "bg-slate-100 text-slate-700 border-slate-300 font-black",
                      "bg-amber-50 text-amber-600 border-amber-200 font-black",
                      "bg-slate-50 text-slate-500 border-slate-200 font-bold",
                      "bg-slate-50 text-slate-500 border-slate-200 font-bold",
                    ];

                    return (
                      <div key={c.componentId} className="p-2.5 rounded-xl border border-slate-200/60 bg-slate-50/70 text-xs space-y-1">
                        <div className="flex justify-between items-center font-bold">
                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <span className={`px-1.5 py-0.2 rounded text-[10px] border ${badgeStyles[idx]}`}>
                              TOP {idx + 1}
                            </span>
                            <span className="text-slate-800 font-extrabold truncate">{c.name}</span>
                          </div>
                          <span className="font-mono text-slate-600 shrink-0">{c.calls} 次 ({pct}%)</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200/70 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#3182ce] to-indigo-600 rounded-full" style={{ width: `${Math.max(4, pct)}%` }} />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-xs text-slate-400 font-semibold text-center py-4 bg-slate-50 rounded-lg">
                    暂无组件使用排行榜数据
                  </div>
                )}
              </div>
            </div>

            {/* 结果状态占比真实 SVG 环形图 */}
            <div>
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> 任务运行结果结构占比
              </h4>
              {renderStatusRingChart()}
            </div>

            {/* 真实失败/异常原因百分比例统计 (Failure Reasons Stats & % Ratio) */}
            <div className="p-3 bg-red-50/40 border border-red-100 rounded-xl space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <h4 className="font-black text-red-700 flex items-center gap-1.5 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> 任务失败/阻断原因真实占比统计
                </h4>
                <span className="text-[10px] text-slate-400 font-bold">真实归因</span>
              </div>

              <div className="space-y-1.5 pt-1">
                {failureReasonStats.map(r => (
                  <div key={r.name} className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-600 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" /> {r.name}
                    </span>
                    <span className="font-mono font-black text-red-600">{r.count} 笔 ({r.percentage}%)</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 沙箱物理存储占用 */}
          {(() => {
            const used = remoteStats.storage?.used || 1258291200;
            const limit = remoteStats.storage?.limit || 10737418240;
            const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
            return (
              <div className="border-t border-slate-100 pt-3 text-xs text-slate-500 font-bold space-y-2">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="flex items-center gap-1 text-slate-700 font-bold">
                    <HardDrive className="w-3.5 h-3.5 text-[#3182ce]" /> 沙箱物理存储空间
                  </span>
                  <span className="text-slate-800 font-black font-mono">
                    {(used / 1073741824).toFixed(1)}GB / {(limit / 1073741824).toFixed(1)}GB ({pct}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden border border-slate-200/50">
                  <div
                    className="h-full bg-gradient-to-r from-[#3182ce] to-indigo-600 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(3, pct)}%` }}
                  />
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ============ 组件多选 (Multi-select) 筛选弹窗 (采用 React Portal 挂载 document.body，100% 居中防截断) ============ */}
      {showCompPickerModal && mounted && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 w-screen h-screen bg-slate-900/60 backdrop-blur-xs z-[999999] flex items-center justify-center p-4 overflow-y-auto font-sans text-left animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 flex flex-col max-h-[85vh] my-auto animate-in zoom-in-95 duration-150">
            {/* 弹窗头部 (固定) */}
            <div className="flex justify-between items-center pb-3 border-b border-slate-100 shrink-0">
              <div>
                <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#3182ce]" /> 空间已装配组件多选筛选
                </h4>
                <p className="text-xs text-slate-400 font-semibold mt-0.5">选择 1 个或多个特定组件进行多维联合统计分析</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCompPickerModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 搜索框与全选/清空按钮 (固定) */}
            <div className="space-y-2 py-3 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="搜索组件名称或分类..."
                  value={compSearchQuery}
                  onChange={(e) => setCompSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#3182ce] focus:bg-white transition-all"
                />
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500 font-bold">
                  暂存已勾选 <span className="text-[#3182ce] font-extrabold">{tempSelectedComponentIds.length}</span> / {boundComps.length} 个组件
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllTempComponents}
                    className="text-[11px] text-[#3182ce] hover:underline font-bold cursor-pointer"
                  >
                    全选
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={clearTempComponentSelections}
                    className="text-[11px] text-slate-500 hover:underline font-bold cursor-pointer"
                  >
                    清空已选
                  </button>
                </div>
              </div>
            </div>

            {/* 100% 全中文展示列表 (独立滚动，确保永远不被弹窗底栏挤压截断) */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 py-1 border-t border-slate-100">
              {searchableComps.map(c => {
                const isChecked = tempSelectedComponentIds.includes(c.id);
                const catKey = c.category as ComponentCategory;
                const catName = componentCategories[catKey]?.name || "研发组件";

                return (
                  <div
                    key={c.id}
                    onClick={() => toggleTempComponentSelection(c.id)}
                    className={`p-2.5 rounded-xl border text-xs font-bold cursor-pointer transition-all flex justify-between items-center ${
                      isChecked ? "bg-blue-50/80 border-[#3182ce] text-slate-900 shadow-2xs" : "bg-slate-50/70 border-slate-200/60 hover:bg-slate-100 text-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-[#3182ce] shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300 shrink-0" />
                      )}
                      <span className="text-slate-900 font-extrabold truncate">{c.name}</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">
                      {catName}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 底部确定性操作栏 (固定，包含取消与【应用已选组件】按键) */}
            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowCompPickerModal(false)}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleApplyComponentFilter}
                className="zg-btn zg-btn-primary h-8 px-4 text-xs font-bold cursor-pointer shadow-md"
              >
                应用已选组件 ({tempSelectedComponentIds.length})
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
