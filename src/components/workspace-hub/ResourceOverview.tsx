"use client";

import React from "react";
import { Layers, ArrowUpRight, HardDrive, Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { UpgradeHighlight } from "./modals/QuotaUpgradeModal";

interface ResourceOverviewProps {
  user: any;
  dashboardData: any;
  quota: any;
  /** 唤起统一升级中枢，入参用于锚定需要高亮的权益维度 */
  onUpgrade?: (highlight: UpgradeHighlight) => void;
}

export default function ResourceOverview({
  user,
  dashboardData,
  quota,
  onUpgrade,
}: ResourceOverviewProps) {
  const router = useRouter();

  const level = user?.membershipLevel || "FREE";

  // === 算力 Token 统计与 SVG 圆环计算 ===
  const tokenQuota = dashboardData?.userQuota?.quotas?.tokenBalance;
  const tokenUsed = tokenQuota?.used || 0;
  // 无限额度（total = -1）：不进入比率计算，单独标记
  const tokenUnlimited = (tokenQuota?.total ?? 0) === -1;
  const tokenTotal = tokenUnlimited ? -1 : (tokenQuota?.total || 10000);
  const tokenRatio = tokenUnlimited ? 0 : (tokenTotal > 0 ? Math.min(100, Math.round((tokenUsed / tokenTotal) * 100)) : 0);

  // 根据会员级别设置圆环颜色 (唯一真理系统 V6.0 配色体系)
  const getGradientId = () => {
    if (level === "DIAMOND") return "gradient-diamond";
    if (level === "GOLD") return "gradient-gold";
    return "gradient-free";
  };

  const getVipTitle = () => {
    return "资源额度";
  };

  // 存储空间：真实用量（dashboard 聚合 workspacequota 提供），无数据时以配额上限兜底
  const storageUsed = dashboardData?.userQuota?.quotas?.storageUsed || 0;
  const storageTotal = dashboardData?.userQuota?.quotas?.storageLimit || 1073741824;
  const storage = { used: storageUsed, total: storageTotal, unit: "GB" };
  const storageRatio = storage.total > 0 ? Math.min(100, Math.round((storage.used / storage.total) * 100)) : 0;

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (tokenRatio / 100) * circumference;

  /**
   * 智能锚定：优先高亮最紧迫的瓶颈维度。
   * - 企业空间数量已满 ➔ 锚定空间数量
   * - 算力使用率 >= 80% ➔ 锚定算力 Token
   * - 其余情况展示权益全景
   */
  const resolveHighlight = (): UpgradeHighlight => {
    const workspaceFull =
      quota && quota.maxEnterprise !== -1 && quota.enterpriseCount >= quota.maxEnterprise;
    if (workspaceFull) return "workspace";
    if (tokenRatio >= 80) return "token";
    return null;
  };

  const handleUpgradeClick = () => {
    if (onUpgrade) {
      onUpgrade(resolveHighlight());
    } else {
      router.push("/pricing");
    }
  };

  return (
    <div className="bg-white/80 border border-white/90 rounded-[20px] p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col justify-between h-full text-left">
      {/* 头部信息 */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200/60">
        <div className="flex items-center gap-2">
          {/* 金色/橙色高质感指示图标 */}
          <div className="w-7.5 h-7.5 rounded bg-amber-50 border border-amber-100 flex items-center justify-center shadow-sm">
            <Layers className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-700">{getVipTitle()}</h3>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">调用额度与存储空间监控</p>
          </div>
        </div>
        
        {/* 升级会员套餐右上角小文字链（账号级订阅，与空间级套餐区分） */}
        <button
          onClick={handleUpgradeClick}
          className="text-xs font-bold text-[#2b6cb0] hover:text-[#3182ce] transition-colors cursor-pointer flex items-center gap-0.5 border-none bg-transparent"
        >
          <span>升级会员套餐</span>
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
                <stop offset="0%" stopColor="#63b3ed" />
                <stop offset="100%" stopColor="#3182ce" />
              </linearGradient>
              <linearGradient id="gradient-gold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#d97706" />
              </linearGradient>
              <linearGradient id="gradient-diamond" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b981" />
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
          <span className="text-xs text-slate-400 font-bold block mb-1">本月算力 Token</span>
          <div className="text-sm font-bold text-slate-800 truncate leading-none">
            {tokenUsed.toLocaleString("zh-CN")} <span className="text-xs font-semibold text-slate-400">/ {tokenUnlimited ? "无限" : tokenTotal.toLocaleString("zh-CN")}</span>
          </div>
          <span className="text-xs text-slate-400 font-semibold block mt-1.5 leading-normal">
            {level === "FREE" ? "算力不足时可升级会员套餐" : tokenUnlimited ? "当前算力无限制" : "当前算力充沛"}
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
            <span>{(storage.used / 1073741824).toFixed(1)} {storage.unit} / {(storage.total / 1073741824).toFixed(1)} {storage.unit}</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[#63b3ed] to-[#3182ce] transition-all duration-300"
              style={{ width: `${storageRatio}%` }}
            />
          </div>
        </div>

        {/* 企业协作空间监控 (橙黄渐变) */}
        <div>
          <div className="flex justify-between items-center text-xs font-bold text-slate-500 mb-1.5">
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>企业空间数量</span>
            </div>
            <span>{quota?.enterpriseCount || 0} / {quota?.maxEnterprise || 1} 个</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[#f59e0b] to-[#d97706] transition-all duration-300"
              style={{ width: `${quota ? (quota.enterpriseCount / quota.maxEnterprise) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
