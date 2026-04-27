"use client";

import { BarChart3, TrendingUp, Users, Activity } from "lucide-react";

export default function AdminAnalyticsPage() {
  const analyticsData = [
    { label: "日活跃用户", value: "1,234", change: "+12.5%", trend: "up" },
    { label: "周活跃用户", value: "5,678", change: "+8.2%", trend: "up" },
    { label: "月活跃用户", value: "12,345", change: "+15.3%", trend: "up" },
    { label: "组件使用次数", value: "89,012", change: "+23.1%", trend: "up" },
  ];

  const chartData = [
    { day: "周一", users: 1200, components: 800 },
    { day: "周二", users: 1400, components: 900 },
    { day: "周三", users: 1100, components: 750 },
    { day: "周四", users: 1600, components: 1000 },
    { day: "周五", users: 1800, components: 1100 },
    { day: "周六", users: 900, components: 600 },
    { day: "周日", users: 800, components: 550 },
  ];

  return (
    <div className="space-y-6 pb-8">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">
          数据分析
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          用户行为分析、功能使用率、性能监控 · 知阁·舟坊
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {analyticsData.map((item, index) => (
          <div
            key={index}
            className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
          >
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#3182ce]/10 opacity-20 blur-2xl"></div>
            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="text-sm text-slate-500 font-semibold">
                  {item.label}
                </div>
                <div
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${item.trend === "up" ? "text-[#10b981] bg-[#10b981]/10" : "text-red-500 bg-red-500/10"}`}
                >
                  {item.trend === "up" ? "↑" : "↓"} {item.change}
                </div>
              </div>
              <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                {item.value}
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
            </div>
            <div className="space-y-4">
              {chartData.map((item, index) => (
                <div key={index} className="flex items-center gap-4">
                  <div className="w-12 text-xs text-slate-500 font-medium">
                    {item.day}
                  </div>
                  <div className="flex-1 h-10 bg-slate-50/80 rounded-xl flex items-center px-2">
                    <div
                      className="h-5 bg-gradient-to-r from-[#3182ce] to-[#2563eb] rounded-lg shadow-sm"
                      style={{ width: `${(item.users / 2000) * 100}%` }}
                    ></div>
                  </div>
                  <div className="w-16 text-sm font-bold text-slate-700 text-right">
                    {item.users}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 组件使用趋势 */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
          <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-green-500/5 to-emerald-500/5 opacity-50 blur-3xl"></div>

          <div className="relative">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-10 h-10 rounded-xl bg-[#10b981]/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-[#10b981]" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">组件使用趋势</h3>
            </div>
            <div className="space-y-4">
              {chartData.map((item, index) => (
                <div key={index} className="flex items-center gap-4">
                  <div className="w-12 text-xs text-slate-500 font-medium">
                    {item.day}
                  </div>
                  <div className="flex-1 h-10 bg-slate-50/80 rounded-xl flex items-center px-2">
                    <div
                      className="h-5 bg-gradient-to-r from-[#10b981] to-[#059669] rounded-lg shadow-sm"
                      style={{ width: `${(item.components / 1500) * 100}%` }}
                    ></div>
                  </div>
                  <div className="w-16 text-sm font-bold text-slate-700 text-right">
                    {item.components}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 用户行为分析 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
        <div className="absolute -right-4 -top-4 w-40 h-40 rounded-full bg-gradient-to-br from-purple-500/5 to-pink-500/5 opacity-50 blur-3xl"></div>

        <div className="relative">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-xl bg-[#8b5cf6]/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-[#8b5cf6]" />
            </div>
            <h3 className="text-lg font-bold text-slate-800">用户行为分析</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="relative p-6 bg-gradient-to-br from-[#3182ce]/5 to-blue-500/5 rounded-2xl border border-[#3182ce]/10">
              <div className="text-center">
                <div className="text-4xl font-black text-[#3182ce] mb-2">
                  45.6%
                </div>
                <div className="text-sm text-slate-600 font-semibold">
                  日均使用时长
                </div>
                <div className="text-xs text-slate-400 mt-1">25 分钟/用户</div>
              </div>
            </div>
            <div className="relative p-6 bg-gradient-to-br from-[#10b981]/5 to-green-500/5 rounded-2xl border border-[#10b981]/10">
              <div className="text-center">
                <div className="text-4xl font-black text-[#10b981] mb-2">
                  12.3
                </div>
                <div className="text-sm text-slate-600 font-semibold">
                  人均组件使用
                </div>
                <div className="text-xs text-slate-400 mt-1">个/天</div>
              </div>
            </div>
            <div className="relative p-6 bg-gradient-to-br from-[#f59e0b]/5 to-amber-500/5 rounded-2xl border border-[#f59e0b]/10">
              <div className="text-center">
                <div className="text-4xl font-black text-[#f59e0b] mb-2">
                  89.2%
                </div>
                <div className="text-sm text-slate-600 font-semibold">
                  用户留存率
                </div>
                <div className="text-xs text-slate-400 mt-1">周留存</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
