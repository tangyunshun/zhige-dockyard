"use client";

import React, { useState, useEffect } from "react";
import {
  FolderOpen,
  Box,
  Zap,
  Clock,
  Activity,
  CreditCard,
} from "lucide-react";

interface UserDashboardData {
  userInfo: any;
  stats: {
    workspaceCount: number;
    componentCount: number;
    apiCallsUsed: number;
    apiCallsLimit: number;
    storageUsed: number;
    storageLimit: number;
  };
  recentActivities: any[];
}

export default function UserDashboardPage() {
  const [dashboardData, setDashboardData] = useState<UserDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("");

  const statCards = [
    {
      icon: FolderOpen,
      label: "工作空间",
      value: dashboardData?.stats?.workspaceCount || 0,
      change: "+12%",
      trend: "up" as const,
      color: "text-[#3182ce]",
      bgColor: "bg-[#3182ce]/10",
    },
    {
      icon: Box,
      label: "组件数量",
      value: dashboardData?.stats?.componentCount || 0,
      change: "+8%",
      trend: "up" as const,
      color: "text-[#10b981]",
      bgColor: "bg-[#10b981]/10",
    },
    {
      icon: Zap,
      label: "API 调用",
      value: `${dashboardData?.stats?.apiCallsUsed || 0} / ${dashboardData?.stats?.apiCallsLimit || 1000}`,
      change: "+25%",
      trend: "up" as const,
      color: "text-[#f59e0b]",
      bgColor: "bg-[#f59e0b]/10",
    },
    {
      icon: Clock,
      label: "存储空间",
      value: `${((dashboardData?.stats?.storageUsed || 0) / 1073741824).toFixed(1)} / ${((dashboardData?.stats?.storageLimit || 1073741824) / 1073741824).toFixed(0)} GB`,
      change: "-3%",
      trend: "down" as const,
      color: "text-[#8b5cf6]",
      bgColor: "bg-[#8b5cf6]/10",
    },
  ];

  useEffect(() => {
    loadDashboardData();
    // 获取用户角色
    const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
    if (userId) {
      fetchUserRole(userId);
    }
  }, []);

  const fetchUserRole = async (userId: string) => {
    try {
      const res = await fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${userId}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUserRole(data.user?.role || "");
      }
    } catch (error) {
      console.error("Fetch user role error:", error);
    }
  };

  const loadDashboardData = async () => {
    try {
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const [userRes, statsRes, activitiesRes] = await Promise.all([
        fetch("/api/user/profile", {
          headers: { Authorization: `Bearer ${userId}` },
        }),
        fetch("/api/user/dashboard/stats", {
          headers: { Authorization: `Bearer ${userId}` },
        }),
        fetch("/api/user/activities?limit=5", {
          headers: { Authorization: `Bearer ${userId}` },
        }),
      ]);

      if (userRes.ok && statsRes.ok && activitiesRes.ok) {
        const userData = await userRes.json();
        const statsData = await statsRes.json();
        const activitiesData = await activitiesRes.json();

        setDashboardData({
          userInfo: userData.data,
          stats: statsData.data,
          recentActivities: activitiesData.data,
        });
      }
    } catch (error) {
      console.error("Load dashboard data error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">加载数据中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="shrink-0">
        <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight truncate">
          个人工作台
        </h1>
        <p className="text-sm text-slate-500 font-medium truncate">
          数据概览、快捷操作、最近活动
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div
              key={index}
              className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden min-w-0"
            >
              {/* 装饰背景 */}
              <div
                className={`absolute -right-4 -top-4 w-24 h-24 rounded-full ${card.bgColor} opacity-20 blur-2xl`}
              ></div>

              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div
                    className={`w-14 h-14 shrink-0 rounded-xl ${card.bgColor} flex items-center justify-center shadow-sm`}
                  >
                    <Icon className={`w-7 h-7 ${card.color}`} />
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center px-2.5 py-1 rounded-full text-xs font-bold ${card.trend === "up" ? "text-[#10b981] bg-[#10b981]/10" : "text-red-500 bg-red-500/10"}`}
                  >
                    {card.trend === "up" ? "↑" : "↓"} {card.change}
                  </span>
                </div>
                <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight truncate">
                  {card.value}
                </div>
                <div className="text-sm text-slate-500 font-semibold truncate">
                  {card.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 快捷操作区 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden shrink-0">
        {/* 装饰背景 */}
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#8b5cf6]/10 opacity-50 blur-3xl"></div>

        <div className="relative">
          <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-[#3182ce] to-[#8b5cf6] rounded-full"></div>
            快捷入口
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => (window.location.href = "/workspace-hub")}
              className="group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white hover:from-[#3182ce]/5 hover:to-[#2563eb]/5 border border-slate-200 hover:border-[#3182ce]/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-[#3182ce]/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <FolderOpen className="w-6 h-6 text-[#3182ce]" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                  工作空间中心
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  创建/管理工作空间
                </div>
              </div>
            </button>

            {/* 组件库/工作室入口 - 根据角色显示不同功能 */}
            {(userRole === "DEVELOPER" || userRole === "ADMIN") ? (
              <button
                onClick={() => (window.location.href = "/studio")}
                className="group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white hover:from-[#10b981]/5 hover:to-[#059669]/5 border border-slate-200 hover:border-[#10b981]/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-[#10b981]/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Box className="w-6 h-6 text-[#10b981]" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800 group-hover:text-[#10b981] transition-colors">
                    组件开发工作室
                  </div>
                  <div className="text-xs text-slate-500 font-medium">
                    开发/调试新组件
                  </div>
                </div>
              </button>
            ) : (
              <button
                onClick={() => (window.location.href = "/components")}
                className="group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white hover:from-[#10b981]/5 hover:to-[#059669]/5 border border-slate-200 hover:border-[#10b981]/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-[#10b981]/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Box className="w-6 h-6 text-[#10b981]" />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800 group-hover:text-[#10b981] transition-colors">
                    组件库
                  </div>
                  <div className="text-xs text-slate-500 font-medium">
                    浏览/使用公共组件
                  </div>
                </div>
              </button>
            )}

            <button
              onClick={() => (window.location.href = "/user/membership")}
              className="group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white hover:from-[#f59e0b]/5 hover:to-[#d97706]/5 border border-slate-200 hover:border-[#f59e0b]/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-[#f59e0b]/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <CreditCard className="w-6 h-6 text-[#f59e0b]" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800 group-hover:text-[#f59e0b] transition-colors">
                  会员中心
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  查看配额/升级会员
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* 最近活动 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden shrink-0">
        {/* 装饰背景 */}
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#2563eb]/10 opacity-50 blur-3xl"></div>

        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <div className="w-1 h-6 bg-gradient-to-b from-[#3182ce] to-[#2563eb] rounded-full"></div>
              <Activity className="w-5 h-5 text-[#3182ce]" />
              最近活动
            </h2>
          </div>
          {dashboardData?.recentActivities && dashboardData.recentActivities.length > 0 ? (
            <div className="space-y-2">
              {dashboardData.recentActivities.map((activity: any, index: number) => (
                <div
                  key={index}
                  className="group flex items-center gap-3 p-3 rounded-xl hover:bg-white/60 transition-all duration-300 hover:-translate-x-1"
                >
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:scale-110 transition-transform duration-300">
                    <Activity className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-800 truncate group-hover:text-[#3182ce] transition-colors">
                      {activity.description}
                    </div>
                    <div className="text-xs text-slate-400 font-medium">
                      {new Date(activity.createdAt).toLocaleString("zh-CN")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                <Activity className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-slate-500 font-medium text-sm">暂无活动记录</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
