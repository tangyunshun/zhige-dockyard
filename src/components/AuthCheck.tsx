"use client";

import { useEffect, useRef } from "react";
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

  const checkAuth = async () => {
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
      const res = await fetch("/api/auth/me", {
        signal: AbortSignal.timeout(5000),
      });

      console.log("AuthCheck: API 响应状态：" + res.status);

      // 处理 401 错误（未授权/被强制下线）
      if (res.status === 401) {
        const errorData = await res.json();
        const errorMessage =
          errorData.error || errorData.message || "您已被强制下线，请重新登录";
        console.log("AuthCheck: 未授权，错误信息:", errorMessage);

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

        // 使用 sessionStorage 防止重复显示 toast
        const sessionKey = `auth_error_${Date.now()}`;
        const alreadyShown = sessionStorage.getItem(sessionKey);

        if (!alreadyShown) {
          sessionStorage.setItem(sessionKey, "true");
          // 强制下线提示显示 5 秒
          toast.error(errorMessage, 5000);
        }

        // 清除本地存储
        localStorage.removeItem("userId");
        localStorage.removeItem("userRole");
        document.cookie = "auth_token=; path=/; max-age=0";

        // 5 秒后 toast 消失，立即跳转到登录页
        setTimeout(() => {
          window.location.href = `/auth/login?error=${encodeURIComponent(errorMessage)}`;
        }, 6100);
        return;
      } else if (res.status === 200) {
        console.log("AuthCheck: 认证通过");
      }
    } catch (error) {
      console.error("AuthCheck: 检查认证失败:", error);
      // 忽略错误
    }
  };

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
  }, [pathname, router, toast]);

  return <>{children}</>;
}
