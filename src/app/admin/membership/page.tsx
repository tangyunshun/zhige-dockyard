"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getAuthToken } from "@/utils/auth";
import { useToast } from "@/components/Toast";
import MembershipNavHeader from "@/components/admin/membership/MembershipNavHeader";
import {
  Crown,
  FileText,
  Users,
  History,
  TrendingUp,
  Award,
  Zap,
  RefreshCw,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Coins,
  ChevronRight,
  UserCheck,
  X,
  CreditCard,
} from "lucide-react";

interface OverviewStats {
  totalUsers: number;
  paidUsers: number;
  freeUsers: number;
  paidRatio: number;
  totalOrders: number;
  paidOrdersCount: number;
  pendingOrdersCount: number;
  totalRevenue: number;
  monthRevenue: number;
  todayRevenue: number;
  activeLevels: number;
  totalLevels: number;
  activeTokenPacks: number;
  totalTokenPacks: number;
  expiringMembersCount: number;
}

interface RecentOrder {
  id: string;
  amount: number;
  status: string;
  paymentMethod: string;
  createdAt: string;
  user?: { id: string; name: string; email: string };
  level?: { id: string; nameZh: string; color: string; icon: string };
}

interface RecentLog {
  id: string;
  changeType: string;
  reason: string;
  createdAt: string;
  user?: { id: string; name: string; email: string };
  operator?: { id: string; name: string };
  level?: { id: string; nameZh: string; color: string; icon: string };
}

interface MembershipLevelOption {
  id: string;
  name: string;
  nameZh: string;
  color?: string;
  icon?: string;
}

export default function AdminMembershipIndex() {
  const router = useRouter();
  const toast = useToast();

  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [recentLogs, setRecentLogs] = useState<RecentLog[]>([]);
  const [levels, setLevels] = useState<MembershipLevelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAllData = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      else setRefreshing(true);

      const authToken = getAuthToken();
      if (!authToken) {
        console.error("未找到登录凭证");
        return;
      }

      // 并行请求统计接口与等级配置
      const [statsRes, levelsRes] = await Promise.all([
        fetch(`/api/admin/membership/stats?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
        fetch(`/api/admin/membership/levels?t=${Date.now()}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        }),
      ]);

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        if (statsData.success && statsData.data) {
          setStats(statsData.data.overview);
          setRecentOrders(statsData.data.recentOrders || []);
          setRecentLogs(statsData.data.recentLogs || []);
        }
      }

      if (levelsRes.ok) {
        const levelsData = await levelsRes.json();
        if (levelsData.data) {
          setLevels(levelsData.data);
        }
      }
    } catch (error) {
      console.error("加载会员全局概览数据失败:", error);
      toast.error("加载数据失败，请检查网络连接");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // 五大核心业务矩阵入口定义
  const menuItems = [
    {
      icon: Crown,
      title: "会员等级管理",
      badge: `${stats?.activeLevels ?? 0} 个在售`,
      description: "配置会员等级阶梯、存储与组件配额限制及定价策略",
      href: "/admin/membership/levels",
      color: "#3182ce",
      accentBg: "bg-blue-50 text-blue-600 border-blue-200",
      gradient: "from-[#3182ce] to-[#2b6cb0]",
      glowColor: "rgba(49, 130, 206, 0.15)",
    },
    {
      icon: Zap,
      title: "Token加油包管理",
      badge: `${stats?.activeTokenPacks ?? 0} 款在架`,
      description: "管理跨空间通用的算力点数包、定价阶梯与折扣优惠",
      href: "/admin/membership/token-packs",
      color: "#eab308",
      accentBg: "bg-amber-50 text-amber-600 border-amber-200",
      gradient: "from-amber-500 to-yellow-600",
      glowColor: "rgba(245, 158, 11, 0.15)",
    },
    {
      icon: FileText,
      title: "会员订单管理",
      badge: `${stats?.totalOrders ?? 0} 笔流水`,
      description: "查看用户前端自主购买的支付流水凭据与对账记录",
      href: "/admin/membership/orders",
      color: "#10b981",
      accentBg: "bg-emerald-50 text-emerald-600 border-emerald-200",
      gradient: "from-emerald-500 to-emerald-600",
      glowColor: "rgba(16, 185, 129, 0.15)",
    },
    {
      icon: Users,
      title: "会员用户管理",
      badge: `${stats?.paidUsers ?? 0} 位付费`,
      description: "用户会员等级状态追踪、有效期续展及专属权益调控",
      href: "/admin/membership/users",
      color: "#6366f1",
      accentBg: "bg-indigo-50 text-indigo-600 border-indigo-200",
      gradient: "from-indigo-500 to-indigo-600",
      glowColor: "rgba(99, 102, 241, 0.15)",
    },
    {
      icon: History,
      title: "会员变更日志",
      badge: "安全审计",
      description: "全生命周期等级变动追踪、操作责任人与调整前后对比",
      href: "/admin/membership/logs",
      color: "#8b5cf6",
      accentBg: "bg-purple-50 text-purple-600 border-purple-200",
      gradient: "from-purple-500 to-purple-600",
      glowColor: "rgba(139, 92, 246, 0.15)",
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* 顶部统一面包屑与横向导航 */}
      <MembershipNavHeader
        title="会员管理中枢"
        subtitle="全局掌控商业化营收表现、会员等级配额与算力点数包运营"
      >
        <button
          type="button"
          onClick={() => loadAllData(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/90 hover:bg-white text-slate-600 hover:text-slate-800 rounded-lg text-xs font-bold border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all cursor-pointer"
          title="刷新全盘数据"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#3182ce]" : ""}`} />
          <span>刷新数据</span>
        </button>
      </MembershipNavHeader>

      {/* 核心商业统计看板（4 列响应式网格） */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white/70 backdrop-blur-md rounded-2xl border border-white/90 p-5 shadow-2xs animate-pulse"
            >
              <div className="h-10 w-10 bg-slate-200 rounded-xl mb-3" />
              <div className="h-4 w-24 bg-slate-200 rounded mb-2" />
              <div className="h-7 w-32 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 指标 1：累计商业总营收 */}
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 p-5 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-[#3182ce]/10 opacity-30 blur-2xl group-hover:scale-125 transition-transform" />
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-[#3182ce] text-white flex items-center justify-center shadow-xs">
                <span className="text-lg font-black leading-none">¥</span>
              </div>
              <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-full">
                本月 ¥{stats?.monthRevenue?.toLocaleString() || 0}
              </span>
            </div>
            <div className="text-xs font-bold text-slate-500 mb-1">累计商业总营收</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 tracking-tight">
                ¥{stats?.totalRevenue?.toLocaleString() || 0}
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                (今日 +¥{stats?.todayRevenue || 0})
              </span>
            </div>
          </div>

          {/* 指标 2：付费会员规模 */}
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 p-5 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-indigo-500/10 opacity-30 blur-2xl group-hover:scale-125 transition-transform" />
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center shadow-xs">
                <Crown className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2 py-0.5 rounded-full">
                付费率 {stats?.paidRatio || 0}%
              </span>
            </div>
            <div className="text-xs font-bold text-slate-500 mb-1">付费会员总数</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 tracking-tight">
                {stats?.paidUsers || 0}
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                / {stats?.totalUsers || 0} 全站注册
              </span>
            </div>
          </div>

          {/* 指标 3：订单总流水量 */}
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 p-5 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-emerald-500/10 opacity-30 blur-2xl group-hover:scale-125 transition-transform" />
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 text-white flex items-center justify-center shadow-xs">
                <FileText className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-full">
                成功率 {stats?.totalOrders ? Math.round(((stats.paidOrdersCount || 0) / stats.totalOrders) * 100) : 100}%
              </span>
            </div>
            <div className="text-xs font-bold text-slate-500 mb-1">订单累计总量</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 tracking-tight">
                {stats?.totalOrders || 0}
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                ({stats?.paidOrdersCount || 0} 笔已完成)
              </span>
            </div>
          </div>

          {/* 指标 4：商品与加油包上架矩阵 */}
          <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl border border-white/90 p-5 shadow-2xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 overflow-hidden group">
            <div className="absolute -right-4 -top-4 w-24 h-24 rounded-full bg-amber-500/10 opacity-30 blur-2xl group-hover:scale-125 transition-transform" />
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 text-white flex items-center justify-center shadow-xs">
                <Zap className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full">
                {stats?.activeLevels || 0} 级 / {stats?.activeTokenPacks || 0} 包
              </span>
            </div>
            <div className="text-xs font-bold text-slate-500 mb-1">在售商业化规格</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 tracking-tight">
                {(stats?.activeLevels || 0) + (stats?.activeTokenPacks || 0)}
              </span>
              <span className="text-[11px] text-slate-400 font-medium">
                个在售规格已就绪
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 五大核心功能中枢导航网格（包含补全的 Token 加油包管理） */}
      <div>
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-4 rounded-full bg-[#3182ce]" />
            <h2 className="text-sm font-black text-slate-800">业务管理中枢导航</h2>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            全链路闭环商业运维与审计矩阵
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className="group relative bg-white rounded-2xl border border-slate-200/90 p-5 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-[#3182ce]/40 flex flex-col justify-between cursor-pointer"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className={`w-11 h-11 rounded-xl bg-gradient-to-br ${item.gradient} text-white flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform duration-300`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.accentBg}`}
                    >
                      {item.badge}
                    </span>
                  </div>
                  <h3 className="text-sm font-black text-slate-800 mb-1.5 group-hover:text-[#3182ce] transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">
                    {item.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-[#3182ce]">
                  <span>进入管理</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 运营态势 & 近期会员活动双列看板 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 左侧：最新订单交易流水 */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 rounded-full bg-emerald-500" />
              <h3 className="text-sm font-black text-slate-800">最新会员交易流水</h3>
            </div>
            <Link
              href="/admin/membership/orders"
              className="text-xs font-bold text-[#3182ce] hover:underline flex items-center gap-1"
            >
              <span>查看全部订单</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              暂无最新订单交易记录
            </div>
          ) : (
            <div className="space-y-2.5 flex-1">
              {recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80 hover:bg-blue-50/40 border border-slate-200/70 transition-colors text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 font-black">
                      ¥
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800 truncate">
                          {order.user?.name || order.user?.email || "用户"}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-700 shrink-0">
                          {order.level?.nameZh || "会员"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(order.createdAt).toLocaleString("zh-CN", { hour12: false })} · {order.paymentMethod}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-black text-slate-900">
                      ¥{order.amount.toFixed(2)}
                    </div>
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                      已完成
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右侧：会员等级变更与到期预警 */}
        <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 rounded-full bg-purple-500" />
              <h3 className="text-sm font-black text-slate-800">最新等级变更审计</h3>
            </div>
            <Link
              href="/admin/membership/logs"
              className="text-xs font-bold text-[#3182ce] hover:underline flex items-center gap-1"
            >
              <span>查看全部审计</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* 预警指示卡（若有即将到期会员） */}
          {stats && stats.expiringMembersCount > 0 && (
            <div className="mb-3 p-3 rounded-xl bg-amber-50/90 border border-amber-200/80 flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  有 <strong>{stats.expiringMembersCount}</strong> 位付费会员将在 7 天内到期
                </span>
              </div>
              <Link
                href="/admin/membership/users"
                className="font-bold text-amber-700 hover:text-amber-900 underline"
              >
                前往延期
              </Link>
            </div>
          )}

          {recentLogs.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              暂无最新会员变更日志
            </div>
          ) : (
            <div className="space-y-2.5 flex-1">
              {recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-50/80 hover:bg-purple-50/40 border border-slate-200/70 transition-colors text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                      <History className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-800 truncate">
                          {log.user?.name || log.user?.email || "用户"}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-700 shrink-0">
                          {log.level?.nameZh || "等级调整"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[240px]">
                        理由: {log.reason}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(log.createdAt).toLocaleDateString("zh-CN")}
                    </span>
                    <div className="text-[11px] text-slate-500 font-medium">
                      操作人: {log.operator?.name || "系统"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
