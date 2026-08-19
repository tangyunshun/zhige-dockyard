"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LogOut } from "lucide-react";

interface LogoutConfirmDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** 正在执行退出（防重复点击：确认按钮进入 loading 并禁用） */
  confirming?: boolean;
}

/**
 * 退出登录二次确认弹窗
 * - 移动端：底部弹出（全宽卡片，适配安全区）
 * - 桌面端：居中弹窗
 * - 支持 ESC / 点击遮罩关闭，确认中禁用关闭与重复点击
 */
export default function LogoutConfirmDialog({
  isOpen,
  onCancel,
  onConfirm,
  confirming = false,
}: LogoutConfirmDialogProps) {
  const [isVisible, setIsVisible] = useState(false);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // 打开/关闭动画 + 背景滚动锁定
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      document.body.style.overflow = "hidden";
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = "unset";
      return () => clearTimeout(timer);
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  // ESC 关闭
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !confirming) onCancelRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, confirming]);

  if (!isVisible && !isOpen) return null;

  const handleBackdropClick = () => {
    if (!confirming) onCancel();
  };

  const dialog = (
    <div
      className={`fixed inset-0 z-[10000] flex items-end sm:items-center justify-center transition-opacity duration-300 ${
        isOpen ? "opacity-100" : "opacity-0"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="退出登录确认"
    >
      {/* 遮罩层 */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={handleBackdropClick}
      />

      {/* 对话框：移动端底部弹出，桌面端居中 */}
      <div
        className={`relative w-full sm:w-auto sm:max-w-sm bg-white border-t sm:border sm:border-slate-200 sm:border-white/90 rounded-t-3xl sm:rounded-[20px] shadow-2xl p-6 sm:p-7 transition-all duration-300 ${
          isOpen
            ? "translate-y-0 sm:translate-y-0 sm:scale-100"
            : "translate-y-full sm:translate-y-4 sm:scale-95"
        }`}
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        {/* 图标与文案 */}
        <div className="flex items-start gap-4 mb-5">
          <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center flex-shrink-0">
            <LogOut className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-slate-800 mb-1">
              退出登录
            </h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed">
              确定要退出当前账号吗？退出后需要重新登录才能继续使用。
            </p>
          </div>
        </div>

        {/* 按钮区 */}
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 h-11 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={confirming}
            className="flex-1 h-11 bg-gradient-to-r from-red-500 to-red-600 text-white text-sm font-bold rounded-xl hover:shadow-lg hover:shadow-red-500/25 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0 flex items-center justify-center gap-1.5"
          >
            {confirming ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>正在退出...</span>
              </>
            ) : (
              <>
                <LogOut className="w-4 h-4" />
                <span>退出登录</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  // 通过 Portal 渲染到 document.body：
  // 本组件可能被渲染进带 backdrop-blur 的父级（如 GlobalHeader），
  // backdrop-filter 会为后代创建 containing block，导致 fixed 相对视口定位失效
  // （弹窗不居中、遮罩只覆盖父级区域），因此必须脱离该祖先挂载。
  return typeof document !== "undefined"
    ? createPortal(dialog, document.body)
    : null;
}
