"use client";

import { useState, useEffect } from "react";
import {
  Users,
  FolderKanban,
  Activity,
  TrendingUp,
  Server,
  CheckCircle,
  AlertCircle,
  Clock,
  FileText,
} from "lucide-react";

interface DashboardStats {
  totalUsers: number;
  totalWorkspaces: number;
  totalComponents: number;
  activeUsers: number;
  systemHealth: number;
  pendingReviews: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    try {
      // TODO: 调用 API 获取真实数据
      // 模拟数据
      setStats({
        totalUsers: 1234,
        totalWorkspaces: 567,
        totalComponents: 8901,
        activeUsers: 234,
        systemHealth: 99.9,
        pendingReviews: 12,
      });
    } catch (error) {
      console.error("Load dashboard stats error:", error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      icon: Users,
      label: "总用户数",
      value: stats?.totalUsers || 0,
      change: "+12.5%",
      trend: "up",
      color: "from-[#3182ce] to-[#2563eb]",
      bgColor: "bg-[#3182ce]/10",
    },
    {
      icon: FolderKanban,
      label: "工作空间",
      value: stats?.totalWorkspaces || 0,
      change: "+8.2%",
      trend: "up",
      color: "from-[#10b981] to-[#059669]",
      bgColor: "bg-[#10b981]/10",
    },
    {
      icon: Activity,
      label: "组件总数",
      value: stats?.totalComponents || 0,
      change: "+23.1%",
      trend: "up",
      color: "from-[#f59e0b] to-[#d97706]",
      bgColor: "bg-[#f59e0b]/10",
    },
    {
      icon: TrendingUp,
      label: "活跃用户",
      value: stats?.activeUsers || 0,
      change: "+15.3%",
      trend: "up",
      color: "from-[#8b5cf6] to-[#7c3aed]",
      bgColor: "bg-[#8b5cf6]/10",
    },
  ];

  const systemCards = [
    {
      icon: Server,
      label: "系统健康度",
      value: `${stats?.systemHealth || 0}%`,
      status: "正常",
      color: "text-[#10b981]",
      bgColor: "bg-[#10b981]/10",
    },
    {
      icon: CheckCircle,
      label: "待审核项目",
      value: stats?.pendingReviews || 0,
      status: "待处理",
      color: "text-[#f59e0b]",
      bgColor: "bg-[#f59e0b]/10",
    },
    {
      icon: AlertCircle,
      label: "系统告警",
      value: "0",
      status: "正常",
      color: "text-[#10b981]",
      bgColor: "bg-[#10b981]/10",
    },
    {
      icon: Clock,
      label: "运行时间",
      value: "15 天 23 小时",
      status: "稳定",
      color: "text-[#3182ce]",
      bgColor: "bg-[#3182ce]/10",
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">加载数据中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div
              key={index}
              className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:shadow-lg transition-all"
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className={`w-12 h-12 rounded-lg ${card.bgColor} flex items-center justify-center`}
                >
                  <Icon className={`w-6 h-6 ${card.color}`} />
                </div>
                <span
                  className={`text-xs font-bold ${card.trend === "up" ? "text-[#10b981]" : "text-red-500"}`}
                >
                  {card.change}
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-800 mb-1">
                {card.value.toLocaleString()}
              </div>
              <div className="text-sm text-slate-500 font-medium">
                {card.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* 系统状态卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {systemCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div
              key={index}
              className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm hover:shadow-lg transition-all"
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className={`w-12 h-12 rounded-lg ${card.bgColor} flex items-center justify-center`}
                >
                  <Icon className={`w-6 h-6 ${card.color}`} />
                </div>
                <span
                  className={`text-xs font-bold px-2 py-1 rounded-full ${card.color} bg-opacity-10`}
                >
                  {card.status}
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-800 mb-1">
                {card.value}
              </div>
              <div className="text-sm text-slate-500 font-medium">
                {card.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* 快捷操作 */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4">快捷操作</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => router.push("/admin/users")}
            className="flex items-center gap-3 p-4 rounded-lg bg-slate-50 hover:bg-slate-100 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-[#3182ce]/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-[#3182ce]" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800">
                用户管理
              </div>
              <div className="text-xs text-slate-500">审核用户、分配权限</div>
            </div>
          </button>

          <button
            onClick={() => router.push("/admin/workspaces")}
            className="flex items-center gap-3 p-4 rounded-lg bg-slate-50 hover:bg-slate-100 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-[#10b981]/10 flex items-center justify-center">
              <FolderKanban className="w-5 h-5 text-[#10b981]" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800">
                空间审核
              </div>
              <div className="text-xs text-slate-500">审核新空间、资源配额</div>
            </div>
          </button>

          <button
            onClick={() => router.push("/admin/content")}
            className="flex items-center gap-3 p-4 rounded-lg bg-slate-50 hover:bg-slate-100 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-[#f59e0b]/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-[#f59e0b]" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-800">
                内容管理
              </div>
              <div className="text-xs text-slate-500">组件审核、文档管理</div>
            </div>
          </button>
        </div>
      </div>

      {/* 最近活动 */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4">最近活动</h2>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-4 p-3 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div className="w-2 h-2 rounded-full bg-[#3182ce]"></div>
              <div className="flex-1">
                <div className="text-sm text-slate-800">
                  用户 admin 创建了新的工作空间 "研发中心"
                </div>
                <div className="text-xs text-slate-400">
                  {index + 1} 小时前
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
