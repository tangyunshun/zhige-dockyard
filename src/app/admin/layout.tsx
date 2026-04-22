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
} from "lucide-react";

interface UserInfo {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

const adminMenuItems = [
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
    description: "空间审核、资源配额",
  },
  {
    icon: FileText,
    label: "内容管理",
    href: "/admin/content",
    description: "组件审核、文档管理",
  },
  {
    icon: BarChart3,
    label: "数据分析",
    href: "/admin/analytics",
    description: "用户行为、功能使用率",
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
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    checkAdminPermission();
  }, []);

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
        // 不是管理员，跳转到首页
        alert("您没有权限访问管理员后台");
        router.push("/workspace-hub");
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

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/");
    } catch (error) {
      console.error("Logout error:", error);
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
    <div className="min-h-screen bg-[#f8fafc] flex">
      {/* 侧边栏 - 桌面端 */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-slate-200 flex-col fixed h-full z-10">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-slate-200">
          <button
            onClick={() => router.push("/workspace-hub")}
            className="flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-bold text-lg">返回工作空间</span>
          </button>
        </div>

        {/* 管理员标识 */}
        <div className="px-6 py-4 bg-gradient-to-br from-[#3182ce]/5 to-[#2563eb]/5 border-b border-slate-200">
          <div className="flex items-center gap-2 text-[#3182ce]">
            <Shield className="w-5 h-5" />
            <span className="font-bold text-sm">管理员后台</span>
          </div>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {adminMenuItems.map((item) => {
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
                <Icon className="w-5 h-5" />
                <div className="text-left">
                  <div className="text-sm font-bold">{item.label}</div>
                  <div
                    className={`text-xs ${isActive ? "text-white/80" : "text-slate-400"}`}
                  >
                    {item.description}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>

        {/* 用户信息 */}
        <div className="p-4 border-t border-slate-200">
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white font-bold">
                {user?.name?.charAt(0).toUpperCase() || "A"}
              </div>
              <div className="flex-1 text-left">
                <div className="text-sm font-bold text-slate-800">
                  {user?.name || "管理员"}
                </div>
                <div className="text-xs text-slate-500 truncate">
                  {user?.email || "admin@zhige.os"}
                </div>
              </div>
            </button>

            {showUserMenu && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-lg shadow-xl border border-slate-200 py-2 z-50">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  退出登录
                </button>
              </div>
            )}
          </div>
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
          <aside className="lg:hidden fixed left-0 top-0 bottom-0 w-72 bg-white z-50 shadow-2xl">
            <div className="h-16 flex items-center px-6 border-b border-slate-200">
              <button
                onClick={() => router.push("/workspace-hub")}
                className="flex items-center gap-2 text-slate-600 hover:text-[#3182ce] transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="font-bold text-lg">返回工作空间</span>
              </button>
            </div>

            <div className="px-6 py-4 bg-gradient-to-br from-[#3182ce]/5 to-[#2563eb]/5 border-b border-slate-200">
              <div className="flex items-center gap-2 text-[#3182ce]">
                <Shield className="w-5 h-5" />
                <span className="font-bold text-sm">管理员后台</span>
              </div>
            </div>

            <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
              {adminMenuItems.map((item) => {
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
                    <Icon className="w-5 h-5" />
                    <div className="text-left">
                      <div className="text-sm font-bold">{item.label}</div>
                      <div
                        className={`text-xs ${isActive ? "text-white/80" : "text-slate-400"}`}
                      >
                        {item.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>

            <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200 bg-white">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors rounded-lg"
              >
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            </div>
          </aside>
        </>
      )}

      {/* 主内容区 */}
      <main className="flex-1 lg:ml-64 min-h-screen">
        {/* 顶部栏 */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-slate-800">
              {adminMenuItems.find((item) => item.href === pathname)?.label ||
                "管理员后台"}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500">
              {new Date().toLocaleDateString("zh-CN", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          </div>
        </header>

        {/* 内容区 */}
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
