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
  BookOpen,
  CreditCard,
} from "lucide-react";

interface DashboardData {
  // 核心统计指标
  totalUsers: number; // 总用户数
  totalWorkspaces: number; // 总工作空间数
  totalComponents: number; // 组件总数
  publishedComponents: number; // 已上架组件数
  totalCategories?: number; // 分类类目总数
  activeWorkspaces: number; // 活跃工作空间数（最近 7 天）
  enterpriseWorkspaces: number; // 企业空间数
  totalDocuments?: number; // 系统文档总数
  totalTenants: number; // 总租户数
  activeTenants: number; // 活跃租户数
  pendingReviews: number; // 待审核申请数
  pendingPostSubmissions?: number; // 待审核的企业空间新增岗位提报数

  // 财务与订单聚合统计
  financialSummary?: {
    totalOrders: number;
    todayOrders: number;
    totalRevenueFen: number;
    formattedRevenue: string;
  };

  // 平台健康度
  systemHealth: number;

  // 系统服务状态（后端真实探针结果：状态 + 实测延迟 + 真实指标文案）
  systemServices: Array<{
    key: "database" | "api" | "storage" | "notification";
    name: string;
    status: "normal" | "warning" | "down";
    latencyMs: number;
    message: string;
  }>;

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
    logo?: string | null;
    avatar?: string | null;
    createdAt: string;
    members: Array<{
      user: { name: string | null; email: string | null; avatar?: string | null };
    }>;
  }>;
  componentCategories?: Array<{
    key: string;
    name: string;
    color: string;
    count: number;
  }>;
  recentAuditLogs?: Array<{
    id: string;
    action: string;
    actionZh?: string;
    resource: string | null;
    resourceZh?: string;
    details: any;
    ipAddress: string | null;
    formattedIp?: string;
    createdAt: string;
    user: {
      id: string;
      name: string | null;
      email: string | null;
      avatar: string | null;
      role: string;
    } | null;
  }>;
  securitySummary?: {
    pendingAppeals: number;
    bannedUsers: number;
    todayOperations: number;
    todayLogins: number;
  };
  /** 模型与 AI 统计（全部为数据库真实聚合） */
  modelStats?: {
    deploymentTotal: number;
    deploymentEnabled: number;
    deploymentDisabled: number;
    providerTotal: number;
    providerEnabled: number;
    providerDisabled: number;
    healthy: number;
    error: number;
    unknown: number;
    pricingTotal: number;
    periodTotal: number;
    periodEnabled: number;
    policyTotal: number;
  };
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



  // 审计操作动作中文化映射与样式标签
  const getAuditActionBadge = (action?: string) => {
    const act = (action || "").toLowerCase();
    if (act.includes("role") || act.includes("permission") || act.includes("admin")) {
      return { label: "权限变更", bg: "bg-amber-50 text-amber-700 border-amber-200" };
    }
    if (act.includes("ban") || act.includes("lock") || act.includes("delete") || act.includes("kick")) {
      return { label: "安全风控", bg: "bg-red-50 text-red-700 border-red-200" };
    }
    if (act.includes("upgrade") || act.includes("order") || act.includes("plan") || act.includes("recharge")) {
      return { label: "空间资费", bg: "bg-emerald-50 text-emerald-700 border-emerald-200" };
    }
    if (act.includes("login") || act.includes("auth") || act.includes("password") || act.includes("session")) {
      return { label: "身份鉴权", bg: "bg-blue-50 text-blue-700 border-blue-200" };
    }
    if (act.includes("create") || act.includes("add") || act.includes("new")) {
      return { label: "资源创建", bg: "bg-purple-50 text-purple-700 border-purple-200" };
    }
    return { label: "系统操作", bg: "bg-slate-100 text-slate-700 border-slate-200" };
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

  // 系统服务真实状态（来自接口探针结果，不再写死）
  const systemServices = data.systemServices || [];
  const serviceTotal = systemServices.length;
  const normalServiceCount = systemServices.filter((s) => s.status === "normal").length;
  const allServicesNormal = serviceTotal > 0 && normalServiceCount === serviceTotal;
  // 顶部状态徽标同样随真实健康度/服务状态变化
  const systemHealthy = allServicesNormal && data.systemHealth >= 95;

  const serviceStatusMeta: Record<
    "normal" | "warning" | "down",
    { label: string; badge: string; dot: string }
  > = {
    normal: {
      label: "正常",
      badge: "bg-emerald-50 text-emerald-600 border-emerald-200/60",
      dot: "bg-emerald-500",
    },
    warning: {
      label: "需要关注",
      badge: "bg-amber-50 text-amber-600 border-amber-200/60",
      dot: "bg-amber-500",
    },
    down: {
      label: "异常",
      badge: "bg-red-50 text-red-600 border-red-200/60",
      dot: "bg-red-500",
    },
  };

  const serviceIcons: Record<string, typeof Database> = {
    database: Database,
    api: Layers,
    storage: HardDrive,
    notification: Mail,
  };

  const statCards = [
    {
      icon: Users,
      label: "总用户数",
      value: data.totalUsers,
      subLabel: "全平台注册用户",
      badgeText: "用户管理",
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
      badgeText: "组件管理",
      path: "/admin/components",
      color: "text-[#f59e0b]",
      bgColor: "bg-[#f59e0b]/10",
      borderHover: "hover:border-[#f59e0b]/40",
    },
    {
      icon: TrendingUp,
      label: "活跃工作空间",
      value: data.activeWorkspaces,
      subLabel: `近7天活跃 / 企业团队 ${data.activeTenants} 个`,
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
      subLabel: data.pendingReviews > 0 ? "有账号申诉待处理" : "当前没有待处理申诉",
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
      value: `${normalServiceCount}/${serviceTotal} 在线`,
      status: normalServiceCount === serviceTotal ? "全部正常" : "部分异常",
      subLabel: "点击查看服务运行详情",
      onClick: () => setServicesModalOpen(true),
      color: normalServiceCount === serviceTotal ? "text-[#10b981]" : "text-[#f59e0b]",
      bgColor: normalServiceCount === serviceTotal ? "bg-[#10b981]/10" : "bg-[#f59e0b]/10",
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
    if (!dateStr) return { date: "未知", time: "", full: "未知" };
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return { date: "未知", time: "", full: "未知" };
      const pad = (n: number) => n.toString().padStart(2, "0");
      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hours = pad(d.getHours());
      const minutes = pad(d.getMinutes());
      const seconds = pad(d.getSeconds());
      const full = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      return {
        date: `${year}-${month}-${day}`,
        time: `${hours}:${minutes}:${seconds}`,
        full,
      };
    } catch (e) {
      return { date: "未知", time: "", full: "未知" };
    }
  };

  // 模型与 AI 统计卡片：数值全部来自接口真实聚合，缺省回退为 0（不使用占位写死值）
  const ms = data.modelStats;
  const modelCards = [
    {
      icon: Boxes,
      label: "模型部署总数",
      value: ms?.deploymentTotal ?? 0,
      subLabel: `已启用 ${ms?.deploymentEnabled ?? 0} · 已禁用 ${ms?.deploymentDisabled ?? 0}`,
      badgeText: "模型统计",
      path: "/admin/models",
      color: "text-[#8b5cf6]",
      bgColor: "bg-[#8b5cf6]/10",
      borderHover: "hover:border-[#8b5cf6]/40",
    },
    {
      icon: Server,
      label: "供应商通道",
      value: ms?.providerTotal ?? 0,
      subLabel: `已启用 ${ms?.providerEnabled ?? 0} · 已禁用 ${ms?.providerDisabled ?? 0}`,
      badgeText: "通道统计",
      path: "/admin/models",
      color: "text-[#3182ce]",
      bgColor: "bg-[#3182ce]/10",
      borderHover: "hover:border-[#3182ce]/40",
    },
    {
      icon: CheckCircle,
      label: "通道健康",
      value: `${ms?.healthy ?? 0}/${ms?.deploymentTotal ?? 0}`,
      subLabel: `异常 ${ms?.error ?? 0} · 未探测 ${ms?.unknown ?? 0}`,
      badgeText: "连通探测",
      path: "/admin/models",
      color: (ms?.error ?? 0) > 0 ? "text-[#f59e0b]" : "text-[#10b981]",
      bgColor: (ms?.error ?? 0) > 0 ? "bg-[#f59e0b]/10" : "bg-[#10b981]/10",
      borderHover: "hover:border-[#10b981]/40",
    },
    {
      icon: BarChart3,
      label: "空间授权覆盖",
      value: ms?.policyTotal ?? 0,
      subLabel: `已配置模型白名单的空间数`,
      badgeText: "授权情况",
      path: "/admin/workspaces/model-policy",
      color: "text-[#3182ce]",
      bgColor: "bg-[#3182ce]/10",
      borderHover: "hover:border-[#3182ce]/40",
    },
  ];

  return (
    <div className="space-y-6">
      {/* 1. 顶部标题与态势状态栏 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 shrink-0 pb-3 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl lg:text-3xl font-black text-slate-800 tracking-tight">
              管理仪表盘
            </h1>
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-colors shadow-2xs ${
                systemHealthy
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200/80"
                  : "bg-amber-50 text-amber-700 border-amber-200/80"
              }`}
              title={`系统健康度 ${data.systemHealth}% · 核心服务 ${normalServiceCount}/${serviceTotal} 在线`}
            >
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${
                  systemHealthy ? "bg-emerald-500" : "bg-amber-500"
                }`}
              ></span>
              {systemHealthy
                ? "系统全链路正常运行"
                : `系统存在告警项（微服务 ${normalServiceCount}/${serviceTotal} · 健康度 ${data.systemHealth}%）`}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            实时总览全平台用户生态、工作空间资产、组件底座与服务健康态势
          </p>
        </div>

        {/* 顶部右侧快捷工具组 */}
        <div className="flex items-center gap-3 self-start sm:self-auto">
          {lastSyncTime && (
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 font-mono bg-white px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-2xs">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>数据同步于 {lastSyncTime}</span>
            </div>
          )}
          <button
            onClick={() => loadDashboardData(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-xl bg-white border border-slate-200 hover:border-[#3182ce]/50 text-slate-700 hover:text-[#3182ce] text-xs font-bold shadow-2xs hover:shadow-xs transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            title="重新拉取平台全局最新统计数据"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                refreshing ? "animate-spin text-[#3182ce]" : "text-slate-500"
              }`}
            />
            <span>{refreshing ? "刷新数据中..." : "实时刷新"}</span>
          </button>
        </div>
      </div>

      {/* 2. 紧急安全待办提醒横幅（仅在存在待处理申诉时高亮展开） */}
      {data.pendingReviews > 0 && (
        <div className="relative overflow-hidden bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs animate-in fade-in duration-300">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20 animate-pulse">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-black text-slate-800 flex items-center gap-2">
                <span>安全待办风险提醒</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-500 text-white shadow-2xs">
                  {data.pendingReviews} 项申诉待复核
                </span>
              </div>
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                有用户提交了账号受限或封禁申诉待人工仲裁，请及时前往处理以保障合规性。
              </p>
            </div>
          </div>
          <button
            onClick={() => router.push("/admin/account-appeals")}
            className="inline-flex items-center justify-center gap-1.5 px-4 h-9 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer shrink-0"
          >
            <span>立即前往风控核验</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. 平台核心资产看板带 (Top KPI Bento Band - 4联卡片，规范通俗表述，杜绝 AI 黑话与折行) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        {/* 卡片 1: 平台用户总览 */}
        <div
          onClick={() => router.push("/admin/users")}
          className="group relative bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-[#3182ce]/50 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col justify-between"
          title={`平台总注册用户: ${data.totalUsers.toLocaleString()} 人 · 封禁账号: ${data.securitySummary?.bannedUsers || 0} 人`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 whitespace-nowrap">总注册用户</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Users className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-2xl lg:text-3xl font-black font-mono text-slate-800 tracking-tight whitespace-nowrap">
              {data.totalUsers.toLocaleString()}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 whitespace-nowrap overflow-hidden">
            <span className="truncate">
              正常用户 <strong className="font-mono text-slate-800">{Math.max(0, data.totalUsers - (data.securitySummary?.bannedUsers || 0))}</strong> 人
            </span>
            <span className="text-slate-300 mx-1">|</span>
            <span className="truncate text-slate-700 font-medium">
              封禁账号 <strong className="font-mono text-red-600">{data.securitySummary?.bannedUsers || 0}</strong> 人
            </span>
          </div>
        </div>

        {/* 卡片 2: 工作空间总览 (严禁“所”等黑话，统一为“个”) */}
        <div
          onClick={() => router.push("/admin/workspaces")}
          className="group relative bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-emerald-300 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col justify-between"
          title={`工作空间总数: ${data.totalWorkspaces.toLocaleString()} 个 · 企业空间: ${data.enterpriseWorkspaces} 个 · 近期活跃: ${data.activeWorkspaces} 个`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 whitespace-nowrap">工作空间总数</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <FolderKanban className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-2xl lg:text-3xl font-black font-mono text-slate-800 tracking-tight whitespace-nowrap">
              {data.totalWorkspaces.toLocaleString()}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 whitespace-nowrap overflow-hidden">
            <span className="truncate" title={`企业空间: ${data.enterpriseWorkspaces} 个`}>
              企业空间 <strong className="text-slate-800 font-mono">{data.enterpriseWorkspaces}</strong> 个
            </span>
            <span className="text-slate-300 mx-1">|</span>
            <span className="truncate text-emerald-700 font-medium" title={`近期活跃空间: ${data.activeWorkspaces} 个`}>
              近期活跃 <strong className="font-mono">{data.activeWorkspaces}</strong> 个
            </span>
          </div>
        </div>

        {/* 卡片 3: 能力组件总览 */}
        <div
          onClick={() => router.push("/admin/components")}
          className="group relative bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-amber-300 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col justify-between"
          title={`能力组件总数: ${data.totalComponents.toLocaleString()} 款 · 已上架: ${data.publishedComponents} 款 · 待上架: ${Math.max(0, data.totalComponents - data.publishedComponents)} 款`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 whitespace-nowrap">组件总数</span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Package className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-2xl lg:text-3xl font-black font-mono text-slate-800 tracking-tight whitespace-nowrap">
              {data.totalComponents.toLocaleString()}
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 whitespace-nowrap overflow-hidden">
            <span className="truncate text-amber-700 font-medium">
              已上架 <strong className="font-mono">{data.publishedComponents}</strong> 款
            </span>
            <span className="text-slate-300 mx-1">|</span>
            <span className="truncate">
              待上架 <strong className="text-slate-800 font-mono">{Math.max(0, data.totalComponents - data.publishedComponents)}</strong> 款
            </span>
          </div>
        </div>

        {/* 卡片 4: 系统服务状态 (严禁“探针在线”等生造黑话) */}
        <div
          onClick={() => setServicesModalOpen(true)}
          className="group relative bg-white rounded-2xl p-4.5 border border-slate-200/80 shadow-2xs hover:shadow-md hover:border-[#3182ce]/50 transition-all duration-300 cursor-pointer overflow-hidden flex flex-col justify-between"
          title={`系统服务健康评分: ${data.systemHealth}% · 核心服务在线: ${normalServiceCount}/${serviceTotal} · 近24小时访问: ${data.systemLogs.toLocaleString()} 次`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 whitespace-nowrap">系统服务状态</span>
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Activity className="w-4.5 h-4.5" />
              </div>
            </div>
            <div className="text-2xl lg:text-3xl font-black font-mono text-slate-800 tracking-tight whitespace-nowrap flex items-baseline gap-1.5">
              <span>{data.systemHealth}%</span>
              <span className="text-[11px] font-sans font-normal text-slate-400">运行健康</span>
            </div>
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 whitespace-nowrap overflow-hidden">
            <span className={`truncate font-bold ${allServicesNormal ? "text-emerald-600" : "text-amber-600"}`}>
              核心服务 {normalServiceCount}/{serviceTotal} 正常
            </span>
            <span className="text-slate-300 mx-1">|</span>
            <span className="truncate font-mono text-slate-600">
              24h访问 {data.systemLogs.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* 4. 主体双列复合 Bento 驾驶舱 (8:4 黄金分界) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* ================= 左侧 8 列：业务核心与运营流动中枢 ================= */}
        <div className="lg:col-span-8 space-y-6">
          {/* A. 常用业务管理中枢 (采用通透舒适的 2 列大网格，杜绝 3 列拥挤重叠与文字溢出) */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
            <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-4.5 bg-[#3182ce] rounded-full"></div>
                <h2 className="text-base font-black text-slate-800 tracking-tight whitespace-nowrap">
                  常用业务管理中枢
                </h2>
              </div>
              <span className="text-xs text-slate-400 font-medium hidden sm:inline whitespace-nowrap">
                直达后台核心功能模块与管理配置
              </span>
            </div>

            {/* 2 列宽敞大网格布局：每张卡片拥有 380px 宽，呼吸感强，完全消除重叠错位 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 域 1: 工作空间与多租户管控 */}
              <div 
                className="p-4 rounded-xl bg-slate-50/70 hover:bg-emerald-50/30 border border-slate-200/80 hover:border-emerald-200 transition-all flex flex-col justify-between gap-3 group"
                title={`空间与多租户管控\n空间总数: ${data.totalWorkspaces} 个\n企业空间: ${data.enterpriseWorkspaces} 个\n企业租户: ${data.totalTenants} 个`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <Building2 className="w-4.5 h-4.5" />
                      </div>
                      <span 
                        className="text-sm font-bold text-slate-800 truncate whitespace-nowrap"
                        title="空间与多租户管控"
                      >
                        空间与多租户管控
                      </span>
                    </div>
                    <span 
                      className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200/60 shrink-0"
                      title={`平台工作空间总数（含个人空间与企业空间）: ${data.totalWorkspaces} 个`}
                    >
                      全部空间 {data.totalWorkspaces} 个
                    </span>
                  </div>
                  <p 
                    className="text-xs text-slate-500 font-medium truncate mt-1"
                    title="企业与个人工作空间治理、多租户隔离与空间升级审批"
                  >
                    企业与个人工作空间治理、多租户隔离与空间升级审批
                  </p>
                  <div className="mt-2.5 flex items-center gap-3 text-xs text-slate-600 font-mono">
                    <span title={`平台工作空间总数: ${data.totalWorkspaces} 个`}>
                      空间总数: <strong className="text-slate-800 font-bold text-sm">{data.totalWorkspaces}</strong> 个
                    </span>
                    <span className="text-slate-300">|</span>
                    <span title={`企业租户空间: ${data.totalTenants} 个`}>
                      企业租户: <strong className="text-slate-800 font-bold text-sm">{data.totalTenants}</strong> 个
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2.5 border-t border-slate-200/60 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => router.push("/admin/workspaces")}
                    title="前往工作空间列表与空间生命周期管理"
                    className="flex-1 py-1.5 text-center rounded-lg bg-white hover:bg-[#3182ce] hover:text-white text-slate-700 border border-slate-200/80 transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    空间列表
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/admin/tenants")}
                    title="前往企业多租户配置与租户隔离中枢"
                    className="flex-1 py-1.5 text-center rounded-lg bg-white hover:bg-[#3182ce] hover:text-white text-slate-700 border border-slate-200/80 transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    多租户管理
                  </button>
                </div>
              </div>

              {/* 域 2: 平台用户与组织权限 */}
              <div 
                className="p-4 rounded-xl bg-slate-50/70 hover:bg-blue-50/30 border border-slate-200/80 hover:border-blue-200 transition-all flex flex-col justify-between gap-3 group"
                title={`用户管理与权限矩阵\n在册用户: ${data.totalUsers} 人\n正常账号: ${Math.max(0, data.totalUsers - (data.securitySummary?.bannedUsers || 0))} 人\n封禁账号: ${data.securitySummary?.bannedUsers || 0} 人`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-[#3182ce] flex items-center justify-center shrink-0">
                        <Users className="w-4.5 h-4.5" />
                      </div>
                      <span 
                        className="text-sm font-bold text-slate-800 truncate whitespace-nowrap"
                        title="用户管理与权限矩阵"
                      >
                        用户管理与权限矩阵
                      </span>
                    </div>
                    <span 
                      className="px-2 py-0.5 rounded-md bg-blue-50 text-[#3182ce] text-xs font-bold border border-blue-200/60 shrink-0"
                      title={`平台注册总用户数: ${data.totalUsers} 人`}
                    >
                      在册用户 {data.totalUsers} 人
                    </span>
                  </div>
                  <p 
                    className="text-xs text-slate-500 font-medium truncate mt-1"
                    title="全平台用户账号治理、生命周期管控与权限岗位配置"
                  >
                    全平台用户账号治理、生命周期管控与权限岗位配置
                  </p>
                  <div className="mt-2.5 flex items-center gap-3 text-xs text-slate-600 font-mono">
                    <span title={`正常状态用户: ${Math.max(0, data.totalUsers - (data.securitySummary?.bannedUsers || 0))} 人`}>
                      正常账号: <strong className="text-slate-800 font-bold text-sm">{Math.max(0, data.totalUsers - (data.securitySummary?.bannedUsers || 0))}</strong> 人
                    </span>
                    <span className="text-slate-300">|</span>
                    <span title={`风控封禁账号: ${data.securitySummary?.bannedUsers || 0} 人`}>
                      封禁隔离: <strong className="text-red-600 font-bold text-sm">{data.securitySummary?.bannedUsers || 0}</strong> 人
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2.5 border-t border-slate-200/60 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => router.push("/admin/users")}
                    title="前往用户列表管理账号状态与角色变更"
                    className="flex-1 py-1.5 text-center rounded-lg bg-white hover:bg-[#3182ce] hover:text-white text-slate-700 border border-slate-200/80 transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    用户列表
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/admin/permissions")}
                    title="前往岗位标准库与系统权限配置中心"
                    className="flex-1 py-1.5 text-center rounded-lg bg-white hover:bg-[#3182ce] hover:text-white text-slate-700 border border-slate-200/80 transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    权限配置
                  </button>
                </div>
              </div>

              {/* 域 3: 能力组件与应用生态 (彻底去除黑话，大厂规范通俗表达) */}
              <div 
                className="p-4 rounded-xl bg-slate-50/70 hover:bg-amber-50/30 border border-slate-200/80 hover:border-amber-200 transition-all flex flex-col justify-between gap-3 group"
                title={`能力组件与应用生态\n组件总数: ${data.totalComponents} 款\n已上架: ${data.publishedComponents} 款\n分类类目: ${data.componentCategories?.length || 0} 类`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                        <Package className="w-4.5 h-4.5" />
                      </div>
                      <span 
                        className="text-sm font-bold text-slate-800 truncate whitespace-nowrap"
                        title="能力组件与应用生态"
                      >
                        能力组件与应用生态
                      </span>
                    </div>
                    <span 
                      className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200/60 shrink-0"
                      title={`已面向租户上架的组件: ${data.publishedComponents} 款`}
                    >
                      已上架 {data.publishedComponents} 款
                    </span>
                  </div>
                  <p 
                    className="text-xs text-slate-500 font-medium truncate mt-1"
                    title="平台组件库维护、类目划分与发布上架管理"
                  >
                    平台组件库维护、类目划分与发布上架管理
                  </p>
                  <div className="mt-2.5 flex items-center gap-3 text-xs text-slate-600 font-mono">
                    <span title={`平台组件目录总数: ${data.totalComponents} 款`}>
                      组件总数: <strong className="text-slate-800 font-bold text-sm">{data.totalComponents}</strong> 款
                    </span>
                    <span className="text-slate-300">|</span>
                    <span title={`组件业务分类类目总数: ${data.totalCategories || data.componentCategories?.length || 0} 类`}>
                      分类类目: <strong className="text-slate-800 font-bold text-sm">{data.totalCategories || data.componentCategories?.length || 0}</strong> 类
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2.5 border-t border-slate-200/60 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => router.push("/admin/components")}
                    title="前往组件目录管理与上架状态维护"
                    className="flex-1 py-1.5 text-center rounded-lg bg-white hover:bg-[#3182ce] hover:text-white text-slate-700 border border-slate-200/80 transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    组件列表
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/admin/components/categories")}
                    title="前往能力组件分类类目管理"
                    className="flex-1 py-1.5 text-center rounded-lg bg-white hover:bg-[#3182ce] hover:text-white text-slate-700 border border-slate-200/80 transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    分类管理
                  </button>
                </div>
              </div>

              {/* 域 4: 平台财务与订单交易中心 (对接真实财务与订单数据) */}
              <div 
                className="p-4 rounded-xl bg-slate-50/70 hover:bg-emerald-50/30 border border-slate-200/80 hover:border-emerald-200 transition-all flex flex-col justify-between gap-3 group"
                title={`财务交易与订单中心\n累计订单: ${data.financialSummary?.totalOrders || 0} 笔\n成功流水: ${data.financialSummary?.formattedRevenue || '¥0.00'}\n今日新增: ${data.financialSummary?.todayOrders || 0} 笔`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <CreditCard className="w-4.5 h-4.5" />
                      </div>
                      <span 
                        className="text-sm font-bold text-slate-800 truncate whitespace-nowrap"
                        title="财务交易与订单中心"
                      >
                        财务交易与订单中心
                      </span>
                    </div>
                    <span 
                      className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200/60 shrink-0"
                      title="真实会员订单与充值流水实时对账"
                    >
                      实时对账
                    </span>
                  </div>
                  <p 
                    className="text-xs text-slate-500 font-medium truncate mt-1"
                    title="全平台充值缴费、套餐订单与财务流水结算"
                  >
                    全平台充值缴费、套餐订单与财务流水结算
                  </p>
                  <div className="mt-2.5 flex items-center gap-3 text-xs text-slate-600 font-mono">
                    <span title={`全平台累计订单总数: ${data.financialSummary?.totalOrders || 0} 笔`}>
                      累计订单: <strong className="text-slate-800 font-bold text-sm">{data.financialSummary?.totalOrders || 0}</strong> 笔
                    </span>
                    <span className="text-slate-300">|</span>
                    <span title={`成功充值与交易总流水: ${data.financialSummary?.formattedRevenue || '¥0.00'}`}>
                      成功流水: <strong className="text-emerald-700 font-bold text-sm">{data.financialSummary?.formattedRevenue || '¥0.00'}</strong>
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-2.5 border-t border-slate-200/60 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => router.push("/admin/orders")}
                    title="前往全平台会员与套餐订单列表"
                    className="flex-1 py-1.5 text-center rounded-lg bg-white hover:bg-[#3182ce] hover:text-white text-slate-700 border border-slate-200/80 transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    订单列表
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/admin/finance/recharge-orders")}
                    title="前往平台财务充值订单对账管理"
                    className="flex-1 py-1.5 text-center rounded-lg bg-white hover:bg-[#3182ce] hover:text-white text-slate-700 border border-slate-200/80 transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    充值明细
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* B. 实时动态展示（最近工作空间 + 最近注册用户 - 彻底删除“(最多5条)”文字，纯净展示） */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 最近活跃工作空间 */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-slate-100">
                  <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-emerald-600" />
                    <span className="whitespace-nowrap">最近活跃工作空间</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => router.push("/admin/workspaces")}
                    className="text-xs font-bold text-[#3182ce] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    查看全部 →
                  </button>
                </div>
                <div className="space-y-2">
                  {!data.recentWorkspaces || data.recentWorkspaces.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400 font-medium">
                      暂无工作空间数据
                    </div>
                  ) : (
                    data.recentWorkspaces.slice(0, 5).map((workspace) => {
                      const isEnterprise = workspace.type === "ENTERPRISE";
                      const dt = splitFullDateTime(workspace.createdAt);
                      return (
                        <div
                          key={workspace.id}
                          onClick={() => router.push("/admin/workspaces")}
                          title={`空间名称: ${workspace.name}\n类型: ${isEnterprise ? "企业工作空间" : "个人工作空间"}\n成员数: ${workspace.members?.length || 0} 人\n创建时间: ${dt.full || dt.date + ' ' + dt.time}`}
                          className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer border border-transparent hover:border-slate-200/60 overflow-hidden"
                        >
                          <div className="relative w-9 h-9 shrink-0">
                            {workspace.logo ? (
                              <img
                                src={workspace.logo}
                                alt={workspace.name}
                                className="w-9 h-9 rounded-xl object-cover border border-slate-200"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = "none";
                                }}
                              />
                            ) : null}
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-2xs ${
                                workspace.logo ? "hidden" : ""
                              } ${
                                isEnterprise
                                  ? "bg-gradient-to-br from-[#2b6cb0] to-[#3182ce]"
                                  : "bg-gradient-to-br from-emerald-500 to-teal-600"
                              }`}
                            >
                              {isEnterprise ? (
                                <Building2 className="w-4 h-4 text-white" />
                              ) : (
                                <FolderKanban className="w-4 h-4 text-white" />
                              )}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div 
                              className="text-xs font-bold text-slate-800 truncate whitespace-nowrap group-hover:text-[#3182ce] transition-colors"
                              title={workspace.name}
                            >
                              {workspace.name}
                            </div>
                            <div 
                              className="text-[11px] text-slate-400 font-medium mt-0.5 truncate whitespace-nowrap"
                              title={`${isEnterprise ? "企业空间" : "个人空间"} · ${workspace.members?.length || 0} 名成员`}
                            >
                              <span
                                className={`font-bold mr-1 ${
                                  isEnterprise ? "text-[#3182ce]" : "text-slate-500"
                                }`}
                              >
                                {isEnterprise ? "企业空间" : "个人空间"}
                              </span>
                              · {workspace.members?.length || 0} 成员
                            </div>
                          </div>
                          <div 
                            className="text-right font-mono text-[10px] text-slate-400 shrink-0 whitespace-nowrap ml-2"
                            title={`创建于: ${dt.full || dt.date + ' ' + dt.time}`}
                          >
                            <div>{dt.date}</div>
                            <div className="mt-0.5">{dt.time}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* 最近注册用户 */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-slate-100">
                  <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-[#3182ce]" />
                    <span className="whitespace-nowrap">最近注册用户</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => router.push("/admin/users")}
                    className="text-xs font-bold text-[#3182ce] hover:underline cursor-pointer whitespace-nowrap"
                  >
                    查看全部 →
                  </button>
                </div>
                <div className="space-y-2">
                  {!data.recentUsers || data.recentUsers.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400 font-medium">
                      暂无用户数据
                    </div>
                  ) : (
                    data.recentUsers.slice(0, 5).map((user: any) => {
                      const dt = splitFullDateTime(user.createdAt);
                      return (
                        <div
                          key={user.id}
                          onClick={() => router.push("/admin/users")}
                          title={`用户昵称: ${user.name || "未设置"}\n注册邮箱: ${user.email || "未绑定"}\n会员等级: ${getMembershipLevelLabel(user.membershipLevel)}\n注册时间: ${dt.full || dt.date + ' ' + dt.time}`}
                          className="group flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer border border-transparent hover:border-slate-200/60 overflow-hidden"
                        >
                          {user.avatar ? (
                            <img
                              src={user.avatar}
                              alt={user.name || "用户头像"}
                              className="w-9 h-9 rounded-full object-cover shadow-2xs border border-slate-200 shrink-0"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = "none";
                              }}
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2b6cb0] to-[#3182ce] text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                              {user.name?.charAt(0) || user.email?.charAt(0) || "U"}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div 
                              className="text-xs font-bold text-slate-800 truncate whitespace-nowrap group-hover:text-[#3182ce] transition-colors"
                              title={user.name || user.email || "匿名用户"}
                            >
                              {user.name || user.email || "匿名用户"}
                            </div>
                            <div 
                              className="text-[11px] text-slate-400 font-medium truncate whitespace-nowrap mt-0.5"
                              title={`${getMembershipLevelLabel(user.membershipLevel)} · ${user.email || "未绑定邮箱"}`}
                            >
                              <span className="font-bold text-amber-700 mr-1">
                                {getMembershipLevelLabel(user.membershipLevel)}
                              </span>
                              · {user.email || "未绑定邮箱"}
                            </div>
                          </div>
                          <div 
                            className="text-right font-mono text-[10px] text-slate-400 shrink-0 whitespace-nowrap ml-2"
                            title={`注册于: ${dt.full || dt.date + ' ' + dt.time}`}
                          >
                            <div>{dt.date}</div>
                            <div className="mt-0.5">{dt.time}</div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* C. 最近系统操作流水 (彻底更名无黑话，显示 5 条，带完整悬浮与单行约束) */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-[#3182ce]" />
                <h3 className="text-sm font-black text-slate-800 tracking-tight whitespace-nowrap">
                  最近系统操作流水
                </h3>
              </div>
              <button
                type="button"
                onClick={() => router.push("/admin/logs")}
                className="text-xs font-bold text-[#3182ce] hover:underline cursor-pointer whitespace-nowrap"
              >
                查看全部审计日志 →
              </button>
            </div>

            <div className="divide-y divide-slate-100 pt-1">
              {!data.recentAuditLogs || data.recentAuditLogs.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-400 font-medium">
                  暂无系统操作日志
                </div>
              ) : (
                data.recentAuditLogs.slice(0, 5).map((log) => {
                  const actBadge = getAuditActionBadge(log.action);
                  const dt = splitFullDateTime(log.createdAt);

                  return (
                    <div
                      key={log.id}
                      onClick={() => router.push("/admin/logs")}
                      title={`操作人: ${log.user?.name || log.user?.email || "系统服务"}\n操作动作: ${log.actionZh || log.action}\n操作对象: ${log.resourceZh || log.resource || "无"}\n来源 IP: ${log.formattedIp || log.ipAddress || "127.0.0.1"}\n记录时间: ${dt.full || dt.date + ' ' + dt.time}`}
                      className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3 hover:bg-slate-50/80 px-2 rounded-xl transition-colors cursor-pointer overflow-hidden"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        {log.user?.avatar ? (
                          <img
                            src={log.user.avatar}
                            alt={log.user.name || "操作人"}
                            className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#2b6cb0] to-[#3182ce] text-white font-bold text-xs flex items-center justify-center shrink-0">
                            {log.user?.name?.charAt(0) || log.user?.email?.charAt(0) || "管"}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span 
                              className="text-xs font-bold text-slate-800 group-hover:text-[#3182ce] transition-colors truncate whitespace-nowrap max-w-[120px]"
                              title={log.user?.name || log.user?.email || "系统服务"}
                            >
                              {log.user?.name || log.user?.email || "系统服务"}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold border shrink-0 whitespace-nowrap ${actBadge.bg}`}
                            >
                              {actBadge.label}
                            </span>
                            <span 
                              className="text-xs text-slate-700 font-semibold truncate whitespace-nowrap max-w-[200px]"
                              title={log.actionZh || log.action}
                            >
                              {log.actionZh || log.action}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 truncate whitespace-nowrap">
                            {(log.resourceZh || log.resource) && (
                              <span 
                                className="text-slate-500 font-medium truncate max-w-[240px] whitespace-nowrap"
                                title={`操作对象: ${log.resourceZh || log.resource}`}
                              >
                                对象: {log.resourceZh || log.resource}
                              </span>
                            )}
                            <span 
                              className="font-mono bg-slate-100 px-1.5 py-0.2 rounded text-slate-500 shrink-0 text-[10px] whitespace-nowrap"
                              title={`来源 IP: ${log.formattedIp || log.ipAddress || "127.0.0.1"}`}
                            >
                              IP: {log.formattedIp || log.ipAddress || "127.0.0.1"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div 
                        className="text-right font-mono text-[10px] text-slate-400 shrink-0 whitespace-nowrap ml-2"
                        title={`记录时间: ${dt.full || dt.date + ' ' + dt.time}`}
                      >
                        <div>{dt.date}</div>
                        <div className="mt-0.5">{dt.time}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ================= 右侧 4 列：底座监控与安全中枢 ================= */}
        <div className="lg:col-span-4 space-y-6">
          {/* D. 核心系统微服务运行状态 */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-black text-slate-800 tracking-tight whitespace-nowrap">
                  核心系统服务状态
                </h3>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${
                  serviceTotal === 0
                    ? "bg-slate-100 text-slate-500 border-slate-200"
                    : allServicesNormal
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200/60"
                      : systemServices.some((s) => s.status === "down")
                        ? "bg-red-50 text-red-700 border-red-200/60"
                        : "bg-amber-50 text-amber-700 border-amber-200/60"
                }`}
              >
                {serviceTotal === 0
                  ? "暂无数据"
                  : allServicesNormal
                    ? "全链路正常"
                    : systemServices.some((s) => s.status === "down")
                      ? "存在服务异常"
                      : "部分服务需关注"}
              </span>
            </div>

            <div className="divide-y divide-slate-100 pt-1">
              {serviceTotal === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 font-medium">
                  暂无服务状态数据
                </div>
              ) : (
                systemServices.map((service) => {
                  const meta =
                    serviceStatusMeta[service.status] || serviceStatusMeta.warning;
                  const IconComp = serviceIcons[service.key] || Server;
                  return (
                    <div
                      key={service.key}
                      className="py-3 flex items-center justify-between gap-2 overflow-hidden"
                      title={`${service.name}\n状态: ${meta.label}\n实测延迟: ${service.latencyMs}ms\n详情: ${service.message}`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                          <IconComp className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-800 truncate whitespace-nowrap" title={service.name}>
                            {service.name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5 whitespace-nowrap truncate" title={service.message}>
                            响应延迟 {service.latencyMs}ms · {service.message}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 whitespace-nowrap ${meta.badge}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`}></span>
                        {meta.label}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <button
              type="button"
              onClick={() => setServicesModalOpen(true)}
              className="mt-3.5 w-full h-9 rounded-xl bg-slate-50 hover:bg-[#3182ce]/10 hover:text-[#3182ce] hover:border-[#3182ce]/40 border border-slate-200/80 text-xs font-bold text-slate-600 transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
            >
              <span>查看系统服务运行详情</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* E. AI 模型服务健康监控 */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Boxes className="w-4 h-4 text-purple-600" />
                <h3 className="text-sm font-black text-slate-800 tracking-tight whitespace-nowrap">
                  AI 模型服务监控
                </h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                数据库真实聚合
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-3">
              <div
                onClick={() => router.push("/admin/models")}
                title={`模型部署总数: ${ms?.deploymentTotal ?? 0} 个\n启用: ${ms?.deploymentEnabled ?? 0} · 禁用: ${ms?.deploymentDisabled ?? 0}`}
                className="p-3 bg-slate-50/70 hover:bg-purple-50/40 rounded-xl border border-slate-200/80 hover:border-purple-200 transition-all cursor-pointer group"
              >
                <div className="text-[11px] font-bold text-slate-500 group-hover:text-purple-700 transition-colors whitespace-nowrap">
                  模型部署总数
                </div>
                <div className="text-xl font-black font-mono text-purple-700 mt-1 whitespace-nowrap">
                  {ms?.deploymentTotal ?? 0}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate whitespace-nowrap">
                  启用 {ms?.deploymentEnabled ?? 0} · 禁用 {ms?.deploymentDisabled ?? 0}
                </div>
              </div>

              <div
                onClick={() => router.push("/admin/models")}
                title={`供应商通道: ${ms?.providerTotal ?? 0} 个\n活跃: ${ms?.providerEnabled ?? 0} 接入源`}
                className="p-3 bg-slate-50/70 hover:bg-blue-50/40 rounded-xl border border-slate-200/80 hover:border-blue-200 transition-all cursor-pointer group"
              >
                <div className="text-[11px] font-bold text-slate-500 group-hover:text-[#3182ce] transition-colors whitespace-nowrap">
                  供应商通道
                </div>
                <div className="text-xl font-black font-mono text-[#3182ce] mt-1 whitespace-nowrap">
                  {ms?.providerTotal ?? 0}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 truncate whitespace-nowrap">
                  活跃 {ms?.providerEnabled ?? 0} 接入源
                </div>
              </div>

              <div
                onClick={() => router.push("/admin/models")}
                title={`通道连通探测: 健康 ${ms?.healthy ?? 0} / 异常 ${ms?.error ?? 0}\n空间授权覆盖: ${ms?.policyTotal ?? 0} 个工作空间`}
                className="p-3 bg-slate-50/70 hover:bg-emerald-50/40 rounded-xl border border-slate-200/80 hover:border-emerald-200 transition-all cursor-pointer group col-span-2"
              >
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-bold text-slate-500 group-hover:text-emerald-700 transition-colors whitespace-nowrap">
                    模型通道连通健康
                  </div>
                  <span className="text-[10px] font-mono text-emerald-600 font-bold bg-white px-2 py-0.5 rounded border border-emerald-200 whitespace-nowrap">
                    健康 {ms?.healthy ?? 0} / 异常 {ms?.error ?? 0}
                  </span>
                </div>
                <div className="text-sm font-black font-mono text-slate-800 mt-1.5 flex items-center justify-between whitespace-nowrap">
                  <span className="text-xs font-bold text-slate-700">空间模型授权覆盖</span>
                  <span className="text-xs font-bold text-[#3182ce]">
                    {ms?.policyTotal ?? 0} 个空间已授权
                  </span>
                </div>
              </div>
            </div>

            {/* 优化后的双动作入口：模型列表 + 空间授权 */}
            <div className="mt-3.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/admin/models")}
                title="前往大模型部署管理与供应商通道配置"
                className="flex-1 h-8.5 rounded-xl bg-slate-50 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 border border-slate-200/80 text-xs font-bold text-slate-600 transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-2xs whitespace-nowrap"
              >
                <span>模型列表</span>
                <ChevronRight className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => router.push("/admin/workspaces/model-policy")}
                title="前往工作空间模型使用权限与白名单配置"
                className="flex-1 h-8.5 rounded-xl bg-slate-50 hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 border border-slate-200/80 text-xs font-bold text-slate-600 transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-2xs whitespace-nowrap"
              >
                <span>空间授权</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* F. 平台安全与风控大盘看板 */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-2xs">
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#3182ce]" />
                <h3 className="text-sm font-black text-slate-800 tracking-tight whitespace-nowrap">
                  安全审计与合规风控
                </h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">24H 实时监控</span>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-3">
              <div
                onClick={() => router.push("/admin/account-appeals")}
                title={`待审申诉工单: ${data.securitySummary?.pendingAppeals || data.pendingReviews || 0} 项待处理`}
                className="p-3 bg-slate-50/70 hover:bg-amber-50/40 rounded-xl border border-slate-200/80 hover:border-amber-200 transition-all cursor-pointer group"
              >
                <div className="text-[11px] font-bold text-slate-500 group-hover:text-amber-700 transition-colors whitespace-nowrap">
                  待审申诉工单
                </div>
                <div className="text-xl font-black font-mono text-amber-600 mt-1 whitespace-nowrap">
                  {data.securitySummary?.pendingAppeals || data.pendingReviews || 0}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">待人工复核</div>
              </div>

              <div
                onClick={() => router.push("/admin/users")}
                title={`封禁受控账号: ${data.securitySummary?.bannedUsers || 0} 人已隔离`}
                className="p-3 bg-slate-50/70 hover:bg-red-50/40 rounded-xl border border-slate-200/80 hover:border-red-200 transition-all cursor-pointer group"
              >
                <div className="text-[11px] font-bold text-slate-500 group-hover:text-red-700 transition-colors whitespace-nowrap">
                  封禁隔离账号
                </div>
                <div className="text-xl font-black font-mono text-red-600 mt-1 whitespace-nowrap">
                  {data.securitySummary?.bannedUsers || 0}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">高危受控</div>
              </div>

              <div
                onClick={() => router.push("/admin/logs")}
                title={`今日敏感操作审计: ${data.securitySummary?.todayOperations || 0} 次`}
                className="p-3 bg-slate-50/70 hover:bg-blue-50/40 rounded-xl border border-slate-200/80 hover:border-blue-200 transition-all cursor-pointer group"
              >
                <div className="text-[11px] font-bold text-slate-500 group-hover:text-[#3182ce] transition-colors whitespace-nowrap">
                  今日操作审计
                </div>
                <div className="text-xl font-black font-mono text-[#3182ce] mt-1 whitespace-nowrap">
                  {data.securitySummary?.todayOperations || 0}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">事件存证</div>
              </div>

              <div
                onClick={() => router.push("/admin/logs")}
                title={`今日安全鉴权登录: ${data.securitySummary?.todayLogins || data.systemLogs || 0} 次`}
                className="p-3 bg-slate-50/70 hover:bg-indigo-50/40 rounded-xl border border-slate-200/80 hover:border-indigo-200 transition-all cursor-pointer group"
              >
                <div className="text-[11px] font-bold text-slate-500 group-hover:text-indigo-700 transition-colors whitespace-nowrap">
                  今日登录鉴权
                </div>
                <div className="text-xl font-black font-mono text-indigo-600 mt-1 whitespace-nowrap">
                  {data.securitySummary?.todayLogins || data.systemLogs || 0}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 whitespace-nowrap">安全会话</div>
              </div>
            </div>

            <div className="mt-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/60 text-[11px] text-slate-500 flex items-center justify-between whitespace-nowrap">
              <span className="flex items-center gap-1.5 font-medium truncate">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">等保三级审计日志合规性监控中</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-1">已加密</span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. 极简大厂高质感微服务运行报告专属模态框 (知阁顶级设计系统规范) */}
      {servicesModalOpen && (
        <div
          onClick={() => setServicesModalOpen(false)}
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-slate-200/90 shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
          >
            {/* 模态头部 (知阁深邃知性蓝科技渐变) */}
            <div className="bg-gradient-to-r from-[#1e4e79] via-[#2b6cb0] to-[#3182ce] p-5 text-white flex items-center justify-between shrink-0 shadow-md">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center font-bold text-white shadow-xs backdrop-blur-xs shrink-0">
                  <Server className="w-5 h-5 text-blue-100" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-base tracking-tight">
                      系统核心服务运行状态详情
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                      实时心跳
                    </span>
                  </div>
                  <p className="text-[11px] text-blue-100/90 font-medium mt-0.5">
                    毫秒级真实状态检测 · 数据库读写、接口响应、文件存储与消息推送连通状态
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setServicesModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors cursor-pointer text-white shrink-0 ml-3"
                title="关闭 (Esc)"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* 顶层 3 联健康态势指标带 */}
            <div className="bg-slate-50/90 border-b border-slate-200/80 px-5 py-3 grid grid-cols-3 gap-3 shrink-0">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-500">综合健康评分</div>
                <div className="text-lg font-black font-mono text-emerald-600 mt-0.5">
                  {data.systemHealth} <span className="text-xs font-sans font-normal text-slate-400">/ 100</span>
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-500">服务在线覆盖率</div>
                <div className="text-lg font-black font-mono text-[#3182ce] mt-0.5">
                  {normalServiceCount} <span className="text-xs font-sans font-normal text-slate-400">/ {serviceTotal} 服务在线</span>
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                <div className="text-[11px] font-bold text-slate-500">平均链路延迟</div>
                <div className="text-lg font-black font-mono text-slate-800 mt-0.5">
                  {serviceTotal > 0
                    ? Math.round(
                        systemServices.reduce((acc, s) => acc + (s.latencyMs || 0), 0) / serviceTotal
                      )
                    : 0}{" "}
                  <span className="text-xs font-mono font-normal text-slate-400">ms</span>
                </div>
              </div>
            </div>

            {/* 详细列表卡片区 */}
            <div className="p-5 space-y-3 overflow-y-auto bg-slate-50/40 flex-1">
              {serviceTotal === 0 ? (
                <div className="text-center py-12 text-xs text-slate-400 font-medium">
                  暂无服务运行状态数据
                </div>
              ) : (
                systemServices.map((service) => {
                  const meta =
                    serviceStatusMeta[service.status] || serviceStatusMeta.warning;
                  const IconComp = serviceIcons[service.key] || Server;
                  
                  // 服务专属定制色与图标背景
                  const iconColors: Record<string, string> = {
                    database: "bg-blue-50 text-[#3182ce]",
                    api: "bg-indigo-50 text-indigo-600",
                    storage: "bg-amber-50 text-amber-600",
                    notification: "bg-emerald-50 text-emerald-600",
                  };
                  const colorClass = iconColors[service.key] || "bg-slate-100 text-slate-600";

                  return (
                    <div
                      key={service.key}
                      title={`服务名: ${service.name}\n实测延迟: ${service.latencyMs}ms\n自检信息: ${service.message}`}
                      className="p-4 bg-white rounded-xl border border-slate-200/80 shadow-2xs hover:shadow-xs hover:border-[#3182ce]/40 transition-all flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs ${colorClass}`}>
                          <IconComp className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-800 truncate">
                              {service.name}
                            </h4>
                            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded shrink-0">
                              {service.key}
                            </span>
                          </div>
                          <div
                            className="text-xs text-slate-500 truncate mt-0.5 font-medium"
                            title={service.message}
                          >
                            {service.message}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${meta.badge}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`}></span>
                          {meta.label}
                        </span>
                        <span className="text-[11px] text-slate-500 font-mono font-bold bg-slate-50 border border-slate-200/60 px-2 py-0.2 rounded-md">
                          延迟 {service.latencyMs} ms
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 模态框底部控制区 */}
            <div className="p-4 bg-white border-t border-slate-200/80 flex items-center justify-between shrink-0">
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                按 <kbd className="px-1.5 py-0.5 rounded bg-slate-100 border text-slate-500 font-mono text-[10px]">Esc</kbd> 键或点击外部遮罩可快速退出
              </span>
              <div className="flex items-center gap-2.5 ml-auto sm:ml-0">
                <button
                  type="button"
                  onClick={() => setServicesModalOpen(false)}
                  className="px-4 h-9 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  关闭
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setServicesModalOpen(false);
                    router.push("/admin/system-status");
                  }}
                  className="inline-flex items-center gap-1.5 px-4.5 h-9 rounded-xl bg-[#3182ce] hover:bg-[#2b6cb0] text-white text-xs font-bold shadow-xs hover:shadow-md transition-all cursor-pointer"
                >
                  <span>前往全量系统监控中心</span>
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
