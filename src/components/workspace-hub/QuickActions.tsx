"use client";

import React from "react";
import { 
  Terminal, 
  ExternalLink,
  HelpCircle
} from "lucide-react";

interface QuickActionsProps {
  onJoinClick?: () => void;
}

export default function QuickActions(_props: QuickActionsProps) {
  return (
    <div className="bg-white/80 border border-white/90 rounded-[20px] p-5 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col gap-3.5 text-left">
      
      {/* 头部 */}
      <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/60">
        <div className="flex items-center gap-2">
          {/* 系统蓝色系指示图标 */}
          <div className="w-7.5 h-7.5 rounded bg-blue-50/80 border border-blue-100 flex items-center justify-center text-[#2b6cb0] shadow-sm">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-700 tracking-tight">快捷工具</h3>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">接入与开发者辅助</p>
          </div>
        </div>
      </div>

      {/* 辅助链接 */}
      <div className="space-y-2">
        {/* 1. API 文档 */}
        <a
          href="/docs"
          className="flex items-center justify-between p-2.5 bg-white hover:bg-slate-50 border border-slate-200/50 rounded-lg text-left transition-all duration-300 group"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7.5 h-7.5 rounded bg-blue-50/50 text-[#2b6cb0] flex items-center justify-center shrink-0 border border-blue-100/50">
              <Terminal className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-bold text-slate-700 group-hover:text-[#2b6cb0] transition-colors block truncate leading-none">开发者 API 文档</span>
              <span className="text-xs text-slate-400 font-semibold block truncate mt-1.5 leading-none">查询 Open API 与鉴权流程</span>
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-500 transition-colors shrink-0 ml-2" />
        </a>

        {/* 2. Webhooks 订阅 */}
        <a
          href="/settings/webhooks"
          className="flex items-center justify-between p-2.5 bg-white hover:bg-slate-50 border border-slate-200/50 rounded-lg text-left transition-all duration-300 group"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7.5 h-7.5 rounded bg-indigo-50/50 text-indigo-500 flex items-center justify-center shrink-0 border border-indigo-100/50">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-sm font-bold text-slate-700 group-hover:text-indigo-600 transition-colors block truncate leading-none">Webhooks 事件订阅</span>
              <span className="text-xs text-slate-400 font-semibold block truncate mt-1.5 leading-none">实现组件研发状态实时同步</span>
            </div>
          </div>
          <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors shrink-0 ml-2" />
        </a>
      </div>
    </div>
  );
}
