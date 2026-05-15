"use client";

import { useEffect, useCallback } from "react";

interface BroadcastMessage {
  type: "LOGOUT" | "LOGIN" | "SESSION_EXPIRED" | "REFRESH_TOKEN";
  payload?: Record<string, unknown>;
}

/**
 * 多标签页会话同步Hook
 * 使用BroadcastChannel实现标签页间的实时通信
 */
export function useSessionBroadcast() {
  const channel = typeof window !== "undefined" 
    ? new BroadcastChannel("zhige-session-channel") 
    : null;

  // 发送消息到所有标签页
  const broadcast = useCallback((message: BroadcastMessage) => {
    if (channel) {
      channel.postMessage(message);
    }
  }, [channel]);

  // 监听其他标签页的消息
  useEffect(() => {
    if (!channel) return;

    const handleMessage = (event: MessageEvent<BroadcastMessage>) => {
      const { type, payload } = event.data;
      
      switch (type) {
        case "LOGOUT":
          console.log("[SessionBroadcast] 收到其他标签页的退出登录消息");
          // 清除本地存储
          localStorage.removeItem("userId");
          localStorage.removeItem("userRole");
          localStorage.removeItem("auth_token");
          localStorage.removeItem("userEmail");
          localStorage.removeItem("userName");
          sessionStorage.clear();
          document.cookie = "auth_token=; path=/; max-age=0";
          document.cookie = "session_token=; path=/; max-age=0";
          document.cookie = "refresh_token=; path=/; max-age=0";
          // 跳转到登录页
          window.location.href = "/auth/login?reason=BROADCAST_LOGOUT";
          break;

        case "LOGIN":
          console.log("[SessionBroadcast] 收到其他标签页的登录消息", payload);
          // 更新本地存储
          if (payload?.userId) {
            localStorage.setItem("userId", payload.userId as string);
          }
          if (payload?.userRole) {
            localStorage.setItem("userRole", payload.userRole as string);
          }
          break;

        case "SESSION_EXPIRED":
          console.log("[SessionBroadcast] 收到其他标签页的会话过期消息");
          // 同样处理会话过期
          localStorage.removeItem("userId");
          localStorage.removeItem("userRole");
          localStorage.removeItem("auth_token");
          localStorage.removeItem("userEmail");
          localStorage.removeItem("userName");
          sessionStorage.clear();
          document.cookie = "auth_token=; path=/; max-age=0";
          document.cookie = "session_token=; path=/; max-age=0";
          document.cookie = "refresh_token=; path=/; max-age=0";
          window.location.href = "/auth/login?reason=SESSION_EXPIRED";
          break;

        case "REFRESH_TOKEN":
          console.log("[SessionBroadcast] 收到其他标签页的token刷新消息");
          // 更新token
          if (payload?.token) {
            localStorage.setItem("auth_token", payload.token as string);
          }
          break;

        default:
          break;
      }
    };

    channel.addEventListener("message", handleMessage);

    return () => {
      channel.removeEventListener("message", handleMessage);
    };
  }, [channel]);

  // 页面关闭时通知其他标签页
  useEffect(() => {
    const handleBeforeUnload = () => {
      // 发送一个心跳停止消息，让其他标签页知道这个标签页关闭了
      broadcast({ type: "SESSION_EXPIRED" });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [broadcast]);

  // 清理channel
  useEffect(() => {
    return () => {
      if (channel) {
        channel.close();
      }
    };
  }, [channel]);

  return {
    broadcast,
    broadcastLogout: useCallback(() => broadcast({ type: "LOGOUT" }), [broadcast]),
    broadcastLogin: useCallback((payload?: Record<string, unknown>) => 
      broadcast({ type: "LOGIN", payload }), [broadcast]),
    broadcastSessionExpired: useCallback(() => 
      broadcast({ type: "SESSION_EXPIRED" }), [broadcast]),
    broadcastRefreshToken: useCallback((token: string) => 
      broadcast({ type: "REFRESH_TOKEN", payload: { token } }), [broadcast]),
  };
}

export default useSessionBroadcast;