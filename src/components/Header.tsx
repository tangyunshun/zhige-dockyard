"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, User, LogOut, Hammer, Settings } from "lucide-react";
import { Logo } from "./Logo";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

interface UserInfo {
  id: string;
  name?: string | null;
  avatar?: string | null;
  email?: string | null;
  role?: string | null;
}

interface Workspace {
  id: string;
  name: string;
  type: "PERSONAL" | "ENTERPRISE";
  role: "OWNER" | "ADMIN" | "MEMBER";
  logo?: string | null;
}

export default function Header() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<
    string | undefined
  >();
  const [loading, setLoading] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 检查登录状态
    checkLoginStatus();

    // 点击外部关闭下拉菜单
    const handleClickOutside = (event: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const checkLoginStatus = async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setIsLoggedIn(true);
        setUser(data.user);

        // 获取用户的工作空间列表
        await fetchWorkspaces();
      } else {
        setIsLoggedIn(false);
        setUser(null);
        setWorkspaces([]);
      }
    } catch (error) {
      setIsLoggedIn(false);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkspaces = async () => {
    try {
      const res = await fetch("/api/workspace/list");
      if (res.ok) {
        const data = await res.json();
        setWorkspaces(data.workspaces);
        setCurrentWorkspaceId(data.currentWorkspaceId);
      }
    } catch (error) {
      console.error("Fetch workspaces error:", error);
    }
  };

  const handleSwitchWorkspace = async (workspaceId: string) => {
    try {
      const res = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });

      if (res.ok) {
        setCurrentWorkspaceId(workspaceId);
        router.push(`/dashboard?wid=${workspaceId}`);
      }
    } catch (error) {
      console.error("Switch workspace error:", error);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setIsLoggedIn(false);
      setUser(null);
      router.push("/");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/65 backdrop-blur-2xl border-b border-white/80">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Left: Logo */}
        <Logo className="flex items-center" variant="light" />

        {/* Center: Navigation */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <div className="group relative flex items-center gap-1 cursor-pointer hover:text-[#3182ce] transition-colors">
            产品能力{" "}
            <ChevronDown className="w-4 h-4 transition-transform group-hover:rotate-180" />
          </div>
          <div className="group relative flex items-center gap-1 cursor-pointer hover:text-[#3182ce] transition-colors">
            解决方案{" "}
            <ChevronDown className="w-4 h-4 transition-transform group-hover:rotate-180" />
          </div>
          <a
            href="#security"
            className="hover:text-[#3182ce] transition-colors cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              router.push("/#security");
            }}
          >
            私有化与安全
          </a>
          <a
            href="#pricing"
            className="hover:text-[#3182ce] transition-colors cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              router.push("/#pricing");
            }}
          >
            价格方案
          </a>
          <a
            href="#docs"
            className="hover:text-[#3182ce] transition-colors cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              router.push("/#docs");
            }}
          >
            开发者文档
          </a>
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-3">
          {loading ? (
            // 加载中显示占位
            <div className="w-20 h-9 bg-slate-200 rounded-lg animate-pulse" />
          ) : isLoggedIn && user ? (
            // 已登录：显示用户信息和操作按钮
            <>
              <button
                onClick={() => router.push("/workspace-hub")}
                className="inline-flex items-center justify-center h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white border-t border-[#63b3ed] shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] hover:brightness-[1.05] transition-all duration-[250ms] cursor-pointer gap-2"
              >
                <Hammer className="w-[16px] h-[16px]" />
                进入操作工坊
              </button>

              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-1 hover:opacity-80 transition-opacity cursor-pointer"
                >
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name || "用户头像"}
                      className="w-7 h-7 rounded-full object-cover border-2 border-white shadow-sm"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-r from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white text-xs font-bold shadow-sm">
                      {user.name?.charAt(0).toUpperCase() || "U"}
                    </div>
                  )}
                  <span className="text-xs font-bold text-slate-700 max-w-[60px] truncate hidden lg:block">
                    {user.name || "用户"}
                  </span>
                  <svg
                    className={`w-3 h-3 text-slate-500 transition-transform duration-200 ${
                      showUserMenu ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {/* 下拉菜单 - 简化版：只保留个人设置和退出登录 */}
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white/95 backdrop-blur-xl rounded-xl shadow-[0_8px_24px_-6px_rgba(15,23,42,0.15),0_2px_6px_-2px_rgba(15,23,42,0.06)] border border-[#e2e8f0]/90 py-0 z-50 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
                    {/* 1. 用户信息区 */}
                    <div className="px-5 py-4 border-b border-[#e2e8f0]/80 bg-gradient-to-br from-white to-slate-50/60">
                      <div className="flex items-center gap-3">
                        {user.avatar ? (
                          <img
                            src={user.avatar}
                            alt={user.name || "用户头像"}
                            className="w-12 h-12 rounded-xl object-cover border-2 border-white shadow-md"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-r from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white text-lg font-bold shadow-md">
                            {user.name?.charAt(0).toUpperCase() || "U"}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-bold text-slate-800 truncate">
                            {user.name || "用户"}
                          </p>
                          <p className="text-xs text-slate-500 truncate mt-0.5">
                            {user.email || "未绑定邮箱"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 2. 设置导航区 - 简化 */}
                    <div className="px-5 py-2.5 border-b border-[#e2e8f0]/80">
                      {/* 管理员后台入口 - 仅管理员可见 */}
                      {(user?.role?.toUpperCase() === "ADMIN" ||
                        user?.role?.toUpperCase() === "SUPER_ADMIN") && (
                        <button
                          onClick={() => {
                            router.push("/admin");
                            setShowUserMenu(false);
                          }}
                          className="w-full flex items-center gap-2.5 p-2.5 rounded-lg hover:bg-red-50 transition-colors group mb-1"
                        >
                          <svg
                            className="w-4 h-4 text-slate-400 group-hover:text-red-500 transition-colors"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                            />
                          </svg>
                          <span className="text-sm text-slate-700 font-medium group-hover:text-red-600 transition-colors flex items-center gap-1.5">
                            管理员后台
                            <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded">
                              管理
                            </span>
                          </span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          router.push("/settings");
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
                      >
                        <Settings className="w-4 h-4 text-slate-400 group-hover:text-[#3182ce] transition-colors" />
                        <span className="text-sm text-slate-700 font-medium group-hover:text-[#3182ce] transition-colors">
                          个人设置
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          router.push("/workspace-hub/assets");
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors group mt-1"
                      >
                        <svg
                          className="w-4 h-4 text-slate-400 group-hover:text-[#3182ce] transition-colors"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                          />
                        </svg>
                        <span className="text-sm text-slate-700 font-medium group-hover:text-[#3182ce] transition-colors">
                          个人算力资产
                        </span>
                      </button>
                    </div>

                    {/* 3. 操作区 */}
                    <div className="px-5 py-2.5">
                      <button
                        onClick={() => {
                          handleLogout();
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-red-50 transition-colors group"
                      >
                        <LogOut className="w-4 h-4 text-red-500" />
                        <span className="text-sm text-red-600 font-medium">
                          退出登录
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            // 未登录：显示进入操作工坊按钮和登录/注册合并按钮
            <>
              <button
                onClick={() => router.push("/auth/login")}
                className="inline-flex items-center justify-center h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white border-t border-[#63b3ed] shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] hover:brightness-[1.05] transition-all duration-[250ms] cursor-pointer gap-2"
              >
                <Hammer className="w-[16px] h-[16px]" />
                进入操作工坊
              </button>
              <button
                onClick={() => router.push("/auth/login")}
                className="inline-flex items-center justify-center h-[38px] px-[18px] rounded-[8px] text-[14px] font-[600] bg-white/95 border border-[#e2e8f0]/90 text-slate-700 backdrop-blur-[8px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-white hover:border-[#3182ce] hover:text-[#3182ce] hover:shadow-[0_4px_10px_rgba(49,130,206,0.08)] hover:-translate-y-[1px] transition-all duration-[250ms] cursor-pointer"
              >
                登录/注册
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
