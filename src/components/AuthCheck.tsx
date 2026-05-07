"use client";

import { useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useToast } from "./Toast";

// 不需要检查的路径
const PUBLIC_PATHS = [
  "/",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/init",
  "/admin", // 管理员后台，让 admin/layout.tsx 自己处理认证
];

export default function AuthCheck({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const hasHandledErrorRef = useRef(false);
  const isRedirectingRef = useRef(false);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ========== 在组件渲染的最开始就快速检查（不等待 useEffect）==========
  // 暂时禁用同步检查，只保留 useEffect 中的异步检查
  // 这样可以避免登录页面也被拦截
  
  /*
  if (typeof window !== "undefined") {
    const localStorageUserId = localStorage.getItem("userId");
    const token = document.cookie.includes("auth_token=");
    const isPublicPath = PUBLIC_PATHS.some((path) => {
      if (path === "/") {
        return pathname === "/";
      }
      return pathname.startsWith(path);
    });

    // 场景 1：未登录 + 非公开路径 → 立即跳转，不渲染 children
    if (!localStorageUserId && !token && !isPublicPath) {
      console.log("AuthCheck: 渲染时检测到未登录，立即跳转（场景 1）");
      console.log("localStorageUserId:", localStorageUserId);
      console.log("token:", token);
      console.log("isPublicPath:", isPublicPath);
      console.log("pathname:", pathname);
      
      // 保存原页面 URL
      if (pathname !== "/auth/login") {
        sessionStorage.setItem("redirectAfterLogin", pathname);
      }
      
      // 清除残留数据
      localStorage.removeItem("userId");
      localStorage.removeItem("userRole");
      localStorage.removeItem("rememberMe");
      document.cookie = "auth_token=; path=/; max-age=0";
      sessionStorage.setItem("just_redirected", "true");
      
      // 在页面上显示调试信息（跳转前能看到）
      document.body.innerHTML = `
        <div style="padding: 40px; font-family: monospace; background: #fff3cd; color: #856404;">
          <h2>⚠️ 检测到未登录，准备跳转</h2>
          <div style="margin: 20px 0; line-height: 2;">
            <div><strong>localStorageUserId:</strong> ${localStorageUserId || 'null'}</div>
            <div><strong>token (Cookie):</strong> ${token ? '存在' : '不存在'}</div>
            <div><strong>isPublicPath:</strong> ${isPublicPath}</div>
            <div><strong>pathname:</strong> ${pathname}</div>
            <div><strong>原页面 URL:</strong> ${sessionStorage.getItem("redirectAfterLogin") || '无'}</div>
          </div>
          <div style="color: #d9534f; font-weight: bold;">
            ⏰ 3 秒后跳转到登录页...
          </div>
          <div style="margin-top: 20px; font-size: 12px; color: #666;">
            问题原因：Cookie 中没有 auth_token，说明登录状态已失效
          </div>
        </div>
      `;
      
      // 延迟 3 秒跳转，让用户能看到调试信息
      setTimeout(() => {
        console.log("=== 3 秒后跳转登录页 ===");
        window.location.href = "/auth/login";
      }, 3000);
      
      // 不渲染 children，显示调试信息
      return null;
    }
    
    // 场景 10 优化：已登录用户访问登录页 → 立即重定向，不渲染登录页
    if (localStorageUserId && token && pathname === "/auth/login") {
      console.log("AuthCheck: 已登录用户访问登录页，立即重定向（场景 10）");
      setTimeout(() => {
        window.location.href = "/workspace-hub";
      }, 0);
      return null;
    }
  }
  */
  // ========== 快速检查结束 ==========

  // 处理认证错误的统一函数
  const handleAuthError = useCallback(
    (errorMessage: string) => {
      // 防止重复处理
      if (hasHandledErrorRef.current) {
        return;
      }

      // 检查是否正在退出登录，如果是，让 useLogout 处理
      const isLoggingOut = sessionStorage.getItem("is_logging_out") === "true";
      const justShowedLogout =
        sessionStorage.getItem("just_showed_logout") === "true";
      if (isLoggingOut || justShowedLogout) {
        return;
      }

      hasHandledErrorRef.current = true;
      isRedirectingRef.current = true;

      // 清除定时器
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }

      // 清除本地存储（但不包括 is_logging_out）
      localStorage.removeItem("userId");
      localStorage.removeItem("userRole");
      localStorage.removeItem("rememberMe");
      document.cookie = "auth_token=; path=/; max-age=0";
      sessionStorage.clear();

      // 显示 toast 提示语（1.5 秒后消失）
      toast.error(errorMessage, 1500);

      // 等待 toast 消失后再跳转（1.6 秒，确保 toast 完全消失）
      setTimeout(() => {
        window.location.href = "/auth/login";
      }, 1600);
    },
    [toast],
  );

  // 使用 useCallback 稳定 checkAuth 函数引用
  const checkAuth = useCallback(async () => {
    // 如果是公开路径，跳过检查（使用精确匹配）
    const isPublicPath = PUBLIC_PATHS.some((path) => {
      // 对于根路径 "/"，需要精确匹配
      if (path === "/") {
        return pathname === "/";
      }
      // 对于其他路径，检查是否以该路径开头
      return pathname.startsWith(path);
    });

    if (isPublicPath) {
      return;
    }

    // 如果正在重定向，跳过
    if (isRedirectingRef.current) {
      return;
    }

    try {
      // ========== 第一级：快速检查 localStorage ==========
      const localStorageUserId =
        typeof window !== "undefined" ? localStorage.getItem("userId") : null;

      // 场景 1：localStorage 没有 userId → 立即跳转，不调用 API
      if (!localStorageUserId) {
        isRedirectingRef.current = true;
        
        // 保存原页面 URL
        if (pathname !== "/auth/login") {
          sessionStorage.setItem("redirectAfterLogin", pathname);
        }
        
        // 清除残留数据
        localStorage.removeItem("userId");
        localStorage.removeItem("userRole");
        localStorage.removeItem("rememberMe");
        document.cookie = "auth_token=; path=/; max-age=0";
        sessionStorage.setItem("just_redirected", "true");
        
        // 显示 toast 提示后跳转
        toast.error("请先登录", 1500);
        setTimeout(() => {
          window.location.href = "/auth/login";
        }, 1600);
        
        return;
      }

      // ========== 第三级：调用 API 验证 ==========
      const res = await fetch("/api/auth/me", {
        signal: AbortSignal.timeout(10000), // 10 秒超时
      });

      // 处理 401 错误（未授权/被强制下线/超时）
      if (res.status === 401 || res.status === 403) {
        // 认证失败，清除所有数据并跳转
        localStorage.removeItem("userId");
        localStorage.removeItem("userRole");
        localStorage.removeItem("rememberMe");
        document.cookie = "auth_token=; path=/; max-age=0";
        sessionStorage.clear();
        
        toast.error("登录已过期，请重新登录", 1500);
        setTimeout(() => {
          window.location.href = "/auth/login";
        }, 1600);
        return;
      } else if (res.status === 200) {
        // 获取用户角色
        const userData = await res.json();
        const userRole = userData.user?.role;
        const userId = userData.user?.id;

        // 调用 /api/auth/touch 更新 lastLoginAt，保持会话活跃
        try {
          await fetch("/api/auth/touch", {
            method: "POST",
            signal: AbortSignal.timeout(5000),
          });
        } catch (touchError) {
          // 忽略错误
        }

        // 检查是否是管理员页面
        const isAdminPage = pathname.startsWith("/admin");
        const isAdminUser = userRole && [
          "admin",
          "super_admin",
          "superadmin",
          "ADMIN",
          "SUPERADMIN",
          "SUPER_ADMIN"
        ].includes(userRole);

        // 普通用户尝试访问管理员页面，重定向到首页
        if (isAdminPage && !isAdminUser) {
          isRedirectingRef.current = true;
          router.push("/workspace-hub");
          return;
        }

        // 检测是否是关闭浏览器后重新打开
        const hasSession = sessionStorage.getItem("hasActiveSession");
        const rememberMe = localStorage.getItem("rememberMe");

        if (localStorageUserId && !hasSession) {
          // 浏览器关闭后重新打开（localStorage 有 userId，但 sessionStorage 没有）
          // 设置 sessionStorage 标记
          sessionStorage.setItem("hasActiveSession", "true");

          // 检查是否是"记住我"登录
          if (rememberMe === "true") {
            // "记住我"登录，关闭浏览器后重新打开，保持在当前页面
            return;
          } else {
            // 普通登录，关闭浏览器后重新打开，需要重新验证会话
            // 会话验证已通过（/api/auth/me 返回 200），保持在当前页面
            return;
          }
        }
      }
    } catch (error) {
      // 忽略错误
    }
  }, [pathname, router, handleAuthError]);

  useEffect(() => {
    // 登录页面和注册页面直接跳过检查，避免死循环
    if (pathname === "/auth/login" || pathname === "/auth/register" || pathname === "/auth/forgot-password") {
      // 已登录用户访问登录页 → 显示提示，不重定向（场景 10 优化）
      if (typeof window !== "undefined") {
        const localStorageUserId = localStorage.getItem("userId");
        const token = document.cookie.includes("auth_token=");
        
        if (localStorageUserId && token && pathname === "/auth/login") {
          // 不重定向，让用户自己决定
          return;
        }
      }
      
      // 其他情况直接跳过
      return;
    }

    // 立即检查一次
    checkAuth();

    // 设置定时器，每 2.5 分钟检查一次（宽限期 2 分钟 + 30 秒缓冲）
    checkIntervalRef.current = setInterval(checkAuth, 150000);

    // 监听其他标签页的退出登录事件
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "logged_out" && event.newValue === "true") {
        localStorage.removeItem("logged_out"); // 清除标记，防止无限循环
        
        // 清除所有存储
        localStorage.removeItem("userId");
        localStorage.removeItem("userRole");
        localStorage.removeItem("rememberMe");
        document.cookie = "auth_token=; path=/; max-age=0";
        sessionStorage.clear();
        
        // 显示 toast 提示后跳转
        toast.error("已在其他设备退出登录", 1500);
        setTimeout(() => {
          window.location.href = "/auth/login";
        }, 1600);
      }
    };

    window.addEventListener("storage", handleStorageChange);

    // 页面获得焦点时也检查
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkAuth();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 清理
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
