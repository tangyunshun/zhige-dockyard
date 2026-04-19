"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, User, LogOut, Hammer } from "lucide-react";
import { Logo } from "./Logo";
import WorkspaceSwitcher from "./WorkspaceSwitcher";

interface UserInfo {
  id: string;
  name?: string | null;
  avatar?: string | null;
  email?: string | null;
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
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
                >
                  {user.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name || "用户头像"}
                      className="w-8 h-8 rounded-full object-cover border-2 border-white shadow-sm"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[#3182ce] to-[#2563eb] flex items-center justify-center text-white text-sm font-bold shadow-sm">
                      {user.name?.charAt(0).toUpperCase() || "U"}
                    </div>
                  )}
                  <span className="text-sm font-bold text-slate-700 max-w-[120px] truncate hidden lg:block">
                    {user.name || "用户"}
                  </span>
                  <svg
                    className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${
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

                {/* 下拉菜单 */}
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-[0_8px_24px_-6px_rgba(15,23,42,0.1),0_2px_6px_-2px_rgba(15,23,42,0.04)] border border-[#e2e8f0]/90 py-1 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="px-4 py-2 border-b border-[#e2e8f0]/90">
                      <p className="text-sm font-bold text-slate-800 truncate">
                        {user.name || "用户"}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        handleLogout();
                        setShowUserMenu(false);
                      }}
                      className="w-full px-4 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      退出登录
                    </button>
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
