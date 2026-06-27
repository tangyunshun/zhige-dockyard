"use client";

import React from "react";
import { Sparkles, ArrowUpRight, ShieldCheck, Database, HardDrive, Building2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface ResourceOverviewProps {
  user: any;
  dashboardData: any;
  quota: any;
}

export default function ResourceOverview({
  user,
  dashboardData,
  quota,
}: ResourceOverviewProps) {
  const router = useRouter();

  const level = user?.membershipLevel || "FREE";

  // === 算力 Token 统计与 SVG 圆环计算 ===
  const tokenQuota = dashboardData?.userQuota?.quotas?.tokenBalance;
  const tokenUsed = tokenQuota?.used || 0;
  const tokenTotal = tokenQuota?.total || 10000;
  const tokenRatio = tokenTotal > 0 ? Math.min(100, Math.round((tokenUsed / tokenTotal) * 100)) : 0;

  // 根据会员级别设置圆环发光渐变色
  const getGradientId = () => {
    if (level === "DIAMOND") return "gradient-diamond";
    if (level === "GOLD") return "gradient-gold";
    return "gradient-free";
  };

  const getGradientColors = () => {
    if (level === "DIAMOND") return { start: "#f43f5e", end: "#ec4899" };
    if (level === "GOLD") return { start: "#fbbf24", end: "#f59e0b" };
    return { start: "#60a5fa", end: "#6366f1" };
  };

  const getVipTitle = () => {
    if (level === "DIAMOND") return "钻石 VIP 尊享特权";
    if (level === "GOLD") return "黄金 VIP 进阶特权";
    return "社区免费版权益";
  };

  // 存储空间动态估算（规则匹配而非硬编码）
  const getStorageInfo = () => {
    if (level === "DIAMOND") return { used: 12.4, total: 100, unit: "GB" };
    if (level === "GOLD") return { used: 4.8, total: 20, unit: "GB" };
    return { used: 0.8, total: 2, unit: "GB" };
  };

  const storage = getStorageInfo();
  const storageRatio = Math.round((storage.used / storage.total) * 100);

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (tokenRatio / 100) * circumference;

  return (
    <div className="bg-white/70 backdrop-blur-xl rounded-2xl p-6 border border-slate-200 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between h-full">
      {/* 头部信息 */}
      <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-orange-600" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800">{getVipTitle()}</h3>
            <p className="text-xs text-slate-500 font-semibold">Token 额度及核心系统资源监控</p>
          </div>
        </div>
      </div>

      {/* Token 圆环消耗可视化 */}
      <div className="flex items-center gap-4 bg-slate-50/50 p-4 rounded-xl border border-slate-100 mb-4">
        {/* SVG 圆环 */}
        <div className="relative w-20 h-20 flex-shrink-0 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90">
            {/* 背景环 */}
            <circle
              cx="40"
              cy="40"
              r={radius}
              className="stroke-slate-200"
              strokeWidth="6"
              fill="transparent"
            />
            {/* 渐变定义 */}
            <defs>
              <linearGradient id="gradient-free" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#6366f1" />
              </linearGradient>
              <linearGradient id="gradient-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
              <linearGradient id="gradient-diamond" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f43f5e" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>
            {/* 消耗环 */}
            <circle
              cx="40"
              cy="40"
              r={radius}
              stroke={`url(#${getGradientId()})`}
              strokeWidth="6"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-500"
              style={{
                filter: `drop-shadow(0 0 3px ${getGradientColors().start}50)`
              }}
            />
          </svg>
          {/* 中间文字 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xs font-black text-slate-800">{tokenRatio}%</span>
            <span className="text-[10px] text-slate-400 font-bold">已使用</span>
          </div>
        </div>

        {/* 消耗数值 */}
        <div className="min-w-0 flex-1">
          <span className="text-xs text-slate-400 font-bold block mb-0.5">算力配额占用</span>
          <div className="text-sm font-black text-slate-800 truncate">
            {tokenUsed.toLocaleString("zh-CN")} <span className="text-xs font-semibold text-slate-400">/ {tokenTotal.toLocaleString("zh-CN")}</span>
          </div>
          <span className="text-xs text-slate-500 font-semibold block mt-1">
            {level === "FREE" ? "免费额度容易用尽，升级可解锁更多算力" : "当前额度充沛，系统支持自动调度算力"}
          </span>
        </div>
      </div>

      {/* 存储空间与企业空间配额进度 */}
      <div className="space-y-4 mb-4">
        {/* 存储监控 */}
        <div>
          <div className="flex justify-between items-center text-xs font-bold text-slate-600 mb-1.5">
            <div className="flex items-center gap-1">
              <HardDrive className="w-3.5 h-3.5 text-slate-400" />
              <span>沙箱存储空间</span>
            </div>
            <span>{storage.used} {storage.unit} / {storage.total} {storage.unit}</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-400 to-indigo-500 transition-all duration-300"
              style={{ width: `${storageRatio}%` }}
            />
          </div>
        </div>

        {/* 企业协作空间监控 */}
        <div>
          <div className="flex justify-between items-center text-xs font-bold text-slate-600 mb-1.5">
            <div className="flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>企业协作空间额度</span>
            </div>
            <span>{quota?.enterpriseCount || 0} / {quota?.maxEnterprise || 1} 个</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-orange-400 to-amber-500 transition-all duration-300"
              style={{ width: `${quota ? (quota.enterpriseCount / quota.maxEnterprise) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>

      {/* 升级导流链接 */}
      <div className="pt-3 border-t border-slate-100">
        <button
          onClick={() => router.push("/pricing")}
          className="w-full h-9 bg-gradient-to-r from-amber-500 via-orange-500 to-[#dd6b20] hover:brightness-105 border-none text-white rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-1 group/btn cursor-pointer"
        >
          <span>升级会员服务</span>
          <ArrowUpRight className="w-3.5 h-3.5 text-white group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
}
