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
];

export default function AuthCheck({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const hasHandledErrorRef = useRef(false);
  const isRedirectingRef = useRef(false);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 处理认证错误的统一函数
  const handleAuthError = useCallback(
    (errorMessage: string) => {
      // 防止重复处理
      if (hasHandledErrorRef.current) {
        console.log("AuthCheck: 已经处理过错误，跳过");
        return;
      }
      hasHandledErrorRef.current = true;
      isRedirectingRef.current = true;

      // 清除定时器
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }

      // 清除本地存储
      localStorage.removeItem("userId");
      localStorage.removeItem("userRole");
      localStorage.removeItem("rememberMe"); // 清除"记住我"标记
      document.cookie = "auth_token=; path=/; max-age=0";
      sessionStorage.clear();

      // 显示 toast 提示语（3 秒后消失）
      toast.error(errorMessage, 3000);

      // 等待 toast 消失后再跳转（3.1 秒，确保 toast 完全消失）
      setTimeout(() => {
        window.location.href = "/auth/login";
      }, 3100);
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
      console.log(`AuthCheck: ${pathname} 是公开路径，跳过检查`);
      return;
    }

    console.log(`AuthCheck: ${pathname} 是受保护路径，开始检查认证`);

    // 如果正在重定向，跳过
    if (isRedirectingRef.current) {
      console.log("AuthCheck: 正在重定向，跳过检查");
      return;
    }

    try {
      // 1. 先调用 /api/auth/me 检查基本认证
      const res = await fetch("/api/auth/me", {
        signal: AbortSignal.timeout(10000), // 10 秒超时
      });

      console.log("AuthCheck: /api/auth/me 响应状态：" + res.status);

      // 处理 401 错误（未授权/被强制下线/超时）
      if (res.status === 401) {
        const errorData = await res.json();
        const errorMessage =
          errorData.error || errorData.message || "您已被强制下线，请重新登录";
        console.log("AuthCheck: 未授权，错误信息:", errorMessage);

        // 被管理员强制下线（宽限期已过）或超时，立即跳转登录页
        if (
          errorMessage.includes("管理员强制下线") ||
          errorMessage.includes("长时间未操作")
        ) {
          handleAuthError(errorMessage);
          return;
        }
        // 其他 401 错误，由 ActivityMonitor 处理
        console.log("AuthCheck: 其他错误，由 ActivityMonitor 处理");
        return;
      } else if (res.status === 200) {
        console.log("AuthCheck: /api/auth/me 认证通过");

        // 2. 不再调用 /api/auth/touch 检查超时（由 ActivityMonitor 负责）

        // 检测是否是关闭浏览器后重新打开
        const hasSession = sessionStorage.getItem("hasActiveSession");
        const userId =
          typeof window !== "undefined" ? localStorage.getItem("userId") : null;
        const rememberMe = localStorage.getItem("rememberMe");

        if (userId && !hasSession) {
          // 浏览器关闭后重新打开（localStorage 有 userId，但 sessionStorage 没有）
          // 设置 sessionStorage 标记
          sessionStorage.setItem("hasActiveSession", "true");

          // 检查是否是"记住我"登录
          if (rememberMe === "true") {
            // "记住我"登录，关闭浏览器后重新打开，直接重定向到首页
            console.log(
              "AuthCheck: 检测到浏览器重新打开（记住我模式），重定向到首页",
            );
            isRedirectingRef.current = true;
            router.push("/");
            return;
          } else {
            // 普通登录，关闭浏览器后重新打开，需要重新验证会话
            console.log(
              "AuthCheck: 检测到浏览器重新打开（普通模式），验证会话",
            );
            // 会话验证已通过（/api/auth/me 返回 200），重定向到首页
            isRedirectingRef.current = true;
            router.push("/");
            return;
          }
        } else if (userId && hasSession) {
          // 浏览器没有关闭过，正常访问
          console.log("AuthCheck: 浏览器会话持续中，正常访问");
        }
      }
    } catch (error) {
      console.error("AuthCheck: 检查认证失败:", error);
      // 忽略错误
    }
  }, [pathname, router, handleAuthError]);

  useEffect(() => {
    console.log("AuthCheck: useEffect 初始化，pathname:", pathname);

    // 立即检查一次
    checkAuth();

    // 设置定时器，每 2.5 分钟检查一次（宽限期 2 分钟 + 30 秒缓冲）
    // 这样用户最多在宽限期过后 30 秒内被提示
    console.log("AuthCheck: 设置定时器，每 2.5 分钟检查一次");
    checkIntervalRef.current = setInterval(checkAuth, 150000);

    // 页面获得焦点时也检查
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("AuthCheck: 页面获得焦点，检查身份验证");
        checkAuth();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 清理
    return () => {
      console.log("AuthCheck: 清理定时器");
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [checkAuth]);

  return <>{children}</>;
}
