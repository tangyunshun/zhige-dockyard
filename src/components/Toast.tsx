"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type ToastType = "success" | "error" | "warning" | "info" | "sms-code";

interface ToastLink {
  text: string;
  href: string;
}

interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
  /** 可选的可点击入口（如「算力不足」提示里的「去充值」链接） */
  link?: ToastLink;
}

interface ToastContextType {
  showToast: (type: ToastType, message: string, duration?: number, link?: ToastLink) => void;
  success: (message: string, duration?: number, link?: ToastLink) => void;
  error: (message: string, duration?: number, link?: ToastLink) => void;
  warning: (message: string, duration?: number, link?: ToastLink) => void;
  info: (message: string, duration?: number, link?: ToastLink) => void;
  dismissAll: () => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(
  undefined,
);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const pathname = usePathname();
  const prevPathnameRef = useRef(pathname);

  // 核心体验保障：路由发生跳转时，自动清理上一页面遗留的 Toast，彻底根除跨页面残留遮挡
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      setToasts([]);
    }
  }, [pathname]);

  /**
   * 根据提示语类型和长度智能计算显示时间
   * 原则：
   * 1. 成功/普通信息类：轻量感知，快速退场（1600ms ~ 2000ms，最高不超过 2000ms）
   * 2. 警告/错误类：保留足够时间排查，但绝不无限悬挂（2000ms ~ 2600ms，最高不超过 2800ms）
   * 3. 验证码类：保留适中时间供抄写（4000ms）
   */
  const calculateDuration = (message: string, type: ToastType = "info"): number => {
    if (type === "sms-code") {
      return 4000;
    }
    const isWarnOrError = type === "error" || type === "warning";
    const baseDuration = isWarnOrError ? 2000 : 1600;
    const charCount = message.length;
    // 字符数微调：每字符 +25ms，增量上限 400ms
    const duration = baseDuration + Math.min(charCount * 25, 400);
    return isWarnOrError ? Math.min(duration, 2800) : Math.min(duration, 2000);
  };

  const addToast = (
    type: ToastType,
    message: string,
    duration?: number,
    link?: ToastLink,
  ) => {
    const id = Math.random().toString(36).substr(2, 9);
    
    // 如果没有指定 duration，根据类型与长度智能计算紧凑时长
    const calculatedDuration = duration !== undefined ? duration : calculateDuration(message, type);
    
    const toast: ToastMessage = { id, type, message, duration: calculatedDuration, link };

    setToasts((prev) => {
      // 检查是否有相同消息的 toast 正在显示（防重复）
      const hasDuplicate = prev.some(
        (t) => t.message === message && t.type === type
      );
      if (hasDuplicate) {
        return prev;
      }
      return [...prev, toast];
    });

    if (calculatedDuration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, calculatedDuration);
    }
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const showToast = (type: ToastType, message: string, duration?: number, link?: ToastLink) => {
    addToast(type, message, duration, link);
  };

  const success = (message: string, duration?: number, link?: ToastLink) =>
    showToast("success", message, duration, link);
  const error = (message: string, duration?: number, link?: ToastLink) =>
    showToast("error", message, duration, link);
  const warning = (message: string, duration?: number, link?: ToastLink) =>
    showToast("warning", message, duration, link);
  const info = (message: string, duration?: number, link?: ToastLink) =>
    showToast("info", message, duration, link);

  const dismissAll = () => setToasts([]);

  // 稳定 context value：否则每次 ToastProvider 渲染都生成新对象，会导致消费组件里
  // 以 toast 为依赖的 useCallback/useEffect 反复重建与重跑（曾引发请求死循环）。
  const contextValue = useMemo(
    () => ({ showToast, success, error, warning, info, dismissAll }),
    // showToast/success/... 均为组件内普通函数，仅在挂载时稳定即可（dismissAll 同）；
    // 这些函数不依赖会频繁变化的状态，故用空依赖保持引用恒定。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* 所有 Toast - 位于全局 Header（60px）正下方，居中呈现，彻底避开对顶部导航菜单项的遮挡 */}
      <div
        id="zg-toast-container"
        className="fixed top-16 md:top-20 left-1/2 -translate-x-1/2 z-[99999] flex flex-col gap-2.5 pointer-events-none transition-all duration-200"
      >
        {toasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onClose,
}: {
  toast: ToastMessage;
  onClose: () => void;
}) {
  const icons = {
    success: (
      <svg
        className="w-5 h-5 text-emerald-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
    ),
    error: (
      <svg
        className="w-5 h-5 text-red-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    ),
    warning: (
      <svg
        className="w-5 h-5 text-amber-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    ),
    info: (
      <svg
        className="w-5 h-5 text-blue-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
    "sms-code": (
      <svg
        className="w-6 h-6 text-[#3182ce]"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
        />
      </svg>
    ),
  };

  const bgColors = {
    success: "bg-emerald-50",
    error: "bg-red-50",
    warning: "bg-amber-50",
    info: "bg-blue-50",
    "sms-code": "bg-blue-50",
  };

  const borderColors = {
    success: "border-emerald-200",
    error: "border-red-200",
    warning: "border-amber-200",
    info: "border-blue-200",
    "sms-code": "border-blue-200",
  };

  // 验证码 Toast 特殊渲染（严格遵循设计规范）
  if (toast.type === "sms-code") {
    // 从消息中提取验证码数字
    const codeMatch = toast.message.match(/(\d{6})/);
    const code = codeMatch ? codeMatch[1] : null;

    return (
      <div
        className="zg-toast show flex items-center gap-2 px-3 py-2 rounded-full border border-[#e2e8f0]/90 bg-white/95 backdrop-blur-md shadow-[0_8px_24px_-6px_rgba(15,23,42,0.1),0_2px_6px_-2px_rgba(15,23,42,0.04)] pointer-events-auto"
        style={{ width: "fit-content", maxWidth: "480px" }}
      >
        {/* 成功图标 */}
        <div className="flex-shrink-0 flex items-center justify-center">
          <svg
            className="w-5 h-5 text-emerald-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        {/* 内容 */}
        <div className="flex items-center gap-1">
          <span className="text-[14px] font-bold text-slate-800">
            验证码已发送
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-[14px] font-medium text-slate-600">
            请输入验证码：
          </span>
          {code ? (
            <span className="text-lg font-black text-[#3182ce]">{code}</span>
          ) : (
            <span className="text-[14px] font-medium text-slate-700">
              {toast.message}
            </span>
          )}
        </div>

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="flex-shrink-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors p-1.5 rounded-full focus:outline-none"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2.5}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    );
  }

  // 普通 Toast 渲染（严格遵循设计规范）
  return (
    <div
      className="zg-toast show flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border border-[#e2e8f0]/90 bg-white/95 backdrop-blur-md shadow-[0_8px_24px_-6px_rgba(15,23,42,0.1),0_2px_6px_-2px_rgba(15,23,42,0.04)] pointer-events-auto"
      style={{ width: "fit-content", maxWidth: "620px" }}
    >
      <div className="flex-shrink-0 flex items-center justify-center">
        {icons[toast.type]}
      </div>
      <div className="flex-1 text-xs md:text-[13px] font-bold text-slate-800 tracking-tight leading-relaxed break-words">
        {toast.message}
        {toast.link && (
          <Link
            href={toast.link.href}
            onClick={onClose}
            className="ml-2 inline-flex items-center gap-0.5 text-[#3182ce] hover:underline font-black"
          >
            {toast.link.text}
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>
      <button
        onClick={onClose}
        className="flex-shrink-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors p-1.5 rounded-full focus:outline-none"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
