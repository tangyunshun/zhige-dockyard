"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Settings,
  LogOut,
  ArrowLeft,
  Shield,
  Menu,
  X,
  Cpu,
  Globe,
} from "lucide-react";
import { useLogout } from "@/hooks/useLogout";

const platformAdminMenuItems = [
  {
    icon: LayoutDashboard,
    label: "全局资产大盘",
    href: "/platform-admin",
    description: "平台核心指标监控",
  },
  {
    icon: Globe,
    label: "租户与空间管控",
    href: "/platform-admin/workspaces",
    description: "全网空间管理与配额",
  },
  {
    icon: Cpu,
    label: "组件全局调度",
    href: "/platform-admin/components",
    description: "53个组件总开关",
  },
  {
    icon: Settings,
    label: "平台设置",
    href: "/platform-admin/settings",
    description: "全局系统配置",
  },
];

export default function PlatformAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const handleLogout = useLogout();
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkSuperAdminPermission();
  }, [router]);

  const checkSuperAdminPermission = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.push("/auth/login?redirect=/platform-admin");
        return;
      }

      const result = await res.json();
      setUser(result.user);

      const userRole = result.user?.role?.toUpperCase() || "";
      
      if (userRole !== "SUPERADMIN" && userRole !== "SUPER_ADMIN") {
        router.replace("/workspace-hub");
        return;
      }

      setIsSuperAdmin(true);
    } catch (error) {
      console.error("检查超级管理员权限失败:", error);
      router.push("/auth/login?redirect=/platform-admin");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f8ff] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">验证权限中...</p>
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex">
      {/* 侧边栏 - 桌面端 */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-white border-r border-slate-200 flex-col">
        {/* 返回首页按钮 */}
        <div className="h-16 flex items-center px-6 border-b border-slate-200 shrink-0">
          <button
            onClick={() => router.push("/workspace-hub")}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-[#3182ce]/10 to-[#2563eb]/10 text-[#3182ce] hover:bg-gradient-to-r hover:from-[#3182ce]/20 hover:to-[#2563eb]/20 transition-all w-full"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="font-bold text-sm">返回工作台</span>
          </button>
        </div>

        {/* 超级管理员标识 */}
        <div className="px-6 py-4 bg-gradient-to-br from-[#2b6cb0]/10 to-[#3182ce]/10 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 text-[#2b6cb0]">
            <Shield className="w-5 h-5" />
            <span className="font-black text-sm">平台超级管理员</span>
          </div>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto min-h-0">
          {platformAdminMenuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-[8px] transition-all ${
                  isActive
                    ? "bg-[#2b6cb0]/10 text-[#2b6cb0] border-l-3 border-[#2b6cb0]"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <div className="text-left min-w-0">
                  <div className="text-sm font-bold truncate">{item.label}</div>
                  <div
                    className={`text-xs truncate ${isActive ? "text-[#2b6cb0]/80" : "text-slate-400"}`}
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
            <div className="w-10 h-10 shrink-0 rounded-[8px] bg-gradient-to-br from-[#2b6cb0] to-[#3182ce] flex items-center justify-center text-white font-black shadow-md">
              {user?.name?.charAt(0)?.toUpperCase() || "S"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-slate-800 truncate">
                {user?.name || "超级管理员"}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {user?.email || "platform-admin@zhige.com"}
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-[4px] bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-sm font-bold"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
        </div>
      </aside>

      {/* 移动端菜单按钮 */}
      <button
        onClick={() => setShowMobileMenu(!showMobileMenu)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-[8px] shadow-lg border border-slate-200"
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
                onClick={() => router.push("/workspace-hub")}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-[#3182ce]/10 to-[#2563eb]/10 text-[#3182ce] hover:bg-gradient-to-r hover:from-[#3182ce]/20 hover:to-[#2563eb]/20 transition-all w-full"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="font-bold text-sm">返回工作台</span>
              </button>
            </div>

            <div className="px-6 py-4 bg-gradient-to-br from-[#2b6cb0]/10 to-[#3182ce]/10 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2 text-[#2b6cb0]">
                <Shield className="w-5 h-5" />
                <span className="font-black text-sm">平台超级管理员</span>
              </div>
            </div>

            <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto min-h-0">
              {platformAdminMenuItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <button
                    key={item.href}
                    onClick={() => {
                      router.push(item.href);
                      setShowMobileMenu(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-[8px] transition-all ${
                      isActive
                        ? "bg-[#2b6cb0]/10 text-[#2b6cb0] border-l-3 border-[#2b6cb0]"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <div className="text-left min-w-0">
                      <div className="text-sm font-bold truncate">
                        {item.label}
                      </div>
                      <div
                        className={`text-xs truncate ${isActive ? "text-[#2b6cb0]/80" : "text-slate-400"}`}
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
                <div className="w-10 h-10 shrink-0 rounded-[8px] bg-gradient-to-br from-[#2b6cb0] to-[#3182ce] flex items-center justify-center text-white font-black shadow-md">
                  {user?.name?.charAt(0)?.toUpperCase() || "S"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-800 truncate">
                    {user?.name || "超级管理员"}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {user?.email || "platform-admin@zhige.com"}
                  </div>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-[4px] bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-sm font-bold"
              >
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            </div>
          </aside>
        </>
      )}

      {/* 主内容区 */}
      <main className="flex-1 min-h-0 min-w-0 flex flex-col">
        {/* 顶部栏 */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <h1 className="text-xl font-black text-slate-800 truncate">
              {platformAdminMenuItems.find((item) => item.href === pathname)?.label ||
                "平台管理后台"}
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

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-[#f0f8ff]">
          {children}
        </div>
      </main>
    </div>
  );
}
