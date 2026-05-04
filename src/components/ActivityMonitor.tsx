"use client";

import { useEffect, useRef } from "react";
import { useToast } from "./Toast";

/**
 * 全局活跃时间监控组件
 *
 * 功能：
 * - 监听用户操作（点击、滚动、按键等）
 * - 在用户操作时立即检查是否超过 5 分钟未操作
 * - 如果超时，显示提示语，然后立即跳转登录页
 * - 全局拦截 401 错误，统一处理
 */

export function ActivityMonitor() {
  const lastCheckRef = useRef<number>(0);
  const checkingRef = useRef<boolean>(false);
  const toast = useToast();

  // 检查是否超时
  const checkTimeout = async () => {
    // 如果正在检查，跳过
    if (checkingRef.current) {
      return;
    }

    const userId =
      typeof window !== "undefined" ? localStorage.getItem("userId") : null;
    const hasCookie =
      typeof window !== "undefined"
        ? document.cookie.includes("auth_token=")
        : false;
    const isLoggingOut =
      typeof window !== "undefined"
        ? sessionStorage.getItem("is_logging_out") === "true"
        : false;
    const justShowedLogout =
      typeof window !== "undefined"
        ? sessionStorage.getItem("just_showed_logout") === "true"
        : false;

    // 关键检查：用户必须已登录（有 userId 且有 auth_token）且不在退出登录过程中
    if (isLoggingOut || justShowedLogout) {
      console.log("[ActivityMonitor] 用户正在退出登录或刚显示退出提示，跳过检查", {
        isLoggingOut,
        justShowedLogout,
      });
      checkingRef.current = false;
      return;
    }

    if (!userId || !hasCookie) {
      console.log("[ActivityMonitor] 用户未登录，跳过检查", {
        userId,
        hasCookie,
      });
      checkingRef.current = false;
      return;
    }

    const now = Date.now();
    // 距离上次检查至少 5 秒才再次检查，避免过于频繁
    if (now - lastCheckRef.current < 5000) {
      return;
    }

    lastCheckRef.current = now;
    checkingRef.current = true;

    try {
      // 调用 touch API 检查是否超时
      const res = await fetch("/api/auth/touch", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${userId}`,
        },
      });

      console.log("[ActivityMonitor] /api/auth/touch 响应状态:", res.status);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorCode = errorData.error || "SESSION_TIMEOUT";
        console.log("[ActivityMonitor] 检测到超时或错误:", errorCode);

        // 清除所有存储
        localStorage.removeItem("userId");
        localStorage.removeItem("userRole");
        localStorage.removeItem("auth_token");
        localStorage.removeItem("userEmail");
        localStorage.removeItem("userName");
        sessionStorage.clear();
        document.cookie = "auth_token=; path=/; max-age=0";

        // 判断错误类型
        if (
          errorCode === "FORCED_LOGOUT" ||
          errorData.message?.includes("管理员强制下线")
        ) {
          // 被管理员强制下线（宽限期已过）
          toast.error("您已被管理员强制下线，请重新登录", 3000);
        } else {
          // 超时（超过 5 分钟未操作）
          toast.error("您已长时间未操作，请重新登录", 3000);
        }

        // 等待 toast 消失后再跳转（3.1 秒，确保 toast 完全消失）
        setTimeout(() => {
          window.location.href = "/auth/login";
        }, 3100);
        return;
      }

      console.log("[ActivityMonitor] 用户活跃，未超时");
    } catch (error) {
      console.error("[ActivityMonitor] 检查超时失败:", error);
    } finally {
      checkingRef.current = false;
    }
  };

  useEffect(() => {
    console.log("[ActivityMonitor] 开始监听用户操作");

    // 监听用户交互事件
    const events = ["mousedown", "keydown", "scroll", "touchstart", "click"];

    const handleEvent = () => {
      checkTimeout();
    };

    events.forEach((event) => {
      document.addEventListener(event, handleEvent, { passive: true });
    });

    // 监听页面获得焦点（用户从其他标签页切换回来）
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("[ActivityMonitor] 页面获得焦点，检查超时");
        checkTimeout();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 清理函数
    return () => {
      console.log("[ActivityMonitor] 停止监听");
      events.forEach((event) => {
        document.removeEventListener(event, handleEvent);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // 不渲染任何内容
  return null;
}
