"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Search, Plus, LogOut, Shield, Settings, Palette, Globe } from "lucide-react";
import { useAppContext } from "@/contexts/AppContext";
import { useLogout } from "@/hooks/useLogout";

export default function AvatarDropdown() {
  const router = useRouter();
  const { userState, setUserState } = useAppContext();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const handleLogout = useLogout();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSwitchWorkspace = async (workspaceId: string) => {
    try {
      const res = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });

      if (res.ok) {
        setUserState((prev) => ({
          ...prev,
          currentWorkspaceId: workspaceId,
          workspaces: prev.workspaces.map((ws) => ({
            ...ws,
            isCurrent: ws.id === workspaceId,
          })),
        }));
        router.push(`/workspace-hub`);
      }
    } catch (error) {
      console.error("Switch workspace error:", error);
    }
    setShowDropdown(false);
  };

  if (!userState.isLoggedIn || !userState.userInfo) {
    return null;
  }

  const { userInfo } = userState;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer"
      >
        {userInfo.avatar ? (
          <img
            src={userInfo.avatar}
            alt={userInfo.name}
            className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-sm"
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold shadow-sm">
            {userInfo.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="text-left hidden lg:block">
          <p className="text-sm font-medium text-slate-800">
            {userInfo.name || "用户"}
          </p>
          <p className="text-xs text-slate-500">
            {userInfo.email || "未绑定邮箱"}
          </p>
        </div>
        <svg
          className={`w-3 h-3 text-slate-500 transition-transform duration-200 ${
            showDropdown ? "rotate-180" : ""
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

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-[0_8px_20px_-4px_rgba(15,23,42,0.12)] border border-slate-100 py-1 z-50 overflow-hidden">
          {/* 设置导航区 */}
          <div className="px-4 py-2">
            {/* 管理员后台入口 */}
            {userInfo.role?.toUpperCase() === "SUPERADMIN" && (
              <button
                onClick={() => {
                  router.push("/platform-admin");
                  setShowDropdown(false);
                }}
                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-red-50 transition-colors group mb-1 whitespace-nowrap"
              >
                <Shield className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-sm text-red-600 font-medium flex-1 text-left whitespace-nowrap">
                  平台管理中心
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r from-orange-500 to-red-500 text-white flex-shrink-0">
                  超管
                </span>
              </button>
            )}
            {userInfo.role?.toUpperCase() === "ADMIN" && (
              <button
                onClick={() => {
                  router.push("/admin");
                  setShowDropdown(false);
                }}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-red-50 transition-colors group mb-1"
              >
                <Shield className="w-4 h-4 text-red-500" />
                <span className="text-sm text-red-600 font-medium flex-1 text-left">
                  管理员后台
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600">
                  管理员
                </span>
              </button>
            )}

            {/* 个人工作台 */}
            <button
              onClick={() => {
                router.push("/user/dashboard");
                setShowDropdown(false);
              }}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors group mb-1"
            >
              <Settings className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
              <span className="text-sm text-slate-700 font-medium group-hover:text-blue-600 transition-colors">
                个人工作台
              </span>
            </button>

            {/* 个人设置 */}
            <button
              onClick={() => {
                router.push("/user/profile");
                setShowDropdown(false);
              }}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors group"
            >
              <Palette className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
              <span className="text-sm text-slate-700 font-medium group-hover:text-blue-600 transition-colors">
                个人设置
              </span>
            </button>
          </div>

          {/* 工作空间切换区 */}
          {userState.workspaces.length > 0 && (
            <>
              <div className="px-4 py-2 border-t border-slate-100">
                {userState.workspaces.map((workspace) => (
                  <button
                    key={workspace.id}
                    onClick={() => handleSwitchWorkspace(workspace.id)}
                    className="w-full flex items-center justify-between px-2 py-1.5 rounded-[4px] hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-700">
                        {workspace.name}
                      </span>
                      {workspace.type === "PERSONAL" && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">
                          个人
                        </span>
                      )}
                    </div>
                    {workspace.isCurrent && (
                      <Check className="w-4 h-4 text-blue-500" />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* 退出登录 */}
          <div className="px-4 py-2 border-t border-slate-100">
            <button
              onClick={() => {
                handleLogout();
                setShowDropdown(false);
              }}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-red-50 transition-colors group"
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
  );
}