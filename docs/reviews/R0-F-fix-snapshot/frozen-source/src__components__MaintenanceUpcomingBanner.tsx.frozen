"use client";

import { useState, useEffect } from "react";
import { CalendarClock, ArrowRight, X, AlertTriangle } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";

interface MaintenanceSchedule {
  id: string;
  title: string;
  type: "UPGRADE" | "DATABASE" | "HARDWARE" | "INSPECT";
  status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  startTime: string;
  endTime: string;
  manager: string;
  scope: string;
  description: string;
  isDowntime?: boolean;
}

export default function MaintenanceUpcomingBanner() {
  const router = useRouter();
  const pathname = usePathname();
  const [activeSchedule, setActiveSchedule] = useState<MaintenanceSchedule | null>(null);
  const [dismissed, setDismissed] = useState(false);

  // 停机维护全屏页和发版动态页不渲染此横幅，避免重复提示
  const isExemptPath =
    pathname.startsWith("/maintenance") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/releases");

  useEffect(() => {
    if (isExemptPath) return;

    const checkUpcomingSchedule = async () => {
      try {
        const res = await fetch(`/api/system/maintenance?t=${Date.now()}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          const list: MaintenanceSchedule[] = data.schedules || [];
          
          // 优先寻找正在进行中，其次寻找已排期的任务
          const inProgress = list.find((s) => s.status === "IN_PROGRESS");
          const scheduled = list.find((s) => s.status === "SCHEDULED");
          const target = inProgress || scheduled;

          if (target) {
            // 检查用户是否在本次会话中已手动关闭该任务的通知
            const isDismissed = sessionStorage.getItem(`dismissed_maint_${target.id}`) === "true";
            if (!isDismissed) {
              setActiveSchedule(target);
            }
          } else {
            setActiveSchedule(null);
          }
        }
      } catch {
        // 网络异常保持静默
      }
    };

    checkUpcomingSchedule();
    // 每 60 秒定期刷新一次计划任务动态
    const interval = setInterval(checkUpcomingSchedule, 60000);
    return () => clearInterval(interval);
  }, [pathname, isExemptPath]);

  const handleDismiss = () => {
    if (activeSchedule) {
      sessionStorage.setItem(`dismissed_maint_${activeSchedule.id}`, "true");
    }
    setDismissed(true);
  };

  const handleViewDetail = () => {
    router.push("/releases?tab=schedules");
  };

  if (isExemptPath || !activeSchedule || dismissed) {
    return null;
  }

  const formatTime = (iso: string) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const isOngoing = activeSchedule.status === "IN_PROGRESS";
  const isDowntime =
    activeSchedule.isDowntime !== undefined
      ? activeSchedule.isDowntime
      : activeSchedule.type === "UPGRADE" || activeSchedule.type === "DATABASE";

  return (
    <aside
      aria-label="系统维护预告通知"
      className={`w-full z-40 relative border-b transition-all ${
        isOngoing
          ? isDowntime
            ? "bg-red-500/10 border-red-300 text-red-900"
            : "bg-amber-500/10 border-amber-300 text-amber-900"
          : isDowntime
          ? "bg-orange-50/90 border-orange-200 text-orange-900"
          : "bg-blue-50/90 border-blue-200/90 text-blue-900"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className={`w-5 h-5 rounded flex items-center justify-center shrink-0 ${
              isOngoing
                ? isDowntime
                  ? "bg-red-600 text-white"
                  : "bg-amber-500 text-white"
                : isDowntime
                ? "bg-orange-500 text-white"
                : "bg-[#3182ce] text-white"
            }`}
          >
            {isOngoing ? (
              <AlertTriangle className="w-3 h-3 animate-pulse" />
            ) : (
              <CalendarClock className="w-3 h-3" />
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span
              className={`font-black shrink-0 px-1.5 py-0.2 rounded text-[10px] ${
                isOngoing
                  ? isDowntime
                    ? "bg-red-200 text-red-900"
                    : "bg-amber-200 text-amber-900"
                  : isDowntime
                  ? "bg-orange-200 text-orange-900"
                  : "bg-blue-200/80 text-blue-900"
              }`}
            >
              {isOngoing
                ? isDowntime
                  ? "全站停机维护中"
                  : "在线维护进行中"
                : isDowntime
                ? "停机维护预告"
                : "在线升级预告"}
            </span>

            <span className="font-bold shrink-0">{activeSchedule.title}</span>

            <span className="text-slate-600 font-medium truncate">
              时间：{formatTime(activeSchedule.startTime)} ~ {formatTime(activeSchedule.endTime)}
              {activeSchedule.scope ? ` · 影响：${activeSchedule.scope}` : ""}
              {isDowntime && !isOngoing ? "（届时服务将短暂暂停，请提前保存资产）" : ""}
              {!isDowntime ? "（不停服，业务正常使用）" : ""}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleViewDetail}
            className={`font-bold hover:underline inline-flex items-center gap-1 cursor-pointer transition-colors ${
              isOngoing ? "text-amber-800 hover:text-amber-900" : "text-[#2b6cb0] hover:text-blue-900"
            }`}
          >
            <span>排期详情</span>
            <ArrowRight className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="w-5 h-5 rounded hover:bg-black/5 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            title="关闭本次预告提示"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
