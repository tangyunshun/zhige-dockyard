"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import WorkspaceInternalLayout from "@/components/WorkspaceInternalLayout";
import { TrendingUp, Activity, Cpu, ShieldCheck, RefreshCw, BarChart2 } from "lucide-react";

export default function WorkspaceStatsPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const workspaceId = Array.isArray(params.id) ? params.id[0] : params.id;

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<any>({
    totalCalls: 0,
    activeComponents: 0,
    successRate: 100,
    avgResponseTime: 0,
    monthlyTokens: 0,
    totalTokens: 0,
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
      const userId = localStorage.getItem("userId");
      const res = await fetch("/api/workspace/usage-stats", {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.statistics) {
          const s = data.statistics;
          setStats({
            totalCalls: s.totalComponentCalls || 0,
            activeComponents: s.activeComponents || 0,
            successRate: s.successRate || 100,
            avgResponseTime: s.avgResponseTime || 120,
            monthlyTokens: s.monthlyTokens || 0,
            totalTokens: s.totalTokens || 0,
          });
        }
      } else {
        const err = await res.json();
        throw new Error(err.error || "获取统计数据失败");
      }
    } catch (error: any) {
      console.error("加载统计数据失败:", error);
      toast.error(error.message || "加载失败，请重试");
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

  // 折线图数据点
  const trendData7d = [450, 680, 520, 980, 850, 1200, 950];
  const trendData30d = [
    320, 410, 390, 450, 480, 520, 490, 550, 590, 620, 
    580, 640, 690, 720, 710, 750, 790, 820, 800, 850, 
    890, 920, 900, 960, 990, 1050, 1020, 1100, 1150, 1220
  ];

  const currentDates = timeRange === "7d" ? dates7d : dates30d;
  const currentTrend = timeRange === "7d" ? trendData7d : trendData30d;

  // 渲染 SVG 折线面积图
  const renderTrendChart = () => {
    const width = 600;
    const height = 180;
    const padding = 25;
    
    const maxVal = Math.max(...currentTrend) * 1.15;
    const pointsCount = currentTrend.length;
    
    // 计算坐标点
    const points = currentTrend.map((val, index) => {
      const x = padding + (index / (pointsCount - 1)) * (width - padding * 2);
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
        {points.map((p, i) => (
          <g key={i} className="group/dot cursor-pointer">
            <circle cx={p.x} cy={p.y} r="3.5" fill="#3182ce" stroke="#ffffff" strokeWidth="1.5" />
            <circle cx={p.x} cy={p.y} r="8" fill="#3182ce" opacity="0" className="hover:opacity-20 transition-opacity" />
            
            {/* Tooltip 信息 */}
            <title>{`日期: ${currentDates[i]}\n消耗: ${p.val} Tokens`}</title>
          </g>
        ))}

        {/* X 轴刻度文字 */}
        {points.filter((_, idx) => pointsCount < 10 || idx % 4 === 0).map((p, i) => (
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

          {/* 时段切换 */}
          <div className="flex bg-slate-100 border p-1 rounded-xl shrink-0">
            <button
              onClick={() => setTimeRange("7d")}
              className={`px-3 py-1 text-[11px] font-black rounded-lg transition-all cursor-pointer ${
                timeRange === "7d"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              最近 7 天
            </button>
            <button
              onClick={() => setTimeRange("30d")}
              className={`px-3 py-1 text-[11px] font-black rounded-lg transition-all cursor-pointer ${
                timeRange === "30d"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              最近 30 天
            </button>
          </div>
        </div>

        {/* 核心指标网格 (卡片组) */}
        {loading ? (
          <div className="bg-white rounded-2xl p-8 text-center text-xs text-slate-400 font-bold border">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-500" />
            正在收集效能指标...
          </div>
        ) : (
          <div className="space-y-6">
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
              
              {/* 指标1：总组件调用 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-black block">组件调用总频数</span>
                  <strong className="text-xl font-black text-slate-800 mt-0.5 block">{stats.totalCalls} 次</strong>
                </div>
              </div>

              {/* 指标2：活跃组件 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-black block">空间内已激活组件</span>
                  <strong className="text-xl font-black text-slate-800 mt-0.5 block">{stats.activeComponents} 个</strong>
                </div>
              </div>

              {/* 指标3：成功率 */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-black block">任务运行成功率</span>
                  <strong className="text-xl font-black text-[#38a169] mt-0.5 block">{stats.successRate}%</strong>
                </div>
              </div>

              {/* 指标4：消耗 Token */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <span className="text-lg">⚡</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-black block">算力预估消耗值</span>
                  <strong className="text-xl font-black text-slate-800 mt-0.5 block">
                    {stats.monthlyTokens.toLocaleString()} P
                  </strong>
                </div>
              </div>

            </div>

            {/* 大图表板块 */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch text-left">
              
              {/* 左侧：折线趋势 */}
              <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                <div className="mb-4">
                  <h3 className="text-xs font-black text-slate-700">Token 算力消耗量走势</h3>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">展示该空间下开发组件模拟执行时的算力消耗曲线</p>
                </div>
                
                <div className="h-44 w-full relative flex items-center justify-center">
                  {renderTrendChart()}
                </div>
              </div>

              {/* 右侧：高频组件排行 */}
              <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div>
                  <h3 className="text-xs font-black text-slate-700">Top 3 热门组件排行</h3>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">本空间调用频率前三名的组件</p>
                </div>

                <div className="space-y-3.5 pt-1">
                  
                  {/* 排行 1 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-black text-slate-700">📄 RFP 标书解析 (C01)</span>
                      <span className="font-bold text-slate-500">42%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full" style={{ width: "42%" }} />
                    </div>
                  </div>

                  {/* 排行 2 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-black text-slate-700">🧩 需求转 PRD (C07)</span>
                      <span className="font-bold text-slate-500">30%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full" style={{ width: "30%" }} />
                    </div>
                  </div>

                  {/* 排行 3 */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-black text-slate-700">🔌 RESTful API 生成 (C11)</span>
                      <span className="font-bold text-slate-500">18%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full" style={{ width: "18%" }} />
                    </div>
                  </div>

                </div>

                {/* 存储限额 */}
                <div className="border-t border-slate-100 pt-3.5 text-xs text-slate-500 font-bold space-y-2">
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="flex items-center gap-1">💾 沙箱物理存储空间</span>
                    <span className="text-slate-700 font-black">0.8 GB / 2 GB (40%)</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-[#3182ce] rounded-full" style={{ width: "40%" }} />
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </WorkspaceInternalLayout>
  );
}
