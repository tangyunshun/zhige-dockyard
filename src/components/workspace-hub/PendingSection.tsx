"use client";

import React from "react";
import { Clock, Check, X, ShieldAlert } from "lucide-react";

interface PendingItem {
  id: string;
  type: "INVITATION" | "UPGRADE_APPLICATION";
  title: string;
  description: string;
  createdAt: string;
  workspaceName?: string;
  invitationCode?: string;
}

interface PendingSectionProps {
  pendingItems: PendingItem[] | undefined;
  onAcceptInvitation?: (code: string) => void;
  onRejectInvitation?: (id: string) => void;
}

export default function PendingSection({
  pendingItems,
  onAcceptInvitation,
  onRejectInvitation,
}: PendingSectionProps) {
  if (!pendingItems || pendingItems.length === 0) return null;

  return (
    <div className="relative group bg-white/70 backdrop-blur-xl rounded-2xl p-6 border border-slate-200 shadow-md hover:shadow-xl transition-all duration-300">
      {/* 头部 */}
      <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-slate-100">
        <div className="w-1.5 h-4 bg-gradient-to-b from-red-500 to-red-500 rounded-full" />
        <h3 className="text-sm font-black text-slate-800 flex items-center gap-1.5">
          <span>待处理事项</span>
          <span className="px-1.5 py-0.2 bg-red-100 text-red-500 text-[9px] font-black rounded-lg">
            {pendingItems.length}
          </span>
        </h3>
      </div>

      {/* 列表项 */}
      <div className="space-y-3">
        {pendingItems.map((item) => (
          <div
            key={item.id}
            className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:bg-slate-100/50"
          >
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <ShieldAlert className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-slate-800 truncate">{item.title}</h4>
                <p className="text-[10px] text-slate-500 font-semibold mt-1 leading-relaxed">
                  {item.description}
                </p>
                <span className="text-[9px] text-slate-400 font-medium flex items-center gap-1 mt-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>收到于 {new Date(item.createdAt).toLocaleString("zh-CN")}</span>
                </span>
              </div>
            </div>

            {/* 接受 / 拒绝交互动作 */}
            {item.type === "INVITATION" && item.invitationCode && (
              <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                <button
                  onClick={() => onAcceptInvitation?.(item.invitationCode!)}
                  className="px-3 py-1.5 bg-[#10b981] hover:bg-[#059669] text-white text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 active:scale-95 border-none"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>接受</span>
                </button>
                <button
                  onClick={() => onRejectInvitation?.(item.id)}
                  className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 active:scale-95 border-none"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>忽略</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
