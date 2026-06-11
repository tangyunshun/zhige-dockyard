"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  FolderKanban,
  Activity,
  TrendingUp,
  Cpu,
  Globe,
  AlertCircle,
  CheckCircle,
} from "lucide-react";

interface GlobalMetrics {
  totalUsers: number;
  totalWorkspaces: number;
  totalTokensConsumed: number;
  mrr: number;
}

export default function PlatformAdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<GlobalMetrics>({
    totalUsers: 12847,
    totalWorkspaces: 3421,
    totalTokensConsumed: 52847923,
    mrr: 284500,
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#2b6cb0]/30 border-t-[#2b6cb0] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">加载数据中...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      icon: Users,
      label: "总用户数",
      value: metrics.totalUsers.toLocaleString(),
      change: "+15.2%",
      trend: "up" as const,
      color: "text-[#2b6cb0]",
      bgColor: "bg-[#2b6cb0]/10",
    },
    {
      icon: FolderKanban,
      label: "全网工作空间",
      value: metrics.totalWorkspaces.toLocaleString(),
      change: "+8.7%",
      trend: "up" as const,
      color: "text-[#10b981]",
      bgColor: "bg-[#10b981]/10",
    },
    {
      icon: Cpu,
      label: "累计 Token 消耗",
      value: (metrics.totalTokensConsumed / 1000000).toFixed(2) + "M",
      change: "+24.5%",
      trend: "up" as const,
      color: "text-[#f59e0b]",
      bgColor: "bg-[#f59e0b]/10",
    },
    {
      icon: TrendingUp,
      label: "MRR (月经常性收入)",
      value: "¥" + (metrics.mrr / 10000).toFixed(2) + "万",
      change: "+18.3%",
      trend: "up" as const,
      color: "text-[#8b5cf6]",
      bgColor: "bg-[#8b5cf6]/10",
    },
  ];

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="shrink-0">
        <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">
          全局资产大盘
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          知阁·舟坊平台核心运营指标监控
        </p>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div
              key={index}
              className="relative bg-white rounded-[8px] p-6 border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 overflow-hidden"
            >
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div
                    className={`w-14 h-14 shrink-0 rounded-[8px] ${card.bgColor} flex items-center justify-center shadow-sm`}
                  >
                    <Icon className={`w-7 h-7 ${card.color}`} />
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center px-2.5 py-1 rounded-[4px] text-xs font-bold ${card.trend === "up" ? "text-[#10b981] bg-[#10b981]/10" : "text-red-500 bg-red-500/10"}`}
                  >
                    {card.trend === "up" ? "↑" : "↓"} {card.change}
                  </span>
                </div>
                <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                  {card.value}
                </div>
                <div className="text-sm text-slate-500 font-bold">
                  {card.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 快捷操作区域 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-[8px] p-6 border border-slate-100 shadow-sm">
          <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5 text-[#2b6cb0]" />
            租户与空间管控
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            管理全网所有工作空间，执行封禁、配额干预等操作
          </p>
          <button
            onClick={() => router.push("/platform-admin/workspaces")}
            className="w-full px-4 py-3 bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] text-white text-sm font-bold rounded-[4px] hover:shadow-md transition-all flex items-center justify-center gap-2"
          >
            进入空间管理
          </button>
        </div>

        <div className="bg-white rounded-[8px] p-6 border border-slate-100 shadow-sm">
          <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-[#f59e0b]" />
            组件全局调度
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            控制53个原子组件的全局开关、权限级别和维护状态
          </p>
          <button
            onClick={() => router.push("/platform-admin/components")}
            className="w-full px-4 py-3 bg-gradient-to-r from-[#f59e0b] to-[#d97706] text-white text-sm font-bold rounded-[4px] hover:shadow-md transition-all flex items-center justify-center gap-2"
          >
            进入组件管理
          </button>
        </div>
      </div>

      {/* 系统状态概览 */}
      <div className="bg-white rounded-[8px] p-6 border border-slate-100 shadow-sm">
        <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-[#10b981]" />
          系统运行状态
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-[8px] bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-[#10b981] animate-pulse"></div>
              <span className="text-sm font-bold text-slate-700">API 服务</span>
            </div>
            <p className="text-xs text-slate-500">正常运行中</p>
          </div>

          <div className="p-4 rounded-[8px] bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-[#10b981] animate-pulse"></div>
              <span className="text-sm font-bold text-slate-700">数据库</span>
            </div>
            <p className="text-xs text-slate-500">正常运行中</p>
          </div>

          <div className="p-4 rounded-[8px] bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-[#f59e0b] animate-pulse"></div>
              <span className="text-sm font-bold text-slate-700">缓存服务</span>
            </div>
            <p className="text-xs text-slate-500">负载较高 (78%)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
