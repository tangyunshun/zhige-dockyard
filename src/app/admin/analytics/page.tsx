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
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">数据分析</h1>
        <p className="text-sm text-slate-500">
          用户行为分析、功能使用率、性能监控
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {analyticsData.map((item, index) => (
          <div
            key={index}
            className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-slate-500 font-medium">
                {item.label}
              </div>
              <div
                className={`text-xs font-bold ${item.trend === "up" ? "text-green-600" : "text-red-600"}`}
              >
                {item.change}
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-800">
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* 图表区域 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 用户活跃度趋势 */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-[#3182ce]" />
            <h3 className="text-lg font-bold text-slate-800">用户活跃度趋势</h3>
          </div>
          <div className="space-y-4">
            {chartData.map((item, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className="w-12 text-xs text-slate-500">{item.day}</div>
                <div className="flex-1 h-8 bg-slate-50 rounded-lg flex items-center">
                  <div
                    className="h-4 bg-gradient-to-r from-[#3182ce] to-[#2563eb] rounded-lg"
                    style={{ width: `${(item.users / 2000) * 100}%` }}
                  ></div>
                </div>
                <div className="w-16 text-xs text-slate-600 text-right">
                  {item.users}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 组件使用趋势 */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="w-5 h-5 text-[#10b981]" />
            <h3 className="text-lg font-bold text-slate-800">组件使用趋势</h3>
          </div>
          <div className="space-y-4">
            {chartData.map((item, index) => (
              <div key={index} className="flex items-center gap-4">
                <div className="w-12 text-xs text-slate-500">{item.day}</div>
                <div className="flex-1 h-8 bg-slate-50 rounded-lg flex items-center">
                  <div
                    className="h-4 bg-gradient-to-r from-[#10b981] to-[#059669] rounded-lg"
                    style={{ width: `${(item.components / 1500) * 100}%` }}
                  ></div>
                </div>
                <div className="w-16 text-xs text-slate-600 text-right">
                  {item.components}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 用户行为分析 */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <Users className="w-5 h-5 text-[#8b5cf6]" />
          <h3 className="text-lg font-bold text-slate-800">用户行为分析</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-6 bg-slate-50 rounded-xl">
            <div className="text-3xl font-bold text-[#3182ce] mb-2">45.6%</div>
            <div className="text-sm text-slate-500">日均使用时长</div>
            <div className="text-xs text-slate-400 mt-1">25 分钟/用户</div>
          </div>
          <div className="text-center p-6 bg-slate-50 rounded-xl">
            <div className="text-3xl font-bold text-[#10b981] mb-2">12.3</div>
            <div className="text-sm text-slate-500">人均组件使用</div>
            <div className="text-xs text-slate-400 mt-1">个/天</div>
          </div>
          <div className="text-center p-6 bg-slate-50 rounded-xl">
            <div className="text-3xl font-bold text-[#f59e0b] mb-2">89.2%</div>
            <div className="text-sm text-slate-500">用户留存率</div>
            <div className="text-xs text-slate-400 mt-1">周留存</div>
          </div>
        </div>
      </div>
    </div>
  );
}
