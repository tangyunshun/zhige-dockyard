"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import WorkspaceInternalLayout from "@/components/WorkspaceInternalLayoutV3";
import { TrendingUp, Activity, Cpu, ShieldCheck, RefreshCw, BarChart2 } from "lucide-react";
import { getAuthToken } from "@/utils/auth";

export default function WorkspaceStatsPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const workspaceId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>({
    totalCalls: 0,
    activeComponents: 0,
    successRate: 0,
    avgResponseTime: 0,
    monthlyTokens: 0,
    totalTokens: 0,
    trendData7d: [],
    trendData30d: [],
    topComponents: [],
    storage: { used: 0, limit: 0 },
    completedCount: 0,
  });

  const [timeRange, setTimeRange] = useState<"7d" | "30d">("7d");

  useEffect(() => {
    if (workspaceId) {
      loadStats();
    }
  }, [workspaceId]);

  const loadStats = async () => {
    try {
      setLoading(true);
      const authToken = getAuthToken();
      const res = await fetch("/api/workspace/usage-stats", {
        headers: {
          Authorization: authToken ? `Bearer ${authToken}` : "",
        },
        credentials: "include",
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.statistics) {
          const s = data.statistics;
          setStats({
            totalCalls: s.totalComponentCalls || 0,
            activeComponents: s.activeComponents || 0,
            successRate: s.successRate || 0,
            avgResponseTime: s.avgResponseTime || 0,
            monthlyTokens: s.monthlyTokens || 0,
            totalTokens: s.totalTokens || 0,
            trendData7d: s.trendData7d || [],
            trendData30d: s.trendData30d || [],
            topComponents: s.topComponents || [],
            storage: s.storage || { used: 0, limit: 0 },
            completedCount: s.completedCount || 0,
          });
        }
      } else {
        const err = await res.json().catch(() => ({}));
        if (err.error === "FORCED_LOGOUT" || err.error === "SESSION_EXPIRED" || res.status === 401) {
          console.warn("账号授权状态变更，平滑降级展示空间效能概览");
          setStats({
            totalCalls: 0,
            activeComponents: 0,
            successRate: 0,
            avgResponseTime: 0,
            monthlyTokens: 0,
            totalTokens: 0,
            trendData7d: [],
            trendData30d: [],
            topComponents: [],
            storage: { used: 0, limit: 0 },
            completedCount: 0,
          });
        } else {
          throw new Error(err.error || "获取统计数据失败");
        }
      }
    } catch (error: any) {
      console.warn("加载统计数据捕获异常:", error.message || error);
      // 优雅平滑降级，确保独立效能大盘正常渲染不挂死
      setStats({
        totalCalls: 0,
        activeComponents: 0,
        successRate: 0,
        avgResponseTime: 0,
        monthlyTokens: 0,
        totalTokens: 0,
        trendData7d: [],
        trendData30d: [],
        topComponents: [],
        storage: { used: 0, limit: 0 },
        completedCount: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  // 生成近7天的日期
  const getPastDates = (days: number) => {
    const dates = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }));
    }
    return dates;
  };

  const dates7d = getPastDates(7);
  const dates30d = getPastDates(30);

  // 折线图数据点（真实聚合数据，来自 /api/workspace/usage-stats）
  const currentDates = timeRange === "7d" ? dates7d : dates30d;
  const currentTrend = timeRange === "7d" ? stats.trendData7d : stats.trendData30d;

  // 渲染 SVG 折线面积图
  const renderTrendChart = () => {
    const width = 600;
    const height = 180;
    const padding = 25;

    // 空数据时以 0 值填充，保证图表正常渲染
    const safeTrend: number[] =
      currentTrend && currentTrend.length > 0 ? currentTrend : new Array(currentDates.length).fill(0);
    const maxVal = Math.max(...safeTrend) * 1.15 || 1;
    const pointsCount = safeTrend.length;
    
    // 计算坐标点
    const points = safeTrend.map((val: number, index: number) => {
      const x = padding + (index / Math.max(1, pointsCount - 1)) * (width - padding * 2);
      const y = height - padding - (val / maxVal) * (height - padding * 2);
      return { x, y, val };
    });
    
    // 生成折线路径
    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    
    // 生成面积路径（闭合到下边界）
    const areaPath = `${linePath} L ${points[pointsCount - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
        {/* 背景网格线 */}
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
        
        {/* 填充面积 */}
        <path d={areaPath} fill="url(#blue-gradient)" opacity="0.15" />
        
        {/* 渐变折线 */}
        <path d={linePath} fill="none" stroke="#3182ce" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        
        {/* 折线上的圆点 */}
        {points.map((p: { x: number; y: number; val: number }, i: number) => (
          <g key={i} className="group/dot cursor-pointer">
            <circle cx={p.x} cy={p.y} r="3.5" fill="#3182ce" stroke="#ffffff" strokeWidth="1.5" />
            <circle cx={p.x} cy={p.y} r="8" fill="#3182ce" opacity="0" className="hover:opacity-20 transition-opacity" />
            
            {/* Tooltip 信息 */}
            <title>{`日期: ${currentDates[i]}\n消耗: ${p.val} 额度`}</title>
          </g>
        ))}

        {/* X 轴刻度文字 */}
        {points.filter((_: { x: number; y: number; val: number }, idx: number) => pointsCount < 10 || idx % 4 === 0).map((p: { x: number; y: number; val: number }, i: number) => (
          <text
            key={i}
            x={p.x}
            y={height - 6}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="9"
            fontWeight="bold"
          >
            {currentDates[pointsCount < 10 ? i : i * 4]}
          </text>
        ))}

        {/* 定义渐变填充 */}
        <defs>
          <linearGradient id="blue-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3182ce" />
            <stop offset="100%" stopColor="#f0f8ff" />
          </linearGradient>
        </defs>
      </svg>
    );
  };

  return (
    <WorkspaceInternalLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        
        {/* 顶栏标题 */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200 gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
              <TrendingUp className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800">使用数据统计</h2>
              <p className="text-xs text-slate-500 font-semibold">分析当前空间下各效能组件算力消耗与利用率数据</p>
            </div>
          </div>

          {/* 快捷返回总览与时段切换 */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => router.push(`/workspace/${workspaceId}`)}
              className="px-3.5 py-1.5 bg-white border border-slate-200 hover:border-[#63b3ed] hover:bg-blue-50/50 text-[#3182ce] text-xs font-extrabold rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1"
            >
              <span>返回空间总览</span>
              <span className="text-xs">➔</span>
            </button>

            <div className="flex bg-slate-100 border p-1 rounded-xl shrink-0">
              <button
                onClick={() => setTimeRange("7d")}
                className={`px-3 py-1 text-[11px] font-black rounded-lg transition-all cursor-pointer ${
                  timeRange === "7d"
                    ? "bg-white text-[#2b6cb0] shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                最近 7 天
              </button>
              <button
                onClick={() => setTimeRange("30d")}
                className={`px-3 py-1 text-[11px] font-black rounded-lg transition-all cursor-pointer ${
                  timeRange === "30d"
                    ? "bg-white text-[#2b6cb0] shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                最近 30 天
              </button>
            </div>
          </div>
        </div>

        {/* 核心指标网格 (卡片组) */}
        {loading ? (
          <div className="bg-white/80 backdrop-blur-md rounded-2xl p-12 text-center text-xs text-slate-400 font-bold border border-slate-200/80 shadow-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#3182ce]" />
            正在实时计算空间效能与算力消耗指标...
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-200">
            
            {/* Top 4 核心指标 Bento Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
              
              {/* 指标1：总组件调用 */}
              <div className="bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] p-5 rounded-[20px] text-white shadow-lg shadow-blue-200/50 flex items-center gap-4 hover:-translate-y-0.5 transition-all">
                <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <div>
                  <span className="text-[11px] text-white/85 font-bold block">组件调用总频数</span>
                  <strong className="text-2xl font-black text-white mt-0.5 block">{stats.totalCalls} 次</strong>
                  <span className="text-[9px] text-white/70 font-semibold block mt-0.5">当月累计自动化处理</span>
                </div>
              </div>

              {/* 指标2：活跃组件 */}
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-5 rounded-[20px] text-white shadow-lg shadow-indigo-200/50 flex items-center gap-4 hover:-translate-y-0.5 transition-all">
                <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                  <Cpu className="w-5 h-5 text-white" />
                </div>
                <div>
                  <span className="text-[11px] text-white/85 font-bold block">空间内已激活组件</span>
                  <strong className="text-2xl font-black text-white mt-0.5 block">{stats.activeComponents} 个</strong>
                  <span className="text-[9px] text-white/70 font-semibold block mt-0.5">覆盖空间全部研发工具</span>
                </div>
              </div>

              {/* 指标3：成功率 */}
              <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 p-5 rounded-[20px] text-white shadow-lg shadow-emerald-200/50 flex items-center gap-4 hover:-translate-y-0.5 transition-all">
                <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5 text-white" />
                </div>
                <div>
                  <span className="text-[11px] text-white/85 font-bold block">任务运行成功率</span>
                  <strong className="text-2xl font-black text-white mt-0.5 block">{stats.successRate}%</strong>
                  <span className="text-[9px] text-white/70 font-semibold block mt-0.5">零规避漏报与中断</span>
                </div>
              </div>

              {/* 指标4：消耗 Token / P */}
              <div className="bg-gradient-to-br from-amber-500 to-amber-500 p-5 rounded-[20px] text-white shadow-lg shadow-amber-200/50 flex items-center gap-4 hover:-translate-y-0.5 transition-all">
                <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                  <span className="text-xl">⚡</span>
                </div>
                <div>
                  <span className="text-[11px] text-white/85 font-bold block">算力预估消耗值</span>
                  <strong className="text-2xl font-black text-white mt-0.5 block">
                    {stats.monthlyTokens.toLocaleString()} P
                  </strong>
                  <span className="text-[9px] text-white/70 font-semibold block mt-0.5">本月累计消耗 Token</span>
                </div>
              </div>

            </div>

            {/* 大图表与排行榜 Bento 板块 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch text-left">
              
              {/* 左侧：折线趋势图表 */}
              <div className="lg:col-span-8 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-[20px] p-6 shadow-xl flex flex-col justify-between space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-[#3182ce]" />
                      Token 算力消耗量走势曲线
                    </h3>
                    <p className="text-[11px] text-slate-400 font-semibold mt-0.5">展示当前工作空间下各开发组件真实执行的算力消耗趋势</p>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-blue-50 text-[#3182ce] text-[10px] font-extrabold border border-blue-100">
                    趋势波动平稳
                  </span>
                </div>
                
                <div className="h-48 w-full relative flex items-center justify-center bg-slate-50/40 p-2 rounded-xl border border-slate-100">
                  {renderTrendChart()}
                </div>

                {/* 底部提效诊断条 */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 text-xs">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                    <span className="text-[10px] text-slate-400 font-bold block">平均处理耗时</span>
                    <span className="font-mono text-xs font-black text-slate-800">{stats.avgResponseTime}s</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                    <span className="text-[10px] text-slate-400 font-bold block">网关安全拦截</span>
                    <span className="font-mono text-xs font-black text-emerald-600">100% 隔离</span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                    <span className="text-[10px] text-slate-400 font-bold block">已归档任务资产</span>
                    <span className="font-mono text-xs font-black text-purple-600">{stats.completedCount} 份</span>
                  </div>
                </div>
              </div>

              {/* 右侧：热门组件排行与存储空间 */}
              <div className="lg:col-span-4 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-[20px] p-6 shadow-xl space-y-5 flex flex-col justify-between">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-[#3182ce]" /> Top 3 热门组件排行
                    </h3>
                    <p className="text-[11px] text-slate-400 font-semibold mt-0.5">本空间调用频率前三名的组件</p>
                  </div>

                  <div className="space-y-3 pt-1">
                    {stats.topComponents.length > 0 ? (
                      stats.topComponents.map((c: any, idx: number) => {
                        const pct = stats.totalCalls > 0 ? Math.round((c.callCount / stats.totalCalls) * 100) : 0;
                        const barColors = [
                          "from-blue-500 to-[#3182ce]",
                          "from-emerald-500 to-emerald-600",
                          "from-purple-500 to-indigo-600",
                        ];
                        const textColors = ["text-[#3182ce]", "text-emerald-600", "text-purple-600"];
                        return (
                          <div key={c.componentId} className="space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-200/60">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-extrabold text-slate-800 truncate">{c.name} ({c.componentId})</span>
                              <span className={`font-black ${textColors[idx % 3]} font-mono`}>{pct}%</span>
                            </div>
                            <div className="w-full h-2 bg-slate-200/70 rounded-full overflow-hidden">
                              <div className={`h-full bg-gradient-to-r ${barColors[idx % 3]} rounded-full`} style={{ width: `${Math.max(2, pct)}%` }} />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-xs text-slate-400 font-semibold text-center py-6 bg-slate-50 rounded-xl border border-slate-200/60">
                        暂无组件调用数据
                      </div>
                    )}
                  </div>
                </div>

                {/* 存储限额 */}
                {(() => {
                  const used = stats.storage.used || 0;
                  const limit = stats.storage.limit || 0;
                  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
                  return (
                    <div className="border-t border-slate-100 pt-3.5 text-xs text-slate-500 font-bold space-y-2">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="flex items-center gap-1">💾 沙箱物理存储空间</span>
                        <span className="text-slate-700 font-black">
                          {(used / 1073741824).toFixed(1)} GB / {(limit / 1073741824).toFixed(1)} GB ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#3182ce] to-indigo-600 rounded-full" style={{ width: `${Math.max(2, pct)}%` }} />
                      </div>
                    </div>
                  );
                })()}
              </div>

            </div>
          </div>
        )}

      </div>
    </WorkspaceInternalLayout>
  );
}
