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
  totalUsers: number;
  totalWorkspaces: number;
  totalComponents: number;
  activeUsers: number;
  systemHealth: number;
  pendingReviews: number;
  systemLogs: number;
  recentUsers: Array<{
    id: string;
    name: string | null;
    email: string | null;
    role: string;
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
      const userId = typeof window !== "undefined" ? localStorage.getItem("userId") : "";
      
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
          <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">加载数据中...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-slate-600 font-medium">
            {error || "数据加载失败"}
          </p>
          <button
            onClick={loadDashboardData}
            className="mt-4 px-6 py-2 bg-[#3182ce] text-white rounded-lg hover:bg-[#2563eb] transition-colors"
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
      label: "活跃用户",
      value: data.activeUsers,
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
      icon: AlertCircle,
      label: "系统告警",
      value: "0",
      status: "正常",
      color: "text-[#10b981]",
      bgColor: "bg-[#10b981]/10",
    },
    {
      icon: Clock,
      label: "24h 操作量",
      value: data.systemLogs.toString(),
      status: "稳定",
      color: "text-[#3182ce]",
      bgColor: "bg-[#3182ce]/10",
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
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">管理仪表盘</h1>
        <p className="text-sm text-slate-500">系统概览、实时监控、数据分析</p>
      </div>

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
              <div className="text-sm font-bold text-slate-800">用户管理</div>
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
              <div className="text-sm font-bold text-slate-800">空间审核</div>
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
              <div className="text-sm font-bold text-slate-800">内容管理</div>
              <div className="text-xs text-slate-500">组件审核、文档管理</div>
            </div>
          </button>
        </div>
      </div>

      {/* 最近活动 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 最近用户 */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#3182ce]" />
              最近注册用户
            </h2>
            <button
              onClick={() => router.push("/admin/users")}
              className="text-sm text-[#3182ce] hover:text-[#2563eb] font-medium"
            >
              查看全部
            </button>
          </div>
          <div className="space-y-3">
            {data.recentUsers.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                暂无用户数据
              </div>
            ) : (
              data.recentUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white font-bold text-sm">
                    {user.name?.charAt(0) || user.email?.charAt(0) || "U"}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-slate-800">
                      {user.name || user.email || "匿名用户"}
                    </div>
                    <div className="text-xs text-slate-400">
                      {user.email || "未设置邮箱"}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">
                    {formatTimeAgo(user.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 最近工作空间 */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#10b981]" />
              最近工作空间
            </h2>
            <button
              onClick={() => router.push("/admin/workspaces")}
              className="text-sm text-[#3182ce] hover:text-[#2563eb] font-medium"
            >
              查看全部
            </button>
          </div>
          <div className="space-y-3">
            {data.recentWorkspaces.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                暂无工作空间数据
              </div>
            ) : (
              data.recentWorkspaces.map((workspace) => (
                <div
                  key={workspace.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#10b981] to-[#059669] flex items-center justify-center">
                    <FolderKanban className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-slate-800">
                      {workspace.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {workspace.type === "PERSONAL" ? "个人空间" : "企业空间"}{" "}
                      · {workspace.members.length} 名成员
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">
                    {formatTimeAgo(workspace.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
