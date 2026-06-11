"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Logo } from "./Logo";
import AvatarDropdown from "./AvatarDropdown";
import DynamicCTA from "./DynamicCTA";
import { useAppContext } from "@/contexts/AppContext";

export default function GlobalHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { userState, isLoading } = useAppContext();

  const isWorkspaceRoute = pathname.startsWith("/workspace/") && pathname !== "/workspace-hub";

  return (
    <header className="h-[60px] fixed top-0 left-0 w-full z-50 backdrop-blur-md bg-white/95 border-b border-slate-200/80 shadow-sm">
      <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
        {/* 左侧区：Logo */}
        <Logo
          className="flex items-center cursor-pointer"
          variant="light"
          onClick={() => router.push("/")}
        />

        {/* 中间区：营销菜单 */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <button 
            onClick={() => router.push("/capabilities")} 
            className={`transition-colors cursor-pointer ${pathname === "/capabilities" ? "text-[#2b6cb0] font-bold" : "hover:text-[#2b6cb0]"}`}
          >
            产品能力
          </button>
          <button 
            onClick={() => router.push("/solutions")} 
            className={`transition-colors cursor-pointer ${pathname === "/solutions" ? "text-[#2b6cb0] font-bold" : "hover:text-[#2b6cb0]"}`}
          >
            解决方案
          </button>
          <button 
            onClick={() => router.push("/security")} 
            className={`transition-colors cursor-pointer ${pathname === "/security" ? "text-[#2b6cb0] font-bold" : "hover:text-[#2b6cb0]"}`}
          >
            私有化与安全
          </button>
          <button 
            onClick={() => router.push("/pricing")} 
            className={`transition-colors cursor-pointer ${pathname === "/pricing" ? "text-[#2b6cb0] font-bold" : "hover:text-[#2b6cb0]"}`}
          >
            价格方案
          </button>
          <button 
            onClick={() => router.push("/developers")} 
            className={`transition-colors cursor-pointer ${pathname === "/developers" ? "text-[#2b6cb0] font-bold" : "hover:text-[#2b6cb0]"}`}
          >
            开发者文档
          </button>
        </nav>

        {/* 右侧区：动态操作区 */}
        <div className="flex items-center gap-3">
          {isLoading ? (
            <div className="flex items-center gap-3">
              <div className="w-24 h-9 bg-slate-200 rounded-[4px] animate-pulse" />
              <div className="w-32 h-9 bg-slate-200 rounded-[4px] animate-pulse" />
            </div>
          ) : !userState.isLoggedIn ? (
            <>
              <button 
                onClick={() => router.push("/auth/login")}
                className="px-4 py-2 text-sm font-medium text-[#2b6cb0] hover:text-[#3182ce] transition-colors cursor-pointer"
              >
                登录/注册
              </button>
              <DynamicCTA size="sm" />
            </>
          ) : (
            <>
              {/* 全局搜索图标 - 仅在工作空间内显示 */}
              {isWorkspaceRoute && (
                <button className="p-2 hover:bg-slate-100 rounded-[8px] transition-colors duration-200 ease-out">
                  <Search className="w-5 h-5 text-slate-500" />
                </button>
              )}
              <DynamicCTA size="sm" />
              <AvatarDropdown />
            </>
          )}
        </div>
      </div>
    </header>
  );
}