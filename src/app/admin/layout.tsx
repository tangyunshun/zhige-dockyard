"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Settings,
  FileText,
  BarChart3,
  LogOut,
  ArrowLeft,
  Shield,
  ClipboardList,
  Menu,
  X,
  Crown,
  Coins,
  Cpu,
  Package,
  Boxes,
  Building2,
  AlertCircle,
  TrendingUp,
  Megaphone,
  HeartPulse,
  UserCheck,
  Key,
  Wrench,
  ShieldAlert,
  Briefcase,
  Banknote,
  ReceiptText,
  ChevronLeft,
  ChevronRight,
  Quote,
  Scale,
} from "lucide-react";
import { useLogout } from "@/hooks/useLogout";
import { UserInfo } from "@/contexts/UserContext";
import { AdminPermissionProvider } from "@/contexts/AdminPermissionContext";
import LoginNotificationPopup from "@/components/LoginNotificationPopup";
import DashboardSidebarNav from "@/components/DashboardSidebarNav";

interface AdminMenuItem {
  icon: any;
  label: string;
  href: string;
  description: string;
  /** 侧边栏分组名（按业务域归类，减少长列表查找成本） */
  group?: string;
  superAdminOnly?: boolean;
  requiredPermission?: string;
  /** 任一权限满足即可见（用于融合页承载多数据源时的菜单可见性判定） */
  requiredPermissions?: string[];
}

/** 后台侧边栏分组顺序（按「日常运营 → 商业财务 → 内容 → 系统治理」递进） */
const ADMIN_NAV_GROUP_ORDER = [
  "概览",
  "用户与风控",
  "空间与组织",
  "内容与组件",
  "财务与订单",
  "系统运维",
  "权限与安全",
  "扩展模块",
];

const adminMenuItems: AdminMenuItem[] = [
  {
    icon: LayoutDashboard,
    label: "后台总览",
    href: "/admin",
    description: "系统概览和统计数据",
    group: "概览",
  },
  {
    icon: Users,
    label: "用户管理",
    href: "/admin/users",
    description: "用户列表、角色变更与审核",
    group: "用户与风控",
    requiredPermission: "user:read",
  },
  {
    icon: ShieldAlert,
    label: "风控与审核",
    href: "/admin/account-appeals",
    description: "平台安全风控管控与全域审核中枢",
    group: "用户与风控",
    requiredPermission: "user:update",
  },
  {
    icon: Cpu,
    label: "空间模型策略",
    href: "/admin/workspaces/model-policy",
    description: "按工作空间配置默认模型与可用模型白名单",
    group: "空间与组织",
    // 与接口鉴权对齐：system:manage / model:read / model:manage 任一即可查看（写入由接口额外校验）
    requiredPermissions: ["system:manage", "model:read", "model:manage"],
  },
  {
    icon: FolderKanban,
    label: "工作空间管理",
    href: "/admin/workspaces",
    description: "工作空间审查与资源配额",
    group: "空间与组织",
    requiredPermission: "workspace:read",
  },
  {
    icon: Boxes,
    label: "空间套餐管理",
    href: "/admin/workspace/plans",
    description: "配置企业空间套餐价格与配额",
    group: "空间与组织",
    requiredPermission: "workspace_plan:read",
  },
  {
    icon: Briefcase,
    label: "岗位管理",
    href: "/admin/posts",
    description: "平台官方标准岗位库与一键分发",
    group: "空间与组织",
    requiredPermission: "post:read",
  },
  {
    icon: Package,
    label: "组件管理",
    href: "/admin/components",
    description: "功能组件上架与下架控制",
    group: "内容与组件",
    requiredPermission: "component:read",
  },
  {
    icon: Package,
    label: "组件阶段管理",
    href: "/admin/content",
    description: "维护平台组件的阶段大纲",
    group: "内容与组件",
    requiredPermission: "content:read",
  },
  {
    icon: Quote,
    label: "用户评价",
    href: "/admin/testimonials",
    description: "维护首页用户评价与每周轮换",
    group: "内容与组件",
    requiredPermission: "user_reviews:read",
  },
  {
    icon: FileText,
    label: "文档管理",
    href: "/admin/documents",
    description: "平台使用手册与用户指南",
    group: "内容与组件",
    requiredPermission: "document:read",
  },
  {
    icon: Megaphone,
    label: "通知公告",
    href: "/admin/notifications",
    description: "全局系统广播及运维通知",
    group: "内容与组件",
    requiredPermission: "announcement:read",
  },
  {
    icon: Crown,
    label: "会员套餐管理",
    href: "/admin/membership",
    description: "配置空间套餐计费策略",
    group: "财务与订单",
  },
  {
    icon: Coins,
    label: "算力加油包管理",
    href: "/admin/membership/token-packs",
    description: "后台维护与上下架充值算力包",
    group: "财务与订单",
  },
  {
    icon: Banknote,
    label: "充值工单审批",
    href: "/admin/finance/recharge-orders",
    description: "对公转账 / 合同结算充值工单审批与确认到账",
    group: "财务与订单",
    requiredPermission: "order:read",
  },
  {
    icon: ReceiptText,
    label: "算力总账",
    href: "/admin/finance/points",
    description: "平台算力点发放、消耗、对账与到期清算",
    group: "财务与订单",
    requiredPermission: "order:read",
  },
  {
    icon: Scale,
    label: "结算人工复核",
    href: "/admin/finance/settlements",
    description: "待复核异常结算单核定扣减与退款释放",
    group: "财务与订单",
    requiredPermission: "order:read",
  },
  {
    icon: Scale,
    label: "退款申请审批",
    href: "/admin/finance/refund-requests",
    description: "审批用户提交的算力点退款申请（同意即真实退点入账）",
    group: "财务与订单",
    requiredPermission: "order:read",
  },
  {
    icon: ClipboardList,
    label: "订单管理",
    href: "/admin/orders",
    description: "查看并维护用户支付订单",
    group: "财务与订单",
    requiredPermission: "order:read",
  },
  {
    icon: ClipboardList,
    label: "审计日志",
    href: "/admin/operation-logs",
    description: "操作审计流水与登录历史审计",
    group: "系统运维",
    // 融合页同时承载「操作审计流水」与「登录安全历史」：具备任一相关只读权限即可进入
    requiredPermissions: ["audit_log:read", "audit:operation_read", "audit:login_read"],
  },
  {
    icon: HeartPulse,
    label: "系统状态",
    href: "/admin/system-status",
    description: "各微服务健康状况监控",
    group: "系统运维",
    requiredPermission: "system:health_read",
  },
  {
    icon: Cpu,
    label: "模型注册表",
    href: "/admin/models",
    description: "AI 模型供应商与模型部署：价格、能力、启用状态与平台默认模型",
    group: "系统运维",
    // 可读名单与接口鉴权完全对齐：持有任一模型相关权限即可进入（接口侧同样强制校验，前端隐藏不构成安全边界）
    requiredPermissions: ["system:manage", "model:read", "model:manage"],
  },
  {
    icon: Wrench,
    label: "维护模式",
    href: "/admin/maintenance",
    description: "开关系统临时停机维护模式",
    group: "系统运维",
    superAdminOnly: true,
  },
  {
    icon: Settings,
    label: "系统设置",
    href: "/admin/settings",
    description: "全局配置、第三方集成与安全",
    group: "权限与安全",
    superAdminOnly: true,
  },
  {
    icon: UserCheck,
    label: "管理员管理",
    href: "/admin/administrators",
    description: "配置平台运维管理员名单",
    group: "权限与安全",
    superAdminOnly: true,
  },
  {
    icon: Key,
    label: "权限配置",
    href: "/admin/permissions",
    description: "普通管理员模块权限分配",
    group: "权限与安全",
    superAdminOnly: true,
  },
  {
    icon: ShieldAlert,
    label: "接口权限设置",
    href: "/admin/permissions/api-rules",
    description: "高危安全配置：仅超级管理员可维护",
    group: "权限与安全",
    // 高危安全配置：菜单仅对超管展示（接口侧同样强制校验，前端隐藏不构成安全边界）
    superAdminOnly: true,
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { logout: handleLogout, confirmDialog } = useLogout();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isForbidden, setIsForbidden] = useState(false);
  const [forbiddenReason, setForbiddenReason] = useState<string>("");
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  /** 后台「注册功能模块」生成的动态菜单项（来自 /api/admin/nav-modules，无需改代码即可出现） */
  const [dynamicNavModules, setDynamicNavModules] = useState<
    { id: string; label: string; href: string; description: string; requiredPermission: string }[]
  >([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  // 管理员待办角标（待审核申诉 + 待审批充值工单），展示在「后台总览」菜单项旁
  const [pendingTaskCount, setPendingTaskCount] = useState(0);

  const getCleanRole = (role: string | null | undefined): string => {
    if (!role) return "USER";
    const r = role.toUpperCase().trim();
    if (r === "SUPER_ADMIN" || r === "SUPERADMIN" || r === "SUPER_ADMIN_ROLE" || r === "SUPER") {
      return "SUPER_ADMIN";
    }
    if (r === "ADMIN" || r === "PLATFORM_ADMIN" || r === "PLATFORMADMIN" || r === "PLATFORM_ADMIN_ROLE") {
      return "PLATFORM_ADMIN";
    }
    return "USER";
  };

  const cleanRole = getCleanRole(user?.role);
  const isSuperAdmin = cleanRole === "SUPER_ADMIN";

  const filteredStaticMenuItems = adminMenuItems.filter((item) => {
    if (item.superAdminOnly) {
      return isSuperAdmin;
    }
    // 会员套餐管理：默认仅超级管理员可见，除非普通管理员被单独授予 membership:manage 权限
    if (item.href === "/admin/membership") {
      return isSuperAdmin || permissions.includes("membership:manage");
    }
    if (item.requiredPermission && !isSuperAdmin) {
      return permissions.includes(item.requiredPermission);
    }
    if (item.requiredPermissions?.length && !isSuperAdmin) {
      return item.requiredPermissions.some((p) => permissions.includes(p));
    }
    return true;
  });

  // 动态菜单：后台「注册功能模块」后自动出现（服务端已按权限过滤并校验页面真实存在）。
  // 与硬编码菜单重复的 href 以硬编码项为准（保留更精细的图标与排序）。
  const dynamicMenuItems = dynamicNavModules
    .filter((m) => !adminMenuItems.some((i) => i.href === m.href))
    .map((m) => ({
      icon: Boxes,
      label: m.label,
      href: m.href,
      description: m.description || "自定义功能模块",
      group: "扩展模块",
    }));

  const displayedMenuItems = [...filteredStaticMenuItems, ...dynamicMenuItems];

  useEffect(() => {
    checkAdminPermission();
  }, [router]);

  // 待办角标：随路由切换自动刷新，管理员处理完工单返回即可看到最新数量
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const loadPendingTasks = async () => {
      try {
        const res = await fetch("/api/admin/pending-tasks");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPendingTaskCount(Number(data?.total) || 0);
      } catch (error) {
        console.error("Fetch pending tasks error:", error);
      }
    };
    loadPendingTasks();
    // 页面内处理完待办（审批申诉 / 审批充值工单）后派发该事件，角标立即刷新，无需刷新页面
    const onPendingChanged = () => loadPendingTasks();
    window.addEventListener("admin-pending-tasks-changed", onPendingChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("admin-pending-tasks-changed", onPendingChanged);
    };
  }, [isAdmin, pathname]);

  // 当路由或用户状态改变时，强制拦截非法越权访问
  useEffect(() => {
    if (!loading && isAdmin && user) {
      const isSuperUser = getCleanRole(user.role) === "SUPER_ADMIN";
      
      // 强校验当前超级管理员专属高危路由的可访问性
      // 说明：接口权限设置（/admin/permissions/api-rules）同为超管专属高危配置，
      // 这里显式列出并用「路径段边界」匹配，避免再被 /admin/permissions 前缀"顺带"覆盖而产生歧义。
      const superOnlyPaths = [
        "/admin/settings",
        "/admin/administrators",
        "/admin/permissions",
        "/admin/permissions/api-rules",
        "/admin/maintenance"
      ];
      const isSuperOnlyPath = superOnlyPaths.some(
        (p) => pathname === p || pathname.startsWith(p + "/")
      );
      if (isSuperOnlyPath && !isSuperUser) {
        router.replace("/admin");
        return;
      }

      // 会员套餐管理页面的财务权限校验
      if (pathname.startsWith("/admin/membership")) {
        const canAccessMembership = isSuperUser || permissions.includes("membership:manage");
        if (!canAccessMembership) {
          router.replace("/admin");
          return;
        }
      }

      // 验证子模块动态权限的可访问性
      const currentItem = [...adminMenuItems, ...dynamicNavModules].find(
        (item) => pathname === item.href || pathname.startsWith(item.href + "/")
      );
      if (currentItem && !isSuperUser) {
        const required = [
          ...(currentItem.requiredPermission ? [currentItem.requiredPermission] : []),
          ...((currentItem as AdminMenuItem).requiredPermissions || []),
        ];
        if (required.length > 0 && !required.some((p) => permissions.includes(p))) {
          router.replace("/admin");
        }
      }
    }
  }, [pathname, loading, isAdmin, user, permissions]);

  const checkAdminPermission = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.push("/auth/login?redirect=/admin");
        return;
      }

      const data = await res.json();
      setUser(data.user);
      setPermissions(data.permissions || []);

      // 拉取「注册功能模块」生成的动态菜单（失败静默降级为仅显示硬编码菜单）
      try {
        const navRes = await fetch("/api/admin/nav-modules", { cache: "no-store" });
        if (navRes.ok) {
          const navData = await navRes.json();
          setDynamicNavModules(Array.isArray(navData?.items) ? navData.items : []);
        }
      } catch {
        // 忽略：不影响后台正常渲染
      }

      // 使用清洗后的标准角色进行验证
      const currentCleanRole = getCleanRole(data.user?.role);
      if (currentCleanRole !== "SUPER_ADMIN" && currentCleanRole !== "PLATFORM_ADMIN") {
        setForbiddenReason("很抱歉，当前账户未被授予进入平台运营治理中心的权限。");
        setIsForbidden(true);
        return;
      }

      // 若平台运营管理员的后台管理特权已被停用，阻断其后台访问（其前台账号与空间功能不受任何影响）
      if (currentCleanRole === "PLATFORM_ADMIN" && data.user?.adminStatus === "inactive") {
        setForbiddenReason("您的管理员后台管理权限已被超级管理员临时停用（您的全站前台账号、企业空间创建与协作功能完全正常不受影响）。如需恢复后台管理请联系超级管理员。");
        setIsForbidden(true);
        return;
      }

      // 强校验当前超级管理员专属路由的可访问性
      const isSuperUser = currentCleanRole === "SUPER_ADMIN";
      const superOnlyPaths = [
        "/admin/settings",
        "/admin/administrators",
        "/admin/permissions",
        "/admin/permissions/api-rules",
        "/admin/maintenance"
      ];
      const isSuperOnlyPath = superOnlyPaths.some(
        (p) => pathname === p || pathname.startsWith(p + "/")
      );
      if (isSuperOnlyPath && !isSuperUser) {
        router.replace("/admin");
        return;
      }

      // 会员套餐管理页面的动态财务权限校验
      if (pathname.startsWith("/admin/membership")) {
        const canAccessMembership = isSuperUser || (data.permissions || []).includes("membership:manage");
        if (!canAccessMembership) {
          router.replace("/admin");
          return;
        }
      }

      setIsAdmin(true);
    } catch (error) {
      console.error("Check admin permission error:", error);
      router.push("/auth/login?redirect=/admin");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">加载中...</p>
        </div>
      </div>
    );
  }

  if (isForbidden) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md w-full bg-white border border-slate-200/80 rounded-2xl shadow-xl p-8 space-y-6">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto text-red-500 shadow-inner">
            <Shield className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800">403 访问受限</h2>
            <p className="text-xs font-semibold text-slate-500 leading-relaxed">
              {forbiddenReason || (
                <>
                  很抱歉，当前账户未被授予进入平台运营治理中心的权限。<br />
                  请使用平台管理员或超级管理员账号重新登录。
                </>
              )}
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => router.replace("/workspace-hub")}
              className="w-full h-10 rounded-lg bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold shadow-sm hover:shadow hover:-translate-y-0.5 active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-center"
            >
              返回前台空间中枢
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex">
      {/* 侧边栏 - 桌面端 */}
      <aside
        className={`hidden lg:flex ${
          isCollapsed ? "w-20" : "w-64"
        } shrink-0 bg-white border-r border-slate-200 flex-col transition-all duration-300 ease-in-out`}
      >
        {/* 侧边栏头部：品牌身份与快捷导航一体化设计，消除生硬割裂感 */}
        <div className="border-b border-slate-200/80 shrink-0 bg-white">
          {isCollapsed ? (
            /* 折叠态：居中精致徽章 + 返回首页 + 展开按钮 */
            <div className="flex flex-col items-center py-3.5 gap-3">
              {/* 身份微徽章 */}
              <div
                className="relative group cursor-default"
                title={isSuperAdmin ? "超级管理员后台" : "平台管理员后台"}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs border transition-all ${
                    isSuperAdmin
                      ? "bg-gradient-to-br from-amber-50 to-amber-100/90 border-amber-200/90 text-amber-600"
                      : "bg-gradient-to-br from-blue-50 to-blue-100/90 border-blue-200/90 text-[#3182ce]"
                  }`}
                >
                  {isSuperAdmin ? (
                    <Crown className="w-5 h-5 text-amber-500 animate-pulse" />
                  ) : (
                    <Shield className="w-5 h-5 text-[#3182ce]" />
                  )}
                </div>
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-slate-800 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity font-bold">
                  {isSuperAdmin ? "超级管理员后台" : "平台管理员后台"}
                </div>
              </div>

              {/* 返回首页按钮 */}
              <div className="relative group">
                <button
                  type="button"
                  onClick={() => router.push("/")}
                  className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-[#3182ce] border border-slate-200/80 hover:border-blue-200 transition-all cursor-pointer shadow-2xs"
                  title="返回站点首页"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-slate-800 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity font-medium">
                  返回站点首页
                </div>
              </div>

              {/* 展开侧边栏按钮 */}
              <button
                type="button"
                onClick={() => setIsCollapsed(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
                title="展开菜单"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* 展开态：品牌身份主行 + 下嵌轻质感返回首页胶囊 */
            <div className="p-3.5 space-y-3">
              {/* 顶行：身份标识与折叠操作 */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {/* 身份徽标盒 */}
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs border shrink-0 ${
                      isSuperAdmin
                        ? "bg-gradient-to-br from-amber-50 to-amber-100/80 border-amber-200/80 text-amber-600"
                        : "bg-gradient-to-br from-blue-50 to-blue-100/80 border-blue-200/80 text-[#3182ce]"
                    }`}
                  >
                    {isSuperAdmin ? (
                      <Crown className="w-5 h-5 text-amber-500 animate-pulse" />
                    ) : (
                      <Shield className="w-5 h-5 text-[#3182ce]" />
                    )}
                  </div>

                  {/* 标题与副标 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-sm text-slate-800 truncate">
                        {isSuperAdmin ? "超级管理员" : "平台管理员"}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-black shrink-0 ${
                          isSuperAdmin
                            ? "bg-amber-50 text-amber-600 border border-amber-200/80"
                            : "bg-blue-50 text-blue-600 border border-blue-200/80"
                        }`}
                      >
                        {isSuperAdmin ? "超管" : "管理员"}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono tracking-wider truncate mt-0.5">
                      ZhiGe Dockyard OS
                    </div>
                  </div>
                </div>

                {/* 收起菜单按钮 */}
                <button
                  type="button"
                  onClick={() => setIsCollapsed(true)}
                  className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center transition-colors shrink-0 cursor-pointer"
                  title="收起菜单"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              </div>

              {/* 底行：返回首页宽裕按钮，移除 Portal 标签，区域更加宽阔舒适 */}
              <button
                type="button"
                onClick={() => router.push("/")}
                className="w-full flex items-center justify-center gap-2.5 px-3 py-2.5 rounded-lg bg-slate-50/90 hover:bg-blue-50/80 border border-slate-200/80 hover:border-blue-200 text-slate-700 hover:text-[#3182ce] transition-all group cursor-pointer shadow-2xs"
                title="返回知阁·舟坊前台首页"
              >
                <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-[#3182ce] group-hover:-translate-x-1 transition-transform shrink-0" />
                <span className="text-[13px] font-bold tracking-wide">返回门户首页</span>
              </button>
            </div>
          )}
        </div>

        {/* 导航菜单：按业务域分组折叠展示 + 菜单检索，功能变多也能快速定位 */}
        <DashboardSidebarNav
          items={displayedMenuItems}
          groupOrder={ADMIN_NAV_GROUP_ORDER}
          collapsed={isCollapsed}
          onNavigate={(href) => router.push(href)}
          onExpand={() => setIsCollapsed(false)}
          badge={{ href: "/admin", count: pendingTaskCount }}
          searchPlaceholder="搜索后台功能…"
        />

        {/* 用户信息 */}
        <div
          className={`p-4 border-t border-slate-200 shrink-0 ${
            isCollapsed ? "flex flex-col items-center gap-3" : ""
          }`}
        >
          {isCollapsed ? (
            <>
              <div className="relative group">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name || "管理员头像"}
                    className="w-10 h-10 shrink-0 rounded-lg object-cover shadow-md border border-slate-200"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold shadow-md">
                    {user?.name?.charAt(0).toUpperCase() || "A"}
                  </div>
                )}
                <div className="absolute left-full bottom-0 mb-2 ml-2 px-2 py-1.5 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                  <div className="font-bold">{user?.name || "系统用户"}</div>
                  <div className="text-slate-300">
                    {user?.email || "未设置邮箱"}
                  </div>
                  <div className="text-slate-400 text-[10px] mt-0.5">
                    {isSuperAdmin ? "超级管理员" : "平台管理员"}
                  </div>
                </div>
              </div>
              <div className="relative group">
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                  title="退出登录"
                >
                  <LogOut className="w-5 h-5" />
                </button>
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                  退出登录
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-3">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name || "管理员头像"}
                    className="w-10 h-10 shrink-0 rounded-lg object-cover shadow-md border border-slate-200"
                    onError={(e) => {
                      // 图片加载失败降级展示渐变字母框
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold shadow-md">
                    {user?.name?.charAt(0).toUpperCase() || "A"}
                  </div>
                )}
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-extrabold text-slate-800 truncate">
                      {user?.name || "系统用户"}
                    </span>
                    {isSuperAdmin ? (
                      <span className="px-1.5 py-0.2 rounded text-[8px] font-black bg-amber-50 text-amber-600 border border-amber-100 select-none shrink-0">
                        超管
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 rounded text-[8px] font-black bg-blue-50 text-blue-600 border border-blue-100 select-none shrink-0">
                        管理员
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 font-bold truncate mt-0.5">
                    {user?.email || "未设置邮箱"}
                  </div>
                </div>
              </div>

              {/* 退出登录按钮 - 直接显示 */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-sm font-bold"
              >
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            </>
          )}
        </div>
      </aside>

      {/* 移动端菜单按钮 */}
      <button
        onClick={() => setShowMobileMenu(!showMobileMenu)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-lg border border-slate-200"
      >
        {showMobileMenu ? (
          <X className="w-6 h-6 text-slate-600" />
        ) : (
          <Menu className="w-6 h-6 text-slate-600" />
        )}
      </button>

      {/* 移动端侧边栏 */}
      {showMobileMenu && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setShowMobileMenu(false)}
          />
          <aside className="lg:hidden fixed left-0 top-0 bottom-0 w-72 bg-white z-50 shadow-2xl flex flex-col">
            {/* 移动端侧边栏头部：一体化品牌与返回首页 */}
            <div className="p-4 border-b border-slate-200/80 shrink-0 bg-white space-y-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-xs border shrink-0 ${
                    isSuperAdmin
                      ? "bg-gradient-to-br from-amber-50 to-amber-100/80 border-amber-200/80 text-amber-600"
                      : "bg-gradient-to-br from-blue-50 to-blue-100/80 border-blue-200/80 text-[#3182ce]"
                  }`}
                >
                  {isSuperAdmin ? (
                    <Crown className="w-5 h-5 text-amber-500 animate-pulse" />
                  ) : (
                    <Shield className="w-5 h-5 text-[#3182ce]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-sm text-slate-800 truncate">
                      {isSuperAdmin ? "超级管理员" : "平台管理员"}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded text-[9px] font-black shrink-0 ${
                        isSuperAdmin
                          ? "bg-amber-50 text-amber-600 border border-amber-200/80"
                          : "bg-blue-50 text-blue-600 border border-blue-200/80"
                      }`}
                    >
                      {isSuperAdmin ? "超管" : "管理员"}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono tracking-wider truncate mt-0.5">
                    ZhiGe Dockyard OS
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowMobileMenu(false);
                  router.push("/");
                }}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg bg-slate-50 hover:bg-blue-50/80 border border-slate-200/80 hover:border-blue-200 text-slate-700 hover:text-[#3182ce] transition-all group cursor-pointer shadow-2xs"
                title="返回知阁·舟坊前台首页"
              >
                <ArrowLeft className="w-4 h-4 text-slate-400 group-hover:text-[#3182ce] group-hover:-translate-x-1 transition-transform shrink-0" />
                <span className="text-[13px] font-bold tracking-wide">返回门户首页</span>
              </button>
            </div>

            <DashboardSidebarNav
              items={displayedMenuItems}
              groupOrder={ADMIN_NAV_GROUP_ORDER}
              collapsed={false}
              onNavigate={(href) => {
                router.push(href);
                setShowMobileMenu(false);
              }}
              badge={{ href: "/admin", count: pendingTaskCount }}
              searchPlaceholder="搜索后台功能…"
            />

            <div className="p-4 border-t border-slate-200 shrink-0 bg-white">
              <div className="flex items-center gap-3 mb-3">
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name || "管理员头像"}
                    className="w-10 h-10 shrink-0 rounded-lg object-cover shadow-md border border-slate-200"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold shadow-md">
                    {user?.name?.charAt(0).toUpperCase() || "A"}
                  </div>
                )}
                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm font-extrabold text-slate-800 truncate">
                      {user?.name || "系统用户"}
                    </span>
                    {isSuperAdmin ? (
                      <span className="px-1.5 py-0.2 rounded text-[8px] font-black bg-amber-50 text-amber-600 border border-amber-100 select-none shrink-0">超管</span>
                    ) : (
                      <span className="px-1.5 py-0.2 rounded text-[8px] font-black bg-blue-50 text-blue-600 border border-blue-100 select-none shrink-0">管理员</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 font-bold truncate mt-0.5">
                    {user?.email || "未设置邮箱"}
                  </div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-sm font-bold"
              >
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            </div>
          </aside>
        </>
      )}

      {/* 主内容区 - 应用 Flex 防溢出规范 */}
      <main className="flex-1 min-h-0 min-w-0 flex flex-col">
        {/* 顶部栏 */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <h1 className="text-xl font-bold text-slate-800 truncate">
              {pathname === "/admin" 
                ? (isSuperAdmin ? "超级管理员工作台" : "平台管理工作台")
                : (adminMenuItems.find((item) => item.href === pathname)?.label || "管理员后台")}
            </h1>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <span className="text-sm text-slate-500 whitespace-nowrap">
              {new Date().toLocaleDateString("zh-CN", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
        </header>

        {/* 内容区 - 局部滚动 */}
        <AdminPermissionProvider user={user} permissions={permissions} loading={loading}>
          <div className="flex-1 overflow-y-auto p-6 min-h-0">{children}</div>
        </AdminPermissionProvider>
      </main>

      {/* 退出登录二次确认弹窗 */}
      {confirmDialog}

      {/* 登录强提醒弹窗：管理员后台布局不含 GlobalHeader，需在此单独挂载，
          否则勾选了「登录时强提醒弹窗」的通知在管理员登录后不会弹出 */}
      <LoginNotificationPopup />

    </div>
  );
}
