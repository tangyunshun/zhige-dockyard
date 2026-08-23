﻿"use client";

import { useEffect, useCallback, useRef } from "react";

interface TokenRefreshState {
  isRefreshing: boolean;
  lastRefreshTime: number | null;
  retryCount: number;
  /** 下次 AT 过期时间，用于提前静默刷新（A-06） */
  accessTokenExpireAt: number | null;
}

// A-06：AT 有效期 5 分钟（来自后端 /refresh 的 expiresIn），提前 60 秒静默续期
const AT_TTL_SECONDS = 5 * 60;
const REFRESH_AHEAD_MS = 60 * 1000;
const MAX_RETRY = 3;
const RETRY_DELAY = 5000;

function hasValidLocalSession(): boolean {
  if (typeof window === "undefined") return false;
  const hasLocalToken = !!localStorage.getItem("auth_token");
  const cookies = document.cookie.split(";");
  const hasToken = cookies.some((c) => {
    const [name, value] = c.trim().split("=");
    return name === "auth_token" && value && value.length > 0;
  });
  return hasLocalToken && hasToken;
}

function clearLocalSession() {
  localStorage.removeItem("userId");
  localStorage.removeItem("userRole");
  localStorage.removeItem("auth_token");
  localStorage.removeItem("userEmail");
  localStorage.removeItem("userName");
  sessionStorage.clear();
  document.cookie = "auth_token=; path=/; max-age=0";
  document.cookie = "session_token=; path=/; max-age=0";
  document.cookie = "refresh_token=; path=/; max-age=0";
}

/**
 * Token 无感刷新 Hook（A-06）
 * - 基于后端返回的 expiresIn 提前 60s 静默续期，用户无感知
 * - 失败时自动重试（最多 3 次）
 * - 多标签页通过 BroadcastChannel 同步新 token
 */
export function useTokenRefresh() {
  const stateRef = useRef<TokenRefreshState>({
    isRefreshing: false,
    lastRefreshTime: null,
    retryCount: 0,
    accessTokenExpireAt: null,
  });

  const refreshToken = useCallback(async (): Promise<boolean> => {
    const { isRefreshing, retryCount } = stateRef.current;

    if (isRefreshing) {
      return false;
    }
    if (!hasValidLocalSession()) {
      return false;
    }

    stateRef.current.isRefreshing = true;

    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.token) {
          localStorage.setItem("auth_token", data.token);
          const expSeconds = data.expiresIn ?? AT_TTL_SECONDS;
          stateRef.current.accessTokenExpireAt = Date.now() + expSeconds * 1000;
          stateRef.current.lastRefreshTime = Date.now();
          stateRef.current.retryCount = 0;

          // 广播到其他标签页
          try {
            const channel = new BroadcastChannel("zhige-session-channel");
            channel.postMessage({ type: "REFRESH_TOKEN", payload: { token: data.token } });
            channel.close();
          } catch {
            /* 不支持 BroadcastChannel 时忽略 */
          }
          return true;
        }
      } else if (res.status === 401) {
        // RT 失效：清除本地，交由 AuthCheck 跳转登录（A-06 失败分支）
        clearLocalSession();
        return false;
      } else {
        throw new Error(`Refresh failed with status ${res.status}`);
      }
    } catch (error) {
      console.error("[TokenRefresh] 刷新失败:", error);
      if (retryCount < MAX_RETRY) {
        stateRef.current.retryCount++;
        setTimeout(() => {
          refreshToken();
        }, RETRY_DELAY);
      }
    } finally {
      stateRef.current.isRefreshing = false;
    }

    return false;
  }, []);

  // 监听其他标签页刷新结果，同步本地 token
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel("zhige-session-channel");
      channel.onmessage = (e) => {
        if (e.data?.type === "REFRESH_TOKEN" && e.data?.payload?.token) {
          localStorage.setItem("auth_token", e.data.payload.token);
          const exp = (e.data?.payload?.expiresIn ?? AT_TTL_SECONDS) * 1000;
          stateRef.current.accessTokenExpireAt = Date.now() + exp;
        }
      };
    } catch {
      /* 不支持时忽略 */
    }

    // A-06：每 30s 检查一次，AT 即将过期（<60s）则静默续期
    const interval = setInterval(() => {
      const { accessTokenExpireAt, isRefreshing } = stateRef.current;
      if (isRefreshing) return;
      if (!hasValidLocalSession()) return;
      const now = Date.now();
      if (!accessTokenExpireAt || now >= accessTokenExpireAt - REFRESH_AHEAD_MS) {
        refreshToken();
      }
    }, 30 * 1000);

    return () => {
      clearInterval(interval);
      channel?.close();
    };
  }, [refreshToken]);

  return { refreshToken };
}

export default useTokenRefresh;

