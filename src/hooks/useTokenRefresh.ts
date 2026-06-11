﻿"use client";

import { useEffect, useCallback, useRef } from "react";

interface TokenRefreshState {
  isRefreshing: boolean;
  lastRefreshTime: number | null;
  retryCount: number;
}

const REFRESH_INTERVAL = 50 * 60 * 1000; // 50分钟
const MAX_RETRY = 3;
const RETRY_DELAY = 5000;

/**
 * Token无感刷新Hook
 *
 * 场景32：Token无感刷新
 *
 * 功能：
 * - 每50分钟自动刷新token
 * - 失败时自动重试（最多3次）
 * - 多标签页同步（通过BroadcastChannel）
 */
export function useTokenRefresh() {
  const stateRef = useRef<TokenRefreshState>({
    isRefreshing: false,
    lastRefreshTime: null,
    retryCount: 0,
  });

  const refreshToken = useCallback(async () => {
    const { isRefreshing, retryCount } = stateRef.current;

    if (isRefreshing) {
      console.log("[TokenRefresh] 正在刷新中，跳过本次请求");
      return false;
    }

    const hasUserId =
      typeof window !== "undefined" && localStorage.getItem("userId");
    
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

    if (!hasUserId || !hasValidToken) {
      console.log("[TokenRefresh] 用户未登录，跳过刷新");
      return false;
    }

    stateRef.current.isRefreshing = true;
    console.log("[TokenRefresh] 开始刷新token");

    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          // 更新本地存储的token
          localStorage.setItem("auth_token", data.token);
          stateRef.current.lastRefreshTime = Date.now();
          stateRef.current.retryCount = 0;
          console.log("[TokenRefresh] token刷新成功");

          // 广播到其他标签页（如果支持）
          try {
            const channel = new BroadcastChannel("zhige-session-channel");
            channel.postMessage({
              type: "REFRESH_TOKEN",
              payload: { token: data.token },
            });
            channel.close();
          } catch (e) {
            console.log("[TokenRefresh] 无需同步其他标签页");
          }

          return true;
        }
      } else if (res.status === 401) {
        console.log("[TokenRefresh] token无效，需要重新登录");
        // 清除本地存储，让AuthCheck处理跳转
        localStorage.removeItem("userId");
        localStorage.removeItem("userRole");
        localStorage.removeItem("auth_token");
        localStorage.removeItem("userEmail");
        localStorage.removeItem("userName");
        sessionStorage.clear();
        document.cookie = "auth_token=; path=/; max-age=0";
        document.cookie = "session_token=; path=/; max-age=0";
        document.cookie = "refresh_token=; path=/; max-age=0";
        return false;
      } else {
        throw new Error(`Refresh failed with status ${res.status}`);
      }
    } catch (error) {
      console.error("[TokenRefresh] 刷新token失败:", error);
      
      // 失败重试逻辑
      if (retryCount < MAX_RETRY) {
        stateRef.current.retryCount++;
        console.log(
          `[TokenRefresh] 将在 ${RETRY_DELAY / 1000}秒后重试 (${retryCount + 1}/${MAX_RETRY})`
        );
        setTimeout(() => {
          refreshToken();
        }, RETRY_DELAY);
      } else {
        console.log(
          "[TokenRefresh] 重试次数达到上限，停止刷新"
        );
      }
    } finally {
      stateRef.current.isRefreshing = false;
    }

    return false;
  }, []);

  useEffect(() => {
    // 立即尝试刷新一次，更新lastRefreshTime
    const initialize = () => {
      stateRef.current.lastRefreshTime = Date.now();
    };
    initialize();

    // 设置定时器，每50分钟刷新一次
    const interval = setInterval(() => {
      const { lastRefreshTime, isRefreshing } = stateRef.current;
      const now = Date.now();
      
      if (!isRefreshing && lastRefreshTime && now - lastRefreshTime >= REFRESH_INTERVAL) {
        console.log("[TokenRefresh] 定时触发token刷新");
        refreshToken();
      }
    }, 60000); // 每分钟检查一次是否需要刷新

    return () => {
      clearInterval(interval);
    };
  }, [refreshToken]);

  // 暴露手动刷新方法
  return {
    refreshToken,
  };
}

export default useTokenRefresh;
