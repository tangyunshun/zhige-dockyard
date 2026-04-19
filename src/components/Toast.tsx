"use client";

import React, { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "warning" | "info" | "sms-code";

interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (type: ToastType, message: string, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(
  undefined,
);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (
    type: ToastType,
    message: string,
    duration: number = 3000,
  ) => {
    const id = Math.random().toString(36).substr(2, 9);
    const toast: ToastMessage = { id, type, message, duration };

    setToasts((prev) => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const showToast = (type: ToastType, message: string, duration?: number) => {
    addToast(type, message, duration);
  };

  const success = (message: string, duration?: number) =>
    showToast("success", message, duration);
  const error = (message: string, duration?: number) =>
    showToast("error", message, duration);
  const warning = (message: string, duration?: number) =>
    showToast("warning", message, duration);
  const info = (message: string, duration?: number) =>
    showToast("info", message, duration);

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      {/* 所有 Toast - 中间顶部（严格遵循设计系统规范） */}
      <div
        id="zg-toast-container"
        className="fixed top-8 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-3 pointer-events-none"
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
        className="w-5 h-5 text-green-500"
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
        className="w-5 h-5 text-orange-500"
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
    success: "bg-green-50",
    error: "bg-red-50",
    warning: "bg-orange-50",
    info: "bg-blue-50",
    "sms-code": "bg-blue-50",
  };

  const borderColors = {
    success: "border-green-200",
    error: "border-red-200",
    warning: "border-orange-200",
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
            className="w-5 h-5 text-green-500"
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
      className="zg-toast show flex items-center gap-2 px-3 py-2 rounded-full border border-[#e2e8f0]/90 bg-white/95 backdrop-blur-md shadow-[0_8px_24px_-6px_rgba(15,23,42,0.1),0_2px_6px_-2px_rgba(15,23,42,0.04)] pointer-events-auto"
      style={{ width: "fit-content", maxWidth: "480px" }}
    >
      <div className="flex-shrink-0 flex items-center justify-center">
        {icons[toast.type]}
      </div>
      <div className="flex-1 text-[14px] font-bold text-slate-800 tracking-wide leading-snug">
        {toast.message}
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
