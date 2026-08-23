"use client";

import React from "react";
import { useDevice } from "@/contexts/DeviceContext";

/**
 * 跨平台自适应网格
 * - 桌面端：按 cols 多列平铺
 * - 移动端：自动降至 1~2 列，避免横向溢出
 * 所有页面直接复用，统一 OS 自适应行为。
 */
interface AdaptiveGridProps {
  children: React.ReactNode;
  /** 桌面端列数 */
  cols?: 1 | 2 | 3 | 4 | 5 | 6;
  className?: string;
  gap?: string; // tailwind gap 类，如 "gap-4"
}

const COLS_MAP: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  6: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
};

export const AdaptiveGrid: React.FC<AdaptiveGridProps> = ({
  children,
  cols = 3,
  className = "",
  gap = "gap-4",
}) => {
  return (
    <div className={`grid ${COLS_MAP[cols] || COLS_MAP[3]} ${gap} ${className}`}>
      {children}
    </div>
  );
};

/**
 * 自适应操作按钮：触屏自动加大高度与点击区域
 */
export const AdaptiveButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "default" | "danger" }
> = ({ variant = "default", className = "", children, ...rest }) => {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-bold transition-all cursor-pointer select-none active:scale-[0.98]";
  const sizes = "min-h-[38px] px-4 text-xs sm:text-sm";
  const variants: Record<string, string> = {
    primary: "bg-[#3182ce] hover:bg-[#2b6cb0] text-white shadow-sm",
    default: "bg-white border border-slate-200 text-slate-700 hover:border-[#3182ce]/40",
    danger: "bg-red-500 hover:bg-red-500 text-white",
  };
  return (
    <button className={`${base} ${sizes} ${variants[variant]} ${className}`} {...rest}>
      {children}
    </button>
  );
};

/**
 * 自适应弹层：桌面端居中 Modal，移动端从底部抽屉滑出
 */
interface AdaptiveSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export const AdaptiveSheet: React.FC<AdaptiveSheetProps> = ({ open, onClose, title, children }) => {
  const { isMobile } = useDevice();
  if (!open) return null;

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col justify-end">
        <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto zg-bottom-safe animate-in slide-in-from-bottom duration-200">
          {title && <h3 className="text-sm font-extrabold text-slate-800 mb-3 flex items-center justify-between">{title}<button onClick={onClose} className="text-slate-400 text-lg leading-none">✕</button></h3>}
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto animate-in zoom-in-95 duration-200">
        {title && <h3 className="text-sm font-extrabold text-slate-800 mb-3 flex items-center justify-between">{title}<button onClick={onClose} className="text-slate-400 text-lg leading-none">✕</button></h3>}
        {children}
      </div>
    </div>
  );
};
