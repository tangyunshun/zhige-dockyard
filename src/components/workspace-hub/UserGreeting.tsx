"use client";

import React from "react";
import { Crown } from "lucide-react";

interface UserGreetingProps {
  user: any;
  personalWorkspace?: any;
  needsPersonalWorkspace?: boolean;
  onEnterPersonal?: () => void;
  onCreatePersonal?: () => void;
}

export default function UserGreeting({
  user,
}: UserGreetingProps) {
  // 根据会员等级获取不同徽章颜色和文案 (字号规范为 12px)
  const getVipBadge = () => {
    const level = user?.membershipLevel || "FREE";
    if (level === "DIAMOND") {
      return (
        <span className="px-2.5 py-1 text-xs font-bold rounded bg-slate-800 text-white shadow-sm flex items-center gap-1 shrink-0">
          <Crown className="w-3.5 h-3.5" />
          <span>钻石会员版</span>
        </span>
      );
    }
    if (level === "GOLD") {
      return (
        <span className="px-2.5 py-1 text-xs font-bold rounded bg-amber-500 text-white shadow-sm flex items-center gap-1 shrink-0">
          <Crown className="w-3.5 h-3.5" />
          <span>黄金会员版</span>
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 text-xs font-bold rounded bg-slate-100 text-slate-500 border border-slate-200/50 shrink-0">
        社区免费版
      </span>
    );
  };

  return (
    <div className="p-6 bg-white/70 backdrop-blur-xl border border-white/90 shadow-sm rounded-[20px] text-left relative overflow-hidden group">
      {/* 极轻透背景装饰 */}
      <div className="absolute top-0 right-0 w-36 h-36 bg-[#3182ce]/[0.01] rounded-full blur-2xl pointer-events-none" />
      
      <div className="space-y-2 relative z-10">
        {/* 用户名与会员等级 */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="text-base font-extrabold text-slate-800 tracking-tight">
            👋 欢迎回来，{user?.name || "极客"}
          </h2>
          {getVipBadge()}
        </div>
        
        {/* 纯净宣言 (拿掉“效能宣言”这四个字，仅输出话语) */}
        <p className="text-xs text-slate-500 font-semibold leading-relaxed max-w-3xl">
          每一次组件构建，都是对软件开发工程边界的一次大胆拓荒。工作空间已成功就绪，祝您今天工作愉快！
        </p>
      </div>
    </div>
  );
}
