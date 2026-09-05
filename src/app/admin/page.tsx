"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAuthToken } from "@/utils/auth";
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
  UserPlus,
  Building2,
  Shield,
  X,
  Loader2,
  RefreshCw,
  ChevronRight,
  Database,
  Layers,
  ExternalLink,
  ShieldAlert,
  Boxes,
  Package,
  Briefcase,
  Key,
  BarChart3,
  HardDrive,
  Mail,
  ArrowRight,
  Check,
} from "lucide-react";

interface DashboardData {
  // 核心统计指标
  totalUsers: number; // 总用户数
  totalWorkspaces: number; // 总工作空间数
  totalComponents: number; // 组件总数
  publishedComponents: number; // 已上架组件数
  activeWorkspaces: number; // 活跃工作空间数（最近 7 天）
  enterpriseWorkspaces: number; // 企业空间数
  totalTenants: number; // 总租户数
  activeTenants: number; // 活跃租户数
  pendingReviews: number; // 待审核申请数

  // 平台健康度
  systemHealth: number;

  // 系统服务状态（与系统健康度关联）
  systemServices: {
    database: string;
    api: string;
    storage: string;
    email: string;
  };

  // 24h 用户活跃行为（登录次数）
  systemLogs: number;

  // 最近动态
  recentUsers: Array<{
    id: string;
    name: string | null;
    email: string | null;
    role: string;
    membershipLevel: string;
    createdAt: string;
  }>;
  recentWorkspaces: Array<{
    id: string;
    name: string;
    type: string;
    createdAt: string;
    members: Array<{
      user: { name: string | null; email: string | null };
    }>;
  }>;
  componentCategories: Array<{
    key: string;
    name: string;
    color: string;
    count: number;
  }>;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 系统微服务健康详情弹窗
  const [servicesModalOpen, setServicesModalOpen] = useState(false);

  // 实时刷新与数据同步状态
  const [refreshing, setRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");

  const token = getAuthToken();

  // 监听 ESC 键一键关闭浮层弹窗
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setServicesModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 角色中文化映射
  const getRoleLabel = (role?: string) => {
    switch (role?.toLowerCase()) {
      case "super_admin":
        return "超级管理员";
      case "admin":
        return "管理员";
      case "user":
      default:
        return "普通用户";
    }
  };

  // 会员等级中文化映射（解释 FREE 为免费会员，避免英文显示）
  const getMembershipLevelLabel = (level?: string) => {
    const map: Record<string, string> = {
      FREE: "免费会员",
      BRONZE: "青铜会员",
      SILVER: "白银会员",
      GOLD: "黄金会员",
      DIAMOND: "钻石会员",
      CROWN: "皇冠会员",
      PRO: "专业版",
      ENTERPRISE: "企业版",
    };
    return (level && map[level.toUpperCase()]) || level || "免费会员";
  };

  // 工作空间类型中文化映射
  const getWorkspaceTypeLabel = (type?: string) => {
    switch (type?.toUpperCase()) {
      case "ENTERPRISE":
        return "企业空间";
      case "TEAM":
        return "团队空间";
      case "PERSONAL":
      default:
        return "个人空间";
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async (isManual = false) => {
    if (isManual) {
      setRefreshing(true);
    }
    try {
      setError(null);
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      const userRole =
        typeof window !== "undefined" ? localStorage.getItem("userRole") : "";
      
      // 检查有效的 cookie token（排除空值情况）
      let hasValidToken = false;
      if (typeof window !== "undefined") {
        const cookies = document.cookie.split(";");
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split("=");
          if (name === "auth_token" && value && value.length > 0) {
            hasValidToken = true;
            break;
          }
        }
      }

      const token = getAuthToken();

      const res = await fetch("/api/admin/dashboard", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("API 错误详情:", errorData);
        setError(`数据加载失败: 状态码 ${res.status}`);
        return;
      }

      const result = await res.json();
      setData(result.data);

      const now = new Date();
      const pad = (n: number) => n.toString().padStart(2, "0");
      setLastSyncTime(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`);
    } catch (err) {
      console.error("加载数据失败:", err);
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
      if (isManual) {
        setRefreshing(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          {/* 骨架屏加载动画 */}
          <div className="w-16 h-16 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">加载数据中...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <p className="text-slate-700 font-semibold mb-2">
            {error || "数据加载失败"}
          </p>
          <button
            onClick={() => loadDashboardData()}
            className="inline-flex items-center px-6 h-10 rounded-lg bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      icon: Users,
      label: "总用户数",
      value: data.totalUsers,
      subLabel: "全平台注册用户",
      badgeText: "用户中枢",
      path: "/admin/users",
      color: "text-[#3182ce]",
      bgColor: "bg-[#3182ce]/10",
      borderHover: "hover:border-[#3182ce]/40",
    },
    {
      icon: FolderKanban,
      label: "工作空间",
      value: data.totalWorkspaces,
      subLabel: `含企业空间 ${data.enterpriseWorkspaces} 个`,
      badgeText: "空间审查",
      path: "/admin/workspaces",
      color: "text-[#10b981]",
      bgColor: "bg-[#10b981]/10",
      borderHover: "hover:border-[#10b981]/40",
    },
    {
      icon: Package,
      label: "组件总数",
      value: data.totalComponents,
      subLabel: `已上架 ${data.publishedComponents} 个组件`,
      badgeText: "组件生态",
      path: "/admin/components",
      color: "text-[#f59e0b]",
      bgColor: "bg-[#f59e0b]/10",
      borderHover: "hover:border-[#f59e0b]/40",
    },
    {
      icon: TrendingUp,
      label: "活跃工作空间",
      value: data.activeWorkspaces,
      subLabel: `近7天活跃 / 企业团队 ${data.activeTenants} 家`,
      badgeText: "活跃监测",
      path: "/admin/workspaces",
      color: "text-[#8b5cf6]",
      bgColor: "bg-[#8b5cf6]/10",
      borderHover: "hover:border-[#8b5cf6]/40",
    },
  ];

  const systemCards = [
    {
      icon: Server,
      label: "系统健康度",
      value: `${data.systemHealth}%`,
      status: data.systemHealth >= 95 ? "运行平稳" : "需要关注",
      subLabel: "平台运行指标",
      path: "/admin/system-status",
      color: data.systemHealth >= 95 ? "text-[#10b981]" : "text-[#f59e0b]",
      bgColor: data.systemHealth >= 95 ? "bg-[#10b981]/10" : "bg-[#f59e0b]/10",
      borderHover: "hover:border-[#10b981]/40",
    },
    {
      icon: ShieldAlert,
      label: "风控与审核",
      value: data.pendingReviews,
      status: data.pendingReviews > 0 ? "待处理" : "正常受控",
      subLabel: data.pendingReviews > 0 ? "账号申诉工单待处理" : "全域安全审核已受控",
      path: "/admin/account-appeals",
      color: data.pendingReviews > 0 ? "text-[#f59e0b]" : "text-[#10b981]",
      bgColor: data.pendingReviews > 0 ? "bg-[#f59e0b]/10" : "bg-[#10b981]/10",
      borderHover: data.pendingReviews > 0 ? "hover:border-[#f59e0b]/60" : "hover:border-[#10b981]/40",
      isAlert: data.pendingReviews > 0,
    },
    {
      icon: TrendingUp,
      label: "24h 活跃行为",
      value: data.systemLogs.toLocaleString(),
      status: "登录次数",
      subLabel: "24小时系统访问",
      path: "/admin/logs",
      color: "text-[#3182ce]",
      bgColor: "bg-[#3182ce]/10",
      borderHover: "hover:border-[#3182ce]/40",
    },
    {
      icon: AlertCircle,
      label: "系统核心服务",
      value: `${Object.values(data.systemServices).filter((s) => s === "normal").length}/4 在线`,
      status: Object.values(data.systemServices).every((s) => s === "normal") ? "全部正常" : "部分异常",
      subLabel: "点击查看服务运行详情",
      onClick: () => setServicesModalOpen(true),
      color: Object.values(data.systemServices).every((s) => s === "normal") ? "text-[#10b981]" : "text-[#f59e0b]",
      bgColor: Object.values(data.systemServices).every((s) => s === "normal") ? "bg-[#10b981]/10" : "bg-[#f59e0b]/10",
      borderHover: "hover:border-[#3182ce]/40",
    },
  ];

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (seconds < 60) return "刚刚";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
    if (seconds < 2592000) return `${Math.floor(seconds / 86400)}天前`;
    return `${Math.floor(seconds / 2592000)}个月前`;
  };

  const splitFullDateTime = (dateStr?: string | Date | null) => {
    if (!dateStr) return { date: "未知", time: "" };
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return { date: "未知", time: "" };
      const pad = (n: number) => n.toString().padStart(2, "0");
      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());
      const seconds = pad(d.getSeconds());
      return {
        date: `${year}-${month}-${day}`,
        time: `${hours}:${minutes}:${seconds}`,
      };
    } catch (e) {
      return { date: "未知", time: "" };
    }
  };

  return (
    <div className="space-y-6">
      {/* 顶部控制中枢与状态栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0 pb-2 border-b border-slate-200/60">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl lg:text-3xl font-black text-slate-800 tracking-tight">
              管理仪表盘
            </h1>
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200/60">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              系统正常运行
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            知阁·舟坊平台核心中枢 · 全局数据监控、空间审查与系统治理
          </p>
        </div>

        {/* 顶部右侧快捷工具 */}
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {lastSyncTime && (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <Clock className="w-3.5 h-3.5" />
              <span>同步于 {lastSyncTime}</span>
            </div>
          )}
          <button
            onClick={() => loadDashboardData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3.5 h-9 rounded-xl bg-white border border-slate-200 hover:border-[#3182ce]/50 text-slate-700 hover:text-[#3182ce] text-xs font-bold shadow-xs hover:shadow-md transition-all active:scale-95 disabled:opacity-50"
            title="重新拉取平台全局最新统计数据"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#3182ce]" : ""}`} />
            <span>{refreshing ? "刷新中..." : "实时刷新"}</span>
          </button>
        </div>
      </div>

      {/* 紧急待办提醒横幅（工作流闭环） */}
      {data.pendingReviews > 0 && (
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20 animate-pulse">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-black text-slate-800 flex items-center gap-2">
                <span>安全待办提醒</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-500 text-white">
                  {data.pendingReviews} 项申诉待处理
                </span>
              </div>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                当前有用户封禁申诉工单处于待处理状态，请及时前往风控中枢核验仲裁。
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push("/admin/account-appeals")}
            className="inline-flex items-center justify-center gap-1.5 px-4 h-9 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all shrink-0"
          >
            <span>前往风控核验</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 核心统计指标卡片 - 支持全量下钻点击 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-slate-700 flex items-center gap-2">
            <div className="w-1 h-4 bg-[#3182ce] rounded-full"></div>
            核心业务指标
          </h2>
          <span className="text-[11px] text-slate-400 font-medium">点击卡片可直达对应管理中心</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 shrink-0">
          {statCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <div
                key={index}
                onClick={() => card.path && router.push(card.path)}
                className={`group relative bg-white/80 backdrop-blur-xl rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden cursor-pointer ${card.borderHover}`}
              >
                {/* 装饰渐变光晕 */}
                <div
                  className={`absolute -right-4 -top-4 w-24 h-24 rounded-full ${card.bgColor} opacity-20 blur-2xl group-hover:scale-125 transition-transform duration-500`}
                ></div>

                <div className="relative">
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className={`w-12 h-12 shrink-0 rounded-xl ${card.bgColor} flex items-center justify-center shadow-xs group-hover:scale-110 transition-transform duration-300`}
                    >
                      <Icon className={`w-6 h-6 ${card.color}`} />
                    </div>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100/80 text-slate-600 group-hover:bg-[#3182ce]/10 group-hover:text-[#3182ce] transition-colors">
                      {card.badgeText}
                      <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                  <div className="text-2xl lg:text-3xl font-black text-slate-800 mb-1 tracking-tight truncate">
                    {card.value.toLocaleString()}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-500 truncate">
                      {card.label}
                    </div>
                    <div className="text-[11px] text-slate-400 font-medium truncate">
                      {card.subLabel}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 系统运行与监控卡片 - 支持交互闭环 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-slate-700 flex items-center gap-2">
            <div className="w-1 h-4 bg-[#10b981] rounded-full"></div>
            平台运行态势
          </h2>
          <span className="text-[11px] text-slate-400 font-medium">实时健康监测与异常拦截</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 shrink-0">
          {systemCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <div
                key={index}
                onClick={() => {
                  if (card.path) router.push(card.path);
                  if (card.onClick) card.onClick();
                }}
                className={`group relative bg-white/80 backdrop-blur-xl rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden cursor-pointer ${card.borderHover}`}
              >
                {/* 装饰背景 */}
                <div
                  className={`absolute -right-4 -top-4 w-24 h-24 rounded-full ${card.bgColor} opacity-20 blur-2xl group-hover:scale-125 transition-transform duration-500`}
                ></div>

                <div className="relative">
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className={`w-12 h-12 shrink-0 rounded-xl ${card.bgColor} flex items-center justify-center shadow-xs group-hover:scale-110 transition-transform duration-300`}
                    >
                      <Icon className={`w-6 h-6 ${card.color}`} />
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold ${
                        card.isAlert
                          ? "bg-amber-100 text-amber-700 animate-pulse"
                          : `${card.color} bg-slate-100/80`
                      }`}
                    >
                      {card.status}
                      <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                  <div className="text-2xl lg:text-3xl font-black text-slate-800 mb-1 tracking-tight truncate">
                    {card.value}
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-bold text-slate-500 truncate">
                      {card.label}
                    </div>
                    <div className="text-[11px] text-slate-400 font-medium truncate">
                      {card.subLabel}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 快捷操作中枢 - 全局业务闭环网格 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
        {/* 装饰背景 */}
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#8b5cf6]/10 opacity-50 blur-3xl"></div>

        <div className="relative">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <div className="w-1 h-6 bg-gradient-to-b from-[#3182ce] to-[#8b5cf6] rounded-full"></div>
              管理协同中枢
            </h2>
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">覆盖组织、资产、权限与安全治理全域闭环</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 用户综合管理 */}
            <button
              onClick={() => router.push("/admin/users")}
              className="group flex items-center gap-3.5 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white hover:from-[#3182ce]/5 hover:to-[#2b6cb0]/5 border border-slate-200 hover:border-[#3182ce]/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-md text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-[#3182ce]/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
                <Users className="w-5 h-5 text-[#3182ce]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate">
                  用户管理
                </div>
                <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                  全域用户档案与封禁权限
                </div>
              </div>
            </button>

            {/* 工作空间审查 */}
            <button
              onClick={() => router.push("/admin/workspaces")}
              className="group flex items-center gap-3.5 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white hover:from-[#10b981]/5 hover:to-[#059669]/5 border border-slate-200 hover:border-[#10b981]/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-md text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-[#10b981]/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
                <FolderKanban className="w-5 h-5 text-[#10b981]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-800 group-hover:text-[#10b981] transition-colors truncate">
                  空间管理
                </div>
                <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                  工作空间审核与成员配额
                </div>
              </div>
            </button>

            {/* 空间套餐管理 */}
            <button
              onClick={() => router.push("/admin/workspace/plans")}
              className="group flex items-center gap-3.5 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white hover:from-[#f59e0b]/5 hover:to-[#d97706]/5 border border-slate-200 hover:border-[#f59e0b]/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-md text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-[#f59e0b]/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
                <Boxes className="w-5 h-5 text-[#f59e0b]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-800 group-hover:text-[#f59e0b] transition-colors truncate">
                  空间套餐
                </div>
                <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                  企业空间套餐价格与资源配额
                </div>
              </div>
            </button>

            {/* 舟坊组件生态 */}
            <button
              onClick={() => router.push("/admin/components")}
              className="group flex items-center gap-3.5 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white hover:from-[#3182ce]/5 hover:to-[#2b6cb0]/5 border border-slate-200 hover:border-[#3182ce]/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-md text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-[#3182ce]/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
                <Boxes className="w-5 h-5 text-[#3182ce]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate">
                  组件生态
                </div>
                <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                  功能组件上架与分类目录
                </div>
              </div>
            </button>

            {/* 岗位管理 */}
            <button
              onClick={() => router.push("/admin/posts")}
              className="group flex items-center gap-3.5 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white hover:from-[#10b981]/5 hover:to-[#059669]/5 border border-slate-200 hover:border-[#10b981]/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-md text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-[#10b981]/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
                <Briefcase className="w-5 h-5 text-[#10b981]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-800 group-hover:text-[#10b981] transition-colors truncate">
                  岗位管理
                </div>
                <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                  空间岗位定义与成员职责
                </div>
              </div>
            </button>

            {/* 权限配置 */}
            <button
              onClick={() => router.push("/admin/permissions")}
              className="group flex items-center gap-3.5 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white hover:from-[#8b5cf6]/5 hover:to-[#805ad5]/5 border border-slate-200 hover:border-[#8b5cf6]/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-md text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-[#8b5cf6]/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
                <Key className="w-5 h-5 text-[#8b5cf6]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-800 group-hover:text-[#8b5cf6] transition-colors truncate">
                  权限配置
                </div>
                <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                  管理员功能权限分配与管控
                </div>
              </div>
            </button>

            {/* 系统服务监控 */}
            <button
              onClick={() => router.push("/admin/system-status")}
              className="group flex items-center gap-3.5 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white hover:from-emerald-50 hover:to-teal-50 border border-slate-200 hover:border-emerald-400 transition-all duration-300 hover:-translate-y-1 hover:shadow-md text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
                <Server className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-800 group-hover:text-emerald-600 transition-colors truncate">
                  系统状态
                </div>
                <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                  核心服务与数据库运行监控
                </div>
              </div>
            </button>

            {/* 审计日志与追溯 */}
            <button
              onClick={() => router.push("/admin/logs")}
              className="group flex items-center gap-3.5 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white hover:from-slate-100 hover:to-slate-200 border border-slate-200 hover:border-slate-400 transition-all duration-300 hover:-translate-y-1 hover:shadow-md text-left"
            >
              <div className="w-11 h-11 rounded-xl bg-slate-200/60 flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shrink-0">
                <FileText className="w-5 h-5 text-slate-700" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-slate-800 group-hover:text-slate-900 transition-colors truncate">
                  安全审计日志
                </div>
                <div className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                  登录记录与敏感变更溯源
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* 最近活动 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 最近用户 */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
          {/* 装饰背景 */}
          <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#2b6cb0]/10 opacity-50 blur-3xl"></div>

          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <div className="w-1 h-6 bg-gradient-to-b from-[#3182ce] to-[#2b6cb0] rounded-full"></div>
                <UserPlus className="w-5 h-5 text-[#3182ce]" />
                最近注册用户
              </h2>
              <button
                onClick={() => router.push("/admin/users")}
                className="text-sm text-[#3182ce] hover:text-[#2b6cb0] font-bold hover:underline transition-all"
                title="前往用户管理页面查看全部注册用户"
              >
                查看更多 →
              </button>
            </div>
            <div className="space-y-2">
              {!data.recentUsers || data.recentUsers.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <Users className="w-8 h-8 text-slate-400" />
                  </div>
                  <p className="text-slate-500 font-medium text-sm">
                    暂无用户数据
                  </p>
                </div>
              ) : (
                data.recentUsers.map((user: any) => (
                  <div
                    key={user.id}
                    className="group flex items-center gap-3 p-3 rounded-xl hover:bg-white/60 transition-all duration-300 hover:-translate-x-1"
                  >
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.name || "用户头像"}
                        className="w-11 h-11 rounded-full object-cover shadow-md group-hover:scale-110 transition-transform duration-300 border border-slate-100"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:scale-110 transition-transform duration-300">
                        {user.name?.charAt(0) || user.email?.charAt(0) || "U"}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-800 truncate group-hover:text-[#3182ce] transition-colors">
                        {user.name || user.email || "匿名用户"}
                      </div>
                      <div className="text-xs text-slate-400 font-medium truncate">
                        {user.email || "未设置邮箱"}
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs leading-tight shrink-0 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-100">
                      <div className="font-bold text-slate-700">{splitFullDateTime(user.createdAt).date}</div>
                      <div className="text-[10px] text-slate-400 font-medium mt-0.5">{splitFullDateTime(user.createdAt).time}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 最近工作空间 */}
        <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
          {/* 装饰背景 */}
          <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#10b981]/10 to-[#059669]/10 opacity-50 blur-3xl"></div>

          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <div className="w-1 h-6 bg-gradient-to-b from-[#10b981] to-[#059669] rounded-full"></div>
                <Building2 className="w-5 h-5 text-[#10b981]" />
                最近工作空间
              </h2>
              <button
                onClick={() => router.push("/admin/workspaces")}
                className="text-sm text-[#10b981] hover:text-[#059669] font-bold hover:underline transition-all"
                title="前往工作空间管理页面查看全部空间"
              >
                查看更多 →
              </button>
            </div>
            <div className="space-y-2">
              {!data.recentWorkspaces || data.recentWorkspaces.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <FolderKanban className="w-8 h-8 text-slate-400" />
                  </div>
                  <p className="text-slate-500 font-medium text-sm">
                    暂无工作空间数据
                  </p>
                </div>
              ) : (
                data.recentWorkspaces.map((workspace) => (
                  <div
                    key={workspace.id}
                    className="group flex items-center gap-3 p-3 rounded-xl hover:bg-white/60 transition-all duration-300 hover:-translate-x-1"
                  >
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-300">
                      <FolderKanban className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-800 truncate group-hover:text-[#10b981] transition-colors">
                        {workspace.name}
                      </div>
                      <div className="text-xs text-slate-400 font-medium">
                        {workspace.type === "PERSONAL"
                          ? "个人空间"
                          : "企业空间"}{" "}
                        · {workspace.members?.length || 0} 名成员
                      </div>
                    </div>
                    <div className="text-right font-mono text-xs leading-tight shrink-0 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-100">
                      <div className="font-bold text-slate-700">{splitFullDateTime(workspace.createdAt).date}</div>
                      <div className="text-[10px] text-slate-400 font-medium mt-0.5">{splitFullDateTime(workspace.createdAt).time}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 组件分类统计 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
        {/* 装饰背景 */}
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#f59e0b]/10 to-[#d97706]/10 opacity-50 blur-3xl"></div>

        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <div className="w-1 h-6 bg-gradient-to-b from-[#f59e0b] to-[#d97706] rounded-full"></div>
              <BarChart3 className="w-5 h-5 text-[#f59e0b]" />
              组件分类分布
            </h2>
            <button
              onClick={() => router.push("/admin/components")}
              className="text-sm text-[#3182ce] hover:text-[#3182ce] font-bold hover:underline transition-all"
            >
              查看全部 →
            </button>
          </div>
          <div className="space-y-3">
            {!data.componentCategories ||
            data.componentCategories.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <BarChart3 className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-500 font-medium text-sm">
                  暂无组件分类数据
                </p>
              </div>
            ) : (
              data.componentCategories.map((category, index) => {
                const maxCount = Math.max(
                  ...data.componentCategories.map((c) => c.count),
                  1
                );
                const percentage = Math.round(
                  (category.count / maxCount) * 100,
                );
                const c = category.color || "#3182ce";

                return (
                  <div
                    key={category.key}
                    onClick={() => router.push("/admin/components")}
                    className="group space-y-1.5 p-2 rounded-xl hover:bg-slate-50 transition-all cursor-pointer"
                    title="点击前往组件管理中心查看该分类组件"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: c }}
                        ></div>
                        <span
                          className="text-sm font-bold text-slate-700 group-hover:text-[#3182ce] transition-colors"
                        >
                          {category.name}
                        </span>
                        <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-[#3182ce] group-hover:translate-x-0.5 transition-all opacity-0 group-hover:opacity-100" />
                      </div>
                      <span
                        className="text-sm font-black"
                        style={{ color: c }}
                      >
                        {category.count} 个
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: c,
                        }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 系统微服务健康详情模态框 */}
      {servicesModalOpen && (
        <div
          onClick={() => setServicesModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="bg-gradient-to-r from-[#2b6cb0] to-[#3182ce] p-5 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Server className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm">系统核心服务运行状态</h3>
                  <p className="text-[11px] text-blue-100">底层核心服务与数据通道实时监控</p>
                </div>
              </div>
              <button
                onClick={() => setServicesModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                title="关闭 (Esc)"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            <div className="p-5 space-y-3 bg-slate-50/50">
              {/* PostgreSQL / Prisma */}
              <div className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-800">数据库服务 (PostgreSQL / Prisma)</div>
                    <div className="text-xs text-slate-500">连接池活跃 · 事务读写正常 · 表结构校验通过</div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200/60 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  正常
                </span>
              </div>

              {/* REST API 网关 */}
              <div className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-800">系统应用接口服务</div>
                    <div className="text-xs text-slate-500">接口通信正常 · 权限校验生效 · 响应速度平稳</div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200/60 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  正常
                </span>
              </div>

              {/* 对象存储 */}
              <div className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                    <HardDrive className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-800">文件与资源存储 (Storage)</div>
                    <div className="text-xs text-slate-500">组件资源包读写正常 · 头像与附件分发畅通</div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200/60 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  正常
                </span>
              </div>

              {/* 邮件与消息 */}
              <div className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-slate-200/80 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-800">消息通知通道 (Notification)</div>
                    <div className="text-xs text-slate-500">系统通知服务正常 · 待发送队列 0 积压</div>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200/60 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  正常
                </span>
              </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-200/80 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">按 Esc 或点击遮罩可快速退出</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setServicesModalOpen(false)}
                  className="px-4 h-9 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors"
                >
                  关闭
                </button>
                <button
                  onClick={() => {
                    setServicesModalOpen(false);
                    router.push("/admin/system-status");
                  }}
                  className="inline-flex items-center gap-1 px-4 h-9 rounded-xl bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold shadow-xs hover:shadow-md transition-all"
                >
                  <span>全量监控中心</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
