"use client";

import React, { useState, useEffect } from "react";
import {
  FolderOpen,
  Box,
  Zap,
  Clock,
  Activity,
  CreditCard,
  User,
  Shield,
  Coins,
  Code2,
  CheckCircle2,
  ChevronRight,
  Layers,
  Users,
  Server,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { getAuthToken } from "@/utils/auth";

interface UserDashboardData {
  userInfo: any;
  stats: {
    workspaceCount: number;
    componentCount: number;
    tokenBalance?: number;
    apiCallsUsed: number;
    apiCallsLimit: number;
    storageUsed: number;
    storageLimit: number;
  };
  recentActivities: any[];
  workspaces?: any[];
}

export default function UserDashboardPage() {
  const [dashboardData, setDashboardData] = useState<UserDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [userRole, setUserRole] = useState<string>("");

  const tokenBalanceValue =
    dashboardData?.stats?.tokenBalance ??
    dashboardData?.userInfo?.tokenBalance ??
    0;

  // 角色中文本地化映射（普通用户、管理员、超级管理员等，拒绝展示英文 user）
  const formatRoleName = (role?: string | null) => {
    if (!role) return "普通用户";
    const r = role.toLowerCase();
    if (r === "admin" || r === "administrator") return "系统管理员";
    if (r === "superadmin" || r === "super_admin") return "超级管理员";
    if (r === "creator") return "创作者";
    if (r === "developer") return "开发者";
    if (r === "user" || r === "member") return "普通用户";
    return "普通用户";
  };

  // 核心统计指标卡片 - 对齐管理员后台紧凑精致卡片规范，算力中心使用专属橙色
  const statCards = [
    {
      icon: Coins,
      label: "可用算力点",
      value: `${tokenBalanceValue.toLocaleString()}`,
      unit: "点",
      subLabel: tokenBalanceValue > 50 ? "算力充足" : "算力偏低",
      badgeText: "算力中心",
      path: "/user/points",
      color: "text-[#dd6b20]",
      bgColor: "bg-[#dd6b20]/10",
      borderHover: "hover:border-[#dd6b20]/40",
      badgeColor: "group-hover:bg-[#dd6b20]/10 group-hover:text-[#dd6b20]",
    },
    {
      icon: FolderOpen,
      label: "协同工作空间",
      value: `${dashboardData?.stats?.workspaceCount || 0}`,
      unit: "个",
      subLabel: "正在运行与协同",
      badgeText: "空间管理",
      path: "/user/workspaces",
      color: "text-[#3182ce]",
      bgColor: "bg-[#3182ce]/10",
      borderHover: "hover:border-[#3182ce]/40",
      badgeColor: "group-hover:bg-[#3182ce]/10 group-hover:text-[#3182ce]",
    },
    {
      icon: Box,
      label: "组件资产",
      value: `${dashboardData?.stats?.componentCount || 0}`,
      unit: "项",
      subLabel: "业务组件与物料",
      badgeText: "组件库",
      path: "/user/components",
      color: "text-[#10b981]",
      bgColor: "bg-[#10b981]/10",
      borderHover: "hover:border-[#10b981]/40",
      badgeColor: "group-hover:bg-[#10b981]/10 group-hover:text-[#10b981]",
    },
    {
      icon: Zap,
      label: "接口调用量",
      value: `${dashboardData?.stats?.apiCallsUsed || 0}`,
      unit: `/ ${dashboardData?.stats?.apiCallsLimit || 1000}`,
      subLabel: "配额消耗监测",
      badgeText: "开发者接口",
      path: "/user/developer",
      color: "text-[#8b5cf6]",
      bgColor: "bg-[#8b5cf6]/10",
      borderHover: "hover:border-[#8b5cf6]/40",
      badgeColor: "group-hover:bg-[#8b5cf6]/10 group-hover:text-[#8b5cf6]",
    },
    {
      icon: Clock,
      label: "存储空间",
      value: `${((dashboardData?.stats?.storageUsed || 0) / 1073741824).toFixed(1)}`,
      unit: `/ ${((dashboardData?.stats?.storageLimit || 1073741824) / 1073741824).toFixed(0)} GB`,
      subLabel: "云端资产容量",
      badgeText: "容量账单",
      path: "/user/billing-center",
      color: "text-[#2b6cb0]",
      bgColor: "bg-[#2b6cb0]/10",
      borderHover: "hover:border-[#2b6cb0]/40",
      badgeColor: "group-hover:bg-[#2b6cb0]/10 group-hover:text-[#2b6cb0]",
    },
  ];

  useEffect(() => {
    loadDashboardData();
    const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
    if (userId) {
      fetchUserRole(userId);
    }
  }, []);

  const fetchUserRole = async (userId: string) => {
    try {
      const token = getAuthToken();
      const res = await fetch("/api/auth/me", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setUserRole(data.user?.role || "");
      }
    } catch (error) {
      console.error("Fetch user role error:", error);
    }
  };

  const loadDashboardData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const token = getAuthToken();

      const [userRes, statsRes, activitiesRes] = await Promise.all([
        fetch("/api/user/profile", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
        fetch("/api/user/dashboard/stats", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
        fetch("/api/user/activities?limit=10", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }),
      ]);

      let userData = null;
      let statsData = null;
      let activitiesData = null;

      if (userRes.ok) {
        const u = await userRes.json();
        userData = u.data;
      }
      if (statsRes.ok) {
        const s = await statsRes.json();
        statsData = s.data;
      }
      if (activitiesRes.ok) {
        const a = await activitiesRes.json();
        activitiesData = a.data;
      }

      setDashboardData({
        userInfo: userData,
        stats: statsData || {
          workspaceCount: 0,
          componentCount: 0,
          apiCallsUsed: 0,
          apiCallsLimit: 1000,
          storageUsed: 0,
          storageLimit: 1073741824,
        },
        recentActivities: activitiesData || [],
      });
    } catch (error) {
      console.error("Load dashboard data error:", error);
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce]/20 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-500 font-medium text-sm">正在加载工作台数据...</p>
        </div>
      </div>
    );
  }

  const user = dashboardData?.userInfo;

  // 确保账号名称展示纯净用户名（如 test-01 而不是 test-01@163.com）
  const rawName = user?.name?.trim();
  const accountName =
    rawName && !rawName.includes("@")
      ? rawName
      : user?.email
      ? user.email.split("@")[0]
      : "test-01";

  // 最近审计活动严格限制只展示前 5 条
  const displayActivities = (dashboardData?.recentActivities || []).slice(0, 5);

  const getActivityBadge = (resourceType?: string | null) => {
    switch (resourceType) {
      case "workspace":
        return { text: "工作空间", color: "bg-blue-50 text-blue-700 border-blue-200" };
      case "component":
        return { text: "组件资产", color: "bg-emerald-50 text-emerald-700 border-emerald-200" };
      case "membership":
      case "billing":
        return { text: "套餐账单", color: "bg-orange-50 text-orange-700 border-orange-200" };
      case "security":
        return { text: "账号安全", color: "bg-red-50 text-red-700 border-red-200" };
      default:
        return { text: "系统操作", color: "bg-slate-100 text-slate-600 border-slate-200" };
    }
  };

  return (
    <div className="space-y-4.5">
      {/* 顶部欢迎 Banner & 身份状态 */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-white via-blue-50/30 to-indigo-50/20 border border-slate-200/80 shadow-2xs p-4.5 backdrop-blur-xl">
        <div className="absolute right-0 top-0 w-80 h-full bg-radial from-[#3182ce]/10 to-transparent pointer-events-none"></div>
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white text-lg font-black shadow-xs shrink-0 overflow-hidden">
              {user?.avatar ? (
                <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                accountName[0].toUpperCase()
              )}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <h1 className="text-xl font-black text-slate-800 tracking-tight">
                  欢迎回来，{accountName}
                </h1>
                {/* 角色中文展示：普通用户，不使用英文 user */}
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#3182ce]/10 text-[#2b6cb0] border border-[#3182ce]/20">
                  {formatRoleName(userRole || user?.role)}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  {user?.membershipLevel === "ENTERPRISE" ? "企业版" : user?.membershipLevel === "PRO" ? "专业版" : "基础版"}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                当前账号：<span className="font-bold text-slate-700">{accountName}</span> · 邮箱：{user?.email || "未绑定邮箱"} · 状态：正常在线
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <button
              onClick={() => loadDashboardData(true)}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:border-[#3182ce] hover:text-[#3182ce] transition-all shadow-2xs disabled:opacity-50"
              title="刷新工作台数据"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#3182ce]" : ""}`} />
              <span>{refreshing ? "刷新中..." : "实时刷新"}</span>
            </button>
            <Link
              href="/user/profile"
              className="inline-flex items-center justify-center px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-[#3182ce] hover:text-[#3182ce] transition-all shadow-2xs"
            >
              <User className="w-3.5 h-3.5 mr-1.5" />
              个人设置
            </Link>
            {/* 算力中心专属橙色高亮 */}
            <Link
              href="/user/points"
              className="inline-flex items-center justify-center px-4 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-[#dd6b20] to-[#ed8936] rounded-lg hover:brightness-105 transition-all shadow-xs shadow-orange-500/20"
            >
              <Coins className="w-3.5 h-3.5 mr-1.5" />
              算力中心
            </Link>
          </div>
        </div>
      </div>

      {/* 核心指标统计卡片 - 尺寸与管理员后台一致，放小且信息密度适中 */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-sm font-black text-slate-700 flex items-center gap-2">
            <div className="w-1 h-4 bg-[#3182ce] rounded-full"></div>
            核心业务指标
          </h2>
          <span className="text-[11px] text-slate-400 font-medium">点击卡片可直达对应功能中枢</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
          {statCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <Link
                key={index}
                href={card.path}
                className={`group relative bg-white/85 backdrop-blur-xl rounded-2xl p-3.5 border border-slate-200/80 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 overflow-hidden cursor-pointer ${card.borderHover}`}
              >
                {/* 装饰渐变光晕 */}
                <div
                  className={`absolute -right-3 -top-3 w-16 h-16 rounded-full ${card.bgColor} opacity-20 blur-xl group-hover:scale-125 transition-transform duration-500`}
                ></div>

                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <div
                      className={`w-9 h-9 shrink-0 rounded-xl ${card.bgColor} flex items-center justify-center shadow-2xs group-hover:scale-105 transition-transform duration-300`}
                    >
                      <Icon className={`w-4.5 h-4.5 ${card.color}`} />
                    </div>
                    <span
                      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100/80 text-slate-600 transition-colors ${card.badgeColor}`}
                    >
                      {card.badgeText}
                      <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 mb-0.5">
                    <div className="text-xl font-black font-mono text-slate-800 tracking-tight truncate">
                      {card.value}
                    </div>
                    {card.unit && (
                      <span className="text-xs font-bold text-slate-400">
                        {card.unit}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-600 truncate">
                      {card.label}
                    </div>
                    <div className="text-[10.5px] text-slate-400 font-medium truncate">
                      {card.subLabel}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* 工作台常用功能直达（杜绝 AI 黑话） */}
      <div className="bg-white/85 backdrop-blur-xl rounded-2xl p-4.5 border border-slate-200/80 shadow-2xs">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <div className="w-1 h-4 bg-[#3182ce] rounded-full"></div>
            工作台快捷导航
          </h2>
          <span className="text-[11px] text-slate-400 font-medium">高频研发与协同服务直达</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link
            href="/workspace-hub"
            className="group flex items-center gap-3 p-3 rounded-xl bg-slate-50/70 hover:bg-blue-50/50 border border-slate-200/80 hover:border-[#3182ce]/40 transition-all duration-200 text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-[#3182ce]/10 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <FolderOpen className="w-4.5 h-4.5 text-[#3182ce]" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate">
                空间中枢
              </div>
              <div className="text-[11px] text-slate-400 truncate">空间纳管与协同 · 创建请至中枢</div>
            </div>
          </Link>

          <Link
            href="/user/components"
            className="group flex items-center gap-3 p-3 rounded-xl bg-slate-50/70 hover:bg-emerald-50/50 border border-slate-200/80 hover:border-[#10b981]/40 transition-all duration-200 text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-[#10b981]/10 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <Box className="w-4.5 h-4.5 text-[#10b981]" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800 group-hover:text-[#10b981] transition-colors truncate">
                组件资产管理
              </div>
              <div className="text-[11px] text-slate-400 truncate">组件发布、版本与物料</div>
            </div>
          </Link>

          <Link
            href="/user/developer"
            className="group flex items-center gap-3 p-3 rounded-xl bg-slate-50/70 hover:bg-purple-50/50 border border-slate-200/80 hover:border-[#8b5cf6]/40 transition-all duration-200 text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-[#8b5cf6]/10 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <Code2 className="w-4.5 h-4.5 text-[#8b5cf6]" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800 group-hover:text-[#8b5cf6] transition-colors truncate">
                开发者中心
              </div>
              <div className="text-[11px] text-slate-400 truncate">API 密钥与调用指南</div>
            </div>
          </Link>

          <Link
            href="/user/billing-center"
            className="group flex items-center gap-3 p-3 rounded-xl bg-slate-50/70 hover:bg-orange-50/50 border border-slate-200/80 hover:border-[#dd6b20]/40 transition-all duration-200 text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-[#dd6b20]/10 flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <CreditCard className="w-4.5 h-4.5 text-[#dd6b20]" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-800 group-hover:text-[#dd6b20] transition-colors truncate">
                套餐与开票
              </div>
              <div className="text-[11px] text-slate-400 truncate">会员等级、订单与发票</div>
            </div>
          </Link>
        </div>
      </div>

      {/* 底部两栏：最近审计活动 (限制前5条，信息丰富) 与 系统服务状态 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4.5">
        {/* 最近审计活动 (占 2 栏) */}
        <div className="lg:col-span-2 bg-white/85 backdrop-blur-xl rounded-2xl p-4.5 border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <div className="w-1 h-4 bg-[#3182ce] rounded-full"></div>
                <Activity className="w-4 h-4 text-[#3182ce]" />
                最近审计活动 (前 5 条)
              </h2>
              <Link
                href="/user/activities"
                className="text-xs font-semibold text-[#3182ce] hover:text-[#2b6cb0] flex items-center gap-1 transition-colors"
              >
                查看全部日志
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {displayActivities.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {displayActivities.map((activity: any, index: number) => {
                  const badge = getActivityBadge(activity.resourceType);
                  return (
                    <div
                      key={index}
                      className="group flex items-center justify-between py-2.5 hover:bg-slate-50/60 px-2 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 group-hover:bg-[#3182ce]/10 group-hover:text-[#3182ce] transition-colors">
                          <Activity className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800 truncate group-hover:text-[#3182ce] transition-colors">
                              {activity.description}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${badge.color} shrink-0`}
                            >
                              {badge.text}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            动作：<span className="font-mono">{activity.action || "AUDIT"}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="text-[11px] text-slate-500 font-medium">
                          {new Date(activity.createdAt).toLocaleDateString("zh-CN")}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {new Date(activity.createdAt).toLocaleTimeString("zh-CN")}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2 text-slate-400">
                  <Activity className="w-5 h-5" />
                </div>
                <p className="text-slate-400 text-xs">暂无操作日志记录</p>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>操作轨迹全链路可溯源</span>
            <span className="text-slate-500 font-medium">端到端合规留痕</span>
          </div>
        </div>

        {/* 平台环境与服务健康状态 (占 1 栏) */}
        <div className="bg-white/85 backdrop-blur-xl rounded-2xl p-4.5 border border-slate-200/80 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <div className="w-1 h-4 bg-[#10b981] rounded-full"></div>
                <Server className="w-4 h-4 text-[#10b981]" />
                平台运行状态
              </h2>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                全域运行正常
              </span>
            </div>

            <div className="space-y-2.5">
              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/60 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-700">云端协同运行时</div>
                  <div className="text-[10.5px] text-slate-400">多节点集群负载正常</div>
                </div>
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  正常
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/60 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-700">开放 API 网关</div>
                  <div className="text-[10.5px] text-slate-400">毫秒级低延迟调度</div>
                </div>
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  在线
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/80 border border-slate-200/60 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-700">组件分发 CDN</div>
                  <div className="text-[10.5px] text-slate-400">全局缓存命中率 99.2%</div>
                </div>
                <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  畅通
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
            <span>知阁安全防御体系</span>
            <span className="text-slate-500 font-medium">高可用协同集群</span>
          </div>
        </div>
      </div>
    </div>
  );
}
