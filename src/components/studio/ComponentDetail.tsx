"use client";

import React from "react";
import { useAppContext } from "@/contexts/AppContext";
import { ClipboardList, HelpCircle, Terminal, Info, Copy, Database } from "lucide-react";
import { useToast } from "@/components/Toast";
import type { ComponentDetailContent } from "@/constants/components";

interface ComponentDetailProps {
  componentId: string;
}

/**
 * 组件深度详情面板
 * 所有内容 100% 来自数据库 component_catalog.detail 字段，
 * 前端不再保留任何硬编码兜底文案；若数据库中未配置详情，则明确提示"暂未配置"。
 */
export default function ComponentDetail({ componentId }: ComponentDetailProps) {
  const toast = useToast();
  const { componentCatalog } = useAppContext();
  const comp = componentCatalog.find((c) => c.id === componentId);
  if (!comp) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center text-slate-400">
        未找到该组件信息
      </div>
    );
  }

  const detail = comp.detail as ComponentDetailContent | null | undefined;

  // 数据库未配置详情时不做任何内容编造，直接提示
  if (!detail || !detail.fullDescription) {
    return (
      <div className="bg-white rounded-2xl p-6 border border-slate-200 text-center space-y-2">
        <Database className="w-6 h-6 text-slate-300 mx-auto" />
        <p className="text-xs font-bold text-slate-500">
          组件 [{comp.id}] {comp.name} 暂未在数据库中配置详情内容
        </p>
        <p className="text-[11px] text-slate-400">
          请由平台管理员在管理后台补全该组件的深度详情后重试
        </p>
      </div>
    );
  }

  const details = {
    fullDescription: detail.fullDescription,
    usage: detail.usage,
    apiDoc: detail.apiDoc,
    faq: Array.isArray(detail.faq) ? detail.faq : [],
  };

  return (
    <div className="space-y-6 text-left">
      {/* 1. 详细介绍 */}
      <section className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm">
        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2.5 border-b border-slate-100 mb-3 uppercase tracking-wider">
          <Info className="w-4 h-4 text-[#3182ce]" />
          组件深度解读
        </h4>
        <p className="text-xs text-slate-600 leading-relaxed font-medium">
          {details.fullDescription}
        </p>
      </section>

      {/* 2. 使用步骤 */}
      <section className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm">
        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2.5 border-b border-slate-100 mb-3 uppercase tracking-wider">
          <ClipboardList className="w-4 h-4 text-emerald-500" />
          使用操作指南
        </h4>
        <div className="space-y-1.5">
          {details.usage.split("\n").map((line, idx) => (
            <p key={idx} className="text-xs text-slate-600 leading-relaxed font-medium">
              {line}
            </p>
          ))}
        </div>
      </section>

      {/* 3. API开发文档 */}
      <section className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm">
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 mb-3">
          <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 uppercase tracking-wider">
            <Terminal className="w-4 h-4 text-slate-700" />
            API 接入文档
          </h4>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(details.apiDoc);
              toast.success("API 示例已复制到剪贴板！");
            }}
            className="text-xs text-[#3182ce] bg-blue-50/50 hover:bg-blue-50 border border-blue-100/60 hover:border-blue-200 px-2.5 py-0.5 rounded flex items-center gap-1 font-bold cursor-pointer transition-colors"
            title="一键复制 API 接口接入规范"
          >
            <Copy className="w-2.5 h-2.5" />
            <span>复制示例</span>
          </button>
        </div>
        <pre className="p-3 bg-slate-50 border border-slate-200/60 rounded-lg text-xs text-slate-700 font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap text-left">
          {details.apiDoc}
        </pre>
      </section>

      {/* 4. 常见问题 (FAQ) */}
      {details.faq.length > 0 && (
      <section className="bg-white rounded-2xl p-5 border border-slate-200/60 shadow-sm">
        <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2 pb-2.5 border-b border-slate-100 mb-3 uppercase tracking-wider">
          <HelpCircle className="w-4 h-4 text-amber-500" />
          常见问题问答
        </h4>
        <div className="space-y-4">
          {details.faq.map((item, idx) => (
            <div key={idx} className="space-y-1">
              <div className="text-xs font-bold text-slate-800 flex items-start gap-1">
                <span className="text-amber-500 font-extrabold">Q:</span>
                <span>{item.q}</span>
              </div>
              <div className="text-xs text-slate-500 font-semibold leading-relaxed pl-4">
                {item.a}
              </div>
            </div>
          ))}
        </div>
      </section>
      )}
    </div>
  );
}
