"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppContext } from "@/contexts/AppContext";

// 公共营销页面 - 所有人都能访问（包括未登录用户）
const PUBLIC_ROUTES = [
  "/",
  "/capabilities",
  "/solutions",
  "/security",
  "/pricing",
  "/developers",
  "/docs",
];

// 认证页面 - 主要供未登录用户访问
const AUTH_ROUTES = ["/auth/"];

// 登录用户专属页面
const LOGGED_IN_ROUTES = [
  "/workspace-hub",
  "/workspace/",
  "/user/",
];

// 管理员页面
const ADMIN_ROUTES = ["/admin/", "/platform-admin/"];

export default function RouterGuards({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { userState, isLoading } = useAppContext();

  useEffect(() => {
    // 检查是否是认证路由
    const isAuthRoute = AUTH_ROUTES.some((route) => 
      pathname.startsWith(route)
    );

    // 检查是否是公共营销页面
    const isPublicRoute = PUBLIC_ROUTES.some((route) => 
      pathname === route || pathname.startsWith(route + "/")
    );

    // 检查是否是登录用户专属页面
    const isLoggedInRoute = LOGGED_IN_ROUTES.some((route) => 
      pathname.startsWith(route)
    );

    // 检查是否是管理员页面
    const isAdminRoute = ADMIN_ROUTES.some((route) => 
      pathname.startsWith(route)
    );

    // 公共营销页面：直接允许访问，不做任何拦截
    if (isPublicRoute) {
      return;
    }

    // 认证页面：允许访问（登录和未登录用户都可以访问）
    if (isAuthRoute) {
      // 已登录用户访问登录/注册页，重定向到工作空间
      if (userState.isLoggedIn && !pathname.startsWith("/auth/oauth-callback")) {
        router.replace("/workspace-hub");
      }
      return;
    }

    // 数据还在加载中，等待加载完成
    if (isLoading) {
      return;
    }

    // 登录用户专属页面
    if (isLoggedInRoute) {
      if (!userState.isLoggedIn) {
        router.replace("/auth/login?redirect=" + encodeURIComponent(pathname));
      }
      return;
    }

    // 管理员页面
    if (isAdminRoute) {
      if (!userState.isLoggedIn) {
        router.replace("/");
      } else {
        const role = (userState.userInfo?.role || '').toLowerCase();
        const isAdmin = ['superadmin', 'super_admin', 'admin'].includes(role);
        if (!isAdmin) {
          router.replace("/workspace-hub");
        }
      }
      return;
    }

  }, [userState.isLoggedIn, userState.userInfo?.role, pathname, router, isLoading]);

  return <>{children}</>;
}
