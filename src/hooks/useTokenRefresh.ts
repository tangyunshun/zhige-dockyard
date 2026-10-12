﻿"use client";

import { useEffect, useCallback, useRef } from "react";

interface TokenRefreshState {
  isRefreshing: boolean;
  lastRefreshTime: number | null;
  retryCount: number;
  /** 下次 AT 过期时间，用于提前静默刷新（A-06） */
  accessTokenExpireAt: number | null;
  /** 最近一次据以计算过期时间的本地 token，用于检测 token 变化（新登录/其他标签页刷新） */
  lastToken: string | null;
}

// A-06：AT 有效期 5 分钟（来自后端 /refresh 的 expiresIn），提前 60 秒静默续期
const AT_TTL_SECONDS = 5 * 60;
const REFRESH_AHEAD_MS = 60 * 1000;
const MAX_RETRY = 3;
const RETRY_DELAY = 5000;

/**
 * 解析 JWT 的过期时间（exp，秒）→ 毫秒时间戳；解析失败返回 null。
 * 用于按 accessToken 的真实过期时间调度「提前静默刷新」。
 */
function parseJwtExp(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

function hasValidLocalSession(): boolean {
  if (typeof window === "undefined") return false;
  // 仅判断本地 accessToken 是否存在。刷新凭据是 httpOnly 的 refresh_token Cookie（由服务端读取），
  // 不再用 document.cookie 探测 HttpOnly 的 auth_token——那样恒读不到，会导致本 Hook 永久失效。
  return !!localStorage.getItem("auth_token");
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
    lastToken: null,
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
          stateRef.current.lastToken = data.token;
          // 优先按新 JWT 的真实 exp 调度下次刷新；解析失败再退回 expiresIn 兜底
          stateRef.current.accessTokenExpireAt =
            parseJwtExp(data.token) ?? Date.now() + (data.expiresIn ?? AT_TTL_SECONDS) * 1000;
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
          const t = e.data.payload.token as string;
          localStorage.setItem("auth_token", t);
          stateRef.current.lastToken = t;
          stateRef.current.accessTokenExpireAt =
            parseJwtExp(t) ?? Date.now() + (e.data?.payload?.expiresIn ?? AT_TTL_SECONDS) * 1000;
        }
      };
    } catch {
      /* 不支持时忽略 */
    }

    // A-06：每 30s 检查一次，AT 即将过期（<60s）则静默续期
    const interval = setInterval(() => {
      if (stateRef.current.isRefreshing) return;
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      if (!token) {
        // 无本地 token：未登录或已登出，清理调度状态即可（跳转交由 AuthCheck 处理）
        stateRef.current.accessTokenExpireAt = null;
        stateRef.current.lastToken = null;
        return;
      }
      // token 发生变化（新登录 / 其他标签页刷新广播）时，按新 token 的真实 exp 重新调度
      if (token !== stateRef.current.lastToken) {
        stateRef.current.lastToken = token;
        stateRef.current.accessTokenExpireAt = parseJwtExp(token);
      }
      const now = Date.now();
      // 解析不到 exp 时按默认 AT_TTL 保守兜底，确保仍会定时续期
      const expireAt = stateRef.current.accessTokenExpireAt ?? now + AT_TTL_SECONDS * 1000;
      if (now >= expireAt - REFRESH_AHEAD_MS) {
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

