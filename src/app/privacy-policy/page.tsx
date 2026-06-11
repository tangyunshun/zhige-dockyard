﻿"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { FileText, ArrowLeft } from "lucide-react";

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

export default function PrivacyPolicyPage() {
  const [document, setDocument] = useState<SystemDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDocument();
  }, []);

  const loadDocument = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/system-documents?category=privacy-policy");
      if (res.ok) {
        const data = await res.json();
        setDocument(data.data);
      } else if (res.status === 404) {
        setError("隐私政策未找到，请联系管理员");
      } else {
        setError("加载隐私政策失败");
      }
    } catch (err) {
      console.error("Load privacy policy error:", err);
      setError("加载隐私政策失败");
    } finally {
      setLoading(false);
    }
  };

  // 简单的 Markdown 渲染
  const renderContent = (content: string | null) => {
    if (!content) return null;
    
    let rendered = content;
    
    // 标题
    rendered = rendered.replace(/^### (.*$)/gim, '<h3 class="text-xl font-bold text-slate-800 mt-6 mb-3">$1</h3>');
    rendered = rendered.replace(/^## (.*$)/gim, '<h2 class="text-2xl font-black text-slate-800 mt-8 mb-4">$1</h2>');
    rendered = rendered.replace(/^# (.*$)/gim, '<h1 class="text-3xl font-black text-slate-800 mt-8 mb-6">$1</h1>');
    
    // 段落
    rendered = rendered.replace(/^(?!<[h|p])(.*$)/gim, '<p class="text-slate-700 leading-relaxed mb-4">$1</p>');
    
    // 列表
    rendered = rendered.replace(/^\* (.*$)/gim, '<li class="text-slate-700 mb-2 ml-4 list-disc">$1</li>');
    rendered = rendered.replace(/^- (.*$)/gim, '<li class="text-slate-700 mb-2 ml-4 list-disc">$1</li>');
    
    return <div dangerouslySetInnerHTML={{ __html: rendered }} />;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f0f8ff] via-[#e6f4f1] to-[#f5f3ff] py-12">
      <div className="max-w-4xl mx-auto px-6">
        {/* 返回按钮 */}
        <Link
          href="/auth/register"
          className="inline-flex items-center gap-2 text-slate-600 hover:text-[#3182ce] mb-8 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>返回注册</span>
        </Link>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-[#3182ce]/30 border-t-[#3182ce] rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-slate-600 font-medium">加载中...</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-600 font-medium">{error}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-[#3182ce]/10 rounded-xl">
                <FileText className="w-8 h-8 text-[#3182ce]" />
              </div>
              <div>
                <h1 className="text-3xl font-black text-slate-800">
                  {document?.title || "隐私政策"}
                </h1>
                <div className="text-sm text-slate-500 mt-1">
                  最后更新: {new Date(document?.updatedAt || "").toLocaleString("zh-CN")}
                </div>
              </div>
            </div>

            <div className="prose max-w-none">
              {renderContent(document?.content)}
              
              {!document?.content && (
                <div className="text-center py-12">
                  <p className="text-slate-500">隐私政策内容正在准备中...</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
