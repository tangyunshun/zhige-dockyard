"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, ShieldCheck, ScrollText, Check, AlertCircle, RefreshCw } from "lucide-react";

interface LegalDocumentModalProps {
  isOpen: boolean;
  category: "privacy-policy" | "terms-of-service" | null;
  onClose: () => void;
}

interface SystemDocument {
  id: string;
  title: string;
  content: string | null;
  category: string;
  updatedAt: string;
}

/** 行内样式：加粗 / 行内代码 / 链接 */
const inline = (text: string) =>
  text
    .replace(
      /\*\*(.+?)\*\*/g,
      '<strong class="font-bold text-slate-800">$1</strong>'
    )
    .replace(
      /`(.+?)`/g,
      '<code class="px-1.5 py-0.5 rounded-md bg-slate-100 text-[#dc2626] text-[0.9em] font-mono">$1</code>'
    )
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer" class="text-[#3182ce] font-semibold hover:underline underline-offset-2">$1</a>'
    );

export default function LegalDocumentModal({
  isOpen,
  category,
  onClose,
}: LegalDocumentModalProps) {
  const [doc, setDoc] = useState<SystemDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPrivacy = category === "privacy-policy";
  const defaultTitle = isPrivacy ? "知阁·舟坊平台隐私政策" : "知阁·舟坊平台服务条款";

  const fetchDocument = useCallback(async () => {
    if (!category) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/system-documents?category=${category}&t=${Date.now()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setDoc(data.data);
      } else if (data?.unpublished) {
        setError(data.error || "文档处于维护状态，请稍后查阅。");
      } else {
        setError(data?.error || "暂未能加载文档内容，请稍后重试");
      }
    } catch {
      setError("网络请求异常，请检查网络连接后重试");
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    if (isOpen && category) {
      fetchDocument();
      // 阻止外部背景滚动
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, category, fetchDocument]);

  if (!isOpen || !category) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in-50 duration-200">
      <div className="bg-white rounded-[8px] border border-blue-100 shadow-2xl max-w-3xl w-full max-h-[88vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* 顶部标题栏 */}
        <div className="p-4 sm:p-5 bg-gradient-to-br from-blue-50/80 via-indigo-50/30 to-white border-b border-blue-100/70 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[6px] bg-white border border-blue-100 flex items-center justify-center shadow-2xs shrink-0">
              {isPrivacy ? (
                <ShieldCheck className="w-6 h-6 text-emerald-600" />
              ) : (
                <ScrollText className="w-6 h-6 text-[#3182ce]" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-slate-800 tracking-tight">
                  {doc?.title || defaultTitle}
                </h3>
                <span className="px-2 py-0.5 rounded-[4px] text-[10px] font-black bg-blue-50 text-[#2b6cb0] border border-blue-200 font-mono">
                  合规声明
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {doc?.updatedAt
                  ? `最新生效日期：${new Date(doc.updatedAt).toLocaleDateString("zh-CN")}`
                  : "依据国家网络安全与个人信息保护相关法规制定"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-[4px] bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors flex items-center justify-center cursor-pointer shrink-0"
            title="关闭视窗"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容主体滚动区 */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-3 bg-white text-slate-700">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <RefreshCw className="w-8 h-8 text-[#3182ce] animate-spin" />
              <p className="text-xs text-slate-400 font-medium">正在安全拉取最新合规条款...</p>
            </div>
          ) : error ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center border border-amber-200">
                <AlertCircle className="w-6 h-6 text-amber-600" />
              </div>
              <p className="text-xs text-slate-600 font-medium max-w-sm">{error}</p>
              <button
                type="button"
                onClick={fetchDocument}
                className="h-8 px-4 text-xs font-black text-[#2b6cb0] bg-blue-50 hover:bg-blue-100 rounded-[4px] transition-colors cursor-pointer"
              >
                重试加载
              </button>
            </div>
          ) : doc?.content ? (
            <div className="space-y-1.5 text-left text-xs leading-relaxed text-slate-700">
              {(() => {
                const lines = doc.content.split("\n");
                return lines.map((line, idx) => {
                  const trimmed = line.trim();
                  if (!trimmed) return null;

                  // 章节标题
                  if (/^第[一二三四五六七八九十]+章/.test(trimmed) || trimmed.startsWith("## ")) {
                    const headingText = trimmed.replace(/^##\s*/, "");
                    return (
                      <h2
                        key={idx}
                        className="text-xs font-black text-[#2b6cb0] mt-4 mb-2 flex items-center gap-1.5 bg-blue-50/80 px-2.5 py-1.5 rounded-[4px] border-l-4 border-[#3182ce]"
                      >
                        {headingText}
                      </h2>
                    );
                  }

                  // 次级标题
                  if (trimmed.startsWith("### ")) {
                    return (
                      <h3 key={idx} className="text-xs font-bold text-slate-800 mt-3 mb-1">
                        {trimmed.slice(4)}
                      </h3>
                    );
                  }

                  // 重点警告提示区块
                  if (
                    trimmed.includes("【核心提示") ||
                    trimmed.includes("【严禁红线】") ||
                    trimmed.includes("【违规处理") ||
                    trimmed.includes("【重要提示】")
                  ) {
                    return (
                      <div
                        key={idx}
                        className="bg-amber-50/90 text-amber-900 border-l-4 border-amber-500 font-bold p-2.5 rounded-r-[4px] text-xs leading-relaxed my-2 shadow-2xs"
                      >
                        <span className="inline-block mr-1">⚠️</span> {trimmed}
                      </div>
                    );
                  }

                  // 权益保障高亮区块
                  if (
                    trimmed.includes("【用户成果所有权】") ||
                    trimmed.includes("【AI 生成内容权利归属】") ||
                    trimmed.includes("【数据保密承诺】") ||
                    trimmed.includes("【账号安全") ||
                    trimmed.includes("【数据保留")
                  ) {
                    return (
                      <div
                        key={idx}
                        className="bg-blue-50/90 text-blue-900 border-l-4 border-blue-500 font-bold p-2.5 rounded-r-[4px] text-xs leading-relaxed my-2 shadow-2xs"
                      >
                        <span className="inline-block mr-1">🛡️</span> {trimmed}
                      </div>
                    );
                  }

                  // 普通段落
                  return (
                    <p
                      key={idx}
                      className="text-xs text-slate-600 leading-relaxed font-normal mb-1.5"
                      dangerouslySetInnerHTML={{ __html: inline(trimmed) }}
                    />
                  );
                });
              })()}
            </div>
          ) : (
            <div className="py-16 text-center text-xs text-slate-400">暂无文档内容</div>
          )}
        </div>

        {/* 底部操作栏 */}
        <div className="p-4 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>知阁·舟坊严格遵循法律法规与国家数据安全规范</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-5 text-xs font-black text-white bg-[#3182ce] hover:bg-[#2b6cb0] rounded-[4px] shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
          >
            <Check className="w-3.5 h-3.5" />
            <span>我已阅读并关闭</span>
          </button>
        </div>
      </div>
    </div>
  );
}
