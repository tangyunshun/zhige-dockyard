"use client";

import React from "react";
import { 
  KeyRound, 
  Terminal, 
  ExternalLink,
  HelpCircle,
  ShoppingBag
} from "lucide-react";
import { useRouter } from "next/navigation";

interface QuickActionsProps {
  onJoinClick: () => void;
}

export default function QuickActions({
  onJoinClick,
}: QuickActionsProps) {
  const router = useRouter();

  return (
    <div className="bg-gradient-to-br from-white/90 via-slate-50/90 to-blue-50/30 backdrop-blur-xl rounded-2xl p-6 border border-slate-200 shadow-md hover:shadow-xl hover:border-[#2b6cb0]/15 transition-all duration-500 flex flex-col gap-4 text-left relative overflow-hidden">
      {/* 装饰渐变光晕 */}
      <div className="absolute top-0 right-0 w-[50%] h-[50%] bg-blue-500/[0.02] rounded-full blur-[40px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[50%] h-[50%] bg-indigo-500/[0.02] rounded-full blur-[40px] pointer-events-none" />

      {/* 头部 */}
      <div className="relative z-10 flex items-center justify-between pb-3 border-b border-slate-200/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8.5 h-8.5 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 flex items-center justify-center shadow-sm">
            <Terminal className="w-4.5 h-4.5 text-[#2b6cb0]" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 tracking-tight">快捷开发通道</h3>
            <p className="text-[11px] text-slate-400 font-bold mt-0.5">快速接入与开发者辅助工具</p>
          </div>
        </div>
      </div>

      {/* 核心快捷操作卡片 */}
      <div className="relative z-10 grid grid-cols-2 gap-3.5 mt-1">
        <button
          onClick={onJoinClick}
          data-action="join-invitation"
          className="flex flex-col items-center justify-center py-5 px-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-200 rounded-xl transition-all duration-300 cursor-pointer group text-center shadow-sm hover:shadow-md hover:-translate-y-0.5"
        >
          <div className="w-10 h-10 rounded-full bg-blue-50/80 group-hover:bg-blue-100/80 flex items-center justify-center mb-2.5 transition-colors">
            <KeyRound className="w-5 h-5 text-[#2b6cb0] group-hover:text-blue-600 transition-colors" />
          </div>
          <span className="text-xs font-black text-slate-700 group-hover:text-[#2b6cb0] transition-colors">邀请码加入</span>
          <span className="text-[10px] text-slate-400 font-bold mt-1">加入已有协作空间</span>
        </button>

        <button
          onClick={() => router.push("/studio")}
          className="flex flex-col items-center justify-center py-5 px-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-blue-200 rounded-xl transition-all duration-300 cursor-pointer group text-center shadow-sm hover:shadow-md hover:-translate-y-0.5"
        >
          <div className="w-10 h-10 rounded-full bg-indigo-50/80 group-hover:bg-indigo-100/80 flex items-center justify-center mb-2.5 transition-colors">
            <ShoppingBag className="w-5 h-5 text-indigo-500 group-hover:text-indigo-600 transition-colors" />
          </div>
          <span className="text-xs font-black text-slate-700 group-hover:text-indigo-600 transition-colors">组件大厅</span>
          <span className="text-[10px] text-slate-400 font-bold mt-1">浏览并分发系统组件</span>
        </button>
      </div>

      {/* 开发者辅助高级卡片链接 */}
      <div className="relative z-10 space-y-3 mt-1">
        {/* 1. API 文档 */}
        <a
          href="/docs"
          className="flex items-center justify-between p-3.5 bg-white/70 hover:bg-white border border-slate-200 hover:border-blue-300 hover:shadow-md rounded-xl text-left transition-all duration-300 group hover:-translate-y-0.5"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-9.5 h-9.5 rounded-lg bg-blue-50 text-[#2b6cb0] flex items-center justify-center shrink-0 border border-blue-100/50">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-black text-slate-700 group-hover:text-blue-700 transition-colors block">开发者 API 在线文档</span>
              <span className="text-[10px] text-slate-400 font-bold mt-1 block leading-normal">快速查询 Open API、系统集成与鉴权流程</span>
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors shrink-0 ml-2" />
        </a>

        {/* 2. Webhooks 订阅 */}
        <a
          href="/settings/webhooks"
          className="flex items-center justify-between p-3.5 bg-white/70 hover:bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-md rounded-xl text-left transition-all duration-300 group hover:-translate-y-0.5"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-9.5 h-9.5 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0 border border-indigo-100/50">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-black text-slate-700 group-hover:text-indigo-600 transition-colors block">Webhooks 事件推送订阅</span>
              <span className="text-[10px] text-slate-400 font-bold mt-1 block leading-normal">配置事件订阅，实现组件研发状态实时同步</span>
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors shrink-0 ml-2" />
        </a>
      </div>
    </div>
  );
}
