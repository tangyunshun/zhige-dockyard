"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, User, LogOut, Hammer, Settings } from "lucide-react";
import { Logo } from "./Logo";
import WorkspaceSwitcher from "./WorkspaceSwitcher";
import { useLogout } from "@/hooks/useLogout";

interface UserInfo {
  id: string;
  name?: string | null;
  avatar?: string | null;
  email?: string | null;
  role?: string | null;
  membershipLevel?: string | null;
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
  const pathname = usePathname();
  const isDevelopmentRoute = pathname && (
    pathname.startsWith("/workspace-hub") || 
    pathname.startsWith("/studio") || 
    pathname.startsWith("/workspace")
  );
  const handleLogout = useLogout();
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
    const userId = localStorage.getItem("userId");

    if (userId) {
      setIsLoggedIn(true);
      setLoading(false);
      checkLoginStatus();
    } else {
      checkLoginStatus();
    }

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
      const res = await fetch("/api/auth/me", {
        signal: AbortSignal.timeout(5000),
        credentials: "include",
      });

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.log("API 尚未准备好，跳过本次检查");
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setIsLoggedIn(true);
        setUser(data.user);
        await fetchWorkspaces();
      } else {
        setIsLoggedIn(false);
        setUser(null);
        setWorkspaces([]);
      }
    } catch (error) {
      console.log("Check login status error (ignored):", error);
      setIsLoggedIn(false);
      setUser(null);
      setWorkspaces([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkspaces = async () => {
    try {
      const res = await fetch("/api/workspace/list", {
        credentials: "include",
      });
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

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/65 backdrop-blur-2xl border-b border-white/80">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Logo className="flex items-center" variant="light" />

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

        <div className="flex items-center gap-3">
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-slate-200 animate-pulse" />
              <div className="w-20 h-7 bg-slate-200 rounded animate-pulse hidden lg:block" />
            </div>
          ) : isLoggedIn && user ? (
            <>
              {!isDevelopmentRoute && (
                <button
                  onClick={() => router.push("/workspace-hub")}
                  className="inline-flex items-center justify-center h-[38px] px-3 sm:px-[18px] rounded-[8px] text-[14px] font-[600] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white border-t border-[#63b3ed] shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] hover:brightness-[1.05] transition-all duration-[250ms] cursor-pointer gap-1.5"
                >
                  <Hammer className="w-[16px] h-[16px]" />
                  <span className="hidden sm:inline">进入操作工坊</span>
                </button>
              )}

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

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-white/95 backdrop-blur-xl rounded-xl shadow-[0_8px_24px_-6px_rgba(15,23,42,0.15),0_2px_6px_-2px_rgba(15,23,42,0.06)] border border-[#e2e8f0]/90 py-0 z-50 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
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
                          {user.membershipLevel && user.membershipLevel !== "FREE" && (
                            <div className="mt-1">
                              <span className="px-1.5 py-0.5 bg-gradient-to-r from-[#f59e0b]/10 to-[#d97706]/10 text-[#d97706] text-[10px] font-bold rounded border border-[#f59e0b]/20">
                                {user.membershipLevel === "BRONZE" && "青铜会员"}
                                {user.membershipLevel === "SILVER" && "白银会员"}
                                {user.membershipLevel === "GOLD" && "黄金会员"}
                                {user.membershipLevel === "DIAMOND" && "钻石会员"}
                                {user.membershipLevel === "CROWN" && "皇冠会员"}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="px-5 py-2.5 border-b border-[#e2e8f0]/80">
                      {(() => {
                        const role = user?.role?.toUpperCase().replace(/_/g, '');
                        return role === "ADMIN" || role === "SUPERADMIN";
                      })() && (
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
                          router.push("/user/dashboard");
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition-colors group mb-1"
                      >
                        <User className="w-4 h-4 text-slate-400 group-hover:text-[#3182ce] transition-colors" />
                        <span className="text-sm text-slate-700 font-medium group-hover:text-[#3182ce] transition-colors">
                          个人工作台
                        </span>
                      </button>

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
            <>
              {!isDevelopmentRoute && (
                <button
                  onClick={() => router.push("/auth/login")}
                  className="inline-flex items-center justify-center h-[38px] px-3 sm:px-[18px] rounded-[8px] text-[14px] font-[600] bg-gradient-to-r from-[#4299e1] to-[#3182ce] text-white border-t border-[#63b3ed] shadow-[0_2px_6px_-1px_rgba(49,130,206,0.3),inset_0_1px_0_rgba(255,255,255,0.15)] hover:shadow-[0_4px_12px_-2px_rgba(49,130,206,0.4)] hover:-translate-y-[1px] hover:brightness-[1.05] transition-all duration-[250ms] cursor-pointer gap-1.5"
                >
                  <Hammer className="w-[16px] h-[16px]" />
                  <span className="hidden sm:inline">进入操作工坊</span>
                </button>
              )}
              <button
                onClick={() => router.push("/auth/login")}
                className="inline-flex items-center justify-center h-[38px] px-3 sm:px-[18px] rounded-[8px] text-[14px] font-[600] bg-white/95 border border-[#e2e8f0]/90 text-slate-700 backdrop-blur-[8px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:bg-white hover:border-[#3182ce] hover:text-[#3182ce] hover:shadow-[0_4px_10px_rgba(49,130,206,0.08)] hover:-translate-y-[1px] transition-all duration-[250ms] cursor-pointer"
              >
                <span>登录</span><span className="hidden sm:inline">/注册</span>
              </button>
            </>
          )}

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="flex md:hidden p-1.5 text-slate-600 hover:text-[#3182ce] transition-colors cursor-pointer rounded-lg border border-slate-200/60 hover:bg-slate-50"
            aria-label="Toggle Menu"
          >
            {isMobileMenuOpen ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-x-0 top-16 bg-white/95 backdrop-blur-2xl border-b border-slate-200 py-6 px-6 shadow-xl md:hidden z-40 flex flex-col gap-6 animate-in slide-in-from-top-2 duration-200">
          <nav className="flex flex-col gap-4 text-sm font-semibold text-slate-700">
            <div className="flex justify-between items-center py-2 border-b border-slate-100 cursor-pointer hover:text-[#3182ce] transition-colors">
              产品能力 <ChevronDown className="w-4 h-4" />
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100 cursor-pointer hover:text-[#3182ce] transition-colors">
              解决方案 <ChevronDown className="w-4 h-4" />
            </div>
            <a
              href="#security"
              onClick={(e) => {
                e.preventDefault();
                setIsMobileMenuOpen(false);
                router.push("/#security");
              }}
              className="py-2 border-b border-slate-100 hover:text-[#3182ce] transition-colors"
            >
              私有化与安全
            </a>
            <a
              href="#pricing"
              onClick={(e) => {
                e.preventDefault();
                setIsMobileMenuOpen(false);
                router.push("/#pricing");
              }}
              className="py-2 border-b border-slate-100 hover:text-[#3182ce] transition-colors"
            >
              价格方案
            </a>
            <a
              href="#docs"
              onClick={(e) => {
                e.preventDefault();
                setIsMobileMenuOpen(false);
                router.push("/#docs");
              }}
              className="py-2 hover:text-[#3182ce] transition-colors"
            >
              开发者文档
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}