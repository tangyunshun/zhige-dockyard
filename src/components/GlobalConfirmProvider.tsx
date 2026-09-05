"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import ConfirmModal from "@/components/ConfirmModal";

export interface ConfirmOptions {
  title?: string;
  message: string;
  type?: "info" | "warning" | "danger";
  confirmText?: string;
  cancelText?: string;
}

type ConfirmState = ConfirmOptions & {
  resolve: (ok: boolean) => void;
};

let openConfirm: ((state: ConfirmState) => void) | null = null;

/**
 * 全局命令式确认框。返回 Promise<boolean>，可在事件处理函数中直接 await。
 * 若 GlobalConfirmProvider 尚未挂载，降级为浏览器原生 confirm，保证功能可用。
 */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (openConfirm) {
      openConfirm({ ...options, resolve });
    } else {
      const ok = typeof window !== "undefined" ? window.confirm(options.message) : false;
      resolve(ok);
    }
  });
}

export function GlobalConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    openConfirm = (s) => {
      setState(s);
      setIsOpen(true);
    };
    return () => {
      openConfirm = null;
    };
  }, []);

  // 关闭动画结束后清空 state，避免下一次弹窗闪出旧内容
  useEffect(() => {
    if (!isOpen && state) {
      const timer = setTimeout(() => setState(null), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, state]);

  const resolveRef = useRef<((ok: boolean) => void) | null>(null);
  const resolvedRef = useRef(false);

  useEffect(() => {
    if (state) {
      resolveRef.current = state.resolve;
      resolvedRef.current = false;
    }
  }, [state]);

  const resolve = useCallback((ok: boolean) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    resolveRef.current?.(ok);
  }, []);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    resolve(true);
  }, [resolve]);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    resolve(false);
  }, [resolve]);

  return (
    <>
      {children}
      {state && (
        <ConfirmModal
          isOpen={isOpen}
          title={state.title || "提示"}
          message={state.message}
          type={state.type || "warning"}
          confirmText={state.confirmText || "确定"}
          cancelText={state.cancelText || "取消"}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
