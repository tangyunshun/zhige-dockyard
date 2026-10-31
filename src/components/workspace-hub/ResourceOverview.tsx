"use client";

import React from "react";
import { Layers, ArrowUpRight, HardDrive, Building2, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { UpgradeHighlight } from "./modals/QuotaUpgradeModal";

interface ResourceOverviewProps {
  user: any;
  dashboardData: any;
  quota: any;
  /** 唤起统一升级中枢，入参用于锚定需要高亮的权益维度 */
  onUpgrade?: (highlight: UpgradeHighlight) => void;
  /** 唤起当前页内充值弹窗（优先于 rechargeHref 链接跳转） */
  onRecharge?: () => void;
  /** 充值入口链接（由页面层显式传入，便于审计与复用登录态判断） */
  rechargeHref?: string;
  /** 是否渲染充值按钮：由页面层基于登录态控制（未登录不渲染） */
  showRecharge?: boolean;
}

export default function ResourceOverview({
  user,
  dashboardData,
  quota,
  onUpgrade,
  onRecharge,
  rechargeHref = "/user/pay",
  showRecharge = false,
}: ResourceOverviewProps) {
  const router = useRouter();

  const level = user?.membershipLevel || "FREE";

  // === 算力点统计与 SVG 圆环计算（余额制：不再有“会员每月配额上限”，展示可用余额剩余率） ===
  const tokenQuota = dashboardData?.userQuota?.quotas?.tokenBalance;
  const tokenHistoryUsed = tokenQuota?.historyTotalUsed ?? tokenQuota?.used ?? 0;
  // 累计过期：赠送到期清零的额度（与流水「过期」分类一致）
  const tokenTotalExpired = tokenQuota?.totalExpired ?? 0;
  // 无限额度（total = -1）：不进入比率计算，单独标记
  const tokenUnlimited = (tokenQuota?.total ?? 0) === -1;
  const tokenAvailable = tokenUnlimited ? -1 : Math.max(tokenQuota?.available ?? 0, 0);
  // 剩余率 = 可用余额 /（可用余额 + 历史累计消耗），余额耗尽时归零便于提示充值
  const tokenDenominator = tokenAvailable + tokenHistoryUsed;
  const tokenRatio =
    tokenUnlimited || tokenDenominator <= 0
      ? 100
      : Math.min(100, Math.round((tokenAvailable / tokenDenominator) * 100));

  // 根据会员级别设置圆环颜色 (唯一真理系统 V6.0 配色体系)
  const getGradientId = () => {
    if (level === "DIAMOND") return "gradient-diamond";
    if (level === "GOLD") return "gradient-gold";
    return "gradient-free";
  };

  const getVipTitle = () => {
    return "资源额度";
  };

  // 存储空间：真实用量与上限（dashboard 聚合 workspacequota 提供，无模拟兜底；无上限数据时展示 —）
  const storageUsed = dashboardData?.userQuota?.quotas?.storageUsed || 0;
  const storageTotal = dashboardData?.userQuota?.quotas?.storageLimit || 0;
  const storage = { used: storageUsed, total: storageTotal, unit: "GB" };
  const storageRatio = storage.total > 0 ? Math.min(100, Math.round((storage.used / storage.total) * 100)) : 0;

  // 企业空间配额：-1 表示无限制，不进入比率计算
  const enterpriseCount = quota?.enterpriseCount ?? 0;
  const enterpriseMax = quota?.maxEnterprise ?? 0;
  const enterpriseUnlimited = enterpriseMax === -1;
  const enterpriseRatio = enterpriseUnlimited
    ? 0
    : enterpriseMax > 0
      ? Math.min(100, Math.round((enterpriseCount / enterpriseMax) * 100))
      : 0;

  // 真实口径提示：优先展示企业共享池事实，其次会员无限，再其次免费注册福利；不再使用“算力充沛”等无信息量文案
  const tokenHint =
    tokenQuota?.ownedEnterpriseTokens > 0
      ? `已统筹企业共享池 ${tokenQuota.ownedEnterpriseTokens.toLocaleString("zh-CN")} 算力点，双端通用`
      : tokenUnlimited
        ? "当前会员享有无限算力"
        : level === "FREE"
          ? "注册福利：前 3 个月每月 100 点（当月有效），用尽请充值"
          : "余额即充即用，用尽请充值或申请提升额度";

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (tokenRatio / 100) * circumference;

  /**
   * 智能锚定：优先高亮最紧迫的瓶颈维度。
   * - 企业空间数量已满 ➔ 锚定空间数量
   * - 可用余额剩余率 <= 20% ➔ 锚定算力点（引导充值 / 会员算力包折扣）
   * - 其余情况展示权益全景
   */
  const resolveHighlight = (): UpgradeHighlight => {
    const workspaceFull =
      quota && quota.maxEnterprise !== -1 && quota.enterpriseCount >= quota.maxEnterprise;
    if (workspaceFull) return "workspace";
    if (!tokenUnlimited && tokenRatio <= 20) return "token";
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

      {/* 算力点：可用余额圆环 + 消耗统计（数据全部来自 dashboard 聚合接口） */}
      <div className="bg-slate-50/60 border border-slate-100 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-4">
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
              <span className="text-sm font-extrabold text-slate-800">{tokenUnlimited ? "∞" : `${tokenRatio}%`}</span>
              <span className="text-[10px] text-slate-400 font-bold leading-none mt-0.5">可用</span>
            </div>
          </div>

          {/* 余额与消耗：数字独占一行，不再被徽章/按钮挤压换行 */}
          <div className="min-w-0 flex-1">
            <span className="text-[11px] text-slate-400 font-bold block">算力点可用余额</span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-xl leading-none font-black font-mono text-slate-800 whitespace-nowrap">
                {tokenUnlimited ? "无限" : tokenAvailable.toLocaleString("zh-CN")}
              </span>
              {!tokenUnlimited && (
                <span className="text-[11px] text-slate-400 font-bold whitespace-nowrap">算力点</span>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 mt-2">
              <span className="text-[11px] text-slate-500 font-bold whitespace-nowrap">
                累计消耗{" "}
                <span className="font-mono text-slate-700">
                  {tokenHistoryUsed.toLocaleString("zh-CN")}
                </span>{" "}
                点
              </span>
              <Link
                href="/user/pay?tab=detail"
                className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[#2b6cb0] hover:text-[#3182ce] transition-colors cursor-pointer shrink-0"
              >
                消耗明细
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="mt-1.5 text-[11px] text-slate-500 font-bold whitespace-nowrap">
              累计过期{" "}
              <span className="font-mono text-slate-700">
                {tokenTotalExpired.toLocaleString("zh-CN")}
              </span>{" "}
              点
            </div>
          </div>
        </div>

        {/* 口径说明与充值入口：独立一行，互不挤压 */}
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <span className="text-[11px] text-slate-400 font-semibold leading-normal min-w-0">
            {tokenHint}
          </span>
          {showRecharge && !tokenUnlimited && onRecharge && (
            <button
              onClick={onRecharge}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-[11px] font-black shadow-md shadow-amber-600/20 transition-all cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Zap className="w-3 h-3" /> 充值
            </button>
          )}
          {showRecharge && !tokenUnlimited && !onRecharge && (
            <Link
              href={rechargeHref}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-[11px] font-black shadow-md shadow-amber-600/20 transition-all cursor-pointer shrink-0 whitespace-nowrap"
            >
              <Zap className="w-3 h-3" /> 充值
            </Link>
          )}
        </div>
      </div>

      {/* 存储空间与企业空间配额进度 (系统标准的蓝、橙双色渐变，极具呼吸感) */}
      <div className="space-y-4">
        {/* 存储监控 (蓝色渐变) */}
        <div>
          <div className="flex justify-between items-center text-xs font-bold text-slate-500 mb-1.5">
            <div className="flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5 text-slate-400" />
              <span>文件存储空间</span>
            </div>
            <span className="whitespace-nowrap">
              {storage.total > 0
                ? `${(storage.used / 1073741824).toFixed(1)} / ${(storage.total / 1073741824).toFixed(1)} ${storage.unit}`
                : "—"}
            </span>
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
            <span className="whitespace-nowrap">
              {enterpriseCount} / {enterpriseUnlimited ? "无限" : `${enterpriseMax} 个`}
            </span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#f59e0b] to-[#d97706] transition-all duration-300"
              style={{ width: `${enterpriseRatio}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
