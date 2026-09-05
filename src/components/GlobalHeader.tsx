"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, Bell, Trash2 } from "lucide-react";
import { useToast } from "@/components/Toast";
import { Logo } from "./Logo";
import AvatarDropdown from "./AvatarDropdown";
import DynamicCTA from "./DynamicCTA";
import { useAppContext } from "@/contexts/AppContext";

export default function GlobalHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const { userState, isLoading } = useAppContext();

  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  // === 彻底解决 Next.js Hydration Mismatch 的水合屏障 ===
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // 轮询防重入：上一次请求未结束前不叠加发起新请求
  const fetchingRef = useRef(false);
  // 网络抖动只提示一次，避免 60s 轮询在断网/热更新场景下反复刷屏
  const networkWarnedRef = useRef(false);

  /** 通知轮询拉取。请求带 10s 超时主动取消；瞬时网络中断(dev 热更新/断网)静默降级，等待下轮自动重试 */
  const fetchNotifications = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const authToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const res = await fetch("/api/user/notifications/list", {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        credentials: "include",
        signal: controller.signal,
        cache: "no-store",
      });
      if (res.status === 401) {
        return;
      }
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data?.list || []);
        setUnreadCount(json.data?.unreadCount || 0);
        networkWarnedRef.current = false; // 网络恢复后重置，下次中断可再提示一次
      }
    } catch (e) {
      // 主动超时/取消：属预期降级，不提示
      if (e instanceof DOMException && e.name === "AbortError") return;
      // TypeError: Failed to fetch —— dev 热更新重编译、快速切页、服务器重启等瞬时网络中断，
      // 非业务异常，仅提示一次并交由下轮轮询自动恢复
      if (e instanceof TypeError) {
        if (!networkWarnedRef.current) {
          networkWarnedRef.current = true;
          console.warn("通知中心暂时无法连接，稍后将自动重试");
        }
        return;
      }
      console.error("加载消息通知失败:", e);
    } finally {
      clearTimeout(timer);
      fetchingRef.current = false;
    }
  }, []);

  const handleMarkAsRead = async (id?: string) => {
    // 立即乐观更新本地状态
    if (id) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } else {
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    }

    try {
      const authToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const res = await fetch("/api/user/notifications/read", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify(id ? { id } : { all: true })
      });
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data.list || []);
        setUnreadCount(json.data.unreadCount || 0);
        // 静默变更，不弹扰民 Toast 提示
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("zhige_notifications_updated"));
        }
      }
    } catch (e) {
      console.error("标记已读失败:", e);
    }
  };

  // 删除单条通知（下拉面板内 hover 显示）
  const handleDeleteNotification = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const authToken = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      const res = await fetch("/api/user/notifications/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        credentials: "include",
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.data.list || []);
        setUnreadCount(json.data.unreadCount || 0);
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("zhige_notifications_updated"));
        }
      }
    } catch (e) {
      console.error("删除通知失败:", e);
    }
  };

  useEffect(() => {
    if (mounted && userState.isLoggedIn) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 60 * 1000);
      const handleGlobalNotifyUpdate = () => {
        fetchNotifications();
      };
      if (typeof window !== "undefined") {
        window.addEventListener("zhige_notifications_updated", handleGlobalNotifyUpdate);
      }
      return () => {
        clearInterval(interval);
        if (typeof window !== "undefined") {
          window.removeEventListener("zhige_notifications_updated", handleGlobalNotifyUpdate);
        }
      };
    }
  }, [mounted, userState.isLoggedIn]);

  const isWorkspaceRoute = pathname && pathname.startsWith("/workspace/") && pathname !== "/workspace-hub";

  // 工作空间信息计算
  const currentWorkspaceId = userState.currentWorkspaceId || (userState.workspaces && userState.workspaces[0]?.id);
  const currentWorkspace = userState.workspaces?.find(ws => ws.id === currentWorkspaceId);

  // 未登录跳转拦截函数
  const handleNavClick = (path: string, requireAuth: boolean = false) => {
    if (requireAuth && (!userState.isLoggedIn || !mounted)) {
      router.push(`/auth/login?redirect=${encodeURIComponent(path)}`);
    } else {
      router.push(path);
    }
  };

  // 已登录状态：只由 userState.isLoggedIn 驱动
  const showLoggedInNav = mounted && userState.isLoggedIn;
  const showLoggedInRight = mounted && userState.isLoggedIn;
  const isHeaderLoading = isLoading || !mounted;

  // 路径高亮判定
  const getTabClass = (key: string) => {
    let isActive = false;
    if (key === "workspace-hub") {
      isActive = pathname === "/workspace-hub";
    } else if (key === "studio") {
      isActive = pathname === "/studio" || pathname === "/components";
    } else if (key === "tasks") {
      isActive = pathname === "/tasks" || pathname === "/user/tasks";
    } else if (key === "knowledge") {
      isActive = pathname === "/knowledge" || pathname === "/user/knowledge";
    } else if (key === "docs") {
      isActive = pathname ? (pathname.startsWith("/docs") || pathname.startsWith("/developers")) : false;
    } else if (key === "solutions") {
      isActive = pathname === "/solutions";
    } else if (key === "security") {
      isActive = pathname === "/security";
    } else if (key === "pricing") {
      isActive = pathname === "/pricing";
    }

    return `transition-all duration-200 cursor-pointer h-[60px] flex items-center relative text-xs sm:text-sm ${
      isActive 
        ? "text-[#3182ce] font-extrabold after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-[#3182ce]" 
        : "text-slate-500 hover:text-[#3182ce] font-semibold"
    }`;
  };

  return (
    <header className="h-[60px] fixed top-0 left-0 w-full z-50 backdrop-blur-md bg-white/95 border-b border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
        {/* 左侧区：Logo */}
        <Logo
          className="flex items-center cursor-pointer flex-shrink-0"
          variant="light"
          onClick={() => {
            if (userState.isLoggedIn && mounted) {
              router.push("/workspace-hub");
            } else {
              router.push("/");
            }
          }}
        />

        {/* 中间区：自适应系统级导航 */}
        <nav className="hidden md:flex items-center gap-6 lg:gap-8 h-full">
          {showLoggedInNav ? (
            // === 已登录：工作台导航 (对齐 V6.0 灰度命名) ===
            <>
              <button 
                onClick={() => handleNavClick("/workspace-hub", true)} 
                className={getTabClass("workspace-hub")}
              >
                空间中枢
              </button>
              <button 
                onClick={() => handleNavClick("/studio", true)} 
                className={getTabClass("studio")}
              >
                组件大厅
              </button>
              <button 
                onClick={() => handleNavClick("/tasks", true)} 
                className={getTabClass("tasks")}
              >
                任务中心
              </button>
              <button 
                onClick={() => handleNavClick("/knowledge", true)} 
                className={getTabClass("knowledge")}
              >
                知识库
              </button>
              <button 
                onClick={() => handleNavClick("/pricing", true)} 
                className={getTabClass("pricing")}
              >
                价格方案
              </button>
              <button 
                onClick={() => handleNavClick("/docs")} 
                className={getTabClass("docs")}
              >
                文档中心
              </button>
            </>
          ) : (
            // === 未登录：官网导航 ===
            <>
              <button 
                onClick={() => handleNavClick("/studio")} 
                className={getTabClass("studio")}
              >
                组件大厅
              </button>
              <button 
                onClick={() => handleNavClick("/solutions")} 
                className={getTabClass("solutions")}
              >
                解决方案
              </button>
              <button 
                onClick={() => handleNavClick("/security")} 
                className={getTabClass("security")}
              >
                私有化与安全
              </button>
              <button 
                onClick={() => handleNavClick("/pricing")} 
                className={getTabClass("pricing")}
              >
                价格方案
              </button>
              <button 
                onClick={() => handleNavClick("/docs")} 
                className={getTabClass("docs")}
              >
                文档中心
              </button>
            </>
          )}
        </nav>

        {/* 右侧区：动态操作区 */}
        <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
          {isHeaderLoading ? (
            <div className="flex items-center gap-3">
              <div className="w-20 h-[38px] bg-slate-200 rounded-lg animate-pulse" />
              <div className="w-28 h-[38px] bg-slate-200 rounded-lg animate-pulse" />
            </div>
          ) : !showLoggedInRight ? (
            <>
              <button 
                onClick={() => router.push("/auth/login")}
                className="px-3 h-[38px] text-xs sm:text-sm font-bold text-slate-600 hover:text-[#3182ce] transition-colors cursor-pointer"
              >
                登录/注册
              </button>
              <button 
                onClick={() => router.push("/auth/login?signup=true")}
                className="h-9 px-4 rounded-lg bg-gradient-to-r from-[#3182ce] to-[#2b6cb0] text-white text-xs font-bold shadow-sm hover:shadow hover:-translate-y-0.5 active:scale-95 transition-all duration-200 cursor-pointer flex items-center justify-center"
              >
                免费体验工作台
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              {/* 通知中心入口与真实 Popover 浮动面板 */}
              <div className="relative">
                <button 
                  onClick={() => {
                    setShowNotifications(!showNotifications);
                  }}
                  className="p-2 hover:bg-slate-100/80 rounded-lg transition-colors flex items-center justify-center w-9 h-9 text-slate-500 hover:text-[#3182ce] relative cursor-pointer z-50 animate-in fade-in"
                >
                  <Bell className="w-4.5 h-4.5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[17px] h-4 px-1 bg-red-500 text-white text-[9px] font-black rounded-full ring-2 ring-white flex items-center justify-center leading-none">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <>
                    {/* 点击背景拦截关闭 */}
                    <div className="fixed inset-0 z-45 cursor-default" onClick={() => setShowNotifications(false)} />
                    
                    {/* 毛玻璃浮窗面板 */}
                    <div className="absolute right-0 top-11 w-80 bg-white/95 backdrop-blur-xl rounded-[20px] shadow-2xl border border-slate-100/90 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                        <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                          <span>🔔</span> 通知中心 <span className="text-[10px] text-slate-500 font-bold">(未读 {unreadCount} / 已读 {notifications.length - unreadCount})</span>
                        </h3>
                        {unreadCount > 0 && (
                          <button 
                            onClick={() => handleMarkAsRead()}
                            className="text-[10px] text-[#3182ce] font-bold hover:underline cursor-pointer"
                          >
                            全部已读
                          </button>
                        )}
                      </div>

                      <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                        {notifications.length === 0 ? (
                          <div className="py-12 text-center text-xs text-slate-400 font-semibold">
                            🎉 暂无任何通知，工作台一切正常
                          </div>
                        ) : (
                          notifications.slice(0, 5).map((notify) => {
                            const typeLabels: Record<string, string> = {
                              system: "系统",
                              task: "任务",
                              security: "安全"
                            };
                            const badgeColors: Record<string, string> = {
                              system: "bg-blue-50 text-blue-600 border-blue-100",
                              task: "bg-emerald-50 text-emerald-600 border-emerald-100",
                              security: "bg-amber-50 text-amber-600 border-amber-100"
                            };

                            return (
                              <div 
                                key={notify.id}
                                onClick={() => {
                                  // 点击消息：未读则先标记已读（消除红点提醒标识，记录仍保留）；
                                  // 携带跳转链接时标记已读后再前往目标页。
                                  if (notify.link) {
                                    if (!notify.isRead) handleMarkAsRead(notify.id);
                                    setShowNotifications(false);
                                    router.push(notify.link);
                                  } else if (!notify.isRead) {
                                    handleMarkAsRead(notify.id);
                                  }
                                }}
                                className={`group p-4 hover:bg-slate-50/60 transition-colors cursor-pointer text-left ${!notify.isRead ? 'bg-blue-500/[0.01]' : ''}`}
                              >
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <span className={`px-2 py-0.5 border rounded-full text-[9px] font-black ${badgeColors[notify.type] || 'bg-slate-200 text-slate-600 border-slate-300'}`}>
                                    {typeLabels[notify.type] || "通用"}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] text-slate-400 font-bold">
                                      {new Date(notify.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <button
                                      type="button"
                                      title="删除该通知"
                                      onClick={(e) => handleDeleteNotification(notify.id, e)}
                                      className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                                <h4 className={`text-xs mb-1 ${!notify.isRead ? 'font-black text-slate-800' : 'font-semibold text-slate-500'}`}>
                                  {notify.title}
                                </h4>
                                <p className={`text-[10px] leading-relaxed line-clamp-2 ${!notify.isRead ? 'text-slate-600 font-bold' : 'text-slate-400 font-semibold'}`}>
                                  {notify.content}
                                </p>
                                {!notify.isRead && (
                                  <div className="mt-2 flex items-center justify-end">
                                    <span className="w-1.5 h-1.5 bg-[#3182ce] rounded-full animate-pulse" />
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>

                      {/* 底部固定入口：跳转独立消息中心 */}
                      <div className="p-2.5 bg-slate-50/80 border-t border-slate-100 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setShowNotifications(false);
                            router.push("/messages");
                          }}
                          className="text-xs font-bold text-[#3182ce] hover:underline flex items-center justify-center gap-1 w-full cursor-pointer py-0.5"
                        >
                          <span>查看更多通知消息 ➔</span>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* 全局搜索图标 - 仅在工作空间内显示 */}
              {isWorkspaceRoute && (
                <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-center w-9 h-9 cursor-pointer">
                  <Search className="w-4.5 h-4.5 text-slate-500" />
                </button>
              )}

              {/* 用户头像菜单 */}
              <AvatarDropdown 
                workspaceId={currentWorkspaceId}
                workspaceType={currentWorkspace?.type}
                userRole={
                  (currentWorkspace?.role === "OWNER"
                    ? "Owner"
                    : currentWorkspace?.role === "ADMIN"
                      ? "Admin"
                      : currentWorkspace?.role === "COMPONENT_MANAGER"
                        ? "ComponentAdmin"
                        : currentWorkspace?.role === "KNOWLEDGE_MANAGER"
                          ? "KnowledgeAdmin"
                          : currentWorkspace?.role === "VIEWER"
                            ? "Viewer"
                            : currentWorkspace?.role === "MEMBER"
                              ? "Member"
                              : undefined) as
                    | "Owner"
                    | "Admin"
                    | "ComponentAdmin"
                    | "KnowledgeAdmin"
                    | "Viewer"
                    | "Member"
                    | undefined
                }
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
