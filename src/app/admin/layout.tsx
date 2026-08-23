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
  Package,
  Building2,
  AlertCircle,
  TrendingUp,
  Megaphone,
  HeartPulse,
  UserCheck,
  Key,
  Wrench,
} from "lucide-react";
import { useLogout } from "@/hooks/useLogout";
import { UserInfo } from "@/contexts/UserContext";

interface AdminMenuItem {
  icon: any;
  label: string;
  href: string;
  description: string;
  superAdminOnly?: boolean;
  requiredPermission?: string;
}

const adminMenuItems: AdminMenuItem[] = [
  {
    icon: LayoutDashboard,
    label: "后台总览",
    href: "/admin",
    description: "系统概览和统计数据",
  },
  {
    icon: Users,
    label: "用户管理",
    href: "/admin/users",
    description: "用户列表、角色变更与审核",
    requiredPermission: "user:read",
  },
  {
    icon: FolderKanban,
    label: "企业空间管理",
    href: "/admin/workspaces",
    description: "工作空间审查与资源配额",
    requiredPermission: "workspace:read",
  },
  {
    icon: Package,
    label: "组件管理",
    href: "/admin/components",
    description: "功能组件上架与下架控制",
    requiredPermission: "component:read",
  },
  {
    icon: Crown,
    label: "会员套餐管理",
    href: "/admin/membership",
    description: "配置空间套餐计费策略",
  },
  {
    icon: ClipboardList,
    label: "订单管理",
    href: "/admin/orders",
    description: "查看并维护用户支付订单",
    requiredPermission: "order:read",
  },
  {
    icon: Package,
    label: "内容管理",
    href: "/admin/content",
    description: "配置管理组件开发阶段大纲",
    requiredPermission: "content:read",
  },
  {
    icon: FileText,
    label: "文档管理",
    href: "/admin/documents",
    description: "平台使用手册与用户指南",
    requiredPermission: "document:read",
  },
  {
    icon: Megaphone,
    label: "通知公告",
    href: "/admin/notifications",
    description: "全局系统广播及运维通知",
    requiredPermission: "announcement:read",
  },
  {
    icon: ClipboardList,
    label: "审计日志",
    href: "/admin/operation-logs",
    description: "系统高危操作审计记录",
    requiredPermission: "audit:read",
  },
  {
    icon: HeartPulse,
    label: "系统状态",
    href: "/admin/system-status",
    description: "各微服务健康状况监控",
    requiredPermission: "system:health_read",
  },
  {
    icon: Settings,
    label: "系统设置",
    href: "/admin/settings",
    description: "全局配置、第三方集成与安全",
    superAdminOnly: true,
  },
  {
    icon: UserCheck,
    label: "管理员管理",
    href: "/admin/administrators",
    description: "配置平台运维管理员名单",
    superAdminOnly: true,
  },
  {
    icon: Key,
    label: "权限配置",
    href: "/admin/permissions",
    description: "普通管理员模块权限分配",
    superAdminOnly: true,
  },
  {
    icon: Wrench,
    label: "维护模式",
    href: "/admin/maintenance",
    description: "开关系统临时停机维护模式",
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
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);

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

  const displayedMenuItems = adminMenuItems.filter((item) => {
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
    return true;
  });

  useEffect(() => {
    checkAdminPermission();
  }, [router]);

  // 当路由或用户状态改变时，强制拦截非法越权访问
  useEffect(() => {
    if (!loading && isAdmin && user) {
      const isSuperUser = getCleanRole(user.role) === "SUPER_ADMIN";
      
      // 强校验当前超级管理员专属高危路由的可访问性
      const superOnlyPaths = [
        "/admin/settings",
        "/admin/administrators",
        "/admin/permissions",
        "/admin/maintenance"
      ];
      const isSuperOnlyPath = superOnlyPaths.some(p => pathname.startsWith(p));
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
      const currentItem = adminMenuItems.find(item => pathname === item.href || pathname.startsWith(item.href + "/"));
      if (currentItem && currentItem.requiredPermission && !isSuperUser) {
        if (!permissions.includes(currentItem.requiredPermission)) {
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

      // 使用清洗后的标准角色进行验证
      const currentCleanRole = getCleanRole(data.user?.role);
      if (currentCleanRole !== "SUPER_ADMIN" && currentCleanRole !== "PLATFORM_ADMIN") {
        setIsForbidden(true);
        return;
      }

      // 强校验当前超级管理员专属路由的可访问性
      const isSuperUser = currentCleanRole === "SUPER_ADMIN";
      const superOnlyPaths = [
        "/admin/settings",
        "/admin/administrators",
        "/admin/permissions",
        "/admin/maintenance"
      ];
      const isSuperOnlyPath = superOnlyPaths.some(p => pathname.startsWith(p));
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
              很抱歉，当前账户未被授予进入平台运营治理中心的权限。<br />
              请使用平台管理员或超级管理员账号重新登录。
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
      <aside className="hidden lg:flex w-64 shrink-0 bg-white border-r border-slate-200 flex-col">
        {/* 返回首页按钮 */}
        <div className="h-16 flex items-center px-6 border-b border-slate-200 shrink-0">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-[#3182ce]/10 to-[#2b6cb0]/10 text-[#3182ce] hover:bg-gradient-to-r hover:from-[#3182ce]/20 hover:to-[#2b6cb0]/20 transition-all w-full"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-bold text-sm">返回首页</span>
          </button>
        </div>

        {/* 管理员标识 */}
        <div className="px-6 py-4 bg-gradient-to-br from-[#3182ce]/5 to-[#2b6cb0]/5 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            {isSuperAdmin ? (
              <>
                <Crown className="w-5 h-5 text-amber-500 animate-pulse" />
                <span className="font-extrabold text-sm text-slate-800">超级管理员后台</span>
              </>
            ) : (
              <>
                <Shield className="w-5 h-5 text-[#3182ce]" />
                <span className="font-extrabold text-sm text-slate-800">平台管理员后台</span>
              </>
            )}
          </div>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto min-h-0">
          {displayedMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white shadow-lg shadow-[#3182ce]/30"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <div className="text-left min-w-0">
                  <div className="text-sm font-bold truncate">{item.label}</div>
                  <div
                    className={`text-xs truncate ${isActive ? "text-white/80" : "text-slate-400"}`}
                  >
                    {item.description}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>

        {/* 用户信息 */}
        <div className="p-4 border-t border-slate-200 shrink-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold shadow-md">
              {user?.name?.charAt(0).toUpperCase() || "A"}
            </div>
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

          {/* 退出登录按钮 - 直接显示 */}
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-sm font-bold"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
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
            <div className="h-16 flex items-center px-6 border-b border-slate-200 shrink-0">
              <button
                onClick={() => router.push("/")}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-[#3182ce]/10 to-[#2b6cb0]/10 text-[#3182ce] hover:bg-gradient-to-r hover:from-[#3182ce]/20 hover:to-[#2b6cb0]/20 transition-all w-full"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="font-bold text-sm">返回首页</span>
              </button>
            </div>

            <div className="px-6 py-4 bg-gradient-to-br from-[#3182ce]/5 to-[#2b6cb0]/5 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2">
                {isSuperAdmin ? (
                  <>
                    <Crown className="w-5 h-5 text-amber-500" />
                    <span className="font-extrabold text-sm text-slate-800">超级管理员后台</span>
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5 text-[#3182ce]" />
                    <span className="font-extrabold text-sm text-slate-800">平台管理员后台</span>
                  </>
                )}
              </div>
            </div>

            <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto min-h-0">
              {displayedMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <button
                    key={item.href}
                    onClick={() => {
                      router.push(item.href);
                      setShowMobileMenu(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                      isActive
                        ? "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white shadow-lg shadow-[#3182ce]/30"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <div className="text-left min-w-0">
                      <div className="text-sm font-bold truncate">
                        {item.label}
                      </div>
                      <div
                        className={`text-xs truncate ${isActive ? "text-white/80" : "text-slate-400"}`}
                      >
                        {item.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>

            <div className="p-4 border-t border-slate-200 shrink-0 bg-white">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold shadow-md">
                  {user?.name?.charAt(0).toUpperCase() || "A"}
                </div>
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
                ? (isSuperAdmin ? "超级管理员治理大盘" : "平台管理工作台")
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
        <div className="flex-1 overflow-y-auto p-6 min-h-0">{children}</div>
      </main>

      {/* 退出登录二次确认弹窗 */}
      {confirmDialog}
    </div>
  );
}
