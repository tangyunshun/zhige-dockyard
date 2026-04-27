"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
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
    type: string;
    count: number;
  }>;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setError(null);
      const userId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : "";

      const res = await fetch("/api/admin/dashboard", {
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "加载数据失败");
      }

      const result = await res.json();
      setData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "未知错误");
    } finally {
      setLoading(false);
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
            onClick={loadDashboardData}
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
      change: "+12.5%",
      trend: "up" as const,
      color: "text-[#3182ce]",
      bgColor: "bg-[#3182ce]/10",
    },
    {
      icon: FolderKanban,
      label: "工作空间",
      value: data.totalWorkspaces,
      change: "+8.2%",
      trend: "up" as const,
      color: "text-[#10b981]",
      bgColor: "bg-[#10b981]/10",
    },
    {
      icon: Activity,
      label: "组件总数",
      value: data.totalComponents,
      change: "+23.1%",
      trend: "up" as const,
      color: "text-[#f59e0b]",
      bgColor: "bg-[#f59e0b]/10",
    },
    {
      icon: TrendingUp,
      label: "活跃工作空间",
      value: data.activeWorkspaces,
      change: "+15.3%",
      trend: "up" as const,
      color: "text-[#8b5cf6]",
      bgColor: "bg-[#8b5cf6]/10",
    },
  ];

  const systemCards = [
    {
      icon: Server,
      label: "系统健康度",
      value: `${data.systemHealth}%`,
      status: data.systemHealth >= 95 ? "正常" : "注意",
      color: data.systemHealth >= 95 ? "text-[#10b981]" : "text-[#f59e0b]",
      bgColor: data.systemHealth >= 95 ? "bg-[#10b981]/10" : "bg-[#f59e0b]/10",
    },
    {
      icon: CheckCircle,
      label: "待审核项目",
      value: data.pendingReviews,
      status: data.pendingReviews > 0 ? "待处理" : "正常",
      color: data.pendingReviews > 0 ? "text-[#f59e0b]" : "text-[#10b981]",
      bgColor: data.pendingReviews > 0 ? "bg-[#f59e0b]/10" : "bg-[#10b981]/10",
    },
    {
      icon: Activity,
      label: "24h 活跃用户",
      value: data.systemLogs.toString(),
      status: "登录次数",
      color: "text-[#3182ce]",
      bgColor: "bg-[#3182ce]/10",
    },
    {
      icon: AlertCircle,
      label: "系统服务",
      value:
        Object.values(data.systemServices).filter((s) => s === "normal")
          .length + "/4",
      status: Object.values(data.systemServices).every((s) => s === "normal")
        ? "正常"
        : "异常",
      color: Object.values(data.systemServices).every((s) => s === "normal")
        ? "text-[#10b981]"
        : "text-[#f59e0b]",
      bgColor: Object.values(data.systemServices).every((s) => s === "normal")
        ? "bg-[#10b981]/10"
        : "bg-[#f59e0b]/10",
    },
  ];

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "刚刚";
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
  };

  return (
    <div className="space-y-6 pb-8">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-800 mb-2 tracking-tight">
          管理仪表盘
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          系统概览、实时监控、数据分析 · 知阁·舟坊
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <div
              key={index}
              className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
            >
              {/* 装饰背景 */}
              <div
                className={`absolute -right-4 -top-4 w-24 h-24 rounded-full ${card.bgColor} opacity-20 blur-2xl`}
              ></div>

              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div
                    className={`w-14 h-14 rounded-xl ${card.bgColor} flex items-center justify-center shadow-sm`}
                  >
                    <Icon className={`w-7 h-7 ${card.color}`} />
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${card.trend === "up" ? "text-[#10b981] bg-[#10b981]/10" : "text-red-500 bg-red-500/10"}`}
                  >
                    {card.trend === "up" ? "↑" : "↓"} {card.change}
                  </span>
                </div>
                <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                  {card.value.toLocaleString()}
                </div>
                <div className="text-sm text-slate-500 font-semibold">
                  {card.label}
                </div>
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
              className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden"
            >
              {/* 装饰背景 */}
              <div
                className={`absolute -right-4 -top-4 w-24 h-24 rounded-full ${card.bgColor} opacity-20 blur-2xl`}
              ></div>

              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div
                    className={`w-14 h-14 rounded-xl ${card.bgColor} flex items-center justify-center shadow-sm`}
                  >
                    <Icon className={`w-7 h-7 ${card.color}`} />
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${card.color} bg-opacity-10`}
                  >
                    {card.status}
                  </span>
                </div>
                <div className="text-3xl font-black text-slate-800 mb-1 tracking-tight">
                  {card.value}
                </div>
                <div className="text-sm text-slate-500 font-semibold">
                  {card.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 快捷操作 */}
      <div className="relative bg-white/80 backdrop-blur-xl rounded-2xl p-6 border border-white/90 shadow-sm overflow-hidden">
        {/* 装饰背景 */}
        <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#8b5cf6]/10 opacity-50 blur-3xl"></div>

        <div className="relative">
          <h2 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-gradient-to-b from-[#3182ce] to-[#8b5cf6] rounded-full"></div>
            快捷操作
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => router.push("/admin/users")}
              className="group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white hover:from-[#3182ce]/5 hover:to-[#2563eb]/5 border border-slate-200 hover:border-[#3182ce]/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-[#3182ce]/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Users className="w-6 h-6 text-[#3182ce]" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors">
                  用户管理
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  审核用户、分配权限
                </div>
              </div>
            </button>

            <button
              onClick={() => router.push("/admin/workspaces")}
              className="group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white hover:from-[#10b981]/5 hover:to-[#059669]/5 border border-slate-200 hover:border-[#10b981]/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-[#10b981]/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <FolderKanban className="w-6 h-6 text-[#10b981]" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800 group-hover:text-[#10b981] transition-colors">
                  空间审核
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  审核新空间、资源配额
                </div>
              </div>
            </button>

            <button
              onClick={() => router.push("/admin/content")}
              className="group flex items-center gap-4 p-4 rounded-xl bg-gradient-to-br from-slate-50 to-white hover:from-[#f59e0b]/5 hover:to-[#d97706]/5 border border-slate-200 hover:border-[#f59e0b]/30 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg text-left"
            >
              <div className="w-12 h-12 rounded-xl bg-[#f59e0b]/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <FileText className="w-6 h-6 text-[#f59e0b]" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-800 group-hover:text-[#f59e0b] transition-colors">
                  内容管理
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  组件审核、文档管理
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
          <div className="absolute -right-4 -top-4 w-32 h-32 rounded-full bg-gradient-to-br from-[#3182ce]/10 to-[#2563eb]/10 opacity-50 blur-3xl"></div>

          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <div className="w-1 h-6 bg-gradient-to-b from-[#3182ce] to-[#2563eb] rounded-full"></div>
                <UserPlus className="w-5 h-5 text-[#3182ce]" />
                最近注册用户
              </h2>
              <button
                onClick={() => router.push("/admin/users")}
                className="text-sm text-[#3182ce] hover:text-[#2563eb] font-bold hover:underline transition-all"
              >
                查看全部 →
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
                data.recentUsers.map((user) => (
                  <div
                    key={user.id}
                    className="group flex items-center gap-3 p-3 rounded-xl hover:bg-white/60 transition-all duration-300 hover:-translate-x-1"
                  >
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:scale-110 transition-transform duration-300">
                      {user.name?.charAt(0) || user.email?.charAt(0) || "U"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-slate-800 truncate group-hover:text-[#3182ce] transition-colors">
                        {user.name || user.email || "匿名用户"}
                      </div>
                      <div className="text-xs text-slate-400 font-medium truncate">
                        {user.email || "未设置邮箱"}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 font-medium bg-slate-100 px-2 py-1 rounded-full">
                      {formatTimeAgo(user.createdAt)}
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
                className="text-sm text-[#3182ce] hover:text-[#2563eb] font-bold hover:underline transition-all"
              >
                查看全部 →
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
                    <div className="text-xs text-slate-400 font-medium bg-slate-100 px-2 py-1 rounded-full">
                      {formatTimeAgo(workspace.createdAt)}
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
              <Activity className="w-5 h-5 text-[#f59e0b]" />
              组件分类分布
            </h2>
            <button
              onClick={() => router.push("/admin/components")}
              className="text-sm text-[#3182ce] hover:text-[#2563eb] font-bold hover:underline transition-all"
            >
              查看全部 →
            </button>
          </div>
          <div className="space-y-3">
            {!data.componentCategories ||
            data.componentCategories.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                  <Activity className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-500 font-medium text-sm">
                  暂无组件分类数据
                </p>
              </div>
            ) : (
              data.componentCategories.map((category, index) => {
                const colors = [
                  {
                    bg: "bg-[#3182ce]",
                    text: "text-[#3182ce]",
                    bar: "from-[#3182ce] to-[#2563eb]",
                  },
                  {
                    bg: "bg-[#10b981]",
                    text: "text-[#10b981]",
                    bar: "from-[#10b981] to-[#059669]",
                  },
                  {
                    bg: "bg-[#f59e0b]",
                    text: "text-[#f59e0b]",
                    bar: "from-[#f59e0b] to-[#d97706]",
                  },
                  {
                    bg: "bg-[#8b5cf6]",
                    text: "text-[#8b5cf6]",
                    bar: "from-[#8b5cf6] to-[#7c3aed]",
                  },
                  {
                    bg: "bg-[#ec4899]",
                    text: "text-[#ec4899]",
                    bar: "from-[#ec4899] to-[#db2777]",
                  },
                ];
                const color = colors[index % colors.length];
                const maxCount = Math.max(
                  ...data.componentCategories.map((c) => c.count),
                );
                const percentage = Math.round(
                  (category.count / maxCount) * 100,
                );

                return (
                  <div key={category.type} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${color.bg}`}
                        ></div>
                        <span className="text-sm font-bold text-slate-700">
                          {category.type}
                        </span>
                      </div>
                      <span className={`text-sm font-black ${color.text}`}>
                        {category.count} 个
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${color.bar} rounded-full transition-all duration-500`}
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
