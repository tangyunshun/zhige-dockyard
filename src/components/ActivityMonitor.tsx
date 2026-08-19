"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const IDLE_TIMEOUT = 10 * 60 * 1000; // 统一 10 分钟空闲超时，不区分角色
const TOUCH_INTERVAL = 30 * 1000; // 每 30 秒向服务端刷新活跃时间

export default function ActivityMonitor() {
  const router = useRouter();
  const lastActivityTimeRef = useRef<number>(Date.now());
  const loggedOutRef = useRef(false);
  // 记录最近一次已上报给服务端的活跃时间戳，避免无操作时的“僵尸心跳”
  const lastReportedRef = useRef<number>(0);

  useEffect(() => {
    const updateActivity = () => {
      lastActivityTimeRef.current = Date.now();
    };

    // 监听真实用户操作
    const events = ["mousedown", "keydown", "mousemove", "scroll", "touchstart"];
    events.forEach((e) => {
      window.addEventListener(e, updateActivity, { passive: true });
    });

    // 每隔固定时长：仅在“有新交互”时刷新服务端活跃时间；
    // 若已超过空闲阈值，则登出并跳登录页
    const interval = setInterval(async () => {
      const now = Date.now();
      const idleMs = now - lastActivityTimeRef.current;

      if (idleMs >= IDLE_TIMEOUT) {
        if (!loggedOutRef.current) {
          loggedOutRef.current = true;
          try {
            await fetch("/api/auth/logout", { method: "POST" });
          } catch {}
          localStorage.clear();
          router.push("/auth/login?reason=idle");
        }
        return;
      }

      // 关键：只有在上次上报之后确实发生过新的用户交互时才上报，
      // 否则定时器本身会持续刷新 lastActivityAt，导致空闲超时永不触发。
      if (lastActivityTimeRef.current <= lastReportedRef.current) {
        return;
      }

      lastReportedRef.current = lastActivityTimeRef.current;
      try {
        await fetch("/api/auth/touch", { method: "POST" });
      } catch {}
    }, TOUCH_INTERVAL);

    return () => {
      events.forEach((e) => window.removeEventListener(e, updateActivity));
      clearInterval(interval);
    };
  }, [router]);

  return null;
}
