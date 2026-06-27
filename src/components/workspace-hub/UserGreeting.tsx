"use client";

import React from "react";
import { Sparkles, ShoppingBag } from "lucide-react";
import { useRouter } from "next/navigation";

interface UserGreetingProps {
  user: any;
}

export default function UserGreeting({ user }: UserGreetingProps) {
  const router = useRouter();

  // 根据会员等级获取不同徽章颜色和文案
  const getVipBadge = () => {
    const level = user?.membershipLevel || "FREE";
    if (level === "DIAMOND") {
      return (
        <span className="px-2.5 py-0.5 text-[10px] font-black rounded bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-sm flex items-center gap-1 animate-pulse">
          <Sparkles className="w-3 h-3" />
          <span>钻石会员版</span>
        </span>
      );
    }
    if (level === "GOLD") {
      return (
        <span className="px-2.5 py-0.5 text-[10px] font-black rounded bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          <span>黄金会员版</span>
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-600 border border-slate-200">
        社区免费版
      </span>
    );
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white/70 backdrop-blur-xl border border-slate-200 shadow-md rounded-2xl relative overflow-hidden group">
      {/* 发光斑斑特效 */}
      <div className="absolute -right-10 -top-10 w-40 h-40 bg-[#3182ce]/5 rounded-full blur-3xl group-hover:bg-[#3182ce]/10 transition-all duration-500" />
      
      <div className="space-y-2 relative z-10">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-lg font-black text-slate-800 tracking-tight">
            👋 欢迎回来，{user?.name || "极客"}
          </h2>
          {getVipBadge()}
        </div>
        <p className="text-xs text-slate-500 font-medium leading-relaxed md:whitespace-nowrap">
          在这里，您可以统一管理个人沙箱环境与企业协作空间、实时感知 Token 算力分配，并极速开启组件研发与事件订阅。
        </p>
      </div>
      
      <button 
        onClick={() => router.push("/studio")}
        className="zg-btn zg-btn-primary px-4 py-2 h-9 text-xs rounded-lg flex items-center gap-1.5 hover:shadow-lg hover:shadow-blue-500/20 hover:-translate-y-0.5 transition-all self-start sm:self-auto cursor-pointer relative z-10"
      >
        <ShoppingBag className="w-3.5 h-3.5" />
        <span>进入组件大厅</span>
      </button>
    </div>
  );
}
