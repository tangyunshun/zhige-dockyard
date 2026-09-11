"use client";

import { useEffect, useState } from "react";
import { BarChart3, TrendingUp, Users, Activity, RotateCcw } from "lucide-react";
import { getAuthToken } from "@/utils/auth";

interface KpiItem {
  key: string;
  label: string;
  value: number;
  sub: string;
  change: string;
  trend: "up" | "down" | "flat";
}

interface DailyItem {
  day: string;
  date: string;
  users: number;
  components: number;
}

interface AnalyticsData {
  kpis: KpiItem[];
  daily: DailyItem[];
  behavior: {
    activeRate: { value: string; sub: string };
    avgComponentUsage: { value: string; sub: string };
    weeklyRetention: { value: string; sub: string };
  };
  totals: { users: number; componentsUsed30d: number };
  generatedAt: string;
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/analytics", {
        headers: { Authorization: `Bearer ${getAuthToken()}` },
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.error || "获取数据分析指标失败");
        return;
      }
      setData(json.data);
    } catch (err) {
      console.error("Load analytics error:", err);
      setError("网络异常，获取数据分析指标失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const trendClass = (trend: KpiItem["trend"]) =>
    trend === "up"
      ? "text-[#10b981] bg-[#10b981]/10"
      : trend === "down"
        ? "text-red-500 bg-red-500/10"
        : "text-slate-500 bg-slate-500/10";

  const trendArrow = (trend: KpiItem["trend"]) =>
    trend === "up" ? "↑" : trend === "down" ? "↓" : "—";

  // 柱状条宽度按当前序列最大值自适应，避免写死分母
  const maxUsers = Math.max(1, ...(data?.daily.map((d) => d.users) || [0]));
  const maxComponents = Math.max(1, ...(data?.daily.map((d) => d.components) || [0]));

  return (
    <div className="space-y-6 pb-8">
      {/* 页面标题 */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">
            数据分析
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            用户行为分析、功能使用率与活跃度监控（全部指标实时取自数据库）
          </p>
        </div>
        <button
          type="button"
          onClick={loadAnalytics}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50 shrink-0"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          刷新指标
        </button>
      </div>

      {loading && !data ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-10 h-10 border-3 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mb-3" />
          <p className="text-xs text-slate-500 font-bold">正在聚合数据库真实指标...</p>
        </div>
      ) : error && !data ? (
        <div className="p-6 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-600 font-bold">
          {error}
        </div>
      ) : (
        <>
          {error && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700 font-bold">
              {error}（当前展示的是上一次成功获取的数据）
            </div>
          )}

          {/* 统计卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {(data?.kpis || []).map((item) => (
              <div
                key={item.key}
                className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#3182ce]/10 opacity-20 blur-2xl"></div>
                <div className="relative">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm text-slate-500 font-semibold">
                      {item.label}
                    </div>
                    <div
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${trendClass(item.trend)}`}
                    >
                      {trendArrow(item.trend)} {item.change}
                    </div>
                  </div>
                  <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight font-mono">
                    {item.value.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">
                    {item.sub}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* 图表区域 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 用户活跃度趋势 */}
            <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
              <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>

              <div className="relative">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-[#3182ce]/10 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-[#3182ce]" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">
                    用户活跃度趋势
                  </h3>
                  <span className="ml-auto text-[11px] font-bold text-slate-400">
                    近 7 天 · 去重登录用户
                  </span>
                </div>
                <div className="space-y-4">
                  {(data?.daily || []).map((item) => (
                    <div key={item.date} className="flex items-center gap-4">
                      <div className="w-16 text-xs text-slate-500 font-medium">
                        {item.day}
                        <span className="ml-1 text-[10px] text-slate-400 font-mono">
                          {item.date}
                        </span>
                      </div>
                      <div className="flex-1 h-10 bg-slate-50/80 rounded-xl flex items-center px-2">
                        <div
                          className="h-5 bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] rounded-lg shadow-sm transition-all duration-300"
                          style={{ width: `${(item.users / maxUsers) * 100}%` }}
                        ></div>
                      </div>
                      <div className="w-16 text-sm font-bold text-slate-700 text-right font-mono">
                        {item.users.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 组件使用趋势 */}
            <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
              <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-emerald-500/5 to-emerald-500/5 opacity-50 blur-3xl"></div>

              <div className="relative">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-[#10b981]/10 flex items-center justify-center">
                    <Activity className="w-5 h-5 text-[#10b981]" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">组件使用趋势</h3>
                  <span className="ml-auto text-[11px] font-bold text-slate-400">
                    近 7 天 · 任务执行记录
                  </span>
                </div>
                <div className="space-y-4">
                  {(data?.daily || []).map((item) => (
                    <div key={item.date} className="flex items-center gap-4">
                      <div className="w-16 text-xs text-slate-500 font-medium">
                        {item.day}
                        <span className="ml-1 text-[10px] text-slate-400 font-mono">
                          {item.date}
                        </span>
                      </div>
                      <div className="flex-1 h-10 bg-slate-50/80 rounded-xl flex items-center px-2">
                        <div
                          className="h-5 bg-gradient-to-r from-[#10b981] to-[#059669] rounded-lg shadow-sm transition-all duration-300"
                          style={{ width: `${(item.components / maxComponents) * 100}%` }}
                        ></div>
                      </div>
                      <div className="w-16 text-sm font-bold text-slate-700 text-right font-mono">
                        {item.components.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 用户行为分析 */}
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
            <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-purple-500/5 to-purple-500/5 opacity-50 blur-3xl"></div>

            <div className="relative">
              <div className="flex items-center gap-2 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#8b5cf6]/10 flex items-center justify-center">
                  <Users className="w-5 h-5 text-[#8b5cf6]" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">用户行为分析</h3>
                <span className="ml-auto text-[11px] font-bold text-slate-400">
                  平台总用户 {data?.totals?.users?.toLocaleString() ?? 0} 人
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="relative p-6 bg-gradient-to-br from-[#3182ce]/5 to-blue-500/5 rounded-2xl border border-[#3182ce]/10">
                  <div className="text-center">
                    <div className="text-4xl font-black text-[#3182ce] mb-2 font-mono">
                      {data?.behavior?.activeRate?.value ?? "0%"}
                    </div>
                    <div className="text-sm text-slate-600 font-semibold">
                      用户活跃率
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {data?.behavior?.activeRate?.sub ?? ""}
                    </div>
                  </div>
                </div>
                <div className="relative p-6 bg-gradient-to-br from-[#10b981]/5 to-emerald-500/5 rounded-2xl border border-[#10b981]/10">
                  <div className="text-center">
                    <div className="text-4xl font-black text-[#10b981] mb-2 font-mono">
                      {data?.behavior?.avgComponentUsage?.value ?? "0"}
                    </div>
                    <div className="text-sm text-slate-600 font-semibold">
                      人均组件使用
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {data?.behavior?.avgComponentUsage?.sub ?? ""}
                    </div>
                  </div>
                </div>
                <div className="relative p-6 bg-gradient-to-br from-[#f59e0b]/5 to-amber-500/5 rounded-2xl border border-[#f59e0b]/10">
                  <div className="text-center">
                    <div className="text-4xl font-black text-[#f59e0b] mb-2 font-mono">
                      {data?.behavior?.weeklyRetention?.value ?? "0%"}
                    </div>
                    <div className="text-sm text-slate-600 font-semibold">
                      周留存率
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {data?.behavior?.weeklyRetention?.sub ?? ""}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-2 text-[11px] text-slate-400 font-medium">
                <BarChart3 className="w-3.5 h-3.5 shrink-0" />
                统计口径：活跃用户按 loginhistory 登录记录去重；组件使用按 componenttask 任务记录计数；环比对比上一等长周期。
                {data?.generatedAt && (
                  <span className="ml-auto font-mono">
                    数据生成于 {new Date(data.generatedAt).toLocaleString("zh-CN")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
