"use client";

import React, { useState, useEffect } from "react";
import { X, User, FileText, Shield, Paperclip, Download, Eye } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  warnings?: string[];
  onConfirm: (inputValue?: string) => void | boolean | Promise<void | boolean>;
  onCancel: () => void;
  confirmText?: string;
  confirmButtonClass?: string;
  cancelText?: string;
  type?: "danger" | "warning" | "info";
  appealContext?: {
    userAccount: string;
    appealReason: string;
    banReason?: string;
    appealEvidence?: any;
    onPreviewImage?: (url: string) => void;
  };
  input?: {
    label: string;
    placeholder?: string;
    required?: boolean;
    value: string;
    onChange: (value: string) => void;
  };
  children?: React.ReactNode;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  warnings = [],
  onConfirm,
  onCancel,
  confirmText = "确认",
  confirmButtonClass,
  cancelText = "取消",
  type = "warning",
  input,
  appealContext,
  children,
}: ConfirmDialogProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const [localInputValue, setLocalInputValue] = useState(input?.value || "");

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setLocalInputValue(input?.value || "");
      document.body.style.overflow = "hidden";
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = "unset";
      return () => clearTimeout(timer);
    }
  }, [isOpen, input?.value]);

  if (!isVisible && !isOpen) return null;

  const typeConfig = {
    danger: {
      iconColor: "text-red-500",
      confirmBg: "bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 shadow-red-500/25",
      iconBg: "bg-red-50 text-red-600 border border-red-100",
    },
    warning: {
      iconColor: "text-amber-500",
      confirmBg: "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-amber-500/25",
      iconBg: "bg-amber-50 text-amber-600 border border-amber-100",
    },
    info: {
      iconColor: "text-[#3182ce]",
      confirmBg: "bg-gradient-to-r from-[#4299e1] to-[#3182ce] hover:from-[#3182ce] hover:to-[#2b6cb0] shadow-blue-500/25",
      iconBg: "bg-blue-50 text-[#3182ce] border border-blue-100",
    },
  };

  const config = typeConfig[type];

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-300 ${
        isOpen ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md transition-all duration-300"
        onClick={onCancel}
      />

      {/* 对话框 */}
      <div
        className={`relative bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl shadow-slate-900/20 max-w-lg sm:max-w-xl w-full mx-4 border border-white/90 overflow-hidden transform transition-all duration-300 flex flex-col max-h-[90vh] ${
          isOpen ? "scale-100 translate-y-0" : "scale-95 translate-y-4"
        }`}
      >
        {/* 顶部优雅渐变装饰线条 */}
        <div
          className={`h-1.5 w-full shrink-0 ${
            type === "danger"
              ? "bg-gradient-to-r from-red-500 to-rose-600"
              : type === "warning"
              ? "bg-gradient-to-r from-amber-500 to-orange-500"
              : "bg-gradient-to-r from-[#4299e1] to-[#3182ce]"
          }`}
        />

        {/* 关闭按钮 */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 z-10 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all p-2 rounded-full focus:outline-none cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* 内容区域：可纵向滚动，防止长内容或小屏幕截断 */}
        <div className="p-5 sm:p-6 flex-1 overflow-y-auto min-h-0 space-y-3.5">
          {/* 图标和标题 */}
          <div className="flex items-start gap-3.5">
            <div
              className={`w-10 h-10 rounded-2xl ${config.iconBg} flex items-center justify-center flex-shrink-0 shadow-2xs mt-0.5`}
            >
              {type === "danger" && (
                <svg className={`w-5 h-5 ${config.iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              )}
              {type === "warning" && (
                <svg className={`w-5 h-5 ${config.iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {type === "info" && (
                <svg className={`w-5 h-5 ${config.iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>
            <div className="flex-1 pr-4">
              <h3 className="text-base font-black text-slate-900 tracking-tight mb-1">
                {title}
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed font-medium">
                {message}
              </p>
            </div>
          </div>

          {/* 封禁案由与用户申诉原话及证明材料核查面板 */}
          {appealContext && (
            <div className="p-3.5 bg-slate-50/90 border border-slate-200/90 rounded-2xl space-y-2.5 text-xs">
              {/* 判定案由卡片 */}
              {appealContext.banReason && (
                <div className="space-y-1">
                  <span className="text-red-800 font-black flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5 text-red-600" />
                    管理员判定封禁案由:
                  </span>
                  <div className="bg-red-50/80 p-2.5 rounded-xl border border-red-200/80 font-bold text-red-900 leading-relaxed font-sans whitespace-pre-wrap break-words text-xs shadow-2xs">
                    {appealContext.banReason}
                  </div>
                </div>
              )}

              {/* 用户申诉陈述卡片 */}
              <div className="space-y-1">
                <span className="text-slate-800 font-black flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-[#3182ce]" />
                  用户提交的申诉原因及说明:
                </span>
                <div className="bg-white p-3 rounded-xl border border-slate-200/90 font-bold text-slate-800 leading-relaxed font-sans whitespace-pre-wrap break-words text-xs shadow-2xs">
                  {appealContext.appealReason || "暂无具体陈述"}
                </div>
              </div>

              {/* 证明材料与附件核查卡片（最多 3 个附件） */}
              {(() => {
                const rawEv = appealContext.appealEvidence;
                let attachmentsList: Array<{ id: string; name: string; size: number; type: string; url: string }> = [];
                if (Array.isArray(rawEv)) {
                  attachmentsList = rawEv;
                } else if (typeof rawEv === "string" && rawEv.trim().startsWith("[")) {
                  try {
                    const parsed = JSON.parse(rawEv);
                    if (Array.isArray(parsed)) attachmentsList = parsed;
                  } catch {}
                }

                return (
                  <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                    <span className="text-slate-800 font-black flex items-center gap-1">
                      <Paperclip className="w-3.5 h-3.5 text-[#3182ce]" />
                      证明材料与附件:
                    </span>

                    {attachmentsList.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {attachmentsList.map((att, idx) => {
                          const isImg =
                            att.type?.startsWith("image/") ||
                            /\.(jpg|jpeg|png|webp|gif)$/i.test(att.name || att.url || "");
                          return (
                            <div
                              key={att.id || idx}
                              className="bg-white p-2 rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between group"
                            >
                              <div className="flex items-center gap-2 mb-1.5">
                                {isImg ? (
                                  <div
                                    className="w-8 h-8 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200 cursor-zoom-in group-hover:opacity-90 relative"
                                    onClick={() => appealContext.onPreviewImage?.(att.url)}
                                    title="点击查看放大图片"
                                  >
                                    <img src={att.url} alt={att.name} className="w-full h-full object-cover" />
                                  </div>
                                ) : (
                                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                                    <FileText className="w-4 h-4" />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="text-[11px] font-bold text-slate-800 truncate" title={att.name}>
                                    {att.name}
                                  </p>
                                  <p className="text-[9px] text-slate-400">
                                    {att.size > 0
                                      ? att.size < 1024 * 1024
                                        ? `${(att.size / 1024).toFixed(1)} KB`
                                        : `${(att.size / (1024 * 1024)).toFixed(1)} MB`
                                      : "已上传"}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center justify-end gap-1 pt-1 border-t border-slate-100">
                                {isImg && appealContext.onPreviewImage && (
                                  <button
                                    type="button"
                                    onClick={() => appealContext.onPreviewImage?.(att.url)}
                                    className="text-[10px] text-blue-600 hover:text-blue-700 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors flex items-center gap-0.5 cursor-pointer"
                                  >
                                    <Eye className="w-2.5 h-2.5" /> 预览
                                  </button>
                                )}
                                <a
                                  href={att.url}
                                  download={att.name || `材料附件-${idx + 1}`}
                                  className="text-[10px] text-slate-600 hover:text-blue-600 font-medium px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors flex items-center gap-0.5"
                                >
                                  <Download className="w-2.5 h-2.5" /> 下载
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : rawEv && typeof rawEv === "string" ? (
                      <div className="bg-white p-2.5 rounded-xl border border-slate-200 text-xs font-mono text-slate-700 leading-relaxed break-all">
                        {rawEv}
                        {/\.(jpg|jpeg|png|webp|gif)/i.test(rawEv) && (
                          <div className="mt-2">
                            <span className="text-[10px] text-slate-400 font-bold block mb-1">图片预览（点击放大）：</span>
                            <img
                              src={rawEv}
                              alt="申诉证明"
                              onClick={() => appealContext.onPreviewImage?.(rawEv)}
                              className="max-h-28 rounded-lg border border-slate-200 object-cover cursor-zoom-in hover:opacity-90"
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-white/80 p-2.5 rounded-xl border border-slate-200/60 text-xs text-slate-400 italic">
                        用户未提交补充证明材料与附件
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* 警告信息 */}
          {warnings.length > 0 && (
            <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <p className="text-xs font-bold text-amber-800 mb-0.5">
                    注意事项：
                  </p>
                  <ul className="space-y-0.5">
                    {warnings.map((warning, index) => (
                      <li key={index} className="text-xs text-amber-700">
                        • {warning}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* 自定义额外内容 */}
          {children}

          {/* 处理意见输入框（可选/必填） */}
          {input && (
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">
                {input.label}
                {input.required && <span className="text-red-500 ml-0.5">*</span>}
              </label>
              <textarea
                value={localInputValue}
                onChange={(e) => {
                  setLocalInputValue(e.target.value);
                  setInputError("");
                  if (input.onChange) {
                    input.onChange(e.target.value);
                  }
                }}
                placeholder={input.placeholder}
                rows={3}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/20 outline-none text-xs text-slate-800 transition-all font-sans resize-none"
              />
              {inputError && (
                <p className="text-xs text-red-600 mt-0.5 font-medium">{inputError}</p>
              )}
            </div>
          )}
        </div>

        {/* 操作按钮组：固定在底部，绝不被页面截断 */}
        <div className="p-4 sm:px-6 bg-slate-50/90 border-t border-slate-200/80 flex items-center gap-3 shrink-0">
          <button
            onClick={onCancel}
            disabled={!isOpen}
            className="flex-1 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-95"
          >
            {cancelText}
          </button>
          <button
            onClick={async () => {
              if (input?.required && !localInputValue.trim()) {
                setInputError(`${input.label.replace(/\s*[（(].*$/, "")}为必填项`);
                return;
              }
              await onConfirm(localInputValue.trim());
            }}
            disabled={!isOpen}
            className={`flex-1 px-4 py-2.5 ${confirmButtonClass || config.confirmBg} text-white text-xs font-black rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg active:scale-95 cursor-pointer`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
