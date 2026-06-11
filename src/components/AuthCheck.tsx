"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useToast } from "./Toast";

// 不需要检查的公共路径 - 营销页面所有人都能访问
const PUBLIC_PATHS = [
  "/",
  "/capabilities",
  "/solutions",
  "/security",
  "/pricing",
  "/developers",
  "/docs",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/change-password",
  "/init",
];

export default function AuthCheck({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const hasHandledErrorRef = useRef(false);
  const isRedirectingRef = useRef(false);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 检查是否是公共路径
  const isPublicPath = () => {
    return PUBLIC_PATHS.some((path) => {
      if (path === "/") {
        return pathname === "/";
      }
      return pathname.startsWith(path);
    });
  };

  // 处理认证错误的统一函数
  const handleAuthError = useCallback(
    (errorMessage: string) => {
      if (hasHandledErrorRef.current) return;

      const isLoggingOut = sessionStorage.getItem("is_logging_out") === "true";
      const justShowedLogout =
        sessionStorage.getItem("just_showed_logout") === "true";
      if (isLoggingOut || justShowedLogout) {
        return;
      }

      hasHandledErrorRef.current = true;
      isRedirectingRef.current = true;

      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }

      localStorage.removeItem("userId");
      localStorage.removeItem("userRole");
      localStorage.removeItem("rememberMe");
      document.cookie = "auth_token=; path=/; max-age=0";
      sessionStorage.clear();

      toast.error(errorMessage, 1500);

      setTimeout(() => {
        window.location.href = "/";
      }, 1600);
    },
    [toast],
  );

  const checkAuth = useCallback(async () => {
    // 公共营销页面直接跳过检查
    if (isPublicPath()) {
      return;
    }

    if (isRedirectingRef.current) {
      return;
    }

    try {
      const localStorageUserId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : null;

      // 场景 1：localStorage 没有 userId → 立即跳转，不调用 API
      if (!localStorageUserId) {
        isRedirectingRef.current = true;
        
        // 如果是公共页面，不需要跳转
        if (isPublicPath()) {
          return;
        }
        
        if (pathname !== "/auth/login") {
          sessionStorage.setItem("redirectAfterLogin", pathname);
        }
        
        localStorage.removeItem("userId");
        localStorage.removeItem("userRole");
        localStorage.removeItem("rememberMe");
        document.cookie = "auth_token=; path=/; max-age=0";
        sessionStorage.setItem("just_redirected", "true");
        
        toast.error("请先登录", 1500);
        setTimeout(() => {
          window.location.href = "/auth/login";
        }, 1600);
        
        return;
      }

      // 调用 API 验证
      const res = await fetch("/api/auth/me", {
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("userId");
        localStorage.removeItem("userRole");
        localStorage.removeItem("rememberMe");
        document.cookie = "auth_token=; path=/; max-age=0";
        sessionStorage.clear();
        
        toast.error("登录已过期，请重新登录", 1500);
        setTimeout(() => {
          window.location.href = "/";
        }, 1600);
        return;
      } else if (res.status === 200) {
        const userData = await res.json();
        const userRole = userData.user?.role;

        try {
          await fetch("/api/auth/touch", {
            method: "POST",
            signal: AbortSignal.timeout(5000),
          });
        } catch (touchError) {
          // 忽略错误
        }

        const isAdminPage = pathname.startsWith("/admin");
        const isAdminUser = userRole && [
          "admin",
          "super_admin",
          "superadmin",
          "ADMIN",
          "SUPERADMIN",
          "SUPER_ADMIN"
        ].includes(userRole);

        if (isAdminPage && !isAdminUser) {
          isRedirectingRef.current = true;
          router.push("/workspace-hub");
          return;
        }

        const hasSession = sessionStorage.getItem("hasActiveSession");
        const rememberMe = localStorage.getItem("rememberMe");

        if (localStorageUserId && !hasSession) {
          sessionStorage.setItem("hasActiveSession", "true");
          return;
        }
      }
    } catch (error) {
      // 忽略错误
    }
  }, [pathname, router, handleAuthError]);

  useEffect(() => {
    // 公共营销页面直接跳过检查，允许所有用户访问
    if (isPublicPath()) {
      return;
    }

    checkAuth();

    checkIntervalRef.current = setInterval(checkAuth, 150000);

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "logged_out" && event.newValue === "true") {
        localStorage.removeItem("logged_out");
        
        localStorage.removeItem("userId");
        localStorage.removeItem("userRole");
        localStorage.removeItem("rememberMe");
        document.cookie = "auth_token=; path=/; max-age=0";
        sessionStorage.clear();
        
        toast.error("已在其他设备退出登录", 1500);
        setTimeout(() => {
          window.location.href = "/";
        }, 1600);
      }
    };

    window.addEventListener("storage", handleStorageChange);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkAuth();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [checkAuth]);

  return <>{children}</>;
}
