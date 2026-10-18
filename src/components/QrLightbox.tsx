"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * 二维码放大查看浮层（前台定价横幅 / 后台系统设置共用）：
 * - Portal 渲染到 body 顶层，避免受父级 transform/filter 定位上下文影响导致错位、裁切
 * - 与全站弹窗规范一致：z-[10060] 顶层、animate-in 淡入缩放动效
 * - 图片按原始尺寸展示（max 约束），小尺寸二维码不被强行拉大成模糊大图
 * - 支持点击遮罩、右上角关闭按钮、ESC 键关闭；打开时锁定背景滚动
 */
export default function QrLightbox({
  src,
  title,
  onClose,
}: {
  src: string;
  title?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10060] flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 animate-in zoom-in-95 duration-150 max-w-[92vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="关闭"
          onClick={onClose}
          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center hover:bg-slate-200 hover:text-slate-700 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        {/* 按原始尺寸展示，仅做 max 约束，避免小图模糊放大 */}
        <img
          src={src}
          alt={title || "二维码大图"}
          className="block max-w-[320px] max-h-[60vh] w-auto h-auto object-contain rounded-lg"
        />
        {title && (
          <p className="text-center text-xs font-bold text-slate-500 mt-3 px-4">{title}</p>
        )}
        <p className="text-center text-[10px] font-medium text-slate-400 mt-1">
          点击遮罩或按 ESC 关闭
        </p>
      </div>
    </div>,
    document.body
  );
}
