"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  User,
  Settings,
  CreditCard,
  FolderOpen,
  Box,
  Activity,
  LogOut,
  ArrowLeft,
  Zap,
  Menu,
  X,
  Shield,
  Users,
  Briefcase,
} from "lucide-react";
import { useLogout } from "@/hooks/useLogout";

interface UserInfo {
  id: string;
  name?: string | null;
  email?: string | null;
  avatar?: string | null;
  role?: string | null;
  membershipLevel?: string | null;
}

export default function UserDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const handleLogout = useLogout();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [menuItems, setMenuItems] = useState<any[]>([]);

  useEffect(() => {
    checkLoginStatus();
  }, [router]);

  const checkLoginStatus = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.push("/auth/login?redirect=/user/dashboard");
        return;
      }

      const data = await res.json();
      setUser(data.user);

      // 根据用户角色动态生成菜单
      const isEnterprise = data.user?.membershipLevel === "ENTERPRISE";
      const baseMenuItems = [
        {
          icon: Zap,
          label: "工作台",
          href: "/user/dashboard",
          description: "数据概览和快捷操作",
        },
        {
          icon: User,
          label: "个人设置",
          href: "/user/profile",
          description: "基本信息、头像管理",
        },
        {
          icon: Shield,
          label: "账号安全",
          href: "/user/security",
          description: "密码修改、账号保护",
        },
        {
          icon: CreditCard,
          label: "会员信息",
          href: "/user/membership",
          description: "会员等级、配额使用",
        },
        {
          icon: FolderOpen,
          label: "工作空间",
          href: "/user/workspaces",
          description: "个人/企业空间管理",
        },
        {
          icon: Box,
          label: "我的组件",
          href: "/user/components",
          description: "组件列表、使用统计",
        },
        {
          icon: Activity,
          label: "操作日志",
          href: "/user/activities",
          description: "活动记录、操作历史",
        },
        {
          icon: Settings,
          label: "偏好设置",
          href: "/user/settings",
          description: "个性化配置",
        },
      ];

      // 企业用户额外显示团队管理
      if (isEnterprise) {
        baseMenuItems.splice(5, 0, {
          icon: Users,
          label: "团队管理",
          href: "/user/team",
          description: "团队成员、协作管理",
        });
      }

      setMenuItems(baseMenuItems);
    } catch (error) {
      console.error("Check login status error:", error);
      router.push("/auth/login?redirect=/user/dashboard");
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

        {/* 用户中心标识 */}
        <div className="px-6 py-4 bg-gradient-to-br from-[#3182ce]/5 to-[#2563eb]/5 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2 text-[#3182ce]">
            <User className="w-5 h-5" />
            <span className="font-bold text-sm">个人工作台</span>
          </div>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto min-h-0">
          {menuItems.map((item) => {
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
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name || "用户头像"}
                className="w-10 h-10 shrink-0 rounded-lg object-cover border-2 border-white shadow-md"
              />
            ) : (
              <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white font-bold shadow-md">
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-slate-800 truncate">
                {user?.name || "用户"}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {user?.email || "未设置邮箱"}
              </div>
              {user?.membershipLevel && user.membershipLevel !== "FREE" && (
                <div className="mt-1">
                  <span className="px-1.5 py-0.5 bg-gradient-to-r from-[#f59e0b]/10 to-[#d97706]/10 text-[#d97706] text-[10px] font-bold rounded border border-[#f59e0b]/20">
                    {user.membershipLevel === "BRONZE" && "青铜"}
                    {user.membershipLevel === "SILVER" && "白银"}
                    {user.membershipLevel === "GOLD" && "黄金"}
                    {user.membershipLevel === "DIAMOND" && "钻石"}
                    {user.membershipLevel === "CROWN" && "皇冠"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* 退出登录按钮 */}
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
                <User className="w-5 h-5" />
                <span className="font-bold text-sm">个人工作台</span>
              </div>
            </div>

            <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto min-h-0">
              {menuItems.map((item) => {
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
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name || "用户头像"}
                    className="w-10 h-10 shrink-0 rounded-lg object-cover border-2 border-white shadow-md"
                  />
                ) : (
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white font-bold shadow-md">
                    {user?.name?.charAt(0).toUpperCase() || "U"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-slate-800 truncate">
                    {user?.name || "用户"}
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
              {menuItems.find((item) => item.href === pathname)?.label ||
                "个人工作台"}
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
