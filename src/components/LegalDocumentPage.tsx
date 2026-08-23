"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  AlertCircle,
  ChevronUp,
  Clock,
  ListTree,
} from "lucide-react";
import Footer from "@/components/Footer";

interface SystemDocument {
  id: string;
  title: string;
  content: string | null;
  category: string;
  tags: string | null;
  isPublished: boolean;
  sortOrder: number;
  viewCount: number;
  authorId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

interface LegalDocumentPageProps {
  category: string;
  fallbackTitle: string;
  notFoundMessage: string;
  loadFailedMessage: string;
  icon: React.ReactNode;
}

/** 不需要进入目录的元信息标题 */
const TOC_EXCLUDE_KEYWORDS = ["版本生效日期", "更新日期"];

/** 依据标题文本生成锚点 id */
const slugify = (text: string, index: number) =>
  `doc-sec-${index}-${
    text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "").slice(0, 24) || "section"
  }`;

/** 行内样式：加粗 / 行内代码 / 链接 */
const inline = (text: string) =>
  text
    .replace(
      /\*\*(.+?)\*\*/g,
      '<strong class="font-bold text-slate-800">$1</strong>'
    )
    .replace(
      /`(.+?)`/g,
      '<code class="px-1.5 py-0.5 rounded-md bg-slate-100 text-[#dc2626] text-[0.9em]">$1</code>'
    )
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer" class="text-[#3182ce] font-semibold hover:underline underline-offset-2">$1</a>'
    );

/** 将系统文档的 Markdown 子集渲染为 HTML，并提取目录 */
function parseMarkdown(content: string): { html: string; toc: TocItem[] } {
  const lines = content.split("\n");
  const toc: TocItem[] = [];
  let html = "";
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      html += `<ul class="space-y-2.5 my-4">${listBuffer
        .map(
          (item) =>
            `<li class="relative pl-5 text-sm md:text-[15px] text-slate-600 leading-7 before:absolute before:left-0 before:top-[12px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-[#3182ce]/50 before:content-['']">${inline(
              item
            )}</li>`
        )
        .join("")}</ul>`;
      listBuffer = [];
    }
  };

  lines.forEach((raw, index) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    if (trimmed.startsWith("### ")) {
      flushList();
      const text = trimmed.slice(4);
      const id = slugify(text, index);
      toc.push({ id, text, level: 3 });
      html += `<h3 id="${id}" class="scroll-mt-28 text-[17px] md:text-lg font-bold text-slate-800 mt-8 mb-3">${inline(
        text
      )}</h3>`;
    } else if (trimmed.startsWith("## ")) {
      flushList();
      const text = trimmed.slice(3);
      const id = slugify(text, index);
      if (!TOC_EXCLUDE_KEYWORDS.some((k) => text.includes(k))) {
        toc.push({ id, text, level: 2 });
      }
      html += `<h2 id="${id}" class="scroll-mt-28 text-xl md:text-2xl font-extrabold text-slate-800 mt-10 mb-4 pb-3 border-b border-slate-100">${inline(
        text
      )}</h2>`;
    } else if (trimmed.startsWith("# ")) {
      flushList();
      html += `<h1 class="text-2xl md:text-3xl font-extrabold text-slate-800 mt-8 mb-5">${inline(
        trimmed.slice(2)
      )}</h1>`;
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      listBuffer.push(trimmed.slice(2));
    } else {
      flushList();
      const isOrdered = /^（\d+）/.test(trimmed);
      html += `<p class="text-sm md:text-[15px] text-slate-600 leading-7 md:leading-8 mb-4${
        isOrdered ? " pl-5" : ""
      }">${inline(trimmed)}</p>`;
    }
  });
  flushList();
  return { html, toc };
}

export default function LegalDocumentPage({
  category,
  fallbackTitle,
  notFoundMessage,
  loadFailedMessage,
  icon,
}: LegalDocumentPageProps) {
  const router = useRouter();
  const [doc, setDoc] = useState<SystemDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [activeSection, setActiveSection] = useState("");

  const loadDocument = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/system-documents?category=${category}`);
      if (res.ok) {
        const data = await res.json();
        setDoc(data.data);
      } else if (res.status === 404) {
        setError(notFoundMessage);
      } else {
        setError(loadFailedMessage);
      }
    } catch {
      setError(loadFailedMessage);
    } finally {
      setLoading(false);
    }
  }, [category, notFoundMessage, loadFailedMessage]);

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  // 检测登录状态：仅用于直接访问页面时的返回兜底
  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setLoggedIn(true);
      })
      .catch(() => {});
  }, []);

  const { html, toc } = useMemo(
    () => (doc?.content ? parseMarkdown(doc.content) : { html: "", toc: [] }),
    [doc]
  );

  // 智能返回：站内来源返回上一页；直接访问时登录用户回帮助页，未登录回首页
  const handleBack = () => {
    const referrer = typeof document !== "undefined" ? document.referrer : "";
    if (referrer && referrer.startsWith(window.location.origin)) {
      router.back();
    } else {
      router.push(loggedIn ? "/help" : "/");
    }
  };

  // 滚动时高亮当前目录项
  useEffect(() => {
    if (toc.length === 0) return;
    const onScroll = () => {
      let current = "";
      for (const item of toc) {
        const el = document.getElementById(item.id);
        if (el && el.getBoundingClientRect().top <= 140) current = item.id;
      }
      setActiveSection(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [toc]);

  const jumpTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const formatDate = (value: string) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div
      className="min-h-screen relative bg-[#f0f8ff]"
      style={{
        backgroundImage:
          "radial-gradient(rgba(49, 130, 206, 0.08) 1.5px, transparent 1.5px)",
        backgroundSize: "24px 24px",
      }}
    >
      {/* 背景光斑 */}
      <div className="absolute top-0 left-[-10%] w-[35%] h-[35%] bg-[#3182ce]/[0.05] rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#10b981]/[0.05] rounded-full blur-[130px] pointer-events-none" />

      <main className="relative z-10 max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-10">
        {/* 返回按钮 */}
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2.5 text-slate-600 hover:text-[#3182ce] mb-6 transition-colors cursor-pointer group"
        >
          <span className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm group-hover:border-[#3182ce]/40 group-hover:bg-[#3182ce]/5 transition-all">
            <ArrowLeft className="w-4 h-4" />
          </span>
          <span className="text-sm font-semibold">返回上一页</span>
        </button>

        <div className="flex gap-8 items-start">
          {/* 正文卡片 */}
          <article className="flex-1 min-w-0 bg-white/80 backdrop-blur-xl rounded-[24px] shadow-xl border border-white/95 overflow-hidden">
            {/* Hero 区 */}
            <header className="px-6 md:px-10 py-8 md:py-10 border-b border-slate-100 bg-gradient-to-r from-[#3182ce]/5 via-purple-500/[0.02] to-[#10b981]/5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-gradient-to-br from-[#3182ce] to-[#2b6cb0] flex items-center justify-center shadow-lg shadow-[#2b6cb0]/20 shrink-0">
                  {icon}
                </div>
                <div className="min-w-0 pt-0.5">
                  <h1 className="text-2xl md:text-3xl font-extrabold text-slate-800 tracking-tight leading-snug">
                    {doc?.title || fallbackTitle}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-slate-500 font-semibold">
                    {doc?.updatedAt && (
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        更新于 {formatDate(doc.updatedAt)}
                      </span>
                    )}
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                      当前版本
                    </span>
                  </div>
                </div>
              </div>
            </header>

            <div className="px-6 md:px-10 py-8 md:py-10">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="text-center">
                    <div className="w-12 h-12 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-slate-500 text-sm font-semibold">加载中...</p>
                  </div>
                </div>
              ) : error ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-400 flex items-center justify-center mb-4">
                    <AlertCircle className="w-8 h-8" />
                  </div>
                  <p className="text-slate-600 font-semibold">{error}</p>
                  <button
                    onClick={loadDocument}
                    className="mt-5 px-4 py-2 rounded-xl bg-[#3182ce] text-white text-sm font-semibold hover:bg-[#2b6cb0] transition-colors cursor-pointer"
                  >
                    重新加载
                  </button>
                </div>
              ) : html ? (
                <div dangerouslySetInnerHTML={{ __html: html }} />
              ) : (
                <div className="text-center py-20 text-slate-500 text-sm font-semibold">
                  内容正在准备中...
                </div>
              )}
            </div>

            {/* 底部 */}
            <footer className="px-6 md:px-10 py-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs text-slate-400 font-medium">
                如对本文档内容有疑问，请联系官方邮箱 support@zhige-dockyard.com
              </p>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3182ce] hover:bg-[#3182ce]/5 px-3 py-2 rounded-xl transition-colors cursor-pointer"
              >
                <ChevronUp className="w-4 h-4" />
                回到顶部
              </button>
            </footer>
          </article>

          {/* 右侧目录（桌面端） */}
          {toc.length > 0 && (
            <aside className="hidden lg:block w-60 shrink-0 sticky top-24">
              <div className="bg-white/80 backdrop-blur-xl rounded-2xl border border-white/95 shadow-lg p-4">
                <div className="flex items-center gap-2 px-1 pb-3 mb-2 border-b border-slate-100">
                  <ListTree className="w-4 h-4 text-[#3182ce]" />
                  <span className="text-sm font-bold text-slate-700">本文目录</span>
                </div>
                <nav className="max-h-[calc(100vh-160px)] overflow-y-auto pr-1 space-y-1">
                  {toc.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => jumpTo(item.id)}
                      className={`block w-full text-left rounded-lg px-2.5 py-1.5 transition-colors cursor-pointer ${
                        item.level === 3 ? "pl-6" : ""
                      } ${
                        activeSection === item.id
                          ? "bg-[#3182ce]/10 text-[#3182ce] font-semibold"
                          : "text-slate-500 hover:text-[#3182ce] hover:bg-[#3182ce]/5"
                      }`}
                    >
                      <span
                        className={`text-xs leading-5 ${item.level === 2 ? "font-semibold" : ""}`}
                      >
                        {item.text}
                      </span>
                    </button>
                  ))}
                </nav>
              </div>
            </aside>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
