"use client";

import { usePathname, useRouter } from "next/navigation";
import { Home, LayoutGrid, Boxes, User, Plus } from "lucide-react";
import { useDevice } from "@/contexts/DeviceContext";
import { useAppContext } from "@/contexts/AppContext";

/**
 * 全局移动端底部导航：仅在触屏/移动形态显示
 * 提供首页、工作空间中枢、组件大厅、个人中心四个核心入口，兼顾跨平台一致体验。
 */
export default function MobileBottomNav() {
  const { isMobile, isTouch } = useDevice();
  const { userState } = useAppContext();
  const pathname = usePathname();
  const router = useRouter();

  if (!isMobile && !isTouch) return null;
  if (!userState.isLoggedIn) return null;

  const items = [
    { key: "home", label: "首页", icon: Home, href: "/" },
    { key: "hub", label: "空间", icon: LayoutGrid, href: "/workspace-hub" },
    { key: "studio", label: "组件", icon: Boxes, href: "/studio" },
    { key: "user", label: "我的", icon: User, href: "/user/dashboard" },
  ];

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <nav className="fixed bottom-0 inset-x-0 z-50 md:hidden bg-white/95 backdrop-blur-md border-t border-slate-200 flex items-stretch justify-around zg-bottom-safe">
      {items.map((it) => {
        const active = isActive(it.href);
        const Icon = it.icon;
        return (
          <button
            key={it.key}
            onClick={() => router.push(it.href)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] cursor-pointer transition-colors ${
              active ? "text-[#3182ce]" : "text-slate-400"
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-bold">{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
