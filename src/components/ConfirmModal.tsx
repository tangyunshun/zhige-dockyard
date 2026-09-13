"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Info, AlertTriangle, AlertOctagon, CheckCircle2, X } from "lucide-react";

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string | React.ReactNode;
  type?: "info" | "warning" | "danger" | "success";
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  type = "info",
  confirmText = "确定",
  cancelText = "取消",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      document.body.style.overflow = "hidden";
    } else {
      const timer = setTimeout(() => setIsVisible(false), 200);
      document.body.style.overflow = "unset";
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;
  if (!mounted || typeof document === "undefined") return null;

  const typeConfig = {
    info: {
      bar: "bg-gradient-to-r from-[#3182ce] to-[#2b6cb0]",
      badgeBg: "bg-blue-50 text-[#3182ce] ring-4 ring-blue-50/70",
      icon: <Info className="w-5 h-5 text-[#3182ce]" />,
      confirmBtn: "bg-[#3182ce] hover:bg-[#2b6cb0] text-white shadow-sm hover:shadow-blue-500/25",
    },
    warning: {
      bar: "bg-gradient-to-r from-amber-400 to-amber-600",
      badgeBg: "bg-amber-50 text-amber-600 ring-4 ring-amber-50/70",
      icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
      confirmBtn: "bg-amber-500 hover:bg-amber-600 text-white shadow-sm hover:shadow-amber-500/25",
    },
    danger: {
      bar: "bg-gradient-to-r from-rose-500 to-red-600",
      badgeBg: "bg-rose-50 text-rose-600 ring-4 ring-rose-50/70",
      icon: <AlertOctagon className="w-5 h-5 text-rose-600" />,
      confirmBtn: "bg-rose-600 hover:bg-rose-700 text-white shadow-sm hover:shadow-rose-600/25",
    },
    success: {
      bar: "bg-gradient-to-r from-emerald-500 to-teal-600",
      badgeBg: "bg-emerald-50 text-emerald-600 ring-4 ring-emerald-50/70",
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
      confirmBtn: "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:shadow-emerald-600/25",
    },
  };

  const config = typeConfig[type] || typeConfig.info;

  // 格式化段落内的高亮词元（例如【用户名】或「名称」）
  const formatTokens = (text: string) => {
    const parts = text.split(/([【「][^】」]+[】」])/g);
    return parts.map((part, idx) => {
      if (/^[【「].+[】」]$/.test(part)) {
        return (
          <span
            key={idx}
            className="font-bold text-slate-800 bg-slate-100/90 px-1.5 py-0.5 rounded text-xs border border-slate-200/60 inline-block align-baseline mx-0.5 shadow-2xs"
          >
            {part}
          </span>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  // 渲染正文内容：智能支持多段落分层、警告警示条与确认提示
  const renderMessageContent = () => {
    if (typeof message !== "string") {
      return message;
    }

    const rawParagraphs = message.split(/\n+/).map((p) => p.trim()).filter(Boolean);

    return (
      <div className="space-y-2.5">
        {rawParagraphs.map((para, idx) => {
          // 警告/警示段落（去除原始粗糙 Emoji，转换为精致结构化 Alert 卡片）
          const isWarning =
            para.startsWith("⚠️") ||
            para.includes("尚未绑定有效外部邮箱") ||
            para.startsWith("注意：") ||
            para.startsWith("警告：") ||
            para.startsWith("风险提示：");

          if (isWarning) {
            const cleanText = para.replace(/^⚠️\s*/, "");
            return (
              <div
                key={idx}
                className="p-3 rounded-xl bg-amber-50/90 border border-amber-200/80 text-amber-900 text-xs leading-relaxed flex items-start gap-2.5 shadow-2xs"
              >
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{formatTokens(cleanText)}</div>
              </div>
            );
          }

          // 成功/校验通过段落（转换为轻量翠绿/浅蓝 Callout 卡片）
          const isSuccessInfo =
            para.includes("检测到该用户已绑定邮箱") ||
            para.startsWith("✓") ||
            para.includes("已成功核验");

          if (isSuccessInfo) {
            const cleanText = para.replace(/^[✓✔]\s*/, "");
            return (
              <div
                key={idx}
                className="p-3 rounded-xl bg-blue-50/90 border border-blue-200/80 text-blue-900 text-xs leading-relaxed flex items-start gap-2.5 shadow-2xs"
              >
                <CheckCircle2 className="w-4 h-4 text-[#3182ce] shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{formatTokens(cleanText)}</div>
              </div>
            );
          }

          // 结尾的确认问询句
          const isConfirmPrompt =
            idx === rawParagraphs.length - 1 &&
            (para.includes("请确认") || para.includes("确定要") || para.endsWith("？") || para.endsWith("?"));

          if (isConfirmPrompt) {
            return (
              <p key={idx} className="text-xs font-semibold text-slate-500 pt-1">
                {formatTokens(para)}
              </p>
            );
          }

          // 普通主正文段落
          return (
            <p key={idx} className="text-[13.5px] leading-relaxed text-slate-600 font-normal">
              {formatTokens(para)}
            </p>
          );
        })}
      </div>
    );
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-[10050] flex items-center justify-center p-4 transition-opacity duration-200 ${
        isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* 遮罩背景 */}
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
        onClick={onCancel}
      />

      {/* 对话框主体 */}
      <div
        className={`relative bg-white border border-slate-200/80 rounded-2xl shadow-2xl shadow-slate-900/15 w-full max-w-[460px] overflow-hidden transform transition-all duration-200 ${
          isOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-2"
        }`}
      >
        {/* 顶部品牌状态装饰色条 */}
        <div className={`h-1 w-full ${config.bar}`} />

        {/* 标题栏 */}
        <div className="px-6 pt-5 pb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${config.badgeBg}`}>
              {config.icon}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                {title}
              </h3>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            title="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 正文内容区 */}
        <div className="px-6 py-2 pb-5">
          {renderMessageContent()}
        </div>

        {/* 底部操作按钮栏 */}
        <div className="px-6 py-3.5 bg-slate-50/70 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 h-9 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 rounded-lg shadow-2xs hover:border-slate-300 active:scale-[0.98] transition-all cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={`px-5 h-9 text-xs font-semibold rounded-lg active:scale-[0.98] transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 ${config.confirmBtn}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
