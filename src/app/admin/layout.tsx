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
  Menu,
  X,
  Crown,
  Package,
  Building2,
  AlertCircle,
  TrendingUp,
} from "lucide-react";
import { useLogout } from "@/hooks/useLogout";

interface UserInfo {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

interface AdminMenuItem {
  icon: any;
  label: string;
  href: string;
  description: string;
  superAdminOnly?: boolean;
}

const adminMenuItems: AdminMenuItem[] = [
  {
    icon: LayoutDashboard,
    label: "仪表盘",
    href: "/admin",
    description: "系统概览和统计数据",
  },
  {
    icon: Users,
    label: "用户管理",
    href: "/admin/users",
    description: "用户列表、权限管理",
  },
  {
    icon: FolderKanban,
    label: "工作空间管理",
    href: "/admin/workspaces",
    description: "空间审核、资源配额、成员查看",
  },
  {
    icon: Users,
    label: "岗位管理",
    href: "/admin/posts",
    description: "岗位列表、成员设置",
  },
  {
    icon: Shield,
    label: "企业权限配置",
    href: "/admin/matrix/select",
    description: "权限矩阵、组件授权",
  },
  {
    icon: Crown,
    label: "会员管理",
    href: "/admin/membership",
    description: "会员等级、订单管理",
  },
  {
    icon: Package,
    label: "组件管理",
    href: "/admin/components",
    description: "组件上架/下架管理",
  },
  {
    icon: FileText,
    label: "阶段管理",
    href: "/admin/content",
    description: "管理组件开发阶段",
  },
  {
    icon: FileText,
    label: "文档管理",
    href: "/admin/documents",
    description: "系统文档、用户指南",
  },
  {
    icon: BarChart3,
    label: "数据分析",
    href: "/admin/analytics",
    description: "用户行为、功能使用率",
  },
  {
    icon: Building2,
    label: "租户管理",
    href: "/admin/tenants",
    description: "多租户系统管理与监控",
    superAdminOnly: true,
  },
  {
    icon: FileText,
    label: "操作审计日志",
    href: "/admin/operation-logs",
    description: "全局操作审计记录",
    superAdminOnly: true,
  },
  {
    icon: TrendingUp,
    label: "升级申请管理",
    href: "/admin/upgrade-applications",
    description: "空间容量升级申请",
  },
  {
    icon: AlertCircle,
    label: "申诉管理",
    href: "/admin/account-appeals",
    description: "封禁账号申诉审核",
  },
  {
    icon: Settings,
    label: "系统设置",
    href: "/admin/settings",
    description: "全局配置、第三方集成",
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const handleLogout = useLogout();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const isSuperAdmin = user?.role?.toUpperCase() === "SUPER_ADMIN" || user?.role === "SuperAdmin";
  const displayedMenuItems = adminMenuItems.filter((item) => {
    if (item.superAdminOnly) {
      return isSuperAdmin;
    }
    return true;
  });

  useEffect(() => {
    checkAdminPermission();
  }, [router]);

  // 当路由或用户状态改变时，强制拦截非法越权访问超级管理员页面的行为
  useEffect(() => {
    if (!loading && isAdmin && user) {
      const isSuperUser = user.role?.toUpperCase() === "SUPER_ADMIN" || user.role === "SuperAdmin";
      const isSuperPath = pathname.startsWith("/admin/tenants") || 
                          pathname.startsWith("/admin/operation-logs");
      if (isSuperPath && !isSuperUser) {
        router.replace("/admin");
      }
    }
  }, [pathname, loading, isAdmin, user]);

  const checkAdminPermission = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.push("/auth/login?redirect=/admin");
        return;
      }

      const data = await res.json();
      setUser(data.user);

      // 检查是否是管理员（不区分大小写）
      const userRole = data.user?.role?.toUpperCase() || "";
      if (userRole !== "ADMIN" && userRole !== "SUPER_ADMIN") {
        // 不是管理员，直接重定向到首页，不显示提示
        router.replace("/workspace-hub");
        return;
      }

      // 强校验当前超级管理员专属路由的可访问性
      const isSuperUser = userRole === "SUPER_ADMIN" || data.user?.role === "SuperAdmin";
      const isSuperPath = pathname.startsWith("/admin/tenants") || 
                          pathname.startsWith("/admin/operation-logs");
      if (isSuperPath && !isSuperUser) {
        router.replace("/admin");
        return;
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
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-[#3182ce]/10 to-[#2563eb]/10 text-[#3182ce] hover:bg-gradient-to-r hover:from-[#3182ce]/20 hover:to-[#2563eb]/20 transition-all w-full"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-bold text-sm">返回首页</span>
          </button>
        </div>

        {/* 管理员标识 */}
        <div className="px-6 py-4 bg-gradient-to-br from-[#3182ce]/5 to-[#2563eb]/5 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 text-[#3182ce]">
            <Shield className="w-5 h-5" />
            <span className="font-bold text-sm">管理员后台</span>
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
                    ? "bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white shadow-lg shadow-[#3182ce]/30"
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
            <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white font-bold shadow-md">
              {user?.name?.charAt(0).toUpperCase() || "A"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-slate-800 truncate">
                {user?.name || "管理员"}
              </div>
              <div className="text-xs text-slate-500 truncate">
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
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-[#3182ce]/10 to-[#2563eb]/10 text-[#3182ce] hover:bg-gradient-to-r hover:from-[#3182ce]/20 hover:to-[#2563eb]/20 transition-all w-full"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="font-bold text-sm">返回首页</span>
              </button>
            </div>

            <div className="px-6 py-4 bg-gradient-to-br from-[#3182ce]/5 to-[#2563eb]/5 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2 text-[#3182ce]">
                <Shield className="w-5 h-5" />
                <span className="font-bold text-sm">管理员后台</span>
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
                        ? "bg-gradient-to-r from-[#3182ce] to-[#2563eb] text-white shadow-lg shadow-[#3182ce]/30"
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
                <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white font-bold shadow-md">
                  {user?.name?.charAt(0).toUpperCase() || "A"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-800 truncate">
                    {user?.name || "管理员"}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
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
              {adminMenuItems.find((item) => item.href === pathname)?.label ||
                "管理员后台"}
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
    </div>
  );
}
