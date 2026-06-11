"use client";

import { usePathname } from "next/navigation";
import { AppProvider } from "@/contexts/AppContext";
import RouterGuards from "@/components/RouterGuards";
import GlobalHeader from "@/components/GlobalHeader";
import { ToastProvider } from "@/components/Toast";
import AuthCheck from "@/components/AuthCheck";
import { ActivityMonitor } from "@/components/ActivityMonitor";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  // 检查是否是管理员路由
  const isAdminRoute = pathname.startsWith("/admin/");

  // 检查是否是认证路由（登录、注册等）
  const isAuthRoute = pathname.startsWith("/auth/");

  return (
    <AppProvider>
      <ToastProvider>
        <AuthCheck>
          <RouterGuards>
            {/* 根据路由显示不同的 Header */}
            {isAdminRoute || isAuthRoute ? (
              children
            ) : (
              <>
                <GlobalHeader />
                <div className="pt-[60px]">
                  {children}
                </div>
              </>
            )}
          </RouterGuards>
        </AuthCheck>
        <ActivityMonitor />
      </ToastProvider>
    </AppProvider>
  );
}
