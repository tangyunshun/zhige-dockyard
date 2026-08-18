"use client";

import React from "react";
import { Cpu, ArrowUpRight, HardDrive, Building2 } from "lucide-react";
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

  // 根据会员级别设置圆环颜色 (唯一真理系统 V6.0 配色体系)
  const getGradientId = () => {
    if (level === "DIAMOND") return "gradient-diamond";
    if (level === "GOLD") return "gradient-gold";
    return "gradient-free";
  };

  const getVipTitle = () => {
    return "资源额度";
  };

  // 存储空间动态估算
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
    <div className="bg-white/80 border border-white/90 rounded-[20px] p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between h-full text-left">
      {/* 头部信息 */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200/60">
        <div className="flex items-center gap-2">
          {/* 金色/橙色高质感指示图标 */}
          <div className="w-7.5 h-7.5 rounded bg-orange-50 border border-orange-100 flex items-center justify-center shadow-sm">
            <Cpu className="w-4 h-4 text-orange-500" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-700">{getVipTitle()}</h3>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">Token 与存储空间监控</p>
          </div>
        </div>
        
        {/* 升级额度右上角小文字链 */}
        <button
          onClick={() => router.push("/pricing")}
          className="text-xs font-bold text-[#2b6cb0] hover:text-[#2563eb] transition-colors cursor-pointer flex items-center gap-0.5"
        >
          <span>提升配额</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Token 圆环消耗可视化 */}
      <div className="flex items-center gap-4 bg-slate-50/50 p-4 rounded-lg border border-slate-100 mb-4">
        {/* SVG 圆环 */}
        <div className="relative w-20 h-20 flex-shrink-0 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90">
            {/* 背景环 */}
            <circle
              cx="40"
              cy="40"
              r={radius}
              className="stroke-slate-200"
              strokeWidth="5"
              fill="transparent"
            />
            {/* 渐变定义 (V6.0 绚丽多色系配置) */}
            <defs>
              <linearGradient id="gradient-free" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#60a5fa" />
                <stop offset="100%" stopColor="#3b82f6" />
              </linearGradient>
              <linearGradient id="gradient-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#fbbf24" />
                <stop offset="100%" stopColor="#d97706" />
              </linearGradient>
              <linearGradient id="gradient-diamond" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>
            {/* 消耗环 */}
            <circle
              cx="40"
              cy="40"
              r={radius}
              stroke={`url(#${getGradientId()})`}
              strokeWidth="5"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          {/* 中间文字 */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-sm font-extrabold text-slate-800">{tokenRatio}%</span>
            <span className="text-[10px] text-slate-400 font-bold leading-none mt-0.5">已使用</span>
          </div>
        </div>

        {/* 消耗数值 */}
        <div className="min-w-0 flex-1">
          <span className="text-xs text-slate-400 font-bold block mb-1">Token 消耗</span>
          <div className="text-sm font-bold text-slate-800 truncate leading-none">
            {tokenUsed.toLocaleString("zh-CN")} <span className="text-xs font-semibold text-slate-400">/ {tokenTotal.toLocaleString("zh-CN")}</span>
          </div>
          <span className="text-xs text-slate-400 font-semibold block mt-1.5 leading-normal">
            {level === "FREE" ? "额度用尽后可提升套餐" : "当前配额充沛"}
          </span>
        </div>
      </div>

      {/* 存储空间与企业空间配额进度 (系统标准的蓝、橙双色渐变，极具呼吸感) */}
      <div className="space-y-4">
        {/* 存储监控 (蓝色渐变) */}
        <div>
          <div className="flex justify-between items-center text-xs font-bold text-slate-500 mb-1.5">
            <div className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-slate-400" />
              <span>沙箱存储空间</span>
            </div>
            <span>{storage.used} {storage.unit} / {storage.total} {storage.unit}</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-blue-400 to-[#3182ce] transition-all duration-300"
              style={{ width: `${storageRatio}%` }}
            />
          </div>
        </div>

        {/* 企业协作空间监控 (橙黄渐变) */}
        <div>
          <div className="flex justify-between items-center text-xs font-bold text-slate-500 mb-1.5">
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>企业协作空间配额</span>
            </div>
            <span>{quota?.enterpriseCount || 0} / {quota?.maxEnterprise || 1} 个</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-orange-400 to-[#dd6b20] transition-all duration-300"
              style={{ width: `${quota ? (quota.enterpriseCount / quota.maxEnterprise) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
