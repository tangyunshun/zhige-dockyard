"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAppContext } from "@/contexts/AppContext";

// 客户端停机维护状态轻量缓存（10秒有效期，避免页面跳转时的高频冗余轮询）
let cachedMaintenance: { inMaintenance: boolean; expiresAt: number } | null = null;

async function queryMaintenanceMode(): Promise<boolean> {
  const now = Date.now();
  if (cachedMaintenance && cachedMaintenance.expiresAt > now) {
    return cachedMaintenance.inMaintenance;
  }
  try {
    const res = await fetch(`/api/system/check-maintenance?t=${now}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      const inMaintenance = Boolean(data.inMaintenance);
      cachedMaintenance = { inMaintenance, expiresAt: now + 10000 };
      return inMaintenance;
    }
  } catch {
    // 网络抖动容错放行
  }
  return false;
}

// 公共营销页面 - 所有人都能访问（包括未登录用户）
const PUBLIC_ROUTES = [
  "/",
  "/studio",
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
  "/knowledge",
];

// 管理员页面
const ADMIN_ROUTES = ["/admin/"];

export default function RouterGuards({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { userState, isLoading } = useAppContext();
  const [isBlockedByMaintenance, setIsBlockedByMaintenance] = useState(false);

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

    // 核心安全闭环：停机维护模式全站阻断判定（严防普通用户借“返回首页”绕过维护页）
    const role = (userState.userInfo?.role || "").toLowerCase();
    const isAdmin = ["superadmin", "super_admin", "admin"].includes(role);

    // 白名单放行路径：维护展示页本身、后台运维路径、以及显式携带 admin=true 的运维登录页
    const isMaintenanceExempt =
      pathname === "/maintenance" ||
      pathname.startsWith("/admin") ||
      pathname === "/releases" ||
      (pathname.startsWith("/auth/login") &&
        typeof window !== "undefined" &&
        window.location.search.includes("admin=true"));

    if (!isAdmin && !isMaintenanceExempt) {
      // 检查系统当前是否开启停机维护模式
      queryMaintenanceMode().then((inMaintenance) => {
        if (inMaintenance) {
          setIsBlockedByMaintenance(true);
          router.replace("/maintenance");
        }
      });
    }

    if (pathname === "/maintenance") {
      setIsBlockedByMaintenance(false);
    }

    // 公共营销页面：直接允许访问，不做任何拦截（但需经过上述维护模式前置阻断）
    if (isPublicRoute) {
      return;
    }

    // 认证页面：允许访问（登录和未登录用户都可以访问）
    if (isAuthRoute) {
      // 仅对「登录 / 注册」页做已登录重定向，避免把已登录用户从其余认证页弹走。
      // 例外页面说明：
      // - /auth/forgot-password  忘记密码：已登录用户同样有正当访问场景（如主动重置密码）
      //   （若被重定向，AppContext 本地缓存恢复 isLoggedIn 的时序会导致"闪现后弹回"，
      //    且 workspace-hub 凭证校验失败时还会再次弹回登录页）
      // - /auth/change-password  密码过期强制改密：被重定向会与 AuthCheck 的
      //   改密拦截形成死循环（改密页 → 工作台 → 强制改密 → 改密页 → …）
      // - /auth/cancel-deletion  注销冷静期撤销页：重定向会与 AuthCheck 弹回形成死循环
      // - /auth/oauth-callback   OAuth 回调页：登录流程必经页，不可重定向
      // - /auth/verify-crossregion 异地登录二次验证页：登录流程必经页，不可重定向
      const isLoginOrRegisterPage =
        pathname.startsWith("/auth/login") || pathname.startsWith("/auth/register");
      if (userState.isLoggedIn && isLoginOrRegisterPage) {
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

  if (isBlockedByMaintenance && pathname !== "/maintenance") {
    return null;
  }

  return <>{children}</>;
}
