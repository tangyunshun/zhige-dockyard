﻿﻿﻿"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * 全局会话超时遮罩层组件
 *
 * 功能：
 * - 在用户超过5分钟无操作时显示遮罩层
 * - 弹出提示弹窗，内容为"会话已过期，请重新登录"
 * - 弹窗底部包含"确定"按钮
 * - 用户点击"确定"按钮后，系统立即自动重定向至登录页面
 */

interface SessionTimeoutOverlayProps {
  show: boolean;
  onConfirm: () => void;
}

function SessionTimeoutOverlay({ show, onConfirm }: SessionTimeoutOverlayProps) {
  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[99999]">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 relative">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-7 h-7 text-orange-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">
            会话已过期
          </h3>
          <p className="text-sm text-slate-600 mb-6">
            您已超过5分钟未进行任何操作，请重新登录
          </p>
          <button
            onClick={onConfirm}
            className="w-full px-4 py-2.5 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}

export function ActivityMonitor() {
  const lastActivityRef = useRef<number>(Date.now());
  const lastCheckRef = useRef<number>(0);
  const checkingRef = useRef<boolean>(false);
  const [showTimeoutOverlay, setShowTimeoutOverlay] = useState(false);

  const TIMEOUT_DURATION = 5 * 60 * 1000; // 5分钟
  const CHECK_INTERVAL = 10000; // 每10秒检查一次

  const handleSessionTimeout = () => {
    console.log("[ActivityMonitor] 检测到会话超时，显示遮罩层");

    // 清除所有存储
    localStorage.removeItem("userId");
    localStorage.removeItem("userRole");
    localStorage.removeItem("auth_token");
    localStorage.removeItem("userEmail");
    localStorage.removeItem("userName");
    sessionStorage.clear();
    document.cookie = "auth_token=; path=/; max-age=0";

    // 显示遮罩层
    setShowTimeoutOverlay(true);
  };

  const handleConfirmTimeout = () => {
    console.log("[ActivityMonitor] 用户确认超时，跳转到首页");
    window.location.href = "/";
  };

  // 检查是否超时
  const checkTimeout = async () => {
    // 如果正在检查或已显示遮罩层，跳过
    if (checkingRef.current || showTimeoutOverlay) {
      return;
    }

    const userId =
      typeof window !== "undefined" ? localStorage.getItem("userId") : null;
    
    // 检查有效的 cookie token（排除空值情况）
    let hasValidToken = false;
    if (typeof window !== "undefined") {
      const cookies = document.cookie.split(";");
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split("=");
        if (name === "auth_token" && value && value.length > 0) {
          hasValidToken = true;
          break;
        }
      }
    }
    
    const isLoggingOut =
      typeof window !== "undefined"
        ? sessionStorage.getItem("is_logging_out") === "true"
        : false;
    const justShowedLogout =
      typeof window !== "undefined"
        ? sessionStorage.getItem("just_showed_logout") === "true"
        : false;

    // 关键检查：用户必须已登录且不在退出登录过程中
    if (isLoggingOut || justShowedLogout) {
      return;
    }

    if (!userId || !hasValidToken) {
      return;
    }

    const now = Date.now();
    // 距离上次检查至少 5 秒才再次检查
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

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorCode = errorData.error || "SESSION_TIMEOUT";

        // 判断错误类型
        if (
          errorCode === "FORCED_LOGOUT" ||
          errorData.message?.includes("管理员强制下线")
        ) {
          // 被管理员强制下线（宽限期已过）
          handleSessionTimeout();
        } else {
          // 超时（超过 5 分钟未操作）
          handleSessionTimeout();
        }
        return;
      }

      // 用户活跃，重置活动时间
      lastActivityRef.current = now;
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

    const handleActivity = () => {
      // 用户活动时更新活动时间
      lastActivityRef.current = Date.now();
      // 立即检查是否超时
      checkTimeout();
    };

    events.forEach((event) => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // 定期检查超时（每10秒）
    const intervalId = setInterval(() => {
      const now = Date.now();
      const timeSinceActivity = now - lastActivityRef.current;

      if (timeSinceActivity >= TIMEOUT_DURATION) {
        // 检查用户是否已登录
        const userId = localStorage.getItem("userId");
        
        // 检查有效的 cookie token（排除空值情况）
        let hasValidToken = false;
        const cookies = document.cookie.split(";");
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split("=");
          if (name === "auth_token" && value && value.length > 0) {
            hasValidToken = true;
            break;
          }
        }

        if (userId && hasValidToken && !showTimeoutOverlay) {
          handleSessionTimeout();
        }
      } else {
        // 未超时，检查服务器端超时
        checkTimeout();
      }
    }, CHECK_INTERVAL);

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
        document.removeEventListener(event, handleActivity);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [showTimeoutOverlay]);

  return (
    <SessionTimeoutOverlay
      show={showTimeoutOverlay}
      onConfirm={handleConfirmTimeout}
    />
  );
}
