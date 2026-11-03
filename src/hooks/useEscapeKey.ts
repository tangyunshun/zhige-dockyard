"use client";

import { useEffect } from "react";

/**
 * 弹窗 Esc 关闭统一 hook（自查清单指令一 1e）
 * isOpen 为 true 时监听 document keydown，Escape 触发 onClose；卸载/关闭时自动移除监听。
 */
export function useEscapeKey(isOpen: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);
}
