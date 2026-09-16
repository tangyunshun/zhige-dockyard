"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname } from "next/navigation";
import {
  User,
  Settings,
  CreditCard,
  FolderOpen,
  Box,
  Activity,
  LogOut,
  Code2,
  ArrowLeft,
  Zap,
  Coins,
  Star,
  Menu,
  X,
  Shield,
  Users,
  Briefcase,
  ChevronLeft,
  ChevronRight,
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
  const { logout: handleLogout, confirmDialog } = useLogout();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hovered, setHovered] = useState<{
    label: string;
    description?: string;
    top: number;
    left: number;
  } | null>(null);

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
          label: "套餐与计费",
          href: "/user/billing-center",
          description: "会员套餐、空间扩容、账单管理",
        },
        {
          icon: Coins,
          label: "我的算力",
          href: "/user/points",
          description: "算力点余额、赠送、消耗与充值流水",
        },
        {
          icon: Star,
          label: "我的评价",
          href: "/user/reviews",
          description: "提交使用评价、查看审核进度",
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
          icon: Code2,
          label: "开发者中心",
          href: "/user/developer",
          description: "API Key 管理与开放接口",
        },
        {
          icon: Settings,
          label: "偏好设置",
          href: "/user/settings",
          description: "个性化配置",
        },
      ];

      // 企业用户额外显示团队管理（锚定在「工作空间」之前，避免菜单顺序变化导致错位）
      if (isEnterprise) {
        const anchorIndex = baseMenuItems.findIndex((m) => m.href === "/user/workspaces");
        baseMenuItems.splice(anchorIndex >= 0 ? anchorIndex : baseMenuItems.length, 0, {
          icon: Users,
          label: "团队管理",
          href: "/user/team",
          description: "团队成员、协作管理",
        });
        baseMenuItems.splice(anchorIndex >= 0 ? anchorIndex + 1 : baseMenuItems.length, 0, {
          icon: Briefcase,
          label: "子账号管理",
          href: "/user/sub-accounts",
          description: "子账号开通与停用",
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
                title="个人工作台"
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-xs border transition-all bg-gradient-to-br from-blue-50 to-blue-100/90 border-blue-200/90 text-[#3182ce]">
                  <User className="w-5 h-5 text-[#3182ce]" />
                </div>
                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2.5 py-1 bg-slate-800 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity font-bold">
                  个人工作台
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
            /* 展开态：品牌身份主行 + 下嵌宽裕舒适返回首页胶囊 */
            <div className="p-3.5 space-y-3">
              {/* 顶行：身份标识与折叠操作 */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {/* 身份徽标盒 */}
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-xs border shrink-0 bg-gradient-to-br from-blue-50 to-blue-100/80 border-blue-200/80 text-[#3182ce]">
                    <User className="w-5 h-5 text-[#3182ce]" />
                  </div>

                  {/* 标题与副标 */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-sm text-slate-800 truncate">
                        个人工作台
                      </span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-black shrink-0 bg-blue-50 text-blue-600 border border-blue-200/80">
                        工作台
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono tracking-wider truncate mt-0.5">
                      ZhiGe Workspace
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

              {/* 底行：返回首页宽裕按钮，区域饱满舒适 */}
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

        {/* 导航菜单 */}
        <nav
          className={`flex-1 ${
            isCollapsed ? "px-2" : "px-4"
          } py-6 space-y-1 overflow-y-auto min-h-0`}
        >
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            if (isCollapsed) {
              return (
                <button
                  key={item.href}
                  onClick={() => {
                    setHovered(null);
                    setIsCollapsed(false);
                    router.push(item.href);
                  }}
                  onMouseEnter={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setHovered({
                      label: item.label,
                      description: item.description,
                      top: r.top + r.height / 2,
                      left: r.right,
                    });
                  }}
                  onMouseLeave={() => setHovered(null)}
                  className={`relative w-full flex items-center justify-center p-3 rounded-lg transition-all mb-1 ${
                    isActive
                      ? "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white shadow-lg shadow-[#3182ce]/30"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                </button>
              );
            }

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
                <div className="text-left min-w-0 flex-1">
                  <div className="text-sm font-bold truncate">{item.label}</div>
                  <div
                    className={`text-xs truncate ${
                      isActive ? "text-white/80" : "text-slate-400"
                    }`}
                  >
                    {item.description}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>

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
                    alt={user.name || "用户头像"}
                    className="w-10 h-10 shrink-0 rounded-lg object-cover border-2 border-white shadow-md"
                  />
                ) : (
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold shadow-md">
                    {user?.name?.charAt(0).toUpperCase() || "U"}
                  </div>
                )}
                <div className="absolute left-full bottom-0 mb-2 ml-2 px-2 py-1.5 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                  <div className="font-bold">{user?.name || "用户"}</div>
                  <div className="text-slate-300">
                    {user?.email || "未设置邮箱"}
                  </div>
                  {user?.membershipLevel && user.membershipLevel !== "FREE" && (
                    <div className="text-slate-400 text-[10px] mt-0.5">
                      {user.membershipLevel === "BRONZE" && "青铜会员"}
                      {user.membershipLevel === "SILVER" && "白银会员"}
                      {user.membershipLevel === "GOLD" && "黄金会员"}
                      {user.membershipLevel === "DIAMOND" && "钻石会员"}
                      {user.membershipLevel === "CROWN" && "皇冠会员"}
                    </div>
                  )}
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
                    alt={user.name || "用户头像"}
                    className="w-10 h-10 shrink-0 rounded-lg object-cover border-2 border-white shadow-md"
                  />
                ) : (
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold shadow-md">
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
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-xs border shrink-0 bg-gradient-to-br from-blue-50 to-blue-100/80 border-blue-200/80 text-[#3182ce]">
                  <User className="w-5 h-5 text-[#3182ce]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-sm text-slate-800 truncate">
                      个人工作台
                    </span>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-black shrink-0 bg-blue-50 text-blue-600 border border-blue-200/80">
                      工作台
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono tracking-wider truncate mt-0.5">
                    ZhiGe Workspace
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
                        ? "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white shadow-lg shadow-[#3182ce]/30"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <div className="text-left min-w-0 flex-1">
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
                  <div className="w-10 h-10 shrink-0 rounded-lg bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center text-white font-bold shadow-md">
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

      {/* 退出登录二次确认弹窗 */}
      {confirmDialog}

      {/* 收起态菜单名称悬停提示：portal 渲染到 body，避免被侧边栏 overflow 裁剪 */}
      {hovered &&
        createPortal(
          <div
            className="fixed z-[9999] pointer-events-none"
            style={{
              top: hovered.top,
              left: hovered.left + 8,
              transform: "translateY(-50%)",
            }}
          >
            <div className="bg-slate-800 text-white text-xs rounded-lg shadow-lg px-2.5 py-1.5 whitespace-nowrap">
              <div className="font-bold">{hovered.label}</div>
              {hovered.description && (
                <div className="text-slate-300 mt-0.5">{hovered.description}</div>
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
