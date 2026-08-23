"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useToast } from "./Toast";
import {
  SESSION_ERROR_MESSAGES,
  VALIDATE_ERROR_TO_SESSION_CODE,
  SESSION_ERROR_CODES,
} from "@/lib/session-constants";
import { getAuthToken, getCurrentUserId } from "@/utils/auth";

// 不需要检查的公共路径 - 营销页面所有人都能访问
const PUBLIC_PATHS = [
  "/",
  "/studio",
  "/solutions",
  "/security",
  "/pricing",
  "/developers",
  "/docs",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/change-password",
  "/auth/verify-crossregion",
  "/auth/cancel-deletion",
  "/auth/oauth-callback",
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

  // 将后端 validateUser 内部错误码映射到 PRD 统一前端错误码与提示
  const resolveSessionMessage = (reason: string): string => {
    const code = VALIDATE_ERROR_TO_SESSION_CODE[reason] || reason;
    return SESSION_ERROR_MESSAGES[code] || "登录已过期，请重新登录";
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
      const authToken = getAuthToken();

      // 场景 1：localStorage 没有有效凭证 → 立即跳转，不调用 API
      if (!authToken) {
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
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        credentials: "include",
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 401 || res.status === 403) {
        // 读取后端返回的失效原因，给出精准提示（PRD 四·3 错误码约定）
        let reason = "";
        let code = "";
        try {
          const errData = await res.json();
          reason = errData?.error || errData?.reason || "";
          code = errData?.code || VALIDATE_ERROR_TO_SESSION_CODE[reason] || "";
        } catch {
          // 无响应体时使用默认提示
        }

        // F-03：空间成员关系已移除 → 清空空间缓存，跳转中控台
        if (code === SESSION_ERROR_CODES.W_001 || reason === "WORKSPACE_REMOVED") {
          localStorage.removeItem("currentWorkspaceId");
          sessionStorage.removeItem("currentWorkspaceId");
          toast.error(SESSION_ERROR_MESSAGES[SESSION_ERROR_CODES.W_001], 1500);
          setTimeout(() => {
            window.location.href = "/workspace-hub";
          }, 1600);
          return;
        }

        // G-02：系统维护中 → 展示维护页
        if (code === SESSION_ERROR_CODES.M_503 || reason === "MAINTENANCE_MODE") {
          setTimeout(() => {
            window.location.href = "/maintenance";
          }, 1600);
          return;
        }

        localStorage.removeItem("userId");
        localStorage.removeItem("userRole");
        localStorage.removeItem("rememberMe");
        document.cookie = "auth_token=; path=/; max-age=0";
        sessionStorage.clear();

        toast.error(resolveSessionMessage(reason), 1500);
        setTimeout(() => {
          window.location.href = "/";
        }, 1600);
        return;
      } else if (res.status === 200) {
        const userData = await res.json();
        const userRole = userData.user?.role;

        // D-02：账号注销冷静期内的用户不允许进入业务页面，
        // 强制引导至撤销注销流程（保留会话，不做状态清理）。
        if (userData.user?.status === "deleting") {
          isRedirectingRef.current = true;
          toast.error("账号正在注销中，请先撤销注销", 1500);
          setTimeout(() => {
            window.location.href = "/auth/cancel-deletion";
          }, 1600);
          return;
        }

        // 注意：此处不得调用 /api/auth/touch。
        // 该定时校验属于后台心跳，若在此刷新活跃时间，
        // 空闲超时（IDLE_TIMEOUT）将永远无法触发。
        // 活跃时间仅由 ActivityMonitor 在真实用户交互时上报。

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

        // 密码过期强制拦截：未处于修改密码页时，全局拦截到改密页（C-04）
        if (userData.passwordExpired && pathname !== "/auth/change-password") {
          isRedirectingRef.current = true;
          router.push("/auth/change-password?expired=true");
          return;
        }

        const hasSession = sessionStorage.getItem("hasActiveSession");

        if (getCurrentUserId() && !hasSession) {
          sessionStorage.setItem("hasActiveSession", "true");
          return;
        }
      }
    } catch (error) {
      // 忽略错误
    }
  }, [pathname, router]);

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
