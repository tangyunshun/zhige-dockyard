"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";

interface MaintenanceState {
  inMaintenance: boolean;
  message?: string;
}

const PUBLIC_PATHS = [
  "/",
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/init",
  "/admin",
  "/terms-of-service",
  "/privacy-policy",
];

export default function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [maintenanceState, setMaintenanceState] = useState<MaintenanceState>({ inMaintenance: false });
  const [isChecking, setIsChecking] = useState(true);

  const checkMaintenance = useCallback(async () => {
    try {
      const res = await fetch("/api/system/check-maintenance", {
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = await res.json();
        setMaintenanceState({
          inMaintenance: data.inMaintenance,
          message: data.message,
        });
      }
    } catch (error) {
      console.error("[维护模式检测] 检查失败:", error);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    const isPublicPath = PUBLIC_PATHS.some((path) => {
      if (path === "/") {
        return pathname === "/";
      }
      return pathname.startsWith(path);
    });

    if (isPublicPath) {
      setIsChecking(false);
      return;
    }

    checkMaintenance();

    const interval = setInterval(checkMaintenance, 60000);

    return () => clearInterval(interval);
  }, [pathname, checkMaintenance]);

  if (isChecking) {
    return null;
  }

  if (maintenanceState.inMaintenance) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f5f5f5",
          padding: "20px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "12px",
            padding: "48px",
            maxWidth: "500px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
          }}
        >
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              backgroundColor: "#fff3cd",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 24px",
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#856404"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </div>

          <h1
            style={{
              fontSize: "24px",
              fontWeight: "600",
              color: "#333",
              marginBottom: "16px",
            }}
          >
            系统维护中
          </h1>

          <p
            style={{
              fontSize: "16px",
              color: "#666",
              lineHeight: "1.6",
              marginBottom: "24px",
            }}
          >
            {maintenanceState.message || "系统正在维护中，请稍后再试"}
          </p>

          <p
            style={{
              fontSize: "14px",
              color: "#999",
            }}
          >
            请耐心等待，维护完成后即可恢复正常使用
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
