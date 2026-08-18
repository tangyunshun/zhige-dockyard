"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";

export function ActivityMonitor() {
  const router = useRouter();
  const toast = useToast();
  const lastActivityTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    // 监听各类活动事件
    const handleActivity = () => {
      lastActivityTimeRef.current = Date.now();
    };

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    // 每 30 秒检查一次是否已超时 30 分钟
    const interval = setInterval(async () => {
      const now = Date.now();
      const elapsed = now - lastActivityTimeRef.current;

      if (elapsed > 30 * 60 * 1000) {
        try {
          const res = await fetch("/api/auth/touch", { method: "POST" });
          if (res.status === 401) {
            toast.error("您已长时间未操作，即将退出登录");
            setTimeout(() => {
              // 清理客户端登录痕迹
              localStorage.removeItem("userId");
              localStorage.removeItem("auth_token");
              router.push("/auth/login?reason=SESSION_TIMEOUT");
            }, 1500);
          }
        } catch (e) {
          console.error("ActivityMonitor verification failed, enforcing timeout:", e);
          localStorage.removeItem("userId");
          localStorage.removeItem("auth_token");
          router.push("/auth/login?reason=SESSION_TIMEOUT");
        }
      }
    }, 30000);

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      clearInterval(interval);
    };
  }, [router, toast]);

  return null;
}
