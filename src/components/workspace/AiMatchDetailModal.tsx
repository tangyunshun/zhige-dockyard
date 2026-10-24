"use client";

/**
 * AiMatchDetailModal —— 工作空间「AI 匹配组件详情」弹窗（展示层）
 *
 * 来源区块：WorkspaceInternalLayoutV3.tsx 的 {aiMatchDetailModal && (...)} 整段 JSX
 * 拆分日期：2026-10-25（V3 拆分第 5 步）
 *
 * 本组件只做展示：组件详情数据（detail = aiMatchDetailModal）、分类名表
 * （componentCategories）、"使用该组件" 的执行态（isExecutingTask）与执行动作
 * （handleRunMatchedComponent）均由父组件 V3 通过 props 传入；关闭动作统一走 onClose。
 */

import { Box } from "lucide-react";
import type { ComponentCategory, ComponentDefinition } from "@/constants/components";

export interface AiMatchDetailModalProps {
  onClose: () => void;
  detail: ComponentDefinition | null;
  componentCategories: Record<string, { name?: string }>;
  isExecutingTask: boolean;
  handleRunMatchedComponent: (comp: ComponentDefinition) => void;
}

export default function AiMatchDetailModal(props: AiMatchDetailModalProps) {
  const { onClose, detail, componentCategories, isExecutingTask, handleRunMatchedComponent } = props;
  if (!detail) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200 font-sans">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[85vh] shadow-2xl border border-slate-100 flex flex-col min-h-0 overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
              <Box className="w-4 h-4 text-[#3182ce]" />
              组件详情
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              请确认该组件是否符合您的任务需求
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-700 font-black flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1 space-y-4 custom-scrollbar">
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">组件编号</div>
            <div className="text-xs font-mono font-bold text-slate-700">{detail.id}</div>
          </div>
          <div className="space-y-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">组件名称</div>
            <div className="text-sm font-black text-slate-900">{detail.name}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-blue-50 text-[#3182ce] border border-blue-100 rounded-lg text-[10px] font-bold">
              {componentCategories[detail.category as ComponentCategory]?.name || detail.category}
            </span>
            <span className="px-2 py-1 bg-slate-100 text-slate-600 border border-slate-200 rounded-lg text-[10px] font-bold">
              输入方式: {detail.inputMode === "file" ? "文件" : detail.inputMode === "both" ? "文本/文件" : "文本"}
            </span>
            <span className="px-2 py-1 bg-amber-50 text-amber-600 border border-amber-100 rounded-lg text-[10px] font-bold">
              预估模型 Token: {detail.estimatedModelTokens || 0} Token（非算力点）
            </span>
          </div>
          {/* 以下内容 100% 来自数据库 component_catalog.detail 字段 */}
          {(() => {
            const d = detail.detail;
            if (!d || !d.fullDescription) {
              return (
                <div className="text-xs font-medium text-slate-400 text-center py-4">
                  该组件暂未在数据库中配置详情内容
                </div>
              );
            }
            return (
              <>
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">组件简介</div>
                  <div className="text-xs font-medium text-slate-600 leading-relaxed whitespace-pre-wrap">{detail.description}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">需求分析</div>
                  <div className="text-xs font-medium text-slate-600 leading-relaxed whitespace-pre-wrap">{d.fullDescription}</div>
                </div>
                {d.usage && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">使用操作指南</div>
                    <div className="space-y-1">
                      {String(d.usage).split("\n").filter(Boolean).map((line, i) => (
                        <p key={i} className="text-xs font-medium text-slate-600 leading-relaxed">{line}</p>
                      ))}
                    </div>
                  </div>
                )}
                {d.apiDoc && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">API 接入文档</div>
                    <pre className="p-2.5 bg-slate-50 border border-slate-200/60 rounded-lg text-[11px] text-slate-700 font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap">
                      {d.apiDoc}
                    </pre>
                  </div>
                )}
                {Array.isArray(d.faq) && d.faq.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">常见问题</div>
                    <div className="space-y-2.5">
                      {d.faq.map((item, i) => (
                        <div key={i} className="space-y-0.5">
                          <div className="text-xs font-bold text-slate-800 flex items-start gap-1">
                            <span className="text-amber-500 font-extrabold">Q:</span>
                            <span>{item.q}</span>
                          </div>
                          <div className="text-xs text-slate-500 font-semibold leading-relaxed pl-4">{item.a}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {detail.tags?.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">标签</div>
                    <div className="flex flex-wrap gap-1.5">
                      {detail.tags.map((tag, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl cursor-pointer transition-all"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={() => {
              const comp = detail;
              onClose();
              handleRunMatchedComponent(comp);
            }}
            disabled={isExecutingTask}
            className="px-4 py-2 bg-[#3182ce] hover:bg-[#2b6cb0] disabled:bg-slate-300 text-white text-xs font-bold rounded-xl cursor-pointer transition-all"
          >
            {isExecutingTask ? "处理中..." : "使用该组件"}
          </button>
        </div>
      </div>
    </div>
  );
}
