"use client";

import { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Bell, Rocket, AlertTriangle, Gift, Check, ClipboardList, ShieldAlert } from "lucide-react";

interface NotificationItem {
  id: string;
  title: string;
  content: string;
  isRead: boolean;
  type: string;
  createdAt: number;
  link?: string | null;
}

const TYPE_META: Record<
  string,
  {
    icon: React.ElementType;
    label: string;
    colorClass: string;
    lightBgClass: string;
    borderClass: string;
    iconBgClass: string;
    confirmClass: string;
  }
> = {
  system: {
    icon: Bell,
    label: "系统通知",
    colorClass: "text-blue-600",
    lightBgClass: "bg-blue-50",
    borderClass: "border-blue-200",
    iconBgClass: "bg-blue-100",
    confirmClass: "bg-blue-600 hover:bg-blue-700",
  },
  update: {
    icon: Rocket,
    label: "功能更新",
    colorClass: "text-violet-600",
    lightBgClass: "bg-violet-50",
    borderClass: "border-violet-200",
    iconBgClass: "bg-violet-100",
    confirmClass: "bg-violet-600 hover:bg-violet-700",
  },
  alert: {
    icon: AlertTriangle,
    label: "安全告警",
    colorClass: "text-red-600",
    lightBgClass: "bg-red-50",
    borderClass: "border-red-200",
    iconBgClass: "bg-red-100",
    confirmClass: "bg-red-600 hover:bg-red-700",
  },
  activity: {
    icon: Gift,
    label: "平台活动",
    colorClass: "text-orange-600",
    lightBgClass: "bg-orange-50",
    borderClass: "border-orange-200",
    iconBgClass: "bg-orange-100",
    confirmClass: "bg-orange-600 hover:bg-orange-700",
  },
  task: {
    icon: ClipboardList,
    label: "任务通知",
    colorClass: "text-indigo-600",
    lightBgClass: "bg-indigo-50",
    borderClass: "border-indigo-200",
    iconBgClass: "bg-indigo-100",
    confirmClass: "bg-indigo-600 hover:bg-indigo-700",
  },
  security: {
    icon: ShieldAlert,
    label: "安全通知",
    colorClass: "text-rose-600",
    lightBgClass: "bg-rose-50",
    borderClass: "border-rose-200",
    iconBgClass: "bg-rose-100",
    confirmClass: "bg-rose-600 hover:bg-rose-700",
  },
};

function formatTime(ts: number) {
  try {
    return new Date(ts).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// 确认登录强提醒弹窗：将通知归入消息列表（保留未读，仅退出"待弹窗"状态）
async function acknowledgePopup(id: string) {
  const authToken =
    typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
  const res = await fetch("/api/user/notifications/acknowledge-popup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify({ id }),
  });
  return res.ok;
}

export default function LoginNotificationPopup() {
  const [queue, setQueue] = useState<NotificationItem[]>([]);
  const [exiting, setExiting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window === "undefined") return;

    const raw = sessionStorage.getItem("pendingLoginNotifications");
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw) as NotificationItem[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setQueue(parsed);
      }
    } catch {
      // ignore parse error
    } finally {
      // 消费后立即清理 sessionStorage，防止刷新页面重复弹窗
      sessionStorage.removeItem("pendingLoginNotifications");
    }
  }, []);

  const current = useMemo(() => queue[0] || null, [queue]);

  useEffect(() => {
    if (queue.length === 0) {
      setExiting(false);
    }
  }, [queue]);

  const handleConfirm = () => {
    if (!current || exiting) return;
    setExiting(true);

    // 动效隐藏后再归入消息列表并切换下一条（与 CSS duration-300 对齐，避免提前卸载）
    window.setTimeout(async () => {
      await acknowledgePopup(current.id);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("zhige_notifications_updated"));
      }
      setQueue((prev) => prev.slice(1));
      setExiting(false);
    }, 300);
  };

  if (!mounted || !current) return null;

  const meta = TYPE_META[current.type] || TYPE_META.system;
  const Icon = meta.icon;
  const hasMore = queue.length > 1;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div
        className={`w-full max-w-md rounded-2xl border-2 shadow-2xl bg-white p-0 overflow-hidden transition-all duration-300 ease-out ${
          exiting ? "opacity-0 scale-95" : "opacity-100 scale-100"
        } ${meta.borderClass}`}
      >
        {/* 顶部类型条 */}
        <div className={`px-6 py-4 ${meta.lightBgClass} border-b ${meta.borderClass}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${meta.iconBgClass}`}>
              <Icon className={`w-5 h-5 ${meta.colorClass}`} />
            </div>
            <div className="flex-1">
              <span className={`text-xs font-black px-2 py-0.5 rounded-full border ${meta.lightBgClass} ${meta.colorClass} ${meta.borderClass}`}>
                {meta.label}
              </span>
              <p className="text-[10px] text-slate-500 mt-1 font-medium">
                {formatTime(current.createdAt)}
              </p>
            </div>
            {hasMore && (
              <span className="text-[10px] font-bold text-slate-500 bg-white/70 px-2 py-1 rounded-full border border-slate-200">
                还有 {queue.length - 1} 条
              </span>
            )}
          </div>
        </div>

        {/* 内容区 */}
        <div className="px-6 py-5 space-y-3 text-left">
          <h3 className="text-base font-black text-slate-900 leading-snug">
            {current.title}
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
            {current.content}
          </p>
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={exiting}
            className={`inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-black text-white shadow-md transition-all active:scale-95 disabled:opacity-60 ${meta.confirmClass}`}
          >
            <Check className="w-4 h-4" />
            确认
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
